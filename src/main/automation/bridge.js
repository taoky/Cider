// @ts-nocheck
const net = require("net");
const path = require("path");
const { randomUUID } = require("crypto");
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { ListToolsRequestSchema, CallToolRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const { VERSION, MAX_MESSAGE, tools, readLines } = require("./protocol");
const { locations, readJSON } = require("./storage");

async function runBridge(userData, argv, exit = (code) => process.exit(code)) {
  const clientId = argv[argv.indexOf("--client") + 1];
  const paths = locations(userData);
  const registry = readJSON(path.join(paths.data, "clients.json"), { clients: {} });
  const client = registry.clients[clientId];
  if (!argv.includes("--client") || !client) throw new Error("Register a client in Cider settings first.");
  // MCP hosts often strip XDG_RUNTIME_DIR from child environments. The Cider-owned
  // registration file identifies the listener instead of guessing the host path.
  const socket = net.createConnection(registry.endpoint || paths.endpoint);
  const pending = new Map();
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  ready.catch(() => {});
  const timeout = setTimeout(() => {
    rejectReady(new Error("Cider connection approval timed out"));
    socket.destroy();
  }, 65000);
  socket.on("connect", () => socket.write(JSON.stringify({ version: VERSION, clientId, secret: client.secret }) + "\n"));
  const fail = () => {
    clearTimeout(timeout);
    rejectReady(new Error("Cider is closed, MCP is disabled, or the connection was denied."));
    for (const item of pending.values()) item.reject(new Error("Cider disconnected; inspect operation status before retrying writes."));
    pending.clear();
  };
  socket.on("error", fail);
  socket.on("close", () => {
    fail();
    process.stderr.write("Cider MCP disconnected.\n");
    exit(1);
  });
  readLines(
    socket,
    (message) => {
      if (message.ready && message.version === VERSION) {
        clearTimeout(timeout);
        resolveReady();
        return;
      }
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error));
      else item.resolve(message.result);
    },
    () => socket.destroy()
  );
  const server = new Server({ name: "cider-playlists", version: "1.0.0" }, { capabilities: { tools: {} }, instructions: "Use real Apple Music IDs. Confirm the intended listening duration with the user; do not invent unavailable songs or repeat tracks to fill time. Playlist names ending exactly in [MCP] or [AI] grant read/append access. Descriptions are plain text. Never repeat an uncertain write under a new operationId." });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    try {
      await ready;
      if (extra.signal.aborted) throw new Error("Cancelled");
      if (pending.size >= 8) throw new Error("BUSY");
      const id = randomUUID();
      const line = JSON.stringify({ id, name: request.params.name, args: request.params.arguments || {} });
      if (Buffer.byteLength(line) > MAX_MESSAGE) throw new Error("REQUEST_TOO_LARGE");
      // Cancelling a write revokes the connection and prevents subsequent batches.
      const cancel = () => socket.destroy();
      extra.signal.addEventListener("abort", cancel, { once: true });
      try {
        const result = await new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject });
          socket.write(line + "\n");
        });
        return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
      } finally {
        extra.signal.removeEventListener("abort", cancel);
      }
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: error.message }] };
    }
  });
  process.stdin.on("end", () => {
    socket.destroy();
    exit(0);
  });
  await server.connect(new StdioServerTransport());
  return { server, socket };
}
module.exports = { runBridge };
