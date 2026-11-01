import { formatUsd } from "@keyrig/providers";

/**
 * PR-02, PR-03 and KS-03: the right-hand inspector states what leaves the
 * device. It holds no key, no header and no prompt text. It shows the spend
 * against the daily budget, so the number stays in view.
 */
export interface OutboundPanelProps {
  provider: string;
  wireFormat: string;
  endpoint: string;
  model: string;
  keyLabel: string | null;
  messageCount: number;
  toolsOn: boolean;
  toolCount: number;
  priceIn: number | null;
  priceOut: number | null;
  spent: number;
  limit: number | null;
}

export function OutboundPanel({
  provider,
  wireFormat,
  endpoint,
  model,
  keyLabel,
  messageCount,
  toolsOn,
  toolCount,
  priceIn,
  priceOut,
  spent,
  limit,
}: OutboundPanelProps) {
  const ratio = limit === null || limit <= 0 ? 0 : Math.min(100, Math.round((spent / limit) * 100));

  return (
    <div className="ws-outbound">
      <p className="ws-outbound-lead">Exactly what leaves this device.</p>

      <dl className="ws-facts">
        <div>
          <dt>Provider</dt>
          <dd>{provider}</dd>
        </div>
        <div>
          <dt>Endpoint</dt>
          <dd className="mono">{endpoint}</dd>
        </div>
        <div>
          <dt>Wire format</dt>
          <dd className="mono">{wireFormat}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd className="mono">{model.length > 0 ? model : "none"}</dd>
        </div>
        <div>
          <dt>Key</dt>
          <dd>{keyLabel ?? "No key for this route"}</dd>
        </div>
        <div>
          <dt>Messages</dt>
          <dd>{messageCount}</dd>
        </div>
        <div>
          <dt>Tools</dt>
          <dd className={toolsOn ? "ws-good" : undefined}>{toolsOn ? `${toolCount} on` : "Off"}</dd>
        </div>
        <div>
          <dt>Price</dt>
          <dd className="mono">
            {priceIn === null
              ? "unknown"
              : `${formatUsd(priceIn)} in · ${priceOut === null ? "unknown" : formatUsd(priceOut)} out`}
          </dd>
        </div>
      </dl>

      <div className="ws-budget">
        <div className="ws-budget-row">
          <span>Today</span>
          <strong className="mono">
            {limit === null ? `${formatUsd(spent)} spent` : `${formatUsd(spent)} / ${formatUsd(limit)}`}
          </strong>
        </div>
        {limit === null ? null : (
          <div className="ws-budget-bar" role="progressbar" aria-valuenow={ratio} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${ratio}%` }} />
          </div>
        )}
      </div>

      <p className="hint">No key, request header or prompt text is shown here. The guard prompt goes with every request.</p>
    </div>
  );
}
