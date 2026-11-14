/**
 * Re-lighting for the V2 mascot: every part's shade and highlight come from one light, in
 * place of the drawn Shade and Highlight layers. The drawing is the style reference: at the
 * drawn light the re-lit shading lands where the designer drew it.
 *
 * The light: `light.angle` gives its direction in the world (0° from the right, 90° from
 * above, 180° from the left, 270° from below), and it leans 18.4° toward the viewer. It is
 * fixed in the world: orbiting the camera moves it on screen, turning the character doesn't.
 * The drawing is lit from 160°, the left and a little above.
 *
 * Shading model, measured from the drawing:
 * - Every part is rounded at its edges. Where an edge faces away from the light, a band of
 *   it is in shade: `radius × terminatorShare`. That share grows with how squarely the light
 *   meets the edge, so the side light gives the vertical legs a 4 px band and the feet and
 *   hair a 1 to 2 px band underneath, as drawn.
 * - Tubes (arms, legs) take their radius from their own thickness, sample by sample.
 * - Rigid parts (head, headband, armbands, hands, feet, money bag) use the crescent method:
 *   the shade is the base minus a copy nudged toward the light. They are rounded across an
 *   axis, and less (or not at all) along it, with radii fitted to the drawing.
 * - Hair strands are shaded like arches: the inside of each curl is in shade, more as the
 *   light rises, and the outside when the light comes from below.
 * - Highlights: tubes get a stroke on the lit side, over the stretch where it was drawn.
 *   Rigid parts keep their drawn highlight strokes, mirrored across the part's axis when the
 *   light crosses over, and shrunk to nothing as it passes square on.
 * - With the light behind the mascot (after orbiting), the side facing the camera falls
 *   into shade and a rim of light stays on the edges facing the light: tubes by their own
 *   cross-section (the shade covers more than half), rigid parts by darkening toward the
 *   shade colour with a lit rim band along their outline. Highlights fade.
 */

import { limbArtFrom, strandArtAt, viewPart } from "./mascot-v2-art";
import { parsePath, type Point, type PointMap } from "./mascot-path";
import { tubeEdges } from "./mascot-tube";
import { mascotV2Colors, mascotV2Views, type MascotV2Layer, type MascotV2PartName } from "./mascot-v2-parts";

/** A unit vector toward the light in camera space: x right, y down, z toward the viewer. */
export type MascotLight = Readonly<{ x: number; y: number; z: number }>;
/** How rounded a rigid part is across its axis and along it (rig px). */
export type MascotRimRadii = Readonly<{ across: number; along: number }>;
export type MascotPalette = Readonly<{ base: string; highlight: string; shade: string }>;
/**
 * A drawn highlight's place on a tube: its sample range and stroke width, and how far off
 * the middle it sits per unit of specular spread (it was drawn at the drawn light's spread).
 */
export type MascotTubeHighlight = Readonly<{ from: number; offset: number; to: number; width: number }>;

/** The light the V2 art is drawn under. */
export const MASCOT_V2_DRAWN_LIGHT_ANGLE = 160;
/** The light's lean out of the screen plane toward the viewer (tan = 1/3). */
const LIGHT_TOWARD_VIEWER = Math.atan(1 / 3);
/**
 * Keeps the terminator gradual when the light grazes the screen plane or goes behind: the
 * shade then swings across a part over about 10° of light angle instead of jumping (and the
 * back-light darkening hides most of it).
 */
const MIN_FRONT = 0.12;
/** Shade inside a hair curl even with the light level with it. */
const HAIR_AMBIENT = 0.05;
/** Below this much side light, a rigid part's highlight shrinks away (and regrows mirrored). */
const HIGHLIGHT_FADE = 0.3;
/** A tube highlight stays at least this far in from the edge, as a share of the radius. */
const HIGHLIGHT_MAX_OFFSET = 0.9;

/**
 * Rigid parts' rounding, fitted to the drawn shade at the drawn light (front view). The head
 * and money bag also get a little rounding along their axis that the drawing doesn't show,
 * so light from above still shades their bottoms. The two drawn feet are shaded differently,
 * so the feet take a size between them.
 */
