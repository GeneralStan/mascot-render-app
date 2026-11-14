import { describe, expect, it } from "vitest";

import { axisPoint, bandShape, bodySilhouette, bodySurfaceMap } from "./mascot-body-volume";
import { parsePath, type Point } from "./mascot-path";
import { MASCOT_V2_REST_HAIR, poseV2Strands } from "./mascot-v2-hair";
import { mascotV2Views } from "./mascot-v2-parts";
import { MASCOT_V2_REST_POSE } from "./mascot-v2-pose";
import { MASCOT_V2_DRAWN_LIGHT_ANGLE } from "./mascot-relight";
import { MASCOT_V2_BODY_PIVOT } from "./mascot-v2-rig";
import { buildMascotV2Scene, type MascotV2SceneInput } from "./mascot-v2-scene";
import { MASCOT_MAX_PITCH_DEGREES, readOrbitView } from "./mascot-settings";

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const xs = (points: readonly Point[]) => points.map((p) => p.x);
const ys = (points: readonly Point[]) => points.map((p) => p.y);
const headBase = mascotV2Views.front.parts.head!.find((layer) => layer.role === "base")!.shapes[0]!.d;
const drawnPoints = parsePath(headBase).flatMap((s) => (s.kind === "Z" ? [] : [s.to]));
const drawnTop = Math.min(...ys(drawnPoints)), drawnBottom = Math.max(...ys(drawnPoints));
const drawnHalfWidth = (Math.max(...xs(drawnPoints)) - Math.min(...xs(drawnPoints))) / 2;

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
const tilted = (pitch: number) => buildMascotV2Scene({ ...REST, camera: { ...REST.camera, pitch } });
const ids = (pitch: number) => tilted(pitch).layers.find((layer) => layer.id === "mascot")!.shapes.map((shape) => shape.id);

describe("the body as a round volume for tilted views", () => {
  it("has the drawn outline when level, and shows the crown looking down and the underside looking up", () => {
    const level = bodySilhouette(radians(0.01));
    expect(Math.max(...xs(level))).toBeCloseTo(drawnHalfWidth, 0);
    expect(Math.min(...ys(level))).toBeCloseTo(drawnTop, 0);
    expect(Math.max(...ys(level))).toBeCloseTo(drawnBottom, 0);
    // Looking down, the crown rises above where the top of the head's axis lands.
    const down = bodySilhouette(radians(60));
    expect(Math.min(...ys(down))).toBeLessThan(axisPoint({ x: 0, y: drawnTop }, radians(60)).y - 20);
    // Looking up, the underside drops below the bottom of the axis.
    const up = bodySilhouette(radians(-60));
    expect(Math.max(...ys(up))).toBeGreaterThan(axisPoint({ x: 0, y: drawnBottom }, radians(-60)).y + 20);
    // Straight down the body is a circle as wide as its widest part.
    const top = bodySilhouette(radians(90));
    expect(Math.max(...xs(top)) - Math.min(...xs(top))).toBeCloseTo(Math.max(...ys(top)) - Math.min(...ys(top)), 0);
  });

  it("slides the face down the body looking down and up it looking up", () => {
    const eye = { x: -20, y: -280 };
    const level = axisPoint(eye, 0).y;
    expect(bodySurfaceMap(radians(40))(eye).y).toBeGreaterThan(axisPoint(eye, radians(40)).y);
    expect(bodySurfaceMap(radians(-40))(eye).y).toBeLessThan(axisPoint(eye, radians(-40)).y);
    expect(bodySurfaceMap(0)(eye).y).toBeCloseTo(level, 9);
  });

  it("closes the headband into a ring round the crown looking down from 35°, and narrows it to an arch looking up", () => {
    const closed = (pitch: number) => {
      const top = bandShape(radians(pitch)).stripes[0]!.polygon;
      // The top edge starts and ends behind the crown once the ring has closed.
      return Math.hypot(top[0]!.x - top[48]!.x, top[0]!.y - top[48]!.y) < 0.5;
    };
    expect(closed(20)).toBe(false);
    expect(closed(36)).toBe(true);
    const width = (pitch: number) => {
      const stripes = bandShape(radians(pitch)).stripes;
      return stripes.length === 0 ? 0 : Math.max(...stripes.flatMap((s) => xs(s.polygon))) - Math.min(...stripes.flatMap((s) => xs(s.polygon)));
    };
    expect(width(-30)).toBeLessThan(width(-1));
    expect(width(-80)).toBe(0);
  });

  it("leans the tuft back looking down, so it fans out over the crown instead of shrinking to a line", () => {
    const depth = (pitch: number) => {
      const strands = poseV2Strands({ pitch, yaw: 0 }, MASCOT_V2_REST_HAIR);
      const all = strands.flatMap((s) => s.midline);
      return Math.max(...ys(all)) - Math.min(...ys(all));
    };
    expect(depth(89)).toBeGreaterThan(depth(0) * 0.5);
    // Level, the tuft is as drawn: the lean only starts looking down.
    expect(depth(-30)).toBeLessThan(depth(0));
  });

  it("paints the hair over the crown looking down and the legs over the underside looking up, blended in", () => {
    const down = ids(50);
    expect(down.findIndex((id) => id.startsWith("hair-"))).toBeGreaterThan(down.findIndex((id) => id.startsWith("headband-")));
    expect(down.some((id) => /^hair-strand_\d-outline-root-0$/.test(id))).toBe(true);
    const level = ids(0);
    expect(level.findIndex((id) => id.startsWith("hair-"))).toBeLessThan(level.findIndex((id) => id.startsWith("head-")));
    const up = ids(-50);
    expect(up.findIndex((id) => id.startsWith("leg-"))).toBeGreaterThan(up.findIndex((id) => id.startsWith("head-")));
    expect(up.some((id) => id === "leg-L-outline-root-0")).toBe(true);
  });

  it("fades the floor's shadows out looking up from below it", () => {
    const opacity = (pitch: number, id: string) => tilted(pitch).layers.find((layer) => layer.id === id)!.opacity;
    expect(opacity(0, "ground-shadow")).toBeGreaterThan(0);
    expect(opacity(-20, "ground-shadow")).toBe(0);
    expect(opacity(-20, "cast-shadow")).toBe(0);
  });

  it("lets the camera look straight down or up", () => {
    expect(MASCOT_MAX_PITCH_DEGREES).toBe(90);
    const orbit = (pitch: number) => ({ position: [0, Math.sin(radians(pitch)) * 5, Math.cos(radians(pitch)) * 5], up: [0, 1, 0] });
    expect(readOrbitView(orbit(75)).pitch).toBeCloseTo(75, 6);
    expect(readOrbitView(orbit(-75)).pitch).toBeCloseTo(-75, 6);
    expect(readOrbitView({ position: [0, 5, 0], up: [0, 0, -1] }).pitch).toBe(90);
    expect(MASCOT_V2_BODY_PIVOT.y).toBeCloseTo(drawnBottom, 0);
  });
});
