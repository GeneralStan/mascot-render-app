# Mascot V2 Rebuild Implementation Plan

> **Status:** plan only. The user asked for this plan and will approve it before any code changes (their rule: one step per prompt, say what will change first). Execute inline with the signed local Toolcraft workflow, one task per prompt.

**Goal:** Clutch Mascot Lab poses the V2 Clutchman, which has layered outline, base, shade and highlight art. It turns smoothly through 360°, anchored on the drawn front, 3/4, side and back views, and re-lights every part from a light angle. The existing timeline, presets and PNG, SVG and video export are kept.

**Why this needs a plan:** this replaces the art source, the rig, the shading and the turn model. It also changes paint types in three renderers and migrates saved control ids. It touches every mascot module, the schema, acceptance data, defaults and the browser specs.

**Source:** Figma file `hE0eJAkqKzj3K5JfIcpT8o`, page Playground, frame "Clutchman Poses & parts V2" (`146:1816`). It was read through the Figma Desktop Bridge (structure, not screenshots):
- Standing `169:1844`, 3/4 `169:1845`, Side `177:2190` (added 2026-11-10), Back `169:2019`
- Money Bag `170:2155`, hands_thumbs_up `170:2173`, hands_fist `171:2174`

`referenceInputs: []`: there is no motion reference.

