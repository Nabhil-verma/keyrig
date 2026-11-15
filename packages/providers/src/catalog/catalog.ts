import { bindFetch, readStoredDocument, writeStoredDocument, type StorageLike } from "@keyrig/shared";
import bundled from "./bundled-catalog.json";
import type { Pricing, PriceTier } from "./cost";

/**
 * PV-01: read model facts from a public catalog. Cache the catalog. Start with
 * the cache when the network is off. Do not build a large hand-made table.
 *
 * The bundled catalog is a boot fallback. It has two models for each hosted
 * provider. It is not a model registry.
 */

export interface CatalogAbilities {
  tools: boolean;
  reasoning: boolean;
  images: boolean;
  structuredOutput: boolean;
}

export interface CatalogModel {
  id: string;
  name: string;
  providerId: string;
  contextLimit?: number;
  outputLimit?: number;
  pricing?: Pricing;
  abilities: CatalogAbilities;
  releaseDate?: string;
}

export interface CatalogProvider {
  id: string;
  name: string;
  envVars: readonly string[];
  models: Record<string, CatalogModel>;
}

export interface Catalog {
  fetchedAt: string;
  providers: Record<string, CatalogProvider>;
}

export type CatalogSource = "network" | "cache" | "bundled";

export interface LoadCatalogOptions {
  fetchImpl?: typeof fetch;
  storage?: StorageLike | undefined;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
  url?: string;
}

export interface LoadCatalogResult {
  catalog: Catalog;
  source: CatalogSource;
  warning?: string;
}

export const CATALOG_URL = "https://models.dev/api.json";
export const CATALOG_CACHE_KEY = "keyrig.catalog.v1";
export const CATALOG_SCHEMA_VERSION = 1;
export const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

interface RawCost {
  input?: unknown;
  output?: unknown;
  cache_read?: unknown;
  cache_write?: unknown;
  tiers?: unknown;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseTiers(raw: unknown): PriceTier[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const tiers: PriceTier[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object") {
      continue;
    }
    const tier = item as {
      input?: unknown;
      output?: unknown;
      cache_read?: unknown;
      cache_write?: unknown;
      tier?: { size?: unknown };
    };
    const size = numberOrUndefined(tier.tier?.size);
    const input = numberOrUndefined(tier.input);
    const output = numberOrUndefined(tier.output);
    if (size === undefined || input === undefined || output === undefined) {
      continue;
    }
    const cacheRead = numberOrUndefined(tier.cache_read);
    const cacheWrite = numberOrUndefined(tier.cache_write);
    tiers.push({
      minInputTokens: size,
      input,
      output,
      ...(cacheRead !== undefined ? { cacheRead } : {}),
      ...(cacheWrite !== undefined ? { cacheWrite } : {}),
    });
  }
  return tiers.length > 0 ? tiers : undefined;
}

function parsePricing(raw: unknown): Pricing | undefined {
  if (raw === null || typeof raw !== "object") {
    return undefined;
  }
  const cost = raw as RawCost;
  const input = numberOrUndefined(cost.input);
  const output = numberOrUndefined(cost.output);
  if (input === undefined || output === undefined) {
    return undefined;
  }
  const cacheRead = numberOrUndefined(cost.cache_read);
  const cacheWrite = numberOrUndefined(cost.cache_write);
  const tiers = parseTiers(cost.tiers);
  return {
    input,
    output,
    ...(cacheRead !== undefined ? { cacheRead } : {}),
    ...(cacheWrite !== undefined ? { cacheWrite } : {}),
    ...(tiers !== undefined ? { tiers } : {}),
  };
}

/** Parse the models.dev document. Unknown fields are ignored. Bad entries are skipped. */
export function parseCatalog(payload: unknown, now: Date = new Date()): Catalog {
  if (payload === null || typeof payload !== "object") {
    throw new Error("The catalog is not an object.");
  }
  const providers: Record<string, CatalogProvider> = {};

  for (const [providerId, rawProvider] of Object.entries(payload as Record<string, unknown>)) {
    if (rawProvider === null || typeof rawProvider !== "object") {
      continue;
    }
    const provider = rawProvider as { name?: unknown; env?: unknown; models?: unknown };
    const models: Record<string, CatalogModel> = {};
    if (provider.models !== null && typeof provider.models === "object") {
      for (const [modelKey, rawModel] of Object.entries(provider.models as Record<string, unknown>)) {
        if (rawModel === null || typeof rawModel !== "object") {
          continue;
        }
        const model = rawModel as Record<string, unknown>;
        const id = typeof model.id === "string" && model.id.length > 0 ? model.id : modelKey;
        const limit = (model.limit ?? {}) as { context?: unknown; output?: unknown };
        const modalities = (model.modalities ?? {}) as { input?: unknown };
        const inputModalities = Array.isArray(modalities.input) ? modalities.input : [];
        const contextLimit = numberOrUndefined(limit.context);
        const outputLimit = numberOrUndefined(limit.output);
        const pricing = parsePricing(model.cost);
        models[modelKey] = {
          id,
          name: typeof model.name === "string" && model.name.length > 0 ? model.name : modelKey,
          providerId,
          ...(contextLimit !== undefined ? { contextLimit } : {}),
          ...(outputLimit !== undefined ? { outputLimit } : {}),
          ...(pricing !== undefined ? { pricing } : {}),
          abilities: {
            tools: model.tool_call === true,
            reasoning: model.reasoning === true,
            images: inputModalities.includes("image"),
            structuredOutput: model.structured_output === true,
          },
          ...(typeof model.release_date === "string" ? { releaseDate: model.release_date } : {}),
        };
      }
    }

    providers[providerId] = {
      id: providerId,
      name: typeof provider.name === "string" ? provider.name : providerId,
      envVars: Array.isArray(provider.env) ? provider.env.filter((item): item is string => typeof item === "string") : [],
      models,
    };
  }

  return { fetchedAt: now.toISOString(), providers };
}

