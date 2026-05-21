// iTunes Search API — free, no auth, returns 30s previewUrl + releaseDate.

const GENRE_TERMS = {
  pop:        ["pop hits", "pop song", "billboard pop", "top 40"],
  rock:       ["rock", "classic rock", "alternative rock", "indie rock"],
  hiphop:     ["hip hop", "rap", "drill", "trap"],
  reggaeton:  ["reggaeton", "perreo", "dembow", "bad bunny", "daddy yankee", "j balvin"],
  latin:      ["bachata", "salsa", "latin pop", "merengue", "cumbia", "ranchera", "mariachi"],
  electronic: ["edm", "house music", "techno", "electronic", "dance"],
  rnb:        ["r&b", "soul", "neo soul", "rnb"],
  kpop:       ["k-pop", "kpop", "korean pop"],
  jpop:       ["j-pop", "jpop", "city pop", "anime opening"],
  country:    ["country music", "country song", "americana"],
  jazz:       ["jazz", "bebop", "smooth jazz", "vocal jazz"],
  reggae:     ["reggae", "dancehall", "ska"],
  indie:      ["indie", "indie pop", "indie folk", "bedroom pop"],
  metal:      ["metal", "heavy metal", "metalcore", "thrash"],
  classical:  ["classical music", "orchestra", "symphony", "piano concerto"],
};

const ALL_TERMS = [
  "love", "rock", "pop", "dance", "night", "heart", "baby",
  "summer", "fire", "dream", "girl", "boy", "world", "time", "free",
  "alone", "yeah", "feel", "city", "queen", "hits", "single", "album",
];

async function fetchTerm(term, limit = 200) {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", term);
  url.searchParams.set("entity", "song");
  url.searchParams.set("media", "music");
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url);
  if (!res.ok) throw new Error("iTunes " + res.status);
  const j = await res.json();
  return (j.results || [])
    .filter((r) => r.previewUrl && r.releaseDate)
    .map((r) => ({
      id: String(r.trackId),
      title: r.trackName,
      artist: r.artistName,
      year: parseInt(r.releaseDate.slice(0, 4), 10),
      preview: r.previewUrl,
      cover: (r.artworkUrl100 || "").replace("100x100", "300x300") || null,
      genre: r.primaryGenreName || null,
    }));
}

async function buildPool({ yearMin = 1955, yearMax = new Date().getFullYear(), genres = [] } = {}) {
  // Build term list from selected genres, fallback to broad terms if none.
  let terms;
  if (genres && genres.length > 0) {
    terms = [];
    for (const g of genres) if (GENRE_TERMS[g]) terms.push(...GENRE_TERMS[g]);
    if (terms.length === 0) terms = ALL_TERMS;
  } else {
    terms = ALL_TERMS;
  }
  // dedupe term list
  terms = [...new Set(terms)];

  const all = [];
  const batches = await Promise.allSettled(terms.map((t) => fetchTerm(t, 200)));
  for (const b of batches) if (b.status === "fulfilled") all.push(...b.value);

  // dedupe by normalized title+artist
  const seen = new Set();
  const uniq = all.filter((t) => {
    const k = t.title.toLowerCase().replace(/\s*\(.*?\)\s*/g, "").trim() + "|" + t.artist.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // year filter
  const inRange = uniq.filter(
    (t) => Number.isFinite(t.year) && t.year >= yearMin && t.year <= yearMax
  );

  // shuffle
  for (let i = inRange.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [inRange[i], inRange[j]] = [inRange[j], inRange[i]];
  }
  return inRange;
}

// --- Artist mode ----------------------------------------------------------

async function searchArtists(query) {
  if (!query || query.length < 2) return [];
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", query);
  url.searchParams.set("entity", "musicArtist");
  url.searchParams.set("limit", "10");
  const res = await fetch(url);
  if (!res.ok) return [];
  const j = await res.json();
  return (j.results || [])
    .filter((a) => a.artistId && a.artistName)
    .map((a) => ({
      id: a.artistId,
      name: a.artistName,
      genre: a.primaryGenreName || null,
    }));
}

async function buildArtistPool({ artistId, artistName }) {
  if (!artistId) return [];
  // iTunes lookup: get all songs by this artist
  const url = new URL("https://itunes.apple.com/lookup");
  url.searchParams.set("id", String(artistId));
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "200");
  const res = await fetch(url);
  if (!res.ok) throw new Error("iTunes lookup " + res.status);
  const j = await res.json();
  const tracks = (j.results || [])
    .filter((r) => r.wrapperType === "track" && r.previewUrl && r.releaseDate)
    .map((r) => ({
      id: String(r.trackId),
      title: r.trackName,
      artist: r.artistName,
      year: parseInt(r.releaseDate.slice(0, 4), 10),
      preview: r.previewUrl,
      cover: (r.artworkUrl100 || "").replace("100x100", "300x300") || null,
      genre: r.primaryGenreName || null,
    }))
    .filter((t) => Number.isFinite(t.year));

  // dedupe by normalized title (one song per title; keep earliest year — usually the original release)
  const byTitle = new Map();
  for (const t of tracks) {
    const k = t.title.toLowerCase().replace(/\s*\(.*?\)\s*|\s*-\s*(remaster.*|live|version|edit).*$/gi, "").trim();
    if (!byTitle.has(k) || byTitle.get(k).year > t.year) byTitle.set(k, t);
  }
  const uniq = [...byTitle.values()];

  // shuffle
  for (let i = uniq.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [uniq[i], uniq[j]] = [uniq[j], uniq[i]];
  }
  return uniq;
}

module.exports = { buildPool, buildArtistPool, searchArtists, GENRE_TERMS };
