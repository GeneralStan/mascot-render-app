/**
 * Poses the V2 arms and legs.
 *
 * Bones are built in 3D from the rest rig at the current turn, posed with the
 * existing controls (raise, swing, elbow or knee, twist, wrist or ankle,
 * straighten, length), then projected. The drawn tube is fitted onto the
 * projected bones: along each bone it scales with the bone's on-screen length,
 * and across it only partly, so the drawn curve survives. The character's joints
 * are very soft: a bend is spread along the limb by blending the two bone fits
 * over a window around the elbow or knee, up to 90% of the shorter bone on each
 * side, so a limb bends as one rubber-hose curve. The window grows with Softness
 * and is always wide enough that the inner edge never folds. Like a hose, a limb
 * keeps its length when it bends: the bones grow to make up the corner the rounding
 * cuts, so a bent arm stays in proportion with the legs.
 *
 * The art comes from the drawings around the current turn (see `mascot-v2-art.ts`):
 * tubes blend between the two nearest drawings, and the rigid pieces come from the
 * nearer one, each placed from the frame it was drawn in. The hand (open, fist or
 * thumbs-up) and the money bag ride the wrist, the armband the forearm, and the foot
 * the ankle, its toe easing between the drawn directions.
 *
 * Limbs are trimmed at the shoulder or hip. That end stays open in the outline,
 * so a limb in front of the body (the 3/4 near arm) looks attached.
 */

import { filletDistance } from "./mascot-geometry";
import {
  applyAffine,
  composeAffine,
  identityAffine,
  parsePath,
  rotateAffineAround,
  rotatePoint,
  scaleAffineAround,
  serializePath,
  translateAffine,
  type Affine,
  type Point,
  type PointMap,
} from "./mascot-path";
import { flattenOutline, relaxMidline, tubeEdges, tubeTangents, untangleMidline, type MascotTube } from "./mascot-tube";
import {
  baseShapes,
  centreOf,
  limbArtAt,
  toeAt,
  type MascotV2LimbKind,
  type MascotV2RigidArt,
  type MascotV2Side,
} from "./mascot-v2-art";
import { mascotV2Props, type MascotV2Layer, type MascotV2PivotName } from "./mascot-v2-parts";
import { MASCOT_V2_BODY_PIVOT, restJointsAt, turnPoint, type Vec3 } from "./mascot-v2-rig";

export type { MascotV2LimbKind, MascotV2Side };
export type MascotV2Hand = "open" | "fist" | "thumbsUp";

/** One limb's pose. Angles are in degrees; `bend` is the elbow or knee and `end` the wrist or ankle. */
export type MascotV2LimbPose = Readonly<{
  bandTilt: number;
  bend: number;
  end: number;
  flipHand: boolean;
  hand: MascotV2Hand;
  length: number;
  moneyBag: boolean;
  raise: number;
  straighten: number;
  swing: number;
  twist: number;
}>;

export const MASCOT_V2_REST_POSE: MascotV2LimbPose = {
  bandTilt: 0,
  bend: 0,
  end: 0,
  flipHand: false,
  hand: "open",
  length: 1,
  moneyBag: false,
  raise: 0,
  straighten: 0,
  swing: 0,
  twist: 0,
};

/** Camera angles in degrees: yaw turns the mascot (positive faces screen right); pitch looks down. */
export type MascotV2Camera = Readonly<{ pitch: number; yaw: number }>;
/** How arms ride the body: the body's point map and its lean in radians. */
export type MascotV2BodyCarry = Readonly<{ lean: number; map: PointMap }>;

export type MascotV2LimbInput = Readonly<{
  body?: MascotV2BodyCarry;
  /** The turn (yaw) also picks the drawings the shapes come from. */
  camera: MascotV2Camera;
  kind: MascotV2LimbKind;
  pose: MascotV2LimbPose;
  /** The rig side: L is the screen-left limb in the front view. */
  side: MascotV2Side;
  /** Joint rounding in rig px (the Softness control). */
  softness: number;
}>;

export type MascotV2PlacedLayers = Readonly<{ id: string; layers: readonly MascotV2Layer[]; transform: Affine }>;

