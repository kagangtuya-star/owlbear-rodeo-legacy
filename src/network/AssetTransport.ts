import { encode, decode } from "@msgpack/msgpack";
import shortid from "shortid";
import { deflate, inflate } from "pako";

const MAX_CHUNK_SIZE = 16000;
const DEFAULT_CONNECT_TIMEOUT_MS = 7000;
const FAIL_FAST_WINDOW_MS = 60000;

type IncomingChunk = {
  buffers: (Uint8Array | undefined)[];
  count: number;
  total: number;
};

type AssetChunkPayload = {
  chunkId: string;
  index: number;
  total: number;
  data: Uint8Array;
};

type PeerData = any;
type PeerReply = (id: string, data: PeerData, chunkId?: string) => void;

type PeerDataEvent = {
  peer: { id: string };
  id: string;
  data: PeerData;
  reply: PeerReply;
};

type PeerDataProgressEvent = {
  peer: { id: string };
  id: string;
  count: number;
  total: number;
  reply: PeerReply;
};

type AssetTransportOptions = {
  getLocalId: () => string | undefined;
  sendSignal: (event: string, payload: any) => void;
  onPeerData: (event: PeerDataEvent) => void;
  onPeerDataProgress: (event: PeerDataProgressEvent) => void;
  log?: (message: string, payload?: any) => void;
};

type SignalOfferPayload = {
  from: string;
  sdp: RTCSessionDescriptionInit;
};

type SignalAnswerPayload = {
  from: string;
  sdp: RTCSessionDescriptionInit;
};

type SignalIcePayload = {
  from: string;
  candidate: RTCIceCandidateInit;
};

type PeerState = {
  id: string;
  pc: RTCPeerConnection;
  channel?: RTCDataChannel;
  isInitiator: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  readyPromise?: Promise<boolean>;
  readyResolve?: (ready: boolean) => void;
  lastFailureAt?: number;
};

export default class AssetTransport {
  private options: AssetTransportOptions;
  private peers: Record<string, PeerState>;
  private incomingChunks: Record<string, IncomingChunk>;
  private iceServers: RTCIceServer[] | null;
  private icePromise?: Promise<RTCIceServer[]>;
  private webrtcUnavailable: boolean;

  constructor(options: AssetTransportOptions) {
    this.options = options;
    this.peers = {};
    this.incomingChunks = {};
    this.iceServers = null;
    this.webrtcUnavailable = false;
  }

  isAvailable() {
    if (this.webrtcUnavailable) {
      return false;
    }
    if (typeof RTCPeerConnection === "undefined") {
      this.markWebRtcUnavailable("missing_rtcpeerconnection");
      return false;
    }
    return true;
  }

  async send(
    peerId: string,
    eventId: string,
    data: PeerData,
    chunkId?: string,
    options?: { timeoutMs?: number }
  ): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    const peer = await this.ensurePeer(peerId, "initiator");
    if (!peer) {
      return false;
    }

    if (peer.lastFailureAt && Date.now() - peer.lastFailureAt < FAIL_FAST_WINDOW_MS) {
      return false;
    }

    const ready = await this.waitForChannel(peer, options?.timeoutMs);
    if (!ready || !peer.channel) {
      peer.lastFailureAt = Date.now();
      return false;
    }

