const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const h = require('./helpers.cjs');
const CLI = path.resolve(__dirname, '../../plugins/whyve/dist/cli.js');
function cli(...args) {
    const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
    return { status: r.status, ...JSON.parse(r.stdout) };
}
function planDir() { return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'whyve-plan-'))); }

test('a v2 vault is readable through list, read, searchHeaders and compare but never written', async () => {
    const { vault, ids } = h.v2Copy();
    const w = h.createWhyve({ vault }), before = h.tree(vault);
    const status = await w.status();
    assert.deepEqual([status.format, status.writable], ['context-common/v2', false]);
    const page = await w.list({ state: 'all' });
    assert.equal(page.coverage.total, 10);
    const dec = await w.read(ids.dec2);
    assert.equal(dec.format, 'context-common/v2');
    assert.equal(dec.key, 'storage');
    assert.equal(dec.authorizationSource, 'legacy');
    assert.ok(dec.qualityFlags.some(f => f.code === 'authorization_unverified'));
    const old = await w.read(ids.dec);
    assert.deepEqual([old.state, old.lifecycle.successor], ['history', ids.dec2]);
    const snap = await w.read(ids.snap);
    assert.equal(snap.headers['howse.thread'], 'thread/abc');
    assert.equal(snap.sections['Current context'], '본문 안의 H2:\n\n## 내부 제목\n\n끝.');
    assert.equal(snap.scope, 'global');
    const found = await w.searchHeaders({ headers: { conditions: [{ key: 'howse.thread', op: 'eq', value: 'thread/abc' }] } });
    assert.deepEqual(found.ids.sort(), [ids.intent, ids.snap].sort());
    assert.equal((await w.compare({ record: h.record('decision', { key: 'storage' }) })).items[0].row.fields.id, ids.dec2);
    await h.rejects(w.prepare({ mutation: { action: 'capture', record: h.record('observation') }, authorization: h.USER }), 'migration_required');
    // A v2 preview object is not a v3 handle and is never applied.
    await h.rejects(w.apply({ schema: 'whyve-preview/v1', approval_digest: 'x' }), 'handle_invalid');
    assert.deepEqual(h.tree(vault), before);
});

test('explicit migration: dry-run freezes a plan, apply preserves meaning and bytes, reruns are no-ops and rollback restores originals', async () => {
    const { vault, ids } = h.v2Copy(), plans = planDir(), original = h.tree(vault);
    const dry = cli('migrate-project', vault, '--to-format', 'context-common/v3', '--plan-dir', plans, '--dry-run');
    assert.equal(dry.status, 0, JSON.stringify(dry));
    assert.equal(dry.result.status, 'planned');
    assert.deepEqual(dry.result.blockers, []);
    assert.deepEqual(dry.result.summary.by_kind, { archive: 1, assumption: 1, decision: 2, document: 1, intent: 1, observation: 2, snapshot: 1, term: 1 });
    assert.deepEqual(h.tree(vault), original, 'dry-run writes nothing in the vault');
    const plan = JSON.parse(fs.readFileSync(dry.result.plan_file, 'utf8'));
    const archiveBefore = fs.readFileSync(path.join(vault, plan.records.find(r => r.kind === 'archive').from), 'utf8');
    const applied = cli('migrate-project', vault, '--to-format', 'context-common/v3', '--plan-dir', plans, '--apply-plan', dry.result.plan_file);
    assert.equal(applied.result.status, 'migrated', JSON.stringify(applied));
    assert.equal(applied.result.verification.records, 10);
    const w = h.createWhyve({ vault });
    assert.deepEqual([(await w.status()).format, (await w.status()).writable], ['context-common/v3', true]);
    assert.equal((await w.refresh()).ok, true);
    // IDs, lifecycle, sections, relations and Howse metadata survive.
    const dec = await w.read(ids.dec2), old = await w.read(ids.dec), snap = await w.read(ids.snap), intent = await w.read(ids.intent);
    assert.equal(old.lifecycle.successor, ids.dec2);
    assert.deepEqual(dec.sources.filter(s => s.relation === 'supersedes'), [{ relation: 'supersedes', ref: ids.dec }]);
    assert.match(dec.path, /^context\/decision\/\d{4}-\d\d-\d\d-파일-저장소를-계속-쓴다\.md$/);
    assert.match(old.path, /^context\/decision\/retired\/\d{4}-\d\d-\d\d-파일-저장소를-쓴다-—-로컬-기본\.md$/);
    assert.equal(snap.sections['Current context'], '본문 안의 H2:\n\n## 내부 제목\n\n끝.');
    assert.equal(snap.sections.References, '- ctx_00000000000040008000000000000000\n- reports/a.md');
    assert.deepEqual([snap.headers['howse.revision'], snap.headers['howse.covers'], snap.headers['howse.topic']], ['3', 'msg/zz', 'topic/7']);
    assert.deepEqual([intent.headers['howse.author'], intent.headers['howse.task']], ['agent/builder', 'task/9']);
    assert.deepEqual(intent.sources, [{ relation: 'source', ref: 'msg/aaaa' }]);
    const decOld = await w.read(ids.dec);
    assert.deepEqual(decOld.sources.find(s => s.relation === 'serves:intent'), { relation: 'serves:intent', ref: ids.intent });
    assert.deepEqual(decOld.keywords, ['파일', 'file;store']);
    assert.equal(decOld.sections['Revisit conditions'], '- 네트워크가 필수가 되면');
    const archive = await w.read(ids.arch);
    assert.equal(archive.sections.Content, h.bodies.archive.content);
    assert.equal(archive.headers.content_digest, 'sha256:' + require('node:crypto').createHash('sha256').update(archive.sections.Content).digest('hex'));
    assert.ok(archiveBefore.includes(archive.sections.Content));
    const obs2 = await w.read(ids.obs2);
    assert.deepEqual([obs2.state, obs2.lifecycle.reason, obs2.sources.find(s => s.relation === 'retirement-note').ref], ['history', 'invalidated', '재현되지 않음']);
    // New writes work after migration.
    await h.capture(w, 'observation', { title: 'after migration' });
    // Re-applying the same plan once the vault moved on is refused rather than rewriting.
    const again = cli('migrate-project', vault, '--to-format', 'context-common/v3', '--plan-dir', plans, '--apply-plan', dry.result.plan_file);
    assert.equal(again.ok, false);
    const rollback = cli('migrate-project', vault, '--to-format', 'context-common/v3', '--plan-dir', plans, '--rollback-plan', dry.result.plan_file);
    assert.equal(rollback.error.code, 'rollback_refused', 'a write after migration blocks a backup restore');
});

