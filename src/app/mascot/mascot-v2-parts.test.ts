import { describe, expect, it } from "vitest";

import {
  mascotV2Colors,
  mascotV2PartNames,
  mascotV2PivotNames,
  mascotV2Props,
  mascotV2Views,
  type MascotV2Layer,
  type MascotV2PartName,
  type MascotV2Shape,
  type MascotV2ViewName,
} from "./mascot-v2-parts";

const VIEW_NAMES: readonly MascotV2ViewName[] = ["front", "threeQuarter", "side", "back"];
const palette = new Set<string>(Object.values(mascotV2Colors));
const drawnIn = (view: MascotV2ViewName) => (name: string) => !(mascotV2Views[view].nearOnly && name.endsWith("_R"));

function points(d: string): Array<[number, number]> {
  const numbers = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gu)?.map(Number) ?? [];
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) pairs.push([numbers[i]!, numbers[i + 1]!]);
  return pairs;
}
const allShapes = (layers: readonly MascotV2Layer[]): MascotV2Shape[] => layers.flatMap((layer) => [...layer.shapes]);
const roles = (layers: readonly MascotV2Layer[]) => layers.map((layer) => (layer.stripe ? `${layer.role}${layer.stripe}` : layer.role));
const part = (view: MascotV2ViewName, name: MascotV2PartName) => mascotV2Views[view].parts[name]!;
const base = (layers: readonly MascotV2Layer[]) => layers.find((layer) => layer.role === "base")!.shapes[0]!;

