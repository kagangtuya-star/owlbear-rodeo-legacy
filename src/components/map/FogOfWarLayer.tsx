import { useEffect, useMemo, useRef } from "react";
import { Group, Line, Rect } from "react-konva";

import { useMapHeight, useMapWidth } from "../../contexts/MapInteractionContext";
import { useGridCellNormalizedSize } from "../../contexts/GridContext";
import { useUserId } from "../../contexts/UserIdContext";

import { Map } from "../../types/Map";
import { MapState } from "../../types/MapState";
import { Wall } from "../../types/Wall";
import { FogSettings } from "../../types/Settings";

import {
  breakIntersections,
  computeViewport,
  Point,
  Polygon,
  Segment,
} from "../../helpers/visibility";

type FogOfWarLayerProps = {
  map: Map | null;
  mapState: MapState | null;
  fogSettings?: FogSettings;
  onExploredChange?: (explored: number[][][][]) => void;
  tokenPreview?: Record<string, { x: number; y: number }>;
  useTokenPreview?: boolean;
};

type LightPolygon = {
  polygon: Polygon;
  color: string;
};

function wallToSegments(wall: Wall): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i < wall.points.length - 1; i++) {
    const a = wall.points[i];
    const b = wall.points[i + 1];
    segments.push([
      [a.x, a.y],
      [b.x, b.y],
    ]);
  }
  return segments;
}

function createEllipseSegments(
  center: Point,
  radiusX: number,
  radiusY: number,
  steps = 32
): Segment[] {
  const segments: Segment[] = [];
  if (radiusX <= 0 || radiusY <= 0 || steps < 3) {
    return segments;
  }
  const points: Point[] = [];
  for (let i = 0; i < steps; i++) {
    const angle = (Math.PI * 2 * i) / steps;
    points.push([
      center[0] + Math.cos(angle) * radiusX,
      center[1] + Math.sin(angle) * radiusY,
    ]);
  }
  for (let i = 0; i < points.length; i++) {
    const next = i === points.length - 1 ? 0 : i + 1;
    segments.push([points[i], points[next]]);
  }
  return segments;
}

function polygonToPoints(poly: Polygon, width: number, height: number) {
  const points: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    points.push(poly[i][0] * width, poly[i][1] * height);
  }
  return points;
}

