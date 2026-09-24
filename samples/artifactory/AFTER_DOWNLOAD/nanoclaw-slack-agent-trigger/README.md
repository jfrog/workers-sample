# NanoClaw Slack Agent Trigger — AFTER_DOWNLOAD

## Overview

This worker posts a Slack message that a **live [NanoClaw](https://nanoclaw.dev) agent actually
ingests as input** — using nothing but Slack's own Web API and NanoClaw's ordinary,
already-documented chat ingestion. There is no NanoClaw-specific API involved anywhere; the message
becomes something the agent reasons over and can act on, not just a record sitting in a log.

NanoClaw connects a chat channel to an agent group via a **wiring**
([`docs.nanoclaw.dev/concepts/entity-model`](https://docs.nanoclaw.dev/concepts/entity-model)),
created with:

```bash
ncl wirings create --channel-type slack --platform-id <slack-channel-id> \
  --agent-group-id <agent-group-id> --engage-mode pattern --engage-pattern "^nanoclaw-audit:"
```

`--engage-mode pattern` is the key choice here: NanoClaw normally only engages on an `@mention` of
its bot, but `pattern` mode engages on a regex match against the message text instead — so this
worker's Slack post doesn't need to mention anything, it just needs to start with the same prefix
the wiring's `--engage-pattern` was configured with (the `triggerPrefix` Worker property below; the
two must match exactly, there is no validation tying them together).

Once matched, the message is a completely ordinary inbound message to that agent group — the agent
can do anything a real message triggers it to do: call its own tools (e.g. check the package
against Xray, if that's wired up), reply in the channel, or even kick off its own
`install_packages`/`add_mcp_server` self-modification if it decides something needs following up
on. The worker's output is something an agent *reasons over*, not a payload that only ends up in a
log.

**`AFTER_DOWNLOAD` still cannot block anything** — same as the audit-log sample, this fires after
the artifact is already served. This worker only ever *notifies*; whatever happens next is entirely
up to what the NanoClaw agent decides to do with the message.

## The sender-policy gate (read this before wiring anything up)

NanoClaw does **not** accept a message from just anyone posting in a wired channel. Every
messaging group has an `unknown_sender_policy`:

| Policy | Behavior for an unrecognized sender (e.g. this worker's Slack bot) |
|---|---|
| `strict` | Message is silently discarded. |
| `request_approval` (default for an auto-created channel) | Message is held; an admin gets an approval card before it reaches the agent. |
| `decline_notify` | Sender is told the message was declined. |
| `public` | No check — any sender's message reaches the agent. |

A worker posting from its own bot token is, by default, an **unknown sender** — its messages will
be held for approval or dropped, not delivered instantly, unless you do one of:

- Add the worker's Slack bot as a member of the channel and set the wiring's `sender_scope` to
  `known` so it's recognized, or
- Get the bot pre-approved once via the normal approval-card flow (after which it's "known"), or
- Set the channel's `unknown_sender_policy` to `public` for a quick demo — simplest to test, but
  means *any* sender posting a matching-pattern message in that channel can trigger the agent.
  Treat this as a security decision, not a default.

## What the worker does

On every matching download, it posts to Slack's `chat.postMessage` API:

```json
POST https://slack.com/api/chat.postMessage
{
  "channel": "C0123456789",
  "text": "nanoclaw-audit: 'left-pad/-/left-pad-1.3.0.tgz' was resolved from repo 'npm-remote' (REPO_TYPE_REMOTE) by registry identity 'nanoclaw-agent-group-artifactory-token'. Please verify this package."
}
```

authenticated with a bearer token read from a Worker secret. The Slack Web API returns HTTP 200
even on a logical failure (e.g. `channel_not_found`), so the worker checks `response.data.ok`, not
just the status code.

## Files

| File | Purpose |
|---|---|
| `worker.ts` | Worker logic |
| `types.ts` | Localized `AFTER_DOWNLOAD` payload types (per repo convention) |
| `worker.spec.ts` | Unit tests (success, Slack logical error, non-200/thrown error, missing property) |
| `manifest.json` | Worker registration — action, filter criteria, secrets, properties |
| `package.json`, `tsconfig.json` | Build/test config, same as other samples in this repo |

## Prerequisites

- A JFrog Platform instance with Workers enabled, and `jf` configured against it
  (`jf c add` / `jf login`).
- An Artifactory repo matching `filterCriteria.artifactFilterCriteria.repoKeys` in `manifest.json`.
- A Slack app with a bot token (`xoxb-...`) that has the `chat:write` scope, invited to the target
  channel.
- A local NanoClaw install (see
  [nanoclaw.dev quickstart](https://docs.nanoclaw.dev/quickstart)) with at least one agent group,
  and a wiring created per the command above.

## Configuration

Both the target Slack channel and the trigger prefix are Worker properties, not hardcoded
constants, so they can be changed (or kept in sync with the NanoClaw wiring) without redeploying
the worker's logic:

```typescript
const SLACK_CHANNEL_PROPERTY = 'slackChannelId'; // Worker property
const TRIGGER_PREFIX_PROPERTY = 'triggerPrefix'; // Worker property - must match the wiring's --engage-pattern
const SECRET_NAME = 'slackBotToken';             // Worker secret
```

Set the properties in `manifest.json`:

```json
"properties": {
    "slackChannelId": "<slack-channel-id>",
    "triggerPrefix": "nanoclaw-audit:"
}
```

Register the secret before deploying:

```bash
jf worker add-secret slackBotToken
```

## Running the unit tests

```bash
npm install
npm test
```

Covers: successful post, a Slack logical error (`ok: false`), a thrown/network error, and the
missing-property skip path — in every case the worker must resolve (never reject) and return the
corresponding `message`.

## Testing E2E

### 1. Sandbox test-run (no live repo, no NanoClaw)

```bash
jf worker test-run @sample-payload.json
```

with a `sample-payload.json` shaped like `AfterDownloadRequest`:

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

Point `slackChannelId` at a real test channel first, so you can visually confirm the message
lands, before wiring an agent to it at all.

### 2. Real deploy + real download (Slack only, no NanoClaw agent yet)

1. Set `"enabled": true` in `manifest.json`, then `jf worker deploy`.
2. Trigger a real download from a repo matching `filterCriteria`, e.g.
   `jf rt curl /npm-remote/left-pad/-/left-pad-1.3.0.tgz -o /dev/null`.
3. Confirm the message appears in the Slack channel, worded with the correct `repoKey`,
   `artifactPath`, and registry identity.
4. If the channel isn't `public` and the bot isn't a known sender yet, expect an approval card
   instead of an instant post into the agent's view — see the sender-policy table above. This step
   only proves Slack delivery; it does not yet prove the agent engaged.

### 3. Full walkthrough: prove the NanoClaw agent actually engages

1. **Set up NanoClaw** per the [quickstart](https://docs.nanoclaw.dev/quickstart), with at least
   one agent group.
2. **Create the wiring**, exactly matching the `triggerPrefix` property configured above:
   ```bash
   ncl wirings create --channel-type slack --platform-id <slack-channel-id> \
     --agent-group-id <agent-group-id> --engage-mode pattern --engage-pattern "^nanoclaw-audit:"
   ```
3. **Resolve the sender-policy gate** for a clean test: either add the worker's Slack bot to the
   channel and confirm/approve it once (so it becomes a known sender), or temporarily set the
   channel's `unknown_sender_policy` to `public`.
4. **Deploy this worker** (`enabled: true`, `jf worker deploy`) against a real repo.
5. **Trigger a real download**, same as step 2 above.
6. **Verify engagement, not just delivery.** The agent should visibly react in the channel (a
   reply, a reaction, or whatever its instructions have it do with an unprompted audit note) —
   that's the proof this is a real trigger and not just a Slack post sitting unread. Cross-check
   with `ncl sessions history <session-id>` to confirm a new inbound message/session was recorded
   for the agent group at that timestamp.

## Response messages

- Success: `NanoClaw agent notified via Slack`
- `slackChannelId` property not set: `Worker property 'slackChannelId' is not set; skipping Slack notification`
- `triggerPrefix` property not set: `Worker property 'triggerPrefix' is not set; skipping Slack notification`
- Slack logical error (`ok: false`) or non-200: `Failed to notify NanoClaw agent via Slack`
- Network/other error: `Failed to notify NanoClaw agent via Slack`

## Limitations

- No blocking — same as every `AFTER_DOWNLOAD` worker, this fires after the artifact is served.
- This is **not** a NanoClaw API integration. It works because NanoClaw's Slack channel ingestion
  is generic chat ingestion; nothing here is specific to Artifactory or Workers from NanoClaw's
  point of view. If NanoClaw ever changes wiring/pattern semantics, this breaks silently (no
  contract between the two systems).
- **Sender-policy is a real security surface, not a formality.** Setting a channel to `public` so
  this "just works" means anyone who can post a `nanoclaw-audit:`-prefixed message in that channel
  can trigger the agent group — evaluate this the same way you'd evaluate any other prompt-injection
  surface before using it beyond a local demo.
- The `triggerPrefix` Worker property and `--engage-pattern` in the `ncl wirings create` command are
  two independently-maintained values with no shared source of truth — keep them in sync by hand.

## Cleanup

```bash
jf worker rm "nanoclaw-slack-agent-trigger"
```
