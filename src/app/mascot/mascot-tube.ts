/**
 * Tubes: the V2 limbs and hair strands are drawn as filled tubes. This module
 * reads a tube's base outline into a centreline plus its two long edges, stored
 * as offsets in the centreline's local frame, and rebuilds the outline around
 * any centreline with the same samples.
 *
 * At rest the rebuild reproduces the drawing. When the centreline is posed the
 * edges follow it, so the drawn widths, tapers and end shapes (round caps and
 * flat cuts) are kept. Only the base outline is read: outline, shade and
 * highlight are generated from the rebuilt tube.
 */

import { parsePath, serializePath, type PathSegment, type Point } from "./mascot-path";

export type MascotTubeEnd = "round" | "flat";
export type MascotTubeOffset = Readonly<{ along: number; across: number }>;
export type MascotTube = Readonly<{
  /** Rest centreline samples from the root end (nearest the rig pivot) to the tail. */
  midline: readonly Point[];
  /** Arclength of each centreline sample, measured from the root. */
  arc: readonly number[];
  /** The two long edges as offsets in each sample's frame (along its tangent, across it). */
  edges: readonly [readonly MascotTubeOffset[], readonly MascotTubeOffset[]];
  ends: Readonly<{ root: MascotTubeEnd; tail: MascotTubeEnd }>;
  length: number;
}>;

const FLATTEN_STEP = 0.25;
const RAIL_STEP = 0.5;
const CORNER_TURN = (35 * Math.PI) / 180;
const MAX_CUT = 30;
const STRAIGHT_TOLERANCE = 0.05;
const SMOOTH_RADIUS = 2;
const END_SPACING = 0.75;
const BODY_SPACING = 3;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const minus = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;

function firstNonZero(...vectors: Point[]): Point | null {
  return vectors.find((v) => Math.hypot(v.x, v.y) > 1e-9) ?? null;
}
function turn(a: Point, b: Point): number {
  const cos = dot(a, b) / (Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y));
  return Math.acos(Math.min(1, Math.max(-1, cos)));
}
function cubicAt(p0: Point, c1: Point, c2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
  };
}

/**
 * Flattens one closed outline into points about `step` apart. `corners` holds
 * the indices where the outline turns sharply between two path segments.
 */
export function flattenOutline(d: string, step = FLATTEN_STEP): { corners: Set<number>; points: Point[] } {
  const points: Point[] = [];
  const corners = new Set<number>();
  type Piece = { c1: Point; c2: Point; from: Point; to: Point };
  const pieces: Piece[] = [];
  let start: Point | null = null;
  let current: Point | null = null;
  const addPiece = (segment: PathSegment, to: Point) => {
    if (!current) throw new Error("Tube outline must start with a move.");
    const from = current;
    const c1 = segment.kind === "C" ? segment.c1 : lerp(from, to, 1 / 3);
    const c2 = segment.kind === "C" ? segment.c2 : lerp(from, to, 2 / 3);
    if (Math.max(dist(from, to), dist(from, c1), dist(from, c2)) > 1e-9) pieces.push({ c1, c2, from, to });
    current = to;
  };
  const segments = parsePath(d);
  if (segments.filter((segment) => segment.kind === "M").length !== 1) {
    throw new Error("Tube outline must be a single closed shape.");
  }
  for (const segment of segments) {
    if (segment.kind === "M") {
      start = current = segment.to;
    } else if (segment.kind === "Z") {
      addPiece(segment, start!);
    } else {
      addPiece(segment, segment.to);
    }
  }
  if (start && current && dist(current, start) > 1e-9) addPiece({ kind: "L", to: start }, start);
  const startTangent = (p: Piece) => firstNonZero(minus(p.c1, p.from), minus(p.c2, p.from), minus(p.to, p.from))!;
  const endTangent = (p: Piece) => firstNonZero(minus(p.to, p.c2), minus(p.to, p.c1), minus(p.to, p.from))!;
  pieces.forEach((piece, k) => {
    const previous = pieces[(k - 1 + pieces.length) % pieces.length]!;
    if (turn(endTangent(previous), startTangent(piece)) > CORNER_TURN) corners.add(points.length);
    const rough = dist(piece.from, piece.c1) + dist(piece.c1, piece.c2) + dist(piece.c2, piece.to);
    const count = Math.max(1, Math.ceil(rough / step));
    for (let i = 0; i < count; i += 1) points.push(cubicAt(piece.from, piece.c1, piece.c2, piece.to, i / count));
  });
  return { corners, points };
}

