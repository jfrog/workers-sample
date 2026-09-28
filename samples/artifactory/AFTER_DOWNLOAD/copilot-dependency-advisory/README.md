# Copilot Dependency Advisory

## Overview

This worker listens to the `AFTER_DOWNLOAD` event in JFrog Artifactory. It only acts on artifacts
that are explicitly tagged with two Artifactory **properties**:

- `copilot.advisor.repo` — the `owner/repo` where advisory issues should be opened
- `copilot.advisor.repoBaseBranch` — the base branch Copilot's coding agent should work from

An artifact missing either property is a **NOP** — the worker never guesses a target repo. The
first time a *tagged* artifact is downloaded, the worker opens a GitHub issue in the repo named by
its properties and assigns that issue to **GitHub Copilot's coding agent**, so Copilot autonomously
investigates the new dependency (what it is, whether it's approved, whether usage notes need
updating) instead of a human having to notice and file that ticket manually.

Every later download of the same artifact is also a no-op — once an issue is opened, the worker
writes a third property, `copilot.advisor.notified`, back onto the artifact, so a package pulled
500 times a day only opens one issue, not 500.

This dedupe intentionally does **not** use the Worker's built-in `context.state`: that state is
capped at a handful of small key-value pairs (10 items, 40-char keys, 250-char values, by the
current platform default) with no eviction — it throws once full, and isn't a fit for "remember
every artifact ever downloaded" at any real scale. Recording the flag on the artifact itself has no
such ceiling; each artifact carries its own dedupe bit.

## Why this design

An `AFTER_DOWNLOAD` event only tells you *what* was downloaded (repo key, path) and *who* requested
it (a JFrog user or token identity) — Artifactory has no field for "which GitHub repo is consuming
this," so this sample deliberately doesn't try to invent one. Instead, whoever owns a package opts
it in explicitly by tagging it with the two `copilot.advisor.*` properties (e.g. via `jf rt sp` at
publish time, or manually in the UI) — the worker just reads what's already there. This keeps the
worker itself simple, and puts the "which repo cares about this dependency" decision where it
belongs: with the artifact's owner, per artifact, not in one global worker setting.

It's the informational counterpart to `ai-download-risk-advisor` (which reacts to Xray findings on
every qualifying download): this one reacts to novelty (a dependency nobody has flagged before) and
hands the follow-up off to an autonomous GitHub agent rather than a Slack message a human has to
act on.

## Functionality

1. **Trigger:** runs after a download completes in Artifactory, for repositories listed in
   `manifest.json`'s `filterCriteria`.
2. **Opt-in + dedupe check:** reads the `copilot.advisor.repo`, `copilot.advisor.repoBaseBranch`,
   and `copilot.advisor.notified` properties off the downloaded artifact in one call. Missing
   either of the first two, or `notified` already `true`, and the worker stops here.
3. **Open an issue:** opens a GitHub issue in the repo named by `copilot.advisor.repo`, describing
   the artifact, its source repo, and who downloaded it.
4. **Mark as notified:** writes `copilot.advisor.notified=true` back onto the artifact right after
   the issue is created, so a failure in the next step never causes a duplicate issue on a later
   download.
5. **Assign to Copilot:** calls GitHub's dedicated assignment endpoint to hand the issue to
   Copilot's coding agent (`copilot-swe-agent[bot]`), targeting the branch named by
   `copilot.advisor.repoBaseBranch`. If this step fails (e.g. Copilot coding agent isn't enabled on
   that repo), the issue still exists for a human to pick up manually.

## Required secrets

| Secret Name   | Description                                                                                     | Required |
| -------------- | ------------------------------------------------------------------------------------------------- | -------- |
| `GitHubToken` | A GitHub **personal access token** (classic, `repo` scope) belonging to a real user. Copilot coding agent usage is billed per-user, so a GitHub App / installation token cannot be used to assign issues to it. | Yes — without it a tagged/new dependency is detected but no issue is opened |

