/** Cubic and arc-length geometry for limbs, including the soft-joint fillets. */

import {
  lerpPoint,
  rotatePoint,
  type PathSegment,
  type Point,
  type PointMap,
} from "./mascot-path";

export const degrees = (value: number) => (value * Math.PI) / 180;

export type Cubic = readonly [Point, Point, Point, Point];

export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
export const rotateVector = (v: Point, radians: number): Point =>
  rotatePoint(v, { x: 0, y: 0 }, radians);

export function splitCubic(curve: Cubic, t: number): readonly [Cubic, Cubic] {
  const [p0, p1, p2, p3] = curve;
  const a = lerpPoint(p0, p1, t);
  const b = lerpPoint(p1, p2, t);
  const c = lerpPoint(p2, p3, t);
  const ab = lerpPoint(a, b, t);
  const bc = lerpPoint(b, c, t);
  const mid = lerpPoint(ab, bc, t);
  return [
    [p0, a, ab, mid],
    [mid, bc, c, p3],
  ];
}

export function mapCubic(curve: Cubic, map: PointMap): Cubic {
  return [map(curve[0]), map(curve[1]), map(curve[2]), map(curve[3])];
}

export function cubicPath(start: Point, curves: readonly Cubic[]): PathSegment[] {
  return [
    { kind: "M", to: start },
    ...curves.map(
      (curve): PathSegment => ({ c1: curve[1], c2: curve[2], kind: "C", to: curve[3] }),
    ),
  ];
}

export const MAX_FILLET_TURN = degrees(160);
export const FILLET_SHARE = 0.45;
export const ARC_SAMPLES = 24;

export const length = (v: Point) => Math.hypot(v.x, v.y);
export const unit = (v: Point): Point => {
  const size = length(v);
  return size > 1e-9 ? { x: v.x / size, y: v.y / size } : { x: 0, y: 1 };
};

export function cubicAt(curve: Cubic, t: number): Point {
  const [p0, p1, p2, p3] = curve;
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * t * u * u;
  const c = 3 * t * t * u;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

export function arcLengths(curve: Cubic): number[] {
  const lengths = [0];
  let previous = curve[0];
  for (let index = 1; index <= ARC_SAMPLES; index += 1) {
    const point = cubicAt(curve, index / ARC_SAMPLES);
    lengths.push(lengths[index - 1]! + length(sub(point, previous)));
    previous = point;
  }
  return lengths;
}

export function curveLength(curve: Cubic): number {
  return arcLengths(curve)[ARC_SAMPLES]!;
}

export function tAtLength(lengths: readonly number[], distance: number): number {
  const total = lengths[ARC_SAMPLES]!;
  if (distance <= 0) return 0;
  if (distance >= total) return 1;
  for (let index = 1; index <= ARC_SAMPLES; index += 1) {
    const next = lengths[index]!;
    if (next >= distance) {
      const previous = lengths[index - 1]!;
      const local = next > previous ? (distance - previous) / (next - previous) : 0;
      return (index - 1 + local) / ARC_SAMPLES;
    }
  }
  return 1;
}

/** The part of a cubic between `startTrim` and `length - endTrim` along its arc. */
export function trimCubic(curve: Cubic, startTrim: number, endTrim: number): Cubic {
  if (startTrim <= 0 && endTrim <= 0) return curve;
  const lengths = arcLengths(curve);
  const total = lengths[ARC_SAMPLES]!;
  const t0 = tAtLength(lengths, startTrim);
  const t1 = tAtLength(lengths, total - endTrim);
  let result = curve;
  if (t1 < 1) result = splitCubic(result, t1)[0];
  const start = t1 > 0 ? t0 / t1 : 0;
  if (start > 0) result = splitCubic(result, Math.min(start, 1))[1];
  return result;
}

/** Visible leaving direction; skips Figma's collapsed control handles. */
export function startDirection(curve: Cubic): Point {
  const [p0, p1, p2, p3] = curve;
  const threshold = Math.max(length(sub(p3, p0)) * 0.2, 1e-6);
  for (const point of [p1, p2, p3]) {
    const v = sub(point, p0);
    if (length(v) > threshold) return unit(v);
  }
  return unit(sub(p3, p0));
}

export function endDirection(curve: Cubic): Point {
  const [p0, p1, p2, p3] = curve;
  const threshold = Math.max(length(sub(p3, p0)) * 0.2, 1e-6);
  for (const point of [p2, p1, p0]) {
    const v = sub(p3, point);
    if (length(v) > threshold) return unit(v);
  }
  return unit(sub(p3, p0));
}

export function turnBetween(a: Point, b: Point): number {
  return Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y)));
}

export function filletDistance(softness: number, turn: number, ...neighbours: number[]): number {
  if (softness <= 0 || turn <= 1e-3) return 0;
  const reach = softness * Math.tan(Math.min(turn, MAX_FILLET_TURN) / 2);
  return Math.min(reach, ...neighbours.map((size) => size * FILLET_SHARE));
}

/** Smooth bridge from the end of one trimmed piece to the start of the next. */
export function filletCubic(from: Cubic, to: Cubic, joint: Point): Cubic {
  const p = from[3];
  const q = to[0];
  const handleIn = (2 / 3) * length(sub(joint, p));
  const handleOut = (2 / 3) * length(sub(q, joint));
  return [p, add(p, scale(endDirection(from), handleIn)), sub(q, scale(startDirection(to), handleOut)), q];
}
