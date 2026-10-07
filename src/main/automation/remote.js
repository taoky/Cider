// @ts-nocheck
const { WebSocketServer } = require("ws");
const { randomBytes, timingSafeEqual } = require("crypto");
const { app, ipcMain } = require("electron");
const Ajv = require("ajv");
const { MAX_MESSAGE } = require("./protocol");
const id = { type: "string", pattern: "^[a-zA-Z0-9._-]+$", maxLength: 200 };
const term = { type: "string", minLength: 1, maxLength: 500 };
const kind = { enum: ["song", "songs", "album", "albums", "playlist", "playlists", "music-video", "music-videos", "artist", "artists"] };
const schemas = new Map();
const ajv = new Ajv();
function command(actions, properties = {}, required = Object.keys(properties)) {
  for (const action of actions.split(" ")) schemas.set(action, ajv.compile({ type: "object", additionalProperties: false, properties: { action: { const: action }, requestId: { type: "string", maxLength: 100 }, ...properties }, required: ["action", ...required] }));
}
command("get-status get-currentmediaitem get-queue get-lyrics volumeMax play pause playpause stop next previous mute unmute shuffle repeat show-window hide-window quit");
command("search library-search", { term, limit: { type: "integer", minimum: 1, maximum: 100 } }, ["term"]);
command("quick-play", { term });
command("browse-album browse-playlist browse-artist", { id, library: { type: "boolean" } }, ["id"]);
command("browse-artist-search", { id: term });
command("play-next play-later", { id, type: kind });
command("play-mediaitem", { id, kind });
command("library-status", { id, type: kind });
command("rating", { id, type: kind, rating: { enum: [-1, 0, 1] } });
command("change-library", { id, type: kind, add: { type: "boolean" } });
command("seek", { time: { type: "number", minimum: 0, maximum: 86400 } });
command("volume", { volume: { type: "number", minimum: 0, maximum: 10 } });
command("set-shuffle", { shuffle: { type: "boolean" } });
command("set-repeat", { repeat: { enum: [0, 1, 2] } });
command("set-autoplay", { autoplay: { type: "boolean" } });
command("queue-move", { from: { type: "integer", minimum: 0, maximum: 100000 }, to: { type: "integer", minimum: 0, maximum: 100000 } });
function validateRemote(message) {
  const check = message && schemas.get(message.action);
  if (!check || !check(message)) throw new Error("INVALID_REMOTE_COMMAND");
  return message;
}

class RemoteServer {
  constructor(win, automation) {
    this.win = win;
    this.automation = automation;
    this.connections = new Set();
    this.sockets = new Set();
    this.server = null;
    this.pairing = null;
    automation.remote = this;
  }
  enabled() {
    return this.automation.store.get("connectivity.remote.enabled") === true;
  }
  InitWebSockets() {
    ipcMain.on("wsapi-updatePlaybackState", (event, data) => {
      if (this.automation.trusted(event)) this.broadcast({ type: "playbackStateUpdate", status: 0, data });
    });
    this.automation.store.onDidAnyChange(() => this.sync());
    this.sync();
  }
  pair() {
    if (!this.enabled() || !this.server?.address()) throw new Error("REMOTE_DISABLED_OR_UNAVAILABLE");
    const code = randomBytes(16).toString("hex");
    this.pairing = { code, expires: Date.now() + 120000 };
    return { code, url: "http://127.0.0.1:6942", expires: this.pairing.expires };
  }
  disconnect() {
    this.pairing = null;
    for (const socket of this.sockets) socket.terminate();
    this.connections.clear();
    this.sockets.clear();
  }
  stop() {
    this.disconnect();
    this.server?.close();
    this.server = null;
  }
  sync() {
    if (!this.enabled()) return this.stop();
    if (this.server) return;
    const server = new WebSocketServer({
      host: "127.0.0.1",
      port: 26369,
      maxPayload: MAX_MESSAGE,
      perMessageDeflate: false,
      verifyClient: ({ req }) => {
        if (this.sockets.size >= 8) return false;
        if (!["127.0.0.1:26369", "localhost:26369"].includes(req.headers.host)) return false;
        // Native clients omit Origin; browser clients must be our local Web Remote.
        return !req.headers.origin || ["http://127.0.0.1:6942", "http://localhost:6942"].includes(req.headers.origin);
      },
    });
    this.server = server;
    server.on("error", () => {
      this.automation.error = "Unable to start Web Remote (ports 26369 / 6942)";
      if (this.server === server) this.stop();
    });
    server.on("connection", (socket) => {
      this.sockets.add(socket);
      let active = false,
        pairing = false,
        pending = 0,
        window = Date.now(),
        count = 0;
      let chain = Promise.resolve();
      const timer = setTimeout(() => {
        if (!active) socket.terminate();
      }, 65000);
      const send = (value) => {
        if (socket.readyState !== 1) return;
        const data = JSON.stringify(value);
        if (Buffer.byteLength(data) > MAX_MESSAGE || socket.bufferedAmount > MAX_MESSAGE) return socket.terminate();
        socket.send(data);
      };
      socket.on("close", () => {
        clearTimeout(timer);
        active = false;
        this.connections.delete(socket);
        this.sockets.delete(socket);
      });
      socket.on("error", () => socket.terminate());
      socket.on("message", (raw) => {
        if (++pending > 8) return socket.terminate();
        chain = chain
          .then(async () => {
            if (socket.readyState !== 1 || !this.enabled()) return;
            const message = JSON.parse(raw.toString());
            if (!active) {
              if (pairing || message.action !== "pair" || typeof message.code !== "string" || !this.pairing) return socket.terminate();
              const expected = this.pairing;
              if (expected.expires < Date.now() || message.code.length !== expected.code.length || !timingSafeEqual(Buffer.from(message.code), Buffer.from(expected.code))) return socket.terminate();
              this.pairing = null;
              pairing = true;
              const allowed = await this.automation.approve(this.automation.translate("automation.dialog.remote.message"), this.automation.translate("automation.dialog.remote.description"));
              if (!allowed || !this.enabled() || socket.readyState !== 1) return socket.terminate();
              active = true;
              clearTimeout(timer);
              this.connections.add(socket);
              send({ type: "paired", status: 0, data: {} });
              return;
            }
            if (Date.now() - window > 60000) {
              window = Date.now();
              count = 0;
            }
            if (++count > 600) return socket.terminate();
            const args = validateRemote(message);
            let result = { type: "generic", status: 0, data: {} };
            if (args.action === "show-window") this.win.show();
            else if (args.action === "hide-window") this.win.hide();
            else if (args.action === "quit") app.quit();
            else result = await this.automation.call("remote", args);
            if (active && this.enabled()) send({ ...result, requestId: message.requestId });
          })
          .catch(() => send({ type: "error", status: 1, message: "Remote request rejected or failed" }))
          .finally(() => pending--);
      });
    });
  }
  broadcast(message) {
    const data = JSON.stringify(message);
    if (Buffer.byteLength(data) > MAX_MESSAGE) return;
    for (const socket of this.connections) {
      if (socket.readyState === 1 && socket.bufferedAmount < MAX_MESSAGE) socket.send(data);
      else socket.terminate();
    }
  }
}
module.exports = { RemoteServer, validateRemote };
