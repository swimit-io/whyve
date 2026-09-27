# Whyve 0.3.0

Node.js 20.20.0+ runs the packaged core and `.mjs` entrypoints. Python is not required.

Keep the thread. One plugin for durable project context.

Run `$whyve:init` to choose what to record and the recording mode (`explicit`, `auto` or `adaptive`) for a project. Records are Markdown files in the project's `context/` folder; turning a feature off never removes them. See the [recording policy](skills/context/references/recording-policy.md) for when Whyve asks before recording, and [templates](templates/) for the shape of each record.