**Lifecycle:** there is no initial delivery receipt yet (`.toolcraft/verification/` doesn't exist), so this is part of first product delivery. **Tier 4.**

## Decisions

### From the user, 2026-11-10

- Update Mascot Lab in place. Keep the timeline, presets and exports.
- **Turn:** "Let's add a smooth turn slider and side view. The three views i provided should be enough for you to compute a 360 degree view."
- **Shading:** re-light every part in code from a light angle, rigid parts included. The drawn shade and highlight are the style reference, not rendered art.
- **Outputs:** PNG, SVG, video and GIF loops, and a Rive handoff. Export intent is unchanged, so no new export authority is needed.
- **Faces:** V2 has eyes_open and mouth_happy. The other expressions reuse the V1 groups until they are redrawn.
- **Hands:** one fist and one thumbs-up are drawn. Flip them for the other hand, which is safe because shading is re-lit.
- **Rig fixes:** match both upper arms to Arm_L, because the drawn Elbow_R is 8px higher. On 3/4, hide the near arm's top end so it looks attached to the shoulder.
- **Body pivot:** at the bottom centre of the body, with a control to move it.
- **Hair:** ~~for the turn, spread the five strands in depth around Hair_base.~~ Replaced on 2026-11-10 after the side view arrived. The tuft is drawn the same in all four views, so it stays as drawn at every angle. Bend, Sweep and Wave still move it.
- **Side view (2026-11-10):** "I've also added the side view … You don't need to rely on complex computation for it anymore … redo the rig and skeletons if you need to but ensure the new drawing is taken into account and is used to make the mascot lab output better."
- **Far limbs side-on:** the side drawing has only the near arm and leg. The far ones reuse the near shapes, behind the body and one step darker.

### Turn ownership: keep both, as two different operations

The user asked: "What if we keep the slider for horizontal turning and we keep the canvas drag plus gizmo for positioning for different poses and angles? So this way, they serve two different functions and we can actually keep both."

The contract lets canvas and panel own complementary operations. It forbids them mirroring the same operation. These two count as different because the light and shadows belong to the world, not the camera:

**Turn the character: `body.turn` slider, panel-owned**
- The mascot rotates in place under fixed lighting, from −180 to 180°.
- Shading slides across his body, and his cast shadow stays put on the floor.
- It can be keyframed, so turns can be animated in video and Rive.

**Move the viewpoint: `view.orbit` gizmo with canvas drag, canvas-owned**
- The camera walks around the scene, with the existing ±30° tilt.
- The light, the cast shadow and the floor turn with the world. From behind, the light comes from the other side.
- It can't be keyframed. It sets the viewpoint of a still or an export.

**Why they aren't duplicates**
- Turning the character 30° and orbiting the camera 30° give different pictures: the light, the cast shadow and the ground shadow differ.
- A browser test proves this.
- `viewInteraction` stays `orbit` mode, and `spatialViewModule` and the gizmo stay.
- The character turn is a pose property, not a camera. So it is not a gizmo substitute, and the contract rule against "paired angle sliders" doesn't apply.
- `interactionOwnership` "turn-mascot" splits in two: `orbit-view` (canvas) and `turn-character` (panel). Each is declared as complementary to the other, with the quote above as evidence.

### Design notes

- **What the drawings tell us:**
  - There are four views: front 0°, 3/4 about 30°, side 90° (facing screen right, so `Arm_L` and `Leg_L` are the near limbs) and back 180°.
  - The 3/4 angle comes from how far the face moved (40px on a head 157px wide) and how much the shoulders narrowed (cos 30°).
  - The head outline and headband are identical in all four views, so the body is round.
  - The hair is drawn the same in all four views, so it stays as drawn.
  - Joint depth comes from the side drawing, the way V1 used its Walking drawing. For example, the near elbow is 38px behind the shoulder, the hip 10px forward, and the knee and ankle near the centre line.
  - The feet point outward in front and back, and the way he's facing in 3/4 and side. Every one of those comes straight from a drawing.
- **Limbs and hair strands become a centerline plus a width profile.** The centerline is the midpoint of the tube's two long edges in the base path, so the tapers are kept. Each frame, the tube is rebuilt around the posed centerline, and outline, base, shade and highlight are generated from it. Rigid parts use their drawn base and outline paths.
- **Re-lighting:**
  - **Tubes:** a shade band on the side of the tube facing away from the light, and a highlight stroke inset on the lit side. The band widths come from the drawn ratios.
  - **Rigid parts:** the crescent method. Clip to the base, fill with the shade colour, then fill a copy of the base nudged toward the light.
  - **Check:** at the default light angle (160°, measured from the drawing on 2026-11-10; it was 30° in V1), the front view must visually match the drawn V2 shading.
- **Colours are fixed to the V2 palette** (see `clutch-mascot/CLAUDE.md`). The old editable shading colour and the outline/offset style switch are removed, because they would restyle the artwork.
- **Old faces:** move the V1 face groups out of `mascot-figma-parts.ts` into `mascot-v1-faces.ts`, then delete the rest of the V1 art. There is no Figma generator script today. V2 data is produced through the bridge, and the extraction code is kept in `docs/mascot-v2-import.md`.
- **SVG export for Rive:** name the groups after the V2 parts (`Arm_L`, `Leg_R`, `Body`, `Headband`, `Hair/Strand 1` and so on), so the Rive import keeps the hierarchy. Mascot Lab's side-view SVG, posed from the drawing, becomes `Mascot_Side`.

## Tasks

### Task 1: import the V2 art

**Files:**
- create `src/app/mascot/mascot-v2-parts.ts` (generated data)
- create `src/app/mascot/mascot-v1-faces.ts`
- create `docs/mascot-v2-import.md`
- create `src/app/mascot/mascot-v2-parts.test.ts`

**Steps:**
- [x] Extract each part's layers from all three views, the hand and bag props, and the pivot dots. For each layer: path `d` in one rig space, paint, stroke weight and gradient stops (mouth). Express positions relative to the head centre. Done 2026-11-10: x = 0 at the head centre, y = 0 on the floor, generated through a localhost receiver (see `docs/mascot-v2-import.md`).
- [x] Test:
  - every view has the four layers per part
  - every pivot exists
  - the palette matches CLAUDE.md
  - the head path is identical across views

### Task 2: tubes

**Files:**
- create `src/app/mascot/mascot-tube.ts` and `mascot-tube.test.ts`

**Steps:**
- [x] Extract the centerline and width profile from each limb and strand base. Rebuild the tube outline along any centerline. Done 2026-11-10 in `mascot-tube.ts`: the edges are stored as offsets in the centreline frame, which keeps tapers and the flat or round ends.
- [x] Test: rebuilding at rest matches the drawn base to within 1px Hausdorff distance for every limb and strand. All three views are covered; the measured error is 0.16 to 0.31px.

**Carried into Task 4:**
- The user added wrist dots to `hands_fist` and `hands_thumbs_up`. Let the importer accept pivots in props, then regenerate.
- Fillet the posed centreline at the elbow and knee so the inner edge doesn't fold.

### Task 3: the 3D rest rig

**Files:**
- create `src/app/mascot/mascot-v2-rig.ts` and `mascot-v2-rig.test.ts`
- edit `mascot-rig-constants.ts`

**Steps:**
- [x] ~~Get each joint's depth by comparing the front and 3/4 positions at 30°.~~ Changed on 2026-11-10. Joints sit in the body's side plane, and each drawing (front 0°, 3/4 ±30° and back 180°) becomes a correction that is exact at its angle and fades out by ±90°. Triangulating two views 30° apart turned drawing differences into fake depth.
- [x] Match Elbow_R to Elbow_L. The right arm now mirrors the left.
- [x] Add a movable body pivot (default: bottom centre of the body). This is `MASCOT_V2_BODY_PIVOT`. Its panel control comes in Task 8.
- [x] Spread the hair strand roots in depth around Hair_base. The drawn tuft holds within 30° of front or back, then fans toward the side.
- [x] Test the projected joints against the drawings (they now land exactly):
  - 0° matches the front exactly
  - 30° matches the 3/4 to within 3px
  - 180° matches the back (mirrored by screen side, so Back's Arm_L is the front's Arm_R)

### Task 4: posing

**Files:**
- rewrite `mascot-limbs.ts`: remove `blendRest` and the Walking dependency, port `poseLimb` to the new rest
- edit `mascot-hair.ts` (five strands, using the existing bend, sweep and wave controls)
- edit `mascot-geometry.ts` and `mascot-path.ts` as needed
- rewrite `mascot-view.test.ts`

**Steps:**
> Done 2026-11-10, in new modules `mascot-v2-pose.ts` and `mascot-v2-hair.ts` beside V1, so the app keeps working. Task 8 switches the scene over and deletes `mascot-limbs.ts` and the V1 parts (moved from Task 5).

- [x] Keep the meaning of the existing pose controls (raise, swing, twist, elbow, wrist, straighten, length, knee, ankle, softness, lean, squash, lift). Lean and squash ride in via the body carry, and lift and the body pivot are scene-level (Task 5).
- [x] Hands: open, fist or thumbs-up, plus flip. The props attach by their new `Wrist` dots.
- [x] Armbands pinned to the forearm. Money bags follow the hand, at their drawn size.
- [x] ~~Apply the feet rule: `footScale` is in place, and Task 5 sets it from the turn.~~ Replaced in Task 4b: the feet come from the nearer drawing and `toeAt` eases the toe direction.
- [x] On 3/4, tuck the near arm's shoulder end: no outline or cap where it meets the body. The root is open, and the edge lines over the body still need hiding in Task 5.
- [x] Test: limbs keep their length, feet stay on the floor, and the hand variants and money bag attach at the wrist. Also tested: joints don't fold up to 120°, and hair doesn't fold.

**Carried forward:**
- To Task 4b: the arm bow in profile and the feet direction (both now come from the side drawing), and the side face.
- To Task 5:
  - hide the near arm's edge lines where it lies over the body (3/4 and side)
  - draw tubes seen nearly end-on without overlapping
  - rewrite `mascot-view.test.ts` for V2

### Task 4b: the side view, real depth and blending between drawings (added 2026-11-10)

**Files:**
- update the generator in `docs/mascot-v2-import.md`, and re-import `mascot-v2-parts.ts`
- rework `mascot-v2-rig.ts`
- edit `mascot-v2-pose.ts` and `mascot-v2-hair.ts`
- update their tests

**Steps:**
> Done 2026-11-10. See worklog Iteration 11.

- [x] Re-import with the `Side` group. Views may draw only the near limbs, which the side does.
- [x] Rig:
  - Joint depth comes from the side drawing (z = the side drawing's x for the near joints). The far side mirrors x and keeps the same z.
  - Where a drawing's bone heights disagree, fit the bone like V1's `bone3D`.
  - Corrections make 0°, ±30°, ±90° and 180° exact. −90° is the side drawing mirrored, and −30° the 3/4 mirrored.
  - Drop the hair spread, so the tuft keeps its drawn shape at every angle.
- [x] Blend the art between the two nearest drawings as the mascot turns:
  - Each limb tube is resampled to a shared sample count by normalised arclength, so centrelines and edge offsets can blend.
  - Hands, feet and armbands take the nearer drawing's shape and orientation, crossfading their placement. Feet then point as drawn.
- [x] Side-on, the far arm and leg reuse the near drawing's shapes, behind the body.
- [x] Test:
  - every drawn angle is exact: joints, limb centrelines and feet
  - a full sweep turns smoothly, with no jumps
  - the far limbs stay behind the body side-on

### Task 5: the turn

**Files:**
- ~~edit `mascot-scene.ts` (view resolution, depth order, face map)~~ Done instead as new modules beside V1: `mascot-v2-scene.ts`, `mascot-v2-face.ts` and the shared `mascot-scene-layers.ts`
- ~~edit `mascot-settings.ts`~~ Moved to Task 8

**Steps:**
> Done 2026-11-10. See worklog Iteration 12. The app keeps drawing V1 until Task 8, which switches it to `buildMascotV2Scene` together with the new controls and the settings migration.

- [x] Compute relative yaw as `body.turn` plus the camera yaw. It drives the joint projection and the layer order:
  - front and back: legs, arms, Body, Headband
  - 3/4: the near arm goes in front
  - side: far limbs behind the body and one step darker. The darkening eases in past 3/4 and out again toward the back, so the drawn views keep their colours.
- [x] Face: blend between the drawn faces (front, 3/4 and the side's single eye and profile mouth).
  - The far eye slides behind the head's curve and is clipped there.
  - The face hides past the side (from 135°).
  - Other expressions use the V1 shapes placed at the drawn eye and mouth positions.
  - The mouth's gradient shadow arrives with gradient paint in Task 7.
- [x] Mirror the drawings for left-facing angles. That's safe because shading is re-lit. Back-quarter angles blend side into back.
- [x] Keep the light direction, cast shadow and ground in world space. `body.turn` rotates only the character. `view.orbit` rotates the whole world, light included, relative to the camera.
- [x] Hide the near arm's shoulder end (3/4 and side): its outline starts 18 px down the arm.
- [x] Test:
  - the 0°, ±30°, ±90° and 180° landmarks match the drawings, from both the slider and the gizmo
  - no layer-order jumps across a full sweep
  - the face is hidden from the back
  - at the same relative yaw, slider and gizmo give the same silhouette but different light and shadow

### Task 6: re-lighting

**Files:**
- create `src/app/mascot/mascot-relight.ts` and `mascot-relight.test.ts`

**Steps:**
> Done 2026-11-10. See worklog Iteration 13. The drawn light is 160° (the left, a little above), leaning 18.4° toward the viewer, measured from the drawn shade layers.

- [x] Generate the tube bands and the rigid-part crescents, using the V2 palette (body, gear and bag). Hair strands shade the inside of each curl, as drawn.
- [x] Test: the shade is always on the side away from the light, for light angles 0–360 and turns −180 to 180.
- [x] ~~Browser check: the default front view matches the Figma shading.~~ The app draws V1 until Task 8, so this is a unit test against the drawn shade layers, plus a rendered comparison (`.toolcraft/browser-artifacts/v2-relight-closeup.png`). The browser check moves to Task 9.

### Fixes after Task 6 (2026-11-10)

> See worklog Iteration 14. The money-bag grip and the cash-jump pose, the right shoulder, the turned face, and the light behind.

- [x] The fist holds the bag by its neck. The bag hangs swung 25° outward.
- [x] Softness spreads gentle bends along the limb (rubber hose).
- [x] `MASCOT_V2_CASH_JUMP`, fitted to the reference.
- [x] Limbs behind the body run on into it, so no cut root shows.
- [x] The far eye rounds the head instead of landing on the near one. The mouth blends between drawings.
- [x] With the light behind: a lit rim, and the cast shadow thrown forward.

### Task 7: paint and renderers

**Files:**
- edit `mascot-scene-types.ts` (linear-gradient stroke paint, shape opacity)
- edit `mascot-preview.tsx`, `mascot-canvas-renderer.ts`, `mascot-svg-export.ts`

**Steps:**
> Done 2026-11-10. See worklog Iteration 15 (which also covers the very soft joints asked for first). Files: new `mascot-svg-tree.ts` (shared by preview and export) and its test.

- [x] Add gradient and opacity paint, with the mouth shadow as the first user. In SVG, gradients are `linearGradient` and `stop` in defs, referenced with local `url(#id)`.
- [x] Keep the SVG preview, so there is no new render-scale work.
- [x] Add the V2 part names as SVG group ids.
- [x] Keep `ai:check` passing for the DOM calls in `mascot-svg-export.ts`. Findings went from 38 to 2: the export contract's own `createElementNS` and `setAttribute` remain. They need a framework fix, not a product one.

### Task 8: controls, schema and migration

**Files:**
- edit `mascot-controls.ts`, `mascot-settings.ts`, `mascot-pose-presets.ts` (+ test), `mascot-scene.ts` (now the settings → V2 mapping)
- `src/app/app-schema.ts` is unchanged: `spatialViewModule` stays
- edit `src/app/app-acceptance-data.ts` (`interactionOwnership` split into `orbit-view` and `turn-character`; inventory seeds and `finiteSelectors`)
- edit `src/app/app-performance.ts` (fidelity and cost notes), `src/app/app-defaults.json`
- edit `mascot-acceptance.test.ts`

**Steps:**
> Done 2026-11-10, with one step left to the user (the body pivot). See worklog Iteration 16, which also covers the fix asked for first: bent limbs keep their length. The pivot followed on 2026-11-11 (worklog Iteration 17).

- [x] Switch the app to V2:
  - `mascot-scene.ts` maps settings to `buildMascotV2Scene`, which the pipeline, cache, preview and exports already call
  - deleted `mascot-limbs.ts`, `mascot-rig-constants.ts`, `mascot-figma-parts.ts` and the V1 scene builder; `mascot-v1-faces.ts` stays
  - rewrote `mascot-view.test.ts` for V2
- [x] Add controls:
  - `body.turn` (slider, keyframeable, in the Body section)
  - `body.pivot` (vector pad), added 2026-11-11 after a preview-only pivot marker (a white dot with a #0D99FF centre) gave its `vector-screen-motion` proof a feature to track. It is its own section, Body Pivot (pad label Position), right after Body, because the runtime gives a pad its own block. The pad's edge is 160 drawing px (`MASCOT_BODY_PIVOT_REACH_PX`) from the bottom centre of the body.
  - `armLeft.hand` and `armRight.hand` (segmented: Open, Fist, Thumb up)
  - `armLeft.moneyBag` and `armRight.moneyBag` (switches, sharing a row with Flip hand)
  - `shading.highlight` (switch)
- [x] Keep `light.angle`, widened to 0–360 with the default 160° (`MASCOT_V2_DRAWN_LIGHT_ANGLE`), and `shading.visible`.
- [x] Keep `view.orbit` and its gizmo.
- [x] Remove `shading.style`, `shading.limbs`, `shading.depth` and `shading.color`.
- [x] ~~Repurpose `shading.width`~~ Replaced by a new `shading.size` (a multiplier on the tube bands and `MASCOT_V2_RIM_RADII`, 1 = as drawn). `shading.width` is removed too.
- [x] ~~`authoredStateMigration`~~ Not needed, and not possible as planned:
  - The runtime takes the migration only as a function on the product definition, and the protected meta-test `app-acceptance.base-coverage.test.ts` runs `structuredClone(appSchema)`, which can't clone a function.
  - With the new `shading.size` id nothing changes meaning: the persistence and settings readers skip ids the app doesn't know, and missing ones (`body.turn`) take their defaults. `view.orbit` and `light.angle` carry over unchanged.
- [x] Rewrite `app-defaults.json` exactly. The values are the user's saved defaults with the removed ids dropped, the new controls at their defaults, Light 160° and Size 1. `controlRanges` and `collapsedSections` are kept.
- [x] Walk preset: `body.turn` ±90° (keeping the facing) and the contact pose from V1's Walking swings. The camera is left alone. The Stand preset resets the pose, `body.turn`, hands, money bags and lift, and shows the happy face.
- [x] Cash jump preset from `MASCOT_V2_CASH_JUMP`: limbs, lift, Softness 40 and the satisfied face.

### Task 9: browser specs, worklog and delivery

> Added 2026-11-10: reformat worklog Iterations 5–14 with the fields `app-acceptance.product-worklog.test.ts` requires (Task type, User-visible result, Source/reference checked, Reference inputs, Docs/contracts read, Contract rules applied, View interaction intent, Interaction ownership, Decision, Alternatives rejected, State/output mapping, and a Verification that names checks and results). Also look at the two failures that predate the rebuild: `app-schema.test.ts` (`defaultMode: "infinite"`) and the base-coverage Infinity overflow row.

**Files:**
- edit `e2e/product-mascot.spec.ts`:
  - Walk no longer turns the gimbal: it sets `body.turn` (Task 8). Add Cash jump to the actions test.
  - keep the gizmo test
  - add a `body.turn` test proving the slider and gizmo differ (light and shadow)
  - update the presentation ids and `prepareBranch`
- edit `e2e/product-mascot-export.spec.ts`: new bounds and pixel probes (the outline is now #972F20), plus SVG selectors for the V2 group ids and the gradient
- edit `e2e/product-mascot-runtime.spec.ts`: overflow probe colours
- edit `docs/toolcraft/agent-worklog.md`: add a Decision Trail entry, update the Renderer, View Interaction, Interaction Ownership, Controls and Performance decisions, and correct the line that claims a receipt exists

**Steps:**
> Started 2026-11-11 (worklog Iteration 18).

- [x] Browser specs: `openMascot` prepares the workspace from the saved defaults (expand sections, finite artboard, 100% and centred); V2 bounds and outline in the export spec; saved-default scene bounds and looping in the runtime spec. 75 of 77 passed, then playback passed after its fix. `canvas.infinity.svg-export` fails on a framework conflict.
- [x] Worklog Iterations 5–14 reformatted; the worklog checks pass.
- [x] `app-schema.test.ts`: expects the saved Infinity `defaultMode`. The base-coverage Infinity overflow row is a framework conflict (the clone test omits the renderer pipeline); left as is.
- [x] Browser specs split into 23 `e2e/product-<domain>.spec.ts` files (worklog Iteration 19), with the conditional rows' shown/hidden proof and the other evidence the product can supply. Evidence gaps went from 102 to 59, all framework-caused.
- [ ] `npm run verify:delivery`: now past the catalog and `docs:check`; stops at `ai:check` (SVG export calls the export docs prescribe). Blocked on four framework conflicts listed in Iteration 19's Risks.
- [ ] Run the steps listed under Verification below.

## Verification

```
Verification tier: Tier 4
Reason: first product delivery; renderer, rig, schema and persistence all change.
Run during development:
  - the exact vitest file for each task
  - pnpm ai:check before Tasks 7 and 8
  - npm run test:feature -- <acceptance-id> for each changed row once stable; rerun only failures
Run at completion:
  - one bare npm run verify:delivery
  - npm run dev, then a browser visual check of front, 3/4, side and back against Figma, plus the in-between angles
Skip: npm install (no dependency change), verify:perf, verify:kernel (unless the render-plan assessment requires a kernel benchmark)
```

Before renderer code (Task 4 onward), complete the contract's pre-code steps:
1. List the reachable controls and inputs.
2. Set the workload dimensions: the part count is fixed and there are 5 strands.
3. Note each pass's cost, frequency and invalidation (the scene cache stays keyed by settings).
4. Run `assessToolcraftRenderPlan` with zero errors.
5. Declare `sceneBounds` for each pass, with Infinity overflow coverage.

## Risks

- **Blocked test runs (resolved 2026-11-10):**
  - `test:feature` failed at `authority-preflight` because of `/Users/ifeanyi/Sandbox/node_modules`. That folder held only `.pnpm-workspace-state-v1.json`, left by a pnpm run from the Sandbox folder on 9 May 2026.
  - It was moved to the Trash as "Sandbox-node_modules (pnpm state, moved 2026-11-10)", and the preflight now passes.
  - Running pnpm from `/Users/ifeanyi/Sandbox` itself would recreate the folder, so run pnpm inside each project. Record this in the worklog in Task 9.
- **Turn ownership:** if the acceptance validators treat `body.turn` and `view.orbit` as one operation, show that the output differs (light and shadow) in the declaration's evidence. Don't drop either control without asking the user.
- **Back-quarter angles (about 120° to 160°) have no drawing.** They blend the side and back drawings, which may need the user's eye.
- **Rebuilding tubes can soften drawn details** at the limb ends. The 1px Hausdorff test in Task 2 guards this.
- **Saved workspaces and exported settings JSON** (for example "Welcome screen animation settings.json") use the old ids. The migration covers them, and any value it can't map is rejected rather than guessed.
