# Clutch mascot (Rive)

Character: Clutchman, the Clutch mascot (V2). A coral bean-shaped body with a five-strand hair tuft on top, noodle arms and legs, and a green-and-yellow striped headband and armbands. Every part is drawn in four layers: outline, base, shade and highlight, lit from the top left.

Source: Figma file hE0eJAkqKzj3K5JfIcpT8o, page Playground, frame "Clutchman Poses & parts V2" (node 146:1816). It contains:
- Standing (front)
- 3/4 (turned about 30 degrees, facing screen right)
- Side (node 177:2190, facing screen right; only the near Arm_L and Leg_L are drawn)
- Back
- Money Bag
- hands_fist
- hands_thumbs_up

The old frame Clutchman_poses (82:7560, Standing and Walking) is V1. Don't build from it, except for the face groups listed under Face.

Colours (hex only, never named colours):
- Body base #FD5D44, shade #C94631, outline #972F20, highlight #FFCBC1
- Ink #031E19: eyes and mouth. Eye highlight #FCFCFC
- Gear green #00880C, gear outline #006506. Green shade #004403 on the armbands and #006506 on the headband.
- Gear stripe yellow #FFCC64, stripe shade #8F6900, gear highlight #BAE2B7
- Money bag base #FFBE00, shade and creases #C69300 (Color/Warning/600), $ sign #5C4300 (Color/Warning/800)

Artboards:
- Mascot_Front, from Standing: idle, tired, celebrating, reactions.
- Mascot_ThreeQuarter, from 3/4.
- Mascot_Back, from Back.
- Mascot_Side, from Side: the walk. The far arm and leg aren't drawn; give them the near ones' shapes, behind the body and one step darker. Mascot Lab's SVG export of the side view, posed at the walk's contact pose (near leg and far arm forward, far leg and near arm back), can serve as the starting pose.
- refs/holding_cash.png is the peak pose of cash_jump (won). It is a picture to match, not a file to import. Open it before animating cash_jump.
- Tilted views (optional, approved by the user on 2026-11-14): Mascot_Top, Mascot_ThreeQuarterTop, Mascot_Bottom and Mascot_ThreeQuarterBottom. No drawing exists for these angles. Mascot Lab builds them in code from the drawings: it treats the body as a round volume, the headband as a ring round it and the hair as growing from the crown. Build each from Mascot Lab's SVG export at that angle (View gimbal tilted; Turn 30° for the 3/4 ones) and import it as exported, without redrawing. Their group order differs from the level views:
  - Looking down: Leg_L, Leg_R, Arm_L, Arm_R, Body (head, face), Headband, Hair (strand_1 to strand_5). The hair sits over the headband, growing out of the crown.
  - Looking up: Arm_L, Arm_R, Body (strands, head, face), Leg_L, Leg_R. The legs grow out of the underside. The headband shows as an arch until about 65° below, then is out of sight.
- refs/render_*.webp are AI 3D renders the user made from the mascot. They are references for these tilted angles only. Never import or trace them as art.

Part names (as in the V2 frame):
- Groups: Leg_L, Leg_R, Arm_L, Arm_R, Body, Headband.
  - Body holds Hair, head and face.
  - Headband sits above Body, outside it, but still moves with the body.
- Every part has four layers, named <part>_Outline, <part>_Base, <part>_Shade and <part>_Highlight. Back to front the order is Outline, Base, Shade, Highlight, so the outline sits under the base. Parts: leg_L, foot_L, arm_L, hand_open_L, head, strand_1 to strand_5, and the _R matches.
- Leg_L holds leg_L_* and foot_L_*. Arm_L holds arm_L_*, hand_open_L_* and ArmBand. The arm ends at the wrist, under the armband.
- ArmBand and Headband have three stripes, each with a Base and a Shade, plus one band_Outline and one band_Highlight. Gear moves as one piece.
- Hair: Strand 1 to Strand 5, each a group of four layers.
- Hands: hand_L holds hand_open_L, hand_fist_L and hand_thumbs_up_L, and hand_R the same. One is visible at a time; the default is hand_open. The fist and thumbs-up are drawn once (hands_fist, hands_thumbs_up). For the other side, use Mascot Lab's re-lit export rather than a flipped Figma copy, because flipping moves the shade onto the lit side.
- moneybag_L, moneybag_R: props for cash_jump, hidden by default. One bag is drawn (Money Bag); get the second the same way as the hands.
- _L is the limb on the left of the screen in the front view. Back is named by screen side too, so Back's Arm_L is the front view's Arm_R. In 3/4 and Side (both facing screen right), _L is the near side.
- Hair is drawn the same in every view. It stays as drawn when the mascot turns.
- Layer order back to front:
  - Front and Back: Leg_L, Leg_R, Arm_L, Arm_R, Body, Headband.
  - 3/4: Leg_L, Leg_R, Arm_R, Body, Headband, Arm_L. Arm_L is the near arm, in front of the body.
  - Side, as drawn: Leg_L, Body, Headband, Arm_L. The near arm is in front of the body. Put the far limbs (_R) first, behind everything.
