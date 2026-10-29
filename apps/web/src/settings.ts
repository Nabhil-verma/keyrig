import { useSyncExternalStore } from "react";
import { createMemoryStorage, type StorageLike } from "@keyrig/shared";
import { THEME_KEY, type Theme } from "./theme";

/**
 * The settings of this device. They are not per account: the theme, the
 * motion and the density belong to the browser, not to a person.
 *
 * The accent replaces the brand amber. The kit rule says amber is the key and
 * cyan is the AI link, so the app warns before it replaces amber.
 */
export type ThemeChoice = "dark" | "light" | "system";
export type MotionChoice = "full" | "reduced";
export type DensityChoice = "comfortable" | "compact";

export interface AppSettings {
  theme: ThemeChoice;
  motion: MotionChoice;
  density: DensityChoice;
  accent: string | null;
  rememberRoute: boolean;
  disabledProviders: string[];
}

export const SETTINGS_STORAGE_KEY = "keyrig.settings.v1";
export const SETTINGS_SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  motion: "full",
  density: "comfortable",
  accent: null,
  rememberRoute: true,
  disabledProviders: [],
};

const ACCENT_PATTERN = /^#[0-9a-f]{6}$/i;
const MAX_DISABLED = 50;

function deviceStorage(): StorageLike {
  try {
    const probe = "keyrig.settings.probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return createMemoryStorage();
  }
}

const storage = deviceStorage();
const listeners = new Set<() => void>();
let snapshot: AppSettings | null = null;
let mediaBound = false;

function isTheme(value: unknown): value is ThemeChoice {
  return value === "dark" || value === "light" || value === "system";
}

function isMotion(value: unknown): value is MotionChoice {
  return value === "full" || value === "reduced";
}

function isDensity(value: unknown): value is DensityChoice {
  return value === "comfortable" || value === "compact";
}

/** Keep only known values. A broken field falls back to its default. */
export function normalizeSettings(input: Partial<AppSettings> | null, fallbackTheme: Theme = "dark"): AppSettings {
  const source = input ?? {};
  const accent = typeof source.accent === "string" && ACCENT_PATTERN.test(source.accent) ? source.accent.toLowerCase() : null;
  const disabled = Array.isArray(source.disabledProviders)
    ? [...new Set(source.disabledProviders.filter((id): id is string => typeof id === "string" && id.length > 0))].slice(0, MAX_DISABLED)
    : [];
  return {
    theme: isTheme(source.theme) ? source.theme : fallbackTheme,
    motion: isMotion(source.motion) ? source.motion : DEFAULT_SETTINGS.motion,
    density: isDensity(source.density) ? source.density : DEFAULT_SETTINGS.density,
    accent,
    rememberRoute: typeof source.rememberRoute === "boolean" ? source.rememberRoute : DEFAULT_SETTINGS.rememberRoute,
    disabledProviders: disabled,
  };
}

/** Read the settings once. A broken record falls back to the theme file. */
function readSettings(): AppSettings {
  let parsed: unknown = null;
  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  const body =
    parsed !== null && typeof parsed === "object" && (parsed as { schemaVersion?: unknown }).schemaVersion === SETTINGS_SCHEMA_VERSION
      ? ((parsed as { data?: Partial<AppSettings> }).data ?? null)
      : null;
  let fallbackTheme: Theme = "dark";
  try {
    fallbackTheme = storage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    fallbackTheme = "dark";
  }
  return normalizeSettings(body, fallbackTheme);
}

export function getSettings(): AppSettings {
  if (snapshot === null) {
    snapshot = readSettings();
  }
  return snapshot;
}

function persist(settings: AppSettings): void {
  try {
    storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ schemaVersion: SETTINGS_SCHEMA_VERSION, appliedMigrations: [], data: settings }),
    );
  } catch {
    // A full storage must not stop a settings change.
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Merge a change, keep it, apply it and tell every listener. */
export function writeSettings(patch: Partial<AppSettings>): AppSettings {
  snapshot = normalizeSettings({ ...getSettings(), ...patch }, getSettings().theme === "light" ? "light" : "dark");
  persist(snapshot);
  applySettings(snapshot);
  for (const listener of listeners) {
    listener();
  }
  return snapshot;
}

export function resetSettings(): AppSettings {
  return writeSettings(DEFAULT_SETTINGS);
}

function resolvedTheme(choice: ThemeChoice): Theme {
  if (choice !== "system") {
    return choice;
  }
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyAccent(accent: string | null): void {
  const root = document.documentElement;
  const names = ["--amber", "--amber-strong", "--amber-soft", "--amber-line", "--amber-text"];
  if (accent === null) {
    for (const name of names) {
      root.style.removeProperty(name);
    }
    return;
  }
  root.style.setProperty("--amber", accent);
  root.style.setProperty("--amber-strong", `color-mix(in srgb, ${accent} 82%, #000)`);
  root.style.setProperty("--amber-soft", `color-mix(in srgb, ${accent} 12%, transparent)`);
  root.style.setProperty("--amber-line", `color-mix(in srgb, ${accent} 34%, transparent)`);
  root.style.setProperty("--amber-text", accent);
}

/** Write the theme, the motion, the density and the accent to the document. */
export function applySettings(settings: AppSettings): void {
  const theme = resolvedTheme(settings.theme);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.motion = settings.motion;
  root.dataset.density = settings.density;
  applyAccent(settings.accent);
  try {
    storage.setItem(THEME_KEY, theme);
  } catch {
    // The theme still applies to this page.
  }

  if (!mediaBound && typeof window.matchMedia === "function") {
    mediaBound = true;
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
      if (getSettings().theme === "system") {
        applySettings(getSettings());
      }
    });
  }
}

export function useSettings(): AppSettings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}
