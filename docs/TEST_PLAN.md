# Test plan

The tests need no key and no network. Run `npm test`.

## Safety

| Rule | Test |
|---|---|
| KS-02 the vault encrypts keys before storage | `packages/core/src/tests/vault.test.ts`: "does not write the secret, the label or the last four characters to storage" |
| KS-02 a wrong passphrase fails clearly | `vault.test.ts`: "rejects a wrong passphrase with a clear error" |
| KS-02 damaged data does not unlock | `vault.test.ts`: "does not unlock after the ciphertext changes" |
| KS-03 one redaction function | `packages/shared/src/tests/redact-and-errors.test.ts`: "masks a key in each sink representation" |
| KS-04 show the label and the last four characters | `redact-and-errors.test.ts`: "shows only the last four characters"; `vault.test.ts`: "returns the label and the last four characters only" |
| KS-05 replace a key without a new id | `vault.test.ts`: "replaces a key without a change to its id" |
| KS-05 last-used date | `vault.test.ts`: "records the created date and the last-used date" |
| KS-06 auth uses status 401 and 403 only | `packages/providers/src/tests/classify.test.ts`: "does not treat a 400 that quotes the word unauthorized as auth" |
| KS-06 a 401 in the call path | `stream.test.ts`: "classifies status 401 as auth and keeps the sent key out of the error" |
| KS-07 warn about a custom base URL | `manifest.test.ts`: "allows a local address and gives a warning"; `stream.test.ts`: "adds a warning for a local base URL" |
| KS-07 block cloud metadata | `manifest.test.ts`: "blocks a cloud metadata address"; `stream.test.ts`: "blocks a metadata address before the request" |

## Errors

| Rule | Test |
|---|---|
| ER-01 the fixed category list | `redact-and-errors.test.ts`: "gives every category a default copy" |
| ER-02 one error shape | `redact-and-errors.test.ts`: "has one shape with a code, a category, a message, retryable, an action and details" |
| ER-03 no key in the error path | `redact-and-errors.test.ts`: "masks a key in the message and in every detail value" |
| ER-04 overflow yes, rate limit no | `classify.test.ts`: "does not treat a token-per-minute limit as an overflow" |
| ER-05 one fix action for each category | `classify.test.ts`: "gives a rate limit a wait action and a visible wait time" |
| ER-05 overflow starts a shorter context | `stream.test.ts`: "classifies context overflow and starts the reduce-context fix" |

## Providers

| Rule | Test |
|---|---|
| PV-01 the catalog parses prices and limits | `catalog.test.ts`: "reads model ids, prices, limits and abilities" |
| PV-01 offline start with the cache | `catalog.test.ts`: "starts with a stale cache when the network is off" |
| PV-01 starter catalog when the cache is empty | `catalog.test.ts`: "starts with the bundled catalog when there is no cache and no network" |
| PV-02 manifest fields | `manifest.test.ts`: "has every required field and a unique id" |
| PV-03 intent, rule, wire format | `rules.test.ts`: "builds the OpenAI plan with a named rule" |
| PV-03 a new provider needs one rule | `rules.test.ts`: "adds a provider with one rule and no core change" |
| PV-05 local and custom endpoints | `manifest.test.ts`: "has the three day-one providers and the local types" |
| PV-07 image conversion | `rules.test.ts`: "converts an image for OpenAI", "for Anthropic", "for Ollama" |
| PV-08 partial text is kept | `stream.test.ts`: "keeps the partial text and marks the result aborted when the user stops" |
| PV-08 a broken stream is partial | `stream.test.ts`: "marks a broken stream as partial and does not retry it" |
| PV-09 retry one empty reply | `packages/core/src/tests/chat.test.ts`: "retries one empty reply and then succeeds" |
| PV-09 no retry after a tool | `chat.test.ts`: "does not retry a turn that already ran a tool" |

## Cost and usage

