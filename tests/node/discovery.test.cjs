const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers.cjs');
const { USER } = h;

async function many(w, count) {
    const ids = [];
    for (let i = 0; i < count; i++)
        ids.push(await h.capture(w, 'observation', { title: `관찰 ${String(i).padStart(3, '0')}`, scope: i % 2 ? 'app/ui' : 'app', keywords: i % 3 ? ['a'] : ['a', 'b'], headers: { 'howse.thread': `thread/${i % 4}` } }));
    return ids;
}
test('list pages recover every row exactly once with coverage; empty and single results are explicit', async () => {
    const { w } = await h.fixture();
    const empty = await w.list({});
    assert.deepEqual([empty.items.length, empty.coverage.total, empty.coverage.complete, empty.nextCursor], [0, 0, true, null]);
    const ids = await many(w, 105);
    const seen = [];
    let cursor, pages = 0;
    do {
        const page = await w.list({ kinds: ['observation'], limit: 40, ...(cursor ? { cursor } : {}) });
        seen.push(...page.items.map(r => r.fields.id));
        assert.equal(page.coverage.total, 105);
        cursor = page.nextCursor;
        pages++;
    } while (cursor);
    assert.equal(pages, 3);
    assert.deepEqual([...seen].sort(), [...ids].sort());
    assert.equal(new Set(seen).size, 105);
    const one = await w.list({ ids: [ids[7]] });
    assert.deepEqual([one.items.length, one.coverage.total, one.coverage.requestedFilters], [1, 1, ['ids']]);
    // A write between pages makes the cursor stale instead of silently skipping rows.
    const first = await w.list({ kinds: ['observation'], limit: 10 });
    await h.capture(w, 'observation', { title: 'late' });
    await h.rejects(w.list({ kinds: ['observation'], limit: 10, cursor: first.nextCursor }), 'cursor_stale');
    await h.rejects(w.list({ kinds: ['decision'], cursor: first.nextCursor }), 'cursor_invalid');
});

test('exact filters: scope matches, keys, keywords, dates, text, state and disabled kinds', async () => {
    const { w, vault } = await h.fixture();
    const root = await h.capture(w, 'decision', { scope: 'app', key: 'k1', keywords: ['x', 'y'] });
    const child = await h.capture(w, 'decision', { scope: 'app/ui', key: 'k2', title: 'UI 결정', keywords: ['x'] });
    const other = await h.capture(w, 'decision', { scope: 'apple', key: 'k3', title: 'other' });
    const ids = async filters => (await w.list({ kinds: ['decision'], ...filters })).items.map(r => r.fields.id).sort();
    assert.deepEqual(await ids({ scope: { value: 'app' } }), [root]);
    assert.deepEqual(await ids({ scope: { value: 'app', match: 'descendant' } }), [root, child].sort());
    assert.deepEqual(await ids({ scope: { value: 'app/ui', match: 'ancestor' } }), [root, child].sort());
    assert.deepEqual(await ids({ scope: { value: 'app/ui/deep', match: 'overlap' } }), [root, child].sort());
    assert.deepEqual(await ids({ key: 'k3' }), [other]);
    assert.deepEqual(await ids({ keywords: { values: ['x', 'y'] } }), [root]);
    assert.deepEqual(await ids({ keywords: { values: ['x', 'y'], match: 'any' } }), [root, child].sort());
    assert.deepEqual(await ids({ textContains: 'UI 결' }), [child]);
    assert.deepEqual(await ids({ textContains: 'ui 결' }), [], 'textContains is exact, not case-folded');
    const read = await w.read(child);
    assert.deepEqual(await ids({ created: { from: read.createdAt, to: '2999-01-01' } }), [root, child, other].sort());
    assert.deepEqual(await ids({ created: { to: read.createdAt } }), [], 'to is exclusive');
    assert.deepEqual(await ids({ updated: { from: '2000-01-01' } }), [], 'never-updated rows have no updated time');
    const current = await w.read(root);
    await h.write(w, { action: 'retire', id: root, expectedDigest: current.contentDigest, reason: 'withdrawn', note: 'no longer needed' });
    assert.deepEqual(await ids({}), [child, other].sort());
    assert.deepEqual(await ids({ state: 'history' }), [root]);
    assert.equal((await w.list({ state: 'all', kinds: ['decision'] })).items.length, 3);
    // Recent order uses updated then created time.
    const recent = await w.list({ kinds: ['decision'], order: 'recent', state: 'all' });
    assert.equal(recent.items.length, 3);
    // Disabled kinds are excluded from default discovery but kept on disk and explicitly readable.
    const settings = h.createWhyve({ vault });
    await settings.initialize({ features: ['intent'] });
    const page = await settings.list({});
    assert.ok(page.coverage.unqueried.some(g => g.kind === 'decision' && g.reason === 'feature_disabled'));
    assert.equal((await settings.read(child)).id, child);
    assert.equal((await settings.list({ kinds: ['decision'] })).items.length, 2);
});

