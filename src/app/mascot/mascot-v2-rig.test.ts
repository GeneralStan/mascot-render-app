import { describe, expect, it } from "vitest";

import type { Point } from "./mascot-path";
import { mascotV2PivotNames, mascotV2Views, type MascotV2PivotName } from "./mascot-v2-parts";
import { MASCOT_V2_BODY_PIVOT, mascotV2Rig, normalizeYaw, projectedJointsAt, turnHairPoint, turnPoint } from "./mascot-v2-rig";

const { back, front, side, threeQuarter } = mascotV2Views;
const RIGHT_ARM = new Set<MascotV2PivotName>(["shoulder_R", "Elbow_R", "Wrist_R"]);
const swap = (name: MascotV2PivotName) =>
  (name.endsWith("_L") ? `${name.slice(0, -2)}_R` : name.endsWith("_R") ? `${name.slice(0, -2)}_L` : name) as MascotV2PivotName;
const nearTwin = (name: MascotV2PivotName) => (name.endsWith("_R") ? swap(name) : name);
const gap = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mirror = (p: Point): Point => ({ x: -p.x, y: p.y });

describe("V2 rest rig", () => {
  it("lands on the front drawing at 0°, with the right arm mirroring the left", () => {
    const at = projectedJointsAt(0);
    for (const name of mascotV2PivotNames) {
      const expected = RIGHT_ARM.has(name) ? mirror(front.pivots[swap(name)]!) : front.pivots[name]!;
      expect(gap(at[name], expected), name).toBeLessThan(1e-9);
    }
  });

  it("matches both arms to Arm_L in 3D", () => {
    const rest = mascotV2Rig.rest;
    const len = (a: typeof rest.Hip_L, b: typeof rest.Hip_L) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    expect(len(rest.shoulder_R, rest.Elbow_R)).toBeCloseTo(len(rest.shoulder_L, rest.Elbow_L), 9);
    expect(len(rest.Elbow_R, rest.Wrist_R)).toBeCloseTo(len(rest.Elbow_L, rest.Wrist_L), 9);
  });

  it("takes joint depth from the side drawing", () => {
    const rest = mascotV2Rig.rest;
    // The side view faces screen right, so its x is depth.
    expect(rest.shoulder_L.z).toBeCloseTo(side.pivots.shoulder_L!.x, 9);
    expect(rest.Hip_L.z).toBeCloseTo(side.pivots.Hip_L!.x, 9);
    expect(rest.Hair_base.z).toBeCloseTo(side.pivots.Hair_base!.x, 9);
    expect(Math.sign(rest.Elbow_L.z - rest.shoulder_L.z)).toBe(Math.sign(side.pivots.Elbow_L!.x - side.pivots.shoulder_L!.x));
    for (const name of ["shoulder", "Elbow", "Wrist", "Hip", "Knee", "Ankle"]) {
      expect(rest[`${name}_R` as MascotV2PivotName].z, name).toBe(rest[`${name}_L` as MascotV2PivotName].z);
    }
  });

  it("lands exactly on the 3/4 drawing at 30°, and on it mirrored at −30°", () => {
    const at = projectedJointsAt(30), mirrored = projectedJointsAt(-30);
    for (const name of mascotV2PivotNames) {
      expect(gap(at[name], threeQuarter.pivots[name]!), name).toBeLessThan(1e-6);
      expect(gap(mirrored[name], mirror(threeQuarter.pivots[swap(name)]!)), name).toBeLessThan(1e-6);
    }
  });

  it("lands exactly on the side drawing at 90°, with the far limbs right behind the near ones", () => {
    const at = projectedJointsAt(90);
    for (const name of mascotV2PivotNames) expect(gap(at[name], side.pivots[nearTwin(name)]!), name).toBeLessThan(1e-6);
    const mirrored = projectedJointsAt(-90);
    for (const name of mascotV2PivotNames) expect(gap(mirrored[name], mirror(side.pivots[nearTwin(swap(name))]!)), name).toBeLessThan(1e-6);
  });

  it("lands on the back drawing at 180°, where the drawing's screen-left limbs are the rig's right limbs", () => {
    for (const yaw of [180, -180, 540]) {
      const at = projectedJointsAt(yaw);
      for (const name of mascotV2PivotNames) expect(gap(at[name], back.pivots[swap(name)]!), `${yaw} ${name}`).toBeLessThan(1e-6);
    }
  });

  it("puts the near limbs in front when turned, and the far ones behind", () => {
    for (const yaw of [30, 60, 90, 120]) {
      const depth = (name: MascotV2PivotName) => turnPoint(mascotV2Rig.rest[name], yaw).z;
      expect(depth("shoulder_L"), `${yaw}`).toBeGreaterThan(depth("shoulder_R"));
      expect(depth("Hip_L"), `${yaw}`).toBeGreaterThan(depth("Hip_R"));
    }
  });

  it("turns smoothly all the way round", () => {
    let previous = projectedJointsAt(-180);
    let worst = 0;
    for (let yaw = -179.5; yaw <= 180; yaw += 0.5) {
      const at = projectedJointsAt(yaw);
      for (const name of mascotV2PivotNames) worst = Math.max(worst, gap(at[name], previous[name]));
      previous = at;
    }
    expect(worst).toBeLessThan(2.5);
    expect(normalizeYaw(-180)).toBe(180);
    expect(normalizeYaw(390)).toBe(30);
  });

  it("puts the body pivot at the bottom centre of the body", () => {
    expect(Math.abs(MASCOT_V2_BODY_PIVOT.x)).toBeLessThan(0.5);
    expect(MASCOT_V2_BODY_PIVOT.y).toBeGreaterThan(front.pivots.Hip_L!.y);
    expect(MASCOT_V2_BODY_PIVOT.y).toBeLessThan(front.pivots.Knee_L!.y);
  });

  it("keeps the hair's drawn shape at every turn, riding Hair_base", () => {
    const restBase = { x: -2.47, y: -336.3 }, base = { x: 10, y: -330 };
    expect(turnHairPoint({ x: 20, y: -360 }, restBase, base)).toEqual({ x: 32.47, y: -353.7 });
  });
});