| Rule | Test |
|---|---|
| CO-01 cost parts | `cost.test.ts`: "adds the input, cached and output parts" |
| CO-01 unknown price is marked | `cost.test.ts`: "marks a missing price as unknown"; `chat.test.ts`: "marks an unknown price instead of a number" |
| CO-04 one usage event for each call | `chat.test.ts`: "returns the text, the cost, the key label and one usage event" |
| CO-04 the event holds no key | `chat.test.ts`: "does not put a key in the usage event" |

## Access control

| Rule | Test |
|---|---|
| AC-01 the owner holds every key | `packages/core/src/tests/rbac.test.ts`: "gives the owner every key and gives the other roles their own keys" |
| AC-03 the first account is the owner | `rbac.test.ts`: "makes the oldest account the owner and a later account a viewer"; "writes one record for each account and does not duplicate it" |
| AC-04 a role change needs the key | `rbac.test.ts`: "rejects a member and gives a clear reason"; "stops an admin from granting the owner role or another admin role"; "stops every account from changing its own role"; "rejects an unknown account and an unknown role" |
| AC-05 the last owner keeps the role | `rbac.test.ts`: "stops an admin from demoting the only owner"; "lets an owner step down when a second owner exists" |
| AC-06 a revoke sets the viewer role | `rbac.test.ts`: "sets the viewer role and keeps the record" |

## Architecture and tests

| Rule | Test |
|---|---|
| AR-01 layer order | `npm run check:layers` |
| AR-03 one-time migration | `packages/shared/src/tests/schema.test.ts`: "does not run a migration twice" |
| TS-01 recorded provider traffic | `stream.test.ts`: the three replay tests |
| TS-03 negative cases | `classify.test.ts` and `stream.test.ts` |
| TS-04 no prompt or path in the error | `stream.test.ts`: "does not put the prompt or a file path in the error text" |

## Hosted model (2026-10-29)

The hosted model is the one route on keyrig's Worker. Its logic is pure, so the tests need no network
and no token.

| Rule | Test |
|---|---|
| The allowlist refuses every other model | `sites-preview/hosted.test.mjs`: "refuses a body that names a model outside the list" |
| A missing database never runs uncapped | "refuses a call when the database is missing, instead of running uncapped" |
| A missing install id is refused | "asks for an install id" |
| The install cap stops the call before it reaches Cloudflare | "returns 429 with a wait when the install reached its limit" |
| The call is counted and the body is clamped | "counts the call, forwards the allowlisted body and returns the stream" |
| The token never reaches the response | the same test checks the forwarded header, and the route never copies the upstream body |
| The site is served while the route is unconfigured | "refuses a call when the site is not configured" and "keeps serving the app and its deep links" |
| One provider needs no key | `packages/core/src/tests/chat.test.ts`: "sends without a key and reports no key label" |
| Every other provider still needs a key | `chat.test.ts`: "still refuses a provider that needs a key" |
| A same-origin path is an allowed base URL | `packages/providers/src/tests/manifest.test.ts`: "allows a same-origin path and still blocks a protocol-relative host" |

## Browser checks (manual, 2026-10-23)

The web app ran against the local OpenAI-compatible test server (`npm run fake-provider`). It was the
production build, served as a static site, in headless Chromium 156.

| Rule | Result |
|---|---|
| KS-02 | Pass. `localStorage` held one encrypted vault blob for the account. The secret, the key label and the last four characters were absent from every stored value. |
| PR-02 and PR-03 | Pass. The answer showed the model `gpt-test`, the key label `localkeylabel`, the price state `price unknown` and the token counts `42 in / 11 out`. |
| PV-08 | Pass. Stop kept the partial text and marked the answer `aborted`. |
| KS-06 | Pass. A 401 showed the auth error with the `Open keys` action. |
| UX-01 | Pass. The arena sent one prompt to `model-alpha` and `model-beta`. Each result showed its time, its price state and its token counts. |
| PV-01 | Pass. With every external request blocked, a reload and a sign-in started from the saved catalog: `cache · 51 models`. |

