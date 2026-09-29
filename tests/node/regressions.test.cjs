const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const h = require('./helpers.cjs');
const { USER } = h;
const { Filesystem } = require('../../plugins/whyve/dist/filesystem.js');

test('migration keeps a record whose new name only differs by case or normalization from its old one', async () => {
    const { vault } = h.v2Copy();
    fs.renameSync(path.join(vault, 'context/document/document-기록.md'), path.join(vault, 'context/document/Document-기록.md'));
    const planDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whyve-plan-'));
    const dry = await h.migrateFormat(vault, { vault, planDir, dryRun: true });
    const plan = JSON.parse(fs.readFileSync(dry.plan_file, 'utf8'));
    assert.deepEqual(plan.records.filter(r => r.kind === 'document').map(r => [r.from, r.to]), [['context/document/Document-기록.md', 'context/document/Document-기록.md']]);
    assert.equal((await h.migrateFormat(vault, { vault, planDir, applyPlan: dry.plan_file })).status, 'migrated');
    assert.equal((await h.createWhyve({ vault }).list({ kinds: ['document'] })).items.length, 1);
});

test('a transaction larger than recovery can read is refused before any journal or file is written', async () => {
    const vault = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'whyve-journal-')));
    fs.mkdirSync(path.join(vault, 'context'));
    const storage = new Filesystem(vault);
    await h.rejects(storage.locked(() => storage.transaction(Array.from({ length: 9000 }, (_, i) => ({ path: `context/f${i}.md`, content: Buffer.from('x'), expected: null })))), 'transaction_too_large');
    assert.deepEqual(fs.readdirSync(path.join(vault, 'context')), []);
    assert.equal(await storage.locked(() => 'usable'), 'usable');
});

test('only the user completes a preview that waits for approval', async () => {
    const { w } = await h.fixture({ approvalMode: 'adaptive' });
    const asked = await w.prepare({ mutation: { action: 'capture', record: h.record('observation') }, authorization: { source: 'policy', decision: 'ask', reason: 'unclear' } });
    await h.rejects(w.prepare({ preparedHandle: asked.handle, authorization: { source: 'policy', decision: 'record', reason: 'self approval' } }), 'approval_required');
    assert.equal((await w.prepare({ preparedHandle: asked.handle, authorization: USER })).status, 'prepared');
});

test('supplements keep kind headers and approvals; SNAP full updates keep hand-written sections and refresh derived summaries', async () => {
    const { w, vault } = await h.fixture({ approvalMode: 'auto' });
    const term = await h.capture(w, 'term');
    let t = await w.read(term);
    await h.rejects(w.prepare({ mutation: { action: 'update', id: term, expectedDigest: t.contentDigest, patch: { body: { aliases: ['Totally different'] } } }, authorization: USER }), 'immutable_field');
    await h.write(w, { action: 'update', id: term, expectedDigest: t.contentDigest, patch: { body: { aliases: ['기록 저장소', 'Store'] } } });
    t = await w.read(term);
    assert.deepEqual(t.headers.aliases, ['기록 저장소', 'Store']);
    const dec = await h.capture(w, 'decision', { body: { decision: '파일 저장소를 사용한다.' } });
    const d = await w.read(dec);
    const policy = { source: 'policy', decision: 'record', reason: 'auto' };
    const p = await w.prepare({ mutation: { action: 'update', id: dec, expectedDigest: d.contentDigest, patch: { body: { rationale: '오프라인.' } } }, authorization: policy });
    await w.apply(p.handle);
    const after = await w.read(dec);
    assert.equal(after.authorizationSource, 'user');
    assert.deepEqual(after.sources.filter(s => s.relation === 'authorization').map(s => s.ref), ['msg/test', 'policy']);
    const snap = await h.capture(w, 'snapshot', { body: { current_context: 'Old policy: we use Postgres.' } });
    const file = path.join(vault, (await w.read(snap)).path);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('## Sources', '## Hand notes\n\n보존한다.\n\n## Sources'));
    const s = await w.read(snap);
    await h.write(w, { action: 'update', id: snap, expectedDigest: s.contentDigest, patch: { replaceBody: true, body: { current_context: 'New policy: we use SQLite.' } } });
    const updated = await w.read(snap);
    assert.deepEqual(Object.keys(updated.sections), ['Current context', 'Hand notes']);
    assert.equal(updated.summary, 'New policy: we use SQLite.');
});

