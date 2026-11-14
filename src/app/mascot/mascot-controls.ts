import type { ToolcraftControlSchema } from "@/toolcraft/runtime";

import {
  eyesOptions,
  handOptions,
  mascotDefaults,
  mascotRanges,
  mascotTargets,
  mouthOptions,
  type MascotRange,
} from "./mascot-settings";
import { MASCOT_POSE_ACTIONS } from "./mascot-pose-presets";

type ControlsSection = {
  controls: Record<string, ToolcraftControlSchema>;
  description?: string;
  id: string;
  layoutGroups?: readonly {
    columns: 2;
    controls: readonly string[];
    layout: "inline";
  }[];
  title: string;
};

const always = { mode: "always" } as const;
const t = mascotTargets;

const POSE_REASON =
  "Rebuilds one fixed-size set of mascot vector paths; the shape count never changes.";
const SHADOW_REASON =
  "Changes one shadow layer's paths, paint or blur radius without adding shapes.";

function whenOn(target: string) {
  return { all: [{ equals: true, target }], mode: "conditional" } as const;
}

function slider(
  target: string,
  label: string,
  range: MascotRange,
  options: Readonly<{
    description?: string;
    editable?: boolean;
    applicability?: ToolcraftControlSchema["applicability"];
    orderRole?: "primary" | "strength" | "detail" | "spatial";
    reason?: string;
    unit?: string;
  }> = {},
): ToolcraftControlSchema {
  return {
    applicability: options.applicability ?? always,
    defaultValue: range.defaultValue,
    ...(options.description ? { description: options.description } : {}),
    ...(options.editable === false
      ? {}
      : { editableRange: { hardMax: range.hardMax, hardMin: range.hardMin } }),
    label,
    max: range.max,
    min: range.min,
    orderRole: options.orderRole ?? "strength",
    performanceReason: options.reason ?? POSE_REASON,
    performanceRole: "responsiveness",
    sliderValueKind: "continuous",
    step: range.step,
    target,
    type: "slider",
    ...(options.unit ? { unit: options.unit } : {}),
  };
}

function angle(target: string, label: string, range: MascotRange, description: string) {
  return slider(target, label, range, { description, unit: "°" });
}

export const backgroundSection: ControlsSection = {
  controls: {
    includeBackground: {
      applicability: always,
      defaultValue: mascotDefaults.includeBackground,
      description: "Hide the background in preview, PNG and SVG; video always keeps it.",
      label: "Background",
      orderRole: "mode",
      performanceReason: "Toggles the runtime background fill; mascot paths are unchanged.",
      performanceRole: "responsiveness",
      target: t.includeBackground,
      type: "switch",
    },
    background: {
      applicability: always,
      defaultValue: mascotDefaults.background,
      label: "Background color",
      orderRole: "color",
      performanceReason: "Updates one runtime background fill.",
      performanceRole: "responsiveness",
      target: t.background,
      type: "color",
    },
  },
  id: "background",
  title: "Background",
};

export const viewSection: ControlsSection = {
  controls: {
    orbit: {
      applicability: always,
      defaultValue: mascotDefaults.viewOrbit,
      description:
        "Walk the camera round the scene (front, 3/4, side, back) by dragging the gimbal or the mascot; the light, cast shadow and floor turn with the world. Dragging up or down tilts the view a little, up to 30°. To turn Clutchman himself under a fixed light, use Body Turn.",
      keyframeable: false,
      label: false,
      performanceReason: POSE_REASON,
      performanceRole: "responsiveness",
      target: t.viewOrbit,
      type: "orientationGizmo",
    },
    scale: slider(t.viewScale, "Scale", mascotRanges.viewScale, {
      description: "Mascot size relative to the Figma artwork, standing on the same floor line.",
      orderRole: "primary",
    }),
  },
  id: "view",
  title: "View",
};

