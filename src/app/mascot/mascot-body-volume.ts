/**
 * The body as a 3D volume, for tilted views (looking down on the crown or up at the underside).
 *
 * The front and side drawings give the body the same outline, so it is a round body: at each
 * height its cross-section is a circle as wide as the front drawing's outline there. The
 * headband is a ring round it, a straight-sided band fitted to the drawn stripes' widths (it
 * stands a little proud of the head), with the drawn stripes' heights.
 *
 * Seen from above, the reference renders (clutch-mascot/refs/render_*.webp) show the band
 * closing into a ring round the crown by about 35°, as if it sat on a rounder crown than the
 * flat-topped drawing has. The band's lean (`BAND_LEAN_FROM_ABOVE`) gives that.
 *
 * Projection matches the limbs' (`projectV2`): looking down by `pitch` tilts about the body
 * pivot's height, and a point's depth toward the viewer moves it down the screen. Level views
 * keep the drawings exactly; everything here is for the tilted ones.
 */

import type { Point, PointMap } from "./mascot-path";
import { parsePath } from "./mascot-path";
import { flattenOutline } from "./mascot-tube";
import { mascotV2Views, type MascotV2Layer } from "./mascot-v2-parts";
import { MASCOT_V2_BODY_PIVOT } from "./mascot-v2-rig";

type Profile = Readonly<{ bottom: number; rs: readonly number[]; top: number; ys: readonly number[] }>;

const SILHOUETTE_DIRECTIONS = 360;
/** How far back the band leans when seen from above (tan of the lean): it closes into a ring round the crown at 35°. */
const BAND_LEAN_FROM_ABOVE = 1 / Math.tan((35 * Math.PI) / 180);
const RING_STEPS = 48;
const SIDE_STEPS = 8;

/** Where a closed polygon crosses height `y`. */
function crossings(polygon: readonly Point[], y: number): number[] {
  const xs: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
    if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) xs.push(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y));
  }
  return xs;
}

/** Half-width of a closed outline at evenly spaced heights between its top and bottom. */
function profileOf(polygon: readonly Point[], samples: number): Profile {
  const top = Math.min(...polygon.map((p) => p.y)), bottom = Math.max(...polygon.map((p) => p.y));
  const ys: number[] = [], rs: number[] = [];
  for (let i = 0; i < samples; i++) {
    // Just inside the very top and bottom, so a flat top or bottom keeps its width.
    const y = top + 0.02 + ((bottom - top - 0.04) * i) / (samples - 1);
    const xs = crossings(polygon, y);
    ys.push(y);
    rs.push(xs.length >= 2 ? (Math.max(...xs) - Math.min(...xs)) / 2 : 0);
  }
  return { bottom, rs, top, ys };
}

function radiusAt(profile: Profile, y: number): number {
  const { rs, ys } = profile;
  if (y < ys[0]! || y > ys[ys.length - 1]!) return 0;
  const step = (ys[ys.length - 1]! - ys[0]!) / (ys.length - 1);
  const i = Math.min(ys.length - 2, Math.floor((y - ys[0]!) / step));
  const t = (y - ys[i]!) / step;
  return rs[i]! + (rs[i + 1]! - rs[i]!) * t;
}

/** How fast the radius grows going down (rig px per px), kept inside the profile. */
function slopeAt(profile: Profile, y: number): number {
  const h = 1.5;
  const lo = Math.max(profile.ys[0]!, y - h), hi = Math.min(profile.ys[profile.ys.length - 1]!, y + h);
  return hi > lo ? (radiusAt(profile, hi) - radiusAt(profile, lo)) / (hi - lo) : 0;
}

const baseOf = (layers: readonly MascotV2Layer[]) => layers.find((layer) => layer.role === "base")!.shapes[0]!.d;
const controlBounds = (d: string) => {
  const points = parsePath(d).flatMap((s) => (s.kind === "Z" ? [] : s.kind === "C" ? [s.c1, s.c2, s.to] : [s.to]));
  return { bottom: Math.max(...points.map((p) => p.y)), top: Math.min(...points.map((p) => p.y)) };
};

type Volume = Readonly<{
  band: Profile;
  head: Profile;
  stripes: readonly Readonly<{ bottom: number; stripe: 1 | 2 | 3; top: number }>[];
}>;

