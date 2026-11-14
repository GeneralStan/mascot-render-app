import { describe, expect, it } from "vitest";

import { applyAffine, type Point } from "./mascot-path";
import { flattenOutline } from "./mascot-tube";
import { MASCOT_V2_REST_HAIR, poseV2Strands, strandOrder } from "./mascot-v2-hair";
import { mascotV2Props, mascotV2Views } from "./mascot-v2-parts";
import {
  bagNeck,
  MASCOT_V2_BAG_SCALE,
  MASCOT_V2_REST_POSE,
  poseV2Limb,
  type MascotV2LimbInput,
  type MascotV2LimbPose,
  type MascotV2PosedLimb,
} from "./mascot-v2-pose";
import { projectedJointsAt } from "./mascot-v2-rig";

/** The drawn angles: front, 3/4, side, back, and the 3/4 and side mirrored. */
const DRAWN_YAWS = [0, 30, 90, 180, -30, -90] as const;
const gap = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const pose = (overrides: Partial<MascotV2LimbPose> = {}): MascotV2LimbPose => ({ ...MASCOT_V2_REST_POSE, ...overrides });
const limb = (overrides: Partial<MascotV2LimbInput> & Pick<MascotV2LimbInput, "kind" | "side">): MascotV2PosedLimb =>
  poseV2Limb({ camera: { pitch: 0, yaw: 0 }, pose: MASCOT_V2_REST_POSE, softness: 18, ...overrides });
const pathLength = (line: readonly Point[]) => line.slice(1).reduce((sum, p, i) => sum + gap(p, line[i]!), 0);

/** True when any two non-neighbouring edges of the closed polygon cross. */
function selfIntersects(polygon: readonly Point[]): boolean {
  const n = polygon.length;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  for (let i = 0; i < n; i += 1) {
    const a = polygon[i]!, b = polygon[(i + 1) % n]!;
    for (let j = i + 2; j < n; j += 1) {
      if (i === 0 && j === n - 1) continue;
      const c = polygon[j]!, d = polygon[(j + 1) % n]!;
      const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
      if (((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))) return true;
    }
  }
  return false;
}
const polygonOf = (posed: MascotV2PosedLimb) => flattenOutline(posed.fill, 2).points;

