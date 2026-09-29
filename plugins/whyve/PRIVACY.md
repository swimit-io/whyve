# Whyve plugin privacy notice

Last updated: September 29, 2026. This notice covers the open-source Whyve plugin for Claude Code and Codex. The [Whyve website privacy notice](https://whyve.vercel.app/privacy/) separately covers the websites and their waitlist. The publisher is Jinwuk Lee; contact: [jeis.jw@gmail.com](mailto:jeis.jw@gmail.com).

## Project records

Whyve reads and writes project settings in `.whyve/config.json` and Markdown context records in the project's `context/` directory by default. A user can choose another filesystem vault. Records can contain personal information if a user or agent puts it there. Avoid recording secrets or unnecessary personal information.

The plugin does not require a Whyve account or remote Whyve service, and its packaged runtime does not upload records or send telemetry to Whyve. An AI host may process a record when an agent reads it or includes it in a conversation. The host's own privacy policy and settings govern that processing. If you commit records to Git or choose a shared vault, that destination's access and retention rules also apply. Whyve does not publish your records to Git automatically.

## Retention and deletion

Local records do not expire automatically. Disabling a feature or removing the plugin does not delete existing records. You control deletion of the project's `context/`, any vault you selected and `.whyve/config.json`. Copies already shared with Git or an AI host are subject to those services' policies.

## Support information

Use [GitHub issues](https://github.com/swimit-io/whyve/issues) for ordinary support and [private vulnerability reporting](https://github.com/swimit-io/whyve/security/advisories/new) for security issues. Do not post tokens, unredacted records, personal paths or other sensitive details in a public issue. Email is for privacy requests and inquiries unsuitable for a public issue. If diagnostics are needed, the maintainer first asks for a minimal redacted reproduction.

Email support material, including any diagnostics you send, is deleted within 30 days after the inquiry is resolved. GitHub issues and private advisories remain subject to GitHub's retention features and policies. The maintainer does not intentionally export them into a separate Whyve support database. You can request deletion of information within the maintainer's control by emailing [jeis.jw@gmail.com](mailto:jeis.jw@gmail.com).

Changes to this notice will be reflected in this file with an updated date.
