/**
 * Canonical product settings for the mascot rig. Schema controls, renderers,
 * scene bounds and export all read the same sanitized settings object so
 * preview, PNG/JPG, SVG and video stay in exact agreement.
 */

export const mascotTargets = {
  background: "appearance.background",
  includeBackground: "export.includeBackground",
  viewOrbit: "view.orbit",
  viewScale: "view.scale",
  bodyTurn: "body.turn",
  bodyLean: "body.lean",
  bodySquash: "body.squash",
  bodyLift: "body.lift",
  bodySoftness: "body.softness",
  bodyPivot: "body.pivot",
  posePreset: "pose.preset",
  hairBend: "hair.bend",
  hairSweep: "hair.sweep",
  hairWave: "hair.wave",
  hairWavePhase: "hair.wavePhase",
  headbandTilt: "headband.tilt",
  faceEyes: "face.eyes",
  faceMouth: "face.mouth",
  armLeftRaise: "armLeft.raise",
  armLeftSwing: "armLeft.swing",
  armLeftTwist: "armLeft.twist",
  armLeftElbow: "armLeft.elbow",
  armLeftWrist: "armLeft.wrist",
  armLeftHand: "armLeft.hand",
  armLeftFlipHand: "armLeft.flipHand",
  armLeftMoneyBag: "armLeft.moneyBag",
  armLeftStraighten: "armLeft.straighten",
  armLeftLength: "armLeft.length",
  armLeftBandTilt: "armLeft.bandTilt",
  armRightRaise: "armRight.raise",
  armRightSwing: "armRight.swing",
  armRightTwist: "armRight.twist",
  armRightElbow: "armRight.elbow",
  armRightWrist: "armRight.wrist",
  armRightHand: "armRight.hand",
  armRightFlipHand: "armRight.flipHand",
  armRightMoneyBag: "armRight.moneyBag",
  armRightStraighten: "armRight.straighten",
  armRightLength: "armRight.length",
  armRightBandTilt: "armRight.bandTilt",
  legLeftRaise: "legLeft.raise",
  legLeftSwing: "legLeft.swing",
  legLeftKnee: "legLeft.knee",
  legLeftAnkle: "legLeft.ankle",
  legLeftLength: "legLeft.length",
  legRightRaise: "legRight.raise",
  legRightSwing: "legRight.swing",
  legRightKnee: "legRight.knee",
  legRightAnkle: "legRight.ankle",
  legRightLength: "legRight.length",
  lightAngle: "light.angle",
  shadingVisible: "shading.visible",
  shadingSize: "shading.size",
  shadingHighlight: "shading.highlight",
  groundVisible: "groundShadow.visible",
  groundColor: "groundShadow.color",
  groundSize: "groundShadow.size",
  groundBlur: "groundShadow.blur",
  castVisible: "castShadow.visible",
  castColor: "castShadow.color",
  castLength: "castShadow.length",
  castBlur: "castShadow.blur",
  dropVisible: "dropShadow.visible",
  dropColor: "dropShadow.color",
  dropOffsetX: "dropShadow.offsetX",
  dropOffsetY: "dropShadow.offsetY",
  dropBlur: "dropShadow.blur",
} as const;

export type MascotEyes = "open" | "blink" | "curious" | "sad" | "tired";
export type MascotMouth = "happy" | "neutral" | "sad";
export type MascotHand = "open" | "fist" | "thumbsUp";

export const eyesOptions = [
  { label: "Open", value: "open" },
  { label: "Blink", value: "blink" },
  { label: "Curious", value: "curious" },
  { label: "Sad", value: "sad" },
  { label: "Tired", value: "tired" },
] as const satisfies readonly { label: string; value: MascotEyes }[];

export const mouthOptions = [
  { label: "Happy", value: "happy" },
  { label: "Neutral", value: "neutral" },
  { label: "Sad", value: "sad" },
] as const satisfies readonly { label: string; value: MascotMouth }[];

export const handOptions = [
  { label: "Open", value: "open" },
  { label: "Fist", value: "fist" },
  { label: "Thumb up", value: "thumbsUp" },
] as const satisfies readonly { label: string; value: MascotHand }[];

export type MascotColorOpacity = Readonly<{ hex: string; opacity: number }>;

/** A pad value: -1 to 1 on each axis, x right and y down on screen. */
export type MascotVector = Readonly<{ x: number; y: number }>;

