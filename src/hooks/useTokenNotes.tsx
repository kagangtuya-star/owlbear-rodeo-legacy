import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useToasts } from "react-toast-notifications";
import Konva from "konva";
import shortid from "shortid";

import { Map } from "../types/Map";
import { MapState } from "../types/MapState";
import { TokenNote, TokenNoteStyle } from "../types/TokenNote";
import { TokenNoteSettings } from "../types/Settings";
import {
  TokenNoteChangeEventHandler,
  TokenNoteCreateEventHandler,
  TokenNoteRemoveEventHandler,
} from "../types/Events";
import Session, { StreamEventHandler } from "../network/Session";
import {
  TOKEN_NOTE_LOCK_TOPICS,
  TokenNoteLockDeniedPayload,
  TokenNoteLockGrantedPayload,
  TokenNoteLockReleasedPayload,
  TokenNoteLockReleaseReason,
  TokenNoteLockRequestPayload,
  TokenNoteLockTouchPayload,
  TokenNoteUnlockPayload,
} from "../network/TokenNoteLockProtocol";

import { useUserId } from "../contexts/UserIdContext";
import { useTokenData } from "../contexts/TokenDataContext";

import TokenNoteSheet from "../components/token/TokenNoteSheet";
import TokenNotePopover from "../components/token/TokenNotePopover";

type TokenNoteOpenMode = "sheet" | "popover";

type TokenNoteOpenOptions = {
  mode?: TokenNoteOpenMode;
  anchor?: Konva.Node | null;
};

type TokenNoteHook = {
  tokenNoteSheet: ReactNode;
  tokenNotePopover: ReactNode;
  openTokenNote: (tokenStateId: string, options?: TokenNoteOpenOptions) => void;
};

const LOCK_TTL_MS = 30000;
const LOCK_TOUCH_INTERVAL_MS = 10000;
const LOCK_REQUEST_COOLDOWN_MS = 1000;

type TokenNoteLockState = {
  tokenStateId: string;
  ownerUserId: string;
  lockId: string;
  expiresAt: number;
  lastTouchAt: number;
};