export type MascotV2PosedLimb = Readonly<{
  /** Pieces drawn under the limb (the money bag). */
  behind: readonly MascotV2PlacedLayers[];
  /** Mean depth of the posed joints toward the viewer, for layering. */
  depth: number;
  /** Closed outline for the base fill. The root end is cut straight, inside the body. */
  fill: string;
  /** Pieces drawn over the limb: hand then armband, or the foot. */
  front: readonly MascotV2PlacedLayers[];
  id: string;
  joints: Readonly<{ end: Point; mid: Point; root: Point }>;
  kind: MascotV2LimbKind;
  /** Posed centreline, one point per tube sample. */
  midline: readonly Point[];
  side: MascotV2Side;
  /** Outline stroke, open at the root so the limb looks attached. */
  stroke: string;
  /** The rest tube for this turn, trimmed at the shoulder or hip. */
  tube: MascotTube;
}>;

/** Money bag size relative to its drawing: as drawn, 110 px wide, about 0.7 of the head's width as in refs/holding_cash.png. */
export const MASCOT_V2_BAG_SCALE = 1;
/** The bag hangs from the fist swung outward by this much, as in refs/holding_cash.png. */
const BAG_TILT = (25 * Math.PI) / 180;
const FOLD_MARGIN = 1.15;
/** A bend may curve across up to this share of the shorter bone on each side of the joint. */
const FILLET_SHARE = 0.9;
/**
 * The character's joints are very soft: a bend spreads over at least this many times the
 * Softness (px) either side of the joint, so even the default bends a limb as one long
 * rubber-hose curve rather than two straight pieces with a rounded corner.
 */
const HOSE_REACH = 3;
/** The rounding eases in over the first this-many radians of bend (10°), so a bend starting from rest doesn't jump. */
const HOSE_EASE_IN = (10 * Math.PI) / 180;

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const sub2 = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const add2 = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const len2 = (v: Point) => Math.hypot(v.x, v.y);
function polylineLength(line: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += len2(sub2(line[i]!, line[i - 1]!));
  return total;
}
/** How much shorter the quadratic curve from `a` round `b` to `c` is than the corner a–b–c (Simpson's rule, 16 steps). */
function cornerCut(a: Point, b: Point, c: Point): number {
  const ab = sub2(b, a), bc = sub2(c, b);
  const speed = (t: number) => 2 * Math.hypot((1 - t) * ab.x + t * bc.x, (1 - t) * ab.y + t * bc.y);
  const steps = 16;
  let sum = speed(0) + speed(1);
  for (let i = 1; i < steps; i++) sum += (i % 2 === 1 ? 4 : 2) * speed(i / steps);
  return len2(ab) + len2(bc) - sum / (3 * steps);
}
const lerp2 = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const angleOf = (v: Point) => Math.atan2(v.y, v.x);
const unit2 = (v: Point): Point => {
  const l = len2(v);
  return l > 1e-9 ? { x: v.x / l, y: v.y / l } : { x: 1, y: 0 };
};

const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale3 = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const len3 = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => add3(a, scale3(sub3(b, a), t));
const cross3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
/** Rotation in the front (screen) plane, the same sense as `rotatePoint`. */
const rotateZ = (v: Vec3, r: number): Vec3 => ({ x: v.x * Math.cos(r) - v.y * Math.sin(r), y: v.x * Math.sin(r) + v.y * Math.cos(r), z: v.z });
/** Rotation about the lateral axis: positive swings a hanging limb forward (+z). */
const rotateX = (v: Vec3, r: number): Vec3 => ({ x: v.x, y: v.y * Math.cos(r) - v.z * Math.sin(r), z: v.y * Math.sin(r) + v.z * Math.cos(r) });
function rotateAround(v: Vec3, axis: Vec3, r: number): Vec3 {
  const k = cross3(axis, v), d = axis.x * v.x + axis.y * v.y + axis.z * v.z;
  return add3(add3(scale3(v, Math.cos(r)), scale3(k, Math.sin(r))), scale3(axis, d * (1 - Math.cos(r))));
}

/** Projects a rig-space point for the camera: the turn, then looking down tilts about the body pivot's height. */
export function projectV2(point: Vec3, camera: MascotV2Camera): Readonly<{ depth: number; point: Point }> {
  const turned = turnPoint(point, camera.yaw);
  const pitch = radians(camera.pitch), pivotY = MASCOT_V2_BODY_PIVOT.y;
  return {
    depth: turned.z,
    point: { x: turned.x, y: pivotY + (turned.y - pivotY) * Math.cos(pitch) + turned.z * Math.sin(pitch) },
  };
}

