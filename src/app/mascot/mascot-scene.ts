/**
 * Builds the posed mascot as world-space vector shapes from the canonical settings.
 *
 * The settings map one to one onto the V2 scene (`mascot-v2-scene.ts`): the pose controls
 * keep their meaning (elbow and knee are the limb's bend, wrist and ankle its end), the
 * character's turn and the camera's orbit stay separate, and shading is re-lit from the
 * light angle. MascotVM's state (`mascot-view-model.ts`) is applied first: its key pose under
 * the sliders, its face for Auto eyes and mouth, its light and its gear.
 *
 * Preview SVG, raster export, SVG export and scene bounds all consume the same
 * `MascotScene`, so every output agrees exactly.
 */

import { MASCOT_BODY_PIVOT_REACH_PX, type MascotArmPose, type MascotLegPose, type MascotSettings } from "./mascot-settings";
import type { MascotScene } from "./mascot-scene-types";
import { MASCOT_V2_REST_POSE, type MascotV2LimbPose } from "./mascot-v2-pose";
import { buildMascotV2Scene, type MascotV2SceneInput } from "./mascot-v2-scene";
import { applyMascotViewModel, resolveMascotFace } from "./mascot-view-model";

export {
  MASCOT_GROUND_Y,
  type MascotClip,
  type MascotLayer,
  type MascotLayerId,
  type MascotPaint,
  type MascotRect,
  type MascotScene,
  type MascotShape,
} from "./mascot-scene-types";

function armPose(arm: MascotArmPose): MascotV2LimbPose {
  return {
    bandTilt: arm.bandTilt,
    bend: arm.elbow,
    end: arm.wrist,
    flipHand: arm.flipHand,
    hand: arm.hand,
    length: arm.length,
    moneyBag: arm.moneyBag,
    raise: arm.raise,
    straighten: arm.straighten,
    swing: arm.swing,
    twist: arm.twist,
  };
}

function legPose(leg: MascotLegPose): MascotV2LimbPose {
  return { ...MASCOT_V2_REST_POSE, bend: leg.knee, end: leg.ankle, length: leg.length, raise: leg.raise, swing: leg.swing };
}

/**
 * The V2 scene input for these settings. The Pivot pad's -1..1 becomes a screen offset in the
 * drawing's px from the default pivot (the bottom centre of the body).
 */
export function mascotSceneInput(settings: MascotSettings): MascotV2SceneInput {
  const { body, hair, view } = settings;
  return {
    body: {
      lean: body.lean,
      lift: body.lift,
      pivot: { x: body.pivot.x * MASCOT_BODY_PIVOT_REACH_PX, y: body.pivot.y * MASCOT_BODY_PIVOT_REACH_PX },
      softness: body.softness,
      squash: body.squash,
    },
    camera: { pitch: view.pitch, scale: view.scale, yaw: view.yaw },
    cast: settings.cast,
    drop: settings.drop,
    face: resolveMascotFace(settings),
    gear: settings.gear,
    ground: settings.ground,
    hair: { bandTilt: hair.bandTilt, bend: hair.bend, sweep: hair.sweep, wave: hair.wave, wavePhase: hair.wavePhase },
    lightAngle: settings.lightAngle,
    limbs: {
      armL: armPose(settings.armLeft),
      armR: armPose(settings.armRight),
      legL: legPose(settings.legLeft),
      legR: legPose(settings.legRight),
    },
    shading: settings.shading,
    turn: body.turn,
  };
}

/** The scene for these settings, with the view model's state, light and gear applied (`mascot-view-model.ts`). */
export function buildMascotScene(settings: MascotSettings): MascotScene {
  return buildMascotV2Scene(mascotSceneInput(applyMascotViewModel(settings)));
}
