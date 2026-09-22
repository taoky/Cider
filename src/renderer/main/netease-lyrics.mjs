function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\bversion\b/g, "ver")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function artists(value) {
  return String(value ?? "")
    .split(/\s*(?:&|,|、|;| feat\.? | featuring )\s*/i)
    .map(normalize)
    .filter(Boolean);
}

export function neteaseSearchQueries(track) {
  const title = String(track.title ?? "").trim();
  if (!title) return [];
  // Remove version qualifiers only for search recall, never for candidate matching.
  const base = title
    .normalize("NFKC")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const primaryArtist = String(track.artistName ?? "")
    .split(/\s+(?:&|feat\.?|featuring)\s+|[,、;]/i)[0]
    .trim();
  return [...new Set([title, [base, primaryArtist].filter(Boolean).join(" "), base].filter(Boolean))];
}

export function selectNeteaseSong(track, songs) {
  const title = normalize(track.title);
  const expectedArtists = artists(track.artistName);
  if (!title || !expectedArtists.length) return null;
  const duration = Number(track.attributes?.durationInMillis);
  const ranked = [];
  for (const song of songs) {
    if (!song?.id) continue;
    // Aliases may supply a localized title, but album names are not song names.
    const exact = normalize(song.name) === title;
    const aliases = [...(Array.isArray(song.alias) ? song.alias : []), ...(Array.isArray(song.transNames) ? song.transNames : [])];
    if (!exact && !aliases.some((name) => normalize(name) === title)) continue;
    const actualArtists = (song.artists ?? []).map((artist) => normalize(artist.name)).filter(Boolean);
    const overlap = expectedArtists.filter((artist) => actualArtists.includes(artist)).length;
    if (!overlap) continue;
    let score = (exact ? 70 : 65) + (20 * overlap) / expectedArtists.length;
    if (duration > 0 && Number(song.duration) > 0) {
      const difference = Math.abs(duration - Number(song.duration));
      if (difference > Math.min(5000, Math.max(2000, duration * 0.02))) continue;
      score += 10;
    }
    if (score >= 85) ranked.push({ song, score, artists: actualArtists.sort().join("|") });
  }
  ranked.sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best) return null;
  // Duplicate releases of the same recording need not make a match ambiguous.
  const competitor = ranked.slice(1).find((entry) => normalize(entry.song.name) !== normalize(best.song.name) || entry.artists !== best.artists || !(Number(entry.song.duration) > 0 && Number(best.song.duration) > 0 && Math.abs(entry.song.duration - best.song.duration) <= 1000));
  if (competitor && best.score - competitor.score < 5) return null;
  return best.song;
}

export function requestNeteaseJSON(url) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.overrideMimeType("application/json");
    request.timeout = 10000;
    request.onload = () => {
      try {
        if (request.status < 200 || request.status >= 300) throw new Error(`NetEase HTTP ${request.status}`);
        const data = JSON.parse(request.responseText);
        if (data.code !== 200) throw new Error(`NetEase API ${data.code}`);
        resolve(data);
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = request.ontimeout = request.onabort = () => reject(new Error("NetEase request failed"));
    request.send();
  });
}

export async function fetchNeteaseLyrics(track, isCurrent, requestJSON = requestNeteaseJSON) {
  const candidates = new Map();
  for (const query of neteaseSearchQueries(track)) {
    if (!isCurrent()) return null;
    const params = new URLSearchParams({ s: query, type: "1", offset: "0", total: "true", limit: "30" });
    const response = await requestJSON(`https://music.163.com/api/search/get/?${params}`);
    if (!isCurrent()) return null;
    for (const song of response.result?.songs ?? []) candidates.set(song.id, song);
    const song = selectNeteaseSong(track, [...candidates.values()]);
    if (!song) continue;
    const lyricParams = new URLSearchParams({ os: "pc", id: String(song.id), lv: "-1", kv: "-1", tv: "-1" });
    const lyrics = await requestJSON(`https://music.163.com/api/song/lyric?${lyricParams}`);
    return isCurrent() ? lyrics : null;
  }
  return null;
}
