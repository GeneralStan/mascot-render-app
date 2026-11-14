/** Shared vector scene types for the mascot preview, exports and bounds. */

export const MASCOT_GROUND_Y = 300;

export type MascotGradientStop = Readonly<{ alpha: number; color: string; offset: number }>;

/** A linear gradient in world space: offset 0 at `from`, 1 at `to`. */
export type MascotLinearGradient = Readonly<{
  from: Readonly<{ x: number; y: number }>;
  stops: readonly MascotGradientStop[];
  to: Readonly<{ x: number; y: number }>;
}>;

/** A solid colour, or a linear gradient (`color` is then its first stop, for anything that can't draw gradients). */
export type MascotPaint =
  | Readonly<{ color: string; gradient?: MascotLinearGradient; kind: "fill" }>
  | Readonly<{ color: string; gradient?: MascotLinearGradient; kind: "stroke"; width: number }>;

/** The named V2 part a shape belongs to, for SVG export groups: its group (Leg_L, Arm_R, Body, Headband) and part (foot_L, hand_fist_R, strand_3, face). */
export type MascotShapePart = Readonly<{ group: string; part: string }>;

export type MascotShape = Readonly<{
  clipId?: string;
  d: string;
  id: string;
  /** The shape's own opacity, 0 to 1 (1 when absent). */
  opacity?: number;
  paint: MascotPaint;
  part?: MascotShapePart;
}>;

export type MascotClip = Readonly<{ d: string; id: string }>;

export type MascotRect = Readonly<{ height: number; width: number; x: number; y: number }>;

export type MascotLayerId = "cast-shadow" | "ground-shadow" | "drop-shadow" | "mascot";

export type MascotLayer = Readonly<{
  blur: number;
  bounds: MascotRect;
  id: MascotLayerId;
  opacity: number;
  shapes: readonly MascotShape[];
}>;

export type MascotScene = Readonly<{
  bounds: MascotRect;
  clips: readonly MascotClip[];
  layers: readonly MascotLayer[];
  /**
   * The body pivot in world space, where Lean turns and Squash stretches the body. Only the
   * preview draws it (its pivot marker); exports and bounds leave it out.
   */
  pivot?: Readonly<{ x: number; y: number }>;
}>;
