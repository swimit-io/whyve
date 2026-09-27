# Renders the two-session demo from transcript.txt (see README.md here).
# Run from the repository root:  vhs assets/demo/two-sessions.tape
# Ink theme from the launch visual rules (terminal colours only, 6:1 or more on #151714).
Output assets/demo/two-sessions.gif
Output assets/demo/two-sessions.mp4

Require node

Set Shell bash
Set FontSize 18
Set Width 1280
Set Height 960
Set Padding 36
Set LineHeight 1.25
Set TypingSpeed 0ms
Set CursorBlink false
Set Theme { "name": "whyve-ink", "background": "#151714", "foreground": "#f3f1ea", "cursor": "#e0a54a", "selection": "#3a3e38", "black": "#151714", "brightBlack": "#9a9e95", "red": "#e5806f", "brightRed": "#f0a293", "green": "#8fb87f", "brightGreen": "#a9cc9b", "yellow": "#e0a54a", "brightYellow": "#ecc07a", "blue": "#8fb3dd", "brightBlue": "#b0c9e7", "magenta": "#c9a3c4", "brightMagenta": "#dcbfd8", "cyan": "#86bdb5", "brightCyan": "#a8d2cb", "white": "#c5c9c0", "brightWhite": "#f3f1ea" }

Hide
Type "DEMO_HOLD=30000 node assets/demo/replay.mjs assets/demo/transcript.txt"
Enter
Sleep 250ms
Show
Sleep 19s
