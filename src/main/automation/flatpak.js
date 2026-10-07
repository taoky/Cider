// @ts-nocheck
// Electron's Node mode avoids Zypak/Chromium display initialization for stdio.
// The desktop profile is Cider, matching desktop.ts and the packaged product name.
const { join } = require("path");
const { homedir } = require("os");
const { runBridge } = require("./bridge");
const userData = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "Cider");
runBridge(userData, process.argv).catch(() => {
  process.stderr.write("Cider MCP could not start. Register a client and enable MCP in Cider settings.\n");
  process.exit(1);
});
