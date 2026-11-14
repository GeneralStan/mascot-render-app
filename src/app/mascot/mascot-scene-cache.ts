import { buildMascotScene, type MascotScene } from "./mascot-scene";
import { readMascotSettings, type MascotSettings } from "./mascot-settings";

const CACHE_LIMIT = 24;
const sceneCache = new Map<string, MascotScene>();

export function getMascotSceneKey(settings: MascotSettings): string {
  return JSON.stringify(settings);
}

/**
 * Shared memo for preview, scene bounds and export so one evaluated state is
 * built once even though several runtime owners ask for it.
 */
export function getMascotSceneForSettings(settings: MascotSettings): MascotScene {
  const key = getMascotSceneKey(settings);
  const cached = sceneCache.get(key);
  if (cached) {
    sceneCache.delete(key);
    sceneCache.set(key, cached);
    return cached;
  }
  const scene = buildMascotScene(settings);
  sceneCache.set(key, scene);
  if (sceneCache.size > CACHE_LIMIT) {
    const oldest = sceneCache.keys().next().value;
    if (oldest !== undefined) sceneCache.delete(oldest);
  }
  return scene;
}

export function getMascotSceneForValues(
  values: Readonly<Record<string, unknown>>,
): MascotScene {
  return getMascotSceneForSettings(readMascotSettings(values));
}