/** One arm's 3D joints (degrees), shape modifiers, hand and prop, and armband tilt. */
export type MascotArmPose = Readonly<{
  bandTilt: number;
  elbow: number;
  flipHand: boolean;
  hand: MascotHand;
  /** Bone length as a fraction of the drawn length. */
  length: number;
  /** Holds a money bag (the cash jump prop). */
  moneyBag: boolean;
  raise: number;
  /** 0 keeps Figma's natural bend; 1 is a straight arm of the same length. */
  straighten: number;
  swing: number;
  twist: number;
  wrist: number;
}>;

/** One leg's 3D joints (degrees) and length. */
export type MascotLegPose = Readonly<{
  ankle: number;
  knee: number;
  length: number;
  raise: number;
  swing: number;
}>;

export type MascotSettings = Readonly<{
  /** Gimbal view: yaw turns the mascot (positive faces screen-right); pitch looks down. Degrees. */
  view: Readonly<{ pitch: number; scale: number; yaw: number }>;
  /**
   * `turn` turns the character itself under the world's light (degrees; positive faces screen right).
   * `pivot` is where Lean turns and Squash stretches the body: -1 to 1 on each axis (x right, y down),
   * the edges `MASCOT_BODY_PIVOT_REACH_PX` from the bottom centre of the body.
   */
  body: Readonly<{ lean: number; lift: number; pivot: MascotVector; softness: number; squash: number; turn: number }>;
  hair: Readonly<{ bandTilt: number; bend: number; sweep: number; wave: number; wavePhase: number }>;
  face: Readonly<{ eyes: MascotEyes; mouth: MascotMouth }>;
  armLeft: MascotArmPose;
  armRight: MascotArmPose;
  legLeft: MascotLegPose;
  legRight: MascotLegPose;
  lightAngle: number;
  /** Re-lit shading: the shade (`size` scales how far it reaches, 1 = as drawn) and the highlights. */
  shading: Readonly<{ highlight: boolean; size: number; visible: boolean }>;
  ground: Readonly<{ blur: number; color: MascotColorOpacity; size: number; visible: boolean }>;
  cast: Readonly<{ blur: number; color: MascotColorOpacity; length: number; visible: boolean }>;
  drop: Readonly<{
    blur: number;
    color: MascotColorOpacity;
    offset: Readonly<{ x: number; y: number }>;
    visible: boolean;
  }>;
}>;

export type MascotRange = Readonly<{
  defaultValue: number;
  /** Semantic hard domain; `min`/`max` are only the initial visible scale. */
  hardMax: number;
  hardMin: number;
  max: number;
  min: number;
  step: number;
}>;