export const MASCOT_V2_RIM_RADII = {
  armband: { across: 2, along: 0 },
  foot: { across: 3.5, along: 2.5 },
  hand: { across: 3, along: 3 },
  head: { across: 12, along: 3 },
  headband: { across: 12, along: 0 },
  moneyBag: { across: 4.5, along: 2 },
} as const satisfies Record<string, MascotRimRadii>;

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const dot2 = (light: MascotLight, v: Point) => light.x * v.x + light.y * v.y;
const unit = (v: Point): Point => {
  const l = Math.hypot(v.x, v.y);
  return l > 1e-9 ? { x: v.x / l, y: v.y / l } : { x: 1, y: 0 };
};
const smoothstep = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** The world light seen from a camera orbited by `cameraYaw` (the same turn as the character's). */
export function cameraLight(lightAngle: number, cameraYaw: number): MascotLight {
  const a = radians(lightAngle), yaw = radians(cameraYaw);
  const side = Math.cos(LIGHT_TOWARD_VIEWER);
  const x = side * Math.cos(a), y = -side * Math.sin(a), z = Math.sin(LIGHT_TOWARD_VIEWER);
  return { x: x * Math.cos(yaw) + z * Math.sin(yaw), y, z: -x * Math.sin(yaw) + z * Math.cos(yaw) };
}

/** The light's direction on screen in degrees (0° from the right, 90° from above), for the cast shadow. */
export function lightAzimuth(light: MascotLight): number {
  return (Math.atan2(-light.y, light.x) * 180) / Math.PI;
}

/**
 * The signed share of a rounded edge's radius that is in shade. `c` is the light's
 * component along the edge's outward direction; the band is on the edge where c < 0
 * (facing away), so the sign says which side. It is 0 for light square on, and near 1 as
 * the light comes round to the side.
 */
export function terminatorShare(c: number, front: number): number {
  const z = Math.max(front, MIN_FRONT);
  const r = Math.hypot(c, z);
  return (c * Math.abs(c)) / (r * (r + z));
}

/**
 * The true share of a tube's radius in shade, measured from the edge facing away from the
 * light (the sign says which edge, as for `terminatorShare`). Up to 1 with the light in
 * front; past 1 with it behind, leaving only a lit rim on the light side; 2 (all of it) with
 * the light straight behind.
 */
export function tubeShare(c: number, front: number): number {
  const r = Math.hypot(c, front);
  const share = r < 1e-9 ? 0 : 1 - front / r;
  return (c >= 0 ? 1 : -1) * share;
}

/** With the light behind, the share of a rounded edge facing the light that still catches it. */
export function rimShare(c: number, front: number): number {
  if (front >= 0 || c <= 0) return 0;
  return 1 - Math.abs(front) / Math.hypot(c, front);
}

/** How far the parts darken with the light behind them: 0 in front, 1 well behind. */
export function backlightWash(light: MascotLight): number {
  return smoothstep(-light.z / 0.5);
}

/** Mixes two #RRGGBB colours; t = 0 gives `from`, 1 gives `to`. */
export function mixHex(from: string, to: string, t: number): string {
  const channel = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const mixed = [0, 1, 2].map((i) => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * t));
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0").toUpperCase()).join("")}`;
}

/** A palette under the light: with the light behind, the base darkens to the shade and the highlight fades into it. */
export function litPalette(palette: MascotPalette, light: MascotLight): MascotPalette {
  const wash = backlightWash(light);
  if (wash <= 0) return palette;
  const base = mixHex(palette.base, palette.shade, wash);
  return { base, highlight: mixHex(palette.highlight, base, wash), shade: palette.shade };
}

/** The body palette one step darker by `t` (0 to 1): base to shade, shade to outline, highlight to base. */
export function darkerBody(t: number): MascotPalette {
  const c = mascotV2Colors;
  return { base: mixHex(c.body, c.bodyShade, t), highlight: mixHex(c.highlight, c.body, t), shade: mixHex(c.bodyShade, c.outline, t) };
}

/**
 * The crescent shift for a rigid part: the shade is the base minus a copy moved by this
 * vector, toward the light. `along` is the part's axis on screen; `scale` the world scale.
 */
export function crescentShift(light: MascotLight, along: Point, radii: MascotRimRadii, scale = 1): Point {
  const A = unit(along), a = { x: -A.y, y: A.x };
  const across = radii.across * terminatorShare(dot2(light, a), light.z);
  const lengthwise = radii.along * terminatorShare(dot2(light, A), light.z);
  return { x: (a.x * across + A.x * lengthwise) * scale, y: (a.y * across + A.y * lengthwise) * scale };
}

