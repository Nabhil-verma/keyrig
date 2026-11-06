import { describe, expect, it } from "vitest";
import { createFullStorage, createMemoryStorage } from "@keyrig/shared";
import {
  markVaultSceneSkipped,
  readVaultSceneSkipped,
  shouldAnimateVaultScene,
  vaultScenePixelRatio,
} from "./vaultScene";

describe("backlog #10 vault scene", () => {
  it("caps the pixel ratio at 1.5 for integrated graphics", () => {
    expect(vaultScenePixelRatio(1)).toBe(1);
    expect(vaultScenePixelRatio(2)).toBe(1.5);
    expect(vaultScenePixelRatio(3)).toBe(1.5);
    expect(vaultScenePixelRatio(Number.NaN)).toBe(1);
    expect(vaultScenePixelRatio(0.5)).toBe(1);
  });

  it("animates only when motion is allowed, the tab is visible and the scene is on screen", () => {
    const allowed = { reducedMotion: false, hidden: false, visible: true };
    expect(shouldAnimateVaultScene(allowed)).toBe(true);
    expect(shouldAnimateVaultScene({ ...allowed, reducedMotion: true })).toBe(false);
    expect(shouldAnimateVaultScene({ ...allowed, hidden: true })).toBe(false);
    expect(shouldAnimateVaultScene({ ...allowed, visible: false })).toBe(false);
  });

  it("keeps a skip on this device", () => {
    const storage = createMemoryStorage();
    expect(readVaultSceneSkipped(storage)).toBe(false);
    markVaultSceneSkipped(storage);
    expect(readVaultSceneSkipped(storage)).toBe(true);
  });

  it("does not fail when the storage is full", () => {
    const storage = createFullStorage();
    expect(readVaultSceneSkipped(storage)).toBe(false);
    expect(() => markVaultSceneSkipped(storage)).not.toThrow();
  });
});
