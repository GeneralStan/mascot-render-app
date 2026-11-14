import type {
  ToolcraftComponentAcceptance,
  ToolcraftControlSectionInventoryEntry,
  ToolcraftExportRequestEvidence,
  ToolcraftProductReadiness,
  ToolcraftTransferMode,
} from "./acceptance/types";
import { getToolcraftControlKeyframeCapability } from "@/toolcraft/runtime";

import { appSchema, MASCOT_TIMELINE_SECONDS } from "./app-schema";
import { mascotControlSections } from "./mascot/mascot-controls";
import { MASCOT_OVERFLOW_PROOF_ID } from "./mascot/mascot-pipeline";
import { mascotTargets } from "./mascot/mascot-settings";

const persistenceSlices =
  appSchema.persistence.storage === "localStorage"
    ? appSchema.persistence.include
    : [];

/**
 * The user's answer to the agent's output question. The offered option read
 * "PNG + SVG + animate: Also a keyframe timeline to animate between poses, with
 * video export." The interpretation is recorded in the worklog.
 */
const outputRequestEvidence: ToolcraftExportRequestEvidence = {
  messageRef:
    "/Users/ifeanyi/.claude/projects/-Users-ifeanyi-Sandbox-Clutch/c718baf8-4424-410b-9584-ca2991466796.jsonl#L102 (uuid 4bf9b2c1-b2fe-4bc9-8b10-ec3d5b072e9e)",
  messageText:
    '"What do you need out of the app besides exploring on screen?"="PNG + SVG + animate"',
  quote: "PNG + SVG + animate",
  source: "user-message",
};

export const appTransferMode: ToolcraftTransferMode = {
  animationIntent: {
    loopDuration: {
      evidence:
        "Product-derived default: a 4 second keyframe loop leaves room for three or four pose changes at a readable pace; users edit duration in the timeline.",
      seconds: MASCOT_TIMELINE_SECONDS,
      source: "product-derived",
    },
    mode: "timeline-keyframes",
  },
  mode: "new-toolcraft-app",
  referenceInputs: [],
};

export const appProductReadiness: ToolcraftProductReadiness = {
  exportIntent: {
    image: { mode: "toolcraft-default" },
    svg: { evidence: outputRequestEvidence, mode: "user-requested" },
    video: { evidence: outputRequestEvidence, mode: "user-requested" },
  },
  interactionOwnership: [
    {
      alternative: {
        reason: "A panel slider would duplicate the viewpoint the gimbal already owns and could not show the turntable path. Turning the character itself is a different, panel-owned property (turn-character).",
        surface: "panel",
      },
      capability: "direct-spatial-edit",
      evidence: {
        detail: "\"Then finally, I want you to add a gimbal view. Essentially, this will allow me to explore different poses with the mascot to achieve a pseudo 3D feel.\"",
        source: "user-request",
      },
      id: "orbit-view",
      reason: "Moving the viewpoint is a spatial gesture: drag the canvas gimbal or the mascot itself. The light, cast shadow and floor turn with the world.",
      surface: "canvas",
      target: mascotTargets.viewOrbit,
    },
    {
      alternative: {
        reason: "Dragging the canvas already moves the camera (orbit-view), so a second canvas drag for the character would be ambiguous; an exact, keyframeable angle belongs in the panel.",
        surface: "canvas",
      },
      capability: "property-edit",
      evidence: {
        detail: "\"What if we keep the slider for horizontal turning and we keep the canvas drag plus gizmo for positioning for different poses and angles? So this way, they serve two different functions and we can actually keep both.\"",
        source: "user-request",
      },
      id: "turn-character",
      reason: "Turning Clutchman in place under the fixed world light is a pose property: the shading slides across him and his cast shadow stays put, unlike orbit-view at the same angle.",
      selectionScope: { mode: "global" },
      surface: "panel",
      target: mascotTargets.bodyTurn,
    },
  ],
  mode: "product",
  productName: "Clutch Mascot Lab",
  productSummary:
    "A pose and shadow explorer for the Clutch mascot, rebuilt as a vector rig from the designer's Figma parts.",
  requestedBehavior:
    "Explore mascot positions with 3D joints (raise, swing, twist, elbow/knee, wrist/ankle), straighten and lengthen limbs, pick open, fist or thumbs-up hands and money bags, tilt armbands and the headband, bend and wave the hair, turn the character under a fixed light and orbit the view all the way round with a gimbal, re-light the shading from any angle plus ground, cast and drop shadows, animate between poses with keyframes, and export PNG, SVG and video.",
  viewInteraction: {
    mode: "orbit",
    orientationTargets: [mascotTargets.viewOrbit],
  },
};

