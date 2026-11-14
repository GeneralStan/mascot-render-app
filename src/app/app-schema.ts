import {
  defineToolcraft,
  imageExportModule,
  spatialViewModule,
  svgExportModule,
  timelineModule,
  videoExportModule,
} from "@/toolcraft/runtime";

import appDefaults from "./app-defaults.json" with { type: "json" };
import { appIdentity } from "./app-identity";
import { mascotControlSections } from "./mascot/mascot-controls";

/** Default keyframe loop: room for a few pose changes at a readable pace. */
export const MASCOT_TIMELINE_SECONDS = 4;

export const appSchema = defineToolcraft({
  defaults: appDefaults,
  base: {
    canvas: {
      enabled: true,
      size: { height: 1080, unit: "px", width: 1920 },
      sizing: { mode: "editable-output" },
      upload: false,
    },
    identity: appIdentity,
    panels: {
      controls: {
        sections: [...mascotControlSections],
        title: "Clutch Mascot Lab",
      },
    },
    toolbar: {
      history: true,
      radar: true,
      theme: true,
      zoom: true,
    },
  },
  modules: [
    spatialViewModule(),
    timelineModule({ defaultDurationSeconds: MASCOT_TIMELINE_SECONDS, mode: "keyframes" }),
    imageExportModule(),
    svgExportModule(),
    videoExportModule(),
  ],
});