test('a damaged area index fails strictly and is reported as partial coverage when tolerated', async () => {
    const { w, vault } = await h.fixture();
    await h.capture(w, 'observation');
    await h.capture(w, 'decision');
    const index = path.join(vault, 'context/observation/observation.index.md');
    fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('; kind=observation', ''));
    await h.rejects(w.list({}), 'index_row_invalid');
    const tolerant = await w.list({ strictIndex: false });
    assert.equal(tolerant.coverage.indexStatus, 'partial');
    assert.equal(tolerant.coverage.total, null);
    assert.equal(tolerant.coverage.complete, false);
    assert.deepEqual(tolerant.items.map(r => r.fields.kind), ['decision']);
    const refresh = await w.refresh(true);
    assert.equal(refresh.index_fixed, true);
    assert.equal((await w.list({})).coverage.total, 2);
});

test('header search reads only header blocks, matches eq/contains/regex on lists, selects namespaces and pages by files', async () => {
    const { w, vault } = await h.fixture();
    const big = await h.capture(w, 'document', { body: { content: 'B'.repeat(200 * 1024) }, headers: { 'howse.thread': 'thread/big', 'howse.covers': ['msg/1', 'msg/2'] } });
    await many(w, 12);
    // Count bytes per opened file (fd numbers are reused) while only record files are observed.
    const opened = [], byFd = new Map(), originalOpen = fs.openSync, originalRead = fs.readSync;
    fs.openSync = function (file, ...rest) { const fd = originalOpen.call(fs, file, ...rest); const entry = { file: String(file), bytes: 0 }; byFd.set(fd, entry); opened.push(entry); return fd; };
    fs.readSync = function (fd, buffer, ...rest) { const n = originalRead.call(fs, fd, buffer, ...rest); if (byFd.has(fd)) byFd.get(fd).bytes += n; return n; };
    let result;
    try { result = await w.searchHeaders({ headers: { conditions: [{ key: 'howse.thread', op: 'eq', value: 'thread/big' }] }, select: ['howse.*'] }); }
    finally { fs.openSync = originalOpen; fs.readSync = originalRead; }
    const records = opened.filter(e => /context\/[a-z]+\/[^/]+\.md$/.test(e.file) && !e.file.endsWith('.index.md'));
    assert.equal(records.length, 13);
    assert.deepEqual(result.ids, [big]);
    assert.deepEqual(result.matches[0].headers, { 'howse.covers': ['msg/1', 'msg/2'], 'howse.thread': 'thread/big' });
    assert.ok(records.every(e => e.bytes <= 16385), 'no record read beyond the 16 KiB header budget');
    const listed = await w.list({ headers: { conditions: [{ key: 'howse.covers', op: 'eq', value: 'msg/2' }] } });
    assert.deepEqual(listed.items.map(r => r.fields.id), [big]);
    assert.deepEqual(listed.coverage.headerScan, { scanned: 13, errors: 0 });
    const regex = await w.searchHeaders({ kinds: ['observation'], headers: { conditions: [{ key: 'howse.thread', op: 'regex', value: '^thread/[13]$' }] }, limit: 5 });
    assert.equal(regex.scanned, 5);
    assert.equal(regex.unscanned, 7);
    assert.ok(regex.nextCursor);
    const rest = await w.searchHeaders({ kinds: ['observation'], headers: { conditions: [{ key: 'howse.thread', op: 'regex', value: '^thread/[13]$' }] }, limit: 5, cursor: regex.nextCursor });
    const final = await w.searchHeaders({ kinds: ['observation'], headers: { conditions: [{ key: 'howse.thread', op: 'regex', value: '^thread/[13]$' }] }, limit: 5, cursor: rest.nextCursor });
    assert.equal(regex.matchCount + rest.matchCount + final.matchCount, 6);
    assert.equal(final.complete, true);
    const contains = await w.searchHeaders({ headers: { conditions: [{ key: 'title', op: 'contains', value: '관찰 01' }] } });
    assert.equal(contains.ids.length, 2);
    await h.rejects(w.searchHeaders({ headers: { conditions: [{ key: 'howse.thread', op: 'regex', value: '(?=x)' }] } }), 'regex_invalid');
    // A header block larger than 16 KiB is reported without reading the body.
    const read = await w.read(big), file = path.join(vault, read.path);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('---\n\n## Content', `pad.x: "${'p'.repeat(16500)}"\n---\n\n## Content`));
    const bad = await w.searchHeaders({ kinds: ['document'], headers: { conditions: [{ key: 'howse.thread', op: 'eq', value: 'thread/big' }] } });
    assert.deepEqual(bad.errors.map(e => e.code), ['header_invalid']);
    // A scanned file changed between pages invalidates the cursor.
    const obs = (await w.list({ kinds: ['observation'] })).items[0];
    const paged = await w.searchHeaders({ kinds: ['observation'], headers: { conditions: [{ key: 'kind', op: 'eq', value: 'observation' }] }, limit: 3 });
    const target = path.join(vault, obs.fields.path), text = fs.readFileSync(target, 'utf8');
    fs.writeFileSync(target, text.replace('howse.thread', 'howse.thread').replace('---\n\n', 'extra.touch: "1"\n---\n\n'));
    await h.rejects(w.searchHeaders({ kinds: ['observation'], headers: { conditions: [{ key: 'kind', op: 'eq', value: 'observation' }] }, limit: 3, cursor: paged.nextCursor }), 'cursor_stale');
});

