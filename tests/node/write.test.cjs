const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers.cjs');
const { USER } = h;

test('hard boundaries reject missing authorization, empty primary meaning, bad slots, lifecycle and paths; soft flags never bypass them', async () => {
    const { w, vault } = await h.fixture();
    const before = h.tree(vault);
    await h.rejects(w.prepare({ mutation: { action: 'capture', record: h.record('decision') } }), 'approval_required');
    await h.rejects(w.prepare({ mutation: { action: 'capture', record: h.record('decision', { body: { decision: '  ' } }) }, authorization: USER }), 'section_schema_error');
    await h.rejects(w.prepare({ mutation: { action: 'capture', record: h.record('decision', { key: undefined }) }, authorization: USER }), 'key_invalid');
    await h.rejects(w.prepare({ mutation: { action: 'capture', record: h.record('observation', { key: 'x' }) }, authorization: USER }), 'key_invalid');
    await h.rejects(w.prepare({ mutation: { action: 'capture', record: h.record('decision', { scope: '../../etc' }) }, authorization: USER }), 'scope_invalid');
    await h.rejects(w.prepare({ mutation: { action: 'capture', record: h.record('decision', { sources: [{ relation: 'supersedes', ref: 'ctx_0123456789ab4def8123456789abcdef' }] }) }, authorization: USER }), 'sources_invalid');
    await h.rejects(w.prepare({ mutation: { action: 'capture', record: h.record('decision', { sources: [{ relation: 'serves:intent', ref: 'ctx_0123456789ab4def8123456789abcdef' }] }) }, authorization: USER }), 'not_found');
    await h.rejects(w.prepare({ mutation: { action: 'capture', record: h.record('decision', { body: { decision: 'x', unknown: 'y' } }) }, authorization: USER }), 'schema_invalid');
    await h.rejects(w.prepare({ mutation: { action: 'capture', record: h.record('decision', { headers: { 'whyve.x': 'y' } }) }, authorization: USER }), 'custom_header_invalid');
    const id = await h.capture(w, 'decision');
    await h.rejects(w.prepare({ mutation: { action: 'capture', id, record: h.record('observation') }, authorization: USER }), 'duplicate_id');
    // An exact-slot occupant is a mandatory comparison; judging it separate cannot make a duplicate slot legal.
    const duplicate = h.record('decision', { title: 'same slot' });
    assert.equal((await w.prepare({ mutation: { action: 'capture', record: duplicate }, authorization: USER })).reason, 'comparison_required');
    const cmp = await w.compare({ record: duplicate });
    assert.deepEqual(cmp.items.map(i => i.reasons), [['exact_slot']]);
    await h.rejects(w.prepare({ mutation: { action: 'capture', record: duplicate }, authorization: USER, comparison: cmp.receipt, semanticReview: { judgments: [{ id, judgment: 'separate', reason: 'r' }] } }), 'duplicate_current_slot');
    const record = await w.read(id);
    await h.rejects(w.prepare({ mutation: { action: 'update', id, expectedDigest: record.contentDigest, patch: { body: { decision: 'changed meaning' } } }, authorization: USER }), 'immutable_primary');
    await h.rejects(w.prepare({ mutation: { action: 'retire', id, expectedDigest: record.contentDigest, reason: 'withdrawn' }, authorization: USER }), 'usage_invalid');
    await h.rejects(w.prepare({ mutation: { action: 'discard', id, expectedDigest: record.contentDigest }, authorization: USER }), 'lifecycle_invalid');
    assert.equal((await w.refresh()).ok, true);
    assert.notDeepEqual(h.tree(vault), before);
});

