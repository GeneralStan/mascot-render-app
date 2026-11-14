import { describe, expect, it } from "vitest";

import { applyAffine, type Point } from "./mascot-path";
import { flattenOutline } from "./mascot-tube";
import { MASCOT_V2_CASH_JUMP } from "./mascot-v2-poses";
import { poseV2Limb } from "./mascot-v2-pose";

/**
 * Landmarks read off `clutch-mascot/refs/holding_cash.png`, in rig px: the image is scaled so
 * the body is as wide as the V2 head (2.96 image px per rig px) and its bottom centre lands on
 * the V2 head's (x 0, y −180.3). The screen-left arm's centreline, shoulder to wrist, and fist.
 */
const REFERENCE_ARM: readonly Point[] = [
  [-84.3, -296.9], [-103.9, -310.4], [-119.9, -323.9], [-133.5, -337.4], [-145.7, -350.9], [-156.5, -364.4], [-166.3, -377.9], [-173.9, -391.4],
].map(([x, y]) => ({ x: x!, y: y! }));
const REFERENCE_FIST: Point = { x: -191.7, y: -406.6 };
const REFERENCE_LEG_ANGLE = 38.5;

const pose = MASCOT_V2_CASH_JUMP;
const posed = (kind: "arm" | "leg", side: "L" | "R") =>
  poseV2Limb({ camera: { pitch: 0, yaw: 0 }, kind, pose: pose.limbs[`${kind}${side}`], side, softness: pose.body.softness });
const handCentre = (limb: ReturnType<typeof poseV2Limb>): Point => {
  const hand = limb.front.find((piece) => piece.id.endsWith("-hand"))!;
  const points = hand.layers.filter((l) => l.role === "base").flatMap((l) => l.shapes.flatMap((s) => flattenOutline(s.d, 1).points)).map((p) => applyAffine(hand.transform, p));
  return { x: (Math.min(...points.map((p) => p.x)) + Math.max(...points.map((p) => p.x))) / 2, y: (Math.min(...points.map((p) => p.y)) + Math.max(...points.map((p) => p.y))) / 2 };
};

describe("V2 named poses", () => {
  it("matches the cash jump in refs/holding_cash.png: arm curve, fists, splayed legs", () => {
    const arm = posed("arm", "L");
    for (const p of REFERENCE_ARM) {
      const off = Math.min(...arm.midline.map((q) => Math.hypot(q.x - p.x, q.y - p.y)));
      // Read by hand off the picture, so allow a few px.
      expect(off, `${p.x},${p.y}`).toBeLessThan(5);
    }
    const fist = handCentre(arm);
    expect(Math.hypot(fist.x - REFERENCE_FIST.x, fist.y - REFERENCE_FIST.y)).toBeLessThan(4);
    // The two sides mirror each other, within the small difference between the two drawn arms.
    const right = handCentre(posed("arm", "R"));
    expect(Math.hypot(right.x + fist.x, right.y - fist.y)).toBeLessThan(2);
    for (const side of ["L", "R"] as const) {
      const leg = posed("leg", side);
      const angle = (Math.atan2(Math.abs(leg.joints.end.x - leg.joints.root.x), leg.joints.end.y - leg.joints.root.y) * 180) / Math.PI;
      expect(Math.abs(angle - REFERENCE_LEG_ANGLE), `${side} ${angle.toFixed(1)}`).toBeLessThan(1.5);
    }
    expect(pose.face).toEqual({ eyes: "open", mouth: "excited" });
    expect(pose.limbs.armL.moneyBag && pose.limbs.armR.moneyBag).toBe(true);
  });
});
