import { useCallback, useEffect, useRef } from "react";
import shortid from "shortid";

import Session from "../network/Session";
import { MapState } from "../types/MapState";
import { TokenAttributeState } from "../types/TokenState";
import { SetNetworkedState } from "./useNetworkedState";

type TokenAttributePatch = {
  attributes?: TokenAttributeState | null;
};

type TokenAttributeUpdatePayload = {
  mapId: string;
  tokenStateId: string;
  version: number;
  updatedAt: number;
  updatedBy: string;
  patch: TokenAttributePatch;
  changeId: string;
};

type TokenAttributeBulkPayload = {
  mapId: string;
  updates: TokenAttributeUpdatePayload[];
  changeId: string;
};

type TokenAttributeUpdateInput = Omit<TokenAttributeUpdatePayload, "changeId" | "mapId">;

type TokenAttributeBulkInput = {
  updates: TokenAttributeUpdateInput[];
};

const TOKEN_ATTR_TOPICS = {
  update: "ext.token_attrs.update",
  bulk: "ext.token_attrs.bulk",
};

const LOG_TOKEN_ATTR_STREAM_WARNINGS = false;

const CHANGE_ID_TTL_MS = 2 * 60 * 1000;
const MAX_SEEN_CHANGE_IDS = 500;
const MAX_ATTRIBUTE_ITEMS = 12;
const MAX_LABEL_LENGTH = 32;
const MAX_ID_LENGTH = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidVisibility(value: unknown): value is "public" | "private" {
  return value === "public" || value === "private";
}

function isValidString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isValidLabel(value: unknown, maxLength: number) {
  return typeof value === "string" && value.length <= maxLength;
}

function isValidBar(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const { id, label, current, min, max, color, showMinMax, visibility } = value;
  if (!isValidString(id, MAX_ID_LENGTH)) {
    return false;
  }
  if (!isValidLabel(label, MAX_LABEL_LENGTH)) {
    return false;
  }
  if (!isFiniteNumber(current)) {
    return false;
  }
  if (min !== undefined && !isFiniteNumber(min)) {
    return false;
  }
  if (max !== undefined && !isFiniteNumber(max)) {
    return false;
  }
  if (typeof color !== "string" || color.length === 0) {
    return false;
  }
  if (showMinMax !== undefined && typeof showMinMax !== "boolean") {
    return false;
  }
  if (visibility !== undefined && !isValidVisibility(visibility)) {
    return false;
  }
  return true;
}

function isValidValue(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const { id, label, value: rawValue, visibility, color } = value;
  if (!isValidString(id, MAX_ID_LENGTH)) {
    return false;
  }
  if (!isValidLabel(label, MAX_LABEL_LENGTH)) {
    return false;
  }
  if (typeof rawValue !== "number" && typeof rawValue !== "string") {
    return false;
  }
  if (color !== undefined && color !== null && typeof color !== "string") {
    return false;
  }
  if (visibility !== undefined && !isValidVisibility(visibility)) {
    return false;
  }
  return true;
}

function isValidAttributeState(value: unknown): value is TokenAttributeState {
  if (!isRecord(value)) {
    return false;
  }
  const { bars, values, version, updatedAt, updatedBy } = value;
  if (!Array.isArray(bars) || !Array.isArray(values)) {
    return false;
  }
  if (bars.length > MAX_ATTRIBUTE_ITEMS || values.length > MAX_ATTRIBUTE_ITEMS) {
    return false;
  }
  if (!bars.every(isValidBar) || !values.every(isValidValue)) {
    return false;
  }
  if (!isFiniteNumber(version) || !isFiniteNumber(updatedAt)) {
    return false;
  }
  if (!isValidString(updatedBy, MAX_ID_LENGTH)) {
    return false;
  }
  return true;
}

function isValidPatch(value: unknown): value is TokenAttributePatch {
  if (!isRecord(value)) {
    return false;
  }
  if (!("attributes" in value)) {
    return false;
  }
  const { attributes } = value as { attributes?: unknown };
  if (attributes === null || attributes === undefined) {
    return true;
  }
  return isValidAttributeState(attributes);
}

