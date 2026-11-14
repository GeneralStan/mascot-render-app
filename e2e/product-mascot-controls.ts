/**
 * The generic browser proof for one mascot control row, shared by the per-domain spec files
 * (`e2e/product-<domain>.spec.ts`; the delivery catalog wants one acceptance domain per file).
 * Each file calls `defineMascotControlTests(domain)` for its own rows.
 */
import type { Locator, Page } from "@playwright/test";

import {
  getToolcraftApplicabilityRequirementId,
  getToolcraftControlApplicabilityCases,
  type ToolcraftControlApplicabilityCase,
} from "../src/app/app-acceptance";
import { appAcceptance, appControlSectionInventory, mascotBrowserFile } from "../src/app/app-acceptance-data";
import { appSchema } from "../src/app/app-schema";
import { mascotControlSections } from "../src/app/mascot/mascot-controls";
import { MASCOT_PIVOT_MARKER } from "../src/app/mascot/mascot-pivot-marker";
import { mascotTargets as t } from "../src/app/mascot/mascot-settings";
import { expectToolcraftControlApplicabilityState } from "./browser-control-applicability-evidence";
import { expectToolcraftCompoundControlPartOutcome } from "./browser-state-evidence-helpers";
import { expectToolcraftTimelineKeyframes } from "./browser-timeline-evidence-helpers";
import { expectToolcraftVectorScreenMotion } from "./browser-vector-screen-motion";
import { expectToolcraftSegmentedControlCellsPreservePadding } from "./performance-control-layout-helpers";
import { expectToolcraftProductObservableToChange, getToolcraftProductObservableSnapshot } from "./product-observable-helpers";
import {
  clickSegment,
  chooseOption,
  controlByTarget,
  openMascot,
  prepareTimeline,
  pressRange,
  pressRangeAway,
  readKeyframeObservation,
  readOutputSignature,
  scrubber,
  setHex,
  setOpacity,
  setProofTarget,
  setSwitch,
  undo,
  waitForStableOutput,
} from "./product-mascot-support";
import { expect, test } from "./toolcraft-product-test";

/** The runtime background pair has its own proofs (`product-appearance`, `product-export`). */
const RUNTIME_BACKGROUND = new Set<string>([t.background, t.includeBackground]);

type SchemaControl = (typeof mascotControlSections)[number]["controls"][string];

const controlsByTarget = new Map<string, SchemaControl>(
  mascotControlSections.flatMap((section) =>
    Object.values(section.controls).map((control) => [control.target, control] as const),
  ),
);

function optionsOf(control: SchemaControl): { label: string; value: string }[] {
  return (control.options ?? []).map((option) =>
    typeof option === "string" ? { label: option, value: option } : { label: String(option.label ?? option.value), value: String(option.value) },
  );
}

/** Set up what a control needs to show its effect, through the real controls. */
async function prepareBranch(page: Page, target: string): Promise<void> {
  if (target === t.hairWavePhase) await pressRange(controlByTarget(page, t.hairWave), "End");
  if (target === t.armLeftTwist) await pressRange(controlByTarget(page, t.armLeftElbow), "End");
  if (target === t.armRightTwist) await pressRange(controlByTarget(page, t.armRightElbow), "End");
  // The light's turn is clearest in the cast shadow.
  if (target === t.lightAngle) await setSwitch(page, t.castVisible, true);
}

type ControlAction = (control: Locator, page: Page) => Promise<void>;

function changeAction(control: SchemaControl): ControlAction {
  switch (control.type) {
    case "slider":
      // The wave phase is periodic (360° looks like 0°), so set a quarter turn instead.
      if (control.target === t.hairWavePhase) {
        return async (locator) => {
          // Type the value so it is one absolute edit (one Undo step).
          await locator.getByRole("button", { name: /^Edit .* value$/ }).click();
          const field = locator.getByRole("textbox");
          await field.fill("90");
          await field.press("Enter");
        };
      }
      // The saved defaults may sit at either end (Joint softness is saved at its maximum).
      return (locator) => pressRangeAway(locator);
    case "segmented": {
      const next = optionsOf(control).find((option) => option.value !== control.defaultValue)!;
      return (locator) => locator.getByRole("button", { name: next.label, exact: true }).click();
    }
    case "select": {
      const next = optionsOf(control).find((option) => option.value !== control.defaultValue)!;
      return (_locator, page) => chooseOption(page, control.target, next.label);
    }
    case "switch":
      return (locator) => locator.getByRole("switch").click();
    case "color":
    case "colorOpacity":
      return (locator) => setHex(locator, "1D5C8A");
    case "actions":
      return (locator) => locator.getByRole("button", { name: "Walk", exact: true }).click();
    case "vector":
      // A press on the pad sets the point under the pointer: three quarters right, a quarter down.
      return async (locator, page) => {
        const pad = locator.locator("button[data-vector-pad-variant]");
        await pad.scrollIntoViewIfNeeded();
        const box = await pad.boundingBox();
        if (!box) throw new Error(`${control.target} has no visible pad.`);
        await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.25);
      };
    default:
      throw new Error(`No browser change for ${control.type}`);
  }
}

