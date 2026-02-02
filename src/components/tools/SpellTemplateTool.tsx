import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import shortid from "shortid";
import { Group, Line, Circle } from "react-konva";
import Konva from "konva";

import {
  useInteractionEmitter,
  MapDragEvent,
  leftMouseButton,
  useMapWidth,
  useMapHeight,
  useSetPreventMapInteraction,
} from "../../contexts/MapInteractionContext";
import { useMapStage } from "../../contexts/MapStageContext";
import {
  useGrid,
  useGridCellPixelSize,
  useGridCellPixelOffset,
  useGridOffset,
} from "../../contexts/GridContext";

import Vector2 from "../../helpers/Vector2";
import { getRelativePointerPosition } from "../../helpers/konva";
import useGridSnapping from "../../hooks/useGridSnapping";

import { Map } from "../../types/Map";
import {
  SpellTemplate,
  SpellTemplateToolSettings,
  SpellTemplateType,
} from "../../types/SpellTemplate";

import SpellTemplateShape from "../konva/SpellTemplate";
import SpellTemplateGridOverlay from "../konva/SpellTemplateGridOverlay";
import {
  AffectedCell,
  getAffectedCells,
  getTemplateBoundingBox,
  isPointInTemplate,
} from "../../helpers/spellTemplates";
import SpellTemplateHud from "../spellTemplates/SpellTemplateHud";
import { TokenState } from "../../types/TokenState";

const ROTATION_HANDLE_DISTANCE = 24;
const DEFAULT_TEMPLATE_SETTINGS: SpellTemplateToolSettings = {
  type: "circle",
  rule: "center",
  color: "red",
  opacity: 0.5,
  strokeWidth: 1,
  lineWidth: 1,
  coneAngle: 90,
  ringInnerRatio: 0.5,
  previewOnRotate: true,
};

export type SpellTemplateAddHandler = (template: SpellTemplate) => void;
export type SpellTemplateEditHandler = (edits: Partial<SpellTemplate>[]) => void;
export type SpellTemplateRemoveHandler = (ids: string[]) => void;

