import { useEffect, useRef } from "react";
import { Box, Button, Flex, IconButton, Text, useColorMode } from "theme-ui";

import FullScreenExitIcon from "../../icons/FullScreenExitIcon";
import FullScreenIcon from "../../icons/FullScreenIcon";
import EditTileIcon from "../../icons/EditTileIcon";

import TokenImage from "./TokenImage";
import TokenNoteEditor from "./TokenNoteEditor";

import { Token } from "../../types/Token";
import { TokenState } from "../../types/TokenState";
import { TokenNoteStyle } from "../../types/TokenNote";
import type { TokenNoteLockReleaseReason } from "../../network/TokenNoteLockProtocol";

type TokenNoteSheetProps = {
  isOpen: boolean;
  tokenState?: TokenState;
  token?: Token;
  content: string;
  style: TokenNoteStyle;
  canRead: boolean;
  canEdit: boolean;
  isEditing: boolean;
  isExpanded: boolean;
  blur: "none" | "low" | "high";
  fontSize: "sm" | "md" | "lg";
  lockOwnerId?: string;
  lockReleaseReason?: TokenNoteLockReleaseReason | null;
  onRequestClose: () => void;
  onToggleExpanded: () => void;
  onRequestEdit: () => void;
  onEditorBlur: () => void;
  onContentChange: (value: string) => void;
  onStyleChange: (style: Partial<TokenNoteStyle>) => void;
};

