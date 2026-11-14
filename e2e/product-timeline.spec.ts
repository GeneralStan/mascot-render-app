/** The `timeline` domain: keyframes and playback. */
import type { Page } from "@playwright/test";

import { MASCOT_BROWSER_TESTS } from "../src/app/app-acceptance-data";
import { mascotTargets as t } from "../src/app/mascot/mascot-settings";
import {
  expectToolcraftTimelineDuration,
  expectToolcraftTimelineKeyframes,
  expectToolcraftTimelineLoop,
  expectToolcraftTimelinePauseResume,
  expectToolcraftTimelineRenderedFrame,
  expectToolcraftTimelineScrub,
} from "./browser-timeline-evidence-helpers";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import {
  controlByTarget,
  deselectKeyframe,
  openMascot,
  prepareTimeline,
  pressRange,
  readKeyframeObservation,
  readOutputSignature,
  readSignature,
  scrubber,
  setDuration,
  setProofTarget,
} from "./product-mascot-support";
import { expect, test } from "./toolcraft-product-test";

async function scrubTo(page: Page, seconds: number): Promise<void> {
  await scrubber(page).press("Home");
  for (let step = 0; step < Math.round(seconds / 0.25); step += 1) await scrubber(page).press("ArrowRight");
  await expect(scrubber(page)).toHaveAttribute("aria-valuenow", String(seconds));
}

/**
 * Lift keyframes 0 (0s) → 240px (1s) → 0 (2s) → 240px (3s) → 0 (4s): the mascot is always moving, and both a
 * 4s and a 2s loop start and end on the same frame.
 * Lift's minimum is its 0 default, so Home/End on the slider land exactly on 0 and 240.
 * Each keyframe is placed at the loop end while the duration is 1s, 2s and then 4s, so no arrow-key scrubbing is needed.
 */
async function prepareLoopFixture(page: Page): Promise<void> {
  await prepareTimeline(page, true);
  const lift = controlByTarget(page, t.bodyLift);
  await setDuration(page, 1);
  await lift.getByRole("button", { name: /keyframe/i }).click();
  for (const [seconds, key] of [[1, "End"], [2, "Home"], [3, "End"], [4, "Home"]] as const) {
    await deselectKeyframe(page);
    if (seconds > 1) await setDuration(page, seconds);
    await scrubber(page).press("End");
    await pressRange(lift, key);
  }
  await expect(page.locator('[data-slot="timeline-keyframe"]')).toHaveCount(5);
  await deselectKeyframe(page);
  await scrubber(page).press("Home");
  // Let the workspace persist, then reload so the proofs start from a clean focus and selection state.
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("toolcraft:clutch-mascot-lab:state:v2") ?? "{}").state?.timeline?.keyframeGroups?.[0]?.keyframes?.length ?? 0))
    .toBe(5);
}

test(MASCOT_BROWSER_TESTS.timelineKeyframes, async ({ page }) => {
  const session = await openMascot(page);
  await setProofTarget(page, t.bodyLean);
  const lean = controlByTarget(page, t.bodyLean);
  // Expected end state: Lean 30° rendered, measured once without keyframes and undone.
  await pressRange(lean, "End");
  const leaned = await page.locator('[data-slot="toolcraft-runtime-app"]').first().evaluate(readKeyframeObservation);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(lean.locator('input[type="range"]')).toHaveValue("0");
  await prepareTimeline(page, true);
  await lean.getByRole("button", { name: /keyframe/i }).click();
  await expect(page.locator('[data-slot="timeline-keyframe"]')).toHaveCount(1);
  // At the loop end, editing Lean rewrites the selected keyframe, so the evaluator now returns 30°.
  await expectToolcraftTimelineKeyframes(
    session.observe(readKeyframeObservation),
    session.controlAction(t.bodyLean, async (current, currentPage) => {
      await scrubber(currentPage).press("End");
      await pressRange(current, "End");
    }),
    { ...leaned, keyframeCount: 1 },
    { requirementId: "timeline.keyframes" },
  );
  // A second keyframe at the end returns Lean to 0°, so scrubbing back to the start renders the 30° keyframe.
  await deselectKeyframe(page);
  await scrubber(page).press("End");
  await pressRange(lean, "Home");
  await expect(page.locator('[data-slot="timeline-keyframe"]')).toHaveCount(2);
  await expectToolcraftProductObservableToChange(
    session,
    session.targetAction(t.bodyLean, (current) => scrubber(current).press("Home")),
    { requirementId: "timeline.keyframes" },
  );
});

