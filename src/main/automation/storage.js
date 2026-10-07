// @ts-nocheck
const fs = require("fs");
const path = require("path");
const os = require("os");
const { createHash } = require("crypto");
function locations(userData) {
  const key = createHash("sha256").update(userData).digest("hex").slice(0, 16);
  const root = process.env.FLATPAK_ID && process.env.XDG_RUNTIME_DIR ? path.join(process.env.XDG_RUNTIME_DIR, "app", process.env.FLATPAK_ID) : process.env.XDG_RUNTIME_DIR || os.tmpdir();
  const directory = path.join(root, `cider-mcp-${process.getuid?.() ?? "user"}-${key}`);
  return { directory, endpoint: process.platform === "win32" ? `\\\\.\\pipe\\cider-mcp-${key}` : path.join(directory, "mcp.sock"), data: path.join(userData, "automation") };
}
function privateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || (process.getuid && stat.uid !== process.getuid())) throw new Error("UNSAFE_AUTOMATION_DIRECTORY");
  fs.chmodSync(directory, 0o700);
}
function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}
function writeJSON(file, value) {
  const temporary = file + ".new";
  const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW, 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporary, file);
  if (process.platform !== "win32") {
    const directory = fs.openSync(path.dirname(file), fs.constants.O_RDONLY);
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
  }
}
module.exports = { locations, privateDirectory, readJSON, writeJSON };
