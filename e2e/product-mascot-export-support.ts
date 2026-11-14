/** Shared fixtures and expected pixels for the export proofs (`product-actions`, `product-artifact`, `product-export`). */
import { expect, type Page } from "@playwright/test";

import { mascotTargets as t } from "../src/app/mascot/mascot-settings";
import { WHITE, controlByTarget, deselectKeyframe, prepareTimeline, pressRange, scrubber, setDuration } from "./product-mascot-support";

const HEAD = [253, 93, 68, 255] as const;

/**
 * World (0, -60) and (60, -60) sit inside the V2 head's base fill below the mouth, clear of the
 * re-lit shade and highlight; the artboard is centered on the origin.
 */
export const HEAD_PIXELS = [
  { rgba: HEAD, xRatio: 0.5, yRatio: (540 - 60) / 1080 },
  { rgba: HEAD, xRatio: (960 + 60) / 1920, yRatio: (540 - 60) / 1080 },
  { rgba: WHITE, xRatio: 0.04, yRatio: 0.06 },
] as const;

/** V2 mascot bounds on the saved defaults with the ground shadow off: x -155..154, y -281..303 in world pixels. */
export const MASCOT_BOUNDS = { height: 584 / 1080, width: 309 / 1920, x: (960 - 155) / 1920, y: (540 - 281) / 1080 };

/** The frame times of a 30 fps export of `durationSeconds`. */
export function frameSchedule(durationSeconds: number) {
  const count = Math.round(durationSeconds * 30);
  return Array.from({ length: count }, (_, index) => ({
    durationSeconds: Math.min(durationSeconds, (index + 1) / 30) - index / 30,
    index,
    timeSeconds: index / 30,
  }));
}

/** One-second Lean loop 0° → 30° so every video frame range shows motion. */
export async function prepareLeanAnimation(page: Page): Promise<void> {
  await prepareTimeline(page, true);
  await setDuration(page, 1);
  const lean = controlByTarget(page, t.bodyLean);
  await lean.getByRole("button", { name: /keyframe/i }).click();
  await deselectKeyframe(page);
  await scrubber(page).press("End");
  await pressRange(lean, "End");
  await expect(page.locator('[data-slot="timeline-keyframe"]')).toHaveCount(2);
  await scrubber(page).press("Home");
}