function buildVolume(): Volume {
  const front = mascotV2Views.front;
  const head = profileOf(flattenOutline(baseOf(front.parts.head!), 1).points, 160);
  const bandLayers = front.parts.headband!;
  const stripes = bandLayers
    .filter((layer) => layer.role === "base" && layer.stripe !== undefined)
    .map((layer) => ({ ...controlBounds(layer.shapes[0]!.d), stripe: layer.stripe! }))
    .sort((a, b) => a.top - b.top);
  // The band's width at each height: a straight line fitted to the stripes' widths away from
  // their rounded corners, which would otherwise read as the band curling in at its edges.
  const stripeOutlines = bandLayers.filter((layer) => layer.role === "base" && layer.stripe !== undefined).map((layer) => flattenOutline(layer.shapes[0]!.d, 1).points);
  const top = stripes[0]!.top, bottom = stripes[stripes.length - 1]!.bottom;
  const fit: Point[] = [];
  for (const { bottom: b, top: t } of stripes) {
    for (const share of [0.3, 0.5, 0.7]) {
      const y = t + (b - t) * share;
      const xs = stripeOutlines.flatMap((polygon) => crossings(polygon, y));
      if (xs.length >= 2) fit.push({ x: (Math.max(...xs) - Math.min(...xs)) / 2, y });
    }
  }
  const meanY = fit.reduce((sum, p) => sum + p.y, 0) / fit.length, meanR = fit.reduce((sum, p) => sum + p.x, 0) / fit.length;
  const slope = fit.reduce((sum, p) => sum + (p.y - meanY) * (p.x - meanR), 0) / fit.reduce((sum, p) => sum + (p.y - meanY) ** 2, 0);
  const samples = 40;
  const ys = Array.from({ length: samples }, (_, i) => top + ((bottom - top) * i) / (samples - 1));
  return { band: { bottom, rs: ys.map((y) => meanR + slope * (y - meanY)), top, ys }, head, stripes };
}

let volumeCache: Volume | undefined;
const volume = () => (volumeCache ??= buildVolume());

const pivotY = MASCOT_V2_BODY_PIVOT.y;

/** A point on a round surface at height `y`, turned `theta` from facing the viewer, `radius` out, tilted by `pitch` (radians). */
function onRing(theta: number, y: number, radius: number, pitch: number): Point {
  return { x: radius * Math.sin(theta), y: pivotY + (y - pivotY) * Math.cos(pitch) + radius * Math.cos(theta) * Math.sin(pitch) };
}

/**
 * Places a point drawn on the body's front (as the level view shows it) for a tilt (radians):
 * its depth is how far the round body bulges toward the viewer there.
 */
export function bodySurfaceMap(pitch: number): PointMap {
  const { head } = volume();
  const c = Math.cos(pitch), s = Math.sin(pitch);
  return (p) => {
    const r = radiusAt(head, p.y);
    const z = Math.sqrt(Math.max(0, r * r - p.x * p.x));
    return { x: p.x, y: pivotY + (p.y - pivotY) * c + z * s };
  };
}

/** The same for a point drawn on the headband, which stands a little proud of the head. */
export function bandSurfaceMap(pitch: number): PointMap {
  const { band } = volume();
  const c = Math.cos(pitch), s = Math.sin(pitch);
  return (p) => {
    const r = radiusAt(band, Math.min(band.ys[band.ys.length - 1]!, Math.max(band.ys[0]!, p.y)));
    const z = Math.sqrt(Math.max(0, r * r - p.x * p.x));
    return { x: p.x, y: pivotY + (p.y - pivotY) * c + z * s };
  };
}

/** A point on the body's upright axis (depth 0) for a tilt: where the hair grows from and the band turns about. */
export function axisPoint(p: Point, pitch: number): Point {
  return { x: p.x, y: pivotY + (p.y - pivotY) * Math.cos(pitch) };
}

/**
 * The body's outline for a tilt (radians), in rig space: each height's circle shows as an
 * ellipse, and the outline is their envelope (the body is convex), one point per direction.
 */
export function bodySilhouette(pitch: number): readonly Point[] {
  // One build asks for it more than once at the same tilt.
  if (silhouetteCache.pitch === pitch) return silhouetteCache.points;
  const points = buildSilhouette(pitch);
  silhouetteCache.pitch = pitch;
  silhouetteCache.points = points;
  return points;
}
const silhouetteCache: { pitch: number; points: readonly Point[] } = { pitch: Number.NaN, points: [] };

function buildSilhouette(pitch: number): Point[] {
  const { head } = volume();
  const c = Math.cos(pitch), s = Math.abs(Math.sin(pitch));
  const rings = head.ys.map((y, i) => ({ cy: pivotY + (y - pivotY) * c, r: head.rs[i]! }));
  const out: Point[] = [];
  for (let k = 0; k < SILHOUETTE_DIRECTIONS; k++) {
    const angle = (2 * Math.PI * k) / SILHOUETTE_DIRECTIONS;
    const ux = Math.cos(angle), uy = Math.sin(angle);
    let best = -Infinity;
    let point: Point = { x: 0, y: 0 };
    for (const { cy, r } of rings) {
      const a = r, b = r * s;
      const norm = Math.hypot(a * ux, b * uy);
      const support = uy * cy + norm;
      if (support > best) {
        best = support;
        point = norm > 1e-9 ? { x: (a * a * ux) / norm, y: cy + (b * b * uy) / norm } : { x: 0, y: cy };
      }
    }
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 0.05) out.push(point);
  }
  return out;
}

