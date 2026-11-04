import { listAccounts, readAssignments } from "@keyrig/core";
import { BackendPanel } from "../../components/BackendPanel";
import { browserStorage } from "../../lib/storage";
import { DISPLAY_NAME_LIMIT, useSettings, writeSettings } from "../../stores/settings";
import { Link } from "../../app/router";
import { Section } from "./Section";

/**
 * Item 1: the profile section of the settings page.
 *
 * The name is a device record. It never leaves this browser (PR-05). The
 * account list shows the names and the roles that this device holds.
 */
export function ProfileSection() {
  const settings = useSettings();
  const storage = browserStorage();
  const accounts = listAccounts(storage);
  const assignments = readAssignments({ storage });

  return (
    <Section
      id="profile"
      eyebrow="Profile"
      title="How keyrig greets you"
      text="The name stays on this device. keyrig sends it to no server."
    >
      <div className="field">
        <label htmlFor="display-name">Display name</label>
        <input
          id="display-name"
          className="input"
          value={settings.displayName}
          maxLength={DISPLAY_NAME_LIMIT}
          placeholder="For example: Alex"
          onChange={(event) => writeSettings({ displayName: event.target.value })}
        />
        <p className="hint">
          The dashboard uses this name. Leave the field empty to show the account name.
        </p>
      </div>

      <div className="settings-row">
        <div className="settings-row-copy">
          <strong>Accounts on this device</strong>
          <p>The role of each account is a local record. Sign in to change a role.</p>
        </div>
      </div>

      {accounts.length === 0 ? (
        <p className="settings-empty">No account on this device yet.</p>
      ) : (
        <ul className="settings-list">
          {accounts.map((account) => {
            const role = assignments.find((item) => item.username === account.username)?.role;
            return (
              <li key={account.username} className="settings-item">
                <div className="settings-item-main">
                  <strong>{account.username}</strong>
                  <p>Created {new Date(account.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="settings-item-actions">
                  <span className="chip chip--plain">{role ?? "viewer"}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="panel-divider" />
      <BackendPanel />

      <div className="btn-row">
        <Link to="/app" className="btn btn--ghost btn--sm">
          Open the workspace profile
        </Link>
      </div>
    </Section>
  );
}
