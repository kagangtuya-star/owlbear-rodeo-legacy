import { useEffect, useState, useRef } from "react";
import type { ComponentType, ReactNode, Ref } from "react";
import { Group, Rect, Text } from "react-konva";
import Konva from "konva";
import { useSpring, animated } from "@react-spring/konva";
import type { SpringValue } from "@react-spring/core";

import { useUserId } from "../../contexts/UserIdContext";
import {
  useSetPreventMapInteraction,
  useMapWidth,
  useMapHeight,
  leftMouseButton,
} from "../../contexts/MapInteractionContext";
import { useGridCellPixelSize } from "../../contexts/GridContext";

import colors from "../../helpers/colors";

import usePrevious from "../../hooks/usePrevious";
import useGridSnapping from "../../hooks/useGridSnapping";

import { Note as NoteType, NoteStyle } from "../../types/Note";
import {
  NoteChangeEventHandler,
  NoteDragEventHandler,
  NoteMenuCloseEventHandler,
  NoteMenuOpenEventHandler,
} from "../../types/Events";
import { Map } from "../../types/Map";
import { getNoteContentFormat, getNoteVisibility, resolveColor } from "../../helpers/notes";

import Transformer from "./Transformer";

const defaultFontSize = 144;
const minFontSize = 16;

type KonvaEventHandler = (event: Konva.KonvaEventObject<any>) => void;

type NoteGroupEvents = {
  onClick?: KonvaEventHandler;
  onTap?: KonvaEventHandler;
  onDragStart?: KonvaEventHandler;
  onDragEnd?: KonvaEventHandler;
  onDragMove?: KonvaEventHandler;
  onMouseDown?: KonvaEventHandler;
  onMouseUp?: KonvaEventHandler;
  onTouchStart?: KonvaEventHandler;
  onTouchEnd?: KonvaEventHandler;
  onMouseEnter?: KonvaEventHandler;
  onMouseLeave?: KonvaEventHandler;
};

type AnimatedGroupProps = Omit<Konva.ContainerConfig, "x" | "y"> &
  NoteGroupEvents & {
    children?: ReactNode;
    ref?: Ref<Konva.Group>;
    x?: number | SpringValue<number>;
    y?: number | SpringValue<number>;
  };

// 缩减动画组件的类型层级，避免 TS2589 的无限展开
const animatedFactory = animated as unknown as (
  component: ComponentType<any>
) => ComponentType<any>;

const AnimatedGroup = animatedFactory(
  Group as unknown as ComponentType<AnimatedGroupProps>
) as ComponentType<AnimatedGroupProps>;

type NoteProps = {
  note: NoteType;
  map: Map | null;
  onNoteChange?: NoteChangeEventHandler;
  onNoteMenuOpen?: NoteMenuOpenEventHandler;
  onNoteEditOpen?: NoteMenuOpenEventHandler;
  onNoteMenuClose?: NoteMenuCloseEventHandler;
  editable: boolean;
  openOnClick?: boolean;
  openOnDoubleClick?: boolean;
  allowSingleClickEdit?: boolean;
  draggable: boolean;
  onNoteDragStart?: NoteDragEventHandler;
  onNoteDragEnd?: NoteDragEventHandler;
  fadeOnHover: boolean;
  selected: boolean;
};

