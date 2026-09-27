import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ObjectValue, check, fail, canonicalDigest, compareText, strictJson, sha256, fileBytes, normalizedKey, canonicalScope, canonicalKey, EXIT, VERSION, WhyveError } from './common';
import { Filesystem, FileChange, realDirectory, bytes, utf8, digestOrNull, identity, JOURNAL_MAX_ENTRIES, JOURNAL_MAX_BYTES } from './filesystem';
import { MODEL, spec, isKind } from './model';
import { StoredRecord, renderRecord, parseRecordText, baseFilename, allocateFilename, sectionSpec } from './record';
import { registeredAreas as legacyAreas, listArtifactPaths as legacyPaths } from './catalog';
import { parseDocument, sectionName } from './documents';
import { convertV2, legacyKind, HOWSE_REFS, RefHeaderPreset, LegacyNote } from './legacy';
import { ROOT_INDEX, REGISTRY, VaultView, Loaded, loadV3, areaIndexPath, renderRegistry, renderRoot, emptyArea, rowOf, validateRelations, validateSlots, detectFormat } from './vault';
import { replaceBlock } from './documents';
import type { Kind } from './host-types';

/**
 * Explicit context-common/v2 → v3 conversion of one vault (design section 10).
 * Dry-run freezes a plan (every before/after byte); apply re-checks it under the vault lock, backs up
 * the originals outside the vault, writes one journaled transaction and verifies the result.
 */
