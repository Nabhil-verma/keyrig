# Decisions

The owner answered the open questions in section 7 of the reference spec on 2026-10-17.

| Number | Question | Decision |
|---|---|---|
| D-01 | First platform | Web and desktop. The web app comes first. Keys use WebCrypto (KS-02). The desktop keychain comes later (KS-01). |
| D-02 | v1 scope | Chat, arena and artifacts. The coding agent comes in Phase 3. |
| D-03 | Day-one providers | OpenAI-compatible, Anthropic and Ollama. |
| D-04 | Server | No server. All data stays on the device. Corrected 2026-10-29: one optional hosted model runs on keyrig's Worker at `/api/ai/v1`. It runs only when the visitor picks it, and every other provider is still called from the browser (D-14). |
| D-05 | License | MIT. |
| D-06 | Teams | No. keyrig is for one user at a time. |

## Consequences

- KS-02 is the first key rule to build. KS-01 is a later item for the desktop app.
- PR-01 held while the repository had no server code. It changed on 2026-10-29: the Worker holds one route for the optional hosted model. The rule now reads: no keyrig server receives a key, and no keyrig server sees a prompt unless the visitor picks the hosted model.
- The catalog cache lives in the browser. The app must start with the cache when the network is off (PV-01).
- Recorded-traffic tests replace real keys in CI (TS-01).