test('read delivers sections in UTF-8 safe chunks with a cursor and marks only single-page reads complete', async () => {
    const { w, vault } = await h.fixture();
    const text = '가나다'.repeat(20000);
    const id = await h.capture(w, 'snapshot', { body: { current_context: text, open_items: ['끝'] } });
    let page = await w.read(id, { maxBytes: 50000 }), assembled = '', pages = 0;
    const digest = page.contentDigest;
    for (;;) {
        pages++;
        assert.equal(page.complete, false);
        assembled += page.sections['Current context'] ?? '';
        if (!page.nextCursor) break;
        page = await w.read(id, { maxBytes: 50000, cursor: page.nextCursor });
        assert.equal(page.contentDigest, digest);
    }
    assert.equal(assembled, text);
    assert.equal(page.sections['Open items'], '- 끝');
    assert.ok(pages >= 4);
    assert.equal((await w.read(id, { maxBytes: 262144 })).complete, true);
    assert.deepEqual(Object.keys((await w.read(id, { sections: ['열린 항목'] })).sections), ['Open items']);
    await h.rejects(w.read(id, { sections: ['Nope'] }), 'section_invalid');
    const first = await w.read(id, { maxBytes: 50000 });
    const current = await w.read(id, { maxBytes: 262144 });
    await h.write(w, { action: 'update', id, expectedDigest: current.contentDigest, patch: { body: { next_steps: ['x'] } } });
    await h.rejects(w.read(id, { maxBytes: 50000, cursor: first.nextCursor }), 'cursor_stale');
});

test('compare covers every kind, pages bodies, keeps expansion non-occupying and requires complete mandatory bodies', async () => {
    const { w } = await h.fixture();
    for (const kind of h.KINDS) {
        const page = await w.compare({ record: h.record(kind) });
        assert.equal(page.schema, 'whyve-comparison/v3', kind);
        assert.equal(page.coverage.complete, true);
    }
    const intent = await h.capture(w, 'intent', { scope: 'app', key: 'shared' });
    const dec = await h.capture(w, 'decision', { scope: 'app', key: 'shared', title: 'large', body: { decision: 'D'.repeat(40000) } });
    const obs = await h.capture(w, 'observation', { scope: 'app/sub' });
    const candidate = h.record('decision', { scope: 'app/sub', key: 'shared', title: 'candidate' });
    const page = await w.compare({ record: candidate, expand: { sameScope: true, crossKindKey: true }, maxBytes: 32768 });
    const byId = Object.fromEntries(page.items.map(i => [i.row.fields.id, i]));
    assert.equal(byId[dec].mandatory, true);
    assert.equal(byId[dec].bodyComplete, false, 'a body larger than the page budget is continued with read');
    assert.equal(page.receipt.complete, false);
    const rest = page.nextCursor ? await w.compare({ record: candidate, expand: { sameScope: true, crossKindKey: true }, maxBytes: 32768, cursor: page.nextCursor }) : null;
    const expansion = [...page.items, ...(rest?.items ?? [])].filter(i => !i.mandatory);
    assert.deepEqual(expansion.map(i => i.row.fields.id).sort(), [intent, obs].sort());
    assert.ok(expansion.every(i => !i.occupiesSlot));
    const held = await w.prepare({ mutation: { action: 'capture', record: candidate }, authorization: USER, comparison: page.receipt, semanticReview: { judgments: [{ id: dec, judgment: 'separate', reason: 'r' }] } });
    assert.deepEqual([held.status, held.reason, held.remaining], ['needs_review', 'comparison_incomplete', [dec]]);
    // Completing the large body with read adds it to the receipt the caller keeps.
    let read = await w.read(dec, { maxBytes: 32768 }), cursor = read.nextCursor;
    while (cursor) { read = await w.read(dec, { maxBytes: 32768, cursor }); cursor = read.nextCursor; }
    const receipt = { ...page.receipt, reads: [...page.receipt.reads, { id: dec, path: read.path, sha256: read.contentDigest }] };
    assert.deepEqual(await w.validateReadReceipt(receipt), { valid: true, stale: [] });
    const done = await h.write(w, { action: 'capture', record: candidate }, { comparison: receipt, semanticReview: { judgments: [{ id: dec, judgment: 'separate', reason: 'Sub-scope choice.' }] } });
    assert.equal(done.status, 'applied');
    assert.equal((await w.validateReadReceipt(receipt)).valid, false, 'the slot area changed after the write');
});