test('authorization follows the project mode: explicit needs the user, adaptive policy may ask, and approval completes the same preview', async () => {
    const { w, vault } = await h.fixture({ approvalMode: 'explicit' });
    const mutation = { action: 'capture', record: h.record('observation') };
    const asked = await w.prepare({ mutation, authorization: { source: 'policy', decision: 'record', reason: 'reusable finding' } });
    assert.equal(asked.status, 'needs_approval');
    const before = h.tree(vault);
    await h.rejects(w.apply(asked.handle), 'approval_required');
    assert.deepEqual(h.tree(vault), before);
    await h.rejects(w.prepare({ preparedHandle: asked.handle, authorization: { source: 'policy', decision: 'record', reason: 'again' } }), 'approval_required');
    const approved = await w.prepare({ preparedHandle: asked.handle, authorization: { source: 'user', references: ['msg/ok'] } });
    assert.equal(approved.status, 'prepared');
    assert.equal(approved.recordId, asked.recordId);
    assert.equal(approved.preview.files[0].path, asked.preview.files[0].path);
    const receipt = await w.apply(approved.handle);
    assert.equal(receipt.status, 'applied');
    assert.deepEqual((await w.read(receipt.recordId)).sources.at(-1), { relation: 'authorization', ref: 'msg/ok' });
    await h.rejects(w.prepare({ preparedHandle: 'prep_' + '0'.repeat(32), authorization: USER }), 'handle_invalid');
    // A tampered prepared file is rejected rather than applied.
    const again = await w.prepare({ mutation: { action: 'capture', record: h.record('observation', { title: 'second' }) }, authorization: USER });
    const file = path.join(vault, '.whyve-runtime/prepared', again.handle + '.json');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('second', 'forged'));
    await h.rejects(w.apply(again.handle), 'handle_invalid');
    const adaptive = await h.fixture({ approvalMode: 'adaptive' });
    const ask = await adaptive.w.prepare({ mutation, authorization: { source: 'policy', decision: 'ask', reason: 'Scope is unclear.' } });
    assert.equal(ask.status, 'needs_approval');
    assert.equal(ask.reason, 'Scope is unclear.');
    const record = await adaptive.w.prepare({ mutation, authorization: { source: 'policy', decision: 'record', reason: 'Verified finding.' } });
    assert.equal(record.status, 'prepared');
    assert.match(record.preview.files[0].content, /authorization_source: "policy"/);
});

test('disabled features cannot record; a v2 vault reports migration_required', async () => {
    const { vault } = await h.fixture();
    const w = h.createWhyve({ vault });
    await w.initialize({ features: ['intent'] });
    await h.rejects(w.prepare({ mutation: { action: 'capture', record: h.record('decision') }, authorization: USER }), 'feature_disabled');
    const legacy = h.v2Copy();
    await h.rejects(h.createWhyve({ vault: legacy.vault }).prepare({ mutation: { action: 'capture', record: h.record('observation') }, authorization: USER }), 'migration_required');
});

test('apply is idempotent across restarts and a crash after the transaction reports already_applied', async () => {
    const { w, vault } = await h.fixture();
    const prepared = await w.prepare({ mutation: { action: 'capture', record: h.record('snapshot') }, authorization: USER });
    const restarted = h.createWhyve({ vault });
    const first = await restarted.apply(prepared.handle);
    assert.equal(first.status, 'applied');
    assert.equal((await w.apply(prepared.handle)).status, 'already_applied');
    // Simulate a crash between the journaled transaction and the prepared-state update.
    const other = await w.prepare({ mutation: { action: 'capture', record: h.record('snapshot', { title: 'crash' }) }, authorization: USER });
    const file = path.join(vault, '.whyve-runtime/prepared', other.handle + '.json');
    const { digest: _, ...frozen } = JSON.parse(fs.readFileSync(file, 'utf8'));
    await w.apply(other.handle);
    // The state a crash leaves behind: the transaction committed while the prepared file still says applying.
    const applying = { ...frozen, state: 'applying' };
    fs.writeFileSync(file, JSON.stringify({ ...applying, digest: h.canonicalDigest(applying) }) + '\n');
    const replay = await h.createWhyve({ vault }).apply(other.handle);
    assert.equal(replay.status, 'already_applied');
    assert.equal((await w.list({ kinds: ['snapshot'] })).items.length, 2);
    // A never-attempted preview whose planned effect was produced by another write is not reported as applied.
    const snap = await h.capture(w, 'snapshot', { title: 'discard me' }), read = await w.read(snap);
    const discard = await w.prepare({ mutation: { action: 'discard', id: snap, expectedDigest: read.contentDigest }, authorization: USER });
    await h.write(w, { action: 'discard', id: snap, expectedDigest: read.contentDigest });
    await h.rejects(w.apply(discard.handle), 'not_found');
});

