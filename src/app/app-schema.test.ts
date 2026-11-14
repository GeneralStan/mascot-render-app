import { describe, expect, it } from "vitest";

import { appAcceptance, appProductReadiness } from "./app-acceptance";
import appDefaults from "./app-defaults.json" with { type: "json" };
import { appPerformance } from "./app-performance";
import { appSchema, MASCOT_TIMELINE_SECONDS } from "./app-schema";
import { mascotControlSections } from "./mascot/mascot-controls";

const sections = appSchema.panels.controls?.sections ?? [];

describe("appSchema", () => {
  it("is the Clutch Mascot Lab product, not the neutral starter", () => {
    expect(appProductReadiness).toMatchObject({ mode: "product", productName: "Clutch Mascot Lab" });
    // The saved defaults (Save State as Default) open on the Infinity canvas; the artboard size still sets exports.
    expect(appSchema.canvas.sizing).toEqual({ defaultMode: appDefaults.state.canvas.mode, mode: "editable-output" });
    expect(appSchema.canvas.upload).toBe(false);
    expect(appSchema.canvas.size).toMatchObject({ height: 1080, width: 1920 });
  });

  it("keeps runtime Setup first and the mascot sections in task order after it", () => {
    expect(sections[0]?.id).toBe("runtime.defaults");
    expect(sections[1]?.title).toBe("Settings");
    const productIds = sections.map((section) => section.id).filter((id) => !id.startsWith("runtime."));
    expect(productIds).toEqual(
      mascotControlSections.map((section) => section.id).filter((id) => id !== "background"),
    );
    // The pivot pad has its own block right after Body, whose Lean and Squash it works with.
    expect(productIds.indexOf("body-pivot")).toBe(productIds.indexOf("body") + 1);
    expect(sections.slice(-3).map((section) => section.id)).toEqual([
      "runtime.image-export",
      "runtime.video-export",
      "runtime.export",
    ]);
  });

  it("animates poses with a keyframe timeline sized to the loop intent", () => {
    expect(appSchema.panels.timeline).toMatchObject({
      defaultDurationSeconds: MASCOT_TIMELINE_SECONDS,
      enabled: true,
      mode: "keyframes",
    });
  });

  it("exports PNG, SVG and video from the sticky footer", () => {
    const footer = sections.find((section) => section.id === "runtime.export")?.controls.footer;
    expect(footer?.type).toBe("panelActions");
    expect(footer?.actions?.map((action) => (typeof action === "string" ? action : action.value))).toEqual([
      "export.png",
      "export.svg",
      "export.video",
    ]);
  });

  it("persists canvas, panels, timeline and values locally with reload coverage", () => {
    expect(appSchema.persistence).toMatchObject({
      include: ["canvas", "panels", "timeline", "values"],
      storage: "localStorage",
    });
    expect(appAcceptance.find((row) => row.id === "persistence.reload")).toMatchObject({
      persistenceCoverage: "reload",
      persistenceSlices: ["canvas", "panels", "timeline", "values"],
    });
  });

  it("registers the mascot renderer pipeline for performance assessment", () => {
    expect(appPerformance.rendererPipeline?.passes.map((pass) => pass.id)).toEqual(
      expect.arrayContaining(["mascot-scene", "mascot-export"]),
    );
  });
});
