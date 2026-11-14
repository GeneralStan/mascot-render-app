import {
  evaluateToolcraftTimelineValues,
  type ToolcraftProductExportRenderer,
  type ToolcraftProductSceneBoundsProvider,
  type ToolcraftProductSvgExportRenderer,
  type ToolcraftRendererPipelineClient,
} from "@/toolcraft/runtime";

import { drawMascotScene } from "./mascot-canvas-renderer";
import { rendererPipelineRegistration } from "./mascot-pipeline";
import type { MascotScene } from "./mascot-scene";
import { getMascotSceneForSettings, getMascotSceneKey } from "./mascot-scene-cache";
import { readMascotSettings } from "./mascot-settings";
import { appendMascotSceneVectors } from "./mascot-svg-export";

type ReadonlyState = Parameters<ToolcraftProductSceneBoundsProvider>[0]["state"];

function sceneForState(state: ReadonlyState, timeSeconds?: number): MascotScene {
  const values = evaluateToolcraftTimelineValues(
    state,
    timeSeconds ?? state.timeline.currentTimeSeconds,
  );
  return getMascotSceneForSettings(readMascotSettings(values));
}

async function exportScene(
  state: ReadonlyState,
  timeSeconds: number,
  pipeline: ToolcraftRendererPipelineClient | null,
  signal: AbortSignal,
): Promise<MascotScene> {
  signal.throwIfAborted();
  const settings = readMascotSettings(evaluateToolcraftTimelineValues(state, timeSeconds));
  if (!pipeline) return getMascotSceneForSettings(settings);
  return pipeline.runPass(
    rendererPipelineRegistration.getPass("mascot-export"),
    undefined,
    () => getMascotSceneForSettings(settings),
  );
}

/** Exact-state world bounds of every painted mascot and shadow pixel. */
export const mascotSceneBoundsProvider: ToolcraftProductSceneBoundsProvider = ({ state }) => [
  sceneForState(state).bounds,
];

export const mascotRasterFrameRenderer: ToolcraftProductExportRenderer = {
  baseFileName: "clutch-mascot",
  renderFrame: async ({ context, rendererPipeline, signal, state, timeSeconds }) => {
    const scene = await exportScene(state, timeSeconds, rendererPipeline, signal);
    signal.throwIfAborted();
    drawMascotScene(context, scene);
  },
};

export const mascotVectorFrameRenderer: ToolcraftProductSvgExportRenderer = {
  baseFileName: "clutch-mascot",
  renderFrame: async ({ container, rendererPipeline, signal, state, timeSeconds }) => {
    const scene = await exportScene(state, timeSeconds, rendererPipeline, signal);
    signal.throwIfAborted();
    appendMascotSceneVectors(container, scene);
  },
};

export { getMascotSceneKey };