export const bodySection: ControlsSection = {
  controls: {
    pose: {
      actions: [
        { label: "Stand", value: MASCOT_POSE_ACTIONS.stand },
        { label: "Walk", value: MASCOT_POSE_ACTIONS.walk },
        { label: "Cash jump", value: MASCOT_POSE_ACTIONS.cashJump },
      ],
      applicability: always,
      defaultValue: null,
      description:
        "Stand resets every joint, the hair, hands, money bags, lift and Turn. Walk turns Clutchman side-on (keeping his facing) at the walk's contact pose. Cash jump is the peak of the won jump: fists up holding money bags, legs splayed, off the ground. The camera, lean, squash and shading stay as they are.",
      label: "Pose",
      orderRole: "action",
      performanceReason: POSE_REASON,
      performanceRole: "responsiveness",
      target: t.posePreset,
      type: "actions",
    },
    turn: slider(t.bodyTurn, "Turn", mascotRanges.bodyTurn, {
      description:
        "Turns Clutchman in place under the fixed light: the shading slides across him and his cast shadow stays on the floor. Positive faces screen right; 90° is side-on, 180° the back. Keyframe it to animate a turn.",
      orderRole: "primary",
      unit: "°",
    }),
    lean: angle(t.bodyLean, "Lean", mascotRanges.bodyLean, "Tilts the body, face, hair and arms around the hips."),
    squash: slider(t.bodySquash, "Squash", mascotRanges.bodySquash, {
      description: "Negative squashes the body wider and shorter; positive stretches it taller.",
    }),
    lift: slider(t.bodyLift, "Lift", mascotRanges.bodyLift, {
      description: "Raises the whole mascot off the floor for jumps; the ground shadow shrinks and fades.",
      unit: "px",
    }),
    softness: slider(t.bodySoftness, "Joint softness", mascotRanges.bodySoftness, {
      description:
        "Spreads elbow and knee bends along the limb like a rubber hose; larger is softer. Bent limbs keep their length.",
      unit: "px",
    }),
  },
  id: "body",
  title: "Body",
};

/**
 * The body pivot pad. Toolcraft gives a pad its own block, so it is its own section, right
 * after Body, whose Lean and Squash it works with.
 */
export const bodyPivotSection: ControlsSection = {
  controls: {
    pivot: {
      applicability: always,
      defaultValue: mascotDefaults.bodyPivot,
      description:
        "Where Body Lean turns and Squash stretches the body, shown in the preview as a white dot with a blue centre (exports leave it out). It starts at the bottom centre of the body; the pad's edges reach the top of the head, the feet and a head's width to each side.",
      label: "Position",
      performanceReason: POSE_REASON,
      performanceRole: "responsiveness",
      target: t.bodyPivot,
      type: "vector",
    },
  },
  id: "body-pivot",
  title: "Body Pivot",
};

export const hairSection: ControlsSection = {
  controls: {
    bend: angle(t.hairBend, "Bend", mascotRanges.hairBend, "Curves the hair sideways from its base, more toward the tips; the base stays in the headband."),
    sweep: angle(t.hairSweep, "Sweep", mascotRanges.hairBend, "Curves the hair forward (positive) or back, like wind from the front; shows most from the side."),
    wave: slider(t.hairWave, "Wave", mascotRanges.hairWave, {
      description: "Ripples the hair; stronger toward the tips.",
      unit: "px",
    }),
    wavePhase: slider(t.hairWavePhase, "Wave phase", mascotRanges.hairWavePhase, {
      description: "Shifts the ripple along the hair. Keyframe it from 0° to 360° to make the hair flow.",
      editable: false,
      unit: "°",
    }),
    bandTilt: angle(t.headbandTilt, "Headband tilt", mascotRanges.headbandTilt, "Tilts the headband; the hair stays planted in it."),
  },
  id: "hair",
  title: "Hair & Headband",
};

