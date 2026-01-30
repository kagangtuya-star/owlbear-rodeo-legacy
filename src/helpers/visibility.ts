export type Point = [number, number];
export type Segment = [Point, Point];
export type Polygon = Point[];

type SortedPoint = [number, number, number];

export function compute(position: Point, segments: Segment[]): Polygon {
  const bounded: Segment[] = [];
  let minX = position[0];
  let minY = position[1];
  let maxX = position[0];
  let maxY = position[1];
  for (let i = 0; i < segments.length; ++i) {
    for (let j = 0; j < 2; ++j) {
      minX = Math.min(minX, segments[i][j][0]);
      minY = Math.min(minY, segments[i][j][1]);
      maxX = Math.max(maxX, segments[i][j][0]);
      maxY = Math.max(maxY, segments[i][j][1]);
    }
    bounded.push([
      [segments[i][0][0], segments[i][0][1]],
      [segments[i][1][0], segments[i][1][1]],
    ]);
  }
  --minX;
  --minY;
  ++maxX;
  ++maxY;
  bounded.push([
    [minX, minY],
    [maxX, minY],
  ]);
  bounded.push([
    [maxX, minY],
    [maxX, maxY],
  ]);
  bounded.push([
    [maxX, maxY],
    [minX, maxY],
  ]);
  bounded.push([
    [minX, maxY],
    [minX, minY],
  ]);
  const polygon: Polygon = [];
  const sorted = sortPoints(position, bounded);
  const map = new Array(bounded.length).fill(-1);
  const heap: number[] = [];
  const start: Point = [position[0] + 1, position[1]];
  for (let i = 0; i < bounded.length; ++i) {
    const a1 = angle(bounded[i][0], position);
    const a2 = angle(bounded[i][1], position);
    let active = false;
    if (a1 > -180 && a1 <= 0 && a2 <= 180 && a2 >= 0 && a2 - a1 > 180) {
      active = true;
    }
    if (a2 > -180 && a2 <= 0 && a1 <= 180 && a1 >= 0 && a1 - a2 > 180) {
      active = true;
    }
    if (active) {
      insert(i, heap, position, bounded, start, map);
    }
  }
  for (let i = 0; i < sorted.length; ) {
    let extend = false;
    let shorten = false;
    const orig = i;
    let vertex = bounded[sorted[i][0]][sorted[i][1]];
    const oldSegment = heap[0];
    do {
      if (map[sorted[i][0]] !== -1) {
        if (sorted[i][0] === oldSegment) {
          extend = true;
          vertex = bounded[sorted[i][0]][sorted[i][1]];
        }
        remove(map[sorted[i][0]], heap, position, bounded, vertex, map);
      } else {
        insert(sorted[i][0], heap, position, bounded, vertex, map);
        if (heap[0] !== oldSegment) {
          shorten = true;
        }
      }
      ++i;
      if (i === sorted.length) {
        break;
      }
    } while (sorted[i][2] < sorted[orig][2] + epsilon());

    if (extend) {
      polygon.push(vertex);
      const cur = intersectLines(
        bounded[heap[0]][0],
        bounded[heap[0]][1],
        position,
        vertex
      );
      if (cur.length === 2 && !equal(cur, vertex)) {
        polygon.push(cur as Point);
      }
    } else if (shorten) {
      const a = intersectLines(
        bounded[oldSegment][0],
        bounded[oldSegment][1],
        position,
        vertex
      );
      const b = intersectLines(
        bounded[heap[0]][0],
        bounded[heap[0]][1],
        position,
        vertex
      );
      if (a.length === 2) {
        polygon.push(a as Point);
      }
      if (b.length === 2) {
        polygon.push(b as Point);
      }
    }
  }
  return polygon;
}