function TokenNoteSheet({
  isOpen,
  tokenState,
  token,
  content,
  style,
  canRead,
  canEdit,
  isEditing,
  isExpanded,
  blur,
  fontSize,
  lockOwnerId,
  lockReleaseReason,
  onRequestClose,
  onToggleExpanded,
  onRequestEdit,
  onEditorBlur,
  onContentChange,
  onStyleChange,
}: TokenNoteSheetProps) {
  const [colorMode] = useColorMode();
  const sheetRef = useRef<HTMLDivElement>(null);
  const isLocked = !!lockOwnerId;
  const releaseMessage =
    lockReleaseReason === "timeout"
      ? "对方超时，便签已解锁"
      : lockReleaseReason === "disconnect"
      ? "对方断开，便签已解锁"
      : lockReleaseReason === "owner"
      ? "对方已结束编辑"
      : "";
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!sheetRef.current) {
        return;
      }
      const target = event.target as Node | null;
      if (target && !sheetRef.current.contains(target)) {
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

  if (!isOpen || !canRead) {
    return null;
  }

  const background =
    colorMode === "light"
      ? "rgba(255, 255, 255, 0.6)"
      : "rgba(30, 30, 35, 0.6)";
  const blurAmount = blur === "none" ? "0px" : blur === "low" ? "6px" : "12px";
  const sheetHeight = isExpanded ? ["80vh", "70vh"] : ["55vh", "40vh"];
  const fontFamily =
    style.fontFamily === "handwritten"
      ? "Pacifico, cursive"
      : style.fontFamily === "rune"
        ? "Bree Serif, serif"
        : "inherit";
  const fontSizeValue = fontSize === "sm" ? "12px" : fontSize === "lg" ? "16px" : "14px";
  const headerTitle = tokenState?.label || token?.name || "Token";

  const palette = [
    { id: "red", color: "rgba(220, 70, 70, 0.2)" },
    { id: "green", color: "rgba(70, 180, 120, 0.2)" },
    { id: "blue", color: "rgba(70, 120, 200, 0.2)" },
    { id: "purple", color: "rgba(160, 90, 200, 0.2)" },
    { id: "gold", color: "rgba(200, 170, 80, 0.2)" },
  ];
  return (
    <Box
      sx={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
        display: "flex",
        justifyContent: "center",
        pointerEvents: isOpen ? "auto" : "none",
        px: [2, 3],
        pb: [2, 2],
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <Box
        ref={sheetRef}
        sx={{
          width: "100%",
          maxWidth: ["100%", "720px"],
          height: sheetHeight,
          backgroundColor: background,
          borderTopLeftRadius: "16px",
          borderTopRightRadius: "16px",
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          border: "1px solid",
          borderColor: "border",
          backdropFilter: `blur(${blurAmount})`,
          WebkitBackdropFilter: `blur(${blurAmount})`,
          transform: isOpen ? "translateY(0)" : "translateY(100%)",
          opacity: isOpen ? 1 : 0,
          transition: "transform 200ms ease, opacity 200ms ease",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Flex
          sx={{
            alignItems: "center",
            justifyContent: "space-between",
            px: [2, 3],
            py: 2,
          }}
        >
          <Flex sx={{ alignItems: "center", gap: 2 }}>
            {token && (
              <Box sx={{ width: "32px", height: "32px" }}>
                <TokenImage token={token} alt={headerTitle} />
              </Box>
            )}
            <Text variant="body2">{headerTitle}</Text>
          </Flex>
          <Flex sx={{ alignItems: "center", gap: 1 }}>
            {canEdit && !isEditing && !isLocked && (
              <IconButton
                aria-label="Edit"
                title="Edit"
                onClick={onRequestEdit}
              >
                <EditTileIcon />
              </IconButton>
            )}
            <IconButton
              aria-label={isExpanded ? "Exit Fullscreen" : "Fullscreen"}
              title={isExpanded ? "Exit Fullscreen" : "Fullscreen"}
              onClick={onToggleExpanded}
            >
              {isExpanded ? <FullScreenExitIcon /> : <FullScreenIcon />}
            </IconButton>
            <IconButton aria-label="Close" title="Close" onClick={onRequestClose}>
              <Text as="span">X</Text>
            </IconButton>
          </Flex>
        </Flex>
        <Box
          sx={{
            width: "48px",
            height: "4px",
            backgroundColor: "border",
            borderRadius: "999px",
            alignSelf: "center",
            mb: 2,
          }}
        />
        {isLocked && (
          <Text variant="caption" sx={{ px: [2, 3], pb: 2 }}>
            对方正在输入…
          </Text>
        )}
        {!isLocked && releaseMessage && (
          <Text variant="caption" sx={{ px: [2, 3], pb: 2 }}>
            {releaseMessage}
          </Text>
        )}
        {isEditing && canEdit && (
          <Flex sx={{ px: [2, 3], pb: 2, gap: 2, flexWrap: "wrap" }}>
            <Flex sx={{ gap: 1 }}>
              <Button
                variant="secondary"
                onClick={() => onStyleChange({ fontFamily: "default" })}
              >
                System
              </Button>
              <Button
                variant="secondary"
                onClick={() => onStyleChange({ fontFamily: "handwritten" })}
              >
                Handwritten
              </Button>
              <Button
                variant="secondary"
                onClick={() => onStyleChange({ fontFamily: "rune" })}
              >
                Runic
              </Button>
            </Flex>
            <Flex sx={{ gap: 1 }}>
              {palette.map((item) => (
                <Box
                  key={item.id}
                  sx={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    backgroundColor: item.color,
                    border: "1px solid",
                    borderColor: "border",
                    cursor: "pointer",
                  }}
                  onClick={() => onStyleChange({ backgroundColor: item.color })}
                />
              ))}
              <Box
                sx={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  border: "1px solid",
                  borderColor: "border",
                  cursor: "pointer",
                  backgroundColor: "transparent",
                }}
                onClick={() => onStyleChange({ backgroundColor: undefined })}
              />
            </Flex>
          </Flex>
        )}
        <Box
          data-note-scroll="true"
          sx={{
            flexGrow: 1,
            px: [2, 3],
            pb: [2, 3],
            fontFamily,
            fontSize: fontSizeValue,
            lineHeight: 1.4,
            backgroundColor: style.backgroundColor || "transparent",
            opacity: isLocked ? 0.6 : 1,
            filter: isLocked ? "grayscale(0.15)" : "none",
            transition: "opacity 150ms ease",
            minHeight: 0,
            overflowY: "auto",
            scrollbarWidth: "thin",
            "&::-webkit-scrollbar": {
              width: "2px",
            },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: "rgba(0, 0, 0, 0.15)",
              borderRadius: "999px",
            },
            "&::-webkit-scrollbar-track": {
              backgroundColor: "transparent",
            },
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
          editable={canEdit && isEditing}
          showToolbar={canEdit && isEditing}
          onChange={onContentChange}
          onBlur={(event) => {
            const nextTarget = event.relatedTarget as Node | null;
            if (nextTarget && sheetRef.current?.contains(nextTarget)) {
              return;
            }
            onEditorBlur();
          }}
        />
      </Box>
      </Box>
    </Box>
  );
}

export default TokenNoteSheet;
