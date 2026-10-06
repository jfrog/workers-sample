# Copilot Allowlist Gate

## Overview

This worker listens to the `BEFORE_DOWNLOAD` event in JFrog Artifactory and only lets a download
through when the artifact matches an entry in an **allowlist file kept in a GitHub repository**.

When a download is blocked, the worker opens a GitHub issue in that same repository and assigns it
to **GitHub Copilot's coding agent**. Copilot vets the dependency and, if it's acceptable, opens a
PR adding a matching entry to the allowlist. A human reviews and merges the PR, and the next
download goes through. No other approval step is needed: the allowlist in Git is the single source
of truth, and its history is the approval log.

```
download ──► worker reads allowlist from GitHub ──► match? ──► PROCEED
                                                      │
                                                      no
                                                      ▼
                         STOP + issue assigned to Copilot ──► Copilot PR ──► human merge
```

## Why this design

A `BEFORE_DOWNLOAD` worker has to answer immediately, while Copilot's coding agent works over
minutes. So the worker never waits for Copilot: it decides from what is already in the allowlist,
and Copilot's work only changes that allowlist for *later* downloads.

The allowlist location is configured on the **worker** (not on each artifact): an artifact nobody
has approved is precisely one nobody has tagged, so per-artifact configuration can't drive a gate.

It's the blocking counterpart to the `AFTER_DOWNLOAD/copilot-dependency-advisory` sample, which
only notifies.

## Functionality

1. **Trigger:** runs before a download of a stored artifact, for repositories listed in
   `manifest.json`'s `filterCriteria`. Folder requests are let through.
2. **Read the allowlist:** fetches `allowlistPath` from `githubRepo` at `githubBranch`.
3. **Match:** compares `<repoKey>/<path>` against each glob. Any match → `DOWNLOAD_PROCEED`.
4. **No match → `DOWNLOAD_STOP`.** Then:
   - If the artifact already carries the `issueProperty` property (`copilot.allowlist.issue` by
     default), the block message
     points to that issue and nothing else happens.
   - Otherwise the worker opens a review issue, records its URL in that property on
     the artifact, and assigns the issue to Copilot's coding agent (`copilot-swe-agent[bot]`).

The download stays blocked in every "no match" case, including when GitHub calls fail.

## Allowlist file

A JSON array of globs matched against `<repoKey>/<path>` (the same form `jf rt` uses):

```json
[
  "npm-local/lodash/-/lodash-4.17.*.tgz",
  "pypi-remote-cache/**/requests-2.32.*"
]
```

| Pattern | Matches |
| ------- | ------- |
| `*`     | any characters within one path segment (never `/`) |
| `**`    | any characters, across segments |
| `?`     | exactly one character within a segment |

Everything else is literal. A file missing from the repo counts as an empty allowlist (everything
blocked), so Copilot's first PR can create it. See `approved-dependencies.example.json`.

A broad glob such as `npm-local/lodash/**` approves every future version without review: that's a
decision for whoever reviews Copilot's PR.

## Required secrets

| Secret Name   | Description | Required |
| ------------- | ----------- | -------- |
| `GitHubToken` | A GitHub **personal access token** (classic, `repo` scope) belonging to a real user with Copilot access. Copilot coding agent usage is billed per-user, so a GitHub App / installation token cannot be used to assign issues to it. | Yes. Without it the worker warns and lets every download through |

```sh
jf worker add-secret GitHubToken
```

## Configuration

Worker properties, declared in `manifest.json` (`context.properties.get(...)` in `worker.ts`):

| Property           | Default                      | Purpose |
| ------------------ | ---------------------------- | ------- |
| `githubRepo`       | none (required)              | `owner/repo` holding the allowlist; review issues are opened there |
| `githubBranch`     | `main`                       | Branch the allowlist is read from, and Copilot's base branch for its PR |
| `allowlistPath`    | `approved-dependencies.json` | Path of the allowlist inside the repo. `{repoKey}` is replaced by the artifact's repository key |
| `failMode`         | `WARN`                       | When the allowlist can't be read or is invalid: `WARN` lets the download through with a warning, `STOP` blocks it |
| `issueProperty`    | `copilot.allowlist.issue`    | Artifact property that stores the review issue URL on a blocked artifact |
| `githubApiUrl`     | `https://api.github.com`     | Override for GitHub Enterprise Server |
| `githubApiVersion` | `2022-11-28`                 | Value sent as the `X-GitHub-Api-Version` header |

Use `allowlistPath: "allowlists/{repoKey}.json"` to give each Artifactory repository its own file
(`allowlists/npm-local.json`, `allowlists/pypi-remote.json`, ...), and pair it with a
`CODEOWNERS` file so each team reviews the PRs for its own list.

Without `githubRepo` or the `GitHubToken` secret, the worker returns `DOWNLOAD_WARN` (lets the
download through) rather than silently blocking everything.

Update `filterCriteria.artifactFilterCriteria.repoKeys` to the repositories you want gated.

## How it works

