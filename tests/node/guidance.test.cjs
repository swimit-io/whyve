const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const packageRoot = process.env.WHYVE_TEST_PACKAGE_ROOT || path.resolve(__dirname, '../..');
const skills = path.join(packageRoot, 'plugins/whyve/skills');
const KINDS = ['decision', 'assumption', 'document', 'intent', 'term'];

function source(kind, language = '') { return fs.readFileSync(path.join(skills, kind, `SKILL${language}.md`), 'utf8'); }
/** Shipped ```bash blocks (also indented ones) parsed into heredoc files and node commands; no shell is executed. */
function blocks(text) {
    return [...text.matchAll(/^( *)```bash\n([\s\S]*?)^\1```/gm)].map(([, indent, body]) => {
        const lines = body.split('\n').map(line => line.startsWith(indent) ? line.slice(indent.length) : line);
        const files = [], commands = [];
        for (let i = 0; i < lines.length; i++) {
            const heredoc = /^cat > (\S+) <<'EOF'$/.exec(lines[i]);
            if (heredoc) {
                const end = lines.indexOf('EOF', i);
                files.push({ name: heredoc[1], content: lines.slice(i + 1, end).join('\n') + '\n' });
                i = end;
                continue;
            }
            let line = lines[i];
            while (line.endsWith('\\')) line = line.slice(0, -1) + ' ' + lines[++i].trim();
            if (line.startsWith('node ')) commands.push(line.match(/'[^']*'|\S+/g).slice(1).map(t => t.replace(/^'|'$/g, '')));
        }
        return { body, files, commands };
    });
}
function block(kind, language, marker) {
    const found = blocks(source(kind, language)).filter(b => b.body.includes(marker));
    assert.equal(found.length, 1, `SKILL${language}.md must contain exactly one example with ${marker}`);
    return found[0];
}
function substitute(text, values) { return Object.entries(values).reduce((out, [k, v]) => out.split(k).join(v), text); }
/** Runs one shipped example against the vault through the packaged wrapper scripts with PATH=''. */
function run(vault, example, values = {}, edit = content => content) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'whyve-example-'));
    try {
        // Only the examples' single-segment /tmp/<fixture> names move into tmp; absolute script paths under a real /tmp stay intact.
        const local = name => name.replace(/^\/tmp\/(?=[^/]+$)/, tmp + '/');
        for (const file of example.files) fs.writeFileSync(local(file.name), edit(substitute(file.content, values)));
        return example.commands.map(args => {
            const argv = args.map(a => a.startsWith('/loaded/whyve/skills/') ? a.replace('/loaded/whyve/skills', skills) : local(substitute(a, values)));
            const env = { ...process.env, PATH: '' };
            delete env.WHYVE_PROJECT_ROOT;
            const r = spawnSync(process.execPath, argv, { cwd: vault, env, encoding: 'utf8' });
            assert.equal(r.status, 0, r.error?.message || r.stdout || r.stderr);
            return JSON.parse(r.stdout);
        });
    }
    finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
