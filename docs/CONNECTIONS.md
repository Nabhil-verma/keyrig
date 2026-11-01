# Connections

keyrig makes an account with a username and a password on this device. The Google address and the
GitHub account are two extra links:

- Google supplies a **recovery email** (Gmail only). It never signs in to keyrig.
- GitHub supplies an account for a **commit**. It never signs in to keyrig.

The password stays the only sign-in. The two links use a public client id and no client secret, so
no keyrig server sits between the browser and Google or GitHub (D-04).

## Set the client ids

Put the two ids in the environment of the web app:

```text
VITE_GOOGLE_CLIENT_ID=1234.apps.googleusercontent.com
VITE_GITHUB_CLIENT_ID=Ov23li...
```

You can also paste each id in **Profile → Connections**. A pasted id wins over the environment.

## Google: a recovery email

1. Open the Google Cloud console. Make a project.
2. Open **APIs and Services → OAuth consent screen**. Add the address that will read the profile.
3. Open **Credentials → Create credentials → OAuth client ID → Web application**.
4. Add the address of the app to **Authorized JavaScript origins**, for example
   `http://127.0.0.1:5199` and your site address.
5. Copy the client id. Put it in `VITE_GOOGLE_CLIENT_ID` or in the profile.

keyrig shows the Google prompt. Google sends an ID token. keyrig checks the issuer, the audience,
the expiry and the verified Gmail address. It stores the address only.

A browser cannot check the token signature without the Google certificates. For that reason the
token is **not** a sign-in factor. It only names the address. The password still opens the vault.

## GitHub: a commit account

1. Open **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Set the home page and the callback URL to the address of the app.
3. **Turn on "Enable Device Flow"** for the app. keyrig uses the device flow, so it needs no secret.
4. Copy the client id. Put it in `VITE_GITHUB_CLIENT_ID` or in the profile.

Then press **Connect GitHub**. keyrig shows a short code. Open `https://github.com/login/device`,
type the code, and approve the request. keyrig receives a token and keeps it in the encrypted vault
under the name `github`.

The token asks for the `repo` scope. It can read and write to **every** repository of the account.
That is the risk of a GitHub connection. To reduce it, make a separate account for the agent.

## The commit switch

A commit needs all three:

1. **Allow the AI to commit** in the profile. The switch turns on only after you mark the risk box.
2. A connected account, a repository (`owner/repo`) and a branch.
3. **Approve once** on the approval card for that commit.

The model can still ask for a commit when the switch is off. keyrig then stops the call and reports
the reason. The commit never runs.

## Disconnect

**Disconnect GitHub** removes the token from the vault and drops the switch.
The token still exists on the GitHub side. To remove it there, open **Settings → Applications →
Authorized OAuth Apps** and revoke the app.

## What a browser needs from each service

keyrig calls `github.com/login/device/code` and `github.com/login/oauth/access_token` from the
browser. GitHub allows this with a client id. If a network or an extension blocks the request, keyrig
shows a network error and the profile stays unchanged.
