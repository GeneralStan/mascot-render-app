/**
 * Builds the posed V2 mascot as world-space vector shapes. It is the same `MascotScene` the
 * preview, raster and SVG export and scene bounds already consume.
 *
 * Turn: the character's own turn plus the camera's orbit yaw make the relative yaw that
 * picks the drawings and turns the rig. The light belongs to the world: orbiting the camera
 * moves it on screen, while turning the character doesn't (`cameraLight`).
 *
 * Paint order, back to front:
 * - legs, far first (looking up at the underside, they come after the body instead)
 * - arms behind the body
 * - hair, head, face (clipped to the head), headband (looking down on the crown, the hair comes
 *   after the headband, growing out of the crown)
 * - arms whose shoulder has come toward the camera: the near arm at 3/4 and side, as drawn
 *
 * Tilt: level views use the drawings as they are. Tilted views use the body as a round volume
 * (`mascot-body-volume.ts`): its outline shows the crown or underside, the face and highlights
 * sit on its surface, and the headband is a ring round it.
 *
 * A limb painted over the body blends into it at the root (`mascot-root-blend.ts`): its outline
 * fades in from nothing and its shade and highlight start only past the blend, so the arm grows
 * out of the body without a line across it at any angle.
 *
 * Shading is re-lit from the light (see `mascot-relight.ts`) in place of the drawn Shade and
 * Highlight layers. Outlines sit under the base, as in the drawing. The far limbs go one step
 * darker as the depth cue, smoothly with the turn: not at all at the front, 3/4 and back (as
 * drawn there), fully at the side.
 */

