import type { StorageLike } from "@keyrig/shared";

/**
 * Backlog #10: the first-run and vault-unlock scene.
 *
 * The policy is pure, so the tests need no WebGL and no browser. The effect
 * keeps the same rules for the canvas: a still frame when motion is reduced,
 * and no frames while the tab is hidden or the scene is off screen.
 */
export const VAULT_SCENE_MAX_DPR = 1.5;
export const VAULT_SCENE_SKIP_KEY = "keyrig.vault-scene.skipped.v1";

/** Keep the buffer small enough for an integrated GPU. */
export function vaultScenePixelRatio(devicePixelRatio: number): number {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio < 1) {
    return 1;
  }
  return Math.min(devicePixelRatio, VAULT_SCENE_MAX_DPR);
}

export interface VaultSceneMotion {
  reducedMotion: boolean;
  hidden: boolean;
  visible: boolean;
}

/** The scene animates only when all three conditions hold. */
export function shouldAnimateVaultScene(input: VaultSceneMotion): boolean {
  return !input.reducedMotion && !input.hidden && input.visible;
}

/** A skip belongs to this browser, not to one account. */
export function readVaultSceneSkipped(storage: StorageLike): boolean {
  try {
    return storage.getItem(VAULT_SCENE_SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

/** A full storage still hides the scene for this visit. */
export function markVaultSceneSkipped(storage: StorageLike): void {
  try {
    storage.setItem(VAULT_SCENE_SKIP_KEY, "1");
  } catch {
    // The caller hides the scene even when the choice cannot be saved.
  }
}