test(MASCOT_BROWSER_TESTS.timelinePlayback, async ({ page }) => {
  // Lift (in Body) and the timeline are open in the saved workspace, which is all this proof uses.
  await openMascot(page, { prepare: false });
  await prepareLoopFixture(page);
  const session = await openMascot(page, { prepare: false });
  await prepareTimeline(page, true);
  // The saved defaults turn looping off; this proof plays through the loop, so turn it on.
  const enableLoop = page.getByRole("button", { name: "Enable loop", exact: true });
  if (await enableLoop.isVisible()) await enableLoop.click();
  await expect(page.getByRole("button", { name: "Disable loop", exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="timeline-keyframe"]')).toHaveCount(5);
  const start = await readSignature(page);
  await scrubTo(page, 1);
  const peak = await readSignature(page);
  await scrubber(page).press("Home");
  expect(peak).not.toBe(start);

  const observeScrub = session.observe((root) => {
    const slider = root.querySelector('[role="slider"][aria-label="Playback position"]');
    const svg = root.querySelector("svg[data-toolcraft-product-output]");
    const text = svg ? svg.innerHTML : "";
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return { currentTimeSeconds: Number(slider?.getAttribute("aria-valuenow") ?? NaN), outputSignature: `${(hash >>> 0).toString(16)}:${text.length}` };
  });
  await expectToolcraftTimelineScrub(observeScrub, session.targetAction("timeline.playback", (current) => scrubTo(current, 1)), { currentTimeSeconds: 1, outputSignature: peak }, { requirementId: "timeline.playback" });
  await expectToolcraftTimelineRenderedFrame(session.observe(readOutputSignature), session.targetAction("timeline.playback", (current) => scrubber(current).press("Home")), start, { requirementId: "timeline.playback" });
  await expectToolcraftProductObservableToChange(session, session.targetAction("timeline.playback", (current) => scrubTo(current, 1)), { requirementId: "timeline.playback" });
  await scrubber(page).press("Home");

  const observePlayback = session.observe((root) => {
    const slider = root.querySelector('[role="slider"][aria-label="Playback position"]');
    const svg = root.querySelector("svg[data-toolcraft-product-output]");
    const text = svg ? svg.innerHTML : "";
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return {
      currentTimeSeconds: Number(slider?.getAttribute("aria-valuenow") ?? NaN),
      outputSignature: `${(hash >>> 0).toString(16)}:${text.length}`,
      playing: Boolean(root.querySelector('button[aria-label="Pause playback"]')),
    };
  });
  await scrubTo(page, 0.5);
  await page.getByRole("button", { name: "Play playback" }).click();
  await expectToolcraftTimelinePauseResume(
    observePlayback,
    session.targetAction("timeline.playback", (current) => current.getByRole("button", { name: "Pause playback" }).click()),
    session.targetAction("timeline.playback", (current) => current.getByRole("button", { name: "Play playback" }).click()),
    { requirementId: "timeline.playback" },
  );
  const pause = page.getByRole("button", { name: "Pause playback" });
  if (await pause.isVisible()) await pause.click();

  // Loop proof: sample forward playback through one wrap at 4s and again after editing the duration to 2s.
  /** Read the rendered frame once two reads 120ms apart agree, so a pending render is not sampled. */
  async function settledSignature(): Promise<string> {
    let previous = await readSignature(page);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await page.waitForTimeout(120);
      const current = await readSignature(page);
      if (current === previous) return current;
      previous = current;
    }
    return previous;
  }
  async function sampleCycle(durationSeconds: number) {
    await scrubber(page).press("Home");
    await expect(scrubber(page)).toHaveAttribute("aria-valuenow", "0");
    const seamStartSignature = await settledSignature();
    await scrubber(page).press("End");
    await expect(scrubber(page)).toHaveAttribute("aria-valuenow", String(durationSeconds));
    const seamEndSignature = await settledSignature();
    await scrubber(page).press("Home");
    await page.getByRole("button", { name: "Play playback" }).click();
    const normalizedPhases: number[] = [];
    const interval = (durationSeconds * 1000) / 10;
    // Sample forward until exactly one wrap has been seen plus two samples after it, so a slow
    // machine cannot run on into a second loop.
    let afterWrap = -1;
    for (let sample = 0; sample < 40 && afterWrap < 2; sample += 1) {
      await page.waitForTimeout(interval);
      const now = Number(await scrubber(page).getAttribute("aria-valuenow"));
      const phase = (now % durationSeconds) / durationSeconds;
      const previous = normalizedPhases.at(-1);
      if (previous !== undefined && phase < previous) afterWrap = 0;
      else if (afterWrap >= 0) afterWrap += 1;
      normalizedPhases.push(phase);
    }
    await page.getByRole("button", { name: "Pause playback" }).click();
    return { durationSeconds, normalizedPhases, seamEndSignature, seamStartSignature };
  }
  const initial = await sampleCycle(4);
  await expectToolcraftTimelineDuration(
    session.observe((root) => {
      const slider = root.querySelector('[role="slider"][aria-label="Playback position"]');
      const max = Number(slider?.getAttribute("aria-valuemax") ?? NaN);
      return { renderedCycleDurationSeconds: max, timelineDurationSeconds: max };
    }),
    session.targetAction("timeline.playback", (current) => setDuration(current, 2)),
    2,
    { requirementId: "timeline.playback" },
  );
  const resized = await sampleCycle(2);
  await page.evaluate((proof) => {
    document.body.dataset.mascotLoopProof = JSON.stringify(proof);
  }, { initial, resized });
  await expectToolcraftTimelineLoop(
    session.observe((root) => JSON.parse(root.ownerDocument.body.dataset.mascotLoopProof ?? "null")),
    { requirementId: "timeline.playback" },
  );
});