/**
 * The browser spec for an acceptance id. The delivery catalog allows one acceptance domain (an
 * id's first segment, such as `armLeft` or `artifact`) per browser file, and the Toolcraft docs
 * place each in `e2e/product-<domain>.spec.ts`.
 */
export function mascotBrowserFile(id: string): `e2e/product-${string}.spec.ts` {
  return `e2e/product-${id.split(".")[0]}.spec.ts`;
}

export const MASCOT_BROWSER_TESTS = {
  actionsOutput: "browser: actions.output exports PNG, SVG and video",
  exportImageSettings: "browser: export.image format and resolution set the downloaded image",
  exportVideoSettings: "browser: export.video format and resolution set the downloaded video",
  imageExport: "browser: image export writes decoded PNG, JPG and every raster resolution",
  svgExport: "browser: SVG export writes editable mascot vectors",
  videoExport: "browser: video export writes decoded MP4 and WebM mascot motion",
  infinityContinuity: "browser: Infinity canvas keeps the mascot scene and restores the finite artboard",
  infinityImage: "browser: Infinity PNG export contains the whole visible mascot composition",
  infinitySvg: "browser: Infinity SVG export contains the whole visible mascot composition",
  infinityVideo: "browser: Infinity video export keeps the saved finite artboard",
  infinityOverflow: "browser: oversized mascot overflows the finite artboard in Infinity",
  timelineKeyframes: "browser: keyframed lean animates the rendered mascot",
  timelinePlayback: "browser: timeline playback scrubs, pauses, loops and rescales the mascot animation",
} as const;

function automatedName(id: string): string {
  return `acceptance: ${id} maps to mascot output`;
}

type SchemaControl = (typeof mascotControlSections)[number]["controls"][string];

function describeControl(sectionTitle: string, control: SchemaControl): string {
  const label = typeof control.label === "string" ? control.label : control.target;
  return `${sectionTitle} ${label}`;
}

