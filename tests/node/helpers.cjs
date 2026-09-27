const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const api = require('../../plugins/whyve/dist');
/** Minimal valid bodies for all eight kinds (docs/record-model.md section 6). */
const bodies = {
    snapshot: { current_context: '작업을 이어간다.', open_items: ['남은 검증'], next_steps: ['다음 테스트 실행'] },
    observation: { observation: '로컬 실행 결과를 관찰했다.', evidence: ['재현 명령과 결과'] },
    archive: { content: '원본 자료\n\n```md\n## 보존할 원문\n```' },
    decision: { decision: '파일 저장소를 사용한다.', rationale: '오프라인 실행이 필요하다.', rejected_alternatives: ['서버 의존성'] },
    assumption: { assumption: '로컬 환경이 제공된다.', basis: ['소비자 요구'] },
    term: { term: 'Vault', definition: '기록 파일이 있는 디렉터리다.', project_signal: 'project-specific', aliases: ['기록 저장소'] },
    intent: { intent: '맥락을 잃지 않고 일을 완수한다.', success_criteria: ['선택한 기록을 다시 읽는다.'] },
    document: { content: '현재 소비자 연동 계약.' },
};
const keys = { decision: 'storage', intent: 'continuity', document: 'integration' };
function record(kind, overrides = {}) {
    return { kind, title: `${kind} 기록`, scope: 'consumer', ...(keys[kind] ? { key: keys[kind] } : {}), body: bodies[kind], ...(kind === 'archive' ? { sources: [{ relation: 'source', ref: 'test:source' }] } : {}), ...overrides };
}
const USER = { source: 'user', references: ['msg/test'] };
async function fixture(options = {}) {
    const vault = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'whyve-node-test-')));
    const w = api.createWhyve({ vault, ...options });
    await w.initialize({ features: ['decision', 'assumption', 'term', 'intent', 'document'], ...(options.approvalMode ? { approvalMode: options.approvalMode } : {}) });
    return { vault, w };
}
/** prepare + apply with user authorization; fails the test on any non-prepared result. */
async function write(w, mutation, extra = {}) {
    const prepared = await w.prepare({ mutation, authorization: USER, ...extra });
    if (prepared.status !== 'prepared') throw new Error('Expected prepared, got ' + JSON.stringify(prepared));
    return w.apply(prepared.handle);
}
async function capture(w, kind, overrides = {}) { return (await write(w, { action: 'capture', record: record(kind, overrides) })).recordId; }
function tree(directory) {
    const out = {};
    (function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, entry.name);
            if (entry.name === '.whyve-runtime') continue;
            if (entry.isDirectory()) walk(p);
            else out[path.relative(directory, p)] = fs.readFileSync(p).toString('base64');
        }
    })(directory);
    return out;
}
async function rejects(promise, code) {
    try { await promise; } catch (error) { if (error.code !== code) throw new Error(`Expected ${code}, got ${error.code}: ${error.message}`); return error; }
    throw new Error(`Expected ${code}, but the call succeeded.`);
}
const FIXTURE_V2 = path.resolve(__dirname, '../fixtures/v2-vault');
function v2Copy() {
    const vault = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'whyve-v2-')));
    fs.cpSync(FIXTURE_V2, vault, { recursive: true });
    return { vault, ids: JSON.parse(fs.readFileSync(path.join(vault, 'ids.json'), 'utf8')) };
}
module.exports = { ...api, bodies, record, USER, fixture, write, capture, tree, rejects, v2Copy };