function walk(points: readonly Point[], from: number, to: number): Point[] {
  const out: Point[] = [];
  const n = points.length;
  for (let i = from; ; i = (i + 1) % n) {
    out.push(points[i]!);
    if (i === to) return out;
  }
}

function isCut(points: readonly Point[], from: number, to: number): boolean {
  if (from === to) return false;
  const run = walk(points, from, to);
  const a = run[0]!, b = run[run.length - 1]!;
  const length = dist(a, b);
  if (length > MAX_CUT || length < 1e-6) return false;
  const normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
  return run.every((p) => Math.abs(dot(minus(p, a), normal)) <= STRAIGHT_TOLERANCE);
}

/** The tube end at outline index `tip`: a flat cut between two corners, or a single tip point. */
function endRange(points: readonly Point[], corners: ReadonlySet<number>, tip: number): readonly [number, number] {
  const n = points.length;
  const nearestCorner = (direction: 1 | -1, inclusive: boolean) => {
    let travelled = 0;
    for (let i = inclusive ? tip : (tip + direction + n) % n, steps = 0; steps < n; i = (i + direction + n) % n, steps += 1) {
      if (corners.has(i)) return i;
      travelled += dist(points[i]!, points[(i + direction + n) % n]!);
      if (travelled > MAX_CUT) return null;
    }
    return null;
  };
  const candidates: Array<readonly [number, number]> = [];
  const back = nearestCorner(-1, true), ahead = nearestCorner(1, true);
  if (corners.has(tip)) {
    const before = nearestCorner(-1, false), after = nearestCorner(1, false);
    if (before !== null) candidates.push([before, tip]);
    if (after !== null) candidates.push([tip, after]);
  } else if (back !== null && ahead !== null) {
    candidates.push([back, ahead]);
  }
  const cuts = candidates.filter(([a, b]) => isCut(points, a, b));
  cuts.sort((p, q) => dist(points[p[0]]!, points[p[1]]!) - dist(points[q[0]]!, points[q[1]]!));
  return cuts[0] ?? [tip, tip];
}

function resample(line: readonly Point[], step: number): Point[] {
  const out: Point[] = [line[0]!];
  let carry = 0;
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1]!, b = line[i]!;
    const length = dist(a, b);
    let at = step - carry;
    while (at < length) {
      out.push(lerp(a, b, at / length));
      at += step;
    }
    carry = length - (at - step);
  }
  const last = line[line.length - 1]!;
  if (dist(out[out.length - 1]!, last) > 1e-6) out.push(last);
  return out;
}

/** Monotone pairing of the two edges that keeps the crossing rungs as short as possible. */
function pairEdges(a: readonly Point[], b: readonly Point[]): Array<readonly [number, number]> {
  const n = a.length, m = b.length;
  const total = new Float64Array(n * m);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < m; j += 1) {
      const previous = i === 0 && j === 0 ? 0 : Math.min(
        i > 0 && j > 0 ? total[(i - 1) * m + j - 1]! : Infinity,
        i > 0 ? total[(i - 1) * m + j]! : Infinity,
        j > 0 ? total[i * m + j - 1]! : Infinity,
      );
      total[i * m + j] = dist(a[i]!, b[j]!) + previous;
    }
  }
  const pairs: Array<readonly [number, number]> = [[n - 1, m - 1]];
  for (let i = n - 1, j = m - 1; i > 0 || j > 0;) {
    const diagonal = i > 0 && j > 0 ? total[(i - 1) * m + j - 1]! : Infinity;
    const up = i > 0 ? total[(i - 1) * m + j]! : Infinity;
    const left = j > 0 ? total[i * m + j - 1]! : Infinity;
    if (diagonal <= up && diagonal <= left) { i -= 1; j -= 1; } else if (up <= left) { i -= 1; } else { j -= 1; }
    pairs.push([i, j]);
  }
  return pairs.reverse();
}

function cumulative(line: readonly Point[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i += 1) out.push(out[i - 1]! + dist(line[i - 1]!, line[i]!));
  return out;
}

function smooth(line: readonly Point[], radius: number): Point[] {
  const arc = cumulative(line);
  const total = arc[arc.length - 1]!;
  return line.map((point, k) => {
    const r = Math.min(radius, arc[k]!, total - arc[k]!);
    if (r <= 0) return point;
    let x = 0, y = 0, count = 0;
    for (let j = k; j >= 0 && arc[k]! - arc[j]! <= r; j -= 1) { x += line[j]!.x; y += line[j]!.y; count += 1; }
    for (let j = k + 1; j < line.length && arc[j]! - arc[k]! <= r; j += 1) { x += line[j]!.x; y += line[j]!.y; count += 1; }
    return { x: x / count, y: y / count };
  });
}

