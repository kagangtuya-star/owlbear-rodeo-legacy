import io, { Socket } from "socket.io-client";
import msgParser from "socket.io-msgpack-parser";
import { EventEmitter } from "events";
import { encode, decode } from "@msgpack/msgpack";
import shortid from "shortid";
import { deflate, inflate } from "pako";

import { omit } from "../helpers/shared";
import AssetTransport from "./AssetTransport";

const MAX_CHUNK_SIZE = 16000;

type RelayChunkPayload = {
  from: string;
  chunkId: string;
  index: number;
  total: number;
  data: Uint8Array;
};

type OutgoingChunkPayload = {
  chunkId: string;
  index: number;
  total: number;
  data: Uint8Array;
};

type IncomingChunk = {
  buffers: (Uint8Array | undefined)[];
  count: number;
  total: number;
};

export type SessionPeer = {
  id: string;
};

export type PeerData = any;

export type PeerReply = (id: string, data: PeerData, chunkId?: string) => void;

export type PeerDataEvent = {
  peer: SessionPeer;
  id: string;
  data: PeerData;
  reply: PeerReply;
};

export type PeerDataProgressEvent = {
  peer: SessionPeer;
  id: string;
  count: number;
  total: number;
  reply: PeerReply;
};

export type SessionStatus =
  | "ready"
  | "joining"
  | "joined"
  | "offline"
  | "reconnecting"
  | "auth"
  | "needs_update";
export type SessionStatusHandler = (status: SessionStatus) => void;

export type PlayerJoinedHandler = (id: string) => void;
export type PlayerLeftHandler = (id: string) => void;
export type GameExpiredHandler = () => void;

class Session extends EventEmitter {
  socket?: Socket;
  private _incomingChunks: Record<string, IncomingChunk>;
  private _gameId: string;
  private _password: string;
  private peers: Record<string, SessionPeer>;
  private assetTransport: AssetTransport;

  constructor() {
    super();
    this._incomingChunks = {};
    this._gameId = "";
    this._password = "";
    this.peers = {};
    this.assetTransport = new AssetTransport({
      getLocalId: () => this.socket?.id,
      sendSignal: (event, payload) => {
        this.socket?.emit(event, payload);
      },
      onPeerData: event => this.emit("peerData", event),
      onPeerDataProgress: event => this.emit("peerDataProgress", event),
      log: (message, payload) => {
        console.info(message, payload);
      },
    });
  }

  get id() {
    return this.socket?.id;
  }

  async connect() {
    try {
      if (
        !process.env.REACT_APP_BROKER_URL ||
        process.env.REACT_APP_MAINTENANCE === "true"
      ) {
        this.emit("status", "offline");
        return;
      }

      this.socket = io(process.env.REACT_APP_BROKER_URL!, {
        withCredentials: true,
        parser: msgParser,
        transports: ["websocket"],
      });

      this.registerSocketHandlers();
      this.emit("status", "ready");
    } catch (error: any) {
      this.emit("status", "offline");
    }
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = undefined;
    this._incomingChunks = {};
    this.peers = {};
    this.assetTransport.dispose();
  }

  joinGame(gameId: string, password: string) {
    if (typeof gameId !== "string" || typeof password !== "string") {
      console.error(
        "Unable to join game: invalid game ID or password",
        gameId,
        password
      );
      return;
    }

    this._gameId = gameId;
    this._password = password;

    this.socket?.emit(
      "join_game",
      gameId,
      password,
      process.env.REACT_APP_VERSION
    );
    this.emit("status", "joining");
  }

  sendTo(sessionId: string, eventId: string, data: PeerData, chunkId?: string) {
    if (!this.socket || !sessionId) {
      return;
    }

    try {
      const message = encode({ id: eventId, data });
      const compressed = deflate(message);
      const id = chunkId || shortid.generate();
      const chunks = this.chunk(compressed, id);

      for (let chunk of chunks) {
        this.socket.emit("relay_chunk", {
          to: sessionId,
          ...chunk,
        });
      }
    } catch (error) {
      console.error("SESSION_SEND_ERROR", error);
    }
  }

