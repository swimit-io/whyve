// Install the packed @whyve/context tarball in this example's directory first.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { createWhyve } = require('@whyve/context');

async function main() {
    const vault = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'whyve-consumer-')));
    const whyve = createWhyve({ vault });
    await whyve.initialize({ features: ['decision'] });

    // A capture with no existing slot occupant needs no comparison: prepare, then apply the frozen preview.
    const record = {
        kind: 'decision', title: 'Store records as local files', scope: 'consumer/storage', key: 'storage-backend',
        body: { decision: 'Store records as local Markdown files.', rationale: 'The consumer must work offline.' },
    };
    const prepared = await whyve.prepare({ mutation: { action: 'capture', record }, authorization: { source: 'user', references: ['msg/example'] } });
    assert.equal(prepared.status, 'prepared');
    const receipt = await whyve.apply(prepared.handle);
    assert.equal(receipt.status, 'applied');

    const listed = await whyve.list({ kinds: ['decision'], scope: { value: 'consumer', match: 'overlap' } });
    assert.deepEqual(listed.items.map(row => row.fields.id), [receipt.recordId]);
    const read = await whyve.read(receipt.recordId);
    assert.equal(read.sections.Decision, record.body.decision);

    // The same vault through the packaged CLI, with no Python, Git or global install on PATH.
    const cli = path.join(path.dirname(require.resolve('@whyve/context')), 'cli.js');
    const run = args => JSON.parse(execFileSync(process.execPath, [cli, ...args, '--vault', vault], { encoding: 'utf8', env: { ...process.env, PATH: '' } }));
    assert.equal(run(['read', receipt.recordId]).result.contentDigest, read.contentDigest);
    assert.equal(run(['doctor']).result.ok, true);

    console.log(JSON.stringify({
        ok: true, vault, node: process.versions.node, electron: process.versions.electron ?? null,
        recordId: receipt.recordId, qualityFlags: receipt.qualityFlags.map(flag => flag.code), library_to_cli: true, python_required: false,
    }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