/** Numeric domains shared by schema sliders and sanitization. */
export const mascotRanges = {
  viewScale: { defaultValue: 1.5, hardMax: 6, hardMin: 0.1, max: 3, min: 0.5, step: 0.05 },
  bodyTurn: { defaultValue: 0, hardMax: 180, hardMin: -180, max: 180, min: -180, step: 1 },
  bodyLean: { defaultValue: 0, hardMax: 90, hardMin: -90, max: 30, min: -30, step: 1 },
  bodySquash: { defaultValue: 0, hardMax: 0.6, hardMin: -0.6, max: 0.35, min: -0.35, step: 0.01 },
  bodyLift: { defaultValue: 0, hardMax: 1000, hardMin: 0, max: 240, min: 0, step: 1 },
  bodySoftness: { defaultValue: 18, hardMax: 120, hardMin: 0, max: 48, min: 0, step: 1 },
  hairBend: { defaultValue: 0, hardMax: 120, hardMin: -120, max: 60, min: -60, step: 1 },
  hairWave: { defaultValue: 0, hardMax: 80, hardMin: 0, max: 30, min: 0, step: 0.5 },
  hairWavePhase: { defaultValue: 0, hardMax: 360, hardMin: 0, max: 360, min: 0, step: 1 },
  headbandTilt: { defaultValue: 0, hardMax: 45, hardMin: -45, max: 30, min: -30, step: 1 },
  armRaise: { defaultValue: 0, hardMax: 180, hardMin: -180, max: 170, min: -40, step: 1 },
  armSwing: { defaultValue: 0, hardMax: 180, hardMin: -180, max: 170, min: -90, step: 1 },
  twist: { defaultValue: 0, hardMax: 180, hardMin: -180, max: 180, min: -180, step: 1 },
  elbow: { defaultValue: 0, hardMax: 180, hardMin: -180, max: 150, min: -30, step: 1 },
  wrist: { defaultValue: 0, hardMax: 180, hardMin: -180, max: 90, min: -90, step: 1 },
  straighten: { defaultValue: 0, hardMax: 100, hardMin: 0, max: 100, min: 0, step: 1 },
  limbLength: { defaultValue: 100, hardMax: 250, hardMin: 20, max: 160, min: 50, step: 1 },
  bandTilt: { defaultValue: 0, hardMax: 90, hardMin: -90, max: 60, min: -60, step: 1 },
  legRaise: { defaultValue: 0, hardMax: 180, hardMin: -180, max: 80, min: -30, step: 1 },
  legSwing: { defaultValue: 0, hardMax: 180, hardMin: -180, max: 110, min: -60, step: 1 },
  knee: { defaultValue: 0, hardMax: 180, hardMin: -180, max: 150, min: -20, step: 1 },
  ankle: { defaultValue: 0, hardMax: 180, hardMin: -180, max: 60, min: -60, step: 1 },
  // The drawn light (MASCOT_V2_DRAWN_LIGHT_ANGLE): from the left, a little above.
  lightAngle: { defaultValue: 160, hardMax: 360, hardMin: 0, max: 360, min: 0, step: 1 },
  // How far the shade reaches round each part; 1 = as drawn.
  shadingSize: { defaultValue: 1, hardMax: 3, hardMin: 0, max: 2, min: 0, step: 0.05 },
  groundSize: { defaultValue: 1, hardMax: 5, hardMin: 0.1, max: 2, min: 0.4, step: 0.01 },
  groundBlur: { defaultValue: 6, hardMax: 120, hardMin: 0, max: 40, min: 0, step: 0.5 },
  castLength: { defaultValue: 0.6, hardMax: 5, hardMin: 0.05, max: 2, min: 0.1, step: 0.01 },
  castBlur: { defaultValue: 4, hardMax: 120, hardMin: 0, max: 40, min: 0, step: 0.5 },
  dropBlur: { defaultValue: 0, hardMax: 120, hardMin: 0, max: 40, min: 0, step: 0.5 },
  dropOffset: { defaultValue: 12, hardMax: 400, hardMin: -400, max: 80, min: -80, step: 1 },
} as const satisfies Record<string, MascotRange>;

export const mascotDefaults = {
  background: "#FFFFFF",
  includeBackground: true,
  viewOrbit: { position: [0, 0, 5], up: [0, 1, 0] } as { position: [number, number, number]; up: [number, number, number] },
  flipHand: false,
  hand: "open" as MascotHand,
  moneyBag: false,
  faceEyes: "open" as MascotEyes,
  faceMouth: "happy" as MascotMouth,
  bodyPivot: { x: 0, y: 0 } as MascotVector,
  shadingVisible: true,
  shadingHighlight: true,
  groundVisible: true,
  groundColor: { hex: "#031E19", opacity: 16 },
  castVisible: false,
  castColor: { hex: "#031E19", opacity: 18 },
  dropVisible: false,
  dropColor: { hex: "#C94631", opacity: 100 },
} as const;

/** Drop shadow offsets are authored in world pixels; the scene uses them normalized by this edge. */
export const DROP_SHADOW_MAX_OFFSET_PX = 80;

/**
 * How far the Pivot pad's edge moves the body pivot from the bottom centre of the body, in the
 * drawing's px (scaled by View Scale like the rest of the rig). The body (head) is 157 px wide and
 * 160 px tall, so the edges reach the top of the head, the feet, and a head's width to each side.
 */
export const MASCOT_BODY_PIVOT_REACH_PX = 160;

type ValueRecord = Readonly<Record<string, unknown>>;

function readNumber(values: ValueRecord, target: string, range: MascotRange): number {
  const raw = values[target];
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(value)) return range.defaultValue;
  return Math.min(range.hardMax, Math.max(range.hardMin, value));
}

function readChoice<T extends string>(
  values: ValueRecord,
  target: string,
  options: readonly { value: T }[],
  fallback: T,
): T {
  const raw = values[target];
  return options.some((option) => option.value === raw) ? (raw as T) : fallback;
}

/** A pad value, which arrives as numbers or as the pad's fixed-point strings ("0.30"), clamped to -1..1. */
function readVector(values: ValueRecord, target: string, fallback: MascotVector): MascotVector {
  const raw = values[target];
  const axis = (key: "x" | "y"): number => {
    const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>)[key] : undefined;
    const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
    return Number.isFinite(number) ? Math.min(1, Math.max(-1, number)) : fallback[key];
  };
  return { x: axis("x"), y: axis("y") };
}