type SpellTemplateToolProps = {
  map: Map | null;
  templates: SpellTemplate[];
  active: boolean;
  editable: boolean;
  toolSettings: SpellTemplateToolSettings;
  onTemplateAdd: SpellTemplateAddHandler;
  onTemplateEdit: SpellTemplateEditHandler;
  selectedTemplateId: string | null;
  onSelectedTemplateIdChange: (templateId: string | null) => void;
  onRemoveSelectedTemplate?: () => void;
  onTemplateDragStateChange?: (dragging: boolean) => void;
  isPointOverTrash?: (clientX: number, clientY: number) => boolean;
  tokens?: TokenState[];
};
function SpellTemplateTool({
  map,
  templates,
  active,
  editable,
  toolSettings: incomingToolSettings,
  onTemplateAdd,
  onTemplateEdit,
  selectedTemplateId,
  onSelectedTemplateIdChange,
  onRemoveSelectedTemplate,
  onTemplateDragStateChange,
  isPointOverTrash,
  tokens = [],
}: SpellTemplateToolProps) {
  const toolSettings: SpellTemplateToolSettings =
    incomingToolSettings || DEFAULT_TEMPLATE_SETTINGS;
  const mapStageRef = useMapStage();
  const interactionEmitter = useInteractionEmitter();
  const setPreventMapInteraction = useSetPreventMapInteraction();

  const mapWidth = useMapWidth();
  const mapHeight = useMapHeight();
  const grid = useGrid();
  const gridCellPixelSize = useGridCellPixelSize();
  const gridCellPixelOffset = useGridCellPixelOffset();
  const gridOffset = useGridOffset();

  const snapPositionToGrid = useGridSnapping();

  const [drawingTemplate, setDrawingTemplate] = useState<SpellTemplate | null>(
    null
  );
  const [rotatingTemplateId, setRotatingTemplateId] = useState<string | null>(
    null
  );
  const [cursorPosition, setCursorPosition] = useState<Vector2 | null>(null);
  const ignoreNextDragRef = useRef(false);
  const drawStartRef = useRef<Vector2 | null>(null);
  const rotationStateRef = useRef<{
    id: string;
    startAngle: number;
    pivot: Vector2;
    points?: Vector2[];
  } | null>(null);

  const activeTemplate = drawingTemplate ||
    templates.find((template) => template.id === selectedTemplateId) ||
    null;

  useEffect(() => {
    if (!active) {
      setDrawingTemplate(null);
      onSelectedTemplateIdChange(null);
      setRotatingTemplateId(null);
      onTemplateDragStateChange && onTemplateDragStateChange(false);
      setPreventMapInteraction(false);
    }
  }, [
    active,
    onSelectedTemplateIdChange,
    onTemplateDragStateChange,
    setPreventMapInteraction,
  ]);

  useEffect(() => {
    if (toolSettings.type !== "drag") {
      onTemplateDragStateChange && onTemplateDragStateChange(false);
    }
  }, [toolSettings.type, onTemplateDragStateChange]);

  const templatesById = useMemo(() => {
    const map: Record<string, SpellTemplate> = {};
    for (let template of templates) {
      map[template.id] = template;
    }
    return map;
  }, [templates]);

  useEffect(() => {
    if (selectedTemplateId && !templatesById[selectedTemplateId]) {
      onSelectedTemplateIdChange(null);
    }
  }, [selectedTemplateId, templatesById, onSelectedTemplateIdChange]);

  const getBrushPosition = useCallback(
    (snapping = true) => {
      const mapStage = mapStageRef.current;
      if (!mapStage || !map) {
        return;
      }
      const mapImage = mapStage.findOne("#mapImage");
      let position = getRelativePointerPosition(mapImage);
      if (!position) {
        return;
      }
      if (map.snapToGrid && snapping) {
        position = snapPositionToGrid(position);
      }
      return Vector2.divide(position, {
        x: mapImage.width(),
        y: mapImage.height(),
      });
    },
    [mapStageRef, map, snapPositionToGrid]
  );

  const getWidthNormalized = useCallback(() => {
    const minSide = Math.min(mapWidth, mapHeight);
    const minCell = Math.min(
      gridCellPixelSize.width,
      gridCellPixelSize.height
    );
    const widthPixels = toolSettings.lineWidth * minCell;
    return minSide > 0 ? widthPixels / minSide : 0;
  }, [mapWidth, mapHeight, gridCellPixelSize, toolSettings.lineWidth]);

  const createTemplate = useCallback(
    (type: SpellTemplateType, origin: Vector2) => {
    const base = {
      id: shortid.generate(),
      type,
      origin,
      rotation: 0,
      params: {},
      style: {
        color: toolSettings.color,
        opacity: toolSettings.opacity,
        strokeWidth: toolSettings.strokeWidth,
      },
    } as SpellTemplate;

    if (type === "circle") {
      base.params.radius = 0;
    } else if (type === "ring") {
      base.params.radius = 0;
      base.params.innerRadius = 0;
    } else if (type === "rectangle") {
      base.params.width = 0;
      base.params.height = 0;
    } else if (type === "line") {
      base.params.points = [origin, origin];
      base.params.width = getWidthNormalized();
    } else if (type === "cone") {
      base.params.length = 0;
      base.params.angle = toolSettings.coneAngle;
    } else if (type === "path") {
      base.params.points = [origin, origin];
      base.params.width = getWidthNormalized();
    }

    return base;
    },
    [toolSettings, getWidthNormalized]
  );
  useEffect(() => {
    if (
      !active ||
      !editable ||
      toolSettings.type === "path" ||
      toolSettings.type === "drag"
    ) {
      return;
    }

    function handleDragStart(props: MapDragEvent) {
      if (!leftMouseButton(props)) {
        return;
      }
      if (ignoreNextDragRef.current) {
        ignoreNextDragRef.current = false;
        return;
      }
      const brushPosition = getBrushPosition();
      if (!brushPosition) {
        return;
      }
      const templateType = toolSettings.type;
      if (templateType === "drag") {
        return;
      }
      onSelectedTemplateIdChange(null);
      drawStartRef.current = brushPosition;
      setDrawingTemplate(createTemplate(templateType, brushPosition));
    }

    function handleDragMove(props: MapDragEvent) {
      if (!leftMouseButton(props)) {
        return;
      }
      const brushPosition = getBrushPosition();
      if (!brushPosition) {
        return;
      }
      if (!drawingTemplate) {
        return;
      }
      setDrawingTemplate((prevTemplate) => {
        if (!prevTemplate) {
          return prevTemplate;
        }
        const minSide = Math.min(mapWidth, mapHeight) || 1;
        const start = drawStartRef.current || prevTemplate.origin;
        const originPixel = Vector2.multiply(start, {
          x: mapWidth,
          y: mapHeight,
        });
        const currentPixel = Vector2.multiply(brushPosition, {
          x: mapWidth,
          y: mapHeight,
        });
        const delta = Vector2.subtract(currentPixel, originPixel);
        const distance = Vector2.magnitude(delta) / minSide;

        if (prevTemplate.type === "circle") {
          return {
            ...prevTemplate,
            params: {
              ...prevTemplate.params,
              radius: distance,
            },
          };
        }
        if (prevTemplate.type === "ring") {
          const outerRadius = distance;
          const innerRadius = outerRadius * toolSettings.ringInnerRatio;
          return {
            ...prevTemplate,
            params: {
              ...prevTemplate.params,
              radius: outerRadius,
              innerRadius,
            },
          };
        }
        if (prevTemplate.type === "rectangle") {
          const width = Math.abs(brushPosition.x - start.x);
          const height = Math.abs(brushPosition.y - start.y);
          const center = {
            x: (start.x + brushPosition.x) / 2,
            y: (start.y + brushPosition.y) / 2,
          };
          return {
            ...prevTemplate,
            origin: center,
            params: {
              ...prevTemplate.params,
              width,
              height,
            },
          };
        }
        if (prevTemplate.type === "line") {
          return {
            ...prevTemplate,
            params: {
              ...prevTemplate.params,
              points: [start, brushPosition],
              width: getWidthNormalized(),
            },
          };
        }
        if (prevTemplate.type === "cone") {
          const rotation = (Math.atan2(delta.y, delta.x) * 180) / Math.PI;
          return {
            ...prevTemplate,
            rotation,
            params: {
              ...prevTemplate.params,
              length: distance,
              angle: toolSettings.coneAngle,
            },
          };
        }

        return prevTemplate;
      });
    }

    function handleDragEnd(props: MapDragEvent) {
      if (!leftMouseButton(props)) {
        return;
      }
      if (drawingTemplate) {
        onTemplateAdd(drawingTemplate);
        onSelectedTemplateIdChange(drawingTemplate.id);
      }
      setDrawingTemplate(null);
      drawStartRef.current = null;
    }

    interactionEmitter?.on("dragStart", handleDragStart);
    interactionEmitter?.on("drag", handleDragMove);
    interactionEmitter?.on("dragEnd", handleDragEnd);

    return () => {
      interactionEmitter?.off("dragStart", handleDragStart);
      interactionEmitter?.off("drag", handleDragMove);
      interactionEmitter?.off("dragEnd", handleDragEnd);
    };
  }, [
    active,
    editable,
    toolSettings,
    mapWidth,
    mapHeight,
    drawingTemplate,
    interactionEmitter,
    map,
    onTemplateAdd,
    onSelectedTemplateIdChange,
    createTemplate,
    getBrushPosition,
    getWidthNormalized,
  ]);

  useEffect(() => {
    if (!active || !editable || toolSettings.type !== "path") {
      return;
    }
    const mapStage = mapStageRef.current;

    function handlePointerMove() {
      const brushPosition = getBrushPosition();
      if (!brushPosition || !drawingTemplate) {
        return;
      }
      setDrawingTemplate((prevTemplate) => {
        if (!prevTemplate || !prevTemplate.params.points) {
          return prevTemplate;
        }
        return {
          ...prevTemplate,
          params: {
            ...prevTemplate.params,
            points: [
              ...prevTemplate.params.points.slice(0, -1),
              brushPosition,
            ],
            width: getWidthNormalized(),
          },
        };
      });
    }

    function handlePointerClick(event: Konva.KonvaEventObject<MouseEvent>) {
      if (!leftMouseButton(event)) {
        return;
      }
      const brushPosition = getBrushPosition();
      if (!brushPosition) {
        return;
      }
      onSelectedTemplateIdChange(null);
      setDrawingTemplate((prevTemplate) => {
        if (!prevTemplate) {
          return createTemplate("path", brushPosition);
        }
        const points = prevTemplate.params.points || [];
        return {
          ...prevTemplate,
          params: {
            ...prevTemplate.params,
            points: [...points.slice(0, -1), brushPosition, brushPosition],
            width: getWidthNormalized(),
          },
        };
      });
    }

    function finishPath() {
      if (!drawingTemplate || !drawingTemplate.params.points) {
        return;
      }
      const points = drawingTemplate.params.points.slice(0, -1);
      if (points.length > 1) {
        onTemplateAdd({
          ...drawingTemplate,
          params: { ...drawingTemplate.params, points },
        });
        onSelectedTemplateIdChange(drawingTemplate.id);
      }
      setDrawingTemplate(null);
    }

    function handlePointerDoubleClick(event: Konva.KonvaEventObject<MouseEvent>) {
      event.evt.preventDefault();
      finishPath();
    }

    function handleContextMenu(event: Konva.KonvaEventObject<MouseEvent>) {
      event.evt.preventDefault();
      finishPath();
    }

    mapStage?.on("mousemove touchmove", handlePointerMove);
    mapStage?.on("click tap", handlePointerClick);
    mapStage?.on("dblclick dbltap", handlePointerDoubleClick);
    mapStage?.on("contextmenu", handleContextMenu);

    return () => {
      mapStage?.off("mousemove touchmove", handlePointerMove);
      mapStage?.off("click tap", handlePointerClick);
      mapStage?.off("dblclick dbltap", handlePointerDoubleClick);
      mapStage?.off("contextmenu", handleContextMenu);
    };
  }, [
    active,
    editable,
    toolSettings.type,
    toolSettings.lineWidth,
    drawingTemplate,
    mapStageRef,
    map,
    onTemplateAdd,
    onSelectedTemplateIdChange,
    createTemplate,
    getBrushPosition,
    getWidthNormalized,
  ]);
  useEffect(() => {
    if (!active) {
      return;
    }
    const mapStage = mapStageRef.current;

    function handleCursorMove() {
      if (!mapStage) {
        return;
      }
      const mapImage = mapStage.findOne("#mapImage");
      const position = getRelativePointerPosition(mapImage);
      if (position) {
        setCursorPosition(position);
      }
    }

    mapStage?.on("mousemove touchmove", handleCursorMove);
    return () => {
      mapStage?.off("mousemove touchmove", handleCursorMove);
    };
  }, [active, mapStageRef]);

  useEffect(() => {
    if (!active || !editable || !rotatingTemplateId) {
      return;
    }
    const mapStage = mapStageRef.current;

    function handleRotateMove(event: Konva.KonvaEventObject<MouseEvent>) {
      const templateId = rotatingTemplateId;
      if (!templateId) {
        return;
      }
      const template = templatesById[templateId];
      if (!template) {
        return;
      }
      const mapImage = mapStage?.findOne("#mapImage");
      if (!mapImage) {
        return;
      }
      const position = getRelativePointerPosition(mapImage);
      if (!position) {
        return;
      }
      if (template.type === "line" || template.type === "path") {
        const rotationState = rotationStateRef.current;
        if (!rotationState || rotationState.id !== template.id) {
          return;
        }
        const currentAngle =
          (Math.atan2(
            position.y - rotationState.pivot.y,
            position.x - rotationState.pivot.x
          ) *
            180) /
          Math.PI;
        const delta = currentAngle - rotationState.startAngle;
        const points = rotationState.points || [];
        const rotated = points.map((point) => {
          const pixel = Vector2.multiply(point, {
            x: mapWidth,
            y: mapHeight,
          });
          const nextPixel = Vector2.rotate(pixel, rotationState.pivot, delta);
          return {
            x: nextPixel.x / mapWidth,
            y: nextPixel.y / mapHeight,
          };
        });
        onTemplateEdit([
          {
            id: template.id,
            params: { ...template.params, points: rotated },
          },
        ]);
        return;
      }
      const originPixel = Vector2.multiply(template.origin, {
        x: mapWidth,
        y: mapHeight,
      });
      let rotation =
        (Math.atan2(position.y - originPixel.y, position.x - originPixel.x) *
          180) /
        Math.PI;
      if (event.evt.shiftKey) {
        rotation = Math.round(rotation / 45) * 45;
      }
      onTemplateEdit([{ id: template.id, rotation }]);
    }

    function handleRotateEnd() {
      setRotatingTemplateId(null);
      setPreventMapInteraction(false);
      rotationStateRef.current = null;
      ignoreNextDragRef.current = false;
    }

    mapStage?.on("mousemove touchmove", handleRotateMove);
    mapStage?.on("mouseup touchend", handleRotateEnd);

    return () => {
      mapStage?.off("mousemove touchmove", handleRotateMove);
      mapStage?.off("mouseup touchend", handleRotateEnd);
    };
  }, [
    active,
    editable,
    rotatingTemplateId,
    templatesById,
    mapStageRef,
    mapWidth,
    mapHeight,
    onTemplateEdit,
    setPreventMapInteraction,
  ]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && drawingTemplate) {
        setDrawingTemplate(null);
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        if (drawingTemplate?.type === "path" && drawingTemplate.params.points) {
          const points = drawingTemplate.params.points;
          if (points.length > 2) {
            setDrawingTemplate({
              ...drawingTemplate,
              params: {
                ...drawingTemplate.params,
                points: [...points.slice(0, -2), points[points.length - 1]],
              },
            });
          } else {
            setDrawingTemplate(null);
          }
        } else if (selectedTemplateId && onRemoveSelectedTemplate) {
          onRemoveSelectedTemplate();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawingTemplate, selectedTemplateId, onRemoveSelectedTemplate]);
  const affectedCells: AffectedCell[] = useMemo(() => {
    if (!activeTemplate || !map) {
      return [];
    }
    if (
      rotatingTemplateId &&
      activeTemplate.id === rotatingTemplateId &&
      !toolSettings.previewOnRotate
    ) {
      return [];
    }
    return getAffectedCells(
      activeTemplate,
      toolSettings.rule,
      grid,
      gridCellPixelSize,
      gridOffset,
      gridCellPixelOffset,
      { x: mapWidth, y: mapHeight }
    );
  }, [
    activeTemplate,
    toolSettings.rule,
    grid,
    gridCellPixelSize,
    gridOffset,
    gridCellPixelOffset,
    mapWidth,
    mapHeight,
    map,
    rotatingTemplateId,
    toolSettings.previewOnRotate,
  ]);

  const hitTokens = useMemo(() => {
    if (!activeTemplate || tokens.length === 0) {
      return [];
    }
    const mapSize = { x: mapWidth, y: mapHeight };
    return tokens.filter((token) => {
      if (!token.visible) {
        return false;
      }
      const center = {
        x: token.x * mapWidth,
        y: token.y * mapHeight,
      };
      return isPointInTemplate(activeTemplate, mapSize, center);
    });
  }, [activeTemplate, tokens, mapWidth, mapHeight]);

  function handleTemplateDragEnd(
    template: SpellTemplate,
    event: Konva.KonvaEventObject<DragEvent>
  ) {
    const finishDrag = () => {
      onTemplateDragStateChange && onTemplateDragStateChange(false);
      setPreventMapInteraction(false);
    };
    const node = event.target;
    const delta = node.position();
    node.position({ x: 0, y: 0 });
    const nativeEvent = event.evt as MouseEvent | TouchEvent;
    let clientX: number | undefined;
    let clientY: number | undefined;
    if (typeof (nativeEvent as MouseEvent).clientX === "number") {
      clientX = (nativeEvent as MouseEvent).clientX;
      clientY = (nativeEvent as MouseEvent).clientY;
    } else if ("changedTouches" in nativeEvent && nativeEvent.changedTouches[0]) {
      clientX = nativeEvent.changedTouches[0].clientX;
      clientY = nativeEvent.changedTouches[0].clientY;
    }
    if (
      clientX !== undefined &&
      clientY !== undefined &&
      isPointOverTrash &&
      isPointOverTrash(clientX, clientY)
    ) {
      if (selectedTemplateId === template.id && onRemoveSelectedTemplate) {
        onRemoveSelectedTemplate();
      }
      finishDrag();
      return;
    }
    if (delta.x === 0 && delta.y === 0) {
      finishDrag();
      return;
    }
    const deltaNorm = {
      x: delta.x / mapWidth,
      y: delta.y / mapHeight,
    };

    if (template.type === "line" || template.type === "path") {
      const points = (template.params.points || []).map((point) => ({
        x: point.x + deltaNorm.x,
        y: point.y + deltaNorm.y,
      }));
      onTemplateEdit([
        {
          id: template.id,
          params: { ...template.params, points },
        },
      ]);
      finishDrag();
      return;
    }

    onTemplateEdit([
      {
        id: template.id,
        origin: Vector2.add(template.origin, deltaNorm),
      },
    ]);
    finishDrag();
  }

  const renderRotationHandle = useCallback(
    (template: SpellTemplate) => {
      if (
        template.type !== "rectangle" &&
        template.type !== "cone" &&
        template.type !== "line" &&
        template.type !== "path"
      ) {
        return null;
      }
      const bounds = getTemplateBoundingBox(template, {
        x: mapWidth,
        y: mapHeight,
      });
      const handlePosition = {
        x: bounds.center.x,
        y: bounds.min.y - ROTATION_HANDLE_DISTANCE,
      };
      const origin =
        template.type === "rectangle" || template.type === "cone"
          ? Vector2.multiply(template.origin, {
              x: mapWidth,
              y: mapHeight,
            })
          : bounds.center;

      function startRotate(
        event: Konva.KonvaEventObject<MouseEvent | TouchEvent>
      ) {
        event.cancelBubble = true;
        ignoreNextDragRef.current = true;
        setPreventMapInteraction(true);
        setRotatingTemplateId(template.id);
        if (template.type === "line" || template.type === "path") {
          const mapStage = mapStageRef.current;
          const mapImage = mapStage?.findOne("#mapImage");
          if (!mapImage) {
            return;
          }
          const position = getRelativePointerPosition(mapImage);
          if (!position) {
            return;
          }
          const startAngle =
            (Math.atan2(
              position.y - bounds.center.y,
              position.x - bounds.center.x
            ) *
              180) /
            Math.PI;
          rotationStateRef.current = {
            id: template.id,
            startAngle,
            pivot: bounds.center,
            points: template.params.points || [],
          };
        }
      }

      return (
        <Group>
          <Line
            points={[origin.x, origin.y, handlePosition.x, handlePosition.y]}
            stroke="white"
            strokeWidth={1}
          />
          <Circle
            x={handlePosition.x}
            y={handlePosition.y}
            radius={6}
            fill="white"
            stroke="black"
            strokeWidth={1}
            onMouseDown={startRotate}
            onTouchStart={startRotate}
          />
        </Group>
      );
    },
    [mapWidth, mapHeight, mapStageRef, setPreventMapInteraction]
  );

  function renderTemplate(template: SpellTemplate) {
    const isSelected = template.id === selectedTemplateId;
    const bounds = getTemplateBoundingBox(template, {
      x: mapWidth,
      y: mapHeight,
    });
    const dragBoundFunc = (pos: { x: number; y: number }) => {
      const minX = -bounds.min.x;
      const maxX = mapWidth - bounds.max.x;
      const minY = -bounds.min.y;
      const maxY = mapHeight - bounds.max.y;
      if (minX > maxX || minY > maxY) {
        return pos;
      }
      return {
        x: Math.min(Math.max(pos.x, minX), maxX),
        y: Math.min(Math.max(pos.y, minY), maxY),
      };
    };
    return (
      <Group
        key={template.id}
        draggable={
          active &&
          editable &&
          isSelected &&
          !rotatingTemplateId &&
          toolSettings.type === "drag"
        }
        onDragStart={() => {
          setPreventMapInteraction(true);
          onTemplateDragStateChange && onTemplateDragStateChange(true);
        }}
        onDragEnd={(event) => handleTemplateDragEnd(template, event)}
        dragBoundFunc={dragBoundFunc}
        onMouseDown={() => {
          if (!active) {
            return;
          }
          ignoreNextDragRef.current = true;
          onSelectedTemplateIdChange(template.id);
        }}
        onTap={() => {
          if (!active) {
            return;
          }
          ignoreNextDragRef.current = true;
          onSelectedTemplateIdChange(template.id);
        }}
        onMouseUp={() => {
          ignoreNextDragRef.current = false;
        }}
        onTouchEnd={() => {
          ignoreNextDragRef.current = false;
        }}
      >
        <SpellTemplateShape template={template} />
      </Group>
    );
  }

  return (
    <Group>
      {templates.map(renderTemplate)}
      {drawingTemplate && <SpellTemplateShape template={drawingTemplate} />}
      {activeTemplate && affectedCells.length > 0 && (
        <SpellTemplateGridOverlay
          cells={affectedCells}
          color={activeTemplate.style.color}
          opacity={Math.min(activeTemplate.style.opacity + 0.1, 0.6)}
        />
      )}
      {active &&
        editable &&
        selectedTemplateId &&
        templatesById[selectedTemplateId] &&
        renderRotationHandle(templatesById[selectedTemplateId])}
      {activeTemplate && (
        <SpellTemplateHud
          template={activeTemplate}
          affectedCells={affectedCells}
          tokens={hitTokens}
          cursorPosition={cursorPosition}
          mapSize={{ x: mapWidth, y: mapHeight }}
          grid={grid}
          gridCellPixelSize={gridCellPixelSize}
        />
      )}
    </Group>
  );
}

export default SpellTemplateTool;