### How to re-run the browser checks

1. Start the test provider in one terminal: `npm run fake-provider`.
2. Build the app: `npm run build`.
3. Serve the build in a second terminal: `npm run preview --workspace @keyrig/web`.
4. Open `http://127.0.0.1:5199/app` in a Chromium browser.
5. Create an account on this device.
6. Add a key with the provider **OpenAI-compatible** and any secret.
7. In the route panel, choose **OpenAI-compatible**, set the base URL to `http://127.0.0.1:8788/v1`
   and set the model to any name, for example `gpt-test`.
8. Run each check in the table. Use a second key with the secret `bad-key-1` for KS-06. Use a prompt
   with the word `slow` for PV-08.
9. For PV-01, block the network in the browser developer tools, reload, and sign in again. The route
   panel must show a `cache` source and a model count.

## Full UI sweep (2026-10-23)

Three Playwright suites ran in headless Chromium 156. They covered the public pages, the account and the
vault, the route, the chat, the arena, the roles and a narrow viewport. The development server and the
production build both ran against the local test provider.

| Suite | Development server | Production build, local server | Preview origin |
|---|---|---|---|
| Public pages, routing, theme, motion (13 checks) | Pass | Pass | Pass |
| Workspace features (27 checks) | Pass | Pass | Not run: a public page cannot read the loopback test provider (private network access). |
| Details and narrow viewport (6 checks) | Pass | Pass | Pass |

What the workspace suite proved:

- The account form rejects a short password and a password that does not match.
- The first account becomes the owner and sees the roles panel.
- A key card shows the label, the last four characters and the last-used time. The stored data holds no
  secret and no label.
- A provider that lists its models fills the picker. A cloud metadata base URL is blocked. A local base
  URL gives a warning and still sends.
- Enter sends a prompt. The answer shows the model, the key label, the price state and the token counts.
- Stop keeps the partial text and marks the answer `aborted`.
- A rejected key shows the auth error with `Open keys` and `Dismiss`.
- The arena sends one prompt to two models and moves the chosen answer to the chat.
- Replace changes the last four characters. Delete removes the key after the confirmation.
- Sign-out locks the workspace. A wrong password fails. The right password opens the saved keys.
- A second account starts as a viewer without key or route access. The owner grants the member role.
  The member then has the route access and the roles panel stays hidden.
- A reload signs out and keeps the account and the vault.
- No page overflows sideways at 390 px.

Two defects failed the first run and are now fixed:

- The key card said `Not used yet` after a prompt, because the app did not read the vault again. The app
  now reads the key list after each answer (KS-05).
- `Open keys` did not move the rail. The rail is a scroll container, and the action scrolled only the
  rail element itself. The action now scrolls the rail to its first panel.

### Visual sweep (2026-10-23)

Screenshots of every page at 1440 px and 390 px showed seven defects. Each one is fixed.

| Defect | Fix |
|---|---|
| The provider lines ended in empty space. The node boxes used the full height of the visual, but the SVG used only the top 68 %. | The diagram and the SVG now share one box with the 480 by 300 view box. The hub and the nodes use that box, so each node sits on the end of its line. |
| The third provider node sat behind the example answer card. | The card is in the flow below the diagram with a 16 px gap. |
| The float animation replaced the CSS centering. Each node ran 30 px below its line. | The node uses the `translate` property. The animation uses `transform`. |
| A model name was cut as `claude-sonnet-4...`. | The node starts at 62.5 % of the diagram and uses 37 % of its width. On a phone the node shows the provider name only. |
| The feature grid left one cell empty at 1440 px. At 768 px the wide cards left three cells empty. | Cost in view is a wide card, so the three rows fill. Below 960 px every card uses one column of the two. |
| The not-found page had no header and no footer. | The page uses the site header and the site footer. |
| The chat scrolled its empty state on a phone, so the first card was cut. | The chat scrolls only when it holds a message. |

