import { KeyVault, accountStorage, listAccounts } from "@keyrig/core";
import { Link } from "../../app/router";
import { browserStorage } from "../../lib/storage";
import { Section } from "./Section";

/**
 * Item 1: the keys section of the settings page.
 *
 * The page cannot read a key list: the vault is locked until a person signs in
 * with the passphrase. The section shows the vault facts and where the vault
 * lives. The key list and the key buttons are in the workspace (KS-04).
 */
export function KeysSection() {
  const storage = browserStorage();
  const accounts = listAccounts(storage);

  return (
    <Section
      id="keys"
      eyebrow="Keys"
      title="The key vault"
      text="Each key is encrypted with your passphrase and saved in this browser. keyrig sends no key to a server."
    >
      <div className="settings-note">
        <strong>PR-01.</strong> A tool cannot read the vault. A published item cannot hold a key.
      </div>

      {accounts.length === 0 ? (
        <p className="settings-empty">
          Create an account in the workspace. Then add a key for each provider that you use.
        </p>
      ) : (
        <ul className="settings-list">
          {accounts.map((account) => {
            const vault = new KeyVault({ storage: accountStorage(storage, account.username) });
            return (
              <li key={account.username} className="settings-item">
                <div className="settings-item-main">
                  <strong>{account.username}</strong>
                  <p>
                    {vault.hasStoredVault()
                      ? "An encrypted vault is on this device. Sign in to unlock it."
                      : "No vault on this device yet."}
                  </p>
                </div>
                <div className="settings-item-actions">
                  <span className={`chip ${vault.hasStoredVault() ? "chip--amber" : "chip--plain"}`}>
                    {vault.hasStoredVault() ? "vault saved" : "no vault"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="btn-row">
        <Link to="/app" className="btn btn--ghost btn--sm">
          Open the key vault
        </Link>
      </div>

      <p className="hint">
        The workspace shows only a key label and the last four characters. It shows no secret.
      </p>
    </Section>
  );
}
