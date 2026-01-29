import polygonClipping, { Geom, Ring } from "polygon-clipping";

import Vector2, { BoundingBox } from "./Vector2";
import Size from "./Size";
import { getCellCorners, getCellLocation, getNearestCellCoordinates } from "./grid";

import { SpellTemplate, SpellTemplateRule } from "../types/SpellTemplate";
import { Grid } from "../types/Grid";

type MapSize = { x: number; y: number };

export type AffectedCell = {
  col: number;
  row: number;
  polygon: Vector2[];
  center: Vector2;
};

const CIRCLE_SEGMENTS = 32;

function toRing(points: Vector2[]): Ring {
  return points.map(({ x, y }) => [x, y]);
}

function approximateCircle(
  center: Vector2,
  radius: number,
  segments: number
): Vector2[] {
  let points: Vector2[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (Math.PI * 2 * i) / segments;
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
  }
  return points;
}

function getMinSide(mapSize: MapSize) {
  return mapSize.x < mapSize.y ? mapSize.x : mapSize.y;
}

function getTemplatePointsInPixels(
  template: SpellTemplate,
  mapSize: MapSize
): Vector2[] {
  const origin = Vector2.multiply(template.origin, mapSize);
  const minSide = getMinSide(mapSize);

  if (template.type === "circle" || template.type === "ring") {
    const radius = (template.params.radius || 0) * minSide;
    return approximateCircle(origin, radius, CIRCLE_SEGMENTS);
  }
  if (template.type === "rectangle") {
    const width = (template.params.width || 0) * mapSize.x;
    const height = (template.params.height || 0) * mapSize.y;
    const half = { x: width / 2, y: height / 2 };
    const corners = [
      { x: origin.x - half.x, y: origin.y - half.y },
      { x: origin.x + half.x, y: origin.y - half.y },
      { x: origin.x + half.x, y: origin.y + half.y },
      { x: origin.x - half.x, y: origin.y + half.y },
    ];
    return corners.map((corner) =>
      Vector2.rotate(corner, origin, template.rotation)
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
    return [
      origin,
      Vector2.add(origin, Vector2.multiply(left, length)),
      Vector2.add(origin, Vector2.multiply(right, length)),
    ];
  }
  if (template.type === "line") {
    const points = template.params.points || [];
    return points.map((point) => Vector2.multiply(point, mapSize));
  }
  if (template.type === "path") {
    const points = template.params.points || [];
    return points.map((point) => Vector2.multiply(point, mapSize));
  }
  return [];
}
function buildStrokeGeom(points: Vector2[], width: number): Geom {
  if (points.length < 2 || width <= 0) {
    return [];
  }

  const half = width / 2;
  let geoms: Geom[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    const direction = Vector2.normalize(Vector2.subtract(end, start));
    const perpendicular = { x: -direction.y, y: direction.x };
    const offset = Vector2.multiply(perpendicular, half);
    const rect = [
      Vector2.add(start, offset),
      Vector2.add(end, offset),
      Vector2.subtract(end, offset),
      Vector2.subtract(start, offset),
    ];
    geoms.push([[toRing(rect)]]);
  }

  const capSegments = Math.max(12, Math.round(CIRCLE_SEGMENTS / 2));
  for (let point of points) {
    const cap = approximateCircle(point, half, capSegments);
    geoms.push([[toRing(cap)]]);
  }

  if (geoms.length === 1) {
    return geoms[0];
  }
  return polygonClipping.union(geoms[0], ...geoms.slice(1));
}

export function getTemplateGeom(template: SpellTemplate, mapSize: MapSize): Geom {
  const origin = Vector2.multiply(template.origin, mapSize);
  const minSide = getMinSide(mapSize);

  if (template.type === "ring") {
    const outerRadius = (template.params.radius || 0) * minSide;
    const innerRadius = (template.params.innerRadius || 0) * minSide;
    const outer = approximateCircle(origin, outerRadius, CIRCLE_SEGMENTS);
    const inner = approximateCircle(origin, innerRadius, CIRCLE_SEGMENTS);
    return [[toRing(outer), toRing(inner)]];
  }

  if (template.type === "line" || template.type === "path") {
    const points = getTemplatePointsInPixels(template, mapSize);
    const width = (template.params.width || 0) * minSide;
    return buildStrokeGeom(points, width);
  }

  const points = getTemplatePointsInPixels(template, mapSize);
  if (points.length === 0) {
    return [];
  }
  return [[toRing(points)]];
}

export function getTemplateBoundingBox(
  template: SpellTemplate,
  mapSize: MapSize
): BoundingBox {
  const minSide = getMinSide(mapSize);
  if (template.type === "line" || template.type === "path") {
    const points = getTemplatePointsInPixels(template, mapSize);
    if (points.length === 0) {
      return Vector2.getBoundingBox([{ x: 0, y: 0 }]);
    }
    const bounds = Vector2.getBoundingBox(points);
    const pad = ((template.params.width || 0) * minSide) / 2;
    return {
      min: { x: bounds.min.x - pad, y: bounds.min.y - pad },
      max: { x: bounds.max.x + pad, y: bounds.max.y + pad },
      width: bounds.width + pad * 2,
      height: bounds.height + pad * 2,
      center: bounds.center,
    };
  }

  if (template.type === "ring") {
    const outerRadius = (template.params.radius || 0) * minSide;
    const origin = Vector2.multiply(template.origin, mapSize);
    return Vector2.getBoundingBox([
      { x: origin.x - outerRadius, y: origin.y - outerRadius },
      { x: origin.x + outerRadius, y: origin.y + outerRadius },
    ]);
  }

  const points = getTemplatePointsInPixels(template, mapSize);
  if (points.length === 0) {
    return Vector2.getBoundingBox([{ x: 0, y: 0 }]);
  }
  return Vector2.getBoundingBox(points);
}
function pointInRing(point: Vector2, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      (yi > point.y) !== (yj > point.y) &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 0.000001) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

function normalizeGeom(geom: Geom): Ring[][] {
  if (geom.length === 0) {
    return [];
  }
  const first = geom[0] as any;
  if (typeof first?.[0]?.[0] === "number") {
    return [geom as Ring[]];
  }
  return geom as Ring[][];
}

function pointInGeom(point: Vector2, geom: Geom): boolean {
  const polygons = normalizeGeom(geom);
  for (let polygon of polygons) {
    const outer = polygon[0];
    if (!outer || !pointInRing(point, outer)) {
      continue;
    }
    let insideHole = false;
    for (let i = 1; i < polygon.length; i++) {
      if (pointInRing(point, polygon[i])) {
        insideHole = true;
        break;
      }
    }
    if (!insideHole) {
      return true;
    }
  }
  return false;
}

export function isPointInTemplate(
  template: SpellTemplate,
  mapSize: MapSize,
  point: Vector2
): boolean {
  const geom = getTemplateGeom(template, mapSize);
  if (geom.length === 0) {
    return false;
  }
  return pointInGeom(point, geom);
}

function polygonArea(points: Ring): number {
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += points[j][0] * points[i][1] - points[i][0] * points[j][1];
  }
  return Math.abs(area / 2);
}