/**
 * Maps the drawn bone chord onto the posed one: scaled along the bone by the posed
 * length (foreshortening) and only partly across it, so the drawn bow survives.
 */
function chordMap(fromA: Point, fromB: Point, toA: Point, toB: Point): PointMap {
  const f = sub2(fromB, fromA), t = sub2(toB, toA);
  const along = len2(t) / Math.max(len2(f), 1e-6);
  const across = Math.min(1, 0.35 + 0.65 * along);
  const fu = unit2(f), tu = len2(t) > 1e-6 ? unit2(t) : fu;
  return (p) => {
    const v = sub2(p, fromA);
    const a = (v.x * fu.x + v.y * fu.y) * along;
    const c = (fu.x * v.y - fu.y * v.x) * across;
    return { x: toA.x + tu.x * a - tu.y * c, y: toA.y + tu.y * a + tu.x * c };
  };
}

function reflectAcross(point: Point, angle: number): Affine {
  const c = Math.cos(2 * angle), s = Math.sin(2 * angle);
  const linear: Affine = { a: c, b: s, c: s, d: -c, e: 0, f: 0 };
  return composeAffine(translateAffine(point.x, point.y), composeAffine(linear, translateAffine(-point.x, -point.y)));
}
const rigidAffine = (from: Point, to: Point, turn: number): Affine =>
  composeAffine(translateAffine(to.x - from.x, to.y - from.y), rotateAffineAround(turn, from));

const JOINTS = { arm: ["shoulder", "Elbow", "Wrist"], leg: ["Hip", "Knee", "Ankle"] } as const;
const jointNames = (kind: MascotV2LimbKind, side: MascotV2Side) =>
  JOINTS[kind].map((name) => `${name}_${side}` as MascotV2PivotName) as [MascotV2PivotName, MascotV2PivotName, MascotV2PivotName];
function nearestIndex(line: readonly Point[], target: Point): number {
  return line.reduce((best, p, i) => (len2(sub2(p, target)) < len2(sub2(line[best]!, target)) ? i : best), 0);
}
const MIRROR_X: Affine = { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 };
/** Maps a rigid piece's drawing (mirrored first if its drawing is used mirrored) onto a posed anchor and bone angle. */
const placePiece = (piece: MascotV2RigidArt, to: Point, angle: number, extra: Affine = identityAffine): Affine =>
  composeAffine(rigidAffine(piece.anchor, to, angle - piece.angle), composeAffine(extra, piece.mirror ? MIRROR_X : identityAffine));

/** Places a fist or thumbs-up prop at the drawn wrist, pointing along the drawn forearm. Props are drawn as right hands. */
function propPlacement(prop: "handFist" | "handThumbsUp", wrist: Point, forearmAngle: number, screenLeft: boolean): Affine {
  const drawn = mascotV2Props[prop];
  const propWrist = drawn.pivots!.Wrist!;
  const propAngle = angleOf(sub2(centreOf(drawn.layers), propWrist));
  let placed = rigidAffine(propWrist, wrist, forearmAngle - propAngle);
  if (screenLeft) placed = composeAffine(reflectAcross(wrist, forearmAngle), placed);
  return placed;
}

