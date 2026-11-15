/**
 * Which drawing supplies the art at each turn, and how two neighbouring drawings blend.
 *
 * Drawings sit at 0° (front), +30° (3/4), +90° (side) and 180° (back). Facing left
 * (−30°, −90°) uses the 3/4 and side drawings mirrored. Between two drawings, limb and
 * strand tubes blend their centrelines and edges with the same smoothstep weight the
 * rig's corrections use. Rigid pieces (hand, armband, foot) come from the nearer
 * drawing, each with its own rest frame. A foot is also scaled along the screen so its
 * toe eases from one drawing's direction to the next (outward in front and back, the
 * way he faces in 3/4 and side) instead of flipping.
 *
 * Drawings name limbs by screen side, so the back view's screen-left limb is the rig's
 * right one, and a mirrored drawing swaps sides again. The side view draws only the
 * near limbs, so the far limbs reuse them (the user's choice).
 */

import { mapPath, parsePath, serializePath, type Point } from "./mascot-path";
import { blendTubes, extractPlantedTube, extractTube, resampleTube, type MascotTube } from "./mascot-tube";
import {
  mascotV2Views,
  type MascotV2Layer,
  type MascotV2PartName,
  type MascotV2PivotName,
  type MascotV2View,
  type MascotV2ViewName,
} from "./mascot-v2-parts";

export type MascotV2Side = "L" | "R";
export type MascotV2LimbKind = "arm" | "leg";
export type MascotV2ArtSource = Readonly<{ mirror: boolean; view: MascotV2ViewName; yaw: number }>;

/** A rigid piece and the frame it was drawn in: where it attaches and the bone direction there. */
export type MascotV2RigidArt = Readonly<{ anchor: Point; angle: number; layers: readonly MascotV2Layer[]; mirror: boolean }>;

export type MascotV2LimbArt = Readonly<{
  band?: MascotV2RigidArt & Readonly<{ sample: number }>;
  /** The foot, and which way its toe points along the screen in its drawing (+1 right, −1 left). */
  foot?: MascotV2RigidArt & Readonly<{ toe: number }>;
  hand?: MascotV2RigidArt;
  joints: Readonly<{ end: Point; mid: Point; root: Point }>;
  /** The limb shows on the left of the screen in its drawing. Sets hand chirality and the wrist, ankle and band directions. */
  screenLeft: boolean;
  tube: MascotTube;
}>;

export const MASCOT_V2_LIMB_SAMPLES = 200;
export const MASCOT_V2_STRAND_SAMPLES = 120;

const ART_KEYS: readonly MascotV2ArtSource[] = [
  { mirror: false, view: "back", yaw: -180 },
  { mirror: true, view: "side", yaw: -90 },
  { mirror: true, view: "threeQuarter", yaw: -30 },
  { mirror: false, view: "front", yaw: 0 },
  { mirror: false, view: "threeQuarter", yaw: 30 },
  { mirror: false, view: "side", yaw: 90 },
  { mirror: false, view: "back", yaw: 180 },
];

const smoothstep = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
const swapSide = (side: MascotV2Side): MascotV2Side => (side === "L" ? "R" : "L");
const mirrorPoint = (p: Point): Point => ({ x: -p.x, y: p.y });