function FogOfWarLayer({
  map,
  mapState,
  fogSettings,
  onExploredChange,
  tokenPreview,
  useTokenPreview,
}: FogOfWarLayerProps) {
  const mapWidth = useMapWidth();
  const mapHeight = useMapHeight();
  const gridCellNormalizedSize = useGridCellNormalizedSize();
  const userId = useUserId();
  const fogEnabled = mapState?.fogEnabled ?? true;
  const isOwner = !!(map && map.owner === userId);
  const gmOpacity =
    typeof fogSettings?.gmOpacity === "number" ? fogSettings.gmOpacity : 0.35;
  const showExplored = !!mapState?.showExplored;
  const baseFogOpacity = isOwner ? gmOpacity : 1;
  const fogOpacity = Math.min(Math.max(baseFogOpacity, 0), 1);
  const exploredCutOpacity = showExplored ? Math.min(0.2, fogOpacity) : 0;
  const dimCutOpacity = Math.min(0.35, fogOpacity);

  const walls = Object.values(mapState?.walls || {});
  const wallsSignature =
    walls.length === 0
      ? ""
      : walls
          .map((wall) => {
            const points = wall.points
              .map((point) => `${point.x},${point.y}`)
              .join(";");
            return `${wall.id}:${points}`;
          })
          .join("|");

  const wallSegments = useMemo(() => {
    if (!wallsSignature) {
      return [];
    }
    const segments = walls.flatMap(wallToSegments);
    return breakIntersections(segments);
  }, [walls, wallsSignature]);

  const tokens = useMemo(() => {
    const baseTokens = Object.values(mapState?.tokens || {});
    if (
      !useTokenPreview ||
      !tokenPreview ||
      Object.keys(tokenPreview).length === 0
    ) {
      return baseTokens;
    }
    return baseTokens.map((token) => {
      const override = tokenPreview[token.id];
      if (!override) {
        return token;
      }
      return { ...token, x: override.x, y: override.y };
    });
  }, [mapState, tokenPreview, useTokenPreview]);

  const visionSources = useMemo(() => {
    return tokens
      .filter((token) => token.hasVision && token.visible)
      .map((token) => ({
        x: token.x,
        y: token.y,
        range: typeof token.visionRange === "number" ? token.visionRange : 0,
      }));
  }, [tokens]);

  const lightSources = useMemo(() => {
    return tokens
      .filter((token) => token.visible && token.lightConfig?.enabled)
      .map((token) => ({
        x: token.x,
        y: token.y,
        bright:
          typeof token.lightConfig?.radiusBright === "number"
            ? token.lightConfig.radiusBright
            : 0,
        dim:
          typeof token.lightConfig?.radiusDim === "number"
            ? token.lightConfig.radiusDim
            : 0,
        color: token.lightConfig?.color || "#ffffff",
      }));
  }, [tokens]);

  const visibilityPolygons = useMemo(() => {
    if (!fogEnabled) {
      return [];
    }
    if (gridCellNormalizedSize.x <= 0 || gridCellNormalizedSize.y <= 0) {
      return [];
    }
    const viewportMin: Point = [0, 0];
    const viewportMax: Point = [1, 1];
    const polygons: Polygon[] = [];
    for (let source of visionSources) {
      const radiusX = source.range * gridCellNormalizedSize.x;
      const radiusY = source.range * gridCellNormalizedSize.y;
      if (radiusX <= 0 || radiusY <= 0) {
        continue;
      }
      const ellipseSegments = createEllipseSegments(
        [source.x, source.y],
        radiusX,
        radiusY
      );
      const segments = breakIntersections([...wallSegments, ...ellipseSegments]);
      const poly = computeViewport(
        [source.x, source.y],
        segments,
        viewportMin,
        viewportMax
      );
      if (poly.length > 2) {
        polygons.push(poly);
      }
    }
    return polygons;
  }, [fogEnabled, gridCellNormalizedSize, visionSources, wallSegments]);

  const lightBrightPolygons = useMemo<LightPolygon[]>(() => {
    if (!fogEnabled) {
      return [];
    }
    if (gridCellNormalizedSize.x <= 0 || gridCellNormalizedSize.y <= 0) {
      return [];
    }
    const viewportMin: Point = [0, 0];
    const viewportMax: Point = [1, 1];
    const polygons: LightPolygon[] = [];
    for (let source of lightSources) {
      const radiusX = source.bright * gridCellNormalizedSize.x;
      const radiusY = source.bright * gridCellNormalizedSize.y;
      if (radiusX <= 0 || radiusY <= 0) {
        continue;
      }
      const ellipseSegments = createEllipseSegments(
        [source.x, source.y],
        radiusX,
        radiusY
      );
      const segments = breakIntersections([...wallSegments, ...ellipseSegments]);
      const poly = computeViewport(
        [source.x, source.y],
        segments,
        viewportMin,
        viewportMax
      );
      if (poly.length > 2) {
        polygons.push({ polygon: poly, color: source.color });
      }
    }
    return polygons;
  }, [fogEnabled, gridCellNormalizedSize, lightSources, wallSegments]);

  const lightDimPolygons = useMemo<LightPolygon[]>(() => {
    if (!fogEnabled) {
      return [];
    }
    if (gridCellNormalizedSize.x <= 0 || gridCellNormalizedSize.y <= 0) {
      return [];
    }
    const viewportMin: Point = [0, 0];
    const viewportMax: Point = [1, 1];
    const polygons: LightPolygon[] = [];
    for (let source of lightSources) {
      const radiusX =
        Math.max(source.dim, source.bright) * gridCellNormalizedSize.x;
      const radiusY =
        Math.max(source.dim, source.bright) * gridCellNormalizedSize.y;
      if (radiusX <= 0 || radiusY <= 0 || source.dim <= source.bright) {
        continue;
      }
      const ellipseSegments = createEllipseSegments(
        [source.x, source.y],
        radiusX,
        radiusY
      );
      const segments = breakIntersections([...wallSegments, ...ellipseSegments]);
      const poly = computeViewport(
        [source.x, source.y],
        segments,
        viewportMin,
        viewportMax
      );
      if (poly.length > 2) {
        polygons.push({ polygon: poly, color: source.color });
      }
    }
    return polygons;
  }, [fogEnabled, gridCellNormalizedSize, lightSources, wallSegments]);

  const exploredPolygons = useMemo<Polygon[]>(() => {
    if (!showExplored) {
      return [];
    }
    const explored = (mapState?.explored ?? []) as number[][][][];
    const result: Polygon[] = [];
    for (const entry of explored) {
      if (!Array.isArray(entry)) {
        continue;
      }
      for (const polygon of entry) {
        if (Array.isArray(polygon) && polygon.length > 2) {
          result.push(polygon as Polygon);
        }
      }
    }
    return result;
  }, [mapState?.explored, showExplored]);

  const exploredRef = useRef<number[][][][] | undefined>(undefined);
  const visibilitySignatureRef = useRef<string>("");
  const visibilitySignature = useMemo(() => {
    if (visibilityPolygons.length === 0) {
      return "";
    }
    return JSON.stringify(visibilityPolygons);
  }, [visibilityPolygons]);
  const exploredTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!fogEnabled || visibilityPolygons.length === 0 || !onExploredChange) {
      return;
    }
    const explored = (mapState?.explored ?? []) as number[][][][];
    if (
      exploredRef.current === explored &&
      visibilitySignatureRef.current === visibilitySignature
    ) {
      return;
    }
    exploredRef.current = explored;
    visibilitySignatureRef.current = visibilitySignature;
    const newExplored = [
      ...explored,
      ...visibilityPolygons.map((polygon) => [polygon]),
    ];
    if (exploredTimeoutRef.current) {
      clearTimeout(exploredTimeoutRef.current);
    }
    exploredTimeoutRef.current = setTimeout(() => {
      onExploredChange(newExplored);
    }, 300);
    return () => {
      if (exploredTimeoutRef.current) {
        clearTimeout(exploredTimeoutRef.current);
        exploredTimeoutRef.current = null;
      }
    };
  }, [
    fogEnabled,
    visibilityPolygons,
    visibilitySignature,
    mapState?.explored,
    onExploredChange,
  ]);

  if (!map || !mapState || !fogEnabled) {
    return null;
  }
  if (mapWidth <= 0 || mapHeight <= 0) {
    return null;
  }

  return (
    <Group listening={false}>
      <Rect
        x={0}
        y={0}
        width={mapWidth}
        height={mapHeight}
        fill={`rgba(0,0,0,${fogOpacity})`}
      />
      {exploredPolygons.map((polygon, index) => (
        <Line
          key={`explored-${index}`}
          points={polygonToPoints(polygon, mapWidth, mapHeight)}
          closed
          fill={`rgba(0,0,0,${exploredCutOpacity})`}
          stroke={undefined}
          globalCompositeOperation="destination-out"
        />
      ))}
      {lightDimPolygons.map(({ polygon }, index) => (
        <Line
          key={`light-dim-${index}`}
          points={polygonToPoints(polygon, mapWidth, mapHeight)}
          closed
          fill={`rgba(0,0,0,${dimCutOpacity})`}
          stroke={undefined}
          globalCompositeOperation="destination-out"
        />
      ))}
      {lightBrightPolygons.map(({ polygon }, index) => (
        <Line
          key={`light-bright-${index}`}
          points={polygonToPoints(polygon, mapWidth, mapHeight)}
          closed
          fill="black"
          stroke={undefined}
          globalCompositeOperation="destination-out"
        />
      ))}
      {visibilityPolygons.map((polygon, index) => (
        <Line
          key={`vision-${index}`}
          points={polygonToPoints(polygon, mapWidth, mapHeight)}
          closed
          fill="black"
          stroke={undefined}
          globalCompositeOperation="destination-out"
        />
      ))}
      {lightDimPolygons.map(({ polygon, color }, index) => (
        <Line
          key={`light-dim-tint-${index}`}
          points={polygonToPoints(polygon, mapWidth, mapHeight)}
          closed
          fill={color}
          stroke={undefined}
          opacity={0.12}
        />
      ))}
      {lightBrightPolygons.map(({ polygon, color }, index) => (
        <Line
          key={`light-bright-tint-${index}`}
          points={polygonToPoints(polygon, mapWidth, mapHeight)}
          closed
          fill={color}
          stroke={undefined}
          opacity={0.22}
        />
      ))}
    </Group>
  );
}

export default FogOfWarLayer;
