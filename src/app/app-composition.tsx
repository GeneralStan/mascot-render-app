import { composeToolcraftApp } from "@/toolcraft/runtime/react";

import { appSchema } from "./app-schema";
import {
  mascotRasterFrameRenderer,
  mascotSceneBoundsProvider,
  mascotVectorFrameRenderer,
} from "./mascot/mascot-output";
import { rendererPipelineRegistration } from "./mascot/mascot-pipeline";
import { onMascotPanelAction } from "./mascot/mascot-pose-presets";
import { MascotPreview } from "./mascot/mascot-preview";

export const appComposition = composeToolcraftApp(appSchema, {
  actions: { onPanelAction: onMascotPanelAction },
  renderer: { pipelineRegistration: rendererPipelineRegistration },
  scene: {
    canvasContent: <MascotPreview />,
    rasterFrameRenderer: mascotRasterFrameRenderer,
    renderDefaultCanvasMedia: false,
    sceneBoundsProvider: mascotSceneBoundsProvider,
    vectorFrameRenderer: mascotVectorFrameRenderer,
  },
});