test('rename in place, history immutability, sources re-add and emoji policy reasons', async () => {
    const { w } = await h.fixture({ approvalMode: 'auto' });
    const id = await h.capture(w, 'observation', { title: 'Use X.' });
    let r = await w.read(id);
    await h.write(w, { action: 'rename', id, expectedDigest: r.contentDigest, title: 'Use X' });
    r = await w.read(id);
    assert.equal(r.title, 'Use X');
    await h.write(w, { action: 'update', id, expectedDigest: r.contentDigest, patch: { sources: { add: [{ relation: 'see', ref: 'x' }] } } });
    r = await w.read(id);
    await h.write(w, { action: 'update', id, expectedDigest: r.contentDigest, patch: { sources: { remove: [{ relation: 'see', ref: 'x' }], add: [{ relation: 'see', ref: 'x' }] } } });
    r = await w.read(id);
    assert.ok(r.sources.some(s => s.relation === 'see' && s.ref === 'x'));
    await h.write(w, { action: 'retire', id, expectedDigest: r.contentDigest, reason: 'invalidated', note: 'gone' });
    const history = await w.read(id);
    await h.rejects(w.prepare({ mutation: { action: 'rename', id, expectedDigest: history.contentDigest, title: 'changed' }, authorization: USER }), 'lifecycle_invalid');
    const reason = 'a'.repeat(499) + '😀';
    assert.equal((await w.prepare({ mutation: { action: 'capture', record: h.record('snapshot', { summary: undefined }) }, authorization: { source: 'policy', decision: 'record', reason } })).status, 'prepared');
});

test('bodies near the 256 KiB limit are compared whole; v2 long notes and odd links do not block reads or plans', async () => {
    const { w } = await h.fixture();
    const big = 'line "quoted"\n'.repeat(17000);
    const id = await h.capture(w, 'document', { body: { content: big } });
    const r = await w.read(id, { maxBytes: 262144 });
    const successor = h.record('document', { scope: 'consumer/sub', body: { content: big } });
    const cmp = await w.compare({ record: successor, targetId: id, maxBytes: 262144 });
    assert.equal(cmp.items[0].bodyComplete, true);
    const prepared = await w.prepare({ mutation: { action: 'supersede', id, expectedDigest: r.contentDigest, reason: 'move', successor }, authorization: USER, comparison: cmp.receipt, semanticReview: { judgments: [{ id, judgment: 'replace', reason: 'moved' }] } });
    assert.equal(prepared.status, 'prepared');
    const { vault } = h.v2Copy();
    const legacyId = 'ctx_aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa';
    fs.mkdirSync(path.join(vault, 'context/assumption/retired'), { recursive: true });
    fs.writeFileSync(path.join(vault, 'context/assumption/retired/refuted.md'), `---\nschema: "context-assumption/v1"\nid: "${legacyId}"\ntitle: "refuted assumption"\nsummary: "long refutation"\ncreated_at: "2026-09-26T11:00:04+00:00"\ncaptured_from: "manual"\nsource_refs: ["test:source"]\nscope: "consumer"\nretired_at: "2026-09-26T12:00:00+00:00"\nretired_reason: "refuted"\nevidence_refs: ["bench/run-1"]\nimpacted_decisions: []\nrefutation_reason: "${'r'.repeat(600)}"\n---\n\n## Assumption\n\nx\n\n## Basis\n\n- y [link](90%)\n`);
    const legacy = await h.createWhyve({ vault }).read(legacyId);
    assert.equal(legacy.sections['Refutation reason'], 'r'.repeat(600));
    const dry = await h.migrateFormat(vault, { vault, planDir: fs.mkdtempSync(path.join(os.tmpdir(), 'whyve-plan-')), dryRun: true });
    assert.equal(dry.status, 'planned', JSON.stringify(dry.blockers));
});

test('lock directories need POSIX owner-only modes except on Windows, where Node reports no owner bits', () => {
    // Windows stat reports every writable directory as 0o777, so a shared-looking lock root must not block writes there.
    const run = platform => {
        const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'whyve-lockroot-')));
        const lockRoot = path.join(tmp, 'context-core-locks');
        fs.mkdirSync(lockRoot);
        fs.chmodSync(lockRoot, 0o777);
        const script = `Object.defineProperty(process, 'platform', { value: ${JSON.stringify(platform)} });
const h = require(${JSON.stringify(path.join(__dirname, 'helpers.cjs'))});
h.fixture().then(({ w }) => h.capture(w, 'observation')).then(() => console.log('ok'), e => console.log(e.code));`;
        return require('node:child_process').execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp }, encoding: 'utf8' }).trim();
    };
    assert.equal(run('win32'), 'ok');
    assert.equal(run(process.platform), 'lock_unsafe');
});
