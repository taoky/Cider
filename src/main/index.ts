// Keep MCP startup separate from desktop imports, logging and the single-instance lock.
if (process.argv.includes("--mcp-stdio")) {
  const { app } = require("electron");
  const { join } = require("path");
  app.disableHardwareAcceleration();
  if (!app.isPackaged) app.setPath("userData", join(app.getPath("appData"), "Cider"));
  require("./automation/bridge")
    .runBridge(app.getPath("userData"), process.argv, (code: number) => app.exit(code))
    .catch(() => {
      process.stderr.write("Cider MCP could not start. Register a client and enable MCP in Cider settings.\n");
      app.exit(1);
    });
} else {
  require("./desktop");
}
