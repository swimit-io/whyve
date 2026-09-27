import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { ObjectValue, contracts, check, fail, exact, object, canonicalDigest, canonicalJson, canonicalScope, canonicalKey, compareText, scopesOverlap, strictJson, newId, requireId, timestamp, sha256, fileBytes, normalizedKey, nfc, codepoints, EXIT, VERSION, WhyveError, toWhyveError, withErrors } from './common';
import { Filesystem, FileChange, identity, realDirectory, contained, bytes, readText, utf8, digestOrNull, atomicWrite } from './filesystem';
import { MODEL, KINDS, LIMITS, spec, isKind, MANAGED_RELATIONS } from './model';
import { StoredRecord, recordFromInput, renderRecord, parseHeaderBlock, applyBody, computeFlags, describeFlags, sectionText, baseFilename, allocateFilename, authorizationSources, validateSource, sameSource, validateHeaders, bodyBytes, kindOf, sectionSpec, isHostKey, deriveSummary } from './record';
import { VaultView, Loaded, ROOT_INDEX, REGISTRY, PROJECTIONS, areaIndexPath, detectFormat, renderRoot, renderRegistry, emptyArea, rowOf, validateRelations, validateSlots, slotRelation, slotView, SlotView, stateOfPath } from './vault';
import { compileRegex, REGEX_UNSUPPORTED } from './regex';
import { runtimeDigest } from './runtime';
import type {
    Kind, RecordState, HeaderValue, SourceEntry, Authorization, RecordInput, RecordPatch, Mutation, ListOptions, ListFilters, Row, RowPage, Coverage,
    HeaderSearchOptions, HeaderCondition, IdPage, ReadOptions, RecordRead, ComparisonReceipt, CompareRequest, CompareReason, ComparisonItem, ComparisonPage,
    SemanticReview, Judgment, SlotPage, PrepareRequest, PrepareResult, Prepared, NeedsApproval, NeedsReview, NeedsArchive, PreviewFile, WriteReceipt,
    Capabilities, Status, WhyveHost, PageOptions, ReadReference,
} from './host-types';

export type ApprovalMode = 'explicit' | 'auto' | 'adaptive';
export type Feature = 'decision' | 'assumption' | 'term' | 'intent' | 'document';
export interface WhyveOptions { vault?: string; project?: string; lockTimeoutMs?: number }
export interface InitializeOptions { features?: Feature[]; approvalMode?: ApprovalMode; host?: 'codex' | 'claude-code' }
interface Settings { project: string; config: ObjectValue | null; digest: string | null; mode: ApprovalMode; enabled: Kind[] | null }
const FEATURES: Feature[] = ['decision', 'assumption', 'term', 'intent', 'document'];
const BUILTINS: Kind[] = ['snapshot', 'observation', 'archive'];
const PREPARED_DIR = '.whyve-runtime/prepared';
const PREPARED_TTL_MS = 7 * 86400000;

function loadSettings(project: string): Settings {
    const raw = bytes(project, '.whyve/config.json', 8192);
    if (!raw) return { project, config: null, digest: null, mode: 'explicit', enabled: null };
    const config = strictJson(utf8(raw), 'config_invalid');
    exact(config, ['schema', 'features', 'approval', 'vault'], 'config_invalid');
    exact(config.approval, ['mode'], 'config_invalid');
    check(config.schema === 'whyve-project/v1' && Array.isArray(config.features) && config.features.every((x: string) => FEATURES.includes(x as Feature)) && new Set(config.features).size === config.features.length && ['explicit', 'auto', 'adaptive'].includes(config.approval.mode) && typeof config.vault === 'string' && !!config.vault && !config.vault.includes('\0'), 'config_invalid', 'Invalid Whyve project configuration.');
    return { project, config, digest: sha256(raw), mode: config.approval.mode, enabled: [...BUILTINS, ...config.features] };
}

// ---------------------------------------------------------------- cursors
interface CursorBody { v: 3; method: string; vault: string; request: string; snapshot: string; offset: number; extra?: ObjectValue }
const encodeCursor = (body: CursorBody) => Buffer.from(canonicalJson(body), 'utf8').toString('base64url');
function openCursor(cursor: unknown, expected: Omit<CursorBody, 'v' | 'offset' | 'extra'>, total: number): { offset: number; extra?: ObjectValue } {
    if (cursor === undefined || cursor === null) return { offset: 0 };
    const invalid = (): never => fail('cursor_invalid', 'Cursor does not belong to this request; repeat the request without a cursor.');
    if (typeof cursor !== 'string' || cursor.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(cursor)) invalid();
    let body: any;
    try { body = strictJson(Buffer.from(cursor as string, 'base64url').toString('utf8'), 'cursor_invalid'); } catch { invalid(); }
    check(object(body) && body.v === 3 && body.method === expected.method && body.vault === expected.vault && body.request === expected.request && Number.isSafeInteger(body.offset) && body.offset >= 0 && body.offset <= total, 'cursor_invalid', 'Cursor does not belong to this request; repeat the request without a cursor.');
    check(body.snapshot === expected.snapshot, 'cursor_stale', 'The selected set changed since this cursor was issued; restart from the first page.', {}, EXIT.conflict);
    return { offset: body.offset, extra: body.extra };
}
function pageLimit(value: unknown, fallback: number, maximum: number): number {
    const limit = value === undefined ? fallback : value;
    check(Number.isSafeInteger(limit) && (limit as number) >= 1 && (limit as number) <= maximum, 'usage_invalid', `limit must be an integer from 1 to ${maximum}.`);
    return limit as number;
}
function byteLimit(value: unknown): number {
    const limit = value === undefined ? LIMITS.read_default_bytes : value;
    check(Number.isSafeInteger(limit) && (limit as number) >= 256 && (limit as number) <= LIMITS.read_max_bytes, 'usage_invalid', `maxBytes must be an integer from 256 to ${LIMITS.read_max_bytes}.`);
    return limit as number;
}
function options<T>(value: unknown, keys: string[], name: string): T {
    if (value === undefined) return {} as T;
    check(object(value) && Object.keys(value).every(k => keys.includes(k)), 'usage_invalid', `${name} accepts only: ${keys.join(', ')}.`, { unknown: object(value) ? Object.keys(value).filter(k => !keys.includes(k)) : [] });
    return value as T;
}

// ---------------------------------------------------------------- header scanning
/** Reads only the opening header block (at most 16 KiB); record bodies are never read. */
export function readHeaders(root: string, relative: string): Record<string, HeaderValue> {
    const target = contained(root, relative), fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try {
        const buffer = Buffer.alloc(LIMITS.header_bytes + 1), read = fs.readSync(fd, buffer, 0, buffer.length, 0);
        let text = buffer.subarray(0, read).toString('utf8');
        const close = text.indexOf('\n---\n');
        check(close > 0 && close + 5 <= LIMITS.header_bytes, 'header_invalid', 'Header block is missing or larger than 16 KiB.', { path: relative });
        text = text.slice(0, close + 5);
        return parseHeaderBlock(text).headers;
    }
    finally { fs.closeSync(fd); }
}
function matchValue(condition: HeaderCondition, value: HeaderValue | undefined, compiled?: ReturnType<typeof compileRegex>): boolean {
    if (value === undefined) return false;
    const values = Array.isArray(value) ? value : [value], wanted = nfc(condition.value);
    return values.some(v => condition.op === 'eq' ? nfc(v) === wanted : condition.op === 'contains' ? nfc(v).includes(wanted) : compiled!.test(v));
}
function compileConditions(headers: { conditions: HeaderCondition[]; match?: 'all' | 'any' }) {
    check(object(headers) && Array.isArray(headers.conditions) && headers.conditions.length >= 1 && headers.conditions.length <= 8 && (headers.match === undefined || ['all', 'any'].includes(headers.match)), 'usage_invalid', 'headers needs 1..8 conditions and match all|any.');
    const compiled = headers.conditions.map(c => {
        check(object(c) && typeof c.key === 'string' && (isHostKey(c.key) || /^[a-z][a-z0-9_]*$/.test(c.key)) && ['eq', 'contains', 'regex'].includes(c.op) && typeof c.value === 'string' && (c.flags === undefined || c.op === 'regex'), 'usage_invalid', 'A header condition is {key, op: eq|contains|regex, value, flags?}.');
        return c.op === 'regex' ? compileRegex(c.value, c.flags ?? '') : undefined;
    });
    const all = (headers.match ?? 'all') === 'all';
    return (values: Record<string, HeaderValue>) => all ? headers.conditions.every((c, i) => matchValue(c, values[c.key], compiled[i])) : headers.conditions.some((c, i) => matchValue(c, values[c.key], compiled[i]));
}
const statDigest = (root: string, paths: string[]) => canonicalDigest(paths.map(p => { try { const s = fs.statSync(contained(root, p)); return [p, s.size, Math.round(s.mtimeMs)]; } catch { return [p, null, null]; } }));

// ---------------------------------------------------------------- prepared state
interface PreparedFile {
    schema: 'whyve-prepared/v1';
    handle: string;
    created_at: string;
    state: 'prepared' | 'needs_approval' | 'applying' | 'applied';
    action: Mutation['action'];
    record_id: string;
    mutation: Mutation & { now: string };
    authorization: Authorization;
    separate: string[];
    binding: ObjectValue;
    preconditions: { path: string; sha256: string | null }[];
    changes: PreviewFile[];
    quality_flags: string[];
    reason?: string;
    receipt?: WriteReceipt;
}
const newHandle = () => 'prep_' + randomBytes(16).toString('hex');
const utf8Length = (text: string) => Buffer.byteLength(text, 'utf8');

export class Whyve implements WhyveHost {
    readonly vault: string;
    readonly project: string;
    private readonly storage: Filesystem;
    private readonly projectStorage: Filesystem;
    constructor(options: WhyveOptions) {
        try {
            check(options.vault || options.project, 'usage_invalid', 'Provide a vault or project directory.');
            this.project = realDirectory(options.project ?? options.vault!);
            const settings = loadSettings(this.project);
            this.vault = realDirectory(options.vault ?? path.resolve(this.project, settings.config?.vault ?? '.'));
            this.storage = new Filesystem(this.vault, options);
            this.projectStorage = new Filesystem(this.project, options);
        }
        catch (error) { throw toWhyveError(error); }
    }
    private async locked<T>(fn: () => T | Promise<T>, projectToo = false): Promise<T> {
        try {
            if (!projectToo || this.project === this.vault) return await this.storage.locked(fn);
            const [first, second] = this.project < this.vault ? [this.projectStorage, this.storage] : [this.storage, this.projectStorage];
            return await first.locked(() => second.locked(fn));
        }
        catch (error) { throw toWhyveError(error); }
    }
    private view(): VaultView { return new VaultView(this.vault); }
    private writableView(): VaultView {
        const format = detectFormat(this.vault);
        check(format !== 'v2', 'migration_required', 'This vault uses context-common/v2. Reading works; writing requires `whyve migrate-project PATH --to-format context-common/v3`.', { vault: this.vault }, EXIT.conflict);
        const view = this.view();
        check(!view.outdated.length, 'registry_outdated', 'Registered descriptors differ from this runtime; run whyve refresh --fix.', { kinds: view.outdated }, EXIT.conflict);
        return view;
    }
    private binding(view: VaultView): ObjectValue {
        const settings = loadSettings(this.project);
        return { project_identity: identity(this.project), vault_identity: identity(this.vault), config_digest: settings.digest, registry_digest: view.registryDigest, projections_digest: digestOrNull(this.vault, PROJECTIONS), runtime: 'whyve-typescript/v3', runtime_digest: runtimeDigest };
    }