/** Unit tangent at every centreline sample (central differences, one-sided at the ends). */
export function tubeTangents(midline: readonly Point[]): Point[] {
  let fallback: Point = { x: 1, y: 0 };
  return midline.map((_, i) => {
    const a = midline[Math.max(0, i - 1)]!, b = midline[Math.min(midline.length - 1, i + 1)]!;
    const length = dist(a, b);
    if (length > 1e-9) fallback = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    return fallback;
  });
}

/**
 * Reads a tube from its base outline. `rootHint` is a point near the root end
 * (the shoulder or hip dot, or Hair_base for a strand).
 */
export function extractTube(d: string, rootHint: Point): MascotTube {
  const { corners, points } = flattenOutline(d);
  const farthestFrom = (from: Point) => points.reduce((best, p, i) => (dist(p, from) > dist(points[best]!, from) ? i : best), 0);
  const tipA = farthestFrom(rootHint);
  const tipB = farthestFrom(points[tipA]!);
  const [rootTip, tailTip] = dist(points[tipA]!, rootHint) < dist(points[tipB]!, rootHint) ? [tipA, tipB] : [tipB, tipA];
  const root = endRange(points, corners, rootTip);
  const tail = endRange(points, corners, tailTip);
  const edgeA = resample(walk(points, root[1], tail[0]), RAIL_STEP);
  const edgeB = resample(walk(points, tail[1], root[0]).reverse(), RAIL_STEP);

  const pairs = pairEdges(edgeA, edgeB);
  const sideA = pairs.map(([i]) => edgeA[i]!);
  const sideB = pairs.map(([, j]) => edgeB[j]!);
  const centre = smooth(pairs.map(([i, j]) => lerp(edgeA[i]!, edgeB[j]!, 0.5)), SMOOTH_RADIUS);
  const centreArc = cumulative(centre);
  const length = centreArc[centreArc.length - 1]!;
  const widest = Math.max(...pairs.map(([i, j]) => dist(edgeA[i]!, edgeB[j]!)));
  const capZone = 1.5 * widest;

  const stations: number[] = [0];
  while (stations[stations.length - 1]! < length) {
    const s = stations[stations.length - 1]!;
    const spacing = s < capZone || s > length - capZone ? END_SPACING : BODY_SPACING;
    stations.push(Math.min(length, s + spacing));
  }
  const midline: Point[] = [], atA: Point[] = [], atB: Point[] = [];
  let k = 0;
  for (const s of stations) {
    while (k < centreArc.length - 2 && centreArc[k + 1]! < s) k += 1;
    const span = centreArc[k + 1]! - centreArc[k]!;
    const t = span > 1e-12 ? Math.min(1, Math.max(0, (s - centreArc[k]!) / span)) : 0;
    midline.push(lerp(centre[k]!, centre[k + 1]!, t));
    atA.push(lerp(sideA[k]!, sideA[k + 1]!, t));
    atB.push(lerp(sideB[k]!, sideB[k + 1]!, t));
  }
  const tangents = tubeTangents(midline);
  const toOffset = (point: Point, i: number): MascotTubeOffset => {
    const t = tangents[i]!, rel = minus(point, midline[i]!);
    return { along: dot(rel, t), across: rel.x * -t.y + rel.y * t.x };
  };
  return {
    arc: stations,
    edges: [atA.map(toOffset), atB.map(toOffset)],
    ends: { root: root[0] === root[1] ? "round" : "flat", tail: tail[0] === tail[1] ? "round" : "flat" },
    length,
    midline,
  };
}

function circumradius(a: Point, b: Point, c: Point): number {
  const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  return area2 < 1e-12 ? Infinity : (dist(a, b) * dist(b, c) * dist(c, a)) / (2 * area2);
}

/**
 * Eases a posed centreline wherever it curves tighter than the edge on the inside of
 * that curve sits from it, so that edge never folds over itself. Each pass moves only
 * those samples halfway toward their neighbours' midpoint. Ends and gentle curves are
 * untouched, and so is any curve the drawing itself has.
 */
