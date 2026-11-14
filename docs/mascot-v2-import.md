# Mascot V2 art import

`src/app/mascot/mascot-v2-parts.ts` is generated from the Clutch Figma file
(`hE0eJAkqKzj3K5JfIcpT8o`), frame "Clutchman Poses & parts V2" (`146:1816`).
Regenerate it after the art changes in Figma. Don't edit it by hand.

The export goes straight from Figma to disk, so no path data is retyped:

1. Save the three scripts below in a scratch folder outside `src/`.
2. Start the receiver. It saves the first upload and exits. The Desktop Bridge plugin may only call
   `localhost` on ports 9223 to 9232; 9223 to 9226 are often taken by MCP servers, so 9230 is the default.

   ```sh
   node receive.mjs "$PWD/figma-v2-raw.json" 9230
   ```

3. With the Figma Desktop Bridge plugin open in the Clutch file, run `extract-v2.figma.js` through the
   figma-console `figma_execute` tool (timeout 60000). It replies with the byte count it uploaded.
4. Generate the module, then run its test:

   ```sh
   node generate-v2-parts.mjs figma-v2-raw.json /Users/ifeanyi/Sandbox/Clutch/src/app/mascot/mascot-v2-parts.ts
   npx vitest run src/app/mascot/mascot-v2-parts.test.ts
   ```

The generator stops on anything it doesn't recognise, so a renamed or restyled layer is caught there
instead of being guessed. These things fail it:
- a layer name without `_Outline`, `_Base`, `_Shade` or `_Highlight`
- a missing pivot dot
- a second fill or stroke
- a stroke not centred on the path

## What gets exported

- **Views:** Standing becomes `front`, 3/4 becomes `threeQuarter`, Back becomes `back`.
  - Rig space is per view: x = 0 at the centre of the head, y = 0 on the floor (the bottom of the feet),
    and y grows downward.
  - Groups, parts and layers keep Figma's paint order, back to front.
- **Pivot dots:** each dot becomes a point at its centre.
- **Props:** Money Bag, hands_fist and hands_thumbs_up. They are relative to the top-left of their own
  group.
- **Fills with several colours:** the eyes, and the bag with its $ sign. Each is split into one shape
  per colour region.
- **Gradient strokes:** the mouth's soft shadow keeps its two stops, and its start and end points are
  stored in rig space.

## receive.mjs

```js
// One-shot local receiver for the Figma bridge export: saves the first POST body, then exits.
import http from "node:http";
import fs from "node:fs";

const [outPath, portArg = "9230"] = process.argv.slice(2);
if (!outPath) throw new Error("usage: node receive.mjs <out.json> [port]");
const port = Number(portArg);

const servers = [];
const handler = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (req.method !== "POST") { res.writeHead(405); res.end(); return; }
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    fs.writeFileSync(outPath, body);
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`saved ${body.length} bytes`);
    console.log(`saved ${body.length} bytes to ${outPath}`);
    setTimeout(() => process.exit(0), 200);
  });
};
for (const host of ["127.0.0.1", "::1"]) {
  const server = http.createServer(handler);
  server.on("error", (error) => console.log(`${host}: ${error.code}`));
  server.listen(port, host, () => console.log(`listening on ${host}:${port}`));
  servers.push(server);
}
setTimeout(() => { console.log("timed out waiting for the export"); process.exit(1); }, 300_000);
```

## extract-v2.figma.js (runs inside Figma)

