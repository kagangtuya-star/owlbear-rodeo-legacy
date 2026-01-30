import { useCallback, useEffect, useRef, useState } from "react";
import { Box } from "theme-ui";

import { useMapStage } from "../../contexts/MapStageContext";
import {
  useInteractionEmitter,
  useMapWidth,
  useMapHeight,
  useStageScale,
  useSetPreventMapInteraction,
} from "../../contexts/MapInteractionContext";
import { useGridCellPixelSize } from "../../contexts/GridContext";
import { useUserId } from "../../contexts/UserIdContext";

import { Map } from "../../types/Map";
import { Note, NoteStyle } from "../../types/Note";
import { getNoteContent, getNoteContentFormat, getNoteVisibility, resolveColor } from "../../helpers/notes";
import NoteEditor from "./NoteEditor";
import useDebounce from "../../hooks/useDebounce";

type NoteTextOverlayProps = {
  map: Map | null;
  notes: Note[];
  activeNoteId: string | null;
  draftContent: string;
  draftStyle: NoteStyle | null;
  isEditing: boolean;
  editorRef: React.RefObject<HTMLDivElement>;
  autoFocus: boolean;
  onContentChange: (html: string) => void;
  onDone: () => void;
  onRequestSizeChange?: (noteId: string, size: number) => void;
};