    try {
      this.sendChunks(peer, eventId, data, chunkId);
      return true;
    } catch (error) {
      peer.lastFailureAt = Date.now();
      this.options.log?.("P2P_ASSET_SEND_ERROR", error);
      return false;
    }
  }

  handleOffer(payload: SignalOfferPayload) {
    if (!this.isAvailable()) {
      return;
    }
    if (!payload || typeof payload.from !== "string" || !payload.sdp) {
      return;
    }
    void this.acceptOffer(payload.from, payload.sdp);
  }

  handleAnswer(payload: SignalAnswerPayload) {
    if (!this.isAvailable()) {
      return;
    }
    if (!payload || typeof payload.from !== "string" || !payload.sdp) {
      return;
    }
    void this.acceptAnswer(payload.from, payload.sdp);
  }

  handleIce(payload: SignalIcePayload) {
    if (!this.isAvailable()) {
      return;
    }
    if (!payload || typeof payload.from !== "string" || !payload.candidate) {
      return;
    }
    void this.acceptIce(payload.from, payload.candidate);
  }

  removePeer(peerId: string) {
    const peer = this.peers[peerId];
    if (!peer) {
      return;
    }
    peer.channel?.close();
    peer.pc.close();
    delete this.peers[peerId];
    this.cleanupIncomingChunks(peerId);
  }

  dispose() {
    Object.keys(this.peers).forEach(peerId => this.removePeer(peerId));
    this.incomingChunks = {};
  }

  private async ensurePeer(peerId: string, role?: "initiator" | "answerer") {
    if (!this.isAvailable()) {
      return;
    }
    if (this.peers[peerId]) {
      return this.peers[peerId];
    }

    const iceServers = await this.loadIceServers();
    let pc: RTCPeerConnection;
    try {
      pc = new RTCPeerConnection({ iceServers });
    } catch (error) {
      this.markWebRtcUnavailable("rtcpeerconnection_create_failed", error);
      return;
    }
    const localId = this.options.getLocalId();
    const isInitiator =
      role === "initiator"
        ? true
        : role === "answerer"
        ? false
        : localId
        ? localId < peerId
        : true;
    const peer: PeerState = {
      id: peerId,
      pc,
      isInitiator,
      pendingCandidates: [],
    };

    pc.onicecandidate = event => {
      if (!event.candidate) {
        this.options.log?.("P2P_ICE_CANDIDATE_END", { peerId });
        return;
      }
      const localCandidateType =
        "type" in event.candidate ? (event.candidate as any).type : "unknown";
      this.options.log?.("P2P_ICE_CANDIDATE_LOCAL", {
        peerId,
        candidateType: localCandidateType,
      });
      this.options.sendSignal("webrtc_ice", {
        to: peerId,
        candidate: event.candidate,
      });
    };

    pc.onconnectionstatechange = () => {
      this.options.log?.("P2P_CONN_STATE", {
        peerId,
        state: pc.connectionState,
      });
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.options.log?.("P2P_ASSET_CONN_CLOSED", {
          peerId,
          state: pc.connectionState,
        });
        this.removePeer(peerId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      this.options.log?.("P2P_ICE_STATE", {
        peerId,
        state: pc.iceConnectionState,
      });
    };

    pc.onicegatheringstatechange = () => {
      this.options.log?.("P2P_ICE_GATHERING_STATE", {
        peerId,
        state: pc.iceGatheringState,
      });
    };

    pc.onicecandidateerror = (event: any) => {
      this.options.log?.("P2P_ICE_CANDIDATE_ERROR", {
        peerId,
        errorCode: event?.errorCode,
        errorText: event?.errorText,
        url: event?.url,
      });
    };

    if (isInitiator) {
      const channel = pc.createDataChannel("assets");
      this.attachChannel(peer, channel);
      void this.createOffer(peer);
    } else {
      pc.ondatachannel = event => {
        this.attachChannel(peer, event.channel);
      };
    }

    this.peers[peerId] = peer;
    return peer;
  }

  private attachChannel(peer: PeerState, channel: RTCDataChannel) {
    peer.channel = channel;
    channel.binaryType = "arraybuffer";
    channel.onopen = () => {
      this.options.log?.("P2P_CHANNEL_OPEN", { peerId: peer.id });
      peer.readyResolve?.(true);
    };
    channel.onclose = () => {
      this.options.log?.("P2P_CHANNEL_CLOSE", { peerId: peer.id });
      peer.readyResolve?.(false);
    };
    channel.onerror = () => {
      this.options.log?.("P2P_CHANNEL_ERROR", { peerId: peer.id });
      peer.readyResolve?.(false);
    };
    channel.onmessage = event => {
      void this.handleChannelMessage(peer.id, event.data);
    };
  }

  private async createOffer(peer: PeerState) {
    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      if (peer.pc.localDescription) {
        this.options.log?.("P2P_SIGNAL_OFFER_LOCAL", { peerId: peer.id });
        this.options.sendSignal("webrtc_offer", {
          to: peer.id,
          sdp: peer.pc.localDescription,
        });
      }
    } catch (error) {
      this.options.log?.("P2P_ASSET_OFFER_ERROR", error);
    }
  }

  private async acceptOffer(peerId: string, sdp: RTCSessionDescriptionInit) {
    const peer = await this.ensurePeer(peerId, "answerer");
    if (!peer || peer.isInitiator) {
      return;
    }
    try {
      this.options.log?.("P2P_SIGNAL_OFFER_REMOTE", { peerId });
      await peer.pc.setRemoteDescription(sdp);
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      if (peer.pc.localDescription) {
        this.options.log?.("P2P_SIGNAL_ANSWER_LOCAL", { peerId });
        this.options.sendSignal("webrtc_answer", {
          to: peerId,
          sdp: peer.pc.localDescription,
        });
      }
      await this.flushPendingIce(peer);
    } catch (error) {
      this.options.log?.("P2P_ASSET_ACCEPT_OFFER_ERROR", error);
    }
  }

  private async acceptAnswer(peerId: string, sdp: RTCSessionDescriptionInit) {
    const peer = this.peers[peerId];
    if (!peer || !peer.isInitiator) {
      return;
    }
    try {
      this.options.log?.("P2P_SIGNAL_ANSWER_REMOTE", { peerId });
      await peer.pc.setRemoteDescription(sdp);
      await this.flushPendingIce(peer);
    } catch (error) {
      this.options.log?.("P2P_ASSET_ACCEPT_ANSWER_ERROR", error);
    }
  }

  private async acceptIce(peerId: string, candidate: RTCIceCandidateInit) {
    const peer = this.peers[peerId];
    if (!peer) {
      return;
    }
    const remoteCandidateType =
      candidate && "type" in candidate ? (candidate as any).type : "unknown";
    this.options.log?.("P2P_ICE_CANDIDATE_REMOTE", {
      peerId,
      candidateType: remoteCandidateType,
    });
    if (!peer.pc.remoteDescription) {
      peer.pendingCandidates.push(candidate);
      return;
    }
    try {
      await peer.pc.addIceCandidate(candidate);
    } catch (error) {
      this.options.log?.("P2P_ASSET_ADD_ICE_ERROR", error);
    }
  }

  private async flushPendingIce(peer: PeerState) {
    if (!peer.pendingCandidates.length) {
      return;
    }
    const candidates = [...peer.pendingCandidates];
    peer.pendingCandidates = [];
    for (const candidate of candidates) {
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch (error) {
        this.options.log?.("P2P_ASSET_PENDING_ICE_ERROR", error);
      }
    }
  }

  private async waitForChannel(
    peer: PeerState,
    timeoutMs = DEFAULT_CONNECT_TIMEOUT_MS
  ) {
    if (peer.channel?.readyState === "open") {
      return true;
    }
    if (!peer.readyPromise) {
      peer.readyPromise = new Promise(resolve => {
        peer.readyResolve = resolve;
      });
    }
    const timeout = new Promise<boolean>(resolve => {
      setTimeout(() => resolve(false), timeoutMs);
    });
    return Promise.race([peer.readyPromise, timeout]);
  }

  private sendChunks(
    peer: PeerState,
    eventId: string,
    data: PeerData,
    chunkId?: string
  ) {
    const message = encode({ id: eventId, data });
    const compressed = deflate(message);
    const id = chunkId || shortid.generate();
    const chunks = this.chunk(compressed, id);
    for (const chunk of chunks) {
      const payload: AssetChunkPayload = {
        chunkId: chunk.chunkId,
        index: chunk.index,
        total: chunk.total,
        data: chunk.data,
      };
      const encoded = encode(payload);
      peer.channel?.send(encoded);
    }
  }

  private chunk(data: Uint8Array, chunkId: string) {
    const size = data.byteLength;
    const total = Math.ceil(size / MAX_CHUNK_SIZE) || 1;
    const chunks: AssetChunkPayload[] = [];

    for (let index = 0; index < total; index++) {
      const start = index * MAX_CHUNK_SIZE;
      const end = Math.min(start + MAX_CHUNK_SIZE, size);
      const slice = data.slice(start, end);
      chunks.push({ chunkId, index, total, data: slice });
    }

    return chunks;
  }

  private async handleChannelMessage(peerId: string, payload: any) {
    const data = await this.normalizePayload(payload);
    if (!data) {
      return;
    }
    let decoded: AssetChunkPayload;
    try {
      decoded = decode(data) as AssetChunkPayload;
    } catch (error) {
      this.options.log?.("P2P_ASSET_DECODE_ERROR", error);
      return;
    }

    if (!decoded || typeof decoded.chunkId !== "string") {
      return;
    }

    const { chunkId, index, total } = decoded;
    const key = `${peerId}:${chunkId}`;
    let chunkState = this.incomingChunks[key];
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
    chunkState.buffers[index] = decoded.data;
    this.incomingChunks[key] = chunkState;

    const reply: PeerReply = (id, replyData, replyChunkId) => {
      void this.send(peerId, id, replyData, replyChunkId);
    };

    this.options.onPeerDataProgress({
      peer: { id: peerId },
      id: chunkId,
      count: chunkState.count,
      total: chunkState.total,
      reply,
    });

    if (chunkState.count === chunkState.total) {
      try {
        const merged = this.mergeChunks(chunkState.buffers);
        const decompressed = inflate(merged);
        const message = decode(decompressed) as { id: string; data: PeerData };
        this.options.log?.("ASSET_RECEIVE_MODE_P2P", {
          sessionId: peerId,
          eventId: message.id,
        });
        this.options.onPeerData({
          peer: { id: peerId },
          id: message.id,
          data: message.data,
          reply,
        });
      } catch (error) {
        this.options.log?.("P2P_ASSET_MESSAGE_ERROR", error);
      } finally {
        delete this.incomingChunks[key];
      }
    }
  }

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
    for (const key of Object.keys(this.incomingChunks)) {
      if (key.startsWith(`${peerId}:`)) {
        delete this.incomingChunks[key];
      }
    }
  }

  private async normalizePayload(payload: any): Promise<Uint8Array | null> {
    if (!payload) {
      return null;
    }
    if (payload instanceof ArrayBuffer) {
      return new Uint8Array(payload);
    }
    if (payload instanceof Uint8Array) {
      return payload;
    }
    if (payload instanceof Blob) {
      return new Uint8Array(await payload.arrayBuffer());
    }
    return null;
  }

  private async loadIceServers() {
    if (this.iceServers) {
      return this.iceServers;
    }
    if (!this.icePromise) {
      this.icePromise = this.fetchIceServers();
    }
    this.iceServers = await this.icePromise;
    this.options.log?.("P2P_ICE_SERVERS", {
      servers: this.iceServers,
    });
    return this.iceServers;
  }

  private async fetchIceServers(): Promise<RTCIceServer[]> {
    const brokerUrl = process.env.REACT_APP_BROKER_URL;
    if (!brokerUrl) {
      this.options.log?.("P2P_ICE_FETCH_SKIP", { reason: "missing_broker_url" });
      return [];
    }
    try {
      const base = brokerUrl.replace(/\/$/, "");
      const response = await fetch(`${base}/iceservers`, { credentials: "omit" });
      if (!response.ok) {
        this.options.log?.("P2P_ICE_FETCH_ERROR", {
          status: response.status,
        });
        return [];
      }
      const data = await response.json();
      const iceServers = Array.isArray(data?.iceServers) ? data.iceServers : [];
      this.options.log?.("P2P_ICE_FETCH_OK", { count: iceServers.length });
      return iceServers;
    } catch (error) {
      this.options.log?.("P2P_ASSET_ICE_FETCH_ERROR", error);
      return [];
    }
  }

  private markWebRtcUnavailable(reason: string, error?: unknown) {
    if (this.webrtcUnavailable) {
      return;
    }
    this.webrtcUnavailable = true;
    if (error) {
      this.options.log?.("P2P_UNAVAILABLE", { reason, error });
      return;
    }
    this.options.log?.("P2P_UNAVAILABLE", { reason });
  }
}