function useTokenNotes(
  map: Map | null,
  mapState: MapState | null,
  session: Session,
  onTokenNoteCreate: TokenNoteCreateEventHandler,
  onTokenNoteChange: TokenNoteChangeEventHandler,
  onTokenNoteRemove: TokenNoteRemoveEventHandler,
  settings: TokenNoteSettings
): TokenNoteHook {
  const { addToast } = useToasts();
  const userId = useUserId();
  const { tokensById } = useTokenData();

  const [lockState, setLockState] = useState<TokenNoteLockState | null>(null);
  const [lockReleaseReason, setLockReleaseReason] =
    useState<TokenNoteLockReleaseReason | null>(null);
  const lockStateRef = useRef<TokenNoteLockState | null>(null);
  const openTokenStateIdRef = useRef<string | null>(null);
  const mapIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const noteRef = useRef<TokenNote | undefined>(undefined);
  const canEditRef = useRef<boolean>(false);
  const draftContentRef = useRef<string>("");
  const draftStyleRef = useRef<TokenNoteStyle>({
    fontFamily: settings.defaultFont,
  });
  const lastActivityRef = useRef<number>(0);
  const lockRequestAtRef = useRef<number>(0);
  const lockExpiryTimeoutRef = useRef<number | null>(null);
  const inactivityTimeoutRef = useRef<number | null>(null);
  const touchIntervalRef = useRef<number | null>(null);
  const releaseLockRef = useRef<(reason: TokenNoteLockReleaseReason) => void>(() => {});
  const previousOpenTokenStateIdRef = useRef<string | null>(null);

  const [openTokenStateId, setOpenTokenStateId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [openMode, setOpenMode] = useState<TokenNoteOpenMode | null>(null);
  const [anchorNode, setAnchorNode] = useState<Konva.Node | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [draftStyle, setDraftStyle] = useState<TokenNoteStyle>({
    fontFamily: settings.defaultFont,
  });
  const createdRef = useRef<Record<string, boolean>>({});
  const lastRemoteEditRef = useRef<number>(0);
  const tokenState = openTokenStateId
    ? mapState?.tokens[openTokenStateId]
    : undefined;
  const token = tokenState ? tokensById[tokenState.tokenId] : undefined;
  const note = openTokenStateId ? mapState?.tokenNotes?.[openTokenStateId] : undefined;

  const isMapOwner = !!userId && map?.owner === userId;
  const isTokenOwner = !!userId && tokenState?.owner === userId;
  const noteOwners = note?.permissions?.owners || [];
  const isExplicitOwner = !!userId && noteOwners.includes(userId);
  const defaultPermission = note?.permissions?.default || settings.defaultPermission;
  const canEdit =
    !!userId &&
    (isMapOwner || isTokenOwner || isExplicitOwner || defaultPermission === "write");
  const canRead = !!userId && (canEdit || defaultPermission !== "none");
  const isLockOwner = !!userId && lockState?.ownerUserId === userId;
  const isEditingActive = isEditing && isLockOwner;

  useEffect(() => {
    openTokenStateIdRef.current = openTokenStateId;
  }, [openTokenStateId]);

  useEffect(() => {
    mapIdRef.current = map?.id || null;
  }, [map?.id]);

  useEffect(() => {
    userIdRef.current = userId || null;
  }, [userId]);

  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  useEffect(() => {
    lockStateRef.current = lockState;
  }, [lockState]);

  useEffect(() => {
    draftContentRef.current = draftContent;
  }, [draftContent]);

  useEffect(() => {
    draftStyleRef.current = draftStyle;
  }, [draftStyle]);

  const isStyleEqual = useCallback(
    (left: TokenNoteStyle, right?: TokenNoteStyle) =>
      !!right &&
      left.fontFamily === right.fontFamily &&
      left.backgroundColor === right.backgroundColor,
    []
  );

  const clearLockTimers = useCallback(() => {
    if (lockExpiryTimeoutRef.current) {
      window.clearTimeout(lockExpiryTimeoutRef.current);
      lockExpiryTimeoutRef.current = null;
    }
    if (inactivityTimeoutRef.current) {
      window.clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = null;
    }
    if (touchIntervalRef.current) {
      window.clearInterval(touchIntervalRef.current);
      touchIntervalRef.current = null;
    }
  }, []);

  const scheduleLockExpiry = useCallback(
    (expiresAt: number) => {
      if (lockExpiryTimeoutRef.current) {
        window.clearTimeout(lockExpiryTimeoutRef.current);
      }
      const delay = Math.max(0, expiresAt - Date.now());
      lockExpiryTimeoutRef.current = window.setTimeout(() => {
        const current = lockStateRef.current;
        const now = Date.now();
        if (!current || current.expiresAt > now) {
          return;
        }
        if (current.ownerUserId === userIdRef.current) {
          releaseLockRef.current("timeout");
          return;
        }
        setLockReleaseReason("timeout");
        setLockState(null);
        setIsEditing(false);
      }, delay + 25);
    },
    []
  );

  const emitStream = useCallback(
    (topic: string, payload: any, includeSelf = true) => {
      session.sendStream(topic, payload, { includeSelf });
    },
    [session]
  );

  const emitLockRequest = useCallback(() => {
    const mapId = mapIdRef.current;
    const tokenStateId = openTokenStateIdRef.current;
    const currentUserId = userIdRef.current;
    if (!mapId || !tokenStateId || !currentUserId || !canEditRef.current) {
      return;
    }
    const now = Date.now();
    if (now - lockRequestAtRef.current < LOCK_REQUEST_COOLDOWN_MS) {
      return;
    }
    const current = lockStateRef.current;
    if (current && current.tokenStateId === tokenStateId && current.expiresAt > now) {
      return;
    }
    lockRequestAtRef.current = now;
    const clientLockId = shortid();
    const payload: TokenNoteLockRequestPayload = {
      mapId,
      tokenStateId,
      userId: currentUserId,
      ts: now,
      clientLockId,
    };
    emitStream(TOKEN_NOTE_LOCK_TOPICS.lockRequest, payload, true);
  }, [emitStream]);

  const emitLockGranted = useCallback(
    (payload: TokenNoteLockGrantedPayload) => {
      emitStream(TOKEN_NOTE_LOCK_TOPICS.lockGranted, payload, true);
    },
    [emitStream]
  );

  const emitLockDenied = useCallback(
    (payload: TokenNoteLockDeniedPayload) => {
      emitStream(TOKEN_NOTE_LOCK_TOPICS.lockDenied, payload, true);
    },
    [emitStream]
  );

  const emitLockTouch = useCallback(() => {
    const current = lockStateRef.current;
    const currentUserId = userIdRef.current;
    const mapId = mapIdRef.current;
    if (!current || !currentUserId || current.ownerUserId !== currentUserId || !mapId) {
      return;
    }
    const now = Date.now();
    const payload: TokenNoteLockTouchPayload = {
      mapId,
      tokenStateId: current.tokenStateId,
      userId: currentUserId,
      lockId: current.lockId,
      ts: now,
    };
    emitStream(TOKEN_NOTE_LOCK_TOPICS.lockTouch, payload, true);
    setLockState((prev) => {
      if (!prev || prev.lockId !== current.lockId) {
        return prev;
      }
      return { ...prev, lastTouchAt: now, expiresAt: now + LOCK_TTL_MS };
    });
    scheduleLockExpiry(now + LOCK_TTL_MS);
  }, [emitStream, scheduleLockExpiry]);

  const emitUnlock = useCallback(
    (payload: TokenNoteUnlockPayload) => {
      emitStream(TOKEN_NOTE_LOCK_TOPICS.unlock, payload, true);
    },
    [emitStream]
  );

  const emitLockReleased = useCallback(
    (payload: TokenNoteLockReleasedPayload) => {
      emitStream(TOKEN_NOTE_LOCK_TOPICS.lockReleased, payload, true);
    },
    [emitStream]
  );

  const commitDraftIfNeeded = useCallback(() => {
    const currentNote = noteRef.current;
    const tokenStateId = openTokenStateIdRef.current;
    const currentUserId = userIdRef.current;
    if (!currentNote || !tokenStateId || !currentUserId || !canEditRef.current) {
      return;
    }
    const nextContent = draftContentRef.current;
    const nextStyle = draftStyleRef.current;
    const changed =
      nextContent !== currentNote.content || !isStyleEqual(nextStyle, currentNote.style);
    if (!changed) {
      return;
    }
    onTokenNoteChange({
      [tokenStateId]: {
        content: nextContent,
        style: nextStyle,
        lastEditedBy: currentUserId,
        lastEditedAt: Date.now(),
      },
    });
  }, [isStyleEqual, onTokenNoteChange]);

  const releaseLock = useCallback(
    (reason: TokenNoteLockReleaseReason) => {
      const current = lockStateRef.current;
      const currentUserId = userIdRef.current;
      const mapId = mapIdRef.current;
      if (!current) {
        clearLockTimers();
        lockStateRef.current = null;
        setLockState(null);
        setIsEditing(false);
        return;
      }
      const isOwner = !!currentUserId && current.ownerUserId === currentUserId;
      if (isOwner && mapId && currentUserId) {
        const now = Date.now();
        commitDraftIfNeeded();
        const unlockPayload: TokenNoteUnlockPayload = {
          mapId,
          tokenStateId: current.tokenStateId,
          userId: currentUserId,
          lockId: current.lockId,
          ts: now,
          content: draftContentRef.current,
          style: draftStyleRef.current,
          lastEditedAt: now,
        };
        emitUnlock(unlockPayload);
        emitLockReleased({
          mapId,
          tokenStateId: current.tokenStateId,
          userId: currentUserId,
          lockId: current.lockId,
          reason,
          ts: now,
        });
      }
      clearLockTimers();
      lockStateRef.current = null;
      setLockState(null);
      setIsEditing(false);
      if (!isOwner) {
        setLockReleaseReason(reason);
      }
    },
    [clearLockTimers, commitDraftIfNeeded, emitLockReleased, emitUnlock]
  );

  useEffect(() => {
    releaseLockRef.current = releaseLock;
  }, [releaseLock]);

  const registerActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (inactivityTimeoutRef.current) {
      window.clearTimeout(inactivityTimeoutRef.current);
    }
    inactivityTimeoutRef.current = window.setTimeout(() => {
      const current = lockStateRef.current;
      if (!current || current.ownerUserId !== userIdRef.current) {
        return;
      }
      releaseLock("timeout");
    }, LOCK_TTL_MS);
  }, [releaseLock]);

  function openTokenNote(tokenStateId: string, options?: TokenNoteOpenOptions) {
    if (!settings.enabled) {
      return;
    }
    if (openTokenStateId && openTokenStateId !== tokenStateId) {
      handleRequestClose();
    }
    setOpenTokenStateId(tokenStateId);
    setOpenMode(options?.mode || "sheet");
    setAnchorNode(options?.anchor || null);
    setIsExpanded(false);
    setIsEditing(false);
    setLockReleaseReason(null);
  }

  function handleRequestClose() {
    if (!userId) {
      clearLockTimers();
      lockStateRef.current = null;
      setLockState(null);
      setIsEditing(false);
      setIsExpanded(false);
      setOpenTokenStateId(null);
      setOpenMode(null);
      setAnchorNode(null);
      setLockReleaseReason(null);
      return;
    }
    if (isLockOwner) {
      releaseLock("owner");
    } else {
      clearLockTimers();
      lockStateRef.current = null;
      setLockState(null);
      setIsEditing(false);
    }
    setIsEditing(false);
    setIsExpanded(false);
    setOpenTokenStateId(null);
    setOpenMode(null);
    setAnchorNode(null);
    setLockReleaseReason(null);
  }

  useEffect(() => {
    if (!openTokenStateId || !tokenState || !mapState) {
      return;
    }
    if (!userId) {
      return;
    }
    if (!note && !createdRef.current[openTokenStateId]) {
      const now = Date.now();
      const newNote: TokenNote = {
        id: openTokenStateId,
        tokenStateId: openTokenStateId,
        content: "",
        style: {
          fontFamily: settings.defaultFont,
        },
        permissions: {
          default: settings.defaultPermission,
          owners: [],
        },
        lastEditedBy: userId,
        lastEditedAt: now,
      };
      createdRef.current[openTokenStateId] = true;
      onTokenNoteCreate([newNote]);
    }
  }, [
    openTokenStateId,
    tokenState,
    mapState,
    note,
    onTokenNoteCreate,
    settings.defaultFont,
    settings.defaultPermission,
    userId,
  ]);
  useEffect(() => {
    if (!openTokenStateId) {
      return;
    }
    if (!note) {
      setDraftContent("");
      setDraftStyle({ fontFamily: settings.defaultFont });
      lastRemoteEditRef.current = 0;
      return;
    }
    if (!isEditingActive) {
      setDraftContent(note.content);
      setDraftStyle(note.style);
      lastRemoteEditRef.current = note.lastEditedAt;
      return;
    }
    const isRemote = !!userId && note.lastEditedBy && note.lastEditedBy !== userId;
    if (isRemote && note.lastEditedAt !== lastRemoteEditRef.current) {
      lastRemoteEditRef.current = note.lastEditedAt;
      addToast("笔记已被更新");
    }
  }, [
    addToast,
    isEditingActive,
    note,
    openTokenStateId,
    settings.defaultFont,
    userId,
  ]);

  useEffect(() => {
    const previous = previousOpenTokenStateIdRef.current;
    if (previous && previous !== openTokenStateId) {
      clearLockTimers();
      setLockState(null);
      setIsEditing(false);
      setLockReleaseReason(null);
    }
    previousOpenTokenStateIdRef.current = openTokenStateId;
  }, [clearLockTimers, openTokenStateId]);

  useEffect(() => {
    if (!isLockOwner) {
      if (touchIntervalRef.current) {
        window.clearInterval(touchIntervalRef.current);
        touchIntervalRef.current = null;
      }
      return;
    }
    emitLockTouch();
    touchIntervalRef.current = window.setInterval(() => {
      emitLockTouch();
    }, LOCK_TOUCH_INTERVAL_MS);
    return () => {
      if (touchIntervalRef.current) {
        window.clearInterval(touchIntervalRef.current);
        touchIntervalRef.current = null;
      }
    };
  }, [emitLockTouch, isLockOwner]);

  useEffect(() => {
    const handleLockRequest: StreamEventHandler = (event) => {
      const payload = event.data as TokenNoteLockRequestPayload;
      if (
        !payload ||
        payload.mapId !== mapIdRef.current ||
        payload.tokenStateId !== openTokenStateIdRef.current
      ) {
        return;
      }
      if (
        typeof payload.userId !== "string" ||
        typeof payload.clientLockId !== "string" ||
        typeof payload.ts !== "number"
      ) {
        return;
      }
      const now = Date.now();
      const current = lockStateRef.current;
      if (current && current.expiresAt > now) {
        if (
          current.ownerUserId === userIdRef.current &&
          payload.userId !== current.ownerUserId
        ) {
          emitLockDenied({
            mapId: payload.mapId,
            tokenStateId: payload.tokenStateId,
            ownerUserId: current.ownerUserId,
            lockId: current.lockId,
            expiresAt: current.expiresAt,
            ts: now,
          });
        }
        return;
      }
      const lockId = payload.clientLockId;
      const expiresAt = now + LOCK_TTL_MS;
      setLockState({
        tokenStateId: payload.tokenStateId,
        ownerUserId: payload.userId,
        lockId,
        expiresAt,
        lastTouchAt: now,
      });
      setLockReleaseReason(null);
      scheduleLockExpiry(expiresAt);
      if (payload.userId === userIdRef.current) {
        emitLockGranted({
          mapId: payload.mapId,
          tokenStateId: payload.tokenStateId,
          userId: payload.userId,
          lockId,
          expiresAt,
          ts: now,
        });
        setIsEditing(true);
        registerActivity();
      } else {
        setIsEditing(false);
      }
    };

    const handleLockGranted: StreamEventHandler = (event) => {
      const payload = event.data as TokenNoteLockGrantedPayload;
      if (
        !payload ||
        payload.mapId !== mapIdRef.current ||
        payload.tokenStateId !== openTokenStateIdRef.current
      ) {
        return;
      }
      if (
        typeof payload.userId !== "string" ||
        typeof payload.lockId !== "string" ||
        typeof payload.expiresAt !== "number"
      ) {
        return;
      }
      const now = Date.now();
      const current = lockStateRef.current;
      if (current && current.expiresAt > now && current.lockId !== payload.lockId) {
        return;
      }
      setLockState({
        tokenStateId: payload.tokenStateId,
        ownerUserId: payload.userId,
        lockId: payload.lockId,
        expiresAt: payload.expiresAt,
        lastTouchAt: payload.ts || now,
      });
      setLockReleaseReason(null);
      scheduleLockExpiry(payload.expiresAt);
      if (payload.userId === userIdRef.current) {
        setIsEditing(true);
        registerActivity();
      } else {
        setIsEditing(false);
      }
    };

    const handleLockDenied: StreamEventHandler = (event) => {
      const payload = event.data as TokenNoteLockDeniedPayload;
      if (
        !payload ||
        payload.mapId !== mapIdRef.current ||
        payload.tokenStateId !== openTokenStateIdRef.current
      ) {
        return;
      }
      if (
        typeof payload.ownerUserId !== "string" ||
        typeof payload.lockId !== "string" ||
        typeof payload.expiresAt !== "number"
      ) {
        return;
      }
      setLockState({
        tokenStateId: payload.tokenStateId,
        ownerUserId: payload.ownerUserId,
        lockId: payload.lockId,
        expiresAt: payload.expiresAt,
        lastTouchAt: payload.ts || Date.now(),
      });
      setLockReleaseReason(null);
      scheduleLockExpiry(payload.expiresAt);
      setIsEditing(false);
    };

    const handleLockTouch: StreamEventHandler = (event) => {
      const payload = event.data as TokenNoteLockTouchPayload;
      if (
        !payload ||
        payload.mapId !== mapIdRef.current ||
        payload.tokenStateId !== openTokenStateIdRef.current
      ) {
        return;
      }
      if (
        typeof payload.userId !== "string" ||
        typeof payload.lockId !== "string" ||
        typeof payload.ts !== "number"
      ) {
        return;
      }
      const now = Date.now();
      const expiresAt = payload.ts + LOCK_TTL_MS;
      const current = lockStateRef.current;
      if (
        current &&
        current.lockId === payload.lockId &&
        current.ownerUserId === payload.userId
      ) {
        setLockState({
          ...current,
          lastTouchAt: payload.ts,
          expiresAt,
        });
        scheduleLockExpiry(expiresAt);
        return;
      }
      if (!current || current.expiresAt <= now) {
        setLockState({
          tokenStateId: payload.tokenStateId,
          ownerUserId: payload.userId,
          lockId: payload.lockId,
          expiresAt,
          lastTouchAt: payload.ts,
        });
        setLockReleaseReason(null);
        scheduleLockExpiry(expiresAt);
        setIsEditing(false);
      }
    };

    const handleUnlock: StreamEventHandler = (event) => {
      const payload = event.data as TokenNoteUnlockPayload;
      if (
        !payload ||
        payload.mapId !== mapIdRef.current ||
        payload.tokenStateId !== openTokenStateIdRef.current
      ) {
        return;
      }
      const current = lockStateRef.current;
      if (!current || current.lockId !== payload.lockId) {
        return;
      }
      if (!isEditingActive) {
        if (typeof payload.content === "string") {
          setDraftContent(payload.content);
        }
        if (payload.style) {
          setDraftStyle(payload.style);
        }
        if (typeof payload.lastEditedAt === "number") {
          lastRemoteEditRef.current = payload.lastEditedAt;
        }
      }
      clearLockTimers();
      setLockState(null);
      setIsEditing(false);
      setLockReleaseReason("owner");
    };

    const handleLockReleased: StreamEventHandler = (event) => {
      const payload = event.data as TokenNoteLockReleasedPayload;
      if (
        !payload ||
        payload.mapId !== mapIdRef.current ||
        payload.tokenStateId !== openTokenStateIdRef.current
      ) {
        return;
      }
      const current = lockStateRef.current;
      if (!current || current.lockId !== payload.lockId) {
        return;
      }
      clearLockTimers();
      setLockState(null);
      setIsEditing(false);
      setLockReleaseReason(payload.reason);
    };

    session.onStream(TOKEN_NOTE_LOCK_TOPICS.lockRequest, handleLockRequest);
    session.onStream(TOKEN_NOTE_LOCK_TOPICS.lockGranted, handleLockGranted);
    session.onStream(TOKEN_NOTE_LOCK_TOPICS.lockDenied, handleLockDenied);
    session.onStream(TOKEN_NOTE_LOCK_TOPICS.lockTouch, handleLockTouch);
    session.onStream(TOKEN_NOTE_LOCK_TOPICS.unlock, handleUnlock);
    session.onStream(TOKEN_NOTE_LOCK_TOPICS.lockReleased, handleLockReleased);

    return () => {
      session.off(`stream:${TOKEN_NOTE_LOCK_TOPICS.lockRequest}`, handleLockRequest);
      session.off(`stream:${TOKEN_NOTE_LOCK_TOPICS.lockGranted}`, handleLockGranted);
      session.off(`stream:${TOKEN_NOTE_LOCK_TOPICS.lockDenied}`, handleLockDenied);
      session.off(`stream:${TOKEN_NOTE_LOCK_TOPICS.lockTouch}`, handleLockTouch);
      session.off(`stream:${TOKEN_NOTE_LOCK_TOPICS.unlock}`, handleUnlock);
      session.off(`stream:${TOKEN_NOTE_LOCK_TOPICS.lockReleased}`, handleLockReleased);
    };
  }, [
    clearLockTimers,
    emitLockDenied,
    emitLockGranted,
    registerActivity,
    scheduleLockExpiry,
    session,
    isEditingActive,
  ]);

  useEffect(() => {
    if (!openTokenStateId || !mapState) {
      return;
    }
    if (!mapState.tokens[openTokenStateId]) {
      onTokenNoteRemove([openTokenStateId]);
      handleRequestClose();
    }
  }, [handleRequestClose, mapState, onTokenNoteRemove, openTokenStateId]);

  useEffect(() => {
    if (!settings.enabled && openTokenStateId) {
      handleRequestClose();
    }
  }, [handleRequestClose, openTokenStateId, settings.enabled]);
  function handleContentChange(value: string) {
    if (!canEdit || !isLockOwner) {
      return;
    }
    if (!isEditing) {
      setIsEditing(true);
    }
    setDraftContent(value);
    registerActivity();
  }

  function handleStyleChange(change: Partial<TokenNoteStyle>) {
    if (!canEdit || !isLockOwner) {
      return;
    }
    if (!isEditing) {
      setIsEditing(true);
    }
    setDraftStyle((prev) => ({ ...prev, ...change }));
    registerActivity();
  }

  const lockOwnerId =
    lockState?.ownerUserId && lockState.ownerUserId !== userId
      ? lockState.ownerUserId
      : undefined;

  const tokenNoteSheet = (
    <TokenNoteSheet
      isOpen={!!openTokenStateId && openMode === "sheet"}
      tokenState={tokenState}
      token={token}
      content={draftContent}
      style={draftStyle}
      canRead={canRead}
      canEdit={canEdit}
      isEditing={isEditingActive}
      isExpanded={isExpanded}
      blur={settings.blur}
      fontSize={settings.fontSize}
      lockOwnerId={lockOwnerId}
      lockReleaseReason={lockReleaseReason}
      onRequestClose={handleRequestClose}
      onToggleExpanded={() => setIsExpanded((prev) => !prev)}
      onRequestEdit={() => {
        if (canEdit) {
          if (isLockOwner) {
            setIsEditing(true);
            registerActivity();
            return;
          }
          emitLockRequest();
        }
      }}
      onEditorBlur={() => {
        if (isLockOwner) {
          releaseLock("owner");
        }
      }}
      onContentChange={handleContentChange}
      onStyleChange={handleStyleChange}
    />
  );

  const tokenNotePopover = (
    <TokenNotePopover
      isOpen={!!openTokenStateId && openMode === "popover"}
      tokenState={tokenState}
      token={token}
      content={draftContent}
      style={draftStyle}
      canRead={canRead}
      canEdit={canEdit}
      isEditing={isEditingActive}
      anchorNode={anchorNode || undefined}
      lockOwnerId={lockOwnerId}
      onRequestClose={handleRequestClose}
      onRequestExpand={() => setOpenMode("sheet")}
      onRequestEdit={() => {
        if (!canEdit) {
          return;
        }
        if (isLockOwner) {
          setIsEditing(true);
          registerActivity();
          return;
        }
        emitLockRequest();
      }}
      onEditorBlur={() => {
        if (isLockOwner) {
          releaseLock("owner");
        }
      }}
      onContentChange={handleContentChange}
    />
  );

  return { tokenNoteSheet, tokenNotePopover, openTokenNote };
}

export default useTokenNotes;