export function bundledCatalog(): Catalog {
  return parseCatalog(bundled, new Date(0));
}

/** A saved catalog must have the shape that the reader uses. */
function isCatalog(value: unknown): value is Catalog {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.fetchedAt !== "string" || !Number.isFinite(Date.parse(record.fetchedAt))) {
    return false;
  }
  if (record.providers === null || typeof record.providers !== "object" || Array.isArray(record.providers)) {
    return false;
  }
  return Object.values(record.providers as Record<string, unknown>).every((entry) => {
    if (entry === null || typeof entry !== "object") {
      return false;
    }
    const provider = entry as Record<string, unknown>;
    if (typeof provider.id !== "string" || !Array.isArray(provider.envVars)) {
      return false;
    }
    if (provider.models === null || typeof provider.models !== "object" || Array.isArray(provider.models)) {
      return false;
    }
    return Object.values(provider.models as Record<string, unknown>).every((model) => {
      if (model === null || typeof model !== "object") {
        return false;
      }
      const item = model as Record<string, unknown>;
      return typeof item.id === "string" && typeof item.name === "string";
    });
  });
}

function readCache(storage: StorageLike | undefined): Catalog | null {
  if (!storage) {
    return null;
  }
  return readStoredDocument(storage, CATALOG_CACHE_KEY, CATALOG_SCHEMA_VERSION, (data) =>
    isCatalog(data) ? data : null,
  );
}

function writeCache(storage: StorageLike | undefined, catalog: Catalog): void {
  if (!storage) {
    return;
  }
  try {
    writeStoredDocument(storage, CATALOG_CACHE_KEY, CATALOG_SCHEMA_VERSION, catalog);
  } catch {
    // A full storage must not stop a chat. The app runs with the memory catalog.
  }
}

/**
 * Load the catalog. Order: a fresh cache, then the network, then a stale cache,
 * then the bundled catalog. This function never throws for a network failure.
 */
export async function loadCatalog(options: LoadCatalogOptions = {}): Promise<LoadCatalogResult> {
  const now = options.now ?? (() => Date.now());
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const cached = readCache(options.storage);

  if (cached) {
    const age = now() - Date.parse(cached.fetchedAt);
    if (Number.isFinite(age) && age >= 0 && age < ttlMs) {
      return { catalog: cached, source: "cache" };
    }
  }

  const doFetch = options.fetchImpl ?? (typeof fetch === "function" ? bindFetch() : undefined);
  if (doFetch) {
    try {
      const signal =
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(options.timeoutMs ?? 8000)
          : undefined;
      const response = await doFetch(options.url ?? CATALOG_URL, {
        method: "GET",
        headers: { accept: "application/json" },
        ...(signal ? { signal } : {}),
      });
      if (!response.ok) {
        throw new Error(`The catalog server returned ${response.status}.`);
      }
      const catalog = parseCatalog(await response.json(), new Date(now()));
      writeCache(options.storage, catalog);
      return { catalog, source: "network" };
    } catch {
      if (cached) {
        return {
          catalog: cached,
          source: "cache",
          warning: "keyrig uses the saved model catalog. The network is off.",
        };
      }
      return {
        catalog: bundledCatalog(),
        source: "bundled",
        warning: "keyrig uses the starter model catalog. Connect to the network to update prices.",
      };
    }
  }

  if (cached) {
    return { catalog: cached, source: "cache" };
  }
  return { catalog: bundledCatalog(), source: "bundled" };
}

export function modelsForProvider(catalog: Catalog, providerId: string): CatalogModel[] {
  const provider = catalog.providers[providerId];
  if (!provider) {
    return [];
  }
  return Object.values(provider.models).sort((a, b) => a.name.localeCompare(b.name));
}

export function findModel(catalog: Catalog, providerId: string, modelId: string): CatalogModel | undefined {
  const provider = catalog.providers[providerId];
  if (!provider) {
    return undefined;
  }
  return provider.models[modelId] ?? Object.values(provider.models).find((model) => model.id === modelId);
}