export const faceSection: ControlsSection = {
  controls: {
    eyes: {
      applicability: always,
      defaultValue: mascotDefaults.faceEyes,
      description: "Eye set from the Figma face; turned views keep only the near eye.",
      label: "Eyes",
      options: eyesOptions,
      orderRole: "primary",
      performanceReason: POSE_REASON,
      performanceRole: "responsiveness",
      target: t.faceEyes,
      type: "select",
    },
    mouth: {
      applicability: always,
      defaultValue: mascotDefaults.faceMouth,
      description: "Mouth from the Figma face; the side view shows its front half.",
      label: "Mouth",
      options: mouthOptions,
      orderRole: "primary",
      performanceReason: POSE_REASON,
      performanceRole: "responsiveness",
      target: t.faceMouth,
      type: "select",
    },
  },
  id: "face",
  title: "Face",
};

type ArmTargets = Readonly<{
  bandTilt: string; elbow: string; flipHand: string; hand: string; length: string; moneyBag: string; raise: string;
  straighten: string; swing: string; twist: string; wrist: string;
}>;

function armSection(id: string, title: string, targets: ArmTargets): ControlsSection {
  return {
    controls: {
      raise: angle(targets.raise, "Raise", mascotRanges.armRaise, "Lifts the arm out to the side. 0° is the Figma rest pose."),
      swing: angle(targets.swing, "Swing", mascotRanges.armSwing, "Swings the arm forward (positive) or back."),
      twist: angle(targets.twist, "Twist", mascotRanges.twist, "Turns the arm on its own axis, which sets the way the elbow bends: 0° forward, 90° out to the side."),
      elbow: angle(targets.elbow, "Elbow", mascotRanges.elbow, "Bends the forearm at the elbow, in the direction set by Twist."),
      wrist: angle(targets.wrist, "Wrist", mascotRanges.wrist, "Rotates the hand at the wrist."),
      hand: {
        applicability: always,
        defaultValue: mascotDefaults.hand,
        description: "The hand drawn at the wrist: open, a fist or a thumbs-up, from the Figma hands.",
        label: "Hand",
        options: handOptions,
        orderRole: "mode",
        performanceReason: POSE_REASON,
        performanceRole: "responsiveness",
        target: targets.hand,
        type: "segmented",
      },
      moneyBag: {
        applicability: always,
        defaultValue: mascotDefaults.moneyBag,
        description: "Hangs a money bag from the hand, held by its neck and swung outward, as in the cash jump.",
        label: "Money bag",
        orderRole: "mode",
        performanceReason: POSE_REASON,
        performanceRole: "responsiveness",
        target: targets.moneyBag,
        type: "switch",
      },
      flipHand: {
        applicability: always,
        defaultValue: mascotDefaults.flipHand,
        description: "Mirrors the hand across the forearm, so the thumb is on the other side.",
        label: "Flip hand",
        orderRole: "mode",
        performanceReason: POSE_REASON,
        performanceRole: "responsiveness",
        target: targets.flipHand,
        type: "switch",
      },
      straighten: slider(targets.straighten, "Straighten", mascotRanges.straighten, {
        description: "Removes the arm's natural curve; 100% is a straight arm of the same length.",
        unit: "%",
      }),
      length: slider(targets.length, "Length", mascotRanges.limbLength, {
        description: "Lengthens or shortens the arm; the hand keeps its size, and a bent arm keeps this length.",
        unit: "%",
      }),
      bandTilt: angle(targets.bandTilt, "Armband tilt", mascotRanges.bandTilt, "Tilts the armband around the forearm; it always follows the arm."),
    },
    id,
    layoutGroups: [{ columns: 2, controls: ["moneyBag", "flipHand"], layout: "inline" }],
    title,
  };
}

type LegTargets = Readonly<{ ankle: string; knee: string; length: string; raise: string; swing: string }>;