```js
// Runs inside Figma (Desktop Bridge figma_execute). Reads frame 146:1816 and POSTs
// the V2 mascot art as JSON to a local receiver. Coordinates are view-relative:
// x = 0 at the view's head centre, y = 0 at the floor (bottom of the feet).
const FRAME_ID = "146:1816";
const ENDPOINT = "http://localhost:9230/";
const VIEWS = { Standing: "front", "3/4": "threeQuarter", Side: "side", Back: "back" };
const PROPS = { "Money Bag": "moneyBag", hands_fist: "handFist", hands_thumbs_up: "handThumbsUp" };

const r3 = (v) => Math.round(v * 1000) / 1000;
const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
const mul = (m, x, y) => [m[0][0] * x + m[0][1] * y + m[0][2], m[1][0] * x + m[1][1] * y + m[1][2]];
const invert = ([[a, b, c], [d, e, f]]) => {
  const det = a * e - b * d;
  return [[e / det, -b / det, (b * f - c * e) / det], [-d / det, a / det, (c * d - a * f) / det]];
};
const fail = (node, why) => { throw new Error(`${node.name} (${node.id}): ${why}`); };
const solid = (p) => (p.opacity !== undefined && p.opacity < 1 ? { color: hex(p.color), alpha: r3(p.opacity) } : { color: hex(p.color) });

function convertPath(data, m, origin) {
  const tokens = data.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (!/^[MLQCZ]$/.test(cmd)) throw new Error(`unsupported path command ${cmd}`);
    out.push(cmd);
    const nums = [];
    while (i < tokens.length && !/^[A-Za-z]$/.test(tokens[i])) nums.push(Number(tokens[i++]));
    if (nums.length % 2) throw new Error("odd coordinate count");
    for (let k = 0; k < nums.length; k += 2) {
      const [x, y] = mul(m, nums[k], nums[k + 1]);
      out.push(r3(x - origin[0]), r3(y - origin[1]));
    }
  }
  return out.join(" ");
}

function linearGradient(node, paint, origin) {
  const inv = invert(paint.gradientTransform);
  const at = (gx, gy) => {
    const [u, v] = mul(inv, gx, gy);
    const [x, y] = mul(node.absoluteTransform, u * node.width, v * node.height);
    return [r3(x - origin[0]), r3(y - origin[1])];
  };
  return {
    from: at(0, 0.5),
    to: at(1, 0.5),
    stops: paint.gradientStops.map((s) => ({ offset: r3(s.position), color: hex(s.color), alpha: r3(s.color.a) })),
    ...(paint.opacity !== undefined && paint.opacity < 1 ? { alpha: r3(paint.opacity) } : {}),
  };
}

function strokeOf(node, origin) {
  const paints = Array.isArray(node.strokes) ? node.strokes.filter((p) => p.visible !== false) : [];
  if (!paints.length) return undefined;
  if (paints.length > 1) fail(node, "several strokes");
  for (const key of ["strokeWeight", "strokeCap", "strokeJoin"]) if (node[key] === figma.mixed) fail(node, `mixed ${key}`);
  const base = { width: r3(node.strokeWeight), cap: node.strokeCap, join: node.strokeJoin, align: node.strokeAlign };
  const [paint] = paints;
  if (paint.type === "SOLID") return { ...base, ...solid(paint) };
  if (paint.type === "GRADIENT_LINEAR") return { ...base, gradient: linearGradient(node, paint, origin) };
  return fail(node, `unsupported stroke ${paint.type}`);
}

function fillOf(node) {
  if (node.fills === figma.mixed) return "MIXED";
  const paints = node.fills.filter((p) => p.visible !== false);
  if (!paints.length) return undefined;
  if (paints.length > 1 || paints[0].type !== "SOLID") fail(node, "unsupported fill");
  return solid(paints[0]);
}

function regionShapes(node, origin) {
  const { vertices, segments, regions } = node.vectorNetwork;
  const m = node.absoluteTransform;
  const pt = (x, y) => { const [ax, ay] = mul(m, x, y); return `${r3(ax - origin[0])} ${r3(ay - origin[1])}`; };
  return regions.map((region) => {
    let d = "";
    for (const loop of region.loops) {
      let current = null;
      loop.forEach((segmentIndex, k) => {
        const s = segments[segmentIndex];
        let a = s.start, b = s.end, ta = s.tangentStart, tb = s.tangentEnd;
        const next = segments[loop[(k + 1) % loop.length]];
        const touchesNext = (v) => v === next.start || v === next.end;
        const flip = current === null ? loop.length > 1 && touchesNext(a) && !touchesNext(b) : current !== a;
        if (flip) { [a, b] = [b, a]; [ta, tb] = [tb, ta]; }
        const A = vertices[a], B = vertices[b];
        if (current === null) d += `M ${pt(A.x, A.y)} `;
        const straight = (!ta || (ta.x === 0 && ta.y === 0)) && (!tb || (tb.x === 0 && tb.y === 0));
        d += straight ? `L ${pt(B.x, B.y)} ` : `C ${pt(A.x + ta.x, A.y + ta.y)} ${pt(B.x + tb.x, B.y + tb.y)} ${pt(B.x, B.y)} `;
        current = b;
      });
      d += "Z ";
    }
    const fills = (region.fills || []).filter((p) => p.visible !== false);
    if (fills.length !== 1 || fills[0].type !== "SOLID") fail(node, "region without one solid fill");
    const fill = solid(fills[0]);
    return {
      d: d.trim(),
      fill: fill.color,
      ...(fill.alpha ? { fillAlpha: fill.alpha } : {}),
      ...(region.windingRule === "EVENODD" ? { fillRule: "evenodd" } : {}),
    };
  });
}

function vectorShapes(node, origin) {
  const opacity = node.opacity < 1 ? { opacity: r3(node.opacity) } : {};
  const stroke = strokeOf(node, origin);
  const fill = fillOf(node);
  if (fill === "MIXED") {
    if (stroke) fail(node, "mixed fill with a stroke");
    return regionShapes(node, origin).map((shape) => ({ ...shape, ...opacity }));
  }
  const d = node.vectorPaths.map((p) => convertPath(p.data, node.absoluteTransform, origin)).join(" ");
  const evenodd = fill && node.vectorPaths.some((p) => p.windingRule === "EVENODD");
  return [{
    d,
    ...(fill ? { fill: fill.color } : {}),
    ...(fill && fill.alpha ? { fillAlpha: fill.alpha } : {}),
    ...(evenodd ? { fillRule: "evenodd" } : {}),
    ...(stroke ? { stroke } : {}),
    ...opacity,
  }];
}

function tree(node, origin) {
  if (node.visible === false) return null;
  if (node.type === "GROUP" || node.type === "FRAME") {
    return { name: node.name, id: node.id, kind: "group", children: node.children.map((c) => tree(c, origin)).filter(Boolean) };
  }
  if (node.type === "ELLIPSE") {
    const b = node.absoluteBoundingBox;
    return { name: node.name, id: node.id, kind: "pivot", at: [r3(b.x + b.width / 2 - origin[0]), r3(b.y + b.height / 2 - origin[1])] };
  }
  if (node.type === "VECTOR") return { name: node.name, id: node.id, kind: "vector", shapes: vectorShapes(node, origin) };
  return fail(node, `unexpected node type ${node.type}`);
}

const frame = await figma.getNodeByIdAsync(FRAME_ID);
const payload = { source: { fileKey: figma.fileKey, frameId: FRAME_ID, frameName: frame.name }, views: {}, props: {} };
for (const child of frame.children) {
  if (VIEWS[child.name]) {
    const head = child.findOne((n) => n.name === "head_Base").absoluteBoundingBox;
    const feet = child.findAll((n) => /^foot_[LR]_Base$/.test(n.name)).map((n) => n.absoluteBoundingBox);
    const origin = [head.x + head.width / 2, Math.max(...feet.map((b) => b.y + b.height))];
    payload.views[VIEWS[child.name]] = { name: child.name, id: child.id, origin: origin.map(r3), tree: tree(child, origin) };
  } else if (PROPS[child.name]) {
    const b = child.absoluteBoundingBox;
    const origin = [b.x, b.y];
    payload.props[PROPS[child.name]] = { name: child.name, id: child.id, size: [r3(b.width), r3(b.height)], tree: tree(child, origin) };
  } else {
    throw new Error(`unexpected top-level group ${child.name}`);
  }
}
const body = JSON.stringify(payload);
const response = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "text/plain" }, body });
return { status: response.status, reply: await response.text(), bytes: body.length, views: Object.keys(payload.views), props: Object.keys(payload.props) };
```