  async sendAssetTo(
    sessionId: string,
    eventId: string,
    data: PeerData,
    chunkId?: string,
    options?: { allowRelayFallback?: boolean; timeoutMs?: number }
  ) {
    if (!sessionId) {
      return false;
    }
    const allowRelayFallback = options?.allowRelayFallback !== false;
    if (!this.assetTransport.isAvailable()) {
      this.sendTo(sessionId, eventId, data, chunkId);
      console.info("ASSET_SEND_MODE_RELAY_NO_P2P", {
        sessionId,
        eventId,
        chunkId,
        allowRelayFallback,
      });
      return false;
    }
    console.info("ASSET_SEND_TRY_P2P", { sessionId, eventId, chunkId });
    const sentViaP2P = await this.assetTransport.send(
      sessionId,
      eventId,
      data,
      chunkId,
      { timeoutMs: options?.timeoutMs }
    );
    if (sentViaP2P) {
      console.info("ASSET_SEND_MODE_P2P", { sessionId, eventId, chunkId });
      return true;
    }

    if (allowRelayFallback) {
      this.sendTo(sessionId, eventId, data, chunkId);
      console.info("ASSET_SEND_MODE_RELAY", { sessionId, eventId, chunkId });
      return false;
    }

    console.info("ASSET_SEND_P2P_FAILED_NO_RELAY", {
      sessionId,
      eventId,
      chunkId,
    });
    return sentViaP2P;
  }

  private chunk(data: Uint8Array, chunkId: string): OutgoingChunkPayload[] {
    const size = data.byteLength;
    const total = Math.ceil(size / MAX_CHUNK_SIZE) || 1;
    const chunks: OutgoingChunkPayload[] = [];

    for (let index = 0; index < total; index++) {
      const start = index * MAX_CHUNK_SIZE;
      const end = Math.min(start + MAX_CHUNK_SIZE, size);
      const slice = data.slice(start, end);
      chunks.push({ chunkId, index, total, data: slice });
    }

    return chunks;
  }

  private registerSocketHandlers() {
    if (!this.socket) {
      return;
    }

    this.socket.on("player_joined", this.handlePlayerJoined);
    this.socket.on("player_left", this.handlePlayerLeft);
    this.socket.on("joined_game", this.handleJoinedGame);
    this.socket.on("auth_error", this.handleAuthError);
    this.socket.on("game_expired", this.handleGameExpired);
    this.socket.on("disconnect", this.handleSocketDisconnect);
    this.socket.io.on("reconnect", this.handleSocketReconnect);
    this.socket.on("force_update", this.handleForceUpdate);
    this.socket.on("relay_chunk", this.handleRelayChunk);
    this.socket.on("webrtc_offer", this.handleWebRtcOffer);
    this.socket.on("webrtc_answer", this.handleWebRtcAnswer);
    this.socket.on("webrtc_ice", this.handleWebRtcIce);
  }

  private handlePlayerJoined = (id: string) => {
    this.peers[id] = { id };
    this.emit("playerJoined", id);
  };

  private handlePlayerLeft = (id: string) => {
    if (id in this.peers) {
      this.peers = omit(this.peers, [id]);
    }
    this.assetTransport.removePeer(id);
    this.emit("playerLeft", id);
    this.cleanupIncomingChunks(id);
  };

  private handleJoinedGame = () => {
    this.emit("status", "joined");
  };

  private handleGameExpired = () => {
    this.emit("gameExpired");
  };

  private handleAuthError = () => {
    this.emit("status", "auth");
  };

  private handleForceUpdate = () => {
    this.socket?.disconnect();
    this.emit("status", "needs_update");
  };

  private handleSocketDisconnect = () => {
    this.emit("status", "reconnecting");
    this._incomingChunks = {};
    this.peers = {};
    this.assetTransport.dispose();
  };

  private handleSocketReconnect = () => {
    if (this.socket) {
      this.socket.sendBuffer = [];
    }
    if (this._gameId) {
      this.joinGame(this._gameId, this._password);
    }
  };

