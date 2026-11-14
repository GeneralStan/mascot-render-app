import { describe, expect, it } from "vitest";

import { parsePath, type Point } from "./mascot-path";
import {
  backlightWash,
  cameraLight,
  crescentShift,
  highlightMap,
  lightAzimuth,
  limbHighlights,
  rimBand,
  rimShare,
  MASCOT_V2_DRAWN_LIGHT,
  MASCOT_V2_DRAWN_LIGHT_ANGLE,
  MASCOT_V2_RIM_RADII,
  shadeStrand,
  shadeTube,
  strandHighlights,
  terminatorShare,
  tubeShare,
  type MascotLight,
  type MascotRimRadii,
} from "./mascot-relight";
import { tubeEdges } from "./mascot-tube";
import { centreOf, limbArtFrom, strandArtAt } from "./mascot-v2-art";
import { mascotV2Props, mascotV2Views, type MascotV2Layer } from "./mascot-v2-parts";
import { MASCOT_V2_REST_POSE, poseV2Limb } from "./mascot-v2-pose";

type Polygon = readonly Point[];

/** Flattens a path into polygons (curves in 16 steps). */
function polygons(d: string): Point[][] {
  const out: Point[][] = [];
  let current: Point[] = [];
  let last: Point = { x: 0, y: 0 };
  let start = last;
  for (const segment of parsePath(d)) {
    if (segment.kind === "M") {
      if (current.length > 2) out.push(current);
      current = [segment.to];
      last = start = segment.to;
    } else if (segment.kind === "L") {
      current.push(segment.to);
      last = segment.to;
    } else if (segment.kind === "C") {
      for (let i = 1; i <= 16; i++) {
        const t = i / 16, u = 1 - t;
        current.push({
          x: u * u * u * last.x + 3 * u * u * t * segment.c1.x + 3 * u * t * t * segment.c2.x + t * t * t * segment.to.x,
          y: u * u * u * last.y + 3 * u * u * t * segment.c1.y + 3 * u * t * t * segment.c2.y + t * t * t * segment.to.y,
        });
      }
      last = segment.to;
    } else {
      last = start;
    }
  }
  if (current.length > 2) out.push(current);
  return out;
}

/** Non-zero winding test: edges crossing upward and downward past the point don't cancel out. */
function inside(shapes: readonly Polygon[], p: Point): boolean {
  let upward = 0;
  let downward = 0;
  for (const poly of shapes) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
      const side = (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
      if (a.y <= p.y) {
        if (b.y > p.y && side > 0) upward++;
      } else if (b.y <= p.y && side < 0) {
        downward++;
      }
    }
  }
  return upward !== downward;
}

/** Overlap (intersection over union) of the modelled and drawn shade, inside `within`, on a grid. */
function overlap(within: readonly Polygon[], model: (p: Point) => boolean, drawn: readonly Polygon[], step = 0.25): number {
  const points = within.flat();
  const minX = Math.min(...points.map((p) => p.x)), maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y)), maxY = Math.max(...points.map((p) => p.y));
  let both = 0, either = 0;
  for (let y = minY + step / 2; y < maxY; y += step) {
    for (let x = minX + step / 2; x < maxX; x += step) {
      const p = { x, y };
      if (!inside(within, p)) continue;
      const m = model(p), d = inside(drawn, p);
      if (m && d) both++;
      if (m || d) either++;
    }
  }
  return both / Math.max(1, either);
}

const shapesOf = (layers: readonly MascotV2Layer[], role: string, keep: (fill?: string) => boolean = () => true) =>
  layers.filter((layer) => layer.role === role).flatMap((layer) => layer.shapes.filter((shape) => keep(shape.fill)).flatMap((shape) => polygons(shape.d)));

/** The crescent model's shade for a rigid part in its drawing: the base minus the base moved by the shift. */
function crescentOverlap(layers: readonly MascotV2Layer[], along: Point, radii: MascotRimRadii, keep?: (fill?: string) => boolean): number {
  const base = shapesOf(layers, "base", keep);
  const shift = crescentShift(MASCOT_V2_DRAWN_LIGHT, along, radii);
  return overlap(base, (p) => !inside(base, { x: p.x - shift.x, y: p.y - shift.y }), shapesOf(layers, "shade"));
}

