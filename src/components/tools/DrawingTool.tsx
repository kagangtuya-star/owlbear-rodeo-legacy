import { useState, useEffect, useCallback } from "react";
import Konva from "konva";
import shortid from "shortid";
import { Group, Rect, Line as KonvaLine } from "react-konva";

import {
  useDebouncedStageScale,
  useMapWidth,
  useMapHeight,
  useInteractionEmitter,
  leftMouseButton,
  MapDragEvent,
} from "../../contexts/MapInteractionContext";
import { useMapStage } from "../../contexts/MapStageContext";
import {
  useGridCellNormalizedSize,
  useGridStrokeWidth,
} from "../../contexts/GridContext";

import Vector2 from "../../helpers/Vector2";
import {
  getDefaultShapeData,
  getUpdatedShapeData,
  simplifyPoints,
} from "../../helpers/drawing";
import { getRelativePointerPosition } from "../../helpers/konva";

import useGridSnapping from "../../hooks/useGridSnapping";

import DrawingShape from "../konva/Drawing";

import { useKeyboard } from "../../contexts/KeyboardContext";
import shortcuts from "../../shortcuts";

import { Map } from "../../types/Map";
import {
  Drawing,
  DrawingToolSettings,
  drawingToolIsShape,
  Shape,
  Line,
} from "../../types/Drawing";

export type DrawingAddEventHanlder = (drawing: Drawing) => void;
export type DrawingsRemoveEventHandler = (drawingIds: string[]) => void;
export type DrawingsEditEventHandler = (drawings: Partial<Drawing>[]) => void;

type MapDrawingProps = {
  map: Map | null;
  drawings: Drawing[];
  onDrawingAdd: DrawingAddEventHanlder;
  onDrawingsRemove: DrawingsRemoveEventHandler;
  onDrawingsEdit: DrawingsEditEventHandler;
  active: boolean;
  toolSettings: DrawingToolSettings;
};

