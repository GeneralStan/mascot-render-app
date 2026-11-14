/**
 * Minimal SVG path toolkit for the mascot rig: parse Figma path data into
 * absolute move/line/cubic segments, map every point through a transform, and
 * serialize back. Mapping control points keeps affine transforms exact and
 * small non-linear projections (face turn) visually faithful.
 */

export type Point = Readonly<{ x: number; y: number }>;

export type PathSegment =
  | Readonly<{ kind: "M"; to: Point }>
  | Readonly<{ kind: "L"; to: Point }>
  | Readonly<{ c1: Point; c2: Point; kind: "C"; to: Point }>
  | Readonly<{ kind: "Z" }>;

export type ParsedPath = readonly PathSegment[];

export type PointMap = (point: Point) => Point;

const TOKEN_PATTERN =
  /[MmLlHhVvCcSsQqZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

const parsedPathCache = new Map<string, ParsedPath>();

function pathCommandError(): never {
  throw new Error("Unsupported path command in mascot geometry.");
}

/** Parses absolute/relative M, L, H, V, C, S, Q and Z commands into absolute cubic-friendly segments. */
function readPathSegments(d: string): PathSegment[] {
  const tokens = d.match(TOKEN_PATTERN) ?? [];
  const segments: PathSegment[] = [];
  let index = 0;
  let command = "";
  let current: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  let lastControl: Point | null = null;
  const read = () => Number(tokens[index++]);
  const readPoint = (relative: boolean): Point => {
    const x = read();
    const y = read();
    return relative ? { x: current.x + x, y: current.y + y } : { x, y };
  };

  while (index < tokens.length) {
    const token = tokens[index]!;
    if (/[A-Za-z]/.test(token)) {
      command = token;
      index += 1;
      if (command === "Z" || command === "z") {
        segments.push({ kind: "Z" });
        current = start;
        lastControl = null;
        continue;
      }
    }
    const relative = command === command.toLowerCase();
    switch (command.toUpperCase()) {
      case "M": {
        current = readPoint(relative);
        start = current;
        segments.push({ kind: "M", to: current });
        command = relative ? "l" : "L";
        lastControl = null;
        break;
      }
      case "L": {
        current = readPoint(relative);
        segments.push({ kind: "L", to: current });
        lastControl = null;
        break;
      }
      case "H": {
        const x = read();
        current = { x: relative ? current.x + x : x, y: current.y };
        segments.push({ kind: "L", to: current });
        lastControl = null;
        break;
      }
      case "V": {
        const y = read();
        current = { x: current.x, y: relative ? current.y + y : y };
        segments.push({ kind: "L", to: current });
        lastControl = null;
        break;
      }
      case "C": {
        const c1 = readPoint(relative);
        const c2 = readPoint(relative);
        const to = readPoint(relative);
        segments.push({ c1, c2, kind: "C", to });
        current = to;
        lastControl = c2;
        break;
      }
      case "S": {
        const c1 = lastControl
          ? { x: 2 * current.x - lastControl.x, y: 2 * current.y - lastControl.y }
          : current;
        const c2 = readPoint(relative);
        const to = readPoint(relative);
        segments.push({ c1, c2, kind: "C", to });
        current = to;
        lastControl = c2;
        break;
      }
      case "Q": {
        const control = readPoint(relative);
        const to = readPoint(relative);
        const c1 = {
          x: current.x + (2 / 3) * (control.x - current.x),
          y: current.y + (2 / 3) * (control.y - current.y),
        };
        const c2 = {
          x: to.x + (2 / 3) * (control.x - to.x),
          y: to.y + (2 / 3) * (control.y - to.y),
        };
        segments.push({ c1, c2, kind: "C", to });
        current = to;
        lastControl = null;
        break;
      }
      default:
        pathCommandError();
    }
  }

  return segments;
}

export function parsePath(d: string): ParsedPath {
  const cached = parsedPathCache.get(d);
  if (cached) return cached;
  const parsed = readPathSegments(d);
  parsedPathCache.set(d, parsed);
  return parsed;
}

export function mapPath(path: ParsedPath, map: PointMap): ParsedPath {
  return path.map((segment) => {
    switch (segment.kind) {
      case "M":
      case "L":
        return { kind: segment.kind, to: map(segment.to) };
      case "C":
        return {
          c1: map(segment.c1),
          c2: map(segment.c2),
          kind: "C",
          to: map(segment.to),
        };
      default:
        return segment;
    }
  });
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function serializePath(path: ParsedPath): string {
  let out = "";
  for (const segment of path) {
    switch (segment.kind) {
      case "M":
      case "L":
        out += `${segment.kind}${formatNumber(segment.to.x)} ${formatNumber(segment.to.y)}`;
        break;
      case "C":
        out += `C${formatNumber(segment.c1.x)} ${formatNumber(segment.c1.y)} ${formatNumber(segment.c2.x)} ${formatNumber(segment.c2.y)} ${formatNumber(segment.to.x)} ${formatNumber(segment.to.y)}`;
        break;
      default:
        out += "Z";
    }
  }
  return out;
}

export type Bounds = { maxX: number; maxY: number; minX: number; minY: number };

export function emptyBounds(): Bounds {
  return {
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
  };
}

export function includePoint(bounds: Bounds, point: Point, pad = 0): void {
  bounds.minX = Math.min(bounds.minX, point.x - pad);
  bounds.minY = Math.min(bounds.minY, point.y - pad);
  bounds.maxX = Math.max(bounds.maxX, point.x + pad);
  bounds.maxY = Math.max(bounds.maxY, point.y + pad);
}

/** Control-polygon bounds: a conservative superset of the drawn curve. */
export function includePath(bounds: Bounds, path: ParsedPath, pad = 0): void {
  for (const segment of path) {
    if (segment.kind === "Z") continue;
    includePoint(bounds, segment.to, pad);
    if (segment.kind === "C") {
      includePoint(bounds, segment.c1, pad);
      includePoint(bounds, segment.c2, pad);
    }
  }
}

export function isFiniteBounds(bounds: Bounds): boolean {
  return (
    Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.minY) &&
    Number.isFinite(bounds.maxX) &&
    Number.isFinite(bounds.maxY)
  );
}

export function rotatePoint(point: Point, pivot: Point, radians: number): Point {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  };
}

export function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export type Affine = Readonly<{
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}>;

export const identityAffine: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function applyAffine(matrix: Affine, point: Point): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

/** Returns `outer ∘ inner`: apply `inner` first, then `outer`. */
export function composeAffine(outer: Affine, inner: Affine): Affine {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  };
}

export function translateAffine(x: number, y: number): Affine {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
}

export function scaleAffineAround(sx: number, sy: number, pivot: Point): Affine {
  return {
    a: sx,
    b: 0,
    c: 0,
    d: sy,
    e: pivot.x - sx * pivot.x,
    f: pivot.y - sy * pivot.y,
  };
}

export function rotateAffineAround(radians: number, pivot: Point): Affine {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    e: pivot.x - cos * pivot.x + sin * pivot.y,
    f: pivot.y - sin * pivot.x - cos * pivot.y,
  };
}

export function affineMap(matrix: Affine): PointMap {
  return (point) => applyAffine(matrix, point);
}