function controlRow(sectionTitle: string, control: SchemaControl): ToolcraftComponentAcceptance {
  const id = control.target;
  const name = describeControl(sectionTitle, control);
  const keyframes = getToolcraftControlKeyframeCapability(control).capable
    ? ({ timelineCoverage: "keyframes" } as const)
    : {};
  const row: ToolcraftComponentAcceptance = {
    ...keyframes,
    // The character's turn is the panel half of the orbit-view / turn-character pair.
    ...(control.target === mascotTargets.bodyTurn ? { interactionId: "turn-character" } : {}),
    automated: true,
    automatedTestName: automatedName(id),
    browser: {
      budget: "standard",
      file: mascotBrowserFile(id),
      testName: `browser: ${id} changes the rendered mascot`,
    },
    componentType: control.type,
    evidence: "product-output",
    expectedObservable: `Changing ${name} visibly changes the rendered mascot SVG paths.`,
    fixture: "default mascot workspace with the owning branch enabled",
    id,
    kind: "control",
    target: control.target,
    userAction: `Operate the ${name} control in the panel.`,
  };
  if (control.type === "orientationGizmo") {
    return {
      automated: true,
      automatedTestName: automatedName(id),
      browser: { budget: "standard", file: mascotBrowserFile(id), testName: `browser: ${id} turns the mascot with the gimbal` },
      canvasHandle: {
        outputObservable: "The rendered mascot turns (face, limb order and shapes change) as the gimbal or mascot is dragged.",
        testId: "toolcraft-orientation-gizmo",
        writesTarget: control.target,
      },
      componentType: control.type,
      evidence: "product-output",
      expectedObservable: "Dragging the gimbal or the mascot turns Clutchman; axis clicks snap to front, side and back; double-click resets.",
      fixture: "default mascot workspace",
      id,
      interactionId: "orbit-view",
      kind: "canvas-handle",
      orientationGizmoCoverage: "all-required-orientation-gizmo-behavior",
      target: control.target,
      userAction: "Drag the gimbal and the mascot, click axis ends, double-click to reset.",
    };
  }
  if (control.type === "actions") {
    return {
      ...row,
      actionCoverage: (control.actions ?? []).map((action) =>
        typeof action === "string" ? action : action.value,
      ),
      browser: { budget: "standard", file: mascotBrowserFile(id), testName: `browser: ${id} applies each pose preset` },
      evidence: "product-output",
      expectedObservable:
        "Stand returns every joint, the hair, hands, money bags, lift and Turn to rest; Walk turns Clutchman side-on at the walk's contact pose; Cash jump raises his fists with money bags and lifts him off the ground. The rendered mascot paths change each time.",
      userAction: "Click Stand, Walk and Cash jump in the Body Pose control.",
    };
  }
  if (control.type === "select" || control.type === "segmented") {
    return { ...row, optionCoverage: "each-visible-item" };
  }
  if (control.type === "colorOpacity") {
    return { ...row, controlPartCoverage: ["colorOpacity.hex", "colorOpacity.opacity"] };
  }
  if (control.type === "vector") {
    // The only pad is Body > Pivot; its visible feature is the preview's pivot marker.
    return {
      ...row,
      controlPartCoverage: ["vector.x", "vector.y"],
      expectedObservable:
        "Dragging the Pivot pad right, left, down or up moves the preview's pivot marker (a white dot with a blue centre) the same way on screen; with Lean or Squash set, the body turns and stretches around it.",
      fixture: "default mascot workspace with Lean and Squash at 0, so only the pivot marker moves",
      userAction: "Drag the Body Pivot Position pad right, left, down and up.",
    };
  }
  if (control.target === mascotTargets.includeBackground) {
    return {
      ...row,
      backgroundOutputCoverage: "all-required-background-output",
      expectedObservable:
        "Turning Background off removes the preview fill and makes PNG/SVG transparent; video keeps it.",
    };
  }
  return row;
}

const controlRows = mascotControlSections.flatMap((section) =>
  Object.values(section.controls).map((control) => controlRow(section.title, control)),
);

type RuntimeRowSeed = Omit<ToolcraftComponentAcceptance, "automated" | "automatedTestName" | "browser"> & {
  budget?: "extended-io" | "standard";
  testName: string;
};

function runtimeRow({ budget = "standard", testName, ...row }: RuntimeRowSeed): ToolcraftComponentAcceptance {
  return {
    ...row,
    automated: true,
    automatedTestName: automatedName(row.id),
    browser: { budget, file: mascotBrowserFile(row.id), testName },
  };
}