function shouldAcceptUpdate(
  incoming: TokenAttributeUpdatePayload,
  current?: TokenAttributeState
) {
  if (!current) {
    return true;
  }
  if (incoming.version > current.version) {
    return true;
  }
  if (incoming.version === current.version && incoming.updatedAt > current.updatedAt) {
    return true;
  }
  return false;
}

function pruneSeenChangeIds(seen: Map<string, number>) {
  const now = Date.now();
  for (const [key, timestamp] of seen) {
    if (now - timestamp > CHANGE_ID_TTL_MS) {
      seen.delete(key);
    }
  }
  if (seen.size <= MAX_SEEN_CHANGE_IDS) {
    return;
  }
  const entries = [...seen.entries()].sort((a, b) => a[1] - b[1]);
  const excess = entries.length - MAX_SEEN_CHANGE_IDS;
  for (let i = 0; i < excess; i++) {
    seen.delete(entries[i][0]);
  }
}

function normalizeIncomingUpdate(payload: unknown): TokenAttributeUpdatePayload | null {
  if (!isRecord(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const mapId = record.mapId;
  const tokenStateId = record.tokenStateId;
  const version = record.version;
  const updatedAt = record.updatedAt;
  const updatedBy = record.updatedBy;
  const patch = record.patch;
  const changeId = record.changeId;
  if (!isValidString(mapId, MAX_ID_LENGTH) || !isValidString(tokenStateId, MAX_ID_LENGTH)) {
    return null;
  }
  if (!isFiniteNumber(version) || !isFiniteNumber(updatedAt)) {
    return null;
  }
  if (!isValidString(updatedBy, MAX_ID_LENGTH)) {
    return null;
  }
  if (!isValidString(changeId, MAX_ID_LENGTH)) {
    return null;
  }
  if (!isValidPatch(patch)) {
    return null;
  }
  return {
    mapId: mapId as string,
    tokenStateId: tokenStateId as string,
    version: version as number,
    updatedAt: updatedAt as number,
    updatedBy: updatedBy as string,
    patch: patch as TokenAttributePatch,
    changeId: changeId as string,
  };
}

function normalizeIncomingBulk(payload: unknown): TokenAttributeBulkPayload | null {
  if (!isRecord(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const mapId = record.mapId;
  const updates = record.updates;
  const changeId = record.changeId;
  if (!isValidString(mapId, MAX_ID_LENGTH) || !isValidString(changeId, MAX_ID_LENGTH)) {
    return null;
  }
  if (!Array.isArray(updates) || updates.length === 0) {
    return null;
  }
  const normalizedUpdates: TokenAttributeUpdatePayload[] = [];
  for (const update of updates) {
    const normalized = normalizeIncomingUpdate(update);
    if (!normalized || normalized.mapId !== mapId) {
      return null;
    }
    normalizedUpdates.push(normalized);
  }
  return {
    mapId: mapId as string,
    updates: normalizedUpdates,
    changeId: changeId as string,
  };
}

function applyUpdateToState(
  state: MapState | null,
  update: TokenAttributeUpdatePayload
): MapState | null {
  if (!state || state.mapId !== update.mapId) {
    return state;
  }
  const token = state.tokens[update.tokenStateId];
  if (!token) {
    return state;
  }
  if (!shouldAcceptUpdate(update, token.attributes)) {
    return state;
  }
  if (!update.patch || !("attributes" in update.patch)) {
    return state;
  }
  const incomingAttributes = update.patch.attributes;
  const nextAttributes = incomingAttributes ?? undefined;
  return {
    ...state,
    tokens: {
      ...state.tokens,
      [update.tokenStateId]: {
        ...token,
        attributes: nextAttributes,
      },
    },
  };
}

function useTokenAttributesSync(
  session: Session,
  mapState: MapState | null,
  setCurrentMapState: SetNetworkedState<MapState | null>
) {
  const mapStateRef = useRef<MapState | null>(mapState);
  useEffect(() => {
    mapStateRef.current = mapState;
  }, [mapState]);

  const seenChangeIdsRef = useRef<Map<string, number>>(new Map());

  const registerChangeId = useCallback((changeId: string) => {
    if (!changeId) {
      return;
    }
    seenChangeIdsRef.current.set(changeId, Date.now());
    pruneSeenChangeIds(seenChangeIdsRef.current);
  }, []);

  const isChangeIdSeen = useCallback((changeId: string) => {
    if (!changeId) {
      return false;
    }
    return seenChangeIdsRef.current.has(changeId);
  }, []);

  const sendTokenAttributesUpdate = useCallback(
    (input: TokenAttributeUpdateInput, changeId?: string) => {
      const mapId = mapStateRef.current?.mapId;
      if (!mapId) {
        return;
      }
      const id = changeId || shortid.generate();
      registerChangeId(id);
      session.sendStream(
        TOKEN_ATTR_TOPICS.update,
        {
          mapId,
          ...input,
          changeId: id,
        },
        { includeSelf: true }
      );
    },
    [registerChangeId, session]
  );

  const sendTokenAttributesBulk = useCallback(
    (input: TokenAttributeBulkInput, changeId?: string) => {
      const mapId = mapStateRef.current?.mapId;
      if (!mapId || input.updates.length === 0) {
        return;
      }
      const id = changeId || shortid.generate();
      registerChangeId(id);
      session.sendStream(
        TOKEN_ATTR_TOPICS.bulk,
        {
          mapId,
          updates: input.updates.map((update) => ({
            ...update,
            mapId,
            changeId: id,
          })),
          changeId: id,
        },
        { includeSelf: true }
      );
    },
    [registerChangeId, session]
  );

  useEffect(() => {
    function handleUpdate(payload: unknown) {
      const normalized = normalizeIncomingUpdate(payload);
      if (!normalized) {
        if (LOG_TOKEN_ATTR_STREAM_WARNINGS) {
          console.warn("TOKEN_ATTR_STREAM_INVALID", payload);
        }
        return;
      }
      if (isChangeIdSeen(normalized.changeId)) {
        return;
      }
      registerChangeId(normalized.changeId);
      setCurrentMapState(
        (prev) => applyUpdateToState(prev, normalized),
        false
      );
      console.info("TOKEN_ATTR_STREAM_APPLY", {
        tokenStateId: normalized.tokenStateId,
        mapId: normalized.mapId,
        changeId: normalized.changeId,
      });
    }

    function handleBulk(payload: unknown) {
      const normalized = normalizeIncomingBulk(payload);
      if (!normalized) {
        if (LOG_TOKEN_ATTR_STREAM_WARNINGS) {
          console.warn("TOKEN_ATTR_STREAM_BULK_INVALID", payload);
        }
        return;
      }
      if (isChangeIdSeen(normalized.changeId)) {
        return;
      }
      registerChangeId(normalized.changeId);
      setCurrentMapState(
        (prev) => {
          let nextState = prev;
          for (const update of normalized.updates) {
            nextState = applyUpdateToState(nextState, update);
          }
          return nextState;
        },
        false
      );
      console.info("TOKEN_ATTR_STREAM_BULK_APPLY", {
        count: normalized.updates.length,
        mapId: normalized.mapId,
        changeId: normalized.changeId,
      });
    }

    session.onStream(TOKEN_ATTR_TOPICS.update, handleUpdate);
    session.onStream(TOKEN_ATTR_TOPICS.bulk, handleBulk);
    return () => {
      session.off(`stream:${TOKEN_ATTR_TOPICS.update}`, handleUpdate);
      session.off(`stream:${TOKEN_ATTR_TOPICS.bulk}`, handleBulk);
    };
  }, [isChangeIdSeen, registerChangeId, session, setCurrentMapState]);

  return {
    sendTokenAttributesUpdate,
    sendTokenAttributesBulk,
  };
}

export type { TokenAttributeUpdateInput, TokenAttributeBulkInput, TokenAttributePatch };
export default useTokenAttributesSync;
