/**
 * MascotVM, the Rive view model, previewed in Mascot Lab.
 *
 * In Rive, the Mascot state machine (PROMPTS.md prompt 8) picks a body state from `pace` and
 * `hasStepData`, plays a reaction when a trigger fires, shows one face and shows or hides the
 * gear. Mascot Lab poses one frame at a time, so it shows each state's key pose instead:
 * - Body state: Idle (pace 100 or more, or no step data), Walking (40 to 99) or Tired (under 40).
 * - Reaction: the trigger last fired, shown at its key pose. None is the body state alone. As in
 *   Rive's layers, Goal hit and Won take over the body; Tap, Joined and Out play over it.
 * - The state's pose sits under the pose sliders, which add to it, so every slider still tweaks
 *   the pose. A hand or money bag left at its default takes the state's.
 * - Face: Auto eyes and Auto mouth follow the state's face, by the priority below.
 * - Time of day: night shows the sleepy face. Mascot Lab, which re-lights the art, also moves the
 *   light: morning brings it low on its side, evening mirrors it to the other side.
 * - Gear: the headband and armband switches show or hide the gear.
 */

import {
  mascotDefaults,
  mascotRanges,
  type MascotArmPose,
  type MascotEyes,
  type MascotLegPose,
  type MascotMouth,
  type MascotRange,
  type MascotSettings,
} from "./mascot-settings";
import { MASCOT_V2_CASH_JUMP, MASCOT_WALK_CONTACT } from "./mascot-v2-poses";

export type MascotBodyState = "idle" | "walking" | "tired";

/** Pace thresholds (PROMPTS.md prompt 8): Tired under 40, Walking from 40 to 99, Idle from 100. */
export const MASCOT_PACE = { idleFrom: 100, walkFrom: 40 } as const;

type ViewModel = MascotSettings["vm"];

export function mascotBodyState(vm: ViewModel): MascotBodyState {
  if (!vm.hasStepData || vm.pace >= MASCOT_PACE.idleFrom) return "idle";
  return vm.pace < MASCOT_PACE.walkFrom ? "tired" : "walking";
}

/** The face presets in clutch-mascot/CLAUDE.md, plus the excited and angry faces of Faces_V2. */
export const MASCOT_FACE_PRESETS = {
  angry: { eyes: "angry", mouth: "sad" },
  confused: { eyes: "curious", mouth: "neutral" },
  disappointed: { eyes: "tired", mouth: "sad" },
  excited: { eyes: "open", mouth: "excited" },
  happy: { eyes: "open", mouth: "happy" },
  sad: { eyes: "sad", mouth: "sad" },
  satisfied: { eyes: "blink", mouth: "happy" },
  sleepy: { eyes: "tired", mouth: "happy" },
} as const satisfies Record<string, Readonly<{ eyes: MascotEyes; mouth: MascotMouth }>>;

export type MascotFacePreset = keyof typeof MASCOT_FACE_PRESETS;

/**
 * The view model's face, highest priority first: goalHit, won and joined are excited; out is
 * sad; Tired is disappointed; no step data is confused; night is sleepy; otherwise happy.
 */
export function mascotFacePreset(vm: ViewModel): MascotFacePreset {
  if (vm.reaction === "goalHit" || vm.reaction === "won" || vm.reaction === "joined") return "excited";
  if (vm.reaction === "out") return "sad";
  if (mascotBodyState(vm) === "tired") return "disappointed";
  if (!vm.hasStepData) return "confused";
  if (vm.timeOfDay === "night") return "sleepy";
  return "happy";
}

/** The face drawn: the Face controls, with Auto taken from the view model. */
export function resolveMascotFace(settings: MascotSettings): Readonly<{ eyes: MascotEyes; mouth: MascotMouth }> {
  const preset = MASCOT_FACE_PRESETS[mascotFacePreset(settings.vm)];
  return {
    eyes: settings.face.eyes === "auto" ? preset.eyes : settings.face.eyes,
    mouth: settings.face.mouth === "auto" ? preset.mouth : settings.face.mouth,
  };
}

type ArmDelta = Partial<Pick<MascotArmPose, "elbow" | "length" | "raise" | "straighten" | "swing" | "twist" | "wrist">> &
  Partial<Pick<MascotArmPose, "hand" | "moneyBag">>;