const exportRows: readonly ToolcraftComponentAcceptance[] = [
  runtimeRow({
    actionCoverage: ["export.png", "export.svg", "export.video"],
    budget: "extended-io",
    componentType: "panelActions",
    evidence: "exported-bytes",
    expectedObservable: "Export PNG/JPG/SVG and Export MP4/WebM download real artifacts of the posed mascot.",
    fixture: "default mascot workspace",
    id: "actions.output",
    kind: "control",
    target: "actions.output",
    testName: MASCOT_BROWSER_TESTS.actionsOutput,
    userAction: "Click the sticky export buttons in the controls footer.",
  }),
  runtimeRow({
    budget: "extended-io",
    componentType: "select",
    evidence: "exported-bytes",
    expectedObservable: "PNG, JPG and SVG each download in their own format; the still button label follows the format.",
    fixture: "default mascot workspace",
    id: "export.image.format",
    kind: "control",
    optionCoverage: "each-visible-item",
    target: "export.image.format",
    testName: MASCOT_BROWSER_TESTS.exportImageSettings,
    userAction: "Pick each Image Export format and export.",
  }),
  runtimeRow({
    budget: "extended-io",
    componentType: "select",
    evidence: "exported-bytes",
    expectedObservable: "2K, 4K and 8K raster exports decode at their exact scaled canvas dimensions.",
    fixture: "default mascot workspace with a raster format",
    id: "export.image.resolution",
    kind: "control",
    optionCoverage: "each-visible-item",
    target: "export.image.resolution",
    testName: MASCOT_BROWSER_TESTS.exportImageSettings,
    userAction: "Pick each Image Export resolution and export.",
  }),
  runtimeRow({
    budget: "extended-io",
    componentType: "select",
    evidence: "exported-bytes",
    expectedObservable: "MP4 and WebM each download as their container with decoded mascot frames.",
    fixture: "keyframed lean animation",
    id: "export.video.format",
    kind: "control",
    optionCoverage: "each-visible-item",
    target: "export.video.format",
    testName: MASCOT_BROWSER_TESTS.exportVideoSettings,
    userAction: "Pick each Video Export format and export.",
  }),
  runtimeRow({
    budget: "extended-io",
    componentType: "select",
    evidence: "exported-bytes",
    expectedObservable: "Current and 4K video exports decode at their exact even-safe dimensions.",
    fixture: "keyframed lean animation",
    id: "export.video.resolution",
    kind: "control",
    optionCoverage: "each-visible-item",
    target: "export.video.resolution",
    testName: MASCOT_BROWSER_TESTS.exportVideoSettings,
    userAction: "Pick each Video Export resolution and export.",
  }),
  runtimeRow({
    actionCoverage: ["export.png"],
    budget: "extended-io",
    componentType: "panelActions",
    evidence: "exported-bytes",
    exportArtifactCoverage: "all-required-image-export-behavior",
    expectedObservable: "The decoded PNG/JPG contains the mascot pixels at the canvas size and resolution.",
    fixture: "default mascot workspace",
    id: "artifact.image-export",
    kind: "runtime",
    target: "actions.output",
    testName: MASCOT_BROWSER_TESTS.imageExport,
    userAction: "Click Export PNG and Export JPG.",
  }),
  runtimeRow({
    actionCoverage: ["export.svg"],
    budget: "extended-io",
    componentType: "panelActions",
    evidence: "exported-bytes",
    exportArtifactCoverage: "all-required-svg-export-behavior",
    expectedObservable: "The downloaded SVG holds editable mascot paths, not embedded raster bytes.",
    fixture: "default mascot workspace",
    id: "artifact.svg-export",
    kind: "runtime",
    target: "actions.output",
    testName: MASCOT_BROWSER_TESTS.svgExport,
    userAction: "Select SVG and click Export SVG.",
  }),
  runtimeRow({
    actionCoverage: ["export.video"],
    budget: "extended-io",
    componentType: "panelActions",
    evidence: "exported-bytes",
    exportArtifactCoverage: "all-required-video-export-behavior",
    expectedObservable: "The decoded video spans the timeline duration and shows the keyframed mascot moving.",
    fixture: "keyframed lean animation",
    id: "artifact.video-export",
    kind: "runtime",
    target: "actions.output",
    testName: MASCOT_BROWSER_TESTS.videoExport,
    userAction: "Click Export MP4 and Export WebM.",
  }),
];

