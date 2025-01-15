import * as fs from "fs";
import * as path from "path";
import { Store } from "./store";
import { BrowserWindow as bw } from "./browserwindow";
import { app, BrowserWindow, ipcMain } from "electron";
// import OtaClient from "@crowdin/ota-client";
import fetch from "electron-fetch";
import ElectronStore from "electron-store";
import translations from "./translations";

export class utils {
  // static crowdinClient: OtaClient = new OtaClient("fda9a6528649ea90dee35390wog");
  static i18n: any = {};

  /**
   * Playback Functions
   */
  static playback = {
    pause: () => {
      bw.win.webContents.executeJavaScript("MusicKitInterop.pause()");
    },
    play: () => {
      bw.win.webContents.executeJavaScript("MusicKitInterop.play()");
    },
    playPause: () => {
      bw.win.webContents.executeJavaScript("MusicKitInterop.playPause()");
    },
    next: () => {
      bw.win.webContents.executeJavaScript("MusicKitInterop.next()");
    },
    previous: () => {
      bw.win.webContents.executeJavaScript("MusicKitInterop.previous()");
    },
    seek: (seconds: number) => {
      bw.win.webContents.executeJavaScript(`MusicKit.getInstance().seekToTime(${seconds})`);
    },
  };
  /**
   * Paths for the application to use
   */
  static paths: any = {
    srcPath: path.join(__dirname, "../../src"),
    rendererPath: path.join(__dirname, "../../src/renderer"),
    mainPath: path.join(__dirname, "../../src/main"),
    resourcePath: path.join(__dirname, "../../resources"),
    ciderCache: path.resolve(app.getPath("userData"), "CiderCache"),
    themes: path.resolve(app.getPath("userData"), "Themes"),
    plugins: path.resolve(app.getPath("userData"), "Plugins"),
    externals: path.resolve(app.getPath("userData"), "externals"),
  };

  /**
   * Get the path
   * @returns {string}
   * @param name
   */
  static getPath(name: string): string {
    return this.paths[name];
  }

  /**
   * Get the app
   * @returns {Electron.App}
   */
  static getApp(): Electron.App {
    return app;
  }

  /**
   * Get the IPCMain
   */
  static getIPCMain(): Electron.IpcMain {
    return ipcMain;
  }

  /*
   * Get the Express instance
   * @returns {any}
   */
  static getExpress(): any {
    return bw.express;
  }

  /**
   * MitM the electron fetch for a function that proxies github.
   * Written in TS so Maikiwi doesn't fuck up
   * @param url {string} URL param
   * @param opts {object} Other options
   */
  static async fetch(url: string, opts = {}) {
    Object.assign(opts, {
      headers: {
        "User-Agent": utils.getWindow().webContents.getUserAgent(),
      },
    });
    return await fetch(url, opts);
    // if (this.getStoreValue("advanced.experiments").includes("cider_mirror") === true) {
    //   if (url.includes("api.github.com/")) {
    //     return await fetch(url.replace("api.github.com/", "mirror.api.cider.sh/v2/api/"), opts);
    //   } else if (url.includes("raw.githubusercontent.com/")) {
    //     return await fetch(url.replace("raw.githubusercontent.com/", "mirror.api.cider.sh/v2/raw/"), opts);
    //   } else {
    //     return await fetch(url, opts);
    //   }
    // } else {
    //   return await fetch(url, opts);
    // }
  }

  static async initializeTranslations() {
    this.i18n = translations;
  }

  /**
   * Fetches the i18n locale for the given language.
   * @param language {string} The language to fetch the locale for.
   * @param key {string} The key to search for.
   * @returns {string | Object} The locale value.
   */
  static getLocale(language: string, key?: string): string | object {
    let i18n: any = {};
    if (language == "en") {
      language = "en-US";
    }
    try {
      if (!this.i18n[language]) {
        i18n = this.i18n["en-US"][0].content;
      } else {
        i18n = this.i18n[language ?? "en-US"][0].content;
      }

      if (key) {
        return i18n[key] ?? key;
      } else {
        return i18n;
      }
    } catch (error) {
      return key ?? {};
    }
  }

  /**
   * Gets a store value
   * @param key
   * @returns store value
   */
  static getStoreValue(key: string): any {
    return Store.cfg.get(key);
  }

  /**
   * Sets a store
   * @returns store
   */
  static getStore(): Object {
    return Store.cfg.store;
  }

  /**
   * Get the store instance
   * @returns {Store}
   */
  static getStoreInstance(): ElectronStore {
    return Store.cfg;
  }

  /**
   * Sets a store value
   * @param key
   * @param value
   */
  static setStoreValue(key: string, value: any): void {
    Store.cfg.set(key, value);
  }

  /**
   * Pushes Store to Connect
   * @return Function
   */
  static pushStoreToConnect(): Function {
    return Store.pushToCloud;
  }

  /**
   * Gets the browser window
   */
  static getWindow(): Electron.BrowserWindow {
    if (bw.win) {
      return bw.win;
    } else {
      return BrowserWindow.getAllWindows()[0];
    }
  }

  static loadPluginFrontend(path: string): void {}

  static loadJSFrontend(path: string): void {
    bw.win.webContents.executeJavaScript(fs.readFileSync(path, "utf8"));
  }
}
