import { useEffect, useRef, useState } from "react";
import { CUSTOM_MODEL_VALUE, modelOptions } from "./modelOptions";
import { Icon } from "./ui/Icon";

interface ModelPickerProps {
  id: string;
  modelId: string;
  onModelChange: (id: string) => void;
  /** The model names in the catalog for the provider. */
  catalogModels: readonly string[];
  /** PV-11: the model names that the provider returned. */
  providerModels: readonly string[];
  loading: boolean;
  error: string | null;
  disabled: boolean;
  /** True when the manifest allows a model list (PV-11). */
  supportsList: boolean;
  onReload: () => void;
}

/**
 * PV-11: the model picker.
 *
 * A provider that lists its models gets a list to pick from. Every provider
 * keeps the typed name, because a provider can add a model before the list
 * or the catalog has it.
 */
export function ModelPicker({
  id,
  modelId,
  onModelChange,
  catalogModels,
  providerModels,
  loading,
  error,
  disabled,
  supportsList,
  onReload,
}: ModelPickerProps) {
  const [custom, setCustom] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const focusInput = useRef(false);

  const options = modelOptions(catalogModels, providerModels, modelId);
  const showList = supportsList && !custom && options.length > 0;

  useEffect(() => {
    if (!custom || !focusInput.current) {
      return;
    }
    focusInput.current = false;
    inputRef.current?.focus();
  }, [custom]);

  const status = loading
    ? "Reading the model list from the provider."
    : (error ??
      (providerModels.length > 0
        ? `${providerModels.length} ${providerModels.length === 1 ? "model" : "models"} from the provider.`
        : "The provider sent no model names. Type the model name."));

  return (
    <div className="field">
      <label htmlFor={id}>Model</label>
      {showList ? (
        <select
          id={id}
          className="select mono"
          disabled={disabled}
          value={modelId}
          onChange={(event) => {
            const next = event.target.value;
            if (next === CUSTOM_MODEL_VALUE) {
              focusInput.current = true;
              setCustom(true);
              return;
            }
            onModelChange(next);
          }}
        >
          {modelId.trim().length === 0 ? <option value="">Choose a model</option> : null}
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value={CUSTOM_MODEL_VALUE}>Custom model name</option>
        </select>
      ) : (
        <>
          <input
            id={id}
            ref={inputRef}
            className="input mono"
            disabled={disabled}
            value={modelId}
            placeholder="Model name"
            spellCheck={false}
            onChange={(event) => onModelChange(event.target.value)}
          />
          {!supportsList || custom ? (
            <div className="model-load">
              <span className="hint">
                {!supportsList
                  ? "This provider does not list its models. Type the model name."
                  : "Type the model name, or use the provider list."}
              </span>
              {custom && options.length > 0 ? (
                <button
                  type="button"
                  className="btn btn--quiet btn--sm"
                  disabled={disabled}
                  onClick={() => setCustom(false)}
                >
                  <Icon name="route" size={12} />
                  Use the list
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {supportsList ? (
        <div className="model-load">
          <button
            type="button"
            className="btn btn--quiet btn--sm"
            disabled={disabled || loading}
            onClick={onReload}
          >
            <Icon name="refresh" size={12} />
            {loading ? "Loading the models" : "Reload the models"}
          </button>
          <span className="hint">{status}</span>
        </div>
      ) : null}
    </div>
  );
}
