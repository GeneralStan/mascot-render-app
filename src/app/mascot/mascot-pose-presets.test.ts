import { describe, expect, it } from "vitest";

import type { ToolcraftPanelActionContext } from "@/toolcraft/runtime/react";

import { MASCOT_POSE_ACTIONS, MASCOT_WALK_CONTACT, onMascotPanelAction } from "./mascot-pose-presets";
import { buildMascotScene, mascotSceneInput } from "./mascot-scene";
import { mascotTargets as t, readMascotSettings } from "./mascot-settings";
import { MASCOT_V2_CASH_JUMP } from "./mascot-v2-poses";

type Timeline = ToolcraftPanelActionContext["state"]["timeline"];

function run(value: string, timeline: Partial<Timeline> = {}, values: Record<string, unknown> = {}) {
  const commands: unknown[] = [];
  const context = {
    action: { label: value, value },
    dispatch: (command: unknown) => commands.push(command),
    state: { timeline: { expanded: false, keyframeGroups: [], selectedKeyframeId: null, ...timeline }, values },
  } as unknown as ToolcraftPanelActionContext;
  onMascotPanelAction(context);
  return commands as Array<Record<string, unknown>>;
}
const applied = (value: string, values: Record<string, unknown> = {}) => run(value, {}, values)[0]!.values as Record<string, unknown>;

describe("mascot pose presets", () => {
  it("Walk turns Clutchman side-on at the contact pose, keeping his facing and leaving the camera alone", () => {
    const [apply, ...rest] = run(MASCOT_POSE_ACTIONS.walk);
    const w = MASCOT_WALK_CONTACT;
    expect(rest).toEqual([]);
    expect(apply).toMatchObject({ type: "controls.apply" });
    // Facing right, the _L limbs are the near ones: near leg and far arm forward, far leg and near arm back.
    expect(apply.values).toMatchObject({
      [t.bodyTurn]: 90,
      [t.armLeftSwing]: w.nearArm,
      [t.armRightSwing]: w.farArm,
      [t.legLeftSwing]: w.nearLeg,
      [t.legRightSwing]: w.farLeg,
      [t.hairSweep]: w.hairSweep,
      [t.armLeftElbow]: 0,
      [t.legRightKnee]: 0,
    });
    expect(w.nearLeg).toBeGreaterThan(0);
    expect(w.farArm).toBeGreaterThan(0);
    expect(w.farLeg).toBeLessThan(0);
    expect(w.nearArm).toBeLessThan(0);
    expect(apply.values).not.toHaveProperty(t.viewOrbit);
    expect(apply.values).not.toHaveProperty(t.bodyLean);
    expect(apply.values).not.toHaveProperty(t.faceEyes);
    // Facing left, the near limbs are _R.
    expect(applied(MASCOT_POSE_ACTIONS.walk, { [t.bodyTurn]: -40 })).toMatchObject({
      [t.bodyTurn]: -90,
      [t.armRightSwing]: w.nearArm,
      [t.legRightSwing]: w.nearLeg,
      [t.legLeftSwing]: w.farLeg,
    });
  });

  it("Stand resets the pose, the turn, hands, money bags and lift, and hands the face back to Auto", () => {
    const values = applied(MASCOT_POSE_ACTIONS.stand);
    expect(values).not.toHaveProperty(t.viewOrbit);
    expect(values).not.toHaveProperty(t.bodyLean);
    expect(values).not.toHaveProperty(t.bodySoftness);
    expect(values).toMatchObject({
      [t.armLeftHand]: "open",
      [t.armRightMoneyBag]: false,
      [t.armLeftLength]: 100,
      [t.bodyLift]: 0,
      [t.bodyTurn]: 0,
      [t.faceEyes]: "auto",
      [t.faceMouth]: "auto",
    });
    // Standing after a cash jump is the default mascot again.
    const afterJump = { ...applied(MASCOT_POSE_ACTIONS.cashJump), ...values, [t.bodySoftness]: 18 };
    expect(JSON.stringify(buildMascotScene(readMascotSettings(afterJump)))).toBe(JSON.stringify(buildMascotScene(readMascotSettings({}))));
  });

  it("Cash jump applies MASCOT_V2_CASH_JUMP exactly, with the excited face", () => {
    const settings = readMascotSettings(applied(MASCOT_POSE_ACTIONS.cashJump));
    const input = mascotSceneInput(settings);
    expect(input.limbs).toEqual(MASCOT_V2_CASH_JUMP.limbs);
    expect(input.body).toMatchObject(MASCOT_V2_CASH_JUMP.body);
    expect(input.face).toEqual({ eyes: "open", mouth: "excited" });
  });

  it("writes keyframes only for animated pose targets while the timeline is on", () => {
    const group = (controlId: string, id: string, timeSeconds: number) => ({
      controlId,
      keyframes: [{ controlId, controlLabel: controlId, id, timeSeconds, valueLabel: "0°" }],
      label: controlId,
    });
    const keyframeGroups = [group(t.armRightSwing, "k1", 2), group(t.bodyLean, "k2", 1), group(t.armLeftLength, "k3", 0)];
    const [, ...upserts] = run(MASCOT_POSE_ACTIONS.walk, { expanded: true, keyframeGroups, selectedKeyframeId: "k1" } as Partial<Timeline>);
    expect(upserts).toEqual([
      expect.objectContaining({ controlId: t.armRightSwing, timeSeconds: 2, type: "timeline.upsertControlKeyframe", value: MASCOT_WALK_CONTACT.farArm, valueLabel: "30°" }),
      expect.objectContaining({ controlId: t.armLeftLength, type: "timeline.upsertControlKeyframe", value: 100, valueLabel: "100%" }),
    ]);
    expect(run(MASCOT_POSE_ACTIONS.walk, { expanded: false, keyframeGroups } as Partial<Timeline>)).toHaveLength(1);
  });

  it("ignores actions it does not own", () => {
    expect(run("export-png")).toEqual([]);
  });
});