test('rerunning an applied plan is a no-op and rollback of an untouched migration restores every original byte', () => {
    const { vault } = h.v2Copy(), plans = planDir(), original = h.tree(vault);
    const dry = cli('migrate-project', vault, '--to-format', 'context-common/v3', '--plan-dir', plans, '--dry-run');
    assert.equal(cli('migrate-project', vault, '--to-format', 'context-common/v3', '--plan-dir', plans, '--apply-plan', dry.result.plan_file).result.status, 'migrated');
    const migrated = h.tree(vault);
    const rerun = cli('migrate-project', vault, '--to-format', 'context-common/v3', '--plan-dir', plans, '--apply-plan', dry.result.plan_file);
    assert.equal(rerun.result.status, 'already_applied');
    assert.deepEqual(h.tree(vault), migrated);
    assert.equal(cli('migrate-project', vault, '--to-format', 'context-common/v3', '--plan-dir', plans, '--dry-run').result.status, 'already_v3');
    const rollback = cli('migrate-project', vault, '--to-format', 'context-common/v3', '--plan-dir', plans, '--rollback-plan', dry.result.plan_file);
    assert.equal(rollback.result.status, 'rolled_back');
    assert.deepEqual(h.tree(vault), original);
});

test('a plan is refused when the vault changed, when it was edited, or when the plan directory is inside the vault', async () => {
    const { vault } = h.v2Copy(), plans = planDir();
    const dry = cli('migrate-project', vault, '--to-format', 'context-common/v3', '--plan-dir', plans, '--dry-run');
    const planFile = dry.result.plan_file, text = fs.readFileSync(planFile, 'utf8');
    fs.writeFileSync(planFile, text.replace('"runtime":"0.3.0"', '"runtime":"9.9.9"'));
    assert.equal(cli('migrate-project', vault, '--to-format', 'context-common/v3', '--plan-dir', plans, '--apply-plan', planFile).error.code, 'plan_invalid');
    fs.writeFileSync(planFile, text);
    const snap = fs.readdirSync(path.join(vault, 'context/snapshot')).find(n => !n.endsWith('.index.md'));
    fs.appendFileSync(path.join(vault, 'context/snapshot', snap), '\n');
    assert.equal(cli('migrate-project', vault, '--to-format', 'context-common/v3', '--plan-dir', plans, '--apply-plan', planFile).error.code, 'stale_input');
    assert.equal(cli('migrate-project', vault, '--to-format', 'context-common/v3', '--plan-dir', path.join(vault, 'context/plans'), '--dry-run').error.code, 'plan_dir_invalid');
});

test('an unrepresentable v2 value blocks the plan instead of being guessed', () => {
    const { vault } = h.v2Copy(), plans = planDir();
    // A v2 source ref longer than a v3 Sources line cannot be carried over without guessing.
    const directory = path.join(vault, 'context/intent'), file = path.join(directory, fs.readdirSync(directory).find(n => n.endsWith('.md') && !n.endsWith('.index.md')));
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"msg/aaaa"', '"msg/aaaa\\n"'));
    const dry = cli('migrate-project', vault, '--to-format', 'context-common/v3', '--plan-dir', plans, '--dry-run');
    assert.equal(dry.status, 5);
    assert.equal(dry.result.status, 'blocked');
    assert.ok(dry.result.blockers.length >= 1);
    assert.equal(cli('migrate-project', vault, '--to-format', 'context-common/v3', '--plan-dir', plans, '--apply-plan', dry.result.plan_file).error.code, 'migration_blocked');
});
