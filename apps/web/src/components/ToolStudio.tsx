import { useState } from "react";
import {
  PERMISSION_LABELS,
  TOOL_DESCRIPTION_LIMIT,
  TOOL_NAME_LIMIT,
  TOOL_PERMISSIONS,
  TOOL_SCRIPT_LIMIT,
  diffTools,
  draftNote,
  draftTool,
  runToolInSandbox,
  type NewToolInput,
  type Tool,
  type ToolDiffLine,
  type ToolEntry,
  type ToolPermission,
} from "@keyrig/core";
import { getToolRegistry } from "../stores/toolRegistry";
import { browserToolWorker } from "../services/toolSandbox";
import { ToolWarningDialog, type ToolWarningRequest } from "./ToolWarningDialog";
import { Icon } from "./ui/Icon";

const SCHEMA_TEMPLATE = `{
  "type": "object",
  "properties": {
    "text": { "type": "string", "description": "The text that the tool works on." }
  },
  "required": ["text"],
  "additionalProperties": false
}`;

interface FormState {
  name: string;
  description: string;
  permissions: ToolPermission[];
  schema: string;
  script: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  permissions: ["none"],
  schema: SCHEMA_TEMPLATE,
  script: 'return { result: String(input.text ?? "") };',
};

const OK = { acknowledged: true } as const;

function messageOf(caught: unknown): string {
  return caught instanceof Error && caught.message.length > 0
    ? caught.message
    : "keyrig cannot finish that action.";
}

function permissionChips(permissions: readonly ToolPermission[]) {
  return permissions.map((permission) => (
    <span
      key={permission}
      className={`chip ${permission === "none" ? "chip--plain" : "chip--amber"}`}
    >
      {PERMISSION_LABELS[permission]}
    </span>
  ));
}