## generate-v2-parts.mjs

```js
// Turns the raw Figma export (extract-v2.figma.js) into src/app/mascot/mascot-v2-parts.ts.
// Strict: anything outside the expected V2 structure stops the run instead of being guessed.
import fs from "node:fs";

const [rawPath, outPath] = process.argv.slice(2);
if (!rawPath || !outPath) throw new Error("usage: node generate-v2-parts.mjs <figma-v2-raw.json> <mascot-v2-parts.ts>");
const raw = JSON.parse(fs.readFileSync(rawPath, "utf8"));

const ROLE = /^(.*?)[_-](Outline|Base|Shade|Highlight|crease|outline|base|shade|highlight)$/u;
// Stripe layers are band_1_Base etc.; also accept band1_Base and "band 2_Base", which Figma has used.
const STRIPE = /^band[\s_]?(\d)_(Base|Shade)$/u;
const GROUPS = ["Leg_L", "Leg_R", "Arm_L", "Arm_R", "Body", "Headband"];
const PIVOTS = ["shoulder_L", "Elbow_L", "Wrist_L", "shoulder_R", "Elbow_R", "Wrist_R", "Hip_L", "Knee_L", "Ankle_L", "Hip_R", "Knee_R", "Ankle_R", "Hair_base"];
/** Views that draw only the near (_L) limbs: the side view. */
const NEAR_ONLY = new Set(["side"]);
const VIEW_KEYS = ["front", "threeQuarter", "side", "back"];
const PARTS = ["leg_L", "foot_L", "leg_R", "foot_R", "arm_L", "hand_open_L", "armband_L", "arm_R", "hand_open_R", "armband_R", "head", "strand_1", "strand_2", "strand_3", "strand_4", "strand_5", "headband"];

const point = ([x, y]) => ({ x, y });
function shape(s, where) {
  const allowed = new Set(["d", "fill", "fillRule", "stroke", "opacity"]);
  for (const key of Object.keys(s)) if (!allowed.has(key)) throw new Error(`${where}: unsupported shape key ${key}`);
  const out = { d: s.d };
  if (s.fill) out.fill = s.fill;
  if (s.fillRule) out.fillRule = s.fillRule;
  if (s.stroke) {
    const { width, cap, join, align, color, alpha, gradient } = s.stroke;
    if (align !== "CENTER") throw new Error(`${where}: stroke align ${align}`);
    if (alpha !== undefined) throw new Error(`${where}: stroke paint opacity is not supported`);
    out.stroke = { width, cap, join };
    if (color) out.stroke.color = color;
    if (gradient) {
      if (gradient.alpha !== undefined) throw new Error(`${where}: gradient paint opacity is not supported`);
      out.stroke.gradient = { from: point(gradient.from), to: point(gradient.to), stops: gradient.stops };
    }
  }
  if (s.opacity !== undefined) out.opacity = s.opacity;
  return out;
}
function layer(vector, where) {
  const stripe = vector.name.match(STRIPE);
  const role = vector.name.match(ROLE);
  if (!role) throw new Error(`${where}: no role in layer name ${vector.name}`);
  return { role: role[2].toLowerCase(), ...(stripe ? { stripe: Number(stripe[1]) } : {}), shapes: vector.shapes.map((s) => shape(s, `${where}/${vector.name}`)) };
}
const partOf = (vectorName) => vectorName.match(ROLE)[1].replace(/^band$/u, "band");

function readView(key, view) {
  const pivots = {}, parts = {}, groups = [];
  let face;
  const addLayer = (part, vector, where) => { (parts[part] ??= []).push(layer(vector, where)); };
  for (const group of view.tree.children) {
    if (!GROUPS.includes(group.name)) throw new Error(`${key}: unexpected group ${group.name}`);
    const order = [];
    const note = (part) => { if (!order.includes(part)) order.push(part); };
    const side = group.name.slice(-2);
    for (const child of group.children) {
      const where = `${key}/${group.name}/${child.name}`;
      if (child.kind === "pivot") { pivots[child.name] = point(child.at); continue; }
      if (child.kind === "vector" && group.name === "Headband") { addLayer("headband", child, where); note("headband"); continue; }
      if (child.kind === "vector") { const part = partOf(child.name); addLayer(part, child, where); note(part); continue; }
      if (child.name === "ArmBand") {
        for (const v of child.children) addLayer(`armband${side}`, v, `${where}/${v.name}`);
        note(`armband${side}`);
        continue;
      }
      if (group.name === "Body" && child.name === "Hair") {
        for (const strand of child.children) {
          if (strand.kind === "pivot") { pivots[strand.name] = point(strand.at); continue; }
          const n = strand.name.match(/^Strand (\d)$/u)?.[1];
          if (!n) throw new Error(`${where}: unexpected hair child ${strand.name}`);
          for (const v of strand.children) {
            if (partOf(v.name) !== `strand_${n}`) throw new Error(`${where}/${strand.name}: layer ${v.name} does not match`);
            addLayer(`strand_${n}`, v, `${where}/${strand.name}/${v.name}`);
          }
          note(`strand_${n}`);
        }
        continue;
      }
      if (group.name === "Body" && child.name === "head") { for (const v of child.children) addLayer("head", v, `${where}/${v.name}`); note("head"); continue; }
      if (group.name === "Body" && child.name === "face") {
        const eyes = child.children.find((c) => c.name === "eyes_open");
        const mouths = child.children.filter((c) => c.name === "mouth_happy");
        if (!eyes || mouths.length !== 2 || child.children.length !== 3) throw new Error(`${where}: expected eyes_open and two mouth_happy layers`);
        face = {
          eyes_open: eyes.children.flatMap((v) => v.shapes.map((s) => shape(s, `${where}/eyes_open`))),
          mouth_happy: mouths.flatMap((v) => v.shapes.map((s) => shape(s, `${where}/mouth_happy`))),
        };
        note("face");
        continue;
      }
      throw new Error(`${where}: unexpected child`);
    }
    groups.push({ name: group.name, parts: order });
  }
  const nearOnly = NEAR_ONLY.has(key);
  const drawn = (name) => !(nearOnly && name.endsWith("_R"));
  for (const name of PIVOTS.filter(drawn)) if (!pivots[name]) throw new Error(`${key}: missing pivot ${name}`);
  for (const name of PARTS.filter(drawn)) if (!parts[name]) throw new Error(`${key}: missing part ${name}`);
  for (const name of Object.keys(parts)) if (!PARTS.includes(name)) throw new Error(`${key}: unexpected part ${name}`);
  const orderedPivots = Object.fromEntries(PIVOTS.filter((n) => pivots[n]).map((n) => [n, pivots[n]]));
  const orderedParts = Object.fromEntries(PARTS.filter((n) => parts[n]).map((n) => [n, parts[n]]));
  return { figmaNode: view.id, figmaOrigin: point(view.origin), nearOnly, groups, pivots: orderedPivots, parts: orderedParts, ...(face ? { face } : {}) };
}

function readProp(key, prop) {
  const pivots = {};
  const layers = [];
  for (const v of prop.tree.children) {
    if (v.kind === "pivot") { pivots[v.name] = point(v.at); continue; }
    if (v.kind !== "vector") throw new Error(`${key}: unexpected ${v.kind} ${v.name}`);
    layers.push(layer(v, `${key}/${v.name}`));
  }
  return {
    figmaNode: prop.id,
    size: { width: prop.size[0], height: prop.size[1] },
    ...(Object.keys(pivots).length ? { pivots } : {}),
    layers,
  };
}

const views = Object.fromEntries(VIEW_KEYS.map((k) => [k, readView(k, raw.views[k])]));
const props = Object.fromEntries(["moneyBag", "handFist", "handThumbsUp"].map((k) => [k, readProp(k, raw.props[k])]));

const j = (value) => JSON.stringify(value);
const lines = [];
const emitView = (key, view) => {
  lines.push(`  ${key}: {`);
  lines.push(`    figmaNode: ${j(view.figmaNode)},`);
  lines.push(`    figmaOrigin: ${j(view.figmaOrigin)},`);
  lines.push(`    nearOnly: ${view.nearOnly},`);
  lines.push(`    groups: [`);
  for (const g of view.groups) lines.push(`      ${j(g)},`);
  lines.push(`    ],`);
  lines.push(`    pivots: {`);
  for (const [n, p] of Object.entries(view.pivots)) lines.push(`      ${n}: ${j(p)},`);
  lines.push(`    },`);
  lines.push(`    parts: {`);
  for (const [n, layers] of Object.entries(view.parts)) lines.push(`      ${n}: ${j(layers)},`);
  lines.push(`    },`);
  if (view.face) {
    lines.push(`    face: {`);
    lines.push(`      eyes_open: ${j(view.face.eyes_open)},`);
    lines.push(`      mouth_happy: ${j(view.face.mouth_happy)},`);
    lines.push(`    },`);
  }
  lines.push(`  },`);
};

const out = `// Generated from the Clutch Figma file (${raw.source.fileKey}), frame
// "${raw.source.frameName}" (${raw.source.frameId}) through the Figma Desktop Bridge.
// Do not edit by hand: regenerate with docs/mascot-v2-import.md.
//
// Rig space is per view: x = 0 at the centre of the view's head, y = 0 on the floor
// (the bottom of the feet), y grows downward. figmaOrigin is that point on the Figma canvas.
// Parts and layers are in Figma paint order, back to front. Pivot dots mark the joints.
// The side view (facing screen right) draws only the near _L limbs; its parts and pivots omit _R.
// Props (money bag, fist, thumbs-up) are relative to the top-left of their own group.

