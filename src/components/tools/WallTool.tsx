import { useState, useEffect, useCallback } from "react";
import { Group, Line } from "react-konva";
import Konva from "konva";
import shortid from "shortid";

import {
  useDebouncedStageScale,
  useMapWidth,
  useMapHeight,
  useInteractionEmitter,
  MapDragEvent,
  leftMouseButton,
} from "../../contexts/MapInteractionContext";
import { useMapStage } from "../../contexts/MapStageContext";
import { useGridStrokeWidth } from "../../contexts/GridContext";
import { useKeyboard } from "../../contexts/KeyboardContext";

import Vector2 from "../../helpers/Vector2";
import { simplifyPoints } from "../../helpers/drawing";
import { getRelativePointerPosition } from "../../helpers/konva";
import { scaleAndFlattenPoints } from "../../helpers/konva";
import colors from "../../helpers/colors";

import useGridSnapping from "../../hooks/useGridSnapping";

import shortcuts from "../../shortcuts";

import { Map } from "../../types/Map";
import { Wall } from "../../types/Wall";
import { FogToolSettings } from "../../types/Fog";

import Tick from "../konva/Tick";

type WallAddEventHandler = (walls: Wall[]) => void;
type WallRemoveEventHandler = (wallIds: string[]) => void;

type WallToolProps = {
  map: Map | null;
  walls: Wall[];
  onWallsAdd: WallAddEventHandler;
  onWallsRemove: WallRemoveEventHandler;
  active: boolean;
  toolSettings: FogToolSettings;
  editable: boolean;
};

