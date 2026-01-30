import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Flex,
  IconButton,
  Input,
  Text,
  ThemeUIStyleObject,
} from "theme-ui";

import Divider from "../Divider";
import colors from "../../helpers/colors";
import { resolveColor } from "../../helpers/notes";
import { Note, NoteStyle } from "../../types/Note";

type AdvancedTextHudProps = {
  isOpen: boolean;
  note?: Note;
  draftStyle: NoteStyle;
  canEdit: boolean;
  canManage: boolean;
  attachMode: boolean;
  onRequestClose: () => void;
  onStyleChange: (change: Partial<NoteStyle>) => void;
  onCommand: (command: string, value?: string) => void;
  onToggleTextVisible: () => void;
  onToggleVisibility: () => void;
  onToggleAttach: () => void;
};

const palette: Array<keyof typeof colors> = [
  "red",
  "yellow",
  "white",
  "black",
  "teal",
  "blue",
  "green",
  "pink",
  "darkGray",
];

const fontOptions = [
  { value: "rounded", label: "Rounded" },
  { value: "serif", label: "Serif" },
  { value: "handwritten", label: "Handwritten" },
  { value: "runic", label: "Runic" },
];

const sizeOptions = [
  { fontScale: "xs", fontSize: 0.5, label: "0.5x" },
  { fontScale: "sm", fontSize: 0.75, label: "0.75x" },
  { fontScale: "md", fontSize: 1, label: "1x" },
  { fontScale: "lg", fontSize: 1.5, label: "1.5x" },
  { fontScale: "xl", fontSize: 2, label: "2x" },
  { fontScale: "huge", fontSize: 3, label: "3x" },
];