export type MascotV2Point = Readonly<{ x: number; y: number }>;
export type MascotV2GradientStop = Readonly<{ offset: number; color: string; alpha: number }>;
export type MascotV2Gradient = Readonly<{ from: MascotV2Point; to: MascotV2Point; stops: readonly MascotV2GradientStop[] }>;
export type MascotV2Stroke = Readonly<{
  width: number;
  cap: "ROUND" | "NONE" | "SQUARE";
  join: "MITER" | "ROUND" | "BEVEL";
  color?: string;
  gradient?: MascotV2Gradient;
}>;
export type MascotV2Shape = Readonly<{ d: string; fill?: string; fillRule?: "evenodd"; stroke?: MascotV2Stroke; opacity?: number }>;
export type MascotV2Role = "outline" | "base" | "shade" | "highlight" | "crease";
export type MascotV2Layer = Readonly<{ role: MascotV2Role; stripe?: 1 | 2 | 3; shapes: readonly MascotV2Shape[] }>;

export const mascotV2PartNames = ${j(PARTS)} as const;
export type MascotV2PartName = (typeof mascotV2PartNames)[number];
export const mascotV2PivotNames = ${j(PIVOTS)} as const;
export type MascotV2PivotName = (typeof mascotV2PivotNames)[number];
export const mascotV2GroupNames = ${j(GROUPS)} as const;
export type MascotV2GroupName = (typeof mascotV2GroupNames)[number];

