import type { MascotScene } from "./mascot-scene";
import { mascotSvgTree } from "./mascot-svg-tree";

const SVG_NS = "http://www.w3.org/2000/svg";
const PREFIX = "clutch-mascot";

/**
 * Appends the posed mascot as editable vectors in world coordinates to the runtime-supplied
 * group: clip paths, blur filters and gradients in `defs`, one group per layer, and the
 * mascot's shapes grouped and named by V2 part (Leg_L > foot_L, Arm_R > hand_fist_R, Body >
 * strand_3, Headband), ready to open as named layers in Rive or Figma.
 *
 * This is the one place SVG export touches the DOM, as the runtime's export contract asks
 * (`docs/toolcraft/core/setup-export.md`, SVG Export). The nodes arrive flat with their
 * depth; a stack of open parents rebuilds the nesting.
 */
export function appendMascotSceneVectors(container: SVGGElement, scene: MascotScene): void {
  const open: SVGElement[] = [container];
  for (const item of mascotSvgTree(scene, { groupId: (name) => name, idPrefix: PREFIX })) {
    const element = container.ownerDocument.createElementNS(SVG_NS, item.tag);
    for (const [name, value] of Object.entries(item.attributes)) element.setAttribute(name, value);
    open.length = item.depth + 1;
    open[item.depth]!.append(element);
    open.push(element);
  }
}
