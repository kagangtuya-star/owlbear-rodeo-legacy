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

function createCircleSegments(center: Point, radius: number, steps = 32): Segment[] {
  const segments: Segment[] = [];
  if (radius <= 0 || steps < 3) {
    return segments;
  }
  const points: Point[] = [];
  for (let i = 0; i < steps; i++) {
    const angle = (Math.PI * 2 * i) / steps;
    points.push([
      center[0] + Math.cos(angle) * radius,
      center[1] + Math.sin(angle) * radius,
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
}: FogOfWarLayerProps) {
  const mapWidth = useMapWidth();
  const mapHeight = useMapHeight();
  const gridCellNormalizedSize = useGridCellNormalizedSize();
  const userId = useUserId();
  const fogEnabled = mapState?.fogEnabled ?? true;
  const isOwner = !!(map && map.owner === userId);
  const gmOpacity =
    typeof fogSettings?.gmOpacity === "number" ? fogSettings.gmOpacity : 0.35;
  const showExplored = !!fogSettings?.showExplored;
  const baseFogOpacity = isOwner ? gmOpacity : 1;
  const fogOpacity = Math.min(Math.max(baseFogOpacity, 0), 1);
  const exploredCutOpacity = showExplored ? Math.min(0.2, fogOpacity) : 0;
  const dimCutOpacity = Math.min(0.35, fogOpacity);

  const walls = useMemo(
    () => Object.values(mapState?.walls || {}),
    [mapState?.walls]
  );

  const wallSegments = useMemo(() => {
    const segments = walls.flatMap(wallToSegments);
    return breakIntersections(segments);
  }, [walls]);

  const visionSources = useMemo(() => {
    const tokens = Object.values(mapState?.tokens || {});
    return tokens
      .filter((token) => token.hasVision && token.visible)
      .map((token) => ({
        x: token.x,
        y: token.y,
        range: typeof token.visionRange === "number" ? token.visionRange : 0,
      }));
  }, [mapState?.tokens]);

  const lightSources = useMemo(() => {
    const tokens = Object.values(mapState?.tokens || {});
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
      }));
  }, [mapState?.tokens]);

  const visibilityPolygons = useMemo(() => {
    if (!fogEnabled) {
      return [];
    }
    const unit = Math.min(
      gridCellNormalizedSize.x,
      gridCellNormalizedSize.y
    );
    if (unit <= 0) {
      return [];
    }
    const viewportMin: Point = [0, 0];
    const viewportMax: Point = [1, 1];
    const polygons: Polygon[] = [];
    for (let source of visionSources) {
      const radius = source.range * unit;
      if (radius <= 0) {
        continue;
      }
      const circleSegments = createCircleSegments([source.x, source.y], radius);
      const segments = breakIntersections([...wallSegments, ...circleSegments]);
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

  const lightBrightPolygons = useMemo(() => {
    if (!fogEnabled) {
      return [];
    }
    const unit = Math.min(
      gridCellNormalizedSize.x,
      gridCellNormalizedSize.y
    );
    if (unit <= 0) {
      return [];
    }
    const viewportMin: Point = [0, 0];
    const viewportMax: Point = [1, 1];
    const polygons: Polygon[] = [];
    for (let source of lightSources) {
      const radius = source.bright * unit;
      if (radius <= 0) {
        continue;
      }
      const circleSegments = createCircleSegments([source.x, source.y], radius);
      const segments = breakIntersections([...wallSegments, ...circleSegments]);
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
  }, [fogEnabled, gridCellNormalizedSize, lightSources, wallSegments]);

  const lightDimPolygons = useMemo(() => {
    if (!fogEnabled) {
      return [];
    }
    const unit = Math.min(
      gridCellNormalizedSize.x,
      gridCellNormalizedSize.y
    );
    if (unit <= 0) {
      return [];
    }
    const viewportMin: Point = [0, 0];
    const viewportMax: Point = [1, 1];
    const polygons: Polygon[] = [];
    for (let source of lightSources) {
      const radius = Math.max(source.dim, source.bright) * unit;
      if (radius <= 0 || source.dim <= source.bright) {
        continue;
      }
      const circleSegments = createCircleSegments([source.x, source.y], radius);
      const segments = breakIntersections([...wallSegments, ...circleSegments]);
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
  }, [fogEnabled, gridCellNormalizedSize, lightSources, wallSegments]);

  const exploredPolygons = useMemo<Polygon[]>(() => {
    if (!showExplored) {
      return [];
    }
    const explored = mapState?.explored || [];
    const result: Polygon[] = [];
    for (const entry of explored) {
      for (const polygon of entry) {
        if (Array.isArray(polygon) && polygon.length > 2) {
          result.push(polygon as Polygon);
        }
      }
    }
    return result;
  }, [mapState?.explored, showExplored]);

  const exploredSignatureRef = useRef<string>("");
  const exploredTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!fogEnabled || visibilityPolygons.length === 0 || !onExploredChange) {
      return;
    }
    const explored = mapState?.explored || [];
    const newExplored = [
      ...explored,
      ...visibilityPolygons.map((polygon) => [polygon]),
    ];
    const signature = JSON.stringify(newExplored);
    if (signature === exploredSignatureRef.current) {
      return;
    }
    exploredSignatureRef.current = signature;
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
  }, [fogEnabled, visibilityPolygons, mapState?.explored, onExploredChange]);

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
      {lightDimPolygons.map((polygon, index) => (
        <Line
          key={`light-dim-${index}`}
          points={polygonToPoints(polygon, mapWidth, mapHeight)}
          closed
          fill={`rgba(0,0,0,${dimCutOpacity})`}
          stroke={undefined}
          globalCompositeOperation="destination-out"
        />
      ))}
      {lightBrightPolygons.map((polygon, index) => (
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
    </Group>
  );
}

export default FogOfWarLayer;
