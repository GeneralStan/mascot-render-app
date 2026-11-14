/**
 * The preview's pivot marker: where Lean turns and Squash stretches the body (Body > Pivot).
 * It is an editing guide drawn only in the preview, over the mascot and under the orbit
 * surface, and it takes no pointer input. PNG, SVG and video export never draw it.
 *
 * The centre dot's colour appears nowhere in the mascot's palette, so the dot stays one
 * compact, findable feature on screen.
 */
export const MASCOT_PIVOT_MARKER = {
  /** The centre dot (world px). */
  dot: { color: "#0D99FF", radius: 6 },
  /** The disc behind the dot, with a soft ink edge so it reads on the coral body and on a light background (world px). */
  ring: { color: "#FFFFFF", edge: "#031E19", edgeOpacity: 0.45, edgeWidth: 1.5, radius: 11 },
} as const;