export function computeViewport(
  position: Point,
  segments: Segment[],
  viewportMinCorner: Point,
  viewportMaxCorner: Point
): Polygon {
  const brokenSegments: Segment[] = [];
  const viewport: Point[] = [
    [viewportMinCorner[0], viewportMinCorner[1]],
    [viewportMaxCorner[0], viewportMinCorner[1]],
    [viewportMaxCorner[0], viewportMaxCorner[1]],
    [viewportMinCorner[0], viewportMaxCorner[1]],
  ];
  for (let i = 0; i < segments.length; ++i) {
    if (
      segments[i][0][0] < viewportMinCorner[0] &&
      segments[i][1][0] < viewportMinCorner[0]
    ) {
      continue;
    }
    if (
      segments[i][0][1] < viewportMinCorner[1] &&
      segments[i][1][1] < viewportMinCorner[1]
    ) {
      continue;
    }
    if (
      segments[i][0][0] > viewportMaxCorner[0] &&
      segments[i][1][0] > viewportMaxCorner[0]
    ) {
      continue;
    }
    if (
      segments[i][0][1] > viewportMaxCorner[1] &&
      segments[i][1][1] > viewportMaxCorner[1]
    ) {
      continue;
    }
    const intersections: Point[] = [];
    for (let j = 0; j < viewport.length; ++j) {
      let k = j + 1;
      if (k === viewport.length) {
        k = 0;
      }
      if (
        doLineSegmentsIntersect(
          segments[i][0][0],
          segments[i][0][1],
          segments[i][1][0],
          segments[i][1][1],
          viewport[j][0],
          viewport[j][1],
          viewport[k][0],
          viewport[k][1]
        )
      ) {
        const intersect = intersectLines(
          segments[i][0],
          segments[i][1],
          viewport[j],
          viewport[k]
        );
        if (intersect.length !== 2) {
          continue;
        }
        if (equal(intersect as Point, segments[i][0])) {
          continue;
        }
        if (equal(intersect as Point, segments[i][1])) {
          continue;
        }
        intersections.push(intersect as Point);
      }
    }
    const start: Point = [segments[i][0][0], segments[i][0][1]];
    while (intersections.length > 0) {
      let endIndex = 0;
      let endDis = distance(start, intersections[0]);
      for (let j = 1; j < intersections.length; ++j) {
        const dis = distance(start, intersections[j]);
        if (dis < endDis) {
          endDis = dis;
          endIndex = j;
        }
      }
      brokenSegments.push([
        [start[0], start[1]],
        [intersections[endIndex][0], intersections[endIndex][1]],
      ]);
      start[0] = intersections[endIndex][0];
      start[1] = intersections[endIndex][1];
      intersections.splice(endIndex, 1);
    }
    brokenSegments.push([
      [start[0], start[1]],
      [segments[i][1][0], segments[i][1][1]],
    ]);
  }

  const viewportSegments: Segment[] = [];
  for (let i = 0; i < brokenSegments.length; ++i) {
    if (
      inViewport(brokenSegments[i][0], viewportMinCorner, viewportMaxCorner) &&
      inViewport(brokenSegments[i][1], viewportMinCorner, viewportMaxCorner)
    ) {
      viewportSegments.push([
        [brokenSegments[i][0][0], brokenSegments[i][0][1]],
        [brokenSegments[i][1][0], brokenSegments[i][1][1]],
      ]);
    }
  }
  const eps = epsilon() * 10;
  viewportSegments.push([
    [viewportMinCorner[0] - eps, viewportMinCorner[1] - eps],
    [viewportMaxCorner[0] + eps, viewportMinCorner[1] - eps],
  ]);
  viewportSegments.push([
    [viewportMaxCorner[0] + eps, viewportMinCorner[1] - eps],
    [viewportMaxCorner[0] + eps, viewportMaxCorner[1] + eps],
  ]);
  viewportSegments.push([
    [viewportMaxCorner[0] + eps, viewportMaxCorner[1] + eps],
    [viewportMinCorner[0] - eps, viewportMaxCorner[1] + eps],
  ]);
  viewportSegments.push([
    [viewportMinCorner[0] - eps, viewportMaxCorner[1] + eps],
    [viewportMinCorner[0] - eps, viewportMinCorner[1] - eps],
  ]);
  return compute(position, viewportSegments);
}

export function inPolygon(position: Point, polygon: Polygon): boolean {
  let val = polygon[0][0];
  for (let i = 0; i < polygon.length; ++i) {
    val = Math.min(polygon[i][0], val);
    val = Math.min(polygon[i][1], val);
  }
  const edge: Point = [val - 1, val - 1];
  let parity = 0;
  for (let i = 0; i < polygon.length; ++i) {
    let j = i + 1;
    if (j === polygon.length) {
      j = 0;
    }
    if (
      doLineSegmentsIntersect(
        edge[0],
        edge[1],
        position[0],
        position[1],
        polygon[i][0],
        polygon[i][1],
        polygon[j][0],
        polygon[j][1]
      )
    ) {
      const intersect = intersectLines(edge, position, polygon[i], polygon[j]);
      if (intersect.length !== 2) {
        continue;
      }
      if (equal(position, intersect as Point)) {
        return true;
      }
      if (equal(intersect as Point, polygon[i])) {
        if (angle2(position, edge, polygon[j]) < 180) {
          ++parity;
        }
      } else if (equal(intersect as Point, polygon[j])) {
        if (angle2(position, edge, polygon[i]) < 180) {
          ++parity;
        }
      } else {
        ++parity;
      }
    }
  }
  return parity % 2 !== 0;
}

