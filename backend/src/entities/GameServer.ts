/* eslint-disable no-underscore-dangle */
import { Server as HttpServer } from "http";
import { Socket, Server as IOServer } from "socket.io";
import Auth from "./Auth";
import GameRepository from "./GameRepository";
import GameState from "./GameState";
import AssetStorage from "./AssetStorage";
import { Update } from "../helpers/diff";
import { Map } from "../types/Map";
import { MapState } from "../types/MapState";
import { normalizeMapState } from "../helpers/mapState";
import { TokenState } from "../types/TokenState";
import { PlayerState } from "../types/PlayerState";
import { Manifest } from "../types/Manifest";
import { Pointer } from "../types/Pointer";

const STREAM_PROTOCOL_VERSION = 1;
const STREAM_MAX_SIZE = 1e7;
const STREAM_MAX_CHUNKS = 2048;
const STREAM_TOPIC_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export default class GameServer {
  private readonly io: IOServer;
  private gameRepo;
  private assetStorage: AssetStorage;

  constructor(io: IOServer, assetStorage: AssetStorage) {
    this.io = io;
    this.gameRepo = new GameRepository();
    this.assetStorage = assetStorage;
  }

  public initaliseSocketServer(httpServer: HttpServer) {
    this.io.listen(httpServer);
  }

  public run(): void {
    this.io.on("connect", async (socket: Socket) => {
      const gameState = new GameState(this.io, socket, this.gameRepo);
      let _gameId: string;

      const forwardWebRtcSignal = (event: string, payload: any) => {
        try {
          const { to } = payload || {};
          if (typeof to !== "string") {
            return;
          }

          let gameId: string | undefined;
          if (_gameId) {
            gameId = _gameId;
          } else {
            gameId = gameState.getGameId();
            if (gameId) {
              _gameId = gameId;
            }
          }

          if (!gameId) {
            return;
          }

          const partyState = this.gameRepo.getPartyState(gameId);
          if (!partyState || !(to in partyState)) {
            return;
          }

          this.io.to(to).emit(event, {
            from: socket.id,
            ...payload,
          });
        } catch (error) {
          console.error("WEBRTC_SIGNAL_ERROR", error);
        }
      };

      socket.on("relay_chunk", (payload: any) => {
        try {
          const { to, chunkId, index, total, data } = payload || {};
          if (
            typeof to !== "string" ||
            typeof chunkId !== "string" ||
            typeof index !== "number" ||
            typeof total !== "number" ||
            data === undefined
          ) {
            return;
          }

          let gameId: string | undefined;
          if (_gameId) {
            gameId = _gameId;
          } else {
            gameId = gameState.getGameId();
            if (gameId) {
              _gameId = gameId;
            }
          }

          if (!gameId) {
            return;
          }

          const partyState = this.gameRepo.getPartyState(gameId);
          if (!partyState || !(to in partyState)) {
            return;
          }

          this.io.to(to).emit("relay_chunk", {
            from: socket.id,
            chunkId,
            index,
            total,
            data,
          });
        } catch (error) {
          console.error("RELAY_CHUNK_ERROR", error);
        }
      });

      const forwardStreamPayload = (event: string, payload: any) => {
        try {
          const {
            v,
            id,
            topic,
            enc,
            comp,
            size,
            data,
            chunk,
            meta,
          } = payload || {};

          if (v !== STREAM_PROTOCOL_VERSION) {
            return;
          }
          if (typeof id !== "string" || typeof topic !== "string") {
            return;
          }
          if (!STREAM_TOPIC_REGEX.test(topic)) {
            return;
          }
          if (enc !== "msgpack" && enc !== "json") {
            return;
          }
          if (comp !== "none" && comp !== "deflate") {
            return;
          }
          if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
            return;
          }
          if (size > STREAM_MAX_SIZE) {
            return;
          }
          if (data === undefined) {
            return;
          }

          if (chunk !== undefined) {
            if (
              typeof chunk !== "object" ||
              typeof chunk.index !== "number" ||
              typeof chunk.total !== "number" ||
              chunk.total <= 0 ||
              chunk.index < 0 ||
              chunk.index >= chunk.total ||
              chunk.total > STREAM_MAX_CHUNKS
            ) {
              return;
            }
          }

          let gameId: string | undefined;
          if (_gameId) {
            gameId = _gameId;
          } else {
            gameId = gameState.getGameId();
            if (gameId) {
              _gameId = gameId;
            }
          }

          if (!gameId) {
            return;
          }

          const includeSelf = Boolean(meta?.includeSelf);
          const forwardPayload = { ...payload, from: socket.id };
          if (includeSelf) {
            this.io.to(gameId).emit(event, forwardPayload);
          } else {
            socket.to(gameId).emit(event, forwardPayload);
          }
        } catch (error) {
          console.error("EXT_STREAM_ERROR", error);
        }
      };

      socket.on("ext_stream", (payload: any) => {
        forwardStreamPayload("ext_stream", payload);
      });

      socket.on("ext_stream_chunk", (payload: any) => {
        forwardStreamPayload("ext_stream_chunk", payload);
      });

      socket.on("webrtc_offer", (payload: any) => {
        if (!payload?.sdp) {
          return;
        }
        forwardWebRtcSignal("webrtc_offer", payload);
      });

      socket.on("webrtc_answer", (payload: any) => {
        if (!payload?.sdp) {
          return;
        }
        forwardWebRtcSignal("webrtc_answer", payload);
      });

      socket.on("webrtc_ice", (payload: any) => {
        if (!payload?.candidate) {
          return;
        }
        forwardWebRtcSignal("webrtc_ice", payload);
      });

      socket.on("disconnecting", async () => {
        try {
          let gameId: string;
          if (_gameId) {
            gameId = _gameId;
          } else {
            const result = gameState.getGameId();
            if (result) {
              gameId = result;
              _gameId = result;
            } else {
              return;
            }
          }

          socket.to(gameId).emit("player_left", socket.id);
          // Delete player state from game
          this.gameRepo.deletePlayer(gameId, socket.id);

          // Update party state
          const partyState = this.gameRepo.getPartyState(gameId);
          socket.to(gameId).emit("party_state", partyState);

          if (!partyState || Object.keys(partyState).length === 0) {
            this.assetStorage.markGameForCleanup(gameId);
          }
        } catch (error) {
          console.error("DISCONNECT_ERROR", error);
        }
      });

      socket.on("join_game", async (gameId: string, password: string) => {
        const auth = new Auth();
        _gameId = gameId;

        try {
          if (typeof gameId !== "string" || typeof password !== "string") {
            console.log("invalid type in party credentials");
            socket.emit("auth_error");
            return;
          }

          const created = this.gameRepo.isGameCreated(gameId);
          if (!created) {
            // Create a game and join
            const hash = await auth.createPasswordHash(password);
            this.gameRepo.setGameCreation(gameId, hash);
            await gameState.joinGame(gameId);
          } else {
            // Join existing game
            const hash = this.gameRepo.getGamePasswordHash(gameId);
            const res = await auth.checkPassword(password, hash);
            if (res) {
              await gameState.joinGame(gameId);
            } else {
              socket.emit("auth_error");
            }
          }

          this.assetStorage.markGameActive(gameId);
          this.io.to(gameId).emit("joined_game", socket.id);
        } catch (error) {
          console.error("JOIN_ERROR", error);
        }
      });

      socket.on("map", async (map: Map) => {
        try {
          let gameId: string;
          if (_gameId) {
            gameId = _gameId;
          } else {
            const result = gameState.getGameId();
            if (result) {
              gameId = result;
              _gameId = result;
            } else {
              return;
            }
          }

          this.gameRepo.setState(gameId, "map", map);
          const state = this.gameRepo.getState(gameId, "map");
          socket.broadcast.to(gameId).emit("map", state);
        } catch (error) {
          console.error("MAP_ERROR", error);
        }
      });

      socket.on("map_state", async (mapState: MapState) => {
        try {
          let gameId: string;
          if (_gameId) {
            gameId = _gameId;
          } else {
            const result = gameState.getGameId();
            if (result) {
              gameId = result;
              _gameId = result;
            } else {
              return;
            }
          }

          const normalizedMapState = normalizeMapState(mapState);
          this.gameRepo.setState(gameId, "mapState", normalizedMapState);
          const state = this.gameRepo.getState(gameId, "mapState");
          socket.broadcast.to(gameId).emit("map_state", state);
        } catch (error) {
          console.error("MAP_STATE_ERROR", error);
        }
      });

      socket.on("map_state_update", async (update: Update<MapState>) => {
        try {
          let gameId: string;
          if (_gameId) {
            gameId = _gameId;
          } else {
            const result = gameState.getGameId();
            if (result) {
              gameId = result;
              _gameId = result;
            } else {
              return;
            }
          }

          if (await gameState.updateState(gameId, "mapState", update)) {
            socket.to(gameId).emit("map_state_update", update);
          }
        } catch (error) {
          console.error("MAP_STATE_UPDATE_ERROR", error);
        }
      });

      socket.on(
        "token_positions",
        async (update: {
          mapId?: string;
          changes?: Record<string, Partial<TokenState>>;
        }) => {
          try {
            let gameId: string;
            if (_gameId) {
              gameId = _gameId;
            } else {
              const result = gameState.getGameId();
              if (result) {
                gameId = result;
                _gameId = result;
              } else {
                return;
              }
            }

            if (!update?.mapId || !update?.changes) {
              return;
            }

            const state = this.gameRepo.getState(gameId, "mapState") as
              | MapState
              | undefined;
            if (!state || state.mapId !== update.mapId) {
              return;
            }

            for (const [id, change] of Object.entries(update.changes)) {
              const existing = state.tokens?.[id];
              if (!existing) {
                continue;
              }
              if (existing.type === "file") {
                state.tokens[id] = { ...existing, ...change, type: "file" };
              } else {
                state.tokens[id] = { ...existing, ...change, type: "default" };
              }
            }

            this.gameRepo.setState(gameId, "mapState", state);
            socket.broadcast.to(gameId).emit("token_positions", update);
          } catch (error) {
            console.error("TOKEN_POSITIONS_ERROR", error);
          }
        }
      );

      socket.on("explored_reset", async (update: { mapId?: string }) => {
        try {
          let gameId: string;
          if (_gameId) {
            gameId = _gameId;
          } else {
            const result = gameState.getGameId();
            if (result) {
              gameId = result;
              _gameId = result;
            } else {
              return;
            }
          }

          if (!update?.mapId) {
            return;
          }

          const state = this.gameRepo.getState(gameId, "mapState") as
            | (MapState & { explored?: number[][][][] })
            | undefined;
          if (!state || state.mapId !== update.mapId) {
            return;
          }

          state.explored = [];
          this.gameRepo.setState(gameId, "mapState", state);
          socket.broadcast.to(gameId).emit("explored_reset", update);
        } catch (error) {
          console.error("EXPLORED_RESET_ERROR", error);
        }
      });

      socket.on("player_state", async (playerState: PlayerState) => {
        try {
          let gameId: string;
          if (_gameId) {
            gameId = _gameId;
          } else {
            const result = gameState.getGameId();
            if (result) {
              gameId = result;
              _gameId = result;
            } else {
              return;
            }
          }

          this.gameRepo.setPlayerState(gameId, playerState, socket.id);
          await gameState.broadcastPlayerState(gameId, socket, "party_state");
        } catch (error) {
          console.error("PLAYER_STATE_ERROR", error);
        }
      });

      socket.on("manifest", async (manifest: Manifest) => {
        try {
          let gameId: string;
          if (_gameId) {
            gameId = _gameId;
          } else {
            const result = gameState.getGameId();
            if (result) {
              gameId = result;
              _gameId = result;
            } else {
              return;
            }
          }

          this.gameRepo.setState(gameId, "manifest", manifest);
          const state = this.gameRepo.getState(gameId, "manifest");
          socket.broadcast.to(gameId).emit("manifest", state);
        } catch (error) {
          console.error("MANIFEST_ERROR", error);
        }
      });

      socket.on("manifest_update", async (update: Update<Manifest>) => {
        try {
          let gameId: string;
          if (_gameId) {
            gameId = _gameId;
          } else {
            const result = gameState.getGameId();
            if (result) {
              gameId = result;
              _gameId = result;
            } else {
              return;
            }
          }

          if (await gameState.updateState(gameId, "manifest", update)) {
            socket.to(gameId).emit("manifest_update", update);
          }
        } catch (error) {
          console.error("MANIFEST_UPDATE_ERROR", error);
        }
      });

      socket.on("player_pointer", async (playerPointer: Pointer) => {
        try {
          let gameId: string;
          if (_gameId) {
            gameId = _gameId;
          } else {
            const result = gameState.getGameId();
            if (result) {
              gameId = result;
              _gameId = result;
            } else {
              return;
            }
          }

          socket.to(gameId).emit("player_pointer", playerPointer);
        } catch (error) {
          console.error("POINTER_ERROR", error);
        }
      });
    });
  }
}