export function normalizeYaw(yaw: number): number {
  const wrapped = ((((yaw + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
}

/** The two drawings around a turn and how far it is from the first (smoothstep, 0 to 1). */
export function artBlendAt(yaw: number): Readonly<{ from: MascotV2ArtSource; t: number; to: MascotV2ArtSource }> {
  const y = normalizeYaw(yaw);
  const index = Math.max(0, ART_KEYS.findIndex((key, i) => i < ART_KEYS.length - 1 && y >= key.yaw && y <= ART_KEYS[i + 1]!.yaw));
  const from = ART_KEYS[index]!, to = ART_KEYS[index + 1]!;
  return { from, t: smoothstep((y - from.yaw) / (to.yaw - from.yaw)), to };
}

/** The drawing's own limb side for a rig limb. */
export function artSideFor(source: MascotV2ArtSource, side: MascotV2Side): MascotV2Side {
  let artSide = source.view === "back" ? swapSide(side) : side;
  if (source.mirror) artSide = swapSide(artSide);
  if (mascotV2Views[source.view].nearOnly && artSide === "R") artSide = "L";
  return artSide;
}

export function viewPart(view: MascotV2View, part: MascotV2PartName): readonly MascotV2Layer[] {
  const layers = view.parts[part];
  if (!layers) throw new Error(`The drawing has no ${part}.`);
  return layers;
}

export function viewPivot(view: MascotV2View, pivot: MascotV2PivotName): Point {
  const point = view.pivots[pivot];
  if (!point) throw new Error(`The drawing has no ${pivot} dot.`);
  return point;
}

export const baseShapes = (layers: readonly MascotV2Layer[]) => layers.filter((l) => l.role === "base").flatMap((l) => l.shapes);

/** Centre of the base shapes' bounds (every subpath and control point counts). */
export function centreOf(layers: readonly MascotV2Layer[]): Point {
  const points = baseShapes(layers).flatMap((shape) =>
    parsePath(shape.d).flatMap((segment) => (segment.kind === "Z" ? [] : segment.kind === "C" ? [segment.c1, segment.c2, segment.to] : [segment.to])),
  );
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

const mirrorPathData = (d: string) => serializePath(mapPath(parsePath(d), mirrorPoint));
const nearestIndex = (line: readonly Point[], target: Point) =>
  line.reduce((best, p, i) => (Math.hypot(p.x - target.x, p.y - target.y) < Math.hypot(line[best]!.x - target.x, line[best]!.y - target.y) ? i : best), 0);
const angleOf = (from: Point, to: Point) => Math.atan2(to.y - from.y, to.x - from.x);

const JOINTS = { arm: ["shoulder", "Elbow", "Wrist"], leg: ["Hip", "Knee", "Ankle"] } as const;

const limbCache: Partial<Record<string, MascotV2LimbArt>> = {};

/** One drawing's art for a rig limb: planted tube resampled to the shared count, joints, and rigid pieces. */
export function limbArtFrom(source: MascotV2ArtSource, kind: MascotV2LimbKind, side: MascotV2Side): MascotV2LimbArt {
  const artSide = artSideFor(source, side);
  const key = `${source.view}/${source.mirror}/${kind}/${artSide}`;
  limbCache[key] ??= buildLimbArt(source, kind, artSide);
  return limbCache[key]!;
}

function buildLimbArt(source: MascotV2ArtSource, kind: MascotV2LimbKind, artSide: MascotV2Side): MascotV2LimbArt {
  const view = mascotV2Views[source.view];
  const place = (p: Point) => (source.mirror ? mirrorPoint(p) : p);
  const [rootName, midName, endName] = JOINTS[kind].map((name) => `${name}_${artSide}` as MascotV2PivotName) as [
    MascotV2PivotName,
    MascotV2PivotName,
    MascotV2PivotName,
  ];
  const joints = { end: place(viewPivot(view, endName)), mid: place(viewPivot(view, midName)), root: place(viewPivot(view, rootName)) };
  const base = baseShapes(viewPart(view, `${kind}_${artSide}`))[0]!.d;
  const tube = resampleTube(extractPlantedTube(source.mirror ? mirrorPathData(base) : base, joints.root), MASCOT_V2_LIMB_SAMPLES);
  const screenLeft = (artSide === "L") !== source.mirror;
  if (kind === "leg") {
    const footLayers = viewPart(view, `foot_${artSide}`);
    const toe = Math.sign(place(centreOf(footLayers)).x - joints.end.x) || 1;
    return { foot: { anchor: joints.end, angle: angleOf(joints.mid, joints.end), layers: footLayers, mirror: source.mirror, toe }, joints, screenLeft, tube };
  }
  const forearm = angleOf(joints.mid, joints.end);
  const handLayers = viewPart(view, `hand_open_${artSide}`);
  const bandLayers = viewPart(view, `armband_${artSide}`);
  const bandSample = nearestIndex(tube.midline, place(centreOf(bandLayers)));
  const ahead = tube.midline[Math.min(bandSample + 1, tube.midline.length - 1)]!, behind = tube.midline[Math.max(bandSample - 1, 0)]!;
  return {
    band: { anchor: tube.midline[bandSample]!, angle: angleOf(behind, ahead), layers: bandLayers, mirror: source.mirror, sample: bandSample },
    hand: { anchor: joints.end, angle: forearm, layers: handLayers, mirror: source.mirror },
    joints,
    screenLeft,
    tube,
  };
}

/** The limb's art for a turn: tubes and joints blended between the two nearest drawings, rigid pieces from the nearer one. */
export function limbArtAt(yaw: number, kind: MascotV2LimbKind, side: MascotV2Side): MascotV2LimbArt {
  const { from, t, to } = artBlendAt(yaw);
  const a = limbArtFrom(from, kind, side), b = limbArtFrom(to, kind, side);
  if (t <= 0) return a;
  if (t >= 1) return b;
  const mix = (p: Point, q: Point): Point => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const nearer = t < 0.5 ? a : b;
  return {
    ...nearer,
    joints: { end: mix(a.joints.end, b.joints.end), mid: mix(a.joints.mid, b.joints.mid), root: mix(a.joints.root, b.joints.root) },
    tube: blendTubes(a.tube, b.tube, t),
  };
}

/** A foot never shrinks below this share of its length while it swings toward the viewer. */
const MIN_TOE = 0.45;

/**
 * Where the toe points along the screen for a turn, as a signed share of the foot's
 * length: +1 fully right, −1 fully left. It eases from one drawing's toe direction
 * to the next, keeping at least `MIN_TOE` while the foot swings toward the viewer.
 */
export function toeAt(yaw: number, side: MascotV2Side): number {
  const { from, t, to } = artBlendAt(yaw);
  const a = limbArtFrom(from, "leg", side).foot!.toe, b = limbArtFrom(to, "leg", side).foot!.toe;
  const s = a + (b - a) * t;
  return Math.abs(s) >= MIN_TOE ? s : (Math.sign(s) || (t < 0.5 ? a : b)) * MIN_TOE;
}

/** How far past square-on the toe must point away from the viewer before the foot goes behind the leg. */
const AWAY_MARGIN = Math.sin((15 * Math.PI) / 180);

/**
 * The toe with the leg turned on its own axis by `turn` radians (positive takes the toe from
 * forward toward the body's right, like the character's turn). The drawn direction (`toeAt`) is
 * read as a heading, toward the viewer from the front half of the turn and away from the back
 * half, turned, and seen again: `toe` as `toeAt` gives it (never shorter than `MIN_TOE`), and
 * `behind` when the toe now points away from the viewer from the front half, so the foot goes
 * behind the leg. (From the back half the drawings keep the foot over the leg.)
 */
export function turnedToeAt(yaw: number, side: MascotV2Side, turn: number): Readonly<{ behind: boolean; toe: number }> {
  const drawn = toeAt(yaw, side);
  if (turn === 0) return { behind: false, toe: drawn };
  const facing = Math.cos((yaw * Math.PI) / 180) >= 0 ? 1 : -1;
  const heading = Math.atan2(drawn, facing * Math.sqrt(Math.max(0, 1 - drawn * drawn))) + turn;
  const s = Math.sin(heading);
  const toe = Math.abs(s) >= MIN_TOE ? s : (Math.sign(s) || Math.sign(drawn)) * MIN_TOE;
  return { behind: facing > 0 && Math.cos(heading) < -AWAY_MARGIN, toe };
}

/** The strand art for a turn: blended between the two nearest drawings, relative to each drawing's Hair_base. */
export type MascotV2StrandArt = Readonly<{ base: Point; tube: MascotTube }>;
const strandCache: Partial<Record<string, MascotV2StrandArt>> = {};

function buildStrandArt(view: MascotV2View, strand: MascotV2PartName): MascotV2StrandArt {
  const base = viewPivot(view, "Hair_base");
  return { base, tube: resampleTube(extractTube(baseShapes(viewPart(view, strand))[0]!.d, base), MASCOT_V2_STRAND_SAMPLES) };
}

function strandArtFrom(source: MascotV2ArtSource, strand: MascotV2PartName): MascotV2StrandArt {
  const key = `${source.view}/${strand}`;
  strandCache[key] ??= buildStrandArt(mascotV2Views[source.view], strand);
  return strandCache[key]!;
}

/** Hair is drawn the same from every side, so mirrored drawings are not mirrored for hair (the tuft keeps its drawn shape). */
export function strandArtAt(yaw: number, strand: MascotV2PartName): MascotV2StrandArt {
  const { from, t, to } = artBlendAt(yaw);
  const a = strandArtFrom(from, strand), b = strandArtFrom(to, strand);
  if (t <= 0) return a;
  if (t >= 1) return b;
  const mix = (p: Point, q: Point): Point => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  return { base: mix(a.base, b.base), tube: blendTubes(a.tube, b.tube, t) };
}

/** The hair's paint order, from the nearer drawing. */
export function strandOrderAt(yaw: number): MascotV2PartName[] {
  const { from, t, to } = artBlendAt(yaw);
  const body = mascotV2Views[(t < 0.5 ? from : to).view].groups.find((group) => group.name === "Body")!;
  return body.parts.filter((part): part is MascotV2PartName => part.startsWith("strand_"));
}