export interface MigrateFormatOptions {
    vault?: string;
    planDir: string;
    dryRun?: boolean;
    applyPlan?: string;
    rollbackPlan?: string;
    refHeaders?: RefHeaderPreset;
    lockTimeoutMs?: number;
}
interface PlanRecord { id: string; kind: Kind; state: 'current' | 'history'; from: string; to: string; before: string; after: string; content: string; notes: LegacyNote[] }
interface Plan {
    schema: 'whyve-format-migration-plan/v1';
    plan_id: string;
    created_at: string;
    runtime: string;
    from: 'context-common/v2';
    to: 'context-common/v3';
    vault: string;
    vault_identity: ObjectValue;
    ref_headers: RefHeaderPreset;
    inventory: { path: string; sha256: string; mode: number; git: 'tracked' | 'untracked' | 'unknown' }[];
    records: PlanRecord[];
    catalog: { path: string; before: string | null; content: string }[];
    removals: { path: string; before: string }[];
    link_rewrites: { id: string; from: string; to: string }[];
    warnings: { code: string; id?: string; path?: string; detail?: string }[];
    blockers: { code: string; id?: string; path?: string; detail?: string }[];
    summary: ObjectValue;
}
const LINK = /\]\(([^)\s]+)\)|\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
function walk(root: string, relative: string, out: string[]): void {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
        const child = relative + '/' + entry.name;
        if (entry.isDirectory()) walk(root, child, out);
        else out.push(child);
    }
}
function gitStatus(vault: string, paths: string[]): Map<string, 'tracked' | 'untracked' | 'unknown'> {
    const result = spawnSync('git', ['-C', vault, 'ls-files', '-z', '--', 'context'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const status = new Map<string, 'tracked' | 'untracked' | 'unknown'>();
    if (result.status !== 0) { for (const p of paths) status.set(p, 'unknown'); return status; }
    const tracked = new Set(result.stdout.split('\0').filter(Boolean));
    for (const p of paths) status.set(p, tracked.has(p) ? 'tracked' : 'untracked');
    return status;
}
/** Rewrites path links to moved records outside code fences; other mentions are reported, not changed. */
function rewriteLinks(text: string, fromDir: string, toDir: string, moves: Map<string, string>, warnings: Plan['warnings'], id: string): string {
    let fence: string | undefined;
    return text.split('\n').map(line => {
        const f = /^\s*(```+|~~~+)/.exec(line)?.[1][0];
        if (f) { fence = fence === f ? undefined : fence ?? f; return line; }
        if (fence) { if ([...moves.keys()].some(p => line.includes(path.posix.basename(p)))) warnings.push({ code: 'path_mention_in_code_unchanged', id }); return line; }
        return line.replace(LINK, (whole, markdown: string | undefined, wiki: string | undefined) => {
            const target = markdown ?? wiki!;
            if (/^[a-z]+:/i.test(target) || target.startsWith('#')) return whole;
            let decoded: string;
            try { decoded = markdown ? decodeURI(target.split('#')[0]) : target; } catch { return whole; }
            const resolved = markdown ? path.posix.normalize(path.posix.join(fromDir, decoded)) : (decoded.endsWith('.md') ? decoded : decoded + '.md');
            const moved = moves.get(resolved);
            if (!moved) return whole;
            if (markdown) return `](${encodeURI(path.posix.relative(toDir, moved))}${target.includes('#') ? target.slice(target.indexOf('#')) : ''})`;
            return whole.replace(target, moved.replace(/\.md$/, ''));
        });
    }).join('\n');
}
/** Independent semantic projection used to verify that no meaning was lost (not a reuse of the converter). */
function projectV2(doc: ReturnType<typeof parseDocument>, state: string, preset: RefHeaderPreset): ObjectValue {
    const fm = doc.frontmatter, kind = legacyKind(fm.schema), refs: string[][] = [];
    for (const ref of fm.source_refs ?? []) {
        const m = preset === 'howse' ? /^howse:([a-z-]+):(.+)$/.exec(ref) : null;
        refs.push(m && HOWSE_REFS[m[1]] ? ['header', HOWSE_REFS[m[1]], m[2]] : ['source', ref]);
    }
    for (const [p, ids] of Object.entries((fm.relations ?? {}) as Record<string, string[]>)) for (const id of ids) refs.push([p, id]);
    for (const id of fm.supersedes ?? []) refs.push(['supersedes', id]);
    if (fm.superseded_by) refs.push(['superseded-by', fm.superseded_by]);
    const sections: Record<string, string> = {};
    for (const [title, text] of Object.entries(doc.sections)) sections[sectionName(fm.schema, title)] = text;
    return { id: fm.id, kind, state, title: fm.title, summary: fm.summary, scope: fm.scope ?? 'global', key: fm.decision_key ?? fm.intent_key ?? fm.document_key ?? (fm.term ? canonicalKey(fm.term) : ''),
        created: fm.created_at, updated: fm.updated_at ?? '', retired: state === 'history' ? [fm.retired_at, fm.retired_reason] : null, keywords: [...new Set(fm.search_terms ?? [])], tags: [...new Set(fm.tags ?? [])],
        sections, refs: refs.map(r => r.join('\u0000')).sort(compareText) };
}
function projectV3(record: StoredRecord): ObjectValue {
    const h = record.headers, refs: string[][] = [];
    for (const [key, value] of Object.entries(h)) if (key.startsWith('howse.')) for (const v of Array.isArray(value) ? value : [value]) refs.push(['header', key, v]);
    for (const s of record.sources) if (!['retirement-note', 'refutation-reason', 'deprecation-reason', 'replacement-term', 'evidence', 'impacts:decision', 'related-term', 'affects-path', 'revisit-when'].includes(s.relation)) refs.push([s.relation, s.ref]);
    const sections: Record<string, string> = {};
    for (const s of record.sections) if (s.name || !LEGACY_NOTE_SECTIONS.includes(s.title)) sections[s.name ?? s.title] = s.text;
    return { id: h.id, kind: h.kind, state: h.state, title: h.title, summary: h.summary, scope: h.scope, key: h.key ?? '', created: h.created_at, updated: h.updated_at ?? '',
        retired: h.state === 'history' ? [h.retired_at, h.lifecycle_reason] : null, keywords: h.keywords ?? [], tags: h.tags ?? [], sections, refs: refs.map(r => r.join('\u0000')).sort(compareText) };
}
const LEGACY_NOTE_SECTIONS = ['Retirement note', 'Refutation reason', 'Deprecation reason'];
const planFile = (dir: string, id: string) => path.join(dir, `whyve-migration-${id}.json`);
function checkPlanDir(dir: string, vault: string): string {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const real = realDirectory(dir);
    check(real !== vault && !real.startsWith(path.join(vault, 'context') + path.sep) && real !== path.join(vault, 'context') && !real.startsWith(path.join(vault, '.whyve-runtime')), 'plan_dir_invalid', 'Keep plans and backups outside the vault context and runtime directories.', { plan_dir: real }, EXIT.usage);
    return real;
}

export async function migrateFormat(project: string, options: MigrateFormatOptions): Promise<ObjectValue> {
    const projectRoot = realDirectory(project);
    let vault = options.vault ? realDirectory(options.vault) : projectRoot;
    const config = bytes(projectRoot, '.whyve/config.json', 8192);
    if (!options.vault && config) vault = realDirectory(path.resolve(projectRoot, strictJson(utf8(config)).vault ?? '.'));
    check(typeof options.planDir === 'string' && options.planDir, 'usage_invalid', 'Provide --plan-dir outside the vault for the plan and backups.');
    const planDir = checkPlanDir(options.planDir, vault), storage = new Filesystem(vault, { lockTimeoutMs: options.lockTimeoutMs });
    const modes = [options.dryRun, options.applyPlan, options.rollbackPlan].filter(Boolean).length;
    check(modes === 1, 'usage_invalid', 'Choose exactly one of --dry-run, --apply-plan FILE or --rollback-plan FILE.');
    if (options.dryRun) return storage.locked(() => dryRun(vault, options.refHeaders === undefined ? 'howse' : options.refHeaders, planDir));
    if (options.applyPlan) return storage.locked(() => applyPlan(vault, storage, loadPlan(options.applyPlan!, vault), planDir));
    return storage.locked(() => rollbackPlan(vault, storage, loadPlan(options.rollbackPlan!, vault), planDir));
}
function loadPlan(file: string, vault: string): Plan {
    const raw = fs.readFileSync(file, 'utf8'), { digest, ...plan } = strictJson(raw, 'plan_invalid');
    check(plan.schema === 'whyve-format-migration-plan/v1' && canonicalDigest(plan) === digest, 'plan_invalid', 'Migration plan is invalid or was edited.', {}, EXIT.integrity);
    check(plan.vault === vault && canonicalDigest(plan.vault_identity) === canonicalDigest(identity(vault)), 'plan_invalid', 'The plan belongs to another vault.', {}, EXIT.conflict);
    return plan as Plan;
}
function dryRun(vault: string, preset: RefHeaderPreset, planDir: string): ObjectValue {
    const format = detectFormat(vault);
    if (format === 'v3') return { schema: 'whyve-format-migration-result/v1', status: 'already_v3', vault };
    check(format === 'v2', 'context_root_missing', 'No v2 vault was found.', { vault }, EXIT.notFound);
    const areas = legacyAreas(vault), warnings: Plan['warnings'] = [], blockers: Plan['blockers'] = [];
    const kinds = areas.map(a => a.row.area).filter(isKind).sort(compareText) as Kind[];
    for (const a of areas.filter(a => !isKind(a.row.area))) blockers.push({ code: 'unknown_area', path: a.row.path });
    const files: string[] = [];
    walk(vault, 'context', files);
    const git = gitStatus(vault, files);
    const inventory = files.sort(compareText).map(p => {
        const s = fs.lstatSync(path.join(vault, p));
        check(s.isFile() && !s.isSymbolicLink(), 'path_unsafe', 'Vault context contains a non-regular file.', { path: p }, EXIT.integrity);
        return { path: p, sha256: sha256(fs.readFileSync(path.join(vault, p))), mode: s.mode & 0o777, git: git.get(p)! };
    });
    const converted: { loaded: { id: string; kind: Kind; state: 'current' | 'history'; path: string; digest: string }; record: StoredRecord; notes: LegacyNote[]; projection: ObjectValue }[] = [];
    const known = new Set<string>([ROOT_INDEX]);
    for (const area of areas.filter(a => isKind(a.row.area))) {
        known.add(area.row.path);
        for (const relative of legacyPaths(vault, area.row.area)) {
            known.add(relative);
            const content = utf8(fs.readFileSync(path.join(vault, relative))), state = relative.startsWith(`context/${area.row.area}/retired/`) ? 'history' : 'current';
            try {
                const doc = parseDocument(content, area.descriptor), { record, notes } = convertV2(doc, state, preset);
                converted.push({ loaded: { id: doc.frontmatter.id, kind: area.row.area as Kind, state, path: relative, digest: sha256(Buffer.from(content, 'utf8')) }, record, notes, projection: projectV2(doc, state, preset) });
            }
            catch (error) {
                if (!(error instanceof WhyveError)) throw error;
                blockers.push({ code: error.code, path: relative, detail: error.message.slice(0, 300) });
            }
        }
    }
    for (const p of inventory.map(i => i.path).filter(p => !known.has(p))) warnings.push({ code: 'unmanaged_file_preserved', path: p });
    const ids = new Map<string, string>();
    for (const c of converted) { if (ids.has(c.loaded.id)) blockers.push({ code: 'duplicate_id', id: c.loaded.id, path: c.loaded.path }); ids.set(c.loaded.id, c.loaded.path); }
    // New paths are allocated in (kind, state, created_at, id) order so the plan is deterministic.
    converted.sort((a, b) => compareText(a.loaded.kind, b.loaded.kind) || compareText(a.loaded.state, b.loaded.state) || compareText(a.record.headers.created_at as string, b.record.headers.created_at as string) || compareText(a.loaded.id, b.loaded.id));
    // On case-insensitive or normalizing filesystems a new name that folds to another record's old name would overwrite
    // it, and removing that old path would then delete the new file. New names therefore avoid every other old name in
    // their directory; a record whose new name folds to its own old name keeps the old spelling in place.
    const taken = new Map<string, Set<string>>(), moves = new Map<string, string>(), oldNames = new Map<string, Map<string, string>>();
    for (const c of converted) {
        const dir = path.posix.dirname(c.loaded.path), names = oldNames.get(dir) ?? new Map<string, string>();
        names.set(normalizedKey(path.posix.basename(c.loaded.path)), c.loaded.path);
        oldNames.set(dir, names);
    }
    for (const c of converted) {
        const directory = `context/${c.loaded.kind}${c.loaded.state === 'history' ? '/retired' : ''}`, used = taken.get(directory) ?? new Set<string>();
        taken.set(directory, used);
        const stem = baseFilename(c.loaded.kind, c.record.headers.title as string, c.record.headers.created_at as string), own = path.posix.basename(c.loaded.path);
        const others = oldNames.get(directory) ?? new Map<string, string>();
        const name = path.posix.dirname(c.loaded.path) === directory && normalizedKey(own) === normalizedKey(stem + '.md') && !used.has(normalizedKey(own)) ? own
            : allocateFilename(stem, n => used.has(n) || (others.has(n) && others.get(n) !== c.loaded.path));
        used.add(normalizedKey(name));
        moves.set(c.loaded.path, `${directory}/${name}`);
    }
    const records: PlanRecord[] = [], linkRewrites: Plan['link_rewrites'] = [];
    for (const c of converted) {
        const to = moves.get(c.loaded.path)!;
        for (const s of c.record.sections) {
            if (c.loaded.kind === 'archive') continue;
            const next = rewriteLinks(s.text, path.posix.dirname(c.loaded.path), path.posix.dirname(to), moves, warnings, c.loaded.id);
            if (next !== s.text) { linkRewrites.push({ id: c.loaded.id, from: c.loaded.path, to }); s.text = next; }
        }
        for (const note of c.notes) if (!['captured_from_dropped'].includes(note.code)) warnings.push({ code: note.code, id: c.loaded.id, detail: note.field ?? note.detail });
        try {
            const content = renderRecord(c.record);
            records.push({ id: c.loaded.id, kind: c.loaded.kind, state: c.loaded.state, from: c.loaded.path, to, before: c.loaded.digest, after: sha256(fileBytes(content)), content, notes: c.notes });
        }
        catch (error) {
            if (!(error instanceof WhyveError)) throw error;
            blockers.push({ code: error.code, id: c.loaded.id, path: c.loaded.path, detail: error.message.slice(0, 300) });
        }
    }
    const loaded: Loaded[] = [];
    for (const r of records) {
        try { loaded.push(loadV3(r.to, r.content, r.kind)); }
        catch (error) { if (error instanceof WhyveError) blockers.push({ code: error.code, id: r.id, path: r.to, detail: error.message.slice(0, 300) }); else throw error; }
    }
    for (const [name, fn] of [['relations', () => validateRelations(loaded)], ['slots', () => validateSlots(loaded, new Set(loaded.map(l => l.id)), new Set(), true)]] as const) {
        try { fn(); } catch (error) { if (error instanceof WhyveError) blockers.push({ code: error.code, detail: `${name}: ${error.message} ${JSON.stringify(error.details).slice(0, 200)}` }); else throw error; }
    }
    // Every planned record must keep its meaning after a real parse of the rendered bytes.
    for (const c of converted) {
        const r = records.find(x => x.id === c.loaded.id);
        if (!r) continue;
        const parsed = projectV3(parseRecordText(r.content)), expected: ObjectValue = { ...c.projection, sections: Object.fromEntries(Object.entries(c.projection.sections).map(([k, v]) => [k, c.record.sections.find(s => (s.name ?? s.title) === k)?.text ?? v])) };
        if (c.loaded.kind === 'decision' && !('Revisit conditions' in c.projection.sections) && 'Revisit conditions' in parsed.sections) delete parsed.sections['Revisit conditions'];
        if (canonicalDigest(parsed) !== canonicalDigest(expected)) blockers.push({ code: 'semantic_mismatch', id: c.loaded.id, path: c.loaded.path, detail: JSON.stringify(Object.keys(parsed).filter(k => canonicalDigest(parsed[k]) !== canonicalDigest(expected[k]))) });
    }
    const catalogFiles = new Map<string, string>([[ROOT_INDEX, renderRoot(kinds)], [REGISTRY, renderRegistry(kinds)]]);
    const view = { projections: [] as string[] };
    for (const kind of kinds) {
        let text = emptyArea(kind);
        for (const state of ['current', 'history'] as const)
            text = replaceBlock(text, state, loaded.filter(l => l.kind === kind && l.state === state).sort((a, b) => compareText(a.record.headers.created_at as string, b.record.headers.created_at as string) || compareText(a.id, b.id)).map(l => rowOf(l, view.projections).rawLine));
        catalogFiles.set(areaIndexPath(kind), text);
    }
    const catalog = [...catalogFiles.entries()].map(([p, content]) => ({ path: p, before: digestOrNull(vault, p), content: p === REGISTRY ? content : utf8(fileBytes(content)) }));
    const removals = records.filter(r => r.from !== r.to && !records.some(x => normalizedKey(x.to) === normalizedKey(r.from))).map(r => ({ path: r.from, before: r.before }));
    // One journaled transaction per vault: keep it within what recovery can read back after a crash.
    const entries = records.length + removals.length + catalogFiles.size, journalBytes = records.reduce((sum, r) => sum + 2 * Buffer.byteLength(r.content), 0) * 1.4;
    if (entries > JOURNAL_MAX_ENTRIES || journalBytes > JOURNAL_MAX_BYTES * 0.9) blockers.push({ code: 'transaction_too_large', detail: `${entries} file changes, about ${Math.round(journalBytes / 1048576)} MiB of journal; migrate in parts.` });
    const base = {
        schema: 'whyve-format-migration-plan/v1' as const, plan_id: '', created_at: new Date().toISOString(), runtime: VERSION, from: 'context-common/v2' as const, to: 'context-common/v3' as const,
        vault, vault_identity: identity(vault), ref_headers: preset, inventory, records, catalog, removals, link_rewrites: linkRewrites, warnings, blockers,
        summary: { records: records.length, by_kind: Object.fromEntries(kinds.map(k => [k, records.filter(r => r.kind === k).length])), current: records.filter(r => r.state === 'current').length, history: records.filter(r => r.state === 'history').length,
            renamed: records.filter(r => r.from !== r.to).length, warnings: warnings.length, blockers: blockers.length, max_file_bytes: Math.max(0, ...records.map(r => Buffer.byteLength(r.content))) },
    };
    base.plan_id = 'mig_' + canonicalDigest({ ...base, created_at: null, plan_id: null }).slice(7, 31);
    const plan = { ...base, digest: canonicalDigest(base) }, file = planFile(planDir, base.plan_id);
    fs.writeFileSync(file, JSON.stringify(plan) + '\n', { mode: 0o600 });
    return { schema: 'whyve-format-migration-result/v1', status: blockers.length ? 'blocked' : 'planned', vault, plan_id: base.plan_id, plan_file: file, summary: base.summary, warnings: warnings.slice(0, 50), blockers: blockers.slice(0, 50) };
}
function applyPlan(vault: string, storage: Filesystem, plan: Plan, planDir: string): ObjectValue {
    check(!plan.blockers.length, 'migration_blocked', 'Resolve the blockers and create a new plan.', { blockers: plan.blockers.slice(0, 20) }, EXIT.conflict);
    const targets = [...plan.records.map(r => ({ path: r.to, after: r.after })), ...plan.catalog.map(c => ({ path: c.path, after: sha256(c.path === REGISTRY ? Buffer.from(c.content) : fileBytes(c.content)) }))];
    if (detectFormat(vault) === 'v3' && targets.every(t => digestOrNull(vault, t.path) === t.after) && plan.removals.every(r => digestOrNull(vault, r.path) === null))
        return { schema: 'whyve-format-migration-result/v1', status: 'already_applied', vault, plan_id: plan.plan_id, verification: verify(vault, plan) };
    for (const item of plan.inventory) check(digestOrNull(vault, item.path) === item.sha256, 'stale_input', 'The vault changed after the plan. Stop every writer and create a new plan.', { path: item.path }, EXIT.conflict);
    const files: string[] = [];
    walk(vault, 'context', files);
    check(files.length === plan.inventory.length, 'stale_input', 'Files were added after the plan. Create a new plan.', { files: files.length, planned: plan.inventory.length }, EXIT.conflict);
    // Backup every original byte and mode outside the vault before the transaction.
    const backup = path.join(planDir, `backup-${plan.plan_id}`);
    check(!fs.existsSync(backup) || fs.readdirSync(backup).length === 0, 'backup_exists', 'A backup for this plan already exists; inspect it before retrying.', { backup }, EXIT.conflict);
    for (const item of plan.inventory) {
        const target = path.join(backup, item.path);
        fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
        fs.copyFileSync(path.join(vault, item.path), target);
        check(sha256(fs.readFileSync(target)) === item.sha256, 'backup_failed', 'Backup bytes differ from the original.', { path: item.path }, EXIT.integrity);
    }
    const registry = bytes(vault, REGISTRY);
    fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({ schema: 'whyve-format-migration-backup/v1', plan_id: plan.plan_id, vault, inventory: plan.inventory, registry_before: registry ? sha256(registry) : null }, null, 1) + '\n', { mode: 0o600 });
    const changes: FileChange[] = [];
    const created = new Set(plan.records.map(r => r.to));
    for (const r of plan.records) changes.push({ path: r.to, content: fileBytes(r.content), expected: r.from === r.to ? r.before : digestOrNull(vault, r.to) });
    for (const r of plan.removals) if (!created.has(r.path)) changes.push({ path: r.path, content: null, expected: r.before });
    for (const c of plan.catalog) changes.push({ path: c.path, content: c.path === REGISTRY ? Buffer.from(c.content) : fileBytes(c.content), expected: c.before });
    const changed = storage.transaction(changes);
    const verification = verify(vault, plan);
    const receipt = { schema: 'whyve-format-migration-receipt/v1', plan_id: plan.plan_id, vault, applied_at: new Date().toISOString(), changed_paths: changed.length, backup, verification };
    fs.writeFileSync(path.join(planDir, `whyve-migration-${plan.plan_id}.receipt.json`), JSON.stringify(receipt, null, 1) + '\n', { mode: 0o600 });
    return { schema: 'whyve-format-migration-result/v1', status: 'migrated', vault, plan_id: plan.plan_id, changed_paths: changed.length, backup, verification };
}
function verify(vault: string, plan: Plan): ObjectValue {
    const view = new VaultView(vault), records = view.scan();
    const expected = new Map(plan.records.map(r => [r.id, r]));
    check(records.length === plan.records.length && records.every(r => expected.get(r.id)?.to === r.path && expected.get(r.id)?.state === r.state && expected.get(r.id)?.after === r.digest), 'verification_failed', 'Migrated records differ from the plan.', {}, EXIT.integrity);
    validateRelations(records);
    validateSlots(records, new Set(records.map(r => r.id)), new Set(), true);
    const drift = view.kinds.filter(k => view.renderArea(k, records) !== utf8(bytes(vault, areaIndexPath(k)) ?? Buffer.alloc(0)));
    check(!drift.length, 'verification_failed', 'Index projection differs after migration.', { kinds: drift }, EXIT.integrity);
    const archives = plan.records.filter(r => r.kind === 'archive');
    return { records: records.length, current: records.filter(r => r.state === 'current').length, history: records.filter(r => r.state === 'history').length, ids: canonicalDigest(records.map(r => r.id).sort(compareText)), index_rows_roundtrip: true, archives: archives.length, relations_valid: true };
}
function rollbackPlan(vault: string, storage: Filesystem, plan: Plan, planDir: string): ObjectValue {
    const backup = path.join(planDir, `backup-${plan.plan_id}`), manifest = strictJson(fs.readFileSync(path.join(backup, 'manifest.json'), 'utf8'));
    check(manifest.plan_id === plan.plan_id, 'backup_invalid', 'Backup manifest belongs to another plan.', {}, EXIT.integrity);
    // Only an untouched migration result may be replaced by the backup; later writes need a separate plan.
    for (const r of plan.records) check(digestOrNull(vault, r.to) === r.after, 'rollback_refused', 'The vault changed after migration; a backup restore would lose those writes.', { path: r.to }, EXIT.conflict);
    for (const c of plan.catalog) check(digestOrNull(vault, c.path) === sha256(c.path === REGISTRY ? Buffer.from(c.content) : fileBytes(c.content)), 'rollback_refused', 'The catalog changed after migration.', { path: c.path }, EXIT.conflict);
    const changes: FileChange[] = [], originals = new Set(plan.inventory.map(i => i.path));
    for (const r of plan.records) if (!originals.has(r.to)) changes.push({ path: r.to, content: null, expected: r.after });
    for (const c of plan.catalog) if (!originals.has(c.path)) changes.push({ path: c.path, content: null, expected: sha256(c.path === REGISTRY ? Buffer.from(c.content) : fileBytes(c.content)) });
    for (const item of plan.inventory) {
        const content = fs.readFileSync(path.join(backup, item.path));
        check(sha256(content) === item.sha256, 'backup_invalid', 'Backup bytes changed.', { path: item.path }, EXIT.integrity);
        changes.push({ path: item.path, content, expected: digestOrNull(vault, item.path), mode: item.mode });
    }
    const changed = storage.transaction(changes);
    try { fs.rmdirSync(path.join(vault, '.whyve/owners')); } catch { /* not empty or absent */ }
    for (const item of plan.inventory) check(digestOrNull(vault, item.path) === item.sha256, 'verification_failed', 'Restored bytes differ.', { path: item.path }, EXIT.integrity);
    return { schema: 'whyve-format-migration-result/v1', status: 'rolled_back', vault, plan_id: plan.plan_id, changed_paths: changed.length, format: detectFormat(vault) === 'v2' ? 'context-common/v2' : MODEL.protocol };
}