test('comparison binds read preconditions: body edits, phantom slot occupants, deletions and policy changes are detected', async () => {
    const { w, vault } = await h.fixture();
    const parent = await h.capture(w, 'decision', { scope: 'app' });
    const candidate = h.record('decision', { scope: 'app/sub', title: 'sub choice', body: { decision: '하위 범위의 선택.' } });
    const review = { judgments: [{ id: parent, judgment: 'separate', reason: 'Different sub-scope.' }] };
    // 1. The compared body changes after comparison.
    let compared = await w.compare({ record: candidate });
    assert.deepEqual(compared.receipt.mandatory, [parent]);
    const parentRead = await w.read(parent), parentFile = path.join(vault, parentRead.path);
    fs.appendFileSync(parentFile, '');
    fs.writeFileSync(parentFile, fs.readFileSync(parentFile, 'utf8').replace('파일 저장소를 사용한다.', '파일 저장소를 사용한다. 수정됨.'));
    await h.rejects(w.prepare({ mutation: { action: 'capture', record: candidate }, authorization: USER, comparison: compared.receipt, semanticReview: review }), 'stale_reference');
    // 2. A new occupant appears in the compared slot area after prepare (phantom).
    compared = await w.compare({ record: candidate });
    const prepared = await w.prepare({ mutation: { action: 'capture', record: candidate }, authorization: USER, comparison: compared.receipt, semanticReview: review });
    assert.equal(prepared.status, 'prepared');
    await h.capture(w, 'decision', { scope: 'other', key: 'unrelated', title: 'phantom' });
    await h.rejects(w.apply(prepared.handle), 'stale_reference');
    // 3. The compared record is renamed away.
    compared = await w.compare({ record: candidate });
    const current = await w.read(parent);
    await h.write(w, { action: 'rename', id: parent, expectedDigest: current.contentDigest, title: 'renamed parent' });
    await h.rejects(w.prepare({ mutation: { action: 'capture', record: candidate }, authorization: USER, comparison: compared.receipt, semanticReview: review }), 'stale_reference');
    // 4. Policy changes after prepare.
    compared = await w.compare({ record: candidate });
    const ready = await w.prepare({ mutation: { action: 'capture', record: candidate }, authorization: USER, comparison: compared.receipt, semanticReview: review });
    await w.initialize({ approvalMode: 'auto' });
    await h.rejects(w.apply(ready.handle), 'project_policy_changed');
    const fresh = await w.compare({ record: candidate });
    assert.equal((await h.write(w, { action: 'capture', record: candidate }, { comparison: fresh.receipt, semanticReview: review })).status, 'applied');
});

test('the review gate: empty mandatory sets are the fast path; missing, incomplete, conflicting or non-replacing judgments hold the write', async () => {
    const { w } = await h.fixture();
    assert.equal((await w.prepare({ mutation: { action: 'capture', record: h.record('decision') }, authorization: USER })).status, 'prepared');
    const { w: v } = await h.fixture();
    const existing = await h.capture(v, 'decision', { scope: 'app' });
    const candidate = h.record('decision', { scope: 'app/child', title: 'child' });
    const required = await v.prepare({ mutation: { action: 'capture', record: candidate }, authorization: USER });
    assert.deepEqual([required.status, required.reason, required.remaining], ['needs_review', 'comparison_required', [existing]]);
    const compared = await v.compare({ record: candidate });
    const unjudged = await v.prepare({ mutation: { action: 'capture', record: candidate }, authorization: USER, comparison: compared.receipt });
    assert.equal(unjudged.reason, 'judgment_required');
    for (const judgment of ['conflict', 'same', 'unclear', 'replace']) {
        const held = await v.prepare({ mutation: { action: 'capture', record: candidate }, authorization: USER, comparison: compared.receipt, semanticReview: { judgments: [{ id: existing, judgment, reason: 'r' }] } });
        assert.equal(held.reason, 'semantic_conflict', judgment);
    }
    const incomplete = { ...compared.receipt, reads: [] };
    assert.equal((await v.prepare({ mutation: { action: 'capture', record: candidate }, authorization: USER, comparison: incomplete, semanticReview: { judgments: [{ id: existing, judgment: 'separate', reason: 'r' }] } })).reason, 'comparison_incomplete');
    // Supersede requires reading the predecessor and judging it replaced.
    const target = await v.read(existing);
    const successor = h.record('decision', { scope: 'app', title: 'replacement', body: { decision: '새 저장소 선택.' } });
    const cmp = await v.compare({ record: successor, action: 'supersede', targetId: existing });
    const notReplaced = await v.prepare({ mutation: { action: 'supersede', id: existing, expectedDigest: target.contentDigest, successor, reason: 'Changed storage.' }, authorization: USER, comparison: cmp.receipt, semanticReview: { judgments: [{ id: existing, judgment: 'separate', reason: 'r' }] } });
    assert.equal(notReplaced.reason, 'predecessor_not_replaced');
    const receipt = await h.write(v, { action: 'supersede', id: existing, expectedDigest: target.contentDigest, successor, reason: 'Changed storage.' }, { comparison: cmp.receipt, semanticReview: { judgments: [{ id: existing, judgment: 'replace', reason: 'User chose new storage.' }] } });
    const old = await v.read(existing), next = await v.read(receipt.recordId);
    assert.equal(old.state, 'history');
    assert.equal(old.doNotFollow, true);
    assert.equal(old.lifecycle.successor, receipt.recordId);
    assert.ok(old.path.includes('/retired/'));
    assert.deepEqual(next.sources.filter(s => s.relation === 'supersedes'), [{ relation: 'supersedes', ref: existing }]);
    assert.equal((await v.refresh()).ok, true);
});

