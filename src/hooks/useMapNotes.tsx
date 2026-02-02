import Konva from "konva";
import { Group } from "react-konva";
import { KonvaEventObject } from "konva/lib/Node";
import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { useToasts } from "react-toast-notifications";

import Note from "../components/konva/Note";
import NoteDragOverlay from "../components/note/NoteDragOverlay";
import NoteMenu from "../components/note/NoteMenu";
import AdvancedTextHud from "../components/note/AdvancedTextHud";
import NoteTextOverlay from "../components/note/NoteTextOverlay";
import NoteTool from "../components/tools/NoteTool";
import { useBlur, useKeyboard } from "../contexts/KeyboardContext";
import { useUserId } from "../contexts/UserIdContext";
import { useMapStage } from "../contexts/MapStageContext";
import shortcuts from "../shortcuts";
import {
  NoteChangeEventHandler,
  NoteCreateEventHander,
  NoteRemoveEventHander,
} from "../types/Events";
import { Map, MapToolId } from "../types/Map";
import { MapState } from "../types/MapState";
import {
  Note as NoteType,
  NoteDraggingOptions,
  NoteMenuOptions,
  NoteStyle,
} from "../types/Note";
import useDebounce from "./useDebounce";
import { getNoteContent, getNoteContentFormat } from "../helpers/notes";

const defaultNoteStyle: NoteStyle = {
  textColor: "white",
  backgroundMode: "frame",
  fontFamily: "rounded",
  fontScale: "md",
  fontSize: 1,
};

