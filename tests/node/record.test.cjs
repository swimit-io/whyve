const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const h = require('./helpers.cjs');
const { parseRecordText, renderRecord, parseRow, renderRow, compileRegex, MODEL, KINDS } = h;
const record = require('../../plugins/whyve/dist/record');

test('the generated model matches docs/record-model.md and covers eight kinds', () => {
    const r = spawnSync(process.execPath, [path.resolve(__dirname, '../../scripts/generate-model.cjs'), '--check'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual([...KINDS].sort(), ['archive', 'assumption', 'decision', 'document', 'intent', 'observation', 'snapshot', 'term']);
    assert.equal(MODEL.protocol, 'context-common/v3');
    for (const kind of KINDS) assert.ok(MODEL.kinds[kind].sections[0].required, `${kind} primary section is required`);
});

test('all eight kinds store their minimal hard input and read back completely; missing soft fields become flags', async () => {
    const { w } = await h.fixture();
    const minimal = { snapshot: { current_context: 'x' }, observation: { observation: 'x' }, decision: { decision: 'x' }, intent: { intent: 'x' }, document: { content: 'x' }, assumption: { assumption: 'x' }, term: { term: 'Tx', definition: 'x' }, archive: { content: 'x' } };
    const expected = { observation: ['evidence_missing'], decision: ['alternatives_missing', 'evidence_missing', 'rationale_missing'], intent: ['success_criteria_missing'], assumption: ['evidence_missing'], term: ['project_signal_missing'], archive: ['source_missing'] };
    for (const kind of KINDS) {
        const id = await h.capture(w, kind, { title: `${kind} minimal`, body: minimal[kind], sources: [] });
        const read = await w.read(id);
        assert.equal(read.complete, true);
        assert.equal(read.kind, kind);
        assert.equal(read.sections[MODEL.kinds[kind].sections[0].name], 'x');
        assert.deepEqual(read.qualityFlags.map(f => f.code).sort(), [...(expected[kind] ?? []), 'summary_derived'].sort(), kind);
        assert.equal(read.summary, 'x');
    }
});

test('Unicode, quotes, backslashes, separators and list items round-trip through record and index row', async () => {
    const { w, vault } = await h.fixture();
    const title = '한글 "따옴표" \\역슬래시 [괄호] · 세미; 등=, 끝(%)';
    const id = await h.capture(w, 'decision', { title, summary: '요약 · 가운뎃점 \\ 백슬래시', keywords: ['a,b', 'c;d', 'e=f', 'g·h', '역\\슬'], body: { decision: 'CRLF\r\n줄바꿈\r\n유지', rejected_alternatives: ['첫째\n  둘째 줄', '— 대시'] }, sources: [{ relation: 'source', ref: 'ref — with — dashes \\ and slash', note: '메모 — 포함 \\' }] });
    const read = await w.read(id);
    assert.equal(read.title, title);
    assert.equal(read.sections.Decision, 'CRLF\n줄바꿈\n유지');
    assert.equal(read.sections['Rejected alternatives'], '- 첫째\n    둘째 줄\n- — 대시');
    assert.deepEqual(read.sources.find(s => s.relation === 'source'), { relation: 'source', ref: 'ref — with — dashes \\ and slash', note: '메모 — 포함 \\' });
    const page = await w.list({ kinds: ['decision'] }), row = page.items[0];
    assert.equal(row.fields.title, title);
    assert.deepEqual(row.fields.keywords, ['a,b', 'c;d', 'e=f', 'g·h', '역\\슬']);
    const index = fs.readFileSync(path.join(vault, 'context/decision/decision.index.md'), 'utf8');
    assert.ok(index.split('\n').includes(row.rawLine), 'rawLine is the stored index line');
    const reparsed = parseRow(row.rawLine);
    assert.equal(reparsed.fields.summary, '요약 · 가운뎃점 \\ 백슬래시');
    assert.equal(reparsed.fields.relativePath, path.basename(read.path));
    assert.ok(read.path.includes('(-)'), 'percent is not kept in file names');
    assert.ok(row.rawLine.includes('%28-%29'), 'path parentheses are percent-encoded');
});

test('invalid index rows and escaping paths are explicit errors', () => {
    const good = renderRow({ id: 'ctx_0123456789ab4def8123456789abcdef', relativePath: 'a.md', kind: 'decision', state: 'current', title: 't', summary: 's', scope: 'x', key: 'k', createdAt: '2026-01-01T00:00:00+00:00', updatedAt: '', keywords: [] });
    assert.equal(parseRow(good).fields.title, 't');
    for (const line of [good.replace('(a.md)', '(../a.md)'), good.replace('(a.md)', '(retired/a.md)'), good.replace('; kind=decision', ''), good.replace(' · s · ', ' · s '), good + '\\', good.replace('[t]', '[t[x]')])
        assert.throws(() => parseRow(line), e => e.code === 'index_row_invalid', line);
});

test('H2 lines, fences and whitespace inside sections are framed and round-trip exactly', async () => {
    const { w } = await h.fixture();
    const text = '  앞 공백\n\n## 내부 제목\n\n```md\n## 코드 안\n```\n\n## Sources\n\n- fake: source\n';
    const id = await h.capture(w, 'document', { body: { content: text } });
    const read = await w.read(id, { raw: true });
    assert.equal(read.sections.Content, text);
    assert.match(read.raw, /section_delimiter: "whyve-section-1"/);
    assert.deepEqual(read.sources.map(s => s.relation), ['authorization']);
    const plain = await h.capture(w, 'decision', { title: 'plain', key: 'plain', body: { decision: '```\n## fenced\n```' } });
    assert.doesNotMatch((await w.read(plain, { raw: true })).raw, /section_delimiter/);
});

test('hand-written unregistered sections and unknown host headers survive a rewrite', async () => {
    const { w, vault } = await h.fixture();
    const id = await h.capture(w, 'observation');
    const before = await w.read(id), file = path.join(vault, before.path);
    const edited = fs.readFileSync(file, 'utf8').replace('---\n\n## Observation', 'other.note: "보존"\n---\n\n## Observation').replace('## Sources', '## 사람이 쓴 절\n\n그대로 둔다.\n\n## Sources');
    fs.writeFileSync(file, edited);
    const after = await w.read(id);
    await h.write(w, { action: 'update', id, expectedDigest: after.contentDigest, patch: { keywords: ['보충'] } });
    const final = await w.read(id);
    assert.equal(final.headers['other.note'], '보존');
    assert.equal(final.sections['사람이 쓴 절'], '그대로 둔다.');
    assert.deepEqual(final.keywords, ['보충']);
});

test('header grammar and limits are enforced; unknown reserved keys are rejected', () => {
    const base = { title: 't', summary: 's', kind: 'observation', scope: 'x', created_at: '2026-01-01T00:00:00+00:00', id: 'ctx_0123456789ab4def8123456789abcdef', schema: 'context-observation/v2', state: 'current', authorization_source: 'user' };
    const text = headers => ['---', ...Object.entries(headers).map(([k, v]) => `${k}: ${JSON.stringify(v)}`), '---', '', '## Observation', '', 'x', ''].join('\n');
    assert.equal(parseRecordText(text(base)).headers.kind, 'observation');
    assert.throws(() => parseRecordText(text({ ...base, captured_from: 'x' })), e => e.code === 'header_unknown');
    assert.throws(() => parseRecordText(text({ ...base, 'whyve.x': 'y' })), e => e.code === 'custom_header_invalid');
    assert.throws(() => parseRecordText(text({ ...base, 'ns.big': 'x'.repeat(513) })), e => e.code === 'custom_header_invalid');
    assert.throws(() => parseRecordText(text({ ...base, 'ns.list': Array(17).fill('a') })), e => e.code === 'custom_header_invalid');
    assert.throws(() => parseRecordText(text({ ...base, key: 'k' })), e => e.code === 'lifecycle_invalid');
    assert.throws(() => parseRecordText(text({ ...base, scope: 'Not Canonical' })), e => e.code === 'slot_invalid');
    const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`ns.k${i}`, 'v']));
    assert.throws(() => parseRecordText(text({ ...base, ...many })), e => e.code === 'custom_header_invalid');
    const huge = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`ns.k${i}`, 'v'.repeat(500)]));
    assert.throws(() => parseRecordText(text({ ...base, ...huge })), e => ['custom_header_invalid', 'header_too_large'].includes(e.code));
    assert.throws(() => parseRecordText(text(base).replace('\n', '\r\n')), e => e.code === 'header_invalid');
});

