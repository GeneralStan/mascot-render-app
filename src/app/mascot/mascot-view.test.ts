import { describe, expect, it } from "vitest";

import { appSchema } from "../app-schema";
import { MASCOT_PIVOT_MARKER } from "./mascot-pivot-marker";
import { MASCOT_V2_DRAWN_LIGHT_ANGLE } from "./mascot-relight";
import { buildMascotScene } from "./mascot-scene";
import { MASCOT_GROUND_Y, type MascotScene, type MascotShape } from "./mascot-scene-types";
import {
  MASCOT_BODY_PIVOT_REACH_PX,
  mascotDefaults,
  mascotRanges,
  mascotTargets as t,
  readMascotSettings,
} from "./mascot-settings";
import { mascotSvgTree } from "./mascot-svg-tree";
import { parsePath, type Point } from "./mascot-path";
import { mascotV2Colors } from "./mascot-v2-parts";

type Values = Record<string, unknown>;

const DEGREES = Math.PI / 180;
const TURNS = [-180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180];

/** A gimbal camera pose that orbits the view by `yaw` (positive: the mascot faces screen right). */
function orbit(yaw: number, pitch = 0) {
  const horizontal = Math.cos(pitch * DEGREES) * 5;
  return { position: [-Math.sin(yaw * DEGREES) * horizontal, Math.sin(pitch * DEGREES) * 5, Math.cos(yaw * DEGREES) * horizontal], up: [0, 1, 0] };
}

const scene = (values: Values = {}): MascotScene => buildMascotScene(readMascotSettings({ [t.viewOrbit]: orbit(0), ...values }));
const mascot = (s: MascotScene): readonly MascotShape[] => s.layers.find((layer) => layer.id === "mascot")!.shapes;
const shape = (s: MascotScene, id: string) => mascot(s).find((candidate) => candidate.id === id);
const pointsOf = (d: string): Point[] => parsePath(d).flatMap((segment) => (segment.kind === "Z" ? [] : [segment.to]));
const lowest = (d: string) => Math.max(...pointsOf(d).map((p) => p.y));
const isShade = (id: string) => /-(shade(-\d+)?|lit|rim)$/.test(id);
const isHighlight = (id: string) => /-highlight-/.test(id);

