import Konva from "konva";
import { Group, Line } from "react-konva";

import { useGridStrokeWidth } from "../../contexts/GridContext";
import colors, { Color } from "../../helpers/colors";
import { convertPointsToNumbers } from "../../helpers/konva";

import { AffectedCell } from "../../helpers/spellTemplates";

type SpellTemplateGridOverlayProps = {
  cells: AffectedCell[];
  color: string;
  opacity: number;
} & Konva.ShapeConfig;

function SpellTemplateGridOverlay({
  cells,
  color,
  opacity,
  ...props
}: SpellTemplateGridOverlayProps) {
  const gridStrokeWidth = useGridStrokeWidth();
  const strokeWidth = gridStrokeWidth * 0.75;
  const displayColor = colors[color as Color] || color;

  return (
    <Group>
      {cells.map((cell) => (
        <Line
          key={`${cell.col}-${cell.row}`}
          points={convertPointsToNumbers(cell.polygon)}
          closed
          stroke={displayColor}
          strokeWidth={strokeWidth}
          opacity={opacity}
          fill={displayColor}
          fillEnabled
          listening={false}
          {...props}
        />
      ))}
    </Group>
  );
}

export default SpellTemplateGridOverlay;
