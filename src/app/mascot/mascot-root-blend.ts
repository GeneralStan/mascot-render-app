/**
 * Blends a tube into the surface it grows out of: a near arm over the body at its shoulder.
 *
 * Where the tube's root lies over that surface, its outline fades in from nothing, and its
 * shade band and highlight start only once the outline is there. The blend runs from the
 * root to where the tube leaves the surface's silhouette, kept between `MASCOT_ROOT_BLEND`'s
 * shortest and longest, so past it the tube reads as its own piece again.
 */

import type { Point } from "./mascot-path";
import type { MascotGradientStop } from "./mascot-scene-types";

/** How far along the tube (drawn px) the blend runs: at least `min`, and at most `max` even while the tube stays over the surface. */
export const MASCOT_ROOT_BLEND = { max: 56, min: 12 } as const;

const smoothstep = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** Even-odd point-in-polygon test. */
export function insidePolygon(polygon: readonly Point[], p: Point): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** A tube's root blend: how far it runs (drawn px), the first sample past it, and each sample's weight (0 at the root, 1 past the blend). */
export type MascotRootBlend = Readonly<{ end: number; length: number; weights: readonly number[] }>;

/**
 * The blend for a tube whose samples sit at `arc` (drawn px from the root) with world-space
 * edges `a` and `b`: it lasts until either edge first leaves `silhouette`.
 */
export function rootBlend(arc: readonly number[], a: readonly Point[], b: readonly Point[], silhouette: readonly Point[]): MascotRootBlend {
  let exit = arc.length - 1;
  for (let i = 0; i < arc.length; i++) {
    if (!insidePolygon(silhouette, a[i]!) || !insidePolygon(silhouette, b[i]!)) {
      exit = i;
      break;
    }
  }
  const length = Math.min(MASCOT_ROOT_BLEND.max, Math.max(MASCOT_ROOT_BLEND.min, arc[exit]!));
  const found = arc.findIndex((s) => s >= length);
  const end = found < 0 ? arc.length - 1 : Math.max(1, found);
  return { end, length, weights: arc.map((s) => smoothstep(s / length)) };
}

/** Gradient stops that fade `color` in from nothing (offset 0) to solid (offset 1), easing in and out. */
export function fadeInStops(color: string): MascotGradientStop[] {
  return [0, 0.25, 0.5, 0.75, 1].map((offset) => ({ alpha: smoothstep(offset), color, offset }));
}
