import {
  defineToolcraftPerformance,
  deriveToolcraftPerformancePaths,
  type ToolcraftEnvelopePerformanceConfig,
  type ToolcraftPerformanceScenario,
} from "@/toolcraft/runtime";

import { appSchema } from "./app-schema";
import { rendererPipelineRegistration } from "./mascot/mascot-pipeline";

const exportResolutionEntries = [
  { appliedValue: "2k", value: 2048 },
  { appliedValue: "4k", value: 4096 },
  { appliedValue: "8k", value: 8192 },
] as const;

const basePerformance = {
  fixtureAdapters: {
    dimensions: {
      "export-long-edge": {
        apply: (value: number) =>
          exportResolutionEntries.find((entry) => entry.value === value)?.appliedValue ?? "4k",
        dimensionId: "export-long-edge",
        domain: {
          kind: "schema-options",
          optionValues: ["2k", "4k", "8k"],
          target: "export.image.resolution",
        },
        entries: exportResolutionEntries,
        kind: "exhaustive-discrete",
        observe: (value: boolean | number | string) =>
          exportResolutionEntries.find((entry) => entry.appliedValue === value)?.value ?? 4096,
      },
    },
  },
  rendererPipeline: rendererPipelineRegistration,
  rendererStrategy: "svg",
  rendererTechnique: {
    exportRenderer: "canvas-2d",
    fidelityRisks: [
      "Raster export redraws the same world-space paths with Canvas 2D Path2D; blur uses canvas filters, which can differ from SVG feGaussianBlur by a fraction of a pixel.",
      "The turn reproduces the drawn front, 3/4, side and back exactly and blends between them; angles in between, the far limbs side-on and the V1-reused expressions are computed, not drawn.",
      "Shading is re-lit in code from the light angle in place of the drawn shade and highlight layers, so at the drawn light it matches the Figma shading closely but not exactly.",
    ],
    layers: [
      {
        content: ["geometry"],
        exportMode: "included",
        id: "mascot-vector-scene",
        kind: "product-foreground",
        primitiveCount: "low",
        renderer: "svg",
        uiSelector: "[data-toolcraft-product-output] [data-mascot-layer='mascot']",
      },
    ],
    performanceRisks: [
      "Large shadow blur radii make the browser's SVG filter and Canvas 2D blur cost grow with blurred area.",
      "Every pose, light or shadow edit rebuilds about 110 mascot paths (up to about 190 with money bags and the cast and drop shadows) on the main thread, in about 13 ms; the count depends only on which props and shadows are on, so cost stays constant while dragging.",
    ],
    previewExportDifferenceReason:
      "Preview stays editable SVG; PNG, JPG and video need pixels, so export replays the identical scene paths through Canvas 2D, while SVG export appends the same paths as vectors.",
    previewRenderer: "svg",
    productRepresentation: "vector",
    rendererStrategy: "svg",
    sourceRepresentation: "svg",
    whyNotAlternativeStrategies: [
      "Canvas 2D or WebGL preview would rasterize the Figma vectors and lose crisp zoom plus the direct SVG export path.",
      "DOM/CSS transforms cannot bend limb centerlines or project the face across the head.",
    ],
  },
  scenarios: [],
  usesCustomRenderer: true,
  workloadEnvelope: {
    dimensions: [
      {
        batchMax: 8192,
        defaultValue: 4096,
        id: "export-long-edge",
        mapping: "quadratic",
        source: { kind: "schema-target", target: "export.image.resolution" },
        unit: "px",
      },
    ],
  },
} satisfies ToolcraftEnvelopePerformanceConfig;

const scenarioObservable: Record<string, string> = {
  "control-change": "The mascot SVG paths change to the selected choice, switch or color.",
  "control-drag": "The posed mascot paths follow the slider or pad during the drag.",
  export: "A non-empty artifact downloads containing the posed mascot.",
  "initial-render": "The default Figma mascot pose renders in the product scene.",
  "timeline-playback": "Keyframed pose values animate the mascot while playing.",
  "timeline-scrub": "Scrubbing the playhead redraws the keyframed pose at that time.",
  "viewport-drag": "The canvas pans while the mascot scene is reused unchanged.",
  "viewport-zoom": "The canvas zooms while the mascot scene is reused unchanged.",
};

const scenarioControlLabel: Partial<Record<string, string>> = {
  "control-change": "Eyes",
  "control-drag": "Scale",
  "timeline-playback": "Play playback",
  "timeline-scrub": "Timeline scrubber",
};

export const appPerformancePaths = deriveToolcraftPerformancePaths(appSchema, basePerformance);

function toScenario(path: (typeof appPerformancePaths)[number]): ToolcraftPerformanceScenario {
  const base = {
    automated: true,
    automatedTestName: `declares performance coverage for ${path.interaction}`,
    browser: true,
    browserTestName: `browser perf: toolcraft path ${path.id}`,
    coversTargets: path.targets,
    expectedObservable: scenarioObservable[path.interaction] ?? "The mascot scene responds.",
    fixture: "default mascot workspace",
    id: `mascot-${path.interaction}`,
    pathId: path.id,
  };
  if (path.interaction === "export") {
    return {
      ...base,
      actionValue: "export.png",
      completionEvidence: "download",
      controlLabel: "Export PNG",
      interaction: "export",
    };
  }
  const label = scenarioControlLabel[path.interaction];
  return { ...base, ...(label ? { controlLabel: label } : {}), interaction: path.interaction };
}

export const appPerformance: ToolcraftEnvelopePerformanceConfig = defineToolcraftPerformance({
  ...basePerformance,
  scenarios: appPerformancePaths.map(toScenario),
});
