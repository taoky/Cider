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

// Different scripts are evidence of a possible translation, not proof of identity.
function differentScripts(left, right) {
  const scripts = (value) => ["Latin", "Han", "Hiragana", "Katakana", "Hangul", "Cyrillic", "Arabic"].filter((script) => new RegExp(`\\p{Script=${script}}`, "u").test(value));
  const leftScripts = scripts(left);
  const rightScripts = scripts(right);
  return leftScripts.length > 0 && rightScripts.length > 0 && (leftScripts.some((script) => !rightScripts.includes(script)) || rightScripts.some((script) => !leftScripts.includes(script)));
}

function albumName(value) {
  return normalize(String(value ?? "").replace(/\s*-\s*(single|ep)\s*$/i, ""));
}

function titleParts(value) {
  const title = String(value ?? "")
    .normalize("NFKC")
    .toLowerCase();
  const qualifiers = [...title.matchAll(/\(([^)]*)\)|\[([^\]]*)\]/g)].map((match) => match[1] ?? match[2]).join(" ");
  const base = normalize(title.replace(/\([^)]*\)|\[[^\]]*\]/g, " "));
  return { full: normalize(title), base, qualifiers: normalize(qualifiers) };
}

function versionTypes(value) {
  const types = [
    ["live", /\blive\b|ライブ|现场|現場/i],
    ["remix", /\bremix\b|\bbootleg\b|リミックス/i],
    ["instrumental", /\binstrumental\b|\bkaraoke\b|カラオケ|伴奏/i],
    ["acoustic", /\bacoustic\b|アコースティック/i],
    ["short", /\banime\b|\btv\b|\bshort\b|\bpromo\b|\bradio edit\b|アニメ/i],
    ["demo", /\bdemo\b|デモ/i],
  ];
  return types
    .filter(([, pattern]) => pattern.test(value))
    .map(([type]) => type)
    .join("|");
}

export function selectNeteaseSong(track, songs, { allowCrossLanguage = true, searchSupport = new Map() } = {}) {
  const title = titleParts(track.title);
  const expectedArtists = artists(track.artistName);
  if (!title.full) return null;
  const duration = Number(track.attributes?.durationInMillis);
  const album = albumName(track.attributes?.albumName ?? track.albumName);
  const ranked = [];
  for (const song of songs) {
    if (!song?.id) continue;
    if (versionTypes(track.title) !== versionTypes(song.name)) continue;
    const names = [song.name, ...(Array.isArray(song.alias) ? song.alias : []), ...(Array.isArray(song.transNames) ? song.transNames : [])];
    let titleScore = 0;
    for (const name of names) {
      const candidate = titleParts(name);
      if (candidate.full === title.full) titleScore = Math.max(titleScore, 70);
      else if (candidate.base === title.base && candidate.qualifiers && title.qualifiers && differentScripts(title.qualifiers, candidate.qualifiers)) titleScore = Math.max(titleScore, 60);
      else if (allowCrossLanguage && differentScripts(title.base, candidate.base) && Boolean(title.qualifiers) === Boolean(candidate.qualifiers)) titleScore = Math.max(titleScore, 30);
    }
    if (!titleScore) continue;
    const actualArtists = (song.artists ?? []).map((artist) => normalize(artist.name)).filter(Boolean);
    const overlap = expectedArtists.some((artist) => actualArtists.includes(artist));
    if (!overlap && !allowCrossLanguage) continue;
    const translatedArtist = expectedArtists.some((artist) => actualArtists.some((other) => differentScripts(artist, other)));
    if (expectedArtists.length && actualArtists.length && !overlap && !translatedArtist) continue;
    const difference = duration > 0 && Number(song.duration) > 0 ? Math.abs(duration - Number(song.duration)) : Infinity;
    if (Number.isFinite(difference) && difference > Math.min(8000, Math.max(3000, duration * 0.03))) continue;
    const closeDuration = difference <= 2000;
    const sameAlbum = Boolean(album && album === albumName(song.album?.name));
    // A translated title needs independent evidence; duration alone is not enough.
    const repeatedSearchMatch = (searchSupport.get(song.id) ?? 0) >= 2;
    if (titleScore === 30 && !(closeDuration && (overlap || (translatedArtist && (sameAlbum || repeatedSearchMatch))))) continue;
    const durationScore = closeDuration ? 25 + 10 * (1 - difference / 2000) : Number.isFinite(difference) ? 15 : 0;
    let score = titleScore + (overlap ? 25 : 0) + durationScore + (sameAlbum ? 20 : 0) + (titleScore === 30 && repeatedSearchMatch ? 20 : 0);
    // A search-supported translation must never outrank a directly matched title.
    if (titleScore === 30) score = Math.min(score, 80);
    if (score >= 85 || (titleScore === 30 && score >= 75)) ranked.push({ song, score, artists: actualArtists.sort().join("|") });
  }
  ranked.sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best) return null;
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
  const searchSupport = new Map();
  let selected = null;
  for (const query of neteaseSearchQueries(track)) {
    if (!isCurrent()) return null;
    const params = new URLSearchParams({ s: query, type: "1", offset: "0", total: "true", limit: "30" });
    const response = await requestJSON(`https://music.163.com/api/search/get/?${params}`);
    if (!isCurrent()) return null;
    const songs = response.result?.songs ?? [];
    for (const song of songs) candidates.set(song.id, song);
    for (const id of new Set(songs.slice(0, 3).map((song) => song.id))) searchSupport.set(id, (searchSupport.get(id) ?? 0) + 1);
    selected = selectNeteaseSong(track, [...candidates.values()], { allowCrossLanguage: false });
    if (selected) break;
  }
  // Search all variants before accepting names that cannot be compared directly.
  selected ??= selectNeteaseSong(track, [...candidates.values()], { searchSupport });
  if (!selected || !isCurrent()) return null;
  const lyricParams = new URLSearchParams({ os: "pc", id: String(selected.id), lv: "-1", kv: "-1", tv: "-1" });
  const lyrics = await requestJSON(`https://music.163.com/api/song/lyric?${lyricParams}`);
  return isCurrent() ? lyrics : null;
}
