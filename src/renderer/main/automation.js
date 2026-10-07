// Only the main process can send these requests. Remote callers never supply JS.
export function installAutomation(app, wsapi) {
  let previousToken;
  let playlistRefresh;
  const changedPlaylists = new Set();
  setInterval(() => {
    const token = app.mk?.isAuthorized ? app.mk.musicUserToken : "";
    if (previousToken !== undefined && token !== previousToken) {
      clearTimeout(playlistRefresh);
      changedPlaylists.clear();
      ipcRenderer.send("automation-account-changed");
    }
    previousToken = token;
  }, 1000);
  async function playlistWritten(args, result, mk, token) {
    const sameAccount = () => app.mk === mk && mk.isAuthorized && mk.musicUserToken === token;
    if (!sameAccount()) return;
    const created = args.route === "/v1/me/library/playlists" ? result.data?.[0] : null;
    const id = created?.id || args.route.match(/^\/v1\/me\/library\/playlists\/([^/]+)\/tracks$/)?.[1];
    if (id) changedPlaylists.add(id);
    clearTimeout(playlistRefresh);
    // Match manual creation's delay for Apple's library propagation; coalesce
    // successive batches so a long playlist does not trigger repeated scans.
    playlistRefresh = setTimeout(async () => {
      if (!sameAccount()) return;
      const changed = new Set(changedPlaylists);
      changedPlaylists.clear();
      try {
        await app.refreshPlaylists(false, false);
        if (sameAccount() && app.page?.startsWith("playlist_") && changed.has(app.page.substring(9))) {
          await app.getPlaylistFromID(app.page.substring(9), true);
        }
      } catch {
        console.warn("[Cider] Could not refresh playlists after an MCP write.");
      }
    }, 8000);
    if (created?.id && !app.playlists.listing.some((playlist) => playlist.id === created.id)) {
      app.playlists.listing.push({ ...created, parent: "p.playlistsroot", children: [], tracks: [] });
      app.sortPlaylists();
    }
  }
  async function status(salt) {
    const mk = app.mk;
    const token = mk?.isAuthorized && mk.musicUserToken;
    const storefront = mk?.storefrontId;
    // Renderer modules have no Node require, including in sandboxed builds.
    const digest = token ? await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + token)) : null;
    if (app.mk !== mk || token !== (mk?.isAuthorized && mk.musicUserToken) || storefront !== mk?.storefrontId) throw new Error("Account changed");
    return {
      authorized: !!token,
      storefront: /^[a-z]{2}$/.test(storefront) ? storefront : null,
      account: digest ? Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("") : null,
    };
  }
  ipcRenderer.on("automation-request", async (_event, message) => {
    const { id, operation, args, salt } = message;
    try {
      let result;
      if (operation === "status") result = await status(salt);
      else if (operation === "music") {
        const mk = app.mk;
        const token = mk?.musicUserToken;
        const state = await status(salt);
        if (app.mk !== mk || !mk?.isAuthorized || mk.musicUserToken !== token || mk.storefrontId !== state.storefront) throw new Error("Account changed");
        if (!state.authorized || !state.storefront || state.account !== args.account) throw new Error("Account changed");
        const catalog = /^\/v1\/catalog\/[a-z]{2}\/(search|songs|albums\/[a-zA-Z0-9._-]+\/tracks)$/;
        const library = /^\/v1\/me\/library\/playlists(?:\/[a-zA-Z0-9._-]+(?:\/tracks)?)?$/;
        if (!catalog.test(args.route) && !library.test(args.route)) throw new Error("Invalid route");
        if (args.body && args.route !== "/v1/me/library/playlists" && !/^\/v1\/me\/library\/playlists\/[a-zA-Z0-9._-]+\/tracks$/.test(args.route)) throw new Error("Invalid write");
        const options = { fetchOptions: { method: args.body ? "POST" : "GET", cache: "no-store" } };
        if (args.body) options.fetchOptions.body = JSON.stringify(args.body);
        const response = await app.mk.api.v3.music(args.route, args.parameters || {}, options);
        result = response.data || { data: [] };
        if (result.errors?.length) throw new Error("Apple rejected request");
        // UI maintenance must never turn a confirmed Apple write into a failed
        // MCP response: the caller could otherwise retry and duplicate it.
        if (args.body) playlistWritten(args, result, mk, token).catch(() => console.warn("[Cider] Could not update the playlist UI after an MCP write."));
      } else if (operation === "remote") result = await remote(app, wsapi, args);
      else throw new Error("Unknown operation");
      ipcRenderer.send("automation-response", { id, result: JSON.parse(JSON.stringify(result ?? null)) });
    } catch {
      // Never forward SDK exceptions (which may include tokens or response bodies).
      ipcRenderer.send("automation-response", { id, error: "MUSICKIT_REQUEST_FAILED" });
    }
  });
}

