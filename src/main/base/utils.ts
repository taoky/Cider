import * as fs from "fs";
import * as path from "path";
import { Store } from "./store";
import { BrowserWindow as bw } from "./browserwindow";
import { app, BrowserWindow, ipcMain } from "electron";
// import OtaClient from "@crowdin/ota-client";
import fetch from "electron-fetch";
import ElectronStore from "electron-store";

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
    if (this.getStoreValue("advanced.experiments").includes("cider_mirror") === true) {
      if (url.includes("api.github.com/")) {
        return await fetch(url.replace("api.github.com/", "mirror.api.cider.sh/v2/api/"), opts);
      } else if (url.includes("raw.githubusercontent.com/")) {
        return await fetch(url.replace("raw.githubusercontent.com/", "mirror.api.cider.sh/v2/raw/"), opts);
      } else {
        return await fetch(url, opts);
      }
    } else {
      return await fetch(url, opts);
    }
  }

  static async initializeTranslations() {
    this.i18n = {
      "en": {
        "term.about": "About",
        "term.toggleprivate": "Toggle private session",
        "term.settings": "Settings",
        "term.quit": "Quit",
        "menubar.options.view": "View",
        "menubar.options.window": "Window",
        "term.search": "Search",
        "term.listenNow": "Listen Now",
        "term.browse": "Browse",
        "term.audio": "Audio",
        "term.radio": "Radio",
        "home.followedArtists": "Followed Artists",
        "home.title": "Home",
        "term.library": "Library",
        "term.recentlyAdded": "Recently Added",
        "term.songs": "Songs",
        "term.albums": "Albums",
        "term.artists": "Artists",
        "term.videos": "Videos",
        "term.podcasts": "Podcasts",
        "term.appleMusic": "Apple Music",
        "term.playlists": "Playlists",
        "home.recentlyPlayed": "Recently Played",
        "term.history": "History",
        "term.seeAll": "See All",
        "home.artistsFeed": "Artists Feed",
        "home.syncFavorites": "Sync Favorites",
        "home.artistsFeed.noArtist": "No artist",
        "term.replay": "Replay",
        "home.madeForYou": "Made For You",
        "action.createNew": "Create New",
        "menubar.options.zoom": "Zoom",
        "term.zoomin": "Zoom in",
        "term.zoomout": "Zoom out",
        "term.zoomreset": "Zoom reset",
        "term.fullscreen": "Fullscreen",
        "action.close": "Close",
        "menubar.options.reload": "Reload",
        "menubar.options.forcereload": "Force reload",
        "term.playpause": "Play/Pause",
        "term.next": "Next",
        "term.previous": "Previous",
        "menubar.options.volumeup": "Volume up",
        "menubar.options.volumedown": "Volume down",
        "term.cast2": "Cast to",
        "term.webremote": "Web remote",
        "term.audioSettings": "Audio settings",
        "menubar.options.plugins": "Plugins",
        "term.play": "Play",
        "term.mute": "Mute",
        "term.cast": "Cast",
        "term.queue": "Queue",
        "term.navigateBack": "Navigate back",
        "term.navigateForward": "Navigate forward",
        "action.hideLibrary": "Hide library",
        "term.language": "Language",
        "oobe.amupsell.title": "Welcome",
        "oobe.amupsell.text": "Basic settings",
        "oobe.intro.title": "Introduction",
        "oobe.intro.text": "Introduction",
        "oobe.next": "Next",
        "oobe.previous": "Previous",
        "oobe.visual.title": "Visual",
        "oobe.visual.layout.text": "Choose a layout",
        "oobe.audio.title": "Audio",
        "oobe.audio.text": "Audio settings",
        "settings.option.audio.enableAdvancedFunctionality.ciderPPE": "Enable Cider PPE",
        "settings.option.audio.enableAdvancedFunctionality.ciderPPE.description": "idk what Cider PPE is",
        "menubar.options.minimize": "Minimize",
        "menubar.options.controls": "Controls",
        "term.accountSettings": "Account settings",
        "menubar.options.signout": "Sign out",
        "menubar.options.account": "Account",
        "oobe.done": "Done",
        "term.discord": "Discord",
        "term.github": "GitHub",
        "menubar.options.license": "License",
        "menubar.options.toggledevtools": "Toggle dev tools",
        "menubar.options.conf": "Open config",
        "menubar.options.support": "Support",
        "term.logout": "Logout",
        "error.noResults": "No Results",
        "error.noResults.description": "No results anyway",
        "podcast.subscribedOnItunes": "Subscribed on iTunes",
        "term.noVideos": "No videos",
        "notification.updatingLibrarySongs": "Updating Library Songs",
        "notification.updatingLibraryAlbums": "Updating Library Albums",
        "notification.updatingLibraryArtists": "Updating Library Artists",
        "term.sortBy": "Sort by",
        "term.sortBy.album": "Sort by album",
        "term.sortBy.artist": "Sort by artist",
        "term.sortBy.name": "Sort by name",
        "term.sortBy.genre": "Sort by genre",
        "term.sortBy.releaseDate": "Sort by release date",
        "term.sortBy.duration": "Sort by duration",
        "term.sortBy.dateAdded": "Sort by date added",
        "term.sortOrder": "Sort order",
        "term.sortOrder.ascending": "Ascending",
        "term.sortOrder.descending": "Descending",
        "term.viewAs": "View as",
        "term.viewAs.coverArt": "View as Cover art",
        "term.viewAs.list": "View as List",
        "term.scroll": "Scroll",
        "term.scroll.paged": "Scroll Paged",
        "term.scroll.infinite": "Scroll Infinite",
        "term.enableShuffle": "Enable shuffle",
        "term.more": "More",
        "action.addToLibrary": "Add to library",
        "action.addToPlaylist": "Add to playlist",
        "action.startRadio": "Start radio",
        "action.goToArtist": "Go to artist",
        "action.goToAlbum": "Go to album",
        "action.share": "Share",
        "action.share (song.link)": "Share (song.link)",
        "term.equalizer": "Equalizer",
        "settings.option.audio.audioLab": "Audio Lab",
        "term.shuffle": "Shuffle",
        "term.size": "Size",
        "term.size.normal": "Normal size",
        "term.size.compact": "Compact size",
        "action.removeFromLibrary": "Remove from library",
        "term.share": "Share",
        "term.time.released": "Time released",
        "term.track": "track",
        "term.time.minute": "minute",
        "term.time.minutes": "minutes",
        "term.confirm": "Confirm",
        "term.time.added": "Time added",
        "action.showAlbum": "Show album",
        "term.tracks": "Tracks",
        "action.playNext": "Play next",
        "action.playLater": "Play later",
        "term.pause": "Pause",
        "term.version": "Version",
        "about.thanks": "Thanks",
        "term.copyright": "Copyright",
        "term.rightsReserved": "Rights reserved",
        "term.sponsor": "Sponsor",
        "term.socials": "Socials",
        "term.contributors": "Contributors",
        "term.lyrics": "Lyrics",
        "term.fullscreenView": "View in full screen",
        "term.defaultView": "View by default",
        "term.miniplayer": "Miniplayer",
        "action.cast.todevices": "Cast to devices",
        "action.cast.chromecast": "Chromecast",
        "action.cast.airplay": "Airplay",
        "action.cast.scan": "Scan",
        "term.audioControls": "Audio Controls",
        "settings.option.audio.changePlaybackRate": "Change playback rate",
        "term.enableRepeatOne": "Enable repeat one",
        "term.disableRepeatOne": "Disable repeat one",
        "term.disableRepeat": "Disable repeat",
        "term.repeat": "Repeat",
        "action.tray.minimize": "Minimize",
        "action.tray.show": "Show",
        "action.showInAppleMusic": "Show in Apple Music",
        "action.love": "Love",
        "action.dislike": "Dislike",
        "action.removeFavorite": "Remove Favorite",
        "notification.buildingPlaylistCache": "Building Playlist Cache",
        "term.time.hour": "hour",
        "term.time.hours": "hours",
        "action.openArtworkInBrowser": "Open artwork in browser",
        "term.topSongs": "Top Songs",
        "action.showLibrary": "Show library",
        "term.unmute": "Unmute",
        "term.autoplay": "Autoplay",
        "action.cast.scanning": "Scanning",
        "action.cut": "Cut",
        "action.copy": "Copy",
        "action.paste": "Paste",
        "action.delete": "Delete",
        "action.selectAll": "Select All",
        "term.reset": "Reset",
        "settings.option.general.keybindings.interface": "Interface",
        "term.time.updated": "Time updated",
        "action.favorite": "Favorite",
        "term.latestReleases": "Latest Releases",
        "term.discNumber": "Disc ${discNumber}",
        "term.share.success": "Successfully shared",
      }
    };
  }

  /**
   * Fetches the i18n locale for the given language.
   * @param language {string} The language to fetch the locale for.
   * @param key {string} The key to search for.
   * @returns {string | Object} The locale value.
   */
  static getLocale(language: string, key?: string): string | object {
    let i18n: any = {};
    if (!this.i18n[language]) {
      i18n = this.i18n["en"];
    } else {
      i18n = this.i18n[language ?? "en"];
    }

    if (key) {
      return i18n[key] ?? key;
    } else {
      return i18n;
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
