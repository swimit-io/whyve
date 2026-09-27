const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const version = require('../plugins/whyve/.codex-plugin/plugin.json').version;
for (const relative of ['package.json', 'package-lock.json', 'src/release.json']) {
    const surface = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
    assert.equal(surface.version, version, `${relative}: run python3 scripts/sync_distribution.py after changing the manifest version.`);
}
const dist = path.join(root, 'plugins/whyve/dist');
fs.rmSync(dist, { recursive: true, force: true });
const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', path.join(root, 'tsconfig.json')], { cwd: root, stdio: 'inherit' });
if (result.status !== 0)
    process.exit(result.status || 1);
fs.chmodSync(path.join(dist, 'cli.js'), 0o755);