function Note({
  note,
  map,
  onNoteChange,
  onNoteMenuOpen,
  onNoteEditOpen,
  onNoteMenuClose,
  editable,
  openOnClick,
  openOnDoubleClick,
  allowSingleClickEdit,
  draggable,
  onNoteDragStart,
  onNoteDragEnd,
  fadeOnHover,
  selected,
}: NoteProps) {
  const userId = useUserId();

  const mapWidth = useMapWidth();
  const mapHeight = useMapHeight();
  const setPreventMapInteraction = useSetPreventMapInteraction();

  const gridCellPixelSize = useGridCellPixelSize();

  const minCellSize = Math.min(
    gridCellPixelSize.width,
    gridCellPixelSize.height
  );
  const noteWidth = minCellSize * note.size;
  const noteHeight = noteWidth;
  const notePadding = noteWidth / 10;
  const contentFormat = getNoteContentFormat(note);
  const showKonvaText = contentFormat !== "html";
  const usesTextHud = note.textOnly || contentFormat === "html";

  const fontScaleMap = {
    xs: 0.5,
    sm: 0.75,
    md: 1,
    lg: 1.5,
    xl: 2,
    huge: 3,
  } as const;

  function resolveStyle(): NoteStyle {
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

  function resolveFontScale(value: number) {
    let closest: keyof typeof fontScaleMap = "md";
    let closestDistance = Number.POSITIVE_INFINITY;
    (Object.keys(fontScaleMap) as Array<keyof typeof fontScaleMap>).forEach(
      (key) => {
        const distance = Math.abs(fontScaleMap[key] - value);
        if (distance < closestDistance) {
          closestDistance = distance;
          closest = key;
        }
      }
    );
    return closest;
  }

  const snapPositionToGrid = useGridSnapping();

  function handleDragStart(event: Konva.KonvaEventObject<DragEvent>) {
    onNoteDragStart?.(event, note.id);
  }

  function handleDragMove(event: Konva.KonvaEventObject<DragEvent>) {
    const noteGroup = event.target;
    // Snap to corners of grid
    if (map?.snapToGrid) {
      noteGroup.position(snapPositionToGrid(noteGroup.position()));
    }
  }

  function handleDragEnd(event: Konva.KonvaEventObject<DragEvent>) {
    const noteGroup = event.target;
    if (userId) {
      onNoteChange?.({
        [note.id]: {
          x: noteGroup.x() / mapWidth,
          y: noteGroup.y() / mapHeight,
          lastModifiedBy: userId,
          lastModified: Date.now(),
        },
      });
    }
    onNoteDragEnd?.(event, note.id);
    setPreventMapInteraction(false);
  }

  function handleDoubleClick(event: Konva.KonvaEventObject<MouseEvent>) {
    if (!leftMouseButton(event)) {
      return;
    }
    if (!openOnDoubleClick) {
      return;
    }
    if (!(editable || (note.locked && map?.owner === userId))) {
      return;
    }
    const noteNode = event.target;
    const openHandler =
      usesTextHud && allowSingleClickEdit && onNoteEditOpen
        ? onNoteEditOpen
        : onNoteMenuOpen;
    openHandler && openHandler(note.id, noteNode, true);
  }

  function handleClick(event: Konva.KonvaEventObject<MouseEvent>) {
    if (!leftMouseButton(event)) {
      return;
    }
    if (!openOnClick) {
      return;
    }
    if (!(editable || (note.locked && map?.owner === userId))) {
      return;
    }
    const noteNode = event.target;
    const openHandler =
      usesTextHud && onNoteEditOpen ? onNoteEditOpen : onNoteMenuOpen;
    openHandler && openHandler(note.id, noteNode, true);
  }

  function handlePointerDown(event: Konva.KonvaEventObject<PointerEvent>) {
    if (!leftMouseButton(event)) {
      return;
    }
    if (draggable) {
      setPreventMapInteraction(true);
    }
  }

  function handlePointerUp(event: Konva.KonvaEventObject<PointerEvent>) {
    if (!leftMouseButton(event)) {
      return;
    }
    if (draggable) {
      setPreventMapInteraction(false);
    }
  }

  const [noteOpacity, setNoteOpacity] = useState(1);
  function handlePointerEnter() {
    if (fadeOnHover) {
      setNoteOpacity(0.5);
    }
  }

  function handlePointerLeave() {
    if (noteOpacity !== 1.0) {
      setNoteOpacity(1.0);
    }
  }

  const [fontScale, setFontScale] = useState(1);
  useEffect(() => {
    const textNode = textRef.current;
    if (!textNode || !showKonvaText) {
      setFontScale(1);
      return;
    }
    function findFontSize() {
      // Create an array from 1 / minFontSize of the note height to the full note height
      let sizes = Array.from(
        { length: Math.ceil(noteHeight - notePadding * 2) },
        (_, i) => i + Math.ceil(noteHeight / minFontSize)
      );

      if (sizes.length > 0) {
        const size = sizes.reduce((prev, curr) => {
          if (!textNode) {
            return prev;
          }
          textNode.fontSize(curr);
          const width = textNode.getTextWidth() + notePadding * 2;
          const height = textNode.height() + notePadding * 2;
          if (width < noteWidth && height < noteHeight) {
            return curr;
          } else {
            return prev;
          }
        });
        setFontScale(size / defaultFontSize);
      }
    }

    findFontSize();
  }, [note, note.text, note.visible, noteWidth, noteHeight, notePadding, showKonvaText]);

  const textRef = useRef<Konva.Text>(null);

  const noteRef = useRef<Konva.Group>(null);
  const [isTransforming, setIsTransforming] = useState(false);
  function handleTransformStart() {
    setIsTransforming(true);
    onNoteMenuClose?.();
  }

  function handleTransformEnd(event: Konva.KonvaEventObject<Event>) {
    if (noteRef.current) {
      const target =
        (event.target as Konva.Node | undefined) || noteRef.current;
      if (!target || typeof (target as any).scaleX !== "function") {
        setIsTransforming(false);
        return;
      }
      const sizeChange = (target as Konva.Node).scaleX();
      const rotation = (target as Konva.Node).rotation();
      if (usesTextHud) {
        const currentStyle = resolveStyle();
        const currentScale =
          typeof currentStyle.fontSize === "number"
            ? currentStyle.fontSize
            : fontScaleMap[currentStyle.fontScale];
        const nextScale = currentScale * sizeChange;
        const nextFontScale = resolveFontScale(nextScale);
        const styleChanged =
          Math.abs(nextScale - currentScale) > 0.001 ||
          nextFontScale !== currentStyle.fontScale;
        if (styleChanged || rotation !== note.rotation) {
          const nextStyle: NoteStyle = {
            ...currentStyle,
            fontScale: nextFontScale,
            fontSize: nextScale,
          };
          onNoteChange?.({
            [note.id]: {
              style: nextStyle,
              textOnly: nextStyle.backgroundMode === "none",
              rotation: rotation,
            },
          });
        }
      } else {
        onNoteChange?.({
          [note.id]: {
            size: note.size * sizeChange,
            rotation: rotation,
          },
        });
        onNoteMenuOpen?.(note.id, noteRef.current, false);
      }
      noteRef.current.scaleX(1);
      noteRef.current.scaleY(1);
    }
    setIsTransforming(false);
  }

  // Animate to new note positions if edited by others
  const noteX = note.x * mapWidth;
  const noteY = note.y * mapHeight;
  const previousWidth = usePrevious(mapWidth);
  const previousHeight = usePrevious(mapHeight);
  const resized = mapWidth !== previousWidth || mapHeight !== previousHeight;
  const skipAnimation = note.lastModifiedBy === userId || resized;
  const springProps = useSpring<{ x: number; y: number }>({
    x: noteX,
    y: noteY,
    immediate: skipAnimation,
  });

  const { canView, canViewText } = getNoteVisibility(note, map, userId || undefined);
  if (!canView) {
    return null;
  }

  const hasStyle = !!note.style;
  const backgroundMode = note.style?.backgroundMode || "none";
  const backgroundFill = hasStyle
    ? backgroundMode === "scrim"
      ? "rgba(0, 0, 0, 0.5)"
      : backgroundMode === "frame"
        ? "rgb(255, 255, 255)"
        : null
    : note.textOnly
      ? null
      : colors[note.color];
  const needsHitRect = !showKonvaText && !backgroundFill;
  const textColor = hasStyle
    ? backgroundMode === "frame"
      ? "black"
      : resolveColor(note.style?.textColor, "white")
    : note.textOnly
      ? colors[note.color]
      : note.color === "black" || note.color === "darkGray"
        ? "white"
        : "black";
  const noteFontFamily = note.style?.fontFamily;
  const fontFamily =
    noteFontFamily === "handwritten"
      ? "Pacifico, cursive"
      : noteFontFamily === "runic"
        ? "Bree Serif, serif"
        : noteFontFamily === "serif"
          ? "Georgia, serif"
          : "Arial, sans-serif";

  const noteName = `note${note.locked ? "-locked" : ""}`;

  return (
    <>
      <AnimatedGroup
        {...springProps}
        id={note.id}
        onClick={handleClick}
        onDblClick={handleDoubleClick}
        onTap={handleClick}
        onDblTap={handleDoubleClick}
        width={noteWidth}
        height={backgroundFill ? noteHeight : undefined}
        rotation={note.rotation}
        offsetX={noteWidth / 2}
        offsetY={noteHeight / 2}
        draggable={draggable}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragMove={handleDragMove}
        onMouseDown={handlePointerDown}
        onMouseUp={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchEnd={handlePointerUp}
        onMouseEnter={handlePointerEnter}
        onMouseLeave={handlePointerLeave}
        opacity={note.visible ? noteOpacity : 0.5}
        name={noteName}
        ref={noteRef}
      >
        {needsHitRect && (
          <Rect width={noteWidth} height={noteHeight} fill="rgba(0,0,0,0)" />
        )}
        {backgroundFill && (
          <Rect
            width={noteWidth}
            height={noteHeight}
            shadowColor="rgba(0, 0, 0, 0.16)"
            shadowOffset={{ x: 0, y: 3 }}
            shadowBlur={6}
            cornerRadius={0.25}
            fill={backgroundFill}
          />
        )}
        {showKonvaText && canViewText && (
          <>
            <Text
              text={note.text}
              fill={textColor}
              align="left"
              verticalAlign="middle"
              padding={notePadding / fontScale}
              fontSize={defaultFontSize}
              fontFamily={fontFamily}
              // Scale font instead of changing font size to avoid kerning issues with Firefox
              scaleX={fontScale}
              scaleY={fontScale}
              width={noteWidth / fontScale}
              height={backgroundFill ? noteHeight / fontScale : undefined}
              wrap="word"
            />
            {/* Use an invisible text block to work out text sizing */}
            <Text visible={false} ref={textRef} text={note.text} wrap="none" />
          </>
        )}
      </AnimatedGroup>
      <Transformer
        active={(!note.locked && selected) || isTransforming}
        nodes={noteRef.current ? [noteRef.current] : []}
        onTransformEnd={handleTransformEnd}
        onTransformStart={handleTransformStart}
        gridScale={map?.grid.measurement.scale || ""}
        resizeEnabled={usesTextHud ? false : undefined}
      />
    </>
  );
}

Note.defaultProps = {
  fadeOnHover: false,
  editable: false,
  openOnClick: false,
  openOnDoubleClick: false,
  allowSingleClickEdit: false,
  draggable: false,
};

export default Note;
