/**
 * Hair and headband deformation. The hair stays planted in the headband: its base never
 * moves, and Bend curves it progressively toward the tips (a constant-curvature bend, so
 * strands keep their width). Wave adds a travelling ripple whose amplitude grows toward
 * the tips; animating Wave phase makes it flow. Headband tilt turns the band and the
 * hair planted in it together around the band's centre.
 */

import { splitCubic, type Cubic } from "./mascot-geometry";
import { mapPath, rotatePoint, type ParsedPath, type PathSegment, type Point, type PointMap } from "./mascot-path";

/** Ripples along the hair height at full wave. */
const WAVE_CYCLES = 1.25;

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Splits every curve and line into quarters so a smooth deformation stays smooth. */
export function subdividePath(path: ParsedPath, pieces = 4): PathSegment[] {
  const out: PathSegment[] = [];
  let current: Point = { x: 0, y: 0 };
  let start = current;
  path.forEach((segment) => {
    if (segment.kind === "M") {
      out.push(segment);
      current = segment.to;
      start = current;
    } else if (segment.kind === "Z") {
      out.push(segment);
      current = start;
    } else if (segment.kind === "L") {
      const from = current;
      Array.from({ length: pieces }, (_, index) => out.push({ kind: "L", to: lerp(from, segment.to, (index + 1) / pieces) }));
      current = segment.to;
    } else {
      let rest: Cubic = [current, segment.c1, segment.c2, segment.to];
      Array.from({ length: pieces - 1 }, (_, index) => {
        const [head, tail] = splitCubic(rest, 1 / (pieces - index));
        out.push({ c1: head[1], c2: head[2], kind: "C", to: head[3] });
        rest = tail;
      });
      out.push({ c1: rest[1], c2: rest[2], kind: "C", to: rest[3] });
      current = segment.to;
    }
  });
  return out;
}

export type HairDeform = Readonly<{
  /** Total bend at the tips, radians; positive curves toward screen-right. */
  bend: number;
  /** Ripple amplitude at the tips, rig px. */
  wave: number;
  /** Ripple phase, radians. */
  phase: number;
}>;

/**
 * Bends and ripples points above `base`, which stays fixed. `height` is the hair's
 * height above the base, so the bend reaches its full angle at the tips.
 */
export function hairDeformMap(base: Point, height: number, deform: HairDeform): PointMap {
  const span = Math.max(height, 1);
  const curvature = deform.bend / span;
  return (p) => {
    const h = base.y - p.y;
    if (h <= 0) return p;
    const u = Math.min(1, h / span);
    const x = p.x - base.x + deform.wave * u * Math.sin(2 * Math.PI * WAVE_CYCLES * u + deform.phase);
    if (Math.abs(curvature) < 1e-6) return { x: base.x + x, y: p.y };
    const radius = 1 / curvature;
    const angle = h * curvature;
    return {
      x: base.x + radius - (radius - x) * Math.cos(angle),
      y: base.y - (radius - x) * Math.sin(angle),
    };
  };
}

/**
 * Bending toward or away from the viewer: the hair curls out of the picture plane, so
 * from this view it only looks shorter, more so toward the tips.
 */
export function hairDepthBendMap(base: Point, height: number, angle: number): PointMap {
  const span = Math.max(height, 1);
  if (Math.abs(angle) < 1e-6) return (p) => p;
  return (p) => {
    const h = base.y - p.y;
    if (h <= 0) return p;
    return { x: p.x, y: base.y - (span / angle) * Math.sin((h * angle) / span) };
  };
}

export function deformHairPath(path: ParsedPath, map: PointMap): ParsedPath {
  return mapPath(subdividePath(path), map);
}

/** Tilts the band and everything planted in it around the band's centre. */
export function headbandTiltMap(center: Point, radians: number): PointMap {
  return (p) => rotatePoint(p, center, radians);
}
