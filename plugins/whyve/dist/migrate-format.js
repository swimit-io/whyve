"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateFormat = migrateFormat;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const node_child_process_1 = require("node:child_process");
const common_1 = require("./common");
const filesystem_1 = require("./filesystem");
const model_1 = require("./model");
const record_1 = require("./record");
const catalog_1 = require("./catalog");
const documents_1 = require("./documents");
const legacy_1 = require("./legacy");
const vault_1 = require("./vault");
const documents_2 = require("./documents");
const LINK = /\]\(([^)\s]+)\)|\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
function walk(root, relative, out) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute))
        return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
        const child = relative + '/' + entry.name;
        if (entry.isDirectory())
            walk(root, child, out);
        else
            out.push(child);
    }
}
function gitStatus(vault, paths) {
    const result = (0, node_child_process_1.spawnSync)('git', ['-C', vault, 'ls-files', '-z', '--', 'context'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const status = new Map();
    if (result.status !== 0) {
        for (const p of paths)
            status.set(p, 'unknown');
        return status;
    }
    const tracked = new Set(result.stdout.split('\0').filter(Boolean));
    for (const p of paths)
        status.set(p, tracked.has(p) ? 'tracked' : 'untracked');
    return status;
}
/** Rewrites path links to moved records outside code fences; other mentions are reported, not changed. */
function rewriteLinks(text, fromDir, toDir, moves, warnings, id) {
    let fence;
    return text.split('\n').map(line => {
        const f = /^\s*(```+|~~~+)/.exec(line)?.[1][0];
        if (f) {
            fence = fence === f ? undefined : fence ?? f;
            return line;
        }
        if (fence) {
            if ([...moves.keys()].some(p => line.includes(path.posix.basename(p))))
                warnings.push({ code: 'path_mention_in_code_unchanged', id });
            return line;
        }
        return line.replace(LINK, (whole, markdown, wiki) => {
            const target = markdown ?? wiki;
            if (/^[a-z]+:/i.test(target) || target.startsWith('#'))
                return whole;
            let decoded;
            try {
                decoded = markdown ? decodeURI(target.split('#')[0]) : target;
            }
            catch {
                return whole;
            }
            const resolved = markdown ? path.posix.normalize(path.posix.join(fromDir, decoded)) : (decoded.endsWith('.md') ? decoded : decoded + '.md');
            const moved = moves.get(resolved);
            if (!moved)
                return whole;
            if (markdown)
                return `](${encodeURI(path.posix.relative(toDir, moved))}${target.includes('#') ? target.slice(target.indexOf('#')) : ''})`;
            return whole.replace(target, moved.replace(/\.md$/, ''));
        });
    }).join('\n');
}
/** Independent semantic projection used to verify that no meaning was lost (not a reuse of the converter). */
function projectV2(doc, state, preset) {
    const fm = doc.frontmatter, kind = (0, legacy_1.legacyKind)(fm.schema), refs = [];
    for (const ref of fm.source_refs ?? []) {
        const m = preset === 'howse' ? /^howse:([a-z-]+):(.+)$/.exec(ref) : null;
        refs.push(m && legacy_1.HOWSE_REFS[m[1]] ? ['header', legacy_1.HOWSE_REFS[m[1]], m[2]] : ['source', ref]);
    }
    for (const [p, ids] of Object.entries((fm.relations ?? {})))
        for (const id of ids)
            refs.push([p, id]);
    for (const id of fm.supersedes ?? [])
        refs.push(['supersedes', id]);
    if (fm.superseded_by)
        refs.push(['superseded-by', fm.superseded_by]);
    const sections = {};
    for (const [title, text] of Object.entries(doc.sections))
        sections[(0, documents_1.sectionName)(fm.schema, title)] = text;
    return { id: fm.id, kind, state, title: fm.title, summary: fm.summary, scope: fm.scope ?? 'global', key: fm.decision_key ?? fm.intent_key ?? fm.document_key ?? (fm.term ? (0, common_1.canonicalKey)(fm.term) : ''),
        created: fm.created_at, updated: fm.updated_at ?? '', retired: state === 'history' ? [fm.retired_at, fm.retired_reason] : null, keywords: [...new Set(fm.search_terms ?? [])], tags: [...new Set(fm.tags ?? [])],
        sections, refs: refs.map(r => r.join('\u0000')).sort(common_1.compareText) };
}
function projectV3(record) {
    const h = record.headers, refs = [];
    for (const [key, value] of Object.entries(h))
        if (key.startsWith('howse.'))
            for (const v of Array.isArray(value) ? value : [value])
                refs.push(['header', key, v]);
    for (const s of record.sources)
        if (!['retirement-note', 'refutation-reason', 'deprecation-reason', 'replacement-term', 'evidence', 'impacts:decision', 'related-term', 'affects-path', 'revisit-when'].includes(s.relation))
            refs.push([s.relation, s.ref]);
    const sections = {};
    for (const s of record.sections)
        if (s.name || !LEGACY_NOTE_SECTIONS.includes(s.title))
            sections[s.name ?? s.title] = s.text;
    return { id: h.id, kind: h.kind, state: h.state, title: h.title, summary: h.summary, scope: h.scope, key: h.key ?? '', created: h.created_at, updated: h.updated_at ?? '',
        retired: h.state === 'history' ? [h.retired_at, h.lifecycle_reason] : null, keywords: h.keywords ?? [], tags: h.tags ?? [], sections, refs: refs.map(r => r.join('\u0000')).sort(common_1.compareText) };
}
const LEGACY_NOTE_SECTIONS = ['Retirement note', 'Refutation reason', 'Deprecation reason'];
const planFile = (dir, id) => path.join(dir, `whyve-migration-${id}.json`);
function checkPlanDir(dir, vault) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const real = (0, filesystem_1.realDirectory)(dir);
    (0, common_1.check)(real !== vault && !real.startsWith(path.join(vault, 'context') + path.sep) && real !== path.join(vault, 'context') && !real.startsWith(path.join(vault, '.whyve-runtime')), 'plan_dir_invalid', 'Keep plans and backups outside the vault context and runtime directories.', { plan_dir: real }, common_1.EXIT.usage);
    return real;
}
async function migrateFormat(project, options) {
    const projectRoot = (0, filesystem_1.realDirectory)(project);
    let vault = options.vault ? (0, filesystem_1.realDirectory)(options.vault) : projectRoot;
    const config = (0, filesystem_1.bytes)(projectRoot, '.whyve/config.json', 8192);
    if (!options.vault && config)
        vault = (0, filesystem_1.realDirectory)(path.resolve(projectRoot, (0, common_1.strictJson)((0, filesystem_1.utf8)(config)).vault ?? '.'));
    (0, common_1.check)(typeof options.planDir === 'string' && options.planDir, 'usage_invalid', 'Provide --plan-dir outside the vault for the plan and backups.');
    const planDir = checkPlanDir(options.planDir, vault), storage = new filesystem_1.Filesystem(vault, { lockTimeoutMs: options.lockTimeoutMs });
    const modes = [options.dryRun, options.applyPlan, options.rollbackPlan].filter(Boolean).length;
    (0, common_1.check)(modes === 1, 'usage_invalid', 'Choose exactly one of --dry-run, --apply-plan FILE or --rollback-plan FILE.');
    if (options.dryRun)
        return storage.locked(() => dryRun(vault, options.refHeaders === undefined ? 'howse' : options.refHeaders, planDir));
    if (options.applyPlan)
        return storage.locked(() => applyPlan(vault, storage, loadPlan(options.applyPlan, vault), planDir));
    return storage.locked(() => rollbackPlan(vault, storage, loadPlan(options.rollbackPlan, vault), planDir));
}
function loadPlan(file, vault) {
    const raw = fs.readFileSync(file, 'utf8'), { digest, ...plan } = (0, common_1.strictJson)(raw, 'plan_invalid');
    (0, common_1.check)(plan.schema === 'whyve-format-migration-plan/v1' && (0, common_1.canonicalDigest)(plan) === digest, 'plan_invalid', 'Migration plan is invalid or was edited.', {}, common_1.EXIT.integrity);
    (0, common_1.check)(plan.vault === vault && (0, common_1.canonicalDigest)(plan.vault_identity) === (0, common_1.canonicalDigest)((0, filesystem_1.identity)(vault)), 'plan_invalid', 'The plan belongs to another vault.', {}, common_1.EXIT.conflict);
    return plan;
}
function dryRun(vault, preset, planDir) {
    const format = (0, vault_1.detectFormat)(vault);
    if (format === 'v3')
        return { schema: 'whyve-format-migration-result/v1', status: 'already_v3', vault };
    (0, common_1.check)(format === 'v2', 'context_root_missing', 'No v2 vault was found.', { vault }, common_1.EXIT.notFound);
    const areas = (0, catalog_1.registeredAreas)(vault), warnings = [], blockers = [];
    const kinds = areas.map(a => a.row.area).filter(model_1.isKind).sort(common_1.compareText);
    for (const a of areas.filter(a => !(0, model_1.isKind)(a.row.area)))
        blockers.push({ code: 'unknown_area', path: a.row.path });
    const files = [];
    walk(vault, 'context', files);
    const git = gitStatus(vault, files);
    const inventory = files.sort(common_1.compareText).map(p => {
        const s = fs.lstatSync(path.join(vault, p));
        (0, common_1.check)(s.isFile() && !s.isSymbolicLink(), 'path_unsafe', 'Vault context contains a non-regular file.', { path: p }, common_1.EXIT.integrity);
        return { path: p, sha256: (0, common_1.sha256)(fs.readFileSync(path.join(vault, p))), mode: s.mode & 0o777, git: git.get(p) };
    });
    const converted = [];
    const known = new Set([vault_1.ROOT_INDEX]);
    for (const area of areas.filter(a => (0, model_1.isKind)(a.row.area))) {
        known.add(area.row.path);
        for (const relative of (0, catalog_1.listArtifactPaths)(vault, area.row.area)) {
            known.add(relative);
            const content = (0, filesystem_1.utf8)(fs.readFileSync(path.join(vault, relative))), state = relative.startsWith(`context/${area.row.area}/retired/`) ? 'history' : 'current';
            try {
                const doc = (0, documents_1.parseDocument)(content, area.descriptor), { record, notes } = (0, legacy_1.convertV2)(doc, state, preset);
                converted.push({ loaded: { id: doc.frontmatter.id, kind: area.row.area, state, path: relative, digest: (0, common_1.sha256)(Buffer.from(content, 'utf8')) }, record, notes, projection: projectV2(doc, state, preset) });
            }
            catch (error) {
                if (!(error instanceof common_1.WhyveError))
                    throw error;
                blockers.push({ code: error.code, path: relative, detail: error.message.slice(0, 300) });
            }
        }
    }
    for (const p of inventory.map(i => i.path).filter(p => !known.has(p)))
        warnings.push({ code: 'unmanaged_file_preserved', path: p });
    const ids = new Map();
    for (const c of converted) {
        if (ids.has(c.loaded.id))
            blockers.push({ code: 'duplicate_id', id: c.loaded.id, path: c.loaded.path });
        ids.set(c.loaded.id, c.loaded.path);
    }
    // New paths are allocated in (kind, state, created_at, id) order so the plan is deterministic.
    converted.sort((a, b) => (0, common_1.compareText)(a.loaded.kind, b.loaded.kind) || (0, common_1.compareText)(a.loaded.state, b.loaded.state) || (0, common_1.compareText)(a.record.headers.created_at, b.record.headers.created_at) || (0, common_1.compareText)(a.loaded.id, b.loaded.id));
    // On case-insensitive or normalizing filesystems a new name that folds to another record's old name would overwrite
    // it, and removing that old path would then delete the new file. New names therefore avoid every other old name in
    // their directory; a record whose new name folds to its own old name keeps the old spelling in place.
    const taken = new Map(), moves = new Map(), oldNames = new Map();
    for (const c of converted) {
        const dir = path.posix.dirname(c.loaded.path), names = oldNames.get(dir) ?? new Map();
        names.set((0, common_1.normalizedKey)(path.posix.basename(c.loaded.path)), c.loaded.path);
        oldNames.set(dir, names);
    }
    for (const c of converted) {
        const directory = `context/${c.loaded.kind}${c.loaded.state === 'history' ? '/retired' : ''}`, used = taken.get(directory) ?? new Set();
        taken.set(directory, used);
        const stem = (0, record_1.baseFilename)(c.loaded.kind, c.record.headers.title, c.record.headers.created_at), own = path.posix.basename(c.loaded.path);
        const others = oldNames.get(directory) ?? new Map();
        const name = path.posix.dirname(c.loaded.path) === directory && (0, common_1.normalizedKey)(own) === (0, common_1.normalizedKey)(stem + '.md') && !used.has((0, common_1.normalizedKey)(own)) ? own
            : (0, record_1.allocateFilename)(stem, n => used.has(n) || (others.has(n) && others.get(n) !== c.loaded.path));
        used.add((0, common_1.normalizedKey)(name));
        moves.set(c.loaded.path, `${directory}/${name}`);
    }
    const records = [], linkRewrites = [];
    for (const c of converted) {
        const to = moves.get(c.loaded.path);
        for (const s of c.record.sections) {
            if (c.loaded.kind === 'archive')
                continue;
            const next = rewriteLinks(s.text, path.posix.dirname(c.loaded.path), path.posix.dirname(to), moves, warnings, c.loaded.id);
            if (next !== s.text) {
                linkRewrites.push({ id: c.loaded.id, from: c.loaded.path, to });
                s.text = next;
            }
        }
        for (const note of c.notes)
            if (!['captured_from_dropped'].includes(note.code))
                warnings.push({ code: note.code, id: c.loaded.id, detail: note.field ?? note.detail });
        try {
            const content = (0, record_1.renderRecord)(c.record);
            records.push({ id: c.loaded.id, kind: c.loaded.kind, state: c.loaded.state, from: c.loaded.path, to, before: c.loaded.digest, after: (0, common_1.sha256)((0, common_1.fileBytes)(content)), content, notes: c.notes });
        }
        catch (error) {
            if (!(error instanceof common_1.WhyveError))
                throw error;
            blockers.push({ code: error.code, id: c.loaded.id, path: c.loaded.path, detail: error.message.slice(0, 300) });
        }
    }
    const loaded = [];
    for (const r of records) {
        try {
            loaded.push((0, vault_1.loadV3)(r.to, r.content, r.kind));
        }
        catch (error) {
            if (error instanceof common_1.WhyveError)
                blockers.push({ code: error.code, id: r.id, path: r.to, detail: error.message.slice(0, 300) });
            else
                throw error;
        }
    }
    for (const [name, fn] of [['relations', () => (0, vault_1.validateRelations)(loaded)], ['slots', () => (0, vault_1.validateSlots)(loaded, new Set(loaded.map(l => l.id)), new Set(), true)]]) {
        try {
            fn();
        }
        catch (error) {
            if (error instanceof common_1.WhyveError)
                blockers.push({ code: error.code, detail: `${name}: ${error.message} ${JSON.stringify(error.details).slice(0, 200)}` });
            else
                throw error;
        }
    }
    // Every planned record must keep its meaning after a real parse of the rendered bytes.
    for (const c of converted) {
        const r = records.find(x => x.id === c.loaded.id);
        if (!r)
            continue;
        const parsed = projectV3((0, record_1.parseRecordText)(r.content)), expected = { ...c.projection, sections: Object.fromEntries(Object.entries(c.projection.sections).map(([k, v]) => [k, c.record.sections.find(s => (s.name ?? s.title) === k)?.text ?? v])) };
        if (c.loaded.kind === 'decision' && !('Revisit conditions' in c.projection.sections) && 'Revisit conditions' in parsed.sections)
            delete parsed.sections['Revisit conditions'];
        if ((0, common_1.canonicalDigest)(parsed) !== (0, common_1.canonicalDigest)(expected))
            blockers.push({ code: 'semantic_mismatch', id: c.loaded.id, path: c.loaded.path, detail: JSON.stringify(Object.keys(parsed).filter(k => (0, common_1.canonicalDigest)(parsed[k]) !== (0, common_1.canonicalDigest)(expected[k]))) });
    }
    const catalogFiles = new Map([[vault_1.ROOT_INDEX, (0, vault_1.renderRoot)(kinds)], [vault_1.REGISTRY, (0, vault_1.renderRegistry)(kinds)]]);
    const view = { projections: [] };
    for (const kind of kinds) {
        let text = (0, vault_1.emptyArea)(kind);
        for (const state of ['current', 'history'])
            text = (0, documents_2.replaceBlock)(text, state, loaded.filter(l => l.kind === kind && l.state === state).sort((a, b) => (0, common_1.compareText)(a.record.headers.created_at, b.record.headers.created_at) || (0, common_1.compareText)(a.id, b.id)).map(l => (0, vault_1.rowOf)(l, view.projections).rawLine));
        catalogFiles.set((0, vault_1.areaIndexPath)(kind), text);
    }
    const catalog = [...catalogFiles.entries()].map(([p, content]) => ({ path: p, before: (0, filesystem_1.digestOrNull)(vault, p), content: p === vault_1.REGISTRY ? content : (0, filesystem_1.utf8)((0, common_1.fileBytes)(content)) }));
    const removals = records.filter(r => r.from !== r.to && !records.some(x => (0, common_1.normalizedKey)(x.to) === (0, common_1.normalizedKey)(r.from))).map(r => ({ path: r.from, before: r.before }));
    // One journaled transaction per vault: keep it within what recovery can read back after a crash.
    const entries = records.length + removals.length + catalogFiles.size, journalBytes = records.reduce((sum, r) => sum + 2 * Buffer.byteLength(r.content), 0) * 1.4;
    if (entries > filesystem_1.JOURNAL_MAX_ENTRIES || journalBytes > filesystem_1.JOURNAL_MAX_BYTES * 0.9)
        blockers.push({ code: 'transaction_too_large', detail: `${entries} file changes, about ${Math.round(journalBytes / 1048576)} MiB of journal; migrate in parts.` });
    const base = {
        schema: 'whyve-format-migration-plan/v1', plan_id: '', created_at: new Date().toISOString(), runtime: common_1.VERSION, from: 'context-common/v2', to: 'context-common/v3',
        vault, vault_identity: (0, filesystem_1.identity)(vault), ref_headers: preset, inventory, records, catalog, removals, link_rewrites: linkRewrites, warnings, blockers,
        summary: { records: records.length, by_kind: Object.fromEntries(kinds.map(k => [k, records.filter(r => r.kind === k).length])), current: records.filter(r => r.state === 'current').length, history: records.filter(r => r.state === 'history').length,
            renamed: records.filter(r => r.from !== r.to).length, warnings: warnings.length, blockers: blockers.length, max_file_bytes: Math.max(0, ...records.map(r => Buffer.byteLength(r.content))) },
    };
    base.plan_id = 'mig_' + (0, common_1.canonicalDigest)({ ...base, created_at: null, plan_id: null }).slice(7, 31);
    const plan = { ...base, digest: (0, common_1.canonicalDigest)(base) }, file = planFile(planDir, base.plan_id);
    fs.writeFileSync(file, JSON.stringify(plan) + '\n', { mode: 0o600 });
    return { schema: 'whyve-format-migration-result/v1', status: blockers.length ? 'blocked' : 'planned', vault, plan_id: base.plan_id, plan_file: file, summary: base.summary, warnings: warnings.slice(0, 50), blockers: blockers.slice(0, 50) };
}
function applyPlan(vault, storage, plan, planDir) {
    (0, common_1.check)(!plan.blockers.length, 'migration_blocked', 'Resolve the blockers and create a new plan.', { blockers: plan.blockers.slice(0, 20) }, common_1.EXIT.conflict);
    const targets = [...plan.records.map(r => ({ path: r.to, after: r.after })), ...plan.catalog.map(c => ({ path: c.path, after: (0, common_1.sha256)(c.path === vault_1.REGISTRY ? Buffer.from(c.content) : (0, common_1.fileBytes)(c.content)) }))];
    if ((0, vault_1.detectFormat)(vault) === 'v3' && targets.every(t => (0, filesystem_1.digestOrNull)(vault, t.path) === t.after) && plan.removals.every(r => (0, filesystem_1.digestOrNull)(vault, r.path) === null))
        return { schema: 'whyve-format-migration-result/v1', status: 'already_applied', vault, plan_id: plan.plan_id, verification: verify(vault, plan) };
    for (const item of plan.inventory)
        (0, common_1.check)((0, filesystem_1.digestOrNull)(vault, item.path) === item.sha256, 'stale_input', 'The vault changed after the plan. Stop every writer and create a new plan.', { path: item.path }, common_1.EXIT.conflict);
    const files = [];
    walk(vault, 'context', files);
    (0, common_1.check)(files.length === plan.inventory.length, 'stale_input', 'Files were added after the plan. Create a new plan.', { files: files.length, planned: plan.inventory.length }, common_1.EXIT.conflict);
    // Backup every original byte and mode outside the vault before the transaction.
    const backup = path.join(planDir, `backup-${plan.plan_id}`);
    (0, common_1.check)(!fs.existsSync(backup) || fs.readdirSync(backup).length === 0, 'backup_exists', 'A backup for this plan already exists; inspect it before retrying.', { backup }, common_1.EXIT.conflict);
    for (const item of plan.inventory) {
        const target = path.join(backup, item.path);
        fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
        fs.copyFileSync(path.join(vault, item.path), target);
        (0, common_1.check)((0, common_1.sha256)(fs.readFileSync(target)) === item.sha256, 'backup_failed', 'Backup bytes differ from the original.', { path: item.path }, common_1.EXIT.integrity);
    }
    const registry = (0, filesystem_1.bytes)(vault, vault_1.REGISTRY);
    fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({ schema: 'whyve-format-migration-backup/v1', plan_id: plan.plan_id, vault, inventory: plan.inventory, registry_before: registry ? (0, common_1.sha256)(registry) : null }, null, 1) + '\n', { mode: 0o600 });
    const changes = [];
    const created = new Set(plan.records.map(r => r.to));
    for (const r of plan.records)
        changes.push({ path: r.to, content: (0, common_1.fileBytes)(r.content), expected: r.from === r.to ? r.before : (0, filesystem_1.digestOrNull)(vault, r.to) });
    for (const r of plan.removals)
        if (!created.has(r.path))
            changes.push({ path: r.path, content: null, expected: r.before });
    for (const c of plan.catalog)
        changes.push({ path: c.path, content: c.path === vault_1.REGISTRY ? Buffer.from(c.content) : (0, common_1.fileBytes)(c.content), expected: c.before });
    const changed = storage.transaction(changes);
    const verification = verify(vault, plan);
    const receipt = { schema: 'whyve-format-migration-receipt/v1', plan_id: plan.plan_id, vault, applied_at: new Date().toISOString(), changed_paths: changed.length, backup, verification };
    fs.writeFileSync(path.join(planDir, `whyve-migration-${plan.plan_id}.receipt.json`), JSON.stringify(receipt, null, 1) + '\n', { mode: 0o600 });
    return { schema: 'whyve-format-migration-result/v1', status: 'migrated', vault, plan_id: plan.plan_id, changed_paths: changed.length, backup, verification };
}
function verify(vault, plan) {
    const view = new vault_1.VaultView(vault), records = view.scan();
    const expected = new Map(plan.records.map(r => [r.id, r]));
    (0, common_1.check)(records.length === plan.records.length && records.every(r => expected.get(r.id)?.to === r.path && expected.get(r.id)?.state === r.state && expected.get(r.id)?.after === r.digest), 'verification_failed', 'Migrated records differ from the plan.', {}, common_1.EXIT.integrity);
    (0, vault_1.validateRelations)(records);
    (0, vault_1.validateSlots)(records, new Set(records.map(r => r.id)), new Set(), true);
    const drift = view.kinds.filter(k => view.renderArea(k, records) !== (0, filesystem_1.utf8)((0, filesystem_1.bytes)(vault, (0, vault_1.areaIndexPath)(k)) ?? Buffer.alloc(0)));
    (0, common_1.check)(!drift.length, 'verification_failed', 'Index projection differs after migration.', { kinds: drift }, common_1.EXIT.integrity);
    const archives = plan.records.filter(r => r.kind === 'archive');
    return { records: records.length, current: records.filter(r => r.state === 'current').length, history: records.filter(r => r.state === 'history').length, ids: (0, common_1.canonicalDigest)(records.map(r => r.id).sort(common_1.compareText)), index_rows_roundtrip: true, archives: archives.length, relations_valid: true };
}
function rollbackPlan(vault, storage, plan, planDir) {
    const backup = path.join(planDir, `backup-${plan.plan_id}`), manifest = (0, common_1.strictJson)(fs.readFileSync(path.join(backup, 'manifest.json'), 'utf8'));
    (0, common_1.check)(manifest.plan_id === plan.plan_id, 'backup_invalid', 'Backup manifest belongs to another plan.', {}, common_1.EXIT.integrity);
    // Only an untouched migration result may be replaced by the backup; later writes need a separate plan.
    for (const r of plan.records)
        (0, common_1.check)((0, filesystem_1.digestOrNull)(vault, r.to) === r.after, 'rollback_refused', 'The vault changed after migration; a backup restore would lose those writes.', { path: r.to }, common_1.EXIT.conflict);
    for (const c of plan.catalog)
        (0, common_1.check)((0, filesystem_1.digestOrNull)(vault, c.path) === (0, common_1.sha256)(c.path === vault_1.REGISTRY ? Buffer.from(c.content) : (0, common_1.fileBytes)(c.content)), 'rollback_refused', 'The catalog changed after migration.', { path: c.path }, common_1.EXIT.conflict);
    const changes = [], originals = new Set(plan.inventory.map(i => i.path));
    for (const r of plan.records)
        if (!originals.has(r.to))
            changes.push({ path: r.to, content: null, expected: r.after });
    for (const c of plan.catalog)
        if (!originals.has(c.path))
            changes.push({ path: c.path, content: null, expected: (0, common_1.sha256)(c.path === vault_1.REGISTRY ? Buffer.from(c.content) : (0, common_1.fileBytes)(c.content)) });
    for (const item of plan.inventory) {
        const content = fs.readFileSync(path.join(backup, item.path));
        (0, common_1.check)((0, common_1.sha256)(content) === item.sha256, 'backup_invalid', 'Backup bytes changed.', { path: item.path }, common_1.EXIT.integrity);
        changes.push({ path: item.path, content, expected: (0, filesystem_1.digestOrNull)(vault, item.path), mode: item.mode });
    }
    const changed = storage.transaction(changes);
    try {
        fs.rmdirSync(path.join(vault, '.whyve/owners'));
    }
    catch { /* not empty or absent */ }
    for (const item of plan.inventory)
        (0, common_1.check)((0, filesystem_1.digestOrNull)(vault, item.path) === item.sha256, 'verification_failed', 'Restored bytes differ.', { path: item.path }, common_1.EXIT.integrity);
    return { schema: 'whyve-format-migration-result/v1', status: 'rolled_back', vault, plan_id: plan.plan_id, changed_paths: changed.length, format: (0, vault_1.detectFormat)(vault) === 'v2' ? 'context-common/v2' : model_1.MODEL.protocol };
}