export function convertToSegments(polygons: Polygon[]): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i < polygons.length; ++i) {
    for (let j = 0; j < polygons[i].length; ++j) {
      let k = j + 1;
      if (k === polygons[i].length) {
        k = 0;
      }
      segments.push([
        [polygons[i][j][0], polygons[i][j][1]],
        [polygons[i][k][0], polygons[i][k][1]],
      ]);
    }
  }
  return segments;
}

export function breakIntersections(segments: Segment[]): Segment[] {
  const output: Segment[] = [];
  for (let i = 0; i < segments.length; ++i) {
    const intersections: Point[] = [];
    for (let j = 0; j < segments.length; ++j) {
      if (i === j) {
        continue;
      }
      if (
        doLineSegmentsIntersect(
          segments[i][0][0],
          segments[i][0][1],
          segments[i][1][0],
          segments[i][1][1],
          segments[j][0][0],
          segments[j][0][1],
          segments[j][1][0],
          segments[j][1][1]
        )
      ) {
        const intersect = intersectLines(
          segments[i][0],
          segments[i][1],
          segments[j][0],
          segments[j][1]
        );
        if (intersect.length !== 2) {
          continue;
        }
        if (equal(intersect as Point, segments[i][0])) {
          continue;
        }
        if (equal(intersect as Point, segments[i][1])) {
          continue;
        }
        intersections.push(intersect as Point);
      }
    }
    const start: Point = [segments[i][0][0], segments[i][0][1]];
    while (intersections.length > 0) {
      let endIndex = 0;
      let endDis = distance(start, intersections[0]);
      for (let j = 1; j < intersections.length; ++j) {
        const dis = distance(start, intersections[j]);
        if (dis < endDis) {
          endDis = dis;
          endIndex = j;
        }
      }
      output.push([
        [start[0], start[1]],
        [intersections[endIndex][0], intersections[endIndex][1]],
      ]);
      start[0] = intersections[endIndex][0];
      start[1] = intersections[endIndex][1];
      intersections.splice(endIndex, 1);
    }
    output.push([
      [start[0], start[1]],
      [segments[i][1][0], segments[i][1][1]],
    ]);
  }
  return output;
}

function epsilon() {
  return 0.0000001;
}

function equal(a: Point, b: Point) {
  return (
    Math.abs(a[0] - b[0]) < epsilon() &&
    Math.abs(a[1] - b[1]) < epsilon()
  );
}

function remove(
  index: number,
  heap: number[],
  position: Point,
  segments: Segment[],
  destination: Point,
  map: number[]
) {
  map[heap[index]] = -1;
  if (index === heap.length - 1) {
    heap.pop();
    return;
  }
  heap[index] = heap.pop() as number;
  map[heap[index]] = index;
  let cur = index;
  const parentIndex = parent(cur);
  if (cur !== 0 && lessThan(heap[cur], heap[parentIndex], position, segments, destination)) {
    while (cur > 0) {
      const parentNode = parent(cur);
      if (!lessThan(heap[cur], heap[parentNode], position, segments, destination)) {
        break;
      }
      map[heap[parentNode]] = cur;
      map[heap[cur]] = parentNode;
      const temp = heap[cur];
      heap[cur] = heap[parentNode];
      heap[parentNode] = temp;
      cur = parentNode;
    }
  } else {
    while (true) {
      const left = child(cur);
      const right = left + 1;
      if (
        left < heap.length &&
        lessThan(heap[left], heap[cur], position, segments, destination) &&
        (right === heap.length ||
          lessThan(heap[left], heap[right], position, segments, destination))
      ) {
        map[heap[left]] = cur;
        map[heap[cur]] = left;
        const temp = heap[left];
        heap[left] = heap[cur];
        heap[cur] = temp;
        cur = left;
      } else if (
        right < heap.length &&
        lessThan(heap[right], heap[cur], position, segments, destination)
      ) {
        map[heap[right]] = cur;
        map[heap[cur]] = right;
        const temp = heap[right];
        heap[right] = heap[cur];
        heap[cur] = temp;
        cur = right;
      } else {
        break;
      }
    }
  }
}

function insert(
  index: number,
  heap: number[],
  position: Point,
  segments: Segment[],
  destination: Point,
  map: number[]
) {
  const intersect = intersectLines(segments[index][0], segments[index][1], position, destination);
  if (intersect.length === 0) {
    return;
  }
  let cur = heap.length;
  heap.push(index);
  map[index] = cur;
  while (cur > 0) {
    const parentNode = parent(cur);
    if (!lessThan(heap[cur], heap[parentNode], position, segments, destination)) {
      break;
    }
    map[heap[parentNode]] = cur;
    map[heap[cur]] = parentNode;
    const temp = heap[cur];
    heap[cur] = heap[parentNode];
    heap[parentNode] = temp;
    cur = parentNode;
  }
}

