/**
 * Poses the five V2 hair strands. Each strand is a tube blended between the drawings
 * around the current turn. The tuft is drawn the same from every side, so it keeps
 * its drawn shape and rides Hair_base. Its centreline goes through the same Bend,
 * Sweep and Wave maps as the V1 tuft:
 * - a constant-curvature bend about Hair_base
 * - a depth bend that shortens strands curling toward or away from the viewer
 * - a ripple that grows toward the tips
 *
 * It is then rebuilt around the new centreline, so every strand keeps its drawn
 * width. The root end stays open, planted under the headband.
 *
 * The tuft is drawn flat, so seen from straight above it would shrink to a line. Looking down,
 * it leans back about Hair_base (up to `MASCOT_V2_HAIR_LEAN` straight down), so the strands fan
 * out over the crown; level views keep it exactly as drawn.
 */

import { hairDeformMap, hairDepthBendMap } from "./mascot-hair";
import { serializePath, type Point } from "./mascot-path";
import { relaxMidline, tubeEdges, untangleMidline, type MascotTube } from "./mascot-tube";
import { strandArtAt, strandOrderAt } from "./mascot-v2-art";
import { MASCOT_V2_BODY_PIVOT, projectedJointsAt, turnHairPoint, type MascotV2StrandName } from "./mascot-v2-rig";
import type { MascotV2Camera } from "./mascot-v2-pose";

/** Hair pose in degrees, except Wave, which is the V1 ripple size in rig px (scaled by `MASCOT_V2_WAVE_SCALE`). */
export type MascotV2HairPose = Readonly<{ bend: number; sweep: number; wave: number; wavePhase: number }>;
export const MASCOT_V2_REST_HAIR: MascotV2HairPose = { bend: 0, sweep: 0, wave: 0, wavePhase: 0 };

export type MascotV2PosedStrand = Readonly<{
  fill: string;
  id: MascotV2StrandName;
  midline: readonly Point[];
  stroke: string;
  /** The strand's rest tube for this turn, and the drawn Hair_base it hangs from. */
  base: Point;
  tube: MascotTube;
}>;

const radians = (degrees: number) => (degrees * Math.PI) / 180;
/**
 * V2 strands are 11 to 16 px thick, so V1's ripple (up to 30 px for one thin tuft path)
 * would loop them over themselves. Wave is scaled down so its full range stays readable.
 */
export const MASCOT_V2_WAVE_SCALE = 0.4;
/** How far the tuft leans back about Hair_base when seen from straight above (radians, 50°). */
export const MASCOT_V2_HAIR_LEAN = (50 * Math.PI) / 180;

/** The strands in paint order for a turn, back to front. */
export function strandOrder(yaw: number): MascotV2StrandName[] {
  return strandOrderAt(yaw) as MascotV2StrandName[];
}

/** Poses every strand for the camera and hair pose, in paint order. */
export function poseV2Strands(camera: MascotV2Camera, pose: MascotV2HairPose): MascotV2PosedStrand[] {
  const strands = strandOrder(camera.yaw);
  const arts = strands.map((strand) => strandArtAt(camera.yaw, strand));
  const restBase = arts[0]!.base;
  const top = Math.min(...arts.flatMap((art) => art.tube.midline.map((p) => p.y - art.base.y + restBase.y)));
  const height = Math.max(restBase.y - top, 1);
  const yaw = radians(camera.yaw), pitch = radians(camera.pitch);
  const bendMap = hairDeformMap(restBase, height, {
    bend: radians(pose.bend) * Math.cos(yaw) + radians(pose.sweep) * Math.sin(yaw),
    phase: radians(pose.wavePhase),
    wave: pose.wave * MASCOT_V2_WAVE_SCALE,
  });
  const depthBend = hairDepthBendMap(restBase, height, radians(pose.sweep) * Math.cos(yaw) - radians(pose.bend) * Math.sin(yaw));
  const base = projectedJointsAt(camera.yaw).Hair_base;
  const pivotY = MASCOT_V2_BODY_PIVOT.y;
  // Leaning back moves a point's height above Hair_base into depth behind it, which looking down shows.
  const lean = MASCOT_V2_HAIR_LEAN * Math.max(0, Math.sin(pitch));
  const look = (p: Point): Point => {
    const up = p.y - base.y;
    const y = base.y + up * Math.cos(lean), z = up * Math.sin(lean);
    return { x: p.x, y: pivotY + (y - pivotY) * Math.cos(pitch) + z * Math.sin(pitch) };
  };

  return strands.map((strand, index) => {
    const art = arts[index]!;
    // Every drawing's strands are relative to its own Hair_base; bring them onto one base first.
    const onBase = (p: Point): Point => ({ x: p.x - art.base.x + restBase.x, y: p.y - art.base.y + restBase.y });
    const posed = art.tube.midline.map((p) => look(turnHairPoint(bendMap(depthBend(onBase(p))), restBase, base)));
    const midline = untangleMidline(art.tube, relaxMidline(art.tube, posed));
    const [a, b] = tubeEdges(art.tube, midline);
    const ring = [...a, ...[...b].reverse()];
    const stroke = serializePath([{ kind: "M", to: ring[0]! }, ...ring.slice(1).map((to) => ({ kind: "L" as const, to }))]);
    return { base: art.base, fill: `${stroke}Z`, id: strand, midline, stroke, tube: art.tube };
  });
}
