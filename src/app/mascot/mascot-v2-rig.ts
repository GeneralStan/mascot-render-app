/**
 * The V2 rest rig in 3D, built from the four drawn views (front, 3/4, side, back).
 *
 * Space: the front view's rig space (x right, y down, origin at the head centre on
 * the floor) plus depth z toward the viewer. The mascot turns about the vertical
 * axis through the head centre. Yaw is in degrees and positive when the face turns
 * toward screen right, so the 3/4 drawing sits at +30° and the side at +90°.
 *
 * Joint positions across the body (x) and height (y) come from the front drawing,
 * and depth (z) from the side drawing (which faces screen right, so its x is
 * depth). Where the two drawings give a bone different heights, its depth is
 * scaled so the bone keeps the front's height and the side's angle, as V1's
 * `bone3D` did. The right arm mirrors the left (the user's call). Far limbs share
 * their near twin's depth.
 *
 * Each drawing then adds a correction that lands the rig exactly on it at its
 * angle: front 0°, 3/4 ±30° (mirrored for −30°), side ±90° (mirrored for −90°;
 * the far limbs sit exactly behind the near ones), back 180°. Corrections blend
 * with smoothstep between neighbouring drawings.
 *
 * Hair is drawn the same in every view, so it keeps its drawn shape and simply
 * rides Hair_base.
 */

import type { Point } from "./mascot-path";
import { flattenOutline } from "./mascot-tube";
import { normalizeYaw, viewPivot } from "./mascot-v2-art";
import { mascotV2PivotNames, mascotV2Views, type MascotV2PartName, type MascotV2PivotName } from "./mascot-v2-parts";

export { normalizeYaw };
export type Vec3 = Readonly<{ x: number; y: number; z: number }>;
export type MascotV2Joints = Readonly<Record<MascotV2PivotName, Vec3>>;
export type MascotV2StrandName = Extract<MascotV2PartName, `strand_${number}`>;

/** Turn angles of the drawn views. */
export const MASCOT_V2_VIEW_YAW = { back: 180, front: 0, side: 90, threeQuarter: 30 } as const;

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const smoothstep = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
const swapSide = (name: MascotV2PivotName): MascotV2PivotName => {
  if (name.endsWith("_L")) return `${name.slice(0, -2)}_R` as MascotV2PivotName;
  if (name.endsWith("_R")) return `${name.slice(0, -2)}_L` as MascotV2PivotName;
  return name;
};
/** The near-side twin: the side drawing only has _L joints. */
const nearTwin = (name: MascotV2PivotName): MascotV2PivotName => (name.endsWith("_R") ? swapSide(name) : name);
const mapJoints = (map: (name: MascotV2PivotName) => Vec3): MascotV2Joints =>
  Object.fromEntries(mascotV2PivotNames.map((name) => [name, map(name)])) as MascotV2Joints;

/** Turns a rig-space point about the vertical axis through the head centre. */
export function turnPoint(point: Vec3, yaw: number): Vec3 {
  const c = Math.cos(radians(yaw)), s = Math.sin(radians(yaw));
  return { x: point.x * c + point.z * s, y: point.y, z: -point.x * s + point.z * c };
}

/** Where a rig-space point lands on screen for a turn. */
export function projectPoint(point: Vec3, yaw: number): Point {
  const turned = turnPoint(point, yaw);
  return { x: turned.x, y: turned.y };
}

const CHAINS = [
  ["shoulder", "Elbow", "Wrist"],
  ["Hip", "Knee", "Ankle"],
] as const;

/** Depth of each near joint from the side drawing, each bone scaled to keep the front's height. */
function sideDepths(): Partial<Record<MascotV2PivotName, number>> {
  const { front, side } = mascotV2Views;
  const depth: Partial<Record<MascotV2PivotName, number>> = { Hair_base: viewPivot(side, "Hair_base").x };
  for (const chain of CHAINS) {
    const names = chain.map((joint) => `${joint}_L` as MascotV2PivotName);
    let z = viewPivot(side, names[0]!).x;
    depth[names[0]!] = z;
    for (let i = 1; i < names.length; i += 1) {
      const frontRise = viewPivot(front, names[i]!).y - viewPivot(front, names[i - 1]!).y;
      const sideRise = viewPivot(side, names[i]!).y - viewPivot(side, names[i - 1]!).y;
      const ratio = Math.abs(sideRise) > 1 && Math.abs(frontRise) > 1 ? frontRise / sideRise : 1;
      z += (viewPivot(side, names[i]!).x - viewPivot(side, names[i - 1]!).x) * ratio;
      depth[names[i]!] = z;
    }
  }
  return depth;
}

