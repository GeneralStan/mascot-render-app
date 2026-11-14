# Clutch mascot: prompt pack

Run these in order, one per message. Check the result in Rive before the next one, and type End Prompt when the agent finishes each request. To run one, say: "Run prompt 3 from PROMPTS.md."

## 1. Inspect, change nothing
Look at the open Rive file. List every artboard and the full layer hierarchy of Mascot_Front, with names. Don't change anything. Then tell me: which parts are separate enough to rig, which are merged and need splitting, and anything missing for an arm, leg, head and face rig.

## 2. Organise the parts
On Mascot_Front, rename and group the parts to match the names in CLAUDE.md. Set origins: the body's at the bottom centre of the body, each arm's at its shoulder, each leg's at its hip, the hair's at its base. Then hide every face group except eyes_open and mouth_happy, hide both fist parts and both money bags, and show hand_open on both hands. Don't move or restyle anything. Show me the new hierarchy.

## 3. Rig the front view
On Mascot_Front, add a skeleton: a root bone at the hips and a body bone up to the head. Give each arm and each leg a two-bone chain: shoulder to elbow to wrist, hip to knee to ankle. Before binding, give every arm path its elbow points as CLAUDE.md describes, then show me that the outline hasn't moved. Then bind the body, face, hair and headband rigidly to the body bone. Bind each limb's fill and outline paths to its chain with weights, so it bends smoothly at the elbow or knee. Tie each armband and hand group to its lower arm bone, and each money bag to its hand. List which parts are bound to which bones.

## 4. Idle and faces
Create these linear animations on Mascot_Front.
idle: 2 seconds, looping. The body squashes 2% wider and shorter and settles, like breathing. The hair lags the body slightly. The arms sway 3 degrees. Ease in and out. Start and end on the same pose. Don't key the face.
One face animation per preset in CLAUDE.md: face_happy, face_satisfied, face_sleepy, face_disappointed, face_confused, face_sad. Each is a single frame that shows that preset's eye and mouth groups and hides all the others.
face_happy_blink: 3 seconds, looping. The happy face, with eyes_blink shown instead of eyes_open from 2.6 to 2.72 seconds.

## 5. Walk cycle (side view)
On Mascot_Side, do steps 2 and 3 for the side view. Then create a linear animation called walk: 1 second, looping, walking on the spot. The imported pose is the first contact pose: leg_L and arm_R forward, leg_R and arm_L back. At 0.5 seconds, mirror it: leg_R and arm_L forward, leg_L and arm_R back. Passing poses at 0.25 and 0.75 seconds, with the swinging foot lifted. The body is lowest just after each contact and highest at passing. The hair follows the bob slightly late. Keep the layer order from CLAUDE.md the whole time. Start and end on the same pose.

## 6. Tired and celebrating
On Mascot_Front, create two linear animations. Don't key the face in either.
tired: 2.4 seconds, looping. The body squashed lower, arms hanging further down, slower breathing than idle.
celebrating: 1.2 seconds, plays once. Squash down, jump with both arms up, land with a small squash, and end on the idle pose.

## 6b. Cash jump (won)
Open refs/holding_cash.png first. It is the peak pose of this animation. On Mascot_Front, create a linear animation called cash_jump: 1.6 seconds, plays once. Don't key the face.
0 to 0.25 seconds: squash down, show both money bags, switch both hands to fist.
0.25 to 0.6 seconds: jump into the peak pose: arms raised in an arc holding the bags above the shoulders, legs spread wide.
0.6 to 0.9 seconds: float near the peak, bags swinging slightly behind the hands.
0.9 to 1.3 seconds: land with a squash on the same ground line as idle, bags lagging and settling.
1.3 to 1.6 seconds: return to the idle pose, hands open, bags hidden.
Tell me where the rig can't reach the peak pose instead of forcing it.

## 7. One-off reactions
On Mascot_Front, create three short one-shot animations that move only the arms and hands. Don't key the face.
wave: 0.8 seconds, arm_R.
thumbs_up: 0.8 seconds. arm_R lifts forward. The hook at the end of the hand stays pointing up as the thumb, while the rest of the hand curls in slightly to form a fist. If the curl needs a hand bone, propose one at the wrist before adding it.
shrug: 1 second, both arms lift and drop.
Each ends on the idle pose.

## 8. View model and state machine
Create a view model called MascotVM with the properties listed in CLAUDE.md and bind it to a state machine called Mascot. Build four layers:
1. Body: Entry goes to Idle. Idle to Walking when pace is 40 to 99; to Tired when pace is under 40; Walking and Tired swap when pace crosses 40; back to Idle when pace is 100 or more or hasStepData is false. From any state, goalHit goes to Celebrating and won goes to CashJump. Each plays once and then returns to the state pace picks.
2. Reactions: tap plays wave, joined plays thumbs_up, out plays shrug, each once.
3. Face: plays the face animations from step 4. Highest priority first: Celebrating and CashJump show face_satisfied; out shows face_sad for 3 seconds; Tired shows face_disappointed; hasStepData false shows face_confused; timeOfDay night shows face_sleepy; otherwise face_happy_blink.
4. Gear: gearHeadband and gearArmbands show or hide the gear.
Use 0.2 second blends between looping states. Describe every state and transition back to me in a list.

## 9. Test it
Run the Mascot state machine and walk me through what plays on each layer at each step: pace 0, pace 20, pace 70, pace 110, then fire goalHit, then won, then tap, then out, then set hasStepData to false, then set timeOfDay to night. Check for dead ends: any state with no way out, or two transitions that could fire at the same time. Fix nothing yet; list the problems.

## 10. Capture tool (after the state machine works)
Inside clutch-mascot, run: npx @pixel-point/toolcraft create mascot-capture --agent claude-code
Then work inside mascot-capture and treat its AGENTS.md and docs/toolcraft as the contract. Build a capture tool for the Clutch mascot:
- Canvas: render a Rive runtime file (.riv) with Rive's low-level web runtime (@rive-app/canvas-advanced), advancing time yourself so every PNG and video frame matches the timeline exactly. Let me load the .riv through an upload control and keep the last one loaded. Pick the artboard (Mascot_Front or Mascot_Side) and play the Mascot state machine bound to MascotVM.
- Controls: artboard picker, pace slider (0 to 150), hasStepData switch, timeOfDay picker, gear switches, one button per trigger (goalHit, joined, won, out, tap), and a scrubber for the animation that is playing.
- Export: transparent PNG with Background off, on a 1080 x 1080 canvas, named by artboard, state and pace (for example side_walking_pace70.png). MP4 or WebM of the current state. A 'Save 12 frames' action that saves evenly spaced PNGs of the current animation.
Run it locally and give me the address.

## When something looks wrong
Describe what you see, not how to fix it. For example:
In the walk animation, the left knee bends backwards at 0.25 seconds. Keep everything else exactly as it is. Tell me the cause before changing anything.
