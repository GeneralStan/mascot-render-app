import { describe, expect, it } from "vitest";

import { buildMascotScene } from "./mascot-scene";
import { mascotTargets as t, readMascotSettings } from "./mascot-settings";
import { mascotV2FaceNames, mascotV2Faces } from "./mascot-v2-faces";
import { MASCOT_V2_CASH_JUMP, MASCOT_WALK_CONTACT } from "./mascot-v2-poses";
import {
  applyMascotViewModel,
  MASCOT_FACE_PRESETS,
  mascotBodyState,
  mascotFacePreset,
  mascotTimeOfDayLight,
  resolveMascotFace,
} from "./mascot-view-model";

type Values = Record<string, unknown>;

const settings = (values: Values = {}) => readMascotSettings(values);
const vm = (values: Values = {}) => settings(values).vm;
const applied = (values: Values = {}) => applyMascotViewModel(settings(values));
const shapeIds = (values: Values = {}) =>
  buildMascotScene(settings(values)).layers.find((layer) => layer.id === "mascot")!.shapes.map((shape) => shape.id);

describe("MascotVM view model", () => {
  it("defaults to Idle with the happy face, and changes nothing", () => {
    expect(settings().vm).toEqual({ hasStepData: true, pace: 100, reaction: "none", timeOfDay: "day" });
    expect(settings().gear).toEqual({ armbands: true, headband: true });
    expect(mascotBodyState(vm())).toBe("idle");
    expect(resolveMascotFace(settings())).toEqual({ eyes: "open", mouth: "happy" });
    expect(applied()).toEqual(settings());
  });

  it("picks the body state from pace and step data (PROMPTS.md prompt 8)", () => {
    expect(mascotBodyState(vm({ [t.vmPace]: 0 }))).toBe("tired");
    expect(mascotBodyState(vm({ [t.vmPace]: 39 }))).toBe("tired");
    expect(mascotBodyState(vm({ [t.vmPace]: 40 }))).toBe("walking");
    expect(mascotBodyState(vm({ [t.vmPace]: 99 }))).toBe("walking");
    expect(mascotBodyState(vm({ [t.vmPace]: 100 }))).toBe("idle");
    expect(mascotBodyState(vm({ [t.vmPace]: 150 }))).toBe("idle");
    expect(mascotBodyState(vm({ [t.vmPace]: 20, [t.vmHasStepData]: false }))).toBe("idle");
  });

  it("picks the face by priority: reactions, then Tired, no step data, night, happy", () => {
    expect(mascotFacePreset(vm({ [t.vmReaction]: "goalHit", [t.vmPace]: 20 }))).toBe("excited");
    expect(mascotFacePreset(vm({ [t.vmReaction]: "won" }))).toBe("excited");
    expect(mascotFacePreset(vm({ [t.vmReaction]: "joined" }))).toBe("excited");
    expect(mascotFacePreset(vm({ [t.vmReaction]: "out", [t.vmTimeOfDay]: "night" }))).toBe("sad");
    expect(mascotFacePreset(vm({ [t.vmReaction]: "tap" }))).toBe("happy");
    expect(mascotFacePreset(vm({ [t.vmPace]: 20, [t.vmTimeOfDay]: "night" }))).toBe("disappointed");
    expect(mascotFacePreset(vm({ [t.vmHasStepData]: false, [t.vmTimeOfDay]: "night" }))).toBe("confused");
    expect(mascotFacePreset(vm({ [t.vmTimeOfDay]: "night" }))).toBe("sleepy");
    expect(mascotFacePreset(vm({ [t.vmTimeOfDay]: "morning" }))).toBe("happy");
    // Auto eyes and mouth follow it; a chosen set stays.
    expect(resolveMascotFace(settings({ [t.vmTimeOfDay]: "night" }))).toEqual(MASCOT_FACE_PRESETS.sleepy);
    expect(resolveMascotFace(settings({ [t.vmTimeOfDay]: "night", [t.faceEyes]: "angry" }))).toEqual({ eyes: "angry", mouth: "happy" });
  });

  it("walks side-on at the contact pose, keeping the way he faces", () => {
    const right = applied({ [t.vmPace]: 70 });
    expect(right.body.turn).toBe(90);
    expect(right.armLeft.swing).toBe(MASCOT_WALK_CONTACT.nearArm);
    expect(right.legRight.swing).toBe(MASCOT_WALK_CONTACT.farLeg);
    const left = applied({ [t.vmPace]: 70, [t.bodyTurn]: -10 });
    expect(left.body.turn).toBe(-100);
    expect(left.armRight.swing).toBe(MASCOT_WALK_CONTACT.nearArm);
    expect(applied({ [t.vmPace]: 70, [t.bodyTurn]: 150 }).body.turn).toBe(-120);
  });

  it("puts the state's pose under the sliders, which add to it", () => {
    expect(applied({ [t.vmReaction]: "tap" }).armRight.raise).toBe(135);
    expect(applied({ [t.vmReaction]: "tap", [t.armRightRaise]: 10 }).armRight.raise).toBe(145);
    // A default hand takes the reaction's; a chosen one stays.
    expect(applied({ [t.vmReaction]: "won" }).armLeft.hand).toBe(MASCOT_V2_CASH_JUMP.limbs.armL.hand);
    expect(applied({ [t.vmReaction]: "won", [t.armLeftHand]: "thumbsUp" }).armLeft.hand).toBe("thumbsUp");
    expect(applied({ [t.vmReaction]: "won" }).armLeft.moneyBag).toBe(true);
    expect(applied({ [t.vmReaction]: "joined" }).armRight.hand).toBe("thumbsUp");
    // Results stay inside each slider's hard domain.
    expect(applied({ [t.vmReaction]: "tap", [t.armRightRaise]: 170 }).armRight.raise).toBe(180);
  });

  it("lets Goal hit and Won take over the body, while Tap, Joined and Out play over it", () => {
    expect(applied({ [t.vmPace]: 70, [t.vmReaction]: "won" }).body.turn).toBe(0);
    expect(applied({ [t.vmPace]: 70, [t.vmReaction]: "goalHit" }).legLeft.swing).toBe(0);
    const tapWhileWalking = applied({ [t.vmPace]: 70, [t.vmReaction]: "tap" });
    expect(tapWhileWalking.body.turn).toBe(90);
    expect(tapWhileWalking.armRight.raise).toBe(135);
    expect(applied({ [t.vmPace]: 20, [t.vmReaction]: "out" }).body.squash).toBeCloseTo(-0.14, 6);
  });

  it("moves the light with the time of day", () => {
    expect(mascotTimeOfDayLight(160, "day")).toBe(160);
    expect(mascotTimeOfDayLight(160, "night")).toBe(160);
    expect(mascotTimeOfDayLight(160, "morning")).toBe(180);
    expect(mascotTimeOfDayLight(160, "evening")).toBe(0);
    expect(mascotTimeOfDayLight(350, "morning")).toBe(10);
    expect(applied({ [t.vmTimeOfDay]: "evening", [t.lightAngle]: 100 }).lightAngle).toBe(60);
  });

  it("shows or hides the gear", () => {
    expect(shapeIds().some((id) => id.startsWith("headband"))).toBe(true);
    expect(shapeIds().some((id) => id.includes("-armband"))).toBe(true);
    expect(shapeIds({ [t.vmGearHeadband]: false }).some((id) => id.startsWith("headband"))).toBe(false);
    expect(shapeIds({ [t.vmGearHeadband]: false }).some((id) => id.includes("-armband"))).toBe(true);
    expect(shapeIds({ [t.vmGearArmbands]: false }).some((id) => id.includes("-armband"))).toBe(false);
    // The hair stays planted where the headband was.
    expect(shapeIds({ [t.vmGearHeadband]: false }).filter((id) => id.startsWith("hair-")).length).toBe(shapeIds().filter((id) => id.startsWith("hair-")).length);
  });
});

describe("Faces_V2 import", () => {
  it("has every face, each with two eyes, a mouth and its soft shadow, in the palette", () => {
    expect([...mascotV2FaceNames].sort()).toEqual(["angry", "confused", "disappointed", "excited", "happy", "satisfied", "sleepy"]);
    for (const name of mascotV2FaceNames) {
      const face = mascotV2Faces[name];
      expect(face.eyes[0].length, name).toBeGreaterThan(0);
      expect(face.eyes[1].length, name).toBeGreaterThan(0);
      expect(face.mouth.every((shape) => shape.fill === "#031E19"), name).toBe(true);
      expect(face.shadow.every((shape) => shape.fill === "#687773" && shape.opacity === 0.2), name).toBe(true);
      expect([...face.eyes[0], ...face.eyes[1]].every((shape) => ["#031E19", "#FCFCFC"].includes(shape.fill)), name).toBe(true);
    }
  });
});
