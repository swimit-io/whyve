# Whyve

Keep the reasons behind project decisions across AI agent sessions. Whyve records decisions, observations, assumptions, intents, terms, and documents as readable Markdown. It can recall an earlier rationale and compare a new proposal with the current decision before anything is replaced.

## Install and start

Whyve requires Node.js 20.20.0 or newer. No Python, Whyve account or remote Whyve service is required.

```sh
# Claude Code
claude plugin marketplace add https://github.com/swimit-io/whyve.git --scope user
claude plugin install whyve@whyve --scope user

# Codex
codex plugin marketplace add https://github.com/swimit-io/whyve.git
codex plugin add whyve@whyve
```

Restart Codex or Claude Code, open a project, and run `$whyve:init` (Codex) or `/whyve:init` (Claude Code). Choose the record types and a recording mode: `explicit`, `auto`, or `adaptive`. New projects start with decisions only and `explicit` mode. Init only configures the plugin you installed; it doesn't install anything else.

## Try three workflows

1. Record a reason: “I decided this trial will support CSV only and leave Excel for later. I want to validate the first-use flow quickly. Remember this decision.”
2. In a new session in the same project, recall it: “Why did we postpone Excel support?”
3. Compare without changing it: “What about including Excel in this trial too? I'm just exploring. I'm not changing the decision yet.”

The third prompt should show the existing reason alongside the proposal and leave the current decision in place. See the [two-session demo](https://github.com/swimit-io/whyve/blob/main/assets/demo/README.md) for a reproducible transcript.

## Files, data and control

Whyve saves settings in `.whyve/config.json` and, by default, records in the project's `context/` directory. You may explicitly select another filesystem vault during setup. Records remain until you delete or migrate them; turning off a feature does not erase existing files. Git is optional. The packaged Whyve runtime reads and writes local project files and does not send them to a Whyve server or use an API key. Your AI host may receive content when the agent reads a record or includes it in a conversation; the host's data policy applies to that processing. Don't put secrets in records.

The recording mode governs when Whyve asks before saving; it does not authorize unrelated code changes or external actions. The [privacy notice](PRIVACY.md) explains how plugin and support data is handled. The [recording policy](skills/context/references/recording-policy.md) explains the modes and [templates](templates/) show record formats.

## Help and license

For setup trouble, check Node.js and rerun init (`$whyve:init` or `/whyve:init`) from the intended project. Report bugs through [GitHub issues](https://github.com/swimit-io/whyve/issues), and report vulnerabilities through [private security reporting](https://github.com/swimit-io/whyve/security/advisories/new). Whyve is licensed under [Apache-2.0](https://github.com/swimit-io/whyve/blob/main/LICENSE).