/** Poses one arm or leg. */
export function poseV2Limb(input: MascotV2LimbInput): MascotV2PosedLimb {
  const { camera, kind, pose, side } = input;
  const art = limbArtAt(camera.yaw, kind, side);
  const mirror = side === "L" ? 1 : -1;
  const screenSign = art.screenLeft ? 1 : -1;
  const [rootName, midName, endName] = jointNames(kind, side);

  // 3D bones from the rest rig at this turn.
  const rest = restJointsAt(camera.yaw);
  const R = rest[rootName];
  let M = rest[midName], E = rest[endName];
  // `drawn*` are the drawing's joints; `fit*` the same after Straighten, which the centreline is fitted from.
  const drawnR = art.joints.root, drawnM = art.joints.mid, drawnE = art.joints.end;
  let fitM = drawnM, fitE = drawnE;
  const tube = art.tube;
  let restMidline: readonly Point[] = tube.midline;
  if (kind === "arm" && pose.straighten > 0) {
    const a = Math.min(1, pose.straighten);
    const u3 = scale3(sub3(E, R), 1 / Math.max(len3(sub3(E, R)), 1e-6));
    const upperLength = len3(sub3(M, R)), lowerLength = len3(sub3(E, M));
    M = lerp3(M, add3(R, scale3(u3, upperLength)), a);
    E = lerp3(E, add3(R, scale3(u3, upperLength + lowerLength)), a);
    const u2 = unit2(sub2(drawnE, drawnR));
    const along = (d: number): Point => add2(drawnR, { x: u2.x * d, y: u2.y * d });
    const upper2 = len2(sub2(drawnM, drawnR)), lower2 = len2(sub2(drawnE, drawnM));
    const start = tube.midline[0]!;
    restMidline = tube.midline.map((p, i) => lerp2(p, add2(start, { x: u2.x * tube.arc[i]!, y: u2.y * tube.arc[i]! }), a));
    fitM = lerp2(drawnM, along(upper2), a);
    fitE = lerp2(drawnE, along(upper2 + lower2), a);
  }
  const atRoot = (v: Vec3) => rotateX(rotateZ(v, radians(pose.raise) * mirror), radians(pose.swing));
  const upperBone = atRoot(sub3(M, R));
  let lowerBone = atRoot(sub3(E, M));
  if (pose.bend !== 0) {
    // The forearm or shin turns from its own rest direction toward the bend direction. (Hinging
    // on the upper bone instead would tip the drawn forearm toward the camera, since the drawn
    // elbow sits behind the shoulder, and shorten it on screen.)
    const outward: Vec3 = { x: -mirror, y: 0, z: 0 };
    const twist = radians(pose.twist);
    const toward = kind === "arm" ? add3({ x: 0, y: 0, z: Math.cos(twist) }, scale3(outward, Math.sin(twist))) : { x: 0, y: 0, z: -1 };
    const axis = cross3(scale3(lowerBone, 1 / Math.max(len3(lowerBone), 1e-6)), atRoot(toward));
    if (len3(axis) > 1e-6) lowerBone = rotateAround(lowerBone, scale3(axis, 1 / len3(axis)), radians(pose.bend));
  }
  // A bone seen end-on still shows as a stub as long as the limb is wide, with the hand or foot at its end.
  const halfWidth = Math.max(...tube.edges[0].map((o, i) => Math.hypot(o.along - tube.edges[1][i]!.along, o.across - tube.edges[1][i]!.across))) / 2;
  const keepVisible = (from: Point, to: Point, fallback: Point): Point => {
    const v = sub2(to, from);
    if (len2(v) >= 2 * halfWidth) return to;
    const dir = len2(v) > 1e-6 ? unit2(v) : unit2(fallback);
    return add2(from, { x: dir.x * 2 * halfWidth, y: dir.y * 2 * halfWidth });
  };
  const sMid = tube.arc[nearestIndex(restMidline, fitM)]!;
  const signedTurn = (a: Point, b: Point) => Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
  const drawnTurn = signedTurn(sub2(fitM, drawnR), sub2(fitE, fitM));
  const restAt = (s: number): Point => {
    const i = Math.max(0, Math.min(tube.arc.length - 2, tube.arc.findIndex((a) => a > s) - 1));
    const span = tube.arc[i + 1]! - tube.arc[i]!;
    return lerp2(restMidline[i]!, restMidline[i + 1]!, span > 1e-9 ? Math.min(1, Math.max(0, (s - tube.arc[i]!) / span)) : 0);
  };

  /** Projects the bones at `stretch` times the posed length and fits the drawn centreline onto them, rounding the joint. */
  const fitBones = (stretch: number) => {
    const upper = scale3(upperBone, pose.length * stretch), lower = scale3(lowerBone, pose.length * stretch);
    const rootP = projectV2(R, camera), midP = projectV2(add3(R, upper), camera), endP = projectV2(add3(add3(R, upper), lower), camera);
    const midPoint = keepVisible(rootP.point, midP.point, sub2(fitM, drawnR));
    const endPoint = keepVisible(midPoint, add2(endP.point, sub2(midPoint, midP.point)), sub2(fitE, fitM));
    const upperMap = chordMap(drawnR, fitM, rootP.point, midPoint);
    const lowerMap = chordMap(fitM, fitE, midPoint, endPoint);
    const upperLen = len2(sub2(midPoint, rootP.point)), lowerLen = len2(sub2(endPoint, midPoint));
    // Fitting each bone separately leaves a corner at the joint as big as the bend the pose adds to
    // the drawing's own bend. At rest there is no corner, so the drawn curve is kept exactly.
    const posedTurn = signedTurn(sub2(midPoint, rootP.point), sub2(endPoint, midPoint));
    const turn = Math.abs(Math.atan2(Math.sin(posedTurn - drawnTurn), Math.cos(posedTurn - drawnTurn)));
    // The joint becomes a quadratic fillet from `window` before the joint to `window` after it.
    // Its tightest radius is window·cos²(turn/2)/sin(turn/2), kept above half the tube's width.
    const half = Math.min(turn, Math.PI - 1e-3) / 2;
    const noFold = (halfWidth * FOLD_MARGIN * Math.sin(half)) / Math.cos(half) ** 2;
    // Softness spreads a bend along the limb, at least HOSE_REACH × Softness px either side of
    // the joint (and never tighter than a Softness-radius fillet), so the limb curves like a
    // rubber hose instead of meeting at a corner.
    const easeIn = Math.min(1, turn / HOSE_EASE_IN);
    const reach = Math.max(filletDistance(input.softness, turn, upperLen, lowerLen), HOSE_REACH * input.softness) * easeIn * (2 - easeIn);
    const window = turn < 1e-6 ? 0 : Math.min(Math.max(reach, noFold), FILLET_SHARE * Math.min(upperLen, lowerLen, sMid, tube.length - sMid));
    const enter = upperMap(restAt(sMid - window)), corner = upperMap(restAt(sMid)), leave = lowerMap(restAt(sMid + window));
    const rounded = restMidline.map((p, i) => {
      const s = tube.arc[i]!;
      if (window > 1e-6 && Math.abs(s - sMid) < window) {
        const t = (s - (sMid - window)) / (2 * window);
        return lerp2(lerp2(enter, corner, t), lerp2(corner, leave, t), t);
      }
      return s <= sMid ? upperMap(p) : lowerMap(p);
    });
    // Only the corner the pose adds: rounding the drawing's own elbow or knee curve isn't made up.
    let cut = 0;
    if (window > 1e-6) {
      const drawnAngle = Math.abs(signedTurn(sub2(restAt(sMid), restAt(sMid - window)), sub2(restAt(sMid + window), restAt(sMid))));
      const a = len2(sub2(corner, enter)), b = len2(sub2(leave, corner));
      const drawnCut = cornerCut({ x: -a, y: 0 }, { x: 0, y: 0 }, { x: b * Math.cos(drawnAngle), y: b * Math.sin(drawnAngle) });
      cut = Math.max(0, cornerCut(enter, corner, leave) - drawnCut);
    }
    return { cut, endP, endPoint, midP, midPoint, rootP, rounded };
  };
  // A rubber hose keeps its length when it bends. Rounding the joint cuts the corner, so when
  // the pose bends the limb the bones grow until the rounded limb is as long on screen as it
  // was before the corner was cut. Unbent limbs (the refitted right arm included) stay as fitted.
  let stretch = 1;
  let fit = fitBones(stretch);
  const hoseLength = polylineLength(fit.rounded) + fit.cut;
  for (let step = 0; step < 4 && pose.bend !== 0 && fit.cut > 1e-6; step++) {
    const next = (stretch * hoseLength) / Math.max(polylineLength(fit.rounded), 1e-6);
    if (Math.abs(next - stretch) < 1e-5) break;
    stretch = next;
    fit = fitBones(stretch);
  }
  const { endP, endPoint, midP, midPoint, rootP } = fit;

  const body = kind === "arm" ? input.body : undefined;
  const shoulder = body ? body.map(rootP.point) : rootP.point;
  const lean = body ? body.lean : 0;
  const settle: PointMap = (p) => rotatePoint(add2(p, sub2(shoulder, rootP.point)), shoulder, lean);
  const fitted = fit.rounded.map(settle);

  const midline = untangleMidline(tube, relaxMidline(tube, fitted));
  const [edgeA, edgeB] = tubeEdges(tube, midline);
  const ring = [...edgeA, ...[...edgeB].reverse()];
  const stroke = serializePath([{ kind: "M", to: ring[0]! }, ...ring.slice(1).map((to) => ({ kind: "L" as const, to }))]);
  const fill = `${stroke}Z`;

  // Rigid pieces: each from its own drawing's frame onto the settled end joint and bone direction.
  const midS = settle(midPoint), endS = settle(endPoint);
  const endAngle = angleOf(sub2(endS, midS)) + radians(pose.end) * screenSign;
  const front: MascotV2PlacedLayers[] = [];
  const behind: MascotV2PlacedLayers[] = [];
  if (kind === "arm") {
    const hand = art.hand!;
    // Where the hand sits in its own drawing's frame: the drawn open hand, or a prop at the
    // drawn wrist, optionally flipped across the forearm. Then onto the posed wrist.
    const prop = pose.hand === "fist" ? "handFist" : pose.hand === "thumbsUp" ? "handThumbsUp" : null;
    const handLayers = prop ? mascotV2Props[prop].layers : hand.layers;
    let handRest = prop ? propPlacement(prop, hand.anchor, hand.angle, art.screenLeft) : hand.mirror ? MIRROR_X : identityAffine;
    if (pose.flipHand) handRest = composeAffine(reflectAcross(hand.anchor, hand.angle), handRest);
    const handTransform = composeAffine(rigidAffine(hand.anchor, endS, endAngle - hand.angle), handRest);
    if (pose.moneyBag) {
      // The fist closes round the bag's neck: the tie pokes out above it and the bag hangs below, swung outward.
      const neck = bagNeck();
      const grip = applyAffine(handTransform, centreOf(handLayers));
      const place = composeAffine(
        translateAffine(grip.x - neck.x, grip.y - neck.y),
        composeAffine(rotateAffineAround(BAG_TILT * screenSign, neck), scaleAffineAround(MASCOT_V2_BAG_SCALE, MASCOT_V2_BAG_SCALE, neck)),
      );
      behind.push({ id: `${kind}-${side}-money-bag`, layers: mascotV2Props.moneyBag.layers, transform: place });
    }
    front.push({ id: `${kind}-${side}-hand`, layers: handLayers, transform: handTransform });
    // The band keeps its spot along the tube (sample indices match across drawings) and turns with it.
    const band = art.band!;
    const bandAngle = angleOf(tubeTangents(midline)[band.sample]!) + radians(pose.bandTilt) * screenSign;
    front.push({ id: `${kind}-${side}-armband`, layers: band.layers, transform: placePiece(band, midline[band.sample]!, bandAngle) });
  } else {
    // The foot's toe eases between the drawn directions (outward in front and back, forward in 3/4 and side).
    const foot = art.foot!;
    const toe = toeAt(camera.yaw, side) * foot.toe;
    const transform = placePiece(foot, endS, endAngle, scaleAffineAround(toe, 1, foot.anchor));
    front.push({ id: `${kind}-${side}-foot`, layers: foot.layers, transform });
  }

  return {
    behind,
    depth: (rootP.depth + midP.depth + endP.depth) / 3,
    fill,
    front,
    id: `${kind}-${side}`,
    joints: { end: endS, mid: midS, root: shoulder },
    kind,
    midline,
    side,
    stroke,
    tube,
  };
}

/** Where the money bag is held: the middle of its neck, the narrowest point under the tie. */
export function bagNeck(): Point {
  return (bagNeckCache.point ??= findBagNeck());
}
const bagNeckCache: { point?: Point } = {};
function findBagNeck(): Point {
  const points = baseShapes(mascotV2Props.moneyBag.layers).slice(0, 1).flatMap((shape) => flattenOutline(shape.d, 0.5).points);
  const top = Math.min(...points.map((p) => p.y));
  const height = Math.max(...points.map((p) => p.y)) - top;
  // Scan the top 40% of the bag in 1 px slices for the narrowest one, skipping the tie's own tip.
  let best = { width: Infinity, x: 0, y: top };
  for (let y = top + 0.05 * height; y <= top + 0.4 * height; y += 1) {
    const slice = points.filter((p) => Math.abs(p.y - y) < 0.75).map((p) => p.x);
    if (slice.length < 2) continue;
    const width = Math.max(...slice) - Math.min(...slice);
    if (width < best.width) best = { width, x: (Math.max(...slice) + Math.min(...slice)) / 2, y };
  }
  return { x: best.x, y: best.y };
}
