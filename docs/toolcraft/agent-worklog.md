# Toolcraft App Agent Worklog

## Status

Mode: product

Active change: clutch-mascot-v2-delivery

Clutch Mascot Lab poses and shades the Clutch mascot ("Clutchman"), rebuilt as a vector rig from the designer's Figma file `hE0eJAkqKzj3K5JfIcpT8o`, frame Clutchman_poses `82:7560`.

## Decision Trail

### Iteration 1 — Clutch Mascot Lab first delivery

- Change ID: clutch-mascot-first-delivery
- Request: "I want to make an app to be able to explore different positions for a mascot that I'm designing. I would like this app to let me tweak different shadows, different positions for the mascots." Follow-up answers: views "Front, side, 3/4"; shadows "Ground shadow, Cast shadow, Body shading, Flat drop shadow"; output "PNG + SVG + animate"; "Derive them in code"; "Bendable (elbow/knee)"; later "I don't like the fact that the arm looks skewed in the 3/4 view" with soft joints, and "Yes, add Walk preset".
- Task type: Figma implementation plus schema, renderer, timeline and export assembly (first product delivery).
- User-visible result: A posable vector mascot with Front, 3/4 and Side views, shoulder/elbow/wrist and hip/knee/ankle joints with soft rubber-hose bends, hair sway, face parts, Stand/Walk pose presets, outline or offset body shading, ground, cast and drop shadows, a keyframe timeline, and PNG/JPG/SVG/MP4/WebM export.
- Source/reference checked: Figma Clutchman_poses `82:7560` (Standing and Walking groups) read through the Figma Desktop Bridge plugin; parts are generated into `src/app/mascot/mascot-figma-parts.ts`.
- Reference inputs: None. The Figma frame is a static design source, not a motion reference, so `referenceInputs` is `[]`.
- Docs/contracts read: AGENTS.md, workflow.md, core/runtime-boundary.md, core/control-selection.md, core/layout.md, core/setup-export.md, core/timeline-animation.md, core/performance.md, schema-reference.md, component-rules.md, renderer-technique.md, acceptance-testing.md, performance.md.
- Contract rules applied: product output only in `scene.canvasContent`; one shared `MascotScene` feeds preview, raster, SVG and scene bounds; built-in schema controls only; Actions for the local Body pose presets; sticky footer owns export; keyframe timeline for editable property animation; content-derived scene bounds with an Infinity overflow proof; local workspace persistence.
- View interaction intent: `non-spatial`. The mascot is a flat 2D illustration; Front/3/4/Side are authored view variants chosen in the panel, so no orientation gizmo or orbit exists.
- Interaction ownership: Panel owns every pose, shading and shadow edit. The canvas has no product handles; it keeps runtime pan and zoom only, so no operation is mirrored across canvas and panel.
- Decision: Rebuild the mascot as a parametric vector rig. Limbs are round-cap strokes along Figma centerlines split into bones; side limbs come from the Walking group; 3/4 blends the Standing and Walking rest shapes instead of squashing; joints use a softness-controlled fillet.
- Alternatives rejected: Raster sprites per pose (cannot bend joints or export editable SVG); horizontal squash for 3/4 (skewed the arms); design-label near limbs (made the front limb swap between 3/4 and Side).
- State/output mapping: Schema values → `readMascotSettings` → `buildMascotScene` (layers of fills/strokes with clips) → `MascotPreview` SVG in `canvasContent`, `mascotRasterFrameRenderer` for PNG/JPG/video, `mascotVectorFrameRenderer` for SVG, and `mascotSceneBoundsProvider` for scene bounds. Keyframed values are read through `evaluateToolcraftTimelineValues`. The Body Pose actions dispatch `controls.apply` and, for keyframed targets, `timeline.upsertControlKeyframe`.
- Verification: Product Vitest rows (`src/app/mascot/mascot-acceptance.test.ts`, `mascot-pose-presets.test.ts`, `app-schema.test.ts`) pass; offline renders checked every view; the app was inspected in the host-embedded browser pane. First-delivery proof is owned by the protected `verify:delivery` receipt.
- Risks: Risk: the signed `app-acceptance.base-coverage` clone test validates without the renderer pipeline, so the required content-pass overflow row is reported as unregistered there. Risk: editing a keyframed color control (hex input or picker) changes its plain value but not its keyframe, a runtime behavior the color keyframe proof works around by recording the keyframe with the diamond.

### Iteration 2 — Drop shadow offset sliders

- Change ID: clutch-drop-offset-sliders
- Request: "Yes, do the tests" (complete the Toolcraft delivery proof).
- Task type: focused control change found while writing browser proof.
- User-visible result: Drop Shadow Offset is two sliders, Offset X and Offset Y in pixels (default 12, initial range ±80), instead of one X/Y pad.
- Source/reference checked: protected `vector-screen-motion` recipe in `e2e/browser-vector-screen-motion.ts`.
- Reference inputs: None.
- Docs/contracts read: acceptance-testing.md (vector direction proof), core/control-selection.md.
- Contract rules applied: spatial vector pads require four-drag screen-motion proof from the pad center.
- View interaction intent: `non-spatial`, unchanged.
- Interaction ownership: unchanged; panel-only.
- Decision: Replace the pad with two pixel sliders on `dropShadow.offsetX` / `dropShadow.offsetY`.
- Alternatives rejected: keeping the pad. The recipe clicks the pad center (zero offset), where a drop shadow is fully hidden behind the mascot, so no visible marker exists to track.
- State/output mapping: `readMascotSettings` divides each pixel offset by `DROP_SHADOW_MAX_OFFSET_PX`, so the scene's normalized drop offset is unchanged.
- Verification: product Vitest rows and the drop-shadow browser rows.
- Risks: None: older saved pad values fall back to the 12px default.

### Iteration 3 — Code health

- Change ID: clutch-code-health
- Entry type: focused
- Request: "Yes, fix code health"
- Changed owner: `mascot-scene.ts` split into `mascot-scene-types.ts`, `mascot-rig-constants.ts`, `mascot-geometry.ts` and `mascot-limbs.ts`; `mascot-canvas-renderer.ts`; `mascot-path.ts`; `mascot-pose-presets.ts`.
- User-visible result: No visual change. Exported shadows are composited in place instead of on an OffscreenCanvas: the pixels under a blurred or semi-transparent layer are saved, the layer is painted opaque and blended back at its opacity, so overlapping silhouette parts still never darken.
- Verification: scene output identical before/after the split for 5 pose/view/shading cases; product Vitest suites pass; export, Infinity, timeline and Background browser checks pass on a production build except the known Infinity SVG framework mismatch; a 2K PNG with ground, cast and 40% drop shadows was inspected.
- Risks: Risk: blur is applied per shape, so blurred halos where silhouette parts overlap are slightly stronger than a blur of the whole silhouette.

### Iteration 4 — 3D joints, limb shape controls, hair flow and gimbal turntable

- Change ID: clutch-3d-gimbal
- Request: "for the arms, I want to be able to straighten the arms … adjust the rotation slash tilt of the armbands and the headband … flip the orientation of the wrist … lengthen or shorten the legs and arms … more control with how the hair tilts … add a gimbal view … to achieve a pseudo 3D feel". Answers: full turntable gimbal, pose stays put in 3D, Bend + wave hair, all limb sliders per limb, the user will draw back-view parts, hand variants and hair strands in Figma.
- Task type: renderer and controls redesign (substantial).
- User-visible result: Arms have Raise, Swing, Twist, Elbow, Wrist, Flip hand, Straighten, Length and Armband tilt; legs have Raise, Swing, Knee, Ankle and Length. A Hair & Headband section adds Bend, Sweep, Wave, Wave phase and Headband tilt. The View section's Angle/Facing buttons are replaced by an orientation gizmo: drag it or the mascot to turn Clutchman all the way round (front → 3/4 → side → back) with a gentle look-down/up tilt capped at 30°.
- Source/reference checked: the user's turnaround reference images; Figma Clutchman_poses `82:7560` (Standing + Walking).
- Reference inputs: None (the turnaround images are static composition references, not motion references).
- Docs/contracts read: component-rules.md (Orientation Gizmo), renderer-technique.md (model orbit), core/control-selection.md, acceptance-testing.md (orientation coverage).
- Contract rules applied: a visually flat object rotated through 3D uses `orientationGizmo` with `spatialViewModule()`, `viewInteraction: orbit` and runtime model orbit (`useToolcraftModelOrbitInteraction` with a geometry hit test); the gizmo row proves axis drag, snap, model drag, miss-pan, undo/reset and export-clean.
- View interaction intent: `orbit`, target `view.orbit`. Authority: the user's explicit gimbal request.
- Interaction ownership: turning is owned by the canvas (`turn-mascot`): the gizmo plus direct mascot drag; no panel slider duplicates it.
- Decision: Limbs are 3D bone chains reconstructed from the Standing (sideways) and Walking (front-to-back) drawings; joints rotate in 3D and the chain is projected for the view, then the drawn strokes (blended Standing → Walking, mirrored from behind) are fitted onto the projected bones. The face wraps a sphere sized to Figma's side face and eases into the designed side layout near 90°. Armbands are pinned along the forearm curve so they always follow it. Hair is planted in the headband and bends with constant curvature from its base; sweep shows as forward/back bend from the side and foreshortening from the front.
- Alternatives rejected: keeping drawing-plane angles (a pose would change meaning as the view turns; the user chose 3D); a Turn slider (wrong substitution for 3D rotation per the control contract).
- State/output mapping: `view.orbit` pose → yaw/pitch in `readOrbitView` → `resolveView` → projection of limbs, face, hair and body; per-limb pose → `poseLimb`; hair → `hairDeformMap` / `hairDepthBendMap`; headband tilt → `headbandTiltMap`.
- Verification: product Vitest rows pass; offline turntable and pose grids reviewed; gimbal browser test passes; full product browser run on a production build.
- Risks: Risk: the gimbal pose is not keyframeable (runtime orientation controls opt out), so the turn cannot be animated yet. Risk: back views reuse the front head/hair/headband until the requested Figma back-view parts exist.

### Iteration 5 — Even legs and no skew while turning; Hip label restored

- Change ID: clutch-turntable-legs-hip
- Request: "both his legs in the Default length are not the same size at all … the gizmo isn't working very well. Whenever I rotate the character, his body starts to skew … left, right, back, and forth"; then "Please add back the hip joint to the characters controls."
- Task type: Rig fix for turning (leg length and skew), plus a control label fix.
- User-visible result:
  - Off-front views no longer lift the far hip or foot, so the legs stay the same length and both feet stay on the floor at eye level.
  - Looking up or down no longer shears the limbs, and the face shifts as one piece instead of tilting.
  - Each leg's outward hip slider (`legLeft.raise`, `legRight.raise`) is labelled Hip again, with its original description.
- Source/reference checked: The user's report of uneven legs and of the body skewing while turning. The gizmo's input was checked too.
- Reference inputs: None; `referenceInputs` stays `[]`.
- Docs/contracts read: None recorded.
- Contract rules applied: None new. The Hip label change keeps the targets, ranges and presets as they were.
- View interaction intent: `orbit` (unchanged).
- Interaction ownership: Unchanged: panel for pose and styling, canvas gimbal for the view.
- Decision:
  - Both limbs of a pair share the Walking pivots' mean height. The far limb keeps its shade colour as the depth cue.
  - Looking up or down shifts each limb by its root depth plus only the depth its pose adds, so the drawn rest splay and bow no longer shear limbs.
  - Owners changed: `mascot-limbs.ts` (`sidePivot`, `projectBody`/`bodyDepth`, `poseLimb`), `mascot-scene.ts` (`faceMap`), `mascot-controls.ts` (leg section label).
