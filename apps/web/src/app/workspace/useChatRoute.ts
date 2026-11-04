import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyView, RoleId, SignedInAccount } from "@keyrig/core";
import { can, loadProviderModels } from "@keyrig/core";
import {
  checkBaseUrl,
  findModel,
  getManifest,
  loadCatalog,
  modelsForProvider,
  type Catalog,
  type CatalogSource,
  type ProviderManifest,
} from "@keyrig/providers";
import type { StorageLike } from "@keyrig/shared";
import { readRoute, writeRoute } from "../../stores/routeStore";
import { safeError } from "./chatTurnHelpers";

interface UseChatRouteOptions {
  storage: StorageLike;
  username: string | null;
  session: SignedInAccount | null;
  keys: KeyView[];
  role: RoleId | null;
  manifests: readonly ProviderManifest[];
  rememberRoute: boolean;
}

/** The provider route of the workspace: provider, model, key and base URL. */
export function useChatRoute(options: UseChatRouteOptions) {
  const { storage, username, session, keys, role, manifests, rememberRoute } = options;

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogSource, setCatalogSource] = useState<CatalogSource | null>(null);
  const [catalogWarning, setCatalogWarning] = useState<string | null>(null);
  const [providerId, setProviderId] = useState("openai");
  const [modelId, setModelId] = useState("gpt-5.4");
  const [keyId, setKeyId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [providerModels, setProviderModels] = useState<string[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsNonce, setModelsNonce] = useState(0);

  const manifest = (getManifest(manifests, providerId) ?? manifests[0]) as ProviderManifest;
  const needsKey = manifest.authType !== "none";
  const models = useMemo(() => (catalog ? modelsForProvider(catalog, providerId) : []), [catalog, providerId]);
  const catalogModel = useMemo(
    () => (catalog ? findModel(catalog, providerId, modelId) : undefined),
    [catalog, providerId, modelId],
  );
  const pricing = catalogModel?.pricing;
  const providerKeys = keys.filter((key) => key.providerId === providerId);
  const selectedKey = keys.find((key) => key.id === keyId);

  const baseUrlCheck =
    manifest.supportsCustomBaseUrl && baseUrl.trim().length > 0 ? checkBaseUrl(baseUrl.trim()) : null;
  const customBaseBlocked = baseUrlCheck !== null && !baseUrlCheck.allowed;
  const effectiveBaseUrl =
    manifest.supportsCustomBaseUrl && baseUrl.trim().length > 0 ? baseUrl.trim() : undefined;

  const applyManifest = useCallback((next: ProviderManifest | undefined): void => {
    setModelId(next?.defaultModel ?? "");
    setBaseUrl(next?.supportsCustomBaseUrl ? next.baseUrl : "");
    setProviderModels([]);
    setModelsError(null);
  }, []);

  useEffect(() => {
    let active = true;
    void loadCatalog({ storage }).then((result) => {
      if (!active) {
        return;
      }
      setCatalog(result.catalog);
      setCatalogSource(result.source);
      setCatalogWarning(result.warning ?? null);
    });
    return () => {
      active = false;
    };
  }, [storage]);

  /** The selected key follows the provider. */
  useEffect(() => {
    const available = keys.filter((key) => key.providerId === providerId);
    if (!available.some((key) => key.id === keyId)) {
      setKeyId(available[0]?.id ?? "");
    }
  }, [keys, providerId, keyId]);

  /** A disabled plugin moves the route to the first enabled pack. */
  useEffect(() => {
    if (manifests.some((item) => item.id === providerId)) {
      return;
    }
    const first = manifests[0];
    if (first === undefined) {
      return;
    }
    setProviderId(first.id);
    applyManifest(first);
  }, [manifests, providerId, applyManifest]);

  /** PV-11: ask the provider for its model names after a short pause. */
  useEffect(() => {
    const canList = session !== null && can(role, "route.manage") && manifest.abilities.modelList;
    const hasKey = manifest.authType !== "api-key" || providerKeys.length > 0;
    if (!canList || !hasKey) {
      setProviderModels([]);
      setModelsBusy(false);
      setModelsError(null);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setProviderModels([]);
    setModelsBusy(true);
    setModelsError(null);

    const timer = setTimeout(() => {
      if (session === null) {
        return;
      }
      void loadProviderModels({
        vault: session.vault,
        manifest,
        ...(keyId.length > 0 ? { keyId } : {}),
        ...(effectiveBaseUrl !== undefined ? { baseUrl: effectiveBaseUrl } : {}),
        signal: controller.signal,
      })
        .then((result) => {
          if (!active) {
            return;
          }
          setProviderModels(result.models);
          setModelsError(
            result.models.length === 0 ? "The provider sent no model names. Type the model name." : null,
          );
        })
        .catch((caught: unknown) => {
          if (!active) {
            return;
          }
          setProviderModels([]);
          setModelsError(safeError(caught).message);
        })
        .finally(() => {
          if (active) {
            setModelsBusy(false);
          }
        });
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [session, manifest, keyId, effectiveBaseUrl, providerKeys.length, role, modelsNonce]);

  /** Keep the route for this account. The write is best effort. */
  useEffect(() => {
    if (username === null || !rememberRoute) {
      return;
    }
    writeRoute(storage, username, { providerId, modelId, keyId, baseUrl });
  }, [storage, username, providerId, modelId, keyId, baseUrl, rememberRoute]);

  /** Open an account on its saved route, or on the first provider. */
  const restoreRoute = (name: string, deviceKeys: KeyView[]): void => {
    const saved = readRoute(storage, name);
    const savedManifest = saved ? getManifest(manifests, saved.providerId) : undefined;
    const savedKey = saved ? deviceKeys.find((key) => key.id === saved.keyId) : undefined;
    const first = manifests[0];

    setProviderModels([]);
    setModelsError(null);
    if (saved !== null && savedManifest !== undefined && savedKey !== undefined) {
      setProviderId(savedManifest.id);
      setModelId(saved.modelId);
      setKeyId(savedKey.id);
      setBaseUrl(savedManifest.supportsCustomBaseUrl ? saved.baseUrl : "");
      return;
    }

    setProviderId(first?.id ?? "openai");
    setModelId(first?.defaultModel ?? "");
    setKeyId(deviceKeys.find((key) => key.providerId === first?.id)?.id ?? "");
    setBaseUrl(first?.supportsCustomBaseUrl ? first.baseUrl : "");
  };

  const changeProvider = (next: string): void => {
    setProviderId(next);
    applyManifest(getManifest(manifests, next));
  };

  /** PV-11: read the model list again with the selected key. */
  const reloadModels = (): void => {
    setModelsNonce((value) => value + 1);
  };

  return {
    catalog,
    catalogSource,
    catalogWarning,
    providerId,
    modelId,
    setModelId,
    keyId,
    setKeyId,
    baseUrl,
    setBaseUrl,
    manifest,
    needsKey,
    models,
    catalogModel,
    pricing,
    providerKeys,
    selectedKey,
    providerModels,
    modelsBusy,
    modelsError,
    baseUrlCheck,
    customBaseBlocked,
    effectiveBaseUrl,
    restoreRoute,
    changeProvider,
    reloadModels,
  };
}