    // ------------------------------------------------------------ settings and setup
    settings(): ObjectValue {
        return withErrors(() => {
            const settings = loadSettings(this.project), format = detectFormat(this.vault);
            const registered = format === 'none' ? [] : this.view().kinds;
            return { project: this.project, vault: this.vault, config: settings.config, digest: settings.digest, mode: settings.mode, enabled: settings.enabled, format: format === 'v3' ? MODEL.protocol : format === 'v2' ? 'context-common/v2' : 'uninitialized', registered, registered_features: registered.filter(k => FEATURES.includes(k as Feature)) };
        });
    }
    capabilities(): Capabilities {
        return { schema: 'whyve-capabilities/v3', version: VERSION, protocol: MODEL.protocol, kinds: MODEL.kinds, limits: LIMITS, regex: { syntax: 're2-subset', flags: ['i'], maxBytes: LIMITS.regex_bytes, unsupported: REGEX_UNSUPPORTED },
            methods: ['capabilities', 'status', 'list', 'searchHeaders', 'read', 'checkSlot', 'validateReadReceipt', 'compare', 'prepare', 'apply'] };
    }
    async status(): Promise<Status> {
        return this.locked(() => {
            const settings = loadSettings(this.project), format = detectFormat(this.vault);
            if (format === 'none') return { format: 'uninitialized', writable: false, indexDigest: null, vault: this.vault, project: this.project, mode: settings.mode, enabled: settings.enabled, registered: [], version: VERSION };
            const view = this.view();
            return { format: format === 'v3' ? MODEL.protocol : 'context-common/v2', writable: format === 'v3' && !view.outdated.length, indexDigest: this.indexDigest(view, view.kinds), vault: this.vault, project: this.project, mode: settings.mode, enabled: settings.enabled, registered: view.kinds, version: VERSION };
        });
    }
    private indexDigest(view: VaultView, kinds: Kind[]): string {
        return canonicalDigest({ root: digestOrNull(this.vault, ROOT_INDEX), registry: view.registryDigest, areas: [...kinds].sort(compareText).map(k => [k, view.format === 'v3' ? view.areaDigest(k) : sha256(Buffer.from(view.legacyArea(k).text))]) });
    }
    adoptLegacy(confirmLegacyStopped: boolean): ObjectValue {
        return withErrors(() => {
            const roots = this.project === this.vault ? [this.storage] : [this.storage, this.projectStorage].sort((a, b) => compareText(a.root, b.root));
            return { adopted: true, vault: this.vault, project: this.project, adopted_roots: roots.map(root => root.adoptLegacy(confirmLegacyStopped).vault), protocol: 'exclusive-node-writer/v1', records_changed: false };
        });
    }
    async recoverRuntime(): Promise<ObjectValue> {
        try {
            const roots = this.project === this.vault ? [this.storage] : [this.storage, this.projectStorage].sort((a, b) => compareText(a.root, b.root));
            for (const root of roots) await root.recoverAbandoned();
            return { recovered: true, vault: this.vault, project: this.project, recovered_roots: roots.map(r => r.root) };
        }
        catch (error) { throw toWhyveError(error); }
    }
    async initialize(options: InitializeOptions = {}): Promise<ObjectValue> {
        return this.locked(() => {
            const before = loadSettings(this.project), format = detectFormat(this.vault);
            const registered = format === 'none' ? [] : this.view().kinds;
            const features = options.features ?? (before.config?.features as Feature[] | undefined) ?? (format === 'none' ? ['decision'] : registered.filter(k => FEATURES.includes(k as Feature)) as Feature[]);
            check(Array.isArray(features) && features.every(x => FEATURES.includes(x)) && new Set(features).size === features.length, 'config_invalid', 'Invalid feature selection.');
            const mode = options.approvalMode ?? before.mode;
            check(['explicit', 'auto', 'adaptive'].includes(mode), 'config_invalid', 'Invalid approval mode.');
            const wanted = [...new Set([...registered, ...BUILTINS, ...features])].sort(compareText) as Kind[];
            const changes: FileChange[] = [];
            if (format === 'v2') check(wanted.every(k => registered.includes(k)), 'migration_required', 'New areas require the v3 format; migrate this vault first.', { missing: wanted.filter(k => !registered.includes(k)) }, EXIT.conflict);
            else {
                for (const kind of wanted.filter(k => !registered.includes(k))) {
                    check(bytes(this.vault, areaIndexPath(kind)) === null, 'area_exists', 'Area index already exists outside the registry.', { area: kind }, EXIT.conflict);
                    changes.push({ path: areaIndexPath(kind), content: fileBytes(emptyArea(kind)), expected: null });
                }
                if (wanted.join() !== registered.join() || format === 'none') {
                    changes.push({ path: ROOT_INDEX, content: fileBytes(renderRoot(wanted)), expected: digestOrNull(this.vault, ROOT_INDEX) });
                    changes.push({ path: REGISTRY, content: Buffer.from(renderRegistry(wanted)), expected: digestOrNull(this.vault, REGISTRY) });
                }
            }
            const config = { schema: 'whyve-project/v1', features, approval: { mode }, vault: path.relative(this.project, this.vault) || '.' };
            const projectChanges: FileChange[] = [];
            if (JSON.stringify(before.config) !== JSON.stringify(config))
                projectChanges.push({ path: '.whyve/config.json', content: Buffer.from(JSON.stringify(config, null, 2) + '\n'), expected: before.digest });
            if (options.host) {
                const target = options.host === 'codex' ? 'AGENTS.md' : 'CLAUDE.md', original = bytes(this.project, target), text = original ? utf8(original) : '';
                const begin = '<!-- BEGIN context-core-policy (managed by context-core) -->', end = '<!-- END context-core-policy (managed by context-core) -->';
                check(text.includes(begin) === text.includes(end) && text.split(begin).length <= 2 && text.split(end).length <= 2, 'policy_invalid', 'Managed guidance markers are malformed.');
                const updated = text.includes(begin) ? text.slice(0, text.indexOf(begin)) + contracts.policy + text.slice(text.indexOf(end) + end.length) : text.replace(/\n*$/, '') + (text ? '\n\n' : '') + contracts.policy + '\n';
                projectChanges.push({ path: target, content: fileBytes(updated), expected: original ? sha256(original) : null });
            }
            if (fs.existsSync(path.join(this.vault, '.git'))) {
                const relative = '.gitattributes', raw = bytes(this.vault, relative), original = raw ? utf8(raw) : '', begin = '# BEGIN context-core-merge (managed by context-core)', end = '# END context-core-merge (managed by context-core)';
                check(original.includes(begin) === original.includes(end) && original.split(begin).length <= 2 && original.split(end).length <= 2, 'policy_invalid', 'Managed merge markers are malformed.');
                const block = contracts.merge_attributes, updated = original.includes(begin) ? original.slice(0, original.indexOf(begin)) + block + original.slice(original.indexOf(end) + end.length) : original.replace(/\n*$/, '') + (original ? '\n\n' : '') + block + '\n';
                if (updated !== original) changes.push({ path: relative, content: fileBytes(updated), expected: raw ? sha256(raw) : null });
            }
            const changed = this.project === this.vault ? this.storage.transaction([...changes, ...projectChanges]) : [...this.storage.transaction(changes), ...this.projectStorage.transaction(projectChanges).map(p => path.join(this.project, p))];
            return { schema: 'whyve-init-result/v3', version: VERSION, project: this.project, vault: this.vault, format: format === 'v2' ? 'context-common/v2' : MODEL.protocol, config, enabled: [...BUILTINS, ...features], changed_paths: changed, applied: changed.length > 0 };
        }, true);
    }
    /** Verifies records, links, slots and indexes. With fix, regenerates indexes and the registry from records. */
    async refresh(fix = false): Promise<ObjectValue> {
        return this.locked(() => {
            const format = detectFormat(this.vault);
            check(format !== 'none', 'context_root_missing', 'Context root index is missing; run whyve init.', {}, EXIT.notFound);
            check(!fix || format === 'v3', 'migration_required', 'Index repair writes v3 files; migrate this vault first.', {}, EXIT.conflict);
            const issues: ObjectValue[] = [], changes: FileChange[] = [];
            let kinds: Kind[];
            if (format === 'v3') {
                try { kinds = this.view().kinds; }
                catch (error) {
                    if (!fix || !(error instanceof WhyveError)) throw error;
                    issues.push({ code: error.code });
                    kinds = KINDS.filter(k => bytes(this.vault, areaIndexPath(k)) !== null);
                }
                const registry = renderRegistry(kinds), root = renderRoot(kinds);
                if (utf8(bytes(this.vault, REGISTRY) ?? Buffer.alloc(0)) !== registry) { issues.push({ code: 'registry_drift', path: REGISTRY }); changes.push({ path: REGISTRY, content: Buffer.from(registry), expected: digestOrNull(this.vault, REGISTRY) }); }
                if (utf8(bytes(this.vault, ROOT_INDEX) ?? Buffer.alloc(0)) !== root) { issues.push({ code: 'index_content_drift', path: ROOT_INDEX }); changes.push({ path: ROOT_INDEX, content: fileBytes(root), expected: digestOrNull(this.vault, ROOT_INDEX) }); }
            }
            else kinds = this.view().kinds;
            const view = format === 'v3' ? new VaultView(this.vault, { kinds }) : this.view();
            const records = view.scan(kinds);
            for (const [name, fn] of [['relations', () => validateRelations(records)], ['slots', () => validateSlots(records, new Set(records.map(r => r.id)), new Set(), true)]] as const) {
                try { fn(); }
                catch (e) { if (e instanceof WhyveError) issues.push({ code: e.code, check: name, ...e.details }); else throw e; }
            }
            if (format === 'v3')
                for (const kind of kinds) {
                    const text = view.renderArea(kind, records), current = bytes(this.vault, areaIndexPath(kind));
                    if (!current || utf8(current) !== text) { issues.push({ code: 'index_content_drift', path: areaIndexPath(kind) }); changes.push({ path: areaIndexPath(kind), content: fileBytes(text), expected: current ? sha256(current) : null }); }
                }
            const repairable = new Set(['index_content_drift', 'registry_drift', 'registry_invalid', 'registry_missing', 'index_stale', 'index_noncanonical', 'index_row_invalid']);
            check(!fix || issues.every(i => repairable.has(i.code)), 'integrity_error', 'Resolve record integrity errors before rebuilding indexes.', { issues }, EXIT.integrity);
            const changed = fix ? this.storage.transaction(changes) : [];
            return { ok: issues.length === 0 || fix, format: format === 'v3' ? MODEL.protocol : 'context-common/v2', issues, changed_paths: changed, record_count: records.length, index_fixed: fix };
        });
    }