function DiffView({ lines }: { lines: ToolDiffLine[] }) {
  return (
    <pre className="tool-diff" aria-label="Review diff">
      {lines.map((line, index) => (
        <span key={`${index}-${line.kind}`} className={`tool-diff-line tool-diff-line--${line.kind}`}>
          {line.kind === "add" ? "+ " : line.kind === "remove" ? "- " : "  "}
          {line.text}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

/**
 * Phase 2, item 1: the tool studio.
 *
 * A person adds a tool by hand, drafts one with the agent, imports one, edits
 * a copy or resets a copy. The warning comes before every create, import,
 * enable or save that changes the code (AS-01). A tool never runs before an
 * approval, and a permission change asks again.
 */
export function ToolStudio() {
  const registry = getToolRegistry();
  const [entries, setEntries] = useState<ToolEntry[]>(() => registry.list());
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [warning, setWarning] = useState<ToolWarningRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draft, setDraft] = useState<Tool | null>(null);
  const [draftDiff, setDraftDiff] = useState<ToolDiffLine[] | null>(null);
  const [importText, setImportText] = useState("");
  const [testInput, setTestInput] = useState('{ "text": "Hello keyrig" }');
  const [output, setOutput] = useState<{ id: string; text: string } | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const refresh = (): void => {
    setEntries(registry.list());
  };

  const openWarning = (action: string, toolName: string, permissions: ToolPermission[], label: string, run: () => void): void => {
    setError(null);
    setWarning({ action, toolName, permissions, confirmLabel: label, onConfirm: () => {
      try {
        run();
        setWarning(null);
        refresh();
      } catch (caught) {
        setError(messageOf(caught));
      }
    } });
  };

  const togglePermission = (permission: ToolPermission): void => {
    setForm((current) => {
      if (permission === "none") {
        return { ...current, permissions: ["none"] };
      }
      const without = current.permissions.filter((item) => item !== "none" && item !== permission);
      const next = current.permissions.includes(permission) ? without : [...without, permission];
      return { ...current, permissions: next.length === 0 ? ["none"] : next };
    });
  };

  const inputFromForm = (): NewToolInput => {
    let schema: unknown;
    try {
      schema = JSON.parse(form.schema);
    } catch {
      throw new Error("The input schema is not JSON.");
    }
    return {
      name: form.name,
      description: form.description,
      inputSchema: schema,
      permissions: form.permissions,
      script: form.script,
    };
  };

  const saveForm = (): void => {
    let input: NewToolInput;
    try {
      input = inputFromForm();
    } catch (caught) {
      setError(messageOf(caught));
      return;
    }
    if (editingId === null) {
      openWarning("Create a tool", input.name, form.permissions, "Create the tool", () => {
        registry.create(input, OK);
        setShowForm(false);
        setForm(EMPTY_FORM);
        setNote("The tool is saved and off. Turn it on when you are ready.");
      });
      return;
    }
    openWarning("Save a copy", input.name, form.permissions, "Save the copy", () => {
      registry.edit(editingId, input, OK);
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      setNote("The copy is saved. The built-in tool did not change.");
    });
  };

  const loadCopy = (entry: ToolEntry): void => {
    setEditingId(entry.tool.id);
    setShowForm(true);
    setDraft(null);
    setDraftDiff(null);
    setForm({
      name: entry.tool.name,
      description: entry.tool.description,
      permissions: entry.tool.permissions,
      schema: JSON.stringify(entry.tool.inputSchema, null, 2),
      script: entry.tool.script,
    });
    setNote(entry.original === null ? "Change your tool." : "You edit a copy. The original stays as it is.");
  };

  const draftWithAgent = (): void => {
    try {
      const next = draftTool(draftText);
      setDraft(next);
      setDraftDiff(diffTools(null, next));
      setError(null);
      setNote(draftNote());
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  const saveDraft = (): void => {
    if (draft === null) {
      return;
    }
    openWarning("Create a tool", draft.name, draft.permissions, "Save the draft", () => {
      registry.create(
        {
          name: draft.name,
          description: draft.description,
          inputSchema: draft.inputSchema,
          permissions: draft.permissions,
          script: draft.script,
        },
        OK,
      );
      setDraft(null);
      setDraftDiff(null);
      setDraftText("");
      setNote("The draft is saved and off. Read the diff once more in the list.");
    });
  };

  const importTool = (): void => {
    let parsed: { name?: unknown; permissions?: unknown } = {};
    try {
      parsed = JSON.parse(importText) as { name?: unknown; permissions?: unknown };
    } catch {
      setError("The import text is not JSON.");
      return;
    }
    const name = typeof parsed.name === "string" ? parsed.name : "imported tool";
    const permissions = Array.isArray(parsed.permissions)
      ? (parsed.permissions.filter((item): item is ToolPermission =>
          TOOL_PERMISSIONS.includes(item as (typeof TOOL_PERMISSIONS)[number]),
        ) as ToolPermission[])
      : [];
    openWarning("Import a tool", name, permissions.length > 0 ? permissions : ["none"], "Import the tool", () => {
      registry.importTool(importText, OK);
      setImportText("");
      setNote("The tool is imported and off. keyrig never runs an imported tool on its own.");
    });
  };

  const enable = (entry: ToolEntry): void => {
    openWarning("Enable a tool", entry.tool.name, entry.tool.permissions, "Turn the tool on", () => {
      registry.enable(entry.tool.id, OK);
      setNote("The tool is on. Read the warning again before the first run.");
    });
  };

  const runNow = async (entry: ToolEntry): Promise<void> => {
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(testInput) as Record<string, unknown>;
    } catch {
      setError("The test input is not JSON.");
      return;
    }
    setRunning(entry.tool.id);
    setError(null);
    try {
      const result = await runToolInSandbox({
        tool: entry.tool,
        input,
        approved: true,
        factory: browserToolWorker,
      });
      setOutput({ id: entry.tool.id, text: JSON.stringify(result.output, null, 2) });
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setRunning(null);
    }
  };

  const run = (entry: ToolEntry): void => {
    if (entry.needsApproval) {
      openWarning("Run a tool", entry.tool.name, entry.tool.permissions, "Approve and run", () => {
        registry.approve(entry.tool.id);
        void runNow(entry);
      });
      return;
    }
    void runNow(entry);
  };

  return (
    <div className="tool-studio">
      <div className="tool-studio-head">
        <div>
          <h3>Your tools</h3>
          <p>
            A premade tool is a frozen copy. An edit makes your own copy. A reset brings the original
            back.
          </p>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
              setForm(EMPTY_FORM);
              setNote(null);
              setError(null);
            }}
          >
            <Icon name="plus" size={12} />
            Add a tool
          </button>
        </div>
      </div>

      {note ? <p className="hint" role="status">{note}</p> : null}
      {error ? <p className="inline-error callout" role="alert">{error}</p> : null}

      <ul className="settings-list tool-list">
        {entries.map((entry) => (
          <li key={entry.tool.id} className="settings-item tool-item">
            <div className="settings-item-main">
              <div className="tool-item-title">
                <strong>{entry.tool.name}</strong>
                <span className="chip chip--plain">{entry.tool.source}</span>
                {entry.isEdited ? <span className="chip chip--amber">your copy</span> : null}
                <span className="chip chip--plain mono">v{entry.tool.version}</span>
              </div>
              <p>{entry.tool.description}</p>
              <div className="tool-perms">{permissionChips(entry.tool.permissions)}</div>
              {entry.enabled && entry.needsApproval ? (
                <p className="hint">Approve this tool before the next run.</p>
              ) : null}
            </div>
            <div className="settings-item-actions tool-actions">
              <button
                type="button"
                className="settings-switch"
                aria-pressed={entry.enabled}
                onClick={() => (entry.enabled ? (registry.disable(entry.tool.id), refresh()) : enable(entry))}
              >
                <span className="settings-switch-dot" />
                {entry.enabled ? "On" : "Off"}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={!entry.enabled || running !== null}
                onClick={() => run(entry)}
              >
                <Icon name="bolt" size={12} />
                {running === entry.tool.id ? "Running" : "Run"}
              </button>
              <button type="button" className="btn btn--quiet btn--sm" onClick={() => loadCopy(entry)}>
                <Icon name="file" size={12} />
                Edit a copy
              </button>
              {entry.isEdited ? (
                <button
                  type="button"
                  className="btn btn--quiet btn--sm"
                  onClick={() => {
                    registry.reset(entry.tool.id);
                    refresh();
                    setNote("The original tool is back.");
                  }}
                >
                  <Icon name="refresh" size={12} />
                  Reset
                </button>
              ) : null}
              {entry.original === null ? (
                <button
                  type="button"
                  className="btn btn--quiet btn--sm"
                  onClick={() => {
                    registry.remove(entry.tool.id);
                    refresh();
                  }}
                >
                  <Icon name="trash" size={12} />
                  Remove
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="tool-test">
        <label htmlFor="tool-test-input">Test input (JSON)</label>
        <textarea
          id="tool-test-input"
          className="textarea mono"
          rows={2}
          value={testInput}
          onChange={(event) => setTestInput(event.target.value)}
        />
        {output !== null ? (
          <pre className="tool-output" aria-label="Tool output">{output.text}</pre>
        ) : null}
      </div>

      {showForm ? (
        <div className="tool-form">
          <h3>{editingId === null ? "Add a tool by hand" : "Edit the copy"}</h3>
          <div className="field">
            <label htmlFor="tool-name">Name</label>
            <input
              id="tool-name"
              className="input mono"
              value={form.name}
              maxLength={TOOL_NAME_LIMIT}
              placeholder="Example: summarize_text"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="tool-description">Description</label>
            <input
              id="tool-description"
              className="input"
              value={form.description}
              maxLength={TOOL_DESCRIPTION_LIMIT}
              placeholder="One sentence that tells the model what the tool does."
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </div>
          <div className="field">
            <span className="field-label">Permissions</span>
            <div className="segmented" role="group" aria-label="Permissions">
              {(["none", ...TOOL_PERMISSIONS] as const).map((permission) => (
                <button
                  key={permission}
                  type="button"
                  className="segmented-item"
                  aria-pressed={form.permissions.includes(permission)}
                  onClick={() => togglePermission(permission)}
                >
                  {PERMISSION_LABELS[permission]}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="tool-schema">Input schema (JSON)</label>
            <textarea
              id="tool-schema"
              className="textarea mono"
              rows={7}
              value={form.schema}
              onChange={(event) => setForm({ ...form, schema: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="tool-script">Script</label>
            <textarea
              id="tool-script"
              className="textarea mono"
              rows={5}
              maxLength={TOOL_SCRIPT_LIMIT}
              value={form.script}
              onChange={(event) => setForm({ ...form, script: event.target.value })}
            />
            <p className="hint">
              The script is the body of one function. It reads input and api and returns JSON.
            </p>
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn--primary" onClick={saveForm}>
              <Icon name="check" size={13} />
              {editingId === null ? "Create the tool" : "Save the copy"}
            </button>
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setForm(EMPTY_FORM);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="tool-draft">
        <h3>Draft a tool with the agent</h3>
        <p>Describe the tool. The agent writes a draft. You read the diff, then you save it.</p>
        <textarea
          className="textarea"
          rows={2}
          value={draftText}
          placeholder="For example: make a short summary of one long text."
          onChange={(event) => setDraftText(event.target.value)}
        />
        <div className="btn-row">
          <button type="button" className="btn btn--ghost btn--sm" onClick={draftWithAgent}>
            <Icon name="spark" size={12} />
            Draft with the agent
          </button>
          {draft !== null ? (
            <button type="button" className="btn btn--primary btn--sm" onClick={saveDraft}>
              Save the draft
            </button>
          ) : null}
        </div>
        {draftDiff !== null ? <DiffView lines={draftDiff} /> : null}
      </div>

      <div className="tool-import">
        <h3>Import a tool</h3>
        <p>Paste one tool as JSON. keyrig checks it, scans it for a key and keeps it off.</p>
        <textarea
          className="textarea mono"
          rows={3}
          value={importText}
          placeholder='{ "name": "my_tool", ... }'
          onChange={(event) => setImportText(event.target.value)}
        />
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={importText.trim().length === 0}
            onClick={importTool}
          >
            <Icon name="download" size={12} />
            Import the tool
          </button>
        </div>
      </div>

      <ToolWarningDialog
        request={warning}
        error={error}
        onClose={() => {
          setWarning(null);
          setError(null);
        }}
      />
    </div>
  );
}
