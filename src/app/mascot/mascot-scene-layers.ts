/** Layer building shared by the mascot scenes: world-space shapes into bounded, serialised layers. */

import {
  emptyBounds,
  includePath,
  includePoint,
  isFiniteBounds,
  serializePath,
  type Bounds,
  type ParsedPath,
} from "./mascot-path";
import type { MascotLayer, MascotLayerId, MascotPaint, MascotRect, MascotShapePart } from "./mascot-scene-types";

export type RigShape = {
  clipId?: string;
  id: string;
  opacity?: number;
  paint: MascotPaint;
  part?: MascotShapePart;
  path: ParsedPath;
};

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): ParsedPath {
  const k = 0.5522847498;
  const ox = rx * k;
  const oy = ry * k;
  return [
    { kind: "M", to: { x: cx - rx, y: cy } },
    { c1: { x: cx - rx, y: cy - oy }, c2: { x: cx - ox, y: cy - ry }, kind: "C", to: { x: cx, y: cy - ry } },
    { c1: { x: cx + ox, y: cy - ry }, c2: { x: cx + rx, y: cy - oy }, kind: "C", to: { x: cx + rx, y: cy } },
    { c1: { x: cx + rx, y: cy + oy }, c2: { x: cx + ox, y: cy + ry }, kind: "C", to: { x: cx, y: cy + ry } },
    { c1: { x: cx - ox, y: cy + ry }, c2: { x: cx - rx, y: cy + oy }, kind: "C", to: { x: cx - rx, y: cy } },
    { kind: "Z" },
  ];
}

export function boundsToRect(bounds: Bounds): MascotRect {
  if (!isFiniteBounds(bounds)) return { height: 0, width: 0, x: 0, y: 0 };
  return {
    height: bounds.maxY - bounds.minY,
    width: bounds.maxX - bounds.minX,
    x: bounds.minX,
    y: bounds.minY,
  };
}

export function shapeBounds(shapes: readonly RigShape[], blur: number): Bounds {
  const bounds = emptyBounds();
  const blurPad = blur * 3;
  for (const shape of shapes) {
    const strokePad = shape.paint.kind === "stroke" ? shape.paint.width / 2 : 0;
    includePath(bounds, shape.path, strokePad + blurPad);
  }
  return bounds;
}

/** Shadow copies: every shape in one flat colour, without its opacity, gradient or part. */
export function recolor(shapes: readonly RigShape[], color: string, prefix: string): RigShape[] {
  return shapes.map((shape) => ({
    id: `${prefix}-${shape.id}`,
    paint:
      shape.paint.kind === "stroke"
        ? { color, kind: "stroke", width: shape.paint.width }
        : { color, kind: "fill" },
    path: shape.path,
  }));
}

export function toLayer(
  id: MascotLayerId,
  shapes: readonly RigShape[],
  opacity: number,
  blur: number,
): MascotLayer {
  return {
    blur,
    bounds: boundsToRect(shapeBounds(shapes, blur)),
    id,
    opacity,
    shapes: shapes.map((shape) => ({
      ...(shape.clipId ? { clipId: shape.clipId } : {}),
      d: serializePath(shape.path),
      id: shape.id,
      ...(shape.opacity !== undefined && shape.opacity < 1 ? { opacity: shape.opacity } : {}),
      paint: shape.paint,
      ...(shape.part ? { part: shape.part } : {}),
    })),
  };
}

/** Whole-pixel bounds around every non-empty layer, padded by 2 px. */
export function sceneBounds(layers: readonly MascotLayer[]): MascotRect {
  const total = emptyBounds();
  layers.forEach((layer) => {
    if (layer.bounds.width <= 0 && layer.bounds.height <= 0) return;
    includePoint(total, { x: layer.bounds.x, y: layer.bounds.y });
    includePoint(total, { x: layer.bounds.x + layer.bounds.width, y: layer.bounds.y + layer.bounds.height });
  });
  const pad = 2;
  return isFiniteBounds(total)
    ? {
        height: Math.ceil(total.maxY - total.minY + pad * 2),
        width: Math.ceil(total.maxX - total.minX + pad * 2),
        x: Math.floor(total.minX - pad),
        y: Math.floor(total.minY - pad),
      }
    : { height: 1, width: 1, x: 0, y: 0 };
}