import { axisPoint, bandShape, bandSurfaceMap, bodySilhouette, bodySurfaceMap } from "./mascot-body-volume";
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
import { fadeInStops, rootBlend, type MascotRootBlend } from "./mascot-root-blend";
import { flattenOutline, tubeEdges } from "./mascot-tube";
import { poseV2Strands, type MascotV2HairPose } from "./mascot-v2-hair";
import { mascotV2Colors, mascotV2Views, type MascotV2Layer, type MascotV2Shape } from "./mascot-v2-parts";
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
/** How far a limb behind the body runs on into it past its cut root (rig px), so the cut never shows. */
export const MASCOT_V2_ROOT_RUN_IN = 22;
/** How much a shadow's run toward or away from the camera shows on screen (the floor's foreshortening). */
const CAST_FLOOR_DEPTH = 0.6;
/** Looking up, the floor's shadows fade out over this much tilt below level (radians, 15°). */
const FLOOR_FADE = (15 * Math.PI) / 180;

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

  // Level views keep the drawings; tilted views place what is drawn on the body onto its round surface.
  const front = mascotV2Views.front;
  const level = Math.abs(pitch) < 1e-9;
  const surface: PointMap = level ? pitchMap : bodySurfaceMap(pitch);
  const onBody: PointMap = (p) => bodyMap(surface(p));
  const headOutline = front.parts.head!.find((layer) => layer.role === "base")!.shapes[0]!.d;
  const bodyOutline: ParsedPath = level ? mapPath(parsePath(headOutline), onBody) : mapPath(polygonPath(bodySilhouette(pitch)), bodyMap);
  // The body's silhouette on screen, which a limb or strand painted over it blends into at the root
  // (worked out only when something is painted over the body).
  let onScreen: readonly Point[] | undefined;
  const bodyOnScreen = () => (onScreen ??= flattenOutline(serializePath(world(bodyOutline)), 1).points);
  const lookingDown = pitch > 1e-9, lookingUp = pitch < -1e-9;

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

  /**
   * A tube's outline (under its base, as drawn): `whole` as it is, or, blended into the body at the
   * root, each edge fading in from nothing until the blend ends and solid from there round the tip.
   */
  const pushBlendedOutline = (id: string, edgeA: readonly Point[], edgeB: readonly Point[], blend: MascotRootBlend | undefined, whole: ParsedPath) => {
    const outline = { color: mascotV2Colors.outline, kind: "stroke" as const, width: scale };
    if (!blend) {
      painted.push({ id: `${id}-outline`, paint: outline, path: whole });
      return;
    }
    const n = blend.end;
    [edgeA, edgeB].forEach((edge, k) => {
      const gradient = { from: edge[0]!, stops: fadeInStops(outline.color), to: edge[n]! };
      painted.push({ id: `${id}-outline-root-${k}`, paint: { ...outline, gradient }, path: polylinePath(edge.slice(0, n + 1)) });
    });
    painted.push({ id: `${id}-outline`, paint: outline, path: polylinePath([...edgeA.slice(n), ...[...edgeB.slice(n)].reverse()]) });
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
    const worldA = edgeA.map(toWorld), worldB = edgeB.map(toWorld);
    const ring = [...worldA, ...[...worldB].reverse()];
    const fillPath = polygonPath(ring);
    // The outline goes under the base, as drawn, so only its outer half shows. It stays open at the root.
    // Over the body, the root blends in: the outline fades in along each edge until the limb leaves the body.
    const blend = tucked ? rootBlend(limb.tube.arc, worldA, worldB, bodyOnScreen()) : undefined;
    pushBlendedOutline(limb.id, worldA, worldB, blend, polylinePath(ring));
    const fill: RigShape = { id: `${limb.id}-base`, paint: { color: palette.base, kind: "fill" }, path: fillPath };
    painted.push(fill);
    silhouette.push(fill);
    const shift = edgeA.length - rawA.length;
    // A blended root's shade tapers in with the outline, and its highlights start past the blend.
    const highlights = limbHighlights(limb.kind).map((h) => ({ ...h, from: Math.max(h.from + shift, blend?.end ?? 0), to: h.to + shift }));
    pushTubeShading(limb.id, fillPath, shadeTube([worldA, worldB], light, highlights, shading.size, blend?.weights), highlights, palette);
    for (const piece of limb.front) pushPiece(piece.id, piece.layers, affineMap(piece.transform), lightingFor(piece.id), raw);
  };

  const byDepth = (a: MascotV2PosedLimb, b: MascotV2PosedLimb) => a.depth - b.depth;
  const inFront = (limb: MascotV2PosedLimb) => limb.kind === "arm" && limb.depth > MASCOT_V2_FRONT_ARM_DEPTH;
  // Looking up at the underside the legs grow out of it, so they go over the body, blended in.
  if (!lookingUp) limbs.filter((l) => l.kind === "leg").sort(byDepth).forEach((l) => pushLimb(l, false));
  limbs.filter((l) => l.kind === "arm" && !inFront(l)).sort(byDepth).forEach((l) => pushLimb(l, false));

  // Hair and headband are planted together: the headband's tilt turns both about the band's centre
  // (on the body's upright axis, which tilting moves up or down the screen).
  const headband = front.parts.headband!;
  const bandTilt = radians(input.hair.bandTilt) * Math.cos(radians(yaw));
  const tilt = headbandTiltMap(centreOf(headband), bandTilt);
  const tiltTilted = headbandTiltMap(axisPoint(centreOf(headband), pitch), bandTilt);
  // The strands are posed already tilted (`poseV2Strands`), so they only take the band's tilt and the body.
  const onHair: PointMap = (p) => toWorld(bodyMap(tiltTilted(p)));
  const pushHair = (blended: boolean) => {
    for (const strand of poseV2Strands(camera, input.hair)) {
      const [edgeA, edgeB] = tubeEdges(strand.tube, strand.midline);
      const worldA = edgeA.map(onHair), worldB = edgeB.map(onHair);
      const path = mapPath(parsePath(strand.fill), onHair);
      // Looking down, a strand grows out of the crown: its root blends in like a near arm's.
      const blend = blended ? rootBlend(strand.tube.arc, worldA, worldB, bodyOnScreen()) : undefined;
      pushBlendedOutline(`hair-${strand.id}`, worldA, worldB, blend, path);
      const part: RigShape = { id: `hair-${strand.id}`, paint: { color: bodyRaw.base, kind: "fill" }, path };
      painted.push(part);
      silhouette.push(part);
      const highlights = strandHighlights(strand.id).map((h) => ({ ...h, from: Math.max(h.from, blend?.end ?? 0) }));
      const strandShading = shadeStrand([worldA, worldB], strand.midline.map(onHair), light, highlights, shading.size, blend?.weights);
      pushTubeShading(`hair-${strand.id}`, path, strandShading, highlights, tubeColours(bodyRaw));
    }
  };
  if (!lookingDown) pushHair(false);

  // Head and headband: the round body looks the same from every side, so both turn on the body's upright axis.
  const upright = (map: PointMap) => (): Point => sub(toWorld(map({ x: 0, y: -100 })), toWorld(map({ x: 0, y: 0 })));
  if (level) pushPiece("head", front.parts.head!, onBody, { along: upright(onBody), radii: MASCOT_V2_RIM_RADII.head });
  else pushPiece("head", tiltedHead(front.parts.head!, serializePath(polygonPath(bodySilhouette(pitch))), surface), bodyMap, { along: upright(bodyMap), radii: MASCOT_V2_RIM_RADII.head });
  clips.push({ d: serializePath(world(bodyOutline)), id: "mascot-face-clip" });
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
  if (level) pushPiece("headband", headband, (p) => onBody(tilt(p)), { along: upright((p) => onBody(tilt(p))), radii: MASCOT_V2_RIM_RADII.headband });
  else {
    const onTiltedBand: PointMap = (p) => bodyMap(tiltTilted(p));
    const ring = tiltedBand(headband, pitch);
    if (ring.length > 0) pushPiece("headband", ring, onTiltedBand, { along: upright(onTiltedBand), radii: MASCOT_V2_RIM_RADII.headband });
  }

  if (lookingDown) pushHair(true);
  if (lookingUp) limbs.filter((l) => l.kind === "leg").sort(byDepth).forEach((l) => pushLimb(l, true));
  limbs.filter(inFront).sort(byDepth).forEach((l) => pushLimb(l, true));

  const layers: MascotLayer[] = [];
  // Looking up from below the floor, the shadows on it fade out.
  const floorShows = smoothstep(1 + pitch / FLOOR_FADE);
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
    layers.push(toLayer("cast-shadow", castShapes, (input.cast.color.opacity / 100) * floorShows, input.cast.blur));
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
    layers.push(toLayer("ground-shadow", [{ id: "ground", paint: { color: input.ground.color.hex, kind: "fill" }, path: ellipsePath(cx, MASCOT_GROUND_Y, rx, ry) }], (input.ground.color.opacity / 100) * liftFade * floorShows, input.ground.blur));
  }
  if (input.drop.visible) {
    const offset = { x: input.drop.offset.x * DROP_SHADOW_MAX_OFFSET_PX, y: input.drop.offset.y * DROP_SHADOW_MAX_OFFSET_PX };
    const dropShapes = recolor(silhouette, input.drop.color.hex, "drop").map((shape) => ({ ...shape, path: mapPath(shape.path, (p) => add(p, offset)) }));
    layers.push(toLayer("drop-shadow", dropShapes, input.drop.color.opacity / 100, input.drop.blur));
  }
  // Name each shape's V2 group and part (as in the Figma file) for SVG export groups.
  // Looking down the strands sit over the headband, so they get their own Hair group above it.
  const named = painted.map((shape) => {
    const part = partOf(shape.id, input.limbs, lookingDown ? "Hair" : "Body");
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
 * moneybag_L, Body/strand_N (Hair/strand_N looking down, where they sit over the headband), head
 * and face, and Headband/headband.
 */
function partOf(id: string, poses: MascotV2SceneInput["limbs"], hairGroup: "Body" | "Hair"): MascotShapePart | undefined {
  const limb = /^(arm|leg)-([LR])(?:-(foot|hand|armband|money-bag))?/.exec(id);
  if (limb) {
    const [, kind, side, piece] = limb as unknown as [string, "arm" | "leg", "L" | "R", string | undefined];
    const group = `${kind === "arm" ? "Arm" : "Leg"}_${side}`;
    if (!piece) return { group, part: `${kind}_${side}` };
    if (piece === "hand") return { group, part: `${HAND_PARTS[poses[side === "L" ? "armL" : "armR"].hand]}_${side}` };
    return { group, part: `${piece === "money-bag" ? "moneybag" : piece}_${side}` };
  }
  const strand = /^hair-(strand_\d)/.exec(id);
  if (strand) return { group: hairGroup, part: strand[1]! };
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

/**
 * The head's layers for a tilted view, already tilted: its outline and base are the round body's
 * outline, and the drawn highlights sit on its surface.
 */
function tiltedHead(layers: readonly MascotV2Layer[], outline: string, surface: PointMap): MascotV2Layer[] {
  return layers.map((layer) => ({
    ...layer,
    shapes: layer.shapes.map((shape) => ({ ...shape, d: layer.role === "highlight" ? serializePath(mapPath(parsePath(shape.d), surface)) : outline })),
  }));
}

/**
 * The headband's layers for a tilted view, already tilted: each stripe's visible stretch of the
 * ring with the drawn stripe's colours, the band's outline round them, and the drawn highlight
 * on the band's surface. Empty once the band has gone out of sight below.
 */
function tiltedBand(layers: readonly MascotV2Layer[], pitch: number): MascotV2Layer[] {
  const ring = bandShape(pitch);
  if (ring.stripes.length === 0) return [];
  const onBand = bandSurfaceMap(pitch);
  const runs = (lines: readonly (readonly Point[])[]) => lines.map((line) => serializePath(polylinePath(line))).join(" ");
  return layers.flatMap((layer): MascotV2Layer[] => {
    const reshape = (d: string): MascotV2Shape[] => layer.shapes.map((shape) => ({ ...shape, d }));
    if (layer.role === "outline") return ring.outline.length > 0 ? [{ ...layer, shapes: reshape(runs(ring.outline)) }] : [];
    if (layer.role === "highlight") return [{ ...layer, shapes: layer.shapes.map((shape) => ({ ...shape, d: serializePath(mapPath(parsePath(shape.d), onBand)) })) }];
    const stripe = ring.stripes.find((s) => s.stripe === layer.stripe);
    return stripe ? [{ ...layer, shapes: reshape(serializePath(polygonPath(stripe.polygon))) }] : [];
  });
}
