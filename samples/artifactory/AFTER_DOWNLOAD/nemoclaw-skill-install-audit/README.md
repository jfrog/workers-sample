# NemoClaw Skill Install — AFTER_DOWNLOAD audit log

## Overview

[NVIDIA NemoClaw](https://docs.nvidia.com/nemoclaw/user-guide/openclaw/home) is NVIDIA's
open-source reference stack for running AI agents more safely — sandboxed execution, managed
inference, and policy/lifecycle operations. Its default agent runtime, **OpenClaw**, loads
capabilities called **Skills** from `~/.agents/skills/<name>/` inside the sandbox, following the
open [agentskills.io](https://agentskills.io/specification) specification: a directory whose only
required file is `SKILL.md` with YAML frontmatter (`name`, `description`).

JFrog's **Agent Skills Registry** (part of the AI Catalog) publishes and serves skills in exactly
that same format — a `jf skills publish` bundle is a `SKILL.md`-rooted directory, scanned by Xray
and optionally signed with cryptographic evidence on the way in. JFrog and NVIDIA have announced
Artifactory as a registry for NemoClaw's agent skills and models as part of the AI-Q Blueprint /
NemoClaw trust-layer partnership, but neither vendor's public documentation describes the exact
client-side call NemoClaw's runtime makes to consume it.

This sample bridges the two using a path that **is** documented on both sides, even though the
combination isn't spelled out anywhere as "the" integration:

- `jf skills install <slug> --repo <repo> --path <dir>` is a supported, harness-independent install
  target (`--path` is the documented fallback for any client that isn't `claude-code`/`cursor`/etc.)
  — it installs the bundle to `<dir>/<slug>`.
- Pointed at `--path ~/.agents/skills`, the installed bundle lands exactly where OpenClaw scans for
  skills, and — because both sides already speak `SKILL.md` — needs no format conversion.

So: an operator (or, for the full walkthrough below, the NemoClaw sandbox itself via
`nemoclaw <name> exec`) runs `jf skills install` against an Artifactory skills repo, targeting the
sandbox's own skills directory. That download is a real Artifactory download like any other —
`AFTER_DOWNLOAD` fires on it — and this worker turns it into a provenance/audit record.

**Why this is worth auditing, specifically:** the JFrog AI Catalog's evidence check is opt-in and
**bypassable** — if a skill has no signed evidence, `jf skills install` fails closed by default, but
an operator can force it through with `JFROG_SKILLS_DISABLE_QUIET_FAILURE=true`. Once that happens,
nothing records that a NemoClaw sandbox loaded code without the trust check — the CLI's warning is
the only trace, and it isn't persisted anywhere. This worker closes that gap: every skill install
served to a NemoClaw identity gets a durable record of what was installed and what its scan/signing
state was at download time.

**`AFTER_DOWNLOAD` cannot block anything** — the artifact is already served by the time the event
fires, and Xray's own download gating (`SCAN_IN_PROGRESS` / policy-blocked → HTTP 403) has already
run by then too. This sample is intentionally audit-only. Blocking unsigned/unscanned skills is a
repository-level Xray/curation policy concern, out of scope here.

## What the worker does

On every download from the configured skills repo(s):

1. Parses the skill **slug** and **version** out of `metadata.repoPath.path` (skills archives are
   stored as `<slug>/<version>/<slug>-<version>.zip`).
2. Reads `userContext.id` — the Artifactory identity (username or access-token subject) that
   authenticated the request — and records it as the download's attributed identity.
3. Calls back into Artifactory (`GET /artifactory/api/skills/<repo>/xrayStatus?path=...`, via
   `context.clients.platformHttp`) to attach the skill's current scan/evidence status to the
   record, so the audit trail captures *whether this install was clean and signed*, not just that
   it happened.
4. POSTs a structured record to an external audit sink:

```json
{
  "source": "nemoclaw-skill-install",
  "slug": "cuopt-routing-skill",
  "version": "1.2.0",
  "repoKey": "nemoclaw-skills-local",
  "repoType": "REPO_TYPE_LOCAL",
  "registryIdentity": "nemoclaw-sandbox-my-assistant",
  "isToken": true,
  "xrayStatus": "<status field from the xrayStatus response>",
  "downloadedAt": "2026-09-25T12:00:00.000Z"
}
```

5. Never throws — failures are logged and reflected only in the returned `message`.

> **Confirm before relying on step 3 for anything beyond a demo:** the `xrayStatus` endpoint's
> documented response distinguishes `SCAN_IN_PROGRESS` and policy-blocked states; whether it also
> surfaces evidence/signing state specifically (vs. that living under a separate `jf evd`/evidence
> API) needs to be checked against a real response before the worker leans on it for the
> "was this signed" claim. Treat that field as best-effort enrichment, not a verified security
> control, until confirmed.

## Files

| File | Purpose |
|---|---|
| `worker.ts` | Worker logic |
| `types.ts` | `AFTER_DOWNLOAD` payload types |
| `worker.spec.ts` | Unit tests (success, sink non-200, thrown error) |
| `manifest.json` | Worker registration — action, filter criteria, secrets, properties |
| `package.json`, `tsconfig.json` | Build/test config |

## Prerequisites

- A JFrog Platform instance with Workers enabled and an **Agent Skills / AI Catalog skills repo**
  (`packageType=skills`, local) — provisioned via the JFrog AI Catalog / Agent Guard flow, or an
  existing one your org already uses. Update `filterCriteria.artifactFilterCriteria.repoKeys` in
  `manifest.json` to match your actual repo key.
- `jf` CLI configured against that instance (`jf c add` / `jf login`), with a skill already
  published to the repo above (`jf skills publish <bundle-dir> --repo <repo>`) so there's something
  to install.
- An HTTP endpoint to act as the audit sink for testing (e.g. [webhook.site](https://webhook.site),
  a Coralogix/Splunk HTTP intake, or a throwaway local listener).
- For the full walkthrough (§ "Testing E2E with a real NemoClaw sandbox" below): a local NemoClaw
  install — no GPU/DGX required, just 4 vCPU / 8 GB RAM / 20 GB disk on Linux, macOS, or Windows
  WSL2 (`curl -fsSL https://www.nvidia.com/nemoclaw.sh | bash`, then `nemoclaw onboard`).
  **On macOS specifically, the container runtime must be Docker Desktop or Colima** — confirmed by
  running the installer: NemoClaw's own host-qualification check
  (`src/lib/readiness/platform-qualification.ts`) only recognizes `runtime === "docker-desktop"` or
  `"colima"` on macOS, with no generic-Docker fallback (unlike its WSL path, which does accept a
  plain `docker` runtime). A Rancher Desktop-backed Docker daemon is fully functional but fails
  onboarding's preflight with `host.platform.unsupported` regardless.

## Configuration

The worker reads its audit sink URL from a **Worker property** (`context.properties`), and the
bearer token for the sink from a **Worker secret** (`context.secrets`):

```json
"properties": {
    "auditSinkUrl": "https://<external_audit_sink>"
}
```

Register the secret before deploying:

```bash
jf worker add-secret auditSinkBearerToken
```

## Running the unit tests

```bash
npm install
npm test
```

## Testing E2E

Three levels, fastest to full real-world flow.

### 1. Sandbox test-run (no live repo, no NemoClaw)

```bash
jf worker test-run @sample-payload.json
```

Point `auditSinkUrl` at something like webhook.site first so you can confirm the POST lands with
the expected fields. This is the fastest way to validate the worker before deploying it.

### 2. Real deploy + real download (Artifactory + `jf skills`, no NemoClaw)

1. Set `"enabled": true` in `manifest.json` and `jf worker deploy`.
2. Trigger a real download by installing the published test skill to an arbitrary directory:
   ```bash
   jf skills install "<slug>" --server-id "<SID>" --repo "<repo>" --path /tmp/skills-test --quiet
   ```
3. Confirm the audit sink received the POST, and cross-check the worker's execution log
   (`jf worker` UI → the worker → **Logs**) for `NemoClaw skill install successfully audited`.

### 3. Full walkthrough with a real NemoClaw sandbox

This exercises the actual scenario the worker is built for: a NemoClaw sandbox pulling a skill from
Artifactory into its own skills directory.

1. **Install and onboard NemoClaw** (see *Prerequisites*): `nemoclaw onboard --name my-assistant`,
   picking any inference provider — it doesn't affect this flow.
2. **Provision a dedicated Artifactory identity for this sandbox** (an access token used only by
   it), so downloads it makes are distinguishable from anyone else's `jf skills install` in the
   audit trail. Note the exact identity string `jf` reports for that token — confirm empirically
   (do one real install with this token and read the actual `registryIdentity` value back from the
   audit sink) rather than assuming a format.
3. **Install the `jf` CLI inside the sandbox.** It isn't preinstalled — NemoClaw's documented
   sandbox toolchain is Node.js, npm, Python, and a container runtime, nothing JFrog-specific. Its
   install script pulls from a *different* host than Artifactory itself
   (`install-cli.jfrog.io`), so it needs its own network-policy preset first (same deny-by-default
   reasoning as the Artifactory host below):
   ```bash
   nemoclaw my-assistant policy add --from-file ./jfrog-cli-install-preset.yaml \
     --trusted-private-host install-cli.jfrog.io --yes
   nemoclaw my-assistant exec -- sh -c "curl -fL https://install-cli.jfrog.io | sh"
   ```
4. **Make the Artifactory identity reachable from inside the sandbox.** Reaching your Artifactory
   host requires its own custom policy preset (the built-in `npm_registry` preset only covers the
   public npm registry) — see the network-policy documentation for the preset file format.
   Configure `jf` with the token from step 2:
   ```bash
   nemoclaw my-assistant policy add --from-file ./artifactory-preset.yaml \
     --trusted-private-host <your-artifactory-host> --yes
   nemoclaw my-assistant exec -- jf c add nemoclaw-target --url https://<your-artifactory-host> \
     --access-token "<token-from-step-2>" --interactive=false
   ```
5. **Trigger the install from inside the sandbox**, targeting OpenClaw's own skills directory:
   ```bash
   nemoclaw my-assistant exec -- jf skills install "<slug>" \
     --server-id nemoclaw-target --repo "<repo>" --path ~/.agents/skills --quiet
   ```
6. **Verify.** The audit sink should receive a POST whose `registryIdentity` matches the token from
   step 2, `slug`/`version` match what was installed, and (per *Confirm before relying on step 3*
   above) whatever `xrayStatus` reported. Restart the sandbox's agent (`nemoclaw launch my-assistant`)
   to confirm OpenClaw picked up the new skill under `~/.agents/skills/<slug>/`.

## Response messages

- Success: `NemoClaw skill install successfully audited`
- `auditSinkUrl` property not set: `Worker property 'auditSinkUrl' is not set; skipping audit`
- Sink returned non-200: `Failed to audit NemoClaw skill install`
- Network/other error: `Failed to audit NemoClaw skill install`

## Limitations

- No blocking/remediation — `AFTER_DOWNLOAD` fires after the file is already served; Xray's own
  download-gating has already run by this point regardless of this worker.
- **The `jf skills install --path ~/.agents/skills` bridge is not an officially documented NemoClaw
  integration.** It's a combination of two independently-documented facts (the `agentskills.io`
  format match and the `--path` install target) rather than a supported, named feature of either
  product. Treat it as a working demonstration, not a vendor-endorsed pattern, and re-confirm both
  sides' docs before relying on it beyond this sample.
- `registryIdentity` attribution is per-credential, not automatically per-agent-session — if every
  NemoClaw sandbox shares one Artifactory token, you can tell "a NemoClaw sandbox did this" but not
  which one. For per-sandbox attribution, mint one token per `nemoclaw <name>` instance.
- The custom network-policy presets and the `jf` install/config steps inside the sandbox
  (walkthrough steps 3-4) are the least-verified parts of this sample — confirm the preset schema
  and binary path against your own NemoClaw version's `policy add --dry-run` output before
  scripting them. In particular, whether `install-cli.jfrog.io`'s install script redirects to a
  further download host (e.g. a release CDN) that also needs allowlisting isn't confirmed here —
  check the `policy add --dry-run` output for any additional blocked hosts before assuming one
  preset covers the whole install.
- **The NemoClaw installer's default `lkg` ("last known good") ref can lag fixes on its `main`
  branch.** Confirmed directly: the `lkg` tag active at the time of writing rejects any Docker
  context not literally named `default` (`validate_installer_docker_target_before_host_changes` in
  `scripts/install.sh`), even a fully working one — a check already relaxed on `main` (and in
  tagged release `v0.0.129`) to inspect the active context's actual socket instead of its name. If
  `curl -fsSL https://www.nvidia.com/nemoclaw.sh | bash` fails with *"The Docker context does not
  select the local default target"* on a non-`default`-named but working context, either switch the
  active context to a genuinely working `default` (Docker Desktop), or pin the installer to a newer
  release with `NEMOCLAW_INSTALL_TAG=v0.0.129` (or later).

## Cleanup

```bash
jf worker rm "nemoclaw-skill-install-audit"
```
