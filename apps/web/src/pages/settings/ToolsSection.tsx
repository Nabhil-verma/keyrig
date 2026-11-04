import { RISK_LABELS, TOOL_SPECS } from "@keyrig/core";
import { ToolStudio } from "../../components/ToolStudio";
import { AGENT_RISK_VERSION, useAgentSettings, writeAgentSettings } from "../../stores/toolSettings";
import { Section } from "./Section";

/** AS-01, AS-02 and MC-04: the tool list and the risk acknowledgement. */
export function ToolsSection() {
  const settings = useAgentSettings();
  const acknowledged = settings.acknowledgedVersion >= AGENT_RISK_VERSION;

  const toggleTool = (name: string): void => {
    writeAgentSettings({
      enabledTools: settings.enabledTools.includes(name)
        ? settings.enabledTools.filter((item) => item !== name)
        : [...settings.enabledTools, name],
    });
  };

  return (
    <Section
      id="tools"
      eyebrow="Tools"
      title="Tools on this device"
      text="The agent works on a workspace in this browser. It runs only the tools that you turn on, and it asks before a risky call."
    >
      <div className="risk-box">
        <strong>What each tool can do</strong>
        <ul>
          {TOOL_SPECS.map((tool) => (
            <li key={tool.name}>
              <span className="mono">{tool.name}</span> · {RISK_LABELS[tool.risk]} · {tool.effects[0]}
            </li>
          ))}
        </ul>
      </div>

      <label className="risk-check">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) =>
            writeAgentSettings({
              acknowledgedVersion: event.target.checked ? AGENT_RISK_VERSION : 0,
              ...(event.target.checked ? {} : { enabled: false }),
            })
          }
        />
        <span>
          I understand these risks. The model can read any workspace file and send that text to my provider.
        </span>
      </label>

      <div className="settings-row">
        <div className="settings-row-copy">
          <strong>Agent tools</strong>
          <p>Off by default. The model gets a tool only when this switch is on.</p>
        </div>
        <button
          type="button"
          className="settings-switch"
          aria-pressed={settings.enabled}
          disabled={!acknowledged}
          onClick={() => writeAgentSettings({ enabled: !settings.enabled })}
        >
          <span className="settings-switch-dot" />
          {settings.enabled ? "On" : "Off"}
        </button>
      </div>

      <ul className="settings-list">
        {TOOL_SPECS.map((tool) => {
          const on = settings.enabledTools.includes(tool.name);
          return (
            <li key={tool.name} className="settings-item">
              <div className="settings-item-main">
                <strong>{tool.title}</strong>
                <p>{tool.description}</p>
              </div>
              <div className="settings-item-actions">
                <span className={`chip ${tool.risk === "read" ? "chip--plain" : "chip--amber"}`}>
                  {RISK_LABELS[tool.risk]}
                </span>
                <button
                  type="button"
                  className="settings-switch"
                  aria-pressed={on}
                  disabled={!acknowledged}
                  onClick={() => toggleTool(tool.name)}
                >
                  <span className="settings-switch-dot" />
                  {on ? "On" : "Off"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="settings-row">
        <div className="settings-row-copy">
          <strong>Approve a write without a prompt</strong>
          <p>A delete and a GitHub commit always ask, even when this switch is on.</p>
        </div>
        <button
          type="button"
          className="settings-switch"
          aria-pressed={settings.autoApproveWrites}
          disabled={!acknowledged}
          onClick={() => writeAgentSettings({ autoApproveWrites: !settings.autoApproveWrites })}
        >
          <span className="settings-switch-dot" />
          {settings.autoApproveWrites ? "On" : "Off"}
        </button>
      </div>

      <div className="settings-note">
        <strong>The GitHub switch lives in the profile.</strong> A commit needs that switch, a connected account and
        a repository in the workspace. Every commit still asks you.
      </div>

      <ToolStudio />
    </Section>
  );
}
