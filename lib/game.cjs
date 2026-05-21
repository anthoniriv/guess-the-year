const { buildPool, buildArtistPool, searchArtists } = require("./spotify.cjs");

const ROUND_CLIP_MS = 15_000;
const REVEAL_MS = 6_000;
const COUNTDOWN_MS = 3_000;
const DEFAULT_ROUNDS = 8;

const rooms = new Map(); // code -> room

function code() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

function thresholdsFor(config) {
  const range = Math.max(1, (config?.yearMax || 2026) - (config?.yearMin || 1955));
  // For very narrow ranges (artist with short career) keep floor reasonable.
  return {
    close: Math.max(2, Math.round(range * 0.08)),
    far:   Math.max(6, Math.round(range * 0.16)),
  };
}

function scoreGuess(guess, actual, thresholds) {
  const d = Math.abs(guess - actual);
  if (d === 0) return 10;
  if (d <= thresholds.close) return 5;
  if (d <= thresholds.far)   return 2;
  return 0;
}

function publicRoom(r) {
  return {
    code: r.code,
    hostId: r.hostId,
    phase: r.phase,
    round: r.round,
    totalRounds: r.totalRounds,
    config: r.config || null,
    thresholds: thresholdsFor(r.config),
    poolSize: r.pool ? r.pool.length + r.used.size : null,
    players: [...r.players.values()].map((p) => ({
      id: p.id, name: p.name, score: p.score, ready: p.ready, guessed: !!p.guess,
    })),
    current: r.current ? {
      preview: r.current.preview,
      startAt: r.current.startAt,
      endsAt: r.current.endsAt,
    } : null,
    reveal: r.reveal || null,
  };
}

async function ensurePool(room) {
  if (room.pool && room.pool.length > 0) return;
  const cfg = room.config || {};
  if (cfg.mode === "artist") {
    if (!cfg.artist?.id) throw new Error("No artist selected.");
    room.pool = await buildArtistPool({ artistId: cfg.artist.id, artistName: cfg.artist.name });
    if (!room.pool.length) {
      throw new Error(`No previewable songs found for ${cfg.artist.name}.`);
    }
    // derive year range from this artist's discography
    const years = room.pool.map((t) => t.year).filter(Number.isFinite);
    if (years.length) {
      cfg.yearMin = Math.min(...years);
      cfg.yearMax = Math.max(...years);
    }
  } else {
    room.pool = await buildPool(cfg);
    if (!room.pool.length) {
      throw new Error("No songs match those filters. Try widening the year range or selecting more genres.");
    }
  }
}

function broadcast(io, room) {
  io.to(room.code).emit("room", publicRoom(room));
}

async function startRound(io, room) {
  if (room.round >= room.totalRounds) {
    room.phase = "finished";
    broadcast(io, room);
    return;
  }
  await ensurePool(room);
  // pick next unused track
  let track = null;
  while (room.pool.length && !track) {
    const cand = room.pool.pop();
    if (!room.used.has(cand.id)) track = cand;
  }
  if (!track) {
    room.phase = "finished";
    broadcast(io, room);
    return;
  }
  room.used.add(track.id);
  room.round += 1;
  room.phase = "playing";
  const startAt = Date.now() + COUNTDOWN_MS;
  const endsAt = startAt + ROUND_CLIP_MS;
  room.current = { track, preview: track.preview, startAt, endsAt };
  for (const p of room.players.values()) p.guess = null;
  room.reveal = null;
  broadcast(io, room);

  clearTimeout(room.timer);
  room.timer = setTimeout(() => endRound(io, room), COUNTDOWN_MS + ROUND_CLIP_MS);
}

function endRound(io, room) {
  if (room.phase !== "playing" || !room.current) return;
  const t = room.current.track;
  const th = thresholdsFor(room.config);
  const results = [...room.players.values()].map((p) => {
    const pts = p.guess != null ? scoreGuess(p.guess, t.year, th) : 0;
    p.score += pts;
    return { id: p.id, name: p.name, guess: p.guess, points: pts, total: p.score };
  }).sort((a, b) => b.points - a.points);

  room.phase = "reveal";
  room.reveal = {
    title: t.title, artist: t.artist, year: t.year, cover: t.cover, results,
    thresholds: th,
    nextAt: Date.now() + REVEAL_MS,
  };
  room.current = null;
  broadcast(io, room);

  clearTimeout(room.timer);
  room.timer = setTimeout(() => startRound(io, room), REVEAL_MS);
}

