<p align="center">
  <picture> <source media="(prefers-color-scheme: dark)" srcset="assets/github/readme-logo-light.svg"> <img alt="Whyve" src="assets/github/readme-logo-dark.svg" width="240"> </picture>
</p>

<p align="center"><strong>Keep the thread.</strong></p>

<p align="center"><sub><em>The name:</em> Whyve is <em>why</em> + <em>weave</em>. It weaves the reasons behind your choices into a thread that carries across sessions.</sub></p>

<p align="center">
Durable project context for AI agents: decisions and their reasons, kept across sessions.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-blue"></a> <a href="https://github.com/swimit-io/whyve/actions/workflows/test.yml"><img alt="Tests" src="https://github.com/swimit-io/whyve/actions/workflows/test.yml/badge.svg"></a> <img alt="Node.js 20.20 or newer" src="https://img.shields.io/badge/node-%3E%3D20.20-informational">
</p>

<p align="center"><a href="README.ko.md">한국어</a></p>

## Quick install

Whyve is a plugin for Codex and Claude Code. It needs Node.js 20.20.0 or newer.

```bash
# Codex
codex plugin marketplace add https://github.com/swimit-io/whyve.git
codex plugin add whyve@whyve

# Claude Code
claude plugin marketplace add https://github.com/swimit-io/whyve.git --scope user
claude plugin install whyve@whyve --scope user
```

Then restart Codex or Claude Code and run `$whyve:init` (Codex) or `/whyve:init` (Claude Code) in your project.

<!-- DEMO -->
<p align="center">
  <img alt="Two Claude Code sessions: a decision is recorded, a new session recalls its reason, and a later prompt in that session proposes a change, which is compared with the recorded decision" src="assets/demo/two-sessions.gif" width="720">
</p>
<p align="center"><sub>Two sessions, three prompts, one decision: a real Claude Code run of the example below, replayed from its transcript. <a href="assets/demo/README.md">How it was recorded</a>.</sub></p>

## Not a memory plugin

claude-mem remembers what happened. Whyve remembers why you decided.

Memory tools such as claude-mem and Claude Code's built-in auto memory capture what went on in your sessions. Whyve keeps a smaller set: your decisions, the reasons and assumptions behind them, the terms and goals they depend on, and which decision replaced which. When a later session suggests reversing a decision, Whyve puts the recorded decision and its reason next to the suggestion. Nothing changes until you decide.

Use both. Whyve does not replace your memory tool.

## What it does

Every new session starts without the last one's reasoning. Whyve carries it over.

- **Decisions and their reasons outlast the session.** Ask "why did we choose this?" next week and the agent answers from the record.
- **Changing course starts with the original reason.** When someone proposes undoing a decision, the original reason is on the table before anything is replaced.
- **Everything is a file you can open.** Records are Markdown files in your project's `context/` folder. Git is optional. There is no server, database, or API key.

## What a record looks like

Each record is one Markdown file in your project's `context/` folder. A decision reads like this:

```md
## Decision

The trial supports CSV only; Excel comes later.

## Rationale

Validate the first-use flow quickly.

## Rejected alternatives

- Excel in the trial: slows down the first release.
```

## How to use it

Run `$whyve:init` (Codex) or `/whyve:init` (Claude Code) in your project and choose what to record and how. `init` configures the plugin you already installed; it does not install anything.

| Setting | Choices |
|---|---|
| What to record | Decision, Assumption, Term, Intent, Document |
| Recording mode | `explicit`, `auto`, `adaptive` |

Observation, Snapshot, and Archive are always available.

A fresh setup starts with Decision and `explicit`. You can rerun `init` to change these; turning something off keeps the records you already have.

The recording modes differ in when Whyve asks you:

- **explicit**: Records only clear decisions and explicit "remember this" requests; asks when the meaning or scope is unclear.
- **auto**: Records whatever qualifies, without asking each time.
- **adaptive**: Records on its own and asks only when a confirmation really matters.

`auto` does not record whole transcripts. In every mode, a proposal stays a proposal: the model cannot invent a decision for you or record its own preference as yours. The recording mode also doesn't give the agent permission to change unrelated code or take actions outside your project.

Talk to your agent normally: "Why did we choose this?", "Keep this decision", "Save where we left off." Whyve reads only the records that matter, not the whole folder.

### Try one decision across two sessions

With a fresh setup (Decision + `explicit`), try these messages in your project.

1. In the first session:

   > I decided this trial will support CSV only and leave Excel for later.
   > I want to validate the first-use flow quickly. Remember this decision.

2. Start a new session in the same project:

   > Why did we postpone Excel support?

3. Then explore a possible change:

   > What about including Excel in this trial too? I'm just exploring. I'm not changing the decision yet.

You should see Whyve confirm the record, then recall the stored reason, then compare the new idea with the existing decision. The last message only asks for a comparison, so the decision stays unchanged, even in `auto` or `adaptive` mode.

## What has been validated

The repository's [tests](https://github.com/swimit-io/whyve/tree/main/tests/node) check that decisions and reasons are recorded, that earlier reasons are kept when a decision is replaced, and that current and past records can be read. We have not shown that Whyve beats well-kept Markdown notes or ADRs, and we have not measured token or cost savings. The two-session example above is the quickest way to see whether it helps your project.

## Built with Whyve

[Howse](https://howse.swimit.io/) runs Codex and Claude Code as one team on your Mac or Windows PC (beta), with Whyve built in so decisions carry from one agent to the next.
## Roadmap

**Whyve Cloud**: the same context across your devices, without Git. Coming soon. Whyve itself stays open source and local.

Whyve is open source under Apache-2.0 and is built and maintained by one person. Bug reports are welcome as [issues](https://github.com/swimit-io/whyve/issues); I'm not accepting pull requests at this time. Security issues: see [SECURITY.md](SECURITY.md).

## For developers

- Node library and CLI: [docs/node-api.md](docs/node-api.md)
- Record format: [docs/record-model.md](docs/record-model.md)
- Compatibility: [docs/compatibility.md](docs/compatibility.md)
- Changes by version: [CHANGELOG.md](CHANGELOG.md); upgrading: [MIGRATION.md](MIGRATION.md)
