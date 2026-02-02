import { useState } from "react";
import { Box, Flex, Grid, Text, Input, IconButton } from "theme-ui";
import { useToasts } from "react-toast-notifications";

import colors, { colorOptions } from "../../helpers/colors";
import {
  createDefaultBar,
  createDefaultValue,
  parseNumericExpression,
} from "../../helpers/tokenAttributes";
import {
  TokenAttributeBar,
  TokenAttributeState,
  TokenAttributeValue,
} from "../../types/TokenState";

import AddIcon from "../../icons/AddIcon";
import TokenShowIcon from "../../icons/TokenShowIcon";
import TokenHideIcon from "../../icons/TokenHideIcon";

type TokenAttributeEditorProps = {
  attributes: TokenAttributeState;
  onChange: (nextBars: TokenAttributeBar[], nextValues: TokenAttributeValue[]) => void;
  canEdit: boolean;
  title?: string;
  showHeader?: boolean;
  compact?: boolean;
};

function TokenAttributeEditor({
  attributes,
  onChange,
  canEdit,
  title,
  showHeader = true,
  compact = true,
}: TokenAttributeEditorProps) {
  const { addToast } = useToasts();
  const [draftInputs, setDraftInputs] = useState<Record<string, string>>({});
  const [openColorPicker, setOpenColorPicker] = useState<string | null>(null);

  function setDraftInput(key: string, value: string) {
    setDraftInputs((prev) => ({ ...prev, [key]: value }));
  }

  function clearDraftInput(key: string) {
    setDraftInputs((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function commitNumberField(
    key: string,
    rawValue: string,
    currentValue: number,
    onCommit: (next: number | undefined) => void,
    allowEmpty: boolean
  ) {
    const trimmed = rawValue.trim();
    if (allowEmpty && trimmed.length === 0) {
      onCommit(undefined);
      clearDraftInput(key);
      return;
    }
    const result = parseNumericExpression(currentValue, trimmed);
    if (!result.ok) {
      addToast(result.error, { appearance: "error" });
      return;
    }
    onCommit(result.value);
    clearDraftInput(key);
  }

  function updateBarsValues(nextBars: TokenAttributeBar[], nextValues: TokenAttributeValue[]) {
    onChange(nextBars, nextValues);
  }

  function updateBar(barId: string, change: Partial<TokenAttributeBar>) {
    const nextBars = attributes.bars.map((bar) =>
      bar.id === barId ? { ...bar, ...change } : bar
    );
    updateBarsValues(nextBars, attributes.values);
  }

  function updateValue(valueId: string, change: Partial<TokenAttributeValue>) {
    const nextValues = attributes.values.map((value) =>
      value.id === valueId ? { ...value, ...change } : value
    );
    updateBarsValues(attributes.bars, nextValues);
  }

  function removeBar(barId: string) {
    updateBarsValues(
      attributes.bars.filter((bar) => bar.id !== barId),
      attributes.values
    );
  }

  function removeValue(valueId: string) {
    updateBarsValues(
      attributes.bars,
      attributes.values.filter((value) => value.id !== valueId)
    );
  }

  function pickUnusedColor() {
    const usedColors = new Set<string>();
    attributes.bars.forEach((bar) => usedColors.add(bar.color));
    attributes.values.forEach((value) =>
      usedColors.add(value.color || colors.blue)
    );
    for (const color of paletteColors) {
      if (!usedColors.has(color)) {
        return color;
      }
    }
    return paletteColors[0] || colors.blue;
  }

  function addBar() {
    const nextBar = createDefaultBar();
    if (attributes.bars.length > 0) {
      nextBar.showMinMax = showMinMaxAll;
    }
    nextBar.visibility = allVisible ? "public" : "private";
    nextBar.color = pickUnusedColor();
    updateBarsValues([...attributes.bars, nextBar], attributes.values);
  }

  function addValue() {
    const nextValue = createDefaultValue();
    nextValue.visibility = allVisible ? "public" : "private";
    nextValue.color = pickUnusedColor();
    updateBarsValues(attributes.bars, [...attributes.values, nextValue]);
  }

  const allVisible =
    [...attributes.bars, ...attributes.values].length === 0
      ? true
      : [...attributes.bars, ...attributes.values].every(
          (item) => item.visibility !== "private"
        );
  const showMinMaxAll =
    attributes.bars.length > 0 &&
    attributes.bars.every((bar) => bar.showMinMax);

  function setAllVisibility(nextVisible: boolean) {
    updateBarsValues(
      attributes.bars.map((bar) => ({
        ...bar,
        visibility: nextVisible ? "public" : "private",
      })),
      attributes.values.map((value) => ({
        ...value,
        visibility: nextVisible ? "public" : "private",
      }))
    );
  }

  function setAllShowMinMax(nextShow: boolean) {
    updateBarsValues(
      attributes.bars.map((bar) => ({ ...bar, showMinMax: nextShow })),
      attributes.values
    );
  }

  const headerJustify = title ? "space-between" : "flex-end";
  const paletteColors = colorOptions
    .filter((color) => color !== "primary")
    .map((color) => colors[color]);
  const blockSpacing = compact ? 0 : 2;
  const blockPadding = compact ? 1 : 2;
  const smallFontSize = compact ? "12px" : "14px";
  const inputSx = { flex: 1, padding: "4px", fontSize: smallFontSize } as const;
  const labelSx = { fontSize: smallFontSize } as const;
  const dotSize = compact ? 14 : 16;

  return (
    <Box>
      {showHeader && (
        <Flex sx={{ alignItems: "center", justifyContent: headerJustify }}>
          {title ? (
            <Text as="label" variant="body2" sx={labelSx}>
              {title}
            </Text>
          ) : null}
          <Flex sx={{ alignItems: "center", gap: "4px" }}>
            <IconButton
              title={showMinMaxAll ? "Hide Min/Max" : "Show Min/Max"}
              aria-label={showMinMaxAll ? "Hide Min/Max" : "Show Min/Max"}
              onClick={() => setAllShowMinMax(!showMinMaxAll)}
              disabled={!canEdit || attributes.bars.length === 0}
              sx={{ padding: "2px", opacity: showMinMaxAll ? 1 : 0.6 }}
            >
              <Text as="span" sx={{ fontSize: smallFontSize, fontWeight: 600 }}>
                M/M
              </Text>
            </IconButton>
            <IconButton
              title={allVisible ? "Hide From Others" : "Visible To Others"}
              aria-label={allVisible ? "Hide From Others" : "Visible To Others"}
              onClick={() => setAllVisibility(!allVisible)}
              disabled={!canEdit}
              sx={{ padding: "2px", opacity: allVisible ? 1 : 0.6 }}
            >
              {allVisible ? <TokenShowIcon /> : <TokenHideIcon />}
            </IconButton>
            {canEdit && (
              <>
                <IconButton
                  title="Add Bar"
                  aria-label="Add Bar"
                  onClick={addBar}
                  sx={{ padding: "2px" }}
                >
                  <AddIcon />
                </IconButton>
                <IconButton
                  title="Add Value"
                  aria-label="Add Value"
                  onClick={addValue}
                  sx={{ padding: "2px" }}
                >
                  <Text as="span" sx={{ fontSize: "14px" }}>
                    +V
                  </Text>
                </IconButton>
              </>
            )}
          </Flex>
        </Flex>
      )}
      {attributes.bars.length === 0 && attributes.values.length === 0 && (
        <Text variant="body2" sx={{ opacity: 0.7, mt: 1, fontSize: smallFontSize }}>
          No attributes
        </Text>
      )}
      {attributes.bars.map((bar) => {
        const currentKey = `bar:${bar.id}:current`;
        const maxKey = `bar:${bar.id}:max`;
        const currentText = draftInputs[currentKey] ?? `${bar.current}`;
        const maxText =
          draftInputs[maxKey] ?? (bar.max !== undefined ? `${bar.max}` : "");
        return (
          <Box
            key={bar.id}
            mt={blockSpacing}
            p={blockPadding}
            sx={{ borderRadius: "6px", backgroundColor: "rgba(0,0,0,0.25)" }}
          >
            <Grid columns="1fr 1fr" gap={compact ? 2 : 3}>
              <Box>
                <Flex sx={{ alignItems: "center", gap: "6px" }}>
                  <Input
                    value={bar.label}
                    onChange={(e) =>
                      updateBar(bar.id, {
                        label: e.target.value.substring(0, 32),
                      })
                    }
                    sx={inputSx}
                    disabled={!canEdit}
                  />
                  <IconButton
                    title="Change Color"
                    aria-label="Change Color"
                    onClick={() =>
                      setOpenColorPicker((prev) =>
                        prev === `bar:${bar.id}:color` ? null : `bar:${bar.id}:color`
                      )
                    }
                    sx={{
                      width: `${dotSize}px`,
                      height: `${dotSize}px`,
                      padding: 0,
                      borderRadius: "50%",
                      backgroundColor: bar.color,
                      border: "1px solid rgba(255,255,255,0.4)",
                    }}
                    disabled={!canEdit}
                  />
                  {canEdit && (
                    <IconButton
                      title="Remove Bar"
                      aria-label="Remove Bar"
                      onClick={() => removeBar(bar.id)}
                      sx={{ padding: "2px" }}
                    >
                      <Text as="span">×</Text>
                    </IconButton>
                  )}
                </Flex>
                {openColorPicker === `bar:${bar.id}:color` && (
                  <Flex sx={{ flexWrap: "wrap", gap: "4px", mt: 1 }}>
                    {paletteColors.map((color) => (
                      <Box
                        key={color}
                        onClick={() => {
                          updateBar(bar.id, { color });
                          setOpenColorPicker(null);
                        }}
                        sx={{
                          width: `${dotSize}px`,
                          height: `${dotSize}px`,
                          borderRadius: "50%",
                          backgroundColor: color,
                          border: "1px solid rgba(255,255,255,0.35)",
                          cursor: "pointer",
                        }}
                      />
                    ))}
                  </Flex>
                )}
              </Box>
              <Box>
                <Flex sx={{ alignItems: "center", gap: "6px" }}>
                  <Input
                    value={currentText}
                    onChange={(e) => setDraftInput(currentKey, e.target.value)}
                    onBlur={() =>
                      commitNumberField(
                        currentKey,
                        currentText,
                        bar.current,
                        (next) =>
                          typeof next === "number" && updateBar(bar.id, { current: next }),
                        false
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitNumberField(
                          currentKey,
                          currentText,
                          bar.current,
                          (next) =>
                            typeof next === "number" &&
                            updateBar(bar.id, { current: next }),
                          false
                        );
                      }
                    }}
                    sx={inputSx}
                    disabled={!canEdit}
                    placeholder="Cur"
                    aria-label="Current"
                  />
                  <Input
                    value={maxText}
                    onChange={(e) => setDraftInput(maxKey, e.target.value)}
                    onBlur={() =>
                      commitNumberField(
                        maxKey,
                        maxText,
                        bar.max ?? 0,
                        (next) => updateBar(bar.id, { max: next }),
                        true
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitNumberField(
                          maxKey,
                          maxText,
                          bar.max ?? 0,
                          (next) => updateBar(bar.id, { max: next }),
                          true
                        );
                      }
                    }}
                    sx={inputSx}
                    disabled={!canEdit}
                    placeholder="Max"
                    aria-label="Max"
                  />
                </Flex>
              </Box>
            </Grid>
          </Box>
        );
      })}
      {attributes.values.map((value) => {
        const valueKey = `value:${value.id}:value`;
        const valueText =
          draftInputs[valueKey] ??
          (typeof value.value === "number" ? `${value.value}` : `${value.value}`);
        const valueColor = value.color ?? colors.blue;
        return (
          <Box
            key={value.id}
            mt={blockSpacing}
            p={blockPadding}
            sx={{ borderRadius: "6px", backgroundColor: "rgba(0,0,0,0.25)" }}
          >
            <Grid columns="1fr 1fr" gap={compact ? 2 : 3}>
              <Box>
                <Flex sx={{ alignItems: "center", gap: "6px" }}>
                  <Input
                    value={value.label}
                    onChange={(e) =>
                      updateValue(value.id, {
                        label: e.target.value.substring(0, 32),
                      })
                    }
                    sx={inputSx}
                    disabled={!canEdit}
                  />
                  <IconButton
                    title="Change Color"
                    aria-label="Change Color"
                    onClick={() =>
                      setOpenColorPicker((prev) =>
                        prev === `value:${value.id}:color`
                          ? null
                          : `value:${value.id}:color`
                      )
                    }
                    sx={{
                      width: `${dotSize}px`,
                      height: `${dotSize}px`,
                      padding: 0,
                      borderRadius: "50%",
                      backgroundColor: valueColor,
                      border: "1px solid rgba(255,255,255,0.4)",
                    }}
                    disabled={!canEdit}
                  />
                  {canEdit && (
                    <IconButton
                      title="Remove Value"
                      aria-label="Remove Value"
                      onClick={() => removeValue(value.id)}
                      sx={{ padding: "2px" }}
                    >
                      <Text as="span">×</Text>
                    </IconButton>
                  )}
                </Flex>
                {openColorPicker === `value:${value.id}:color` && (
                  <Flex sx={{ flexWrap: "wrap", gap: "4px", mt: 1 }}>
                    {paletteColors.map((color) => (
                      <Box
                        key={color}
                        onClick={() => {
                          updateValue(value.id, { color });
                          setOpenColorPicker(null);
                        }}
                        sx={{
                          width: `${dotSize}px`,
                          height: `${dotSize}px`,
                          borderRadius: "50%",
                          backgroundColor: color,
                          border: "1px solid rgba(255,255,255,0.35)",
                          cursor: "pointer",
                        }}
                      />
                    ))}
                  </Flex>
                )}
              </Box>
              <Box>
                <Flex sx={{ alignItems: "center", gap: "6px" }}>
                  <Input
                    value={valueText}
                    onChange={(e) => setDraftInput(valueKey, e.target.value)}
                    onBlur={() =>
                      commitNumberField(
                        valueKey,
                        valueText,
                        typeof value.value === "number" ? value.value : 0,
                        (next) =>
                          typeof next === "number" &&
                          updateValue(value.id, { value: next }),
                        false
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitNumberField(
                          valueKey,
                          valueText,
                          typeof value.value === "number" ? value.value : 0,
                          (next) =>
                            typeof next === "number" &&
                            updateValue(value.id, { value: next }),
                          false
                        );
                      }
                    }}
                    sx={inputSx}
                    disabled={!canEdit}
                    placeholder="Value"
                    aria-label="Value"
                  />
                </Flex>
              </Box>
            </Grid>
          </Box>
        );
      })}
    </Box>
  );
}

export default TokenAttributeEditor;
