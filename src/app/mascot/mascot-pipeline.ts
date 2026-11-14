import {
  registerToolcraftRendererPipeline,
  type ToolcraftRendererPipelinePassContract,
} from "@/toolcraft/runtime";

import type { MascotScene } from "./mascot-scene";
import { mascotControlSections } from "./mascot-controls";
import { mascotTargets } from "./mascot-settings";

/** Product targets consumed by the mascot renderer (Background is runtime-owned; Pose is a command). */
export const mascotRendererTargets = Object.values(mascotTargets).filter(
  (target) =>
    target !== mascotTargets.background &&
    target !== mascotTargets.includeBackground &&
    target !== mascotTargets.posePreset,
);

/** Continuous controls whose real UI interaction is a pointer drag: every slider plus the gimbal. */
export const mascotDragTargets: readonly string[] = [
  ...mascotControlSections.flatMap((section) =>
    Object.values(section.controls)
      .filter((control) => control.type === "slider")
      .map((control) => control.target),
  ),
  mascotTargets.viewOrbit,
];

/** Discrete choices, switches and colors that commit one value per change. */
export const mascotChangeTargets = mascotRendererTargets.filter(
  (target) => !mascotDragTargets.includes(target),
);

type MascotPipelineContracts = {
  "mascot-export": ToolcraftRendererPipelinePassContract<MascotScene>;
  "mascot-scene": ToolcraftRendererPipelinePassContract<MascotScene>;
};

export const MASCOT_OVERFLOW_PROOF_ID = "mascot.infinity-overflow";

export const rendererPipelineRegistration =
  registerToolcraftRendererPipeline<MascotPipelineContracts>()({
    interactionInvalidation: [
      { interaction: "initial-render", invalidates: ["mascot-scene"], targets: ["canvas.size"] },
      {
        interaction: "control-drag",
        invalidates: ["mascot-scene"],
        targets: [...mascotDragTargets],
      },
      {
        interaction: "control-change",
        invalidates: ["mascot-scene"],
        targets: [...mascotChangeTargets],
      },
      {
        interaction: "viewport-drag",
        invalidates: [],
        mustNotInvalidate: ["mascot-scene"],
        targets: ["canvas.offset"],
      },
      {
        interaction: "viewport-zoom",
        invalidates: [],
        mustNotInvalidate: ["mascot-scene"],
        targets: ["canvas.zoom"],
      },
      {
        interaction: "timeline-scrub",
        invalidates: ["mascot-scene"],
        targets: ["timeline.currentTimeSeconds"],
      },
      {
        interaction: "timeline-playback",
        invalidates: ["mascot-scene"],
        targets: ["timeline.playing"],
      },
      {
        interaction: "export",
        invalidates: ["mascot-export"],
        targets: ["export.image.format", "export.image.resolution"],
      },
    ],
    passes: [
      {
        cacheKey: ["sceneKey"],
        cost: { dimensions: [], frequency: "interaction", relationship: "constant" },
        id: "mascot-scene",
        inputs: [...mascotRendererTargets, "timeline.currentTimeSeconds"],
        invalidatedBy: [...mascotRendererTargets],
        kind: "vector-build",
        lifecycle: { cache: "memoized", resourceScope: "call" },
        output: "preview",
        quality: "full",
        runsOn: "main",
        sceneBounds: { kind: "content", proofIds: [MASCOT_OVERFLOW_PROOF_ID] },
      },
      {
        cost: { dimensions: ["export-long-edge"], frequency: "batch", relationship: "quadratic" },
        id: "mascot-export",
        inputs: [
          ...mascotRendererTargets,
          "timeline.currentTimeSeconds",
          "export.image.format",
          "export.image.resolution",
        ],
        invalidatedBy: [...mascotRendererTargets, "export.image.resolution"],
        kind: "export",
        lifecycle: { cache: "none", resourceScope: "call" },
        output: "export",
        quality: "export",
        runsOn: "export-only",
      },
    ],
    runtimeId: "clutch-mascot-lab",
  });
