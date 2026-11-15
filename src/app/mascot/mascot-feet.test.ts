import { describe, expect, it } from "vitest";

import { heelShade } from "./mascot-heel";
import { applyAffine, type Point } from "./mascot-path";
import { crescentShift, MASCOT_V2_DRAWN_LIGHT, MASCOT_V2_DRAWN_LIGHT_ANGLE, MASCOT_V2_RIM_RADII } from "./mascot-relight";
import { mascotTargets as t, readMascotSettings } from "./mascot-settings";
import { mascotSceneInput } from "./mascot-scene";
import { MASCOT_V2_REST_HAIR } from "./mascot-v2-hair";
import { MASCOT_V2_REST_POSE, poseV2Limb, type MascotV2LimbPose, type MascotV2PosedLimb } from "./mascot-v2-pose";
import { buildMascotV2Scene, type MascotV2SceneInput } from "./mascot-v2-scene";

const REST: MascotV2SceneInput = {
  body: { lean: 0, lift: 0, pivot: { x: 0, y: 0 }, softness: 18, squash: 0 },
  camera: { pitch: 0, scale: 1, yaw: 0 },
  cast: { blur: 4, color: { hex: "#031E19", opacity: 18 }, length: 0.6, visible: true },
  drop: { blur: 0, color: { hex: "#C94631", opacity: 100 }, offset: { x: 0.15, y: 0.15 }, visible: false },
  face: { eyes: "open", mouth: "happy" },
  ground: { blur: 6, color: { hex: "#031E19", opacity: 16 }, size: 1, visible: true },
  hair: { ...MASCOT_V2_REST_HAIR, bandTilt: 0 },
  lightAngle: MASCOT_V2_DRAWN_LIGHT_ANGLE,
  limbs: { armL: MASCOT_V2_REST_POSE, armR: MASCOT_V2_REST_POSE, legL: MASCOT_V2_REST_POSE, legR: MASCOT_V2_REST_POSE },
  turn: 0,
};
const shapeIds = (input: MascotV2SceneInput) => buildMascotV2Scene(input).layers.find((layer) => layer.id === "mascot")!.shapes.map((shape) => shape.id);
const leg = (side: "L" | "R", pose: Partial<MascotV2LimbPose>, yaw = 0): MascotV2PosedLimb =>
  poseV2Limb({ camera: { pitch: 0, yaw }, kind: "leg", pose: { ...MASCOT_V2_REST_POSE, ...pose }, side, softness: 18 });
const foot = (posed: MascotV2PosedLimb) => {
  const inFront = posed.front.find((piece) => piece.id.endsWith("-foot"));
  const piece = inFront ?? posed.behind.find((p) => p.id.endsWith("-foot"))!;
  // The foot's toe as a signed share of its drawn length along the screen (the piece's x scale).
  const origin = applyAffine(piece.transform, { x: 0, y: 0 }), along = applyAffine(piece.transform, { x: 1, y: 0 });
  return { behind: !inFront, length: Math.hypot(along.x - origin.x, along.y - origin.y), transform: piece.transform };
};