function readBoolean(values: ValueRecord, target: string, fallback: boolean): boolean {
  const raw = values[target];
  return typeof raw === "boolean" ? raw : fallback;
}

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function normalizeHex(raw: unknown, fallback: string): string {
  if (typeof raw === "string" && HEX_PATTERN.test(raw)) return raw.toUpperCase();
  if (raw && typeof raw === "object" && "hex" in raw) {
    const hex = (raw as { hex: unknown }).hex;
    if (typeof hex === "string" && HEX_PATTERN.test(hex)) return hex.toUpperCase();
  }
  return fallback;
}

function readColorOpacity(
  values: ValueRecord,
  target: string,
  fallback: MascotColorOpacity,
): MascotColorOpacity {
  const raw = values[target];
  if (!raw || typeof raw !== "object") return fallback;
  const hex = normalizeHex(raw, fallback.hex);
  const opacityRaw = (raw as { opacity?: unknown }).opacity;
  const opacity =
    typeof opacityRaw === "number" && Number.isFinite(opacityRaw)
      ? Math.min(100, Math.max(0, opacityRaw))
      : fallback.opacity;
  return { hex, opacity };
}

/** Looking down/up is a gentle pseudo-3D foreshortening, so the camera tilt is capped. */
export const MASCOT_MAX_PITCH_DEGREES = 30;

type Triple = readonly [number, number, number];

function readTriple(raw: unknown): Triple | null {
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  const [x, y, z] = raw as unknown[];
  return typeof x === "number" && typeof y === "number" && typeof z === "number" &&
    [x, y, z].every(Number.isFinite)
    ? [x, y, z]
    : null;
}

/**
 * Reads the gimbal camera pose as a turntable heading and tilt. The camera starts in
 * front (+z); a camera on +x sees the mascot's right side, so the mascot faces screen-left.
 * Looking straight down or up, the heading comes from the camera's up vector.
 */
export function readOrbitView(raw: unknown): Readonly<{ pitch: number; yaw: number }> {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const [px, py, pz] = readTriple(record.position) ?? mascotDefaults.viewOrbit.position;
  const [ux, , uz] = readTriple(record.up) ?? mascotDefaults.viewOrbit.up;
  const horizontal = Math.hypot(px, pz);
  const heading = horizontal > 1e-6 ? { x: px, z: pz } : { x: -ux * Math.sign(py || 1), z: -uz * Math.sign(py || 1) };
  const yaw = (Math.atan2(-heading.x, heading.z) * 180) / Math.PI;
  const pitch = (Math.atan2(py, horizontal) * 180) / Math.PI;
  const cap = MASCOT_MAX_PITCH_DEGREES;
  return { pitch: Math.max(-cap, Math.min(cap, pitch)), yaw: Math.abs(yaw) < 1e-9 ? 0 : yaw };
}

type ArmTargets = Readonly<{
  bandTilt: string; elbow: string; flipHand: string; hand: string; length: string; moneyBag: string; raise: string;
  straighten: string; swing: string; twist: string; wrist: string;
}>;
type LegTargets = Readonly<{ ankle: string; knee: string; length: string; raise: string; swing: string }>;

function readArm(values: ValueRecord, targets: ArmTargets): MascotArmPose {
  const r = mascotRanges;
  return {
    bandTilt: readNumber(values, targets.bandTilt, r.bandTilt),
    elbow: readNumber(values, targets.elbow, r.elbow),
    flipHand: readBoolean(values, targets.flipHand, mascotDefaults.flipHand),
    hand: readChoice(values, targets.hand, handOptions, mascotDefaults.hand),
    length: readNumber(values, targets.length, r.limbLength) / 100,
    moneyBag: readBoolean(values, targets.moneyBag, mascotDefaults.moneyBag),
    raise: readNumber(values, targets.raise, r.armRaise),
    straighten: readNumber(values, targets.straighten, r.straighten) / 100,
    swing: readNumber(values, targets.swing, r.armSwing),
    twist: readNumber(values, targets.twist, r.twist),
    wrist: readNumber(values, targets.wrist, r.wrist),
  };
}

