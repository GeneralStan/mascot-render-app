import { describe, expect, it } from "vitest";

import { drawMascotScene } from "./mascot-canvas-renderer";
import type { MascotScene } from "./mascot-scene-types";
import { appendMascotSceneVectors } from "./mascot-svg-export";
import { mascotSvgTree, type MascotSvgNode } from "./mascot-svg-tree";
import { MASCOT_V2_REST_HAIR } from "./mascot-v2-hair";
import { faceAt } from "./mascot-v2-face";
import { mascotV2Views } from "./mascot-v2-parts";
import { MASCOT_V2_REST_POSE } from "./mascot-v2-pose";
import { MASCOT_V2_CASH_JUMP } from "./mascot-v2-poses";
import { buildMascotV2Scene, type MascotV2SceneInput } from "./mascot-v2-scene";

const REST: MascotV2SceneInput = {
  body: { lean: 0, lift: 0, pivot: { x: 0, y: 0 }, softness: 18, squash: 0 },
  camera: { pitch: 0, scale: 1, yaw: 0 },
  cast: { blur: 4, color: { hex: "#031E19", opacity: 18 }, length: 0.6, visible: true },
  drop: { blur: 0, color: { hex: "#C94631", opacity: 100 }, offset: { x: 0.15, y: 0.15 }, visible: false },
  face: { eyes: "open", mouth: "happy" },
  ground: { blur: 6, color: { hex: "#031E19", opacity: 16 }, size: 1, visible: true },
  hair: { ...MASCOT_V2_REST_HAIR, bandTilt: 0 },
  lightAngle: 160,
  limbs: { armL: MASCOT_V2_REST_POSE, armR: MASCOT_V2_REST_POSE, legL: MASCOT_V2_REST_POSE, legR: MASCOT_V2_REST_POSE },
  turn: 0,
};
const tree = (scene: MascotScene) => mascotSvgTree(scene, { groupId: (name) => name, idPrefix: "t" });

/** Each node's children, from the flat list's depths. */
function childrenOf(nodes: readonly MascotSvgNode[], index: number): MascotSvgNode[] {
  const out: MascotSvgNode[] = [];
  for (let i = index + 1; i < nodes.length && nodes[i]!.depth > nodes[index]!.depth; i++) {
    if (nodes[i]!.depth === nodes[index]!.depth + 1) out.push(nodes[i]!);
  }
  return out;
}

