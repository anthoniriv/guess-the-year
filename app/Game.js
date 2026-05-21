"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Game({ mode, name, code: joinCode, rounds, gameMode, yearMin, yearMax, genres, artist }) {
  const [socket, setSocket] = useState(null);
  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);
  const [guess, setGuess] = useState(1990);
  const [submitted, setSubmitted] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [volume, setVolume] = useState(() => {
    if (typeof window === "undefined") return 80;
    const v = parseInt(localStorage.getItem("nyg-volume") || "80", 10);
    return Number.isFinite(v) ? v : 80;
  });
  const [muted, setMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("nyg-muted") === "1";
  });
  const audioRef = useRef(null);
  const playedForRef = useRef(null);

  // Persist volume + apply to audio element
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("nyg-volume", String(volume));
    if (audioRef.current) audioRef.current.volume = (muted ? 0 : volume) / 100;
  }, [volume, muted]);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("nyg-muted", muted ? "1" : "0");
  }, [muted]);

  useEffect(() => {
    const s = io({ transports: ["websocket"] });
    setSocket(s);
    s.on("room", (r) => {
      setRoom((prev) => {
        // reset guess to a safe default at the start of each playing round
        if (r.phase === "playing" && (!prev || prev.phase !== "playing" || prev.round !== r.round)) {
          setGuess((g) => (Number.isFinite(g) ? g : 1990));
          setSubmitted(false);
        }
        if (r.phase !== "playing") setSubmitted(false);
        return r;
      });
    });
    s.on("error_msg", (m) => setError(m));
    s.on("connect", () => {
      if (mode === "create") {
        s.emit("create", { name, rounds, mode: gameMode, yearMin, yearMax, genres, artist }, (resp) => {
          if (!resp?.ok) setError(resp?.error || "Failed");
        });
      } else {
        s.emit("join", { name, code: joinCode }, (resp) => {
          if (!resp?.ok) setError(resp?.error || "Failed");
        });
      }
    });
    return () => s.disconnect();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!room || room.phase !== "playing" || !room.current) return;
    const { preview, startAt, endsAt } = room.current;
    const roundKey = preview + ":" + startAt;
    if (playedForRef.current === roundKey) return;
    playedForRef.current = roundKey;
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = preview;
    audio.volume = (muted ? 0 : volume) / 100;
    audio.load();
    const play = () => {
      const offsetMs = Date.now() - startAt;
      if (offsetMs >= 0 && offsetMs < endsAt - startAt) {
        audio.currentTime = offsetMs / 1000;
        audio.play().catch(() => setError("Click anywhere to enable audio"));
      } else if (offsetMs < 0) {
        setTimeout(play, -offsetMs);
      }
    };
    play();
    return () => { audio.pause(); };
  }, [room?.current?.preview, room?.current?.startAt]);

  useEffect(() => {
    if (!room?.current) return;
    const stopIn = room.current.endsAt - Date.now();
    if (stopIn <= 0) return;
    const t = setTimeout(() => audioRef.current?.pause(), stopIn);
    return () => clearTimeout(t);
  }, [room?.current?.endsAt]);

  const me = room?.players.find((p) => p.id === socket?.id);
  const isHost = room && socket && room.hostId === socket.id;

  return (
    <main className="relative min-h-screen px-4 py-6 md:px-8 md:py-10 z-10">
      <audio ref={audioRef} preload="auto" />

      {error && (
        <Alert
          onClick={() => { setError(null); audioRef.current?.play(); }}
          className="fixed top-4 left-1/2 -translate-x-1/2 w-auto max-w-md z-50 border-vermilion bg-washi text-sumi cursor-pointer shadow-lg rounded-sm"
        >
          <AlertDescription className="text-sumi text-sm">{error}</AlertDescription>
        </Alert>
      )}

      {!room && (
        <div className="text-center text-sumi-2 mt-32 tracking-[0.4em] text-sm">
          CONNECTING…
        </div>
      )}

      {room && (
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <header className="flex justify-between items-end mb-10 pb-4 border-b border-sumi/20 gap-4">
            <button
              onClick={() => {
                if (confirm("Leave the room and go back home?")) {
                  socket?.disconnect();
                  window.location.href = "/";
                }
              }}
              className="shrink-0 px-3 h-9 text-xs font-display font-bold tracking-widest border border-sumi/30 text-sumi-2 hover:text-sumi hover:border-sumi rounded-sm transition-colors flex items-center gap-2"
              title="Back to home"
            >
              <span>← HOME</span>
            </button>
            <div className="flex-1 text-center sm:text-left sm:ml-4">
              <div className="text-[10px] text-sumi-2 tracking-[0.4em] mb-1">ROOM</div>
              <div className="font-display text-2xl md:text-4xl text-sumi font-bold tracking-[0.4em]">
                {room.code}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <VolumeControl volume={volume} setVolume={setVolume} muted={muted} setMuted={setMuted} />
              <div className="text-right">
                <div className="text-[10px] text-sumi-2 tracking-[0.4em] mb-1">ROUND</div>
                <div className="font-display text-2xl text-vermilion font-bold">
                  {room.round}<span className="text-sumi-2/50 text-base"> / {room.totalRounds}</span>
                </div>
              </div>
            </div>
          </header>

          {(room.phase === "lobby" || room.phase === "loading") && (
            <Lobby room={room} isHost={isHost} onStart={() => socket.emit("start")} />
          )}
          {room.phase === "playing" && room.current && (
            <Playing
              room={room} now={now} guess={guess} setGuess={setGuess}
              submitted={submitted}
              onSubmit={(y) => { socket.emit("guess", { year: y }); setSubmitted(true); }}
            />
          )}
          {room.phase === "reveal" && room.reveal && <Reveal reveal={room.reveal} now={now} />}
          {room.phase === "finished" && (
            <Finished room={room} isHost={isHost} onAgain={() => socket.emit("playAgain")} />
          )}
        </div>
      )}
    </main>
  );
}