type LegDelta = Partial<Pick<MascotLegPose, "ankle" | "knee" | "raise" | "swing">>;

/** A key pose as changes from rest: numbers add to the sliders; a hand or bag replaces a default one. */
type PoseDelta = Readonly<{
  armLeft?: ArmDelta;
  armRight?: ArmDelta;
  body?: Readonly<{ lean?: number; lift?: number; squash?: number }>;
  hairSweep?: number;
  legLeft?: LegDelta;
  legRight?: LegDelta;
}>;

const cash = MASCOT_V2_CASH_JUMP.limbs;
const cashArm: ArmDelta = {
  elbow: cash.armL.bend,
  hand: cash.armL.hand,
  length: cash.armL.length - 1,
  moneyBag: cash.armL.moneyBag,
  raise: cash.armL.raise,
  straighten: cash.armL.straighten,
  twist: cash.armL.twist,
};
const cashLeg: LegDelta = { ankle: cash.legL.end, raise: cash.legL.raise };

/**
 * Key poses for the states and reactions with no drawing of their own, from PROMPTS.md:
 * tired (squashed lower, arms hanging further down), celebrating (jump, both arms up),
 * thumbs_up (arm_R lifts forward), wave (arm_R) and shrug (both arms lift).
 */
const KEY_POSES = {
  celebrating: {
    armLeft: { elbow: 20, raise: 145 },
    armRight: { elbow: 20, raise: 145 },
    body: { lift: 56, squash: 0.08 },
    legLeft: { ankle: -10, knee: 30, raise: 8 },
    legRight: { ankle: -10, knee: 30, raise: 8 },
  },
  cashJump: {
    armLeft: cashArm,
    armRight: cashArm,
    body: { lean: MASCOT_V2_CASH_JUMP.body.lean, lift: MASCOT_V2_CASH_JUMP.body.lift },
    legLeft: cashLeg,
    legRight: cashLeg,
  },
  shrug: {
    armLeft: { elbow: 90, raise: 20, twist: 90 },
    armRight: { elbow: 90, raise: 20, twist: 90 },
    body: { squash: -0.04 },
  },
  thumbsUp: {
    armRight: { elbow: 105, hand: "thumbsUp", raise: 25, swing: 25 },
  },
  tired: {
    armLeft: { length: 0.04, raise: -8 },
    armRight: { length: 0.04, raise: -8 },
    body: { squash: -0.1 },
    hairSweep: -6,
    legLeft: { knee: 8 },
    legRight: { knee: 8 },
  },
  wave: {
    armRight: { elbow: 35, raise: 135, wrist: -10 },
  },
} as const satisfies Record<string, PoseDelta>;

const REACTION_POSES = {
  goalHit: KEY_POSES.celebrating,
  joined: KEY_POSES.thumbsUp,
  none: undefined,
  out: KEY_POSES.shrug,
  tap: KEY_POSES.wave,
  won: KEY_POSES.cashJump,
} as const satisfies Record<ViewModel["reaction"], PoseDelta | undefined>;

const clamp = (value: number, range: MascotRange) => Math.min(range.hardMax, Math.max(range.hardMin, value));
/** Length and straighten are fractions in the settings, percentages on the sliders. */
const clampFraction = (value: number, range: MascotRange) => clamp(value * 100, range) / 100;

function addArm(arm: MascotArmPose, delta: ArmDelta | undefined): MascotArmPose {
  if (!delta) return arm;
  const r = mascotRanges;
  return {
    ...arm,
    elbow: clamp(arm.elbow + (delta.elbow ?? 0), r.elbow),
    hand: delta.hand !== undefined && arm.hand === mascotDefaults.hand ? delta.hand : arm.hand,
    length: clampFraction(arm.length + (delta.length ?? 0), r.limbLength),
    moneyBag: delta.moneyBag !== undefined && arm.moneyBag === mascotDefaults.moneyBag ? delta.moneyBag : arm.moneyBag,
    raise: clamp(arm.raise + (delta.raise ?? 0), r.armRaise),
    straighten: clampFraction(arm.straighten + (delta.straighten ?? 0), r.straighten),
    swing: clamp(arm.swing + (delta.swing ?? 0), r.armSwing),
    twist: clamp(arm.twist + (delta.twist ?? 0), r.twist),
    wrist: clamp(arm.wrist + (delta.wrist ?? 0), r.wrist),
  };
}