describe("V2 paint and SVG structure", () => {
  it("gives the mouth its soft gradient shadow, exact at the drawn front", () => {
    const shadow = faceAt(0, "open", "happy").find((part) => part.id === "mouth-shadow")!;
    const drawn = mascotV2Views.front.face!.mouth_happy.find((shape) => shape.stroke?.gradient)!;
    expect(shadow.opacity).toBeCloseTo(drawn.opacity!, 9);
    expect(shadow.stroke!.gradient!.from).toEqual(drawn.stroke!.gradient!.from);
    expect(shadow.stroke!.gradient!.to).toEqual(drawn.stroke!.gradient!.to);
    expect(shadow.stroke!.gradient!.stops).toEqual(drawn.stroke!.gradient!.stops);
    // Other mouths have no shadow; turning moves it smoothly.
    expect(faceAt(0, "open", "sad").some((part) => part.id === "mouth-shadow")).toBe(false);
    for (let yaw = 0; yaw < 90; yaw += 5) {
      const a = faceAt(yaw, "open", "happy").find((part) => part.id === "mouth-shadow")!.stroke!.gradient!.from;
      const b = faceAt(yaw + 5, "open", "happy").find((part) => part.id === "mouth-shadow")!.stroke!.gradient!.from;
      expect(Math.hypot(b.x - a.x, b.y - a.y), `${yaw}`).toBeLessThan(12);
    }
  });

  it("writes gradients and opacity into the SVG, referenced by local ids", () => {
    const nodes = tree(buildMascotV2Scene(REST));
    const ids = new Set(nodes.map((n) => n.attributes.id).filter(Boolean));
    const gradient = nodes.find((n) => n.tag === "linearGradient")!;
    expect(gradient.attributes.gradientUnits).toBe("userSpaceOnUse");
    const stops = childrenOf(nodes, nodes.indexOf(gradient));
    expect(stops.map((s) => s.attributes["stop-opacity"])).toEqual(["0.8", "0.05"]);
    const shadowPath = nodes.find((n) => n.tag === "path" && n.attributes.stroke === `url(#${gradient.attributes.id})`)!;
    expect(shadowPath.attributes["data-mascot-part"]).toBe("face-mouth-shadow-stroke");
    expect(shadowPath.attributes.opacity).toBe("0.2");
    // Every url(#...) points at something in the document.
    for (const n of nodes) {
      for (const value of Object.values(n.attributes)) {
        const ref = value.match(/^url\(#(.+)\)$/);
        if (ref) expect(ids.has(ref[1]!), value).toBe(true);
      }
    }
    // Depths only ever step one level deeper.
    nodes.forEach((n, i) => expect(n.depth).toBeLessThanOrEqual(i === 0 ? 0 : nodes[i - 1]!.depth + 1));
  });

  it("groups the mascot's shapes by the Figma part names, each id once", () => {
    const nodes = tree(buildMascotV2Scene({ ...REST, limbs: MASCOT_V2_CASH_JUMP.limbs }));
    const layer = nodes.findIndex((n) => n.attributes["data-mascot-layer"] === "mascot");
    const groups = childrenOf(nodes, layer).filter((n) => n.tag === "g");
    expect(groups.map((g) => g.attributes.id).sort()).toEqual(["Arm_L", "Arm_R", "Body", "Headband", "Leg_L", "Leg_R"]);
    const partsOf = (id: string) => childrenOf(nodes, nodes.findIndex((n) => n.attributes.id === id)).map((n) => n.attributes.id);
    expect(partsOf("Leg_L")).toEqual(["leg_L", "foot_L"]);
    expect(partsOf("Arm_L")).toEqual(["moneybag_L", "arm_L", "hand_fist_L", "armband_L"]);
    expect(partsOf("Body")).toEqual(expect.arrayContaining(["strand_1", "strand_2", "strand_3", "strand_4", "strand_5", "head", "face"]));
    expect(partsOf("Headband")).toEqual(["headband"]);
    const groupIds = nodes.filter((n) => n.tag === "g" && n.attributes.id).map((n) => n.attributes.id);
    expect(new Set(groupIds).size).toBe(groupIds.length);
    // The open hand is named as such when it's the one showing.
    expect(tree(buildMascotV2Scene(REST)).some((n) => n.attributes.id === "hand_open_R")).toBe(true);
  });

  it("appends the same nodes, nested and namespaced, into the export group", () => {
    type Fake = { attributes: Record<string, string>; children: Fake[]; namespace: string; tag: string };
    const doc = { createElementNS: (ns: string, tag: string) => make(ns, tag) };
    function make(namespace: string, tag: string) {
      const element = {
        append: (child: Fake) => element.children.push(child),
        attributes: {} as Record<string, string>,
        children: [] as Fake[],
        namespace,
        ownerDocument: doc,
        setAttribute: (name: string, value: string) => {
          element.attributes[name] = value;
        },
        tag,
      };
      return element;
    }
    const container = make("http://www.w3.org/2000/svg", "g");
    const scene = buildMascotV2Scene(REST);
    appendMascotSceneVectors(container as unknown as SVGGElement, scene);
    const flat: Array<{ depth: number; node: Fake }> = [];
    const walk = (node: Fake, depth: number): void => {
      for (const child of node.children) {
        flat.push({ depth, node: child });
        walk(child, depth + 1);
      }
    };
    walk(container, 0);
    const expected = mascotSvgTree(scene, { groupId: (name) => name, idPrefix: "clutch-mascot" });
    expect(flat.map(({ depth, node }) => [depth, node.tag, node.attributes])).toEqual(expected.map((n) => [n.depth, n.tag, n.attributes]));
    expect(flat.every(({ node }) => node.namespace === "http://www.w3.org/2000/svg")).toBe(true);
  });

  it("paints gradients and per-shape opacity on canvas", () => {
    const scene = buildMascotV2Scene(REST);
    const mascotOnly: MascotScene = { ...scene, layers: scene.layers.filter((layer) => layer.id === "mascot") };
    const calls: string[] = [];
    let depth = 0, alpha = 1;
    const saved: number[] = [];
    const gradient = { addColorStop: (offset: number, colour: string) => calls.push(`stop ${offset} ${colour}`) };
    const context = {
      canvas: { height: 1000, width: 1000 },
      clip: () => {},
      createLinearGradient: (x1: number, y1: number, x2: number, y2: number) => {
        calls.push(`gradient ${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`);
        return gradient;
      },
      fill: () => {},
      fillStyle: "" as unknown,
      getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
      get globalAlpha() {
        return alpha;
      },
      set globalAlpha(value: number) {
        alpha = value;
      },
      lineCap: "",
      lineJoin: "",
      lineWidth: 1,
      restore: () => {
        depth--;
        alpha = saved.pop()!;
      },
      save: () => {
        depth++;
        saved.push(alpha);
      },
      stroke: () => calls.push(`stroke alpha ${alpha}`),
      strokeStyle: "" as unknown,
    };
    const globals = globalThis as { Path2D?: unknown };
    const hadPath2D = "Path2D" in globals;
    globals.Path2D ??= class {};
    try {
      drawMascotScene(context as unknown as CanvasRenderingContext2D, mascotOnly);
    } finally {
      if (!hadPath2D) delete globals.Path2D;
    }
    const shadow = mascotOnly.layers[0]!.shapes.find((shape) => shape.id === "face-mouth-shadow-stroke")!;
    const from = shadow.paint.gradient!.from, to = shadow.paint.gradient!.to;
    expect(calls).toContain(`gradient ${from.x.toFixed(1)},${from.y.toFixed(1)} ${to.x.toFixed(1)},${to.y.toFixed(1)}`);
    expect(calls).toContain("stop 0 rgba(3, 30, 25, 0.8)");
    expect(calls).toContain("stop 1 rgba(3, 30, 25, 0.05)");
    expect(calls).toContain("stroke alpha 0.2");
    expect(depth).toBe(0);
    expect(alpha).toBe(1);
  });

  it("keeps a V1 scene's SVG as before: no part groups, no gradients", () => {
    const plain: MascotScene = {
      bounds: { height: 10, width: 10, x: 0, y: 0 },
      clips: [],
      layers: [{ blur: 0, bounds: { height: 10, width: 10, x: 0, y: 0 }, id: "mascot", opacity: 1, shapes: [{ d: "M0 0L1 1", id: "a", paint: { color: "#FD5D44", kind: "fill" } }] }],
    };
    expect(tree(plain).map((n) => [n.depth, n.tag])).toEqual([[0, "g"], [1, "path"]]);
  });
});