const fontScaleMap: Record<NoteStyle["fontScale"], number> = {
  xs: 0.5,
  sm: 0.75,
  md: 1,
  lg: 1.5,
  xl: 2,
  huge: 3,
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function plainToHtml(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

function htmlToPlain(value: string) {
  const container = document.createElement("div");
  container.innerHTML = value;
  return container.textContent || "";
}

function resolveDraftStyle(note: NoteType): NoteStyle {
  if (note.style) {
    return {
      ...note.style,
      fontSize:
        typeof note.style.fontSize === "number"
          ? note.style.fontSize
          : fontScaleMap[note.style.fontScale || "md"],
    };
  }
  return {
    textColor: note.textOnly ? note.color : "black",
    backgroundMode: note.textOnly ? "none" : "frame",
    fontFamily: "rounded",
    fontScale: "md",
    fontSize: 1,
  };
}

function resolveHtmlContent(note: NoteType) {
  if (getNoteContentFormat(note) === "html") {
    return getNoteContent(note);
  }
  return plainToHtml(note.text || "");
}

function useMapNotes(
  map: Map | null,
  mapState: MapState | null,
  onNoteCreate: NoteCreateEventHander,
  onNoteChange: NoteChangeEventHandler,
  onNoteRemove: NoteRemoveEventHander,
  selectedToolId: MapToolId
) {
  const { addToast } = useToasts();
  const userId = useUserId();
  const mapStageRef = useMapStage();
  const allowNoteEditing = !!(
    map?.owner === userId || mapState?.editFlags.includes("notes")
  );
  const canManage = !!userId && map?.owner === userId;

  const [noteDraggingOptions, setNoteDraggingOptions] =
    useState<NoteDraggingOptions>();
  const [isNoteMenuOpen, setIsNoteMenuOpen] = useState(false);
  const [noteMenuOptions, setNoteMenuOptions] = useState<NoteMenuOptions>();
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [isHudOpen, setIsHudOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState("");
  const [draftStyle, setDraftStyle] = useState<NoteStyle>(defaultNoteStyle);
  const [autoFocusEditor, setAutoFocusEditor] = useState(false);
  const [attachMode, setAttachMode] = useState(false);
  const [hasEdited, setHasEdited] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastRemoteEditRef = useRef<number>(0);

  const activeNote = activeNoteId ? mapState?.notes[activeNoteId] : undefined;

  function handleNoteMenuOpen(
    noteId: string,
    noteNode: Konva.Node,
    focus: boolean
  ) {
    setNoteMenuOptions({ noteId, noteNode, focus });
    setIsNoteMenuOpen(true);
  }

  function handleTextHudOpen(
    noteId: string,
    _noteNode: Konva.Node,
    focus: boolean
  ) {
    setActiveNoteId(noteId);
    setIsNoteMenuOpen(false);
    setIsHudOpen(true);
    setIsEditing(true);
    setHasEdited(false);
    setAutoFocusEditor(focus);
    setAttachMode(false);
  }

  const commitDraftContent = useCallback((note: NoteType) => {
    if (!activeNoteId || !allowNoteEditing || !userId) {
      return;
    }
    if (!hasEdited) {
      return;
    }
    if (draftContent === (note.content || "")) {
      return;
    }
    const nextStyle = note.style || draftStyle;
    const noteId = activeNoteId;
    if (!noteId) {
      return;
    }
    onNoteChange({
      [noteId]: {
        content: draftContent,
        contentFormat: "html",
        text: htmlToPlain(draftContent),
        style: nextStyle,
        textOnly: nextStyle.backgroundMode === "none",
        lastModified: Date.now(),
        lastModifiedBy: userId,
      },
    });
  }, [
    activeNoteId,
    allowNoteEditing,
    userId,
    hasEdited,
    draftContent,
    draftStyle,
    onNoteChange,
  ]);

  const handleNoteMenuClose = useCallback(() => {
    setIsNoteMenuOpen(false);
  }, []);

  const handleTextHudClose = useCallback(() => {
    if (activeNote) {
      commitDraftContent(activeNote);
    }
    setIsHudOpen(false);
    setIsEditing(false);
    setActiveNoteId(null);
    setAttachMode(false);
    setAutoFocusEditor(false);
    setHasEdited(false);
  }, [activeNote, commitDraftContent]);

  function handleNoteDragStart(_: KonvaEventObject<DragEvent>, noteId: string) {
    if (duplicateNote) {
      const note = mapState?.notes[noteId];
      if (note) {
        onNoteCreate([{ ...note, id: uuid() }]);
      }
    }
    setNoteDraggingOptions({ dragging: true, noteId });
  }

  function handleNoteDragEnd() {
    noteDraggingOptions &&
      setNoteDraggingOptions({ ...noteDraggingOptions, dragging: false });
  }

  function handleNoteRemove(noteIds: string[]) {
    onNoteRemove(noteIds);
    setNoteDraggingOptions(undefined);
  }

  const [duplicateNote, setDuplicateNote] = useState(false);
  function handleKeyDown(event: KeyboardEvent) {
    if (shortcuts.duplicate(event)) {
      setDuplicateNote(true);
    }
  }

  function handleKeyUp(event: KeyboardEvent) {
    if (shortcuts.duplicate(event)) {
      setDuplicateNote(false);
    }
  }

  function handleBlur() {
    setDuplicateNote(false);
  }

  useKeyboard(handleKeyDown, handleKeyUp);
  useBlur(handleBlur);

  useEffect(() => {
    if (!activeNoteId) {
      setDraftContent("");
      setDraftStyle(defaultNoteStyle);
      lastRemoteEditRef.current = 0;
      return;
    }
    if (!activeNote) {
      return;
    }
    const isRemote =
      !!userId &&
      activeNote.lastModifiedBy &&
      activeNote.lastModifiedBy !== userId;
    if (isRemote && activeNote.lastModified !== lastRemoteEditRef.current) {
      lastRemoteEditRef.current = activeNote.lastModified;
      if (isEditing) {
        addToast("文本已被更新");
        return;
      }
      setDraftContent(resolveHtmlContent(activeNote));
      setDraftStyle(resolveDraftStyle(activeNote));
      return;
    }
    if (!isEditing) {
      setDraftContent(resolveHtmlContent(activeNote));
      setDraftStyle(resolveDraftStyle(activeNote));
    }
  }, [activeNote, activeNoteId, addToast, isEditing, userId]);

  useEffect(() => {
    if (
      isHudOpen &&
      selectedToolId !== "text" &&
      selectedToolId !== "move" &&
      selectedToolId !== "select"
    ) {
      handleTextHudClose();
    }
    if (isNoteMenuOpen && selectedToolId === "text") {
      handleNoteMenuClose();
    }
  }, [handleNoteMenuClose, handleTextHudClose, isHudOpen, isNoteMenuOpen, selectedToolId]);

  useEffect(() => {
    if (autoFocusEditor && editorRef.current) {
      setAutoFocusEditor(false);
    }
  }, [autoFocusEditor]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      const editorNode = editorRef.current;
      if (editorNode && editorNode.contains(target)) {
        return;
      }
      const hudNode = document.querySelector("[data-text-hud='true']");
      if (hudNode && hudNode.contains(target)) {
        return;
      }
      handleTextHudClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isEditing, handleTextHudClose]);

  useEffect(() => {
    if (!attachMode || !activeNoteId || !mapStageRef.current || !userId) {
      return;
    }
    const stage = mapStageRef.current;
    function handlePointerUp() {
      const pointerPosition = stage.getPointerPosition();
      if (!pointerPosition) {
        setAttachMode(false);
        return;
      }
      const shape = stage.getIntersection(pointerPosition);
      let node: Konva.Node | null = shape || null;
      let tokenId: string | null = null;
      while (node) {
        const id = node.id();
        if (id && mapState?.tokens[id]) {
          tokenId = id;
          break;
        }
        node = node.getParent();
      }
      if (tokenId) {
        const noteId = activeNoteId;
        if (!noteId) {
          setAttachMode(false);
          return;
        }
        onNoteChange({
          [noteId]: {
            attachedToTokenId: tokenId,
            lastModified: Date.now(),
            lastModifiedBy: userId,
          },
        });
      }
      setAttachMode(false);
    }
    stage.on("pointerup", handlePointerUp);
    return () => {
      stage.off("pointerup", handlePointerUp);
    };
  }, [attachMode, activeNoteId, mapStageRef, mapState, onNoteChange, userId]);

  const debouncedContent = useDebounce(draftContent, 400);

  function handleTextSizeChange(noteId: string, size: number) {
    if (!allowNoteEditing || !userId) {
      return;
    }
    onNoteChange({
      [noteId]: {
        size,
        lastModified: Date.now(),
        lastModifiedBy: userId,
      },
    });
  }

  useEffect(() => {
    if (
      !activeNoteId ||
      !activeNote ||
      !allowNoteEditing ||
      !isEditing ||
      !userId
    ) {
      return;
    }
    if (!hasEdited) {
      return;
    }
    if (debouncedContent === undefined) {
      return;
    }
    if (!activeNoteId) {
      return;
    }
    if (debouncedContent === (activeNote.content || "")) {
      return;
    }
    const nextStyle = activeNote.style || draftStyle;
    const noteId = activeNoteId;
    if (!noteId) {
      return;
    }
    onNoteChange({
      [noteId]: {
        content: debouncedContent,
        contentFormat: "html",
        text: htmlToPlain(debouncedContent),
        style: nextStyle,
        textOnly: nextStyle.backgroundMode === "none",
        lastModified: Date.now(),
        lastModifiedBy: userId,
      },
    });
  }, [
    activeNote,
    activeNoteId,
    allowNoteEditing,
    debouncedContent,
    draftStyle,
    hasEdited,
    isEditing,
    onNoteChange,
    userId,
  ]);

  useEffect(() => {
    if (!activeNoteId || !mapState) {
      return;
    }
    if (!mapState.notes[activeNoteId]) {
      handleTextHudClose();
    }
  }, [activeNoteId, handleTextHudClose, mapState]);

  function handleContentChange(value: string) {
    if (!allowNoteEditing) {
      return;
    }
    if (!isEditing) {
      setIsEditing(true);
    }
    if (!hasEdited) {
      setHasEdited(true);
    }
    setDraftContent(value);
  }

  function handleStyleChange(change: Partial<NoteStyle>) {
    if (!allowNoteEditing || !activeNoteId || !userId) {
      return;
    }
    const nextStyle = { ...draftStyle, ...change };
    setDraftStyle(nextStyle);
    if (!hasEdited) {
      setHasEdited(true);
    }
    onNoteChange({
      [activeNoteId]: {
        style: nextStyle,
        textOnly: nextStyle.backgroundMode === "none",
        lastModified: Date.now(),
        lastModifiedBy: userId,
      },
    });
  }

  function handleCommand(command: string, value?: string) {
    if (!allowNoteEditing) {
      return;
    }
    const node = editorRef.current;
    if (!node) {
      return;
    }
    node.focus();
    document.execCommand(command, false, value);
    handleContentChange(node.innerHTML);
  }

  function handleToggleTextVisible() {
    if (!activeNoteId || !activeNote || !canManage || !userId) {
      return;
    }
    onNoteChange({
      [activeNoteId]: {
        textVisible: activeNote.textVisible === false,
        lastModified: Date.now(),
        lastModifiedBy: userId,
      },
    });
  }

  function handleToggleVisibility() {
    if (!activeNoteId || !activeNote || !canManage || !userId) {
      return;
    }
    const current = activeNote.visibility || "all";
    const next = current === "all" ? "gm" : current === "gm" ? "owner" : "all";
    onNoteChange({
      [activeNoteId]: {
        visibility: next,
        lastModified: Date.now(),
        lastModifiedBy: userId,
      },
    });
  }

  function handleToggleAttach() {
    if (!activeNoteId || !activeNote || !canManage || !userId) {
      return;
    }
    if (activeNote.attachedToTokenId) {
      onNoteChange({
        [activeNoteId]: {
          attachedToTokenId: "",
          lastModified: Date.now(),
          lastModifiedBy: userId,
        },
      });
      setAttachMode(false);
      return;
    }
    setAttachMode((prev) => !prev);
  }

  function resolveAttachedNote(note: NoteType) {
    if (!note.attachedToTokenId || !mapState?.tokens[note.attachedToTokenId]) {
      return note;
    }
    const tokenState = mapState.tokens[note.attachedToTokenId];
    return { ...note, x: tokenState.x, y: tokenState.y };
  }

  const resolvedNotes = mapState
    ? Object.values(mapState.notes).sort((a, b) =>
        sortNotes(a, b, noteDraggingOptions)
      )
    : [];

  const noteMenuEnabled = selectedToolId === "note" || selectedToolId === "move";
  const textHudEnabled =
    selectedToolId === "text" ||
    selectedToolId === "move" ||
    selectedToolId === "select";
  const allowDoubleClickEdit = textHudEnabled;
  const allowSingleClickEdit = selectedToolId === "text";

  const notes = (
    <Group id="notes">
      {resolvedNotes.map((note) => (
        <Note
          note={resolveAttachedNote(note)}
          map={map}
          key={note.id}
          onNoteMenuOpen={noteMenuEnabled ? handleNoteMenuOpen : undefined}
          onNoteEditOpen={allowDoubleClickEdit ? handleTextHudOpen : undefined}
          onNoteMenuClose={handleNoteMenuClose}
          editable={allowNoteEditing}
          allowSingleClickEdit={allowSingleClickEdit}
          openOnClick={noteMenuEnabled || allowSingleClickEdit}
          openOnDoubleClick={allowDoubleClickEdit}
          draggable={
            allowNoteEditing &&
            (selectedToolId === "note" ||
              selectedToolId === "text" ||
              selectedToolId === "move") &&
            !note.locked &&
            !note.attachedToTokenId
          }
          onNoteChange={onNoteChange}
          onNoteDragStart={handleNoteDragStart}
          onNoteDragEnd={handleNoteDragEnd}
          fadeOnHover={selectedToolId === "drawing"}
          selected={
            (isHudOpen && activeNoteId === note.id) ||
            (isNoteMenuOpen && noteMenuOptions?.noteId === note.id)
          }
        />
      ))}
      <NoteTool
        map={map}
        active={selectedToolId === "note"}
        mode="note"
        onNoteCreate={onNoteCreate}
        onNoteMenuOpen={handleNoteMenuOpen}
      />
      <NoteTool
        map={map}
        active={selectedToolId === "text"}
        mode="text"
        onNoteCreate={onNoteCreate}
        onNoteMenuOpen={handleTextHudOpen}
      />
    </Group>
  );

  const noteMenu = (
    <NoteMenu
      isOpen={isNoteMenuOpen}
      onRequestClose={handleNoteMenuClose}
      onNoteChange={onNoteChange}
      note={noteMenuOptions && mapState?.notes[noteMenuOptions.noteId]}
      noteNode={noteMenuOptions?.noteNode}
      focus={noteMenuOptions?.focus}
      map={map}
    />
  );

  const noteHud = (
    <AdvancedTextHud
      isOpen={isHudOpen && textHudEnabled}
      note={activeNote}
      draftStyle={draftStyle}
      canEdit={allowNoteEditing}
      canManage={canManage}
      attachMode={attachMode}
      onRequestClose={handleTextHudClose}
      onStyleChange={handleStyleChange}
      onCommand={handleCommand}
      onToggleTextVisible={handleToggleTextVisible}
      onToggleVisibility={handleToggleVisibility}
      onToggleAttach={handleToggleAttach}
    />
  );

  const noteTextOverlay = (
    <NoteTextOverlay
      map={map}
      notes={resolvedNotes.map(resolveAttachedNote)}
      activeNoteId={activeNoteId}
      draftContent={draftContent}
      draftStyle={draftStyle}
      isEditing={isEditing}
      editorRef={editorRef}
      autoFocus={autoFocusEditor}
      onContentChange={handleContentChange}
      onDone={handleTextHudClose}
      onRequestSizeChange={handleTextSizeChange}
    />
  );

  const noteDragOverlay = noteDraggingOptions ? (
    <NoteDragOverlay
      draggingOptions={noteDraggingOptions}
      onNoteRemove={handleNoteRemove}
    />
  ) : null;

  return { notes, noteMenu, noteHud, noteTextOverlay, noteDragOverlay };
}

export default useMapNotes;

function sortNotes(
  a: NoteType,
  b: NoteType,
  noteDraggingOptions?: NoteDraggingOptions
) {
  if (
    noteDraggingOptions &&
    noteDraggingOptions.dragging &&
    noteDraggingOptions.noteId === a.id
  ) {
    // If dragging token `a` move above
    return 1;
  } else if (
    noteDraggingOptions &&
    noteDraggingOptions.dragging &&
    noteDraggingOptions.noteId === b.id
  ) {
    // If dragging token `b` move above
    return -1;
  } else {
    // Else sort so last modified is on top
    return a.lastModified - b.lastModified;
  }
}
