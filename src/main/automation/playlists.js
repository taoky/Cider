// @ts-nocheck
const { createHash } = require("crypto");
const { validate, isAIPlaylist, playlistName } = require("./protocol");

function song(item) {
  const a = item.attributes || {};
  return { id: item.id, type: item.type, name: a.name, artistName: a.artistName, albumName: a.albumName, durationInMillis: a.durationInMillis, playable: !!a.playParams, isrc: a.isrc, catalogId: a.playParams?.catalogId || item.relationships?.catalog?.data?.[0]?.id };
}
function metadata(item) {
  const a = item.attributes || {};
  return { id: item.id, name: a.name, description: typeof a.description === "string" ? a.description : a.description?.standard, canEdit: a.canEdit === true, isPublic: a.isPublic === true, ai: isAIPlaylist(a.name) };
}

// This service lives in the main process; the bridge is not a security boundary.
class PlaylistService {
  constructor({ call, save, records = {}, settings }) {
    this.call = call;
    this.save = save;
    this.records = records;
    this.settings = settings;
    this.writes = Promise.resolve();
    for (const record of Object.values(records)) {
      if (record.state === "running") record.state = "unknown";
    }
  }
  async guard(session) {
    if (!session.active || !this.settings().enabled) throw new Error("CONNECTION_REVOKED");
    const state = await this.call("status", {});
    if (!state.authorized || !state.account || state.account !== session.account) throw new Error("ACCOUNT_CHANGED_OR_NOT_AUTHORIZED");
    if (!session.active || !this.settings().enabled) throw new Error("CONNECTION_REVOKED");
    return state;
  }
  async request(session, route, parameters = {}, body) {
    await this.guard(session);
    const result = await this.call("music", { route, parameters, body, account: session.account });
    await this.guard(session);
    return result;
  }
  async access(session, id, write = false) {
    const result = await this.request(session, `/v1/me/library/playlists/${id}`);
    const playlist = metadata(result.data?.[0] || {});
    const allowOther = session.readOther && this.settings().readOther;
    if (!playlist.id || !playlist.name || (!playlist.ai && (write || !allowOther)) || (write && !playlist.canEdit)) throw new Error("PLAYLIST_NOT_ACCESSIBLE");
    return playlist;
  }
  async catalog(session, ids) {
    const state = await this.guard(session);
    let found = [];
    for (let start = 0; start < ids.length; start += 100) {
      const result = await this.request(session, `/v1/catalog/${state.storefront}/songs`, { ids: ids.slice(start, start + 100).join(",") });
      found.push(...(result.data || []).map(song));
    }
    const byId = new Map(found.map((item) => [item.id, item]));
    return ids.map((id) => byId.get(id) || { id, playable: false });
  }
  async validateTracks(session, ids) {
    const tracks = await this.catalog(session, ids);
    const invalidIds = tracks.filter((t) => !t.playable || !Number.isFinite(t.durationInMillis) || t.durationInMillis <= 0).map((t) => t.id);
    return { tracks, invalidIds, durationInMillis: tracks.reduce((sum, t) => sum + (Number.isFinite(t.durationInMillis) ? t.durationInMillis : 0), 0) };
  }
  async execute(session, name, input) {
    const args = validate(name, structuredClone(input || {}));
    const state = await this.guard(session);
    const base = `/v1/catalog/${state.storefront}`;
    let result;
    switch (name) {
      case "get_status":
        return { authorized: true, storefront: state.storefront, readOtherPlaylists: !!(session.readOther && this.settings().readOther), write: "editable playlists ending in [MCP] or [AI]" };
      case "search_catalog": {
        const data = await this.request(session, `${base}/search`, { term: args.query, types: args.type, limit: 25, offset: args.offset });
        const page = data.results?.[args.type] || {};
        result = { items: (page.data || []).map(song), nextOffset: page.next ? args.offset + (page.data || []).length : null };
        break;
      }
      case "get_catalog_tracks": {
        if (args.ids) result = { tracks: await this.catalog(session, args.ids) };
        else {
          const page = await this.request(session, `${base}/albums/${args.albumId}/tracks`, { limit: 100, offset: args.offset });
          result = { tracks: (page.data || []).map(song), nextOffset: page.next ? args.offset + (page.data || []).length : null };
        }
        break;
      }
      case "validate_tracks":
        result = await this.validateTracks(session, args.ids);
        break;
      case "list_playlists": {
        const page = await this.request(session, "/v1/me/library/playlists", { limit: 100, offset: args.offset });
        // This is a fresh, no-store Apple response, never the renderer's UI cache.
        // Re-evaluate the current permission before serializing the page. Individual
        // detail reads and writes independently fetch the target's current name.
        const items = (page.data || []).map(metadata).filter((item) => item.ai || (session.readOther && this.settings().readOther));
        result = { items, nextOffset: page.next ? args.offset + (page.data || []).length : null };
        break;
      }
      case "get_playlist": {
        await this.access(session, args.id);
        const page = await this.request(session, `/v1/me/library/playlists/${args.id}/tracks`, { limit: 100, offset: args.offset, include: "catalog" });
        result = { playlist: await this.access(session, args.id), tracks: (page.data || []).map(song), nextOffset: page.next ? args.offset + (page.data || []).length : null };
        break;
      }
      case "get_operation": {
        const record = this.records[this.key(session, args.operationId)];
        if (!record) throw new Error("OPERATION_NOT_FOUND");
        return this.operationResult(session, record);
      }
      case "create_playlist":
      case "append_playlist_tracks": {
        // Serialize writes, including retries from other connections of the same client.
        const task = this.writes.then(() => this.write(session, name, args));
        this.writes = task.catch(() => {});
        return task;
      }
    }
    await this.guard(session);
    return result;
  }
  key(session, operationId) {
    return createHash("sha256")
      .update(JSON.stringify([session.account, session.clientId, operationId]))
      .digest("hex");
  }
  publicRecord(record) {
    const { operationId, state, playlistId, name, confirmedTracks, confirmedDurationInMillis, requestedTracks, error } = record;
    return { operationId, state, playlistId, name, confirmedTracks, confirmedDurationInMillis, requestedTracks, error };
  }
  async operationResult(session, record) {
    const result = this.publicRecord(record);
    if (record.playlistId) {
      try {
        await this.access(session, record.playlistId);
      } catch (error) {
        // Operation progress is client-owned, but the playlist may have been renamed.
        delete result.playlistId;
        delete result.name;
        result.playlistHidden = true;
      }
    }
    await this.guard(session);
    return result;
  }
  async write(session, name, args) {
    await this.guard(session);
    const key = this.key(session, args.operationId);
    const canonical = Object.fromEntries(
      Object.keys(args)
        .sort()
        .map((key) => [key, args[key]])
    );
    const digest = createHash("sha256")
      .update(JSON.stringify([name, canonical]))
      .digest("hex");
    if (this.records[key]) {
      if (this.records[key].digest !== digest) throw new Error("IDEMPOTENCY_CONFLICT");
      return this.operationResult(session, this.records[key]);
    }
    const validation = await this.validateTracks(session, args.ids);
    if (validation.invalidIds.length) return { state: "rejected", invalidIds: validation.invalidIds };
    if (name === "append_playlist_tracks") {
      await this.access(session, args.id, true);
      let offset = 0;
      for (;;) {
        const page = await this.request(session, `/v1/me/library/playlists/${args.id}/tracks`, { limit: 100, offset, include: "catalog" });
        const existing = (page.data || []).map(song);
        if (existing.some((t) => args.ids.includes(t.catalogId || t.id))) throw new Error("DUPLICATE_TRACKS");
        if (!page.next) break;
        if (!existing.length || (offset += existing.length) > 100000) throw new Error("PLAYLIST_TOO_LARGE");
      }
    }
    const record = { operationId: args.operationId, digest, state: "running", playlistId: args.id, name: name === "create_playlist" ? playlistName(args.name) : undefined, confirmedTracks: 0, confirmedDurationInMillis: 0, requestedTracks: args.ids.length };
    this.records[key] = record;
    this.save(this.records); // Write ahead: no mutation if persistence fails.
    let submitted = false;
    try {
      for (let offset = 0; offset < args.ids.length; offset += 100) {
        await this.guard(session);
        const batch = args.ids.slice(offset, offset + 100).map((id) => ({ id, type: "songs" }));
        // Revalidate availability immediately before each submitted batch.
        const checked = await this.validateTracks(session, args.ids.slice(offset, offset + 100));
        if (checked.invalidIds.length) throw new Error("TRACKS_BECAME_UNAVAILABLE");
        this.save(this.records);
        await this.guard(session);
        if (record.playlistId) await this.access(session, record.playlistId, true);
        submitted = true;
        // Do not discard a known POST result on revocation; persist it before guard().
        if (!record.playlistId) {
          const response = await this.call("music", {
            account: session.account,
            route: "/v1/me/library/playlists",
            body: {
              attributes: { name: record.name, description: args.description || "", isPublic: false },
              relationships: { tracks: { data: batch } },
            },
          });
          record.playlistId = response.data?.[0]?.id;
          if (!record.playlistId) throw new Error("CREATE_RESULT_UNKNOWN");
        } else {
          await this.call("music", { account: session.account, route: `/v1/me/library/playlists/${record.playlistId}/tracks`, body: { data: batch } });
        }
        record.confirmedTracks += batch.length;
        record.confirmedDurationInMillis += checked.durationInMillis;
        this.save(this.records);
        submitted = false;
      }
      record.state = "complete";
    } catch (error) {
      record.state = submitted ? "unknown" : "partial";
      record.error = submitted ? "An Apple write may have completed. Do not resubmit; inspect the playlist in Cider." : "Stopped before the next batch. Inspect the playlist before continuing.";
    }
    this.save(this.records);
    await this.guard(session);
    return this.operationResult(session, record);
  }
}
module.exports = { PlaylistService, song, metadata };
