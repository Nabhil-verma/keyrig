# Roles and permissions

keyrig checks a permission key before a protected feature runs. A role is a set of permission keys. The
owner role holds every key.

The role records stay on this device. keyrig has no server, so the records live in browser storage with
the accounts. This file describes the keys, the roles and the rules. The code is in
[packages/core/src/rbac.ts](../packages/core/src/rbac.ts).

## Permission keys

AC-01: the permission keys are the contract. A feature checks one key. Do not check a role name in a
feature.

| Key | The feature it controls | Owner | Admin | Member | Viewer |
|---|---|---|---|---|---|
| `chat.send` | Send a prompt and stop a stream. | Yes | Yes | Yes | No |
| `keys.manage` | Add, replace and delete a key. | Yes | Yes | Yes | No |
| `route.manage` | Choose the provider, the model, the key and the base URL. | Yes | Yes | Yes | No |
| `arena.run` | Run one prompt on several models. | Yes | Yes | Yes | No |
| `roles.assign` | Grant and revoke a role. | Yes | Yes | No | No |

## Roles

| Role | Rank | Access |
|---|---|---|
| Owner | 3 | Every permission key. Grants every role. Bypasses the rank rule. |
| Admin | 2 | Every key except the owner grant. Grants the member and viewer roles. |
| Member | 1 | Uses the product: chat, keys, route and arena. Cannot change a role. |
| Viewer | 0 | Read only. Cannot send, add a key or change the route. |

The first account on the device becomes the owner. A later account starts as a viewer. An owner or an
admin gives the later account a role.

## Rules

| Rule | Meaning |
|---|---|
| AC-01 | The owner holds every permission key. A feature checks a key, not a role. |
| AC-02 | An account without a role record has the viewer role. Least access is the default. |
| AC-03 | The first account on the device becomes the owner. A later account starts as a viewer. |
| AC-04 | A role change needs `roles.assign`. Nobody changes their own role. Only an owner grants the owner role. A grant stays below the rank of the person who grants it. |
| AC-05 | The last owner keeps the owner role. |
| AC-06 | A revoke sets the viewer role. The account keeps its record. |

## Where the records live

One document holds the role of each account:

```json
{
  "schemaVersion": 1,
  "data": [{ "username": "alice", "role": "owner", "updatedAt": "2026-10-23T12:00:00.000Z" }]
}
```

- The storage key is `keyrig.roles.v1`.
- The document holds no secret. It holds a username, a role and a date.
- An account that existed before this feature gets its record on the next sign-in. The oldest account
  takes the owner role when the device has no owner.
- A person with the browser can change the document. The checks stop mistakes and they show the intent.
  They are not a security boundary against the device owner.

## Where the app shows the check

| Place | Key | Result without the key |
|---|---|---|
| `apps/web/src/App.tsx` | `chat.send` | The composer is disabled and shows a reason. |
| `apps/web/src/App.tsx` | `arena.run` | The arena run button is disabled and shows a reason. |
| `apps/web/src/KeyPanel.tsx` | `keys.manage` | The key fields and the buttons are disabled. |
| `apps/web/src/ProfilePanel.tsx` | `route.manage` | The provider, model, key and base URL fields are disabled. |
| `apps/web/src/RolesPanel.tsx` | `roles.assign` | The panel is hidden. |

The core keeps the last line of defense. `assignRole` and `revokeRole` throw the `role_forbidden` error
when the actor has no `roles.assign` key or breaks a rule.

## Add or rename a key

1. Change `PERMISSION_KEYS`, `PERMISSION_FEATURES` and `ROLE_PERMISSIONS` in
   [packages/core/src/rbac.ts](../packages/core/src/rbac.ts).
2. Change the gate that uses the key.
3. Add or update the test in `packages/core/src/tests/rbac.test.ts`.
4. Update this file.

The keys are one list, so a new reference file can replace the names in one place.
