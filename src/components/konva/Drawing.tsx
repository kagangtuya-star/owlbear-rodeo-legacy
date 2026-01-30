import Konva from "konva";
import { Circle, Line, Rect } from "react-konva";
import {
  useMapHeight,
  useMapWidth,
} from "../../contexts/MapInteractionContext";
import colors from "../../helpers/colors";
import { scaleAndFlattenPoints } from "../../helpers/konva";
import Vector2 from "../../helpers/Vector2";

import { Drawing as DrawingType } from "../../types/Drawing";

type DrawingProps = {
  drawing: DrawingType;
} & Konva.ShapeConfig;

function getDashArray(
  dashStyle: DrawingType["dashStyle"],
  strokeWidth: number
): number[] | undefined {
  if (!dashStyle || dashStyle === "solid") {
    return undefined;
  }
  const unit = Math.max(1, strokeWidth);
  if (dashStyle === "dashed") {
    return [unit * 4, unit * 2];
  }
  if (dashStyle === "dotted") {
    return [unit, unit * 2];
  }
  return undefined;
}

function Drawing({ drawing, ...props }: DrawingProps) {
  const mapWidth = useMapWidth();
  const mapHeight = useMapHeight();
  const mapSize = new Vector2(mapWidth, mapHeight);
  const strokeWidth =
    typeof props.strokeWidth === "number" ? props.strokeWidth : 1;
  const dash =
    strokeWidth === 0 ? undefined : getDashArray(drawing.dashStyle, strokeWidth);

  const resolvedColor =
    drawing.color in colors
      ? colors[drawing.color as keyof typeof colors]
      : drawing.color;

  const defaultProps = {
    fill: resolvedColor,
    stroke: resolvedColor,
    opacity:
      typeof drawing.opacity === "number"
        ? drawing.opacity
        : drawing.blend
        ? 0.5
        : 1,
    id: drawing.id,
  };

  if (drawing.type === "path") {
    return (
      <Line
        points={scaleAndFlattenPoints(drawing.data.points, mapSize)}
        tension={0.5}
        closed={drawing.pathType === "fill"}
        fillEnabled={drawing.pathType === "fill"}
        lineCap="round"
        lineJoin="round"
        {...defaultProps}
        {...props}
      />
    );
  } else if (drawing.type === "shape") {
    if (drawing.shapeType === "rectangle") {
      return (
        <Rect
          x={drawing.data.x * mapWidth}
          y={drawing.data.y * mapHeight}
          width={drawing.data.width * mapWidth}
          height={drawing.data.height * mapHeight}
          fillEnabled={props.strokeWidth === 0}
          {...defaultProps}
          {...props}
          dash={dash}
        />
      );
    } else if (drawing.shapeType === "circle") {
      const minSide = mapWidth < mapHeight ? mapWidth : mapHeight;
      return (
        <Circle
          x={drawing.data.x * mapWidth}
          y={drawing.data.y * mapHeight}
          radius={drawing.data.radius * minSide}
          fillEnabled={props.strokeWidth === 0}
          {...defaultProps}
          {...props}
          dash={dash}
        />
      );
    } else if (drawing.shapeType === "triangle") {
      return (
        <Line
          points={scaleAndFlattenPoints(drawing.data.points, mapSize)}
          closed={true}
          fillEnabled={props.strokeWidth === 0}
          {...defaultProps}
          {...props}
          dash={dash}
        />
      );
    } else if (drawing.shapeType === "line") {
      return (
        <Line
          points={scaleAndFlattenPoints(drawing.data.points, mapSize)}
          lineCap="round"
          {...defaultProps}
          {...props}
          dash={dash}
        />
      );
    }
  }

  return null;
}

export default Drawing;
