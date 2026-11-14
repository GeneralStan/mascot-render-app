/** The `export` domain: Include background and the Image and Video Export settings. */
import { readFile } from "node:fs/promises";

import type { Download, Page } from "@playwright/test";

import { getToolcraftApplicabilityRequirementId, getToolcraftControlApplicabilityCases } from "../src/app/app-acceptance";
import { appAcceptance, appControlSectionInventory, MASCOT_BROWSER_TESTS } from "../src/app/app-acceptance-data";
import { appSchema } from "../src/app/app-schema";
import { mascotTargets as t } from "../src/app/mascot/mascot-settings";
import { expectToolcraftBackgroundOutputSemantics } from "./browser-background-output-evidence";
import { expectToolcraftControlApplicabilityState } from "./browser-control-applicability-evidence";
import { expectToolcraftInfinityCanvasBackgroundEvidence } from "./browser-infinity-canvas-evidence";
import { observeInfinityCanvasBackground } from "./browser-infinity-canvas-observation";
import {
  expectToolcraftImageExportArtifact,
  expectToolcraftVideoExportArtifact,
} from "./browser-media-export-evidence";
import { inspectToolcraftImageDownload } from "./image-artifact-inspection";
import { frameSchedule, HEAD_PIXELS, MASCOT_BOUNDS, prepareLeanAnimation } from "./product-mascot-export-support";
import { WHITE, chooseOption, download, openMascot, prepareTimeline, setDuration, setSwitch } from "./product-mascot-support";
import { test } from "./toolcraft-product-test";
import { inspectToolcraftVideoDownload } from "./video-artifact-inspection";

/** Preview background visibility read from the runtime finite background layer, plus the product signature. */
function readBackgroundPreview(root: HTMLElement): { backgroundVisible: boolean; outputSignature: string } {
  const layer = root.querySelector<HTMLElement>("[data-toolcraft-finite-background-layer]");
  const color = layer ? getComputedStyle(layer).backgroundColor : "none";
  const visible = Boolean(layer) && color !== "transparent" && color !== "rgba(0, 0, 0, 0)" && getComputedStyle(layer!).display !== "none";
  const svg = root.querySelector("svg[data-toolcraft-product-output]");
  return { backgroundVisible: visible, outputSignature: `${visible ? color : "none"}|${svg ? svg.innerHTML.length : 0}` };
}

async function cornerAlpha(page: Page, file: Download): Promise<number> {
  const bytes = (await readFile((await file.path())!)).toString("base64");
  return page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(2, 2, 1, 1).data[3]!;
  }, bytes);
}

const includeRow = appAcceptance.find((row) => row.target === t.includeBackground && row.kind === "control");
if (includeRow?.browser) {
  test(includeRow.browser.testName, async ({ page }) => {
    const session = await openMascot(page);
    await prepareTimeline(page, false);
    await setDuration(page, 1);
    await expectToolcraftBackgroundOutputSemantics(
      session.observe(readBackgroundPreview),
      session.controlAction(t.includeBackground, (locator) => locator.getByRole("switch").click()),
      { backgroundVisible: false, outputSignature: `none|${(await page.locator("svg[data-toolcraft-product-output]").evaluate((svg) => svg.innerHTML.length))}` },
      session.targetAction("actions.output", (current) => download(current, /^Export PNG$/)),
      async (file) => {
        const inspected = await inspectToolcraftImageDownload({ backgroundRgba: [0, 0, 0, 0], download: file, page });
        return { ...inspected.inspection, backgroundAlpha: await cornerAlpha(page, file) };
      },
      {
        requirementId: includeRow.id,
        video: {
          exportArtifact: session.targetAction("actions.output", (current) => download(current, /^Export MP4$/)),
          inspectArtifact: async (file) => {
            const schedule = Array.from({ length: 30 }, (_, index) => ({ durationSeconds: 1 / 30, index, timeSeconds: index / 30 }));
            const inspected = await inspectToolcraftVideoDownload({ backgroundRgba: [255, 255, 255, 255], download: file, page, schedule });
            const bounds = inspected.observations[0]?.nonBackgroundBounds;
            return { ...inspected.inspection, backgroundIncluded: Boolean(bounds && bounds.width < 0.9 && bounds.height < 0.95) };
          },
        },
      },
    );
    // Infinity: the viewport takes the runtime color and follows the Background switch.
    await setSwitch(page, t.includeBackground, true);
    await setSwitch(page, "canvas.infinity", true);
    const infinite = await observeInfinityCanvasBackground(page);
    await setSwitch(page, t.includeBackground, false);
    const backgroundExcluded = await observeInfinityCanvasBackground(page);
    await setSwitch(page, t.includeBackground, true);
    const backgroundRestored = await observeInfinityCanvasBackground(page);
    await expectToolcraftInfinityCanvasBackgroundEvidence(
      { backgroundExcluded, backgroundRestored, infinite },
      { expectedBackgroundColor: infinite.runtimeBackgroundColor ?? "#FFFFFF", requirementId: includeRow.id, target: t.includeBackground },
    );
  });
}