/**
 * Where a rigid part's drawn highlight goes: kept, or mirrored across the part's axis (the
 * line through `centre` along `along`) when the light is on the other side, and shrunk about
 * its own middle as the light comes square on. `drawnAt` is the highlight's middle as placed.
 * Returns null when it has shrunk away.
 */
export function highlightMap(light: MascotLight, drawnAt: Point, centre: Point, along: Point): PointMap | null {
  const A = unit(along), a = { x: -A.y, y: A.x };
  const c = dot2(light, a);
  const size = smoothstep(Math.abs(c) / HIGHLIGHT_FADE);
  if (size < 0.02) return null;
  const drawnSide = (drawnAt.x - centre.x) * a.x + (drawnAt.y - centre.y) * a.y;
  const flip = drawnSide * c < 0;
  const reflect = (p: Point): Point => {
    if (!flip) return p;
    const d = (p.x - centre.x) * a.x + (p.y - centre.y) * a.y;
    return { x: p.x - 2 * d * a.x, y: p.y - 2 * d * a.y };
  };
  const middle = reflect(drawnAt);
  return (p) => {
    const q = reflect(p);
    return { x: middle.x + (q.x - middle.x) * size, y: middle.y + (q.y - middle.y) * size };
  };
}

/**
 * With the light behind, the lit rim along a rigid part's outline (a closed polygon on
 * screen): a band on the edges facing the light, as wide as the part's rounding there
 * times `rimShare`. None with the light in front.
 */
export function rimBand(outline: readonly Point[], light: MascotLight, along: Point, radii: MascotRimRadii, scale = 1): Point[] | null {
  if (light.z >= 0 || outline.length < 3) return null;
  const A = unit(along), a = { x: -A.y, y: A.x };
  let area = 0;
  outline.forEach((p, i) => {
    const q = outline[(i + 1) % outline.length]!;
    area += p.x * q.y - q.x * p.y;
  });
  // Outward normal from the neighbours' tangent; the winding decides which side is out.
  const turn = area > 0 ? 1 : -1;
  const inner = outline.map((p, i) => {
    const prev = outline[(i - 1 + outline.length) % outline.length]!, next = outline[(i + 1) % outline.length]!;
    const t = unit({ x: next.x - prev.x, y: next.y - prev.y });
    const n = { x: turn * t.y, y: -turn * t.x };
    const radius = radii.across * Math.abs(n.x * a.x + n.y * a.y) + radii.along * Math.abs(n.x * A.x + n.y * A.y);
    const width = radius * rimShare(dot2(light, n), light.z) * scale;
    return { width, x: p.x - n.x * width, y: p.y - n.y * width };
  });
  if (Math.max(...inner.map((p) => p.width)) < 0.05) return null;
  return [...outline, ...inner.map(({ x, y }) => ({ x, y })).reverse()];
}

export type MascotTubeShading = Readonly<{
  /** Shade bands, one along each edge (zero width where that edge is lit). */
  bands: readonly (readonly Point[])[];
  /** Highlight polylines on the lit side, one per drawn highlight. */
  highlights: readonly (readonly Point[])[];
}>;

type Section = Readonly<{ a: Point; b: Point; r: number; u: Point }>;
/** Each sample's cross-section: its two edge points, half-width, and the unit direction from b to a. */
function sections(edges: readonly [readonly Point[], readonly Point[]]): Section[] {
  return edges[0].map((a, i) => {
    const b = edges[1][i]!;
    const v = { x: a.x - b.x, y: a.y - b.y };
    return { a, b, r: Math.hypot(v.x, v.y) / 2, u: unit(v) };
  });
}

/** Polygons for bands of the given widths along edge a (inward along -u) and edge b (inward along +u). */
function bandPolygons(cuts: readonly Section[], widthA: readonly number[], widthB: readonly number[]): Point[][] {
  const along = (edge: "a" | "b", widths: readonly number[]) => {
    const sign = edge === "a" ? -1 : 1;
    const outer = cuts.map((s) => s[edge]);
    const inner = cuts.map((s, i) => ({ x: s[edge].x + sign * s.u.x * widths[i]!, y: s[edge].y + sign * s.u.y * widths[i]! }));
    return [...outer, ...inner.reverse()];
  };
  return [along("a", widthA), along("b", widthB)];
}