function lessThan(
  index1: number,
  index2: number,
  position: Point,
  segments: Segment[],
  destination: Point
) {
  const inter1 = intersectLines(segments[index1][0], segments[index1][1], position, destination);
  const inter2 = intersectLines(segments[index2][0], segments[index2][1], position, destination);
  if (inter1.length !== 2 || inter2.length !== 2) {
    return false;
  }
  if (!equal(inter1 as Point, inter2 as Point)) {
    const d1 = distance(inter1 as Point, position);
    const d2 = distance(inter2 as Point, position);
    return d1 < d2;
  }
  let end1 = 0;
  if (equal(inter1 as Point, segments[index1][0])) {
    end1 = 1;
  }
  let end2 = 0;
  if (equal(inter2 as Point, segments[index2][0])) {
    end2 = 1;
  }
  const a1 = angle2(segments[index1][end1], inter1 as Point, position);
  const a2 = angle2(segments[index2][end2], inter2 as Point, position);
  if (a1 < 180) {
    if (a2 > 180) {
      return true;
    }
    return a2 < a1;
  }
  return a1 < a2;
}

function parent(index: number) {
  return Math.floor((index - 1) / 2);
}

function child(index: number) {
  return 2 * index + 1;
}

function angle2(a: Point, b: Point, c: Point) {
  const a1 = angle(a, b);
  const a2 = angle(b, c);
  let a3 = a1 - a2;
  if (a3 < 0) {
    a3 += 360;
  }
  if (a3 > 360) {
    a3 -= 360;
  }
  return a3;
}

function sortPoints(position: Point, segments: Segment[]): SortedPoint[] {
  const points: SortedPoint[] = new Array(segments.length * 2);
  for (let i = 0; i < segments.length; ++i) {
    for (let j = 0; j < 2; ++j) {
      const a = angle(segments[i][j], position);
      points[2 * i + j] = [i, j, a];
    }
  }
  points.sort((a, b) => a[2] - b[2]);
  return points;
}

function angle(a: Point, b: Point) {
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
}

function intersectLines(a1: Point, a2: Point, b1: Point, b2: Point): Point | [] {
  const dbx = b2[0] - b1[0];
  const dby = b2[1] - b1[1];
  const dax = a2[0] - a1[0];
  const day = a2[1] - a1[1];
  const u_b = dby * dax - dbx * day;
  if (u_b !== 0) {
    const ua = (dbx * (a1[1] - b1[1]) - dby * (a1[0] - b1[0])) / u_b;
    return [a1[0] - ua * -dax, a1[1] - ua * -day];
  }
  return [];
}

function distance(a: Point, b: Point) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function isOnSegment(xi: number, yi: number, xj: number, yj: number, xk: number, yk: number) {
  return (
    (xi <= xk || xj <= xk) &&
    (xk <= xi || xk <= xj) &&
    (yi <= yk || yj <= yk) &&
    (yk <= yi || yk <= yj)
  );
}

function computeDirection(xi: number, yi: number, xj: number, yj: number, xk: number, yk: number) {
  const a = (xk - xi) * (yj - yi);
  const b = (xj - xi) * (yk - yi);
  return a < b ? -1 : a > b ? 1 : 0;
}

function doLineSegmentsIntersect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number
) {
  const d1 = computeDirection(x3, y3, x4, y4, x1, y1);
  const d2 = computeDirection(x3, y3, x4, y4, x2, y2);
  const d3 = computeDirection(x1, y1, x2, y2, x3, y3);
  const d4 = computeDirection(x1, y1, x2, y2, x4, y4);
  return (
    (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) ||
    (d1 === 0 && isOnSegment(x3, y3, x4, y4, x1, y1)) ||
    (d2 === 0 && isOnSegment(x3, y3, x4, y4, x2, y2)) ||
    (d3 === 0 && isOnSegment(x1, y1, x2, y2, x3, y3)) ||
    (d4 === 0 && isOnSegment(x1, y1, x2, y2, x4, y4))
  );
}

function inViewport(position: Point, viewportMinCorner: Point, viewportMaxCorner: Point) {
  if (position[0] < viewportMinCorner[0] - epsilon()) {
    return false;
  }
  if (position[1] < viewportMinCorner[1] - epsilon()) {
    return false;
  }
  if (position[0] > viewportMaxCorner[0] + epsilon()) {
    return false;
  }
  if (position[1] > viewportMaxCorner[1] + epsilon()) {
    return false;
  }
  return true;
}