function NoteTextOverlay({
  map,
  notes,
  activeNoteId,
  draftContent,
  draftStyle,
  isEditing,
  editorRef,
  autoFocus,
  onContentChange,
  onDone,
  onRequestSizeChange,
}: NoteTextOverlayProps) {
  const mapStageRef = useMapStage();
  const interactionEmitter = useInteractionEmitter();
  const setPreventMapInteraction = useSetPreventMapInteraction();
  const userId = useUserId();
  const mapWidth = useMapWidth();
  const mapHeight = useMapHeight();
  const stageScale = useStageScale();
  const gridCellPixelSize = useGridCellPixelSize();
  const [, setTick] = useState(0);
  const frameRef = useRef<number | null>(null);
  const debouncedContent = useDebounce(draftContent, 200);

  const scheduleUpdate = useCallback(() => {
    if (frameRef.current) {
      return;
    }
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setTick((prev) => prev + 1);
    });
  }, []);

  useEffect(() => {
    if (!interactionEmitter) {
      return;
    }
    interactionEmitter.on("dragStart", scheduleUpdate);
    interactionEmitter.on("drag", scheduleUpdate);
    interactionEmitter.on("dragEnd", scheduleUpdate);
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      interactionEmitter.off("dragStart", scheduleUpdate);
      interactionEmitter.off("drag", scheduleUpdate);
      interactionEmitter.off("dragEnd", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [interactionEmitter]);

  useEffect(() => {
    scheduleUpdate();
  }, [scheduleUpdate, stageScale, mapWidth, mapHeight]);

  useEffect(() => {
    if (!isEditing || !activeNoteId || !onRequestSizeChange) {
      return;
    }
    const activeNote = notes.find((note) => note.id === activeNoteId);
    if (!activeNote) {
      return;
    }
    const effectiveStyle =
      draftStyle && activeNote.id === activeNoteId
        ? draftStyle
        : activeNote.style;
    const backgroundMode =
      effectiveStyle?.backgroundMode || (activeNote.textOnly ? "none" : "frame");
    if (backgroundMode !== "none") {
      return;
    }
    const editorNode = editorRef.current;
    if (!editorNode) {
      return;
    }
    const minCellSize = Math.min(
      gridCellPixelSize.width,
      gridCellPixelSize.height
    );
    if (!minCellSize || !stageScale) {
      return;
    }
    const width = Math.max(editorNode.scrollWidth, editorNode.clientWidth);
    const height = Math.max(editorNode.scrollHeight, editorNode.clientHeight);
    const maxSizePx = Math.max(width, height);
    if (!Number.isFinite(maxSizePx) || maxSizePx <= 0) {
      return;
    }
    const nextSize = maxSizePx / (minCellSize * stageScale);
    if (!Number.isFinite(nextSize) || nextSize <= 0) {
      return;
    }
    const clampedSize = Math.max(nextSize, 0.5);
    if (Math.abs(clampedSize - activeNote.size) < 0.05) {
      return;
    }
    onRequestSizeChange(activeNoteId, clampedSize);
  }, [
    activeNoteId,
    debouncedContent,
    draftStyle,
    editorRef,
    gridCellPixelSize,
    isEditing,
    notes,
    onRequestSizeChange,
    stageScale,
  ]);

  useEffect(() => {
    setPreventMapInteraction(isEditing);
    return () => setPreventMapInteraction(false);
  }, [isEditing, setPreventMapInteraction]);

  const minCellSize = Math.min(
    gridCellPixelSize.width,
    gridCellPixelSize.height
  );

  const renderedNotes = notes.filter(
    (note) => getNoteContentFormat(note) === "html" || note.id === activeNoteId
  );
  const mapStage = mapStageRef.current;
  const mapImage = mapStage?.findOne("#mapImage");

  if (!mapStage || !mapImage) {
    return null;
  }

  return (
    <Box
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      {renderedNotes.map((note) => {
        const { canView, canViewText } = getNoteVisibility(note, map, userId || undefined);
        if (!canView || !canViewText) {
          return null;
        }
        const noteWidth = minCellSize * note.size;
        const notePadding = noteWidth / 10;
        const effectiveStyle =
          note.id === activeNoteId && draftStyle ? draftStyle : note.style;
        const fontScale = effectiveStyle?.fontScale || "md";
        const fontScaleMap: Record<string, number> = {
          xs: 0.5,
          sm: 0.75,
          md: 1,
          lg: 1.5,
          xl: 2,
          huge: 3,
        };
        const fontFactor =
          typeof effectiveStyle?.fontSize === "number"
            ? effectiveStyle.fontSize
            : fontScaleMap[fontScale] ?? 1;
        const fontSize = minCellSize * fontFactor * stageScale;
        const fontFamily =
          effectiveStyle?.fontFamily === "handwritten"
            ? "Pacifico, cursive"
            : effectiveStyle?.fontFamily === "runic"
                ? "Bree Serif, serif"
              : effectiveStyle?.fontFamily === "serif"
                ? "Georgia, serif"
                : "Arial, sans-serif";
        const backgroundMode = effectiveStyle?.backgroundMode || "none";
        const textColor =
          backgroundMode === "frame"
            ? "black"
            : resolveColor(effectiveStyle?.textColor, "white");
        const hasBackground = backgroundMode !== "none";
        const width = hasBackground ? noteWidth * stageScale : undefined;
        const padding = hasBackground ? notePadding * stageScale : 0;
        const dimOpacity =
          note.visible === false && map?.owner === userId ? 0.5 : 1;

        const absolute = mapImage
          .getAbsoluteTransform()
          .copy()
          .point({ x: note.x * mapWidth, y: note.y * mapHeight });
        const left = absolute.x;
        const top = absolute.y;
        const rotation = note.rotation || 0;
        const isActive = note.id === activeNoteId;
        const html = isActive ? draftContent : getNoteContent(note);

        return (
          <Box
            key={note.id}
            sx={{
              position: "absolute",
              left: `${left}px`,
              top: `${top}px`,
              transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
              transformOrigin: "center",
              pointerEvents: isActive && isEditing ? "auto" : "none",
              opacity: dimOpacity,
            }}
          >
            {isActive && isEditing ? (
              <NoteEditor
                html={html}
                editorRef={editorRef}
                autoFocus={autoFocus}
                fontFamily={fontFamily}
                fontSize={fontSize}
                color={textColor}
                padding={padding}
                width={width}
                onChange={onContentChange}
                onDone={onDone}
              />
            ) : (
              <Box
                as="div"
                sx={{
                  display: "inline-block",
                  width: width ? `${width}px` : "fit-content",
                  color: textColor,
                  fontFamily,
                  fontSize: `${fontSize}px`,
                  lineHeight: 1.2,
                  padding: `${padding}px`,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  "& p": { margin: 0 },
                  "& h1": { margin: 0, fontSize: "1.6em", fontWeight: 700 },
                  "& h2": { margin: 0, fontSize: "1.2em", fontWeight: 700 },
                  "& ul, & ol": { margin: 0, paddingLeft: "1.2em" },
                }}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}

export default NoteTextOverlay;
