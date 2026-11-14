# Clutchman: drawings to add in Figma

Add these inside the **Clutchman_poses** frame (`82:7560`), next to the existing **Standing** and **Walking** groups. Draw them at the same scale as Standing and line them up with it (same floor line and head height), so I can read their positions directly.

Name the groups and layers exactly as written below; I find them by name.

Until these drawings exist, the app builds each part from your current drawings. When you add them, the controls stay the same and the new art swaps in.

## 1. Back view — group `Back`

The mascot seen straight from behind, standing like Standing.

| Layer | What to draw |
| --- | --- |
| `head` | The head from behind: same outline as the front head, no face. |
| `hair` | The hair tuft from behind. If you also split the hair into strands (section 3), make `hair` a group of `strand 1`, `strand 2`… here too. |
| `headband` | The back of the headband, e.g. where it ties or clasps. |
| `outline` (optional) | Same outline treatment as Standing, if the back needs its own shading. |

You don't need back-view arms or legs. The rig mirrors your Standing limbs and puts them in the right order, front to back.

## 2. Hand variants — group `Hands`

Draw each hand like the current one: **12px strokes with round caps**, starting exactly at the wrist point of the **Right arm** in Standing (the end of the forearm stroke). The rig attaches every variant at that point and mirrors it for the left arm.

| Group | Description |
| --- | --- |
| `hand / open` | Your current hand (copy it here so all variants sit together). |
| `hand / palm` | Palm facing the viewer (fingers and thumb on the opposite side to `open`). |
| `hand / fist` | Closed fist. |
| `hand / point` | Index finger pointing along the forearm. |

Each finger or thumb should be its own stroke, starting at the wrist.

## 3. Hair as strands — inside the Standing group

Replace the single `hair` shape with a group named `hair` that holds one closed shape per spike:

- Name them `strand 1`, `strand 2`, … from left to right.
- Each strand's base should reach down **into** the headband, so the band covers where it joins.
- Keep the outline style you use now. Put together, the strands should look exactly like the current hair, so nothing changes at rest.

I bend each strand from its base, so the wind makes them flow separately.

## When you're done

Tell me, and I'll re-read the frame through the Desktop Bridge plugin and wire the new art in.
