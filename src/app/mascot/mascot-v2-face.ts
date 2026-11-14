/**
 * The V2 face for a turn, in front-view rig space (before the body's lean and squash).
 *
 * The drawn faces sit at 0° (front), 30° (3/4) and 90° (side). Turning left (negative
 * yaw) uses the 3/4 and side drawings mirrored, while the front drawing stays as drawn,
 * so nothing flips when crossing 0°. Every drawn angle is exact.
 *
 * Between the drawings:
 * - Each eye glides between its drawn spots and eases between its drawn sizes. The near
 *   eye is the one on the side turning toward the camera.
 * - Past the 3/4 view the far eye rounds the head: it heads for the edge, narrowing as a
 *   mark on a round head does (by the cosine of its angle round the head), and is gone
 *   before the side view, which draws one eye. It never lands on the near eye.
 * - The mouth blends smoothly from the front smile through the 3/4 smile to the profile
 *   mouth. It is the same mouth seen from another angle, so blending isn't a change of
 *   expression.
 * - Past the side the face slides off the edge (the scene clips it to the head), and it is
 *   hidden from 135° on.
 *
 * Open eyes and the happy mouth are the drawn V2 shapes, the mouth with its soft shadow (a
 * gradient stroke under the smile, blended between the drawings like the mouth). The other
 * expressions come from Faces_V2 (`mascot-v2-faces.ts`), drawn for the front view and placed on
 * the drawn eyes and smile at every turn, sized like the eyes they stand in for. Each keeps its
 * drawing's layout, measured against face_happy and laid against Standing's own eyes and smile
 * (Standing's smile sits 2.8 px further below its eyes than face_happy's):
 * - Eyes drawn with the smile (blink in face_satisfied, tired in face_sleepy) keep their height
 *   above it, so the smile stays put and the eyes change.
 * - A mouth keeps its distance below the eyes it was drawn with (the excited grin under open
 *   eyes, the neutral line under curious eyes, the frown under tired eyes), and angry eyes keep
 *   theirs above the frown.
 * Sad eyes aren't drawn in V2 yet, so they still reuse the V1 shapes.
 */

import { mapPath, parsePath, serializePath, type Point } from "./mascot-path";
import { normalizeYaw } from "./mascot-v2-art";
import { mascotV2Colors, mascotV2Views, type MascotV2Gradient, type MascotV2Shape } from "./mascot-v2-parts";
import { mascotEyes, mascotV1FaceAnchors } from "./mascot-v1-faces";
import type { MascotEyes, MascotMouth } from "./mascot-settings";
import { mascotV2Faces, type MascotV2FaceName, type MascotV2FaceShape } from "./mascot-v2-faces";

export type MascotV2FacePart = Readonly<{
  d: string;
  fill?: string;
  id: string;
  /** The part's own opacity (1 when absent). */
  opacity?: number;
  /** A stroke in one colour, or along a gradient (in front-view rig space). */
  stroke?: Readonly<{ color: string; gradient?: MascotV2Gradient; width: number }>;
}>;

/** A feature's centre and size. */
type Box = Readonly<{ h: number; w: number; x: number; y: number }>;
type EyeKey = Readonly<{ box: Box; shapes: readonly MascotV2Shape[] }>;
type MouthShadow = Readonly<{ gradient: MascotV2Gradient; line: readonly Point[]; opacity: number; width: number }>;
type MouthKey = Readonly<{ line: readonly Point[]; shadow?: MouthShadow; stroke: Readonly<{ color: string; width: number }> }>;
type FaceKey = Readonly<{ far: EyeKey; mouth: MouthKey; near: EyeKey; yaw: number }>;

/** Past the side, features slide this far beyond the head's centre line, out of sight. */
const OFF_EDGE = 120;
const HIDDEN_FROM = 135;
/** Mouth lines are resampled to this many points so they can blend. */
const MOUTH_SAMPLES = 32;
/** The far eye is hidden once less than this share of its width would show. */
const FAR_EYE_MIN = 0.06;

const smoothstep = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mirror = (p: Point): Point => ({ x: -p.x, y: p.y });