describe("V2 limb posing", () => {
  it.each(DRAWN_YAWS)("at %s° the rest pose reproduces that drawing exactly (right arm refitted to the left arm's joints)", (yaw) => {
    for (const kind of ["arm", "leg"] as const) {
      for (const side of ["L", "R"] as const) {
        const posed = limb({ camera: { pitch: 0, yaw }, kind, side });
        const moved = Math.max(...posed.midline.map((p, i) => gap(p, posed.tube.midline[i]!)));
        if (kind === "arm" && side === "R" && yaw === 0) {
          const left = mascotV2Views.front.pivots.Wrist_L!;
          expect(gap(posed.joints.end, { x: -left.x, y: left.y })).toBeLessThan(1e-6);
          expect(moved).toBeLessThan(12);
        } else {
          expect(moved, `${yaw} ${kind} ${side}`).toBeLessThan(1e-6);
        }
      }
    }
  });

  it("side-on, the far arm and leg reuse the near drawing and sit exactly behind it", () => {
    for (const [yaw, near, far] of [[90, "L", "R"], [-90, "R", "L"]] as const) {
      for (const kind of ["arm", "leg"] as const) {
        const n = limb({ camera: { pitch: 0, yaw }, kind, side: near }), f = limb({ camera: { pitch: 0, yaw }, kind, side: far });
        expect(Math.max(...f.midline.map((p, i) => gap(p, n.midline[i]!))), `${yaw} ${kind}`).toBeLessThan(1e-6);
        expect(f.depth, `${yaw} ${kind}`).toBeLessThan(n.depth);
      }
    }
  });

  it("turns smoothly all the way round, blending between the drawings", () => {
    for (const kind of ["arm", "leg"] as const) {
      for (const side of ["L", "R"] as const) {
        let previous = limb({ camera: { pitch: 0, yaw: -180 }, kind, side }).midline;
        let worst = 0;
        for (let yaw = -179; yaw <= 180; yaw += 1) {
          const midline = limb({ camera: { pitch: 0, yaw }, kind, side }).midline;
          worst = Math.max(worst, ...midline.map((p, i) => gap(p, previous[i]!)));
          previous = midline;
        }
        expect(worst, `${kind} ${side}`).toBeLessThan(8);
      }
    }
  }, 30_000);

  it("keeps each bone's length when a limb is raised in the picture plane", () => {
    for (const raise of [30, 90, 150]) {
      const rest = limb({ kind: "arm", side: "L" });
      const posed = limb({ kind: "arm", pose: pose({ raise }), side: "L" });
      expect(gap(posed.joints.root, posed.joints.mid)).toBeCloseTo(gap(rest.joints.root, rest.joints.mid), 6);
      expect(gap(posed.joints.mid, posed.joints.end)).toBeCloseTo(gap(rest.joints.mid, rest.joints.end), 6);
      expect(Math.abs(pathLength(posed.midline) / pathLength(rest.midline) - 1), `raise ${raise}`).toBeLessThan(0.03);
    }
  });

  // Bends in the picture plane: elbows with twist 90 from the front, knees (which bend front to back) from the side.
  // Past about 125° the forearm or shin genuinely lies on the upper bone, so overlap is expected there.
  it("rounds elbows and knees without folding the inner edge, up to a 120° bend", () => {
    for (const softness of [0, 18, 48]) {
      for (const bend of [30, 45, 90, 120]) {
        expect(selfIntersects(polygonOf(limb({ kind: "arm", pose: pose({ bend, twist: 90 }), side: "L", softness }))), `arm bend ${bend} soft ${softness}`).toBe(false);
        for (const side of ["L", "R"] as const) {
          const leg = limb({ camera: { pitch: 0, yaw: 90 }, kind: "leg", pose: pose({ bend, swing: 40 }), side, softness });
          expect(selfIntersects(polygonOf(leg)), `leg ${side} bend ${bend} soft ${softness}`).toBe(false);
        }
      }
    }
  });

  it("shows a bone pointing at the camera as a short stub instead of collapsing it", () => {
    const posed = limb({ kind: "leg", pose: pose({ bend: 90, raise: 30 }), side: "R" });
    const shin = Math.hypot(posed.joints.end.x - posed.joints.mid.x, posed.joints.end.y - posed.joints.mid.y);
    const width = 2 * Math.max(...posed.tube.edges[0].map((o, i) => Math.hypot(o.along - posed.tube.edges[1][i]!.along, o.across - posed.tube.edges[1][i]!.across))) / 2;
    // Known limit: a stub this short overlaps its own rounded end and knee, so the outline may cross there.
    expect(shin).toBeGreaterThanOrEqual(width - 1e-9);
  });

  it.each(DRAWN_YAWS)("at %s° the feet stand on the floor at rest", (yaw) => {
    for (const side of ["L", "R"] as const) {
      const posed = limb({ camera: { pitch: 0, yaw }, kind: "leg", side });
      const foot = posed.front[0]!;
      const points = foot.layers.filter((l) => l.role === "base").flatMap((l) => l.shapes.flatMap((s) => flattenOutline(s.d, 1).points));
      expect(Math.abs(Math.max(...points.map((p) => applyAffine(foot.transform, p).y))), `${yaw} ${side}`).toBeLessThan(0.5);
    }
  });

  it("attaches every hand at the posed wrist, in any pose", () => {
    const poses = [pose(), pose({ bend: 70, raise: 120, twist: 40 }), pose({ end: 35, flipHand: true, swing: 60 })];
    for (const base of poses) {
      for (const side of ["L", "R"] as const) {
        for (const hand of ["fist", "thumbsUp"] as const) {
          const posed = limb({ kind: "arm", pose: { ...base, hand }, side });
          const wrist = mascotV2Props[hand === "fist" ? "handFist" : "handThumbsUp"].pivots!.Wrist!;
          expect(gap(applyAffine(posed.front[0]!.transform, wrist), posed.joints.end), `${side} ${hand}`).toBeLessThan(1e-6);
        }
        const open = limb({ kind: "arm", pose: base, side });
        const drawnWrist = mascotV2Views.front.pivots[side === "L" ? "Wrist_L" : "Wrist_R"]!;
        if (side === "L") expect(gap(applyAffine(open.front[0]!.transform, drawnWrist), open.joints.end)).toBeLessThan(1e-6);
        expect(open.front.map((piece) => piece.id)).toEqual([`arm-${side}-hand`, `arm-${side}-armband`]);
      }
    }
  });

  it("keeps the armband on the forearm and the money bag in the hand", () => {
    const posed = limb({ kind: "arm", pose: pose({ bend: 80, hand: "fist", moneyBag: true, raise: 140 }), side: "R" });
    const band = posed.front[1]!;
    const bandPoints = band.layers.filter((l) => l.role === "base").flatMap((l) => l.shapes.flatMap((s) => flattenOutline(s.d, 1).points));
    const centre = bandPoints.map((p) => applyAffine(band.transform, p)).reduce((s, p) => ({ x: s.x + p.x / bandPoints.length, y: s.y + p.y / bandPoints.length }), { x: 0, y: 0 });
    expect(Math.min(...posed.midline.map((p) => gap(p, centre)))).toBeLessThan(4);

    expect(posed.behind.map((piece) => piece.id)).toEqual(["arm-R-money-bag"]);
    const bag = posed.behind[0]!;
    const bagPoints = flattenOutline(bag.layers[0]!.shapes[0]!.d, 1).points.map((p) => applyAffine(bag.transform, p));
    const width = Math.max(...bagPoints.map((p) => p.x)) - Math.min(...bagPoints.map((p) => p.x));
    const drawnWidth = (() => {
      const xs = flattenOutline(mascotV2Props.moneyBag.layers[0]!.shapes[0]!.d, 1).points.map((p) => p.x);
      return Math.max(...xs) - Math.min(...xs);
    })();
    // Tilted while hanging, so its on-screen width differs a little from the drawing's.
    expect(width).toBeGreaterThan(drawnWidth * MASCOT_V2_BAG_SCALE * 0.8);
    expect(width).toBeLessThan(drawnWidth * MASCOT_V2_BAG_SCALE * 1.3);
    expect(Math.min(...bagPoints.map((p) => gap(p, posed.joints.end)))).toBeLessThan(25);
  });

  it("closes the fist round the bag's neck: the tie shows above it and the bag hangs swung outward", () => {
    for (const side of ["L", "R"] as const) {
      const posed = limb({ kind: "arm", pose: pose({ bend: 27, hand: "fist", length: 1.25, moneyBag: true, raise: 112, straighten: 0.5, twist: 90 }), side });
      const hand = posed.front.find((piece) => piece.id.endsWith("-hand"))!;
      const handPoints = hand.layers.filter((l) => l.role === "base").flatMap((l) => l.shapes.flatMap((s) => flattenOutline(s.d, 1).points)).map((p) => applyAffine(hand.transform, p));
      const grip = { x: (Math.min(...handPoints.map((p) => p.x)) + Math.max(...handPoints.map((p) => p.x))) / 2, y: (Math.min(...handPoints.map((p) => p.y)) + Math.max(...handPoints.map((p) => p.y))) / 2 };
      const bag = posed.behind[0]!;
      expect(gap(applyAffine(bag.transform, bagNeck()), grip), side).toBeLessThan(1.5);
      const outline = flattenOutline(mascotV2Props.moneyBag.layers[0]!.shapes[0]!.d, 1).points;
      const placed = outline.map((p) => applyAffine(bag.transform, p));
      // The tie pokes out above the fist; the bag's body hangs below it.
      expect(Math.min(...placed.map((p) => p.y)), side).toBeLessThan(Math.min(...handPoints.map((p) => p.y)));
      const body = { x: placed.reduce((sum, p) => sum + p.x, 0) / placed.length, y: placed.reduce((sum, p) => sum + p.y, 0) / placed.length };
      expect(body.y, side).toBeGreaterThan(grip.y);
      // Swung outward by about 25°: left of the left fist, right of the right one.
      const tilt = (Math.atan2(body.x - grip.x, body.y - grip.y) * 180) / Math.PI;
      expect(Math.abs(Math.abs(tilt) - 25), `${side} ${tilt.toFixed(1)}`).toBeLessThan(6);
      expect(Math.sign(tilt), side).toBe(side === "L" ? -1 : 1);
    }
  });

  it("spreads a gentle bend along the limb like a rubber hose, by the softness", () => {
    const sharpest = (softness: number) => {
      const line = limb({ kind: "arm", pose: pose({ bend: 15, straighten: 1, twist: 90 }), side: "L", softness }).midline;
      let most = 0;
      for (let i = 2; i < line.length - 2; i++) {
        const a = { x: line[i]!.x - line[i - 2]!.x, y: line[i]!.y - line[i - 2]!.y }, b = { x: line[i + 2]!.x - line[i]!.x, y: line[i + 2]!.y - line[i]!.y };
        const turn = Math.abs(Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y)) / Math.max(1e-6, Math.hypot(a.x, a.y) + Math.hypot(b.x, b.y));
        most = Math.max(most, turn);
      }
      return most;
    };
    // The same 15° bend: the softer the limb, the gentler its tightest curve.
    expect(sharpest(40)).toBeLessThan(sharpest(18));
    expect(sharpest(18)).toBeLessThan(sharpest(4));
    // At Softness 40 a 15° bend never turns faster than 15° over 40 px.
    expect(sharpest(40) * 180 / Math.PI).toBeLessThan(15 / 40);
  });

  it("keeps a limb's length when it bends, like a rubber hose, so bent arms stay in proportion with the legs", () => {
    for (const softness of [0, 18, 40]) {
      for (const bend of [30, 60, 90, 120]) {
        // Elbows bent out to the side from the front, knees from the side: both in the picture plane.
        const arm = limb({ kind: "arm", pose: pose({ bend, twist: 90 }), side: "L", softness });
        const leg = limb({ camera: { pitch: 0, yaw: 90 }, kind: "leg", pose: pose({ bend, swing: 40 }), side: "L", softness });
        expect(Math.abs(pathLength(arm.midline) / pathLength(arm.tube.midline) - 1), `arm ${bend} soft ${softness}`).toBeLessThan(0.025);
        expect(Math.abs(pathLength(leg.midline) / pathLength(leg.tube.midline) - 1), `leg ${bend} soft ${softness}`).toBeLessThan(0.025);
      }
    }
    // A bend starting from rest moves the hand smoothly: no jump as the rounding begins.
    let previous = limb({ kind: "arm", side: "L" });
    for (let bend = 0.5; bend <= 20; bend += 0.5) {
      const posed = limb({ kind: "arm", pose: pose({ bend, twist: 90 }), side: "L" });
      expect(gap(posed.joints.end, previous.joints.end), `bend ${bend}`).toBeLessThan(1);
      expect(Math.max(...posed.midline.map((p, i) => gap(p, previous.midline[i]!))), `bend ${bend}`).toBeLessThan(1);
      previous = posed;
    }
  });

  it("leaves the shoulder and hip ends open so limbs look attached", () => {
    for (const yaw of [0, 30, 90]) {
      const posed = limb({ camera: { pitch: 0, yaw }, kind: "arm", side: "L" });
      expect(posed.stroke.endsWith("Z")).toBe(false);
      expect(posed.fill.endsWith("Z")).toBe(true);
      expect(posed.tube.ends.root).toBe("flat");
    }
  });

  it("carries the arms with the body's lean", () => {
    const shift = { x: 6, y: -4 };
    const posed = limb({ body: { lean: 0.2, map: (p) => ({ x: p.x + shift.x, y: p.y + shift.y }) }, kind: "arm", side: "L" });
    const rest = limb({ kind: "arm", side: "L" });
    expect(gap(posed.joints.root, { x: rest.joints.root.x + shift.x, y: rest.joints.root.y + shift.y })).toBeLessThan(1e-9);
    expect(gap(posed.joints.end, rest.joints.end)).toBeGreaterThan(5);
  });
});