function readLeg(values: ValueRecord, targets: LegTargets): MascotLegPose {
  const r = mascotRanges;
  return {
    ankle: readNumber(values, targets.ankle, r.ankle),
    knee: readNumber(values, targets.knee, r.knee),
    length: readNumber(values, targets.length, r.limbLength) / 100,
    raise: readNumber(values, targets.raise, r.legRaise),
    swing: readNumber(values, targets.swing, r.legSwing),
  };
}

export function readMascotSettings(values: ValueRecord): MascotSettings {
  const t = mascotTargets;
  const r = mascotRanges;
  const d = mascotDefaults;
  return {
    view: { ...readOrbitView(values[t.viewOrbit]), scale: readNumber(values, t.viewScale, r.viewScale) },
    body: {
      lean: readNumber(values, t.bodyLean, r.bodyLean),
      lift: readNumber(values, t.bodyLift, r.bodyLift),
      pivot: readVector(values, t.bodyPivot, d.bodyPivot),
      softness: readNumber(values, t.bodySoftness, r.bodySoftness),
      squash: readNumber(values, t.bodySquash, r.bodySquash),
      turn: readNumber(values, t.bodyTurn, r.bodyTurn),
    },
    hair: {
      bandTilt: readNumber(values, t.headbandTilt, r.headbandTilt),
      bend: readNumber(values, t.hairBend, r.hairBend),
      sweep: readNumber(values, t.hairSweep, r.hairBend),
      wave: readNumber(values, t.hairWave, r.hairWave),
      wavePhase: readNumber(values, t.hairWavePhase, r.hairWavePhase),
    },
    face: {
      eyes: readChoice(values, t.faceEyes, eyesOptions, d.faceEyes),
      mouth: readChoice(values, t.faceMouth, mouthOptions, d.faceMouth),
    },
    armLeft: readArm(values, {
      bandTilt: t.armLeftBandTilt, elbow: t.armLeftElbow, flipHand: t.armLeftFlipHand, hand: t.armLeftHand, length: t.armLeftLength, moneyBag: t.armLeftMoneyBag,
      raise: t.armLeftRaise, straighten: t.armLeftStraighten, swing: t.armLeftSwing, twist: t.armLeftTwist, wrist: t.armLeftWrist,
    }),
    armRight: readArm(values, {
      bandTilt: t.armRightBandTilt, elbow: t.armRightElbow, flipHand: t.armRightFlipHand, hand: t.armRightHand, length: t.armRightLength, moneyBag: t.armRightMoneyBag,
      raise: t.armRightRaise, straighten: t.armRightStraighten, swing: t.armRightSwing, twist: t.armRightTwist, wrist: t.armRightWrist,
    }),
    legLeft: readLeg(values, {
      ankle: t.legLeftAnkle, knee: t.legLeftKnee, length: t.legLeftLength, raise: t.legLeftRaise, swing: t.legLeftSwing,
    }),
    legRight: readLeg(values, {
      ankle: t.legRightAnkle, knee: t.legRightKnee, length: t.legRightLength, raise: t.legRightRaise, swing: t.legRightSwing,
    }),
    lightAngle: readNumber(values, t.lightAngle, r.lightAngle),
    shading: {
      highlight: readBoolean(values, t.shadingHighlight, d.shadingHighlight),
      size: readNumber(values, t.shadingSize, r.shadingSize),
      visible: readBoolean(values, t.shadingVisible, d.shadingVisible),
    },
    ground: {
      blur: readNumber(values, t.groundBlur, r.groundBlur),
      color: readColorOpacity(values, t.groundColor, d.groundColor),
      size: readNumber(values, t.groundSize, r.groundSize),
      visible: readBoolean(values, t.groundVisible, d.groundVisible),
    },
    cast: {
      blur: readNumber(values, t.castBlur, r.castBlur),
      color: readColorOpacity(values, t.castColor, d.castColor),
      length: readNumber(values, t.castLength, r.castLength),
      visible: readBoolean(values, t.castVisible, d.castVisible),
    },
    drop: {
      blur: readNumber(values, t.dropBlur, r.dropBlur),
      color: readColorOpacity(values, t.dropColor, d.dropColor),
      offset: {
        x: readNumber(values, t.dropOffsetX, r.dropOffset) / DROP_SHADOW_MAX_OFFSET_PX,
        y: readNumber(values, t.dropOffsetY, r.dropOffset) / DROP_SHADOW_MAX_OFFSET_PX,
      },
      visible: readBoolean(values, t.dropVisible, d.dropVisible),
    },
  };
}
