/** The `artifact` domain: the downloaded PNG/JPG, SVG and video files. */
import { MASCOT_BROWSER_TESTS } from "../src/app/app-acceptance-data";
import { mascotTargets as t } from "../src/app/mascot/mascot-settings";
import {
  expectToolcraftImageExportArtifact,
  expectToolcraftVideoExportArtifact,
} from "./browser-media-export-evidence";
import { expectToolcraftSvgExportArtifact } from "./browser-svg-export-evidence";
import { inspectToolcraftImageDownload } from "./image-artifact-inspection";
import { frameSchedule, HEAD_PIXELS, MASCOT_BOUNDS, prepareLeanAnimation } from "./product-mascot-export-support";
import { WHITE, chooseOption, controlByTarget, download, openMascot, setSwitch } from "./product-mascot-support";
import { expect, test } from "./toolcraft-product-test";
import { inspectToolcraftVideoDownload } from "./video-artifact-inspection";

test(MASCOT_BROWSER_TESTS.imageExport, async ({ page }) => {
  const session = await openMascot(page);
  await setSwitch(page, t.groundVisible, false);
  await chooseOption(page, "export.image.format", "PNG");
  await chooseOption(page, "export.image.resolution", "2K");
  await expectToolcraftImageExportArtifact(
    session.targetAction("actions.output", (current) => download(current, /^Export PNG$/)),
    {
      backgroundRgba: WHITE,
      expectedBounds: MASCOT_BOUNDS,
      expectedHeight: 1152,
      expectedMediaType: "image/png",
      expectedPixels: HEAD_PIXELS,
      expectedWidth: 2048,
      page,
      requirementId: "artifact.image-export",
    },
  );

  // Every other raster format and resolution decodes to its own type and exact size.
  for (const [format, button, mediaType] of [["JPG", /^Export JPG$/, "image/jpeg"]] as const) {
    await chooseOption(page, "export.image.format", format);
    for (const [resolution, width, height] of [["4K", 4096, 2304], ["8K", 8192, 4608]] as const) {
      await chooseOption(page, "export.image.resolution", resolution);
      const inspected = await inspectToolcraftImageDownload({ backgroundRgba: WHITE, download: await download(page, button), page });
      expect(inspected.inspection).toMatchObject({ height, mediaType, width });
    }
  }
  await chooseOption(page, "export.image.format", "SVG");
  await expect(controlByTarget(page, "export.image.resolution")).toHaveCount(0);
  await chooseOption(page, "export.image.format", "PNG");
  await expect(controlByTarget(page, "export.image.resolution").getByRole("combobox")).toContainText("8K");
});

test(MASCOT_BROWSER_TESTS.svgExport, async ({ page }) => {
  const session = await openMascot(page);
  await chooseOption(page, "export.image.format", "SVG");
  await expect(page.getByRole("button", { name: /^Export SVG$/ })).toBeVisible();
  await expectToolcraftSvgExportArtifact(
    session.targetAction("actions.output", (current) => download(current, /^Export SVG$/)),
    {
      expectedBackgroundColor: "#FFFFFF",
      expectedElements: [
        { attributes: { fill: "#FD5D44" }, selector: 'path[fill="#FD5D44"]' },
        // V2 outlines are #972F20 strokes under the base.
        { attributes: { stroke: "#972F20" }, selector: 'path[stroke="#972F20"]' },
      ],
      expectedHeight: 1080,
      expectedWidth: 1920,
      page,
      requirementId: "artifact.svg-export",
    },
  );
});

test(MASCOT_BROWSER_TESTS.videoExport, async ({ page }) => {
  const session = await openMascot(page);
  await prepareLeanAnimation(page);
  await chooseOption(page, "export.video.format", "MP4");
  await chooseOption(page, "export.video.resolution", "Current");
  const schedule = frameSchedule(1);
  await expectToolcraftVideoExportArtifact(
    session.targetAction("actions.output", (current) => download(current, /^Export MP4$/)),
    {
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
      requirementId: "artifact.video-export",
      schedule,
    },
  );

  await chooseOption(page, "export.video.format", "WebM");
  await chooseOption(page, "export.video.resolution", "4K");
  const webm = await inspectToolcraftVideoDownload({
    backgroundRgba: WHITE,
    download: await download(page, /^Export WebM$/),
    page,
    schedule,
  });
  expect(webm.inspection).toMatchObject({ height: 2160, mediaType: "video/webm", width: 3840 });
});
