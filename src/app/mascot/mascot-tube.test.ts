import { describe, expect, it } from "vitest";

import type { Point } from "./mascot-path";
import { extractTube, flattenOutline, tubeEdges, tubeOutline, tubePath } from "./mascot-tube";
import { mascotV2Views, type MascotV2PartName, type MascotV2PivotName, type MascotV2ViewName } from "./mascot-v2-parts";

const VIEWS: readonly MascotV2ViewName[] = ["front", "threeQuarter", "side", "back"];
const TUBES: ReadonlyArray<readonly [MascotV2PartName, MascotV2PivotName]> = [
  ["arm_L", "shoulder_L"],
  ["arm_R", "shoulder_R"],
  ["leg_L", "Hip_L"],
  ["leg_R", "Hip_R"],
  ["strand_1", "Hair_base"],
  ["strand_2", "Hair_base"],
  ["strand_3", "Hair_base"],
  ["strand_4", "Hair_base"],
  ["strand_5", "Hair_base"],
];
// The side view draws only the near (_L) limbs.
const CASES = VIEWS.flatMap((view) => TUBES.filter(([part]) => !(mascotV2Views[view].nearOnly && part.endsWith("_R"))).map(([part, pivot]) => [view, part, pivot] as const));

const baseOf = (view: MascotV2ViewName, part: MascotV2PartName) =>
  mascotV2Views[view].parts[part]!.find((layer) => layer.role === "base")!.shapes[0]!.d;
const pivotOf = (view: MascotV2ViewName, pivot: MascotV2PivotName) => mascotV2Views[view].pivots[pivot]!;
const tubeOf = (view: MascotV2ViewName, part: MascotV2PartName, pivot: MascotV2PivotName) => extractTube(baseOf(view, part), pivotOf(view, pivot));

/** Symmetric Hausdorff distance between two densely sampled outlines, using a grid for nearest-point lookups. */
function hausdorff(a: readonly Point[], b: readonly Point[]): number {
  const cell = 2;
  const directed = (from: readonly Point[], to: readonly Point[]) => {
    const grid = new Map<string, Point[]>();
    for (const p of to) {
      const key = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
      (grid.get(key) ?? grid.set(key, []).get(key)!).push(p);
    }
    let worst = 0;
    for (const p of from) {
      let best = Infinity;
      for (let ring = 0; best === Infinity || ring * cell <= best + cell; ring += 1) {
        const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell);
        for (let dx = -ring; dx <= ring; dx += 1) {
          for (let dy = -ring; dy <= ring; dy += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
            for (const q of grid.get(`${cx + dx},${cy + dy}`) ?? []) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
          }
        }
        if (ring > 200) break;
      }
      worst = Math.max(worst, best);
    }
    return worst;
  };
  return Math.max(directed(a, b), directed(b, a));
}
const dense = (d: string) => flattenOutline(d, 0.25).points;

function transform(points: readonly Point[], radians: number, pivot: Point, shift: Point): Point[] {
  const cos = Math.cos(radians), sin = Math.sin(radians);
  return points.map((p) => ({
    x: pivot.x + (p.x - pivot.x) * cos - (p.y - pivot.y) * sin + shift.x,
    y: pivot.y + (p.x - pivot.x) * sin + (p.y - pivot.y) * cos + shift.y,
  }));
}

describe("tubes read from the V2 base outlines", () => {
  it.each(CASES)("%s %s: rebuilding at rest matches the drawn base within 1px", (view, part, pivot) => {
    const tube = tubeOf(view, part, pivot);
    expect(hausdorff(dense(baseOf(view, part)), dense(tubePath(tube)))).toBeLessThan(1);
  });

  it.each(CASES)("%s %s: the centreline starts at the root pivot's end", (view, part, pivot) => {
    const tube = tubeOf(view, part, pivot);
    const hint = pivotOf(view, pivot);
    const [first, last] = [tube.midline[0]!, tube.midline[tube.midline.length - 1]!];
    expect(Math.hypot(first.x - hint.x, first.y - hint.y)).toBeLessThan(Math.hypot(last.x - hint.x, last.y - hint.y));
    expect(tube.length).toBeGreaterThan(40);
  });

  it.each(VIEWS)("%s: keeps the drawn end shapes", (view) => {
    for (const part of (["arm_L", "arm_R"] as const).filter((name) => !(mascotV2Views[view].nearOnly && name === "arm_R"))) {
      // The 3/4 and side near arms are drawn cut flat at the shoulder, where they meet the body.
      const root = (view === "threeQuarter" || view === "side") && part === "arm_L" ? "flat" : "round";
      expect(tubeOf(view, part, part === "arm_L" ? "shoulder_L" : "shoulder_R").ends, `${view} ${part}`).toEqual({ root, tail: "flat" });
    }
    for (const part of ["strand_1", "strand_2", "strand_3", "strand_4", "strand_5"] as const) {
      expect(tubeOf(view, part, "Hair_base").ends, `${view} ${part}`).toEqual({ root: "round", tail: "round" });
    }
    for (const part of (["leg_L", "leg_R"] as const).filter((name) => !(mascotV2Views[view].nearOnly && name === "leg_R"))) {
      expect(tubeOf(view, part, part === "leg_L" ? "Hip_L" : "Hip_R").ends.root, `${view} ${part}`).toBe("round");
    }
  });

  it.each(CASES)("%s %s: moving the whole centreline moves the outline with it exactly", (view, part, pivot) => {
    const tube = tubeOf(view, part, pivot);
    const pivotPoint = tube.midline[0]!;
    const moved = transform(tube.midline, 0.65, pivotPoint, { x: 12, y: -30 });
    const expected = transform(tubeOutline(tube), 0.65, pivotPoint, { x: 12, y: -30 });
    const actual = tubeOutline(tube, moved);
    expect(actual).toHaveLength(expected.length);
    expect(Math.max(...actual.map((p, i) => Math.hypot(p.x - expected[i]!.x, p.y - expected[i]!.y)))).toBeLessThan(1e-9);
  });

  it.each(CASES)("%s %s: bending the centreline keeps the drawn widths, pinching only at a sharp corner", (view, part, pivot) => {
    const tube = tubeOf(view, part, pivot);
    const middle = Math.floor(tube.midline.length / 2);
    const bent = [
      ...tube.midline.slice(0, middle),
      ...transform(tube.midline.slice(middle), 0.8, tube.midline[middle]!, { x: 0, y: 0 }),
    ];
    const widths = (midline: readonly Point[]) => {
      const [a, b] = tubeEdges(tube, midline);
      return a.map((p, i) => Math.hypot(p.x - b[i]!.x, p.y - b[i]!.y));
    };
    const before = widths(tube.midline), after = widths(bent);
    const widest = Math.max(...before);
    const awayFromCorner = (i: number) => Math.abs(tube.arc[i]! - tube.arc[middle]!) > widest;
    expect(Math.max(...after.map((w, i) => (awayFromCorner(i) ? Math.abs(w - before[i]!) : 0)))).toBeLessThan(1e-9);
    expect(widest).toBeGreaterThan(8);
    // The inner edge holds still at the corner instead of folding back on itself.
    for (const edge of tubeEdges(tube, bent)) {
      for (let i = 1; i < edge.length; i += 1) {
        const t = { x: bent[Math.min(i + 1, bent.length - 1)]!.x - bent[i - 1]!.x, y: bent[Math.min(i + 1, bent.length - 1)]!.y - bent[i - 1]!.y };
        expect((edge[i]!.x - edge[i - 1]!.x) * t.x + (edge[i]!.y - edge[i - 1]!.y) * t.y).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });
});