describe("V2 mascot art imported from Figma (146:1816)", () => {
  it.each(VIEW_NAMES)("%s: every drawn body part has outline, base, shade and highlight in paint order", (name) => {
    const view = mascotV2Views[name];
    for (const partName of mascotV2PartNames.filter(drawnIn(name))) {
      const layers = view.parts[partName];
      expect(layers, partName).toBeDefined();
      if (partName === "armband_L" || partName === "armband_R" || partName === "headband") {
        expect(roles(layers!), partName).toEqual(["outline", "base3", "shade3", "base2", "shade2", "base1", "shade1", "highlight"]);
      } else if (partName === "head") {
        expect(roles(layers!), partName).toEqual(["outline", "base", "shade", "highlight", "highlight"]);
      } else {
        expect(roles(layers!), partName).toEqual(["outline", "base", "shade", "highlight"]);
      }
    }
  });

  it("draws only the near limbs in the side view", () => {
    expect(mascotV2Views.side.nearOnly).toBe(true);
    expect(Object.keys(mascotV2Views.side.parts).filter((name) => name.endsWith("_R"))).toEqual([]);
    expect(Object.keys(mascotV2Views.side.pivots).filter((name) => name.endsWith("_R"))).toEqual([]);
    for (const name of ["front", "threeQuarter", "back"] as const) expect(mascotV2Views[name].nearOnly).toBe(false);
  });

  it.each(VIEW_NAMES)("%s: every drawn pivot dot is present", (name) => {
    const { pivots } = mascotV2Views[name];
    for (const pivot of mascotV2PivotNames.filter(drawnIn(name))) {
      expect(Number.isFinite(pivots[pivot]?.x) && Number.isFinite(pivots[pivot]?.y), pivot).toBe(true);
    }
    expect(pivots.Hip_L!.y).toBeLessThan(0);
    expect(pivots.Ankle_L!.y).toBeGreaterThan(pivots.Knee_L!.y);
    expect(pivots.Knee_L!.y).toBeGreaterThan(pivots.Hip_L!.y);
    expect(pivots.Wrist_L!.y).toBeGreaterThan(pivots.shoulder_L!.y);
  });

  it("keeps the drawn layer order for each view", () => {
    const order = (name: MascotV2ViewName) => mascotV2Views[name].groups.map((group) => group.name);
    expect(order("front")).toEqual(["Leg_L", "Leg_R", "Arm_L", "Arm_R", "Body", "Headband"]);
    expect(order("back")).toEqual(["Leg_L", "Leg_R", "Arm_L", "Arm_R", "Body", "Headband"]);
    expect(order("threeQuarter")).toEqual(["Leg_L", "Leg_R", "Arm_R", "Body", "Headband", "Arm_L"]);
    expect(order("side")).toEqual(["Leg_L", "Body", "Headband", "Arm_L"]);
    for (const name of VIEW_NAMES) {
      const arm = mascotV2Views[name].groups.find((group) => group.name === "Arm_L")!;
      expect(arm.parts).toEqual(["arm_L", "hand_open_L", "armband_L"]);
    }
  });

  it("puts the rig origin at the head centre and on the floor", () => {
    for (const name of VIEW_NAMES) {
      const head = points(base(part(name, "head")).d).map(([x]) => x);
      expect(Math.abs(Math.min(...head) + Math.max(...head)), `${name} head centred`).toBeLessThan(0.5);
      const feet = (["foot_L", "foot_R"] as const).filter(drawnIn(name)).flatMap((foot) => points(base(part(name, foot)).d)).map(([, y]) => y);
      expect(Math.abs(Math.max(...feet)), `${name} feet on the floor`).toBeLessThan(0.05);
    }
  });

  it("uses the same head and headband outline in every view, so the body reads as round", () => {
    const commands = (d: string) => d.replace(/[-\d.e]+/gu, "#");
    const expectSameShape = (actual: string, expected: string, label: string) => {
      expect(commands(actual), label).toBe(commands(expected));
      const a = points(actual), b = points(expected);
      const drift = Math.max(...a.map(([x, y], i) => Math.hypot(x - b[i]![0], y - b[i]![1])));
      // Sub-pixel: the side view's head sits 0.1 px off the front's in Figma.
      expect(drift, label).toBeLessThan(0.25);
    };
    for (const name of ["threeQuarter", "side", "back"] as const) {
      expectSameShape(base(part(name, "head")).d, base(part("front", "head")).d, `${name} head`);
      expectSameShape(base(part(name, "headband")).d, base(part("front", "headband")).d, `${name} headband`);
    }
  });

  it("only uses V2 palette colours", () => {
    const shapes = [
      ...VIEW_NAMES.flatMap((name) => Object.values(mascotV2Views[name].parts).flatMap((layers) => allShapes(layers!))),
      ...VIEW_NAMES.flatMap((name) => [...(mascotV2Views[name].face?.eyes_open ?? []), ...(mascotV2Views[name].face?.mouth_happy ?? [])]),
      ...Object.values(mascotV2Props).flatMap((prop) => allShapes(prop.layers)),
    ];
    for (const shape of shapes) {
      if (shape.fill) expect(palette.has(shape.fill), shape.fill).toBe(true);
      if (shape.stroke?.color) expect(palette.has(shape.stroke.color), shape.stroke.color).toBe(true);
      for (const stop of shape.stroke?.gradient?.stops ?? []) expect(palette.has(stop.color), stop.color).toBe(true);
      expect(shape.d).toMatch(/^M [-\d.]+ [-\d.]+( [MLQCZ]( [-\d.e]+)*)*$/u);
    }
  });

  it("has the happy face on front, 3/4 and side (one eye in profile), with the mouth's soft gradient shadow", () => {
    expect(mascotV2Views.back.face).toBeUndefined();
    for (const name of ["front", "threeQuarter", "side"] as const) {
      const face = mascotV2Views[name].face!;
      const eyes = name === "side" ? 1 : 2;
      expect(face.eyes_open.map((shape) => shape.fill)).toEqual(Array.from({ length: eyes }, () => ["#031E19", "#FCFCFC"]).flat());
      const [mouth, shadow] = face.mouth_happy;
      expect(mouth!.stroke).toMatchObject({ color: mascotV2Colors.ink, width: 4, cap: "ROUND" });
      expect(shadow!.opacity).toBe(0.2);
      expect(shadow!.stroke?.gradient?.stops.map((stop) => stop.alpha)).toEqual([0.8, 0.05]);
    }
    // In profile the face sits on the side he faces (screen right).
    const eye = points(mascotV2Views.side.face!.eyes_open[0]!.d).map(([x]) => x);
    expect(Math.min(...eye)).toBeGreaterThan(20);
  });

  it("imports the money bag, fist and thumbs-up props", () => {
    expect(roles(mascotV2Props.handFist.layers)).toEqual(["outline", "base", "shade", "highlight"]);
    expect(roles(mascotV2Props.handThumbsUp.layers)).toEqual(["outline", "base", "shade", "highlight"]);
    for (const hand of [mascotV2Props.handFist, mascotV2Props.handThumbsUp]) {
      const wrist = hand.pivots?.Wrist;
      expect(wrist).toBeDefined();
      expect(wrist!.x).toBeGreaterThan(0);
      expect(wrist!.x).toBeLessThan(hand.size.width);
      expect(wrist!.y).toBeGreaterThan(0);
      expect(wrist!.y).toBeLessThan(hand.size.height);
    }
    const bag = mascotV2Props.moneyBag.layers;
    // The $ sign is Color/Warning/800 on the base; every crease, filled or stroked, is Color/Warning/600 (Figma 170:2155).
    expect(bag[0]!.shapes.map((shape) => shape.fill)).toEqual([mascotV2Colors.bag, mascotV2Colors.bagSign]);
    const creases = bag.filter((layer) => layer.role === "crease").flatMap((layer) => layer.shapes);
    expect(new Set(creases.map((shape) => shape.fill ?? shape.stroke?.color))).toEqual(new Set([mascotV2Colors.bagCrease]));
    expect(bag.filter((layer) => layer.role === "crease")).toHaveLength(8);
    expect(bag.filter((layer) => layer.role === "shade")).toHaveLength(1);
  });
});
