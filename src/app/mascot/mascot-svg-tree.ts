/**
 * The mascot scene as plain SVG nodes, shared by the live preview (rendered by React) and
 * SVG export (appended to the runtime's group), so both draw the same thing.
 *
 * The nodes come as one flat list in document order, each with its depth (0 at the top);
 * a node's children are the nodes after it one level deeper, up to the next node at its
 * own depth or shallower.
 *
 * - `defs`: clip paths, one blur filter per blurred layer, and one `linearGradient` (with
 *   `stop`s, in world space) per gradient-painted shape, all referenced by local `url(#id)`.
 * - One group per layer (`data-mascot-layer`), with its opacity and blur.
 * - Inside it, shapes that name a V2 part are grouped as in the Figma file, so an exported
 *   SVG opens with named layers: a group per part group (Leg_L, Arm_R, Body, Headband) and
 *   inside it a group per part (leg_L, foot_L, hand_fist_L, armband_L, moneybag_L,
 *   strand_3, head, face). Runs of shapes from the same part share one group.
 */

import type { MascotLayer, MascotScene, MascotShape } from "./mascot-scene-types";

export type MascotSvgNode = Readonly<{
  attributes: Readonly<Record<string, string>>;
  depth: number;
  tag: string;
}>;

export type MascotSvgTreeOptions = Readonly<{
  /** Prefix for clip, filter and gradient ids, unique per document. */
  idPrefix: string;
  /** The id a part group gets (the plain Figma name in export; prefixed in the live preview). */
  groupId: (name: string) => string;
  /** Keep empty and fully transparent layers (the live preview keeps every layer mounted; export drops them). */
  keepHiddenLayers?: boolean;
}>;

const round = (value: number) => String(Math.round(value * 1000) / 1000);
const gradientId = (prefix: string, shape: MascotShape) => `${prefix}-gradient-${shape.id}`;

type Out = MascotSvgNode[];
const emit = (out: Out, depth: number, tag: string, attributes: Record<string, string>) => out.push({ attributes, depth, tag });

function emitGradients(out: Out, depth: number, scene: MascotScene, prefix: string): void {
  for (const layer of scene.layers) {
    for (const shape of layer.shapes) {
      const gradient = shape.paint.gradient;
      if (!gradient) continue;
      emit(out, depth, "linearGradient", {
        gradientUnits: "userSpaceOnUse",
        id: gradientId(prefix, shape),
        x1: round(gradient.from.x),
        x2: round(gradient.to.x),
        y1: round(gradient.from.y),
        y2: round(gradient.to.y),
      });
      for (const stop of gradient.stops) {
        emit(out, depth + 1, "stop", { offset: round(stop.offset), "stop-color": stop.color, "stop-opacity": round(stop.alpha) });
      }
    }
  }
}

function emitBlur(out: Out, depth: number, layer: MascotLayer, prefix: string): void {
  emit(out, depth, "filter", {
    filterUnits: "userSpaceOnUse",
    height: round(layer.bounds.height),
    id: `${prefix}-blur-${layer.id}`,
    width: round(layer.bounds.width),
    x: round(layer.bounds.x),
    y: round(layer.bounds.y),
  });
  emit(out, depth + 1, "feGaussianBlur", { stdDeviation: round(layer.blur) });
}

function emitShape(out: Out, depth: number, shape: MascotShape, prefix: string): void {
  const paint = shape.paint;
  const colour = paint.gradient ? `url(#${gradientId(prefix, shape)})` : paint.color;
  const attributes: Record<string, string> = { d: shape.d, "data-mascot-part": shape.id };
  if (paint.kind === "fill") {
    attributes.fill = colour;
  } else {
    attributes.fill = "none";
    attributes.stroke = colour;
    attributes["stroke-width"] = round(paint.width);
    attributes["stroke-linecap"] = "round";
    attributes["stroke-linejoin"] = "round";
  }
  if (shape.clipId) attributes["clip-path"] = `url(#${prefix}-${shape.clipId})`;
  if (shape.opacity !== undefined && shape.opacity < 1) attributes.opacity = round(shape.opacity);
  emit(out, depth, "path", attributes);
}

/** A layer's shapes, runs of the same part group and part wrapped in named groups. */
function emitLayerShapes(out: Out, depth: number, layer: MascotLayer, prefix: string, uniqueId: (name: string) => string): void {
  let group: string | undefined;
  let part: string | undefined;
  for (const shape of layer.shapes) {
    const nextGroup = shape.part?.group, nextPart = shape.part?.part;
    if (nextGroup === undefined) {
      group = part = undefined;
      emitShape(out, depth, shape, prefix);
      continue;
    }
    if (nextGroup !== group) {
      emit(out, depth, "g", { "data-mascot-group": nextGroup, id: uniqueId(nextGroup) });
      group = nextGroup;
      part = undefined;
    }
    if (nextPart !== part) {
      emit(out, depth + 1, "g", { "data-mascot-part-name": nextPart!, id: uniqueId(nextPart!) });
      part = nextPart;
    }
    emitShape(out, depth + 2, shape, prefix);
  }
}

/** The whole scene: defs first, then one group per non-empty, visible layer. */
export function mascotSvgTree(scene: MascotScene, options: MascotSvgTreeOptions): MascotSvgNode[] {
  const prefix = options.idPrefix;
  const used: Partial<Record<string, number>> = {};
  // A part name repeats only if paint order splits a part; later runs get -2, -3 and so on.
  const uniqueId = (name: string) => {
    const count = (used[name] ?? 0) + 1;
    used[name] = count;
    return options.groupId(count === 1 ? name : `${name}-${count}`);
  };
  const visible = options.keepHiddenLayers ? scene.layers : scene.layers.filter((layer) => layer.shapes.length > 0 && layer.opacity > 0);
  const out: Out = [];
  const hasGradient = scene.layers.some((layer) => layer.shapes.some((shape) => shape.paint.gradient));
  if (scene.clips.length > 0 || visible.some((layer) => layer.blur > 0) || hasGradient) {
    emit(out, 0, "defs", {});
    for (const clip of scene.clips) {
      emit(out, 1, "clipPath", { clipPathUnits: "userSpaceOnUse", id: `${prefix}-${clip.id}` });
      emit(out, 2, "path", { d: clip.d });
    }
    for (const layer of visible) if (layer.blur > 0) emitBlur(out, 1, layer, prefix);
    emitGradients(out, 1, scene, prefix);
  }
  for (const layer of visible) {
    const attributes: Record<string, string> = { "data-mascot-layer": layer.id };
    if (layer.opacity < 1) attributes.opacity = round(layer.opacity);
    if (layer.blur > 0) attributes.filter = `url(#${prefix}-blur-${layer.id})`;
    emit(out, 0, "g", attributes);
    emitLayerShapes(out, 1, layer, prefix, uniqueId);
  }
  return out;
}