function boxOf(ds: readonly string[]): Box {
  const points = ds.flatMap((d) =>
    parsePath(d).flatMap((segment) => (segment.kind === "Z" ? [] : segment.kind === "C" ? [segment.c1, segment.c2, segment.to] : [segment.to])),
  );
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { h: maxY - minY, w: maxX - minX, x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/** The head's half-width, which the far eye rounds. */
const HEAD_RADIUS = boxOf(mascotV2Views.front.parts.head!.filter((layer) => layer.role === "base").flatMap((layer) => layer.shapes.map((shape) => shape.d))).w / 2;

/** A stroke path as a polyline of `count` points evenly spaced along it, left end first. */
function resampleLine(d: string, count: number): Point[] {
  const dense: Point[] = [];
  let last: Point = { x: 0, y: 0 };
  for (const segment of parsePath(d)) {
    if (segment.kind === "M") {
      last = segment.to;
      dense.push(last);
    } else if (segment.kind === "L") {
      last = segment.to;
      dense.push(last);
    } else if (segment.kind === "C") {
      for (let i = 1; i <= 24; i++) {
        const t = i / 24, u = 1 - t;
        dense.push({
          x: u * u * u * last.x + 3 * u * u * t * segment.c1.x + 3 * u * t * t * segment.c2.x + t * t * t * segment.to.x,
          y: u * u * u * last.y + 3 * u * u * t * segment.c1.y + 3 * u * t * t * segment.c2.y + t * t * t * segment.to.y,
        });
      }
      last = segment.to;
    }
  }
  if (dense[0]!.x > dense[dense.length - 1]!.x) dense.reverse();
  const arc = [0];
  for (let i = 1; i < dense.length; i++) arc.push(arc[i - 1]! + Math.hypot(dense[i]!.x - dense[i - 1]!.x, dense[i]!.y - dense[i - 1]!.y));
  const total = arc[arc.length - 1]!;
  const line: Point[] = [];
  for (let k = 0; k < count; k++) {
    const s = (total * k) / (count - 1);
    const i = Math.max(0, Math.min(dense.length - 2, arc.findIndex((a) => a >= s) - 1));
    const span = arc[i + 1]! - arc[i]!;
    const t = span > 1e-9 ? (s - arc[i]!) / span : 0;
    line.push({ x: lerp(dense[i]!.x, dense[i + 1]!.x, t), y: lerp(dense[i]!.y, dense[i + 1]!.y, t) });
  }
  return line;
}

const mirrorShape = (shape: MascotV2Shape): MascotV2Shape => ({ ...shape, d: serializePath(mapPath(parsePath(shape.d), mirror)) });

/** A drawn face's eyes (each a dark disc then its shine) sorted left to right, and its mouth line. */
function drawnFace(view: "front" | "threeQuarter" | "side", sign: 1 | -1) {
  const face = mascotV2Views[view].face!;
  const place = (shape: MascotV2Shape) => (sign > 0 || view === "front" ? shape : mirrorShape(shape));
  const eyes: EyeKey[] = [];
  for (let i = 0; i < face.eyes_open.length; i += 2) {
    const shapes = [place(face.eyes_open[i]!), place(face.eyes_open[i + 1]!)];
    eyes.push({ box: boxOf([shapes[0]!.d]), shapes });
  }
  eyes.sort((a, b) => a.box.x - b.box.x);
  const stroke = face.mouth_happy.find((shape) => shape.stroke?.color && !shape.stroke.gradient)!;
  const shadowShape = face.mouth_happy.find((shape) => shape.stroke?.gradient);
  const flip = !(sign > 0 || view === "front");
  const placePoint = (p: Point): Point => (flip ? mirror(p) : p);
  const shadow: MouthShadow | undefined = shadowShape && {
    gradient: { ...shadowShape.stroke!.gradient!, from: placePoint(shadowShape.stroke!.gradient!.from), to: placePoint(shadowShape.stroke!.gradient!.to) },
    line: resampleLine(place(shadowShape).d, MOUTH_SAMPLES),
    opacity: shadowShape.opacity ?? 1,
    width: shadowShape.stroke!.width,
  };
  const mouth: MouthKey = { line: resampleLine(place(stroke).d, MOUTH_SAMPLES), stroke: { color: stroke.stroke!.color!, width: stroke.stroke!.width }, ...(shadow ? { shadow } : {}) };
  return { eyes, mouth };
}

/** Keys for turning right (sign 1) or left (sign −1). */
function faceKeys(sign: 1 | -1): readonly FaceKey[] {
  const front = drawnFace("front", sign), quarter = drawnFace("threeQuarter", sign), side = drawnFace("side", sign);
  // Turning right, the screen-left eye is the near one; turning left, the screen-right one.
  const [frontNear, frontFar] = sign > 0 ? [front.eyes[0]!, front.eyes[1]!] : [front.eyes[1]!, front.eyes[0]!];
  const [quarterNear, quarterFar] = sign > 0 ? [quarter.eyes[0]!, quarter.eyes[1]!] : [quarter.eyes[1]!, quarter.eyes[0]!];
  const sideEye = side.eyes[0]!;
  const offEdge = (key: EyeKey, extra: number): EyeKey => ({ box: { ...key.box, x: sign * (OFF_EDGE + extra) }, shapes: key.shapes });
  const shiftLine = (line: readonly Point[], dx: number) => line.map((p) => ({ x: p.x + dx, y: p.y }));
  const sideMouthX = (side.mouth.line[0]!.x + side.mouth.line[side.mouth.line.length - 1]!.x) / 2;
  const away = sign * (OFF_EDGE + 10) - sideMouthX;
  const shiftShadow = (shadow: MouthShadow | undefined): MouthShadow | undefined =>
    shadow && {
      ...shadow,
      gradient: { ...shadow.gradient, from: { ...shadow.gradient.from, x: shadow.gradient.from.x + away }, to: { ...shadow.gradient.to, x: shadow.gradient.to.x + away } },
      line: shiftLine(shadow.line, away),
    };
  return [
    { far: frontFar, mouth: front.mouth, near: frontNear, yaw: 0 },
    { far: quarterFar, mouth: quarter.mouth, near: quarterNear, yaw: 30 },
    // The side draws one eye: the far eye has gone round the head by now.
    { far: offEdge(quarterFar, 10), mouth: side.mouth, near: sideEye, yaw: 90 },
    { far: offEdge(quarterFar, 30), mouth: { ...side.mouth, line: shiftLine(side.mouth.line, away), ...(side.mouth.shadow ? { shadow: shiftShadow(side.mouth.shadow)! } : {}) }, near: offEdge(sideEye, 20), yaw: 180 },
  ];
}
const KEYS = { left: faceKeys(-1), right: faceKeys(1) } as const;

/** The V1 sad eyes for one side (left or right of V1's head centre); V2 doesn't draw sad eyes yet. */
function v1SadEye(left: boolean): readonly MascotV2Shape[] {
  return mascotEyes.sad
    .filter((shape) => (boxOf([shape.d]).x <= mascotV1FaceAnchors.headCenterX) === left)
    .map((shape) => ({ d: shape.d, fill: shape.fill ?? mascotV2Colors.ink }));
}

/** The Faces_V2 face each drawn eye set and mouth comes from. */
const EYES_FROM = { angry: "angry", blink: "satisfied", curious: "confused", open: "happy", tired: "sleepy" } as const satisfies Record<Exclude<MascotEyes, "sad">, MascotV2FaceName>;
const MOUTH_FROM = { excited: "excited", happy: "happy", neutral: "confused", sad: "disappointed" } as const satisfies Record<MascotMouth, MascotV2FaceName>;

const shapesOf = (shapes: readonly MascotV2FaceShape[]): MascotV2Shape[] => shapes.map((shape) => ({ d: shape.d, fill: shape.fill, ...(shape.opacity !== undefined ? { opacity: shape.opacity } : {}) }));
const centreOf = (shapes: readonly MascotV2FaceShape[]): Point => {
  const box = boxOf(shapes.map((shape) => shape.d));
  return { x: box.x, y: box.y };
};
const minus = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

/** A Faces_V2 face's eye centres (screen-left, screen-right), their midpoint and its mouth centre. */
function layoutOf(name: MascotV2FaceName) {
  const face = mascotV2Faces[name];
  const eyes = [centreOf(face.eyes[0]), centreOf(face.eyes[1])] as const;
  return { eyes, mouth: centreOf(face.mouth), pair: { x: (eyes[0].x + eyes[1].x) / 2, y: (eyes[0].y + eyes[1].y) / 2 } };
}
const LAYOUT = Object.fromEntries(Object.keys(mascotV2Faces).map((name) => [name, layoutOf(name as MascotV2FaceName)])) as Record<MascotV2FaceName, ReturnType<typeof layoutOf>>;
const OPEN = LAYOUT.happy;

/** How far eyes drawn with the smile sit from where open eyes do, the smile held still. */
const smileHeld = (name: MascotV2FaceName) => (LAYOUT[name].pair.y - LAYOUT[name].mouth.y) - (OPEN.pair.y - OPEN.mouth.y);
const EYE_SHIFT_Y: Record<MascotEyes, number> = { angry: 0, blink: smileHeld("satisfied"), curious: 0, open: 0, sad: 0, tired: smileHeld("sleepy") };

/** Where each mouth sits, from the open eyes' midpoint: its distance below the eyes it was drawn with. */
const mouthFromEyes = (mouth: MascotMouth, eyes: MascotEyes): Point => {
  const layout = LAYOUT[MOUTH_FROM[mouth]];
  return { x: layout.mouth.x - layout.pair.x, y: EYE_SHIFT_Y[eyes] + layout.mouth.y - layout.pair.y };
};
const MOUTH_AT: Record<MascotMouth, Point> = {
  excited: mouthFromEyes("excited", "open"),
  happy: minus(OPEN.mouth, OPEN.pair),
  neutral: mouthFromEyes("neutral", "curious"),
  sad: mouthFromEyes("sad", "tired"),
};
// Angry eyes keep their height above the frown they were drawn with.
EYE_SHIFT_Y.angry = MOUTH_AT.sad.y - (LAYOUT.angry.mouth.y - LAYOUT.angry.pair.y);

/** One drawn eye's shapes, and its offset from where the open eye on that side sits. */
function v2Eye(kind: Exclude<MascotEyes, "sad">, side: 0 | 1): Readonly<{ offset: Point; shapes: readonly MascotV2Shape[] }> {
  const layout = LAYOUT[EYES_FROM[kind]];
  const fromPair = minus(layout.eyes[side], layout.pair), openFromPair = minus(OPEN.eyes[side], OPEN.pair);
  return { offset: { x: fromPair.x - openFromPair.x, y: fromPair.y - openFromPair.y + EYE_SHIFT_Y[kind] }, shapes: shapesOf(mascotV2Faces[EYES_FROM[kind]].eyes[side]) };
}

/** A drawn mouth with its shadow, and its offset from the smile's centre. */
function v2Mouth(kind: Exclude<MascotMouth, "happy">): Readonly<{ mouth: readonly MascotV2Shape[]; offset: Point; shadow: readonly MascotV2Shape[] }> {
  const face = mascotV2Faces[MOUTH_FROM[kind]];
  return { mouth: shapesOf(face.mouth), offset: minus(MOUTH_AT[kind], MOUTH_AT.happy), shadow: shapesOf(face.shadow) };
}

/** A polyline as a path. */
const lineD = (line: readonly Point[]) => serializePath([{ kind: "M", to: line[0]! }, ...line.slice(1).map((p) => ({ kind: "L" as const, to: p }))]);

/**
 * Moves shapes from their own centre (or the centre of `around`, when given) to `to`, scaling
 * them about it by `sx` and `sy`.
 */
function placeFeature(shapes: readonly MascotV2Shape[], to: Point, sx: number, sy: number, id: string, around: readonly MascotV2Shape[] = shapes): MascotV2FacePart[] {
  const from = boxOf(around.map((shape) => shape.d));
  return shapes.map((shape, index) => ({
    d: serializePath(mapPath(parsePath(shape.d), (p) => ({ x: to.x + (p.x - from.x) * sx, y: to.y + (p.y - from.y) * sy }))),
    ...(shape.fill ? { fill: shape.fill } : {}),
    id: `${id}-${index}`,
    ...(shape.opacity !== undefined ? { opacity: shape.opacity } : {}),
    ...(shape.stroke?.color ? { stroke: { color: shape.stroke.color, width: shape.stroke.width } } : {}),
  }));
}

/**
 * The far eye past the 3/4 view: it carries on round the head from its 3/4 spot, one
 * degree round for each degree of turn, so its centre nears the edge (sin) and it narrows
 * (cos, against its 3/4 width). It reaches the edge before the side view.
 */
function farEyeRounding(quarter: Box, turnedPast: number): Readonly<{ width: number; x: number }> {
  const start = Math.asin(Math.min(1, Math.abs(quarter.x) / HEAD_RADIUS));
  const angle = Math.min(Math.PI / 2, start + (turnedPast * Math.PI) / 180);
  return { width: Math.cos(angle) / Math.max(Math.cos(start), 1e-6), x: Math.sign(quarter.x) * HEAD_RADIUS * Math.sin(angle) };
}

/** The face's shapes for a turn, in front-view rig space, or none when he faces away. */
export function faceAt(yaw: number, eyes: MascotEyes, mouth: MascotMouth): MascotV2FacePart[] {
  const y = normalizeYaw(yaw);
  if (Math.abs(y) >= HIDDEN_FROM) return [];
  const keys = y >= 0 ? KEYS.right : KEYS.left;
  const a = Math.abs(y);
  const index = Math.max(0, keys.findIndex((key, i) => i < keys.length - 1 && a >= key.yaw && a <= keys[i + 1]!.yaw));
  const from = keys[index]!, to = keys[index + 1]!;
  const t = smoothstep((a - from.yaw) / (to.yaw - from.yaw));
  const nearer = t < 0.5 ? from : to;
  const boxAt = (feature: "near" | "far"): Box => {
    const p = from[feature].box, q = to[feature].box;
    return { h: lerp(p.h, q.h, t), w: lerp(p.w, q.w, t), x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) };
  };

  const quarter = keys[1]!;
  const parts: MascotV2FacePart[] = [];
  for (const feature of ["far", "near"] as const) {
    let box = boxAt(feature);
    let width = 1;
    if (feature === "far" && a > quarter.yaw) {
      const rounding = farEyeRounding(quarter.far.box, a - quarter.yaw);
      if (rounding.width < FAR_EYE_MIN) continue;
      box = { ...quarter.far.box, x: rounding.x };
      width = rounding.width;
    }
    // Past 3/4 the far eye keeps its 3/4 drawing; the side drawing has only the near eye.
    const source = feature === "far" && a > quarter.yaw ? quarter.far : nearer[feature];
    if (eyes === "open") {
      parts.push(...placeFeature(source.shapes, box, (box.w / source.box.w) * width, box.h / source.box.h, `eye-${feature}`));
    } else {
      // The drawn eye for that side of the face (turning right, the near eye is the screen-left
      // one), sized like the open eye it stands in for and offset from it as drawn.
      const left = (feature === "near") === (y >= 0);
      const front = keys[0]![feature].box;
      const sx = (box.w / front.w) * width, sy = box.h / front.h;
      if (eyes === "sad") {
        parts.push(...placeFeature(v1SadEye(left), box, sx, sy, `eye-${feature}`));
      } else {
        const eye = v2Eye(eyes, left ? 0 : 1);
        parts.push(...placeFeature(eye.shapes, { x: box.x + eye.offset.x * sx, y: box.y + eye.offset.y * sy }, sx, sy, `eye-${feature}`));
      }
    }
  }
  const line = from.mouth.line.map((p, i) => ({ x: lerp(p.x, to.mouth.line[i]!.x, t), y: lerp(p.y, to.mouth.line[i]!.y, t) }));
  const d = lineD(line);
  if (mouth === "happy") {
    parts.push({ d, id: "mouth-0", stroke: nearer.mouth.stroke });
    const a = from.mouth.shadow, b = to.mouth.shadow;
    if (a && b) {
      const mix = (p: Point, q: Point): Point => ({ x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) });
      const shade = a.line.map((p, i) => mix(p, b.line[i]!));
      parts.push({
        d: serializePath([{ kind: "M", to: shade[0]! }, ...shade.slice(1).map((p) => ({ kind: "L" as const, to: p }))]),
        id: "mouth-shadow",
        opacity: lerp(a.opacity, b.opacity, t),
        stroke: { color: a.gradient.stops[0]!.color, gradient: { ...a.gradient, from: mix(a.gradient.from, b.gradient.from), to: mix(a.gradient.to, b.gradient.to) }, width: lerp(a.width, b.width, t) },
      });
    }
  } else {
    // Other mouths sit where their drawing puts them against the smile, with their soft shadow.
    // Turned, they narrow as the drawn smile does.
    const drawn = v2Mouth(mouth);
    const smile = boxOf([d]);
    const sx = smile.w / boxOf([lineD(keys[0]!.mouth.line)]).w;
    const at = { x: smile.x + drawn.offset.x * sx, y: smile.y + drawn.offset.y };
    parts.push(...placeFeature(drawn.shadow, at, sx, 1, "mouth-shadow", drawn.mouth), ...placeFeature(drawn.mouth, at, sx, 1, "mouth"));
  }
  return parts;
}
