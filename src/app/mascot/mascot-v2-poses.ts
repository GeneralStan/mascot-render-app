/**
 * Named V2 poses, ready for the pose presets (Task 8).
 *
 * Cash jump is the peak of cash_jump (won), fitted to `clutch-mascot/refs/holding_cash.png`:
 * - Arms up and out in one smooth rubber-hose curve: about 35° above level at the shoulder,
 *   steepening to about 60° at the wrist, with no elbow corner (Softness 40 spreads the
 *   bend along the arm). The reference's arms reach further than the V2 drawing's, so they
 *   stretch to 1.25. Fitted within 2 px of the reference's arm.
 * - Fists high, each closed round a money bag's neck, the tie poking out above and the bag
 *   swung outward.
 * - Legs straight and splayed about 38.5° from upright (hip to ankle), feet square to the shins.
 * - Excited face (eyes_open + the open grin), off the ground.
 *
 * Walk contact is the walk's first contact pose, from Figma's Walking drawing (V1 frame 82:7560):
 * near leg and far arm forward, far leg and near arm back. The hair leans forward a little.
 */

import { MASCOT_V2_REST_POSE, type MascotV2LimbPose } from "./mascot-v2-pose";
import type { MascotEyes, MascotMouth } from "./mascot-settings";

export type MascotV2NamedPose = Readonly<{
  body: Readonly<{ lean: number; lift: number; softness: number }>;
  face: Readonly<{ eyes: MascotEyes; mouth: MascotMouth }>;
  limbs: Readonly<{ armL: MascotV2LimbPose; armR: MascotV2LimbPose; legL: MascotV2LimbPose; legR: MascotV2LimbPose }>;
}>;

const cashArm: MascotV2LimbPose = { ...MASCOT_V2_REST_POSE, bend: 27, hand: "fist", length: 1.25, moneyBag: true, raise: 112, straighten: 0.5, twist: 90 };
const cashLeg: MascotV2LimbPose = { ...MASCOT_V2_REST_POSE, end: -8, raise: 34 };

export const MASCOT_V2_CASH_JUMP: MascotV2NamedPose = {
  body: { lean: 0, lift: 40, softness: 40 },
  face: { eyes: "open", mouth: "excited" },
  limbs: { armL: cashArm, armR: cashArm, legL: cashLeg, legR: cashLeg },
};

/** The walk's contact pose, as swings in degrees for the near and far limbs (side-on). */
export const MASCOT_WALK_CONTACT = { farArm: 30, farLeg: -31, hairSweep: 4, nearArm: -36, nearLeg: 20 } as const;
