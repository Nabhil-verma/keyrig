import { RISK_LABELS, type AgentEvent } from "@keyrig/core";
import { Icon, type IconName } from "../ui/Icon";

/**
 * MC-03: the tool calls of one answer. The section is closed by default, so a
 * long run does not push the answer down. A stopped call opens the summary.
 */
const STATUS_ICON: Record<AgentEvent["status"], IconName> = {
  running: "refresh",
  done: "check",
  denied: "lock",
  blocked: "alert",
  error: "alert",
};

const STATUS_LABEL: Record<AgentEvent["status"], string> = {
  running: "Running",
  done: "Done",
  denied: "Denied",
  blocked: "Stopped",
  error: "Failed",
};

export function ToolTrace({ events, open = false }: { events: AgentEvent[]; open?: boolean }) {
  if (events.length === 0) {
    return null;
  }
  const stopped = events.filter(
    (event) => event.status === "denied" || event.status === "blocked" || event.status === "error",
  ).length;

  return (
    <details className="ws-steps" open={open}>
      <summary className="ws-steps-head">
        <span className="ws-steps-title">
          <Icon name={stopped > 0 ? "alert" : "bolt"} size={12} />
          {events.length} {events.length === 1 ? "tool step" : "tool steps"}
        </span>
        <span className="ws-steps-state">{stopped > 0 ? `${stopped} stopped` : "complete"}</span>
      </summary>
      <ol className="ws-steps-list">
        {events.map((event) => (
          <li key={`${event.id}-${event.startedAt}`} className="ws-step" data-state={event.status}>
            <span className="ws-step-icon">
              <Icon name={STATUS_ICON[event.status]} size={11} />
            </span>
            <div className="ws-step-main">
              <div className="ws-step-line">
                <strong>{event.title}</strong>
                <span className="chip chip--plain">{RISK_LABELS[event.risk]}</span>
                <span className="ws-step-state">{STATUS_LABEL[event.status]}</span>
                {event.durationMs > 0 ? <span className="ws-step-time">{event.durationMs} ms</span> : null}
              </div>
              <p className="ws-step-summary">{event.summary}</p>
              {typeof event.args.path === "string" ? <p className="ws-step-path mono">{event.args.path}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