function addLeg(leg: MascotLegPose, delta: LegDelta | undefined): MascotLegPose {
  if (!delta) return leg;
  const r = mascotRanges;
  return {
    ...leg,
    ankle: clamp(leg.ankle + (delta.ankle ?? 0), r.ankle),
    knee: clamp(leg.knee + (delta.knee ?? 0), r.knee),
    raise: clamp(leg.raise + (delta.raise ?? 0), r.legRaise),
    swing: clamp(leg.swing + (delta.swing ?? 0), r.legSwing),
  };
}

function addPose(settings: MascotSettings, delta: PoseDelta | undefined): MascotSettings {
  if (!delta) return settings;
  const r = mascotRanges;
  const body = delta.body ?? {};
  return {
    ...settings,
    armLeft: addArm(settings.armLeft, delta.armLeft),
    armRight: addArm(settings.armRight, delta.armRight),
    body: {
      ...settings.body,
      lean: clamp(settings.body.lean + (body.lean ?? 0), r.bodyLean),
      lift: clamp(settings.body.lift + (body.lift ?? 0), r.bodyLift),
      squash: clamp(settings.body.squash + (body.squash ?? 0), r.bodySquash),
    },
    hair: { ...settings.hair, sweep: clamp(settings.hair.sweep + (delta.hairSweep ?? 0), r.hairBend) },
    legLeft: addLeg(settings.legLeft, delta.legLeft),
    legRight: addLeg(settings.legRight, delta.legRight),
  };
}

/**
 * Walking turns Clutchman side-on the way he already faces (Turn below 0 faces screen left),
 * like the Walk pose, at the walk's contact pose. Side-on the near limbs are _L facing right.
 */
function walkingPose(turn: number): PoseDelta & Readonly<{ turn: number }> {
  const facingLeft = turn < 0;
  const w = MASCOT_WALK_CONTACT;
  const near = { arm: { swing: w.nearArm }, leg: { raise: w.legRaise, swing: w.nearLeg } };
  const far = { arm: { swing: w.farArm }, leg: { raise: w.legRaise, swing: w.farLeg } };
  const [left, right] = facingLeft ? [far, near] : [near, far];
  return { armLeft: left.arm, armRight: right.arm, hairSweep: w.hairSweep, legLeft: left.leg, legRight: right.leg, turn: facingLeft ? -90 : 90 };
}

const wrapDegrees = (degrees: number) => ((degrees % 360) + 360) % 360;
/** A turn kept within -180..180, the Turn slider's range. */
const wrapTurn = (degrees: number) => wrapDegrees(degrees + 180) - 180;

/** Morning brings the light 20° lower on its side; evening mirrors that to the other side. */
export function mascotTimeOfDayLight(lightAngle: number, timeOfDay: ViewModel["timeOfDay"]): number {
  if (timeOfDay === "morning") return wrapDegrees(lightAngle + 20);
  if (timeOfDay === "evening") return wrapDegrees(180 - (lightAngle + 20));
  return lightAngle;
}

/** The settings the scene draws: the view model's state under the sliders, its light, its gear. */
export function applyMascotViewModel(settings: MascotSettings): MascotSettings {
  const { vm } = settings;
  let posed = settings;
  // As in Rive, goalHit and won take over the body layer; tap, joined and out play over it.
  const state = vm.reaction === "goalHit" || vm.reaction === "won" ? "idle" : mascotBodyState(vm);
  if (state === "walking") {
    const walk = walkingPose(settings.body.turn);
    posed = addPose(posed, walk);
    posed = { ...posed, body: { ...posed.body, turn: wrapTurn(posed.body.turn + walk.turn) } };
  } else if (state === "tired") {
    posed = addPose(posed, KEY_POSES.tired);
  }
  posed = addPose(posed, REACTION_POSES[vm.reaction]);
  return { ...posed, lightAngle: mascotTimeOfDayLight(settings.lightAngle, vm.timeOfDay) };
}
