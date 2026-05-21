"use client";
import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import Game from "./Game.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const ARTISTS = [
  { name: "Michael Jackson", img: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/54/f2/ef/54f2ef79-c668-8d6f-28cd-ae48c45009b7/196874193211.jpg/600x600bb.jpg", rot: -4, label: "M.J." },
  { name: "Bee Gees",        img: "https://is1-ssl.mzstatic.com/image/thumb/Music113/v4/45/db/1d/45db1dac-fe00-3681-b216-266deea6e4cc/17UM1IM26789.rgb.jpg/600x600bb.jpg",       rot: 3,  label: "BEE GEES" },
  { name: "Lady Gaga",       img: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/08/12/80/08128053-d7df-489d-bfde-be6f45f075be/26UMGIM57129.rgb.jpg/600x600bb.jpg",      rot: -2, label: "GAGA" },
  { name: "Joji",            img: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/e4/f6/bd/e4f6bd1d-c969-026d-bb63-f32c77649474/54391890016.jpg/600x600bb.jpg",          rot: 5,  label: "JOJI" },
  { name: "Bad Bunny",       img: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/90/5e/7e/905e7ed5-a8fa-a8f3-cd06-0028fdf3afaa/199066342442.jpg/600x600bb.jpg",         rot: -3, label: "B. BUNNY" },
];

const GENRES = [
  { id: "pop",        label: "Pop" },
  { id: "rock",       label: "Rock" },
  { id: "hiphop",     label: "Hip-Hop" },
  { id: "reggaeton",  label: "Reggaeton" },
  { id: "latin",      label: "Latin" },
  { id: "electronic", label: "Electronic" },
  { id: "rnb",        label: "R&B / Soul" },
  { id: "kpop",       label: "K-Pop" },
  { id: "jpop",       label: "J-Pop" },
  { id: "country",    label: "Country" },
  { id: "jazz",       label: "Jazz" },
  { id: "reggae",     label: "Reggae" },
  { id: "indie",      label: "Indie" },
  { id: "metal",      label: "Metal" },
  { id: "classical",  label: "Classical" },
];

const NOW_YEAR = new Date().getFullYear();
const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

function Bullseye({ size = 100 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="shrink-0">
      <circle cx="50" cy="50" r="48" fill="#efe9dd" stroke="rgba(27,26,23,0.2)" strokeWidth="1" />
      <circle cx="50" cy="50" r="38" fill="rgba(27,26,23,0.05)" stroke="rgba(27,26,23,0.18)" strokeWidth="1" />
      <circle cx="50" cy="50" r="24" fill="rgba(27,26,23,0.1)" stroke="rgba(27,26,23,0.25)" strokeWidth="1" />
      <circle cx="50" cy="50" r="10" fill="#c0392b" />
      {/* arrow */}
      <line x1="14" y1="14" x2="48" y2="48" stroke="#1b1a17" strokeWidth="1.5" />
      <polygon points="48,48 44,46 46,44" fill="#1b1a17" />
    </svg>
  );
}

function LegendRow({ color, pts, label, hint }) {
  const dot = {
    vermilion: "bg-vermilion",
    sumi: "bg-sumi",
    "sumi-2": "bg-sumi-2",
    muted: "bg-sumi/15",
  }[color];
  return (
    <div className="flex items-center gap-2">
      <span className={`w-3 h-3 rounded-full ${dot} shrink-0`} />
      <span className="font-display font-bold text-sumi text-sm w-10">{pts}</span>
      <span className="text-sumi font-bold">{label}</span>
      <span className="text-sumi-2/70 text-[11px]">— {hint}</span>
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [rounds, setRounds] = useState(8);
  const [yearMin, setYearMin] = useState(1970);
  const [yearMax, setYearMax] = useState(NOW_YEAR);
  const [genres, setGenres] = useState([]);
  const [gameMode, setGameMode] = useState("genres"); // 'genres' | 'artist'
  const [artistQuery, setArtistQuery] = useState("");
  const [artistResults, setArtistResults] = useState([]);
  const [artist, setArtist] = useState(null); // { id, name }
  const [searching, setSearching] = useState(false);
  const [started, setStarted] = useState(null);
  const searchSockRef = useRef(null);
  const debounceRef = useRef(null);

  const toggleGenre = (id) =>
    setGenres((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));

  // Lazy socket connection just for artist search.
  useEffect(() => {
    if (mode !== "create" || gameMode !== "artist") return;
    if (!searchSockRef.current) {
      searchSockRef.current = io({ transports: ["websocket"] });
    }
  }, [mode, gameMode]);

  useEffect(() => {
    if (gameMode !== "artist" || !artistQuery || artist) {
      setArtistResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const s = searchSockRef.current;
      if (!s) return;
      setSearching(true);
      s.emit("searchArtists", { query: artistQuery }, (resp) => {
        setSearching(false);
        if (resp?.ok) setArtistResults(resp.results || []);
      });
    }, 280);
    return () => clearTimeout(debounceRef.current);
  }, [artistQuery, gameMode, artist]);

  if (started) return <Game {...started} />;

  return (
    <main className="relative min-h-screen flex flex-col items-center px-6 py-10 z-10">
      {/* Header */}
      <div className="w-full max-w-5xl flex items-center justify-between mb-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-vermilion text-washi flex items-center justify-center font-display font-bold rounded-sm">
            G
          </div>
          <div>
            <div className="text-[10px] tracking-[0.5em] text-sumi-2/70">GUESS · THE · YEAR</div>
            <div className="font-display text-lg text-sumi font-bold">Music Quiz</div>
          </div>
        </div>
        <div className="hidden md:block text-right text-[10px] tracking-[0.4em] text-sumi-2/70">
          MULTIPLAYER
        </div>
      </div>

      {/* Hero collage */}
      <div className="relative w-full max-w-5xl mb-16">
        <div className="flex justify-center items-end gap-3 md:gap-5 flex-wrap">
          {ARTISTS.map((a, i) => (
            <figure
              key={a.name}
              className="ink-bleed relative"
              style={{ animationDelay: i * 80 + "ms" }}
            >
              <div
                className="overflow-hidden bg-washi-2 border border-sumi/20 shadow-[0_8px_20px_-8px_rgba(27,26,23,0.35)]"
                style={{ transform: `rotate(${a.rot}deg)`, width: 132, height: 132 }}
              >
                <img
                  src={a.img}
                  alt={a.name}
                  loading="lazy"
                  className="w-full h-full object-cover grayscale-[35%] contrast-[1.05] sepia-[15%]"
                />
              </div>
              <figcaption
                className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-sumi text-washi text-[9px] tracking-[0.25em] whitespace-nowrap"
                style={{ transform: `translate(-50%, 0) rotate(${a.rot}deg)` }}
              >
                {a.label}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      {/* Title */}
      <div className="text-center mb-10 max-w-2xl">
        <h1 className="font-display text-5xl md:text-7xl text-sumi font-bold tracking-tight leading-none mb-3">
          What <span className="brush-under">year</span> is this?
        </h1>
        <p className="text-sumi-2 text-xs md:text-sm tracking-[0.4em]">
          GUESS · THE · RELEASE · YEAR
        </p>
        <p className="text-sumi-2/70 text-xs mt-3 italic">
          Listen to 15 seconds, guess the year. Closest wins.
        </p>
      </div>

      {/* Action card */}
      <Card className="w-full max-w-md border-sumi/15 bg-card">
        <CardContent className="p-6 flex flex-col gap-4">
          {!mode && (
            <>
              <Button
                onClick={() => setMode("create")}
                className="h-14 text-base font-display font-bold tracking-[0.3em] bg-vermilion text-washi hover:bg-sumi transition-colors rounded-sm"
              >
                CREATE ROOM
              </Button>
              <Button
                onClick={() => setMode("join")}
                variant="outline"
                className="h-14 text-base font-display font-bold tracking-[0.3em] border-sumi/40 text-sumi hover:bg-sumi hover:text-washi rounded-sm"
              >
                JOIN ROOM
              </Button>
              <p className="text-[10px] text-sumi-2/60 text-center mt-2 tracking-wider">
                Create a room and share the 4-letter code with friends
              </p>
            </>
          )}

          {mode && (
            <div className="flex flex-col gap-4">
              {mode === "join" && (
                <div className="p-4 bg-vermilion/5 border border-vermilion/30 rounded-sm">
                  <label className="mb-2 flex items-baseline gap-2">
                    <span className="text-[10px] bg-vermilion text-washi px-1.5 py-0.5 rounded-sm font-display font-bold">STEP 1</span>
                    <span className="text-sm font-display font-bold text-sumi tracking-wider">ROOM CODE</span>
                  </label>
                  <Input
                    autoFocus
                    maxLength={4}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                    placeholder="ABCD"
                    className="bg-washi border-sumi/30 text-sumi text-3xl h-16 text-center tracking-[0.6em] font-display font-bold rounded-sm focus-visible:border-vermilion focus-visible:ring-vermilion/30"
                  />
                  <p className="text-[10px] text-sumi-2/70 mt-1.5">The 4-letter code the host gave you</p>
                </div>
              )}

              <div className={mode === "join" ? "p-4 bg-vermilion/5 border border-vermilion/30 rounded-sm" : ""}>
                <label className="mb-2 flex items-baseline gap-2">
                  {mode === "join" && (
                    <span className="text-[10px] bg-vermilion text-washi px-1.5 py-0.5 rounded-sm font-display font-bold">STEP 2</span>
                  )}
                  <span className="text-sm font-display font-bold text-sumi tracking-wider">
                    {mode === "join" ? "PICK A NICKNAME" : "YOUR NAME"}
                  </span>
                </label>
                <Input
                  autoFocus={mode === "create"}
                  maxLength={16}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={mode === "join" ? "How should others see you?" : "Type your name here"}
                  className="bg-washi border-sumi/30 text-sumi text-base h-12 rounded-sm focus-visible:border-vermilion focus-visible:ring-vermilion/30"
                />
                <p className="text-[10px] text-sumi-2/70 mt-1.5">
                  {mode === "join"
                    ? "Your display name in the room — NOT the room code"
                    : "Up to 16 characters"}
                </p>
              </div>

              {mode === "create" && (
                <>
                  <div>
                    <label className="mb-2 flex items-baseline justify-between gap-2">
                      <span className="flex items-baseline gap-2">
                        <span className="text-sm font-display font-bold text-sumi tracking-wider">ROUNDS</span>
                      </span>
                      <span className="text-vermilion font-display font-bold text-2xl">{rounds}</span>
                    </label>
                    <input
                      type="range"
                      min={3}
                      max={20}
                      value={rounds}
                      onChange={(e) => setRounds(parseInt(e.target.value))}
                      className="w-full accent-vermilion"
                    />
                    <div className="flex justify-between text-[10px] text-sumi-2/50 mt-1">
                      <span>3</span><span>← drag →</span><span>20</span>
                    </div>
                  </div>

                  {/* Game mode toggle */}
                  <div className="pt-2 border-t border-sumi/15">
                    <label className="mb-2 flex items-baseline gap-2">
                      <span className="text-sm font-display font-bold text-sumi tracking-wider">GAME MODE</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setGameMode("genres")}
                        className={`p-3 rounded-sm text-left transition-colors border ${
                          gameMode === "genres"
                            ? "border-vermilion bg-vermilion/5"
                            : "border-sumi/25 hover:border-sumi/50 bg-washi"
                        }`}
                      >
                        <div className="font-display font-bold text-sumi text-sm">GENRES</div>
                        <div className="text-[10px] text-sumi-2/70">Mixed songs by genre</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setGameMode("artist")}
                        className={`p-3 rounded-sm text-left transition-colors border ${
                          gameMode === "artist"
                            ? "border-vermilion bg-vermilion/5"
                            : "border-sumi/25 hover:border-sumi/50 bg-washi"
                        }`}
                      >
                        <div className="font-display font-bold text-sumi text-sm">ARTIST</div>
                        <div className="text-[10px] text-sumi-2/70">One singer only</div>
                      </button>
                    </div>
                  </div>

                  {gameMode === "artist" && (
                    <div className="pt-2 border-t border-sumi/15">
                      <label className="mb-2 flex items-baseline gap-2">
                        <span className="text-sm font-display font-bold text-sumi tracking-wider">PICK ARTIST</span>
                      </label>
                      {artist ? (
                        <div className="flex items-center justify-between gap-2 p-3 bg-vermilion/5 border border-vermilion rounded-sm">
                          <div className="min-w-0">
                            <div className="font-display font-bold text-sumi truncate">{artist.name}</div>
                            <div className="text-[10px] text-vermilion">Selected</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setArtist(null); setArtistQuery(""); }}
                            className="text-[10px] text-sumi-2 hover:text-vermilion px-2 py-1 border border-sumi/25 rounded-sm tracking-widest"
                          >
                            CHANGE
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <Input
                            value={artistQuery}
                            onChange={(e) => setArtistQuery(e.target.value)}
                            placeholder="Search a singer or band…"
                            className="bg-washi border-sumi/30 text-sumi text-base h-11 rounded-sm focus-visible:border-vermilion focus-visible:ring-vermilion/30"
                          />
                          {(artistResults.length > 0 || searching) && (
                            <div className="absolute z-20 left-0 right-0 mt-1 bg-card border border-sumi/30 rounded-sm shadow-md max-h-64 overflow-auto">
                              {searching && (
                                <div className="px-3 py-2 text-[10px] text-sumi-2 tracking-widest">
                                  Searching…
                                </div>
                              )}
                              {artistResults.map((a) => (
                                <button
                                  type="button"
                                  key={a.id}
                                  onClick={() => { setArtist(a); setArtistQuery(""); setArtistResults([]); }}
                                  className="w-full text-left px-3 py-2 hover:bg-vermilion/10 border-b border-sumi/10 last:border-0"
                                >
                                  <div className="font-display font-bold text-sumi text-sm">{a.name}</div>
                                  {a.genre && (
                                    <div className="text-[10px] text-sumi-2/70">{a.genre}</div>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <p className="text-[10px] text-sumi-2/60 mt-2">
                        Songs picked only from this artist's discography. Year range is auto-set from their releases.
                      </p>
                    </div>
                  )}

                  {gameMode === "genres" && (
                  <>
                  <div className="pt-2 border-t border-sumi/15">
                    <label className="mb-2 flex items-baseline gap-2">
                      <span className="text-sm font-display font-bold text-sumi tracking-wider">YEAR RANGE</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[10px] text-sumi-2/70 mb-1">From</div>
                        <select
                          value={yearMin}
                          onChange={(e) => {
                            const v = parseInt(e.target.value);
                            setYearMin(v);
                            if (v > yearMax) setYearMax(Math.min(NOW_YEAR, v + 10));
                          }}
                          className="w-full h-10 px-2 bg-washi border border-sumi/30 rounded-sm text-sumi font-display font-bold focus:border-vermilion focus:outline-none"
                        >
                          {DECADES.map((d) => (
                            <option key={d} value={d}>{d}s</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className="text-[10px] text-sumi-2/70 mb-1">To</div>
                        <select
                          value={yearMax}
                          onChange={(e) => {
                            const v = parseInt(e.target.value);
                            setYearMax(v);
                            if (v < yearMin) setYearMin(Math.max(1950, v - 10));
                          }}
                          className="w-full h-10 px-2 bg-washi border border-sumi/30 rounded-sm text-sumi font-display font-bold focus:border-vermilion focus:outline-none"
                        >
                          {DECADES.map((d) => {
                            const top = d + 9 > NOW_YEAR ? NOW_YEAR : d + 9;
                            return <option key={d} value={top}>{d}s</option>;
                          })}
                        </select>
                      </div>
                    </div>
                    <p className="text-[10px] text-sumi-2/60 mt-1.5">
                      Songs from {yearMin} to {yearMax}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-sumi/15">
                    <label className="mb-2 flex items-baseline justify-between gap-2">
                      <span className="flex items-baseline gap-2">
                        <span className="text-sm font-display font-bold text-sumi tracking-wider">GENRES</span>
                      </span>
                      <span className="text-[10px] text-sumi-2">
                        {genres.length === 0 ? "All" : `${genres.length} selected`}
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {GENRES.map((g) => {
                        const active = genres.includes(g.id);
                        return (
                          <button
                            type="button"
                            key={g.id}
                            onClick={() => toggleGenre(g.id)}
                            className={`px-3 py-1.5 rounded-sm text-xs font-bold tracking-wider transition-colors border ${
                              active
                                ? "bg-vermilion text-washi border-vermilion"
                                : "bg-washi text-sumi-2 border-sumi/25 hover:border-sumi/50"
                            }`}
                          >
                            {g.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-sumi-2/60 mt-2">
                      {genres.length === 0
                        ? "No genres selected = all kinds of music"
                        : "Only songs matching these genres"}
                    </p>
                  </div>
                  </>
                  )}
                </>
              )}

              <div className="flex gap-2 mt-2 pt-2 border-t border-sumi/15">
                <Button
                  variant="ghost"
                  onClick={() => setMode(null)}
                  className="flex-1 h-12 text-sumi-2 hover:text-sumi tracking-widest"
                >
                  ← BACK
                </Button>
                <Button
                  disabled={
                    !name ||
                    (mode === "join" && code.length !== 4) ||
                    (mode === "join" && name.trim().toUpperCase() === code) ||
                    (mode === "create" && gameMode === "artist" && !artist)
                  }
                  onClick={() => {
                    searchSockRef.current?.disconnect();
                    setStarted({
                      mode,
                      name,
                      code,
                      rounds,
                      gameMode,
                      yearMin,
                      yearMax,
                      genres,
                      artist,
                    });
                  }}
                  className="flex-1 h-12 font-display font-bold tracking-[0.2em] bg-vermilion text-washi hover:bg-sumi rounded-sm"
                >
                  {mode === "create" ? "CREATE →" : "JOIN →"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scoring legend — bullseye */}
      <div className="mt-10 max-w-md w-full">
        <div className="text-[10px] text-sumi-2 tracking-[0.4em] text-center mb-4">
          HOW SCORING WORKS
        </div>
        <Card className="border-sumi/15 bg-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-6 justify-center">
              <Bullseye />
              <div className="flex flex-col gap-2.5 text-xs">
                <LegendRow color="vermilion" pts="+10" label="Bullseye" hint="Exact year" />
                <LegendRow color="sumi" pts="+5" label="Inner ring" hint="A few years off" />
                <LegendRow color="sumi-2" pts="+2" label="Outer ring" hint="In the ballpark" />
                <LegendRow color="muted" pts="0" label="Miss" hint="Too far away" />
              </div>
            </div>
            <p className="text-[10px] text-sumi-2/60 text-center mt-4 pt-3 border-t border-sumi/10">
              The rings get tighter when you pick a narrow year range
            </p>
          </CardContent>
        </Card>
      </div>

      <footer className="mt-16 text-[10px] text-sumi-2/60 tracking-widest italic">
        Music · 15 seconds · play with friends
      </footer>
    </main>
  );
}
