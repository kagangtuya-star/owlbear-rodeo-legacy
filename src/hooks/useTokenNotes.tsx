import { ReactNode, useEffect, useRef, useState } from "react";
import { useToasts } from "react-toast-notifications";
import Konva from "konva";

import { Map } from "../types/Map";
import { MapState } from "../types/MapState";
import { TokenNote, TokenNoteStyle } from "../types/TokenNote";
import { TokenNoteSettings } from "../types/Settings";
import {
  TokenNoteChangeEventHandler,
  TokenNoteCreateEventHandler,
  TokenNoteRemoveEventHandler,
} from "../types/Events";

import { useUserId } from "../contexts/UserIdContext";
import { useTokenData } from "../contexts/TokenDataContext";

import useDebounce from "./useDebounce";

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

function useTokenNotes(
  map: Map | null,
  mapState: MapState | null,
  onTokenNoteCreate: TokenNoteCreateEventHandler,
  onTokenNoteChange: TokenNoteChangeEventHandler,
  onTokenNoteRemove: TokenNoteRemoveEventHandler,
  settings: TokenNoteSettings
): TokenNoteHook {
  const { addToast } = useToasts();
  const userId = useUserId();
  const { tokensById } = useTokenData();

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

  function openTokenNote(tokenStateId: string, options?: TokenNoteOpenOptions) {
    if (!settings.enabled) {
      return;
    }
    setOpenTokenStateId(tokenStateId);
    setOpenMode(options?.mode || "sheet");
    setAnchorNode(options?.anchor || null);
    setIsExpanded(false);
    setIsEditing(false);
  }

  function handleRequestClose() {
    if (!userId) {
      setIsEditing(false);
      setIsExpanded(false);
      setOpenTokenStateId(null);
      return;
    }
    if (openTokenStateId && note?.editingBy === userId) {
      onTokenNoteChange({
        [openTokenStateId]: {
          editingBy: "",
        },
      });
    }
    if (openTokenStateId && note && canEdit && draftContent !== note.content) {
      onTokenNoteChange({
        [openTokenStateId]: {
          content: draftContent,
          lastEditedBy: userId,
          lastEditedAt: Date.now(),
        },
      });
    }
    setIsEditing(false);
    setIsExpanded(false);
    setOpenTokenStateId(null);
    setOpenMode(null);
    setAnchorNode(null);
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
        editingBy: "",
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
    const isRemote = !!userId && note.lastEditedBy && note.lastEditedBy !== userId;
    if (isRemote && note.lastEditedAt !== lastRemoteEditRef.current) {
      lastRemoteEditRef.current = note.lastEditedAt;
      if (isEditing) {
        addToast("笔记已被更新");
        return;
      }
      setDraftContent(note.content);
      setDraftStyle(note.style);
      return;
    }
    if (!isEditing) {
      setDraftContent(note.content);
      setDraftStyle(note.style);
    }
  }, [
    addToast,
    isEditing,
    note,
    openTokenStateId,
    settings.defaultFont,
    userId,
  ]);

  useEffect(() => {
    if (!openTokenStateId || !note || !canEdit || !userId) {
      return;
    }
    const desired = isEditing ? userId : "";
    if ((note.editingBy || "") === desired) {
      return;
    }
    onTokenNoteChange({
      [openTokenStateId]: {
        editingBy: desired,
      },
    });
  }, [canEdit, isEditing, note, onTokenNoteChange, openTokenStateId, userId]);

  useEffect(() => {
    if (!openTokenStateId || !mapState) {
      return;
    }
    if (!mapState.tokens[openTokenStateId]) {
      onTokenNoteRemove([openTokenStateId]);
      handleRequestClose();
    }
  }, [mapState, onTokenNoteRemove, openTokenStateId]);

  useEffect(() => {
    if (!settings.enabled && openTokenStateId) {
      handleRequestClose();
    }
  }, [openTokenStateId, settings.enabled]);
  const debouncedContent = useDebounce(draftContent, 1000);

  useEffect(() => {
    if (!openTokenStateId || !note || !canEdit || !isEditing || !userId) {
      return;
    }
    if (debouncedContent === note.content) {
      return;
    }
    onTokenNoteChange({
      [openTokenStateId]: {
        content: debouncedContent,
        lastEditedBy: userId,
        lastEditedAt: Date.now(),
      },
    });
  }, [
    canEdit,
    debouncedContent,
    isEditing,
    note,
    onTokenNoteChange,
    openTokenStateId,
    userId,
  ]);

  function handleContentChange(value: string) {
    if (!canEdit) {
      return;
    }
    if (!isEditing) {
      setIsEditing(true);
    }
    setDraftContent(value);
  }

  function handleStyleChange(change: Partial<TokenNoteStyle>) {
    if (!canEdit) {
      return;
    }
    if (!isEditing) {
      setIsEditing(true);
    }
    setDraftStyle((prev) => {
      const nextStyle = { ...prev, ...change };
      if (openTokenStateId && note && canEdit && userId) {
        onTokenNoteChange({
          [openTokenStateId]: {
            style: nextStyle,
            lastEditedBy: userId,
            lastEditedAt: Date.now(),
          },
        });
      }
      return nextStyle;
    });
  }

  const tokenNoteSheet = (
    <TokenNoteSheet
      isOpen={!!openTokenStateId && openMode === "sheet"}
      tokenState={tokenState}
      token={token}
      content={draftContent}
      style={draftStyle}
      canRead={canRead}
      canEdit={canEdit}
      isEditing={isEditing}
      isExpanded={isExpanded}
      blur={settings.blur}
      fontSize={settings.fontSize}
      remoteEditingBy={
        userId && note?.editingBy && note.editingBy !== userId ? note.editingBy : undefined
      }
      onRequestClose={handleRequestClose}
      onToggleExpanded={() => setIsExpanded((prev) => !prev)}
      onRequestEdit={() => {
        if (canEdit) {
          setIsEditing(true);
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
      anchorNode={anchorNode || undefined}
      onRequestClose={handleRequestClose}
      onRequestExpand={() => setOpenMode("sheet")}
      onContentChange={handleContentChange}
    />
  );

  return { tokenNoteSheet, tokenNotePopover, openTokenNote };
}

export default useTokenNotes;