function legSection(id: string, title: string, targets: LegTargets): ControlsSection {
  return {
    controls: {
      raise: angle(targets.raise, "Hip", mascotRanges.legRaise, "Swings the leg outward from the hip; the mascot stays grounded on its lowest foot."),
      swing: angle(targets.swing, "Swing", mascotRanges.legSwing, "Swings the leg forward (positive) or back."),
      knee: angle(targets.knee, "Knee", mascotRanges.knee, "Bends the shin back at the knee."),
      ankle: angle(targets.ankle, "Ankle", mascotRanges.ankle, "Tips the foot at the ankle; positive lifts the toe."),
      length: slider(targets.length, "Length", mascotRanges.limbLength, {
        description: "Lengthens or shortens the leg; the foot keeps its size and stays on the floor, and a bent leg keeps this length.",
        unit: "%",
      }),
    },
    id,
    title,
  };
}

const armTargets = (side: "Left" | "Right"): ArmTargets => ({
  bandTilt: t[`arm${side}BandTilt`],
  elbow: t[`arm${side}Elbow`],
  flipHand: t[`arm${side}FlipHand`],
  hand: t[`arm${side}Hand`],
  length: t[`arm${side}Length`],
  moneyBag: t[`arm${side}MoneyBag`],
  raise: t[`arm${side}Raise`],
  straighten: t[`arm${side}Straighten`],
  swing: t[`arm${side}Swing`],
  twist: t[`arm${side}Twist`],
  wrist: t[`arm${side}Wrist`],
});

const legTargets = (side: "Left" | "Right"): LegTargets => ({
  ankle: t[`leg${side}Ankle`],
  knee: t[`leg${side}Knee`],
  length: t[`leg${side}Length`],
  raise: t[`leg${side}Raise`],
  swing: t[`leg${side}Swing`],
});

export const armLeftSection = armSection("arm-left", "Left Arm", armTargets("Left"));
export const armRightSection = armSection("arm-right", "Right Arm", armTargets("Right"));
export const legLeftSection = legSection("leg-left", "Left Leg", legTargets("Left"));
export const legRightSection = legSection("leg-right", "Right Leg", legTargets("Right"));

export const lightSection: ControlsSection = {
  controls: {
    angle: slider(t.lightAngle, "Angle", mascotRanges.lightAngle, {
      description:
        "Where the light comes from: 0° right, 90° above, 180° left, 270° below; 160° is the Figma drawing's light. It belongs to the world, so it re-lights every part and throws the cast shadow; orbiting the view moves it with the world.",
      editable: false,
      orderRole: "primary",
      reason: SHADOW_REASON,
      unit: "°",
    }),
  },
  id: "light",
  title: "Light",
};

export const shadingSection: ControlsSection = {
  controls: {
    visible: {
      applicability: always,
      defaultValue: mascotDefaults.shadingVisible,
      description: "Re-lit shade on every part, on the side away from the light. Off leaves the flat Figma colours; the far limbs still go one step darker side-on.",
      label: "Visible",
      orderRole: "mode",
      performanceReason: SHADOW_REASON,
      performanceRole: "responsiveness",
      target: t.shadingVisible,
      type: "switch",
    },
    size: slider(t.shadingSize, "Size", mascotRanges.shadingSize, {
      applicability: whenOn(t.shadingVisible),
      description: "How far the shade reaches round each part; 1 is as drawn in Figma.",
      reason: SHADOW_REASON,
    }),
    highlight: {
      applicability: always,
      defaultValue: mascotDefaults.shadingHighlight,
      description: "The highlight strokes on the lit side of each part, placed for the light.",
      label: "Highlight",
      orderRole: "mode",
      performanceReason: SHADOW_REASON,
      performanceRole: "responsiveness",
      target: t.shadingHighlight,
      type: "switch",
    },
  },
  id: "body-shading",
  title: "Body Shading",
};