const canvasRows: readonly ToolcraftComponentAcceptance[] = [
  runtimeRow({
    componentType: "switch",
    evidence: "viewport-side-effect",
    expectedObservable: "Infinity removes only the artboard frame and size fields; the mascot, view and renderer stay put and finite size returns intact.",
    fixture: "default mascot workspace",
    id: "canvas.infinity.continuity",
    infinityCanvasCoverage: "mode-continuity-and-restoration",
    kind: "runtime",
    target: "canvas.infinity",
    testName: MASCOT_BROWSER_TESTS.infinityContinuity,
    userAction: "Turn Infinity canvas on and off.",
  }),
  runtimeRow({
    budget: "extended-io",
    componentType: "switch",
    evidence: "exported-bytes",
    expectedObservable: "Infinity PNG export is sized to the whole visible mascot composition.",
    fixture: "Infinity canvas on",
    id: "canvas.infinity.image-export",
    infinityCanvasCoverage: "scene-bounds-image-export",
    kind: "runtime",
    target: "canvas.infinity",
    testName: MASCOT_BROWSER_TESTS.infinityImage,
    userAction: "Turn Infinity canvas on and click Export PNG.",
  }),
  runtimeRow({
    budget: "extended-io",
    componentType: "switch",
    evidence: "exported-bytes",
    expectedObservable: "Infinity SVG export uses the whole visible composition as its viewBox.",
    fixture: "Infinity canvas on",
    id: "canvas.infinity.svg-export",
    infinityCanvasCoverage: "scene-bounds-svg-export",
    kind: "runtime",
    target: "canvas.infinity",
    testName: MASCOT_BROWSER_TESTS.infinitySvg,
    userAction: "Turn Infinity canvas on, select SVG and export.",
  }),
  runtimeRow({
    budget: "extended-io",
    componentType: "switch",
    evidence: "exported-bytes",
    expectedObservable: "Infinity video export keeps the saved finite artboard size and timeline duration.",
    fixture: "Infinity canvas on with a keyframed lean",
    id: "canvas.infinity.video-export",
    infinityCanvasCoverage: "scene-bounds-video-export",
    kind: "runtime",
    target: "canvas.infinity",
    testName: MASCOT_BROWSER_TESTS.infinityVideo,
    userAction: "Turn Infinity canvas on and click Export MP4.",
  }),
  runtimeRow({
    componentType: "renderer",
    evidence: "rendered-pixels",
    expectedObservable: "At large Scale the mascot extends past the finite artboard; Infinity shows those edge pixels instead of clipping them.",
    fixture: "View Scale 3 so the mascot is taller than the artboard",
    id: MASCOT_OVERFLOW_PROOF_ID,
    infinityOverflowCoverage: {
      controlValues: { [mascotTargets.viewScale]: 3 },
      edges: ["top"],
      passIds: ["mascot-scene"],
    },
    kind: "runtime",
    target: mascotTargets.viewScale,
    testName: MASCOT_BROWSER_TESTS.infinityOverflow,
    userAction: "Raise View Scale and turn Infinity canvas on.",
  }),
];

const timelineRows: readonly ToolcraftComponentAcceptance[] = [
  runtimeRow({
    componentType: "timeline",
    evidence: "timeline-output",
    expectedObservable: "A Lean keyframe pair changes the evaluated lean and the rendered mascot between keyframes.",
    fixture: "timeline expanded with Lean keyframes",
    id: "timeline.keyframes",
    kind: "runtime",
    target: mascotTargets.bodyLean,
    testName: MASCOT_BROWSER_TESTS.timelineKeyframes,
    timelineCoverage: "keyframes",
    userAction: "Add Lean keyframes with the diamond, move the playhead and change Lean.",
  }),
  runtimeRow({
    componentType: "timeline",
    evidence: "timeline-output",
    expectedObservable: "Scrubbing, play/pause, loop and duration edits move the keyframed mascot through one seamless forward cycle.",
    fixture: "Lean keyframed 0° → 20° → 0° across the loop",
    id: "timeline.playback",
    kind: "runtime",
    target: "timeline.playback",
    testName: MASCOT_BROWSER_TESTS.timelinePlayback,
    timelineCoverage: "playback",
    timelineLoopProof: {
      direction: "forward-only",
      durationChange: "reproved-after-edit",
      reversePlayback: "forbidden",
      seam: "first-last-match",
    },
    timelinePlaybackCoverage: "all-playback-behavior",
    userAction: "Scrub, play, pause, loop and edit the timeline duration.",
  }),
];