describe("the foot joined to its leg at the heel", () => {
  it("shades the foot along its sole but gives its heel no crescent of its own", () => {
    const towardToe = { x: -1, y: 0 }; // the left foot, at the drawn light from the upper left
    const free = crescentShift(MASCOT_V2_DRAWN_LIGHT, towardToe, MASCOT_V2_RIM_RADII.foot);
    const joined = crescentShift(MASCOT_V2_DRAWN_LIGHT, towardToe, MASCOT_V2_RIM_RADII.foot, 1, true);
    // Free, the lit copy slides toward the toe and bares the heel; joined, it only lifts off the sole.
    expect(free.x).toBeLessThan(-0.5);
    expect(joined.x).toBeCloseTo(0, 9);
    expect(joined.y).toBeCloseTo(free.y, 9);
    // A toe-end crescent (light from the heel's side) is kept: that end is free.
    const fromHeel = crescentShift(MASCOT_V2_DRAWN_LIGHT, { x: 1, y: 0 }, MASCOT_V2_RIM_RADII.foot, 1, true);
    expect(fromHeel).toEqual(crescentShift(MASCOT_V2_DRAWN_LIGHT, { x: 1, y: 0 }, MASCOT_V2_RIM_RADII.foot));
  });

  it("carries the leg's shade band down round the heel on the band's side, and leaves it under the foot on the toe's", () => {
    // The drawn light is from the left: both bands are on the legs' right, the left foot's heel side.
    const drawn = shapeIds(REST);
    expect(drawn).toContain("leg-L-foot-heel-under-0");
    expect(drawn.some((id) => id.startsWith("leg-L-foot-heel-shade-"))).toBe(true);
    expect(drawn.some((id) => /^leg-R-foot-heel-(under|shade)-/.test(id))).toBe(false);
    // With the light from the right the bands swap sides, and so does the heel shade.
    const mirrored = shapeIds({ ...REST, lightAngle: 180 - MASCOT_V2_DRAWN_LIGHT_ANGLE });
    expect(mirrored).toContain("leg-R-foot-heel-under-0");
    expect(mirrored.some((id) => /^leg-L-foot-heel-(under|shade)-/.test(id))).toBe(false);
  });

  it("keeps the heel's rounded end lit down to the sole's strip, however foreshortened", () => {
    const ankle = { x: 0, y: 0 }, axis = { x: -0.45, y: 0 }, lift = { x: 0, y: 1 };
    // A capsule foot 12 thick pointing left from just behind its heel, squashed to 45% along.
    const footPoints: Point[] = [
      { x: 2.7, y: -6 }, { x: 2.7, y: 6 }, { x: -24, y: 6 }, { x: -24, y: -6 },
    ];
    const knee = { x: 0, y: -100 };
    const shade = heelShade({ ankle, axis, bands: [], foot: footPoints, knee, leg: [[knee, ankle], [knee, ankle]], lift, shift: { x: 0, y: -1.5 } });
    const lit = shade.lit[0]!;
    // It reaches from past the heel to where the squashed cap starts (6 × 0.45 in from the heel)...
    expect(Math.max(...lit.map((p) => p.x))).toBeGreaterThan(2.7);
    expect(Math.min(...lit.map((p) => p.x))).toBeCloseTo(2.7 - 6 * 0.45, 9);
    // ...and stops 1.5 above the sole, leaving its strip of shade.
    expect(Math.max(...lit.map((p) => p.y))).toBeCloseTo(6 - 1.5, 9);
  });
});

describe("Foot direction", () => {
  it("reads both legs' Foot direction and turns each leg by it", () => {
    const input = mascotSceneInput(readMascotSettings({ [t.legLeftTurn]: 30, [t.legRightTurn]: -20 }));
    expect(input.limbs.legL.twist).toBe(30);
    expect(input.limbs.legR.twist).toBe(-20);
    expect(mascotSceneInput(readMascotSettings({})).limbs.legL.twist).toBe(0);
  });

  it("turns the foot from its drawn direction: toward the viewer and across toe-in, behind the leg toe-out", () => {
    const drawn = foot(leg("L", {}));
    // In front the left foot is drawn pointing out to the left, full length.
    expect(drawn.behind).toBe(false);
    const quarterIn = foot(leg("L", { twist: -45 }));
    expect(quarterIn.length / drawn.length).toBeCloseTo(Math.cos(Math.PI / 4), 6);
    expect(quarterIn.behind).toBe(false);
    // Turned in past the viewer, the toe points across, to the right (the drawn foot flipped).
    const pigeon = foot(leg("L", { twist: -130 }));
    expect(Math.sign(pigeon.transform.a)).toBe(-Math.sign(drawn.transform.a));
    // Turned out past side-on, the toe points away from the viewer: the foot goes behind the leg.
    expect(foot(leg("L", { twist: 45 })).behind).toBe(true);
    // The right leg mirrors it.
    expect(foot(leg("R", { twist: 45 })).behind).toBe(true);
    expect(foot(leg("R", { twist: -45 })).behind).toBe(false);
  });

  it("bends the knee with the foot", () => {
    const bent = { bend: 60, swing: 30 };
    const straightOn = leg("L", bent), turnedIn = leg("L", { ...bent, twist: -90 });
    // Unturned the shin folds straight back (away from the viewer), so the ankle stays under the knee;
    // turned 90°, it folds to the side.
    const sideways = (posed: MascotV2PosedLimb) => Math.abs(posed.joints.end.x - posed.joints.mid.x);
    expect(sideways(turnedIn)).toBeGreaterThan(sideways(straightOn) + 20);
    // A straight leg just turns: its bones stay put.
    expect(leg("L", { twist: -90 }).joints).toEqual(leg("L", {}).joints);
  });
});