/** Highlight offsets across the tube (share of the radius, signed toward edge a), per sample. */
function highlightPolylines(cuts: readonly Section[], highlights: readonly MascotTubeHighlight[], offsetAt: (i: number, h: MascotTubeHighlight) => number): Point[][] {
  return highlights.map((h) => {
    const points: Point[] = [];
    for (let i = Math.max(0, h.from); i <= Math.min(cuts.length - 1, h.to); i++) {
      const s = cuts[i]!;
      const k = Math.max(-HIGHLIGHT_MAX_OFFSET, Math.min(HIGHLIGHT_MAX_OFFSET, offsetAt(i, h))) * s.r;
      const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
      points.push({ x: mid.x + s.u.x * k, y: mid.y + s.u.y * k });
    }
    return points;
  });
}

/** Where the specular highlight sits for a section lit at `c` (side light) and `front`: sin of half the light's angle off the viewer. */
const specular = (c: number, front: number) => Math.sin(Math.atan2(Math.abs(c), Math.max(front, MIN_FRONT)) / 2);

/** Shade bands and highlights for an arm or leg tube, from its two edges on screen. `size` scales the bands (1 = as drawn). */
export function shadeTube(edges: readonly [readonly Point[], readonly Point[]], light: MascotLight, highlights: readonly MascotTubeHighlight[], size = 1): MascotTubeShading {
  const cuts = sections(edges);
  const [widthA, widthB] = sizedWidths(cuts, tubeWidths(cuts, light), size);
  const bands = bandPolygons(cuts, widthA, widthB);
  const lines = highlightPolylines(cuts, highlights, (i, h) => {
    const c = dot2(light, cuts[i]!.u);
    return Math.sign(c) * h.offset * specular(c, light.z);
  });
  return { bands, highlights: lines };
}

/** Shade band widths along edges a and b from the tube's own cross-section (c > 0: the light is on edge a's side, so b is shaded). */
function tubeWidths(cuts: readonly Section[], light: MascotLight): [number[], number[]] {
  const shares = cuts.map((s) => tubeShare(dot2(light, s.u), light.z));
  return [shares.map((t, i) => (t < 0 ? Math.min(2, -t) * cuts[i]!.r : 0)), shares.map((t, i) => (t > 0 ? Math.min(2, t) * cuts[i]!.r : 0))];
}

/** Band widths scaled by `size`, never wider than the whole tube. */
function sizedWidths(cuts: readonly Section[], [a, b]: readonly [readonly number[], readonly number[]], size: number): [number[], number[]] {
  const cap = (w: number, i: number) => Math.min(2 * cuts[i]!.r, w * size);
  return [a.map(cap), b.map(cap)];
}

/**
 * Which edge is on the inside of a strand's main curl: 1 for edge a, -1 for edge b. The curl
 * is how the strand's direction turns from a fifth of the way along to near the tip, which
 * leaves out the root's lift and the round tip.
 */
function innerEdge(midline: readonly Point[], cuts: readonly Section[]): 1 | -1 {
  const n = midline.length;
  const tangentAt = (share: number): Point => {
    const i = Math.min(n - 3, Math.max(2, Math.round(share * (n - 1))));
    return { x: midline[i + 2]!.x - midline[i - 2]!.x, y: midline[i + 2]!.y - midline[i - 2]!.y };
  };
  const t0 = tangentAt(0.2), t1 = tangentAt(0.85);
  const turning = t0.x * t1.y - t0.y * t1.x;
  const m = Math.round(0.5 * (n - 1));
  const t = tangentAt(0.5), u = cuts[m]!.u;
  // The curl turns toward the side where cross(t, v) has the turning's sign; u points to edge a.
  return (t.x * u.y - t.y * u.x) * turning >= 0 ? 1 : -1;
}

/**
 * Shade and highlight for a hair strand. The inside of the curl is shaded by the light from
 * above (plus a little ambient); light from below shades the outside instead. The highlight
 * sits on the other side from the shade.
 */
