// minimal .env loader (no extra dep)
require("fs").existsSync(".env") && require("fs").readFileSync(".env", "utf8").split("\n").forEach((l) => {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
});

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const { initGame } = require("./lib/game.cjs");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res, parse(req.url, true)));
  const io = new Server(httpServer, { cors: { origin: "*" } });
  initGame(io);
  httpServer.listen(port, () => console.log(`> neon-year-guess http://localhost:${port}`));
});
