/**
 * Builds the posed V2 mascot as world-space vector shapes. It is the same `MascotScene` the
 * preview, raster and SVG export and scene bounds already consume.
 *
 * Turn: the character's own turn plus the camera's orbit yaw make the relative yaw that
 * picks the drawings and turns the rig. The light belongs to the world: orbiting the camera
 * moves it on screen, while turning the character doesn't (`cameraLight`).
 *
 * Paint order, back to front:
 * - legs, far first
 * - arms behind the body
 * - hair, head, face (clipped to the head), headband
 * - arms whose shoulder has come toward the camera: the near arm at 3/4 and side, as drawn
 *
 * A near arm's outline starts a little below the shoulder, so the arm grows out of the body
 * without a line across it.
 *
 * Shading is re-lit from the light (see `mascot-relight.ts`) in place of the drawn Shade and
 * Highlight layers. Outlines sit under the base, as in the drawing. The far limbs go one step
 * darker as the depth cue, smoothly with the turn: not at all at the front, 3/4 and back (as
 * drawn there), fully at the side.
 */

import { centreOf } from "./mascot-v2-art";
import { faceAt } from "./mascot-v2-face";
import { headbandTiltMap } from "./mascot-hair";
import { add } from "./mascot-geometry";
import {
  affineMap,
  composeAffine,
  emptyBounds,
  includePath,
  mapPath,
  parsePath,
  rotateAffineAround,
  scaleAffineAround,
  serializePath,
  type ParsedPath,
  type Point,
  type PointMap,
} from "./mascot-path";
import {
  cameraLight,
  crescentShift,
  darkerBody,
  highlightMap,
  limbHighlights,
  litPalette,
  MASCOT_V2_RIM_RADII,
  mixHex,
  rimBand,
  shadeStrand,
  shadeTube,
  strandHighlights,
  backlightWash,
  type MascotPalette,
  type MascotRimRadii,
  type MascotTubeHighlight,
  type MascotTubeShading,
} from "./mascot-relight";
import { ellipsePath, recolor, sceneBounds, toLayer, type RigShape } from "./mascot-scene-layers";
import { MASCOT_GROUND_Y, type MascotClip, type MascotLayer, type MascotScene, type MascotShapePart } from "./mascot-scene-types";
import { DROP_SHADOW_MAX_OFFSET_PX, type MascotEyes, type MascotMouth, type MascotSettings } from "./mascot-settings";
import { flattenOutline, tubeEdges } from "./mascot-tube";
import { poseV2Strands, type MascotV2HairPose } from "./mascot-v2-hair";
import { mascotV2Colors, mascotV2Views, type MascotV2Layer } from "./mascot-v2-parts";
import { poseV2Limb, type MascotV2LimbPose, type MascotV2PosedLimb } from "./mascot-v2-pose";
import { MASCOT_V2_BODY_PIVOT } from "./mascot-v2-rig";

export type MascotV2SceneInput = Readonly<{
  body: Readonly<{ lean: number; lift: number; pivot: Point; softness: number; squash: number }>;
  /** The camera's orbit (`view.orbit`, in degrees) and the world scale (`view.scale`). */
  camera: Readonly<{ pitch: number; scale: number; yaw: number }>;
  cast: MascotSettings["cast"];
  drop: MascotSettings["drop"];
  face: Readonly<{ eyes: MascotEyes; mouth: MascotMouth }>;
  /** The headband and armbands, shown (as drawn) unless switched off. */
  gear?: MascotSettings["gear"];
  ground: MascotSettings["ground"];
  hair: MascotV2HairPose & Readonly<{ bandTilt: number }>;
  lightAngle: number;
  limbs: Readonly<{ armL: MascotV2LimbPose; armR: MascotV2LimbPose; legL: MascotV2LimbPose; legR: MascotV2LimbPose }>;
  /** The shade on or off and how far it reaches (1 = as drawn), and the highlights on or off. All on, as drawn, if left out. */
  shading?: MascotV2Shading;
  /** The character's own turn in degrees (`body.turn`). */
  turn: number;
}>;