/** Cycle every remaining option and require each to render differently from the default. */
async function coverRemainingOptions(page: Page, control: SchemaControl): Promise<void> {
  const options = optionsOf(control).filter((option) => option.value !== control.defaultValue).slice(1);
  for (const option of options) {
    const before = await getToolcraftProductObservableSnapshot(page);
    if (control.type === "segmented") await clickSegment(page, control.target, option.label);
    else await chooseOption(page, control.target, option.label);
    await expect.poll(() => getToolcraftProductObservableSnapshot(page)).not.toBe(before);
  }
}

type Session = Awaited<ReturnType<typeof openMascot>>;

/** Run `act`, capture the exact resulting observation, then undo back to the prior state. */
async function measureThenUndo<T>(page: Page, target: string, act: ControlAction, read: (root: HTMLElement) => T): Promise<T> {
  await act(controlByTarget(page, target), page);
  const value = await page.locator('[data-slot="toolcraft-runtime-app"]').first().evaluate(read);
  await undo(page);
  return value;
}

/** A compound part's requirement is `<row>#<part>`, qualified by the applicability case when the row has one. */
async function provePart(
  page: Page,
  session: Session,
  row: Readonly<{ id: string }>,
  visibleCase: ToolcraftControlApplicabilityCase | undefined,
  target: string,
  part: string,
  act: ControlAction,
): Promise<void> {
  const expected = await measureThenUndo(page, target, act, readOutputSignature);
  const qualifiedPart = visibleCase
    ? getToolcraftApplicabilityRequirementId(`${row.id}#${part}`, visibleCase).slice(row.id.length + 1)
    : part;
  await expectToolcraftCompoundControlPartOutcome(
    session.observe(readOutputSignature),
    session.controlAction(target, act),
    expected,
    { part: qualifiedPart, requirementId: row.id },
  );
  await undo(page);
}

async function proveKeyframes(
  page: Page,
  session: Session,
  id: string,
  control: SchemaControl,
  act: ControlAction,
  expected: Awaited<ReturnType<typeof readKeyframeObservation>>,
): Promise<void> {
  await prepareTimeline(page, true);
  const diamond = (locator: Locator) => locator.getByRole("button", { name: /keyframe/i });
  if (control.type === "color") {
    // The diamond records the current color as a keyframe the renderer then evaluates.
    await expectToolcraftTimelineKeyframes(
      session.observe(readKeyframeObservation),
      session.controlAction(control.target, async (current, currentPage) => {
        await act(current, currentPage);
        await diamond(current).click();
      }),
      { ...expected, keyframeCount: 1 },
      { requirementId: id },
    );
    return;
  }
  await diamond(controlByTarget(page, control.target)).click();
  await expect(page.locator('[data-slot="timeline-keyframe"]')).toHaveCount(1);
  // Editing at the end updates the selected keyframe, so its value now drives the evaluated output.
  // A typed value or a press on a pad starts with a click, which clears the selection, so it adds a keyframe at the end instead.
  const typedEdit = control.target === t.hairWavePhase || control.type === "vector";
  await expectToolcraftTimelineKeyframes(
    session.observe(readKeyframeObservation),
    session.controlAction(control.target, async (current, currentPage) => {
      await scrubber(currentPage).press("End");
      await act(current, currentPage);
    }),
    { ...expected, keyframeCount: typedEdit ? 2 : 1 },
    { requirementId: id },
  );
}

/**
 * A control shown only while a switch is on (Shading Size, the shadows' settings) proves it is
 * hidden with the switch off and shown with it on; its other evidence then carries the visible
 * case's qualified requirement id.
 */
