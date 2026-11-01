import { RISK_LABELS, type AgentApprovalRequest } from "@keyrig/core";
import { Icon } from "../ui/Icon";

/**
 * AS-01: one write, one yes. The card sits in the answer stream, so the user
 * reads the request in the place where the answer arrives. It states the tool,
 * the risk, the effect and the exact arguments before anything runs.
 */
export function ApprovalCard({
  request,
  onDecision,
}: {
  request: AgentApprovalRequest;
  onDecision: (decision: "approve" | "deny") => void;
}) {
  const { tool, args, summary } = request;
  const path = typeof args.path === "string" ? args.path : null;
  const content = typeof args.content === "string" ? args.content : null;
  const message = typeof args.message === "string" ? args.message : null;
  const files = Array.isArray(args.files) ? (args.files as string[]) : null;

  return (
    <section className="ws-approval" role="group" aria-labelledby="approval-title">
      <header className="ws-approval-head">
        <span className="ws-approval-icon">
          <Icon name="shield" size={14} />
        </span>
        <div>
          <span className="eyebrow eyebrow--amber">Approval needed</span>
          <h3 id="approval-title">{tool.title}</h3>
        </div>
        <span className="chip chip--amber">{RISK_LABELS[tool.risk]}</span>
      </header>

      <p className="ws-approval-summary">{summary}</p>

      <ul className="ws-approval-effects">
        {tool.effects.map((effect) => (
          <li key={effect}>{effect}</li>
        ))}
      </ul>

      <dl className="ws-approval-facts">
        {path !== null ? (
          <div>
            <dt>Path</dt>
            <dd className="mono">{path}</dd>
          </div>
        ) : null}
        {content !== null ? (
          <div>
            <dt>Text</dt>
            <dd className="mono ws-approval-text">{content.slice(0, 400)}</dd>
          </div>
        ) : null}
        {message !== null ? (
          <div>
            <dt>Commit message</dt>
            <dd>{message}</dd>
          </div>
        ) : null}
        {files !== null ? (
          <div>
            <dt>Files</dt>
            <dd className="mono">{files.join(", ")}</dd>
          </div>
        ) : null}
      </dl>

      <div className="ws-approval-actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onDecision("deny")}>
          Deny
        </button>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => onDecision("approve")}>
          <Icon name="check" size={13} />
          Approve once
        </button>
      </div>
      <p className="hint">This call runs one time. The next call asks again.</p>
    </section>
  );
}
