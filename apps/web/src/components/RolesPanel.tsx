import type { AccountRecord, RoleAssignment, RoleId } from "@keyrig/core";
import { ROLE_IDS, ROLE_LABELS, ROLE_RANK } from "@keyrig/core";
import { Icon } from "./ui/Icon";

interface RolesPanelProps {
  accounts: AccountRecord[];
  assignments: RoleAssignment[];
  currentUser: string;
  actorRole: RoleId;
  error: string | null;
  onAssign: (target: string, role: RoleId) => void;
}

function roleFor(assignments: RoleAssignment[], username: string): RoleId {
  return assignments.find((item) => item.username === username)?.role ?? "viewer";
}

export function RolesPanel({ accounts, assignments, currentUser, actorRole, error, onAssign }: RolesPanelProps) {
  return (
    <section className="panel" aria-labelledby="roles-title">
      <div className="panel-head">
        <div className="panel-title">
          <span className="eyebrow eyebrow--amber">Access</span>
          <h2 id="roles-title">Roles</h2>
        </div>
        <span className="state-pill" data-state="unlocked">
          {actorRole.toUpperCase()}
        </span>
      </div>

      <ul className="key-list">
        {accounts.map((account) => {
          const role = roleFor(assignments, account.username);
          const isSelf = account.username === currentUser;
          const locked =
            isSelf ||
            (role === "owner" && actorRole !== "owner") ||
            (actorRole !== "owner" && ROLE_RANK[role] >= ROLE_RANK[actorRole]);

          return (
            <li key={account.username} className="key-card">
              <div className="key-card-top">
                <span className="key-glyph">
                  <Icon name="shield" size={15} />
                </span>
                <div className="key-id">
                  <div className="key-name">
                    <strong>{account.username}</strong>
                    <span className="key-mask">{isSelf ? "you" : ROLE_LABELS[role]}</span>
                  </div>
                  <div className="key-provider">{ROLE_LABELS[role]}</div>
                </div>
              </div>

              <div className="field">
                <label htmlFor={`role-${account.username}`}>Role</label>
                <select
                  id={`role-${account.username}`}
                  className="select"
                  value={role}
                  disabled={locked}
                  onChange={(event) => onAssign(account.username, event.target.value as RoleId)}
                >
                  {ROLE_IDS.map((id) => (
                    <option
                      key={id}
                      value={id}
                      disabled={id === "owner" ? actorRole !== "owner" : actorRole !== "owner" && ROLE_RANK[id] >= ROLE_RANK[actorRole]}
                    >
                      {ROLE_LABELS[id]}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          );
        })}
      </ul>

      {error ? <p className="inline-error callout">{error}</p> : null}
      <p className="hint">
        An owner gives the owner role. An admin gives the member and viewer roles. You cannot change your own
        role. The last owner keeps the owner role.
      </p>
    </section>
  );
}
