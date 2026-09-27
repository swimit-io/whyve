#!/usr/bin/env node
// Plays transcript.txt back in a terminal for two-sessions.tape.
// Words come from the transcript unchanged. Only presentation is added:
// lines are wrapped at word boundaries, Markdown **bold** and `code` are shown
// with ANSI styles (as an agent TUI would), and playback is sped up.
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? new URL("transcript.txt", import.meta.url);
const WIDTH = Number(process.env.DEMO_WIDTH ?? 100);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = (s) => process.stdout.write(s);
const PROMPT = "\x1b[2m~/trial-importer\x1b[0m \x1b[1m$\x1b[0m ";

const scenes = [];
for (const line of readFileSync(file, "utf8").split("\n")) {
  if (line.startsWith("# ")) continue;
  if (line.startsWith("=== ")) scenes.push({ label: line, command: null, body: [] });
  else if (scenes.at(-1)?.command === null && line.startsWith("$ ")) scenes.at(-1).command = line.slice(2);
  else scenes.at(-1)?.body.push(line);
}
while (scenes.length && scenes.at(-1).body.at(-1) === "") scenes.at(-1).body.pop();

const wrap = (text) => {
  if (text.length <= WIDTH) return [text];
  const indent = (text.match(/^(\s*[-*] )/)?.[1] ?? "").replace(/./g, " ");
  const lines = [];
  let cur = "";
  for (const word of text.split(" ")) {
    if (cur && (cur + " " + word).length > WIDTH) { lines.push(cur); cur = indent + word; }
    else cur = cur ? cur + " " + word : word;
  }
  return [...lines, cur];
};
const style = (s) => s
  .replace(/\*\*(.+?)\*\*/g, "\x1b[1m$1\x1b[22m")
  .replace(/`([^`]+)`/g, "\x1b[36m$1\x1b[39m")
  .replace(/(^|\s)\*([^*]+)\*/g, "$1\x1b[3m$2\x1b[23m");

out("\x1b[2J\x1b[H");
await sleep(300);
for (const [i, scene] of scenes.entries()) {
  // Scenes 2 and 3 start on a cleared screen so each answer is seen from its first line.
  if (/^=== scene [23]\b/.test(scene.label)) { out("\x1b[2J\x1b[H"); await sleep(300); }
  out(PROMPT);
  for (const ch of scene.command) { out(ch); await sleep(scene.command.length > 60 ? 9 : 22); }
  out("\n");
  await sleep(scene.label.includes("shell") ? 150 : 600);
  for (const line of scene.body) {
    for (const w of wrap(line)) { out(style(w) + "\n"); await sleep(28); }
  }
  out("\n");
  const next = scenes[i + 1];
  await sleep(next ? (/^=== scene [23]\b/.test(next.label) ? 2600 : 900) : 4200);
}
// vhs stops recording at the end of the tape; keep the last frame instead of a shell prompt.
if (process.env.DEMO_HOLD) await sleep(Number(process.env.DEMO_HOLD));