1. **Allowlist:** `GET /repos/{githubRepo}/contents/{allowlistPath}?ref={githubBranch}` with
   `Accept: application/vnd.github.raw+json`, so the body is the file itself
   ([Repository contents API](https://docs.github.com/en/rest/repos/contents)).
2. **Existing issue:** `GET /api/storage/{repoKey}/{path}?properties={issueProperty}`
   ([Item Properties API](https://jfrog.com/help/r/jfrog-rest-apis/item-properties)); `404` means none yet.
3. **Review issue:** `POST /repos/{githubRepo}/issues`, asking Copilot to vet the dependency and
   open a PR adding a glob to the allowlist, or explain in the issue why it shouldn't be allowed.
4. **Record it:** `PUT /api/storage/{repoKey}/{path}?properties={issueProperty}=<issue URL>`.
5. **Assign to Copilot:** `POST /repos/{githubRepo}/issues/{number}/assignees` with
   `{ assignees: ["copilot-swe-agent[bot]"], agent_assignment: { target_repo, base_branch } }`;
   see [Using Copilot cloud agent via the API](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-via-the-api).

Every download in the filtered repositories makes one GitHub API call (step 1). The allowlist isn't
cached, so mind the PAT's 5,000 requests/hour limit on busy repositories.

## Running this sample end-to-end

### Prerequisites

- A JFrog Platform instance with **Artifactory** enabled.
- [JFrog CLI](https://jfrog.com/getcli/) installed and configured against that instance.
- A GitHub repository for the allowlist, with
  [Copilot coding agent](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent) enabled.
- A GitHub personal access token (classic, `repo` scope) for a user who has Copilot access on that repo.

### Steps

1. Configure the JFrog CLI server if you haven't already:
   ```sh
   jf config add <server-id>
   ```
2. In `manifest.json`, set `githubRepo` (and optionally `githubBranch` / `allowlistPath`) and the
   `repoKeys` to gate, and set `"enabled"` to `true` (samples ship disabled).
3. From this directory, deploy the worker and add the secret:
   ```sh
   jf worker deploy
   jf worker add-secret GitHubToken
   ```
4. Download an artifact that isn't in the allowlist (e.g. `jf rt download <repo>/<path>`). The
   download fails with a message naming the review issue.
5. In GitHub, the issue is assigned to Copilot. Once Copilot opens its PR, review and merge it.
6. Download the same artifact again: it now goes through.
7. Check the outcomes in the Workers execution log (Platform UI → Administration → Workers → this
   worker → Logs) or with `jf worker exec-history copilot-allowlist-gate`.

## Response messages

| Status | Message |
| ------ | ------- |
| `PROCEED` | `<repoKey>/<path> is allowlisted.` |
| `PROCEED` | `Folder request; allowlist not checked.` |
| `STOP` | `<artifact> is not in allowlist <repo>/<path>; opened <issue URL> and assigned it to Copilot.` |
| `STOP` | `<artifact> is not in allowlist <repo>/<path>; opened <issue URL>, but failed to assign it to Copilot.` |
| `STOP` | `<artifact> is not in allowlist <repo>/<path>; review pending in <issue URL>` |
| `STOP` | `<artifact> is not in allowlist <repo>/<path>; failed to open a review issue: <error>` |
| `STOP` | `<artifact> is not in allowlist <repo>/<path>.` (couldn't read `issueProperty`) |
| `failMode` | `Could not read allowlist <repo>/<path>: <error>` |
| `WARN` | `Worker is not configured (missing 'githubRepo' property and/or 'GitHubToken' secret); allowlist not checked.` |
| `WARN` | `Missing repoPath on the download request; allowlist not checked.` |

## Error scenarios

- **GitHub unreachable, rate limited, or the allowlist isn't a JSON array of strings:** `failMode`
  decides (`WARN` by default). Use `STOP` if a gate outage must never let anything through.
- **Issue creation fails:** the download is still blocked, and no issue property is written, so
  the next download tries again.
- **Writing the `issueProperty` property fails:** logged as a warning; the next download of that
  artifact opens a duplicate issue.
- **Copilot assignment fails** (coding agent not enabled, token isn't a PAT): the issue exists
  for a human to pick up; no duplicate issue is opened on later downloads.
- **Copilot (or a reviewer) rejects the dependency:** close the issue. The artifact stays blocked
  and keeps pointing to that issue. Delete the `issueProperty` property to request a new
  review.
- **Two concurrent first downloads** of the same blocked artifact can both open an issue (no lock
  between the property read and write).

## Dependencies

- `PlatformContext` (`context.clients.platformHttp`, `context.clients.axios`, `context.secrets`,
  `context.properties`) from the `jfrog-workers` package.
- `BeforeDownloadRequest` / `BeforeDownloadResponse` for the event payload and response shape.
- GitHub's [Repository contents API](https://docs.github.com/en/rest/repos/contents),
  [Issues API](https://docs.github.com/en/rest/issues/issues) and
  [Copilot coding agent assignment API](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-via-the-api),
  called over HTTPS via `context.clients.axios`.
- Artifactory's [Item Properties API](https://jfrog.com/help/r/jfrog-rest-apis/item-properties).
