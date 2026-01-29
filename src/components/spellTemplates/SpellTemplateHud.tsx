import { Group, Rect, Text } from "react-konva";

import { parseGridScale } from "../../helpers/grid";
import Vector2 from "../../helpers/Vector2";
import { SpellTemplate } from "../../types/SpellTemplate";
import { TokenState } from "../../types/TokenState";
import { AffectedCell } from "../../helpers/spellTemplates";
import { Grid } from "../../types/Grid";
import Size from "../../helpers/Size";

const HUD_WIDTH = 220;
const HUD_PADDING = 8;
const LINE_HEIGHT = 14;

function formatScaled(value: number, scale: ReturnType<typeof parseGridScale>) {
  const scaled = value * scale.multiplier;
  const digits = scale.digits || 0;
  const unit = scale.unit || "";
  const formatted = scaled.toFixed(digits);
  return unit ? `${formatted}${unit}` : `${formatted}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

type SpellTemplateHudProps = {
  template: SpellTemplate;
  affectedCells: AffectedCell[];
  tokens: TokenState[];
  cursorPosition: Vector2 | null;
  mapSize: { x: number; y: number };
  grid: Grid;
  gridCellPixelSize: Size;
};

function SpellTemplateHud({
  template,
  affectedCells,
  tokens,
  cursorPosition,
  mapSize,
  grid,
  gridCellPixelSize,
}: SpellTemplateHudProps) {
  const scale = parseGridScale(grid.measurement.scale);
  const minCell = Math.min(
    gridCellPixelSize.width,
    gridCellPixelSize.height
  );
  const minSide = Math.min(mapSize.x, mapSize.y) || 1;

  let lines: string[] = [];
  lines.push(`Type: ${template.type}`);

  if (template.type === "circle" || template.type === "ring") {
    const radiusPx = (template.params.radius || 0) * minSide;
    const radiusCells = minCell > 0 ? radiusPx / minCell : 0;
    lines.push(`Radius: ${formatScaled(radiusCells, scale)}`);
  } else if (template.type === "rectangle") {
    const widthPx = (template.params.width || 0) * mapSize.x;
    const heightPx = (template.params.height || 0) * mapSize.y;
    const widthCells = minCell > 0 ? widthPx / minCell : 0;
    const heightCells = minCell > 0 ? heightPx / minCell : 0;
    lines.push(
      `Size: ${formatScaled(widthCells, scale)} x ${formatScaled(
        heightCells,
        scale
      )}`
    );
  } else if (template.type === "cone") {
    const lengthPx = (template.params.length || 0) * minSide;
    const lengthCells = minCell > 0 ? lengthPx / minCell : 0;
    lines.push(`Length: ${formatScaled(lengthCells, scale)}`);
    lines.push(`Angle: ${Math.round(template.params.angle || 0)}deg`);
  } else if (template.type === "line" || template.type === "path") {
    const widthPx = (template.params.width || 0) * minSide;
    const widthCells = minCell > 0 ? widthPx / minCell : 0;
    lines.push(`Width: ${formatScaled(widthCells, scale)}`);
  }

  lines.push(`Cells: ${affectedCells.length}`);

  if (tokens.length > 0) {
    const names = tokens
      .map((token) => token.label || token.id)
      .filter(Boolean);
    const preview = names.slice(0, 3);
    const suffix = names.length > 3 ? ` +${names.length - 3}` : "";
    lines.push(`Targets: ${preview.join(", ")}${suffix}`);
  }

  const height = lines.length * LINE_HEIGHT + HUD_PADDING * 2;
  const baseX = cursorPosition ? cursorPosition.x + 16 : 16;
  const baseY = cursorPosition ? cursorPosition.y + 16 : 16;
  const x = clamp(baseX, 8, mapSize.x - HUD_WIDTH - 8);
  const y = clamp(baseY, 8, mapSize.y - height - 8);

  return (
    <Group x={x} y={y} listening={false}>
      <Rect
        width={HUD_WIDTH}
        height={height}
        fill="rgba(0, 0, 0, 0.6)"
        cornerRadius={4}
      />
      {lines.map((line, index) => (
        <Text
          key={`${line}-${index}`}
          text={line}
          x={HUD_PADDING}
          y={HUD_PADDING + index * LINE_HEIGHT}
          fontSize={12}
          fill="white"
        />
      ))}
    </Group>
  );
}

export default SpellTemplateHud;