function VolumeControl({ volume, setVolume, muted, setMuted }) {
  const [open, setOpen] = useState(false);
  const effective = muted ? 0 : volume;
  const icon =
    effective === 0 ? "🔇" : effective < 33 ? "🔈" : effective < 66 ? "🔉" : "🔊";
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-9 px-2.5 border border-sumi/30 hover:border-sumi rounded-sm text-sm flex items-center gap-1.5 transition-colors"
        title={`Volume ${effective}%`}
      >
        <span className="text-base leading-none">{icon}</span>
        <span className="font-display font-bold text-xs text-sumi-2 hidden sm:inline">{effective}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-card border border-sumi/30 rounded-sm shadow-md p-3 w-56">
          <div className="text-[10px] text-sumi-2 tracking-[0.3em] mb-2 flex justify-between items-center">
            <span>VOLUME</span>
            <span className="text-sumi font-display font-bold text-sm">{effective}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => { setVolume(parseInt(e.target.value, 10)); if (muted) setMuted(false); }}
            className="year-slider w-full"
          />
          <div className="flex justify-between gap-2 mt-3">
            <button
              onClick={() => setMuted((m) => !m)}
              className="flex-1 h-8 text-[10px] tracking-widest border border-sumi/25 hover:border-sumi rounded-sm font-display font-bold text-sumi-2"
            >
              {muted ? "UNMUTE" : "MUTE"}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="flex-1 h-8 text-[10px] tracking-widest bg-sumi text-washi rounded-sm font-display font-bold"
            >
              DONE
            </button>
          </div>
          <p className="text-[9px] text-sumi-2/60 mt-2">Only affects your device</p>
        </div>
      )}
    </div>
  );
}