The checks ran in headless Chromium at 1440 px and 390 px, on the development server and on the preview:

- Each node center is within 7 px of its line end. The difference is the float animation.
- Each node bottom is above the answer card. Each node right edge is inside the diagram.
- No model name shows an ellipsis at 768, 900, 1024, 1100, 1280 and 1440 px.
- The feature grid fills 98.8 % of its box, which accounts for the row gaps.
- The not-found page has the header, the footer and the theme button, and the page height equals the viewport.
- On a phone the chat holds `scrollTop` 0 and the first card is in view.
- A prompt still reaches an answer, and the chat scrolls to the newest answer.

### Phone layout (2026-10-23)

The workspace page keeps the stacked rail on a phone. The rail and the workspace now share the height of
the screen, and the rail scrolls inside its own row. The composer stays in view without a page scroll.

| Check | Result |
|---|---|
| The composer is in view at 360×640, 390×844, 414×896, 768×1024 and 1280×900 | Pass. The Send button was inside the viewport before and after an answer. The page did not scroll. |
| A phone on its side, 844×390 | Pass. The rail becomes the left column of 300 px. The page did not scroll. |
| The rail scrolls inside its row | Pass at 390×844. The key vault stays at the top, and a scroll reaches the privacy panel. |
| The arena scrolls inside the workspace | Pass at 390×844. Two answers fit, and the Run button is in view. |
| The app page footer | The page hides it at 720 px or less and at a height of 520 px or less. The public pages keep their footer. |
| Public pages on a phone | Pass. No page overflows sideways, and each heading is correct at 390 px and 1280 px. |

### How it works figure (2026-10-23)

The "How it works" section left the right half of the page empty at desktop width. The heading now spans
the section, and the section body is a grid: the four steps on the left and a figure on the right. Below
1080 px the grid has one column and the figure follows the steps.

The figure shows one example of the active step: the account and the locked vault, the saved key, the
provider and model choice, and the answer with its model, key label, token counts and cost. The step
nearest the middle of the screen sets it, a pointer over a step takes over, and four dots show the
position in the list. The card keeps one height for every step, so it does not jump when the step
changes.

| Check | Result |
|---|---|
| The figure fills the right column | Pass. At 1440 px the grid is 607 px and 497 px with a 48 px gap, and both columns fill the 1152 px content width. |
| One height for every step | Pass. The card measured 289 px for all four steps at 1440 px and 295 px at 390 px. |
| A long step does not overflow the card | Pass. No step content overflowed the card at 1440, 1024, 768 or 390 px. |
| The figure follows the list | Pass. Scrolling the list from top to bottom moved the card through all four steps, and the heading named the step nearest the middle of the screen. |
| A pointer selects a step | Pass. Pointing at each of the four steps in turn showed that step's content and highlighted its number. |
| Narrow screens | Pass. At 1024, 768 and 390 px the grid has one column and the card sits below the steps. No page overflows sideways. |
| Errors | Pass. No console error or page error at any width, on the development server and on the production build. |

#### Light theme pass (2026-10-23)

The figure was measured against the other panels on the page in the light theme. Four things differed or fell
short, and each is fixed.

| Defect | Fix |
|---|---|
| The card had a drop shadow. Every other panel in the page flow (`.bento-card`, `.stat`, `.band`, `.cta`) has none in the light theme, so the figure looked like a floating overlay. | The shadow is gone. The card keeps the border and the 18 px radius that the feature cards use. |
| The four position dots used `--line-strong`. In the light theme that is 2.1:1 against white, so the dots were nearly invisible. | The dots use `--muted` (5.8:1) and the active dot uses `--amber-strong` (3.5:1). |
| The answer chips were transparent on the tinted answer panel, so their border was 1.16:1 against the panel and the pills lost their shape. | The plain chips keep the card surface, and the model chip keeps its cyan tint. |
| The step icon box used a solid `--cyan` border while the amber icon box used `--amber-line`, so the two steps looked like different components. | Both boxes use the tinted line colour of their family. |

