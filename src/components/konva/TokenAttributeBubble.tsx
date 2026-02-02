import { Circle, Group, Rect, Text } from "react-konva";

import colors from "../../helpers/colors";
import { TokenAttributeBar, TokenAttributeValue, TokenState } from "../../types/TokenState";

type TokenAttributeBubbleProps = {
  tokenState: TokenState;
  width: number;
  height: number;
  isMapOwner: boolean;
  isTokenOwner: boolean;
};

const MAX_RING_ITEMS = 8;

function isVisible(
  visibility: "public" | "private" | undefined,
  isMapOwner: boolean,
  isTokenOwner: boolean
) {
  if (visibility === "private") {
    return isMapOwner || isTokenOwner;
  }
  return true;
}

function formatNumber(value: number) {
  const rounded = Math.round(value * 10) / 10;
  if (Number.isInteger(rounded)) {
    return `${rounded}`;
  }
  return `${rounded}`;
}

function buildBarText(bar: TokenAttributeBar) {
  const currentText = formatNumber(bar.current);
  if (bar.showMinMax && typeof bar.max === "number") {
    return `${currentText}/${formatNumber(bar.max)}`;
  }
  return currentText;
}

function buildValueText(value: TokenAttributeValue) {
  const raw =
    typeof value.value === "number" ? formatNumber(value.value) : `${value.value}`;
  const trimmed = raw.trim();
  return trimmed.length > 5 ? `${trimmed.slice(0, 5)}` : trimmed;
}

function getBarRatio(bar: TokenAttributeBar) {
  if (typeof bar.max !== "number") {
    return 1;
  }
  const min = typeof bar.min === "number" ? Math.max(bar.min, 0) : 0;
  const currentValue = Math.max(bar.current, 0);
  const maxValue = Math.max(bar.max, 0);
  const range = maxValue - min;
  if (!Number.isFinite(range) || range <= 0) {
    return 0;
  }
  const clamped = Math.min(Math.max(currentValue - min, 0), range);
  return clamped / range;
}

function TokenAttributeBubble({
  tokenState,
  width,
  height,
  isMapOwner,
  isTokenOwner,
}: TokenAttributeBubbleProps) {
  const attributes = tokenState.attributes;
  if (!attributes) {
    return null;
  }

  const visibleBars = (attributes.bars || []).filter((bar) =>
    isVisible(bar.visibility, isMapOwner, isTokenOwner)
  );
  const visibleValues = (attributes.values || []).filter((value) =>
    isVisible(value.visibility, isMapOwner, isTokenOwner)
  );

  if (visibleBars.length === 0 && visibleValues.length === 0) {
    return null;
  }

  const ringItems = visibleValues
    .map((value) => ({
      id: value.id,
      color: value.color || colors.blue,
      text: buildValueText(value),
    }))
    .slice(0, MAX_RING_ITEMS);

  const baseSize = Math.min(width, height);
  const scale = Math.min(1, baseSize / 72);
  const markerRadius = Math.max(6, Math.round((baseSize / 9.5) * scale));
  const minRingRadius = baseSize / 2 + markerRadius * 1.05;
  const ringItemsCount = ringItems.length;
  const gap = 2;
  const ringRadius = Math.max(minRingRadius, markerRadius + 2);
  const fontSize = Math.max(7, Math.round(markerRadius * 0.95));
  const strokeWidth = Math.max(1, Math.round(markerRadius * 0.18));
  const textStrokeWidth = Math.max(1, Math.round(markerRadius * 0.12));

  const barHeight = Math.max(5, Math.round(baseSize * 0.11 * scale));
  const barGap = Math.max(1, Math.round(barHeight * 0.15));
  const barPadding = Math.max(2, Math.round(barHeight * 0.2));
  const maxBarWidth = Math.min(width, Math.round(baseSize * 0.9));
  const barWidth = Math.max(20, maxBarWidth - barPadding * 2);
  const barX = barPadding;
  const barRadius = Math.round(barHeight / 2);
  const availableBarHeight = height * 0.5;
  const stackDown = visibleBars.length > 2;
  const maxBars = stackDown
    ? visibleBars.length
    : Math.max(
        1,
        Math.floor((availableBarHeight + barGap) / (barHeight + barGap))
      );
  const barsToShow = visibleBars.slice(0, maxBars);
  const baseBarY = height - barPadding - barHeight;
  const startAngle = 0;
  const step =
    ringItemsCount > 1 ? (markerRadius * 2 + gap) / ringRadius : 0;

  const centerX = width / 2;
  const centerY = height / 2;

  return (
    <Group x={0} y={0}>
      {barsToShow.map((bar, index) => {
        const barText = buildBarText(bar);
        const barRatio = getBarRatio(bar);
        const baseFontSize = Math.max(8, Math.round(barHeight * 0.95));
        const estimatedTextWidth = barText.length * baseFontSize * 0.6;
        const textScale = Math.min(1, barWidth / (estimatedTextWidth + 1));
        const barFontSize = Math.max(8, Math.round(baseFontSize * textScale));
        const barY = stackDown
          ? baseBarY + index * (barHeight + barGap)
          : baseBarY - index * (barHeight + barGap);
        return (
          <Group key={bar.id}>
            <Rect
              x={barX}
              y={barY}
              width={barWidth}
              height={barHeight}
              fill="rgba(10, 10, 12, 0.45)"
              cornerRadius={barRadius}
            />
            <Rect
              x={barX}
              y={barY}
              width={Math.max(2, Math.round(barWidth * barRatio))}
              height={barHeight}
              fill={bar.color}
              opacity={1}
              cornerRadius={barRadius}
            />
            <Text
              text={barText}
              x={barX}
              y={barY}
              width={barWidth}
              height={barHeight}
              align="center"
              verticalAlign="top"
              fontSize={barFontSize}
              fontStyle="bold"
              fill="white"
              opacity={1}
              clipX={barX}
              clipY={barY}
              clipWidth={barWidth}
              clipHeight={barHeight}
              shadowColor="rgba(255, 255, 255, 0.6)"
              shadowBlur={2}
              shadowOffsetX={0}
              shadowOffsetY={0}
              shadowOpacity={0.6}
              listening={false}
            />
          </Group>
        );
      })}
      {ringItems.map((item, index) => {
        const angle = startAngle - index * step;
        const x = centerX + Math.cos(angle) * ringRadius;
        const y = centerY + Math.sin(angle) * ringRadius;
        return (
          <Group key={item.id} x={x} y={y}>
            <Circle
              radius={markerRadius}
              fill={item.color}
              stroke="rgba(0, 0, 0, 0.6)"
              strokeWidth={strokeWidth}
              shadowColor="rgba(0, 0, 0, 0.4)"
              shadowBlur={2}
              shadowOffsetX={0}
              shadowOffsetY={1}
              shadowOpacity={0.6}
            />
            <Text
              text={item.text}
              width={markerRadius * 2}
              height={markerRadius * 2}
              offsetX={markerRadius}
              offsetY={markerRadius}
              align="center"
              verticalAlign="middle"
              fontSize={fontSize}
              fontStyle="bold"
              fill="white"
              opacity={1}
              shadowColor="rgba(255, 255, 255, 0.6)"
              shadowBlur={2}
              shadowOffsetX={0}
              shadowOffsetY={0}
              shadowOpacity={0.6}
              listening={false}
            />
          </Group>
        );
      })}
    </Group>
  );
}

export default TokenAttributeBubble;