/**
 * Each image format shows or hides Resolution (PNG and JPG show it, SVG hides it); each raster
 * format then downloads at 2K in its own type with the mascot where it belongs.
 */
test(MASCOT_BROWSER_TESTS.exportImageSettings, async ({ page }) => {
  const session = await openMascot(page);
  await setSwitch(page, t.groundVisible, false);
  const cases = getToolcraftControlApplicabilityCases({ schema: appSchema, sectionInventory: appControlSectionInventory, target: "export.image.resolution" });
  for (const applicabilityCase of cases) {
    const label = applicabilityCase.selectorOptionLabel ?? String(applicabilityCase.selectorValue).toUpperCase();
    await expectToolcraftControlApplicabilityState(
      session,
      session.controlAction("export.image.format", (_control, current) => chooseOption(current, "export.image.format", label)),
      applicabilityCase,
      { baseRequirementId: "export.image.resolution" },
    );
    if (applicabilityCase.expectation !== "visible") continue;
    await chooseOption(page, "export.image.resolution", "2K");
    await expectToolcraftImageExportArtifact(
      session.targetAction("actions.output", (current) => download(current, new RegExp(`^Export ${label}$`))),
      {
        additionalArtifactRequirements: [
          { requirementId: "export.image.format", target: "export.image.format" },
          { requirementId: getToolcraftApplicabilityRequirementId("export.image.resolution", applicabilityCase), target: "export.image.resolution" },
        ],
        backgroundRgba: WHITE,
        expectedBounds: MASCOT_BOUNDS,
        expectedHeight: 1152,
        expectedMediaType: label === "JPG" ? "image/jpeg" : "image/png",
        expectedPixels: HEAD_PIXELS,
        expectedWidth: 2048,
        page,
        requirementId: "export.image.format",
      },
    );
  }
});

/** MP4 at the current size downloads as an MP4 of the canvas, one second of the keyframed lean. */
test(MASCOT_BROWSER_TESTS.exportVideoSettings, async ({ page }) => {
  const session = await openMascot(page);
  await prepareLeanAnimation(page);
  await chooseOption(page, "export.video.format", "MP4");
  await chooseOption(page, "export.video.resolution", "Current");
  await expectToolcraftVideoExportArtifact(
    session.targetAction("actions.output", (current) => download(current, /^Export MP4$/)),
    {
      additionalArtifactRequirements: [
        { requirementId: "export.video.format", target: "export.video.format" },
        { requirementId: "export.video.resolution", target: "export.video.resolution" },
      ],
      animated: true,
      backgroundRgba: WHITE,
      expectedDurationSeconds: 1,
      expectedHeight: 1080,
      expectedMediaType: "video/mp4",
      expectedSamples: [
        { pixels: HEAD_PIXELS.slice(0, 1), timeSeconds: 0 },
        { pixels: HEAD_PIXELS.slice(0, 1), timeSeconds: 0.5 },
        { pixels: HEAD_PIXELS.slice(0, 1), timeSeconds: 29 / 30 },
      ],
      expectedWidth: 1920,
      page,
      requirementId: "export.video.format",
      schedule: frameSchedule(1),
    },
  );
});