async function proveApplicability(page: Page, session: Session, row: Readonly<{ id: string }>, target: string) {
  const cases = getToolcraftControlApplicabilityCases({ schema: appSchema, sectionInventory: appControlSectionInventory, target });
  const ordered = [...cases.filter((item) => item.expectation === "hidden"), ...cases.filter((item) => item.expectation === "visible")];
  for (const applicabilityCase of ordered) {
    if (applicabilityCase.selectorControlType !== "switch" || typeof applicabilityCase.selectorValue !== "boolean") {
      throw new Error(`${target}: no browser selector for a ${applicabilityCase.selectorControlType} branch.`);
    }
    const on = applicabilityCase.selectorValue;
    await expectToolcraftControlApplicabilityState(
      session,
      session.controlAction(applicabilityCase.selectorTarget, (_control, current) => setSwitch(current, applicabilityCase.selectorTarget, on)),
      applicabilityCase,
      { baseRequirementId: row.id },
    );
  }
  return cases.find((item) => item.expectation === "visible");
}

/** Registers the generic proof for every control row in `e2e/product-<domain>.spec.ts`. */
export function defineMascotControlTests(domain: string): void {
  const file = mascotBrowserFile(domain);
  for (const row of appAcceptance) {
    if (!row.browser || row.browser.file !== file) continue;
    const target = row.target ?? row.id;
    const control = controlsByTarget.get(target);
    if (!control || RUNTIME_BACKGROUND.has(target) || control.type === "orientationGizmo") continue;

    test(row.browser.testName, async ({ page }) => {
      const act = changeAction(control);
      const session = await openMascot(page);
      await prepareBranch(page, target);
      const visibleCase = await proveApplicability(page, session, row, target);
      const requirementId = visibleCase ? getToolcraftApplicabilityRequirementId(row.id, visibleCase) : row.id;
      // Switching a shadow on renders over a few frames; start from settled output.
      await waitForStableOutput(page);
      // A pad's drag proof below records the product change itself, after live and released output.
      if (control.type === "vector") await act(controlByTarget(page, target), page);
      else await expectToolcraftProductObservableToChange(session, session.controlAction(target, act), { requirementId });
      await setProofTarget(page, target);
      const changed = await page.locator('[data-slot="toolcraft-runtime-app"]').first().evaluate(readKeyframeObservation);
      await undo(page);

      if (control.type === "segmented") {
        const label = typeof control.label === "string" ? control.label : target;
        await expectToolcraftSegmentedControlCellsPreservePadding(page, label, { requirementId: row.id, target });
      }
      if (row.optionCoverage) {
        await coverRemainingOptions(page, control);
        const first = optionsOf(control).find((option) => option.value === control.defaultValue)!;
        if (control.type === "segmented") await clickSegment(page, target, first.label);
        else await chooseOption(page, target, first.label);
      }
      if (control.type === "actions") {
        await act(controlByTarget(page, target), page);
        const walked = await getToolcraftProductObservableSnapshot(page);
        await controlByTarget(page, target).getByRole("button", { name: "Stand", exact: true }).click();
        await expect.poll(() => getToolcraftProductObservableSnapshot(page)).not.toBe(walked);
      }
      if (control.type === "vector") {
        // The proof needs the whole preview on screen: zoom the canvas out first. The keyframe
        // proof below reads the SVG markup, which the canvas zoom leaves alone.
        const output = page.locator("svg[data-toolcraft-product-output]");
        const fits = async () => {
          const box = await output.boundingBox();
          const view = page.viewportSize();
          return Boolean(box && view && box.x >= 0 && box.y >= 0 && box.x + box.width <= view.width && box.y + box.height <= view.height);
        };
        for (let step = 0; step < 6 && !(await fits()); step += 1) {
          await page.getByRole("button", { name: "Zoom out" }).click();
          await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        }
        await expect.poll(fits).toBe(true);
        // Body Pivot: with Lean and Squash at 0 only the preview's pivot marker moves; track its blue centre.
        const hex = MASCOT_PIVOT_MARKER.dot.color;
        const rgb = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
        await expectToolcraftVectorScreenMotion({
          markers: [{ rgb, selector: "svg[data-toolcraft-product-output]" }],
          proofSession: session,
          requirementId,
          target,
        });
        // Double-click resets the pad to the default pivot before the keyframe proof.
        await controlByTarget(page, target).locator("button[data-vector-pad-variant]").dblclick();
      }
      if (control.type === "colorOpacity") {
        await provePart(page, session, row, visibleCase, target, "colorOpacity.hex", (locator) => setHex(locator, "1D5C8A"));
        await provePart(page, session, row, visibleCase, target, "colorOpacity.opacity", (locator) => setOpacity(locator, 60));
      }
      if (row.timelineCoverage === "keyframes") await proveKeyframes(page, session, requirementId, control, act, changed);
    });
  }
}
