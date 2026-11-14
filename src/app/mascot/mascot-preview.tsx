"use client";

import * as React from "react";

import {
  useToolcraftEvaluatedValues,
  useToolcraftModelOrbitInteraction,
  useToolcraftPipelinePass,
  useToolcraftProductSceneFrame,
} from "@/toolcraft/runtime/react";

import styles from "./mascot-preview.module.css";
import { rendererPipelineRegistration } from "./mascot-pipeline";
import { MASCOT_PIVOT_MARKER } from "./mascot-pivot-marker";
import type { MascotScene } from "./mascot-scene";
import { getMascotSceneForSettings, getMascotSceneKey } from "./mascot-scene-cache";
import { mascotTargets, readMascotSettings } from "./mascot-settings";
import { mascotSvgTree, type MascotSvgNode } from "./mascot-svg-tree";

const scenePass = rendererPipelineRegistration.getPass("mascot-scene");

type Units = "userSpaceOnUse" | "objectBoundingBox";
type Cap = "round" | "butt" | "square";
type Join = "round" | "miter" | "bevel";

/** One of the scene's SVG nodes (see `mascot-svg-tree.ts`) as JSX, with its attributes spelled out. */
function SvgNode({ attributes: a, children, tag }: Readonly<{ attributes: MascotSvgNode["attributes"]; children: React.ReactNode; tag: string }>) {
  switch (tag) {
    case "defs":
      return <defs>{children}</defs>;
    case "clipPath":
      return (
        <clipPath clipPathUnits={a.clipPathUnits as Units} id={a.id}>
          {children}
        </clipPath>
      );
    case "filter":
      return (
        <filter filterUnits={a.filterUnits as Units} height={a.height} id={a.id} width={a.width} x={a.x} y={a.y}>
          {children}
        </filter>
      );
    case "feGaussianBlur":
      return <feGaussianBlur stdDeviation={a.stdDeviation} />;
    case "linearGradient":
      return (
        <linearGradient gradientUnits={a.gradientUnits as Units} id={a.id} x1={a.x1} x2={a.x2} y1={a.y1} y2={a.y2}>
          {children}
        </linearGradient>
      );
    case "stop":
      return <stop offset={a.offset} stopColor={a["stop-color"]} stopOpacity={a["stop-opacity"]} />;
    case "g":
      return (
        <g
          data-mascot-group={a["data-mascot-group"]}
          data-mascot-layer={a["data-mascot-layer"]}
          data-mascot-part-name={a["data-mascot-part-name"]}
          filter={a.filter}
          id={a.id}
          opacity={a.opacity}
        >
          {children}
        </g>
      );
    case "path":
      return (
        <path
          clipPath={a["clip-path"]}
          d={a.d}
          data-mascot-part={a["data-mascot-part"]}
          fill={a.fill}
          opacity={a.opacity}
          stroke={a.stroke}
          strokeLinecap={a["stroke-linecap"] as Cap | undefined}
          strokeLinejoin={a["stroke-linejoin"] as Join | undefined}
          strokeWidth={a["stroke-width"]}
        />
      );
    default:
      return null;
  }
}

type OpenNode = { children: React.ReactNode[]; key: number; node: MascotSvgNode };

/**
 * The scene's SVG nodes, shared with SVG export (`mascot-svg-tree.ts`), as React elements.
 * The nodes arrive flat with their depth; a stack of open nodes rebuilds the nesting.
 */
function MascotSceneGraphics({ idPrefix, scene }: Readonly<{ idPrefix: string; scene: MascotScene }>) {
  const nodes = mascotSvgTree(scene, { groupId: (name) => `${idPrefix}-${name}`, idPrefix, keepHiddenLayers: true });
  const top: React.ReactNode[] = [];
  const open: OpenNode[] = [];
  const close = () => {
    const done = open.pop()!;
    const element = (
      <SvgNode attributes={done.node.attributes} key={done.key} tag={done.node.tag}>
        {done.children}
      </SvgNode>
    );
    (open.length > 0 ? open[open.length - 1]!.children : top).push(element);
  };
  nodes.forEach((node, index) => {
    while (open.length > node.depth) close();
    open.push({ children: [], key: index, node });
  });
  while (open.length > 0) close();
  return <>{top}</>;
}

