import { describe, expect, it } from "vitest";

import { parsePath, type Point } from "./mascot-path";
import { MASCOT_GROUND_Y, type MascotScene } from "./mascot-scene-types";
import { MASCOT_V2_REST_HAIR } from "./mascot-v2-hair";
import { mascotV2Faces } from "./mascot-v2-faces";
import { mascotV2Colors, mascotV2Views } from "./mascot-v2-parts";
import { MASCOT_V2_REST_POSE, type MascotV2LimbPose } from "./mascot-v2-pose";
import { cameraLight, lightAzimuth, MASCOT_V2_DRAWN_LIGHT_ANGLE, mixHex } from "./mascot-relight";
import { buildMascotV2Scene, limbPalette, MASCOT_V2_TUCK_LENGTH, type MascotV2SceneInput } from "./mascot-v2-scene";

const REST: MascotV2SceneInput = {
  body: { lean: 0, lift: 0, pivot: { x: 0, y: 0 }, softness: 18, squash: 0 },
  camera: { pitch: 0, scale: 1, yaw: 0 },
  cast: { blur: 4, color: { hex: "#031E19", opacity: 18 }, length: 0.6, visible: true },
  drop: { blur: 0, color: { hex: "#C94631", opacity: 100 }, offset: { x: 0.15, y: 0.15 }, visible: true },
  face: { eyes: "open", mouth: "happy" },
  ground: { blur: 6, color: { hex: "#031E19", opacity: 16 }, size: 1, visible: true },
  hair: { ...MASCOT_V2_REST_HAIR, bandTilt: 0 },
  lightAngle: MASCOT_V2_DRAWN_LIGHT_ANGLE,
  limbs: { armL: MASCOT_V2_REST_POSE, armR: MASCOT_V2_REST_POSE, legL: MASCOT_V2_REST_POSE, legR: MASCOT_V2_REST_POSE },
  turn: 0,
};
const scene = (overrides: Partial<MascotV2SceneInput> = {}) => buildMascotV2Scene({ ...REST, ...overrides });
const mascotShapes = (s: MascotScene) => s.layers.find((layer) => layer.id === "mascot")!.shapes;
const indexOf = (s: MascotScene, prefix: string) => mascotShapes(s).findIndex((shape) => shape.id.startsWith(prefix));
const pointsOf = (d: string): Point[] => parsePath(d).flatMap((seg) => (seg.kind === "Z" ? [] : seg.kind === "C" ? [seg.to] : [seg.to]));
const centre = (ds: readonly string[]): Point => {
  const points = ds.flatMap((d) => parsePath(d).flatMap((seg) => (seg.kind === "Z" ? [] : seg.kind === "C" ? [seg.c1, seg.c2, seg.to] : [seg.to])));
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
};
/** Inside a closed path (curves flattened), by non-zero winding. */
function insidePath(d: string, p: Point): boolean {
  const poly: Point[] = [];
  let last: Point = { x: 0, y: 0 };
  for (const seg of parsePath(d)) {
    if (seg.kind === "M" || seg.kind === "L") {
      poly.push(seg.to);
      last = seg.to;
    } else if (seg.kind === "C") {
      for (let i = 1; i <= 16; i++) {
        const t = i / 16, u = 1 - t;
        poly.push({ x: u * u * u * last.x + 3 * u * u * t * seg.c1.x + 3 * u * t * t * seg.c2.x + t * t * t * seg.to.x, y: u * u * u * last.y + 3 * u * u * t * seg.c1.y + 3 * u * t * t * seg.c2.y + t * t * t * seg.to.y });
      }
      last = seg.to;
    }
  }
  let upward = 0, downward = 0;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    const side = (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
    if (a.y <= p.y) {
      if (b.y > p.y && side > 0) upward++;
    } else if (b.y <= p.y && side < 0) {
      downward++;
    }
  });
  return upward !== downward;
}

const limbs = (patch: Partial<Record<"armL" | "armR" | "legL" | "legR", Partial<MascotV2LimbPose>>>) => ({
  armL: { ...MASCOT_V2_REST_POSE, ...patch.armL },
  armR: { ...MASCOT_V2_REST_POSE, ...patch.armR },
  legL: { ...MASCOT_V2_REST_POSE, ...patch.legL },
  legR: { ...MASCOT_V2_REST_POSE, ...patch.legR },
});

