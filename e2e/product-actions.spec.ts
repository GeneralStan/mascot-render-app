/** The `actions` domain: the sticky Export PNG, Export SVG and Export MP4 buttons. */
import { MASCOT_BROWSER_TESTS } from "../src/app/app-acceptance-data";
import { mascotTargets as t } from "../src/app/mascot/mascot-settings";
import { expectToolcraftImageExportArtifact } from "./browser-media-export-evidence";
import { HEAD_PIXELS, MASCOT_BOUNDS, frameSchedule } from "./product-mascot-export-support";
import { WHITE, chooseOption, download, openMascot, prepareTimeline, setDuration, setSwitch } from "./product-mascot-support";
import { inspectToolcraftSvgDownload } from "./svg-artifact-inspection";
import { expect, test } from "./toolcraft-product-test";
import { inspectToolcraftVideoDownload } from "./video-artifact-inspection";

test(MASCOT_BROWSER_TESTS.actionsOutput, async ({ page }) => {
  const session = await openMascot(page);
  await setSwitch(page, t.groundVisible, false);
  await chooseOption(page, "export.image.format", "PNG");
  await chooseOption(page, "export.image.resolution", "2K");
  await expectToolcraftImageExportArtifact(
    session.targetAction("actions.output", (current) => download(current, /^Export PNG$/)),
    {
      additionalArtifactRequirements: [{ requirementId: "actions.output", target: "actions.output" }],
      backgroundRgba: WHITE,
      expectedBounds: MASCOT_BOUNDS,
      expectedHeight: 1152,
      expectedMediaType: "image/png",
      expectedPixels: HEAD_PIXELS,
      expectedWidth: 2048,
      page,
      requirementId: "actions.output",
    },
  );

  // The same footer exports SVG once the format is SVG, and video from its own button.
  await chooseOption(page, "export.image.format", "SVG");
  const svg = await inspectToolcraftSvgDownload({ download: await download(page, /^Export SVG$/), page });
  expect(svg.inspection).toMatchObject({ height: 1080, mediaType: "image/svg+xml", width: 1920 });
  expect(svg.inspection.vectorElementCount).toBeGreaterThan(0);
  await prepareTimeline(page, false);
  await setDuration(page, 1);
  await chooseOption(page, "export.video.format", "MP4");
  await chooseOption(page, "export.video.resolution", "Current");
  const video = await inspectToolcraftVideoDownload({ backgroundRgba: WHITE, download: await download(page, /^Export MP4$/), page, schedule: frameSchedule(1) });
  expect(video.inspection).toMatchObject({ height: 1080, mediaType: "video/mp4", width: 1920 });
});