| Check | Result |
|---|---|
| Text contrast in the light theme | Pass. All 34 text styles across the four steps measure 5.01:1 or better against the background behind them. The lowest is the cyan model chip at 5.01:1. |
| Card border and fill | Pass. White fill, `#dbe1ea` border and no shadow, the same as the feature cards. |
| Dots | Pass. Inactive `#5d6673` at 5.8:1, active `#b87c12` at 3.5:1. |
| Dark theme | Pass. Same card, dots at 5.8:1 and 7.1:1, and the chips keep their dark surface. No regression. |
| Live preview | Pass. The deployed build serves the new stylesheet, and both themes render the card with no console error. |

## Light theme contrast audit (2026-10-23)

Every visible text style and every interactive element on `/`, `/providers`, `/security` and the signed-in
`/app` (chat and arena) was measured in the light theme against the effective background behind it. The
audit ran in headless Chromium on the development server, the production build and the live preview.

Nine things fell below 3:1, or read below 4.5:1 for text. Each one is fixed with three new tokens,
`--control-line` and `--control-line-strong` (the boundary that tells a control apart and its hover) and
`--state-line-amber` / `--state-line-cyan` (the border that marks a selected state). The dark theme keeps
today's values, so its look does not change.

| Defect | Fix |
|---|---|
| Text fields, selects and the chat composer had a 1.31:1 border. The model list had the same border. | They use `--control-line` (`#7f8895`), 3.58:1 on white and 3.40:1 on the field surface. Hover uses `--control-line-strong` (`#656e7b`, 4.59:1 or better). |
| Ghost buttons measured 1.25:1 and the icon button (theme switch) 1.19:1. | Both use `--control-line`, 3.26:1 to 3.58:1 depending on the surface behind them. |
| The workspace tabs and the account tabs had a 1.0:1 to 1.19:1 group border, and the selected pill used `--amber-line` at 1.4:1. | The group uses `--control-line` and the selected pill `--state-line-amber` (`#b87c12`), 3.36:1 on the pill surface. |
| The pill that marks the current page in the header measured 1.62:1. | It uses `--control-line-strong`, 4.30:1. |
| A selected model row in the arena used `--cyan-line` at 1.5:1. | It uses `--state-line-cyan` (`#0a9396`), 3.73:1. |
| The lock state chip and the vault state pill measured 1.38:1 and 1.40:1. | The base takes `--control-line`; the unlocked and locked states take `--state-line-cyan` and `--state-line-amber`, 3.22:1 to 3.73:1. |
| The locked state dot used `--amber` at 2.4:1. | It uses `--amber-strong`, 3.27:1 on the amber tint. |
| The danger button (`--amber-line`, 1.4:1) and the stop button (`--amber`, 2.4:1) are outlined, so their border is the button. | They use `--state-line-amber` and `--amber-strong`. |
| The 10px username in the status chip measured 4.43:1 on the cyan tint. | `--cyan-text` moved from `#08787a` to `#05706f`, 4.96:1 on the tint. |

Left as it is, with the reason:

- Text links, the brand and the nav links carry their own label, so no border is needed to identify them.
- Filled primary buttons have a 11.6:1 label on the amber fill; the fill itself is not the identification.
- Tabs sit inside a group that now has a 3.26:1 border, and the selected tab has a 3.36:1 pill.
- Model rows that are not checked are identified by their radio button; the checked row now has a 3.73:1 border.
- Card, chip, callout and illustration borders frame content that is named by its text.
- Native radio and checkbox controls keep the browser border, which is 4.5:1 on paper.