- On 3/4 and Side the near arm lies over the body at the shoulder. It must look attached, with no outline across the body there.
- A limb over the body blends into it at any angle. Its outline fades in from nothing at the shoulder (or hip, or the hair at the crown) until the limb leaves the body's edge, and its shade and highlight start past that point. In Rive, give the first stretch of the outline a gradient from transparent to the outline colour.

Pivots: each group starts with 8px dots that mark its joints:
- shoulder_L, Elbow_L and Wrist_L
- Hip_L, Knee_L and Ankle_L
- the _R matches
- Hair_base, inside Hair

Put bones on the dots. Don't bind, animate or export the dots.

Face, on Mascot_Front and Mascot_ThreeQuarter: Body > face holds the eye groups and mouth groups, stacked and already lined up. Show exactly one eye group and one mouth group at a time, and hide the rest. The default is eyes_open and mouth_happy. They all arrive from Figma visible, so hide the rest first. Mascot_Back has no face. Mascot_Side has one eye and one mouth only.
- Each V2 view draws eyes_open and mouth_happy. mouth_happy includes a soft shadow, a second stroke that fades out.
- Every other expression is drawn in Faces_V2 (node 293:1448, front view only), one group per face, each with its eyes, Mouth and mouth_shadow: face_happy, face_Excited, face_satisfied, face_sleepy, face_disappointed, face_confused and face_angry. face_angry's eye group is still named eyes_tired in Figma; it holds eyes_angry.
- eyes_sad isn't drawn in V2 yet. Reuse the V1 group until it is.
- Eyes: eyes_open, eyes_blink, eyes_tired, eyes_sad, eyes_curious, eyes_angry
- Mouths: mouth_happy, mouth_excited, mouth_neutral, mouth_sad

Face presets (eyes + mouth, then where each is used):
- happy: eyes_open + mouth_happy. Idle.
- excited: eyes_open + mouth_excited. Celebrating, cash_jump and joined (goalHit, won, joined).
- satisfied: eyes_blink + mouth_happy. No state uses it.
- sleepy: eyes_tired + mouth_happy. timeOfDay night.
- disappointed: eyes_tired + mouth_sad. Tired.
- confused: eyes_curious + mouth_neutral. hasStepData false.
- sad: eyes_sad + mouth_sad. out, when the user fails a challenge or doesn't complete it.
- angry: eyes_angry + mouth_sad. No state uses it yet.
- The idle blink is eyes_blink for 0.12 seconds, then back to eyes_open.

Rig:
- Limbs have no separate upper and lower parts. Give each limb a two-bone chain on its pivot dots: shoulder, elbow and wrist, or hip, knee and ankle. Bind the layers' vertices to it with weights, so it bends like a rubber hose.
- Limb paths may need extra vertices to bend. Add them only by splitting existing segments, so the shape doesn't change. Add the same points to all four layers (Outline, Base, Shade, Highlight) so they stay aligned. Arms: points at a quarter, half and three quarters of the way from shoulder to wrist, on both long edges.
- Match the upper arms to Arm_L. On the front view Elbow_R is drawn 8px higher than Elbow_L, so put the right elbow bone level with the left.
- The body bone has no pivot dot. Root it at the bottom centre of the body.
- Body, face, hair and Headband follow the body bone rigidly. Each hair strand can get its own bone from Hair_base for follow-through.
- Feet follow the ankle. Armbands and hands follow the lower arm bone. Money bags follow their hand, with a little lag so they swing.
- On 3/4 and Side the near arm must look attached to the shoulder. Don't let its top end draw a line across the body.
- Rive can't re-light, so the drawn shade and highlight bend with the bones. Mascot Lab re-lights every part in code.

Rules:
- Never redraw or restyle my artwork. Only group, rename, rig and animate it.
- One step per prompt. Before changing anything, tell me what you plan to change.
- After each change, check the hierarchy and tell me what you did, by name.
- Change expressions by showing one face group and hiding the rest. Don't morph one into another.
- Only the face_* animations key the face groups. Body and reaction animations never touch the face.
- On the side view, draw far limbs one step darker (base in #C94631). It is the main depth cue.
- Leave hidden layers named Union alone and don't bind them.
- Loops must start and end on the same pose so they don't jump.
- Use view models, not legacy inputs.

View model (MascotVM): pace (number 0 to 150), hasStepData (boolean), timeOfDay (enum: morning, day, evening, night), gearHeadband (boolean), gearArmbands (boolean), goalHit, joined, won, out, tap (triggers).
