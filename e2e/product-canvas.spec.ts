/** The `canvas` domain: the Infinity canvas switch, its continuity and its exports. */
import type { Page } from "@playwright/test";

import { MASCOT_BROWSER_TESTS } from "../src/app/app-acceptance-data";
import appDefaults from "../src/app/app-defaults.json" with { type: "json" };
import { buildMascotScene } from "../src/app/mascot/mascot-scene";
import { mascotTargets as t, readMascotSettings } from "../src/app/mascot/mascot-settings";
import {
  expectToolcraftInfinityCanvasImageExportEvidence,
  expectToolcraftInfinityCanvasModeEvidence,
  expectToolcraftInfinityCanvasVideoExportEvidence,
} from "./browser-infinity-canvas-evidence";
import { observeInfinityCanvas } from "./browser-infinity-canvas-observation";
import { expectToolcraftInfinityCanvasSvgExportEvidence } from "./browser-infinity-canvas-svg-evidence";
import { inspectToolcraftImageDownload } from "./image-artifact-inspection";
import {
  WHITE,
  chooseOption,
  controlByTarget,
  download,
  openMascot,
  prepareTimeline,
  pressRange,
  scrubber,
  setDuration,
  setSwitch,
} from "./product-mascot-support";
import { inspectToolcraftSvgDownload } from "./svg-artifact-inspection";
import { expect, test } from "./toolcraft-product-test";
import { inspectToolcraftVideoDownload } from "./video-artifact-inspection";

/** The scene the app opens on: the saved defaults (Save State as Default). */
const sceneRect = buildMascotScene(readMascotSettings(appDefaults.state.values)).bounds;

async function captureIdentity(page: Page) {
  return page.evaluateHandle(() => ({
    host: document.querySelector("[data-toolcraft-product-scene]"),
    output: document.querySelector("[data-toolcraft-product-output]"),
  }));
}

async function compareIdentity(page: Page, identity: Awaited<ReturnType<typeof captureIdentity>>) {
  return page.evaluate(
    (baseline) => ({
      productHostPreserved: baseline.host !== null && baseline.host === document.querySelector("[data-toolcraft-product-scene]"),
      productOutputPreserved: baseline.output !== null && baseline.output === document.querySelector("[data-toolcraft-product-output]"),
    }),
    identity,
  );
}

test(MASCOT_BROWSER_TESTS.infinityContinuity, async ({ page }) => {
  await openMascot(page);
  const before = await observeInfinityCanvas(page);
  const initialIdentity = await captureIdentity(page);
  await setSwitch(page, "canvas.infinity", true);
  const enabled = await observeInfinityCanvas(page);
  const beforeToEnabled = await compareIdentity(page, initialIdentity);
  const viewport = page.getByRole("application", { name: "Canvas viewport" });
  const box = (await viewport.boundingBox())!;
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.down("Space");
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5 + 60, box.y + box.height * 0.5 + 40, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  const afterPan = await observeInfinityCanvas(page);
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator("svg[data-toolcraft-product-output]")).toBeVisible({ timeout: 20_000 });
  const afterReload = await observeInfinityCanvas(page);
  const restoredIdentity = await captureIdentity(page);
  await setSwitch(page, "canvas.infinity", false);
  const restored = await observeInfinityCanvas(page);
  const afterReloadToRestored = await compareIdentity(page, restoredIdentity);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const undone = await observeInfinityCanvas(page);
  const restoredToUndone = await compareIdentity(page, restoredIdentity);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  const redone = await observeInfinityCanvas(page);
  const undoneToRedone = await compareIdentity(page, restoredIdentity);
  await expectToolcraftInfinityCanvasModeEvidence(
    { afterPan, afterReload, before, enabled, redone, restored, undone },
    { afterReloadToRestored, beforeToEnabled, restoredToUndone, undoneToRedone },
    {
      expectedFiniteSize: { height: 1080, width: 1920 },
      expectedSceneRect: sceneRect,
      requirementId: "canvas.infinity.continuity",
      target: "canvas.infinity",
    },
  );
});

/** Infinite stills crop to the whole mascot composition (outward-rounded scene bounds). */
function infiniteStillSize(longEdge: number) {
  const ratio = longEdge / Math.max(sceneRect.width, sceneRect.height);
  return sceneRect.width >= sceneRect.height
    ? { height: Math.round(sceneRect.height * ratio), width: longEdge }
    : { height: longEdge, width: Math.round(sceneRect.width * ratio) };
}

test(MASCOT_BROWSER_TESTS.infinityImage, async ({ page }) => {
  await openMascot(page);
  await chooseOption(page, "export.image.resolution", "2K");
  const finite = await inspectToolcraftImageDownload({ backgroundRgba: WHITE, download: await download(page, /^Export PNG$/), page });
  await setSwitch(page, "canvas.infinity", true);
  const infinite = await inspectToolcraftImageDownload({ backgroundRgba: WHITE, download: await download(page, /^Export PNG$/), page });
  await expectToolcraftInfinityCanvasImageExportEvidence(
    { finite: finite.inspection, infinite: infinite.inspection },
    {
      expectedSize: { finite: { height: 1152, width: 2048 }, infinite: infiniteStillSize(2048) },
      requirementId: "canvas.infinity.image-export",
      target: "canvas.infinity",
    },
  );
});

test(MASCOT_BROWSER_TESTS.infinitySvg, async ({ page }) => {
  await openMascot(page);
  await chooseOption(page, "export.image.format", "SVG");
  const finite = await inspectToolcraftSvgDownload({ download: await download(page, /^Export SVG$/), page });
  await setSwitch(page, "canvas.infinity", true);
  const infinite = await inspectToolcraftSvgDownload({ download: await download(page, /^Export SVG$/), page });
  await expectToolcraftInfinityCanvasSvgExportEvidence(
    { finite: finite.inspection, infinite: infinite.inspection },
    {
      expectedSize: { finite: { height: 1080, width: 1920 }, infinite: { height: sceneRect.height, width: sceneRect.width } },
      requirementId: "canvas.infinity.svg-export",
      target: "canvas.infinity",
    },
  );
});

test(MASCOT_BROWSER_TESTS.infinityVideo, async ({ page }) => {
  await openMascot(page);
  await prepareTimeline(page, true);
  await setDuration(page, 1);
  const lean = controlByTarget(page, t.bodyLean);
  await lean.getByRole("button", { name: /keyframe/i }).click();
  await page.keyboard.press("Escape");
  await scrubber(page).press("End");
  await pressRange(lean, "End");
  const schedule = Array.from({ length: 30 }, (_, index) => ({ durationSeconds: 1 / 30, index, timeSeconds: index / 30 }));
  const exportVideo = async () =>
    (await inspectToolcraftVideoDownload({ backgroundRgba: WHITE, download: await download(page, /^Export MP4$/), page, schedule })).inspection;
  const finite = await exportVideo();
  await setSwitch(page, "canvas.infinity", true);
  const infinite = await exportVideo();
  await expectToolcraftInfinityCanvasVideoExportEvidence(
    { finite, infinite },
    { expectedSize: { height: 1080, width: 1920 }, requirementId: "canvas.infinity.video-export", target: "canvas.infinity" },
  );
});
