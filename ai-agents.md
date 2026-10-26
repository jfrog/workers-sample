# Integrate JFrog Workers with AI Agents

Extend your AI agents with custom, deterministic actions powered by JFrog Workers. Combine the flexibility of AI-driven decisions with predictable, repeatable execution to ensure critical software supply chain operations follow defined logic and policies.

Explore ready-to-use integration samples and practical use cases to turn agent decisions into reliable actions across your DevSecOps workflows.

Each sample folder includes `worker.ts`, `manifest.json`, and a README with the secrets, properties, and setup steps.

## After Download

These Workers run after Artifactory has served the artifact. They can record or notify. They do not block the download.

* [NanoClaw Agent Vault audit log](samples/artifactory/AFTER_DOWNLOAD/nanoclaw-agent-vault-audit-log) records a download that NanoClaw's Agent Vault resolved through Artifactory and posts that record to an audit endpoint.
* [NanoClaw Slack agent trigger](samples/artifactory/AFTER_DOWNLOAD/nanoclaw-slack-agent-trigger) posts the download to Slack so a live NanoClaw agent ingests the message and can act on it.
* [NemoClaw skill install audit](samples/artifactory/AFTER_DOWNLOAD/nemoclaw-skill-install-audit) records the skill slug, version, registry identity, and Xray status for a skill archive downloaded into a NemoClaw sandbox, then posts that record to an audit endpoint.
* [Claude download risk advisor](samples/artifactory/AFTER_DOWNLOAD/ai-download-risk-advisor) asks Claude for a short risk summary when the artifact's Xray scan has security issues or policy violations, then posts that summary to Slack. Requires Xray.
* [OpenAI download risk advisor](samples/artifactory/AFTER_DOWNLOAD/openai-download-risk-advisor) uses the same Xray lookup and Slack advisory, and calls the OpenAI Chat Completions API. Requires Xray.
* [Copilot dependency advisory](samples/artifactory/AFTER_DOWNLOAD/copilot-dependency-advisory) runs only for an artifact that has the `copilot.advisor.repo` and `copilot.advisor.repoBaseBranch` properties. On the first download, it opens a GitHub issue and assigns that issue to the GitHub Copilot coding agent.

## Before Download

* [Copilot allowlist gate](samples/artifactory/BEFORE_DOWNLOAD/copilot-allowlist-gate) allows a download when `<repoKey>/<path>` matches a glob in an allowlist file stored in GitHub. By default (`failMode=WARN`), the download proceeds with a warning if the allowlist can't be read or the Worker is not configured. Set `failMode` to `STOP` to block in that case. A folder request proceeds without an allowlist check. A blocked artifact gets a GitHub issue assigned to the GitHub Copilot coding agent.
* [Claude blocked download explainer](samples/artifactory/BEFORE_DOWNLOAD/ai-blocked-download-explainer) blocks a download when the artifact's Xray scan has more critical security issues than `maxCriticalIssues` (default `0`). Claude writes the explanation only. If Xray is unavailable, the artifact has no scan result, or the Xray search fails, the download proceeds with a warning.