    // ------------------------------------------------------------ discovery
    private selectKinds(view: VaultView, requested: Kind[] | undefined, strict: boolean, coverage: Coverage['unqueried'], warnings: RowPage['warnings']): Kind[] {
        const enabled = loadSettings(this.project).enabled;
        if (requested !== undefined) {
            check(Array.isArray(requested) && requested.length > 0 && requested.every(isKind), 'usage_invalid', 'kinds must be a non-empty list of record kinds.');
            for (const kind of requested.filter(k => !view.kinds.includes(k))) {
                check(!strict, 'area_not_registered', 'Requested area is not registered.', { kind }, EXIT.notFound);
                coverage.push({ kind, reason: 'area_unavailable' });
                warnings.push({ code: 'area_not_registered', kind });
            }
            for (const kind of view.kinds.filter(k => !requested.includes(k))) coverage.push({ kind, reason: 'not_requested' });
            return view.kinds.filter(k => requested.includes(k));
        }
        for (const kind of view.kinds.filter(k => enabled && !enabled.includes(k))) coverage.push({ kind, reason: 'feature_disabled' });
        return view.kinds.filter(k => !enabled || enabled.includes(k));
    }
    private filterRows(view: VaultView, o: ListFilters & { strictIndex?: boolean }, warnings: RowPage['warnings']) {
        const unqueried: Coverage['unqueried'] = [], strict = o.strictIndex ?? true, applied: string[] = [];
        check(typeof strict === 'boolean', 'usage_invalid', 'strictIndex must be a boolean.');
        const kinds = this.selectKinds(view, o.kinds, strict, unqueried, warnings), queried: Kind[] = [];
        const state = o.state ?? 'current';
        check(['current', 'history', 'all'].includes(state), 'usage_invalid', 'state must be current, history or all.');
        let scope: { value: string; match: string } | null = null;
        if (o.scope !== undefined) {
            check(object(o.scope) && typeof o.scope.value === 'string' && (o.scope.match === undefined || ['exact', 'ancestor', 'descendant', 'overlap'].includes(o.scope.match)), 'usage_invalid', 'scope is {value, match: exact|ancestor|descendant|overlap}.');
            scope = { value: canonicalScope(o.scope.value), match: o.scope.match ?? 'exact' };
            applied.push('scope');
        }
        const key = o.key === undefined ? null : canonicalKey(o.key);
        const time = (range: ListFilters['created'], name: string) => {
            if (range === undefined) return null;
            check(object(range) && Object.keys(range).every(k => ['from', 'to'].includes(k)), 'usage_invalid', `${name} is {from?, to?}.`);
            const parse = (v: unknown) => { if (v === undefined) return null; check(typeof v === 'string' && Number.isFinite(Date.parse(v)), 'usage_invalid', `${name} bounds are ISO dates or timestamps.`); return Date.parse(v as string); };
            applied.push(name);
            return { from: parse(range.from), to: parse(range.to) };
        };
        const created = time(o.created, 'created'), updated = time(o.updated, 'updated');
        let keywords: { values: string[]; all: boolean } | null = null;
        if (o.keywords !== undefined) {
            check(object(o.keywords) && Array.isArray(o.keywords.values) && o.keywords.values.length >= 1 && o.keywords.values.length <= 12 && o.keywords.values.every(v => typeof v === 'string') && (o.keywords.match === undefined || ['all', 'any'].includes(o.keywords.match)), 'usage_invalid', 'keywords is {values: 1..12 strings, match: all|any}.');
            keywords = { values: o.keywords.values.map(nfc), all: (o.keywords.match ?? 'all') === 'all' };
            applied.push('keywords');
        }
        if (o.ids !== undefined) { check(Array.isArray(o.ids) && o.ids.length <= 500, 'usage_invalid', 'ids is a list of at most 500 IDs.'); o.ids.forEach(id => requireId(id, 'ids')); applied.push('ids'); }
        if (o.textContains !== undefined) { check(typeof o.textContains === 'string' && o.textContains.length > 0 && o.textContains.length <= 200, 'usage_invalid', 'textContains is a non-empty string of at most 200 characters.'); applied.push('textContains'); }
        if (key !== null) applied.push('key');
        if (o.kinds) applied.push('kinds');
        if (o.state) applied.push('state');
        const ids = o.ids ? new Set(o.ids) : null, text = o.textContains === undefined ? null : nfc(o.textContains);
        const rows: Row[] = [], seen = new Set<string>();
        for (const kind of kinds) {
            let all: Row[];
            try { all = view.rows(kind); }
            catch (e) {
                if (strict || !(e instanceof WhyveError) || ['path_escape', 'symlink_path'].includes(e.code)) throw e;
                unqueried.push({ kind, reason: 'index_invalid' });
                warnings.push({ code: 'area_index_invalid', kind });
                continue;
            }
            queried.push(kind);
            for (const row of all) {
                const f = row.fields;
                check(!seen.has(f.id), 'index_duplicate_entry', 'Record ID is indexed more than once.', { id: f.id }, EXIT.integrity);
                seen.add(f.id);
                if (state !== 'all' && f.state !== state) continue;
                if (scope) {
                    const ok = scope.match === 'exact' ? f.scope === scope.value : scope.match === 'ancestor' ? (scope.value === f.scope || scope.value.startsWith(f.scope + '/')) : scope.match === 'descendant' ? (f.scope === scope.value || f.scope.startsWith(scope.value + '/')) : scopesOverlap(f.scope, scope.value);
                    if (!ok) continue;
                }
                if (key !== null && f.key !== key) continue;
                const within = (value: string, range: { from: number | null; to: number | null } | null) => !range || (value !== '' && (range.from === null || Date.parse(value) >= range.from) && (range.to === null || Date.parse(value) < range.to));
                if (!within(f.createdAt, created) || !within(f.updatedAt, updated)) continue;
                if (keywords) { const own = new Set(f.keywords.map(nfc)); if (keywords.all ? !keywords.values.every(v => own.has(v)) : !keywords.values.some(v => own.has(v))) continue; }
                if (ids && !ids.has(f.id)) continue;
                if (text !== null && !nfc(f.title).includes(text) && !nfc(f.summary).includes(text)) continue;
                rows.push(row);
            }
        }
        return { rows, kinds, queried, unqueried: unqueried.sort((a, b) => compareText(a.kind, b.kind)), applied };
    }
    private headerValues(view: VaultView, row: Row): Record<string, HeaderValue> {
        return view.format === 'v3' ? readHeaders(this.vault, row.fields.path) : view.load(row.fields.path, row.fields.kind).record.headers;
    }
    async list(input: ListOptions = {}): Promise<RowPage> {
        return this.locked(() => {
            const o = options<ListOptions>(input, ['kinds', 'state', 'scope', 'key', 'created', 'updated', 'keywords', 'ids', 'textContains', 'headers', 'order', 'strictIndex', 'limit', 'cursor'], 'list');
            const limit = pageLimit(o.limit, LIMITS.list_default, LIMITS.list_max), view = this.view(), warnings: RowPage['warnings'] = [];
            check(o.order === undefined || ['default', 'recent'].includes(o.order), 'usage_invalid', 'order is default or recent.');
            const selected = this.filterRows(view, o, warnings);
            let rows = selected.rows, scan: Coverage['headerScan'] | undefined, stats = '';
            if (o.headers !== undefined) {
                // ponytail: every page rescans candidate headers (16 KiB each); add an opt-in projection if this becomes slow.
                const matches = compileConditions(o.headers);
                let errors = 0;
                rows = rows.filter(row => {
                    try { return matches(this.headerValues(view, row)); }
                    catch (e) { if (e instanceof WhyveError) { errors++; warnings.push({ code: e.code, id: row.fields.id }); return false; } throw e; }
                });
                scan = { scanned: selected.rows.length, errors };
                stats = statDigest(this.vault, selected.rows.map(r => r.fields.path));
                selected.applied.push('headers');
            }
            const recent = (o.order ?? 'default') === 'recent', rank = (s: RecordState) => s === 'current' ? 0 : 1;
            rows.sort(recent ? (a, b) => compareText(b.fields.updatedAt || b.fields.createdAt, a.fields.updatedAt || a.fields.createdAt) || compareText(a.fields.id, b.fields.id)
                : (a, b) => compareText(a.fields.kind, b.fields.kind) || rank(a.fields.state) - rank(b.fields.state) || compareText(a.fields.createdAt, b.fields.createdAt) || compareText(a.fields.id, b.fields.id));
            const indexDigest = this.indexDigest(view, selected.kinds);
            const selectionDigest = canonicalDigest({ rows: rows.map(r => r.rawLine), stats });
            const { cursor: _c, limit: _l, ...request } = o;
            const handle = { method: 'list', vault: canonicalDigest(identity(this.vault)), request: canonicalDigest(request), snapshot: selectionDigest };
            const { offset } = openCursor(o.cursor, handle, rows.length);
            const items: Row[] = [];
            let size = 0;
            for (const row of rows.slice(offset, offset + limit)) {
                const bytes = utf8Length(JSON.stringify(row));
                if (items.length && size + bytes > LIMITS.list_page_bytes) break;
                items.push(row);
                size += bytes;
            }
            const end = offset + items.length, partial = selected.unqueried.some(g => g.reason === 'index_invalid' || g.reason === 'area_unavailable');
            return {
                schema: 'whyve-list/v3', items,
                coverage: { requestedFilters: selected.applied, queriedKinds: selected.queried, unqueried: selected.unqueried, total: partial ? null : rows.length, returned: items.length, preceding: offset, remaining: partial ? null : rows.length - end,
                    indexStatus: partial ? 'partial' : 'valid', diskConsistency: 'unchecked', ...(scan ? { headerScan: scan } : {}), complete: !partial && end === rows.length },
                indexDigest, selectionDigest, nextCursor: end < rows.length ? encodeCursor({ v: 3, ...handle, offset: end }) : null, warnings,
            };
        });
    }
    async searchHeaders(input: HeaderSearchOptions): Promise<IdPage> {
        return this.locked(() => {
            const o = options<HeaderSearchOptions>(input, ['kinds', 'state', 'scope', 'key', 'created', 'updated', 'keywords', 'ids', 'textContains', 'headers', 'select', 'limit', 'cursor'], 'searchHeaders');
            check(o.headers !== undefined, 'usage_invalid', 'searchHeaders requires header conditions.');
            const matches = compileConditions(o.headers), limit = pageLimit(o.limit, LIMITS.header_scan_default, LIMITS.header_scan_max), view = this.view();
            const select = o.select ?? [];
            check(Array.isArray(select) && select.length <= 16 && select.every(k => typeof k === 'string' && (isHostKey(k) || /^[a-z][a-z0-9_]*$/.test(k) || /^[a-z][a-z0-9_-]*\.\*$/.test(k))), 'usage_invalid', 'select lists header keys or namespace.* patterns.');
            const selected = this.filterRows(view, { ...o, headers: undefined } as ListFilters, []);
            const rows = selected.rows.sort((a, b) => compareText(a.fields.kind, b.fields.kind) || compareText(a.fields.createdAt, b.fields.createdAt) || compareText(a.fields.id, b.fields.id));
            const selectionDigest = canonicalDigest(rows.map(r => r.rawLine));
            const { cursor: _c, limit: _l, ...request } = o;
            const handle = { method: 'searchHeaders', vault: canonicalDigest(identity(this.vault)), request: canonicalDigest(request), snapshot: selectionDigest };
            const opened = openCursor(o.cursor, handle, rows.length);
            // Files already scanned by earlier pages must be unchanged for the result set to stay coherent.
            if (opened.offset) check(opened.extra?.stats === statDigest(this.vault, rows.slice(0, opened.offset).map(r => r.fields.path)), 'cursor_stale', 'A scanned record changed; restart from the first page.', {}, EXIT.conflict);
            const window = rows.slice(opened.offset, opened.offset + limit), found: IdPage['matches'] = [], errors: IdPage['errors'] = [];
            for (const row of window) {
                let values: Record<string, HeaderValue>;
                try { values = this.headerValues(view, row); }
                catch (e) { if (e instanceof WhyveError) { errors.push({ id: row.fields.id, path: row.fields.path, code: e.code }); continue; } throw e; }
                if (!matches(values)) continue;
                const picked: Record<string, HeaderValue> = {};
                for (const key of select) for (const k of Object.keys(values)) if (key.endsWith('.*') ? k.startsWith(key.slice(0, -1)) : k === key) picked[k] = values[k];
                found.push({ id: row.fields.id, path: row.fields.path, ...(select.length ? { headers: picked } : {}) });
            }
            const end = opened.offset + window.length;
            return { schema: 'whyve-header-search/v1', ids: found.map(m => m.id), matches: found, errors, scanned: window.length, unscanned: rows.length - end, matchCount: found.length, selectionDigest,
                nextCursor: end < rows.length ? encodeCursor({ v: 3, ...handle, offset: end, extra: { stats: statDigest(this.vault, rows.slice(0, end).map(r => r.fields.path)) } }) : null, complete: end === rows.length };
        });
    }
    async read(id: string, input: ReadOptions = {}): Promise<RecordRead> {
        return this.locked(() => {
            const o = options<ReadOptions>(input, ['sections', 'maxBytes', 'cursor', 'raw'], 'read');
            const view = this.view(), loaded = view.find(id);
            return this.readResult(view, loaded, o);
        });
    }
    private readResult(view: VaultView, loaded: Loaded, o: ReadOptions): RecordRead {
        const record = loaded.record, h = record.headers, kind = loaded.kind, budget = byteLimit(o.maxBytes);
        const order = [...spec(kind).sections.map(s => s.name).flatMap(name => record.sections.filter(s => s.name === name)), ...record.sections.filter(s => !s.name)];
        let chosen = order;
        if (o.sections !== undefined) {
            check(Array.isArray(o.sections) && o.sections.length >= 1 && o.sections.every(s => typeof s === 'string'), 'usage_invalid', 'sections is a non-empty list of section names.');
            chosen = o.sections.map(name => {
                const found = order.find(s => s.title === name || s.name === name || (!!s.name && sectionSpec(kind, name)?.name === s.name));
                check(found, 'section_invalid', 'Requested section does not exist.', { section: name });
                return found;
            });
        }
        const request = canonicalDigest({ id: loaded.id, sections: o.sections ?? null, budget });
        const handle = { method: 'read', vault: canonicalDigest(identity(this.vault)), request, snapshot: loaded.digest };
        const opened = openCursor(o.cursor, handle, Number.MAX_SAFE_INTEGER);
        let index = opened.extra?.section ?? 0, offset = opened.extra?.byte ?? 0, used = 0;
        const sections: Record<string, string> = {}, delivered: string[] = [];
        let partial: RecordRead['delivered']['partial'];
        while (index < chosen.length) {
            const s = chosen[index], name = s.name ?? s.title, buffer = Buffer.from(s.text, 'utf8'), rest = buffer.length - offset;
            if (rest <= budget - used) { sections[name] = buffer.subarray(offset).toString('utf8'); if (offset) partial = { section: name, fromByte: offset, toByte: buffer.length, totalBytes: buffer.length }; delivered.push(name); used += rest; index++; offset = 0; continue; }
            if (used && budget - used < 64) break;
            let end = offset + Math.max(1, budget - used);
            while (end < buffer.length && (buffer[end] & 0xc0) === 0x80) end++;
            sections[name] = buffer.subarray(offset, end).toString('utf8');
            partial = { section: name, fromByte: offset, toByte: end, totalBytes: buffer.length };
            delivered.push(name);
            used += end - offset;
            offset = end;
            if (offset >= buffer.length) { index++; offset = 0; }
            break;
        }
        const done = index >= chosen.length, complete = done && !opened.offset && !o.cursor && !partial;
        const successor = record.sources.find(s => s.relation === 'superseded-by')?.ref ?? null;
        return {
            schema: 'whyve-record/v3', format: loaded.format === 'v3' ? MODEL.protocol : 'context-common/v2', id: loaded.id, kind, path: loaded.path, state: loaded.state,
            title: h.title as string, summary: h.summary as string, scope: h.scope as string, key: (h.key as string) ?? '', keywords: (h.keywords as string[]) ?? [], tags: (h.tags as string[]) ?? [],
            createdAt: h.created_at as string, updatedAt: (h.updated_at as string) ?? '', authorizationSource: h.authorization_source as RecordRead['authorizationSource'],
            qualityFlags: describeFlags(computeFlags(record)), headers: { ...h }, sections, sources: record.sources.map(s => ({ ...s })),
            authority: loaded.state === 'history' ? 'historical' : spec(kind).authority, doNotFollow: loaded.state === 'history',
            lifecycle: loaded.state === 'history' ? { retiredAt: h.retired_at as string, reason: h.lifecycle_reason as string, successor, predecessors: record.sources.filter(s => s.relation === 'supersedes').map(s => s.ref) } : null,
            contentDigest: loaded.digest, delivered: { sections: delivered, bytes: used, ...(partial ? { partial } : {}) }, complete,
            nextCursor: done ? null : encodeCursor({ v: 3, ...handle, offset: 1, extra: { section: index, byte: offset } }),
            ...(o.raw ? { raw: (check(utf8Length(loaded.content) <= LIMITS.read_max_bytes, 'usage_invalid', 'raw is available for files up to 256 KiB.'), loaded.content) } : {}),
        };
    }

