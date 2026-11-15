import { describe, expect, it } from "vitest";

import { parsePath } from "./mascot-path";
import { faceAt } from "./mascot-v2-face";
import { mascotV2Colors, mascotV2Views } from "./mascot-v2-parts";

type Box = { h: number; w: number; x: number; y: number };
function boxOf(ds: readonly string[]): Box {
  const points = ds.flatMap((d) => parsePath(d).flatMap((s) => (s.kind === "Z" ? [] : s.kind === "C" ? [s.c1, s.c2, s.to] : [s.to])));
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  return { h: Math.max(...ys) - Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}
const eye = (yaw: number, which: "near" | "far") => {
  const parts = faceAt(yaw, "open", "happy").filter((part) => part.id.startsWith(`eye-${which}-0`));
  return parts.length ? boxOf(parts.map((part) => part.d)) : null;
};
const drawnEyes = (view: "front" | "threeQuarter" | "side") => {
  const shapes = mascotV2Views[view].face!.eyes_open;
  const discs = [];
  for (let i = 0; i < shapes.length; i += 2) discs.push(boxOf([shapes[i]!.d]));
  return discs.sort((a, b) => a.x - b.x);
};

describe("V2 face turning", () => {
  it("lands exactly on the drawn eyes at the front, 3/4 and side", () => {
    const close = (a: Box | null, b: Box) => expect(a && Math.hypot(a.x - b.x, a.y - b.y) + Math.abs(a.w - b.w)).toBeLessThan(0.05);
    const [frontL, frontR] = drawnEyes("front");
    close(eye(0, "near"), frontL!);
    close(eye(0, "far"), frontR!);
    const [quarterNear, quarterFar] = drawnEyes("threeQuarter");
    close(eye(30, "near"), quarterNear!);
    close(eye(30, "far"), quarterFar!);
    close(eye(90, "near"), drawnEyes("side")[0]!);
    expect(eye(90, "far")).toBeNull();
  });

  it("never puts the far eye on the near one: it narrows round the head's edge and is gone before the side", () => {
    let lastWidth = Infinity;
    for (let yaw = -135; yaw <= 135; yaw += 1) {
      const near = eye(yaw, "near"), far = eye(yaw, "far");
      if (near && far) {
        const gap = Math.abs(far.x - near.x) - (far.w + near.w) / 2;
        expect(gap, `${yaw}`).toBeGreaterThan(2);
      }
      if (yaw >= 30 && yaw <= 90) {
        const width = far?.w ?? 0;
        expect(width, `${yaw}`).toBeLessThanOrEqual(lastWidth + 1e-9);
        lastWidth = width;
      }
    }
    expect(eye(80, "far")).toBeNull();
    expect(eye(-80, "far")).toBeNull();
  });

  it("draws the Faces_V2 mouths' shadow in the body's shade colour at full strength, so it shows on the body", () => {
    for (const mouth of ["excited", "neutral", "sad"] as const) {
      const shadow = faceAt(0, "open", mouth).filter((part) => part.id.startsWith("mouth-shadow"));
      expect(shadow.length, mouth).toBeGreaterThan(0);
      for (const part of shadow) {
        expect(part.fill).toBe(mascotV2Colors.bodyShade);
        expect(part.opacity).toBeUndefined();
      }
    }
  });

  it("turns the mouth smoothly from the front smile to the profile mouth", () => {
    const mouth = (yaw: number) => boxOf(faceAt(yaw, "open", "happy").filter((part) => part.id.startsWith("mouth")).map((part) => part.d));
    for (let yaw = 0; yaw < 90; yaw += 1) {
      const a = mouth(yaw), b = mouth(yaw + 1);
      // No jumps: at most 3 px per degree, the fastest part of the blend between drawings.
      expect(Math.hypot(b.x - a.x, b.y - a.y) + Math.abs(b.w - a.w), `${yaw}`).toBeLessThan(3);
    }
  });
});