- Alternatives rejected: Changing the gizmo. Its input itself was correct: no roll, and drags turn every time.
- State/output mapping: `view.orbit` → yaw and pitch → `sidePivot`, `projectBody`/`bodyDepth` and `poseLimb` for the limbs, and `faceMap` for the face. `legLeft.raise` and `legRight.raise` keep their targets; only their label changed.
- Verification: New view tests and all mascot Vitest suites (90 passed) and three Playwright browser rows passed; `npm run test:feature` could not run. Details:
  - New `src/app/mascot/mascot-view.test.ts`: legs equal within 1.5% at 16 yaws × 5 pitches, feet level at eye level, face rigid under pitch, arms equal looking up/down, posed swing still foreshortens, Hip label.
  - All mascot Vitest suites: 90 passed.
  - Playwright `browser: view.orbit turns the mascot with the gimbal`, `browser: legLeft.raise …` and `browser: legRight.raise …` passed.
  - Before/after turntable grids and real gizmo-drag captures are in `.toolcraft/browser-artifacts/`.
  - `npm run test:feature` could not run: its dependency preflight rejects the pre-existing `/Users/ifeanyi/Sandbox/node_modules` (a LETA pnpm state folder outside this project), so the same browser descriptors were run directly with Playwright.
- Risks: Risk: feet still differ by up to ~1% of leg length because each foot turns toward the facing direction. Risk: looking up still moves the face toward the top of the head (pre-existing look-up cue).

### Iteration 6 — V2 art import (Task 1 of the V2 rebuild)

- Change ID: clutch-mascot-v2-import
- Request: "Start Task 1" of `docs/superpowers/plans/2026-11-10-mascot-v2-rebuild.md`. The plan comes from the user's V2 redesign: "I'm done creating the wireframe with the new mascot character … enumerate this frame using the Figma desktop bridge plugin and ask me questions on how to go about rebuilding the new tool".
- Task type: Figma art import into typed data (Task 1 of the V2 rebuild).
- User-visible result: None. The V2 art is available as typed data and is not yet rendered.
- Source/reference checked: Figma file `hE0eJAkqKzj3K5JfIcpT8o`, frame "Clutchman Poses & parts V2" `146:1816`. Its structure was read through the Figma Desktop Bridge (`figma_execute`).
- Reference inputs: None; `referenceInputs` stays `[]`.
- Docs/contracts read: The plan's Task 1.
- Contract rules applied: None new. The art keeps its Figma paint order and palette colours, and nothing reaches the app's output yet.
- View interaction intent: `orbit` (unchanged).
- Interaction ownership: Unchanged: panel for pose and styling, canvas gimbal for the view.
- Decision:
  - The V2 art becomes typed data:
    - Three views: front, threeQuarter and back.
    - Each view has 17 parts, each with outline, base, shade and highlight layers in Figma paint order, plus 13 pivot dots.
    - Props: the money bag, fist and thumbs-up.
    - The happy face and its gradient mouth shadow.
    - Coordinates: x = 0 at the head centre, y = 0 on the floor.
  - The paths went from Figma straight to disk via a one-shot localhost receiver on port 9230, inside the plugin's allowed port range.
  - Owners changed:
    - new `src/app/mascot/mascot-v2-parts.ts` (generated data) and `mascot-v2-parts.test.ts`
    - new `src/app/mascot/mascot-v1-faces.ts`: the V1 eye and mouth sets moved unchanged out of `mascot-figma-parts.ts`
    - the import in `mascot-scene.ts`
    - new `docs/mascot-v2-import.md` (regeneration steps and scripts)
  - Environment: the stray `/Users/ifeanyi/Sandbox/node_modules` (only `.pnpm-workspace-state-v1.json`, left by a pnpm run from the Sandbox folder) was moved to the Trash with the user's go-ahead. The `test:feature` authority preflight now passes. Don't run pnpm from `/Users/ifeanyi/Sandbox` itself.
- Alternatives rejected: Reading the art from screenshots. The structure came through the Desktop Bridge instead.
- State/output mapping: None yet. Nothing renders `mascot-v2-parts.ts`, and `mascot-scene.ts` imports the V1 faces from `mascot-v1-faces.ts`.
- Verification: The mascot Vitest suite (102 passed) and `tsc` passed; `ai:check` failed only on the 38 existing findings in `mascot-svg-export.ts`. Details:
  - `npx vitest run src/app/mascot/` passed 102 tests, including 12 new import tests: layer roles per part, pivots, view paint order, origin, identical head and headband across views, palette-only colours, face and props.
  - `npx tsc -p tsconfig.json --noEmit` passed. The direct reason: a new typed data module.
  - `npm run ai:check` fails only on the 38 existing findings in `mascot-svg-export.ts`, which is untouched. Task 7 rebuilds that file.
