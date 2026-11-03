import type { AgentEvent, UsageEvent } from "@keyrig/core";
import type { WorkspaceFile } from "../../stores/workspace";
import type { SpendDay } from "../../stores/spendStore";
import { OutboundPanel } from "../../components/OutboundPanel";
import { ToolTrace } from "../../components/ToolTrace";
import { WorkspacePanel } from "../../components/WorkspacePanel";

export type InspectTab = "outbound" | "files" | "tools";

const TABS: ReadonlyArray<{ id: InspectTab; label: string }> = [
  { id: "outbound", label: "Outbound" },
  { id: "files", label: "Files" },
  { id: "tools", label: "Tools" },
];

interface InspectorProps {
  tab: InspectTab;
  onTab: (tab: InspectTab) => void;
  providerName: string;
  wireFormat: string;
  endpoint: string;
  modelId: string;
  keyLabel: string | null;
  messageCount: number;
  toolsOn: boolean;
  toolCount: number;
  priceIn: number | null;
  priceOut: number | null;
  spent: number;
  limit: number | null;
  days: SpendDay[];
  requests: UsageEvent[];
  files: WorkspaceFile[];
  onRemoveFile: (path: string) => void;
  tools: AgentEvent[];
}

/** The right side: what leaves the device, the workspace files and the tool record. */
export function Inspector({
  tab,
  onTab,
  providerName,
  wireFormat,
  endpoint,
  modelId,
  keyLabel,
  messageCount,
  toolsOn,
  toolCount,
  priceIn,
  priceOut,
  spent,
  limit,
  days,
  requests,
  files,
  onRemoveFile,
  tools,
}: InspectorProps) {
  return (
    <aside className="ws-inspect">
      <div className="ws-tabs" role="tablist" aria-label="Inspector">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className="ws-tab"
            onClick={() => onTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="ws-inspect-body">
        {tab === "outbound" ? (
          <OutboundPanel
            provider={providerName}
            wireFormat={wireFormat}
            endpoint={endpoint}
            model={modelId}
            keyLabel={keyLabel}
            messageCount={messageCount}
            toolsOn={toolsOn}
            toolCount={toolCount}
            priceIn={priceIn}
            priceOut={priceOut}
            spent={spent}
            limit={limit}
            days={days}
            requests={requests}
          />
        ) : tab === "files" ? (
          <WorkspacePanel files={files} onRemove={onRemoveFile} />
        ) : tools.length > 0 ? (
          <ToolTrace events={tools} open />
        ) : (
          <p className="hint">No tool ran in this chat. Turn the agent on in Settings to give the model a tool.</p>
        )}
      </div>
    </aside>
  );
}