function PlayerAvatar({ name, accent = false, small = false }) {
  const initials = (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const size = small ? "h-8 w-8 text-[10px]" : "h-10 w-10 text-xs";
  const cls = accent
    ? "bg-vermilion text-washi border-2 border-vermilion"
    : "bg-washi-2 text-sumi border border-sumi/30";
  return (
    <Avatar className={`${size} rounded-sm`}>
      <AvatarFallback className={`${cls} font-display font-bold rounded-sm`}>{initials}</AvatarFallback>
    </Avatar>
  );
}

const GENRE_LABELS = {
  pop: "Pop", rock: "Rock", hiphop: "Hip-Hop", reggaeton: "Reggaeton", latin: "Latin",
  electronic: "Electronic", rnb: "R&B / Soul", kpop: "K-Pop", jpop: "J-Pop",
  country: "Country", jazz: "Jazz", reggae: "Reggae", indie: "Indie",
  metal: "Metal", classical: "Classical",
};

function Lobby({ room, isHost, onStart }) {
  const loading = room.phase === "loading";
  const cfg = room.config;
  return (
    <div className="text-center ink-bleed">
      <div className="text-[10px] text-sumi-2 tracking-[0.5em] mb-2">WAITING ROOM</div>
      <h2 className="font-display text-4xl md:text-5xl text-sumi font-bold mb-3">
        <span className="brush-under">Lobby</span>
      </h2>
      <p className="text-sumi-2/70 text-xs tracking-[0.3em] mb-6">
        Share the room code with friends
      </p>

      {cfg && (
        <Card className="border-sumi/15 bg-card mb-8 text-left">
          <CardContent className="p-4 grid grid-cols-2 gap-4">
            {cfg.mode === "artist" ? (
              <>
                <div className="col-span-2">
                  <div className="text-[10px] text-sumi-2 tracking-[0.4em] mb-1 tracking-wider">
                    ARTIST MODE
                  </div>
                  <div className="font-display font-bold text-vermilion text-2xl">
                    {cfg.artist?.name || "—"}
                  </div>
                  <div className="text-[10px] text-sumi-2/70 tracking-wider mt-0.5">
                    All songs are from this artist
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-sumi-2 tracking-[0.4em] mb-1 tracking-wider">
                    YEARS
                  </div>
                  <div className="font-display font-bold text-sumi text-base">
                    {cfg.yearMin === cfg.yearMax ? cfg.yearMin :
                      <>{cfg.yearMin}<span className="text-sumi-2/50 mx-1">—</span>{cfg.yearMax}</>}
                  </div>
                  <div className="text-[10px] text-sumi-2/60 tracking-wider">auto from discography</div>
                </div>
                <div>
                  <div className="text-[10px] text-sumi-2 tracking-[0.4em] mb-1 tracking-wider">
                    ROUNDS
                  </div>
                  <div className="font-display font-bold text-sumi text-lg">{room.totalRounds}</div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="text-[10px] text-sumi-2 tracking-[0.4em] mb-1 tracking-wider">
                    YEAR RANGE
                  </div>
                  <div className="font-display font-bold text-sumi text-lg">
                    {cfg.yearMin}<span className="text-sumi-2/50 mx-1">—</span>{cfg.yearMax}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-sumi-2 tracking-[0.4em] mb-1 tracking-wider">
                    ROUNDS
                  </div>
                  <div className="font-display font-bold text-sumi text-lg">{room.totalRounds}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[10px] text-sumi-2 tracking-[0.4em] mb-1.5 tracking-wider">
                    GENRES
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {!cfg.genres || cfg.genres.length === 0 ? (
                      <span className="px-2 py-0.5 bg-sumi/10 text-sumi-2 text-xs rounded-sm font-bold">
                        All genres
                      </span>
                    ) : (
                      cfg.genres.map((g) => (
                        <span key={g} className="px-2 py-0.5 bg-vermilion/10 text-vermilion text-xs rounded-sm font-bold border border-vermilion/30">
                          {GENRE_LABELS[g] || g}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
            <div className="col-span-2 pt-3 border-t border-sumi/15">
              <div className="text-[10px] text-sumi-2 tracking-[0.4em] mb-1.5 tracking-wider">
                SCORING
              </div>
              <div className="flex gap-2 text-[11px] tracking-wider">
                <span className="px-2 py-1 bg-vermilion/10 text-vermilion rounded-sm border border-vermilion/30">
                  <b className="font-display">+10</b> exact
                </span>
                <span className="px-2 py-1 bg-sumi/8 text-sumi rounded-sm border border-sumi/20">
                  <b className="font-display">+5</b> within ±{room.thresholds?.close ?? 5}y
                </span>
                <span className="px-2 py-1 bg-sumi/8 text-sumi rounded-sm border border-sumi/20">
                  <b className="font-display">+2</b> within ±{room.thresholds?.far ?? 10}y
                </span>
              </div>
              <p className="text-[10px] text-sumi-2/60 mt-1.5 tracking-wider">
                Tolerance scales with range — narrower decade = stricter
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-10">
        {room.players.map((p) => (
          <Card key={p.id} className="border-sumi/15 bg-card">
            <CardContent className="flex items-center gap-3 p-3">
              <PlayerAvatar name={p.name} accent={room.hostId === p.id} />
              <div className="text-left flex-1 min-w-0">
                <div className="text-sumi font-bold truncate text-sm">{p.name}</div>
                {room.hostId === p.id && (
                  <div className="text-[9px] text-vermilion tracking-[0.3em] tracking-wider mt-0.5">
                    HOST
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {isHost ? (
        <div className="flex flex-col items-center gap-3">
          <Button
            onClick={onStart}
            disabled={loading}
            className="px-14 h-16 text-lg font-display font-bold tracking-[0.2em] bg-vermilion text-washi hover:bg-sumi rounded-sm flex flex-col gap-0.5 disabled:opacity-60"
          >
            <span>{loading ? "LOADING SONGS…" : "START GAME"}</span>
            <span className="text-[10px] tracking-[0.4em] opacity-70 tracking-wider">
              {loading ? "Loading songs" : "Start"}
            </span>
          </Button>
          <p className="text-[10px] text-sumi-2/70 tracking-widest tracking-wider">
            {loading
              ? "Please wait, fetching the music library…"
              : "You are the host · Click when everyone joined"}
          </p>
        </div>
      ) : (
        <div className="text-sumi-2 tracking-widest text-xs tracking-wider">
          {loading
            ? "Loading songs…"
            : "Waiting for host to start…"}
        </div>
      )}
    </div>
  );
}

function Playing({ room, now, guess, setGuess, submitted, onSubmit }) {
  const { startAt, endsAt } = room.current;
  const preMs = startAt - now;
  const total = endsAt - startAt;
  const remaining = Math.max(0, endsAt - now);
  const pct = Math.max(0, Math.min(100, ((total - remaining) / total) * 100));
  const minYear = room.config?.yearMin ?? 1955;
  const maxYear = room.config?.yearMax ?? new Date().getFullYear();
  // clamp guess into range
  const clampedGuess = Math.max(minYear, Math.min(maxYear, guess));

  return (
    <div className="ink-bleed">
      {preMs > 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="text-[10px] text-sumi-2 tracking-[0.5em] mb-6 tracking-wider">GET READY</div>
          <div className="font-display text-[10rem] leading-none text-vermilion font-bold">
            {Math.ceil(preMs / 1000)}
          </div>
        </div>
      ) : (
        <>
          <Progress value={pct} className="h-1.5" />
          <div className="text-center text-sumi-2 text-[10px] tracking-[0.4em] mt-3 mb-10 tracking-wider">
            {(remaining / 1000).toFixed(1)} s remaining
          </div>

          <Card className="border-sumi/15 bg-card mb-6">
            <CardContent className="p-8 md:p-10 text-center">
              <div className="text-sumi text-sm font-display font-bold tracking-[0.3em] mb-1">
                WHAT YEAR WAS THIS SONG RELEASED?
              </div>
              <div className="text-[10px] text-sumi-2/70 tracking-[0.4em] mb-6 tracking-wider">
                
              </div>
              <div className="text-[10px] text-sumi-2 tracking-[0.3em] mb-2 tracking-wider">
                YOUR GUESS
              </div>
              <div className="font-display text-7xl md:text-9xl text-vermilion font-bold leading-none">
                {clampedGuess}
              </div>
            </CardContent>
          </Card>

          {!submitted && (
            <div className="text-center text-[10px] text-sumi-2 tracking-[0.3em] mb-3 tracking-wider">
              ← DRAG THE SLIDER TO PICK A YEAR →
            </div>
          )}
          <input
            type="range"
            min={minYear}
            max={maxYear}
            step={1}
            value={clampedGuess}
            onChange={(e) => setGuess(parseInt(e.target.value, 10))}
            disabled={submitted}
            className="year-slider w-full my-4 disabled:opacity-50"
          />
          {/* decade markers — only those inside the range */}
          <div className="relative h-5 mb-2">
            {[1960, 1970, 1980, 1990, 2000, 2010, 2020]
              .filter((y) => y >= minYear && y <= maxYear)
              .map((y) => {
                const left = ((y - minYear) / Math.max(1, maxYear - minYear)) * 100;
                return (
                  <div
                    key={y}
                    className="absolute -translate-x-1/2 text-[9px] text-sumi-2/60 tracking-wider"
                    style={{ left: left + "%" }}
                  >
                    <div className="w-px h-1.5 bg-sumi/30 mx-auto mb-0.5" />
                    '{String(y).slice(2)}s
                  </div>
                );
              })}
          </div>
          <div className="flex justify-between text-[10px] text-sumi-2 mt-1 mb-8 tracking-wider tracking-widest">
            <span>{minYear}</span>
            <span className="text-sumi-2/50">{maxYear - minYear} years</span>
            <span>{maxYear}</span>
          </div>

          <Button
            onClick={() => onSubmit(clampedGuess)}
            disabled={submitted}
            className={`w-full h-16 text-lg font-display font-bold tracking-[0.2em] rounded-sm flex flex-col gap-0.5 ${
              submitted ? "bg-sumi/20 text-sumi-2" : "bg-vermilion text-washi hover:bg-sumi"
            }`}
          >
            <span>{submitted ? "READY ✓" : `LOCK IN ${clampedGuess}`}</span>
            <span className="text-[10px] tracking-[0.4em] opacity-70">
              {submitted ? "Waiting for others…" : "Submit your guess to be ready"}
            </span>
          </Button>
        </>
      )}

      {/* Ready counter */}
      {(() => {
        const ready = room.players.filter((p) => p.guessed).length;
        const total = room.players.length;
        const allReady = ready === total;
        return (
          <div className={`mt-8 mb-3 p-3 rounded-sm border flex items-center justify-between gap-3 ${
            allReady ? "border-vermilion bg-vermilion/5" : "border-sumi/20 bg-card"
          }`}>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-display font-bold ${allReady ? "text-vermilion" : "text-sumi"}`}>
                {ready}<span className="text-sumi-2/40 text-base"> / {total}</span>
              </span>
              <span className="text-xs text-sumi-2 tracking-wider">
                {allReady ? "Everyone ready — revealing!" : "players ready"}
              </span>
            </div>
            <div className="hidden sm:flex gap-1">
              {room.players.map((p) => (
                <div
                  key={p.id}
                  title={p.name}
                  className={`w-2.5 h-2.5 rounded-full ${p.guessed ? "bg-vermilion" : "bg-sumi/20"}`}
                />
              ))}
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {room.players.map((p) => (
          <Card
            key={p.id}
            className={`p-0 transition-colors ${
              p.guessed
                ? "border-vermilion/50 bg-vermilion/5"
                : "border-sumi/10 bg-card/60"
            }`}
          >
            <CardContent className="flex items-center gap-2 px-3 py-2">
              <PlayerAvatar name={p.name} accent={p.guessed} small />
              <span className={`flex-1 truncate text-xs font-bold ${p.guessed ? "text-sumi" : "text-sumi-2"}`}>
                {p.guessed && "✓ "}{p.name}
              </span>
              <span className={`font-display font-bold text-sm ${p.guessed ? "text-vermilion" : "text-sumi-2/60"}`}>
                {p.score}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Reveal({ reveal, now }) {
  const th = reveal.thresholds;
  const nextIn = Math.max(0, Math.ceil(((reveal.nextAt || Date.now()) - now) / 1000));
  return (
    <div className="ink-bleed text-center">
      <Card className="border-sumi/15 bg-card mb-6 overflow-hidden relative">
        <div className="absolute top-0 right-0 px-3 py-1 bg-sumi text-washi text-[10px] tracking-[0.3em] font-display font-bold">
          NEXT SONG IN {nextIn}s
        </div>
        <CardContent className="p-8 md:p-10">
          {reveal.cover && (
            <img
              src={reveal.cover}
              alt=""
              className="w-44 h-44 mx-auto mb-6 rounded-sm border border-sumi/20 shadow-md"
            />
          )}
          <div className="font-display text-2xl text-sumi font-bold mb-1">{reveal.title}</div>
          <div className="text-sumi-2 text-sm tracking-[0.2em] mb-6 italic">{reveal.artist}</div>
          <div className="text-[10px] text-sumi-2 tracking-[0.5em] mb-2">
            RELEASED
          </div>
          <div className="font-display text-8xl text-vermilion font-bold leading-none">
            {reveal.year}
          </div>
          {th && (
            <div className="mt-5 inline-flex items-center gap-3 text-[10px] tracking-widest text-sumi-2/70 px-3 py-1.5 bg-sumi/5 rounded-sm">
              <span><span className="text-vermilion font-display font-bold">+10</span> exact</span>
              <span className="text-sumi-2/30">·</span>
              <span><span className="font-display font-bold text-sumi">+5</span> ±{th.close}y</span>
              <span className="text-sumi-2/30">·</span>
              <span><span className="font-display font-bold text-sumi">+2</span> ±{th.far}y</span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2 text-left">
        {reveal.results.map((r) => {
          const perfect = r.points === 10;
          const diff = r.guess != null ? r.guess - reveal.year : null;
          const absDiff = diff == null ? null : Math.abs(diff);
          const diffLabel =
            diff == null ? "—"
              : diff === 0 ? "exact"
              : `${diff > 0 ? "+" : ""}${diff}y`;
          return (
            <Card
              key={r.id}
              className={`${perfect ? "border-vermilion bg-vermilion/5" : "border-sumi/15 bg-card"}`}
            >
              <CardContent className="flex items-center gap-3 py-2.5 px-4">
                <PlayerAvatar name={r.name} accent={perfect} small />
                <span className="flex-1 text-sumi font-bold truncate text-sm">{r.name}</span>
                <div className="hidden sm:flex flex-col items-end leading-tight tracking-wider">
                  <span className="text-sumi text-xs font-bold">{r.guess ?? "—"}</span>
                  <span className={`text-[10px] ${r.points === 0 && absDiff != null ? "text-vermilion/70" : "text-sumi-2/60"}`}>
                    {diffLabel}{r.points === 0 && th && absDiff != null && ` (need ±${th.far})`}
                  </span>
                </div>
                <span
                  className={`font-display font-bold text-sm px-2 py-0.5 rounded-sm ${
                    perfect
                      ? "bg-vermilion text-washi"
                      : r.points > 0
                      ? "bg-sumi text-washi"
                      : "bg-sumi/10 text-sumi-2/50"
                  }`}
                >
                  +{r.points}
                </span>
                <span className="font-display font-bold text-vermilion text-lg min-w-[2.5ch] text-right">
                  {r.total}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Finished({ room, isHost, onAgain }) {
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  return (
    <div className="ink-bleed text-center mt-4">
      <div className="text-[10px] text-sumi-2 tracking-[0.5em] mb-3 tracking-wider">FINAL RESULTS</div>
      <h2 className="font-display text-5xl md:text-6xl text-sumi font-bold mb-2">
        <span className="brush-under">Final</span>
      </h2>
      <div className="text-sumi-2 tracking-[0.3em] mb-10 text-xs tracking-wider">
        WINNER · {sorted[0]?.name?.toUpperCase()}
      </div>

      <div className="space-y-3 mb-10">
        {sorted.map((p, i) => {
          const isFirst = i === 0;
          return (
            <Card
              key={p.id}
              className={`${isFirst ? "border-vermilion bg-vermilion/5" : "border-sumi/15 bg-card"}`}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div
                  className={`font-display text-3xl font-bold w-10 ${
                    isFirst ? "text-vermilion" : "text-sumi-2"
                  }`}
                >
                  {i + 1}
                </div>
                <PlayerAvatar name={p.name} accent={isFirst} />
                <span className="flex-1 text-left text-lg font-bold text-sumi truncate">{p.name}</span>
                <span
                  className={`font-display text-3xl font-bold ${
                    isFirst ? "text-vermilion" : "text-sumi"
                  }`}
                >
                  {p.score}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isHost && (
        <Button
          onClick={onAgain}
          className="px-10 h-16 text-lg font-display font-bold tracking-[0.2em] bg-vermilion text-washi hover:bg-sumi rounded-sm flex flex-col gap-0.5"
        >
          <span>PLAY AGAIN</span>
          <span className="text-[10px] tracking-[0.4em] opacity-70 tracking-wider"></span>
        </Button>
      )}
    </div>
  );
}