/** The body pivot (Body > Pivot) as a white disc with a blue centre; preview only, see `mascot-pivot-marker.ts`. */
function MascotPivotMarker({ at }: Readonly<{ at: Readonly<{ x: number; y: number }> }>) {
  const { dot, ring } = MASCOT_PIVOT_MARKER;
  return (
    <g aria-hidden="true" data-mascot-pivot-marker="" pointerEvents="none">
      <circle
        cx={at.x}
        cy={at.y}
        fill={ring.color}
        r={ring.radius}
        stroke={ring.edge}
        strokeOpacity={ring.edgeOpacity}
        strokeWidth={ring.edgeWidth}
      />
      <circle cx={at.x} cy={at.y} fill={dot.color} r={dot.radius} />
    </g>
  );
}

/** Live SVG preview of the posed mascot inside the runtime product scene. */
export function MascotPreview(): React.JSX.Element | null {
  const frame = useToolcraftProductSceneFrame();
  const values = useToolcraftEvaluatedValues();
  const settings = React.useMemo(() => readMascotSettings(values), [values]);
  const sceneKey = React.useMemo(() => getMascotSceneKey(settings), [settings]);
  const passState = useToolcraftPipelinePass(scenePass, { sceneKey }, () =>
    getMascotSceneForSettings(settings),
  );
  const idPrefix = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const scene =
    passState.status === "success" ? passState.result : getMascotSceneForSettings(settings);

  const svgRef = React.useRef<SVGSVGElement>(null);
  const rect = frame.kind === "ready" ? frame.rect : null;

  /** Only presses on the mascot's own painted paths turn it; misses leave the canvas alone. */
  const hitTest = React.useCallback(
    (clientX: number, clientY: number): boolean => {
      const svg = svgRef.current;
      if (!svg || !rect) return false;
      const box = svg.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return false;
      const point = {
        x: rect.x + ((clientX - box.left) / box.width) * rect.width,
        y: rect.y + ((clientY - box.top) / box.height) * rect.height,
      };
      return Array.from(svg.querySelectorAll<SVGPathElement>('[data-mascot-layer="mascot"] path')).some(
        (path) => path.isPointInFill(point) || path.isPointInStroke(point),
      );
    },
    [rect],
  );
  const { onLostPointerCapture, onPointerCancel, onPointerDown, onPointerMove, onPointerUp } =
    // `never` lets the SVG rect accept these handlers; they only use the event's pointer data.
    useToolcraftModelOrbitInteraction<never>({
    historyLabel: "Turn mascot",
    hitTest,
    target: mascotTargets.viewOrbit,
  });

  if (!rect) return null;
  return (
    <svg
      aria-label="Clutch mascot pose"
      className={styles.preview}
      data-toolcraft-product-output=""
      height="100%"
      ref={svgRef}
      role="img"
      viewBox={`${rect.x} ${rect.y} ${rect.width} ${rect.height}`}
      width="100%"
      xmlns="http://www.w3.org/2000/svg"
    >
      <MascotSceneGraphics idPrefix={`mascot-${idPrefix}`} scene={scene} />
      {scene.pivot ? <MascotPivotMarker at={scene.pivot} /> : null}
      {/* Transparent orbit surface over the mascot; presses on its painted paths turn it (see hitTest). */}
      <rect
        className={styles.orbitSurface}
        data-canvas-model-layer=""
        data-toolcraft-canvas-handle="mascot-orbit"
        data-toolcraft-model-orbit-surface="true"
        fill="transparent"
        height={rect.height}
        onLostPointerCapture={onLostPointerCapture}
        onPointerCancel={onPointerCancel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        width={rect.width}
        x={rect.x}
        y={rect.y}
      />
    </svg>
  );
}