function initGame(io) {
  io.on("connection", (socket) => {
    socket.data = {};

    socket.on("create", ({ name, rounds, mode, yearMin, yearMax, genres, artist }, cb) => {
      const c = code();
      const nowY = new Date().getFullYear();
      const gameMode = mode === "artist" ? "artist" : "genres";
      const config = {
        mode: gameMode,
        yearMin: Math.max(1900, Math.min(nowY, parseInt(yearMin) || 1955)),
        yearMax: Math.max(1900, Math.min(nowY, parseInt(yearMax) || nowY)),
        genres: Array.isArray(genres) ? genres.filter((g) => typeof g === "string").slice(0, 20) : [],
        artist: gameMode === "artist" && artist && artist.id
          ? { id: artist.id, name: String(artist.name || "").slice(0, 80) }
          : null,
      };
      const room = {
        code: c,
        hostId: socket.id,
        players: new Map(),
        phase: "lobby",
        round: 0,
        totalRounds: Math.min(20, Math.max(3, rounds || DEFAULT_ROUNDS)),
        config,
        pool: null,
        used: new Set(),
        current: null,
        reveal: null,
        timer: null,
      };
      room.players.set(socket.id, { id: socket.id, name: (name || "Host").slice(0, 16), score: 0, ready: false, guess: null });
      rooms.set(c, room);
      socket.join(c);
      socket.data.code = c;
      cb?.({ ok: true, code: c });
      broadcast(io, room);
    });

    socket.on("join", ({ code: c, name }, cb) => {
      c = (c || "").toUpperCase();
      const room = rooms.get(c);
      if (!room) return cb?.({ ok: false, error: "Room not found" });
      if (room.phase !== "lobby") return cb?.({ ok: false, error: "Game already started" });
      room.players.set(socket.id, { id: socket.id, name: (name || "Player").slice(0, 16), score: 0, ready: false, guess: null });
      socket.join(c);
      socket.data.code = c;
      cb?.({ ok: true, code: c });
      broadcast(io, room);
    });

    socket.on("searchArtists", async ({ query }, cb) => {
      try {
        const results = await searchArtists(query);
        cb?.({ ok: true, results });
      } catch (e) {
        cb?.({ ok: false, error: e.message });
      }
    });

    socket.on("start", async () => {
      const room = rooms.get(socket.data.code);
      if (!room || room.hostId !== socket.id) return;
      if (room.phase !== "lobby") return;
      // Atomic guard: flip phase before any await so re-clicks bounce.
      room.phase = "loading";
      broadcast(io, room);
      try {
        await startRound(io, room);
      } catch (e) {
        room.phase = "lobby";
        broadcast(io, room);
        io.to(room.code).emit("error_msg", e.message);
      }
    });

    socket.on("guess", ({ year }) => {
      const room = rooms.get(socket.data.code);
      if (!room || room.phase !== "playing") return;
      const p = room.players.get(socket.id);
      if (!p || p.guess != null) return;
      const y = parseInt(year, 10);
      if (!Number.isFinite(y) || y < 1900 || y > new Date().getFullYear()) return;
      p.guess = y;
      broadcast(io, room);
      // all guessed? end early
      const all = [...room.players.values()].every((pp) => pp.guess != null);
      if (all) endRound(io, room);
    });

    socket.on("playAgain", () => {
      const room = rooms.get(socket.data.code);
      if (!room || room.hostId !== socket.id) return;
      room.phase = "lobby";
      room.round = 0;
      room.current = null;
      room.reveal = null;
      for (const p of room.players.values()) { p.score = 0; p.guess = null; }
      broadcast(io, room);
    });

    socket.on("disconnect", () => {
      const c = socket.data.code;
      if (!c) return;
      const room = rooms.get(c);
      if (!room) return;
      room.players.delete(socket.id);
      if (room.players.size === 0) {
        clearTimeout(room.timer);
        rooms.delete(c);
        return;
      }
      if (room.hostId === socket.id) {
        room.hostId = [...room.players.keys()][0];
      }
      broadcast(io, room);
    });
  });
}

module.exports = { initGame };
