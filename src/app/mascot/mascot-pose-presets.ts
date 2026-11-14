import type { ToolcraftPanelActionHandler } from "@/toolcraft/runtime/react";

import { mascotDefaults, mascotRanges, mascotTargets } from "./mascot-settings";
import { MASCOT_V2_CASH_JUMP, MASCOT_WALK_CONTACT } from "./mascot-v2-poses";
import type { MascotV2LimbPose } from "./mascot-v2-pose";

const t = mascotTargets;

/** Preset values: joint angles in degrees, percentages, the hand and prop, the face. */
type PoseValues = Record<string, number | string | boolean>;

const ARMS = ["Left", "Right"] as const;

/**
 * Everything a preset owns, at rest: joints, hair bend and sweep, limb length and
 * straighten, hands and money bags, lift and the character's turn. Lean, squash, softness,
 * the camera, light and shading are left alone.
 */
function restPose(): PoseValues {
  const values: PoseValues = {
    [t.bodyTurn]: mascotRanges.bodyTurn.defaultValue,
    [t.bodyLift]: mascotRanges.bodyLift.defaultValue,
    [t.hairBend]: mascotRanges.hairBend.defaultValue,
    [t.hairSweep]: mascotRanges.hairBend.defaultValue,
  };
  for (const side of ARMS) {
    values[t[`arm${side}Raise`]] = mascotRanges.armRaise.defaultValue;
    values[t[`arm${side}Swing`]] = mascotRanges.armSwing.defaultValue;
    values[t[`arm${side}Twist`]] = mascotRanges.twist.defaultValue;
    values[t[`arm${side}Elbow`]] = mascotRanges.elbow.defaultValue;
    values[t[`arm${side}Wrist`]] = mascotRanges.wrist.defaultValue;
    values[t[`arm${side}Straighten`]] = mascotRanges.straighten.defaultValue;
    values[t[`arm${side}Length`]] = mascotRanges.limbLength.defaultValue;
    values[t[`arm${side}Hand`]] = mascotDefaults.hand;
    values[t[`arm${side}MoneyBag`]] = mascotDefaults.moneyBag;
    values[t[`leg${side}Raise`]] = mascotRanges.legRaise.defaultValue;
    values[t[`leg${side}Swing`]] = mascotRanges.legSwing.defaultValue;
    values[t[`leg${side}Knee`]] = mascotRanges.knee.defaultValue;
    values[t[`leg${side}Ankle`]] = mascotRanges.ankle.defaultValue;
    values[t[`leg${side}Length`]] = mascotRanges.limbLength.defaultValue;
  }
  return values;
}

/** Stand: the rest pose, with Auto eyes and mouth so the face follows the view model (happy at rest). */
function standPose(): PoseValues {
  return { ...restPose(), [t.faceEyes]: mascotDefaults.faceEyes, [t.faceMouth]: mascotDefaults.faceMouth };
}

export { MASCOT_WALK_CONTACT };

/**
 * Walk turns Clutchman side-on, keeping the way he faces (Turn below 0 faces screen left),
 * at the contact pose. Side-on the near limbs are _L facing right and _R facing left.
 */
function walkPose(currentTurn: unknown): PoseValues {
  const facingLeft = typeof currentTurn === "number" && currentTurn < 0;
  const [near, far] = facingLeft ? (["Right", "Left"] as const) : (["Left", "Right"] as const);
  const w = MASCOT_WALK_CONTACT;
  return {
    ...restPose(),
    [t.bodyTurn]: facingLeft ? -90 : 90,
    [t[`arm${near}Swing`]]: w.nearArm,
    [t[`arm${far}Swing`]]: w.farArm,
    [t[`leg${near}Swing`]]: w.nearLeg,
    [t[`leg${far}Swing`]]: w.farLeg,
    [t[`leg${near}Raise`]]: w.legRaise,
    [t[`leg${far}Raise`]]: w.legRaise,
    [t.hairSweep]: w.hairSweep,
  };
}

