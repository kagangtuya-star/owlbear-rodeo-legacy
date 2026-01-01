import cors, { CorsOptions } from "cors";
import express, { Application, RequestHandler } from "express";
import helmet from "helmet";
import { Server } from "socket.io";
// @ts-ignore
import msgParser from "socket.io-msgpack-parser";
import AppServer from "./entities/AppServer";
import Controller from "./controllers/Controller";
import GameServer from "./entities/GameServer";
import Global from "./entities/Global";
import HealthcheckController from "./controllers/HealthcheckController";
import IceServer from "./entities/IceServer";
import IceServerController from "./controllers/IceServerController";
import AssetStorage from "./entities/AssetStorage";
import AssetController from "./controllers/AssetController";
import path from "path";
import { fileURLToPath } from "url";

const app: Application = express();
const port: string | number = Global.CONNECTION_PORT;
const server = new AppServer(app, port);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolveDuration = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
};

const assetBaseDir =
  process.env.ASSET_CACHE_DIR || path.resolve(__dirname, "../../cache/assets");
const assetTtlMs = resolveDuration(
  process.env.ASSET_CACHE_TTL_MS,
  24 * 60 * 60 * 1000
);
const postGameAssetTtlMs = resolveDuration(
  process.env.ASSET_CACHE_POST_GAME_TTL_MS,
  15 * 60 * 1000
);

const io = new Server(server, {
  cookie: false,
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: false,
  },
  serveClient: false,
  maxHttpBufferSize: 1e7,
  parser: msgParser,
});

const corsConfig: CorsOptions = {
  origin: true,
  credentials: false,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

const jsonParser = express.json({ limit: "100mb" });

const iceServer = new IceServer();

const assetStorage = new AssetStorage(
  assetBaseDir,
  assetTtlMs,
  postGameAssetTtlMs
);

const globalMiddleware: Array<RequestHandler> = [
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  }),
  cors(corsConfig),
  jsonParser,
];

app.options("*", cors(corsConfig));

const controllers: Array<Controller> = [
  new HealthcheckController(),
  new IceServerController(iceServer),
  new AssetController(assetStorage),
];

server.loadMiddleware(globalMiddleware);
server.loadControllers(controllers);
const httpServer = server.run();
const game = new GameServer(io, assetStorage);
game.initaliseSocketServer(httpServer);
game.run();

process.once("SIGTERM", () => {
  console.log("sigterm event");
  server.close(() => {
    console.log("http server closed");
  });

  io.close(() => {
    console.log("socket server closed");
    io.sockets.emit("server shutdown");
  });

  setTimeout(() => {
    process.exit(0);
  }, 3000).unref();
});

process.on("unhandledRejection", (reason, p) => {
  console.log("Unhandled Rejection at: Promise", p, "reason:", reason);
  // application specific logging, throwing an error, or other logic here
});