export const groundShadowSection: ControlsSection = {
  controls: {
    visible: {
      applicability: always,
      defaultValue: mascotDefaults.groundVisible,
      description: "Soft contact ellipse on the floor under the feet.",
      label: "Visible",
      orderRole: "mode",
      performanceReason: SHADOW_REASON,
      performanceRole: "responsiveness",
      target: t.groundVisible,
      type: "switch",
    },
    color: {
      applicability: whenOn(t.groundVisible),
      defaultValue: mascotDefaults.groundColor,
      label: "Color",
      orderRole: "color",
      performanceReason: SHADOW_REASON,
      performanceRole: "responsiveness",
      target: t.groundColor,
      type: "colorOpacity",
    },
    size: slider(t.groundSize, "Size", mascotRanges.groundSize, {
      applicability: whenOn(t.groundVisible),
      description: "Width relative to the stance; height follows at a fixed floor perspective.",
      reason: SHADOW_REASON,
    }),
    blur: slider(t.groundBlur, "Blur", mascotRanges.groundBlur, {
      applicability: whenOn(t.groundVisible),
      reason: SHADOW_REASON,
      unit: "px",
    }),
  },
  id: "ground-shadow",
  title: "Ground Shadow",
};

export const castShadowSection: ControlsSection = {
  controls: {
    visible: {
      applicability: always,
      defaultValue: mascotDefaults.castVisible,
      description: "The mascot silhouette projected onto the floor away from the light.",
      label: "Visible",
      orderRole: "mode",
      performanceReason: SHADOW_REASON,
      performanceRole: "responsiveness",
      target: t.castVisible,
      type: "switch",
    },
    color: {
      applicability: whenOn(t.castVisible),
      defaultValue: mascotDefaults.castColor,
      label: "Color",
      orderRole: "color",
      performanceReason: SHADOW_REASON,
      performanceRole: "responsiveness",
      target: t.castColor,
      type: "colorOpacity",
    },
    length: slider(t.castLength, "Length", mascotRanges.castLength, {
      applicability: whenOn(t.castVisible),
      description: "How far the shadow stretches across the floor; direction follows Light angle.",
      reason: SHADOW_REASON,
    }),
    blur: slider(t.castBlur, "Blur", mascotRanges.castBlur, {
      applicability: whenOn(t.castVisible),
      reason: SHADOW_REASON,
      unit: "px",
    }),
  },
  id: "cast-shadow",
  title: "Cast Shadow",
};

export const dropShadowSection: ControlsSection = {
  controls: {
    visible: {
      applicability: always,
      defaultValue: mascotDefaults.dropVisible,
      description: "Flat graphic silhouette behind the mascot, poster style.",
      label: "Visible",
      orderRole: "mode",
      performanceReason: SHADOW_REASON,
      performanceRole: "responsiveness",
      target: t.dropVisible,
      type: "switch",
    },
    color: {
      applicability: whenOn(t.dropVisible),
      defaultValue: mascotDefaults.dropColor,
      label: "Color",
      orderRole: "color",
      performanceReason: SHADOW_REASON,
      performanceRole: "responsiveness",
      target: t.dropColor,
      type: "colorOpacity",
    },
    offsetX: slider(t.dropOffsetX, "Offset X", mascotRanges.dropOffset, {
      applicability: whenOn(t.dropVisible),
      description: "Moves the silhouette right (positive) or left (negative).",
      orderRole: "spatial",
      reason: SHADOW_REASON,
      unit: "px",
    }),
    offsetY: slider(t.dropOffsetY, "Offset Y", mascotRanges.dropOffset, {
      applicability: whenOn(t.dropVisible),
      description: "Moves the silhouette down (positive) or up (negative).",
      orderRole: "spatial",
      reason: SHADOW_REASON,
      unit: "px",
    }),
    blur: slider(t.dropBlur, "Blur", mascotRanges.dropBlur, {
      applicability: whenOn(t.dropVisible),
      reason: SHADOW_REASON,
      unit: "px",
    }),
  },
  id: "drop-shadow",
  title: "Drop Shadow",
};

export const mascotControlSections: readonly ControlsSection[] = [
  backgroundSection,
  viewSection,
  bodySection,
  bodyPivotSection,
  hairSection,
  faceSection,
  armLeftSection,
  armRightSection,
  legLeftSection,
  legRightSection,
  lightSection,
  shadingSection,
  groundShadowSection,
  castShadowSection,
  dropShadowSection,
];