export const appAcceptance: readonly ToolcraftComponentAcceptance[] = [
  ...controlRows,
  ...exportRows,
  ...canvasRows,
  ...timelineRows,
  {
    automated: true,
    automatedTestName: automatedName("persistence.reload"),
    browser: {
      budget: "extended-io",
      file: "e2e/app-persistence.spec.ts",
      testName: "browser: app restores exact canvas, values, and panel workspace slices after reload",
    },
    componentType: "persistence",
    evidence: "persistence-state",
    expectedObservable:
      "Canvas size and zoom, their runtime values, and the moved and collapsed Controls workspace remain visibly restored after a real browser reload.",
    fixture: "mascot runtime persisted workspace",
    id: "persistence.reload",
    kind: "runtime",
    persistenceCoverage: "reload",
    persistenceSlices,
    target: "canvas.size.width",
    userAction: "Edit Canvas width and zoom, move and collapse Controls, wait for persistence, and reload the page.",
  },
];

type InventorySeed = Omit<ToolcraftControlSectionInventoryEntry, "targets" | "title">;

const inventorySeeds: Record<string, InventorySeed> = {
  background: {
    entity: "Background",
    entityId: "background",
    finiteSelectors: [
      {
        reason: "Background on/off changes only the runtime fill and artifact alpha.",
        role: "parameter",
        target: mascotTargets.includeBackground,
      },
    ],
    groupingReason: "The standard runtime background pair.",
    id: "background",
  },
  view: {
    entity: "Mascot view",
    entityId: "view",
    finiteSelectors: [],
    groupingReason: "How the mascot is seen: the gimbal viewpoint and the size.",
    id: "view",
  },
  body: {
    entity: "Body",
    entityId: "body",
    finiteSelectors: [],
    groupingReason: "Whole-body pose: pose presets, the character's turn, lean, squash, lift, and how softly every limb joint bends.",
    id: "body",
  },
  "body-pivot": {
    entity: "Body pivot",
    entityId: "body-pivot",
    finiteSelectors: [],
    groupingReason: "The point Body Lean turns and Squash stretches the body around, shown as the preview's pivot marker. A pad gets its own block.",
    id: "body-pivot",
  },
  hair: {
    entity: "Hair and headband",
    entityId: "hair",
    finiteSelectors: [],
    groupingReason: "The hair planted in the headband: its bend, sweep and wave, and the band's tilt.",
    id: "hair",
  },
  face: {
    entity: "Face",
    entityId: "face",
    finiteSelectors: [
      { reason: "Eye set drawn on the head.", role: "parameter", target: mascotTargets.faceEyes },
      { reason: "Mouth drawn on the head.", role: "parameter", target: mascotTargets.faceMouth },
    ],
    groupingReason: "Facial expression parts drawn on the head.",
    id: "face",
  },
  "arm-left": {
    entity: "Left arm",
    entityId: "arm-left",
    finiteSelectors: [
      { reason: "Which drawn hand sits at the wrist; no other control depends on it.", role: "parameter", target: mascotTargets.armLeftHand },
      { reason: "Shows the money bag prop in the hand; no other control depends on it.", role: "parameter", target: mascotTargets.armLeftMoneyBag },
      { reason: "Mirrors the hand only; no other control depends on it.", role: "parameter", target: mascotTargets.armLeftFlipHand },
    ],
    groupingReason: "One arm of the screen-left side: its 3D joints, hand and money bag, shape (straighten, length) and armband.",
    id: "arm-left",
  },
  "arm-right": {
    entity: "Right arm",
    entityId: "arm-right",
    finiteSelectors: [
      { reason: "Which drawn hand sits at the wrist; no other control depends on it.", role: "parameter", target: mascotTargets.armRightHand },
      { reason: "Shows the money bag prop in the hand; no other control depends on it.", role: "parameter", target: mascotTargets.armRightMoneyBag },
      { reason: "Mirrors the hand only; no other control depends on it.", role: "parameter", target: mascotTargets.armRightFlipHand },
    ],
    groupingReason: "One arm of the screen-right side: its 3D joints, hand and money bag, shape (straighten, length) and armband.",
    id: "arm-right",
  },
  "leg-left": {
    entity: "Left leg",
    entityId: "leg-left",
    finiteSelectors: [],
    groupingReason: "One leg of the screen-left side: its 3D joints and length.",
    id: "leg-left",
  },
  "leg-right": {
    entity: "Right leg",
    entityId: "leg-right",
    finiteSelectors: [],
    groupingReason: "One leg of the screen-right side: its 3D joints and length.",
    id: "leg-right",
  },
  light: {
    entity: "Light",
    entityId: "light",
    finiteSelectors: [],
    groupingReason: "The single world light that re-lights every part and throws the cast shadow.",
    id: "light",
  },
  "body-shading": {
    entity: "Body shading",
    entityId: "body-shading",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason: "Hiding the shade removes its Size.",
        role: "branch",
        target: mascotTargets.shadingVisible,
      },
      {
        reason: "Shows or hides the highlight strokes; no other control depends on it.",
        role: "parameter",
        target: mascotTargets.shadingHighlight,
      },
    ],
    groupingReason: "One re-lit shading treatment for every mascot part: the shade on the side away from the light and the highlights.",
    id: "body-shading",
  },
  "ground-shadow": {
    entity: "Ground shadow",
    entityId: "ground-shadow",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason: "Hiding the ground shadow removes its color, size and blur.",
        role: "branch",
        target: mascotTargets.groundVisible,
      },
    ],
    groupingReason: "One contact shadow ellipse under the feet.",
    id: "ground-shadow",
  },
  "cast-shadow": {
    entity: "Cast shadow",
    entityId: "cast-shadow",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason: "Hiding the cast shadow removes its color, length and blur.",
        role: "branch",
        target: mascotTargets.castVisible,
      },
    ],
    groupingReason: "One projected floor silhouette.",
    id: "cast-shadow",
  },
  "drop-shadow": {
    entity: "Drop shadow",
    entityId: "drop-shadow",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason: "Hiding the drop shadow removes its color, offset and blur.",
        role: "branch",
        target: mascotTargets.dropVisible,
      },
    ],
    groupingReason: "One flat offset silhouette behind the mascot.",
    id: "drop-shadow",
  },
};