describe("mascot settings drive the V2 scene", () => {
  it("defaults to the drawn light and as-drawn shading, standing at the front", () => {
    expect(mascotRanges.lightAngle.defaultValue).toBe(MASCOT_V2_DRAWN_LIGHT_ANGLE);
    expect(mascotRanges.lightAngle).toMatchObject({ hardMax: 360, hardMin: 0, max: 360, min: 0 });
    expect(mascotRanges.shadingSize.defaultValue).toBe(1);
    const settings = readMascotSettings({});
    expect(settings.body.turn).toBe(0);
    expect(settings.shading).toEqual({ highlight: true, size: 1, visible: true });
    expect(settings.armLeft).toMatchObject({ hand: "open", moneyBag: false });
    // V1's shading ids, including its outline width, no longer mean anything.
    expect(JSON.stringify(scene({ "shading.depth": 4, "shading.style": "offset", "shading.width": 6 }))).toBe(JSON.stringify(scene()));
  });

  it("Body Turn and the gimbal at the same angle draw the same mascot under different light", () => {
    for (const yaw of [30, 90, -60, 150]) {
      const turned = scene({ [t.bodyTurn]: yaw, [t.castVisible]: true });
      const orbited = scene({ [t.viewOrbit]: orbit(yaw), [t.castVisible]: true });
      for (const id of ["arm-L-base", "arm-R-base", "leg-L-base", "leg-R-base"]) {
        const a = pointsOf(shape(turned, id)!.d), b = pointsOf(shape(orbited, id)!.d);
        expect(a.length, `${yaw} ${id}`).toBe(b.length);
        expect(Math.max(...a.map((p, i) => Math.hypot(p.x - b[i]!.x, p.y - b[i]!.y))), `${yaw} ${id}`).toBeLessThan(0.01);
      }
      const shadeOf = (s: MascotScene) => mascot(s).filter((candidate) => isShade(candidate.id)).map((candidate) => candidate.d).join(" ");
      expect(shadeOf(turned), `${yaw} shading`).not.toBe(shadeOf(orbited));
      const cast = (s: MascotScene) => JSON.stringify(s.layers.find((layer) => layer.id === "cast-shadow"));
      expect(cast(turned), `${yaw} cast shadow`).not.toBe(cast(orbited));
    }
  });

  it("keeps both feet on the floor line at every turn", () => {
    for (const turn of TURNS) {
      const s = scene({ [t.bodyTurn]: turn });
      const feet = mascot(s).filter((candidate) => /^leg-[LR]-(base|foot-base)/.test(candidate.id)).map((candidate) => lowest(candidate.d));
      // Path points are corners and curve ends; the curve itself dips a little lower between them.
      expect(Math.abs(Math.max(...feet) - MASCOT_GROUND_Y), `turn ${turn}`).toBeLessThan(0.5);
    }
  });

  it("switches the re-lit shade and the highlights on and off, and sizes the shade", () => {
    const all = mascot(scene());
    expect(all.some((candidate) => isShade(candidate.id))).toBe(true);
    expect(all.some((candidate) => isHighlight(candidate.id))).toBe(true);
    const flat = mascot(scene({ [t.shadingVisible]: false }));
    expect(flat.some((candidate) => isShade(candidate.id))).toBe(false);
    expect(flat.some((candidate) => isHighlight(candidate.id))).toBe(true);
    const plain = mascot(scene({ [t.shadingHighlight]: false }));
    expect(plain.some((candidate) => isHighlight(candidate.id))).toBe(false);
    expect(plain.some((candidate) => isShade(candidate.id))).toBe(true);
    // Wider shade reaches further round each tube and part.
    const area = (points: Point[]) => Math.abs(points.reduce((sum, p, i) => sum + p.x * points[(i + 1) % points.length]!.y - points[(i + 1) % points.length]!.x * p.y, 0)) / 2;
    const shaded = (width: number) => ["leg-L-shade-0", "leg-L-shade-1", "arm-R-shade-0", "arm-R-shade-1"].reduce((sum, id) => sum + area(pointsOf(shape(scene({ [t.shadingSize]: width }), id)!.d)), 0);
    expect(shaded(2)).toBeGreaterThan(shaded(1) * 1.3);
    expect(shaded(0.5)).toBeLessThan(shaded(1) * 0.7);
    expect(shaded(0)).toBeCloseTo(0, 6);
  });

  it("shows the chosen hand and the money bag at each wrist", () => {
    const parts = (values: Values) => new Set(mascot(scene(values)).map((candidate) => candidate.part?.part).filter(Boolean));
    expect(parts({})).toContain("hand_open_L");
    expect(parts({ [t.armLeftHand]: "fist" })).toContain("hand_fist_L");
    expect(parts({ [t.armRightHand]: "thumbsUp" })).toContain("hand_thumbs_up_R");
    expect(parts({})).not.toContain("moneybag_L");
    expect(parts({ [t.armLeftMoneyBag]: true })).toContain("moneybag_L");
    expect(mascotDefaults.hand).toBe("open");
  });

  it("moves the body pivot with the Pivot pad: right is right and down is down on screen", () => {
    expect(readMascotSettings({}).body.pivot).toEqual({ x: 0, y: 0 });
    // The pad writes fixed-point strings; out-of-range and malformed axes are clamped or ignored.
    expect(readMascotSettings({ [t.bodyPivot]: { x: "0.30", y: "-1.50" } }).body.pivot).toEqual({ x: 0.3, y: -1 });
    expect(readMascotSettings({ [t.bodyPivot]: { x: "nope", y: 0.5 } }).body.pivot).toEqual({ x: 0, y: 0.5 });

    const rest = scene();
    const scale = mascotRanges.viewScale.defaultValue;
    // At rest the pivot is the bottom centre of the body: on the head's centre line, above the hips.
    expect(rest.pivot!.x).toBeCloseTo(0, 6);
    expect(rest.pivot!.y).toBeLessThan(MASCOT_GROUND_Y);
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.3, -0.6]] as const) {
      const moved = scene({ [t.bodyPivot]: { x, y } });
      expect(moved.pivot!.x - rest.pivot!.x, `${x},${y}`).toBeCloseTo(x * MASCOT_BODY_PIVOT_REACH_PX * scale, 6);
      expect(moved.pivot!.y - rest.pivot!.y, `${x},${y}`).toBeCloseTo(y * MASCOT_BODY_PIVOT_REACH_PX * scale, 6);
      // With no lean or squash nothing else moves, so the preview frame stays put.
      expect(JSON.stringify(moved.layers), `${x},${y}`).toBe(JSON.stringify(rest.layers));
      expect(moved.bounds).toEqual(rest.bounds);
    }
  });

  it("leans and squashes the body around the pivot", () => {
    const pivot = { x: 0.4, y: -0.5 };
    const head = (values: Values) => {
      const s = scene({ [t.bodyPivot]: pivot, ...values });
      return { at: s.pivot!, points: pointsOf(shape(s, "head-base-1-0")!.d) };
    };
    const upright = head({});
    const leaning = head({ [t.bodyLean]: 20 });
    expect(leaning.at).toEqual(upright.at);
    // A turn about the pivot keeps every point's distance to it (to well under a pixel)...
    const distanceTo = (centre: Point) => (p: Point) => Math.hypot(p.x - centre.x, p.y - centre.y);
    const distance = distanceTo(upright.at);
    leaning.points.forEach((p, i) => expect(distance(p), `head point ${i}`).toBeCloseTo(distance(upright.points[i]!), 1));
    // ...but not to the default pivot, which the body no longer turns about.
    const fromDefault = distanceTo(scene().pivot!);
    expect(Math.max(...leaning.points.map((p, i) => Math.abs(fromDefault(p) - fromDefault(upright.points[i]!))))).toBeGreaterThan(5);
    expect(leaning.points.some((p, i) => Math.hypot(p.x - upright.points[i]!.x, p.y - upright.points[i]!.y) > 5)).toBe(true);
    // Squash scales about the pivot: a point level with it stays level.
    const squashed = scene({ [t.bodyPivot]: pivot, [t.bodySquash]: 0.3 });
    expect(squashed.pivot).toEqual(upright.at);
  });

  it("draws the pivot marker only in the preview, in a colour the mascot never uses", () => {
    const s = scene({ [t.bodyPivot]: { x: 0.5, y: 0.5 }, [t.bodyLean]: 15 });
    const dot = MASCOT_PIVOT_MARKER.dot.color;
    const exported = JSON.stringify(mascotSvgTree(s, { groupId: (name) => name, idPrefix: "clutch-mascot" }));
    expect(exported).not.toContain(dot);
    expect(exported).not.toContain("pivot");
    expect(JSON.stringify(s.layers)).not.toContain(dot);
    expect(Object.values(mascotV2Colors)).not.toContain(dot);
  });

  it("labels each leg's outward hip joint Hip", () => {
    for (const target of [t.legLeftRaise, t.legRightRaise]) {
      const control = appSchema.panels.controls?.sections
        .flatMap((section) => Object.values(section.controls))
        .find((candidate) => candidate.target === target);
      expect(control?.label, target).toBe("Hip");
    }
  });
});
