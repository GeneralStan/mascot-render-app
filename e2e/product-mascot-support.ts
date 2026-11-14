import { expect, type Download, type Locator, type Page } from "@playwright/test";

import { createToolcraftBrowserProofSession, type ToolcraftBrowserProofSession } from "./browser-proof-session";
import { getToolcraftProductObservableSnapshot } from "./product-observable-helpers";

export const WHITE = [255, 255, 255, 255] as const;

export type MascotKeyframeObservation = {
  evaluatedValue: unknown;
  keyframeCount: number;
  outputSignature: string;
};

/** FNV-1a over the product SVG markup: a deterministic signature of the rendered mascot. */
export function readOutputSignature(root: HTMLElement): string {
  const svg = root.querySelector("svg[data-toolcraft-product-output]");
  if (!svg) return "";
  const text = svg.innerHTML;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${(hash >>> 0).toString(16)}:${text.length}`;
}

/**
 * Keyframe observation for the control named by `body[data-mascot-proof-target]`.
 * Readers run inside the page without closures, so the target travels through the DOM.
 */
export function readKeyframeObservation(root: HTMLElement): MascotKeyframeObservation {
  const svg = root.querySelector("svg[data-toolcraft-product-output]");
  const text = svg ? svg.innerHTML : "";
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const target = root.ownerDocument.body.dataset.mascotProofTarget ?? "";
  const control = root.querySelector(`[data-toolcraft-control-target="${target}"]`);
  const range = control?.querySelector<HTMLInputElement>('input[type="range"]');
  const hex = control?.querySelector<HTMLInputElement>('input[aria-label="Color hex"]');
  return {
    evaluatedValue: range ? Number(range.value) : hex ? hex.value.toUpperCase() : null,
    keyframeCount: root.querySelectorAll('[data-slot="timeline-keyframe"]').length,
    outputSignature: svg ? `${(hash >>> 0).toString(16)}:${text.length}` : "",
  };
}

export async function setProofTarget(page: Page, target: string): Promise<void> {
  await page.evaluate((value) => {
    document.body.dataset.mascotProofTarget = value;
  }, target);
}

/**
 * Opens the app on its saved defaults, then sets up the workspace the specs describe through the
 * real controls: every collapsed controls section expanded (the saved defaults collapse several),
 * the finite artboard (the saved defaults open on the Infinity canvas), and the view at 100% and
 * centred (the saved view is zoomed to 126% and panned, which pushes the feet below a 720 px window).
 */
export async function openMascot(
  page: Page,
  options: Readonly<{ prepare?: boolean }> = {},
): Promise<ToolcraftBrowserProofSession> {
  await page.goto("/");
  await expect(page.locator("svg[data-toolcraft-product-output]")).toBeVisible({ timeout: 20_000 });
  const session = await createToolcraftBrowserProofSession(page);
  // A fixture step that only builds state through always-open controls can keep the saved workspace.
  if (options.prepare === false) return session;
  const expand = page.getByRole("button", { name: /^Expand .+ section$/ });
  while ((await expand.count()) > 0) await expand.first().click();
  await setSwitch(page, "canvas.infinity", false);
  // The zoom readout sits between Zoom out and Zoom in; double-clicking it resets to 100%.
  const readout = page.getByRole("button", { name: "Zoom out", exact: true }).locator("xpath=following-sibling::span[1]");
  await readout.dblclick();
  await expect(readout).toHaveText("100%");
  await page.getByRole("button", { name: "Center canvas", exact: true }).click();
  return session;
}

export function controlByTarget(page: Page, target: string): Locator {
  return page.locator(`[data-toolcraft-control-target="${target}"]`).first();
}

export async function readSignature(page: Page): Promise<string> {
  return page.locator('[data-slot="toolcraft-runtime-app"]').first().evaluate(readOutputSignature);
}

export async function clickSegment(page: Page, target: string, label: string): Promise<void> {
  await controlByTarget(page, target).getByRole("button", { name: label, exact: true }).click();
}

export async function setSwitch(page: Page, target: string, on: boolean): Promise<void> {
  const toggle = controlByTarget(page, target).getByRole("switch");
  if ((await toggle.getAttribute("aria-checked")) !== String(on)) await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", String(on));
}

export async function chooseOption(page: Page, target: string, label: string): Promise<void> {
  await controlByTarget(page, target).getByRole("combobox").click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

export async function setHex(control: Locator, hex: string): Promise<void> {
  const input = control.locator('input[aria-label="Color hex"]');
  await input.fill(hex);
  await input.press("Enter");
}

export async function setOpacity(control: Locator, opacity: number): Promise<void> {
  const input = control.locator('input[aria-label="Color opacity"]');
  await input.fill(String(opacity));
  await input.press("Enter");
}

/** Moves a slider to whichever end it isn't already at, so the press always changes the value. */
export async function pressRangeAway(control: Locator): Promise<void> {
  const input = control.locator('input[type="range"]');
  const [value, max] = await Promise.all([input.inputValue(), input.getAttribute("max")]);
  await pressRange(control, Number(value) === Number(max) ? "Home" : "End");
}

export async function pressRange(control: Locator, key: "End" | "Home"): Promise<void> {
  const input = control.locator('input[type="range"]');
  await input.focus();
  await input.press(key);
}

export async function undo(page: Page): Promise<void> {
  const before = await readSignature(page);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => readSignature(page)).not.toBe(before);
}

export function scrubber(page: Page): Locator {
  return page.getByRole("slider", { name: "Playback position" });
}

/** Shows the timeline, pauses it at 0s and optionally expands the keyframe rows. */
export async function prepareTimeline(page: Page, expand: boolean): Promise<void> {
  if (!(await scrubber(page).isVisible())) {
    await setSwitch(page, "panels.timeline.extended", true);
    await expect(scrubber(page)).toBeVisible();
  }
  const pause = page.getByRole("button", { name: "Pause playback" });
  if (await pause.isVisible()) await pause.click();
  await scrubber(page).press("Home");
  await expect(scrubber(page)).toHaveAttribute("aria-valuenow", "0");
  const expandButton = page.getByRole("button", { name: "Expand timeline panel" });
  if (expand && (await expandButton.isVisible())) await expandButton.click();
}

/** Clear keyframe selection with a pointer press on empty canvas, outside the timeline. */
export async function deselectKeyframe(page: Page): Promise<void> {
  const box = (await page.getByRole("application", { name: "Canvas viewport" }).boundingBox())!;
  await page.mouse.click(box.x + 24, box.y + box.height * 0.6);
}

/** Waits until two product raster snapshots in a row agree, so a proof starts from settled output. */
export async function waitForStableOutput(page: Page): Promise<void> {
  let previous = await getToolcraftProductObservableSnapshot(page);
  await expect
    .poll(async () => {
      const current = await getToolcraftProductObservableSnapshot(page);
      const settled = current === previous;
      previous = current;
      return settled;
    }, { intervals: [100, 150, 250] })
    .toBe(true);
}

/** Clicks an export button and returns its download. */
export async function download(page: Page, label: RegExp): Promise<Download> {
  const [file] = await Promise.all([
    page.waitForEvent("download", { timeout: 90_000 }),
    page.getByRole("button", { name: label }).click(),
  ]);
  return file;
}

/** Types a timeline duration in seconds. */
export async function setDuration(page: Page, seconds: number): Promise<void> {
  await page.getByRole("button", { name: "Edit timeline duration" }).click();
  const editor = page.getByRole("textbox", { name: "timeline duration" });
  await editor.fill(`${seconds}s`);
  await editor.press("Enter");
  await expect(scrubber(page)).toHaveAttribute("aria-valuemax", String(seconds));
}