function armValues(side: (typeof ARMS)[number], arm: MascotV2LimbPose): PoseValues {
  return {
    [t[`arm${side}Raise`]]: arm.raise,
    [t[`arm${side}Swing`]]: arm.swing,
    [t[`arm${side}Twist`]]: arm.twist,
    [t[`arm${side}Elbow`]]: arm.bend,
    [t[`arm${side}Wrist`]]: arm.end,
    [t[`arm${side}Straighten`]]: Math.round(arm.straighten * 100),
    [t[`arm${side}Length`]]: Math.round(arm.length * 100),
    [t[`arm${side}Hand`]]: arm.hand,
    [t[`arm${side}MoneyBag`]]: arm.moneyBag,
  };
}

function legValues(side: (typeof ARMS)[number], leg: MascotV2LimbPose): PoseValues {
  return {
    [t[`leg${side}Raise`]]: leg.raise,
    [t[`leg${side}Swing`]]: leg.swing,
    [t[`leg${side}Knee`]]: leg.bend,
    [t[`leg${side}Ankle`]]: leg.end,
    [t[`leg${side}Length`]]: Math.round(leg.length * 100),
  };
}

/** Cash jump: the peak of cash_jump (won), `MASCOT_V2_CASH_JUMP`, with the excited face (eyes_open + the open grin). */
function cashJumpPose(): PoseValues {
  const jump = MASCOT_V2_CASH_JUMP;
  return {
    ...restPose(),
    ...armValues("Left", jump.limbs.armL),
    ...armValues("Right", jump.limbs.armR),
    ...legValues("Left", jump.limbs.legL),
    ...legValues("Right", jump.limbs.legR),
    [t.bodyLean]: jump.body.lean,
    [t.bodyLift]: jump.body.lift,
    [t.bodySoftness]: jump.body.softness,
    [t.faceEyes]: jump.face.eyes,
    [t.faceMouth]: jump.face.mouth,
  };
}

export const MASCOT_POSE_ACTIONS = {
  cashJump: "pose-cash-jump",
  stand: "pose-stand",
  walk: "pose-walk",
} as const;

export const mascotPosePresets: Readonly<Record<string, (currentTurn: unknown) => PoseValues>> = {
  [MASCOT_POSE_ACTIONS.stand]: standPose,
  [MASCOT_POSE_ACTIONS.walk]: walkPose,
  [MASCOT_POSE_ACTIONS.cashJump]: cashJumpPose,
};

/** The unit a preset's numeric keyframe label carries: degrees unless the target says otherwise. */
function unitFor(target: string): string {
  if (target.endsWith(".length") || target.endsWith(".straighten")) return "%";
  if (target === t.bodyLift || target === t.bodySoftness) return "px";
  return "°";
}

/**
 * Applies a pose preset as one value edit. Targets that already carry keyframes also get
 * a keyframe at the playhead (or at that control's selected keyframe), matching what a
 * slider drag does, so the preset shows up in an animated timeline instead of being masked.
 */
export const onMascotPanelAction: ToolcraftPanelActionHandler = ({ action, dispatch, state }) => {
  const preset = mascotPosePresets[action.value];
  if (!preset) return;
  const values = preset(state.values[t.bodyTurn]);
  const label = action.label ?? action.value;
  dispatch({ label: `${label} pose`, type: "controls.apply", values });

  const { expanded, keyframeGroups, selectedKeyframeId } = state.timeline;
  if (!expanded) return;
  for (const group of keyframeGroups) {
    const value = values[group.controlId];
    if (typeof value !== "number") continue;
    let timeSeconds: number | undefined;
    for (const keyframe of group.keyframes) {
      if (keyframe.id === selectedKeyframeId) timeSeconds = keyframe.timeSeconds;
    }
    const controlLabel = group.keyframes[0]?.controlLabel ?? group.label;
    dispatch({
      controlId: group.controlId,
      controlLabel,
      timeSeconds,
      type: "timeline.upsertControlKeyframe",
      value,
      valueLabel: `${value}${unitFor(group.controlId)}`,
    });
  }
};
