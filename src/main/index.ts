require("v8-compile-cache");

import { app, components, ipcMain } from "electron";
import { join } from "path";
import { Store } from "./base/store";
import { AppEvents } from "./base/app";
import { Plugins } from "./base/plugins";
import { BrowserWindow } from "./base/browserwindow";
// import { init as Sentry } from "@sentry/electron";
// import { RewriteFrames } from "@sentry/integrations";
import { crashReporter } from "electron";
import { utils } from "./base/utils";

if (!app.isPackaged) {
  app.setPath("userData", join(app.getPath("appData"), "Cider"));
}

console.log(app.getPath("crashDumps"));
crashReporter.start({ submitURL: '', uploadToServer: false });

// Analytics for debugging fun yeah.
// Sentry({
//   dsn: "https://68c422bfaaf44dea880b86aad5a820d2@o954055.ingest.sentry.io/6112214",
//   integrations: [
//     new RewriteFrames({
//       root: process.cwd(),
//     }),
//   ],
// });

new Store();
const Cider = new AppEvents();
const CiderPlug = new Plugins();

/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * App Event Handlers
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/
app.on("ready", async () => {
  await utils.initializeTranslations();
  Cider.ready(CiderPlug);

  console.log("[Cider] Application is Ready. Creating Window.");
  if (!app.isPackaged) {
    console.info("[Cider] Running in development mode.");
    require("vue-devtools").install();
  }
  console.log("aa");
  components.whenReady().then(async () => {
    const bw = new BrowserWindow();
    console.log("[Cider] Creating Window.");
    const win = await bw.createWindow();

    app.getGPUInfo("complete").then((gpuInfo) => {
      console.log(gpuInfo);
    });

    console.log("[Cider][Widevine] Status:", components.status());
    Cider.bwCreated();
    win.on("ready-to-show", async () => {
      console.debug("[Cider] Window is Ready.");
      await CiderPlug.callPlugins("onReady", win);
      if (!app.commandLine.hasSwitch("hidden")) {
        win.show();
      }
    });
  });
});

/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * Renderer Event Handlers
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/
let rendererInitialized = false;
ipcMain.handle("renderer-ready", async (event) => {
  if (rendererInitialized) return;
  await CiderPlug.callPlugins("onRendererReady", event);
  rendererInitialized = true;
});

ipcMain.on("playbackStateDidChange", async (_event, attributes) => {
  await CiderPlug.callPlugins("onPlaybackStateDidChange", attributes);
});

ipcMain.on("nowPlayingItemDidChange", async (_event, attributes) => {
  await CiderPlug.callPlugins("onNowPlayingItemDidChange", attributes);
});

ipcMain.on("playbackTimeDidChange", async (_event, attributes) => {
  await CiderPlug.callPlugins("playbackTimeDidChange", attributes);
});

app.on("before-quit", async () => {
  await CiderPlug.callPlugins("onBeforeQuit");
  console.warn(`${app.getName()} exited.`);
});

/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * Widevine Event Handlers
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/

// @ts-ignore
app.on("widevine-ready", (version, lastVersion) => {
  if (null !== lastVersion) {
    console.log("[Cider][Widevine] Widevine " + version + ", upgraded from " + lastVersion + ", is ready to be used!");
  } else {
    console.log("[Cider][Widevine] Widevine " + version + " is ready to be used!");
  }
});

// @ts-ignore
app.on("widevine-update-pending", (currentVersion, pendingVersion) => {
  console.log("[Cider][Widevine] Widevine " + currentVersion + " is ready to be upgraded to " + pendingVersion + "!");
});

// @ts-ignore
app.on("widevine-error", (error) => {
  console.log("[Cider][Widevine] Widevine installation encountered an error: " + error);
  app.exit();
});