test('filenames are dated or plain slugs, bounded in bytes, and collisions get suffixes after case/NFKC folding', async () => {
    assert.equal(record.baseFilename('decision', '결정: A/B "테스트"', '2026-09-26T01:02:03+00:00'), '2026-09-26-결정-A-B-테스트');
    assert.equal(record.baseFilename('term', 'Vault', '2026-09-26T01:02:03+00:00'), 'Vault');
    assert.equal(record.baseFilename('document', 'con', '2026-09-26T01:02:03+00:00'), 'con-record');
    assert.ok(Buffer.byteLength(record.baseFilename('decision', '가'.repeat(200), '2026-09-26T01:02:03+00:00') + '-999.md') <= 180);
    const { w, vault } = await h.fixture();
    await h.capture(w, 'observation', { title: 'Same Title' });
    await h.capture(w, 'observation', { title: 'same title' });
    await h.capture(w, 'observation', { title: 'ｓａｍｅ title' });
    const names = fs.readdirSync(path.join(vault, 'context/observation')).filter(n => !n.endsWith('.index.md')).sort();
    assert.equal(names.length, 3);
    assert.ok(names.some(n => n.endsWith('-2.md')) && names.some(n => n.endsWith('-3.md')), names.join());
});

test('the header regex is linear, supports the documented subset and rejects backtracking-only features', () => {
    assert.equal(compileRegex('^thread/[0-9a-f]+$').test('thread/0ba5'), true);
    assert.equal(compileRegex('agent/(builder|architect)').test('by agent/architect'), true);
    assert.equal(compileRegex('ABC', 'i').test('xabcx'), true);
    assert.equal(compileRegex('a{2,3}b').test('aab'), true);
    assert.equal(compileRegex('a{2,3}b').test('ab'), false);
    assert.equal(compileRegex('\\d+\\.\\d').test('v3.0'), true);
    assert.equal(compileRegex('[^a-c]x').test('dx'), true);
    assert.equal(compileRegex('[^a-c]x').test('ax'), false);
    assert.equal(compileRegex('^(?:x|y)*$').test('xyxy'), true);
    const started = Date.now();
    assert.equal(compileRegex('(a+)+$').test('a'.repeat(5000) + 'b'), false);
    assert.equal(compileRegex('(a|aa)*c').test('a'.repeat(3000)), false);
    assert.ok(Date.now() - started < 2000, 'no exponential backtracking');
    for (const bad of ['(?=a)', '(?!a)', '(?<=a)', '(?<n>a)', '(a)\\1', 'a{101}', 'x'.repeat(257), '[a', '(a', 'a)', '*a'])
        assert.throws(() => compileRegex(bad), e => e.code === 'regex_invalid', bad);
    assert.throws(() => compileRegex('a', 'g'), e => e.code === 'regex_invalid');
});

test('the CLI prints one JSON envelope for success and failure', () => {
    const cli = path.resolve(__dirname, '../../plugins/whyve/dist/cli.js');
    const ok = spawnSync(process.execPath, [cli, 'schema', 'decision'], { encoding: 'utf8' });
    assert.equal(ok.status, 0);
    assert.equal(JSON.parse(ok.stdout).result.schema, 'context-decision/v2');
    const bad = spawnSync(process.execPath, [cli, 'nope'], { encoding: 'utf8' });
    assert.equal(bad.status, 2);
    assert.equal(JSON.parse(bad.stdout).error.code, 'usage_invalid');
});