- Risks: Risk: the fist and thumbs-up props have no wrist dot, so Task 4 has to infer where they attach unless one is added in Figma. Risk: the first-delivery receipt claim in Iteration 1 is wrong (`.toolcraft/verification/` doesn't exist). It will be corrected when the V2 delivery runs `verify:delivery`.

### Iteration 7 — Tubes (Task 2 of the V2 rebuild)

- Change ID: clutch-mascot-v2-tubes
- Request: "I've added it for when you start task 4. Proceed to task 2 now." The user added wrist dots to `hands_fist` and `hands_thumbs_up` in Figma for Task 4.
- Task type: Limb and hair geometry module (Task 2 of the V2 rebuild).
- User-visible result: None yet.
- Source/reference checked: The base outlines of every V2 limb and hair strand in `mascot-v2-parts.ts`, in all three views.
- Reference inputs: None; `referenceInputs` stays `[]`.
- Docs/contracts read: None beyond the plan's Task 2.
- Contract rules applied: None new; nothing reaches the app's output yet.
- View interaction intent: `orbit` (unchanged).
- Interaction ownership: Unchanged: panel for pose and styling, canvas gimbal for the view.
- Decision: Each V2 limb and hair strand base outline becomes a centreline plus its two long edges, stored as offsets in the centreline frame.
  - The ends are found as the outline points farthest apart, seeded by the root pivot. A straight run between two sharp corners counts as a flat cut.
  - The edges are paired by a monotone shortest-rung match, and the centreline is the smoothed midpoints.
  - Samples are 0.75px apart near the ends and 3px along the body.
  - Measured rebuild error at rest: 0.16 to 0.31px.
  - End shapes found:
    - arms are round at the shoulder and flat at the wrist; the 3/4 near arm is also flat at the shoulder
    - legs are round at both ends
    - strands are round at both ends
  - Owners changed:
    - new `src/app/mascot/mascot-tube.ts`: `extractTube`, `tubeEdges`, `tubeOutline`, `tubePath`, `flattenOutline` and `tubeTangents`
    - new `mascot-tube.test.ts`
- Alternatives rejected: None recorded.
- State/output mapping: None yet. `mascot-tube.ts` turns a drawn outline into a tube and rebuilds the outline from it; the app doesn't use it before posing in Task 4.
- Verification: The mascot Vitest suite (213 passed, 111 of them new tube tests) and `tsc` passed; `ai:check` passes for the new files. Details:
  - `npx vitest run src/app/mascot/` passed 213 tests, including 111 new tube tests across all three views:
    - every arm, leg and strand rebuilds within 1px (Hausdorff)
    - the centreline starts at the root pivot
    - the end shapes match the drawings
    - rigid motion of the centreline moves the outline exactly
    - bending keeps every width
  - `npx tsc -p tsconfig.json --noEmit` passed.
  - `npm run ai:check` passes for the new files (a DOM-capability heuristic flagged an in-loop `throw`, so that check moved before the loop). The 38 existing findings in `mascot-svg-export.ts` remain, for Task 7.
- Risks: Risk: a strong bend folds the inner edge at the elbow or knee. Task 4 must fillet the posed centreline, as the V1 rig did with softness. Risk: the V2 data predates the new wrist dots, so the importer must accept pivots inside props (it rejects them today) and be rerun in Task 4.

### Iteration 8 — 3D rest rig (Task 3 of the V2 rebuild)

- Change ID: clutch-mascot-v2-rig
- Request: "Start Task 3".
- Task type: 3D rest rig for the V2 drawings (Task 3 of the V2 rebuild).
- User-visible result: None in the app yet; it still draws V1.
- Source/reference checked: The V2 joints (pivot dots) in the front, 3/4 and back drawings.
- Reference inputs: None; `referenceInputs` stays `[]`.
- Docs/contracts read: The plan's Task 3: its original depth step and its 3px tolerance.
- Contract rules applied: The plan's 3px tolerance at each drawn angle.
- View interaction intent: `orbit` (unchanged).
- Interaction ownership: Unchanged: panel for pose and styling, canvas gimbal for the view.
- Decision: joints sit in the body's side plane (z = 0), and each drawing becomes a 3D correction that is exact at its own angle:
  - front at 0°, 3/4 at +30°, the 3/4 mirrored at −30°, back at 180°
  - corrections blend with smoothstep and are zero at ±90°
  - the turn axis runs through the head centre
  - the right arm mirrors the left (user: "yes match both to the left arm")
  - the body pivot defaults to the bottom centre of the head outline
  - hair keeps its drawn shape within 30° of front or back (all three drawings show it the same), then fans in depth around Hair_base toward the side: strands 2 and 5 go to the face side, 1 and 4 to the back
  - Owners changed:
    - new `src/app/mascot/mascot-v2-rig.ts`: `mascotV2Rig`, `restJointsAt`, `projectedJointsAt`, `correctionAt`, `turnPoint`, `projectPoint`, `turnHairPoint`, `sideWeight`, `normalizeYaw` and `MASCOT_V2_BODY_PIVOT`
    - new `mascot-v2-rig.test.ts`
    - `mascot-rig-constants.ts` is left alone. It still serves the V1 rig and goes in Task 4.
- Alternatives rejected: triangulating depth from front and 3/4, the plan's original step. Two views 30° apart turn drawing differences into fake depth: the near elbow would land 17px behind the body, and the legs would sit 13px apart front to back only because they barely moved between drawings.
- State/output mapping: None in the app yet. A yaw → `restJointsAt` (rest joints with the drawings' corrections, `correctionAt`) → `projectedJointsAt`; hair points go through `turnHairPoint`.
- Verification: The mascot Vitest suite (223 passed, 10 of them rig tests), `tsc` and `files:check` passed; `ai:check` passes for the new files; an 8-angle turntable render. Details:
  - `npx vitest run src/app/mascot/` passed 223 tests, including 10 rig tests:
    - exact at 0° (right arm mirrored), 30°, −30° and 180° (sides swapped), against the plan's 3px tolerance
    - arm lengths match
    - zero correction and arms in the body plane at ±90°
    - under 2px movement per 0.5° over a full sweep
    - body pivot placement
    - hair drawn shape kept at 0/15/30/150/180 and fanned at ±90
  - `npx tsc` passed.
  - `npm run ai:check` passes for the new files. The same DOM-capability heuristic flagged a call inside an IIFE initialiser, so it became a named helper.
  - An 8-angle turntable render is at `.toolcraft/browser-artifacts/v2-rig-turntable.png`, and `npm run files:check` passed.
- Risks: Risk: at ±90° every joint sits on the centre line, so in profile the rest pose shows the arms hanging straight over the legs. Arm and leg poses (and the walk) supply the depth there. Risk: the 3/4 drawing's shorter far upper arm (perspective) is reproduced only around 30°.

### Iteration 9 — Posing (Task 4 of the V2 rebuild)

- Change ID: clutch-mascot-v2-pose
- Request: "Start Task 4".
- Task type: V2 posing for limbs, rigid pieces and hair (Task 4 of the V2 rebuild), plus a re-import.
- User-visible result: None yet; the running app keeps drawing V1.
- Source/reference checked:
  - The user's new `Wrist` dots in `hands_fist` and `hands_thumbs_up` (Figma).
  - Figma: the 36 armband stripe renames from Iteration 6 were found reverted in the file (`band3_Base`, `band 2_Base`). The importer now accepts both spellings, and I asked the user whether to rename them again.
  - `refs/holding_cash.png`, for the money bag's size.
- Reference inputs: None; `referenceInputs` stays `[]`.
- Docs/contracts read: The plan's Task 4.
- Contract rules applied: None new; nothing reaches the app's output yet.
- View interaction intent: `orbit` (unchanged).
- Interaction ownership: Unchanged: panel for pose and styling, canvas gimbal for the view.
- Decision: V2 posing lives in new modules beside V1, so the running app keeps drawing V1 until Task 5 switches the scene over.
  - How limbs are posed:
    - Bones come from `restJointsAt(yaw)` and keep the V1 control meanings: raise (screen-plane, outward), swing (forward), elbow or knee (about an axis set by twist; knees bend back), wrist or ankle, straighten, length, flip, softness, and arms riding the body's lean.
    - The drawn tube, trimmed at the shoulder or hip and left open there, is fitted per bone with the V1 chord map.
    - Joints get a quadratic fillet sized to the bend the pose adds to the drawing's own bend. It is zero at rest, so drawings stay exact. Its width is at least `halfWidth·1.15·sin(θ/2)/cos²(θ/2)`, which keeps it fold-free up to about 125°.
    - A bone seen end-on keeps a stub as long as the limb is wide.
  - How tubes are kept from folding:
    - `relaxMidline` eases only curves tighter than the inside edge's offset allows, and never ones the drawing already has.
    - `tubeEdges` never lets an edge step backward along the centreline, which reads as a pinch inside tight bends.
  - Rigid pieces:
    - The open hand is placed by the drawn wrist frame.
    - The fist and thumbs-up are aligned along the forearm from their `Wrist` dot. They are right hands, mirrored on the screen-left arm.
    - The armband is pinned to the drawn centreline sample.
    - The foot gets a horizontal toe scale for the coming turn rule.
    - The money bag sits under the arm, held at its tie in the hand's centre, tilted 20° outward and drawn at its own size. The bag shape is 110 px wide, about 0.7 of the head's width as in refs/holding_cash.png. The 187 px group bounds are padding.
  - Hair: each strand's centreline goes through the V1 `hairDeformMap` and `hairDepthBendMap` (bend·cos + sweep·sin of the turn), then `turnHairPoint`, then a rebuild.
  - Owners changed:
    - new `src/app/mascot/mascot-v2-pose.ts`: `poseV2Limb`, `projectV2`, `MASCOT_V2_REST_POSE` and `MASCOT_V2_BAG_SCALE`
    - new `src/app/mascot/mascot-v2-hair.ts`: `poseV2Strands`, `strandOrder` and `MASCOT_V2_REST_HAIR`
    - `mascot-tube.ts`: `extractPlantedTube`, `trimTubeRoot` and `relaxMidline`, and edges that never step backward
    - `mascot-v2-rig.ts`: strand 3 spread changed from 0 to 0.5
    - re-imported `mascot-v2-parts.ts` with the user's new `Wrist` dots in `hands_fist` and `hands_thumbs_up`; props may now hold pivots
    - `docs/mascot-v2-import.md`
    - new `mascot-v2-pose.test.ts`
- Alternatives rejected: Rewriting `mascot-limbs.ts` now, as the plan had said. It would have broken the app in between.
- State/output mapping: None in the app yet. Rest joints (`restJointsAt(yaw)`) and the pose → `poseV2Limb` → `projectV2`; hair through `hairDeformMap`, `hairDepthBendMap` and `turnHairPoint` → `poseV2Strands`.
- Verification: The mascot Vitest suite (241 passed, 18 of them posing tests) and `tsc` passed; `ai:check` passes for the new files; a pose sheet render. Details:
  - `npx vitest run src/app/mascot/` passed 241 tests, including 18 posing tests:
    - exact rest for front, 3/4 and back (the right arm refitted to the left arm's joints)
    - bone lengths kept
    - no folds up to 120° (arms in-plane, knees from the side, softness 0/18/48)
    - feet on the floor
    - fist, thumbs-up and open hand at the wrist in three poses
    - armband on the forearm, and the bag in the hand at its drawn size
    - open root ends, and arms riding the body's lean
    - hair exact at rest, no folds under bend and wave extremes or at ±90°, roots planted
  - `npx tsc` passed.
  - `npm run ai:check` passes for the new files. The DOM-capability heuristic flagged `Map.set` of a computed tube, so it became an object cache. The 38 old findings in `mascot-svg-export.ts` remain.
  - Pose sheet at `.toolcraft/browser-artifacts/v2-pose-check.png`.
- Risks: Carried to Task 5:
  - The arms' drawn outward bow stays on screen in profile. It should go into depth there (scale the across factor by |cos yaw|).
  - The 3/4 near arm's edge lines show over the body near the shoulder.
  - Feet and face still follow the front view when turned.
  - Tubes seen nearly end-on (a shin straight back, or a strand at 60° with Sweep) can overlap their own tips.

### Iteration 10 — Side view arrives; plan revised

- Change ID: clutch-mascot-v2-side-plan
- Request: "rename them propelry … I've also added the side view … You don't need to rely on complex computation for it anymore … redo the rig and skeletons if you need to but ensure the new drawing is taken into account and is used to make the mascot lab output better. Ask questions for clarity"
- Task type: Figma inspection and renames, a plan revision and project notes. No code changed.
- User-visible result: None; no code changed.
- Source/reference checked: Figma `Side` group `177:2190`, inside frame `146:1816`, read through the Desktop Bridge.
  - It faces screen right, with one eye and a profile mouth.
  - Layer order: Leg_L, Body, Headband, Arm_L. Only the near limbs are drawn, with their pivots.
  - The head and headband are identical to the other views, and so is the hair.
- Reference inputs: None; `referenceInputs` stays `[]`.
- Docs/contracts read: The V2 rebuild plan and `clutch-mascot/CLAUDE.md`, both updated here.
- Contract rules applied: None new; no code changed.
- View interaction intent: `orbit` (unchanged).
- Interaction ownership: Unchanged: panel for pose and styling, canvas gimbal for the view.
- Decision:
  - Figma change: re-applied the stripe renames to `band_N_Base` and `band_N_Shade`. That's 42 layers, including the side armband, and all 13 band groups were checked consistent.
  - User decisions:
    - Keep the tuft as drawn at every angle.
    - Side-on, the far limbs reuse the near shapes, behind the body and darker.
  - Plan: added Task 4b.
    - Re-import with Side.
    - The rig takes joint depth from the side drawing.
    - Corrections make 0°, ±30°, ±90° and 180° exact.
    - Limb tubes blend between neighbouring drawings, resampled to a shared arclength parameter.
    - Rigid parts and feet come from the nearer drawing.
    - Task 5's face now blends the drawn faces.
  - `clutch-mascot/CLAUDE.md` gained the Side view, its layer order, the far-limb rule, hair as drawn, and the near-arm tuck for Side.
- Alternatives rejected: The computed hair fan. The tuft as drawn replaces it at every angle.
- State/output mapping: None; no code changed.
- Verification: Figma names re-checked by a script. No code changed.
- Risks: None recorded; no code changed.

### Iteration 11 — Side view, real depth and blending between drawings (Task 4b)

- Change ID: clutch-mascot-v2-side
- Request: "Start Task 4b".
- Task type: Re-import with the side view, rig depth from the side drawing, and art blended between drawings (Task 4b of the V2 rebuild).
- User-visible result: None in the app yet; it still draws V1.
- Source/reference checked: The Figma `Side` group, re-imported into `mascot-v2-parts.ts`.
- Reference inputs: None; `referenceInputs` stays `[]`.
- Docs/contracts read: The plan's Task 4b.
- Contract rules applied: The Side rules from Iteration 10: the far limbs reuse the near shapes, and the hair keeps the drawn tuft.
- View interaction intent: `orbit` (unchanged).
- Interaction ownership: Unchanged: panel for pose and styling, canvas gimbal for the view.
- Decision:
  - Joint depth: z is the side drawing's x. Where the side and front drawings give a bone different heights, the depth is scaled to the front's (V1 `bone3D`). Far joints share their near twin's depth.
  - At ±90° the far limbs land exactly behind the near ones (user: "Reuse the near shapes").
  - The art comes from the two nearest drawn views:
    - Tubes resample to 200 (limb) or 120 (strand) samples and blend with the same smoothstep weight as the corrections.
    - Hands and armbands come from the nearer drawing.
    - Feet come from the nearer drawing too, scaled horizontally by `toeAt`, which eases between drawn toe directions with at least 0.45 of the length.
  - Hair keeps the drawn tuft (user: "Keep the tuft as drawn").
  - V2 Wave is scaled by 0.4.
  - Owners changed:
    - Re-imported `mascot-v2-parts.ts` with the `Side` group. Views may be `nearOnly`, and their parts and pivots are now optional. The importer in `docs/mascot-v2-import.md` was updated to match.
    - New `src/app/mascot/mascot-v2-art.ts`: `artBlendAt`, `artSideFor`, `limbArtAt`/`limbArtFrom`, `toeAt`, `strandArtAt`, `strandOrderAt`, `viewPart`, `viewPivot` and `centreOf`.
    - Rewrote `mascot-v2-rig.ts`:
      - depth comes from the side drawing
      - the corrections are exact at 0°, ±30°, ±90° and 180°
      - the hair spread is gone, and `turnHairPoint` now just rides Hair_base
    - `mascot-v2-pose.ts` takes its art from the turn: rigid pieces are placed from their own drawing's frame, and the toe eases between drawn directions. The `art` and `footScale` inputs were removed.
    - `mascot-v2-hair.ts`: blended strand art, plus `MASCOT_V2_WAVE_SCALE = 0.4`.
    - `mascot-tube.ts`:
      - `resampleTube`, which puts the left edge first so mirrored drawings blend
      - `blendTubes`
      - `untangleMidline`
      - `relaxMidline` now measures curvature across about 2 px
    - All V2 tests updated.
- Alternatives rejected: V1's Wave at full size. V2 strands are 11 to 16 px thick, and V1's 20 to 30 px ripple looped them.
- State/output mapping: None in the app yet. The turn picks the two nearest drawn views: blended tubes for limbs and strands, and hands, armbands and feet from the nearer one, into `mascot-v2-pose.ts` and `mascot-v2-hair.ts`.
- Verification: The mascot Vitest suite (284 passed), `tsc` and `files:check` passed; `ai:check` passes for the new files; a hair sweep and a turntable render. Details:
  - `npx vitest run src/app/mascot/` passed 284 tests, including:
    - exact rest at all six drawn angles, with only the front right arm refitted to the left
    - side-on, the far limbs sit exactly behind the near ones
    - limb centrelines move less than 8 px per degree across a full turn
    - the rig is exact at all six anchors and takes its depth from the side drawing
    - the side view's tubes rebuild within 1 px
    - no hair folds at 60° or 135°
  - A 4,050-pose hair sweep found 26 extreme bend, sweep and wave combinations that genuinely loop.
  - `npx tsc` passed.
  - `npm run ai:check` passes for the new files. The DOM heuristic flagged an inline cache initialiser and the body-pivot initialiser, and both became named helpers. The 38 old findings in `mascot-svg-export.ts` remain.
  - Turntable at `.toolcraft/browser-artifacts/v2-turntable.png`, and `npm run files:check` passed.
- Risks:
  - At 60° the top strand passes through straight, because the 3/4 and side drawings curl it opposite ways.
  - Hands and armbands switch drawings halfway between views (small shape change).
  - The toe flips sign where the drawings disagree (front to 3/4), as V1 did.
  - About 0.6% of extreme hair combinations loop.
  - Carried to Task 5: the near-arm shoulder tuck (3/4 and side), the face blend, layering, and tubes seen nearly end-on.

### Iteration 12 — The V2 scene and the turn (Task 5)

- Change ID: clutch-mascot-v2-scene
- Request: "Start Task 5".
- Task type: The V2 scene builder, its face and its layering (Task 5 of the V2 rebuild).
- User-visible result: None in the app yet; it still draws V1. The V2 scene shows in tests and a visual check render.
- Source/reference checked: The V2 drawings: their layer order, the front, 3/4 and side faces, and the far limbs' drawn colours at 0°, ±30° and 180°.
- Reference inputs: None; `referenceInputs` stays `[]`.
- Docs/contracts read: The plan's Task 5.
- Contract rules applied: One shared scene: the V2 mascot is built as the same `MascotScene` that the preview, raster and SVG export already draw.
- View interaction intent: `orbit` (unchanged).
- Interaction ownership: Unchanged: panel for pose and styling, canvas gimbal for the view.
- Decision:
  - The relative yaw is the character's turn plus the camera's orbit yaw. It picks the drawings, turns the rig and orders the layers. The light belongs to the world: orbiting the camera moves it on screen (`screenLightAngle`), and turning the character doesn't.
  - Paint order, back to front:
    - legs, far first
    - arms behind the body
    - hair, head, face (clipped to the head), headband
    - arms that have come toward the camera (more than 15 px of depth): the near arm at 3/4 and side, as drawn
  - The near arm's outline starts 18 px down from the shoulder, so the arm grows out of the body without a line across it.
  - Face:
    - The eyes and mouth glide between the front, 3/4 and side drawings, and the shapes come from the nearer drawing.
    - Turning left mirrors the 3/4 and side faces. The front face is never mirrored, so nothing flips at 0°.
    - In profile the far eye slides behind the head's edge and is clipped, and from 135° on the face is hidden.
    - Other expressions use the V1 shapes, centred where the drawn eyes and mouth are.
    - The mouth's soft gradient shadow waits for gradient paint in Task 7.
  - The far limbs darken smoothly with the turn, not by a depth cutoff. They keep the body colour at 0°, ±30° and 180°, as drawn there, and reach the shade colour #C94631 side-on.
  - Shading is base colours, outlines and creases only until Task 6 re-lights it.
  - Deviation from the plan: the app still draws V1. The switch to `buildMascotV2Scene` moves to Task 8, together with the new controls and the settings migration.
  - Owners changed:
    - New `src/app/mascot/mascot-v2-scene.ts`, with `buildMascotV2Scene`, `screenLightAngle`, `limbBaseColor` and `mixHex`.
    - New `src/app/mascot/mascot-v2-face.ts`, with `faceAt(yaw, eyes, mouth)`.
    - New `src/app/mascot/mascot-scene-layers.ts`, which holds the layer helpers shared by the V1 and V2 scenes (`toLayer`, `recolor`, `ellipsePath`, `sceneBounds` and others). `mascot-scene.ts` now imports them, and V1's behaviour is unchanged.
    - New `src/app/mascot/mascot-v2-scene.test.ts` (10 tests).
- Alternatives rejected:
  - A depth cutoff for the far limbs' colour. A first version used one, and the far arm jumped to dark at about 14° and was wrongly dark in the 3/4 view. The preview render caught it.
  - Switching the app now. It would leave the old shading controls doing nothing and break their acceptance rows.
- State/output mapping: Character turn + camera orbit yaw → relative yaw → drawings, rig and paint order → `buildMascotV2Scene` → `MascotScene`. The world light → `screenLightAngle`. The app doesn't call it yet.
- Verification: The mascot Vitest suite (294 passed), `tsc` and `files:check` passed; `ai:check` shows only the 38 old findings; a visual check render. Details:
  - `npx vitest run src/app/mascot/` passed 294 tests. The new scene tests check:
    - the scene builds at every 15°, and the feet stand on the floor line (Lift raises them)
    - arm layering at 0°, 30°, 90° and −90°
    - far-limb colours: drawn colours at 0°, ±30° and 180°, the shade colour side-on, and no step bigger than 5 per channel per degree
    - the face lands exactly on the front drawing, is clipped to the head, and is hidden at 180°
    - the other expressions are centred
    - the shoulder tuck at 30° and 90°
    - turning and orbiting give the same mascot but a different cast shadow
    - every V2 control changes the picture
  - `npx tsc` passed. `npm run ai:check` shows only the 38 old findings in `mascot-svg-export.ts`. `npm run files:check` passed.
  - Visual check at `.toolcraft/browser-artifacts/v2-scene-check.png`: turns 0°, 15°, 30°, 60°, 90°, 135°, 180° and −45° (blink and sad), plus cash jump, a walk at 90°, a thumbs-up, and a 30° camera orbit.
- Risks:
  - The top hair strand still passes through straight at 60° and 135° (see Iteration 11).
  - In back-quarter views the toe direction is between drawings, so the far foot is short.
  - A near arm lying over the body shows its edges there, as the side drawing does. Only the shoulder end is tucked.

### Iteration 13 — Re-lighting (Task 6)

- Change ID: clutch-mascot-v2-relight
- Request: "Start Task 6", then "Try again" after the turn stopped mid-way.
- Task type: Re-lighting in code for the V2 scene (Task 6 of the V2 rebuild).
- User-visible result: None in the app yet; it draws V1 until Task 8. In the V2 scene, shade and highlights are re-lit in code in place of the drawn Shade and Highlight layers.
- Source/reference checked: The drawn shade layers of the V2 parts, measured to find the drawing's light (see Decision).
- Reference inputs: None; `referenceInputs` stays `[]`.
- Docs/contracts read: The plan's Task 6.
- Contract rules applied: Mascot Lab re-lights every part in code, and the far limbs side-on go one step darker.
- View interaction intent: `orbit` (unchanged).
- Interaction ownership: Unchanged: panel for pose and styling, canvas gimbal for the view.
- Decision:
  - The drawing's light was measured. Re-creating each drawn shade layer as "the base minus a copy nudged toward the light" fits at 90–100% overlap. The fit gives:
    - a light from 160° (the left, a little above), leaning 18.4° toward the viewer (tan = 1/3)
    - with that one light, tubes shaded across their own thickness land exactly on the drawn widths: 4 px on the vertical legs and arms, 1 to 2 px under the feet
  - The light is fixed in the world. Orbiting the camera turns it like the character's turn, so the shading and cast shadow move. Turning the character doesn't move it.
  - Rigid parts use the crescent method, with their rounding (radii across and along an axis) fitted to the drawing:
    - head 12/3, Headband 12/0, ArmBands 2/0, hands (open, fist and thumbs-up) 3/3, feet 3.5/2.5, money bag 4.5/2
    - Each part's axis comes from the pose: the body's upright for the head and Headband, the forearm for hands and ArmBands, ankle to foot, hand to bag.
    - Headband and ArmBand stripes are shaded as one band, with no shade line between stripes.
  - Hair strands are shaded like arches lit from above: the inside of each main curl (judged from a fifth of the way along to near the tip) is in shade, more as the light rises, and the outside when it comes from below.
  - Highlights:
    - Tubes get a stroke on the lit side, over the stretch where it was drawn, and at its drawn distance from the middle under the drawn light.
    - Rigid parts keep their drawn strokes, mirrored across the part's axis when the light crosses, and shrunk through square-on.
  - With the light behind (after orbiting), parts darken toward the shade colour and highlights fade (`backlightWash`).
  - Far limbs side-on go one step darker on all three layers: base to #C94631, shade to #972F20, highlight to #FD5D44.
  - Owners changed:
    - New `src/app/mascot/mascot-relight.ts`, which exports:
      - the light: `cameraLight`, `lightAzimuth`, `terminatorShare` and `backlightWash`
      - shading: `crescentShift`, `highlightMap`, `shadeTube` and `shadeStrand`
      - drawn highlights and palettes: `limbHighlights`, `strandHighlights`, `litPalette`, `darkerBody` and `mixHex` (moved here from the scene)
      - constants: `MASCOT_V2_DRAWN_LIGHT_ANGLE` = 160 and `MASCOT_V2_RIM_RADII`
    - New `src/app/mascot/mascot-relight.test.ts` (7 tests).
    - `mascot-v2-scene.ts` now draws re-lit shading in place of the drawn Shade and Highlight layers:
      - `pushPiece` re-lights the rigid parts, and `pushTubeShading` the limbs and strands.
      - `limbPalette` replaces `limbBaseColor`.
      - `screenLightAngle` now comes from `cameraLight`.
      - Limb and strand outlines are drawn under the base, as in the drawing.
- Alternatives rejected:
  - Assuming the light's direction. It was measured from the drawing instead.
  - A 160° light alone on the hair. It would have shaded the strands' sides; the drawing shades the inside of every curl.
- State/output mapping: Camera orbit → `cameraLight` (fixed in the world, 160° drawn default) → `screenLightAngle`, `pushPiece` for rigid parts and `pushTubeShading` for limbs and strands → re-lit shade and highlight layers in the `MascotScene`.
- Verification: The mascot Vitest suite (301 passed), `tsc` and `files:check` passed; `ai:check` shows only the 38 old findings; two renders; no browser check until Task 8. Details:
  - Deviation from the plan: there is no browser check yet, because the app draws V1 until Task 8. Instead, the drawn-shade match is a unit test, plus the renders below.
  - `npx vitest run src/app/mascot/` passed 301 tests. The new tests check:
    - the light is a unit vector, the 160° default is exact, and orbiting 180° flips it to the other side and behind
    - `terminatorShare` is odd, bounded and continuous
    - at 160° the re-lit shade overlaps the drawn shade at least: head 85%, Headband 95%, legs 95%, arms 85%, hand 90%, ArmBands 75–85%, feet 65%, money bag 80%, strands 70%
    - rigid shade sits away from the light at every 5° of light, for four orbits and twelve axes, and never moves more than 4 px per 5°
    - every posed limb, at turns −180 to 180 and light angles 0 to 330, shades only the edge turned away from the light
    - hair shade flips from the inside to the outside of the curls when the light goes below
    - highlights mirror and shrink as described
  - Turning versus orbiting now gives the same silhouette but different shading and cast shadow.
  - `npx tsc` passed. `npm run files:check` passed. `npm run ai:check` shows only the 38 old findings in `mascot-svg-export.ts`. It had crashed on a `--` applied to a counter it knew to be 0, in the test's point-in-polygon helper, and that helper now counts crossings up and down separately.
  - Renders in `.toolcraft/browser-artifacts`:
    - `v2-relight-closeup.png`: Figma shading next to the re-lit version at 160°
    - `v2-relight-check.png`: light from 90°, 20° and 250°; turns 30°, 90° and 180°; orbits 45° and −60°; cash jump; a walk
- Risks:
  - In the default front view, the right arm's flat shoulder end shows about 3 px outside the head's edge:
    - Both arms use the left arm's joints, so the right shoulder sits at x = 69.5 instead of the drawn 65.5.
    - The drawn right tube's root then lands 3 px further out, where the head is narrowing.
    - The shade band makes this rig issue visible. It was already faint in Iteration 12.
  - The two drawn feet are shaded differently, so neither matches exactly (about 70% overlap each).
  - The head and money bag carry a thin bottom shade (about 1 px at 160°) that the drawing doesn't have, so that light from above still shades them.
  - With the light behind, a part's shade swings across it over about 10° of light angle. The back-light darkening hides most of this.
  - The mouth's gradient shadow still waits for Task 7.

### Iteration 14 — Money bags, the right shoulder, the turned face and the light behind

- Change ID: clutch-mascot-v2-cash-face
- Request: "The way you've drawn the character holding the money bags is kind of wrong. I've attached an image to guide you on how to actually draw this character with the money bags, especially the arms. ... And also fix the right arm shoulder end before task 7. Also orbit-60 (light behind) looks weird, the face and the eyes are skewed and i don't think it looks accurate at all, do it better". The attachment is a larger copy of `clutch-mascot/refs/holding_cash.png`.
- Task type: Fixes to the V2 money bag hold and cash jump pose, the right shoulder, the turned face and the light behind, before Task 7.
- User-visible result: None in the app yet; it still draws V1. In the V2 scene and renders:
  - The fists close round the bag necks, and a new cash jump pose follows the reference.
  - No cut end shows at the right shoulder.
  - The far eye goes round the head when turned, and the mouth blends between drawings.
  - With the light behind, parts get a lit rim and the cast shadow falls forward.
- Source/reference checked: `clutch-mascot/refs/holding_cash.png`. Landmarks were read off it for the cash jump.
- Reference inputs: None; `refs/holding_cash.png` is a still picture, so `referenceInputs` stays `[]`.
- Docs/contracts read: `clutch-mascot/CLAUDE.md` (the rule against morphing between expressions).
- Contract rules applied: The mouth blend is the same expression seen from another angle, so the rule against morphing between expressions doesn't apply.
- View interaction intent: `orbit` (unchanged).
- Interaction ownership: Unchanged: panel for pose and styling, canvas gimbal for the view.
- Decision:
  - The cash jump is fitted to landmarks read off the reference, scaled so its body is as wide as the V2 head:
    - arms: raise 112, bend 27, twist 90, straighten 0.5, length 1.25 (the reference's arms reach further than the V2 drawing's), Softness 40
    - fists: closed on the bag necks
    - legs: raise 34 (about 38.5° hip to ankle on both sides, as in the reference), ankle −8
    - lift 40, satisfied face
    - The arm stays within 5 px of the reference's centreline, and the fist within 4 px.
  - Right shoulder: both arms use the left arm's joints, so the right root sat about 3 px outside the head where it narrows. Running back limbs on into the body hides the cut. The near arm at 3/4 and side keeps its tucked shoulder.
  - Owners changed:
    - `mascot-v2-pose.ts`:
      - The fist closes round the bag's neck (`bagNeck`: the narrowest point under the tie), not its tip, and the bag hangs swung 25° outward (was 20°).
      - Softness now spreads even a gentle bend over at least that many px either side of the joint (rubber hose). Bends of 90° and more keep their old rounding.
    - New `mascot-v2-poses.ts`: `MASCOT_V2_CASH_JUMP`, fitted to the reference. It becomes a preset in Task 8.
    - `mascot-v2-face.ts`, rewritten:
      - It fixes a Task 5 bug: past 60° the far eye borrowed the side drawing's eye but kept its off-edge anchor, so it landed on the near eye.
      - Past 3/4 the far eye now carries on round the head (one degree round per degree of turn), narrowing by the cosine until it is gone before the side view.
      - The mouth blends between the front, 3/4 and side mouths (resampled to 32 points).
      - Eye sizes ease between the drawings.
    - `mascot-relight.ts`:
      - `tubeShare`: a tube's true terminator, so with the light behind the shade covers more than half and leaves a lit rim.
      - `rimShare` and `rimBand`: a lit rim band along a rigid part's edges facing the light.
      - Hair blends toward the tube behaviour as the light goes behind.
    - `mascot-v2-scene.ts`:
      - Limbs behind the body run 22 px on into it at the root (`MASCOT_V2_ROOT_RUN_IN`), so no cut end shows.
      - Rigid parts get the rim band with the light behind, and tubes keep their undarkened base (their cross-section does the shading).
      - The cast shadow falls away from the light's actual direction, so a light behind throws it forward.
      - `screenLightAngle` was removed (tests use `lightAzimuth(cameraLight(...))`).
    - Tests: new `mascot-v2-poses.test.ts` and `mascot-v2-face.test.ts`, with additions to the pose, re-lighting and scene tests.
- Alternatives rejected:
  - Moving a joint to fix the right shoulder. Running the back limbs on into the body hides the cut without moving any joint.
  - Switching mouths at 60°. The mouth now blends instead.
- State/output mapping: `MASCOT_V2_CASH_JUMP` → `poseV2Limb` (fists on `bagNeck`) → `buildMascotV2Scene`; the turn → `faceAt` (far eye round the head, blended mouth); the camera light → `tubeShare`, `rimShare`/`rimBand` and the cast shadow's direction.
- Verification: The mascot Vitest suite (311 passed), `tsc` and `files:check` passed; `ai:check` shows only the 38 old findings; three renders. Details:
  - `npx vitest run src/app/mascot/` passed 311 tests. The new tests check:
    - the bag neck is in the fist, the tie shows above it, and the bag hangs about 25° outward on each side
    - Softness spreads a gentle bend
    - the cash jump matches the reference's arm, fist and legs, and the sides mirror
    - the face is exact at 0°, 30° and 90°; the far eye never overlaps the near one from −135° to 135°, narrows past 3/4 and is gone by 80°; the mouth moves at most 3 px per degree
    - with the light behind, tubes shade more than half and rigid parts get a rim on the light side
    - no back-limb root shows outside the head or Headband at 0°, ±30° and 180°
    - the cast shadow goes back with the light in front and forward with it behind
  - `npx tsc` passed. `npm run files:check` passed. `npm run ai:check` shows only the 38 old findings in `mascot-svg-export.ts`. The DOM heuristic flagged `Array.from({ length })` in the face module, which became a plain loop.
  - Renders in `.toolcraft/browser-artifacts`:
    - `v2-cash-jump-check.png`: the reference, the V2 pose, the two overlaid, and the pose turned 30°
    - `v2-face-strip.png`: the face across turns, and orbits with the light going behind
    - `v2-shoulder-check.png`: both shoulders
- Risks:
  - The cash jump stretches the arms to 1.25 to reach the reference's fists.
  - The far eye leaves round the head while the near eye keeps the designer's drawn spots, so between 30° and 90° the near eye moves less than a strict cylinder would.
  - Long forward shadows with the light low behind.
  - The top hair strand still passes straight up at 60° and 135°.

### Iteration 15 — Very soft joints, and paint and renderers (Task 7)

- Change ID: clutch-mascot-v2-paint
- Request: "The bend in the elbow is too sharp. Ideally, it should be softer. Let's not forget that our character has very, very soft joints and pivots." and "view my response then proceed with task 7".
- Task type: Rig behaviour change, plus renderer and export work (paint model, live SVG preview, Canvas 2D export, SVG export).
- User-visible result: Elbows and knees bend as one long rubber-hose curve along the limb, not two pieces with a rounded corner. The mouth has its soft gradient shadow. SVG exports group the mascot into the Figma part names (Leg_L > leg_L, foot_L; Arm_L > arm_L, hand_fist_L, armband_L, moneybag_L; Body > strand_1–5, head, face; Headband > headband). The app still shows V1 until Task 8, so this shows in tests and renders for now.
- Source/reference checked: The V2 art in `mascot-v2-parts.ts` (Figma `146:1816`): the `mouth_happy` shadow stroke is a linear gradient (`#031E19` from 0.8 to 0.05 alpha) at 20% opacity in the front, 3/4 and side views. The cash jump was refitted against `clutch-mascot/refs/holding_cash.png`.
- Reference inputs: None. The Figma art and `refs/holding_cash.png` are static references; `referenceInputs` stays `[]`.
- Docs/contracts read: `docs/toolcraft/core/setup-export.md` (SVG Export), `src/toolcraft/runtime/export/svg-policy.ts` (allowed elements: `linearGradient`/`stop` are allowed, and local `url(#id)` references are accepted), the plan's Task 7.
- Contract rules applied: One shared `MascotScene` feeds preview, raster, SVG and scene bounds. The SVG renderer appends namespace-aware nodes only to the supplied group. There is no `image`, `foreignObject`, script or external `url()`. The SVG preview stays, so there is no render-scale work.
- View interaction intent: Unchanged (`view.orbit` gizmo; the planned `body.turn` slider arrives in Task 8).
- Interaction ownership: Unchanged. The panel owns pose and shading edits, and the canvas gizmo owns the camera orbit.
- Decision:
  - Softness now spreads every bend over at least 3 × Softness px either side of the joint (`HOSE_REACH`), across up to 90% of the shorter bone (`FILLET_SHARE`, was 45%). The default bends a limb along nearly its whole length.
  - Paint gains an optional linear gradient (world space), and shapes an optional opacity and a V2 part name.
  - New `mascot-svg-tree.ts` builds the scene as a flat SVG node list (each node with its depth) shared by the React preview and SVG export:
    - defs hold clip paths, blur filters and gradients
    - one group per layer
    - the mascot's shapes are grouped by Figma part
  - `mascot-svg-export.ts` is a short appender over it. The preview renders the same nodes as explicit JSX per element, and Canvas 2D export draws gradients with `createLinearGradient` and shape opacity with `globalAlpha`.
- Alternatives rejected:
  - Keeping the elbow-only fillet with a higher default Softness: it still leaves straight bones with a rounded corner.
  - A recursive SVG node type: it sends the code-health checker's type walker into infinite recursion.
  - Building the preview with `React.createElement` or spreading attribute records: both are rejected by the product boundary checks.
  - Scene-level gradient definitions referenced by id: the canvas renderer would then need a lookup for what is per-shape data.
- State/output mapping: Schema values → `readMascotSettings` → scene (`buildMascotV2Scene` once Task 8 switches over) → `mascotSvgTree` → `MascotPreview` (JSX) and `appendMascotSceneVectors` (SVG export), and the same scene → `drawMascotScene` (PNG/JPG/video). Part names come from shape ids in `partOf`; the visible hand is named after the pose's hand.
- Verification: the mascot unit tests (317 passed), `tsc` and `files:check` passed; `ai:check` failed only on the two contract-required SVG export calls. Details:
  - `npx vitest run src/app/mascot/` passed 317 tests. New `mascot-svg-tree.test.ts` checks:
    - the mouth shadow is exact at the front (opacity, gradient end points and stops), absent for other mouths, and moves smoothly when turning
    - gradients and opacity are in the SVG, and every `url(#…)` resolves
    - part groups are named and unique
    - the export appends the same nodes, nested and namespaced
    - canvas paints the gradient stops and 0.2 opacity, with save/restore balanced
    - a V1 scene's SVG is unchanged
  - The existing pose tests (no folds, gentle-bend spread) and the cash jump fit (within 5 px of the reference arm, fist within 4 px) pass with the softer joints.
  - `npx tsc` passed. `npm run files:check` passed.
  - `npm run ai:check` findings in the SVG export went from 38 to 2: `createElementNS` and `setAttribute`, which the SVG export contract itself requires.
  - Renders in `.toolcraft/browser-artifacts`: `v2-soft-joints.png`, `v2-cash-jump-check.png`, `v2-mouth-shadow.png`, `v2-svg-export-check.png`.
- Risks:
  - Risk: `ai:check` still fails on the two SVG export calls the contract requires, until the framework reconciles the two (see Risks below).
  - Risk: the full `src/app` run has three failures that predate this change:
    - `app-schema.test.ts` (the schema has `defaultMode: "infinite"`)
    - `app-acceptance.base-coverage.test.ts` (Infinity overflow not registered by the content pass; also noted in Iteration 1)
    - `app-acceptance.product-worklog.test.ts`: Iterations 5–14 lack the required fields. Iteration 5 predates the V2 rebuild, and 6–14 are mine. Task 9 reformats them.
  - Risk: very soft joints round big bends more, so a 120° elbow reads as a loop rather than a hinge. Softness lowers it.

### Iteration 16 — Bent limbs keep their length, and the app switches to V2 (Task 8)

- Change ID: clutch-mascot-v2-controls
- Request: "In the images you shared, for some reason, when you bend the elbows, the arms seem way shorter. I hope there are controls to also adjust the length of the arms, but more importantly, ensure that even when the elbows are bent, the arms still look proportional in length to the legs. Right now, they look extremely short when you bend them." and "start task 8 too".
- Task type: Rig behaviour fix, then the product switch to V2: schema controls, presets, saved defaults, acceptance data, and deleting the V1 modules.
- User-visible result:
  - A bent arm or leg keeps its length, so bent arms stay in proportion with the legs.
  - The app now draws the V2 Clutchman.
  - New controls:
    - Body Turn turns him in place under a fixed light.
    - Each arm gets Hand (Open, Fist, Thumb up) and Money bag.
    - Body Shading gets Size and Highlight.
    - Light covers 0–360°, defaulting to the drawn 160°.
  - Pose presets: Stand, Walk (side-on contact pose) and Cash jump.
  - Each arm and leg already had a Length control (50–160%).
- Source/reference checked: Measured on screen:
  - The rounded joint cut up to a quarter of a bent limb's length: a leg at 120° and Softness 40 dropped from 185 px to 138 px.
  - The elbow hinged on the upper arm. Because the drawn elbow sits 23 px behind the shoulder, a Twist 90 bend tipped the forearm about 40° toward the camera, which took another 15% off on screen.
  - The Walk numbers are V1's Walking swings (Figma `82:7560`), read before the V1 parts were deleted. The Cash jump is `MASCOT_V2_CASH_JUMP`, fitted to `clutch-mascot/refs/holding_cash.png`.
- Reference inputs: None; `referenceInputs` stays `[]`.
- Docs/contracts read:
  - `docs/toolcraft/authored-state-migration.md`, `docs/toolcraft/vector-controls.md`, `docs/toolcraft/core/control-selection.md` (Vector Ownership, complementary operations) and `docs/toolcraft/component-rules.md` (Canvas Handles).
  - In the runtime: `schema/app-defaults.ts` and `composition/workspace-defaults.ts` (strict round-trip of saved defaults), `state/persistence-reader-values.ts` and `react/app-shell/settings-transfer.ts` (both skip value ids the app doesn't know).
  - The plan's Task 8.
- Contract rules applied:
  - One operation per surface: the canvas owns `orbit-view` (`direct-spatial-edit`) and the panel owns `turn-character` (`property-edit`). The capabilities differ, so the two are complementary, not duplicates.
  - Saved defaults round-trip exactly.
  - Sliders that are multipliers carry no unit.
  - Adjacent short switches for one entity share an inline row.
- View interaction intent: `orbit` (unchanged). `view.orbit` moves the camera, and with it the world's light, cast shadow and floor. `body.turn` turns only the character.
- Interaction ownership: `orbit-view` is canvas-owned (gizmo and mascot drag, `view.orbit`). `turn-character` is panel-owned (the `body.turn` slider, keyframeable), with the user's quote "keep the slider for horizontal turning and … the canvas drag plus gizmo … they serve two different functions" as evidence.
- Decision:
  - Limb length, in `mascot-v2-pose.ts`:
    - The forearm or shin turns from its own rest direction toward the bend direction.
    - When the pose bends a limb, the bones grow until the rounded limb is as long on screen as it was before the rounding cut the corner. Only the corner the pose adds counts; rounding the drawing's own elbow curve does not.
    - The rounding eases in over the first 10° of bend, so a bend starting from rest doesn't jump.
  - The app builds `buildMascotV2Scene`. `mascot-scene.ts` is now the mapping from settings to the V2 input.
  - New targets: `body.turn`, `armLeft.hand` / `armRight.hand`, `armLeft.moneyBag` / `armRight.moneyBag`, `shading.size` and `shading.highlight`.
  - Removed: `shading.style`, `shading.color`, `shading.limbs`, `shading.depth` and `shading.width`.
  - `light.angle` keeps its meaning, widened to 0–360° with the default 160°.
  - Shading Visible off leaves the flat drawn colours. The far limbs still go darker side-on.
  - Presets: Stand resets the pose, the turn, hands, money bags and lift, and shows the happy face. Walk sets the turn to ±90° (keeping the facing) at the contact pose. Cash jump applies `MASCOT_V2_CASH_JUMP` with the satisfied face and Softness 40.
  - `app-defaults.json` was rewritten canonically. Light became 160° and Size 1; every other saved value, range and panel stays as it was.
  - Deleted `mascot-limbs.ts`, `mascot-rig-constants.ts`, `mascot-figma-parts.ts` and the V1 scene builder. `mascot-v1-faces.ts` stays.
- Alternatives rejected:
  - **Repurposing `shading.width` with an `authoredStateMigration` that halves it.** The runtime takes the migration only as a function on the product definition, and the protected meta-test `app-acceptance.base-coverage.test.ts` runs `structuredClone(appSchema)`, which can't clone a function. A new id needs no migration: the persistence and settings readers skip unknown ids. V1's outline width has no V2 meaning, so dropping it is more faithful than halving it.
  - **The `body.pivot` vector pad, for now.** Its required `vector-screen-motion` proof needs a visible feature that moves with each drag. A pivot shows nothing until there is a lean or squash, and even then the body moves across the drag, not along it. It needs a visible pivot marker first; left to the user.
  - **Compensating only at the hinge, or measuring against the straight bones.** It counted the drawing's own elbow curve and moved the right arm's wrist 1.8 px at rest.
- State/output mapping: Schema values → `readMascotSettings` → `mascotSceneInput` (elbow and knee to bend, wrist and ankle to end, `body.turn` to the turn, `shading`) → `buildMascotV2Scene` → `MascotScene` → preview, PNG/JPG/video, SVG and scene bounds.
- Verification: the mascot unit tests (321 passed), the full app suite (1030 passed, 3 failures from before the rebuild), `typecheck` and `files:check` passed, `ai:check` failed only on the two SVG export calls, and a browser check and a render. Details:
  - `npx vitest run src/app/mascot/` passed 321 tests in 12 files (with the rewritten presets and view tests).
  - New pose test: bent arms and legs stay within 2.5% of their drawn length at 30–120° and Softness 0, 18 and 40. A bend from rest moves the hand under 1 px per 0.5°.
  - New `mascot-view.test.ts`:
    - the defaults
    - Body Turn against the gimbal at 30°, 90°, −60° and 150°: the same limbs (within 0.01 px) but different shading and cast shadow
    - the feet on the floor at every turn
    - the shading switches and Size
    - hands and money bags
  - New `mascot-pose-presets.test.ts`: Walk's contact pose and facing, Stand after Cash jump returning the default scene, and Cash jump matching `MASCOT_V2_CASH_JUMP` exactly.
  - The cash jump still fits the reference: the arm within 5 px, the fist within 4 px.
  - `npm run typecheck` and `npm run files:check` passed. `npm run ai:check` shows only the two SVG export findings from Iteration 15.
  - `npx vitest run src/app`: 1030 passed and 3 failed, all from before the rebuild: `app-schema.test.ts`, the base-coverage Infinity overflow row and the worklog format check (Iterations 5–14). The `pipeline-integration` test, which only times out in parallel runs, passed this time.
  - Browser: the app loads the V2 mascot with the new Body controls, and Cash jump applies and undoes. Render: `.toolcraft/browser-artifacts/v2-limb-length.png`.
  - Scene build time is unchanged: 12–15 ms with or without the length fix.
- Risks:
  - Risk: a saved local workspace from V1 keeps its own light angle (for example 30°) and loses its outline width. Reset restores the defaults.
  - Risk: `e2e/product-mascot.spec.ts` still expects V1's Walk (gimbal to the side). Task 9 rewrites the browser specs.
  - Risk: bones grow to keep a bent limb's length, so a strongly bent limb reaches further than its straight bones would.

### Iteration 17 — Body pivot marker and pad; money bag creases recoloured

- Change ID: clutch-mascot-v2-pivot
- Request: "Add pivot marker" (the user's answer to "Add a visible pivot marker so the body pivot pad can ship?"), and, during the change: "you're using the wrong color variable for the creases on the money bag. Enumerate the frame … again to see the actual proper color. the color is C69300(Color/Warning/600)".
- Task type: A new spatial control with a preview-only guide, and an art data fix.
- User-visible result:
  - A Body Pivot section right after Body holds a Position pad. It moves the point Body Lean turns and Squash stretches the body around.
  - The preview marks the pivot with a white dot with a blue centre. PNG, JPG, SVG and video leave it out.
  - All eight money bag creases are now #C69300 (Color/Warning/600). Only the $ sign stays #5C4300 (Color/Warning/800).
- Source/reference checked:
  - Figma `170:2155` (Money Bag), read through the Figma MCP server: its variables are Color/Warning/800 #5C4300 and Color/Warning/600 #C69300. Its SVG has the five filled creases, the three stroked creases and the shade in #C69300, and only the $ sign (inside `money_bag-base`) in #5C4300. The imported data still had the five filled creases in #5C4300.
  - The head outline is 157 px wide and 160 px tall, with the default pivot at its bottom centre, which sets the pad's reach.
- Reference inputs: None; `referenceInputs` stays `[]`.
- Docs/contracts read:
  - `docs/toolcraft/vector-controls.md` (screen meaning, required proof) and `docs/toolcraft/core/control-selection.md` (Vector ownership).
  - The protected `e2e/browser-vector-screen-motion.ts` and `e2e/browser-vector-marker.ts`: a uniquely coloured, compact feature of at least 16 px, inside a product surface that stays fixed and fully on screen.
  - In the runtime: `schema/controls-panel-section-layout.ts` (a pad gets its own block) and `ui/components/controls/vector/vector-pad-field.tsx` (a press sets the point under the pointer; values arrive as fixed-point strings).
- Contract rules applied:
  - A drag right, left, down or up moves the visible feature the same way on screen. The value stays canonical (`{ x, y }`, -1 to 1, screen coordinates) and is turned into rig px once, in `mascotSceneInput`.
  - The tracked feature is a real product feature: the pivot marker is the editing guide the pad moves, drawn from the same scene build as the lean.
  - A pad renders in its own block, so it has its own authored section with a stable id rather than a runtime-split `.part-` id.
- View interaction intent: `orbit` (unchanged).
- Interaction ownership: Panel. `body.pivot` is a stable, user-authored, keyframeable property (`direct-authored` in the Vector ownership rules); no canvas handle drags it.
- Decision:
  - `body.pivot` is read by `readVector` (numbers or the pad's strings, clamped to -1..1). `MASCOT_BODY_PIVOT_REACH_PX = 160` maps the pad's edge to 160 drawing px from the bottom centre of the body, scaled by View Scale: up to the top of the head, down to the feet, a head's width to each side.
  - The scene returns `pivot` in world space. Only `mascot-preview.tsx` draws it, as `MASCOT_PIVOT_MARKER`: a white disc (11 world px, soft #031E19 edge) with a #0D99FF centre (6 world px). It takes no pointer input and sits under the orbit surface. Scene bounds, the SVG tree and the canvas renderer ignore it.
  - The section is `body-pivot`, titled Body Pivot, with the pad labelled Position. Its inventory entry explains why it stands apart.
  - No preset touches the pivot: Stand and Walk leave Lean alone, and Cash jump's lean is 0.
  - `app-defaults.json` gains `"body.pivot": { "x": 0, "y": 0 }`.
  - `mascot-v2-parts.ts`: the five filled crease fills changed from #5C4300 to #C69300, as in Figma. The colours are now `bagCrease: "#C69300"` and `bagSign: "#5C4300"`, also in `docs/mascot-v2-import.md`'s generator, so a re-import produces the same. `clutch-mascot/CLAUDE.md`'s colour line follows the user's correction.
- Alternatives rejected:
  - **The pad inside Body.** The runtime splits it into a hashed `body.part-…` block, which the inventory would have to name by hash.
  - **A Show pivot switch.** It adds a control nobody asked for; the marker is preview-only already.
  - **Including the marker in the scene bounds.** That would move the preview frame and export framing whenever the pivot leaves the body; the preview SVG already draws overflow.
  - **Re-importing the bag from Figma.** The Desktop Bridge plugin wasn't connected; only the crease fills differed, so they were corrected in place.
- State/output mapping: `body.pivot` → `readMascotSettings` (`body.pivot`) → `mascotSceneInput` (rig px offset) → `buildMascotV2Scene` (lean and squash about it; `scene.pivot` = its world position) → preview marker. Exports draw the lean and squash, never the marker.
- Verification: unit, acceptance and browser proof; the full app suite has the 3 known failures plus a load timeout; `typecheck` and `files:check` passed; `ai:check` failed only on the two SVG export calls. Details:
  - `npx vitest run src/app/mascot/`: 325 tests passed in 12 files. New in `mascot-view.test.ts`: the pad reads strings and clamps; each pad edge moves `scene.pivot` by 160 px × View Scale the same way on screen, with layers and bounds unchanged; with the pivot moved, a 20° lean keeps every head point's distance to the pivot (to 0.05 px) and changes it to the default pivot by over 5 px; the SVG tree and the scene layers never contain the marker colour, and the mascot palette doesn't use it. `mascot-v2-parts.test.ts` checks every crease is #C69300 and the $ sign #5C4300.
  - `e2e/product-mascot.spec.ts`, `browser: body.pivot changes the rendered mascot`, against the build (`TOOLCRAFT_BROWSER_SERVER_MODE=preview`, as delivery runs it): passed in 20 s. It zooms the canvas out until the preview is on screen, runs `expectToolcraftVectorScreenMotion` on the marker's #0D99FF centre (four real drags, held and released), resets the pad and proves keyframes. In dev mode the app alone takes about 18 s to open, which leaves the 30 s budget too short.
  - `npx vitest run src`: 1033 passed, 4 failed. Three failed before this change (`app-schema.test.ts` `defaultMode`, the base-coverage Infinity overflow row, the worklog format of Iterations 5–14). `pipeline-integration` timed out under the parallel load and passes on its own (5.9 s).
  - Browser (1440×900, zoom 106%): the marker sits at the bottom centre of the body (centre 13 px, disc 23 px across); dragging the pad moves only the marker; Lean 20° turns the body around it. Cash jump's bags show every crease in #C69300 on both sides. Undo restored the workspace.
- Risks:
  - Risk: the marker is drawn in world px, so it grows and shrinks with canvas zoom.
  - Risk: browser tests opened in dev mode spend most of the 30 s standard budget loading; run them against the build.

### Iteration 18 — Browser specs for V2 and the saved workspace; worklog format (Task 9)

- Change ID: clutch-mascot-v2-delivery
- Request: "Start Task 9".
- Task type: Test and documentation work: browser specs, the worklog format, two unit failures from before the rebuild, and the delivery check.
- User-visible result: None in the app. The browser specs now prove the V2 mascot from the workspace the app actually opens on.
- Source/reference checked:
  - A first run of the three mascot specs against the build: 38 of 77 failed.
  - The saved defaults in `src/app/app-defaults.json` (Save State as Default): the Infinity canvas at 126% zoom and panned, seven controls sections collapsed (Face, Left Leg, Right Leg, Light, Body Shading, Drop Shadow, Video Export), looping off, Joint softness 48 (its maximum).
  - The V2 preview rendered in the browser and sampled on the export check's 64×64 grid: the head probes at world (0, −60) and (60, −60) still fall on cells of flat #FD5D44.
- Reference inputs: None; `referenceInputs` stays `[]`.
- Docs/contracts read:
  - `docs/toolcraft/acceptance-testing.md` (browser descriptors and budgets) and `src/app/acceptance/browser-proof-policy.mjs` (standard 30 s; extended-io only with declared I/O).
  - The protected helpers this run hit: `browser-infinity-canvas-svg-evidence.ts`, `browser-infinity-artifact-parity.ts`, `browser-product-raster-snapshot.ts`, `decoded-pixel-observation.ts`, `browser-media-export-evidence.ts`.
  - `scripts/toolcraft-delivery-executor.mjs` (delivery runs the built app, `TOOLCRAFT_BROWSER_SERVER_MODE=preview`, on one worker) and `scripts/toolcraft-performance-authority-policy.mjs` (the worklog Verification rule).
- Contract rules applied:
  - Fixtures are prepared through the real UI, never by writing state.
  - The saved defaults stay the user's: no spec changes them, and specs that build expectations from settings use the saved values.
  - No protected helper, meta-test or runtime file was edited.
- View interaction intent: `orbit` (unchanged).
- Interaction ownership: Unchanged: panel for pose and styling (including `body.turn` and `body.pivot`), canvas gimbal for the view.
- Decision:
  - `openMascot` (`e2e/product-mascot-support.ts`) prepares the workspace the specs describe: it expands every collapsed section, switches the Infinity canvas off, resets the zoom to 100% (double-click on the readout) and centres the canvas. `openMascot(page, { prepare: false })` skips that for a step that only uses always-open controls.
  - Sliders move to whichever end they aren't at (`pressRangeAway`), because a saved value can sit at either end.
  - The pad's change step (Body Pivot) is a press on the pad; it scrolls the pad into view first. A press on a pad clears the keyframe selection, so its keyframe proof expects two keyframes, like a typed value.
  - Export spec: the V2 bounds on the saved defaults with the ground shadow off (x −155..154, y −281..303) and the V2 outline stroke #972F20 in the SVG.
  - Runtime spec: the expected scene bounds come from the saved values, the overflow proof zooms out five steps from 100% again, and the playback proof turns looping on (the saved defaults turn it off) and keeps the saved workspace for both of its opens, which brought it from 29 s to 24 s.
  - `app-schema.test.ts`: the canvas sizing now expects `defaultMode` from the saved defaults (the Infinity canvas), which the runtime copies onto the schema.
  - Worklog Iterations 5–14 rewritten in the required fields, keeping every recorded fact.
- Alternatives rejected:
  - **Changing the saved defaults back to the finite canvas, 100% and open sections.** They are the user's choices.
  - **Declaring the mascot pass `intrinsic` to silence the base-coverage overflow row.** The mascot does overflow the artboard (View Scale 3), so the pass is content and needs its overflow proof.
  - **The extended-io budget for slow tests.** It needs declared I/O evidence; the slow parts were setup and load, which were fixed instead.
  - **Making the pivot not keyframeable to shorten its test.** A product change to fit a time budget.
- State/output mapping: Unchanged. The specs observe the same `MascotScene` through the preview SVG, the raster snapshot and the exported files.
- Verification: the three mascot specs, against the build on one worker: 75 of 77 passed, then the playback fix passed twice; the schema and worklog unit tests pass; `npm run verify:delivery` stopped at its catalog step (one acceptance domain per browser file). Details:
  - The three mascot specs against the build on one worker, before the last two fixes: 75 passed, 2 failed (the playback proof, then fixed and passing twice in 23–24 s; and `canvas.infinity.svg-export`, below).
  - `browser: body.pivot changes the rendered mascot` passes in 15 s; every control row passes.
  - `npx vitest run src/app/app-schema.test.ts` passes; the worklog checks pass (4 files, 79 tests).
  - `npm run verify:delivery` (one bare run) stopped before running any test. Its catalog requires each browser file to hold one acceptance domain (the first part of a row id), and the docs place them in `e2e/product-<domain>.spec.ts`. `product-mascot.spec.ts` holds 17 domains, the export spec 3 (`actions`, `artifact`, `export`) and the runtime spec 3 (`canvas`, `mascot`, `timeline`). The `artifact.*` ids are canonical capability ids and `actions.output` and `export.*` are runtime targets, so the shared export tests must be split by domain too. Left for the user to decide: even split, delivery would still fail on the two framework conflicts below.
- Risks:
  - Risk: `canvas.infinity.svg-export` cannot pass. The protected `browser-infinity-canvas-svg-evidence.ts` requires the Infinity SVG to have the finite SVG's viewBox and content hash, while the runtime crops an Infinity SVG to the scene bounds. Framework conflict, unchanged from earlier iterations.
  - Risk: the base-coverage clone test calls the validator without the renderer pipeline, so it can't see the mascot pass's overflow registration. Framework conflict, unchanged.
  - Risk: in dev mode the app takes about 18 s to open, which leaves too little of the 30 s budget; run browser tests against the build.
  - Risk: until the specs are split by domain, `verify:delivery` cannot reach its tests, and the app has no delivery receipt.

### Iteration 19 — Browser specs split by acceptance domain; evidence gaps closed where the product can

- Change ID: clutch-mascot-v2-delivery
- Request: "Split the specs" (the user's answer to "Split the browser specs into one file per domain now?").
- Task type: Test restructure for the delivery catalog, plus the browser evidence the product was missing.
- User-visible result: None in the app.
- Source/reference checked:
  - `scripts/toolcraft-delivery-catalog.mjs` and `toolcraft-delivery-catalog-validation.mjs`: one acceptance domain (an id's first segment) per browser file; test titles unique across the suite.
  - `docs/toolcraft/acceptance-testing.md`: registered scenarios go in `e2e/product-<domain>.spec.ts`.
  - The evidence reporter (`e2e/browser-runtime-evidence-reporter.ts`, `src/app/test-evidence/browser-runtime-contract.ts`): a requirement matches only evidence with its test title, requirement id, type and target. A command-line `--reporter` replaces it, so the earlier runs in Iteration 18 never checked evidence.
  - A run of the old specs with the reporter active: 102 evidence gaps.
- Reference inputs: None; `referenceInputs` stays `[]`.
- Docs/contracts read: `docs/toolcraft/acceptance-testing.md`, `docs/toolcraft/core/setup-export.md` (SVG export renderer), and the protected helpers `browser-control-applicability-evidence.ts`, `browser-timeline-evidence-helpers.ts`, `browser-standard-timeline-evidence.ts`, `browser-media-export-evidence.ts`, `canvas-handle-helpers.ts` and `scripts/toolcraft-product-evidence-boundary.test.mjs` (product specs may not attach evidence themselves).
- Contract rules applied:
  - One acceptance domain per browser file, in `e2e/product-<domain>.spec.ts`.
  - Evidence comes only from the protected helpers; no product file imports the evidence attach function.
  - Rows shown only while a switch is on prove hidden and visible, and their other evidence uses the visible case's qualified id.
- View interaction intent: `orbit` (unchanged).
- Interaction ownership: Unchanged: panel for pose and styling, canvas gimbal for the view.
- Decision:
  - `mascotBrowserFile(id)` in `app-acceptance-data.ts` gives every row its domain file; the runtime rows no longer name files.
  - 23 spec files: `actions`, `appearance`, `armLeft`, `armRight`, `artifact`, `body`, `canvas`, `castShadow`, `dropShadow`, `export`, `face`, `groundShadow`, `hair`, `headband`, `legLeft`, `legRight`, `light`, `mascot`, `pose`, `shading`, `timeline` and `view`. `product-mascot-export.spec.ts` and `product-mascot-runtime.spec.ts` are gone; `product-mascot.spec.ts` now holds only the `mascot` domain (the overflow proof).
  - `e2e/product-mascot-controls.ts` (`defineMascotControlTests(domain)`) holds the generic control proof; `e2e/product-mascot-export-support.ts` holds the export pixels, bounds, frame schedule and lean animation; `product-mascot-support.ts` gains `waitForStableOutput`, `download`, `setDuration` and `WHITE`.
  - New tests so each domain proves its own rows: `browser: actions.output exports PNG, SVG and video`, `browser: export.image format and resolution set the downloaded image` (with Resolution's shown/hidden proof for PNG, JPG and SVG), and `browser: export.video format and resolution set the downloaded video`. The `artifact` tests keep their names.
  - Conditional rows (Shading Size, the ground, cast and drop shadow settings) prove the control hidden with its switch off and shown with it on, then use the qualified id for the change, parts and keyframes.
  - The gimbal's export check uses `view.orbit#export-clean`.
  - Each control proof waits for settled output first: switching a shadow on renders over a few frames, which had failed Light Angle and Cast Length.
  - `openMascot(page, { prepare: false })` replaces the earlier option name, whose text tripped `docs:check`.
- Alternatives rejected:
  - **Attaching the missing targets from product code.** The product evidence boundary forbids importing the attach function.
  - **`expectToolcraftStandardTimelinePlayback`.** It reads a `data-timeline-progress` marker the mascot does not have.
  - **Proving Background color keyframes.** Its colour is not in the mascot SVG the keyframe observation reads, and the evidence would still lack its target.
- State/output mapping: Unchanged. The specs observe the same `MascotScene` through the preview SVG, the raster snapshot and the exported files.
- Verification: all 80 product browser tests against the build on one worker with the evidence reporter active: 78 passed, then the video-settings test passed after its fix; unit tests, `files:check` and `docs:check` pass apart from the known framework conflicts; `verify:delivery` now passes its catalog and `docs:check` and stops at `ai:check`. Details:
  - Evidence gaps went from 102 to 59, all from the framework: 49 `timeline-keyframes` and 5 `timeline.playback` (the protected timeline helpers attach no target, while every requirement has one), plus `canvas.infinity.svg-export`.
  - `npx vitest run src/app`: 1036 passed, 1 failed (the base-coverage clone test, a framework conflict).
  - `node scripts/check-toolcraft-integrity.mjs` reports only the two `mascot-svg-export.ts` findings; the new e2e files pass the evidence-boundary rules.
  - `npm run verify:delivery`: past the catalog; `docs:check` passes after the rename; it stops at `ai:check` on the two `mascot-svg-export.ts` findings.
- Risks:
  - Risk: `verify:delivery` cannot pass in this Toolcraft version. Four framework conflicts stand in the way, in run order: `ai:check` forbids the `createElementNS`/`setAttribute` calls `core/setup-export.md` prescribes for SVG export; the base-coverage clone test omits the renderer pipeline; the Infinity SVG helper wants the finite SVG's viewBox and hash; the timeline helpers attach evidence without the target their requirements carry.
  - Risk: 23 spec files are slower to run than 3; one worker takes about 12 minutes.

### Iteration 20 — Faces_V2 imported; MascotVM view model previewed; git and GitHub Pages

- Change ID: clutch-faces-v2-and-view-model
- Active change: clutch-faces-v2-and-view-model
- Request: "I've drawn the Faces V2--> https://www.figma.com/design/hE0eJAkqKzj3K5JfIcpT8o/Clutch?node-id=293-1448 … ENumerate using the desktop bridge plugin"; "Yes, let's do this as well" (to "View model: connect MascotVM (pace, timeOfDay, the triggers) to the app"); then the answers: face 293:1436 is "face_angry"; the excited face for "goalHit (celebrating),won (cash jump),joined,Just an option"; the view model as the "State preview section".
- Task type: Figma art import (faces) and a schema/product behaviour change (a new controls section driving the renderer).
- User-visible result:
  - Every expression except sad eyes is now the V2 drawing from Faces_V2, with its soft mouth shadow; new Angry eyes and Excited mouth; turned mouths narrow with the smile.
  - Eyes and Mouth have an Auto option (the new default) that follows the View Model's face.
  - A View Model section (Pace, Step data, Time of day, Headband, Armbands, Reaction) previews MascotVM: each state's key pose sits under the pose sliders, its face drives Auto, its gear switches hide the headband or armbands, and time of day moves the light.
  - Cash jump (preset and Won) shows the excited face; Stand hands the face back to Auto.
- Source/reference checked:
  - Figma Faces_V2 (293:1448) through the Desktop Bridge: 7 face groups (face_happy, face_Excited, face_satisfied, face_sleepy, face_disappointed, face_confused, face_angry), each eyes + Mouth + mouth_shadow (#687773 at 20%); face_angry's eye group is still named eyes_tired.
  - `clutch-mascot/CLAUDE.md` (view model, face presets) and `PROMPTS.md` prompt 8 (state machine layers and face priority).
- Reference inputs: None; `referenceInputs` stays `[]`.
- Docs/contracts read: `docs/toolcraft/workflow.md`, `core/control-selection.md`, `core/layout.md`, `core/runtime-boundary.md`, `core/performance.md`, `schema-reference.md`, `component-rules.md`, `renderer-technique.md`, `performance.md`.
- Contract rules applied:
  - Built-in controls only: slider (Pace), switches (Step data, Headband, Armbands; the gear pair inline), a segmented Time of day (4 options, 22 characters), a Reaction select (6 options, over the segmented budget).
  - No synchronisation between controls (there is no value-change port): the view model acts at render time in `buildMascotScene`, so preview, raster, SVG, video and bounds agree.
  - Every option changes the output (each-visible-item coverage); every finite selector is classified (all `parameter`).
  - Saved defaults list every value target, so `app-defaults.json` gains the six `vm.*` values and Eyes/Mouth switch to Auto.
- View interaction intent: `orbit` (unchanged).
- Interaction ownership: Unchanged. The View Model's pose sits under the panel's pose sliders (they add to it); the gimbal still owns the camera.
- Decision:
  - `mascot-v2-faces.ts` is generated from the Faces_V2 SVG export (`generate-v2-faces.mjs`, documented in `docs/mascot-v2-import.md`). Eye sets come from face_satisfied (blink), face_sleepy (tired), face_confused (curious), face_angry (angry); mouths from face_Excited, face_confused (neutral) and face_disappointed (sad).
  - Layout (`mascot-v2-face.ts`): eyes drawn with the smile keep their height above it; a mouth keeps its distance below the eyes it was drawn with; angry eyes keep theirs above the frown. Measured against face_happy and laid against Standing's eyes and smile (Standing's smile sits 2.8 px further below its eyes).
  - `mascot-view-model.ts`: body state Idle (pace 100+ or no step data), Walking (40–99), Tired (under 40); face priority goalHit/won/joined excited, out sad, Tired disappointed, no step data confused, night sleepy, else happy. Key poses as offsets from rest (numbers add to the sliders; a hand or bag left at default takes the state's). Goal hit and Won replace the body state; Tap, Joined and Out play over it, as in Rive's layers. Walking turns side-on the way he faces.
  - Time of day also moves the light (morning +20°, evening mirrored), so every option renders differently; Night adds the sleepy face. Flagged to the user: Rive can't re-light.
  - The cash jump's face is now excited (user's answer); CLAUDE.md and PROMPTS.md face presets updated to match.
- Alternatives rejected:
  - **Trigger buttons that write pose values.** A trigger is momentary; a value-backed Reaction select is the honest static preview and needs no hidden state.
  - **Writing the state into the pose controls when Pace changes.** No value-change port exists, and effect-based syncing is forbidden.
  - **A Preview mode switch hiding the pose sections.** That is an application mode the user didn't ask for.
  - **Leaving Morning, Day and Evening identical.** Each option must change the output.
- State/output mapping: `vm.*` → `readMascotSettings().vm/gear` → `applyMascotViewModel` (pose offsets, light) → `mascotSceneInput` (`resolveMascotFace` for Auto, gear) → `buildMascotV2Scene` (gear pieces skipped) → one `MascotScene` for preview, PNG/JPG, SVG, video and bounds.
- Other work in this batch: `git init` with two commits (the app, the Pages workflow), merged with the GitHub repo's README and pushed to GeneralStan/mascot-render-app; GitHub Pages deploys `dist` built with `--base=/<repo>/` (live at https://generalstan.github.io/mascot-render-app/). V2 views and faces exported as SVG to `clutch-mascot/figma/v2/`; `clutch-mascot/PROMPT-V2-RIVE-REBUILD.md` written for the Rive agent.
- Verification (focused):
  - `npx vitest run src/app/mascot/`: 341 tests in 13 files (including the new `mascot-view-model.test.ts`); all pass, though one scene test timed out at 5 s while Playwright ran alongside and passed alone in 2.7 s.
  - `npx vitest run src/app`: one failure, the known base-coverage framework conflict (the pipeline-integration test timed out under load and passed alone).
  - `npm run test:feature` can't run here: its product-boundary scan takes about 41 s (the runner allows 20 s) and rejects `mascot-svg-export.ts`, framework conflict 1. Ran instead, against a fresh build: `TOOLCRAFT_BROWSER_SERVER_MODE=preview npx playwright test e2e/product-vm.spec.ts e2e/product-face.spec.ts e2e/product-pose.spec.ts --workers=1 --reporter=list`. 7 passed; vm.pace and face.eyes failed on the preview server's identity request (reset and timeout while unit tests loaded the machine) and both passed on a rerun. So all 9 rows pass: vm.pace, vm.hasStepData, vm.timeOfDay, vm.gearHeadband, vm.gearArmbands, vm.reaction, face.eyes, face.mouth and pose.preset.
  - `files:check` and `docs:check` pass.
  - The View Model section was checked in the running app (headless screenshot): Time of day's four cells fit, Headband and Armbands share a row, Won shows the cash jump with the excited face over Night.
- Risks:
  - Risk: the key poses for tired, celebrating, thumbs up, wave and shrug are agent-authored offsets from PROMPTS.md's descriptions; the user should judge them.
  - Risk: the time-of-day light is a Mascot Lab extra with no Rive equivalent.
  - Risk: Faces_V2 is front-only; turned views place the front drawings (narrowed mouths), so 3/4 expressions are an approximation until 3/4 faces are drawn.

## Decisions

### Renderer

- Decision: SVG preview plus Canvas 2D raster export from one shared `MascotScene`.
- Reason: The mascot is flat vector art; SVG keeps it crisp and editable, Canvas 2D gives deterministic PNG/JPG/video frames.
- Evidence: `src/app/mascot/mascot-scene.ts`, `mascot-preview.tsx`, `mascot-canvas-renderer.ts`, `mascot-svg-export.ts`, pipeline passes `mascot-scene` and `mascot-export`.

### View Interaction

- Decision: `orbit` with the runtime orientation gizmo.
- Reason: The user asked for a gimbal view to explore poses with a pseudo-3D feel; the rig projects 3D limbs for any turn.
- Evidence: `appProductReadiness.viewInteraction`, `spatialViewModule()`, `useToolcraftModelOrbitInteraction` in `mascot-preview.tsx`.
- Mode: orbit.
- Source: user request ("add a gimbal view … pseudo 3D feel").
- Alternatives: the earlier Front/3/4/Side buttons (no continuous turn), a Turn slider (contract wrong-substitution).
- Targets: `view.orbit`.

### Interaction Ownership

- Decision: Panel for every pose, shape, shading and shadow setting, including the character's own turn; canvas for moving the viewpoint.
- Reason: Joint angles, the turn and styling are numeric, keyframeable settings. Moving the camera is a spatial gesture owned by the gizmo and direct mascot drag, and it turns the light and shadows with the world, which the character's turn doesn't.
- Evidence: `appProductReadiness.interactionOwnership` entries `orbit-view` (canvas, `view.orbit`) and `turn-character` (panel, `body.turn`).

### Timeline

- Decision: Keyframe timeline, 4 second default loop.
- Reason: The user asked to animate between poses ("PNG + SVG + animate"), which needs editable property animation and video export.
- Evidence: `timelineModule` in `app-schema.ts`; `appTransferMode.animationIntent` `timeline-keyframes`.

### Layers

- Decision: No Layers panel.
- Reason: The user never asked for a layer workflow; mascot parts are rig sections, not user layers.
- Evidence: `layersModule()` is not composed.

### Controls

- Decision: Sections View, View Model (MascotVM: Pace, Step data, Time of day, Headband, Armbands, Reaction), Body (Stand/Walk/Cash jump Pose actions and Turn), Body Pivot (the Position pad, shown in the preview as the pivot marker), Face (Eyes and Mouth, Auto by default), one section per limb (with Hand and Money bag on the arms), Light, Body Shading (Visible, Size, Highlight), Ground/Cast/Drop Shadow.
- Reason: Grouped by the mascot entity each control edits and by shadow kind.
- Evidence: `src/app/mascot/mascot-controls.ts`, `appControlSectionInventory`.

### Export

- Decision: PNG/JPG (default image), SVG and MP4/WebM video.
- Reason: The user's output answer "PNG + SVG + animate".
- Evidence: `appProductReadiness.exportIntent` with user-message evidence; `imageExportModule`, `svgExportModule`, `videoExportModule`.

### Performance

- Decision: Responsiveness role for every control; one memoized vector-build pass plus a batch export pass.
- Reason: The shape count is fixed, so cost is constant per interaction; export cost scales with the long edge.
- Evidence: `src/app/app-performance.ts`, `rendererPipelineRegistration`.
- Workload: fixed rig shape count; export long edge up to 8K.
- Lifecycle: scene memoized by settings key; export pass per frame.
- Assessment: no kernel benchmark required for a constant-cost vector build.
- Paths: derived from the pipeline registration and control matrix.

Canonical control values and selected-entity isolation follow runtime representations; this product has no selected-entity properties and no render-scale control.

## Evidence

- Source reviewed: Figma `82:7560` via the Desktop Bridge plugin; generated parts in `src/app/mascot/mascot-figma-parts.ts`.
- Contract applied: shared scene for preview, export and bounds; schema-owned values; protected receipts own delivery proof.

## Verification

Protected receipts own initial/performance proof. Product unit tests and focused browser checks are recorded per change.

## Risks

- Risk: The signed base-coverage clone test omits the renderer pipeline, so a content-pass overflow row fails there until the framework passes the pipeline through.
- Risk: Walk angles only read as walking in Side; the preset switches to Side for that reason.
- Risk: The protected Infinity SVG helper requires the Infinity SVG to equal the finite one (viewBox and hash), while the runtime crops Infinity SVG to the scene bounds, so `canvas.infinity.svg-export` cannot pass until the framework agrees with itself.
- Risk: `ai:check` still flags `mascot-svg-export.ts`: the product boundary forbids `container.ownerDocument.createElementNS`, `setAttribute` and `append`, which is exactly how `core/setup-export.md` tells SVG export renderers to append vector nodes. No product-side alternative exists until the framework reconciles the two.
- Risk: the signed `pipeline-integration` Vitest case (20s timeout) can time out when the whole suite runs in parallel; it passes on its own.