function geomArea(geom: Geom): number {
  const polygons = normalizeGeom(geom);
  let area = 0;
  for (let polygon of polygons) {
    if (polygon.length === 0) {
      continue;
    }
    area += polygonArea(polygon[0]);
    for (let i = 1; i < polygon.length; i++) {
      area -= polygonArea(polygon[i]);
    }
  }
  return area;
}

function resolveRule(rule: SpellTemplateRule): SpellTemplateRule {
  if (rule === "ruleset_dnd5e" || rule === "ruleset_pf") {
    return "touch";
  }
  return rule;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildCellPolygon(
  grid: Grid,
  col: number,
  row: number,
  cellSize: Size,
  gridOffset: Vector2,
  gridCellOffset: Vector2
): { polygon: Vector2[]; center: Vector2 } {
  const cellCenter = Vector2.add(
    Vector2.add(getCellLocation(grid, col, row, cellSize), gridOffset),
    gridCellOffset
  );
  const corners = getCellCorners(grid, cellCenter.x, cellCenter.y, cellSize);
  return { polygon: corners, center: cellCenter };
}

export function getAffectedCells(
  template: SpellTemplate,
  rule: SpellTemplateRule,
  grid: Grid,
  cellSize: Size,
  gridOffset: Vector2,
  gridCellOffset: Vector2,
  mapSize: MapSize
): AffectedCell[] {
  if (grid.size.x === 0 || grid.size.y === 0) {
    return [];
  }
  const resolvedRule = resolveRule(rule);
  const geom = getTemplateGeom(template, mapSize);
  const bounds = getTemplateBoundingBox(template, mapSize);
  if (geom.length === 0) {
    return [];
  }

  const min = Vector2.subtract(Vector2.subtract(bounds.min, gridOffset), gridCellOffset);
  const max = Vector2.subtract(Vector2.subtract(bounds.max, gridOffset), gridCellOffset);

  const minCoord = getNearestCellCoordinates(grid, min.x, min.y, cellSize);
  const maxCoord = getNearestCellCoordinates(grid, max.x, max.y, cellSize);

  const minCol = clamp(Math.min(minCoord.x, maxCoord.x) - 2, 0, grid.size.x - 1);
  const maxCol = clamp(Math.max(minCoord.x, maxCoord.x) + 2, 0, grid.size.x - 1);
  const minRow = clamp(Math.min(minCoord.y, maxCoord.y) - 2, 0, grid.size.y - 1);
  const maxRow = clamp(Math.max(minCoord.y, maxCoord.y) + 2, 0, grid.size.y - 1);

  let affected: AffectedCell[] = [];
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const { polygon, center } = buildCellPolygon(
        grid,
        col,
        row,
        cellSize,
        gridOffset,
        gridCellOffset
      );
      const cellGeom: Geom = [[toRing(polygon)]];

      if (resolvedRule === "center") {
        if (pointInGeom(center, geom)) {
          affected.push({ col, row, polygon, center });
        }
        continue;
      }

      const intersection = polygonClipping.intersection(geom, cellGeom);
      const area = geomArea(intersection);
      if (resolvedRule === "touch") {
        if (area > 0) {
          affected.push({ col, row, polygon, center });
        }
      } else if (resolvedRule === "area_50") {
        const cellArea = geomArea(cellGeom);
        if (cellArea > 0 && area / cellArea >= 0.5) {
          affected.push({ col, row, polygon, center });
        }
      }
    }
  }

  return affected;
}