export function relaxMidline(tube: MascotTube, midline: readonly Point[], passes = 40): Point[] {
  const [edgeA, edgeB] = tube.edges;
  const rest = tube.midline;
  // Curvature is measured across about 2 px either side; closer neighbours make it noisy.
  const spacing = tube.length / Math.max(rest.length - 1, 1);
  const reach = Math.max(1, Math.round(2 / Math.max(spacing, 1e-6)));
  const around = (line: readonly Point[], i: number) => [line[Math.max(0, i - reach)]!, line[i]!, line[Math.min(line.length - 1, i + reach)]!] as const;
  const turnSign = (a: Point, p: Point, c: Point) => Math.sign((p.x - a.x) * (c.y - p.y) - (p.y - a.y) * (c.x - p.x));
  const drawn = rest.map((_, i) => {
    if (i < reach || i > rest.length - 1 - reach) return { radius: Infinity, side: 0 };
    const [a, p, c] = around(rest, i);
    return { radius: circumradius(a, p, c), side: turnSign(a, p, c) };
  });
  /** The tightest radius allowed for a curve turning toward `side` (+1 left, −1 right) at sample `i`. */
  const allowed = (i: number, side: number) => {
    const inside = Math.max(0, ...[edgeA[i]!.across, edgeB[i]!.across].filter((across) => across * side > 0).map(Math.abs)) * 1.05;
    // A curve the drawing already has, in the same direction, is always allowed.
    return drawn[i]!.side === side ? Math.min(inside, drawn[i]!.radius * 0.999) : inside;
  };
  let line = [...midline];
  for (let pass = 0; pass < passes; pass += 1) {
    let moved = false;
    line = line.map((p, i) => {
      if (i < reach || i > line.length - 1 - reach) return p;
      const [a, , c] = around(line, i);
      const turning = turnSign(a, p, c);
      if (turning === 0 || circumradius(a, p, c) >= allowed(i, turning)) return p;
      moved = true;
      return lerp(p, lerp(line[i - 1]!, line[i + 1]!, 0.5), 0.5);
    });
    if (!moved) break;
  }
  return line;
}

/** Index pairs where an open polyline crosses itself within `span` samples. */
function localCrossings(line: readonly Point[], span: number): Array<readonly [number, number]> {
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const hits: Array<readonly [number, number]> = [];
  for (let i = 0; i < line.length - 1; i += 1) {
    for (let j = i + 2; j < Math.min(line.length - 1, i + span); j += 1) {
      const a = line[i]!, b = line[i + 1]!, c = line[j]!, d = line[j + 1]!;
      const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
      if (d1 * d2 < -1e-12 && d3 * d4 < -1e-12) hits.push([i, j]);
    }
  }
  return hits;
}

/**
 * A last guard after `relaxMidline`: wherever an edge still loops over itself, smooth the
 * centreline across that stretch and try again, a few rounds at most.
 * Untouched where the edges are already clean, so drawings stay exact at rest.
 */
export function untangleMidline(tube: MascotTube, midline: readonly Point[], rounds = 8): Point[] {
  let line = [...midline];
  const span = line.length;
  for (let round = 0; round < rounds; round += 1) {
    const [a, b] = tubeEdges(tube, line);
    const hits = [...localCrossings(a, span), ...localCrossings(b, span)];
    if (hits.length === 0) break;
    const touched = new Set<number>();
    for (const [i, j] of hits) for (let k = Math.max(1, i - 3); k <= Math.min(line.length - 2, j + 4); k += 1) touched.add(k);
    for (let pass = 0; pass < 3; pass += 1) {
      line = line.map((p, k) => (touched.has(k) ? lerp(p, lerp(line[k - 1]!, line[k + 1]!, 0.5), 0.5) : p));
    }
  }
  return line;
}

/**
 * Resamples a tube to `count` samples evenly spaced along its centreline. Edge 0 always
 * ends up on the left of the centreline, so tubes from different drawings, mirrored
 * or not, line up sample for sample and can be blended.
 */
export function resampleTube(tube: MascotTube, count: number): MascotTube {
  const leftFirst = tube.edges[0].reduce((sum, o) => sum + o.across, 0) >= tube.edges[1].reduce((sum, o) => sum + o.across, 0);
  const [left, right] = leftFirst ? tube.edges : [tube.edges[1], tube.edges[0]];
  const stations = Array.from({ length: count }, (_, k) => (tube.length * k) / (count - 1));
  const midline: Point[] = [], edgeLeft: MascotTubeOffset[] = [], edgeRight: MascotTubeOffset[] = [];
  let i = 0;
  for (const s of stations) {
    while (i < tube.arc.length - 2 && tube.arc[i + 1]! < s) i += 1;
    const span = tube.arc[i + 1]! - tube.arc[i]!;
    const t = span > 1e-12 ? Math.min(1, Math.max(0, (s - tube.arc[i]!) / span)) : 0;
    const mix = (a: MascotTubeOffset, b: MascotTubeOffset) => ({ across: a.across + (b.across - a.across) * t, along: a.along + (b.along - a.along) * t });
    midline.push(lerp(tube.midline[i]!, tube.midline[i + 1]!, t));
    edgeLeft.push(mix(left[i]!, left[i + 1]!));
    edgeRight.push(mix(right[i]!, right[i + 1]!));
  }
  return { arc: stations, edges: [edgeLeft, edgeRight], ends: tube.ends, length: tube.length, midline };
}

