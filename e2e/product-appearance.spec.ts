/** The `appearance` domain: the runtime Background color, shown on the artboard behind the mascot. */
import { appAcceptance } from "../src/app/app-acceptance-data";
import { mascotTargets as t } from "../src/app/mascot/mascot-settings";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { openMascot } from "./product-mascot-support";
import { test } from "./toolcraft-product-test";

const colorRow = appAcceptance.find((row) => row.target === t.background && row.kind === "control");
if (colorRow?.browser) {
  test(colorRow.browser.testName, async ({ page }) => {
    const session = await openMascot(page);
    await expectToolcraftProductObservableToChange(
      session,
      session.controlAction(t.background, async (locator) => {
        const input = locator.locator('input[aria-label="Background color hex"]');
        await input.fill("F4E3C1");
        await input.press("Enter");
      }),
      { requirementId: colorRow.id, selector: "[data-toolcraft-editable-canvas]" },
    );
  });
}