Add it with the JFrog CLI:

```sh
jf worker add-secret GitHubToken
```

## Configuration

### Artifact properties (per artifact, required to opt in)

Set these on any artifact you want this worker to watch — for example at publish time:

```sh
jf rt sp <repo>/<path> "copilot.advisor.repo=myorg/dependency-catalog;copilot.advisor.repoBaseBranch=main"
```

| Property                          | Example                     | Purpose                                              |
| ---------------------------------- | ------------------------------ | --------------------------------------------------------- |
| `copilot.advisor.repo`            | `myorg/dependency-catalog`   | `owner/repo` where the advisory issue is opened            |
| `copilot.advisor.repoBaseBranch`  | `main`                        | Base branch passed to Copilot's coding agent                |

Both must be set, or the worker treats the download as a NOP. Don't set `copilot.advisor.notified`
yourself — the worker manages it, writing `true` once an issue has been opened for the artifact.

### Worker properties (global, optional)

Declared in `manifest.json` (`context.properties.get(...)` in `worker.ts`):

| Property            | Default                     | Purpose                              |
| -------------------- | ------------------------------- | ----------------------------------------- |
| `githubApiUrl`      | `https://api.github.com`      | Override for GitHub Enterprise Server  |
| `githubApiVersion`  | `2022-11-28`                  | Value sent as the `X-GitHub-Api-Version` header |

Edit the value directly in `manifest.json`'s `"properties"` object and redeploy (`jf worker deploy`).

The worker is filtered to the repositories listed in `manifest.json` under
`filterCriteria.artifactFilterCriteria.repoKeys` — update that list to match the repositories whose
new dependencies you want tracked (e.g. your `npm-local`/`pypi-local`/`maven-local` repos, not every
repo in the platform). Note this filter is still just a coarse net; the actual opt-in is the two
artifact properties above.

## How it works

1. **Download event:** the worker receives the downloaded artifact's repo key, path, and the
   user/token that downloaded it.