/** Blends two tubes resampled to the same count: centrelines, edges and length. The end shapes come from the nearer one. */
export function blendTubes(a: MascotTube, b: MascotTube, t: number): MascotTube {
  if (a.midline.length !== b.midline.length) throw new Error("Blended tubes must share a sample count.");
  const mix = (p: number, q: number) => p + (q - p) * t;
  const mixOffsets = (p: readonly MascotTubeOffset[], q: readonly MascotTubeOffset[]) =>
    p.map((o, i) => ({ across: mix(o.across, q[i]!.across), along: mix(o.along, q[i]!.along) }));
  return {
    arc: a.arc.map((s, i) => mix(s, b.arc[i]!)),
    edges: [mixOffsets(a.edges[0], b.edges[0]), mixOffsets(a.edges[1], b.edges[1])],
    ends: t < 0.5 ? a.ends : b.ends,
    length: mix(a.length, b.length),
    midline: a.midline.map((p, i) => lerp(p, b.midline[i]!, t)),
  };
}

/** Reads a tube and trims it at the centreline sample nearest `root` (a shoulder or hip planted in the body). */
export function extractPlantedTube(d: string, root: Point): MascotTube {
  const tube = extractTube(d, root);
  const nearest = tube.midline.reduce((best, p, i) => (dist(p, root) < dist(tube.midline[best]!, root) ? i : best), 0);
  return trimTubeRoot(tube, nearest);
}

/** Drops the samples before `index`, leaving a flat, open root end there (for limbs planted in the body). */
export function trimTubeRoot(tube: MascotTube, index: number): MascotTube {
  const k = Math.max(0, Math.min(index, tube.midline.length - 2));
  const start = tube.arc[k]!;
  return {
    arc: tube.arc.slice(k).map((s) => s - start),
    edges: [tube.edges[0].slice(k), tube.edges[1].slice(k)],
    ends: { root: "flat", tail: tube.ends.tail },
    length: tube.length - start,
    midline: tube.midline.slice(k),
  };
}

/**
 * Both long edges placed around `midline` (same sample count as the rest centreline), root
 * to tail. An edge never steps backward along the centreline. Where a tight bend would make
 * the inner edge fold back over itself, it holds still instead, which reads as a pinch on
 * the inside of the bend.
 */
export function tubeEdges(tube: MascotTube, midline: readonly Point[] = tube.midline): readonly [Point[], Point[]] {
  if (midline.length !== tube.midline.length) throw new Error("A posed tube centreline must keep the rest sample count.");
  const tangents = tubeTangents(midline);
  const place = (offsets: readonly MascotTubeOffset[]) => {
    const edge: Point[] = [];
    midline.forEach((m, i) => {
      const t = tangents[i]!, o = offsets[i]!;
      const point = { x: m.x + o.along * t.x - o.across * t.y, y: m.y + o.along * t.y + o.across * t.x };
      const previous = edge[i - 1];
      const backward = previous !== undefined && (point.x - previous.x) * t.x + (point.y - previous.y) * t.y < 0;
      edge.push(backward ? previous : point);
    });
    return edge;
  };
  return [place(tube.edges[0]), place(tube.edges[1])];
}

/** The tube's outline around `midline`, as a closed polygon. */
export function tubeOutline(tube: MascotTube, midline: readonly Point[] = tube.midline): Point[] {
  const [a, b] = tubeEdges(tube, midline);
  const outline = [...a, ...b.reverse()];
  return outline.filter((p, i) => i === 0 || dist(p, outline[i - 1]!) > 1e-6);
}

/** SVG path data for the tube's outline around `midline`. */
export function tubePath(tube: MascotTube, midline?: readonly Point[]): string {
  const [first, ...rest] = tubeOutline(tube, midline);
  return serializePath([{ kind: "M", to: first! }, ...rest.map((to) => ({ kind: "L" as const, to })), { kind: "Z" }]);
}