function cli(vault, args) {
    const env = { ...process.env, PATH: '' };
    delete env.WHYVE_PROJECT_ROOT;
    const r = spawnSync(process.execPath, [path.join(skills, 'context/scripts/context_cli.mjs'), ...args], { cwd: vault, env, encoding: 'utf8' });
    return JSON.parse(r.stdout);
}
function tree(directory) {
    const out = {};
    (function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === '.whyve-runtime') continue;
            const p = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(p); else out[path.relative(directory, p)] = fs.readFileSync(p).toString('base64');
        }
    })(directory);
    return out;
}
/** Initializes a vault with the init wrapper and captures the shipped DEC example. */
function captured(t, language) {
    const vault = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'whyve-guidance-')));
    t.after(() => fs.rmSync(vault, { recursive: true, force: true }));
    run(vault, { files: [], commands: [[path.join(skills, 'init/scripts/decision_init.mjs')]] });
    const [capture] = run(vault, block('decision', language, 'whyve-dec-capture.json'));
    assert.equal(capture.result.receipt.status, 'applied', JSON.stringify(capture));
    const [listed, read] = run(vault, block('decision', language, 'decision_cli.mjs list'), { '<id>': capture.result.receipt.recordId });
    assert.deepEqual(listed.result.items.map(i => i.fields.id), [capture.result.receipt.recordId]);
    assert.equal(read.result.state, 'current');
    const id = capture.result.receipt.recordId;
    const [compared] = run(vault, block('decision', language, 'whyve-dec-compare.json'), { '<current-id>': id });
    assert.deepEqual(compared.result.receipt.mandatory, [id]);
    assert.equal(compared.result.receipt.complete, true);
    const item = compared.result.items[0];
    assert.equal(item.sections.Decision, read.result.sections.Decision);
    const values = { '<current-id>': id, '<current-contentDigest>': item.contentDigest, '<result.receipt>': JSON.stringify(compared.result.receipt) };
    return { vault, id, values, supersede: block('decision', language, 'whyve-dec-supersede.json') };
}
for (const language of ['', '.ko']) test(`shipped ${language || 'EN'} decision examples capture and supersede on the first attempt`, async t => {
    const { vault, id, values, supersede } = captured(t, language);
    const [result] = run(vault, supersede, values);
    assert.equal(result.result.receipt.status, 'applied', JSON.stringify(result));
    const successor = result.result.receipt.recordId;
    const old = cli(vault, ['read', id]).result, next = cli(vault, ['read', successor]).result;
    assert.equal(old.state, 'history');
    assert.equal(old.doNotFollow, true);
    assert.equal(old.lifecycle.successor, successor);
    assert.equal(next.state, 'current');
    assert.ok(next.sources.some(s => s.relation === 'supersedes' && s.ref === id));
    assert.equal(cli(vault, ['doctor']).result.ok, true);
});
test('supersede without the semantic review returns needs_review and writes nothing', async t => {
    const { vault, values, supersede } = captured(t, '');
    const before = tree(vault);
    const withoutReview = content => { const input = JSON.parse(content); delete input.semanticReview; return JSON.stringify(input); };
    const [noReview] = run(vault, supersede, values, withoutReview);
    assert.equal(noReview.result.status, 'needs_review');
    assert.equal(noReview.result.reason, 'judgment_required');
    const [noComparison] = run(vault, supersede, values, content => { const input = JSON.parse(withoutReview(content)); delete input.comparison; return JSON.stringify(input); });
    assert.equal(noComparison.result.status, 'needs_review');
    assert.equal(noComparison.result.reason, 'comparison_required');
    assert.deepEqual(tree(vault), before);
});
test('observation guidance states the schema limits; evidence is optional with a quality flag', async t => {
    const vault = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'whyve-observation-')));
    t.after(() => fs.rmSync(vault, { recursive: true, force: true }));
    run(vault, { files: [], commands: [[path.join(skills, 'init/scripts/whyve_init.mjs')]] });
    const schema = cli(vault, ['schema', 'observation']).result;
    const evidence = schema.sections.find(s => s.field === 'evidence');
    assert.equal(schema.sections.find(s => s.field === 'observation').required, true);
    assert.equal(evidence.required, false);
    for (const language of ['', '.ko']) {
        const text = source('observation', language);
        for (const required of [evidence.flag, schema.limits.body_bytes.toLocaleString('en-US'), 'schema observation', '`observation`', '`evidence`'])
            assert.ok(text.includes(required), `SKILL${language}.md must mention ${required}`);
        assert.doesNotMatch(text, /min_items|1–6|at least one evidence|1–1,200/);
        const example = block('observation', language, 'whyve-obs.json');
        const [withEvidence] = run(vault, example);
        assert.equal(withEvidence.result.receipt.status, 'applied');
        const [withoutEvidence] = run(vault, example, {}, content => { const input = JSON.parse(content); delete input.mutation.record.body.evidence; input.mutation.record.title += ' 2'; return JSON.stringify(input); });
        assert.equal(withoutEvidence.result.receipt.status, 'applied');
        assert.ok(withoutEvidence.result.receipt.qualityFlags.some(f => f.code === evidence.flag));
    }
});
test('shipped files use the v3 surfaces only', () => {
    const files = [];
    (function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, entry.name);
            if (entry.isDirectory()) { if (entry.name !== 'dist') walk(p); }
            else if (/\.(md|mjs|json)$/.test(entry.name)) files.push(p);
        }
    })(path.join(packageRoot, 'plugins/whyve'));
    for (const extra of ['README.md', 'README.ko.md', 'AGENTS.md', 'docs/node-api.md', 'docs/node-api.ko.md', 'examples/consumer.cjs'])
        if (fs.existsSync(path.join(packageRoot, extra))) files.push(path.join(packageRoot, extra));
    const removed = [/\battest/i, /approval_digest/, /receipt-file/, /same_claim/, /_workflow\.mjs/, /recall --query/];
    for (const file of files) {
        const text = fs.readFileSync(file, 'utf8');
        for (const pattern of removed) assert.ok(!pattern.test(text), `${path.relative(packageRoot, file)} mentions removed ${pattern}`);
    }
    for (const kind of KINDS) {
        assert.ok(!fs.existsSync(path.join(skills, kind, 'scripts', `${kind}_workflow.mjs`)));
        assert.ok(fs.readFileSync(path.join(skills, kind, 'scripts', `${kind}_cli.mjs`), 'utf8').includes(`runCli(["${kind}", ...process.argv.slice(2)])`));
        assert.ok(fs.readFileSync(path.join(skills, 'init/scripts', `${kind}_init.mjs`), 'utf8').includes(`runCli(["${kind}", "init", ...process.argv.slice(2)])`));
    }
});