function DrawingTool({
  map,
  drawings,
  onDrawingAdd: onShapeAdd,
  onDrawingsRemove: onShapesRemove,
  onDrawingsEdit: onShapesEdit,
  active,
  toolSettings,
}: MapDrawingProps) {
  const stageScale = useDebouncedStageScale();
  const mapWidth = useMapWidth();
  const mapHeight = useMapHeight();
  const interactionEmitter = useInteractionEmitter();

  const gridCellNormalizedSize = useGridCellNormalizedSize();
  const gridStrokeWidth = useGridStrokeWidth();

  const mapStageRef = useMapStage();
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [penDrawing, setPenDrawing] = useState<Line | null>(null);
  const [isBrushDown, setIsBrushDown] = useState(false);
  const [erasingDrawings, setErasingDrawings] = useState<Drawing[]>([]);

  const shouldHover = toolSettings.type === "erase" && active;

  const isPen = toolSettings.type === "pen";
  const isDrag = toolSettings.type === "drag";
  const isBrush =
    toolSettings.type === "brush" || toolSettings.type === "paint";
  const isShape =
    toolSettings.type === "line" ||
    toolSettings.type === "rectangle" ||
    toolSettings.type === "circle" ||
    toolSettings.type === "triangle";

  const snapPositionToGrid = useGridSnapping();

  const getBrushPosition = useCallback(() => {
    const mapStage = mapStageRef.current;
    if (!mapStage || !map) {
      return;
    }
    const mapImage = mapStage.findOne("#mapImage");
    let position = getRelativePointerPosition(mapImage);
    if (!position) {
      return;
    }
    if (map.snapToGrid && (isShape || isPen)) {
      position = snapPositionToGrid(position);
    }
    return Vector2.divide(position, {
      x: mapImage.width(),
      y: mapImage.height(),
    });
  }, [mapStageRef, map, isShape, isPen, snapPositionToGrid]);

  useEffect(() => {
    if (!active || isDrag) {
      return;
    }
    if (isPen) {
      return;
    }

    function handleBrushDown(props: MapDragEvent) {
      if (!leftMouseButton(props)) {
        return;
      }
      const brushPosition = getBrushPosition();
      if (!brushPosition) {
        return;
      }
      const commonShapeData = {
        color: toolSettings.color,
        blend: toolSettings.useBlending,
        opacity:
          typeof toolSettings.opacity === "number"
            ? toolSettings.opacity
            : toolSettings.useBlending
            ? 0.5
            : 1,
        dashStyle: toolSettings.dashStyle,
        id: shortid.generate(),
      };
      const type = toolSettings.type;
      if (isBrush) {
        setDrawing({
          type: "path",
          pathType: type === "brush" ? "stroke" : "fill",
          data: { points: [brushPosition] },
          strokeWidth:
            type === "brush"
              ? typeof toolSettings.strokeWidth === "number"
                ? toolSettings.strokeWidth
                : 1
              : 0,
          ...commonShapeData,
        });
      } else if (isShape && drawingToolIsShape(type)) {
        setDrawing({
          type: "shape",
          shapeType: type,
          data: getDefaultShapeData(type, brushPosition),
          strokeWidth:
            toolSettings.type === "line" || !toolSettings.useShapeFill
              ? typeof toolSettings.strokeWidth === "number"
                ? toolSettings.strokeWidth
                : 1
              : 0,
          ...commonShapeData,
        } as Shape);
      }
      setIsBrushDown(true);
    }

    function handleBrushMove(props: MapDragEvent) {
      if (!leftMouseButton(props)) {
        return;
      }
      const brushPosition = getBrushPosition();
      if (!brushPosition) {
        return;
      }
      if (isBrushDown && drawing) {
        if (isBrush) {
          setDrawing((prevShape) => {
            if (prevShape?.type !== "path") {
              return prevShape;
            }
            const prevPoints = prevShape.data.points;
            if (
              Vector2.compare(
                prevPoints[prevPoints.length - 1],
                brushPosition,
                0.001
              )
            ) {
              return prevShape;
            }
            const simplified = simplifyPoints(
              [...prevPoints, brushPosition],
              1 / 1000 / stageScale
            );
            return {
              ...prevShape,
              data: { points: simplified },
            };
          });
        } else if (isShape) {
          setDrawing((prevShape) => {
            if (prevShape?.type !== "shape") {
              return prevShape;
            }
            return {
              ...prevShape,
              data: getUpdatedShapeData(
                prevShape.shapeType,
                prevShape.data,
                brushPosition,
                gridCellNormalizedSize,
                mapWidth,
                mapHeight
              ),
            } as Shape;
          });
        }
      }
    }

    function handleBrushUp(props: MapDragEvent) {
      if (!leftMouseButton(props)) {
        return;
      }
      if (isBrush && drawing && drawing.type === "path") {
        if (drawing.data.points.length > 1) {
          onShapeAdd(drawing);
        }
      } else if (isShape && drawing) {
        onShapeAdd(drawing);
      }

      eraseHoveredShapes();

      setDrawing(null);
      setIsBrushDown(false);
    }

    interactionEmitter?.on("dragStart", handleBrushDown);
    interactionEmitter?.on("drag", handleBrushMove);
    interactionEmitter?.on("dragEnd", handleBrushUp);

    return () => {
      interactionEmitter?.off("dragStart", handleBrushDown);
      interactionEmitter?.off("drag", handleBrushMove);
      interactionEmitter?.off("dragEnd", handleBrushUp);
    };
  });

  const removeLastPenPoint = useCallback(() => {
    setPenDrawing((prevShape) => {
      if (!prevShape) {
        return prevShape;
      }
      if (prevShape.data.points.length > 2) {
        return {
          ...prevShape,
          data: {
            ...prevShape.data,
            points: [
              ...prevShape.data.points.slice(0, -2),
              ...prevShape.data.points.slice(-1),
            ],
          },
        };
      }
      return null;
    });
  }, []);

  useEffect(() => {
    if (!active || !isPen || isDrag) {
      if (penDrawing) {
        setPenDrawing(null);
      }
      return;
    }
    const mapStage = mapStageRef.current;
    if (!mapStage) {
      return;
    }

    function handlePointerMove() {
      if (!penDrawing) {
        return;
      }
      const brushPosition = getBrushPosition();
      if (!brushPosition) {
        return;
      }
      setPenDrawing((prevShape) => {
        if (!prevShape) {
          return prevShape;
        }
        return {
          ...prevShape,
          data: {
            ...prevShape.data,
            points: [
              ...prevShape.data.points.slice(0, -1),
              brushPosition,
            ],
          },
        };
      });
    }

    function handlePointerClick() {
      const brushPosition = getBrushPosition();
      if (!brushPosition) {
        return;
      }
      setPenDrawing((prevShape) => {
        if (!prevShape) {
          return {
            type: "shape",
            shapeType: "line",
            data: { points: [brushPosition, brushPosition] },
            strokeWidth:
              typeof toolSettings.strokeWidth === "number"
                ? toolSettings.strokeWidth
                : 1,
            color: toolSettings.color,
            blend: toolSettings.useBlending,
            opacity:
              typeof toolSettings.opacity === "number"
                ? toolSettings.opacity
                : toolSettings.useBlending
                ? 0.5
                : 1,
            dashStyle: toolSettings.dashStyle,
            id: shortid.generate(),
          };
        }
        return {
          ...prevShape,
          data: {
            ...prevShape.data,
            points: [
              ...prevShape.data.points.slice(0, -1),
              brushPosition,
              brushPosition,
            ],
          },
        };
      });
    }

    mapStage.on("mousemove touchmove", handlePointerMove);
    mapStage.on("click tap", handlePointerClick);

    return () => {
      mapStage.off("mousemove touchmove", handlePointerMove);
      mapStage.off("click tap", handlePointerClick);
    };
  }, [
    active,
    isPen,
    isDrag,
    mapStageRef,
    penDrawing,
    getBrushPosition,
    toolSettings.strokeWidth,
    toolSettings.color,
    toolSettings.useBlending,
    toolSettings.opacity,
    toolSettings.dashStyle,
  ]);

  const finishPenDrawing = useCallback(() => {
    if (!penDrawing) {
      return;
    }
    const points = penDrawing.data.points.slice(0, -1);
    if (points.length > 1) {
      onShapeAdd({
        ...penDrawing,
        data: {
          ...penDrawing.data,
          points,
        },
      });
    }
    setPenDrawing(null);
  }, [penDrawing, onShapeAdd]);

  function handleKeyDown(event: KeyboardEvent) {
    if (!active || !isPen || !penDrawing) {
      return;
    }
    if (shortcuts.fogFinishPolygon(event)) {
      finishPenDrawing();
    } else if (shortcuts.fogCancelPolygon(event)) {
      setPenDrawing(null);
    } else if (shortcuts.delete(event)) {
      removeLastPenPoint();
    }
  }

  useKeyboard(handleKeyDown);

  function handleShapeOver(shape: Drawing, isDown: boolean) {
    if (shouldHover && isDown) {
      if (erasingDrawings.findIndex((s) => s.id === shape.id) === -1) {
        setErasingDrawings((prevShapes) => [...prevShapes, shape]);
      }
    }
  }

  function eraseHoveredShapes() {
    if (erasingDrawings.length > 0) {
      onShapesRemove(erasingDrawings.map((shape) => shape.id));
      setErasingDrawings([]);
    }
  }

  function renderDrawing(shape: Drawing) {
    const isDraggingEnabled = active && isDrag;
    function handleDragEnd(
      event: Konva.KonvaEventObject<DragEvent>
    ) {
      if (!isDraggingEnabled) {
        return;
      }
      const node = event.target;
      const { x, y } = node.position();
      if (x === 0 && y === 0) {
        return;
      }
      if (mapWidth === 0 || mapHeight === 0) {
        return;
      }
      const isRect = shape.type === "shape" && shape.shapeType === "rectangle";
      const isCircle = shape.type === "shape" && shape.shapeType === "circle";
      const baseX =
        isRect || isCircle ? shape.data.x * mapWidth : 0;
      const baseY =
        isRect || isCircle ? shape.data.y * mapHeight : 0;
      const dxPx = x - baseX;
      const dyPx = y - baseY;
      node.position({ x: baseX, y: baseY });
      const dx = dxPx / mapWidth;
      const dy = dyPx / mapHeight;
      const shiftPoint = (point: Vector2) => ({
        x: point.x + dx,
        y: point.y + dy,
      });
      let updated: Drawing | null = null;
      if (shape.type === "path") {
        updated = {
          ...shape,
          data: {
            points: shape.data.points.map(shiftPoint),
          },
        };
      } else if (shape.type === "shape") {
        if (shape.shapeType === "rectangle") {
          updated = {
            ...shape,
            data: {
              ...shape.data,
              x: shape.data.x + dx,
              y: shape.data.y + dy,
            },
          };
        } else if (shape.shapeType === "circle") {
          updated = {
            ...shape,
            data: {
              ...shape.data,
              x: shape.data.x + dx,
              y: shape.data.y + dy,
            },
          };
        } else {
          updated = {
            ...shape,
            data: {
              points: shape.data.points.map(shiftPoint),
            },
          };
        }
      }
      if (updated) {
        onShapesEdit([updated]);
      }
    }
    return (
      <DrawingShape
        drawing={shape}
        key={shape.id}
        onMouseMove={() => handleShapeOver(shape, isBrushDown)}
        onTouchOver={() => handleShapeOver(shape, isBrushDown)}
        onMouseDown={() => handleShapeOver(shape, true)}
        onTouchStart={() => handleShapeOver(shape, true)}
        onMouseUp={eraseHoveredShapes}
        onTouchEnd={eraseHoveredShapes}
        strokeWidth={gridStrokeWidth * shape.strokeWidth}
        hitStrokeWidth={Math.max(
          12 / stageScale,
          gridStrokeWidth * shape.strokeWidth * 2
        )}
        draggable={isDraggingEnabled}
        onDragEnd={handleDragEnd}
      />
    );
  }

  function handlePenFinish(
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>
  ) {
    event.cancelBubble = true;
    finishPenDrawing();
  }

  function handlePenUndo(
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>
  ) {
    event.cancelBubble = true;
    removeLastPenPoint();
  }

  function renderPenControls() {
    if (!penDrawing) {
      return null;
    }
    const start = penDrawing.data.points[0];
    if (!start) {
      return null;
    }
    const position = Vector2.multiply(start, {
      x: mapWidth,
      y: mapHeight,
    });
    const controlSize = 22 / stageScale;
    const gap = 6 / stageScale;
    const offset = 12 / stageScale;
    const totalWidth = controlSize * 2 + gap;
    const stroke = Math.max(1, 1 / stageScale);
    const x = Math.min(
      Math.max(position.x + offset, 0),
      mapWidth - totalWidth
    );
    const y = Math.min(
      Math.max(position.y - offset - controlSize, 0),
      mapHeight - controlSize
    );

    return (
      <Group x={x} y={y}>
        <Group onClick={handlePenFinish} onTap={handlePenFinish}>
          <Rect
            width={controlSize}
            height={controlSize}
            cornerRadius={controlSize / 4}
            fill="rgba(0,0,0,0.7)"
            stroke="white"
            strokeWidth={stroke}
          />
          <KonvaLine
            points={[
              controlSize * 0.25,
              controlSize * 0.55,
              controlSize * 0.45,
              controlSize * 0.75,
              controlSize * 0.75,
              controlSize * 0.3,
            ]}
            stroke="white"
            strokeWidth={stroke * 2}
            lineCap="round"
            lineJoin="round"
          />
        </Group>
        <Group x={controlSize + gap} onClick={handlePenUndo} onTap={handlePenUndo}>
          <Rect
            width={controlSize}
            height={controlSize}
            cornerRadius={controlSize / 4}
            fill="rgba(0,0,0,0.7)"
            stroke="white"
            strokeWidth={stroke}
          />
          <KonvaLine
            points={[
              controlSize * 0.7,
              controlSize * 0.25,
              controlSize * 0.35,
              controlSize * 0.5,
              controlSize * 0.7,
              controlSize * 0.75,
            ]}
            stroke="white"
            strokeWidth={stroke * 2}
            lineCap="round"
            lineJoin="round"
          />
        </Group>
      </Group>
    );
  }

  function renderErasingDrawing(drawing: Drawing) {
    const eraseShape: Drawing = {
      ...drawing,
      color: "primary",
    };
    return renderDrawing(eraseShape);
  }

  return (
    <Group>
      {drawings.map(renderDrawing)}
      {drawing && renderDrawing(drawing)}
      {penDrawing && renderDrawing(penDrawing)}
      {penDrawing && renderPenControls()}
      {erasingDrawings.length > 0 && erasingDrawings.map(renderErasingDrawing)}
    </Group>
  );
}

export default DrawingTool;
