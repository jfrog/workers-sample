# NanoClaw Agent Vault — AFTER_DOWNLOAD audit log

## Overview

[NanoClaw](https://nanoclaw.dev) ([docs](https://docs.nanoclaw.dev)) is an open-source agent
framework whose agents can *self-modify* at runtime: an agent can call the `install_packages` or
`add_mcp_server` MCP tools to request new npm/apt packages or MCP servers. Every such request is
approval-gated (an admin approves/rejects a DM card), and once approved the agent group's container
image rebuilds and the real `npm install`/`apt-get install` runs.

Those container-level installs never carry a raw credential. NanoClaw's **OneCLI Agent Vault** sits
in front of them as an HTTPS proxy "gateway": the container only ever holds a placeholder value
(`onecli-managed`), and the vault rewrites the outbound request's `Authorization` header with the
real secret, matched by host pattern (`onecli secrets create --host-pattern <host> ...`, granted to
an agent group with `onecli agents set-secrets`). Point that host pattern at your Artifactory
instance and register an Artifactory identity token as the secret, and every package/MCP-server
install an admin approves for that agent group resolves through Artifactory instead of the public
registry.

In practice that's usually a repo your organization already had (`npm-remote`, `apt-remote`, ...),
not one created specifically for NanoClaw — so the same repo may also serve normal developer/CI
traffic. This worker's optional identity allowlist (see Configuration) exists for exactly that case:
it lets you audit *NanoClaw's* activity specifically, rather than everything the repo serves.

That gives you two halves of an audit trail:

- **NanoClaw side**: the approval card records *who requested what, and who approved it*.
- **Artifactory side (this worker)**: `AFTER_DOWNLOAD` fires the moment the vault-authenticated
  request is actually served, and records *what was actually resolved* — exact repo path, repo
  type (local/remote/federated), and the registry identity the vault injected.

NanoClaw's own trail doesn't carry the second half (exact version, resolved path, transitive
dependencies) — this worker fills that gap by posting a structured audit record to an external
sink whenever a NanoClaw-originated download is served.

**`AFTER_DOWNLOAD` cannot block anything** — the artifact is already served by the time the event
fires. This sample is intentionally audit-only; it does not attempt to gate or quarantine anything.
Blocking belongs to `BEFORE_DOWNLOAD` + JFrog Curation, which is out of scope here.

## What the worker does

On every matching download, it builds:

```json
{
  "source": "nanoclaw-agent-vault",
  "registryIdentity": "<userContext.id — the vault-injected Artifactory identity>",
  "isToken": true,
  "repoKey": "npm-remote",
  "artifactPath": "left-pad/-/left-pad-1.3.0.tgz",
  "repoType": "REPO_TYPE_REMOTE",
  "downloadedAt": "2026-09-24T12:00:00.000Z"
}
```

and POSTs it to an external audit sink — its URL read from a Worker property, its bearer token from
a Worker secret. It never throws; failures are logged and reflected only in the returned `message`.

> **Note on identity granularity:** `userContext.id` reflects whatever credential the OneCLI vault
> injected — which is scoped per **NanoClaw agent group**, not per individual agent
> session/container (NanoClaw does not expose a per-session identity to the registry it resolves
> through). If you need finer-grained attribution, mint one Artifactory token per agent group and
> register each as its own OneCLI secret, so `registryIdentity` at least maps 1:1 to a group.

## Files

| File | Purpose |
|---|---|
| `worker.ts` | Worker logic |
| `types.ts` | Localized `AFTER_DOWNLOAD` payload types (per repo convention) |
| `worker.spec.ts` | Unit tests (success, non-200 sink response, thrown error) |
| `manifest.json` | Worker registration — action, filter criteria, secrets, properties |
| `package.json`, `tsconfig.json` | Build/test config, same as other samples in this repo |

## Prerequisites

- A JFrog Platform instance with Workers enabled, and `jf` configured against it
  (`jf c add` / `jf login`).
- An Artifactory **remote** (or virtual) repo fronting npm and/or apt — e.g. `npm-remote`
  proxying `registry.npmjs.org`. This can be (and in production usually is) a repo your org already
  uses for other traffic, not one dedicated to NanoClaw. Update
  `filterCriteria.artifactFilterCriteria.repoKeys` in `manifest.json` to match your actual repo
  key(s).
- An HTTP endpoint to act as the audit sink (any endpoint that accepts a bearer-authenticated POST
  works for testing — e.g. [webhook.site](https://webhook.site), a Coralogix/Splunk HTTP intake, or
  a throwaway `nc`/local listener).
- For the full NanoClaw walkthrough (§ "Testing E2E with a real NanoClaw agent" below): a local
  NanoClaw install (see [nanoclaw.dev quickstart](https://docs.nanoclaw.dev/quickstart)) with its
  OneCLI Agent Vault set up.

## Configuration

The worker reads its audit sink URL from a **Worker property** (`context.properties`,
`jfrog-workers` ≥ 0.19.0) rather than a hardcoded constant, and the bearer token from a **Worker
secret** (`context.secrets`) — same mechanism, different sensitivity:

```typescript
const AUDIT_SINK_URL_PROPERTY = 'auditSinkUrl';
const NANOCLAW_IDENTITIES_PROPERTY = 'nanoclawIdentities'; // optional allowlist, see below
const SECRET_NAME = 'auditSinkBearerToken';
```

Set the properties in `manifest.json` (plaintext — properties aren't encrypted, unlike secrets):

```json
"properties": {
    "auditSinkUrl": "https://<external_audit_sink>",
    "nanoclawIdentities": ""
}
```

`nanoclawIdentities` is an **optional**, comma-separated allowlist of the Artifactory token
identities registered in the OneCLI Agent Vault for your NanoClaw agent groups — i.e. the exact
value `userContext.id` will carry when the vault injects that token. Left empty (the default),
every download from a filtered repo is audited, same as if the property didn't exist. Set it only
if the repo above is shared with non-NanoClaw traffic and you want the audit trail to reflect
NanoClaw's activity specifically — anything from an identity not in the list is skipped (not
audited, not just tagged), so start with it empty until you've confirmed the exact identity
string(s) your vault-registered tokens report.

Register the secret before deploying (there is currently no `jf worker add-property` equivalent
for properties, so the property above is edited directly in `manifest.json`):

```bash
jf worker add-secret auditSinkBearerToken
```

Both are pushed to the platform on `jf worker deploy` (pass `--no-secrets` to omit the secret, e.g.
when testing a manifest change that shouldn't touch the registered token).

## Running the unit tests

```bash
npm install
npm test
```

Covers: successful audit POST, a non-200 response from the sink, a thrown/network error, and the
`nanoclawIdentities` allowlist both matching and not matching the download's identity — in every
case the worker must resolve (never reject) and return the corresponding `message`.

## Testing E2E

There are three levels, from fastest/no-external-dependencies to the full real-world flow.

### 1. Sandbox test-run (no live repo, no NanoClaw)

Exercise the actual deployed logic against a realistic payload, without touching a real
repository or deploying anything:

```bash
jf worker test-run @sample-payload.json
```

with a `sample-payload.json` shaped like `AfterDownloadRequest` in `types.ts`, e.g.:

```json
{
  "metadata": {
    "repoPath": {
      "key": "npm-remote",
      "path": "left-pad/-/left-pad-1.3.0.tgz",
      "id": "npm-remote:left-pad/-/left-pad-1.3.0.tgz",
      "isRoot": false,
      "isFolder": false
    },
    "repoType": 2
  },
  "userContext": {
    "id": "nanoclaw-agent-group-artifactory-token",
    "isToken": true,
    "realm": ""
  }
}
```

(`repoType: 2` = `REPO_TYPE_REMOTE`, per the `RepoType` enum in `types.ts`.) Point the `auditSinkUrl`
property (in `manifest.json`) at something like [webhook.site](https://webhook.site) first, so you
can confirm the POST landed with the expected fields — `jf worker test-run` sends the current local
`manifest.json`/`worker.ts` to the sandbox, so no deploy is needed to pick up a property change.
This is the fastest way to validate the worker end-to-end before deploying it. To also exercise the
`nanoclawIdentities` allowlist, set it to something that doesn't include
`nanoclaw-agent-group-artifactory-token` and confirm the response message is the skip message
instead of a POST.

### 2. Real deploy + real download (Artifactory only, no NanoClaw)

1. Set `"enabled": true` in `manifest.json`.
2. Deploy: `jf worker deploy`
3. Trigger a real download from a repo matching `filterCriteria` — e.g.
   `jf rt curl /npm-remote/left-pad/-/left-pad-1.3.0.tgz -o /dev/null`, or
   `curl -u <user>:<token> https://<your-instance>/artifactory/npm-remote/left-pad/-/left-pad-1.3.0.tgz -o /dev/null`.
4. Confirm your audit sink received the POST, and that `registryIdentity` matches the identity
   used for the download and `repoType` reflects the repo's actual type.
5. Cross-check the worker's own execution log: `jf worker` UI → the worker → **Logs**, or via the
   platform's Workers API, to confirm it ran and returned
   `NanoClaw registry download successfully audited`.

### 3. Full walkthrough with a real NanoClaw agent

This exercises the actual scenario the worker is built for: an agent self-modifies, an admin
approves it, and the resulting install resolves through Artifactory via the vault.

1. **Set up NanoClaw** per the [quickstart](https://docs.nanoclaw.dev/quickstart) and complete the
   OneCLI Agent Vault setup during the install wizard.
2. **Register your Artifactory credential in the vault**, host-matched to your Artifactory
   instance, and note the resulting identity — it's what `userContext.id` will report on every
   download made with it, and what you'd put in `nanoclawIdentities` if you set that property:
   ```bash
   onecli secrets create \
     --name Artifactory \
     --type api_key \
     --value "$ARTIFACTORY_TOKEN" \
     --host-pattern <your-artifactory-host>
   AGENT_ID=$(onecli agents list | jq -r '.data[] | select(.identifier=="<agentGroupId>") | .id')
   onecli agents set-secrets --id "$AGENT_ID" --secret-ids "<Artifactory-secret-id>"
   ```
   Don't guess this string — confirm it empirically: deploy the worker with `nanoclawIdentities`
   left empty first, trigger one real download with this token (step 5 below), and read the actual
   `registryIdentity` value from the audit sink (or the worker's execution log). Only then set
   `nanoclawIdentities` to that confirmed value and redeploy.
3. **Point the agent group's npm resolution at Artifactory.** This is the one step NanoClaw does
   not document a config key for (`packages_npm`/`packages_apt` only list *which* packages get
   baked in, not *which registry* resolves them) — you need the container's own `.npmrc` to point
   at your `npm-remote` repo. The supported way to do this today is to bake it into the
   custom container image NanoClaw builds per agent group (`buildAgentGroupImage`) — e.g. add a
   `.npmrc` with
   `registry=https://<your-instance>/artifactory/api/npm/npm-remote/` to the image, or
   mount one in via the group's container config. Confirm with `docs.nanoclaw.dev` /
   `#nanoclaw` on Discord before relying on this for anything beyond a local test — it's outside
   the documented configuration surface.
4. **Deploy this worker** (`enabled: true`, `jf worker deploy`) against the same
   `npm-remote` repo key used above.
5. **Trigger self-modification.** Chat with your NanoClaw agent and ask it to install a package it
   doesn't have, e.g.:
   ```bash
   pnpm run chat "install the left-pad npm package, I need it for a script"
   ```
6. **Approve the request.** The admin DM card appears (or check `ncl approvals list --status
   pending`); approve it.
7. **Container rebuilds and installs.** NanoClaw appends the package to the group's
   `packages_npm` config and rebuilds/restarts the container
   (`ncl groups restart --id <group-id> --rebuild` if you need to trigger it manually). The
   container's `npm install` request goes out through the vault, which rewrites the
   `Authorization` header to your real Artifactory token before it reaches Artifactory.
8. **Verify.** Your audit sink should receive a POST whose `registryIdentity` matches the
   Artifactory token identity registered in step 2, `repoKey` is `npm-remote`, and
   `artifactPath` matches the package NanoClaw installed. Cross-reference against
   `ncl approvals list` / `ncl sessions history <session-id>` to confirm it corresponds to the
   request you approved in step 6.

## Response messages

- Success: `NanoClaw registry download successfully audited`
- Identity not in `nanoclawIdentities`: `Download identity '<id>' is not a configured NanoClaw identity; skipping audit`
- `auditSinkUrl` property not set: `Worker property 'auditSinkUrl' is not set; skipping audit`
- Sink returned non-200: `Failed to audit NanoClaw download`
- Network/other error: `Failed to audit NanoClaw download`

## Limitations

- No blocking/remediation — `AFTER_DOWNLOAD` fires after the file is already served.
- No direct NanoClaw integration — NanoClaw has no documented inbound webhook/API for external
  systems to report events to it, and this worker doesn't call it. (NanoClaw's webhook server
  exists solely for Chat-SDK channel ingress and approval-card interaction callbacks — see
  `docs.nanoclaw.dev/concepts/architecture`.)
- `registryIdentity` is per agent-group, not per agent session — see the note under
  "What the worker does" above. `nanoclawIdentities` inherits the same granularity: it allowlists
  agent-group credentials, not individual agent sessions/containers.
- The `nanoclawIdentities` allowlist is opt-in and unenforced by default — if the repo really is
  dedicated to NanoClaw, leaving it empty (auditing everything from that repo) is simpler and
  equally correct; only configure it when the repo is genuinely shared.
- Step 3 of the full walkthrough (pointing the container's npm client at Artifactory) is not part
  of NanoClaw's documented configuration surface as of this writing; treat it as a local workaround
  rather than a supported feature.

## Cleanup

```bash
jf worker rm "nanoclaw-agent-vault-audit-log"
```
