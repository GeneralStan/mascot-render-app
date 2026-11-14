import type { MascotScene } from "./mascot-scene";
import type { MascotPaint } from "./mascot-scene-types";

/** #RRGGBB with an alpha, as a CSS rgba() colour for gradient stops. */
function rgba(hex: string, alpha: number): string {
  const channel = (i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `rgba(${channel(0)}, ${channel(1)}, ${channel(2)}, ${alpha})`;
}

/** The style for a paint: its colour, or a linear gradient in world space (the context's transform maps it to pixels). */
function paintStyle(context: CanvasRenderingContext2D, paint: MascotPaint): string | CanvasGradient {
  const gradient = paint.gradient;
  if (!gradient) return paint.color;
  const style = context.createLinearGradient(gradient.from.x, gradient.from.y, gradient.to.x, gradient.to.y);
  for (const stop of gradient.stops) style.addColorStop(stop.offset, rgba(stop.color, stop.alpha));
  return style;
}

/** Straight-alpha "over": blends opaque layer pixels onto the saved pixels at `opacity`, in place. */
function blendOver(source: Uint8ClampedArray, destination: Uint8ClampedArray, opacity: number): void {
  for (let index = 0; index < source.length; index += 4) {
    const sourceAlpha = (source[index + 3]! / 255) * opacity;
    if (sourceAlpha <= 0) continue;
    const destinationAlpha = destination[index + 3]! / 255;
    const outAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
    for (let channel = 0; channel < 3; channel += 1) {
      destination[index + channel] = Math.round(
        (source[index + channel]! * sourceAlpha +
          destination[index + channel]! * destinationAlpha * (1 - sourceAlpha)) /
          outAlpha,
      );
    }
    destination[index + 3] = Math.round(outAlpha * 255);
  }
}

/**
 * Draws the scene into the runtime export context, whose current transform maps
 * world coordinates to destination pixels.
 *
 * Shadow layers (opacity < 1 or blur) must composite as one group so overlapping
 * silhouette parts do not darken. Product export code may not allocate canvases, so a
 * grouped layer is composited in place: the destination pixels under the layer are
 * saved, the layer is painted opaque into the cleared area and read back, and the two
 * are blended at the layer's opacity. Blur is applied per shape through the context
 * filter, measured in world pixels.
 */
export function drawMascotScene(context: CanvasRenderingContext2D, scene: MascotScene): void {
  const clips = new Map(scene.clips.map((clip) => [clip.id, new Path2D(clip.d)] as const));
  const transform = context.getTransform();
  const pixelScale = Math.hypot(transform.a, transform.b) || 1;
  const canvasWidth = context.canvas.width;
  const canvasHeight = context.canvas.height;

  scene.layers.forEach((layer) => {
    if (layer.shapes.length === 0 || layer.opacity <= 0) return;
    const grouped = layer.opacity < 1 || layer.blur > 0;

    // Pixel rectangle of the layer (its bounds already include the blur margin), clamped to the canvas.
    const { x, y, width, height } = layer.bounds;
    const xs = [x, x + width].flatMap((px) => [y, y + height].map((py) => transform.a * px + transform.c * py + transform.e));
    const ys = [x, x + width].flatMap((px) => [y, y + height].map((py) => transform.b * px + transform.d * py + transform.f));
    const left = Math.max(0, Math.floor(Math.min(...xs)));
    const top = Math.max(0, Math.floor(Math.min(...ys)));
    const right = Math.min(canvasWidth, Math.ceil(Math.max(...xs)));
    const bottom = Math.min(canvasHeight, Math.ceil(Math.max(...ys)));
    if (grouped && (right <= left || bottom <= top)) return;


    const paintShapes = (): void => {
      layer.shapes.forEach((shape) => {
        const path = new Path2D(shape.d);
        const clip = shape.clipId ? clips.get(shape.clipId) : undefined;
        const faded = shape.opacity !== undefined && shape.opacity < 1;
        if (clip || faded) context.save();
        if (clip) context.clip(clip);
        if (faded) context.globalAlpha *= shape.opacity!;
        if (shape.paint.kind === "fill") {
          context.fillStyle = paintStyle(context, shape.paint);
          context.fill(path);
        } else {
          context.strokeStyle = paintStyle(context, shape.paint);
          context.lineWidth = shape.paint.width;
          context.lineCap = "round";
          context.lineJoin = "round";
          context.stroke(path);
        }
        if (clip || faded) context.restore();
      });
    };

    if (!grouped) {
      context.save();
      context.globalAlpha *= layer.opacity;
      paintShapes();
      context.restore();
      return;
    }

    const below = context.getImageData(left, top, right - left, bottom - top);
    context.save();
    // Keep the opaque paint inside the saved rectangle; only that rectangle is blended back.
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.beginPath();
    context.rect(left, top, right - left, bottom - top);
    context.clip();
    context.clearRect(left, top, right - left, bottom - top);
    context.setTransform(transform);
    if (layer.blur > 0) context.filter = `blur(${layer.blur * pixelScale}px)`;
    paintShapes();
    context.restore();
    const painted = context.getImageData(left, top, right - left, bottom - top);
    blendOver(painted.data, below.data, layer.opacity);
    context.putImageData(below, left, top);
  });
}