    // ------------------------------------------------------------ slots and comparison
    private candidateView(input: RecordInput, id = ''): SlotView {
        check(object(input) && isKind(input.kind), 'usage_invalid', 'record.kind must be a record kind.');
        const kind = input.kind, s = spec(kind), scope = canonicalScope(input.scope);
        if (s.key === 'derived') {
            const term = input.body?.term;
            check(typeof term === 'string', 'usage_invalid', 'TERM needs body.term.');
            const aliases = (input.body.aliases as string[] | undefined) ?? [], deprecated = (input.body.deprecated_terms as string[] | undefined) ?? [];
            return { id, kind, scope, key: canonicalKey(term), vocabulary: [term, ...aliases, ...deprecated].map(canonicalKey) };
        }
        return { id, kind, scope, key: s.key === 'required' ? canonicalKey(String(input.key)) : '' };
    }
    async checkSlot(input: RecordInput, o: PageOptions & { existingId?: string; supersedeId?: string } = {}): Promise<SlotPage> {
        return this.locked(() => {
            const opts = options<PageOptions & { existingId?: string; supersedeId?: string }>(o, ['existingId', 'supersedeId', 'limit', 'cursor'], 'checkSlot');
            const probe = this.candidateView(input), view = this.view(), limit = pageLimit(opts.limit, LIMITS.list_default, LIMITS.list_max);
            if (opts.existingId !== undefined) requireId(opts.existingId, 'existingId');
            if (opts.supersedeId !== undefined) requireId(opts.supersedeId, 'supersedeId');
            const occupants: SlotPage['occupants'] = [];
            if (spec(probe.kind).slot !== 'none' && view.kinds.includes(probe.kind))
                for (const r of view.scan([probe.kind]).filter(r => r.state === 'current' && r.id !== opts.existingId)) {
                    const reason = slotRelation(probe, slotView(r));
                    if (!reason) continue;
                    const replaced = r.id === opts.supersedeId;
                    occupants.push({ row: rowOf(r, view.projections), reason, replaced, blocking: !replaced && reason !== 'scope_overlap' });
                }
            occupants.sort((a, b) => compareText(a.row.fields.id, b.row.fields.id));
            const handle = { method: 'checkSlot', vault: canonicalDigest(identity(this.vault)), request: canonicalDigest({ probe, opts: { ...opts, cursor: null, limit: null } }), snapshot: canonicalDigest(occupants.map(x => x.row.rawLine)) };
            const { offset } = openCursor(opts.cursor, handle, occupants.length), page = occupants.slice(offset, offset + limit), end = offset + page.length;
            return { schema: 'whyve-slot/v3', kind: probe.kind, rule: spec(probe.kind).slot, occupied: occupants.length > 0, blocking: occupants.some(x => x.blocking), occupants: page, total: occupants.length, nextCursor: end < occupants.length ? encodeCursor({ v: 3, ...handle, offset: end }) : null };
        });
    }
    /** Mandatory and optional comparison sets (docs/record-model.md; design 3.4). Meaning is judged by the caller. */
    private comparisonSet(view: VaultView, input: RecordInput, action: 'capture' | 'supersede' | 'update', targetId: string | undefined, expand: CompareRequest['expand']) {
        const probe = this.candidateView(input), kind = probe.kind, mandatory = new Map<string, CompareReason[]>(), expansion = new Map<string, CompareReason[]>();
        const add = (map: Map<string, CompareReason[]>, id: string, reason: CompareReason) => { if (!map.get(id)?.includes(reason)) map.set(id, [...(map.get(id) ?? []), reason]); };
        const preconditions = new Set<string>([REGISTRY]);
        const loaded = new Map<string, Loaded>();
        const set_find = (id: string) => { const found = loaded.get(id) ?? view.find(id); loaded.set(found.id, found); return found; };
        if (targetId !== undefined) {
            const target = view.find(targetId);
            check(target.state === 'current', 'lifecycle_invalid', 'The comparison target must be Current.', { id: targetId }, EXIT.conflict);
            loaded.set(target.id, target);
            if (action === 'supersede') add(mandatory, target.id, 'target');
        }
        if (spec(kind).slot !== 'none' && view.kinds.includes(kind)) {
            preconditions.add(areaIndexPath(kind));
            const records = kind === 'term' ? view.scan([kind]) : null;
            const rows = view.rows(kind).filter(r => r.fields.state === 'current' && r.fields.id !== (action === 'update' ? targetId : undefined));
            for (const row of rows) {
                let reason: CompareReason | null = null;
                if (kind === 'term') {
                    const r = records!.find(x => x.id === row.fields.id)!;
                    if (slotRelation(probe, slotView(r))) { reason = 'term_overlap'; loaded.set(r.id, r); }
                }
                else if (row.fields.key === probe.key && scopesOverlap(row.fields.scope, probe.scope))
                    reason = row.fields.scope === probe.scope ? 'exact_slot' : spec(kind).slot === 'decision-overlap' ? 'scope_overlap' : 'same_key';
                if (reason) add(mandatory, row.fields.id, reason);
            }
        }
        for (const entry of input.sources ?? []) if (entry.relation.includes(':') && /^ctx_[0-9a-f]{32}$/.test(entry.ref)) {
            // A typed relation must name an existing record; an unknown target is a hard error, not a review item.
            const target = set_find(entry.ref);
            add(mandatory, target.id, 'referenced');
        }
        if (expand !== undefined) {
            check(object(expand) && Object.keys(expand).every(k => ['sameScope', 'crossKindKey', 'ids'].includes(k)), 'usage_invalid', 'expand accepts sameScope, crossKindKey and ids.');
            for (const k of view.kinds) {
                if (!(expand.sameScope || (expand.crossKindKey && ['decision', 'intent'].includes(kind) && ['decision', 'intent'].includes(k) && k !== kind))) continue;
                for (const row of view.rows(k).filter(r => r.fields.state === 'current')) {
                    if (expand.sameScope && row.fields.scope === probe.scope) add(expansion, row.fields.id, 'same_scope');
                    if (expand.crossKindKey && k !== kind && ['decision', 'intent'].includes(k) && row.fields.key === probe.key && scopesOverlap(row.fields.scope, probe.scope)) add(expansion, row.fields.id, 'cross_kind_key');
                }
            }
            for (const id of expand.ids ?? []) { requireId(id, 'expand.ids'); add(expansion, id, 'requested'); }
        }
        if (action === 'update' && targetId) { mandatory.delete(targetId); expansion.delete(targetId); }
        for (const id of mandatory.keys()) expansion.delete(id);
        return { mandatory, expansion, preconditions: [...preconditions].sort(compareText).map(p => ({ path: p, sha256: digestOrNull(this.vault, p) })), loaded };
    }
    async compare(request: CompareRequest): Promise<ComparisonPage> {
        return this.locked(() => {
            const o = options<CompareRequest>(request, ['record', 'action', 'targetId', 'expand', 'limit', 'cursor', 'maxBytes'], 'compare');
            const action = o.action ?? (o.targetId ? 'supersede' : 'capture');
            check(['capture', 'supersede', 'update'].includes(action), 'usage_invalid', 'action is capture, supersede or update.');
            check(action === 'capture' || typeof o.targetId === 'string', 'usage_invalid', `${action} comparison requires targetId.`);
            const view = this.view(), budget = byteLimit(o.maxBytes), limit = pageLimit(o.limit, 20, 100);
            const set = this.comparisonSet(view, o.record, action, o.targetId, o.expand);
            const order = (map: Map<string, CompareReason[]>, mandatory: boolean) => [...map.entries()].map(([id, reasons]) => ({ id, reasons, mandatory }));
            const entries = [...order(set.mandatory, true), ...order(set.expansion, false)];
            const items: (ComparisonItem & { size: number })[] = [];
            for (const entry of entries) {
                let loaded = set.loaded.get(entry.id);
                if (!loaded) {
                    try { loaded = view.find(entry.id); }
                    catch (e) { if (e instanceof WhyveError && e.code === 'not_found' && !entry.mandatory) continue; throw e; }
                }
                const sections = Object.fromEntries(loaded.record.sections.map(s => [s.name ?? s.title, s.text])), size = loaded.record.sections.reduce((sum, s) => sum + utf8Length(s.text), 0);
                const occupies = entry.reasons.some(r => ['exact_slot', 'scope_overlap', 'term_overlap'].includes(r));
                items.push({ row: rowOf(loaded, view.projections), reasons: entry.reasons, mandatory: entry.mandatory, occupiesSlot: occupies, sections, bodyComplete: true, readCursor: null, contentDigest: loaded.digest, size });
            }
            const receiptBase = { vault: canonicalDigest(identity(this.vault)), request: canonicalDigest({ record: o.record, action, targetId: o.targetId ?? null, expand: o.expand ?? null, budget }) };
            const handle = { method: 'compare', vault: receiptBase.vault, request: receiptBase.request, snapshot: canonicalDigest({ items: items.map(i => [i.row.fields.id, i.contentDigest]), pre: set.preconditions }) };
            const { offset } = openCursor(o.cursor, handle, items.length);
            const page: typeof items = [];
            let used = 0;
            for (const item of items.slice(offset, offset + limit)) {
                if (page.length && used + item.size > budget) break;
                page.push(item);
                used += Math.min(item.size, budget);
            }
            const end = offset + page.length, whole = (i: typeof items[number]) => i.size <= budget;
            const shown = page.map(({ size, ...item }) => whole({ ...item, size }) ? item : { ...item, sections: null, bodyComplete: false, readCursor: null });
            const delivered = items.slice(0, end).filter(whole);
            const reads: ReadReference[] = delivered.map(i => ({ id: i.row.fields.id, path: i.row.fields.path, sha256: i.contentDigest }));
            const mandatoryIds = items.filter(i => i.mandatory).map(i => i.row.fields.id);
            const receipt: ComparisonReceipt = { schema: 'whyve-comparison-receipt/v1', ...receiptBase, reads, preconditions: set.preconditions, mandatory: mandatoryIds, complete: mandatoryIds.every(id => reads.some(r => r.id === id)) };
            const mandatoryTotal = mandatoryIds.length, mandatoryDelivered = delivered.filter(i => i.mandatory).length;
            return { schema: 'whyve-comparison/v3', items: shown, receipt,
                coverage: { mandatoryTotal, mandatoryDelivered, expansionTotal: items.length - mandatoryTotal, expansionDelivered: delivered.length - mandatoryDelivered, remaining: items.length - end, complete: receipt.complete && end === items.length },
                nextCursor: end < items.length ? encodeCursor({ v: 3, ...handle, offset: end }) : null };
        });
    }
    async validateReadReceipt(receipt: ComparisonReceipt): Promise<{ valid: boolean; stale: string[] }> {
        return this.locked(() => {
            this.checkReceiptShape(receipt);
            const stale = [...receipt.reads.map(r => ({ path: r.path, sha256: r.sha256 })), ...receipt.preconditions].filter(p => digestOrNull(this.vault, p.path) !== p.sha256).map(p => p.path);
            return { valid: !stale.length && receipt.vault === canonicalDigest(identity(this.vault)), stale };
        });
    }
    private checkReceiptShape(receipt: ComparisonReceipt): void {
        check(object(receipt) && receipt.schema === 'whyve-comparison-receipt/v1' && Array.isArray(receipt.reads) && Array.isArray(receipt.preconditions) && Array.isArray(receipt.mandatory), 'receipt_invalid', 'Comparison receipt is invalid.', {}, EXIT.usage);
        for (const r of receipt.reads) { check(object(r) && typeof r.path === 'string' && /^sha256:[0-9a-f]{64}$/.test(r.sha256), 'receipt_invalid', 'Receipt reads are {id, path, sha256}.'); requireId(r.id, 'reads.id'); contained(this.vault, r.path); }
        for (const p of receipt.preconditions) { check(object(p) && typeof p.path === 'string' && (p.sha256 === null || /^sha256:[0-9a-f]{64}$/.test(p.sha256)), 'receipt_invalid', 'Receipt preconditions are {path, sha256}.'); contained(this.vault, p.path); }
    }

