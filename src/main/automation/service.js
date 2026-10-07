// @ts-nocheck
const { app, ipcMain, dialog } = require("electron");
const net = require("net");
const fs = require("fs");
const path = require("path");
const { randomBytes, randomUUID, timingSafeEqual } = require("crypto");
const { VERSION, MAX_MESSAGE, readLines } = require("./protocol");
const { locations, privateDirectory, readJSON, writeJSON } = require("./storage");
const { PlaylistService } = require("./playlists");

class AutomationService {
  constructor(win, store, translate = (key) => key) {
    this.win = win;
    this.store = store;
    this.translate = translate;
    this.sessions = new Set();
    this.pending = new Map();
    this.server = null;
    this.paths = locations(app.getPath("userData"));
    privateDirectory(this.paths.data);
    this.registryFile = path.join(this.paths.data, "clients.json");
    this.registry = readJSON(this.registryFile, { salt: randomBytes(32).toString("hex"), clients: {} });
    if (!this.registry || !/^[0-9a-f]{64}$/.test(this.registry.salt) || !this.registry.clients || typeof this.registry.clients !== "object" || Array.isArray(this.registry.clients)) throw new Error("INVALID_CLIENT_REGISTRY");
    for (const client of Object.values(this.registry.clients)) {
      if (!client || typeof client.name !== "string" || !/^[0-9a-f]{64}$/.test(client.secret)) throw new Error("INVALID_CLIENT_REGISTRY");
    }
    this.registry.endpoint = this.paths.endpoint;
    writeJSON(this.registryFile, this.registry);
    this.operationFile = path.join(this.paths.data, "operations.json");
    this.playlists = new PlaylistService({ call: this.call.bind(this), settings: this.settings.bind(this), records: readJSON(this.operationFile, {}), save: (records) => writeJSON(this.operationFile, records) });
    this.approvalPending = false;
    ipcMain.on("automation-response", (event, response) => {
      if (!this.trusted(event) || !response || typeof response.id !== "string") return;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      clearTimeout(pending.timer);
      if (response.error || JSON.stringify(response).length > MAX_MESSAGE) pending.reject(new Error("MUSICKIT_REQUEST_FAILED"));
      else pending.resolve(response.result);
    });
    ipcMain.on("automation-account-changed", (event) => {
      if (this.trusted(event)) this.revoke();
    });
    ipcMain.handle("automation-settings", async (event, action, value) => {
      if (!this.trusted(event)) throw new Error("UNAUTHORIZED_WINDOW");
      if (action === "register") {
        if (typeof value !== "string" || value.length < 1 || value.length > 80 || /[\x00-\x1f]/.test(value)) throw new Error("INVALID_CLIENT_NAME");
        if (Object.keys(this.registry.clients).length >= 50) throw new Error("CLIENT_LIMIT");
        const id = randomUUID();
        this.registry.clients[id] = { name: value, secret: randomBytes(32).toString("hex") };
        writeJSON(this.registryFile, this.registry);
        return { id, configuration: this.configuration(id) };
      }
      if (action === "remove") {
        delete this.registry.clients[value];
        writeJSON(this.registryFile, this.registry);
        for (const session of this.sessions) if (session.clientId === value) this.close(session);
      }
      if (action === "disconnect") for (const session of this.sessions) if (session.id === value) this.close(session);
      if (action === "remote-pair") return this.remote?.pair();
      if (action === "remote-disconnect") this.remote?.disconnect();
      return { clients: Object.entries(this.registry.clients).map(([id, client]) => ({ id, name: client.name, configuration: this.configuration(id) })), sessions: [...this.sessions].filter((s) => s.active).map((s) => ({ id: s.id, name: this.registry.clients[s.clientId]?.name })), error: this.error || "", remoteConnections: this.remote?.connections?.size || 0 };
    });
    let previous = JSON.stringify(this.settings());
    store.onDidAnyChange(() => {
      const current = JSON.stringify(this.settings());
      if (current !== previous) {
        previous = current;
        this.revoke();
        this.sync();
      }
    });
    win.webContents.on("did-start-loading", () => this.revoke());
    win.webContents.on("render-process-gone", () => this.revoke());
    app.on("before-quit", () => {
      this.stop();
      this.remote?.stop();
    });
    this.sync();
  }
  trusted(event) {
    return event.sender === this.win.webContents && event.senderFrame === this.win.webContents.mainFrame;
  }
  settings() {
    return { enabled: this.store.get("connectivity.mcp.enabled") === true, readOther: this.store.get("connectivity.mcp.readOtherPlaylists") === true };
  }
  configuration(id) {
    if (process.env.FLATPAK_ID) {
      // Forward the agent's current runtime directory instead of storing a
      // user-specific path. env_vars is Codex's environment allowlist syntax.
      return { command: "flatpak", args: ["run", "--command=cider-mcp", process.env.FLATPAK_ID, "--client", id], env_vars: ["XDG_RUNTIME_DIR"] };
    }
    const args = app.isPackaged ? [] : [app.getAppPath()];
    // Ozone chooses its platform before application JS can change the switch.
    if (process.platform === "linux") args.push("--ozone-platform=headless");
    return { command: process.env.APPIMAGE || process.execPath, args: [...args, "--mcp-stdio", "--client", id] };
  }
  call(operation, args) {
    if (this.win.isDestroyed() || this.win.webContents.isLoading()) return Promise.reject(new Error("CIDER_NOT_READY"));
    if (this.pending.size >= 32) return Promise.reject(new Error("BUSY"));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("MUSICKIT_TIMEOUT"));
      }, 45000);
      this.pending.set(id, { resolve, reject, timer });
      this.win.webContents.send("automation-request", { id, operation, args, salt: this.registry.salt });
    });
  }
  async approve(message, detail) {
    if (this.approvalPending) return false;
    this.approvalPending = true;
    const controller = new AbortController();
    this.approvalController = controller;
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const result = await dialog.showMessageBox(this.win, { type: "question", title: "Cider", message, detail, buttons: [this.translate("automation.dialog.deny"), this.translate("automation.dialog.allow")], defaultId: 0, cancelId: 0, noLink: true, signal: controller.signal });
      return !controller.signal.aborted && result.response === 1;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
      this.approvalPending = false;
      this.approvalController = null;
    }
  }
  close(session) {
    session.active = false;
    session.socket.destroy();
    this.sessions.delete(session);
  }
  revoke() {
    this.approvalController?.abort();
    for (const session of this.sessions) this.close(session);
    this.remote?.disconnect();
  }
  stop() {
    this.revoke();
    const server = this.server;
    this.server = null;
    if (server) server.close();
  }
  sync() {
    if (!this.settings().enabled) return this.stop();
    if (this.server) return;
    try {
      if (process.platform !== "win32") {
        privateDirectory(this.paths.directory);
        if (fs.existsSync(this.paths.endpoint)) {
          const stat = fs.lstatSync(this.paths.endpoint);
          if (!stat.isSocket() || stat.uid !== process.getuid()) throw new Error("UNSAFE_SOCKET");
          fs.unlinkSync(this.paths.endpoint);
        }
      }
      const server = net.createServer((socket) => this.connect(socket));
      this.server = server;
      server.on("error", () => {
        this.error = "Unable to start MCP IPC listener";
        if (this.server === server) this.stop();
      });
      server.listen(this.paths.endpoint, () => {
        if (process.platform !== "win32") fs.chmodSync(this.paths.endpoint, 0o600);
        this.error = "";
      });
    } catch {
      this.error = "Unable to start MCP IPC listener";
    }
  }
  connect(socket) {
    if (!this.settings().enabled || this.sessions.size >= 8) return socket.destroy();
    const session = { id: randomUUID(), socket, active: false, hello: false, queued: 0, count: 0, window: Date.now() };
    this.sessions.add(session);
    let chain = Promise.resolve();
    const timer = setTimeout(() => this.close(session), 65000);
    const send = (value) => {
      if (socket.destroyed) return;
      const line = JSON.stringify(value);
      if (Buffer.byteLength(line) > MAX_MESSAGE || socket.writableLength > MAX_MESSAGE) return this.close(session);
      socket.write(line + "\n");
    };
    socket.on("error", () => this.close(session));
    socket.on("close", () => {
      clearTimeout(timer);
      session.active = false;
      this.sessions.delete(session);
    });
    readLines(
      socket,
      (message) => {
        if (session.queued >= 8) return this.close(session);
        session.queued++;
        chain = chain
          .then(async () => {
            if (socket.destroyed) return;
            if (!session.hello) {
              session.hello = true;
              const client = this.registry.clients[message.clientId];
              const secret = typeof message.secret === "string" ? Buffer.from(message.secret) : Buffer.alloc(0);
              if (message.version !== VERSION || !client || secret.length !== 64 || !timingSafeEqual(secret, Buffer.from(client.secret))) return this.close(session);
              session.clientId = message.clientId;
              const state = await this.call("status", {});
              if (!state.authorized || !state.account) throw new Error("NOT_AUTHORIZED_IN_CIDER");
              session.account = state.account;
              session.readOther = this.settings().readOther;
              const allowed = await this.approve(
                this.translate("automation.dialog.mcp.message").replace("{name}", () => client.name),
                [this.translate("automation.dialog.mcp.description"), this.translate(session.readOther ? "automation.dialog.mcp.readOther" : "automation.dialog.mcp.hideOther"), this.translate("automation.dialog.identity")].join("\n\n")
              );
              if (!allowed || socket.destroyed || !this.settings().enabled || !this.registry.clients[session.clientId]) return this.close(session);
              session.active = true;
              await this.playlists.guard(session);
              clearTimeout(timer);
              send({ ready: true, version: VERSION });
              return;
            }
            if (!session.active) return this.close(session);
            if (Date.now() - session.window > 60000) {
              session.count = 0;
              session.window = Date.now();
            }
            if (++session.count > 120) throw new Error("RATE_LIMITED");
            if (typeof message.id !== "string" || message.id.length > 100) return this.close(session);
            try {
              const result = await this.playlists.execute(session, message.name, message.args);
              await this.playlists.guard(session);
              send({ id: message.id, result });
            } catch (error) {
              // Only service-generated errors reach clients, never Apple response bodies.
              send({ id: message.id, error: String(error.message).slice(0, 200) });
            }
          })
          .catch(() => {
            send({ error: "Connection denied or Cider is not ready" });
            this.close(session);
          })
          .finally(() => session.queued--);
      },
      () => this.close(session)
    );
  }
}
module.exports = { AutomationService };