export type MascotV2View = Readonly<{
  figmaNode: string;
  figmaOrigin: MascotV2Point;
  groups: readonly Readonly<{ name: MascotV2GroupName; parts: readonly (MascotV2PartName | "face")[] }>[];
  /** True when only the near (_L) limbs are drawn (the side view). */
  nearOnly: boolean;
  pivots: Readonly<Partial<Record<MascotV2PivotName, MascotV2Point>>>;
  parts: Readonly<Partial<Record<MascotV2PartName, readonly MascotV2Layer[]>>>;
  face?: Readonly<{ eyes_open: readonly MascotV2Shape[]; mouth_happy: readonly MascotV2Shape[] }>;
}>;
export type MascotV2ViewName = "front" | "threeQuarter" | "side" | "back";
export type MascotV2Prop = Readonly<{
  figmaNode: string;
  size: Readonly<{ width: number; height: number }>;
  /** Pivot dots drawn inside the prop, such as the hands' Wrist. */
  pivots?: Readonly<Record<string, MascotV2Point>>;
  layers: readonly MascotV2Layer[];
}>;
export type MascotV2PropName = "moneyBag" | "handFist" | "handThumbsUp";

/** V2 palette, as drawn in Figma. */
export const mascotV2Colors = {
  body: "#FD5D44",
  bodyShade: "#C94631",
  outline: "#972F20",
  highlight: "#FFCBC1",
  ink: "#031E19",
  eyeHighlight: "#FCFCFC",
  gear: "#00880C",
  gearOutline: "#006506",
  armbandShade: "#004403",
  headbandShade: "#006506",
  stripe: "#FFCC64",
  stripeShade: "#8F6900",
  gearHighlight: "#BAE2B7",
  bag: "#FFBE00",
  bagShade: "#C69300",
  bagCrease: "#C69300",
  bagSign: "#5C4300",
} as const;

