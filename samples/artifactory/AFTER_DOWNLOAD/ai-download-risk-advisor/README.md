# AI Download Risk Advisor

## Overview

This worker listens to the `AFTER_DOWNLOAD` event in JFrog Artifactory. When an artifact is
downloaded, it looks up that artifact's existing JFrog Xray scan results (security issues and
policy violations) and, if any are found, asks **Claude** (Anthropic's API) to turn the raw
counts into a short, plain-English risk summary and recommendation. The summary is posted to a
Slack channel so whoever owns the download (a developer, a release manager, a security reviewer)
gets a readable heads-up instead of having to interpret raw Xray JSON.

It's the informational counterpart to the `BEFORE_DOWNLOAD/restrict-download-on-xray-critical-issues`
sample: that one *blocks* a download based on a hard-coded threshold; this one never blocks
anything, it *explains* what was just downloaded, using an LLM to make the explanation useful to a
non-security audience.

## Why AFTER_DOWNLOAD and not BEFORE_DOWNLOAD

Calling an LLM API takes anywhere from a few hundred milliseconds to a few seconds. Doing that on
the `BEFORE_DOWNLOAD` path would add real latency to every download. Running it `AFTER_DOWNLOAD`
means the download itself is never slowed down or blocked by an LLM call — the advisory shows up
in Slack a moment later.

## Functionality

1. **Trigger:** runs after a download completes in Artifactory.
2. **Xray lookup:** checks Xray is reachable, then looks up the downloaded artifact's existing
   scan result (security issues by severity + policy violations) via the Xray API. It does not
   trigger a new scan.
3. **Cost guard:** if the artifact has zero known security issues and zero violations, the worker
   stops here — no Claude call, no Slack message. There's nothing worth an AI summary for a clean
   artifact.
4. **AI summary:** if there's anything to report, the raw counts are sent to Claude with a prompt
   asking for a short risk summary and a recommendation. If the `AnthropicApiKey` secret isn't
   configured, or the Claude call fails, the worker falls back to posting the raw counts instead
   of losing the information.
5. **Slack delivery:** the resulting text (AI summary, or the raw-count fallback) is posted to a
   Slack channel via an incoming webhook, if one is configured.

## Required secrets

| Secret Name       | Description                                                         | Required |
| ----------------- | -------------------------------------------------------------------- | -------- |
| `AnthropicApiKey` | Anthropic API key used to call Claude (`https://api.anthropic.com`)  | Yes — without it the worker falls back to raw stats, no AI summary |
| `Slack_URL`        | Incoming webhook URL for the Slack channel to post advisories to     | No — without it the worker only logs the result |

Add them with the JFrog CLI:

```sh
jf worker add-secret AnthropicApiKey
jf worker add-secret Slack_URL
```

## Configuration

These are declared as Worker **properties** in `manifest.json` (`context.properties.get(...)` in
`worker.ts`), so they can be tuned per deployment without touching the code. Each also has a
code-level default, used if the property is ever removed or left unset:

| Property              | Default                                       | Purpose                                                        |
| ---------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| `minIssuesForAiSummary` | `1`                                            | Skip the AI call below this many issues+violations combined      |
| `claudeModel`           | `claude-sonnet-5`                              | Swap for `claude-haiku-4-5-20251001` to cut cost                 |
| `claudeMaxTokens`       | `300`                                           | Response is a short summary, keep this small                     |
| `claudeApiUrl`          | `https://api.anthropic.com/v1/messages`        | Anthropic Messages API endpoint; override to point at a proxy    |
| `claudeApiVersion`      | `2023-06-01`                                    | Anthropic API version header                                     |

Edit the values directly in `manifest.json`'s `"properties"` object and redeploy (`jf worker deploy`).

Property reads go through a small `getProperty` helper in `worker.ts` that catches any error from
`context.properties.get(...)` (some platform versions throw instead of returning `undefined` for a
property key that isn't set yet) and returns the default in that case too — so a missing or
not-yet-recognized property degrades to the default rather than failing the whole worker.

The worker is filtered to the repositories listed in `manifest.json` under
`filterCriteria.artifactFilterCriteria.repoKeys` — update that list (or broaden it) to match the
repositories you want covered.

## How it works

1. **Download event:** the worker receives the downloaded artifact's repo key, path, and the
   user/token that downloaded it.
2. **Xray availability check:** pings `/xray/api/v1/system/ping`. If Xray isn't available, the
   worker logs that and stops — there's no scan data to advise on.
3. **Scan lookup:** calls `/xray/api/v1/artifacts?repo=<repo>&search=<name>` and matches the
   result whose `repo_full_path` equals the downloaded artifact's full path (a name search can
   return multiple artifacts sharing that file name, e.g. every tag of a Docker image).
4. **Decide whether to call Claude:** sums `sec_issues` (critical/high/medium/low) and
   `violations`. Zero on both means no AI call.
5. **Ask Claude:** calls the Messages API (`POST https://api.anthropic.com/v1/messages`) with a
   short prompt describing the artifact and its issue counts, asking for a 2-3 sentence summary
   plus a one-line recommendation.
6. **Post to Slack:** sends the resulting text as a Slack message via the configured incoming
   webhook.
7. **Log the outcome:** the worker's return `message` always reflects what actually happened, so
   it shows up in the Workers execution log even if Slack/Claude are not configured.

## Claude walkthrough (example)

Say `libs-release-local/com/acme/payments/2.3.0/payments-2.3.0.jar` is downloaded, and Xray
already scanned it with 2 critical, 1 high security issue and 1 license violation.

The worker sends Claude a prompt along these lines:

```
An artifact was just downloaded from JFrog Artifactory. Summarize the risk for someone who is
not a security expert, in 2-3 sentences, then give one line of recommended action.

Artifact: payments-2.3.0.jar
Repository: libs-release-local
Security issues: 2 critical, 1 high, 0 medium, 0 low
Policy violations: 1
```

A typical Claude response:

```
This artifact has 2 critical and 1 high-severity security issues, plus a policy violation
(likely a license or compliance rule) flagged by Xray. Critical issues mean there are known,
serious vulnerabilities in this version that could be exploited if it reaches production.

Recommendation: Hold off on deploying this version — check the Xray report for CVE details and
upgrade to a patched version before using it further.
```

That text is what gets posted to the configured Slack channel, prefixed with the artifact and
downloader identity so the channel has full context without needing to open Artifactory.

## Running this sample end-to-end

### Prerequisites

- A JFrog Platform instance with **Artifactory** and **Xray** enabled, and at least one artifact
  in a repo that Xray has already scanned with at least one security issue or violation (needed
  to exercise the AI path — a clean artifact will just short-circuit at step 3 above).
- [JFrog CLI](https://jfrog.com/getcli/) installed and configured against that instance.
- An [Anthropic API key](https://console.anthropic.com/) with access to the Messages API.
- (Optional, to see the Slack delivery) a Slack [incoming webhook URL](https://api.slack.com/messaging/webhooks)
  for a test channel.

### Steps

1. Configure the JFrog CLI server if you haven't already:
   ```sh
   jf config add <server-id>
   ```
2. From this directory, initialize/deploy the worker (or copy this folder's files into a worker
   created via `jf worker init` if you're starting fresh):
   ```sh
   jf worker deploy
   ```
3. Add the secrets:
   ```sh
   jf worker add-secret AnthropicApiKey
   jf worker add-secret Slack_URL
   ```
4. Edit `manifest.json`'s `filterCriteria.artifactFilterCriteria.repoKeys` to point at the repo
   containing your already-Xray-scanned test artifact, and re-deploy (`jf worker deploy`) if you
   changed it after step 2.
5. Set `manifest.json`'s `"enabled"` to `true` (samples ship disabled by default) and deploy again.
6. Download the test artifact (e.g. `jf rt download <repo>/<path>` or via the UI).
7. Check the result:
   - Workers execution log (Platform UI → Administration → Workers → this worker → Logs), or
     `jf worker exec-history <worker-name>`, should show the `message` the worker returned.
   - The Slack channel behind `Slack_URL` should receive the AI-generated risk summary within a
     few seconds.
8. To see the fallback paths, temporarily remove/rename the `AnthropicApiKey` secret and download
   again — the worker should post the raw issue counts to Slack instead of an AI summary, and say
   so in its log message.

## Response messages

- `"No security issues or violations found for this artifact; skipped AI risk advisory."`
- `"AnthropicApiKey secret not configured; posted raw Xray stats instead of an AI summary."`
- `"AI risk summary generated and posted to Slack."`
- `"AI risk summary generated; Slack_URL not configured, logged only."`
- `"Failed to generate AI risk summary; posted raw Xray stats to Slack instead."`
- `"Could not check for Xray scans because Xray is not available."`
- `"Could not find an Xray scan result matching this artifact."`

## Error scenarios

- **Xray unavailable:** the worker logs this and exits without calling Claude or Slack.
- **No matching scan result:** the artifact's Xray scan hasn't completed yet, or the repo search
  didn't return a match for the exact path — the worker logs this and exits.
- **Claude API failure** (bad key, rate limit, network error): the worker logs the error and
  falls back to posting the raw Xray counts to Slack, so the advisory still goes out.
- **Slack webhook failure:** logged as a warning; it doesn't affect the worker's own success.

## Dependencies

This worker relies on:
- `PlatformContext` (`context.clients.platformHttp`, `context.clients.axios`, `context.secrets`)
  from the `jfrog-workers` package.
- `AfterDownloadRequest` / `AfterDownloadResponse` for the event payload and response shape.
- Anthropic's [Messages API](https://docs.anthropic.com/en/api/messages) (called directly over
  HTTPS via `context.clients.axios`; no Anthropic SDK dependency needed).
