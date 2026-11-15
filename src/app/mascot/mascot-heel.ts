/**
 * Where the leg's shade carries on round the heel.
 *
 * The foot is drawn over the leg with its heel tucked inside the leg's end. In the drawing the
 * leg's shade band runs on down to the floor on the heel's side, its edge following the heel's
 * curve, and on the toe's side the foot simply covers it. Re-lit, the band's edge and the heel
 * no longer meet exactly, so:
 * - `under` (painted before the foot): the leg's end below the foot's middle, from the band's
 *   edge round under the heel, when the band is on the heel's side. As drawn, the band's edge
 *   leaves its line at the heel's widest point and curves under it to the floor (above that the
 *   leg stays lit), so no lit leg shows between the heel and the band;
 * - `over` (painted on the foot, clipped to it): the heel side's band carried on down over the
 *   foot to the floor, its edge running on as it does above, so the heel's rounded end never
 *   shows as a lit cap against the band.
 * A band on the toe's side is left alone: there the foot covers it, as drawn.
 *
 * And `lit` (painted on the foot in its lit colour, before `over`): the heel's rounded end down to
 * the sole's shade strip. The foot is re-lit as a copy moved toward the light, which leaves a shade
 * crescent round each end; tucked into the leg, the heel's would show as the end of a cylinder
 * (worst when the foot is foreshortened and its end squashed to an ellipse). As drawn, only the
 * sole's strip runs under the heel.
 */

import { behindLine, sub, unit } from "./mascot-geometry";
import type { Point } from "./mascot-path";

/** The band must cover at least this share of the leg below the foot's middle on the heel's side. */
const BAND_ON_HEEL_SIDE = 0.05;

export type MascotHeelInput = Readonly<{
  /** The ankle (the leg's end joint) and the knee, on screen. */
  ankle: Point;
  /** The foot's lengthwise direction on screen (either way along it). */
  axis: Point;
  /** The leg's shade bands, as `shadeTube` gives them. */
  bands: readonly (readonly Point[])[];
  /** The foot's base outline points, on screen. */
  foot: readonly Point[];
  knee: Point;
  /** The leg's two edges, root to end, on screen. */
  leg: readonly [readonly Point[], readonly Point[]];
  /** One drawn unit across the foot, on screen: with `axis` (one along it), how foreshortened it is. */
  lift: Point;
  /** How far the foot's lit copy is moved toward the light. */
  shift: Point;
}>;

export type MascotHeelShade = Readonly<{
  lit: readonly (readonly Point[])[];
  over: readonly (readonly Point[])[];
  under: readonly (readonly Point[])[];
}>;

const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;

export function polygonArea(polygon: readonly Point[]): number {
  return Math.abs(polygon.reduce((sum, p, i) => {
    const q = polygon[(i + 1) % polygon.length]!;
    return sum + p.x * q.y - q.x * p.y;
  }, 0)) / 2;
}

export function heelShade({ ankle, axis, bands, foot, knee, leg, lift, shift }: MascotHeelInput): MascotHeelShade {
  const none: MascotHeelShade = { lit: [], over: [], under: [] };
  if (foot.length === 0 || Math.hypot(axis.x, axis.y) < 1e-9) return none;
  const centre = foot.reduce((sum, p) => ({ x: sum.x + p.x / foot.length, y: sum.y + p.y / foot.length }), { x: 0, y: 0 });
  // Toward the toe along the foot, and from the foot's top (where the leg comes in) toward its sole.
  const along = unit(axis);
  const toe = dot(sub(centre, ankle), along) < 0 ? { x: -along.x, y: -along.y } : along;
  const across = { x: -toe.y, y: toe.x };
  const sole = dot(sub(knee, ankle), across) > 0 ? { x: -across.x, y: -across.y } : across;
  const depths = foot.map((p) => dot(sub(p, ankle), sole));
  const middle = (Math.min(...depths) + Math.max(...depths)) / 2;
  const middleAt = { x: ankle.x + sole.x * middle, y: ankle.y + sole.y * middle };
  const notUp = { x: -sole.x, y: -sole.y };
  const heelSide = (polygon: readonly Point[]) => behindLine(polygon, ankle, toe);
  const lowerHalf = (polygon: readonly Point[]) => behindLine(polygon, middleAt, notUp);

  // The leg's end: back from its tip as far as the foot is thick.
  const thickness = Math.max(...depths) - Math.min(...depths);
  const [edgeA, edgeB] = leg;
  const count = Math.min(edgeA.length, edgeB.length);
  const far = edgeA.slice(0, count).map((a, i) => Math.hypot((a.x + edgeB[i]!.x) / 2 - ankle.x, (a.y + edgeB[i]!.y) / 2 - ankle.y) > thickness);
  const from = far.lastIndexOf(true) + 1;
  const end = [...edgeA.slice(from, count), ...edgeB.slice(from, count).reverse()];

  // The heel's rounded end, down to where the sole's shade strip starts.
  const heelEnd = Math.min(...foot.map((p) => dot(sub(p, ankle), toe)));
  const capStart = heelEnd + (thickness / 2) * (Math.hypot(axis.x, axis.y) / Math.max(Math.hypot(lift.x, lift.y), 1e-9));
  const stripTop = Math.max(...depths) + Math.min(0, dot(shift, sole));
  const at = (t: number, d: number): Point => ({ x: ankle.x + toe.x * t + sole.x * d, y: ankle.y + toe.y * t + sole.y * d });
  const lowest = Math.min(...depths) - thickness;
  const lit = [[at(heelEnd - thickness, lowest), at(capStart, lowest), at(capStart, stripTop), at(heelEnd - thickness, stripTop)]];

  const beside = lowerHalf(heelSide(end));
  const room = beside.length >= 3 ? polygonArea(beside) : 0;
  if (room <= 0) return { ...none, lit };
  const onHeelSide = (band: readonly Point[]) => {
    const part = lowerHalf(heelSide(band));
    return part.length >= 3 && polygonArea(part) >= BAND_ON_HEEL_SIDE * room;
  };
  const over = bands.filter(onHeelSide);
  // The band's edge at the foot's middle, and the floor under the heel's rounded end.
  const crossings = over.flatMap((band) => band.flatMap((p, i) => {
    const q = band[(i + 1) % band.length]!;
    const a = dot(sub(p, ankle), sole) - middle, b = dot(sub(q, ankle), sole) - middle;
    return (a < 0) === (b < 0) || a === b ? [] : [{ x: p.x + ((q.x - p.x) * a) / (a - b), y: p.y + ((q.y - p.y) * a) / (a - b) }];
  }));
  if (crossings.length === 0) return { lit, over, under: [] };
  const edge = crossings.reduce((best, p) => (dot(sub(p, ankle), toe) > dot(sub(best, ankle), toe) ? p : best));
  const floor = at((heelEnd + capStart) / 2, Math.max(...depths));
  const curve = { x: -(floor.y - edge.y), y: floor.x - edge.x };
  const towardToe = dot(curve, toe) < 0 ? { x: -curve.x, y: -curve.y } : curve;
  const under = behindLine(lowerHalf(end), edge, towardToe);
  return { lit, over, under: under.length >= 3 ? [under] : [] };
}