describe("V2 scene", () => {
  it("builds at every turn, with the mascot layer on top of its shadows", () => {
    for (let turn = -180; turn <= 180; turn += 15) {
      const s = scene({ turn });
      expect(s.layers.map((layer) => layer.id), `${turn}`).toEqual(["cast-shadow", "ground-shadow", "drop-shadow", "mascot"]);
      expect(Number.isFinite(s.bounds.width) && s.bounds.width > 100 && s.bounds.height > 300, `${turn}`).toBe(true);
    }
  }, 30_000);

  it("stands the feet on the floor line, and Lift raises them", () => {
    for (const turn of [0, 30, 90, 180, -45]) {
      for (const lift of [0, 40]) {
        const feet = mascotShapes(scene({ body: { ...REST.body, lift }, turn })).filter((shape) => shape.id.includes("-foot-base"));
        const lowest = Math.max(...feet.flatMap((shape) => pointsOf(shape.d).map((p) => p.y)));
        expect(Math.abs(lowest - (MASCOT_GROUND_Y - lift)), `${turn} lift ${lift}`).toBeLessThan(0.6);
      }
    }
  });

  it("layers the arms as drawn: behind the body from the front, the near arm over it at 3/4 and side", () => {
    const head = (s: MascotScene) => indexOf(s, "head-");
    const front = scene();
    expect(indexOf(front, "arm-L-base")).toBeLessThan(head(front));
    expect(indexOf(front, "arm-R-base")).toBeLessThan(head(front));
    for (const turn of [30, 90]) {
      const s = scene({ turn });
      expect(indexOf(s, "arm-L-base"), `${turn}`).toBeGreaterThan(head(s));
      expect(indexOf(s, "arm-R-base"), `${turn}`).toBeLessThan(head(s));
    }
    const left = scene({ turn: -90 });
    expect(indexOf(left, "arm-R-base")).toBeGreaterThan(head(left));
  });

  it("gives far limbs the shade colour side-on", () => {
    const shapes = mascotShapes(scene({ turn: 90 }));
    const fill = (id: string) => (shapes.find((shape) => shape.id === id)!.paint as { color: string }).color;
    expect(fill("arm-R-base")).toBe(mascotV2Colors.bodyShade);
    expect(fill("arm-L-base")).toBe(mascotV2Colors.body);
    expect(fill("leg-L-base")).toBe(mascotV2Colors.body);
    expect(fill("leg-R-base")).toBe(mascotV2Colors.bodyShade);
  });

  it("keeps the drawn colours at the front, 3/4 and back, and darkens the far limbs without a jump", () => {
    for (const turn of [0, 30, -30, 180, -180]) {
      expect(limbPalette("L", turn).base, `${turn}`).toBe(mascotV2Colors.body);
      expect(limbPalette("R", turn).base, `${turn}`).toBe(mascotV2Colors.body);
    }
    expect(limbPalette("L", -90).base).toBe(mascotV2Colors.bodyShade);
    expect(limbPalette("R", -90).base).toBe(mascotV2Colors.body);
    const channels = (hex: string) => [0, 1, 2].map((i) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16));
    for (const side of ["L", "R"] as const) {
      for (let turn = -180; turn < 180; turn += 1) {
        const a = channels(limbPalette(side, turn).base), b = channels(limbPalette(side, turn + 1).base);
        expect(Math.max(...a.map((value, i) => Math.abs(value - b[i]!))), `${side} ${turn}`).toBeLessThanOrEqual(5);
      }
    }
    expect(mixHex("#FD5D44", "#C94631", 0.5)).toBe("#E3523B");
  });

  it("puts the face exactly where the front drawing has it, and hides it from behind", () => {
    const s = scene();
    const drawnEyes = mascotV2Views.front.face!.eyes_open;
    const eyeShapes = mascotShapes(s).filter((shape) => shape.id.startsWith("face-eye-"));
    expect(eyeShapes).toHaveLength(drawnEyes.length);
    const drawn = centre(drawnEyes.map((shape) => shape.d));
    const placed = centre(eyeShapes.map((shape) => shape.d));
    expect(Math.hypot(placed.x - drawn.x, placed.y - (drawn.y + MASCOT_GROUND_Y))).toBeLessThan(0.05);
    expect(mascotShapes(scene({ turn: 180 })).some((shape) => shape.id.startsWith("face-"))).toBe(false);
    for (const turn of [0, 45, 90, -60]) {
      const t = scene({ turn });
      const face = mascotShapes(t).filter((shape) => shape.id.startsWith("face-"));
      expect(face.length, `${turn}`).toBeGreaterThan(0);
      expect(face.every((shape) => shape.clipId === "mascot-face-clip"), `${turn}`).toBe(true);
      expect(t.clips.map((clip) => clip.id)).toContain("mascot-face-clip");
    }
  });

  it("draws each Faces_V2 face with its drawn layout, the smile and open eyes where Standing has them", () => {
    const shapesOf = (face: MascotV2SceneInput["face"], prefix: string) =>
      mascotShapes(scene({ face })).filter((s) => s.id.startsWith(prefix) && !s.id.includes("shadow")).map((s) => s.d);
    // Mouths are compared by the lines themselves (the happy mouth's soft shadow is left out).
    const layout = (face: MascotV2SceneInput["face"]) => {
      const left = centre(shapesOf(face, "face-eye-near")), right = centre(shapesOf(face, "face-eye-far"));
      const pair = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
      return { left, mouth: centre(shapesOf(face, "face-mouth")), pair, right };
    };
    const drawn = (name: keyof typeof mascotV2Faces) => {
      const face = mascotV2Faces[name];
      const left = centre(face.eyes[0].map((s) => s.d)), right = centre(face.eyes[1].map((s) => s.d));
      return { left, mouth: centre(face.mouth.map((s) => s.d)), pair: { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 }, right };
    };
    const happy = layout({ eyes: "open", mouth: "happy" });
    const cases = [
      ["excited", { eyes: "open", mouth: "excited" }],
      ["satisfied", { eyes: "blink", mouth: "happy" }],
      ["sleepy", { eyes: "tired", mouth: "happy" }],
      ["disappointed", { eyes: "tired", mouth: "sad" }],
      ["confused", { eyes: "curious", mouth: "neutral" }],
      ["angry", { eyes: "angry", mouth: "sad" }],
    ] as const;
    // Standing's smile sits a little further below its eyes than face_happy's, so each face is laid
    // against Standing's: relative to the happy face, its eyes-to-mouth layout changes as drawn.
    const open = drawn("happy");
    for (const [name, face] of cases) {
      const placed = layout(face), figma = drawn(name);
      expect(placed.mouth.y - placed.pair.y - (happy.mouth.y - happy.pair.y), name).toBeCloseTo(figma.mouth.y - figma.pair.y - (open.mouth.y - open.pair.y), 1);
      expect(Math.abs(placed.mouth.x - placed.pair.x - (happy.mouth.x - happy.pair.x) - (figma.mouth.x - figma.pair.x - (open.mouth.x - open.pair.x))), name).toBeLessThan(0.6);
      // Each eye keeps its drawn spacing.
      expect(placed.right.x - placed.left.x - (happy.right.x - happy.left.x), name).toBeCloseTo(figma.right.x - figma.left.x - (open.right.x - open.left.x), 1);
      // The smile stays where Standing draws it; the eye-pair stays put otherwise, unless the frown sets it.
      if (face.mouth === "happy") expect(Math.hypot(placed.mouth.x - happy.mouth.x, placed.mouth.y - happy.mouth.y), name).toBeLessThan(0.05);
      if (face.eyes === "open" || face.eyes === "curious") expect(Math.abs(placed.pair.y - happy.pair.y), name).toBeLessThan(0.05);
    }
    // Sad eyes are still V1, centred on the open eyes.
    const sad = layout({ eyes: "sad", mouth: "happy" });
    expect(Math.hypot(sad.left.x - happy.left.x, sad.left.y - happy.left.y)).toBeLessThan(1);
  });

  it("narrows a drawn mouth as the turn narrows the smile", () => {
    const width = (turn: number) => {
      const ds = mascotShapes(scene({ face: { eyes: "open", mouth: "excited" }, turn })).filter((s) => s.id.startsWith("face-mouth") && !s.id.includes("shadow")).map((s) => s.d);
      const xs = ds.flatMap((d) => pointsOf(d).map((p) => p.x));
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(width(30)).toBeLessThan(width(0));
    expect(width(90)).toBeLessThan(width(30));
  });

  it("tucks a near arm's outline in at the shoulder so it grows out of the body", () => {
    for (const turn of [30, 90]) {
      const shapes = mascotShapes(scene({ turn }));
      const outline = pointsOf(shapes.find((shape) => shape.id === "arm-L-outline")!.d);
      const base = pointsOf(shapes.find((shape) => shape.id === "arm-L-base")!.d);
      const root = base[0]!;
      expect(Math.hypot(outline[0]!.x - root.x, outline[0]!.y - root.y), `${turn}`).toBeGreaterThan(MASCOT_V2_TUCK_LENGTH * 0.6);
      // An arm behind the body keeps its full outline.
      const behind = pointsOf(shapes.find((shape) => shape.id === "arm-R-outline")!.d);
      const behindBase = pointsOf(shapes.find((shape) => shape.id === "arm-R-base")!.d);
      expect(Math.hypot(behind[0]!.x - behindBase[0]!.x, behind[0]!.y - behindBase[0]!.y), `${turn}`).toBeLessThan(1e-6);
    }
  });

  it("runs limbs behind the body on into it, so no cut root shows past the body's edge", () => {
    for (const turn of [0, 30, -30, 180]) {
      const s = scene({ turn });
      // What's drawn over a limb behind the body: the head and the headband.
      const cover = mascotShapes(s).filter((shape) => /^head-base-\d+-\d+$/.test(shape.id) || /^headband-base\d-\d+-\d+$/.test(shape.id)).map((shape) => shape.d);
      for (const id of ["arm-L", "arm-R", "leg-L", "leg-R"]) {
        // A near arm drawn over the body keeps its tucked shoulder instead.
        if (indexOf(s, `${id}-base`) > indexOf(s, "head-")) continue;
        const ring = pointsOf(mascotShapes(s).find((shape) => shape.id === `${id}-base`)!.d);
        for (const end of [ring[0]!, ring[ring.length - 1]!]) expect(cover.some((d) => insidePath(d, end)), `${id} turn ${turn}`).toBe(true);
      }
    }
  });

  it("casts the shadow away from the light: back with it in front, forward with it behind", () => {
    const castCentre = (s: MascotScene) => centre(s.layers.find((layer) => layer.id === "cast-shadow")!.shapes.map((shape) => shape.d));
    const inFront = castCentre(scene());
    // The drawn light comes from the left, a little above and in front.
    expect(inFront.x).toBeGreaterThan(0);
    expect(inFront.y).toBeLessThan(MASCOT_GROUND_Y);
    const behind = scene({ camera: { ...REST.camera, yaw: -60 } });
    expect(cameraLight(MASCOT_V2_DRAWN_LIGHT_ANGLE, -60).z).toBeLessThan(0);
    expect(castCentre(behind).y).toBeGreaterThan(MASCOT_GROUND_Y);
  });

  it("with the light behind, darkens the mascot but keeps a lit rim on the light side", () => {
    const shapes = mascotShapes(scene({ camera: { ...REST.camera, yaw: -60 } }));
    const head = shapes.find((shape) => shape.id.startsWith("head-base") && !shape.id.includes("-shade") && !shape.id.includes("-lit") && !shape.id.includes("-rim"))!;
    const rim = shapes.find((shape) => shape.id.startsWith("head-base") && shape.id.endsWith("-rim"))!;
    expect((head.paint as { color: string }).color).not.toBe(mascotV2Colors.body);
    expect((rim.paint as { color: string }).color).toBe(mascotV2Colors.body);
    // The light comes from the left: the rim band's area lies on the head's left side.
    const ring = pointsOf(rim.d);
    let area = 0, cx = 0;
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length]!;
      const cross = a.x * b.y - b.x * a.y;
      area += cross;
      cx += (a.x + b.x) * cross;
    });
    expect(cx / (3 * area)).toBeLessThan(centre([head.d]).x);
    expect(mascotShapes(scene()).some((shape) => shape.id.endsWith("-rim"))).toBe(false);
  });

  it("turning the character and orbiting the camera give the same silhouette but different light", () => {
    const turned = scene({ turn: 30 });
    const orbited = scene({ camera: { ...REST.camera, yaw: 30 } });
    // The base fills and outlines match; the shading and the cast shadow follow the world-fixed light.
    const silhouette = (s: MascotScene) => JSON.stringify(mascotShapes(s).filter((shape) => /-(base|outline)$/.test(shape.id) || /^hair-strand_\d$/.test(shape.id)).map((shape) => shape.d));
    expect(silhouette(orbited)).toBe(silhouette(turned));
    const shading = (s: MascotScene) => JSON.stringify(mascotShapes(s).filter((shape) => /-shade-|-lit$/.test(shape.id)));
    expect(shading(orbited)).not.toBe(shading(turned));
    const cast = (s: MascotScene) => JSON.stringify(s.layers.find((layer) => layer.id === "cast-shadow")!.shapes);
    expect(cast(orbited)).not.toBe(cast(turned));
    expect(lightAzimuth(cameraLight(30, 0))).toBeCloseTo(30, 9);
    expect(lightAzimuth(cameraLight(30, 180))).toBeCloseTo(150, 9);
  });

  it("changes the picture for every control the V2 mascot will have", () => {
    const baseline = JSON.stringify(scene({ limbs: limbs({ armL: { bend: 40, twist: 90 }, legL: { bend: 30 } }) }));
    const variants: Array<[string, Partial<MascotV2SceneInput>]> = [
      ["turn", { turn: 20 }],
      ["orbit yaw", { camera: { ...REST.camera, yaw: 20 } }],
      ["pitch", { camera: { ...REST.camera, pitch: 15 } }],
      ["scale", { camera: { ...REST.camera, scale: 1.4 } }],
      ["lean", { body: { ...REST.body, lean: 10 } }],
      ["squash", { body: { ...REST.body, squash: 0.2 } }],
      ["lift", { body: { ...REST.body, lift: 30 } }],
      ["softness", { body: { ...REST.body, softness: 40 } }],
      ["pivot", { body: { ...REST.body, lean: 10, pivot: { x: 20, y: -40 } } }],
      ["hair bend", { hair: { ...REST.hair, bend: 25 } }],
      ["hair sweep", { hair: { ...REST.hair, sweep: 25 }, turn: 60 }],
      ["hair wave", { hair: { ...REST.hair, wave: 15 } }],
      ["band tilt", { hair: { ...REST.hair, bandTilt: 15 } }],
      ["eyes", { face: { eyes: "blink", mouth: "happy" } }],
      ["mouth", { face: { eyes: "open", mouth: "sad" } }],
      ["light", { lightAngle: 70 }],
      ["ground", { ground: { ...REST.ground, size: 1.5 } }],
      ["cast", { cast: { ...REST.cast, length: 1.2 } }],
      ["drop", { drop: { ...REST.drop, offset: { x: 0.3, y: 0.1 } } }],
    ];
    for (const key of ["raise", "swing", "twist", "bend", "end", "straighten", "length", "bandTilt"] as const) {
      variants.push([`arm ${key}`, { limbs: limbs({ armL: { bend: 40, twist: 90, [key]: key === "length" ? 1.2 : key === "straighten" ? 0.6 : 25 } }) }]);
    }
    variants.push(["flip hand", { limbs: limbs({ armL: { bend: 40, flipHand: true, twist: 90 } }) }]);
    variants.push(["fist", { limbs: limbs({ armL: { bend: 40, hand: "fist", twist: 90 } }) }]);
    variants.push(["money bag", { limbs: limbs({ armL: { bend: 40, moneyBag: true, twist: 90 } }) }]);
    for (const key of ["raise", "swing", "bend", "end", "length"] as const) {
      variants.push([`leg ${key}`, { limbs: limbs({ armL: { bend: 40, twist: 90 }, legL: { bend: 30, [key]: key === "length" ? 1.2 : 20 } }) }]);
    }
    for (const [label, patch] of variants) {
      // Every variant keeps the baseline's bent elbow and knee unless it sets its own limbs.
      const withBend = patch.limbs ? patch : { ...patch, limbs: limbs({ armL: { bend: 40, twist: 90 }, legL: { bend: 30 } }) };
      expect(JSON.stringify(scene(withBend)), label).not.toBe(baseline);
    }
  });
});