export const mascotV2Views: Readonly<Record<MascotV2ViewName, MascotV2View>> = {
${(() => { for (const [k, v] of Object.entries(views)) emitView(k, v); const s = lines.join("\n"); lines.length = 0; return s; })()}
};

export const mascotV2Props: Readonly<Record<MascotV2PropName, MascotV2Prop>> = {
${Object.entries(props).map(([k, p]) => `  ${k}: {\n    figmaNode: ${j(p.figmaNode)},\n    size: ${j(p.size)},\n${p.pivots ? `    pivots: ${j(p.pivots)},\n` : ""}    layers: ${j(p.layers)},\n  },`).join("\n")}
};
`;
fs.writeFileSync(outPath, out);
console.log(`wrote ${outPath}: ${out.split("\n").length} lines, ${out.length} bytes`);
```

## Faces (Faces_V2)

`src/app/mascot/mascot-v2-faces.ts` is generated from the group Faces_V2 (`293:1448`) in the same frame:
one face group per expression (face_happy, face_Excited, face_satisfied, face_sleepy, face_disappointed,
face_confused, face_angry), each with its eyes, `Mouth` and `mouth_shadow`. Regenerate it after the
faces change in Figma. Don't edit it by hand.

1. Start the receiver from above: `node receive.mjs "$PWD/faces-v2.json" 9230`.
2. Run this through the figma-console `figma_execute` tool in the Clutch file (timeout 30000). Figma
   outlines every stroke on export, so each face shape arrives as one filled path.

   ```js
   const node = await figma.getNodeByIdAsync("293:1448");
   const bytes = await node.exportAsync({ format: "SVG", svgIdAttribute: true, svgOutlineText: true, svgSimplifyStroke: false });
   let s = ""; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)));
   const res = await fetch("http://localhost:9230/", { method: "POST", body: JSON.stringify({ id: node.id, name: node.name, svg: s }) });
   return { status: res.status, text: await res.text() };
   ```

