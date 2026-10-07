// @ts-nocheck
const Ajv = require("ajv");
const VERSION = 1;
const MAX_MESSAGE = 1024 * 1024;
const id = { type: "string", pattern: "^[a-zA-Z0-9._-]+$", maxLength: 200 };
const text = { type: "string", minLength: 1, maxLength: 500 };
const offset = { type: "integer", minimum: 0, maximum: 1000000, default: 0 };
const ids = { type: "array", items: id, minItems: 1, maxItems: 1000, uniqueItems: true };
const operation = { type: "string", pattern: "^[a-zA-Z0-9_-]{1,100}$" };
const definitions = [
  ["get_status", "Get readiness, storefront and the permissions of this connection. No account identifiers or credentials.", {}, []],
  ["search_catalog", "Search this account's Apple Music storefront for songs, albums or artists.", { query: text, type: { enum: ["songs", "albums", "artists"], default: "songs" }, offset }, ["query"]],
  ["get_catalog_tracks", "Read catalog songs by ID, or a page of album tracks. IDs and durations are verified by Apple Music.", { ids, albumId: id, offset }, []],
  ["validate_tracks", "Validate ordered catalog song IDs and calculate duration. Unavailable songs and missing durations are reported, never replaced.", { ids }, ["ids"]],
  ["list_playlists", "List accessible library playlists. By default only names ending exactly in [MCP] or [AI] are accessible. Use nextOffset for pagination.", { offset }, []],
  ["get_playlist", "Read an accessible library playlist and a page of tracks. Use nextOffset for pagination.", { id, offset }, ["id"]],
  ["create_playlist", "Create a private Apple Music playlist. Names without [MCP] or [AI] receive ' [MCP]'. Description is multiline plain text. Reuse operationId to safely query/retry the same request; never retry an uncertain write with a new ID.", { name: text, description: { type: "string", maxLength: 16000 }, ids, operationId: operation }, ["name", "ids", "operationId"]],
  ["append_playlist_tracks", "Append catalog songs to an editable playlist currently ending in [MCP] or [AI]. Reuse operationId on retry. Do not retry uncertain writes with a new ID.", { id, ids, operationId: operation }, ["id", "ids", "operationId"]],
  ["get_operation", "Read the result of this client's write operation, including partial or uncertain completion.", { operationId: operation }, ["operationId"]],
];
const tools = definitions.map(([name, description, properties, required]) => ({
  name,
  description,
  inputSchema: { type: "object", properties, required, additionalProperties: false },
  annotations: { readOnlyHint: !["create_playlist", "append_playlist_tracks"].includes(name), destructiveHint: false, openWorldHint: true },
}));
const ajv = new Ajv({ useDefaults: true, allErrors: false });
const validators = new Map(tools.map((t) => [t.name, ajv.compile(t.inputSchema)]));
function validate(name, input) {
  const check = validators.get(name);
  if (!check || !check(input)) throw new Error("INVALID_ARGUMENTS");
  if (name === "get_catalog_tracks" && !!input.ids === !!input.albumId) throw new Error("Specify exactly one of ids or albumId");
  return input;
}
function isAIPlaylist(name) {
  return typeof name === "string" && (name.endsWith("[MCP]") || name.endsWith("[AI]"));
}
function playlistName(name) {
  return isAIPlaylist(name) ? name : name + " [MCP]";
}
function readLines(stream, onMessage, onError) {
  let buffer = Buffer.alloc(0);
  stream.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
    let newline;
    while ((newline = buffer.indexOf(10)) !== -1) {
      if (newline > MAX_MESSAGE) return onError();
      const line = buffer.subarray(0, newline);
      buffer = buffer.subarray(newline + 1);
      try {
        onMessage(JSON.parse(line.toString("utf8")));
      } catch {
        return onError();
      }
    }
    if (buffer.length > MAX_MESSAGE) onError();
  });
}
module.exports = { VERSION, MAX_MESSAGE, tools, validate, isAIPlaylist, playlistName, readLines };
