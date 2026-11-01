import { describe, expect, it } from "vitest";
import {
  AGENT_RISK_VERSION,
  READ_TOOLS,
  activeTools,
  getAgentSettings,
  normalizeAgentSettings,
  writeAgentSettings,
} from "./toolSettings";

describe("the agent settings", () => {
  it("is off by default and offers the read tools", () => {
    const settings = normalizeAgentSettings(null);
    expect(settings.enabled).toBe(false);
    expect(settings.enabledTools).toEqual([...READ_TOOLS]);
    expect(settings.autoApproveWrites).toBe(false);
    expect(activeTools(settings)).toEqual([]);
  });

  it("gives no tool before the user reads the risk list", () => {
    expect(activeTools(normalizeAgentSettings({ enabled: true }))).toEqual([]);
  });

  it("gives the tools after the user reads the risk list", () => {
    const settings = normalizeAgentSettings({
      enabled: true,
      acknowledgedVersion: AGENT_RISK_VERSION,
      enabledTools: ["read_file"],
    });
    expect(activeTools(settings)).toEqual(["read_file"]);
  });

  it("keeps only known strings and removes a copy", () => {
    const settings = normalizeAgentSettings({ enabledTools: ["read_file", "read_file", 4, "write_file"] });
    expect(settings.enabledTools).toEqual(["read_file", "write_file"]);
  });

  it("saves a change", () => {
    writeAgentSettings({ enabled: true, acknowledgedVersion: AGENT_RISK_VERSION });
    expect(getAgentSettings().enabled).toBe(true);
    expect(activeTools(getAgentSettings())).toEqual([...READ_TOOLS]);
  });
});