    // ------------------------------------------------------------ write planning
    private findCurrent(view: VaultView, id: string, expectedDigest: string): Loaded {
        const loaded = view.find(id);
        check(typeof expectedDigest === 'string' && /^sha256:[0-9a-f]{64}$/.test(expectedDigest), 'usage_invalid', 'expectedDigest is the contentDigest from read.');
        check(loaded.digest === expectedDigest, 'digest_conflict', 'The record changed since it was read. Read it again and reconcile.', { id, expected_digest: expectedDigest, current_digest: loaded.digest }, EXIT.conflict);
        return loaded;
    }
    private destination(view: VaultView, directory: string, kind: Kind, title: string, createdAt: string, overlay: Map<string, string | null>, stem?: string): string {
        const absolute = contained(this.vault, directory);
        const existing = new Set([...(fs.existsSync(absolute) ? fs.readdirSync(absolute) : []).filter(n => overlay.get(directory + '/' + n) !== null), ...[...overlay.entries()].filter(([p, c]) => c !== null && path.posix.dirname(p) === directory).map(([p]) => path.posix.basename(p))].map(n => normalizedKey(n)));
        return directory + '/' + allocateFilename(stem ?? baseFilename(kind, title, createdAt), name => existing.has(name));
    }
    /** Renders the frozen mutation into file changes. Deterministic for the same vault state, now and IDs. */
    private plan(view: VaultView, mutation: Mutation & { now: string }, authorization: Authorization): { changes: PreviewFile[]; recordId: string; slotChanged: Set<string>; touched: Kind[]; flags: string[] } {
        const now = mutation.now, overlay = new Map<string, string | null>(), changes: PreviewFile[] = [], slotChanged = new Set<string>(), touched = new Set<Kind>();
        const write = (relative: string, before: string | null, content: string | null) => { overlay.set(relative, content); changes.push({ path: relative, beforeDigest: before, afterDigest: content === null ? null : sha256(fileBytes(content)), content }); };
        const registered = (kind: Kind) => check(view.kinds.includes(kind), 'area_not_registered', 'Initialize this feature first.', { kind }, EXIT.conflict);
        const createRecord = (input: RecordInput, id: string, extra: SourceEntry[] = []): { record: StoredRecord; relative: string; content: string } => {
            const record = recordFromInput(input, { id, now, authorization });
            record.sources.unshift(...extra);
            const kind = kindOf(record);
            registered(kind);
            const content = renderRecord(record), relative = this.destination(view, `context/${kind}`, kind, record.headers.title as string, now, overlay);
            touched.add(kind);
            return { record, relative, content };
        };
        const retire = (loaded: Loaded, reason: string, extra: SourceEntry[]) => {
            const record: StoredRecord = { ...loaded.record, headers: { ...loaded.record.headers }, sources: [...loaded.record.sources, ...extra] };
            record.headers.state = 'history';
            record.headers.retired_at = now;
            record.headers.lifecycle_reason = reason;
            if (loaded.kind === 'assumption' && ['confirmed', 'refuted'].includes(reason)) record.headers.assumption_status = reason;
            const content = renderRecord(record), relative = this.destination(view, `context/${loaded.kind}/retired`, loaded.kind, '', '', overlay, path.posix.basename(loaded.path, '.md'));
            write(loaded.path, loaded.digest, null);
            write(relative, null, content);
            touched.add(loaded.kind);
        };
        switch (mutation.action) {
            case 'capture': {
                const id = mutation.id ?? fail('usage_invalid', 'capture requires a frozen id.');
                const made = createRecord(mutation.record, id);
                write(made.relative, null, made.content);
                slotChanged.add(id);
                return { changes, recordId: id, slotChanged, touched: [...touched], flags: computeFlags(made.record) };
            }
            case 'supersede': {
                const predecessor = this.findCurrent(view, mutation.id, mutation.expectedDigest), successorKind = mutation.successor?.kind;
                check(predecessor.state === 'current', 'lifecycle_invalid', 'Supersede requires a Current record.', {}, EXIT.conflict);
                check(successorKind === predecessor.kind || (predecessor.kind === 'observation' && successorKind === 'decision' && predecessor.record.headers.kind_hint === 'decision'), 'lifecycle_invalid', 'Unsupported cross-kind supersession.', { from: predecessor.kind, to: successorKind }, EXIT.conflict);
                check(typeof mutation.reason === 'string' && mutation.reason.trim() && !/[\r\n]/.test(mutation.reason) && codepoints(mutation.reason) <= 500, 'usage_invalid', 'reason is one line of at most 500 codepoints.');
                const successorId = mutation.successorId ?? fail('usage_invalid', 'supersede requires a frozen successorId.');
                const made = createRecord(mutation.successor, successorId, [{ relation: 'supersedes', ref: predecessor.id }]);
                const moved = made.record.headers.scope !== predecessor.record.headers.scope || (made.record.headers.key ?? '') !== (predecessor.record.headers.key ?? '');
                if (['snapshot', 'document', 'archive'].includes(predecessor.kind)) check(moved, 'lifecycle_invalid', `${predecessor.kind} content changes use update; supersede moves scope or key.`, {}, EXIT.conflict);
                if (predecessor.kind === 'archive') check(sectionText(made.record, 'Content') === sectionText(predecessor.record, 'Content'), 'immutable_archive', 'ARCHIVE bytes never change; a scope move keeps the original.', {}, EXIT.conflict);
                write(made.relative, null, made.content);
                retire(predecessor, 'superseded', [{ relation: 'superseded-by', ref: successorId }, { relation: 'retirement-note', ref: mutation.reason.trim() }]);
                slotChanged.add(successorId);
                return { changes, recordId: successorId, slotChanged, touched: [...touched], flags: computeFlags(made.record) };
            }
            case 'retire': {
                const loaded = this.findCurrent(view, mutation.id, mutation.expectedDigest);
                check(loaded.state === 'current', 'lifecycle_invalid', 'Retire requires a Current record.', {}, EXIT.conflict);
                check(mutation.reason !== 'superseded' && spec(loaded.kind).retire.includes(mutation.reason), 'lifecycle_invalid', `Unsupported ${loaded.kind} retirement reason.`, { allowed: spec(loaded.kind).retire.filter(r => r !== 'superseded') }, EXIT.conflict);
                const extra: SourceEntry[] = [];
                if (mutation.note !== undefined) extra.push({ relation: 'retirement-note', ref: String(mutation.note).trim() });
                check(!['withdrawn', 'invalidated', 'deprecated'].includes(mutation.reason) || extra.length, 'usage_invalid', 'This retirement requires a note.');
                for (const entry of mutation.sources ?? []) { validateSource(entry); check(!MANAGED_RELATIONS.has(entry.relation), 'sources_invalid', `${entry.relation} entries are written by the core.`); extra.push(entry); }
                if (loaded.kind === 'assumption') check(extra.some(s => s.relation === 'evidence'), 'usage_invalid', 'Confirming or refuting an assumption needs an evidence source.');
                retire(loaded, mutation.reason, extra);
                return { changes, recordId: loaded.id, slotChanged, touched: [...touched], flags: [] };
            }
            case 'discard': {
                const loaded = this.findCurrent(view, mutation.id, mutation.expectedDigest);
                check(['snapshot', 'observation', 'archive'].includes(loaded.kind), 'lifecycle_invalid', 'Authoritative records use their retirement lifecycle.', {}, EXIT.conflict);
                const inbound = view.scan().filter(r => r.id !== loaded.id && (r.record.sources.some(s => s.ref === loaded.id) || ((r.record.headers.anchors as string[] | undefined) ?? []).includes(loaded.id)));
                check(!inbound.length, 'inbound_reference', 'Referenced records cannot be discarded.', { ids: inbound.map(r => r.id) }, EXIT.conflict);
                write(loaded.path, loaded.digest, null);
                touched.add(loaded.kind);
                return { changes, recordId: loaded.id, slotChanged, touched: [...touched], flags: [] };
            }
            case 'rename': {
                const loaded = this.findCurrent(view, mutation.id, mutation.expectedDigest);
                check(loaded.state === 'current', 'lifecycle_invalid', 'History records are immutable.', {}, EXIT.conflict);
                const record: StoredRecord = { ...loaded.record, headers: { ...loaded.record.headers } };
                if (mutation.title !== undefined) { record.headers.title = String(mutation.title).trim(); record.headers.updated_at = now; }
                const content = renderRecord(record), directory = path.posix.dirname(loaded.path);
                const overlayWithout = new Map(overlay).set(loaded.path, null);
                let relative = this.destination(view, directory, loaded.kind, record.headers.title as string, record.headers.created_at as string, overlayWithout);
                // A name that folds to the current one is the same file on case-insensitive filesystems: write in place.
                if (normalizedKey(relative) === normalizedKey(loaded.path)) relative = loaded.path;
                check(relative !== loaded.path || content !== loaded.content, 'no_change', 'The filename and title are unchanged.');
                if (relative === loaded.path) write(loaded.path, loaded.digest, content);
                else { write(loaded.path, loaded.digest, null); write(relative, null, content); }
                touched.add(loaded.kind);
                return { changes, recordId: loaded.id, slotChanged, touched: [...touched], flags: computeFlags(record) };
            }
            case 'update': {
                const loaded = this.findCurrent(view, mutation.id, mutation.expectedDigest);
                check(loaded.state === 'current', 'lifecycle_invalid', 'History records are immutable.', {}, EXIT.conflict);
                const kind = loaded.kind, patch = options<RecordPatch>(mutation.patch, ['title', 'summary', 'keywords', 'tags', 'body', 'replaceBody', 'sources', 'headers'], 'patch');
                const record: StoredRecord = { headers: { ...loaded.record.headers }, sections: loaded.record.sections.map(s => ({ ...s })), sources: loaded.record.sources.map(s => ({ ...s })), alias: loaded.record.alias };
                const h = record.headers, before = { scope: h.scope, key: h.key, vocabulary: slotView(loaded).vocabulary?.join() };
                for (const field of ['title', 'summary'] as const) if (patch[field] !== undefined) { check(typeof patch[field] === 'string', 'schema_invalid', `${field} must be text.`); h[field] = (patch[field] as string).trim(); }
                if (patch.summary !== undefined && Array.isArray(h.quality_flags)) h.quality_flags = (h.quality_flags as string[]).filter(f => f !== 'summary_derived');
                for (const field of ['keywords', 'tags'] as const) if (patch[field] !== undefined) { if ((patch[field] as string[]).length) h[field] = patch[field] as string[]; else delete h[field]; }
                const mode = spec(kind).update;
                let contentChanged = false;
                if (patch.body !== undefined) {
                    check(mode !== 'metadata', 'immutable_archive', 'ARCHIVE content never changes; store a new ARCHIVE.', {}, EXIT.conflict);
                    check(object(patch.body), 'schema_invalid', 'patch.body must be an object of kind fields.');
                    const snapshot = JSON.stringify(record.sections);
                    if (patch.replaceBody) {
                        check(mode === 'content', 'immutable_section', 'Only SNAP and DOCUMENT replace their body.', {}, EXIT.conflict);
                        const provided = new Set(Object.keys(patch.body)), fields = spec(kind).sections;
                        // Hand-written unregistered sections are not part of the kind body and are kept.
                        record.sections = record.sections.filter(s => !s.name || provided.has(fields.find(f => f.name === s.name)!.field));
                    }
                    applyBody(record, kind, patch.body, mode === 'content' ? 'replace' : 'supplement');
                    contentChanged = snapshot !== JSON.stringify(record.sections);
                    const primary = spec(kind).sections[0].name;
                    if (contentChanged && patch.summary === undefined && ((h.quality_flags as string[] | undefined) ?? []).includes('summary_derived') && sectionText(record, primary) !== sectionText(loaded.record, primary))
                        h.summary = deriveSummary(sectionText(record, primary), h.title as string);
                }
                else check(!patch.replaceBody, 'usage_invalid', 'replaceBody requires body.');
                if (patch.sources !== undefined) {
                    const managed = record.sources.filter(s => MANAGED_RELATIONS.has(s.relation));
                    const validate = (entries: unknown, name: string) => { check(Array.isArray(entries), 'usage_invalid', `${name} is a list.`); for (const e of entries as SourceEntry[]) { validateSource(e); check(!MANAGED_RELATIONS.has(e.relation), 'sources_invalid', `${e.relation} entries are written by the core.`, { relation: e.relation }); } return entries as SourceEntry[]; };
                    if ('replace' in patch.sources) record.sources = [...managed, ...validate(patch.sources.replace, 'sources.replace')];
                    else {
                        const remove = validate(patch.sources.remove ?? [], 'sources.remove'), add = validate(patch.sources.add ?? [], 'sources.add');
                        for (const r of remove) check(record.sources.some(s => sameSource(s, r)), 'sources_invalid', 'A removed source does not exist.', { relation: r.relation });
                        const kept = record.sources.filter(s => !remove.some(r => sameSource(r, s)));
                        record.sources = [...kept, ...add.filter((a, i) => !kept.some(s => sameSource(s, a)) && add.findIndex(b => sameSource(a, b)) === i)];
                    }
                }
                if (patch.headers !== undefined) {
                    check(object(patch.headers) && Object.keys(patch.headers).every(k => ['set', 'unset'].includes(k)), 'usage_invalid', 'patch.headers is {set?, unset?}.');
                    for (const [key, value] of Object.entries(patch.headers.set ?? {})) { check(isHostKey(key), 'custom_header_invalid', 'Only namespace.name headers are set here.', { key }); h[key] = value; }
                    for (const key of patch.headers.unset ?? []) { check(isHostKey(key), 'custom_header_invalid', 'Only namespace.name headers are unset here.', { key }); delete h[key]; }
                }
                if (contentChanged && mode === 'content') {
                    h.authorization_source = authorization.source;
                    record.sources = [...record.sources.filter(s => s.relation !== 'authorization'), ...authorizationSources(authorization)];
                }
                else if (mode !== 'content' && (contentChanged || patch.sources !== undefined || patch.headers !== undefined)) {
                    // A supplement keeps the record's original approval and appends the authorization of this change.
                    for (const entry of authorizationSources(authorization).length ? authorizationSources(authorization) : [{ relation: 'authorization', ref: authorization.source }])
                        if (!record.sources.some(s => sameSource(s, entry))) record.sources.push(entry);
                }
                let content = renderRecord(record);
                if (content !== loaded.content) { h.updated_at = now; content = renderRecord(record); }
                if (before.scope !== h.scope || before.key !== h.key || before.vocabulary !== slotView({ ...loaded, record }).vocabulary?.join()) slotChanged.add(loaded.id);
                write(loaded.path, loaded.digest, content);
                touched.add(kind);
                return { changes, recordId: loaded.id, slotChanged, touched: [...touched], flags: computeFlags(record) };
            }
        }
        return fail('usage_invalid', 'Unknown mutation action.');
    }
    private checkIntegrity(view: VaultView, changes: PreviewFile[], slotChanged: Set<string>, separate: Set<string>): Loaded[] {
        const overlay = new Map<string, string | null>();
        for (const c of changes) {
            contained(this.vault, c.path);
            check(c.afterDigest === (c.content === null ? null : sha256(fileBytes(c.content))), 'plan_invalid', 'Rendered bytes changed.', {}, EXIT.conflict);
            check(digestOrNull(this.vault, c.path) === c.beforeDigest, 'stale_input', 'Target content changed after prepare.', { path: c.path }, EXIT.conflict);
            overlay.set(c.path, c.content);
        }
        const records = view.scan(view.kinds, overlay);
        validateRelations(records);
        validateSlots(records, slotChanged, separate);
        return records;
    }
    private normalize(mutation: Mutation): Mutation & { now: string } {
        check(object(mutation) && typeof (mutation as ObjectValue).action === 'string', 'usage_invalid', 'mutation needs an action.');
        // A JSON copy drops undefined members, which canonical digests cannot represent.
        const m = JSON.parse(JSON.stringify(mutation)) as Mutation & { now: string };
        check(utf8Length(JSON.stringify(m)) <= LIMITS.request_bytes, 'request_too_large', `A write request is at most ${LIMITS.request_bytes} bytes.`, {}, EXIT.conflict);
        m.now = timestamp();
        if (m.action === 'capture') { if (m.id !== undefined) requireId(m.id, 'id'); else m.id = newId(); }
        if (m.action === 'supersede') { if (m.successorId !== undefined) requireId(m.successorId, 'successorId'); else m.successorId = newId(); }
        return m;
    }
    private needsArchive(mutation: Mutation): NeedsArchive | null {
        const input = mutation.action === 'capture' ? mutation.record : mutation.action === 'supersede' ? mutation.successor : null;
        const body = mutation.action === 'update' ? mutation.patch?.body : input?.body;
        if (!body || !object(body)) return null;
        const text = Object.values(body).filter(v => v !== null).map(v => Array.isArray(v) ? v.join('\n') : String(v)).join('\n\n');
        const bytesLength = utf8Length(text), maxBytes = input?.kind === 'archive' ? LIMITS.archive_bytes : LIMITS.body_bytes;
        if (bytesLength <= maxBytes) return null;
        const buffer = Buffer.from(text, 'utf8'), chunks: NeedsArchive['chunks'] = [];
        for (let from = 0, index = 0; from < buffer.length; index++) {
            let to = Math.min(buffer.length, from + LIMITS.archive_bytes);
            if (to < buffer.length) { const newline = buffer.lastIndexOf(10, to - 1); if (newline > from) to = newline + 1; while (to < buffer.length && (buffer[to] & 0xc0) === 0x80) to--; }
            chunks.push({ index, fromByte: from, toByte: to, sha256: sha256(buffer.subarray(from, to)) });
            from = to;
        }
        return { status: 'needs_archive', bodyBytes: bytesLength, maxBytes, sha256: sha256(buffer), chunks,
            message: 'The body exceeds the record limit. Store the original unchanged as ARCHIVE (split by these chunks when needed) and capture a shorter record whose Sources cite it. Whyve never condenses meaning.' };
    }
    /** Returns null when writing may proceed, or the review the caller still owes. */
    private reviewGate(view: VaultView, mutation: Mutation & { now: string }, comparison: ComparisonReceipt | undefined, review: SemanticReview | undefined): { gate: NeedsReview | null; separate: Set<string>; preconditions: { path: string; sha256: string | null }[] } {
        const separate = new Set<string>();
        if (!['capture', 'supersede'].includes(mutation.action)) return { gate: null, separate, preconditions: [] };
        const input = mutation.action === 'capture' ? mutation.record : (mutation as Extract<Mutation, { action: 'supersede' }>).successor;
        const set = this.comparisonSet(view, input, mutation.action as 'capture' | 'supersede', mutation.action === 'supersede' ? mutation.id : undefined, undefined);
        const mandatory = [...set.mandatory.keys()];
        const preconditions = [...set.preconditions];
        if (!mandatory.length) return { gate: null, separate, preconditions };
        if (!comparison) return { gate: { status: 'needs_review', reason: 'comparison_required', remaining: mandatory, message: 'Compare the mandatory records, judge each from its actual body, then prepare again with the receipt and judgments.' }, separate, preconditions };
        this.checkReceiptShape(comparison);
        check(comparison.vault === canonicalDigest(identity(this.vault)), 'receipt_invalid', 'Receipt belongs to another vault.', {}, EXIT.conflict);
        for (const p of [...comparison.reads.map(r => ({ path: r.path, sha256: r.sha256 })), ...comparison.preconditions])
            check(digestOrNull(this.vault, p.path) === p.sha256, 'stale_reference', 'Compared content changed; compare again before judging.', { path: p.path }, EXIT.conflict);
        const current = new Map(mandatory.map(id => [id, set.loaded.get(id) ?? view.find(id)]));
        const missing = mandatory.filter(id => !comparison.reads.some(r => r.id === id && r.sha256 === current.get(id)!.digest));
        if (missing.length) return { gate: { status: 'needs_review', reason: 'comparison_incomplete', remaining: missing, message: 'Some mandatory bodies were not delivered completely. Continue the comparison or read them, then prepare again.' }, separate, preconditions };
        const judgments = new Map<string, Judgment>();
        check(review === undefined || (object(review) && Array.isArray(review.judgments)), 'usage_invalid', 'semanticReview is {judgments: [{id, judgment, reason}]}.');
        for (const j of review?.judgments ?? []) {
            check(object(j) && ['same', 'separate', 'support', 'conflict', 'replace', 'unclear'].includes(j.judgment) && typeof j.reason === 'string' && j.reason.trim().length > 0 && j.reason.length <= 1000, 'usage_invalid', 'A judgment is {id, judgment, reason}.');
            requireId(j.id, 'judgments.id');
            judgments.set(j.id, j.judgment);
        }
        const unjudged = mandatory.filter(id => !judgments.has(id));
        if (unjudged.length) return { gate: { status: 'needs_review', reason: 'judgment_required', remaining: unjudged, message: 'Judge each mandatory record as same, separate, support, conflict, replace or unclear.' }, separate, preconditions };
        const target = mutation.action === 'supersede' ? mutation.id : null;
        if (target && !['replace', 'same'].includes(judgments.get(target)!))
            return { gate: { status: 'needs_review', reason: 'predecessor_not_replaced', remaining: [target], judgments: [{ id: target, judgment: judgments.get(target)! }], message: 'Supersede requires the predecessor to be judged replace or same from its actual body.' }, separate, preconditions };
        const blocking = mandatory.filter(id => id !== target && !['separate', 'support'].includes(judgments.get(id)!));
        if (blocking.length) return { gate: { status: 'needs_review', reason: 'semantic_conflict', remaining: blocking, judgments: blocking.map(id => ({ id, judgment: judgments.get(id)! })), message: 'A mandatory record was judged same, conflict, replace or unclear. Reference it, supersede it with an explicit choice, or ask the user.' }, separate, preconditions };
        for (const id of mandatory) if (['separate', 'support'].includes(judgments.get(id)!)) separate.add(id);
        const reads = comparison.reads.filter(r => mandatory.includes(r.id)).map(r => ({ path: r.path, sha256: r.sha256 as string | null }));
        return { gate: null, separate, preconditions: [...preconditions, ...reads, ...comparison.preconditions] };
    }
    private checkAuthorization(authorization: Authorization, touched: Kind[]): { approved: boolean; reason?: string; mode: ApprovalMode } {
        const settings = loadSettings(this.project);
        check(!settings.enabled || touched.every(k => settings.enabled!.includes(k)), 'feature_disabled', 'Enable this feature before recording.', { kinds: touched }, EXIT.conflict);
        check(object(authorization) && ['user', 'policy'].includes(authorization.source), 'approval_required', 'Provide user or configured policy authorization.', {}, EXIT.conflict);
        if (authorization.source === 'user') {
            check(Object.keys(authorization).every(k => ['source', 'references', 'meaning'].includes(k)) && (authorization.references === undefined || (Array.isArray(authorization.references) && authorization.references.length <= 12)), 'usage_invalid', 'User authorization is {source, references?, meaning?}.');
            for (const ref of authorization.references ?? []) validateSource({ relation: 'authorization', ref });
            return { approved: true, mode: settings.mode };
        }
        check(typeof authorization.reason === 'string' && authorization.reason.trim() && authorization.reason.length <= 1000 && ['record', 'ask'].includes(authorization.decision), 'policy_assessment_required', 'Policy authorization needs decision record|ask and a reason.', {}, EXIT.conflict);
        if (!settings.config || settings.mode === 'explicit') return { approved: false, reason: 'Explicit mode requires the user to approve this exact preview.', mode: settings.mode };
        check(realDirectory(path.resolve(this.project, settings.config.vault)) === this.vault, 'vault_policy_mismatch', 'Automatic recording is limited to the configured vault.', {}, EXIT.conflict);
        if (authorization.decision === 'ask') return { approved: false, reason: authorization.reason, mode: settings.mode };
        return { approved: true, mode: settings.mode };
    }
    private preparedPath(handle: string): string { check(typeof handle === 'string' && /^prep_[0-9a-f]{32}$/.test(handle), 'handle_invalid', 'Unknown prepared handle.', {}, EXIT.notFound); return `${PREPARED_DIR}/${handle}.json`; }
    private savePrepared(file: PreparedFile): void {
        const body = JSON.stringify({ ...file, digest: canonicalDigest(file) }) + '\n';
        check(utf8Length(body) <= LIMITS.transaction_bytes, 'request_too_large', `The prepared transaction exceeds ${LIMITS.transaction_bytes} bytes.`, {}, EXIT.conflict);
        atomicWrite(this.vault, this.preparedPath(file.handle), Buffer.from(body), 0o600);
    }
    private loadPrepared(handle: string): PreparedFile {
        const raw = bytes(this.vault, this.preparedPath(handle), LIMITS.transaction_bytes + 4096);
        check(raw, 'handle_invalid', 'Unknown or expired prepared handle.', {}, EXIT.notFound);
        const { digest, ...file } = strictJson(utf8(raw), 'handle_invalid');
        check(file.schema === 'whyve-prepared/v1' && file.handle === handle && canonicalDigest(file) === digest, 'handle_invalid', 'Prepared state was altered.', {}, EXIT.integrity);
        return JSON.parse(JSON.stringify(file)) as PreparedFile;
    }
    private cleanupPrepared(): void {
        const directory = path.join(this.vault, PREPARED_DIR);
        if (!fs.existsSync(directory)) return;
        for (const name of fs.readdirSync(directory)) {
            if (!/^prep_[0-9a-f]{32}\.json$/.test(name)) continue;
            try { if (Date.now() - fs.statSync(path.join(directory, name)).mtimeMs > PREPARED_TTL_MS) fs.unlinkSync(path.join(directory, name)); } catch { /* concurrent cleanup */ }
        }
    }
    async prepare(request: PrepareRequest): Promise<PrepareResult> {
        return this.locked(() => {
            check(object(request), 'usage_invalid', 'prepare needs a request object.');
            if ('preparedHandle' in request) return this.approvePrepared(options(request, ['preparedHandle', 'authorization'], 'prepare'));
            const o = options<Extract<PrepareRequest, { mutation: Mutation }>>(request, ['mutation', 'authorization', 'comparison', 'semanticReview'], 'prepare');
            const view = this.writableView();
            this.cleanupPrepared();
            const archive = this.needsArchive(o.mutation);
            if (archive) return archive;
            const mutation = this.normalize(o.mutation);
            // Shape and lifecycle errors come before the review gate so no comparison is wasted on an invalid write.
            let planned: ReturnType<Whyve['plan']>;
            try { planned = this.plan(view, mutation, o.authorization?.source ? o.authorization : { source: 'user' }); }
            catch (e) { if (e instanceof WhyveError && ['body_too_large', 'archive_too_large'].includes(e.code)) return this.needsArchive(mutation) ?? (() => { throw e; })(); throw e; }
            const gate = this.reviewGate(view, mutation, o.comparison, o.semanticReview);
            if (gate.gate) return gate.gate;
            const auth = this.checkAuthorization(o.authorization, planned.touched);
            this.checkIntegrity(view, planned.changes, planned.slotChanged, gate.separate);
            const referenced = new Set(planned.changes.filter(c => c.content).flatMap(c => [...c.content!.matchAll(/^- [a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*: (ctx_[0-9a-f]{32})$/gm)].map(m => m[1])));
            const refPre = [...referenced].flatMap(id => { try { const r = view.find(id); return planned.changes.some(c => c.path === r.path) ? [] : [{ path: r.path, sha256: r.digest as string | null }]; } catch { return []; } });
            const preconditions = [...new Map([...gate.preconditions, ...refPre].map(p => [p.path, p])).values()].sort((a, b) => compareText(a.path, b.path));
            const file: PreparedFile = { schema: 'whyve-prepared/v1', handle: newHandle(), created_at: new Date().toISOString(), state: auth.approved ? 'prepared' : 'needs_approval', action: mutation.action, record_id: planned.recordId,
                mutation, authorization: o.authorization, separate: [...gate.separate].sort(compareText), binding: this.binding(view), preconditions, changes: planned.changes, quality_flags: planned.flags, ...(auth.approved ? {} : { reason: auth.reason }) };
            this.savePrepared(file);
            const common = { handle: file.handle, action: file.action, recordId: file.record_id, preview: { files: file.changes }, qualityFlags: describeFlags(file.quality_flags) };
            return auth.approved ? { status: 'prepared', ...common } as Prepared : { status: 'needs_approval', ...common, reason: auth.reason! } as NeedsApproval;
        }, true);
    }
    private approvePrepared(o: { preparedHandle: string; authorization: Authorization }): PrepareResult {
        const file = this.loadPrepared(o.preparedHandle), view = this.writableView();
        check(file.state === 'needs_approval', 'handle_state_invalid', file.state === 'applied' ? 'This preview was already applied.' : 'This preview is already approved.', { state: file.state }, EXIT.conflict);
        check(canonicalDigest(file.binding) === canonicalDigest(this.binding(view)), 'project_policy_changed', 'Project, recording policy or registry changed after the preview; prepare again.', {}, EXIT.conflict);
        for (const p of file.preconditions) check(digestOrNull(this.vault, p.path) === p.sha256, 'stale_reference', 'Compared content changed after the preview; compare and prepare again.', { path: p.path }, EXIT.conflict);
        // Completing a held preview is the human's approval; a policy cannot approve what policy chose to ask about.
        check(o.authorization?.source === 'user', 'approval_required', 'Only the user can approve a preview that waits for approval.', {}, EXIT.conflict);
        const planned = this.plan(view, file.mutation, o.authorization);
        const auth = this.checkAuthorization(o.authorization, planned.touched);
        check(auth.approved, 'approval_required', auth.reason ?? 'Approval is still required.', {}, EXIT.conflict);
        this.checkIntegrity(view, planned.changes, planned.slotChanged, new Set(file.separate));
        const next: PreparedFile = { ...file, state: 'prepared', authorization: o.authorization, changes: planned.changes, quality_flags: planned.flags, reason: undefined };
        delete next.reason;
        this.savePrepared(next);
        return { status: 'prepared', handle: next.handle, action: next.action, recordId: next.record_id, preview: { files: next.changes }, qualityFlags: describeFlags(next.quality_flags) };
    }
    async apply(handle: string): Promise<WriteReceipt> {
        return this.locked(() => {
            const file = this.loadPrepared(handle);
            if (file.state === 'applied' && file.receipt) return { ...file.receipt, status: 'already_applied' };
            check(file.state === 'prepared' || file.state === 'applying', 'approval_required', 'This preview awaits approval; complete it with prepare({ preparedHandle, authorization }).', {}, EXIT.conflict);
            const view = this.writableView();
            check(canonicalDigest(file.binding) === canonicalDigest(this.binding(view)), 'project_policy_changed', 'Project, recording policy, registry or runtime changed after prepare.', {}, EXIT.conflict);
            const settings = loadSettings(this.project), finish = (status: WriteReceipt['status'], changed: string[]) => {
                const receipt: WriteReceipt = { status, handle, recordId: file.record_id, changedPaths: changed, qualityFlags: describeFlags(file.quality_flags), indexDigest: this.indexDigest(this.view(), this.view().kinds), authorization: { ...file.authorization, mode: settings.mode } };
                this.savePrepared({ ...file, state: 'applied', receipt });
                return receipt;
            };
            // Only an attempt that reached the transaction may be recognised as applied by its bytes; a never-attempted
            // preview whose target merely looks the same (e.g. a deletion done by another write) must fail its checks.
            if (file.state === 'applying' && file.changes.every(c => digestOrNull(this.vault, c.path) === c.afterDigest)) return finish('already_applied', []);
            for (const p of file.preconditions) check(digestOrNull(this.vault, p.path) === p.sha256, 'stale_reference', 'Compared or referenced content changed after prepare.', { path: p.path }, EXIT.conflict);
            const planned = this.plan(view, file.mutation, file.authorization);
            check(canonicalDigest(planned.changes) === canonicalDigest(file.changes), 'plan_invalid', 'The prepared preview no longer matches the vault; prepare again.', {}, EXIT.conflict);
            const records = this.checkIntegrity(view, file.changes, planned.slotChanged, new Set(file.separate));
            const changes: FileChange[] = file.changes.map(c => ({ path: c.path, content: c.content === null ? null : fileBytes(c.content), expected: c.beforeDigest }));
            for (const kind of planned.touched) {
                const current = bytes(this.vault, areaIndexPath(kind));
                changes.push({ path: areaIndexPath(kind), content: fileBytes(view.renderArea(kind, records)), expected: current ? sha256(current) : null });
            }
            this.savePrepared({ ...file, state: 'applying' });
            return finish('applied', this.storage.transaction(changes));
        }, true);
    }
}
export function createWhyve(options: WhyveOptions): Whyve { return new Whyve(options); }
