/** The `mascot` domain: the mascot scene overflowing the finite artboard in Infinity. */
import { MASCOT_BROWSER_TESTS } from "../src/app/app-acceptance-data";
import { mascotTargets as t } from "../src/app/mascot/mascot-settings";
import { expectToolcraftInfinityOverflowEvidence } from "./browser-infinity-overflow-evidence";
import { controlByTarget, openMascot, pressRange } from "./product-mascot-support";
import { expect, test } from "./toolcraft-product-test";

test(MASCOT_BROWSER_TESTS.infinityOverflow, async ({ page }) => {
  await openMascot(page);
  await expectToolcraftInfinityOverflowEvidence(page, {
    prepare: async () => {
      // Zoom out from 100% to 50% so the space above the artboard is inside the viewport.
      for (let step = 0; step < 5; step += 1) await page.getByRole("button", { name: "Zoom out" }).click();
      await pressRange(controlByTarget(page, t.viewScale), "End");
      await expect(controlByTarget(page, t.viewScale).locator('input[type="range"]')).toHaveValue("3");
    },
    probes: [{ along: 0.55, colors: [[253, 93, 68, 255], [201, 70, 49, 255]], edge: "top", offset: 12 }],
    requirementId: "mascot.infinity-overflow",
  });
});