async function remote(app, wsapi, a) {
  const mk = app.mk;
  const response = (type, data) => ({ type, data, status: 0, message: "OK" });
  const kind = a.type && (a.type.endsWith("s") ? a.type : a.type + "s");
  switch (a.action) {
    case "get-status":
      return response("generic", { isAuthorized: mk.isAuthorized });
    case "get-currentmediaitem":
      return response("playbackStateUpdate", MusicKitInterop.getAttributes());
    case "get-queue":
      return response("queue", mk.queue);
    case "get-lyrics":
      return response("lyrics", app.lyrics);
    case "volumeMax":
      return response("maxVolume", app.cfg.audio.maxVolume);
    case "search":
      return response("searchResults", await mk.api.search(a.term, { limit: a.limit || 25, types: "songs,artists,albums,playlists" }));
    case "library-search":
      return response("searchResultsLibrary", await mk.api.library.search(a.term, { limit: a.limit || 25, types: "library-songs,library-artists,library-albums,library-playlists" }));
    case "browse-artist-search":
      return response("musickitapi.search", await mk.api.search(a.id, { types: "artists", limit: 25 }));
    case "browse-album":
      return response("musickitapi.album", await (a.library ? mk.api.library.album(a.id) : mk.api.album(a.id)));
    case "browse-playlist":
      return response("musickitapi.playlist", await (a.library ? mk.api.library.playlist(a.id) : mk.api.playlist(a.id)));
    case "browse-artist":
      return response("musickitapi.artist", await (a.library ? mk.api.library.artist(a.id, { include: "songs,playlists,albums" }) : mk.api.artist(a.id, { include: "songs,playlists,albums" })));
    case "play":
      await mk.play();
      break;
    case "pause":
      await mk.pause();
      break;
    case "stop":
      await mk.stop();
      break;
    case "playpause":
      await MusicKitInterop.playPause();
      break;
    case "next":
      await MusicKitInterop.next();
      break;
    case "previous":
      await MusicKitInterop.previous();
      break;
    case "seek":
      await mk.seekToTime(a.time);
      break;
    case "volume":
      mk.volume = Math.min(a.volume, app.cfg.audio.maxVolume);
      break;
    case "mute":
      mk.mute();
      break;
    case "unmute":
      mk.unmute();
      break;
    case "shuffle":
      wsapi.toggleShuffle();
      break;
    case "repeat":
      wsapi.toggleRepeat();
      break;
    case "set-shuffle":
      mk.shuffleMode = a.shuffle ? 1 : 0;
      break;
    case "set-repeat":
      mk.repeatMode = a.repeat;
      break;
    case "set-autoplay":
      mk.autoplayEnabled = a.autoplay;
      break;
    case "queue-move":
      if (a.from >= mk.queue._queueItems.length || a.to >= mk.queue._queueItems.length) throw new Error("Index out of bounds");
      wsapi.moveQueueItem(a.from, a.to);
      break;
    case "play-next":
      await mk.playNext({ [a.type]: a.id });
      break;
    case "play-later":
      await mk.playLater({ [a.type]: a.id });
      break;
    case "play-mediaitem":
      await mk.setQueue({ [a.kind]: a.id, parameters: { l: app.mklang } });
      await mk.play();
      break;
    case "quick-play": {
      const result = await mk.api.search(a.term, { limit: 1, types: "songs" });
      const id = result.songs?.[0]?.id;
      if (!id) throw new Error("No matching song");
      await mk.setQueue({ song: id });
      await mk.play();
      break;
    }
    case "library-status": {
      const res = await mk.api.v3.music(`/v1/catalog/${mk.storefrontId}/${kind}/${a.id}`, { relate: "library", fields: "inLibrary" });
      return response("libraryStatus", { inLibrary: !!res.data.data?.[0]?.attributes?.inLibrary, rating: await app.getRating({ type: kind, id: a.id }) });
    }
    case "rating": {
      const rating = a.rating;
      await mk.api.v3.music(`/v1/me/ratings/${kind}/${a.id}`, {}, { fetchOptions: { method: rating === 0 ? "DELETE" : "PUT", ...(rating === 0 ? {} : { body: JSON.stringify({ type: "rating", attributes: { value: rating } }) }) } });
      return response("rate", { kind: a.type, id: a.id, rating });
    }
    case "change-library": {
      if (a.add) await app.addToLibrary(a.id);
      else {
        const res = await mk.api.v3.music(`/v1/catalog/${mk.storefrontId}/${kind}/${a.id}`, { relate: "library" });
        const item = res.data.data?.[0]?.relationships?.library?.data?.[0];
        if (item) await app.removeFromLibrary(a.type, item.id);
      }
      return response("change-library", { kind: a.type, id: a.id, add: a.add });
    }
    default:
      throw new Error("Unknown remote command");
  }
  return response("generic", {});
}