function WallTool({
  map,
  walls,
  onWallsAdd,
  onWallsRemove,
  active,
  toolSettings,
  editable,
}: WallToolProps) {
  const stageScale = useDebouncedStageScale();
  const mapWidth = useMapWidth();
  const mapHeight = useMapHeight();
  const interactionEmitter = useInteractionEmitter();
  const mapStageRef = useMapStage();
  const gridStrokeWidth = useGridStrokeWidth();

  const snapPositionToGrid = useGridSnapping();

  const [drawingWall, setDrawingWall] = useState<Wall | null>(null);
  const [penWall, setPenWall] = useState<Wall | null>(null);
  const [isBrushDown, setIsBrushDown] = useState(false);
  const [erasingWalls, setErasingWalls] = useState<Wall[]>([]);

  const isPen = toolSettings.type === "polygon";
  const isLine = toolSettings.type === "rectangle";
  const isBrush = toolSettings.type === "brush";
  const isErase =
    toolSettings.type === "remove" || toolSettings.type === "toggle";

  const shouldHover = active && editable && isErase;

  const mapSize = new Vector2(mapWidth, mapHeight);

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
    if (map.snapToGrid && (isLine || isPen)) {
      position = snapPositionToGrid(position);
    }
    return Vector2.divide(position, {
      x: mapImage.width(),
      y: mapImage.height(),
    });
  }, [mapStageRef, map, isLine, isPen, snapPositionToGrid]);

  useEffect(() => {
    if (!active || !editable || isPen) {
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
      if (isBrush) {
        setDrawingWall({
          id: shortid.generate(),
          type: "wall",
          points: [brushPosition],
          blocksVision: true,
        });
      } else if (isLine) {
        setDrawingWall({
          id: shortid.generate(),
          type: "wall",
          points: [brushPosition, brushPosition],
          blocksVision: true,
        });
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
      if (isBrushDown && drawingWall) {
        if (isBrush) {
          setDrawingWall((prevWall) => {
            if (!prevWall) {
              return prevWall;
            }
            const prevPoints = prevWall.points;
            if (
              Vector2.compare(
                prevPoints[prevPoints.length - 1],
                brushPosition,
                0.001
              )
            ) {
              return prevWall;
            }
            const points = simplifyPoints(
              [...prevPoints, brushPosition],
              1 / 1000 / stageScale
            );
            return {
              ...prevWall,
              points,
            };
          });
        } else if (isLine) {
          setDrawingWall((prevWall) => {
            if (!prevWall) {
              return prevWall;
            }
            return {
              ...prevWall,
              points: [prevWall.points[0], brushPosition],
            };
          });
        }
      }
    }

    function handleBrushUp(props: MapDragEvent) {
      if (!leftMouseButton(props)) {
        return;
      }
      if (drawingWall) {
        const points = drawingWall.points;
        const lastPoint = points[points.length - 1];
        const firstPoint = points[0];
        const isTooShort =
          points.length < 2 || Vector2.compare(firstPoint, lastPoint, 0.0001);
        if (!isTooShort) {
          onWallsAdd([{ ...drawingWall }]);
        }
      }
      if (isErase) {
        eraseHoveredWalls();
      }
      setDrawingWall(null);
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

  useEffect(() => {
    if (!active || !editable || !isPen) {
      if (penWall) {
        setPenWall(null);
      }
      return;
    }
    const mapStage = mapStageRef.current;
    if (!mapStage) {
      return;
    }

    function handlePointerMove() {
      if (!penWall) {
        return;
      }
      const brushPosition = getBrushPosition();
      if (!brushPosition) {
        return;
      }
      setPenWall((prevWall) => {
        if (!prevWall) {
          return prevWall;
        }
        return {
          ...prevWall,
          points: [...prevWall.points.slice(0, -1), brushPosition],
        };
      });
    }

    function handlePointerClick() {
      const brushPosition = getBrushPosition();
      if (!brushPosition) {
        return;
      }
      setPenWall((prevWall) => {
        if (!prevWall) {
          return {
            id: shortid.generate(),
            type: "wall",
            points: [brushPosition, brushPosition],
            blocksVision: true,
          };
        }
        return {
          ...prevWall,
          points: [
            ...prevWall.points.slice(0, -1),
            brushPosition,
            brushPosition,
          ],
        };
      });
    }

    mapStage.on("mousemove touchmove", handlePointerMove);
    mapStage.on("click tap", handlePointerClick);

    return () => {
      mapStage.off("mousemove touchmove", handlePointerMove);
      mapStage.off("click tap", handlePointerClick);
    };
  }, [active, editable, isPen, mapStageRef, penWall, getBrushPosition]);

  const finishPenWall = useCallback(() => {
    if (!penWall) {
      return;
    }
    const points = penWall.points.slice(0, -1);
    const simplified = simplifyPoints(points, 1 / 1000 / stageScale);
    if (simplified.length > 1) {
      onWallsAdd([
        {
          ...penWall,
          points: simplified,
        },
      ]);
    }
    setPenWall(null);
  }, [penWall, onWallsAdd, stageScale]);

  const removeLastPenPoint = useCallback(() => {
    setPenWall((prevWall) => {
      if (!prevWall) {
        return prevWall;
      }
      if (prevWall.points.length > 2) {
        return {
          ...prevWall,
          points: [
            ...prevWall.points.slice(0, -2),
            ...prevWall.points.slice(-1),
          ],
        };
      }
      return null;
    });
  }, []);

  function handleKeyDown(event: KeyboardEvent) {
    if (!active || !isPen || !penWall) {
      return;
    }
    if (shortcuts.fogFinishPolygon(event)) {
      finishPenWall();
    } else if (shortcuts.fogCancelPolygon(event)) {
      setPenWall(null);
    } else if (shortcuts.delete(event)) {
      removeLastPenPoint();
    }
  }

  useKeyboard(handleKeyDown);

  function handleWallOver(wall: Wall, isDown: boolean) {
    if (shouldHover && isDown) {
      if (erasingWalls.findIndex((s) => s.id === wall.id) === -1) {
        setErasingWalls((prevWalls) => [...prevWalls, wall]);
      }
    }
  }

  function eraseHoveredWalls() {
    if (erasingWalls.length > 0) {
      onWallsRemove(erasingWalls.map((wall) => wall.id));
      setErasingWalls([]);
    }
  }

  function renderWall(wall: Wall, color: string = colors.black) {
    const strokeWidth = gridStrokeWidth * 1.5;
    const hitStrokeWidth = Math.max(12 / stageScale, strokeWidth * 2);
    return (
      <Line
        key={wall.id}
        points={scaleAndFlattenPoints(wall.points, mapSize)}
        stroke={color}
        strokeWidth={strokeWidth}
        lineCap="round"
        lineJoin="round"
        hitStrokeWidth={hitStrokeWidth}
        onMouseMove={(e: Konva.KonvaEventObject<MouseEvent>) =>
          (!isBrushDown || leftMouseButton(e)) &&
          handleWallOver(wall, isBrushDown)
        }
        onTouchOver={() => handleWallOver(wall, isBrushDown)}
        onMouseDown={(e: Konva.KonvaEventObject<MouseEvent>) =>
          leftMouseButton(e) && handleWallOver(wall, true)
        }
        onTouchStart={() => handleWallOver(wall, true)}
        onMouseUp={eraseHoveredWalls}
        onTouchEnd={eraseHoveredWalls}
      />
    );
  }

  function renderErasingWall(wall: Wall) {
    return renderWall(wall, colors.primary);
  }

  function renderDrawingWall(wall: Wall) {
    return renderWall(wall, colors.darkGray || colors.black);
  }

  function renderPenAcceptTick(wall: Wall) {
    if (wall.points.length === 0) {
      return null;
    }
    const isCross = wall.points.length < 3;
    return (
      <Tick
        x={wall.points[0].x * mapWidth}
        y={wall.points[0].y * mapHeight}
        scale={1 / stageScale}
        cross={isCross}
        onClick={(e) => {
          e.cancelBubble = true;
          if (isCross) {
            setPenWall(null);
          } else {
            finishPenWall();
          }
        }}
      />
    );
  }

  return (
    <Group>
      {walls.map((wall) => renderWall(wall))}
      {drawingWall && renderDrawingWall(drawingWall)}
      {penWall && renderDrawingWall(penWall)}
      {penWall && renderPenAcceptTick(penWall)}
      {erasingWalls.length > 0 && erasingWalls.map(renderErasingWall)}
    </Group>
  );
}

export default WallTool;
