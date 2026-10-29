import type { KeyView } from "@keyrig/core";
import type { BaseUrlCheck, CatalogModel, CatalogSource, ProviderManifest } from "@keyrig/providers";
import { formatUsd } from "@keyrig/providers";
import { Icon } from "./ui/Icon";

interface ProfilePanelProps {
  manifests: readonly ProviderManifest[];
  manifest: ProviderManifest;
  providerId: string;
  onProviderChange: (id: string) => void;
  modelId: string;
  onModelChange: (id: string) => void;
  models: CatalogModel[];
  catalogModel: CatalogModel | undefined;
  keyId: string;
  keys: KeyView[];
  onKeyChange: (id: string) => void;
  baseUrl: string;
  onBaseUrlChange: (value: string) => void;
  baseUrlCheck: BaseUrlCheck | null;
  catalogSource: CatalogSource | null;
}

function compact(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 2)}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}K`;
  }
  return String(value);
}

export function ProfilePanel({
  manifests,
  manifest,
  providerId,
  onProviderChange,
  modelId,
  onModelChange,
  models,
  catalogModel,
  keyId,
  keys,
  onKeyChange,
  baseUrl,
  onBaseUrlChange,
  baseUrlCheck,
  catalogSource,
}: ProfilePanelProps) {
  const abilities = catalogModel
    ? [
        catalogModel.abilities.tools ? "tools" : null,
        catalogModel.abilities.images ? "vision" : null,
        catalogModel.abilities.reasoning ? "reasoning" : null,
        catalogModel.abilities.structuredOutput ? "json" : null,
      ].filter((value): value is string => value !== null)
    : [];

  return (
    <section className="panel" aria-labelledby="route-title">
      <div className="panel-head">
        <div className="panel-title">
          <span className="eyebrow eyebrow--cyan">Route</span>
          <h2 id="route-title">Model and key</h2>
        </div>
        <span className="chip chip--plain">{manifest.wireFormat}</span>
      </div>

      <div className="field">
        <label htmlFor="provider">Provider</label>
        <select
          id="provider"
          className="select"
          value={providerId}
          onChange={(event) => onProviderChange(event.target.value)}
        >
          {manifests.map((item) => (
            <option key={item.id} value={item.id}>
              {item.displayName}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="model">Model</label>
        <input
          id="model"
          className="input mono"
          list="model-options"
          value={modelId}
          placeholder="Model name"
          spellCheck={false}
          onChange={(event) => onModelChange(event.target.value)}
        />
        <datalist id="model-options">
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </datalist>
      </div>

      {catalogModel ? (
        <div className="facts">
          <div className="facts-grid">
            <div className="fact">
              <span>Context</span>
              <strong className="mono">
                {catalogModel.contextLimit ? compact(catalogModel.contextLimit) : "unknown"}
              </strong>
            </div>
            <div className="fact">
              <span>Output limit</span>
              <strong className="mono">
                {catalogModel.outputLimit ? compact(catalogModel.outputLimit) : "unknown"}
              </strong>
            </div>
            <div className="fact">
              <span>Input / M</span>
              <strong className="mono">
                {catalogModel.pricing ? formatUsd(catalogModel.pricing.input) : "unknown"}
              </strong>
            </div>
            <div className="fact">
              <span>Output / M</span>
              <strong className="mono">
                {catalogModel.pricing ? formatUsd(catalogModel.pricing.output) : "unknown"}
              </strong>
            </div>
          </div>
          {abilities.length > 0 ? (
            <div className="ability-row">
              {abilities.map((ability) => (
                <span key={ability} className="chip chip--plain">
                  {ability}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="hint">
          {manifest.priceSource === "local"
            ? "A local model has no catalog price. keyrig shows the cost as unknown."
            : "The catalog has no entry for this model. keyrig shows the cost as unknown."}
        </p>
      )}

      <div className="field">
        <label htmlFor="key">Key</label>
        <select id="key" className="select" value={keyId} onChange={(event) => onKeyChange(event.target.value)}>
          {keys.length === 0 ? <option value="">No key for this provider</option> : null}
          {keys.map((key) => (
            <option key={key.id} value={key.id}>
              {key.label} — {key.last4}
            </option>
          ))}
        </select>
      </div>

      {manifest.supportsCustomBaseUrl ? (
        <div className="field">
          <label htmlFor="base-url">Base URL</label>
          <input
            id="base-url"
            className="input mono"
            value={baseUrl}
            spellCheck={false}
            onChange={(event) => onBaseUrlChange(event.target.value)}
          />
          {baseUrlCheck?.warning ? (
            <div className="callout" role={baseUrlCheck.allowed ? undefined : "alert"}>
              <strong>{baseUrlCheck.allowed ? "Custom endpoint." : "Blocked endpoint."}</strong>{" "}
              {baseUrlCheck.warning}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="panel-foot">
        <span className="eyebrow">
          <Icon name="cpu" size={12} />
          Catalog
        </span>
        <span>
          {catalogSource ?? "loading"} · {models.length} models
        </span>
      </div>
    </section>
  );
}