export type MascotBandStripe = Readonly<{ polygon: readonly Point[]; stripe: 1 | 2 | 3 }>;
export type MascotBandShape = Readonly<{
  /** The band's outline: open runs, leaving out the seam where the ring closes on itself behind. */
  outline: readonly (readonly Point[])[];
  /** Each stripe's visible part, top stripe first. */
  stripes: readonly MascotBandStripe[];
}>;

/**
 * The headband's visible part for a tilt (radians): each stripe is the stretch of its ring that
 * faces the viewer. Looking down, more of the ring shows round the sides until it closes into a
 * ring round the crown, and the band's top edge is its inner lip against the head; looking up,
 * it narrows to an arch and goes before the camera is straight below. Painted over the head.
 */
export function bandShape(pitch: number): MascotBandShape {
  const { band, head, stripes } = volume();
  const c = Math.cos(pitch), s = Math.sin(pitch);
  // A ring faces the viewer where cos θ·cos(pitch) + slope·sin(pitch) > 0. From above, the band
  // leans back further than its drawn slope, as the reference renders show.
  const reach = (y: number): number => {
    const k = (s > 0 ? Math.max(slopeAt(band, y), BAND_LEAN_FROM_ABOVE) : slopeAt(band, y)) * s;
    if (c < 1e-6) return k > 0 ? Math.PI : 0;
    return Math.acos(Math.min(1, Math.max(-1, -k / c)));
  };
  const radius = (y: number) => radiusAt(band, Math.min(band.ys[band.ys.length - 1]!, Math.max(band.ys[0]!, y)));
  const seam = (theta: number) => theta > Math.PI - 1e-3;
  const arc = (y: number, r: number, from: number, to: number): Point[] =>
    Array.from({ length: RING_STEPS + 1 }, (_, i) => onRing(from + ((to - from) * i) / RING_STEPS, y, r, pitch));
  const side = (from: number, to: number, sign: 1 | -1): Point[] =>
    Array.from({ length: SIDE_STEPS + 1 }, (_, i) => {
      const y = from + ((to - from) * i) / SIDE_STEPS;
      return onRing(sign * reach(y), y, radius(y), pitch);
    });
  // Looking down, the top edge is the band's inner lip against the head.
  const topRadius = (y: number) => (s > 0 ? Math.min(radius(y), radiusAt(head, y)) : radius(y));

  const visible: MascotBandStripe[] = [];
  for (const { bottom, stripe, top } of stripes) {
    const tTop = reach(top), tBottom = reach(bottom);
    if (Math.max(tTop, tBottom) < 1e-3) continue;
    const topR = stripe === stripes[0]!.stripe ? topRadius(top) : radius(top);
    visible.push({
      polygon: [...arc(top, topR, -tTop, tTop), ...side(top, bottom, 1), ...arc(bottom, radius(bottom), tBottom, -tBottom), ...side(bottom, top, -1)],
      stripe,
    });
  }
  if (visible.length === 0) return { outline: [], stripes: [] };

  // The outline round the whole band, without the seam behind where the ring has closed.
  const top = stripes[0]!.top, bottom = stripes[stripes.length - 1]!.bottom;
  const runs: Point[][] = [];
  let run: Point[] = [];
  const add = (p: Point, onSeam: boolean) => {
    if (onSeam) {
      if (run.length > 1) runs.push(run);
      run = [];
      return;
    }
    run.push(p);
  };
  const tTop = reach(top), tBottom = reach(bottom);
  arc(top, topRadius(top), -tTop, tTop).forEach((p) => add(p, false));
  for (let i = 0; i <= SIDE_STEPS * 3; i++) {
    const y = top + ((bottom - top) * i) / (SIDE_STEPS * 3);
    add(onRing(reach(y), y, radius(y), pitch), seam(reach(y)));
  }
  arc(bottom, radius(bottom), tBottom, -tBottom).forEach((p) => add(p, false));
  for (let i = 0; i <= SIDE_STEPS * 3; i++) {
    const y = bottom + ((top - bottom) * i) / (SIDE_STEPS * 3);
    add(onRing(-reach(y), y, radius(y), pitch), seam(reach(y)));
  }
  if (run.length > 1) runs.push(run);
  return { outline: runs, stripes: visible };
}

/** The drawn band's centre on the upright axis, for the band's tilt. */
export function bandCentreY(): number {
  const { stripes } = volume();
  return (stripes[0]!.top + stripes[stripes.length - 1]!.bottom) / 2;
}