test('SNAP and DOCUMENT update content with digest CAS; other kinds only supplement; scope moves use supersede', async () => {
    const { w } = await h.fixture();
    const snap = await h.capture(w, 'snapshot', { body: { current_context: '처음', open_items: ['a'], next_steps: ['b'], decided: ['c'] }, headers: { 'howse.revision': '1' } });
    let read = await w.read(snap);
    await h.rejects(w.prepare({ mutation: { action: 'update', id: snap, expectedDigest: 'sha256:' + '0'.repeat(64), patch: { body: { current_context: 'x' } } }, authorization: USER }), 'digest_conflict');
    await h.write(w, { action: 'update', id: snap, expectedDigest: read.contentDigest, patch: { replaceBody: true, body: { current_context: '두 번째', next_steps: ['d'] }, headers: { set: { 'howse.revision': '2' } } } });
    read = await w.read(snap);
    assert.deepEqual(Object.keys(read.sections), ['Current context', 'Next steps']);
    assert.equal(read.headers['howse.revision'], '2');
    assert.ok(read.updatedAt);
    const doc = await h.capture(w, 'document');
    const docRead = await w.read(doc);
    await h.write(w, { action: 'update', id: doc, expectedDigest: docRead.contentDigest, patch: { body: { content: '## 새 제목\n\n갱신된 계약.' } } });
    assert.equal((await w.read(doc)).sections.Content, '## 새 제목\n\n갱신된 계약.');
    const obs = await h.capture(w, 'observation', { body: { observation: '관찰' } });
    let o = await w.read(obs);
    assert.deepEqual(o.qualityFlags.map(f => f.code), ['evidence_missing', 'summary_derived']);
    await h.write(w, { action: 'update', id: obs, expectedDigest: o.contentDigest, patch: { body: { evidence: ['늦게 온 근거'] }, sources: { add: [{ relation: 'source', ref: 'msg/late' }] } } });
    o = await w.read(obs);
    assert.deepEqual(o.qualityFlags.map(f => f.code), ['summary_derived']);
    await h.rejects(w.prepare({ mutation: { action: 'update', id: obs, expectedDigest: o.contentDigest, patch: { body: { evidence: ['바뀐 근거'] } } }, authorization: USER }), 'immutable_section');
    await h.write(w, { action: 'update', id: obs, expectedDigest: o.contentDigest, patch: { body: { evidence: ['늦게 온 근거', '추가 근거'] }, summary: '직접 쓴 요약' } });
    o = await w.read(obs);
    assert.deepEqual(o.qualityFlags, []);
    const moved = h.record('document', { scope: 'consumer/v2' });
    const cmp = await w.compare({ record: moved, action: 'supersede', targetId: doc });
    const current = await w.read(doc);
    const receipt = await h.write(w, { action: 'supersede', id: doc, expectedDigest: current.contentDigest, successor: moved, reason: 'Scope moved.' }, { comparison: cmp.receipt, semanticReview: { judgments: [{ id: doc, judgment: 'same', reason: 'Same document, new scope.' }] } });
    assert.equal((await w.read(receipt.recordId)).scope, 'consumer/v2');
    await h.rejects(w.prepare({ mutation: { action: 'supersede', id: snap, expectedDigest: (await w.read(snap)).contentDigest, successor: h.record('snapshot'), reason: 'x' }, authorization: USER }), 'lifecycle_invalid');
});

