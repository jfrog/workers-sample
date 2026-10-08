# AI Blocked Download Explainer

## Overview

This worker listens to the `BEFORE_DOWNLOAD` event in JFrog Artifactory. It blocks the download
of any artifact whose existing JFrog Xray scan shows more critical security issues than allowed,
and asks **Claude** (Anthropic's API) to turn the blocking CVEs into a short, actionable
explanation, such as which version to upgrade to. That explanation is returned to the client in
the worker's `message`, and optionally posted to Slack, so the developer whose build just failed
knows why and what to do next, without opening the Xray UI.

It extends the `BEFORE_DOWNLOAD/restrict-download-on-xray-critical-issues` sample, which blocks
with a static message. It's the blocking counterpart to the
`AFTER_DOWNLOAD/ai-download-risk-advisor` sample, which explains a download after the fact in Slack.

## Design: rules decide, Claude explains

`BEFORE_DOWNLOAD` runs on the download path, so the client waits for the worker. Two rules
follow from that:

- **Claude never decides.** Whether a download is blocked is a fixed threshold on the Xray
  critical issue count. Claude only writes the explanation, and the facts (artifact, count,
  limit) in the message never come from the model.
- **Claude is only called when a download is blocked.** Allowed downloads never wait on an LLM.
  On the blocked path, the call uses a fast model (`claude-haiku-4-5-20251001`) and a small
  `max_tokens`. If it fails, the download is still blocked, with the static message.
- **No client-side timeout.** The Workers runtime rejects axios' `timeout` option, has no
  `clearTimeout`, and fails an execution that leaves a pending promise behind (as a
  `Promise.race` timer would). The Claude call is therefore bounded only by the platform's
  execution time limit. Keep the model fast and `claudeMaxTokens` small.

## Functionality

1. **Trigger:** runs before a download is served by Artifactory.
2. **Xray lookup:** checks Xray is reachable, then looks up the artifact's existing scan result
   (critical issue count) via the Xray API. It doesn't trigger a new scan. If Xray is
   unavailable or has no result for the artifact, the download proceeds with a warning.
3. **Decision:** if the critical issue count is at or below `maxCriticalIssues`, the download
   proceeds and Claude isn't called.
4. **Cost guard:** `HEAD` and checksum requests are blocked with the static message, without a
   Claude call or a Slack notification. Package managers send many of these, and only the real
   download needs an explanation.
5. **Details:** fetches the critical issues (up to 30) from the Xray artifact summary API: the CVE and
   the issue summary, which states the affected version range (e.g. "jackson-databind before
   2.9.10"), plus the artifact's component id. If this fails, Claude explains from the counts alone.
6. **AI explanation:** sends those details to Claude, asking for at most two plain-text
   sentences. The answer is flattened to a single line and appended to the block message.
7. **Fallback:** if the `AnthropicApiKey` secret is missing, or the Claude call fails, the
   download is still blocked with the static message.
8. **Slack notification:** if the `Slack_URL` secret is set, the block message (with or without
   the AI explanation) is posted to Slack with the blocked user or token. Artifactory returns the
   message in the body of an HTTP 409 error, and many clients only print the status code, so
   Slack is where the explanation is reliably seen.

## Required secrets

| Secret Name       | Description                                                        | Required |
| ----------------- | ------------------------------------------------------------------- | -------- |
| `AnthropicApiKey` | Anthropic API key used to call Claude (`https://api.anthropic.com`) | No: without it, blocked downloads get the static message |
| `Slack_URL`       | Incoming webhook URL for the Slack channel to notify of blocked downloads | No: without it, nothing is posted to Slack |

```sh
jf worker add-secret AnthropicApiKey
jf worker add-secret Slack_URL
```

## Configuration

These are declared as Worker **properties** in `manifest.json` (`context.properties.get(...)` in
`worker.ts`), so they can be tuned per deployment without touching the code. Each also has a
code-level default, used if the property is removed or unset:

| Property            | Default                                 | Purpose                                                          |
| ------------------- | --------------------------------------- | ---------------------------------------------------------------- |
| `maxCriticalIssues` | `0`                                     | Block when the artifact has more critical issues than this       |
| `claudeModel`       | `claude-haiku-4-5-20251001`             | Fast model, since the client is waiting                          |
| `claudeMaxTokens`   | `200`                                   | The explanation is two sentences, keep this small                |
| `claudeApiUrl`      | `https://api.anthropic.com/v1/messages` | Anthropic Messages API endpoint; override to point at a proxy    |
| `claudeApiVersion`  | `2023-06-01`                            | Anthropic API version header                                     |

The worker is filtered to the repositories listed in `manifest.json` under
`filterCriteria.artifactFilterCriteria.repoKeys`. Update that list to match the repositories
you want covered.

## Claude walkthrough (example)

Say a developer downloads `libs-release-local/com/fasterxml/jackson/core/jackson-databind/2.9.8/jackson-databind-2.9.8.jar`,
which Xray already scanned with 14 critical security issues.

The worker sends Claude a prompt along these lines (issue summaries are cut to 300 characters):

```
A developer's download of an artifact from JFrog Artifactory was just blocked by a security
policy. Their package manager will print your answer as the error message. In at most 2 short
sentences and plain text (no markdown, no line breaks), tell them the main reason and the most
useful next step. Only recommend a specific version if it is above every affected version range
listed below (a range "through X" includes X); otherwise tell them to upgrade to the latest
release. Do not invent CVEs or versions that are not listed below.

Artifact: jackson-databind-2.9.8.jar
Policy: at most 0 critical security issues allowed
Critical security issues found: 14
Details:
- Component: com.fasterxml.jackson.core:jackson-databind:2.9.8
- CVE-2019-14379: SubTypeValidator.java in FasterXML jackson-databind before 2.9.9.2 mishandles default typing when ehcache is used (...), leading to remote code execution.
- CVE-2019-16335: A Polymorphic Typing issue was discovered in FasterXML jackson-databind before 2.9.10. It is related to com.zaxxer.hikari.HikariDataSource. (...)
- CVE-2019-14540: A Polymorphic Typing issue was discovered in FasterXML jackson-databind before 2.9.10. It is related to com.zaxxer.hikari.HikariConfig.
- ...
- CVE-2020-9546: FasterXML jackson-databind 2.x before 2.9.10.4 mishandles the interaction between serialization gadgets and typing, (...)
- ...
```

The worker then returns (Claude's part generated by `claude-haiku-4-5`; the wording varies between calls):

```json
{
  "status": "DOWNLOAD_STOP",
  "message": "DOWNLOAD STOPPED: libs-release-local/com/fasterxml/jackson/core/jackson-databind/2.9.8/jackson-databind-2.9.8.jar has 14 critical security issues (limit 0). Your jackson-databind version 2.9.8 has 14 critical vulnerabilities related to unsafe deserialization that could allow remote code execution. Upgrade to jackson-databind 2.9.10.4 or later to resolve all identified issues.",
  "headers": {}
}
```

The first sentence of `message` is always produced by the worker itself; only the part after it
comes from Claude.

The client receives it as an HTTP 409 error:

```json
{
  "errors" : [ {
    "status" : 409,
    "message" : "BEFORE_DOWNLOAD Worker Event Error: DOWNLOAD STOPPED: ... Upgrade to jackson-databind 2.9.10.4 or later to resolve all identified issues."
  } ]
}
```

`curl` prints this body; many clients, including `jf rt download`, only print the 409 status.
That's why the same message is also posted to Slack when `Slack_URL` is set.

## Running this sample end-to-end

### Prerequisites

- A JFrog Platform instance with **Artifactory** and **Xray** enabled, and an artifact Xray has
  already scanned with at least one critical security issue.
- [JFrog CLI](https://jfrog.com/getcli/) installed and configured against that instance.
- An [Anthropic API key](https://console.anthropic.com/) with access to the Messages API.

### Steps

1. Configure the JFrog CLI server if you haven't already:
   ```sh
   jf config add <server-id>
   ```
2. Edit `manifest.json`'s `filterCriteria.artifactFilterCriteria.repoKeys` to point at the repo
   containing your test artifact, and set `"enabled"` to `true` (samples ship disabled).
3. From this directory, add the secrets and deploy the worker:
   ```sh
   jf worker add-secret AnthropicApiKey
   jf worker add-secret Slack_URL
   jf worker deploy
   ```
4. Download the test artifact, e.g. `curl -u <user>:<token> <platform-url>/artifactory/<repo>/<path>`.
   The download fails with HTTP 409, the response body contains the explanation, and the same
   message is posted to Slack.
5. Check the Workers execution log (Platform UI → Administration → Workers → this worker → Logs),
   or `jf worker exec-history ai-blocked-download-explainer`.
6. To see the fallback, remove the `AnthropicApiKey` secret and download again: the download is
   still blocked, with the static message only.

Run the unit tests with:

```sh
npm install
npm test
```

## Response messages

- `"Artifact has <n> critical security issues (limit <max>): proceed with the download."` (`DOWNLOAD_PROCEED`)
- `"DOWNLOAD STOPPED: <repo>/<path> has <n> critical security issues (limit <max>). <Claude explanation>"` (`DOWNLOAD_STOP`)
- `"DOWNLOAD STOPPED: <repo>/<path> has <n> critical security issues (limit <max>)."` (`DOWNLOAD_STOP`, no key, Claude failure, `HEAD` or checksum request)
- `"Could not check for Xray scans because Xray is not available. Download will proceed with warning."` (`DOWNLOAD_WARN`)
- `"Could not find an Xray scan result matching this artifact. Download will proceed with warning."` (`DOWNLOAD_WARN`)
- `"Error during scan check. Download will proceed with warning."` (`DOWNLOAD_WARN`)

## Error scenarios

- **Xray unavailable or no scan result:** the download proceeds with a warning, as in
  `restrict-download-on-xray-critical-issues`. Change these `warn(...)` calls to `stop(...)` if
  your policy is to fail closed.
- **Xray summary API failure:** logged; Claude explains from the issue count only.
- **Claude API failure** (bad key, rate limit, overload): logged; the download is still blocked
  with the static message.
- **Slack webhook failure:** logged as a warning; the download is still blocked with the same
  message.

## Dependencies

This worker relies on:
- `PlatformContext` (`context.clients.platformHttp`, `context.clients.axios`, `context.secrets`,
  `context.properties`) from the `jfrog-workers` package.
- Xray REST APIs: `GET /xray/api/v1/artifacts` and `POST /xray/api/v1/summary/artifact`.
- Anthropic's [Messages API](https://docs.anthropic.com/en/api/messages), called directly over
  HTTPS via `context.clients.axios`; no Anthropic SDK dependency needed.