function buildRest(): MascotV2Joints {
  const front = mascotV2Views.front;
  const depth = sideDepths();
  const mirroredArm = new Set<MascotV2PivotName>(["shoulder_R", "Elbow_R", "Wrist_R"]);
  return mapJoints((name) => {
    const z = depth[nearTwin(name)]!;
    if (mirroredArm.has(name)) {
      const left = viewPivot(front, swapSide(name));
      return { x: -left.x, y: left.y, z };
    }
    const p = viewPivot(front, name);
    return { x: p.x, y: p.y, z };
  });
}

/** Rest joints at yaw 0: front positions, side depths, the right arm mirroring the left. */
const REST: MascotV2Joints = buildRest();

type Key = Readonly<{ correction: MascotV2Joints; yaw: number }>;

/**
 * The 3D nudge for each joint that lands the rest rig on `target` at `yaw`. It runs
 * along the camera's horizontal axis there, so it changes neither the joint's depth
 * at that angle nor anything else.
 */
function correctionTo(target: (name: MascotV2PivotName) => Point, yaw: number): MascotV2Joints {
  const c = Math.cos(radians(yaw)), s = Math.sin(radians(yaw));
  return mapJoints((name) => {
    const at = projectPoint(REST[name], yaw);
    const goal = target(name);
    const dx = goal.x - at.x;
    return { x: dx * c, y: goal.y - at.y, z: dx * s };
  });
}

function buildKeys(): readonly Key[] {
  const { back, side, threeQuarter } = mascotV2Views;
  const mirror = (p: Point): Point => ({ x: -p.x, y: p.y });
  const backCorrection = correctionTo((name) => viewPivot(back, swapSide(name)), 180);
  const sideCorrection = correctionTo((name) => viewPivot(side, nearTwin(name)), 90);
  const mirroredSide = correctionTo((name) => mirror(viewPivot(side, nearTwin(swapSide(name)))), -90);
  const threeQuarterCorrection = correctionTo((name) => viewPivot(threeQuarter, name), 30);
  const mirroredThreeQuarter = correctionTo((name) => mirror(viewPivot(threeQuarter, swapSide(name))), -30);
  const zero = mapJoints(() => ({ x: 0, y: 0, z: 0 }));
  return [
    { correction: backCorrection, yaw: -180 },
    { correction: mirroredSide, yaw: -90 },
    { correction: mirroredThreeQuarter, yaw: -30 },
    { correction: zero, yaw: 0 },
    { correction: threeQuarterCorrection, yaw: 30 },
    { correction: sideCorrection, yaw: 90 },
    { correction: backCorrection, yaw: 180 },
  ];
}
const KEYS = buildKeys();

/** The blended drawing correction for a turn. */
export function correctionAt(yaw: number): MascotV2Joints {
  const y = normalizeYaw(yaw);
  const index = Math.max(0, KEYS.findIndex((key, i) => i < KEYS.length - 1 && y >= key.yaw && y <= KEYS[i + 1]!.yaw));
  const a = KEYS[index]!, b = KEYS[index + 1]!;
  const t = smoothstep((y - a.yaw) / (b.yaw - a.yaw));
  return mapJoints((name) => {
    const p = a.correction[name], q = b.correction[name];
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t };
  });
}

/** Rest joints for a turn, with the drawing correction applied (still in unturned rig space). */
export function restJointsAt(yaw: number): MascotV2Joints {
  const correction = correctionAt(yaw);
  return mapJoints((name) => {
    const r = REST[name], c = correction[name];
    return { x: r.x + c.x, y: r.y + c.y, z: r.z + c.z };
  });
}

/** Rest joints on screen for a turn. */
export function projectedJointsAt(yaw: number): Readonly<Record<MascotV2PivotName, Point>> {
  const joints = restJointsAt(yaw);
  return Object.fromEntries(mascotV2PivotNames.map((name) => [name, projectPoint(joints[name], yaw)])) as Readonly<
    Record<MascotV2PivotName, Point>
  >;
}

/**
 * Places a hair point for a turn. Hair keeps its drawn shape from every side, so a
 * point keeps its offset from Hair_base: `restBase` in the drawing, `base` on screen.
 */
export function turnHairPoint(point: Point, restBase: Point, base: Point): Point {
  return { x: base.x + point.x - restBase.x, y: base.y + point.y - restBase.y };
}

function bottomCentre(outline: readonly Point[]): Point {
  const xs = outline.map((p) => p.x), ys = outline.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.max(...ys) };
}
/** The bottom centre of the front drawing's body (head) outline. */
function bodyBottomCentre(): Point {
  const layers = mascotV2Views.front.parts.head ?? [];
  const outline = layers.find((layer) => layer.role === "base")!.shapes[0]!.d;
  const { points } = flattenOutline(outline, 0.5);
  return bottomCentre(points);
}

/** The body pivot's default: the bottom centre of the body (head) outline. */
export const MASCOT_V2_BODY_PIVOT: Point = bodyBottomCentre();

export const mascotV2Rig = {
  bodyPivot: MASCOT_V2_BODY_PIVOT,
  rest: REST,
} as const;