  private handleRelayChunk = (payload: RelayChunkPayload) => {
    if (!payload || typeof payload.from !== "string") {
      return;
    }
    const { from, chunkId, index, total } = payload;
    let { data } = payload;

    if (!(data instanceof Uint8Array)) {
      if (Array.isArray(data)) {
        data = Uint8Array.from(data);
      } else if (data && typeof data === "object" && "buffer" in data) {
        data = new Uint8Array((data as any).buffer);
      } else if (data && typeof data === "object") {
        // msgpack may serialize Uint8Array as plain object {0: x, 1: y, ...}
        const values = Object.values(data);
        if (values.length > 0 && values.every(v => typeof v === "number")) {
          data = Uint8Array.from(values as number[]);
        } else {
          return;
        }
      } else {
        return;
      }
    }

    const key = `${from}:${chunkId}`;
    let chunkState = this._incomingChunks[key];
    if (!chunkState || chunkState.total !== total) {
      chunkState = {
        buffers: new Array(total),
        count: 0,
        total,
      };
    }

    if (!chunkState.buffers[index]) {
      chunkState.count += 1;
    }
    chunkState.buffers[index] = data;
    this._incomingChunks[key] = chunkState;

    const reply: PeerReply = (id, replyData, replyChunkId) => {
      this.sendTo(from, id, replyData, replyChunkId);
    };

    this.emit("peerDataProgress", {
      peer: { id: from },
      id: chunkId,
      count: chunkState.count,
      total: chunkState.total,
      reply,
    });

    if (chunkState.count === chunkState.total) {
      try {
        const merged = this.mergeChunks(chunkState.buffers);
        const decompressed = inflate(merged);
        const decoded = decode(decompressed) as { id: string; data: PeerData };
        if (decoded?.id && decoded.id.startsWith("asset")) {
          console.info("ASSET_RECEIVE_MODE_RELAY", {
            sessionId: from,
            eventId: decoded.id,
          });
        }
        this.emit("peerData", {
          peer: { id: from },
          id: decoded.id,
          data: decoded.data,
          reply,
        });
      } catch (error) {
        console.error("SESSION_RELAY_DECODE_ERROR", error);
      } finally {
        delete this._incomingChunks[key];
      }
    }
  };

  private handleWebRtcOffer = (payload: any) => {
    this.assetTransport.handleOffer(payload);
  };

  private handleWebRtcAnswer = (payload: any) => {
    this.assetTransport.handleAnswer(payload);
  };

  private handleWebRtcIce = (payload: any) => {
    this.assetTransport.handleIce(payload);
  };

  private mergeChunks(buffers: (Uint8Array | undefined)[]) {
    const totalLength = buffers.reduce((acc, buf) => {
      if (!buf) {
        return acc;
      }
      return acc + buf.byteLength;
    }, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (let i = 0; i < buffers.length; i++) {
      const buffer = buffers[i];
      if (!buffer) {
        continue;
      }
      merged.set(buffer, offset);
      offset += buffer.byteLength;
    }
    return merged;
  }

  private cleanupIncomingChunks(peerId: string) {
    for (let key of Object.keys(this._incomingChunks)) {
      if (key.startsWith(`${peerId}:`)) {
        delete this._incomingChunks[key];
      }
    }
  }
}

declare interface Session {
  on(event: "peerData", listener: (event: PeerDataEvent) => void): this;
  on(event: "peerDataProgress", listener: (event: PeerDataProgressEvent) => void): this;
  on(event: "status", listener: SessionStatusHandler): this;
  on(event: "playerJoined", listener: PlayerJoinedHandler): this;
  on(event: "playerLeft", listener: PlayerLeftHandler): this;
  on(event: "gameExpired", listener: GameExpiredHandler): this;

  off(event: "peerData", listener: (event: PeerDataEvent) => void): this;
  off(event: "peerDataProgress", listener: (event: PeerDataProgressEvent) => void): this;
  off(event: "status", listener: SessionStatusHandler): this;
  off(event: "playerJoined", listener: PlayerJoinedHandler): this;
  off(event: "playerLeft", listener: PlayerLeftHandler): this;
  off(event: "gameExpired", listener: GameExpiredHandler): this;
}

export default Session;
