/** The `view` domain: View Scale and the orientation gimbal (`view.orbit`). */
import { appAcceptance } from "../src/app/app-acceptance-data";
import { mascotTargets as t } from "../src/app/mascot/mascot-settings";
import {
  expectToolcraftOrientationAxisDrag,
  expectToolcraftOrientationAxisSnap,
  expectToolcraftOrientationCanvasMissPan,
  expectToolcraftOrientationModelDrag,
  expectToolcraftOrientationUndoReset,
} from "./browser-orientation-gizmo-evidence-helpers";
import { expectExportExcludesCanvasHandles } from "./canvas-handle-helpers";
import { inspectToolcraftImageDownload } from "./image-artifact-inspection";
import { defineMascotControlTests } from "./product-mascot-controls";
import { download, openMascot, prepareTimeline } from "./product-mascot-support";
import { expect, test } from "./toolcraft-product-test";

defineMascotControlTests("view");

/** Orientation observation for the gimbal: pose, product markup, rasterised pixels and viewport. */
async function readOrientation(root: HTMLElement) {
  const gizmo = root.querySelector('[data-testid="toolcraft-orientation-gizmo"]');
  const world = root.querySelector("[data-toolcraft-canvas-world]");
  const svg = root.querySelector("svg[data-toolcraft-product-output]");
  const markup = svg ? svg.innerHTML : "";
  let hash = 2166136261;
  for (let index = 0; index < markup.length; index += 1) {
    hash ^= markup.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let pixels = "none";
  if (svg) {
    const source = new XMLSerializer().serializeToString(svg);
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0, 96, 96);
    const data = context.getImageData(0, 0, 96, 96).data;
    let pixelHash = 2166136261;
    for (let index = 0; index < data.length; index += 4) {
      pixelHash ^= data[index]! + data[index + 3]! * 7;
      pixelHash = Math.imul(pixelHash, 16777619);
    }
    pixels = (pixelHash >>> 0).toString(16);
  }
  const pose = JSON.parse(gizmo?.getAttribute("data-toolcraft-orientation-pose") ?? "null");
  return {
    outputSignature: `${(hash >>> 0).toString(16)}:${markup.length}`,
    pixelSignature: pixels,
    pose,
    poseTarget: gizmo?.getAttribute("data-toolcraft-orientation-target") ?? "",
    presentationCacheKey: "clutch-mascot-vector-rig",
    presentationDocumentId: "figma-146:1816-clutchman-v2",
    viewportOffsetX: Number(world?.getAttribute("data-toolcraft-canvas-offset-x") ?? NaN),
    viewportOffsetY: Number(world?.getAttribute("data-toolcraft-canvas-offset-y") ?? NaN),
  };
}

const gimbalRow = appAcceptance.find((row) => row.target === t.viewOrbit && row.kind === "canvas-handle");
if (gimbalRow?.browser) {
  test(gimbalRow.browser.testName, async ({ page }) => {
    const session = await openMascot(page);
    await prepareTimeline(page, false);
    const options = { requirementId: gimbalRow.id, target: t.viewOrbit };
    const observe = session.observe(readOrientation);
    const gizmo = page.getByTestId("toolcraft-orientation-gizmo");

    // Undo/redo/reset first, from the default front view.
    const baseline = await page.locator('[data-slot="toolcraft-runtime-app"]').first().evaluate(readOrientation);
    const box = (await gizmo.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2 + 70, box.y + box.height * 0.5, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await page.locator('[data-slot="toolcraft-runtime-app"]').first().evaluate(readOrientation)).outputSignature).not.toBe(baseline.outputSignature);
    const changed = await page.locator('[data-slot="toolcraft-runtime-app"]').first().evaluate(readOrientation);
    await expectToolcraftOrientationUndoReset(
      observe,
      session.action((current) => current.getByRole("button", { name: "Undo", exact: true }).click()),
      session.action((current) => current.getByRole("button", { name: "Redo", exact: true }).click()),
      session.action((current) => current.getByTestId("toolcraft-orientation-gizmo").dblclick({ position: { x: box.width * 0.2, y: box.height * 0.5 } })),
      baseline,
      changed,
      options,
    );

    await expectToolcraftOrientationAxisDrag(observe, session, { ...options, dragDelta: { x: 60, y: 0 } });
    await expectToolcraftOrientationAxisSnap(observe, session, "+x", options);
    await expectToolcraftOrientationModelDrag(observe, session, { ...options, dragDelta: { x: -80, y: 0 } });
    await expectToolcraftOrientationCanvasMissPan(
      observe,
      session.action(async (current) => {
        const viewport = (await current.getByRole("application", { name: "Canvas viewport" }).boundingBox())!;
        await current.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await current.keyboard.down("Space");
        await current.mouse.move(viewport.x + 40, viewport.y + viewport.height * 0.3);
        await current.mouse.down();
        await current.mouse.move(viewport.x + 100, viewport.y + viewport.height * 0.3 + 30, { steps: 8 });
        await current.mouse.up();
        await current.keyboard.up("Space");
      }),
      options,
    );
    await expectExportExcludesCanvasHandles(
      page,
      () => download(page, /^Export PNG$/),
      async (file) => (await inspectToolcraftImageDownload({ backgroundRgba: [255, 255, 255, 255], download: file, page })).inspection,
      // The orientation row's export check is its own requirement, `<row>#export-clean`.
      { requirementId: `${gimbalRow.id}#export-clean`, target: t.viewOrbit },
    );
  });
}
