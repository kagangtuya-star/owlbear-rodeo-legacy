import { TokenNoteStyle } from "../types/TokenNote";

export const TOKEN_NOTE_LOCK_TOPIC_PREFIX = "ext.token_notes";

export const TOKEN_NOTE_LOCK_TOPICS = {
  lockRequest: "ext.token_notes.lock.request",
  lockGranted: "ext.token_notes.lock.granted",
  lockDenied: "ext.token_notes.lock.denied",
  lockTouch: "ext.token_notes.lock.touch",
  lockReleased: "ext.token_notes.lock.released",
  unlock: "ext.token_notes.unlock",
} as const;

export type TokenNoteLockTopic =
  typeof TOKEN_NOTE_LOCK_TOPICS[keyof typeof TOKEN_NOTE_LOCK_TOPICS];

export type TokenNoteLockReleaseReason = "timeout" | "disconnect" | "owner";

export type TokenNoteLockBasePayload = {
  mapId: string;
  tokenStateId: string;
  userId: string;
  ts: number;
};
export type TokenNoteLockRequestPayload = TokenNoteLockBasePayload & {
  clientLockId: string;
};

export type TokenNoteLockGrantedPayload = TokenNoteLockBasePayload & {
  lockId: string;
  expiresAt: number;
};

export type TokenNoteLockDeniedPayload = {
  mapId: string;
  tokenStateId: string;
  ownerUserId: string;
  lockId: string;
  expiresAt: number;
  ts: number;
};

export type TokenNoteLockTouchPayload = TokenNoteLockBasePayload & {
  lockId: string;
};
export type TokenNoteLockReleasedPayload = TokenNoteLockBasePayload & {
  lockId: string;
  reason: TokenNoteLockReleaseReason;
};

export type TokenNoteUnlockPayload = TokenNoteLockBasePayload & {
  lockId: string;
  content: string;
  style: TokenNoteStyle;
  lastEditedAt: number;
};