export type MascotV2Shading = Readonly<{ highlight: boolean; size: number; visible: boolean }>;
const DRAWN_SHADING: MascotV2Shading = { highlight: true, size: 1, visible: true };

/** An arm whose mean joint depth comes this far toward the viewer is drawn over the body (rig px). */
export const MASCOT_V2_FRONT_ARM_DEPTH = 15;
/** From this far round toward the side (|sin yaw|), the far limbs start to darken: the 3/4 view (30°). */
const FAR_SHADE_FROM = 0.5;
/** How much of a near arm's outline is left off at the shoulder (rig px along the arm). */
export const MASCOT_V2_TUCK_LENGTH = 18;
/** How far a limb behind the body runs on into it past its cut root (rig px), so the cut never shows. */
export const MASCOT_V2_ROOT_RUN_IN = 22;
/** How much a shadow's run toward or away from the camera shows on screen (the floor's foreshortening). */
const CAST_FLOOR_DEPTH = 0.6;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** A rigid piece's lighting: its axis on screen, given its centre, and how rounded it is. */
type PieceLighting = Readonly<{ along: (centre: Point) => Point; radii: MascotRimRadii }>;

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const polygonPath = (points: readonly Point[]): ParsedPath => [
  { kind: "M", to: points[0]! },
  ...points.slice(1).map((to) => ({ kind: "L" as const, to })),
  { kind: "Z" },
];
const polylinePath = (points: readonly Point[]): ParsedPath => [{ kind: "M", to: points[0]! }, ...points.slice(1).map((to) => ({ kind: "L" as const, to }))];
function boundsCentre(paths: readonly ParsedPath[]): Point {
  const bounds = emptyBounds();
  for (const path of paths) includePath(bounds, path);
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

const smoothstep = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/**
 * A limb's body palette on one side at a turn. The far side is _R turning right and _L
 * turning left. It goes one step darker (base, shade and highlight) only past the 3/4 view,
 * fully side-on, and is back to as drawn at the back, so every drawn view keeps its drawn
 * colours and nothing jumps.
 */
export function limbPalette(side: "L" | "R", yaw: number): MascotPalette {
  const s = Math.sin(radians(yaw));
  const far = side === "R" ? s > 0 : s < 0;
  return darkerBody(far ? smoothstep((Math.abs(s) - FAR_SHADE_FROM) / (1 - FAR_SHADE_FROM)) : 0);
}

/** The shade colour for a drawn base fill, or none for fills that aren't shaded (such as the $ sign). */
function shadeFor(fill: string, layers: readonly MascotV2Layer[], stripe: number | undefined): string | undefined {
  const c = mascotV2Colors;
  if (fill === c.body) return c.bodyShade;
  if (fill === c.bag) return c.bagShade;
  if (fill === c.stripe) return c.stripeShade;
  if (fill === c.gear) return layers.find((layer) => layer.role === "shade" && layer.stripe === stripe)?.shapes[0]?.fill ?? c.armbandShade;
  return undefined;
}

export function buildMascotV2Scene(input: MascotV2SceneInput): MascotScene {
  const yaw = input.turn + input.camera.yaw;
  const camera = { pitch: input.camera.pitch, yaw };
  const pivot = add(MASCOT_V2_BODY_PIVOT, input.body.pivot);
  const lean = radians(input.body.lean);
  const squash = input.body.squash;
  const body = composeAffine(rotateAffineAround(lean, pivot), scaleAffineAround(1 - squash * 0.5, 1 + squash, pivot));
  const bodyMap = affineMap(body);
  const pitch = radians(camera.pitch), pivotY = MASCOT_V2_BODY_PIVOT.y;
  const pitchMap: PointMap = (p) => ({ x: p.x, y: pivotY + (p.y - pivotY) * Math.cos(pitch) });

  const carry = { lean, map: bodyMap };
  const { limbs: poses } = input;
  const limbs = [
    poseV2Limb({ body: carry, camera, kind: "arm", pose: poses.armL, side: "L", softness: input.body.softness }),
    poseV2Limb({ body: carry, camera, kind: "arm", pose: poses.armR, side: "R", softness: input.body.softness }),
    poseV2Limb({ camera, kind: "leg", pose: poses.legL, side: "L", softness: input.body.softness }),
    poseV2Limb({ camera, kind: "leg", pose: poses.legR, side: "R", softness: input.body.softness }),
  ];

  // Ground the lowest leg or foot point on the floor line before lift is applied.
  const ground = emptyBounds();
  for (const limb of limbs.filter((l) => l.kind === "leg")) {
    includePath(ground, parsePath(limb.fill));
    for (const piece of limb.front) {
      for (const shape of piece.layers.filter((l) => l.role === "base").flatMap((l) => l.shapes)) {
        includePath(ground, mapPath(parsePath(shape.d), affineMap(piece.transform)));
      }
    }
  }
  const scale = input.camera.scale, lift = input.body.lift;
  const toWorld: PointMap = (p) => ({ x: p.x * scale, y: (p.y - ground.maxY) * scale + MASCOT_GROUND_Y - lift });
  const world = (path: ParsedPath) => mapPath(path, toWorld);

  const painted: RigShape[] = [];
  const silhouette: RigShape[] = [];
  const clips: MascotClip[] = [];
  const light = cameraLight(input.lightAngle, input.camera.yaw);
  const shading = input.shading ?? DRAWN_SHADING;
  const gear = input.gear ?? { armbands: true, headband: true };
  // Shading off leaves the flat drawn colours (the far limbs still go darker side-on: the depth cue).
  const wash = shading.visible ? backlightWash(light) : 0;
  const lit = (palette: MascotPalette) => (shading.visible ? litPalette(palette, light) : palette);
  const sized = (radii: MascotRimRadii): MascotRimRadii => ({ across: radii.across * shading.size, along: radii.along * shading.size });
  const bodyRaw = darkerBody(0);
  /** A tube's colours: its own cross-section shades it with the light behind, so only the highlight fades. */
  const tubeColours = (raw: MascotPalette): MascotPalette => ({ ...raw, highlight: lit(raw).highlight });

  const clipTo = (id: string, paths: readonly ParsedPath[]) => {
    clips.push({ d: paths.map(serializePath).join(" "), id: `${id}-clip` });
    return `${id}-clip`;
  };

  /**
   * A rigid piece through a rig-space map, re-lit: each shaded base gets the crescent (its
   * shade colour, then the whole piece nudged toward the light in its base colour, clipped
   * to it), the drawn highlights are placed for the light, and the drawn shade is dropped.
   */
  const pushPiece = (id: string, layers: readonly MascotV2Layer[], map: PointMap, lighting: PieceLighting, body: MascotPalette = bodyRaw) => {
    // MascotVM's gear switches leave the headband or the armbands off.
    if ((id === "headband" && !gear.headband) || (id.endsWith("-armband") && !gear.armbands)) return;
    const bodyLit = lit(body);
    const placed = layers.map((layer) => layer.shapes.map((shape) => world(mapPath(parsePath(shape.d), map))));
    const shaded = layers.flatMap((layer, l) =>
      layer.role === "base" ? layer.shapes.flatMap((shape, k) => (shape.fill && shadeFor(shape.fill, layers, layer.stripe) ? [placed[l]![k]!] : [])) : [],
    );
    const centre = boundsCentre(shaded.length > 0 ? shaded : placed.flat());
    const along = lighting.along(centre);
    const shift = crescentShift(light, along, sized(lighting.radii), scale);
    const nudged = shaded.map((path) => mapPath(path, (p) => add(p, shift)));
    const wholeClip = shaded.length > 0 ? clipTo(`${id}-whole`, shaded) : undefined;
    layers.forEach((layer, l) => {
      layer.shapes.forEach((shape, k) => {
        const path = placed[l]![k]!;
        const partId = `${id}-${layer.role}${layer.stripe ?? ""}-${l}-${k}`;
        if (layer.role === "shade") return;
        if (layer.role === "highlight") {
          if (!shading.highlight) return;
          const where = highlightMap(light, boundsCentre([path]), centre, along);
          if (!where || !shape.stroke?.color) return;
          const color = shape.stroke.color === mascotV2Colors.highlight ? bodyLit.highlight : mixHex(shape.stroke.color, mascotV2Colors.gear, wash);
          painted.push({ ...(wholeClip ? { clipId: wholeClip } : {}), id: partId, paint: { color, kind: "stroke", width: shape.stroke.width * scale }, path: mapPath(path, where) });
          return;
        }
        const shade = layer.role === "base" && shape.fill ? shadeFor(shape.fill, layers, layer.stripe) : undefined;
        if (shape.fill && shade) {
          const raw = shape.fill === mascotV2Colors.body ? body : { base: shape.fill, highlight: shape.fill, shade };
          const palette = lit(raw);
          const part: RigShape = { id: partId, paint: { color: palette.base, kind: "fill" }, path };
          painted.push(part);
          silhouette.push(part);
          if (!shading.visible) {
            if (shape.stroke?.color) painted.push({ id: `${partId}-stroke`, paint: { color: shape.stroke.color, kind: "stroke", width: shape.stroke.width * scale }, path });
            return;
          }
          const clipId = clipTo(partId, [path]);
          painted.push({ clipId, id: `${partId}-shade`, paint: { color: palette.shade, kind: "fill" }, path });
          painted.push({ clipId, id: `${partId}-lit`, paint: { color: palette.base, kind: "fill" }, path: nudged.flat() });
          // With the light behind, a rim of the undarkened colour along the edges facing it (one-piece parts only:
          // a striped band's stripes share edges, which mustn't light up).
          if (layer.stripe === undefined && wash > 0) {
            const rim = rimBand(flattenOutline(serializePath(path), 1).points, light, along, sized(lighting.radii), scale);
            if (rim) painted.push({ clipId, id: `${partId}-rim`, paint: { color: raw.base, kind: "fill" }, path: polygonPath(rim) });
          }
        } else if (shape.fill) {
          const part: RigShape = { id: partId, paint: { color: shape.fill, kind: "fill" }, path };
          painted.push(part);
          if (layer.role === "base") silhouette.push(part);
        }
        if (shape.stroke?.color) painted.push({ id: `${partId}-stroke`, paint: { color: shape.stroke.color, kind: "stroke", width: shape.stroke.width * scale }, path });
      });
    });
  };

  /** A tube's re-lit shade bands and highlights, clipped to its fill. */
  const pushTubeShading = (id: string, fill: ParsedPath, tube: MascotTubeShading, highlights: readonly MascotTubeHighlight[], palette: MascotPalette) => {
    if (!shading.visible && !shading.highlight) return;
    const clipId = clipTo(id, [fill]);
    if (shading.visible) tube.bands.forEach((band, k) => painted.push({ clipId, id: `${id}-shade-${k}`, paint: { color: palette.shade, kind: "fill" }, path: polygonPath(band) }));
    if (shading.highlight) tube.highlights.forEach((line, k) => {
      if (line.length < 2) return;
      painted.push({ clipId, id: `${id}-highlight-${k}`, paint: { color: palette.highlight, kind: "stroke", width: highlights[k]!.width * scale }, path: polylinePath(line) });
    });
  };

  const pushLimb = (limb: MascotV2PosedLimb, tucked: boolean) => {
    const raw = limbPalette(limb.side, yaw);
    const palette = tubeColours(raw);
    const wrist = toWorld(limb.joints.end);
    const midline = limb.midline.map(toWorld);
    const tangentNear = (p: Point): Point => {
      const i = midline.reduce((best, m, j) => (Math.hypot(m.x - p.x, m.y - p.y) < Math.hypot(midline[best]!.x - p.x, midline[best]!.y - p.y) ? j : best), 0);
      return sub(midline[Math.min(midline.length - 1, i + 2)]!, midline[Math.max(0, i - 2)]!);
    };
    let handCentre = wrist;
    for (const piece of limb.front) if (piece.id.endsWith("-hand")) handCentre = boundsCentre(piece.layers.filter((l) => l.role === "base").flatMap((l) => l.shapes.map((shape) => world(mapPath(parsePath(shape.d), affineMap(piece.transform))))));
    const lightingFor = (pieceId: string): PieceLighting => {
      if (pieceId.endsWith("-money-bag")) return { along: (centre) => sub(centre, handCentre), radii: MASCOT_V2_RIM_RADII.moneyBag };
      if (pieceId.endsWith("-armband")) return { along: tangentNear, radii: MASCOT_V2_RIM_RADII.armband };
      if (pieceId.endsWith("-foot")) return { along: (centre) => sub(centre, wrist), radii: MASCOT_V2_RIM_RADII.foot };
      return { along: (centre) => sub(centre, wrist), radii: MASCOT_V2_RIM_RADII.hand };
    };
    for (const piece of limb.behind) pushPiece(piece.id, piece.layers, affineMap(piece.transform), lightingFor(piece.id), raw);
    // A limb behind the body runs on into it, so its cut root never shows past the body's edge.
    const [rawA, rawB] = tubeEdges(limb.tube, limb.midline);
    const [edgeA, edgeB] = tucked ? [rawA, rawB] : extendRoot(rawA, rawB, MASCOT_V2_ROOT_RUN_IN);
    const ring = [...edgeA, ...[...edgeB].reverse()].map(toWorld);
    const fillPath = polygonPath(ring);
    // The outline goes under the base, as drawn, so only its outer half shows. It stays open at the root.
    painted.push({ id: `${limb.id}-outline`, paint: { color: mascotV2Colors.outline, kind: "stroke", width: scale }, path: tucked ? world(tuckedOutline(limb)) : polylinePath(ring) });
    const fill: RigShape = { id: `${limb.id}-base`, paint: { color: palette.base, kind: "fill" }, path: fillPath };
    painted.push(fill);
    silhouette.push(fill);
    const shift = edgeA.length - rawA.length;
    const highlights = limbHighlights(limb.kind).map((h) => ({ ...h, from: h.from + shift, to: h.to + shift }));
    pushTubeShading(limb.id, fillPath, shadeTube([edgeA.map(toWorld), edgeB.map(toWorld)], light, highlights, shading.size), highlights, palette);
    for (const piece of limb.front) pushPiece(piece.id, piece.layers, affineMap(piece.transform), lightingFor(piece.id), raw);
  };

  const byDepth = (a: MascotV2PosedLimb, b: MascotV2PosedLimb) => a.depth - b.depth;
  const inFront = (limb: MascotV2PosedLimb) => limb.kind === "arm" && limb.depth > MASCOT_V2_FRONT_ARM_DEPTH;
  limbs.filter((l) => l.kind === "leg").sort(byDepth).forEach((l) => pushLimb(l, false));
  limbs.filter((l) => l.kind === "arm" && !inFront(l)).sort(byDepth).forEach((l) => pushLimb(l, false));

  // Hair and headband are planted together: the headband's tilt turns both about the band's centre.
  const front = mascotV2Views.front;
  const headband = front.parts.headband!;
  const tilt = headbandTiltMap(centreOf(headband), radians(input.hair.bandTilt) * Math.cos(radians(yaw)));
  const onBody: PointMap = (p) => bodyMap(pitchMap(p));
  const onBand: PointMap = (p) => toWorld(onBody(tilt(p)));
  for (const strand of poseV2Strands(camera, input.hair)) {
    const path = mapPath(parsePath(strand.fill), onBand);
    painted.push({ id: `hair-${strand.id}-outline`, paint: { color: mascotV2Colors.outline, kind: "stroke", width: scale }, path });
    const part: RigShape = { id: `hair-${strand.id}`, paint: { color: bodyRaw.base, kind: "fill" }, path };
    painted.push(part);
    silhouette.push(part);
    const [edgeA, edgeB] = tubeEdges(strand.tube, strand.midline);
    const highlights = strandHighlights(strand.id);
    const strandShading = shadeStrand([edgeA.map(onBand), edgeB.map(onBand)], strand.midline.map(onBand), light, highlights, shading.size);
    pushTubeShading(`hair-${strand.id}`, path, strandShading, highlights, tubeColours(bodyRaw));
  }

  // Head and headband: the round body looks the same from every side, so both turn on the body's upright axis.
  const upright = (map: PointMap) => (): Point => sub(toWorld(map({ x: 0, y: -100 })), toWorld(map({ x: 0, y: 0 })));
  pushPiece("head", front.parts.head!, onBody, { along: upright(onBody), radii: MASCOT_V2_RIM_RADII.head });
  const headOutline = front.parts.head!.find((layer) => layer.role === "base")!.shapes[0]!.d;
  clips.push({ d: serializePath(world(mapPath(parsePath(headOutline), onBody))), id: "mascot-face-clip" });
  const onFace: PointMap = (p) => toWorld(onBody(p));
  for (const part of faceAt(yaw, input.face.eyes, input.face.mouth)) {
    const path = mapPath(parsePath(part.d), onFace);
    const opacity = part.opacity !== undefined ? { opacity: part.opacity } : {};
    if (part.fill) painted.push({ clipId: "mascot-face-clip", id: `face-${part.id}`, ...opacity, paint: { color: part.fill, kind: "fill" }, path });
    if (part.stroke) {
      const g = part.stroke.gradient;
      const gradient = g ? { gradient: { from: onFace(g.from), stops: g.stops.map((stop) => ({ ...stop })), to: onFace(g.to) } } : {};
      painted.push({ clipId: "mascot-face-clip", id: `face-${part.id}-stroke`, ...opacity, paint: { color: part.stroke.color, kind: "stroke", width: part.stroke.width * scale, ...gradient }, path });
    }
  }
  pushPiece("headband", headband, (p) => onBody(tilt(p)), { along: upright((p) => onBody(tilt(p))), radii: MASCOT_V2_RIM_RADII.headband });

  limbs.filter(inFront).sort(byDepth).forEach((l) => pushLimb(l, true));

  const layers: MascotLayer[] = [];
  if (input.cast.visible) {
    // The shadow falls along the floor away from the light: sideways by the light's side
    // component, and back (up the screen) or, with the light behind, forward (down it) by its
    // depth component, foreshortened by the floor's tilt.
    const castLength = input.cast.length;
    const kx = -light.x * castLength;
    const ky = -light.z * castLength * CAST_FLOOR_DEPTH;
    const g = MASCOT_GROUND_Y;
    const castMap: PointMap = (p) => ({ x: p.x + (g - p.y) * kx, y: g + (g - p.y) * ky });
    const castShapes = recolor(silhouette, input.cast.color.hex, "cast").map((shape) => ({ ...shape, path: mapPath(shape.path, castMap) }));
    layers.push(toLayer("cast-shadow", castShapes, input.cast.color.opacity / 100, input.cast.blur));
  }
  if (input.ground.visible) {
    const feet = emptyBounds();
    for (const limb of limbs.filter((l) => l.kind === "leg")) includePath(feet, world(parsePath(limb.fill)));
    const liftFade = 1 / (1 + lift / (160 * scale));
    const halfWidth = ((feet.maxX - feet.minX) / 2 + 24 * scale) * input.ground.size;
    const rx = halfWidth * (0.6 + 0.4 * liftFade);
    // Looking down shows more of the floor, so the contact shadow opens up.
    const ry = rx * Math.max(0.04, 0.14 + 0.6 * Math.sin(pitch));
    const cx = (feet.maxX + feet.minX) / 2;
    layers.push(toLayer("ground-shadow", [{ id: "ground", paint: { color: input.ground.color.hex, kind: "fill" }, path: ellipsePath(cx, MASCOT_GROUND_Y, rx, ry) }], (input.ground.color.opacity / 100) * liftFade, input.ground.blur));
  }
  if (input.drop.visible) {
    const offset = { x: input.drop.offset.x * DROP_SHADOW_MAX_OFFSET_PX, y: input.drop.offset.y * DROP_SHADOW_MAX_OFFSET_PX };
    const dropShapes = recolor(silhouette, input.drop.color.hex, "drop").map((shape) => ({ ...shape, path: mapPath(shape.path, (p) => add(p, offset)) }));
    layers.push(toLayer("drop-shadow", dropShapes, input.drop.color.opacity / 100, input.drop.blur));
  }
  // Name each shape's V2 group and part (as in the Figma file) for SVG export groups.
  const named = painted.map((shape) => {
    const part = partOf(shape.id, input.limbs);
    return part ? { ...shape, part } : shape;
  });
  layers.push(toLayer("mascot", named, 1, 0));
  // The body map is built in pitched rig space, so the pivot only needs the world map.
  return { bounds: sceneBounds(layers), clips, layers, pivot: toWorld(pivot) };
}

const HAND_PARTS = { fist: "hand_fist", open: "hand_open", thumbsUp: "hand_thumbs_up" } as const;

/**
 * The V2 group and part a scene shape belongs to, from its id: Leg_L/leg_L and foot_L,
 * Arm_L/arm_L, the visible hand (hand_open_L, hand_fist_L or hand_thumbs_up_L), armband_L and
 * moneybag_L, Body/strand_N, head and face, and Headband/headband.
 */
function partOf(id: string, poses: MascotV2SceneInput["limbs"]): MascotShapePart | undefined {
  const limb = /^(arm|leg)-([LR])(?:-(foot|hand|armband|money-bag))?/.exec(id);
  if (limb) {
    const [, kind, side, piece] = limb as unknown as [string, "arm" | "leg", "L" | "R", string | undefined];
    const group = `${kind === "arm" ? "Arm" : "Leg"}_${side}`;
    if (!piece) return { group, part: `${kind}_${side}` };
    if (piece === "hand") return { group, part: `${HAND_PARTS[poses[side === "L" ? "armL" : "armR"].hand]}_${side}` };
    return { group, part: `${piece === "money-bag" ? "moneybag" : piece}_${side}` };
  }
  const strand = /^hair-(strand_\d)/.exec(id);
  if (strand) return { group: "Body", part: strand[1]! };
  if (id.startsWith("headband-")) return { group: "Headband", part: "headband" };
  if (id.startsWith("head-")) return { group: "Body", part: "head" };
  if (id.startsWith("face-")) return { group: "Body", part: "face" };
  return undefined;
}

/** Prepends a straight run of `length` to both edges at the root, along the tube's direction there. */
function extendRoot(a: readonly Point[], b: readonly Point[], length: number): [Point[], Point[]] {
  const k = Math.min(4, a.length - 1);
  const mid = (i: number): Point => ({ x: (a[i]!.x + b[i]!.x) / 2, y: (a[i]!.y + b[i]!.y) / 2 });
  const back = sub(mid(0), mid(k));
  const l = Math.hypot(back.x, back.y) || 1;
  const run = { x: (back.x / l) * length, y: (back.y / l) * length };
  return [[add(a[0]!, run), ...a], [add(b[0]!, run), ...b]];
}

/** A near arm's outline without its first stretch, so the arm grows out of the body at the shoulder. */
function tuckedOutline(limb: MascotV2PosedLimb): ParsedPath {
  const [a, b] = tubeEdges(limb.tube, limb.midline);
  const start = Math.max(0, limb.tube.arc.findIndex((s) => s >= MASCOT_V2_TUCK_LENGTH));
  const ring = [...a.slice(start), ...b.slice(start).reverse()];
  return [{ kind: "M", to: ring[0]! }, ...ring.slice(1).map((to) => ({ kind: "L" as const, to }))];
}
