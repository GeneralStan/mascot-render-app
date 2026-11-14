# Prompt: rebuild clutch-mascot.riv from the V2 art

Paste everything below the line into the Rive agent's chat. It covers the rebuild only. When it's done, carry on with PROMPTS.md from prompt 3.

---

You're working on the Rive file for Clutchman, the mascot of the Clutch app. Read `clutch-mascot/CLAUDE.md` first. It is the rulebook: part names, colours, layer order, pivots, rig rules and the view model. This prompt only explains what changed and the order to rebuild in.

## Why we're rebuilding

`clutch-mascot/clutch-mascot.riv` was set up on the V1 drawing. V1 is gone. Its single artboard, Mascot_Front, came from `clutch-mascot/figma/Standing.svg` (V1) and has:
- two layers per part, named like `arm_L(fill)` and `arm_L(stroke)`
- PROMPTS.md prompts 1 and 2 already applied: renames, origins (body at bottom centre, shoulders, hips, hair base) and visibility
- extra vertices split into the arm paths

None of that matches V2, so we start again from the V2 files. As far as I know there are no bones or animations yet. Check, and tell me if you find any.

V2 differs from V1 like this:
- **Four layers per part:** every part has `<part>_Outline`, `<part>_Base`, `<part>_Shade` and `<part>_Highlight`, back to front in that order.
- **New groups:** the groups are Leg_L, Leg_R, Arm_L, Arm_R, Body and Headband. Headband sits outside Body but moves with it.
- **Four views:** Standing, 3/4, Side and Back each get their own artboard.
- **New faces:** the faces are V2 drawings now (see Faces below).

## Source files

V2 was exported from Figma (file `hE0eJAkqKzj3K5JfIcpT8o`, frame "Clutchman Poses & parts V2", node 146:1816) to `clutch-mascot/figma/v2/`. The SVG ids are the Figma layer names.

| File | Figma node | Use |
| --- | --- | --- |
| `Standing.svg` | 169:1844 | Mascot_Front |
| `ThreeQuarter.svg` | 169:1845 | Mascot_ThreeQuarter |
| `Side.svg` | 177:2190 | Mascot_Side (near limbs only) |
| `Back.svg` | 169:2019 | Mascot_Back (no face) |
| `hands_fist.svg`, `hands_thumbs_up.svg` | 171:2174, 170:2173 | hand_fist_L, hand_thumbs_up_L |
| `MoneyBag.svg` | 170:2155 | moneybag_L |
| `Faces_V2.svg` | 293:1448 | every eye and mouth group |

**Duplicate names:** where Figma has two layers with the same name, the SVG adds `_2`, `_3` and so on, for example `Eye_2` and `head_Highlight_2`. Rename them back to the Figma name, so the two eyes are both `Eye`.

**Right-hand props:** CLAUDE.md says not to flip the Figma hands, fist, thumbs-up and money bag for the right side. Flipping puts the shade on the lit side. Take them from Mascot Lab instead:
1. Run `npm run dev` in the project root and open http://localhost:3002.
2. Set the right arm's Hand to Fist, Thumbs up, or Money Bag on.
3. Set Image Export to SVG and export.
4. Take only the `hand_fist_R`, `hand_thumbs_up_R` or `moneybag_R` group from that file.
5. Rename its layers to the four-layer names.

## Faces

Faces_V2 replaces the line in CLAUDE.md that used to say to reuse the V1 face groups, and CLAUDE.md's Face section now matches it. Every expression except the sad eyes is drawn in V2. They're laid out side by side, not stacked on the head:

| Figma group | Eyes | Mouth | Used for |
| --- | --- | --- | --- |
| face_happy | eyes_open | mouth_happy | Idle |
| face_Excited | eyes_open | mouth_excited (open, filled grin) | goalHit, won, joined |
| face_satisfied | eyes_blink (closed, curved up) | mouth_happy | no state; also the idle blink's eyes |
| face_sleepy | eyes_tired | mouth_happy | timeOfDay night |
| face_disappointed | eyes_tired | mouth_sad (frown) | Tired |
| face_confused | eyes_curious | mouth_neutral (flat, tilted line) | hasStepData false |
| face_angry | eyes_angry (still named eyes_tired in Figma; rename it) | mouth_sad | no state yet |

