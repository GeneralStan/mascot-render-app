import { describe, expect, it } from "vitest";

import type { ToolcraftPanelActionContext } from "@/toolcraft/runtime/react";

import { appAcceptance, appProductReadiness } from "../app-acceptance";
import { appSchema } from "../app-schema";
import { mascotControlSections } from "./mascot-controls";
import { MASCOT_POSE_ACTIONS, onMascotPanelAction } from "./mascot-pose-presets";
import { buildMascotScene } from "./mascot-scene";
import { mascotTargets as t, readMascotSettings } from "./mascot-settings";

type Values = Record<string, unknown>;

const ARTBOARD = { height: 1080, width: 1920 };
const RUNTIME_BACKGROUND_TARGETS = new Set<string>([t.background, t.includeBackground]);

const controlsByTarget = new Map(
  mascotControlSections.flatMap((section) =>
    Object.values(section.controls).map((control) => [control.target, control] as const),
  ),
);

/** Values that switch on the branch a conditional control belongs to. */
const BRANCH_VALUES: Readonly<Record<string, Values>> = {
  [t.castColor]: { [t.castVisible]: true },
  [t.castLength]: { [t.castVisible]: true },
  [t.castBlur]: { [t.castVisible]: true },
  [t.lightAngle]: { [t.castVisible]: true },
  [t.dropColor]: { [t.dropVisible]: true },
  // Phase moves the ripple, so it needs some wave; twist sets the elbow's bend plane, so it needs a bend.
  [t.hairWavePhase]: { [t.hairWave]: 12 },
  [t.armLeftTwist]: { [t.armLeftElbow]: 60 },
  [t.armRightTwist]: { [t.armRightElbow]: 60 },
  [t.dropOffsetX]: { [t.dropVisible]: true },
  [t.dropOffsetY]: { [t.dropVisible]: true },
  [t.dropBlur]: { [t.dropVisible]: true },
};

function sceneSignature(values: Values): string {
  return JSON.stringify(buildMascotScene(readMascotSettings(values)));
}

function alternateValues(control: (typeof controlsByTarget extends Map<string, infer C> ? C : never)): unknown[] {
  switch (control.type) {
    case "slider": {
      // The wave phase is periodic: 360° looks the same as 0°.
      if (control.target === t.hairWavePhase) return [90];
      const value = control.defaultValue as number;
      return [value === control.max ? control.min : control.max];
    }
    case "select":
    case "segmented":
      return (control.options ?? [])
        .map((option) => (typeof option === "string" ? option : option.value))
        .filter((value) => value !== control.defaultValue);
    case "switch":
      return [!control.defaultValue];
    case "color":
      return ["#1D5C8A"];
    case "colorOpacity":
      return [{ hex: "#1D5C8A", opacity: 100 }];
    case "vector":
      return [{ x: -0.6, y: 0.45 }];
    case "orientationGizmo":
      return [
        { position: [5, 0, 0], up: [0, 1, 0] },
        { position: [0, 0, -5], up: [0, 1, 0] },
        { position: [0, 3, 4], up: [0, 1, 0] },
      ];
    default:
      return [];
  }
}

function runPreset(value: string): Values {
  const values: Values = {};
  const context = {
    action: { label: value, value },
    dispatch: (command: { type: string; values?: Values }) => {
      if (command.type === "controls.apply") Object.assign(values, command.values);
    },
    state: { timeline: { expanded: false, keyframeGroups: [], selectedKeyframeId: null }, values: {} },
  } as unknown as ToolcraftPanelActionContext;
  onMascotPanelAction(context);
  return values;
}

function exportIntent() {
  if (appProductReadiness.mode !== "product") throw new Error("Clutch Mascot Lab must be in product mode.");
  return appProductReadiness.exportIntent;
}

function footerActions(): string[] {
  const footer = appSchema.panels.controls?.sections
    .flatMap((section) => Object.values(section.controls))
    .find((control) => control.target === "actions.output");
  return (footer?.actions ?? []).map((action) => (typeof action === "string" ? action : action.value));
}