3. Generate the module, then run the face tests:

   ```sh
   node generate-v2-faces.mjs faces-v2.json /Users/ifeanyi/Sandbox/Clutch/src/app/mascot/mascot-v2-faces.ts
   npx vitest run src/app/mascot/mascot-view-model.test.ts src/app/mascot/mascot-v2-scene.test.ts
   ```

The generator stops on an unknown face group, a part other than `eyes_*`, `Mouth` or `mouth_shadow`, a
fill outside the face palette (#031E19, #FCFCFC, shadow #687773 at 20%), a transformed shape, or a face
without two eyes. It splits each face's eyes into screen-left and screen-right about the middle of the
eye set. `mascot-v2-face.ts` places the faces on the head; see its header for the layout rules.

### generate-v2-faces.mjs

```js
// Generates src/app/mascot/mascot-v2-faces.ts from the Faces_V2 SVG export (a JSON body with `svg`).
// Stops on anything it doesn't recognise, so a renamed or restyled face is caught here, not guessed.
import fs from "node:fs";

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) throw new Error("usage: node generate-v2-faces.mjs <faces-v2.json> <out.ts>");
const { svg } = JSON.parse(fs.readFileSync(inPath, "utf8"));

const FACES = ["happy", "excited", "satisfied", "sleepy", "disappointed", "confused", "angry"];
const INK = "#031E19", SHINE = "#FCFCFC", SHADOW = "#687773";
const fail = (message) => { throw new Error(`generate-v2-faces: ${message}`); };
const attr = (attrs, name) => attrs.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

// Walk the tags, keeping the stack of group ids above each path.
const stack = [];
const shapes = [];
for (const [, close, tag, attrs, selfClose] of svg.matchAll(/<(\/?)(svg|g|path)\b([^>]*?)(\/?)>/g)) {
  if (close) { stack.pop(); continue; }
  if (attr(attrs, "transform")) fail(`a transformed <${tag}> (${attr(attrs, "id") ?? "no id"}); flatten it in Figma`);
  const id = attr(attrs, "id") ?? "";
  if (tag === "path") {
    shapes.push({ d: attr(attrs, "d"), fill: attr(attrs, "fill"), groups: [...stack, id], opacity: attr(attrs, "opacity") });
    if (!selfClose) stack.push(id);
  } else if (!selfClose) stack.push(id);
}

/** Figma de-duplicates repeated names with _2, _3 …; strip that. */
const plain = (id) => id.replace(/_\d+$/, "");

/** Every coordinate pair of an absolute Figma path (M, L, H, V, C, Q, Z). */
function bounds(d) {
  const xs = [], ys = [];
  let x = 0, y = 0;
  for (const [, command, args] of d.matchAll(/([MLHVCQZ])([^MLHVCQZ]*)/gi)) {
    if (command !== command.toUpperCase()) fail(`relative path command "${command}"`);
    const n = (args.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
    if (command === "H") for (const v of n) { x = v; xs.push(x); ys.push(y); }
    else if (command === "V") for (const v of n) { y = v; xs.push(x); ys.push(y); }
    else for (let i = 0; i + 1 < n.length; i += 2) { x = n[i]; y = n[i + 1]; xs.push(x); ys.push(y); }
  }
  return { maxX: Math.max(...xs), maxY: Math.max(...ys), minX: Math.min(...xs), minY: Math.min(...ys) };
}
const centreX = (b) => (b.minX + b.maxX) / 2;

const faces = {};
for (const shape of shapes) {
  const [, root, faceId, featureId] = shape.groups; // svg, Faces_V2, face_*, the feature under it
  if (root !== "Faces_V2") fail(`a shape outside Faces_V2 (${shape.groups.join(" > ")})`);
  const name = plain(faceId ?? "").replace(/^face_/, "").toLowerCase();
  if (!FACES.includes(name)) fail(`unknown face group "${faceId}"`);
  const feature = plain(featureId ?? "");
  const kind = feature.startsWith("eyes_") ? "eyes" : feature === "Mouth" ? "mouth" : feature === "mouth_shadow" ? "shadow" : fail(`unknown part "${featureId}" in ${faceId}`);
  const fill = shape.fill?.toUpperCase();
  const allowed = kind === "eyes" ? [INK, SHINE] : kind === "mouth" ? [INK] : [SHADOW];
  if (!allowed.includes(fill)) fail(`${faceId} > ${featureId}: fill ${shape.fill} (expected ${allowed.join(" or ")})`);
  const opacity = shape.opacity === undefined ? undefined : Number(shape.opacity);
  if (kind === "shadow" ? opacity !== 0.2 : opacity !== undefined) fail(`${faceId} > ${featureId}: opacity ${shape.opacity}`);
  faces[name] ??= { eyes: [], mouth: [], shadow: [] };
  faces[name][kind].push({ d: shape.d, fill, ...(opacity !== undefined ? { opacity } : {}) });
}

const out = {};
for (const name of FACES) {
  const face = faces[name] ?? fail(`missing face_${name}`);
  if (!face.mouth.length || !face.shadow.length || !face.eyes.length) fail(`face_${name} needs eyes, a Mouth and a mouth_shadow`);
  // Split the eyes into screen-left and screen-right about the middle of the eye set.
  const all = face.eyes.map((shape) => bounds(shape.d));
  const middle = (Math.min(...all.map((b) => b.minX)) + Math.max(...all.map((b) => b.maxX))) / 2;
  const left = face.eyes.filter((_, i) => centreX(all[i]) < middle);
  const right = face.eyes.filter((_, i) => centreX(all[i]) >= middle);
  if (!left.length || !right.length) fail(`face_${name} needs two eyes`);
  out[name] = { eyes: [left, right], mouth: face.mouth, shadow: face.shadow };
}

const extra = Object.keys(faces).filter((name) => !FACES.includes(name));
if (extra.length) fail(`unexpected faces: ${extra.join(", ")}`);

const source = `// Generated from the Clutch Figma file (hE0eJAkqKzj3K5JfIcpT8o), group Faces_V2 (293:1448), by
// generate-v2-faces.mjs (docs/mascot-v2-import.md). Don't edit by hand; regenerate after the faces change.
//
// Coordinates are Faces_V2's own (px, y down). The faces sit side by side there, not on the head;
// mascot-v2-face.ts places them. Each face keeps its eyes, its mouth and the mouth's soft shadow.
// In Figma, face_angry's eye group is still named eyes_tired; the generator goes by the face name.

export type MascotV2FaceShape = Readonly<{ d: string; fill: string; opacity?: number }>;

export type MascotV2FaceDrawing = Readonly<{
  /** The screen-left eye, then the screen-right eye. */
  eyes: readonly [readonly MascotV2FaceShape[], readonly MascotV2FaceShape[]];
  mouth: readonly MascotV2FaceShape[];
  /** The soft shadow under the mouth. */
  shadow: readonly MascotV2FaceShape[];
}>;

export const mascotV2FaceNames = ${JSON.stringify(FACES)} as const;

export type MascotV2FaceName = (typeof mascotV2FaceNames)[number];

export const mascotV2Faces: Readonly<Record<MascotV2FaceName, MascotV2FaceDrawing>> = {
${FACES.map((name) => `  ${name}: ${JSON.stringify(out[name])},`).join("\n")}
};
`;
fs.writeFileSync(outPath, source);
console.log(`wrote ${outPath}: ${FACES.map((name) => `${name} (${out[name].eyes[0].length}+${out[name].eyes[1].length} eye shapes, ${out[name].mouth.length} mouth)`).join(", ")}`);
```