describe("V2 hair posing", () => {
  it.each(DRAWN_YAWS)("at %s° the strands rest exactly as drawn, in the drawn order", (yaw) => {
    const posed = poseV2Strands({ pitch: 0, yaw }, MASCOT_V2_REST_HAIR);
    expect(posed.map((strand) => strand.id)).toEqual(strandOrder(yaw));
    const base = projectedJointsAt(yaw).Hair_base;
    for (const strand of posed) {
      const moved = Math.max(...strand.midline.map((p, i) => gap(p, { x: strand.tube.midline[i]!.x + base.x - strand.base.x, y: strand.tube.midline[i]!.y + base.y - strand.base.y })));
      expect(moved, strand.id).toBeLessThan(1e-9);
    }
  });

  it("never folds a strand, bent, rippled or seen from the side", () => {
    const cases: ReadonlyArray<readonly [number, { bend: number; sweep: number; wave: number; wavePhase: number }]> = [
      [0, { bend: 35, sweep: 0, wave: 10, wavePhase: 90 }],
      [0, { bend: -60, sweep: 0, wave: 30, wavePhase: 200 }],
      [90, MASCOT_V2_REST_HAIR],
      [-90, MASCOT_V2_REST_HAIR],
      [60, { bend: 20, sweep: 40, wave: 15, wavePhase: 45 }],
      [135, { bend: 30, sweep: -30, wave: 20, wavePhase: 10 }],
    ];
    for (const [yaw, hair] of cases) {
      for (const strand of poseV2Strands({ pitch: 0, yaw }, hair)) {
        expect(selfIntersects(flattenOutline(strand.fill, 1).points), `yaw ${yaw} ${strand.id} ${JSON.stringify(hair)}`).toBe(false);
      }
    }
  });

  it("bends and ripples the tips while the roots stay planted", () => {
    const rest = poseV2Strands({ pitch: 0, yaw: 0 }, MASCOT_V2_REST_HAIR);
    const bent = poseV2Strands({ pitch: 0, yaw: 0 }, { bend: 40, sweep: 0, wave: 12, wavePhase: 90 });
    const tipMoves: number[] = [];
    for (let i = 0; i < rest.length; i += 1) {
      const a = rest[i]!.midline, b = bent[i]!.midline;
      expect(gap(a[0]!, b[0]!), rest[i]!.id).toBeLessThan(3);
      tipMoves.push(gap(a[a.length - 1]!, b[b.length - 1]!));
    }
    // Low strands sit close to Hair_base's height, so the bend moves their tips less.
    expect(Math.min(...tipMoves)).toBeGreaterThan(1);
    expect(Math.max(...tipMoves)).toBeGreaterThan(8);
  });
});