test('retire, discard and rename follow the kind lifecycle and inbound references', async () => {
    const { w } = await h.fixture();
    const asm = await h.capture(w, 'assumption');
    let r = await w.read(asm);
    await h.rejects(w.prepare({ mutation: { action: 'retire', id: asm, expectedDigest: r.contentDigest, reason: 'confirmed' }, authorization: USER }), 'usage_invalid');
    await h.write(w, { action: 'retire', id: asm, expectedDigest: r.contentDigest, reason: 'confirmed', sources: [{ relation: 'evidence', ref: 'test run 12' }] });
    r = await w.read(asm);
    assert.deepEqual([r.state, r.headers.assumption_status, r.lifecycle.reason], ['history', 'confirmed', 'confirmed']);
    const obs = await h.capture(w, 'observation');
    const dec = h.record('decision', { sources: [{ relation: 'informed_by:observation', ref: obs }] });
    const cmp = await w.compare({ record: dec });
    assert.deepEqual(cmp.items.map(i => [i.row.fields.id, i.reasons]), [[obs, ['referenced']]]);
    await h.write(w, { action: 'capture', record: dec }, { comparison: cmp.receipt, semanticReview: { judgments: [{ id: obs, judgment: 'support', reason: 'The decision relies on it.' }] } });
    const o = await w.read(obs);
    await h.rejects(w.prepare({ mutation: { action: 'discard', id: obs, expectedDigest: o.contentDigest }, authorization: USER }), 'inbound_reference');
    const loose = await h.capture(w, 'observation', { title: 'loose' });
    const l = await w.read(loose);
    await h.write(w, { action: 'rename', id: loose, expectedDigest: l.contentDigest, title: 'renamed loose' });
    const renamed = await w.read(loose);
    assert.match(renamed.path, /renamed-loose\.md$/);
    await h.write(w, { action: 'discard', id: loose, expectedDigest: renamed.contentDigest });
    await h.rejects(w.read(loose), 'not_found');
});

test('bodies over the record limit return needs_archive with chunk boundaries instead of failing or condensing', async () => {
    const { w, vault } = await h.fixture();
    const before = h.tree(vault);
    const big = '가'.repeat(100 * 1024);
    const result = await w.prepare({ mutation: { action: 'capture', record: h.record('observation', { body: { observation: big } }) }, authorization: USER });
    assert.equal(result.status, 'needs_archive');
    assert.equal(result.maxBytes, 262144);
    assert.equal(result.chunks.length, 1);
    const huge = 'line\n'.repeat(120000);
    const archive = await w.prepare({ mutation: { action: 'capture', record: h.record('archive', { body: { content: huge } }) }, authorization: USER });
    assert.equal(archive.status, 'needs_archive');
    assert.equal(archive.chunks.length, 2);
    assert.equal(archive.chunks[0].toByte, archive.chunks[1].fromByte);
    assert.equal(archive.chunks[0].toByte % 5, 0, 'chunks end on a line boundary');
    assert.deepEqual(h.tree(vault), before);
    const fits = await h.capture(w, 'archive', { body: { content: 'x'.repeat(500 * 1024) } });
    assert.equal((await w.read(fits, { maxBytes: 262144 })).complete, false);
});

test('term vocabulary conflicts in overlapping scopes are rejected; DEC overlap needs a compatible judgment', async () => {
    const { w } = await h.fixture();
    await h.capture(w, 'term', { scope: 'app' });
    const clash = h.record('term', { scope: 'app/ui', title: 'alias clash', body: { term: 'Store', definition: 'x', aliases: ['Vault'] } });
    assert.equal((await w.prepare({ mutation: { action: 'capture', record: clash }, authorization: USER })).reason, 'comparison_required');
    const cmp = await w.compare({ record: clash }), existing = cmp.items[0].row.fields.id;
    assert.deepEqual(cmp.items[0].reasons, ['term_overlap']);
    await h.rejects(w.prepare({ mutation: { action: 'capture', record: clash }, authorization: USER, comparison: cmp.receipt, semanticReview: { judgments: [{ id: existing, judgment: 'separate', reason: 'r' }] } }), 'term_conflict');
    const { w: d } = await h.fixture();
    const parent = await h.capture(d, 'decision', { scope: 'app' });
    const child = h.record('decision', { scope: 'app/ui', title: 'child' });
    const dc = await d.compare({ record: child });
    assert.equal(dc.items[0].reasons[0], 'scope_overlap');
    assert.equal((await d.checkSlot(child)).occupants[0].blocking, false, 'overlap is a judgment case, not a hard block');
    await h.write(d, { action: 'capture', record: child }, { comparison: dc.receipt, semanticReview: { judgments: [{ id: parent, judgment: 'support', reason: 'Refines the parent.' }] } });
    const slot = await w.checkSlot(h.record('term', { scope: 'app/ui', body: { term: 'vault', definition: 'x' } }));
    assert.equal(slot.blocking, true);
    assert.equal(slot.occupants[0].reason, 'term_overlap');
    assert.equal((await w.checkSlot(h.record('term', { scope: 'elsewhere', body: { term: 'vault', definition: 'x' } }))).occupied, false);
});