function AdvancedTextHud({
  isOpen,
  note,
  draftStyle,
  canEdit,
  canManage,
  attachMode,
  onRequestClose,
  onStyleChange,
  onCommand,
  onToggleTextVisible,
  onToggleVisibility,
  onToggleAttach,
}: AdvancedTextHudProps) {
  const [hexValue, setHexValue] = useState("#ffffff");
  const [formatState, setFormatState] = useState({
    bold: false,
    italic: false,
    ul: false,
    ol: false,
  });
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  const hudRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setColorMenuOpen(false);
      setFontMenuOpen(false);
      setSizeMenuOpen(false);
      return;
    }
    function handleSelectionChange() {
      try {
        setFormatState({
          bold: document.queryCommandState("bold"),
          italic: document.queryCommandState("italic"),
          ul: document.queryCommandState("insertUnorderedList"),
          ol: document.queryCommandState("insertOrderedList"),
        });
      } catch {
        // Ignore unsupported environments
      }
    }
    document.addEventListener("selectionchange", handleSelectionChange);
    handleSelectionChange();
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [isOpen]);

  const anyMenuOpen = colorMenuOpen || fontMenuOpen || sizeMenuOpen;
  useEffect(() => {
    if (!anyMenuOpen) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      if (!hudRef.current) {
        return;
      }
      if (hudRef.current.contains(event.target as Node)) {
        return;
      }
      setColorMenuOpen(false);
      setFontMenuOpen(false);
      setSizeMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [anyMenuOpen]);

  useEffect(() => {
    if (!note) {
      return;
    }
    setHexValue(resolveColor(draftStyle.textColor, "#ffffff"));
  }, [note, draftStyle.textColor]);

  const visibilityLabel = useMemo(() => {
    const visibility = note?.visibility || "all";
    if (visibility === "gm") {
      return "GM";
    }
    if (visibility === "owner") {
      return "Owner";
    }
    return "All";
  }, [note?.visibility]);

  if (!isOpen || !note) {
    return null;
  }

  const buttonSx = (active?: boolean) => ({
    width: "28px",
    height: "28px",
    padding: 0,
    borderRadius: "999px",
    backgroundColor: active ? "rgba(255, 255, 255, 0.16)" : "transparent",
    color: "text",
    border: "1px solid",
    borderColor: "muted",
    "&:hover": {
      backgroundColor: "rgba(255, 255, 255, 0.1)",
    },
  });

  const pillButtonSx = (active?: boolean) => ({
    height: "28px",
    borderRadius: "999px",
    border: "1px solid",
    borderColor: "muted",
    backgroundColor: active ? "rgba(255, 255, 255, 0.16)" : "rgba(255, 255, 255, 0.08)",
    color: "text",
    fontSize: 1,
    px: 2,
    cursor: "pointer",
  });

  const menuSx: ThemeUIStyleObject = {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    backgroundColor: "rgba(20, 20, 24, 0.98)",
    borderRadius: "12px",
    p: 2,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
    minWidth: "140px",
    zIndex: 2,
  };

  function handleHexCommit(value: string) {
    const trimmed = value.trim();
    const normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
      onStyleChange({ textColor: normalized.toLowerCase() });
    }
  }

  function handleBackgroundToggle() {
    const current = draftStyle.backgroundMode;
    const next =
      current === "none" ? "scrim" : current === "scrim" ? "frame" : "none";
    onStyleChange({ backgroundMode: next });
  }

  const swatchColor = resolveColor(draftStyle.textColor, "#ffffff");
  const currentFontLabel =
    fontOptions.find((option) => option.value === draftStyle.fontFamily)
      ?.label || "Font";
  const currentSizeLabel = (() => {
    if (typeof draftStyle.fontSize === "number") {
      let closest = sizeOptions[2];
      let closestDistance = Number.POSITIVE_INFINITY;
      for (const option of sizeOptions) {
        const distance = Math.abs(option.fontSize - draftStyle.fontSize);
        if (distance < closestDistance) {
          closestDistance = distance;
          closest = option;
        }
      }
      return closest.label;
    }
    return (
      sizeOptions.find((option) => option.fontScale === draftStyle.fontScale)
        ?.label || "1x"
    );
  })();

  return (
    <Box
      data-text-hud="true"
      sx={{
        position: "absolute",
        top: 8,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 30,
        pointerEvents: "auto",
      }}
    >
      <Flex
        ref={hudRef}
        sx={{
          alignItems: "center",
          gap: 2,
          px: 2,
          py: 1,
          borderRadius: 9999,
          backgroundColor: "rgba(20, 20, 24, 0.9)",
          color: "text",
          boxShadow: "0 6px 20px rgba(0, 0, 0, 0.35)",
          position: "relative",
        }}
      >
        <Flex sx={{ alignItems: "center", gap: 1 }}>
          <Box sx={{ position: "relative" }}>
            <IconButton
              onClick={() => setColorMenuOpen((prev) => !prev)}
              title="Text color"
              aria-label="Text color"
              sx={buttonSx()}
              disabled={!canEdit}
            >
              <Box
                sx={{
                  width: "14px",
                  height: "14px",
                  borderRadius: "999px",
                  backgroundColor: swatchColor,
                  border: "1px solid",
                  borderColor: "muted",
                }}
              />
            </IconButton>
            {colorMenuOpen && (
              <Box
                sx={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  backgroundColor: "rgba(20, 20, 24, 0.98)",
                  borderRadius: "12px",
                  p: 2,
                  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
                  width: "116px",
                }}
              >
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 12px)",
                    gap: "6px",
                    mb: 2,
                  }}
                >
                  {palette.map((colorKey) => (
                    <Box
                      key={colorKey}
                      sx={{
                        width: "12px",
                        height: "12px",
                        borderRadius: "999px",
                        backgroundColor: colors[colorKey],
                        outline:
                          draftStyle.textColor === colorKey
                            ? "2px solid white"
                            : "none",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        setHexValue(colors[colorKey]);
                        onStyleChange({ textColor: colorKey });
                        setColorMenuOpen(false);
                      }}
                      aria-label={`Text color ${colorKey}`}
                    />
                  ))}
                </Box>
                <Input
                  value={hexValue}
                  onChange={(event) => setHexValue(event.target.value)}
                  onBlur={(event) => handleHexCommit(event.target.value)}
                  sx={{ width: "100%", height: "26px", fontSize: 1 }}
                />
              </Box>
            )}
          </Box>
          <IconButton
            onClick={handleBackgroundToggle}
            title="Toggle background"
            aria-label="Toggle background"
            sx={buttonSx(draftStyle.backgroundMode !== "none")}
            disabled={!canEdit}
          >
            <Box
              sx={{
                width: "14px",
                height: "14px",
                borderRadius: "999px",
                border: "1px solid",
                borderColor: "text",
                position: "relative",
                "&::after": {
                  content: '""',
                  position: "absolute",
                  left: "-2px",
                  right: "-2px",
                  top: "50%",
                  height: "1px",
                  backgroundColor: "text",
                  transform: "rotate(-45deg)",
                },
              }}
            />
          </IconButton>
          <Box sx={{ position: "relative" }}>
            <Box
              as="button"
              onClick={() => {
                if (!canEdit) {
                  return;
                }
                setFontMenuOpen((prev) => !prev);
                setSizeMenuOpen(false);
                setColorMenuOpen(false);
              }}
              sx={{ ...pillButtonSx(fontMenuOpen), minWidth: "96px" }}
              aria-disabled={!canEdit}
            >
              {currentFontLabel}
            </Box>
            {fontMenuOpen && (
              <Box sx={menuSx}>
                {fontOptions.map((option) => {
                  const active = option.value === draftStyle.fontFamily;
                  return (
                    <Box
                      key={option.value}
                      as="button"
                      onClick={() => {
                        onStyleChange({
                          fontFamily: option.value as NoteStyle["fontFamily"],
                        });
                        setFontMenuOpen(false);
                      }}
                      sx={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        background: "transparent",
                        border: "none",
                        color: "text",
                        px: 2,
                        py: 1,
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontSize: 1,
                        backgroundColor: active
                          ? "rgba(255, 255, 255, 0.12)"
                          : "transparent",
                        "&:hover": {
                          backgroundColor: "rgba(255, 255, 255, 0.08)",
                        },
                      }}
                    >
                      {option.label}
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
          <Box sx={{ position: "relative" }}>
            <Box
              as="button"
              onClick={() => {
                if (!canEdit) {
                  return;
                }
                setSizeMenuOpen((prev) => !prev);
                setFontMenuOpen(false);
                setColorMenuOpen(false);
              }}
              sx={{ ...pillButtonSx(sizeMenuOpen), minWidth: "64px" }}
              aria-disabled={!canEdit}
            >
              {currentSizeLabel}
            </Box>
            {sizeMenuOpen && (
              <Box sx={{ ...menuSx, minWidth: "100px" }}>
                {sizeOptions.map((option) => {
                  const active =
                    option.fontScale === draftStyle.fontScale ||
                    option.fontSize === draftStyle.fontSize;
                  return (
                    <Box
                      key={option.fontScale}
                      as="button"
                      onClick={() => {
                        onStyleChange({
                          fontScale: option.fontScale as NoteStyle["fontScale"],
                          fontSize: option.fontSize,
                        });
                        setSizeMenuOpen(false);
                      }}
                      sx={{
                        display: "block",
                        width: "100%",
                        textAlign: "center",
                        background: "transparent",
                        border: "none",
                        color: "text",
                        px: 2,
                        py: 1,
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontSize: 1,
                        backgroundColor: active
                          ? "rgba(255, 255, 255, 0.12)"
                          : "transparent",
                        "&:hover": {
                          backgroundColor: "rgba(255, 255, 255, 0.08)",
                        },
                      }}
                    >
                      {option.label}
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        </Flex>
        <Divider vertical />
        <Flex sx={{ alignItems: "center", gap: 1 }}>
          <IconButton
            onClick={() => onCommand("bold")}
            title="Bold"
            aria-label="Bold"
            sx={buttonSx(formatState.bold)}
            disabled={!canEdit}
          >
            <Text sx={{ fontWeight: "bold" }}>B</Text>
          </IconButton>
          <IconButton
            onClick={() => onCommand("italic")}
            title="Italic"
            aria-label="Italic"
            sx={buttonSx(formatState.italic)}
            disabled={!canEdit}
          >
            <Text sx={{ fontStyle: "italic" }}>I</Text>
          </IconButton>
        </Flex>
        <Divider vertical />
        <Flex sx={{ alignItems: "center", gap: 1 }}>
          <IconButton
            onClick={() => onCommand("insertUnorderedList")}
            title="Bullet list"
            aria-label="Bullet list"
            sx={buttonSx(formatState.ul)}
            disabled={!canEdit}
          >
            <Text sx={{ fontSize: 1 }}>•</Text>
          </IconButton>
          <IconButton
            onClick={() => onCommand("insertOrderedList")}
            title="Numbered list"
            aria-label="Numbered list"
            sx={buttonSx(formatState.ol)}
            disabled={!canEdit}
          >
            <Text sx={{ fontSize: 1 }}>1.</Text>
          </IconButton>
          <IconButton
            onClick={() => onCommand("formatBlock", "H1")}
            title="Header 1"
            aria-label="Header 1"
            sx={buttonSx()}
            disabled={!canEdit}
          >
            <Text sx={{ fontSize: 1 }}>H1</Text>
          </IconButton>
          <IconButton
            onClick={() => onCommand("formatBlock", "H2")}
            title="Header 2"
            aria-label="Header 2"
            sx={buttonSx()}
            disabled={!canEdit}
          >
            <Text sx={{ fontSize: 1 }}>H2</Text>
          </IconButton>
        </Flex>
        <Divider vertical />
        <Flex sx={{ alignItems: "center", gap: 1 }}>
          {canManage && (
            <>
              <IconButton
                onClick={onToggleAttach}
                title={attachMode ? "Click token to attach" : "Attach to token"}
                aria-label="Attach to token"
                sx={buttonSx(attachMode || !!note.attachedToTokenId)}
              >
                <Text sx={{ fontSize: 1 }}>Link</Text>
              </IconButton>
              <IconButton
                onClick={onToggleVisibility}
                title="Toggle visibility"
                aria-label="Toggle visibility"
                sx={buttonSx()}
              >
                <Text sx={{ fontSize: 1 }}>{visibilityLabel}</Text>
              </IconButton>
              <IconButton
                onClick={onToggleTextVisible}
                title="Toggle text visibility"
                aria-label="Toggle text visibility"
                sx={buttonSx(note.textVisible === false)}
              >
                <Text sx={{ fontSize: 1 }}>Txt</Text>
              </IconButton>
            </>
          )}
          <IconButton
            onClick={onRequestClose}
            title="Done"
            aria-label="Done"
            sx={buttonSx()}
          >
            <Text sx={{ fontSize: 1 }}>OK</Text>
          </IconButton>
        </Flex>
      </Flex>
    </Box>
  );
}

export default AdvancedTextHud;