const runtimeExportInventory: readonly ToolcraftControlSectionInventoryEntry[] = [
  {
    entity: "Image export",
    entityId: "image-export",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason: "SVG hides raster Resolution; PNG and JPG show it.",
        role: "branch",
        target: "export.image.format",
      },
      {
        reason: "Resolution scales the raster artifact dimensions only.",
        role: "parameter",
        target: "export.image.resolution",
      },
    ],
    groupingReason: "Runtime still-export settings shared by the Export PNG/JPG/SVG button.",
    id: "runtime.image-export",
    targets: ["export.image.format", "export.image.resolution"],
    title: "Image Export",
  },
  {
    entity: "Video export",
    entityId: "video-export",
    finiteSelectors: [
      { reason: "Container for the video artifact.", role: "parameter", target: "export.video.format" },
      { reason: "Video artifact dimensions.", role: "parameter", target: "export.video.resolution" },
    ],
    groupingReason: "Runtime video-export settings shared by the Export MP4/WebM button.",
    id: "runtime.video-export",
    targets: ["export.video.format", "export.video.resolution"],
    title: "Video Export",
  },
];

// Product entries use the same explicit stable section IDs as appSchema.
export const appControlSectionInventory: readonly ToolcraftControlSectionInventoryEntry[] = [
  ...mascotControlSections.map((section) => {
    const seed = inventorySeeds[section.id];
    if (!seed) throw new Error(`Missing inventory entry for section "${section.id}".`);
    return {
      ...seed,
      targets: Object.values(section.controls).map((control) => control.target),
      title: section.title,
    };
  }),
  ...runtimeExportInventory,
];