Every mouth has a `mouth_shadow`: a soft stroke in #687773 at 20% opacity. It is part of the drawing; keep it.

The sad face (out) is eyes_sad + mouth_sad. eyes_sad isn't drawn in V2 yet, so reuse the V1 eyes_sad group from the old Mascot_Front until it is.

Each Faces_V2 group is one face: keep its eyes and mouth together as drawn. Stack the faces on Standing's face so each eye group is centred on Standing's eyes_open and each mouth sits under its eyes at the distance drawn in its face. Don't scale or reshape them.

Faces_V2 draws the front view only. On Mascot_ThreeQuarter, use the 3/4 drawing's own eyes_open and mouth_happy. For the other expressions there, use Mascot Lab's SVG export at Turn 30° with that face picked (Face section, or Auto with the View Model set to the state). Mascot Lab places Faces_V2 on the turned head. Mascot_Side has one eye and one mouth only, from Side.svg.

## Steps

Do one step per message. Before each step, tell me what you plan to change. After it, check the hierarchy and report what you did, by name.

1. **Back up, then inspect.**
   - Save a copy of the file as `clutch-mascot/clutch-mascot-v1.riv`.
   - In the working file, list every artboard, its full hierarchy, any bones and any animations.
   - Change nothing else.
2. **Mascot_Front from Standing.svg.**
   - Rename the old V1 artboard to `Mascot_Front_V1` and leave it alone. Don't delete it.
   - Import Standing.svg as a new Mascot_Front.
   - Make the groups, names and back-to-front order match CLAUDE.md.
   - Set origins: the body at the bottom centre of the body, each arm at its shoulder dot, each leg at its hip dot, the hair at Hair_base.
   - Add hand_fist_L, hand_thumbs_up_L and moneybag_L, and the _R versions from Mascot Lab, at the wrists. Hide them all except hand_open.
   - Show only eyes_open and mouth_happy.
3. **Faces on Mascot_Front.** Bring in the Faces_V2 groups as described above, stacked in Body > face, all hidden except eyes_open and mouth_happy. Name each group by its eyes or mouth (eyes_blink, mouth_excited and so on), and rename face_angry's eyes to eyes_angry.
4. **Bend points.** On Mascot_Front, split the limb paths as the Rig section of CLAUDE.md describes:
   - Only split existing segments.
   - Add the same points to all four layers.
   - Show me that the outline hasn't moved.
5. **Mascot_ThreeQuarter** from ThreeQuarter.svg: same as step 2, with the 3/4 layer order from CLAUDE.md, where Arm_L is in front of the body. The near arm must look attached at the shoulder, with no outline across the body.
6. **Mascot_Back** from Back.svg: same as step 2. There is no face. Back's Arm_L is the front view's Arm_R, because sides are named by screen side.
7. **Mascot_Side** from Side.svg.
   - Add the far limbs (_R): copies of the near ones' shapes, behind everything, one step darker, with base #C94631. That darkening is the one colour change allowed; don't change anything else.
   - Mascot Lab's SVG export of the side view, posed at the walk's contact pose, can be the starting pose.
8. **Check.** List all four artboards' hierarchies side by side and point out anything that doesn't match CLAUDE.md.
9. **Tilted views (optional, only when I ask).** Mascot_Top, Mascot_ThreeQuarterTop, Mascot_Bottom and Mascot_ThreeQuarterBottom come from Mascot Lab's SVG export at that angle. CLAUDE.md lists their group order (from above, Hair is its own group over Headband). Import each as exported and rename its layers to the four-layer names. Don't redraw anything.

## Rules

These come from CLAUDE.md:
- Never redraw or restyle the artwork. Only import, group, rename, position, rig and animate it.
- Leave hidden layers named Union alone and don't bind them. In Faces_V2, the visible Union layers are the drawn eyes, so keep them.
- Don't bind, animate or export the 8px pivot dots.
- Use hex colours only.
- Use view models, not legacy inputs.

## After the rebuild

Carry on with PROMPTS.md from prompt 3 (rig), artboard by artboard. Where PROMPTS.md says "fill and outline paths", it means all four layers.

Use the face presets in CLAUDE.md. They already include face_excited and face_angry.
