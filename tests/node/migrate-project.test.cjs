const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createWhyve, tree } = require('./helpers.cjs');
const CLI = path.resolve(__dirname, '../../plugins/whyve/dist/cli.js');
// Legacy Bobbin 2.x layout: the conversion input of `whyve migrate-project`.
const LEGACY_CONFIG = { schema: 'bobbin-project/v1', features: ['decision'], approval: { mode: 'adaptive' }, vault: '.' };
const BEGIN = '<!-- BEGIN context-core-policy (managed by context-core) -->', END = '<!-- END context-core-policy (managed by context-core) -->';

async function legacyProject({ git = false } = {}) {
    const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'whyve-migrate-')));
    // A Bobbin 2.x project holds a context-common/v2 vault; the settings rename never touches it.
    fs.cpSync(path.resolve(__dirname, '../fixtures/v2-vault/context'), path.join(project, 'context'), { recursive: true });
    fs.mkdirSync(path.join(project, '.bobbin'));
    fs.writeFileSync(path.join(project, '.bobbin/config.json'), JSON.stringify(LEGACY_CONFIG, null, 2) + '\n', { mode: 0o600 });
    fs.mkdirSync(path.join(project, '.bobbin-runtime'), { mode: 0o700 });
    fs.writeFileSync(path.join(project, 'AGENTS.md'), `# Project\n\nKeep this line.\n\n${BEGIN}\nBobbin is one plugin. Read \`.bobbin/config.json\`.\n${END}\n\nTail line.\n`);
    fs.writeFileSync(path.join(project, '.gitignore'), 'node_modules/\n.bobbin-runtime/\n/docs/bobbin-runtime-notes.md\n');
    if (git) {
        spawnSync('git', ['init', '-q'], { cwd: project });
        spawnSync('git', ['add', '.bobbin/config.json'], { cwd: project });
    }
    return project;
}
function cli(...args) {
    const r = spawnSync(process.execPath, [CLI, 'migrate-project', ...args], { encoding: 'utf8' });
    return { code: r.status, out: JSON.parse(r.stdout) };
}
function contextTree(project) { return tree(path.join(project, 'context')); }

test('a project with only the legacy folder is unconfigured: no fallback read', async () => {
    const project = await legacyProject();
    const settings = createWhyve({ project }).settings();
    assert.equal(settings.config, null);
    assert.equal(settings.mode, 'explicit');
});

test('dry-run lists every step and writes nothing', async () => {
    const project = await legacyProject();
    const before = tree(project);
    const { code, out } = cli(project, '--dry-run');
    assert.equal(code, 0);
    assert.equal(out.result.status, 'planned');
    assert.deepEqual(out.result.steps.map(s => `${s.action}:${s.path}`), ['backup:' + out.result.steps[0].path, 'rename:.whyve', 'rewrite:.whyve/config.json', 'remove:.bobbin-runtime', 'rewrite:AGENTS.md', 'rewrite:.gitignore']);
    assert.deepEqual(tree(project), before);
    assert.ok(fs.existsSync(path.join(project, '.bobbin-runtime')));
});

test('apply converts config, runtime, policy block and gitignore; rerun is a no-op; context is untouched', async () => {
    const project = await legacyProject({ git: true });
    const context = contextTree(project);
    const { code, out } = cli(project);
    assert.equal(code, 0);
    assert.equal(out.result.status, 'migrated');
    assert.equal(out.result.steps.some(s => s.action === 'backup'), false, 'git-tracked config needs no backup');
    assert.equal(fs.existsSync(path.join(project, '.bobbin')), false);
    assert.equal(fs.existsSync(path.join(project, '.bobbin-runtime')), false);
    const config = JSON.parse(fs.readFileSync(path.join(project, '.whyve/config.json'), 'utf8'));
    assert.deepEqual(config, { ...LEGACY_CONFIG, schema: 'whyve-project/v1' });
    assert.equal(fs.statSync(path.join(project, '.whyve/config.json')).mode & 0o777, 0o600);
    const agents = fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf8');
    assert.ok(agents.startsWith('# Project\n\nKeep this line.\n\n' + BEGIN));
    assert.ok(agents.endsWith(END + '\n\nTail line.\n'));
    assert.match(agents, /Whyve is one plugin/);
    assert.doesNotMatch(agents, /bobbin/i);
    assert.equal(fs.readFileSync(path.join(project, '.gitignore'), 'utf8'), 'node_modules/\n.whyve-runtime/\n/docs/bobbin-runtime-notes.md\n');
    assert.deepEqual(contextTree(project), context);
    const settings = createWhyve({ project }).settings();
    assert.equal(settings.mode, 'adaptive');
    assert.deepEqual(settings.config.features, ['decision']);
    const again = cli(project);
    assert.equal(again.code, 0);
    assert.equal(again.out.result.status, 'already_migrated');
    assert.deepEqual(again.out.result.steps, []);
});

test('an untracked legacy folder is backed up before the rename', async () => {
    const project = await legacyProject();
    const { out } = cli(project);
    const backup = out.result.steps.find(s => s.action === 'backup').path;
    assert.match(backup, /^\.bobbin\.bak-/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project, backup, 'config.json'), 'utf8')), LEGACY_CONFIG);
});

test('a pending journal, both folders, or a busy runtime are refused without writes', async () => {
    const journal = await legacyProject();
    fs.writeFileSync(path.join(journal, '.bobbin-runtime/transaction.json'), '{}');
    let before = tree(journal), r = cli(journal);
    assert.equal(r.code, 5);
    assert.equal(r.out.error.code, 'transaction_pending');
    assert.deepEqual(tree(journal), before);

    const both = await legacyProject();
    fs.mkdirSync(path.join(both, '.whyve'));
    r = cli(both);
    assert.equal(r.out.error.code, 'migration_conflict');

    const busy = await legacyProject();
    fs.mkdirSync(path.join(busy, '.bobbin-runtime/writer'));
    before = tree(busy);
    r = cli(busy);
    assert.equal(r.out.error.code, 'runtime_not_empty');
    assert.deepEqual(tree(busy), before);
    assert.ok(fs.existsSync(path.join(busy, '.bobbin')));
});
