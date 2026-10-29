import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings";

describe("the settings keep only known values", () => {
  it("returns the defaults for an empty record", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps a valid theme, motion, density and accent", () => {
    const settings = normalizeSettings({
      theme: "system",
      motion: "reduced",
      density: "compact",
      accent: "#3DD6C6",
      rememberRoute: false,
      disabledProviders: ["openai"],
    });
    expect(settings).toEqual({
      theme: "system",
      motion: "reduced",
      density: "compact",
      accent: "#3dd6c6",
      rememberRoute: false,
      disabledProviders: ["openai"],
    });
  });

  it("drops an accent that is not a six digit hex colour", () => {
    expect(normalizeSettings({ accent: "red" }).accent).toBeNull();
    expect(normalizeSettings({ accent: "#fff" }).accent).toBeNull();
    expect(normalizeSettings({ accent: "#12345g" }).accent).toBeNull();
  });

  it("uses the stored theme when the record has no valid theme", () => {
    expect(normalizeSettings(null, "light").theme).toBe("light");
    expect(normalizeSettings({ theme: "purple" as never }, "light").theme).toBe("light");
  });

  it("keeps one entry for each disabled provider", () => {
    expect(normalizeSettings({ disabledProviders: ["openai", "openai", "ollama"] }).disabledProviders).toEqual([
      "openai",
      "ollama",
    ]);
  });

  it("turns off route memory only for a real false", () => {
    expect(normalizeSettings({ rememberRoute: false }).rememberRoute).toBe(false);
    expect(normalizeSettings({ rememberRoute: "no" as never }).rememberRoute).toBe(true);
  });
});
