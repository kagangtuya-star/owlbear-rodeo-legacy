import { useEffect, useRef, useState } from "react";
import { Box, Button, Flex, IconButton, Text, useColorMode } from "theme-ui";
import Konva from "konva";

import { useInteractionEmitter } from "../../contexts/MapInteractionContext";
import { Token } from "../../types/Token";
import { TokenState } from "../../types/TokenState";
import { TokenNoteStyle } from "../../types/TokenNote";
import TokenNoteEditor from "./TokenNoteEditor";

type TokenNotePopoverProps = {
  isOpen: boolean;
  tokenState?: TokenState;
  token?: Token;
  content: string;
  style: TokenNoteStyle;
  canRead: boolean;
  canEdit: boolean;
  anchorNode?: Konva.Node;
  onRequestClose: () => void;
  onRequestExpand: () => void;
  onContentChange: (value: string) => void;
};

function TokenNotePopover({
  isOpen,
  tokenState,
  token,
  content,
  style,
  canRead,
  canEdit,
  anchorNode,
  onRequestClose,
  onRequestExpand,
  onContentChange,
}: TokenNotePopoverProps) {
  const [colorMode] = useColorMode();
  const interactionEmitter = useInteractionEmitter();
  const popoverRef = useRef<HTMLDivElement>(null);
  const anchorRectRef =
    useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  const [left, setLeft] = useState(0);
  const [top, setTop] = useState(0);

  useEffect(() => {
    if (!isOpen || !anchorNode) {
      return;
    }
    const rect = anchorNode.getClientRect();
    anchorRectRef.current = rect;
    const mapElement = document.querySelector(".map");
    if (!mapElement) {
      return;
    }
    const mapRect = mapElement.getBoundingClientRect();
    const nextLeft = mapRect.left + rect.x + rect.width / 2;
    const nextTop = mapRect.top + rect.y;
    setLeft(nextLeft);
    setTop(nextTop);
  }, [anchorNode, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const node = popoverRef.current;
    const mapElement = document.querySelector(".map");
    const anchorRect = anchorRectRef.current;
    if (!node || !mapElement || !anchorRect) {
      return;
    }
    const mapRect = mapElement.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    let desiredLeft =
      mapRect.left + anchorRect.x + anchorRect.width / 2 - nodeRect.width / 2;
    let desiredTop = mapRect.top + anchorRect.y - nodeRect.height - 12;
    if (desiredTop < mapRect.top + 8) {
      desiredTop = mapRect.top + anchorRect.y + anchorRect.height + 12;
    }
    const clampedLeft = Math.min(
      mapRect.right - nodeRect.width - 8,
      Math.max(mapRect.left + 8, desiredLeft)
    );
    const clampedTop = Math.min(
      mapRect.bottom - nodeRect.height - 8,
      Math.max(mapRect.top + 8, desiredTop)
    );
    if (Math.abs(clampedLeft - left) > 1) {
      setLeft(clampedLeft);
    }
    if (Math.abs(clampedTop - top) > 1) {
      setTop(clampedTop);
    }
  }, [isOpen, left, top]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!popoverRef.current) {
        return;
      }
      const target = event.target as Node | null;
      if (target && !popoverRef.current.contains(target)) {
        onRequestClose();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isOpen, onRequestClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function handleDragStart() {
      onRequestClose();
    }
    interactionEmitter?.on("dragStart", handleDragStart);
    return () => {
      interactionEmitter?.off("dragStart", handleDragStart);
    };
  }, [interactionEmitter, isOpen, onRequestClose]);

  if (!isOpen || !canRead) {
    return null;
  }

  const background =
    colorMode === "light"
      ? "rgba(255, 255, 255, 0.7)"
      : "rgba(30, 30, 35, 0.7)";
  const fontFamily =
    style.fontFamily === "handwritten"
      ? "Pacifico, cursive"
      : style.fontFamily === "rune"
        ? "Bree Serif, serif"
        : "inherit";
  const headerTitle = tokenState?.label || token?.name || "Token";

  return (
    <Box
      ref={popoverRef}
      sx={{
        position: "fixed",
        zIndex: 30,
        left: `${left}px`,
        top: `${top}px`,
        width: ["92vw", "230px"],
        maxWidth: "240px",
        backgroundColor: background,
        borderRadius: "12px",
        border: "1px solid",
        borderColor: "border",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        boxShadow: "0 6px 20px rgba(0, 0, 0, 0.25)",
        overflow: "hidden",
      }}
    >
      <Flex sx={{ alignItems: "center", justifyContent: "space-between", px: 2, py: 1 }}>
        <Text variant="body2" sx={{ fontSize: "12px" }}>
          {headerTitle}
        </Text>
        <Flex sx={{ alignItems: "center", gap: 1 }}>
          <Button
            variant="secondary"
            onClick={onRequestExpand}
            sx={{ fontSize: "12px", px: 2, py: 0 }}
          >
            展开
          </Button>
          <IconButton aria-label="Close" title="Close" onClick={onRequestClose}>
            <Text as="span">X</Text>
          </IconButton>
        </Flex>
      </Flex>
      <Box
        data-note-scroll="true"
        sx={{
          px: 2,
          pb: 2,
          fontFamily,
          fontSize: "12px",
          backgroundColor: style.backgroundColor || "transparent",
          lineHeight: 1.4,
          height: ["45vh", "200px"],
          maxHeight: ["45vh", "200px"],
          overflow: "hidden",
          minHeight: 0,
          touchAction: "pan-y",
          overscrollBehavior: "contain",
        }}
        onWheel={(event) => event.stopPropagation()}
        onWheelCapture={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
        onTouchMoveCapture={(event) => event.stopPropagation()}
      >
        <TokenNoteEditor
          content={content}
          editable={canEdit}
          showToolbar={false}
          onChange={onContentChange}
        />
      </Box>
    </Box>
  );
}

export default TokenNotePopover;
