/* Build the actual tarball, install it into a fresh consumer and use that package. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const version = require('../plugins/whyve/.codex-plugin/plugin.json').version;
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whyve-package-'));
const consumer = path.join(directory, 'consumer');
fs.mkdirSync(consumer);
const cache = path.join(os.tmpdir(), 'whyve-npm-cache');
const npm = process.env.npm_execpath;
assert.ok(npm, 'Run npm run test:package to use its configured npm CLI.');
function run(executable, args, options = {}) {
    const r = spawnSync(executable, args, { cwd: consumer, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024, ...options });
    assert.equal(r.status, 0, r.error?.message || r.stderr || r.stdout);
    return r.stdout;
}
(async () => {
    const packed = JSON.parse(run(process.execPath, [npm, 'pack', '--json', '--pack-destination', directory, '--cache', cache], { cwd: root }))[0];
    assert.equal(packed.version, version);
    const tarball = path.join(directory, packed.filename);
    assert.ok(packed.files.some(f => f.path === 'plugins/whyve/dist/index.d.ts'));
    assert.ok(packed.files.some(f => f.path.endsWith('whyve_init.mjs')));
    assert.ok(!packed.files.some(f => f.path.endsWith('_workflow.mjs')));
    assert.ok(!packed.files.some(f => /(?:^tests\/|^src\/|node_modules|\.py(?:c)?$|\.git\/)/.test(f.path)));
    fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ name: 'whyve-isolated-consumer', private: true }));
    run(process.execPath, [npm, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', cache, tarball]);
    fs.copyFileSync(path.join(root, 'examples/consumer.cjs'), path.join(consumer, 'consumer.cjs'));
    const nodeResult = JSON.parse(run(process.execPath, ['consumer.cjs'], { env: { ...process.env, PATH: '' } }));
    const imported = run(process.execPath, ['--input-type=module', '-e', "import { createWhyve } from '@whyve/context'; if(typeof createWhyve!=='function')process.exit(1); console.log('ESM import passed');"], { env: { ...process.env, PATH: '' } });
    const packageRoot = path.join(consumer, 'node_modules/@whyve/context');
    assert.equal(require(path.join(packageRoot, 'package.json')).version, version);
    assert.equal(require(packageRoot).VERSION, version);
    const skills = path.join(packageRoot, 'plugins/whyve/skills');
    const vault = fs.mkdtempSync(path.join(directory, 'plugin-vault-'));
    const wrapped = (entry, args) => JSON.parse(run(process.execPath, [path.join(skills, entry), ...args, '--vault', vault, '--json'], { env: { ...process.env, PATH: '' } }));
    assert.equal(wrapped('init/scripts/whyve_init.mjs', ['--features', 'decision,intent,document', '--host', 'codex']).result.version, version);
    assert.equal(wrapped('context/scripts/context_cli.mjs', ['capabilities']).result.version, version);
    assert.equal(wrapped('context/scripts/context_cli.mjs', ['schema', 'decision']).result.schema, 'context-decision/v2');
    const record = { kind: 'decision', title: 'Package decision', scope: 'package', key: 'storage', body: { decision: 'Use local files.', rationale: 'The consumer must work offline.', rejected_alternatives: ['Hosted storage requires a network.'] } };
    const input = path.join(directory, 'capture.json');
    fs.writeFileSync(input, JSON.stringify({ mutation: { action: 'capture', record } }));
    const captured = wrapped('decision/scripts/decision_cli.mjs', ['prepare', '--input', input, '--approved', '--apply']);
    assert.equal(captured.result.receipt.status, 'applied');
    const listed = wrapped('decision/scripts/decision_cli.mjs', ['list', '--scope', 'package', '--key', 'storage']);
    assert.deepEqual(listed.result.items.map(row => row.fields.id), [captured.result.receipt.recordId]);
    fs.writeFileSync(input, JSON.stringify({ action: 'supersede', targetId: captured.result.receipt.recordId, record }));
    const compared = wrapped('decision/scripts/decision_cli.mjs', ['compare', '--input', input]);
    assert.equal(compared.result.schema, 'whyve-comparison/v3');
    assert.deepEqual(compared.result.receipt.mandatory, [captured.result.receipt.recordId]);
    assert.equal(wrapped('decision/scripts/decision_cli.mjs', ['read', captured.result.receipt.recordId]).result.sections.Decision, 'Use local files.');
    assert.equal(wrapped('context/scripts/context_cli.mjs', ['doctor']).result.record_count, 1);
    const guidance = run(process.execPath, ['--test', path.join(root, 'tests/node/guidance.test.cjs')], { env: { ...process.env, WHYVE_TEST_PACKAGE_ROOT: packageRoot } });
    fs.writeFileSync(path.join(consumer, 'consumer.ts'), "import {createWhyve,canonicalScope,scopesOverlap} from '@whyve/context'; import type {RecordInput,PrepareResult,RowPage,RecordRead,ComparisonPage,SlotPage,WriteReceipt} from '@whyve/context'; const w=createWhyve({vault:'/an/existing/directory'}); const record:RecordInput={kind:'decision',title:'Storage',scope:canonicalScope('Package'),key:'storage',body:{decision:'Use local files.'}}; const prepared:Promise<PrepareResult>=w.prepare({mutation:{action:'capture',record},authorization:{source:'user'}}); const applied=async(h:string):Promise<WriteReceipt>=>w.apply(h); const listed:Promise<RowPage>=w.list({kinds:['decision'],state:'all',limit:100}); const read:Promise<RecordRead>=w.read('ctx_...'); const compared:Promise<ComparisonPage>=w.compare({record}); const slot:Promise<SlotPage>=w.checkSlot(record,{limit:1}); void scopesOverlap('a','a/b'); void prepared; void applied; void listed; void read; void compared; void slot;\n");
    const result = { ok: true, version, tarball, integrity: packed.integrity, files: packed.files.length, package_bytes: packed.size, node: nodeResult, esm_import: imported.trim(), typescript_consumer: true, plugin_flow: true, shipped_guidance: guidance.trim() };
    if (process.env.WHYVE_TEST_NODE)
        result.node_minimum = JSON.parse(run(process.env.WHYVE_TEST_NODE, [path.join(consumer, 'consumer.cjs')], { env: { ...process.env, PATH: '' } }));
    if (process.env.WHYVE_TEST_ELECTRON) {
        result.electron = JSON.parse(run(process.env.WHYVE_TEST_ELECTRON, [path.join(consumer, 'consumer.cjs')], { env: { ...process.env, PATH: '', ELECTRON_RUN_AS_NODE: '1' } }));
        if (process.env.WHYVE_TEST_ASAR) {
            const asar = await import(pathToFileURL(process.env.WHYVE_TEST_ASAR).href);
            const appRoot = path.join(directory, 'app');
            fs.mkdirSync(appRoot);
            fs.cpSync(path.join(consumer, 'node_modules'), path.join(appRoot, 'node_modules'), { recursive: true, verbatimSymlinks: true });
            fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({ name: 'whyve-asar-consumer', version: '1.0.0', main: 'main.cjs' }));
            fs.writeFileSync(path.join(appRoot, 'main.cjs'), `const {app}=require('electron');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {createWhyve}=require('@whyve/context');app.whenReady().then(async()=>{const vault=fs.mkdtempSync(path.join(os.tmpdir(),'whyve-asar-vault-'));const b=createWhyve({vault});await b.initialize();if(!(await b.refresh()).ok)throw Error('Invalid indexes');console.log(JSON.stringify({asar:true,electron:process.versions.electron,node:process.versions.node}));app.exit(0);}).catch(e=>{console.error(e);app.exit(1);});`);
            const archive = path.join(directory, 'consumer.asar');
            await asar.createPackage(appRoot, archive);
            const env = { ...process.env };
            delete env.ELECTRON_RUN_AS_NODE;
            if (process.env.WHYVE_ASAR_BUILD_ONLY === '1')
                result.asar_artifact = archive;
            else {
                const output = run(process.env.WHYVE_TEST_ELECTRON, [archive, '--user-data-dir=' + path.join(directory, 'electron-data')], { env, timeout: 30000 });
                result.asar = JSON.parse(output.trim().split('\n').find(line => line.startsWith('{"asar":')));
            }
        }
    }
    fs.writeFileSync(path.join(directory, 'evidence.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
})().catch(error => { console.error(error); process.exitCode = 1; });