export function shadeStrand(edges: readonly [readonly Point[], readonly Point[]], midline: readonly Point[], light: MascotLight, highlights: readonly MascotTubeHighlight[], size = 1): MascotTubeShading {
  const cuts = sections(edges);
  const inner = innerEdge(midline, cuts);
  const fromAbove = terminatorShare(-light.y, light.z);
  const innerShare = HAIR_AMBIENT + (1 - HAIR_AMBIENT) * Math.max(0, fromAbove);
  const outerShare = Math.max(0, -fromAbove);
  // With the light behind, the strands shade like any tube, leaving a rim on the light side.
  const wash = backlightWash(light);
  const [backA, backB] = tubeWidths(cuts, light);
  const widthA = cuts.map((s, i) => s.r * (inner === 1 ? innerShare : outerShare) * (1 - wash) + backA[i]! * wash);
  const widthB = cuts.map((s, i) => s.r * (inner === 1 ? outerShare : innerShare) * (1 - wash) + backB[i]! * wash);
  // The highlight leans to the outside (away from edge `inner`) with the light from above.
  const lean = -inner * Math.sign(-light.y);
  const lines = highlightPolylines(cuts, highlights, (_, h) => lean * h.offset * specular(-light.y, light.z));
  const [sizedA, sizedB] = sizedWidths(cuts, [widthA, widthB], size);
  return { bands: bandPolygons(cuts, sizedA, sizedB), highlights: lines };
}

/**
 * The drawn highlights on a front-view tube: where they run along it, and how far off its
 * middle they sit divided by the specular spread the drawn light gives there.
 */
function drawnTubeHighlights(part: MascotV2PartName, edges: readonly [readonly Point[], readonly Point[]], spreadAt: (cut: Section) => number): MascotTubeHighlight[] {
  const cuts = sections(edges);
  const mids = cuts.map((s) => ({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }));
  const nearest = (p: Point) => mids.reduce((best, m, i) => (Math.hypot(m.x - p.x, m.y - p.y) < Math.hypot(mids[best]!.x - p.x, mids[best]!.y - p.y) ? i : best), 0);
  const layers: readonly MascotV2Layer[] = viewPart(mascotV2Views.front, part);
  return layers
    .filter((layer) => layer.role === "highlight")
    .flatMap((layer) => layer.shapes)
    .map((shape) => {
      const points = parsePath(shape.d).flatMap((segment) => (segment.kind === "Z" ? [] : [segment.to]));
      const indices = points.map(nearest);
      const offsets = points.map((p, k) => {
        const s = cuts[indices[k]!]!, mid = mids[indices[k]!]!;
        return ((p.x - mid.x) * s.u.x + (p.y - mid.y) * s.u.y) / Math.max(s.r, 1e-6);
      });
      const offset = Math.abs(offsets.reduce((sum, o) => sum + o, 0) / offsets.length);
      const spread = indices.reduce((sum, i) => sum + spreadAt(cuts[i]!), 0) / indices.length;
      return { from: Math.min(...indices), offset: offset / Math.max(spread, 1e-3), to: Math.max(...indices), width: shape.stroke?.width ?? 1 };
    });
}

const highlightCache: Partial<Record<string, readonly MascotTubeHighlight[]>> = {};

/** The light the drawing was made under, seen from the front. */
export const MASCOT_V2_DRAWN_LIGHT: MascotLight = cameraLight(MASCOT_V2_DRAWN_LIGHT_ANGLE, 0);

/** The drawn highlights for a limb, from the front drawing's Arm_L or Leg_L (both sides match the left). */
export function limbHighlights(kind: "arm" | "leg"): readonly MascotTubeHighlight[] {
  return (highlightCache[kind] ??= buildLimbHighlights(kind));
}
function buildLimbHighlights(kind: "arm" | "leg"): readonly MascotTubeHighlight[] {
  const art = limbArtFrom({ mirror: false, view: "front", yaw: 0 }, kind, "L");
  return drawnTubeHighlights(`${kind}_L`, tubeEdges(art.tube), (cut) => specular(dot2(MASCOT_V2_DRAWN_LIGHT, cut.u), MASCOT_V2_DRAWN_LIGHT.z));
}

/** The drawn highlights for a hair strand, from the front drawing. */
export function strandHighlights(strand: MascotV2PartName): readonly MascotTubeHighlight[] {
  return (highlightCache[strand] ??= buildStrandHighlights(strand));
}
function buildStrandHighlights(strand: MascotV2PartName): readonly MascotTubeHighlight[] {
  return drawnTubeHighlights(strand, tubeEdges(strandArtAt(0, strand).tube), () => specular(-MASCOT_V2_DRAWN_LIGHT.y, MASCOT_V2_DRAWN_LIGHT.z));
}