2. **Property lookup:** `GET /api/storage/{repoKey}/{path}?properties=copilot.advisor.repo,copilot.advisor.repoBaseBranch,copilot.advisor.notified`
   ([Item Properties API](https://jfrog.com/help/r/jfrog-rest-apis/item-properties)). Artifactory
   returns `404` when none of the three are set — treated as "not opted in", not an error.
3. **Create the issue:** `POST /repos/{copilot.advisor.repo}/issues` with a title/body naming the
   artifact, its source repository, and the downloader.
4. **Record notified:** `PUT /api/storage/{repoKey}/{path}?properties=copilot.advisor.notified=true`
   (same API, a write this time).
5. **Assign to Copilot:** `POST /repos/{copilot.advisor.repo}/issues/{number}/assignees` with
   `{ assignees: ["copilot-swe-agent[bot]"], agent_assignment: { target_repo, base_branch } }` —
   see [Using Copilot cloud agent via the API](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-via-the-api).
   This is a separate call from issue creation; GitHub doesn't accept this assignee on the
   create-issue call itself.
6. **Log the outcome:** the worker's return `message` always reflects what actually happened
   (not opted in / skipped / issue created / issue created but not assigned / failed), visible in
   the Workers execution log.

## Running this sample end-to-end

### Prerequisites

- A JFrog Platform instance with **Artifactory** enabled.
- [JFrog CLI](https://jfrog.com/getcli/) installed and configured against that instance.
- A GitHub repository to act as the dependency catalog, with
  [Copilot coding agent](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent) enabled.
- A GitHub personal access token (classic, `repo` scope) for a user who has Copilot access on that repo.

### Steps

1. Configure the JFrog CLI server if you haven't already:
   ```sh
   jf config add <server-id>
   ```
2. From this directory, deploy the worker (or copy this folder's files into a worker created via
   `jf worker init AFTER_DOWNLOAD copilot-dependency-advisory` if you're starting fresh):
   ```sh
   jf worker deploy
   ```
3. Add the secret:
   ```sh
   jf worker add-secret GitHubToken
   ```
4. Edit `manifest.json`'s `filterCriteria.artifactFilterCriteria.repoKeys` to the repos you want
   tracked, then tag a test artifact with both opt-in properties:
   ```sh
   jf rt sp <repo>/<path> "copilot.advisor.repo=<owner>/<repo>;copilot.advisor.repoBaseBranch=main"
   ```
5. Set `manifest.json`'s `"enabled"` to `true` (samples ship disabled by default) and deploy again.
6. Download the tagged artifact (e.g. `jf rt download <repo>/<path>` or via the UI).
7. Check the result:
   - Workers execution log (Platform UI → Administration → Workers → this worker → Logs), or
     `jf worker exec-history <worker-name>`, should show the `message` the worker returned.
   - The repo named by `copilot.advisor.repo` should have a new issue, assigned to Copilot.
8. Download the same artifact again — the worker should log
   `"Artifact already notified before; skipped Copilot advisory."` and no second issue should
   appear (check the artifact's properties in the UI — `copilot.advisor.notified` should now be
   `true`).
9. To see the opt-in gate, download a different, untagged artifact — the worker should log
   the "Artifact is not opted in..." message and make no external calls.

## Response messages

- `"Missing repoPath metadata on the download request."`
- `"Artifact already notified before; skipped Copilot advisory."`
- `"Artifact is not opted in (missing 'copilot.advisor.repo' and/or 'copilot.advisor.repoBaseBranch' property); skipped Copilot advisory."`
- `"Failed to read artifact properties: <error>"`
- `"New dependency detected but GitHubToken secret is not configured; skipped Copilot advisory."`
- `"New dependency detected but failed to open a GitHub issue: <error>"`
- `"New dependency detected: opened issue #<n> in <repo>, but failed to assign it to Copilot."`
- `"New dependency detected: opened issue #<n> in <repo> and assigned it to Copilot."`

## Error scenarios

- **Artifact not tagged (one or both properties missing):** the worker no-ops; nothing is created
  anywhere. This is the expected, common case for most downloads.
- **Artifact properties lookup fails for a reason other than "not found"** (Artifactory
  unreachable, permissions): logged as an error and surfaced in the return message; the artifact is
  *not* marked as notified, so the next download will retry the lookup.
- **GitHub issue creation fails** (bad token, rate limit, network error): logged as an error; the
  artifact is *not* marked as notified, so the next download of the same artifact will retry.
- **Writing the `notified` property back fails** (Artifactory unreachable, permissions): logged as
  a warning; the issue still exists, but the next download of this same artifact will open a
  duplicate issue since the dedupe write never landed. This is a narrow, per-artifact failure mode
  (unlike a global dedupe store, one artifact's write failure can't affect any other artifact).
- **Copilot assignment fails** (Copilot coding agent not enabled on the repo, token isn't a PAT,
  Copilot access not granted to the token's user): logged as a warning; the issue still exists for
  manual triage, and the artifact is already marked as notified (no duplicate issue on retry).

## Dependencies

This worker relies on:
- `PlatformContext` (`context.clients.platformHttp`, `context.clients.axios`, `context.secrets`,
  `context.properties`) from the `jfrog-workers` package. Deliberately **not** `context.state` —
  see "Why this design" above.
- `AfterDownloadRequest` / `AfterDownloadResponse` for the event payload and response shape.
- Artifactory's [Item Properties API](https://jfrog.com/help/r/jfrog-rest-apis/item-properties)
  to read the artifact's opt-in properties and write back the notified marker.
- GitHub's [Issues API](https://docs.github.com/en/rest/issues/issues) and
  [Copilot coding agent assignment API](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-via-the-api)
  (called directly over HTTPS via `context.clients.axios`; no GitHub SDK dependency needed).