function verifyControlRow(target: string): void {
  const control = controlsByTarget.get(target);
  expect(control, `schema control for ${target}`).toBeDefined();
  if (!control) return;
  if (RUNTIME_BACKGROUND_TARGETS.has(target)) {
    // Runtime owns the Background fill; the mascot foreground must not depend on it.
    expect(sceneSignature({ [target]: target === t.background ? "#1D5C8A" : false })).toBe(sceneSignature({}));
    return;
  }
  if (target === t.posePreset) {
    const stand = sceneSignature(runPreset(MASCOT_POSE_ACTIONS.stand));
    const walkValues = runPreset(MASCOT_POSE_ACTIONS.walk);
    expect(walkValues[t.bodyTurn]).toBe(90);
    expect(walkValues).not.toHaveProperty(t.viewOrbit);
    expect(sceneSignature(walkValues)).not.toBe(stand);
    const jumpValues = runPreset(MASCOT_POSE_ACTIONS.cashJump);
    expect(jumpValues).toMatchObject({ [t.armLeftMoneyBag]: true, [t.armRightHand]: "fist" });
    expect(sceneSignature(jumpValues)).not.toBe(stand);
    expect(stand).toBe(sceneSignature({}));
    return;
  }
  const base = BRANCH_VALUES[target] ?? {};
  const baseline = sceneSignature(base);
  const alternates = alternateValues(control);
  expect(alternates.length, `alternate values for ${target}`).toBeGreaterThan(0);
  for (const value of alternates) {
    expect(sceneSignature({ ...base, [target]: value }), `${target} = ${JSON.stringify(value)}`).not.toBe(baseline);
  }
}

const RUNTIME_ROW_CHECKS: Readonly<Record<string, () => void>> = {
  "actions.output": () => expect(footerActions()).toEqual(["export.png", "export.svg", "export.video"]),
  "export.image.format": () => expect(exportIntent().svg?.mode).toBe("user-requested"),
  "export.image.resolution": () => expect(footerActions()).toContain("export.png"),
  "export.video.format": () => expect(exportIntent().video?.mode).toBe("user-requested"),
  "export.video.resolution": () => expect(footerActions()).toContain("export.video"),
  "artifact.image-export": () => expect(buildMascotScene(readMascotSettings({})).layers.length).toBeGreaterThan(0),
  "artifact.svg-export": () =>
    expect(buildMascotScene(readMascotSettings({})).layers.flatMap((layer) => layer.shapes).every((shape) => shape.d.startsWith("M"))).toBe(true),
  "artifact.video-export": () => expect(sceneSignature({ [t.bodyLean]: 20 })).not.toBe(sceneSignature({})),
  "canvas.infinity.continuity": () => {
    // The scene is built from mascot values only, so Infinity cannot move or rebuild it.
    expect(sceneSignature({ "canvas.infinity": true })).toBe(sceneSignature({}));
  },
  "canvas.infinity.image-export": () => expect(buildMascotScene(readMascotSettings({})).bounds.width).toBeGreaterThan(0),
  "canvas.infinity.svg-export": () => expect(buildMascotScene(readMascotSettings({})).bounds.height).toBeGreaterThan(0),
  "canvas.infinity.video-export": () => expect(sceneSignature({ [t.bodyLean]: 20 })).not.toBe(sceneSignature({})),
  "mascot.infinity-overflow": () => {
    const bounds = buildMascotScene(readMascotSettings({ [t.viewScale]: 3 })).bounds;
    expect(bounds.y, "the scaled mascot rises above the finite artboard").toBeLessThan(-ARTBOARD.height / 2);
  },
  "timeline.keyframes": () => expect(sceneSignature({ [t.bodyLean]: 20 })).not.toBe(sceneSignature({ [t.bodyLean]: 0 })),
  "timeline.playback": () => expect(sceneSignature({ [t.bodyLean]: 10 })).not.toBe(sceneSignature({ [t.bodyLean]: 0 })),
  "persistence.reload": () =>
    expect(appSchema.persistence).toMatchObject({ include: ["canvas", "panels", "timeline", "values"], storage: "localStorage" }),
};

describe("mascot acceptance rows", () => {
  for (const row of appAcceptance) {
    it(row.automatedTestName, () => {
      const runtimeCheck = RUNTIME_ROW_CHECKS[row.id];
      if (runtimeCheck) {
        runtimeCheck();
        return;
      }
      expect(["canvas-handle", "control"]).toContain(row.kind);
      verifyControlRow(row.target ?? row.id);
    });
  }
});