/** The tube model's shade (bands clipped to the tube) against the drawn shade, inside the tube. */
function tubeOverlap(edges: readonly [readonly Point[], readonly Point[]], bands: readonly Polygon[], layers: readonly MascotV2Layer[]): number {
  const ring = [...edges[0], ...[...edges[1]].reverse()];
  const within = [ring].filter(() => true);
  const drawnBase = shapesOf(layers, "base");
  return overlap(within, (p) => inside(drawnBase, p) && bands.some((band) => inside([band], p)), shapesOf(layers, "shade"));
}

const front = mascotV2Views.front;
const STRANDS = ["strand_1", "strand_2", "strand_3", "strand_4", "strand_5"] as const;
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const lightsAround = () => Array.from({ length: 72 }, (_, i) => i * 5);
const inPlane = (light: MascotLight, v: Point) => light.x * v.x + light.y * v.y;

describe("V2 re-lighting", () => {
  it("keeps one light fixed in the world, from the drawn 160° by default", () => {
    expect(lightAzimuth(MASCOT_V2_DRAWN_LIGHT)).toBeCloseTo(MASCOT_V2_DRAWN_LIGHT_ANGLE, 9);
    for (const angle of lightsAround()) {
      for (const yaw of [-120, -45, 0, 30, 90, 180]) {
        const light = cameraLight(angle, yaw);
        expect(Math.hypot(light.x, light.y, light.z)).toBeCloseTo(1, 9);
      }
      expect(((lightAzimuth(cameraLight(angle, 0)) % 360) + 360) % 360).toBeCloseTo(angle, 6);
      // Orbiting halfway round puts the light on the other side and behind.
      const turned = cameraLight(angle, 180), ahead = cameraLight(angle, 0);
      expect(turned.x).toBeCloseTo(-ahead.x, 9);
      expect(turned.z).toBeCloseTo(-ahead.z, 9);
    }
    expect(backlightWash(cameraLight(160, 0))).toBe(0);
    expect(backlightWash(cameraLight(160, 180))).toBeGreaterThan(0.5);
  });

  it("shades a rounded edge more as the light comes round to its side, continuously", () => {
    expect(terminatorShare(0, 0.3)).toBe(0);
    for (const front of [0.6, 0.3, 0.05, -0.2]) {
      let last = terminatorShare(-1, front);
      for (let c = -1; c <= 1.0001; c += 0.01) {
        const share = terminatorShare(c, front);
        expect(Math.abs(share)).toBeLessThanOrEqual(1);
        expect(share * c).toBeGreaterThanOrEqual(0);
        expect(share).toBeCloseTo(-terminatorShare(-c, front), 12);
        expect(share - last, `front ${front} c ${c.toFixed(2)}`).toBeGreaterThanOrEqual(-1e-12);
        expect(share - last).toBeLessThan(0.25);
        last = share;
      }
    }
  });

  it("matches the drawn shade at the drawn light (front view)", () => {
    const up = { x: 0, y: -1 };
    const results: Record<string, number> = {
      head: crescentOverlap(front.parts.head!, up, MASCOT_V2_RIM_RADII.head),
      headband: crescentOverlap(front.parts.headband!, up, MASCOT_V2_RIM_RADII.headband),
      moneyBag: crescentOverlap(mascotV2Props.moneyBag.layers, { x: 0, y: 1 }, MASCOT_V2_RIM_RADII.moneyBag, (fill) => fill === "#FFBE00"),
    };
    for (const side of ["L", "R"] as const) {
      const art = limbArtFrom({ mirror: false, view: "front", yaw: 0 }, "arm", side);
      const band = front.parts[`armband_${side}`]!;
      const bandCentre = centreOf(band);
      const i = art.tube.midline.reduce((best, p, j) => (Math.hypot(p.x - bandCentre.x, p.y - bandCentre.y) < Math.hypot(art.tube.midline[best]!.x - bandCentre.x, art.tube.midline[best]!.y - bandCentre.y) ? j : best), 0);
      const line = art.tube.midline, last = line.length - 1;
      results[`armband_${side}`] = crescentOverlap(band, sub(line[Math.min(last, i + 2)]!, line[Math.max(0, i - 2)]!), MASCOT_V2_RIM_RADII.armband);
      results[`foot_${side}`] = crescentOverlap(front.parts[`foot_${side}`]!, sub(centreOf(front.parts[`foot_${side}`]!), front.pivots[`Ankle_${side}`]!), MASCOT_V2_RIM_RADII.foot);
    }
    results.hand_open_L = crescentOverlap(front.parts.hand_open_L!, sub(centreOf(front.parts.hand_open_L!), front.pivots.Wrist_L!), MASCOT_V2_RIM_RADII.hand);
    for (const kind of ["arm", "leg"] as const) {
      const art = limbArtFrom({ mirror: false, view: "front", yaw: 0 }, kind, "L");
      const edges = tubeEdges(art.tube);
      results[`${kind}_L`] = tubeOverlap(edges, shadeTube(edges, MASCOT_V2_DRAWN_LIGHT, limbHighlights(kind)).bands, front.parts[`${kind}_L`]!);
    }
    for (const strand of STRANDS) {
      const tube = strandArtAt(0, strand).tube;
      const edges = tubeEdges(tube);
      results[strand] = tubeOverlap(edges, shadeStrand(edges, tube.midline, MASCOT_V2_DRAWN_LIGHT, strandHighlights(strand)).bands, front.parts[strand]!);
    }
    // The head and bag carry a thin bottom band the drawing lacks, and the drawn feet differ from each other.
    const floor: Record<string, number> = {
      armband_L: 0.85, armband_R: 0.75, arm_L: 0.85, foot_L: 0.65, foot_R: 0.65, hand_open_L: 0.9, head: 0.85, headband: 0.95, leg_L: 0.95, moneyBag: 0.8,
      strand_1: 0.7, strand_2: 0.7, strand_3: 0.7, strand_4: 0.7, strand_5: 0.7,
    };
    for (const [part, value] of Object.entries(results)) expect(value, `${part} ${value.toFixed(2)}`).toBeGreaterThanOrEqual(floor[part]!);
  }, 30_000);

  it("puts a rigid part's shade away from the light, for every light angle and orbit, and moves it smoothly", () => {
    for (const yaw of [-60, 0, 45, 150]) {
      for (let axis = 0; axis < 360; axis += 30) {
        const along = { x: Math.cos((axis * Math.PI) / 180), y: Math.sin((axis * Math.PI) / 180) };
        let last: Point | null = null;
        for (const angle of [...lightsAround(), 360]) {
          const light = cameraLight(angle, yaw);
          const shift = crescentShift(light, along, MASCOT_V2_RIM_RADII.head);
          // The copy moves toward the light, so the uncovered crescent is on the far side.
          expect(inPlane(light, shift), `yaw ${yaw} axis ${axis} light ${angle}`).toBeGreaterThanOrEqual(-1e-9);
          if (last) expect(Math.hypot(shift.x - last.x, shift.y - last.y), `yaw ${yaw} axis ${axis} light ${angle}`).toBeLessThan(4);
          last = shift;
        }
      }
    }
  });

  it("shades the edge of every posed limb that faces away from the light, for turns -180 to 180", () => {
    for (let turn = -180; turn <= 180; turn += 30) {
      for (const kind of ["arm", "leg"] as const) {
        for (const side of ["L", "R"] as const) {
          const limb = poseV2Limb({ camera: { pitch: 0, yaw: turn }, kind, pose: { ...MASCOT_V2_REST_POSE, bend: 35, twist: 90 }, side, softness: 18 });
          const edges = tubeEdges(limb.tube, limb.midline);
          for (let angle = 0; angle < 360; angle += 30) {
            const light = cameraLight(angle, 0);
            const { bands } = shadeTube(edges, light, []);
            edges[0].forEach((a, i) => {
              const b = edges[1][i]!;
              const outwardA = sub(a, b);
              const widthA = Math.hypot(bands[0]![i]!.x - bands[0]![bands[0]!.length - 1 - i]!.x, bands[0]![i]!.y - bands[0]![bands[0]!.length - 1 - i]!.y);
              const widthB = Math.hypot(bands[1]![i]!.x - bands[1]![bands[1]!.length - 1 - i]!.x, bands[1]![i]!.y - bands[1]![bands[1]!.length - 1 - i]!.y);
              const label = `${kind}-${side} turn ${turn} light ${angle} sample ${i}`;
              // Only one edge is shaded, and it is the one turned away from the light.
              expect(Math.min(widthA, widthB), label).toBeLessThan(1e-9);
              if (widthA > 1e-6) expect(inPlane(light, outwardA), label).toBeLessThan(0);
              if (widthB > 1e-6) expect(inPlane(light, outwardA), label).toBeGreaterThan(0);
            });
          }
        }
      }
    }
  }, 30_000);

  it("shades the inside of every hair curl with the light above, and the outside with it below", () => {
    for (const strand of STRANDS) {
      const tube = strandArtAt(0, strand).tube;
      const edges = tubeEdges(tube);
      const shadedSide = (angle: number) => {
        const { bands } = shadeStrand(edges, tube.midline, cameraLight(angle, 0), []);
        const width = (band: Polygon) => band.slice(0, band.length / 2).reduce((sum, p, i) => sum + Math.hypot(p.x - band[band.length - 1 - i]!.x, p.y - band[band.length - 1 - i]!.y), 0);
        return width(bands[0]!) > width(bands[1]!) ? 0 : 1;
      };
      expect(shadedSide(90), strand).toBe(shadedSide(MASCOT_V2_DRAWN_LIGHT_ANGLE));
      expect(shadedSide(270), strand).not.toBe(shadedSide(90));
    }
  });

  it("leaves a lit rim on the light side when the light is behind", () => {
    const behind = cameraLight(160, -60);
    expect(behind.z).toBeLessThan(0);
    // A tube's shade covers more than half of it, so only a rim on the light side is lit.
    expect(Math.abs(tubeShare(0.7, -0.6))).toBeGreaterThan(1);
    expect(Math.abs(tubeShare(0.7, 0.3))).toBeLessThan(1);
    expect(tubeShare(0, -0.5)).toBeCloseTo(2, 9);
    expect(rimShare(0.7, 0.3)).toBe(0);
    expect(rimShare(-0.7, -0.6)).toBe(0);
    expect(rimShare(0.7, -0.6)).toBeGreaterThan(0);
    // A round part's rim band hugs the edges facing the light.
    const disc = Array.from({ length: 64 }, (_, i) => ({ x: 40 * Math.cos((i / 64) * 2 * Math.PI), y: 40 * Math.sin((i / 64) * 2 * Math.PI) }));
    const band = rimBand(disc, behind, { x: 0, y: -1 }, MASCOT_V2_RIM_RADII.head)!;
    // The band is the outline then its inner edge backwards; it is widest where the edge faces the light.
    const widths = disc.map((p, i) => Math.hypot(p.x - band[band.length - 1 - i]!.x, p.y - band[band.length - 1 - i]!.y));
    const widest = disc[widths.indexOf(Math.max(...widths))]!;
    expect(inPlane(behind, widest)).toBeGreaterThan(0);
    disc.forEach((p, i) => {
      if (inPlane(behind, p) <= 0) expect(widths[i]!).toBeLessThan(1e-9);
    });
    expect(rimBand(disc, cameraLight(160, 0), { x: 0, y: -1 }, MASCOT_V2_RIM_RADII.head)).toBeNull();
  });

  it("mirrors a drawn highlight across the part when the light crosses over, shrinking it through square-on", () => {
    const centre = { x: 0, y: 0 }, along = { x: 0, y: -1 }, drawnAt = { x: -60, y: -20 };
    const placedAt = (angle: number) => {
      const map = highlightMap(cameraLight(angle, 0), drawnAt, centre, along);
      return map ? map(drawnAt) : null;
    };
    expect(placedAt(160)).toEqual(drawnAt);
    expect(placedAt(20)!.x).toBeCloseTo(60, 9);
    // Light from straight above has no side, so the highlight has shrunk away.
    expect(placedAt(90)).toBeNull();
    const size = (angle: number) => {
      const map = highlightMap(cameraLight(angle, 0), drawnAt, centre, along);
      if (!map) return 0;
      const a = map({ x: -60, y: -30 }), b = map({ x: -60, y: -10 });
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    expect(size(160)).toBeCloseTo(20, 9);
    expect(size(100)).toBeLessThan(size(130));
  });
});
