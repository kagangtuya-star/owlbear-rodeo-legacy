import { encode, decode } from "@msgpack/msgpack";
import shortid from "shortid";
import { deflate, inflate } from "pako";

export const STREAM_PROTOCOL_VERSION = 1;
export const STREAM_EVENT = "ext_stream";
export const STREAM_CHUNK_EVENT = "ext_stream_chunk";
export const STREAM_DEFAULT_CHUNK_SIZE = 16000;
export const STREAM_DEFAULT_COMPRESS_THRESHOLD = 512;
export const STREAM_CHUNK_TTL_MS = 15000;
export const STREAM_MAX_TOPIC_LENGTH = 128;

export type StreamEncoding = "msgpack" | "json";
export type StreamCompression = "none" | "deflate";

export type StreamChunk = {
  index: number;
  total: number;
};

export type StreamEnvelope = {
  v: number;
  id: string;
  topic: string;
  enc: StreamEncoding;
  comp: StreamCompression;
  size: number;
  ts: number;
  data: Uint8Array;
  chunk?: StreamChunk;
  meta?: Record<string, any>;
  from?: string;
};

export type StreamSendOptions = {
  encoding?: StreamEncoding;
  compressThreshold?: number;
  chunkSize?: number;
  includeSelf?: boolean;
  id?: string;
  meta?: Record<string, any>;
};

export type StreamDecoded = {
  id: string;
  topic: string;
  data: any;
  meta?: Record<string, any>;
  from?: string;
};

const topicRegex = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const isValidStreamTopic = (topic: string) =>
  typeof topic === "string" &&
  topic.length > 0 &&
  topic.length <= STREAM_MAX_TOPIC_LENGTH &&
  topicRegex.test(topic);

const encodeData = (data: any, encoding: StreamEncoding): Uint8Array => {
  if (encoding === "json") {
    return textEncoder.encode(JSON.stringify(data));
  }
  return encode(data);
};
export const decodeData = (data: Uint8Array, encoding: StreamEncoding) => {
  if (encoding === "json") {
    const text = textDecoder.decode(data);
    return JSON.parse(text);
  }
  return decode(data);
};

const coerceUint8Array = (data: unknown): Uint8Array | null => {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (Array.isArray(data)) {
    return Uint8Array.from(data as number[]);
  }
  if (data && typeof data === "object") {
    if ("buffer" in data && (data as any).buffer instanceof ArrayBuffer) {
      return new Uint8Array((data as any).buffer);
    }
    const values = Object.values(data as Record<string, unknown>);
    if (values.length > 0 && values.every(value => typeof value === "number")) {
      return Uint8Array.from(values as number[]);
    }
  }
  return null;
};
export const normalizeIncomingEnvelope = (payload: any): StreamEnvelope | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const {
    v,
    id,
    topic,
    enc,
    comp,
    size,
    ts,
    data,
    chunk,
    meta,
    from,
  } = payload as StreamEnvelope;

  if (v !== STREAM_PROTOCOL_VERSION) {
    return null;
  }
  if (typeof id !== "string" || !isValidStreamTopic(topic)) {
    return null;
  }
  if (enc !== "msgpack" && enc !== "json") {
    return null;
  }
  if (comp !== "none" && comp !== "deflate") {
    return null;
  }
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return null;
  }

  const normalizedData = coerceUint8Array(data);
  if (!normalizedData) {
    return null;
  }

  let normalizedChunk: StreamChunk | undefined;
  if (chunk !== undefined) {
    if (
      typeof chunk !== "object" ||
      typeof chunk.index !== "number" ||
      typeof chunk.total !== "number" ||
      chunk.total <= 0 ||
      chunk.index < 0 ||
      chunk.index >= chunk.total
    ) {
      return null;
    }
    normalizedChunk = { index: chunk.index, total: chunk.total };
  }

  const normalizedMeta =
    meta && typeof meta === "object" ? (meta as Record<string, any>) : undefined;
  const normalizedFrom = typeof from === "string" ? from : undefined;
  const normalizedTs =
    typeof ts === "number" && Number.isFinite(ts) ? ts : Date.now();

  return {
    v,
    id,
    topic,
    enc,
    comp,
    size,
    ts: normalizedTs,
    data: normalizedData,
    chunk: normalizedChunk,
    meta: normalizedMeta,
    from: normalizedFrom,
  };
};
export const buildStreamFrames = (
  topic: string,
  data: any,
  options?: StreamSendOptions
): StreamEnvelope[] => {
  const encoding = options?.encoding ?? "msgpack";
  const id = options?.id ?? shortid.generate();
  const ts = Date.now();
  const raw = encodeData(data, encoding);
  const size = raw.byteLength;
  const compressThreshold =
    options?.compressThreshold ?? STREAM_DEFAULT_COMPRESS_THRESHOLD;
  let comp: StreamCompression = "none";
  let payload = raw;

  if (compressThreshold >= 0 && raw.byteLength >= compressThreshold) {
    payload = deflate(raw);
    comp = "deflate";
  }

  const chunkSize = options?.chunkSize ?? STREAM_DEFAULT_CHUNK_SIZE;
  const meta = options?.includeSelf
    ? { ...(options?.meta || {}), includeSelf: true }
    : options?.meta;

  if (payload.byteLength <= chunkSize) {
    return [
      {
        v: STREAM_PROTOCOL_VERSION,
        id,
        topic,
        enc: encoding,
        comp,
        size,
        ts,
        data: payload,
        meta,
      },
    ];
  }

  const total = Math.ceil(payload.byteLength / chunkSize) || 1;
  const frames: StreamEnvelope[] = [];
  for (let index = 0; index < total; index++) {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, payload.byteLength);
    const slice = payload.slice(start, end);
    frames.push({
      v: STREAM_PROTOCOL_VERSION,
      id,
      topic,
      enc: encoding,
      comp,
      size,
      ts,
      data: slice,
      chunk: { index, total },
      meta,
    });
  }

  return frames;
};
export const decodeStreamEnvelope = (
  envelope: StreamEnvelope,
  dataOverride?: Uint8Array
): StreamDecoded => {
  const payload = dataOverride ?? envelope.data;
  const decompressed = envelope.comp === "deflate" ? inflate(payload) : payload;
  const decoded = decodeData(decompressed, envelope.enc);
  return {
    id: envelope.id,
    topic: envelope.topic,
    data: decoded,
    meta: envelope.meta,
    from: envelope.from,
  };
};