| Check | Result |
|---|---|
| Text contrast on all four pages | Pass. No text style below 4.5:1 (3:1 for large text) in the light theme. The gradient headline is measured separately: its stops are `#08787a` and `#0a9396`, 4.79:1 and 3.39:1, and it is 36px. |
| Control boundaries | Pass. Field 3.58, select 3.58, composer 3.58, model list 3.58, ghost button 3.26 to 3.40, icon button 3.26, tab group 3.26, selected tab 3.36, current page pill 4.30, checked model row 3.73, status chip 3.22 to 3.39, state pill 3.73, danger and stop buttons 3.54 each. |
| Keyboard focus | Pass. `:focus-visible` draws a 2px `#0a9396` outline at 2px offset, 3.73:1 on paper; fields also turn their border cyan and keep the ring. |
| Dark theme | Pass. `--control-line` resolves to `--line` and the state lines to `--amber-line` and `--cyan-line`, so every boundary keeps its dark value. The only dark change is the locked status dot, now `--amber-strong` at 7.1:1. |
| Live preview | Pass. The deployed build serves the new stylesheet and the audit repeats with no console error. |

## Model picker checks (2026-10-23)

The production build ran in headless Chromium 156 against the local test provider and the development
server. The route panel used the provider **OpenAI-compatible** with the base URL
`http://127.0.0.1:8788/v1`.

| Check | Result |
|---|---|
| PV-11 a provider that lists its models fills the picker | Pass. The model field became a list with `fake-model` and `fake-model-small`, and the hint read `2 models from the provider`. No request started until the base URL was complete. |
| PV-11 the picked model sends the prompt | Pass. The answer used `fake-model-small` and showed the key label, the price state and the token counts. |
| PV-11 reload | Pass. `Reload the models` started one new request and kept the list. |
| PV-11 a custom name | Pass. `Custom model name` opened a text field. `Use the list` opened the list again. |
| PV-11 a provider with no list | Pass. **OpenAI** kept the text field, showed no reload button, kept `gpt-5.4`, and started no request. |
| PV-11 one request for an edited base URL | Pass. One request started after the typing stopped, not one for each keystroke. |
| Unit tests | Pass. `npm test` runs `modelOptions` in `apps/web/src/modelOptions.test.ts`. |
| PV-11 the live preview | Pass for the error state. On the published preview, the browser blocks a request to a local address from a public origin (private network access). The picker kept the text field, showed `keyrig cannot reach the provider` and kept `Reload the models`. The browser test in the table above ran on the development origin, where the browser allows the local request. |

## Route and motion checks (2026-10-23)

| Check | Result |
|---|---|
| SPA deep links | Pass on a local static server that applies the `_redirects` rule. `/providers`, `/security`, `/app` and an unknown path returned `index.html` with status 200 and rendered the correct page. Without the rule, `/providers` and `/app` returned 404. |
| In-app navigation | Pass after the fix. The production build changed the path and rendered the new page for every header and footer link, and for the browser Back button. Before the fix, the page faded out and the new page did not mount. |
| Reduced motion | Pass in emulation. With `prefers-reduced-motion: reduce`, the CSS animations ended at `0.01ms`, the page reveal kept the opacity change and dropped the movement, and no error appeared. Without the setting, the reveal moved the page. |
| Live host | Pass on 2026-10-23. The Sites preview served `/`, `/providers`, `/security`, `/app` and an unknown path with the correct page and no console error. The same origin passed the reduced-motion and roles checks below. |

### Live preview checks (2026-10-23)

The preview ran on a public HTTPS origin with the production build and the Worker fallback rule.

- Deep links: pass for `/`, `/providers`, `/security`, `/app` and an unknown path.
- Reduced motion: pass in emulation. The page reveal had no movement with the setting, and the CSS
  animation went from `7s` to `0.01ms`.
- Roles: pass. The first account became the owner and saw the Roles panel. A second account became a
  viewer with the composer blocked and the key and route fields disabled. The owner granted the member
  role. The second account then had the member access and the panel stayed hidden.
