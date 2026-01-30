import Konva from "konva";
import { Circle, Line, Rect, Group } from "react-konva";

import { useMapHeight, useMapWidth } from "../../contexts/MapInteractionContext";
import { useGridStrokeWidth } from "../../contexts/GridContext";
import colors, { Color } from "../../helpers/colors";
import { convertPointsToNumbers } from "../../helpers/konva";
import Vector2 from "../../helpers/Vector2";

import { SpellTemplate } from "../../types/SpellTemplate";

type SpellTemplateProps = {
  template: SpellTemplate;
} & Konva.ShapeConfig;

function SpellTemplateShape({ template, ...props }: SpellTemplateProps) {
  const mapWidth = useMapWidth();
  const mapHeight = useMapHeight();
  const gridStrokeWidth = useGridStrokeWidth();
  const minSide = mapWidth < mapHeight ? mapWidth : mapHeight;

  const origin = Vector2.multiply(template.origin, {
    x: mapWidth,
    y: mapHeight,
  });

  const strokeWidth = gridStrokeWidth * template.style.strokeWidth;
  const color = colors[template.style.color as Color] || template.style.color;

  if (template.type === "circle") {
    const radius = (template.params.radius || 0) * minSide;
    return (
      <Circle
        x={origin.x}
        y={origin.y}
        radius={radius}
        fill={color}
        stroke={color}
        opacity={template.style.opacity}
        strokeWidth={strokeWidth}
        {...props}
      />
    );
  }

  if (template.type === "ring") {
    const outerRadius = (template.params.radius || 0) * minSide;
    const innerRadius = (template.params.innerRadius || 0) * minSide;
    const ringWidth = Math.max(outerRadius - innerRadius, strokeWidth);
    const ringRadius = innerRadius + ringWidth / 2;
    const hitWidth = Math.max(10, ringWidth);
    return (
      <Circle
        x={origin.x}
        y={origin.y}
        radius={ringRadius}
        stroke={color}
        opacity={template.style.opacity}
        strokeWidth={ringWidth}
        hitStrokeWidth={hitWidth}
        {...props}
      />
    );
  }

  if (template.type === "rectangle") {
    const width = (template.params.width || 0) * mapWidth;
    const height = (template.params.height || 0) * mapHeight;
    return (
      <Rect
        x={origin.x}
        y={origin.y}
        width={width}
        height={height}
        offsetX={width / 2}
        offsetY={height / 2}
        rotation={template.rotation}
        fill={color}
        stroke={color}
        opacity={template.style.opacity}
        strokeWidth={strokeWidth}
        {...props}
      />
    );
  }

  if (template.type === "cone") {
    const length = (template.params.length || 0) * minSide;
    const angle = template.params.angle || 0;
    const direction = {
      x: Math.cos((template.rotation * Math.PI) / 180),
      y: Math.sin((template.rotation * Math.PI) / 180),
    };
    const left = Vector2.rotateDirection(direction, angle / 2);
    const right = Vector2.rotateDirection(direction, -angle / 2);
    const points = [
      origin,
      Vector2.add(origin, Vector2.multiply(left, length)),
      Vector2.add(origin, Vector2.multiply(right, length)),
    ];
    return (
      <Line
        points={convertPointsToNumbers(points)}
        closed
        fill={color}
        stroke={color}
        opacity={template.style.opacity}
        strokeWidth={strokeWidth}
        {...props}
      />
    );
  }

  if (template.type === "line" || template.type === "path") {
    const points = (template.params.points || []).map((point) =>
      Vector2.multiply(point, { x: mapWidth, y: mapHeight })
    );
    const width = (template.params.width || 0) * minSide;
    const hitWidth = Math.max(12, width);
    return (
      <Line
        points={convertPointsToNumbers(points)}
        stroke={color}
        opacity={template.style.opacity}
        strokeWidth={width}
        hitStrokeWidth={hitWidth}
        lineCap="round"
        lineJoin="round"
        {...props}
      />
    );
  }

  return <Group />;
}

export default SpellTemplateShape;
