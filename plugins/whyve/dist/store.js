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
exports.Whyve = void 0;
exports.readHeaders = readHeaders;
exports.createWhyve = createWhyve;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const node_crypto_1 = require("node:crypto");
const common_1 = require("./common");
const filesystem_1 = require("./filesystem");
const model_1 = require("./model");
const record_1 = require("./record");
const vault_1 = require("./vault");
const regex_1 = require("./regex");
const runtime_1 = require("./runtime");
const FEATURES = ['decision', 'assumption', 'term', 'intent', 'document'];
const BUILTINS = ['snapshot', 'observation', 'archive'];
const PREPARED_DIR = '.whyve-runtime/prepared';
const PREPARED_TTL_MS = 7 * 86400000;
function loadSettings(project) {
    const raw = (0, filesystem_1.bytes)(project, '.whyve/config.json', 8192);
    if (!raw)
        return { project, config: null, digest: null, mode: 'explicit', enabled: null };
    const config = (0, common_1.strictJson)((0, filesystem_1.utf8)(raw), 'config_invalid');
    (0, common_1.exact)(config, ['schema', 'features', 'approval', 'vault'], 'config_invalid');
    (0, common_1.exact)(config.approval, ['mode'], 'config_invalid');
    (0, common_1.check)(config.schema === 'whyve-project/v1' && Array.isArray(config.features) && config.features.every((x) => FEATURES.includes(x)) && new Set(config.features).size === config.features.length && ['explicit', 'auto', 'adaptive'].includes(config.approval.mode) && typeof config.vault === 'string' && !!config.vault && !config.vault.includes('\0'), 'config_invalid', 'Invalid Whyve project configuration.');
    return { project, config, digest: (0, common_1.sha256)(raw), mode: config.approval.mode, enabled: [...BUILTINS, ...config.features] };
}
const encodeCursor = (body) => Buffer.from((0, common_1.canonicalJson)(body), 'utf8').toString('base64url');
function openCursor(cursor, expected, total) {
    if (cursor === undefined || cursor === null)
        return { offset: 0 };
    const invalid = () => (0, common_1.fail)('cursor_invalid', 'Cursor does not belong to this request; repeat the request without a cursor.');
    if (typeof cursor !== 'string' || cursor.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(cursor))
        invalid();
    let body;
    try {
        body = (0, common_1.strictJson)(Buffer.from(cursor, 'base64url').toString('utf8'), 'cursor_invalid');
    }
    catch {
        invalid();
    }
    (0, common_1.check)((0, common_1.object)(body) && body.v === 3 && body.method === expected.method && body.vault === expected.vault && body.request === expected.request && Number.isSafeInteger(body.offset) && body.offset >= 0 && body.offset <= total, 'cursor_invalid', 'Cursor does not belong to this request; repeat the request without a cursor.');
    (0, common_1.check)(body.snapshot === expected.snapshot, 'cursor_stale', 'The selected set changed since this cursor was issued; restart from the first page.', {}, common_1.EXIT.conflict);
    return { offset: body.offset, extra: body.extra };
}
function pageLimit(value, fallback, maximum) {
    const limit = value === undefined ? fallback : value;
    (0, common_1.check)(Number.isSafeInteger(limit) && limit >= 1 && limit <= maximum, 'usage_invalid', `limit must be an integer from 1 to ${maximum}.`);
    return limit;
}
function byteLimit(value) {
    const limit = value === undefined ? model_1.LIMITS.read_default_bytes : value;
    (0, common_1.check)(Number.isSafeInteger(limit) && limit >= 256 && limit <= model_1.LIMITS.read_max_bytes, 'usage_invalid', `maxBytes must be an integer from 256 to ${model_1.LIMITS.read_max_bytes}.`);
    return limit;
}
function options(value, keys, name) {
    if (value === undefined)
        return {};
    (0, common_1.check)((0, common_1.object)(value) && Object.keys(value).every(k => keys.includes(k)), 'usage_invalid', `${name} accepts only: ${keys.join(', ')}.`, { unknown: (0, common_1.object)(value) ? Object.keys(value).filter(k => !keys.includes(k)) : [] });
    return value;
}
// ---------------------------------------------------------------- header scanning
/** Reads only the opening header block (at most 16 KiB); record bodies are never read. */
function readHeaders(root, relative) {
    const target = (0, filesystem_1.contained)(root, relative), fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try {
        const buffer = Buffer.alloc(model_1.LIMITS.header_bytes + 1), read = fs.readSync(fd, buffer, 0, buffer.length, 0);
        let text = buffer.subarray(0, read).toString('utf8');
        const close = text.indexOf('\n---\n');
        (0, common_1.check)(close > 0 && close + 5 <= model_1.LIMITS.header_bytes, 'header_invalid', 'Header block is missing or larger than 16 KiB.', { path: relative });
        text = text.slice(0, close + 5);
        return (0, record_1.parseHeaderBlock)(text).headers;
    }
    finally {
        fs.closeSync(fd);
    }
}
function matchValue(condition, value, compiled) {
    if (value === undefined)
        return false;
    const values = Array.isArray(value) ? value : [value], wanted = (0, common_1.nfc)(condition.value);
    return values.some(v => condition.op === 'eq' ? (0, common_1.nfc)(v) === wanted : condition.op === 'contains' ? (0, common_1.nfc)(v).includes(wanted) : compiled.test(v));
}
function compileConditions(headers) {
    (0, common_1.check)((0, common_1.object)(headers) && Array.isArray(headers.conditions) && headers.conditions.length >= 1 && headers.conditions.length <= 8 && (headers.match === undefined || ['all', 'any'].includes(headers.match)), 'usage_invalid', 'headers must have 1–8 conditions, and match must be all or any.');
    const compiled = headers.conditions.map(c => {
        (0, common_1.check)((0, common_1.object)(c) && typeof c.key === 'string' && ((0, record_1.isHostKey)(c.key) || /^[a-z][a-z0-9_]*$/.test(c.key)) && ['eq', 'contains', 'regex'].includes(c.op) && typeof c.value === 'string' && (c.flags === undefined || c.op === 'regex'), 'usage_invalid', 'Each header condition must be {key, op, value, flags?}, where op is eq, contains, or regex, and flags is allowed only with regex.');
        return c.op === 'regex' ? (0, regex_1.compileRegex)(c.value, c.flags ?? '') : undefined;
    });
    const all = (headers.match ?? 'all') === 'all';
    return (values) => all ? headers.conditions.every((c, i) => matchValue(c, values[c.key], compiled[i])) : headers.conditions.some((c, i) => matchValue(c, values[c.key], compiled[i]));
}
const statDigest = (root, paths) => (0, common_1.canonicalDigest)(paths.map(p => { try {
    const s = fs.statSync((0, filesystem_1.contained)(root, p));
    return [p, s.size, Math.round(s.mtimeMs)];
}
catch {
    return [p, null, null];
} }));
const newHandle = () => 'prep_' + (0, node_crypto_1.randomBytes)(16).toString('hex');
const utf8Length = (text) => Buffer.byteLength(text, 'utf8');
class Whyve {
    vault;
    project;
    storage;
    projectStorage;
    constructor(options) {
        try {
            (0, common_1.check)(options.vault || options.project, 'usage_invalid', 'Provide a vault or project directory.');
            this.project = (0, filesystem_1.realDirectory)(options.project ?? options.vault);
            const settings = loadSettings(this.project);
            this.vault = (0, filesystem_1.realDirectory)(options.vault ?? path.resolve(this.project, settings.config?.vault ?? '.'));
            this.storage = new filesystem_1.Filesystem(this.vault, options);
            this.projectStorage = new filesystem_1.Filesystem(this.project, options);
        }
        catch (error) {
            throw (0, common_1.toWhyveError)(error);
        }
    }
    async locked(fn, projectToo = false) {
        try {
            if (!projectToo || this.project === this.vault)
                return await this.storage.locked(fn);
            const [first, second] = this.project < this.vault ? [this.projectStorage, this.storage] : [this.storage, this.projectStorage];
            return await first.locked(() => second.locked(fn));
        }
        catch (error) {
            throw (0, common_1.toWhyveError)(error);
        }
    }
    view() { return new vault_1.VaultView(this.vault); }
    writableView() {
        const format = (0, vault_1.detectFormat)(this.vault);
        (0, common_1.check)(format !== 'v2', 'migration_required', 'This vault uses context-common/v2 and is read-only. To write, migrate it with migrate-project PATH --to-format context-common/v3 --plan-dir DIR (whyve migrate-project, or context_cli.mjs migrate-project in the plugin).', { vault: this.vault }, common_1.EXIT.conflict);
        const view = this.view();
        (0, common_1.check)(!view.outdated.length, 'registry_outdated', 'Registered descriptors differ from this runtime. Run refresh --fix (whyve refresh --fix, or context_cli.mjs refresh --fix in the plugin).', { kinds: view.outdated }, common_1.EXIT.conflict);
        return view;
    }
    binding(view) {
        const settings = loadSettings(this.project);
        return { project_identity: (0, filesystem_1.identity)(this.project), vault_identity: (0, filesystem_1.identity)(this.vault), config_digest: settings.digest, registry_digest: view.registryDigest, projections_digest: (0, filesystem_1.digestOrNull)(this.vault, vault_1.PROJECTIONS), runtime: 'whyve-typescript/v3', runtime_digest: runtime_1.runtimeDigest };
    }
    // ------------------------------------------------------------ settings and setup
    settings() {
        return (0, common_1.withErrors)(() => {
            const settings = loadSettings(this.project), format = (0, vault_1.detectFormat)(this.vault);
            const registered = format === 'none' ? [] : this.view().kinds;
            return { project: this.project, vault: this.vault, config: settings.config, digest: settings.digest, mode: settings.mode, enabled: settings.enabled, format: format === 'v3' ? model_1.MODEL.protocol : format === 'v2' ? 'context-common/v2' : 'uninitialized', registered, registered_features: registered.filter(k => FEATURES.includes(k)) };
        });
    }
    capabilities() {
        return { schema: 'whyve-capabilities/v3', version: common_1.VERSION, protocol: model_1.MODEL.protocol, kinds: model_1.MODEL.kinds, limits: model_1.LIMITS, regex: { syntax: 're2-subset', flags: ['i'], maxBytes: model_1.LIMITS.regex_bytes, unsupported: regex_1.REGEX_UNSUPPORTED },
            methods: ['capabilities', 'status', 'list', 'searchHeaders', 'read', 'checkSlot', 'validateReadReceipt', 'compare', 'prepare', 'apply'] };
    }
    async status() {
        return this.locked(() => {
            const settings = loadSettings(this.project), format = (0, vault_1.detectFormat)(this.vault);
            if (format === 'none')
                return { format: 'uninitialized', writable: false, indexDigest: null, vault: this.vault, project: this.project, mode: settings.mode, enabled: settings.enabled, registered: [], version: common_1.VERSION };
            const view = this.view();
            return { format: format === 'v3' ? model_1.MODEL.protocol : 'context-common/v2', writable: format === 'v3' && !view.outdated.length, indexDigest: this.indexDigest(view, view.kinds), vault: this.vault, project: this.project, mode: settings.mode, enabled: settings.enabled, registered: view.kinds, version: common_1.VERSION };
        });
    }
    indexDigest(view, kinds) {
        return (0, common_1.canonicalDigest)({ root: (0, filesystem_1.digestOrNull)(this.vault, vault_1.ROOT_INDEX), registry: view.registryDigest, areas: [...kinds].sort(common_1.compareText).map(k => [k, view.format === 'v3' ? view.areaDigest(k) : (0, common_1.sha256)(Buffer.from(view.legacyArea(k).text))]) });
    }
    adoptLegacy(confirmLegacyStopped) {
        return (0, common_1.withErrors)(() => {
            const roots = this.project === this.vault ? [this.storage] : [this.storage, this.projectStorage].sort((a, b) => (0, common_1.compareText)(a.root, b.root));
            return { adopted: true, vault: this.vault, project: this.project, adopted_roots: roots.map(root => root.adoptLegacy(confirmLegacyStopped).vault), protocol: 'exclusive-node-writer/v1', records_changed: false };
        });
    }
    async recoverRuntime() {
        try {
            const roots = this.project === this.vault ? [this.storage] : [this.storage, this.projectStorage].sort((a, b) => (0, common_1.compareText)(a.root, b.root));
            for (const root of roots)
                await root.recoverAbandoned();
            return { recovered: true, vault: this.vault, project: this.project, recovered_roots: roots.map(r => r.root) };
        }
        catch (error) {
            throw (0, common_1.toWhyveError)(error);
        }
    }
    async initialize(options = {}) {
        return this.locked(() => {
            const before = loadSettings(this.project), format = (0, vault_1.detectFormat)(this.vault);
            const registered = format === 'none' ? [] : this.view().kinds;
            const features = options.features ?? before.config?.features ?? (format === 'none' ? ['decision'] : registered.filter(k => FEATURES.includes(k)));
            (0, common_1.check)(Array.isArray(features) && features.every(x => FEATURES.includes(x)) && new Set(features).size === features.length, 'config_invalid', 'Invalid feature selection.');
            const mode = options.approvalMode ?? before.mode;
            (0, common_1.check)(['explicit', 'auto', 'adaptive'].includes(mode), 'config_invalid', 'Invalid approval mode.');
            const wanted = [...new Set([...registered, ...BUILTINS, ...features])].sort(common_1.compareText);
            const changes = [];
            if (format === 'v2')
                (0, common_1.check)(wanted.every(k => registered.includes(k)), 'migration_required', 'New areas require the v3 format; migrate this vault first.', { missing: wanted.filter(k => !registered.includes(k)) }, common_1.EXIT.conflict);
            else {
                for (const kind of wanted.filter(k => !registered.includes(k))) {
                    (0, common_1.check)((0, filesystem_1.bytes)(this.vault, (0, vault_1.areaIndexPath)(kind)) === null, 'area_exists', 'Area index already exists outside the registry.', { area: kind }, common_1.EXIT.conflict);
                    changes.push({ path: (0, vault_1.areaIndexPath)(kind), content: (0, common_1.fileBytes)((0, vault_1.emptyArea)(kind)), expected: null });
                }
                if (wanted.join() !== registered.join() || format === 'none') {
                    changes.push({ path: vault_1.ROOT_INDEX, content: (0, common_1.fileBytes)((0, vault_1.renderRoot)(wanted)), expected: (0, filesystem_1.digestOrNull)(this.vault, vault_1.ROOT_INDEX) });
                    changes.push({ path: vault_1.REGISTRY, content: Buffer.from((0, vault_1.renderRegistry)(wanted)), expected: (0, filesystem_1.digestOrNull)(this.vault, vault_1.REGISTRY) });
                }
            }
            const config = { schema: 'whyve-project/v1', features, approval: { mode }, vault: path.relative(this.project, this.vault) || '.' };
            const projectChanges = [];
            if (JSON.stringify(before.config) !== JSON.stringify(config))
                projectChanges.push({ path: '.whyve/config.json', content: Buffer.from(JSON.stringify(config, null, 2) + '\n'), expected: before.digest });
            if (options.host) {
                const target = options.host === 'codex' ? 'AGENTS.md' : 'CLAUDE.md', original = (0, filesystem_1.bytes)(this.project, target), text = original ? (0, filesystem_1.utf8)(original) : '';
                const begin = '<!-- BEGIN context-core-policy (managed by context-core) -->', end = '<!-- END context-core-policy (managed by context-core) -->';
                (0, common_1.check)(text.includes(begin) === text.includes(end) && text.split(begin).length <= 2 && text.split(end).length <= 2, 'policy_invalid', 'Managed guidance markers are malformed.');
                const updated = text.includes(begin) ? text.slice(0, text.indexOf(begin)) + common_1.contracts.policy + text.slice(text.indexOf(end) + end.length) : text.replace(/\n*$/, '') + (text ? '\n\n' : '') + common_1.contracts.policy + '\n';
                projectChanges.push({ path: target, content: (0, common_1.fileBytes)(updated), expected: original ? (0, common_1.sha256)(original) : null });
            }
            if (fs.existsSync(path.join(this.vault, '.git'))) {
                const relative = '.gitattributes', raw = (0, filesystem_1.bytes)(this.vault, relative), original = raw ? (0, filesystem_1.utf8)(raw) : '', begin = '# BEGIN context-core-merge (managed by context-core)', end = '# END context-core-merge (managed by context-core)';
                (0, common_1.check)(original.includes(begin) === original.includes(end) && original.split(begin).length <= 2 && original.split(end).length <= 2, 'policy_invalid', 'Managed merge markers are malformed.');
                const block = common_1.contracts.merge_attributes, updated = original.includes(begin) ? original.slice(0, original.indexOf(begin)) + block + original.slice(original.indexOf(end) + end.length) : original.replace(/\n*$/, '') + (original ? '\n\n' : '') + block + '\n';
                if (updated !== original)
                    changes.push({ path: relative, content: (0, common_1.fileBytes)(updated), expected: raw ? (0, common_1.sha256)(raw) : null });
            }
            const changed = this.project === this.vault ? this.storage.transaction([...changes, ...projectChanges]) : [...this.storage.transaction(changes), ...this.projectStorage.transaction(projectChanges).map(p => path.join(this.project, p))];
            return { schema: 'whyve-init-result/v3', version: common_1.VERSION, project: this.project, vault: this.vault, format: format === 'v2' ? 'context-common/v2' : model_1.MODEL.protocol, config, enabled: [...BUILTINS, ...features], changed_paths: changed, applied: changed.length > 0 };
        }, true);
    }
    /** Verifies records, links, slots and indexes. With fix, regenerates indexes and the registry from records. */
    async refresh(fix = false) {
        return this.locked(() => {
            const format = (0, vault_1.detectFormat)(this.vault);
            (0, common_1.check)(format !== 'none', 'context_root_missing', 'Context root index is missing. Initialize Whyve first ($whyve:init in Codex, /whyve:init in Claude Code, or whyve init).', {}, common_1.EXIT.notFound);
            (0, common_1.check)(!fix || format === 'v3', 'migration_required', 'Index repair writes v3 files; migrate this vault first.', {}, common_1.EXIT.conflict);
            const issues = [], changes = [];
            let kinds;
            if (format === 'v3') {
                try {
                    kinds = this.view().kinds;
                }
                catch (error) {
                    if (!fix || !(error instanceof common_1.WhyveError))
                        throw error;
                    issues.push({ code: error.code });
                    kinds = model_1.KINDS.filter(k => (0, filesystem_1.bytes)(this.vault, (0, vault_1.areaIndexPath)(k)) !== null);
                }
                const registry = (0, vault_1.renderRegistry)(kinds), root = (0, vault_1.renderRoot)(kinds);
                if ((0, filesystem_1.utf8)((0, filesystem_1.bytes)(this.vault, vault_1.REGISTRY) ?? Buffer.alloc(0)) !== registry) {
                    issues.push({ code: 'registry_drift', path: vault_1.REGISTRY });
                    changes.push({ path: vault_1.REGISTRY, content: Buffer.from(registry), expected: (0, filesystem_1.digestOrNull)(this.vault, vault_1.REGISTRY) });
                }
                if ((0, filesystem_1.utf8)((0, filesystem_1.bytes)(this.vault, vault_1.ROOT_INDEX) ?? Buffer.alloc(0)) !== root) {
                    issues.push({ code: 'index_content_drift', path: vault_1.ROOT_INDEX });
                    changes.push({ path: vault_1.ROOT_INDEX, content: (0, common_1.fileBytes)(root), expected: (0, filesystem_1.digestOrNull)(this.vault, vault_1.ROOT_INDEX) });
                }
            }
            else
                kinds = this.view().kinds;
            const view = format === 'v3' ? new vault_1.VaultView(this.vault, { kinds }) : this.view();
            const records = view.scan(kinds);
            for (const [name, fn] of [['relations', () => (0, vault_1.validateRelations)(records)], ['slots', () => (0, vault_1.validateSlots)(records, new Set(records.map(r => r.id)), new Set(), true)]]) {
                try {
                    fn();
                }
                catch (e) {
                    if (e instanceof common_1.WhyveError)
                        issues.push({ code: e.code, check: name, ...e.details });
                    else
                        throw e;
                }
            }
            if (format === 'v3')
                for (const kind of kinds) {
                    const text = view.renderArea(kind, records), current = (0, filesystem_1.bytes)(this.vault, (0, vault_1.areaIndexPath)(kind));
                    if (!current || (0, filesystem_1.utf8)(current) !== text) {
                        issues.push({ code: 'index_content_drift', path: (0, vault_1.areaIndexPath)(kind) });
                        changes.push({ path: (0, vault_1.areaIndexPath)(kind), content: (0, common_1.fileBytes)(text), expected: current ? (0, common_1.sha256)(current) : null });
                    }
                }
            const repairable = new Set(['index_content_drift', 'registry_drift', 'registry_invalid', 'registry_missing', 'index_stale', 'index_noncanonical', 'index_row_invalid']);
            (0, common_1.check)(!fix || issues.every(i => repairable.has(i.code)), 'integrity_error', 'Resolve record integrity errors before rebuilding indexes.', { issues }, common_1.EXIT.integrity);
            const changed = fix ? this.storage.transaction(changes) : [];
            return { ok: issues.length === 0 || fix, format: format === 'v3' ? model_1.MODEL.protocol : 'context-common/v2', issues, changed_paths: changed, record_count: records.length, index_fixed: fix };
        });
    }
    // ------------------------------------------------------------ discovery
    selectKinds(view, requested, strict, coverage, warnings) {
        const enabled = loadSettings(this.project).enabled;
        if (requested !== undefined) {
            (0, common_1.check)(Array.isArray(requested) && requested.length > 0 && requested.every(model_1.isKind), 'usage_invalid', 'kinds must be a non-empty list of record kinds.');
            for (const kind of requested.filter(k => !view.kinds.includes(k))) {
                (0, common_1.check)(!strict, 'area_not_registered', 'Requested area is not registered.', { kind }, common_1.EXIT.notFound);
                coverage.push({ kind, reason: 'area_unavailable' });
                warnings.push({ code: 'area_not_registered', kind });
            }
            for (const kind of view.kinds.filter(k => !requested.includes(k)))
                coverage.push({ kind, reason: 'not_requested' });
            return view.kinds.filter(k => requested.includes(k));
        }
        for (const kind of view.kinds.filter(k => enabled && !enabled.includes(k)))
            coverage.push({ kind, reason: 'feature_disabled' });
        return view.kinds.filter(k => !enabled || enabled.includes(k));
    }
    filterRows(view, o, warnings) {
        const unqueried = [], strict = o.strictIndex ?? true, applied = [];
        (0, common_1.check)(typeof strict === 'boolean', 'usage_invalid', 'strictIndex must be a boolean.');
        const kinds = this.selectKinds(view, o.kinds, strict, unqueried, warnings), queried = [];
        const state = o.state ?? 'current';
        (0, common_1.check)(['current', 'history', 'all'].includes(state), 'usage_invalid', 'state must be current, history or all.');
        let scope = null;
        if (o.scope !== undefined) {
            (0, common_1.check)((0, common_1.object)(o.scope) && typeof o.scope.value === 'string' && (o.scope.match === undefined || ['exact', 'ancestor', 'descendant', 'overlap'].includes(o.scope.match)), 'usage_invalid', 'scope must be {value, match?}, where match is exact, ancestor, descendant, or overlap.');
            scope = { value: (0, common_1.canonicalScope)(o.scope.value), match: o.scope.match ?? 'exact' };
            applied.push('scope');
        }
        const key = o.key === undefined ? null : (0, common_1.canonicalKey)(o.key);
        const time = (range, name) => {
            if (range === undefined)
                return null;
            (0, common_1.check)((0, common_1.object)(range) && Object.keys(range).every(k => ['from', 'to'].includes(k)), 'usage_invalid', `${name} must be {from?, to?}.`);
            const parse = (v) => { if (v === undefined)
                return null; (0, common_1.check)(typeof v === 'string' && Number.isFinite(Date.parse(v)), 'usage_invalid', `${name} bounds must be ISO dates or timestamps.`); return Date.parse(v); };
            applied.push(name);
            return { from: parse(range.from), to: parse(range.to) };
        };
        const created = time(o.created, 'created'), updated = time(o.updated, 'updated');
        let keywords = null;
        if (o.keywords !== undefined) {
            (0, common_1.check)((0, common_1.object)(o.keywords) && Array.isArray(o.keywords.values) && o.keywords.values.length >= 1 && o.keywords.values.length <= 12 && o.keywords.values.every(v => typeof v === 'string') && (o.keywords.match === undefined || ['all', 'any'].includes(o.keywords.match)), 'usage_invalid', 'keywords must be {values, match?} with 1–12 string values, and match must be all or any.');
            keywords = { values: o.keywords.values.map(common_1.nfc), all: (o.keywords.match ?? 'all') === 'all' };
            applied.push('keywords');
        }
        if (o.ids !== undefined) {
            (0, common_1.check)(Array.isArray(o.ids) && o.ids.length <= 500, 'usage_invalid', 'ids must be a list of at most 500 IDs.');
            o.ids.forEach(id => (0, common_1.requireId)(id, 'ids'));
            applied.push('ids');
        }
        if (o.textContains !== undefined) {
            (0, common_1.check)(typeof o.textContains === 'string' && o.textContains.length > 0 && o.textContains.length <= 200, 'usage_invalid', 'textContains must be a non-empty string of at most 200 characters.');
            applied.push('textContains');
        }
        if (key !== null)
            applied.push('key');
        if (o.kinds)
            applied.push('kinds');
        if (o.state)
            applied.push('state');
        const ids = o.ids ? new Set(o.ids) : null, text = o.textContains === undefined ? null : (0, common_1.nfc)(o.textContains);
        const rows = [], seen = new Set();
        for (const kind of kinds) {
            let all;
            try {
                all = view.rows(kind);
            }
            catch (e) {
                if (strict || !(e instanceof common_1.WhyveError) || ['path_escape', 'symlink_path'].includes(e.code))
                    throw e;
                unqueried.push({ kind, reason: 'index_invalid' });
                warnings.push({ code: 'area_index_invalid', kind });
                continue;
            }
            queried.push(kind);
            for (const row of all) {
                const f = row.fields;
                (0, common_1.check)(!seen.has(f.id), 'index_duplicate_entry', 'Record ID is indexed more than once.', { id: f.id }, common_1.EXIT.integrity);
                seen.add(f.id);
                if (state !== 'all' && f.state !== state)
                    continue;
                if (scope) {
                    const ok = scope.match === 'exact' ? f.scope === scope.value : scope.match === 'ancestor' ? (scope.value === f.scope || scope.value.startsWith(f.scope + '/')) : scope.match === 'descendant' ? (f.scope === scope.value || f.scope.startsWith(scope.value + '/')) : (0, common_1.scopesOverlap)(f.scope, scope.value);
                    if (!ok)
                        continue;
                }
                if (key !== null && f.key !== key)
                    continue;
                const within = (value, range) => !range || (value !== '' && (range.from === null || Date.parse(value) >= range.from) && (range.to === null || Date.parse(value) < range.to));
                if (!within(f.createdAt, created) || !within(f.updatedAt, updated))
                    continue;
                if (keywords) {
                    const own = new Set(f.keywords.map(common_1.nfc));
                    if (keywords.all ? !keywords.values.every(v => own.has(v)) : !keywords.values.some(v => own.has(v)))
                        continue;
                }
                if (ids && !ids.has(f.id))
                    continue;
                if (text !== null && !(0, common_1.nfc)(f.title).includes(text) && !(0, common_1.nfc)(f.summary).includes(text))
                    continue;
                rows.push(row);
            }
        }
        return { rows, kinds, queried, unqueried: unqueried.sort((a, b) => (0, common_1.compareText)(a.kind, b.kind)), applied };
    }
    headerValues(view, row) {
        return view.format === 'v3' ? readHeaders(this.vault, row.fields.path) : view.load(row.fields.path, row.fields.kind).record.headers;
    }
    async list(input = {}) {
        return this.locked(() => {
            const o = options(input, ['kinds', 'state', 'scope', 'key', 'created', 'updated', 'keywords', 'ids', 'textContains', 'headers', 'order', 'strictIndex', 'limit', 'cursor'], 'list');
            const limit = pageLimit(o.limit, model_1.LIMITS.list_default, model_1.LIMITS.list_max), view = this.view(), warnings = [];
            (0, common_1.check)(o.order === undefined || ['default', 'recent'].includes(o.order), 'usage_invalid', 'order must be default or recent.');
            const selected = this.filterRows(view, o, warnings);
            let rows = selected.rows, scan, stats = '';
            if (o.headers !== undefined) {
                // ponytail: every page rescans candidate headers (16 KiB each); add an opt-in projection if this becomes slow.
                const matches = compileConditions(o.headers);
                let errors = 0;
                rows = rows.filter(row => {
                    try {
                        return matches(this.headerValues(view, row));
                    }
                    catch (e) {
                        if (e instanceof common_1.WhyveError) {
                            errors++;
                            warnings.push({ code: e.code, id: row.fields.id });
                            return false;
                        }
                        throw e;
                    }
                });
                scan = { scanned: selected.rows.length, errors };
                stats = statDigest(this.vault, selected.rows.map(r => r.fields.path));
                selected.applied.push('headers');
            }
            const recent = (o.order ?? 'default') === 'recent', rank = (s) => s === 'current' ? 0 : 1;
            rows.sort(recent ? (a, b) => (0, common_1.compareText)(b.fields.updatedAt || b.fields.createdAt, a.fields.updatedAt || a.fields.createdAt) || (0, common_1.compareText)(a.fields.id, b.fields.id)
                : (a, b) => (0, common_1.compareText)(a.fields.kind, b.fields.kind) || rank(a.fields.state) - rank(b.fields.state) || (0, common_1.compareText)(a.fields.createdAt, b.fields.createdAt) || (0, common_1.compareText)(a.fields.id, b.fields.id));
            const indexDigest = this.indexDigest(view, selected.kinds);
            const selectionDigest = (0, common_1.canonicalDigest)({ rows: rows.map(r => r.rawLine), stats });
            const { cursor: _c, limit: _l, ...request } = o;
            const handle = { method: 'list', vault: (0, common_1.canonicalDigest)((0, filesystem_1.identity)(this.vault)), request: (0, common_1.canonicalDigest)(request), snapshot: selectionDigest };
            const { offset } = openCursor(o.cursor, handle, rows.length);
            const items = [];
            let size = 0;
            for (const row of rows.slice(offset, offset + limit)) {
                const bytes = utf8Length(JSON.stringify(row));
                if (items.length && size + bytes > model_1.LIMITS.list_page_bytes)
                    break;
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
    async searchHeaders(input) {
        return this.locked(() => {
            const o = options(input, ['kinds', 'state', 'scope', 'key', 'created', 'updated', 'keywords', 'ids', 'textContains', 'headers', 'select', 'limit', 'cursor'], 'searchHeaders');
            (0, common_1.check)(o.headers !== undefined, 'usage_invalid', 'searchHeaders requires header conditions.');
            const matches = compileConditions(o.headers), limit = pageLimit(o.limit, model_1.LIMITS.header_scan_default, model_1.LIMITS.header_scan_max), view = this.view();
            const select = o.select ?? [];
            (0, common_1.check)(Array.isArray(select) && select.length <= 16 && select.every(k => typeof k === 'string' && ((0, record_1.isHostKey)(k) || /^[a-z][a-z0-9_]*$/.test(k) || /^[a-z][a-z0-9_-]*\.\*$/.test(k))), 'usage_invalid', 'select must list at most 16 header keys or namespace.* patterns.');
            const selected = this.filterRows(view, { ...o, headers: undefined }, []);
            const rows = selected.rows.sort((a, b) => (0, common_1.compareText)(a.fields.kind, b.fields.kind) || (0, common_1.compareText)(a.fields.createdAt, b.fields.createdAt) || (0, common_1.compareText)(a.fields.id, b.fields.id));
            const selectionDigest = (0, common_1.canonicalDigest)(rows.map(r => r.rawLine));
            const { cursor: _c, limit: _l, ...request } = o;
            const handle = { method: 'searchHeaders', vault: (0, common_1.canonicalDigest)((0, filesystem_1.identity)(this.vault)), request: (0, common_1.canonicalDigest)(request), snapshot: selectionDigest };
            const opened = openCursor(o.cursor, handle, rows.length);
            // Files already scanned by earlier pages must be unchanged for the result set to stay coherent.
            if (opened.offset)
                (0, common_1.check)(opened.extra?.stats === statDigest(this.vault, rows.slice(0, opened.offset).map(r => r.fields.path)), 'cursor_stale', 'A scanned record changed; restart from the first page.', {}, common_1.EXIT.conflict);
            const window = rows.slice(opened.offset, opened.offset + limit), found = [], errors = [];
            for (const row of window) {
                let values;
                try {
                    values = this.headerValues(view, row);
                }
                catch (e) {
                    if (e instanceof common_1.WhyveError) {
                        errors.push({ id: row.fields.id, path: row.fields.path, code: e.code });
                        continue;
                    }
                    throw e;
                }
                if (!matches(values))
                    continue;
                const picked = {};
                for (const key of select)
                    for (const k of Object.keys(values))
                        if (key.endsWith('.*') ? k.startsWith(key.slice(0, -1)) : k === key)
                            picked[k] = values[k];
                found.push({ id: row.fields.id, path: row.fields.path, ...(select.length ? { headers: picked } : {}) });
            }
            const end = opened.offset + window.length;
            return { schema: 'whyve-header-search/v1', ids: found.map(m => m.id), matches: found, errors, scanned: window.length, unscanned: rows.length - end, matchCount: found.length, selectionDigest,
                nextCursor: end < rows.length ? encodeCursor({ v: 3, ...handle, offset: end, extra: { stats: statDigest(this.vault, rows.slice(0, end).map(r => r.fields.path)) } }) : null, complete: end === rows.length };
        });
    }
    async read(id, input = {}) {
        return this.locked(() => {
            const o = options(input, ['sections', 'maxBytes', 'cursor', 'raw'], 'read');
            const view = this.view(), loaded = view.find(id);
            return this.readResult(view, loaded, o);
        });
    }
    readResult(view, loaded, o) {
        const record = loaded.record, h = record.headers, kind = loaded.kind, budget = byteLimit(o.maxBytes);
        const order = [...(0, model_1.spec)(kind).sections.map(s => s.name).flatMap(name => record.sections.filter(s => s.name === name)), ...record.sections.filter(s => !s.name)];
        let chosen = order;
        if (o.sections !== undefined) {
            (0, common_1.check)(Array.isArray(o.sections) && o.sections.length >= 1 && o.sections.every(s => typeof s === 'string'), 'usage_invalid', 'sections must be a non-empty list of section names.');
            chosen = o.sections.map(name => {
                const found = order.find(s => s.title === name || s.name === name || (!!s.name && (0, record_1.sectionSpec)(kind, name)?.name === s.name));
                (0, common_1.check)(found, 'section_invalid', 'Requested section does not exist.', { section: name });
                return found;
            });
        }
        const request = (0, common_1.canonicalDigest)({ id: loaded.id, sections: o.sections ?? null, budget });
        const handle = { method: 'read', vault: (0, common_1.canonicalDigest)((0, filesystem_1.identity)(this.vault)), request, snapshot: loaded.digest };
        const opened = openCursor(o.cursor, handle, Number.MAX_SAFE_INTEGER);
        let index = opened.extra?.section ?? 0, offset = opened.extra?.byte ?? 0, used = 0;
        const sections = {}, delivered = [];
        let partial;
        while (index < chosen.length) {
            const s = chosen[index], name = s.name ?? s.title, buffer = Buffer.from(s.text, 'utf8'), rest = buffer.length - offset;
            if (rest <= budget - used) {
                sections[name] = buffer.subarray(offset).toString('utf8');
                if (offset)
                    partial = { section: name, fromByte: offset, toByte: buffer.length, totalBytes: buffer.length };
                delivered.push(name);
                used += rest;
                index++;
                offset = 0;
                continue;
            }
            if (used && budget - used < 64)
                break;
            let end = offset + Math.max(1, budget - used);
            while (end < buffer.length && (buffer[end] & 0xc0) === 0x80)
                end++;
            sections[name] = buffer.subarray(offset, end).toString('utf8');
            partial = { section: name, fromByte: offset, toByte: end, totalBytes: buffer.length };
            delivered.push(name);
            used += end - offset;
            offset = end;
            if (offset >= buffer.length) {
                index++;
                offset = 0;
            }
            break;
        }
        const done = index >= chosen.length, complete = done && !opened.offset && !o.cursor && !partial;
        const successor = record.sources.find(s => s.relation === 'superseded-by')?.ref ?? null;
        return {
            schema: 'whyve-record/v3', format: loaded.format === 'v3' ? model_1.MODEL.protocol : 'context-common/v2', id: loaded.id, kind, path: loaded.path, state: loaded.state,
            title: h.title, summary: h.summary, scope: h.scope, key: h.key ?? '', keywords: h.keywords ?? [], tags: h.tags ?? [],
            createdAt: h.created_at, updatedAt: h.updated_at ?? '', authorizationSource: h.authorization_source,
            qualityFlags: (0, record_1.describeFlags)((0, record_1.computeFlags)(record)), headers: { ...h }, sections, sources: record.sources.map(s => ({ ...s })),
            authority: loaded.state === 'history' ? 'historical' : (0, model_1.spec)(kind).authority, doNotFollow: loaded.state === 'history',
            lifecycle: loaded.state === 'history' ? { retiredAt: h.retired_at, reason: h.lifecycle_reason, successor, predecessors: record.sources.filter(s => s.relation === 'supersedes').map(s => s.ref) } : null,
            contentDigest: loaded.digest, delivered: { sections: delivered, bytes: used, ...(partial ? { partial } : {}) }, complete,
            nextCursor: done ? null : encodeCursor({ v: 3, ...handle, offset: 1, extra: { section: index, byte: offset } }),
            ...(o.raw ? { raw: ((0, common_1.check)(utf8Length(loaded.content) <= model_1.LIMITS.read_max_bytes, 'usage_invalid', 'raw is available only for files up to 256 KiB.'), loaded.content) } : {}),
        };
    }
    // ------------------------------------------------------------ slots and comparison
    candidateView(input, id = '') {
        (0, common_1.check)((0, common_1.object)(input) && (0, model_1.isKind)(input.kind), 'usage_invalid', 'record.kind must be a record kind.');
        const kind = input.kind, s = (0, model_1.spec)(kind), scope = (0, common_1.canonicalScope)(input.scope);
        if (s.key === 'derived') {
            const term = input.body?.term;
            (0, common_1.check)(typeof term === 'string', 'usage_invalid', 'TERM records require body.term.');
            const aliases = input.body.aliases ?? [], deprecated = input.body.deprecated_terms ?? [];
            return { id, kind, scope, key: (0, common_1.canonicalKey)(term), vocabulary: [term, ...aliases, ...deprecated].map(common_1.canonicalKey) };
        }
        return { id, kind, scope, key: s.key === 'required' ? (0, common_1.canonicalKey)(String(input.key)) : '' };
    }
    async checkSlot(input, o = {}) {
        return this.locked(() => {
            const opts = options(o, ['existingId', 'supersedeId', 'limit', 'cursor'], 'checkSlot');
            const probe = this.candidateView(input), view = this.view(), limit = pageLimit(opts.limit, model_1.LIMITS.list_default, model_1.LIMITS.list_max);
            if (opts.existingId !== undefined)
                (0, common_1.requireId)(opts.existingId, 'existingId');
            if (opts.supersedeId !== undefined)
                (0, common_1.requireId)(opts.supersedeId, 'supersedeId');
            const occupants = [];
            if ((0, model_1.spec)(probe.kind).slot !== 'none' && view.kinds.includes(probe.kind))
                for (const r of view.scan([probe.kind]).filter(r => r.state === 'current' && r.id !== opts.existingId)) {
                    const reason = (0, vault_1.slotRelation)(probe, (0, vault_1.slotView)(r));
                    if (!reason)
                        continue;
                    const replaced = r.id === opts.supersedeId;
                    occupants.push({ row: (0, vault_1.rowOf)(r, view.projections), reason, replaced, blocking: !replaced && reason !== 'scope_overlap' });
                }
            occupants.sort((a, b) => (0, common_1.compareText)(a.row.fields.id, b.row.fields.id));
            const handle = { method: 'checkSlot', vault: (0, common_1.canonicalDigest)((0, filesystem_1.identity)(this.vault)), request: (0, common_1.canonicalDigest)({ probe, opts: { ...opts, cursor: null, limit: null } }), snapshot: (0, common_1.canonicalDigest)(occupants.map(x => x.row.rawLine)) };
            const { offset } = openCursor(opts.cursor, handle, occupants.length), page = occupants.slice(offset, offset + limit), end = offset + page.length;
            return { schema: 'whyve-slot/v3', kind: probe.kind, rule: (0, model_1.spec)(probe.kind).slot, occupied: occupants.length > 0, blocking: occupants.some(x => x.blocking), occupants: page, total: occupants.length, nextCursor: end < occupants.length ? encodeCursor({ v: 3, ...handle, offset: end }) : null };
        });
    }
    /** Mandatory and optional comparison sets (docs/record-model.md; design 3.4). Meaning is judged by the caller. */
    comparisonSet(view, input, action, targetId, expand) {
        const probe = this.candidateView(input), kind = probe.kind, mandatory = new Map(), expansion = new Map();
        const add = (map, id, reason) => { if (!map.get(id)?.includes(reason))
            map.set(id, [...(map.get(id) ?? []), reason]); };
        const preconditions = new Set([vault_1.REGISTRY]);
        const loaded = new Map();
        const set_find = (id) => { const found = loaded.get(id) ?? view.find(id); loaded.set(found.id, found); return found; };
        if (targetId !== undefined) {
            const target = view.find(targetId);
            (0, common_1.check)(target.state === 'current', 'lifecycle_invalid', 'The comparison target must be Current.', { id: targetId }, common_1.EXIT.conflict);
            loaded.set(target.id, target);
            if (action === 'supersede')
                add(mandatory, target.id, 'target');
        }
        if ((0, model_1.spec)(kind).slot !== 'none' && view.kinds.includes(kind)) {
            preconditions.add((0, vault_1.areaIndexPath)(kind));
            const records = kind === 'term' ? view.scan([kind]) : null;
            const rows = view.rows(kind).filter(r => r.fields.state === 'current' && r.fields.id !== (action === 'update' ? targetId : undefined));
            for (const row of rows) {
                let reason = null;
                if (kind === 'term') {
                    const r = records.find(x => x.id === row.fields.id);
                    if ((0, vault_1.slotRelation)(probe, (0, vault_1.slotView)(r))) {
                        reason = 'term_overlap';
                        loaded.set(r.id, r);
                    }
                }
                else if (row.fields.key === probe.key && (0, common_1.scopesOverlap)(row.fields.scope, probe.scope))
                    reason = row.fields.scope === probe.scope ? 'exact_slot' : (0, model_1.spec)(kind).slot === 'decision-overlap' ? 'scope_overlap' : 'same_key';
                if (reason)
                    add(mandatory, row.fields.id, reason);
            }
        }
        for (const entry of input.sources ?? [])
            if (entry.relation.includes(':') && /^ctx_[0-9a-f]{32}$/.test(entry.ref)) {
                // A typed relation must name an existing record; an unknown target is a hard error, not a review item.
                const target = set_find(entry.ref);
                add(mandatory, target.id, 'referenced');
            }
        if (expand !== undefined) {
            (0, common_1.check)((0, common_1.object)(expand) && Object.keys(expand).every(k => ['sameScope', 'crossKindKey', 'ids'].includes(k)), 'usage_invalid', 'expand accepts only sameScope, crossKindKey, and ids.');
            for (const k of view.kinds) {
                if (!(expand.sameScope || (expand.crossKindKey && ['decision', 'intent'].includes(kind) && ['decision', 'intent'].includes(k) && k !== kind)))
                    continue;
                for (const row of view.rows(k).filter(r => r.fields.state === 'current')) {
                    if (expand.sameScope && row.fields.scope === probe.scope)
                        add(expansion, row.fields.id, 'same_scope');
                    if (expand.crossKindKey && k !== kind && ['decision', 'intent'].includes(k) && row.fields.key === probe.key && (0, common_1.scopesOverlap)(row.fields.scope, probe.scope))
                        add(expansion, row.fields.id, 'cross_kind_key');
                }
            }
            for (const id of expand.ids ?? []) {
                (0, common_1.requireId)(id, 'expand.ids');
                add(expansion, id, 'requested');
            }
        }
        if (action === 'update' && targetId) {
            mandatory.delete(targetId);
            expansion.delete(targetId);
        }
        for (const id of mandatory.keys())
            expansion.delete(id);
        return { mandatory, expansion, preconditions: [...preconditions].sort(common_1.compareText).map(p => ({ path: p, sha256: (0, filesystem_1.digestOrNull)(this.vault, p) })), loaded };
    }
    async compare(request) {
        return this.locked(() => {
            const o = options(request, ['record', 'action', 'targetId', 'expand', 'limit', 'cursor', 'maxBytes'], 'compare');
            const action = o.action ?? (o.targetId ? 'supersede' : 'capture');
            (0, common_1.check)(['capture', 'supersede', 'update'].includes(action), 'usage_invalid', 'action must be capture, supersede, or update.');
            (0, common_1.check)(action === 'capture' || typeof o.targetId === 'string', 'usage_invalid', `${action} comparison requires targetId.`);
            const view = this.view(), budget = byteLimit(o.maxBytes), limit = pageLimit(o.limit, 20, 100);
            const set = this.comparisonSet(view, o.record, action, o.targetId, o.expand);
            const order = (map, mandatory) => [...map.entries()].map(([id, reasons]) => ({ id, reasons, mandatory }));
            const entries = [...order(set.mandatory, true), ...order(set.expansion, false)];
            const items = [];
            for (const entry of entries) {
                let loaded = set.loaded.get(entry.id);
                if (!loaded) {
                    try {
                        loaded = view.find(entry.id);
                    }
                    catch (e) {
                        if (e instanceof common_1.WhyveError && e.code === 'not_found' && !entry.mandatory)
                            continue;
                        throw e;
                    }
                }
                const sections = Object.fromEntries(loaded.record.sections.map(s => [s.name ?? s.title, s.text])), size = loaded.record.sections.reduce((sum, s) => sum + utf8Length(s.text), 0);
                const occupies = entry.reasons.some(r => ['exact_slot', 'scope_overlap', 'term_overlap'].includes(r));
                items.push({ row: (0, vault_1.rowOf)(loaded, view.projections), reasons: entry.reasons, mandatory: entry.mandatory, occupiesSlot: occupies, sections, bodyComplete: true, readCursor: null, contentDigest: loaded.digest, size });
            }
            const receiptBase = { vault: (0, common_1.canonicalDigest)((0, filesystem_1.identity)(this.vault)), request: (0, common_1.canonicalDigest)({ record: o.record, action, targetId: o.targetId ?? null, expand: o.expand ?? null, budget }) };
            const handle = { method: 'compare', vault: receiptBase.vault, request: receiptBase.request, snapshot: (0, common_1.canonicalDigest)({ items: items.map(i => [i.row.fields.id, i.contentDigest]), pre: set.preconditions }) };
            const { offset } = openCursor(o.cursor, handle, items.length);
            const page = [];
            let used = 0;
            for (const item of items.slice(offset, offset + limit)) {
                if (page.length && used + item.size > budget)
                    break;
                page.push(item);
                used += Math.min(item.size, budget);
            }
            const end = offset + page.length, whole = (i) => i.size <= budget;
            const shown = page.map(({ size, ...item }) => whole({ ...item, size }) ? item : { ...item, sections: null, bodyComplete: false, readCursor: null });
            const delivered = items.slice(0, end).filter(whole);
            const reads = delivered.map(i => ({ id: i.row.fields.id, path: i.row.fields.path, sha256: i.contentDigest }));
            const mandatoryIds = items.filter(i => i.mandatory).map(i => i.row.fields.id);
            const receipt = { schema: 'whyve-comparison-receipt/v1', ...receiptBase, reads, preconditions: set.preconditions, mandatory: mandatoryIds, complete: mandatoryIds.every(id => reads.some(r => r.id === id)) };
            const mandatoryTotal = mandatoryIds.length, mandatoryDelivered = delivered.filter(i => i.mandatory).length;
            return { schema: 'whyve-comparison/v3', items: shown, receipt,
                coverage: { mandatoryTotal, mandatoryDelivered, expansionTotal: items.length - mandatoryTotal, expansionDelivered: delivered.length - mandatoryDelivered, remaining: items.length - end, complete: receipt.complete && end === items.length },
                nextCursor: end < items.length ? encodeCursor({ v: 3, ...handle, offset: end }) : null };
        });
    }
    async validateReadReceipt(receipt) {
        return this.locked(() => {
            this.checkReceiptShape(receipt);
            const stale = [...receipt.reads.map(r => ({ path: r.path, sha256: r.sha256 })), ...receipt.preconditions].filter(p => (0, filesystem_1.digestOrNull)(this.vault, p.path) !== p.sha256).map(p => p.path);
            return { valid: !stale.length && receipt.vault === (0, common_1.canonicalDigest)((0, filesystem_1.identity)(this.vault)), stale };
        });
    }
    checkReceiptShape(receipt) {
        (0, common_1.check)((0, common_1.object)(receipt) && receipt.schema === 'whyve-comparison-receipt/v1' && Array.isArray(receipt.reads) && Array.isArray(receipt.preconditions) && Array.isArray(receipt.mandatory), 'receipt_invalid', 'Comparison receipt is invalid.', {}, common_1.EXIT.usage);
        for (const r of receipt.reads) {
            (0, common_1.check)((0, common_1.object)(r) && typeof r.path === 'string' && /^sha256:[0-9a-f]{64}$/.test(r.sha256), 'receipt_invalid', 'Each receipt read must be {id, path, sha256}.');
            (0, common_1.requireId)(r.id, 'reads.id');
            (0, filesystem_1.contained)(this.vault, r.path);
        }
        for (const p of receipt.preconditions) {
            (0, common_1.check)((0, common_1.object)(p) && typeof p.path === 'string' && (p.sha256 === null || /^sha256:[0-9a-f]{64}$/.test(p.sha256)), 'receipt_invalid', 'Each receipt precondition must be {path, sha256}.');
            (0, filesystem_1.contained)(this.vault, p.path);
        }
    }
    // ------------------------------------------------------------ write planning
    findCurrent(view, id, expectedDigest) {
        const loaded = view.find(id);
        (0, common_1.check)(typeof expectedDigest === 'string' && /^sha256:[0-9a-f]{64}$/.test(expectedDigest), 'usage_invalid', 'expectedDigest must be the contentDigest returned by read.');
        (0, common_1.check)(loaded.digest === expectedDigest, 'digest_conflict', 'The record changed since it was read. Read it again and reconcile.', { id, expected_digest: expectedDigest, current_digest: loaded.digest }, common_1.EXIT.conflict);
        return loaded;
    }
    destination(view, directory, kind, title, createdAt, overlay, stem) {
        const absolute = (0, filesystem_1.contained)(this.vault, directory);
        const existing = new Set([...(fs.existsSync(absolute) ? fs.readdirSync(absolute) : []).filter(n => overlay.get(directory + '/' + n) !== null), ...[...overlay.entries()].filter(([p, c]) => c !== null && path.posix.dirname(p) === directory).map(([p]) => path.posix.basename(p))].map(n => (0, common_1.normalizedKey)(n)));
        return directory + '/' + (0, record_1.allocateFilename)(stem ?? (0, record_1.baseFilename)(kind, title, createdAt), name => existing.has(name));
    }
    /** Renders the frozen mutation into file changes. Deterministic for the same vault state, now and IDs. */
    plan(view, mutation, authorization) {
        const now = mutation.now, overlay = new Map(), changes = [], slotChanged = new Set(), touched = new Set();
        const write = (relative, before, content) => { overlay.set(relative, content); changes.push({ path: relative, beforeDigest: before, afterDigest: content === null ? null : (0, common_1.sha256)((0, common_1.fileBytes)(content)), content }); };
        const registered = (kind) => (0, common_1.check)(view.kinds.includes(kind), 'area_not_registered', 'This feature is not enabled. Enable it with $whyve:init (Codex) or /whyve:init (Claude Code).', { kind }, common_1.EXIT.conflict);
        const createRecord = (input, id, extra = []) => {
            const record = (0, record_1.recordFromInput)(input, { id, now, authorization });
            record.sources.unshift(...extra);
            const kind = (0, record_1.kindOf)(record);
            registered(kind);
            const content = (0, record_1.renderRecord)(record), relative = this.destination(view, `context/${kind}`, kind, record.headers.title, now, overlay);
            touched.add(kind);
            return { record, relative, content };
        };
        const retire = (loaded, reason, extra) => {
            const record = { ...loaded.record, headers: { ...loaded.record.headers }, sources: [...loaded.record.sources, ...extra] };
            record.headers.state = 'history';
            record.headers.retired_at = now;
            record.headers.lifecycle_reason = reason;
            if (loaded.kind === 'assumption' && ['confirmed', 'refuted'].includes(reason))
                record.headers.assumption_status = reason;
            const content = (0, record_1.renderRecord)(record), relative = this.destination(view, `context/${loaded.kind}/retired`, loaded.kind, '', '', overlay, path.posix.basename(loaded.path, '.md'));
            write(loaded.path, loaded.digest, null);
            write(relative, null, content);
            touched.add(loaded.kind);
        };
        switch (mutation.action) {
            case 'capture': {
                const id = mutation.id ?? (0, common_1.fail)('usage_invalid', 'capture requires a frozen id.');
                const made = createRecord(mutation.record, id);
                write(made.relative, null, made.content);
                slotChanged.add(id);
                return { changes, recordId: id, slotChanged, touched: [...touched], flags: (0, record_1.computeFlags)(made.record) };
            }
            case 'supersede': {
                const predecessor = this.findCurrent(view, mutation.id, mutation.expectedDigest), successorKind = mutation.successor?.kind;
                (0, common_1.check)(predecessor.state === 'current', 'lifecycle_invalid', 'Supersede requires a Current record.', {}, common_1.EXIT.conflict);
                (0, common_1.check)(successorKind === predecessor.kind || (predecessor.kind === 'observation' && successorKind === 'decision' && predecessor.record.headers.kind_hint === 'decision'), 'lifecycle_invalid', 'Unsupported cross-kind supersession.', { from: predecessor.kind, to: successorKind }, common_1.EXIT.conflict);
                (0, common_1.check)(typeof mutation.reason === 'string' && mutation.reason.trim() && !/[\r\n]/.test(mutation.reason) && (0, common_1.codepoints)(mutation.reason) <= 500, 'usage_invalid', 'reason must be a single non-empty line of at most 500 codepoints.');
                const successorId = mutation.successorId ?? (0, common_1.fail)('usage_invalid', 'supersede requires a frozen successorId.');
                const made = createRecord(mutation.successor, successorId, [{ relation: 'supersedes', ref: predecessor.id }]);
                const moved = made.record.headers.scope !== predecessor.record.headers.scope || (made.record.headers.key ?? '') !== (predecessor.record.headers.key ?? '');
                if (['snapshot', 'document', 'archive'].includes(predecessor.kind))
                    (0, common_1.check)(moved, 'lifecycle_invalid', `Use update to change ${predecessor.kind} content; supersede only moves the scope or key.`, {}, common_1.EXIT.conflict);
                if (predecessor.kind === 'archive')
                    (0, common_1.check)((0, record_1.sectionText)(made.record, 'Content') === (0, record_1.sectionText)(predecessor.record, 'Content'), 'immutable_archive', 'ARCHIVE content cannot change; a scope move must keep the original bytes.', {}, common_1.EXIT.conflict);
                write(made.relative, null, made.content);
                retire(predecessor, 'superseded', [{ relation: 'superseded-by', ref: successorId }, { relation: 'retirement-note', ref: mutation.reason.trim() }]);
                slotChanged.add(successorId);
                return { changes, recordId: successorId, slotChanged, touched: [...touched], flags: (0, record_1.computeFlags)(made.record) };
            }
            case 'retire': {
                const loaded = this.findCurrent(view, mutation.id, mutation.expectedDigest);
                (0, common_1.check)(loaded.state === 'current', 'lifecycle_invalid', 'Retire requires a Current record.', {}, common_1.EXIT.conflict);
                (0, common_1.check)(mutation.reason !== 'superseded' && (0, model_1.spec)(loaded.kind).retire.includes(mutation.reason), 'lifecycle_invalid', `Unsupported ${loaded.kind} retirement reason.`, { allowed: (0, model_1.spec)(loaded.kind).retire.filter(r => r !== 'superseded') }, common_1.EXIT.conflict);
                const extra = [];
                if (mutation.note !== undefined)
                    extra.push({ relation: 'retirement-note', ref: String(mutation.note).trim() });
                (0, common_1.check)(!['withdrawn', 'invalidated', 'deprecated'].includes(mutation.reason) || extra.length, 'usage_invalid', 'This retirement requires a note.');
                for (const entry of mutation.sources ?? []) {
                    (0, record_1.validateSource)(entry);
                    (0, common_1.check)(!model_1.MANAGED_RELATIONS.has(entry.relation), 'sources_invalid', `${entry.relation} entries are managed by Whyve and cannot be supplied.`);
                    extra.push(entry);
                }
                if (loaded.kind === 'assumption')
                    (0, common_1.check)(extra.some(s => s.relation === 'evidence'), 'usage_invalid', 'Confirming or refuting an assumption needs an evidence source.');
                retire(loaded, mutation.reason, extra);
                return { changes, recordId: loaded.id, slotChanged, touched: [...touched], flags: [] };
            }
            case 'discard': {
                const loaded = this.findCurrent(view, mutation.id, mutation.expectedDigest);
                (0, common_1.check)(['snapshot', 'observation', 'archive'].includes(loaded.kind), 'lifecycle_invalid', 'Only snapshot, observation, and archive records can be discarded; retire this record instead.', {}, common_1.EXIT.conflict);
                const inbound = view.scan().filter(r => r.id !== loaded.id && (r.record.sources.some(s => s.ref === loaded.id) || (r.record.headers.anchors ?? []).includes(loaded.id)));
                (0, common_1.check)(!inbound.length, 'inbound_reference', 'Referenced records cannot be discarded.', { ids: inbound.map(r => r.id) }, common_1.EXIT.conflict);
                write(loaded.path, loaded.digest, null);
                touched.add(loaded.kind);
                return { changes, recordId: loaded.id, slotChanged, touched: [...touched], flags: [] };
            }
            case 'rename': {
                const loaded = this.findCurrent(view, mutation.id, mutation.expectedDigest);
                (0, common_1.check)(loaded.state === 'current', 'lifecycle_invalid', 'History records are immutable.', {}, common_1.EXIT.conflict);
                const record = { ...loaded.record, headers: { ...loaded.record.headers } };
                if (mutation.title !== undefined) {
                    record.headers.title = String(mutation.title).trim();
                    record.headers.updated_at = now;
                }
                const content = (0, record_1.renderRecord)(record), directory = path.posix.dirname(loaded.path);
                const overlayWithout = new Map(overlay).set(loaded.path, null);
                let relative = this.destination(view, directory, loaded.kind, record.headers.title, record.headers.created_at, overlayWithout);
                // A name that folds to the current one is the same file on case-insensitive filesystems: write in place.
                if ((0, common_1.normalizedKey)(relative) === (0, common_1.normalizedKey)(loaded.path))
                    relative = loaded.path;
                (0, common_1.check)(relative !== loaded.path || content !== loaded.content, 'no_change', 'The filename and title are unchanged.');
                if (relative === loaded.path)
                    write(loaded.path, loaded.digest, content);
                else {
                    write(loaded.path, loaded.digest, null);
                    write(relative, null, content);
                }
                touched.add(loaded.kind);
                return { changes, recordId: loaded.id, slotChanged, touched: [...touched], flags: (0, record_1.computeFlags)(record) };
            }
            case 'update': {
                const loaded = this.findCurrent(view, mutation.id, mutation.expectedDigest);
                (0, common_1.check)(loaded.state === 'current', 'lifecycle_invalid', 'History records are immutable.', {}, common_1.EXIT.conflict);
                const kind = loaded.kind, patch = options(mutation.patch, ['title', 'summary', 'keywords', 'tags', 'body', 'replaceBody', 'sources', 'headers'], 'patch');
                const record = { headers: { ...loaded.record.headers }, sections: loaded.record.sections.map(s => ({ ...s })), sources: loaded.record.sources.map(s => ({ ...s })), alias: loaded.record.alias };
                const h = record.headers, before = { scope: h.scope, key: h.key, vocabulary: (0, vault_1.slotView)(loaded).vocabulary?.join() };
                for (const field of ['title', 'summary'])
                    if (patch[field] !== undefined) {
                        (0, common_1.check)(typeof patch[field] === 'string', 'schema_invalid', `${field} must be text.`);
                        h[field] = patch[field].trim();
                    }
                if (patch.summary !== undefined && Array.isArray(h.quality_flags))
                    h.quality_flags = h.quality_flags.filter(f => f !== 'summary_derived');
                for (const field of ['keywords', 'tags'])
                    if (patch[field] !== undefined) {
                        if (patch[field].length)
                            h[field] = patch[field];
                        else
                            delete h[field];
                    }
                const mode = (0, model_1.spec)(kind).update;
                let contentChanged = false;
                if (patch.body !== undefined) {
                    (0, common_1.check)(mode !== 'metadata', 'immutable_archive', 'ARCHIVE content never changes; store a new ARCHIVE.', {}, common_1.EXIT.conflict);
                    (0, common_1.check)((0, common_1.object)(patch.body), 'schema_invalid', 'patch.body must be an object of kind fields.');
                    const snapshot = JSON.stringify(record.sections);
                    if (patch.replaceBody) {
                        (0, common_1.check)(mode === 'content', 'immutable_section', 'Only SNAP and DOCUMENT records can replace their body.', {}, common_1.EXIT.conflict);
                        const provided = new Set(Object.keys(patch.body)), fields = (0, model_1.spec)(kind).sections;
                        // Hand-written unregistered sections are not part of the kind body and are kept.
                        record.sections = record.sections.filter(s => !s.name || provided.has(fields.find(f => f.name === s.name).field));
                    }
                    (0, record_1.applyBody)(record, kind, patch.body, mode === 'content' ? 'replace' : 'supplement');
                    contentChanged = snapshot !== JSON.stringify(record.sections);
                    const primary = (0, model_1.spec)(kind).sections[0].name;
                    if (contentChanged && patch.summary === undefined && (h.quality_flags ?? []).includes('summary_derived') && (0, record_1.sectionText)(record, primary) !== (0, record_1.sectionText)(loaded.record, primary))
                        h.summary = (0, record_1.deriveSummary)((0, record_1.sectionText)(record, primary), h.title);
                }
                else
                    (0, common_1.check)(!patch.replaceBody, 'usage_invalid', 'replaceBody requires body.');
                if (patch.sources !== undefined) {
                    const managed = record.sources.filter(s => model_1.MANAGED_RELATIONS.has(s.relation));
                    const validate = (entries, name) => { (0, common_1.check)(Array.isArray(entries), 'usage_invalid', `${name} must be a list.`); for (const e of entries) {
                        (0, record_1.validateSource)(e);
                        (0, common_1.check)(!model_1.MANAGED_RELATIONS.has(e.relation), 'sources_invalid', `${e.relation} entries are managed by Whyve and cannot be supplied.`, { relation: e.relation });
                    } return entries; };
                    if ('replace' in patch.sources)
                        record.sources = [...managed, ...validate(patch.sources.replace, 'sources.replace')];
                    else {
                        const remove = validate(patch.sources.remove ?? [], 'sources.remove'), add = validate(patch.sources.add ?? [], 'sources.add');
                        for (const r of remove)
                            (0, common_1.check)(record.sources.some(s => (0, record_1.sameSource)(s, r)), 'sources_invalid', 'A removed source does not exist.', { relation: r.relation });
                        const kept = record.sources.filter(s => !remove.some(r => (0, record_1.sameSource)(r, s)));
                        record.sources = [...kept, ...add.filter((a, i) => !kept.some(s => (0, record_1.sameSource)(s, a)) && add.findIndex(b => (0, record_1.sameSource)(a, b)) === i)];
                    }
                }
                if (patch.headers !== undefined) {
                    (0, common_1.check)((0, common_1.object)(patch.headers) && Object.keys(patch.headers).every(k => ['set', 'unset'].includes(k)), 'usage_invalid', 'patch.headers must be {set?, unset?}.');
                    for (const [key, value] of Object.entries(patch.headers.set ?? {})) {
                        (0, common_1.check)((0, record_1.isHostKey)(key), 'custom_header_invalid', 'Only namespace.name headers can be set here.', { key });
                        h[key] = value;
                    }
                    for (const key of patch.headers.unset ?? []) {
                        (0, common_1.check)((0, record_1.isHostKey)(key), 'custom_header_invalid', 'Only namespace.name headers can be unset here.', { key });
                        delete h[key];
                    }
                }
                if (contentChanged && mode === 'content') {
                    h.authorization_source = authorization.source;
                    record.sources = [...record.sources.filter(s => s.relation !== 'authorization'), ...(0, record_1.authorizationSources)(authorization)];
                }
                else if (mode !== 'content' && (contentChanged || patch.sources !== undefined || patch.headers !== undefined)) {
                    // A supplement keeps the record's original approval and appends the authorization of this change.
                    for (const entry of (0, record_1.authorizationSources)(authorization).length ? (0, record_1.authorizationSources)(authorization) : [{ relation: 'authorization', ref: authorization.source }])
                        if (!record.sources.some(s => (0, record_1.sameSource)(s, entry)))
                            record.sources.push(entry);
                }
                let content = (0, record_1.renderRecord)(record);
                if (content !== loaded.content) {
                    h.updated_at = now;
                    content = (0, record_1.renderRecord)(record);
                }
                if (before.scope !== h.scope || before.key !== h.key || before.vocabulary !== (0, vault_1.slotView)({ ...loaded, record }).vocabulary?.join())
                    slotChanged.add(loaded.id);
                write(loaded.path, loaded.digest, content);
                touched.add(kind);
                return { changes, recordId: loaded.id, slotChanged, touched: [...touched], flags: (0, record_1.computeFlags)(record) };
            }
        }
        return (0, common_1.fail)('usage_invalid', 'Unknown mutation action.');
    }
    checkIntegrity(view, changes, slotChanged, separate) {
        const overlay = new Map();
        for (const c of changes) {
            (0, filesystem_1.contained)(this.vault, c.path);
            (0, common_1.check)(c.afterDigest === (c.content === null ? null : (0, common_1.sha256)((0, common_1.fileBytes)(c.content))), 'plan_invalid', 'Rendered bytes changed.', {}, common_1.EXIT.conflict);
            (0, common_1.check)((0, filesystem_1.digestOrNull)(this.vault, c.path) === c.beforeDigest, 'stale_input', 'Target content changed after prepare.', { path: c.path }, common_1.EXIT.conflict);
            overlay.set(c.path, c.content);
        }
        const records = view.scan(view.kinds, overlay);
        (0, vault_1.validateRelations)(records);
        (0, vault_1.validateSlots)(records, slotChanged, separate);
        return records;
    }
    normalize(mutation) {
        (0, common_1.check)((0, common_1.object)(mutation) && typeof mutation.action === 'string', 'usage_invalid', 'mutation needs an action.');
        // A JSON copy drops undefined members, which canonical digests cannot represent.
        const m = JSON.parse(JSON.stringify(mutation));
        (0, common_1.check)(utf8Length(JSON.stringify(m)) <= model_1.LIMITS.request_bytes, 'request_too_large', `A write request must be at most ${model_1.LIMITS.request_bytes} bytes.`, {}, common_1.EXIT.conflict);
        m.now = (0, common_1.timestamp)();
        if (m.action === 'capture') {
            if (m.id !== undefined)
                (0, common_1.requireId)(m.id, 'id');
            else
                m.id = (0, common_1.newId)();
        }
        if (m.action === 'supersede') {
            if (m.successorId !== undefined)
                (0, common_1.requireId)(m.successorId, 'successorId');
            else
                m.successorId = (0, common_1.newId)();
        }
        return m;
    }
    needsArchive(mutation) {
        const input = mutation.action === 'capture' ? mutation.record : mutation.action === 'supersede' ? mutation.successor : null;
        const body = mutation.action === 'update' ? mutation.patch?.body : input?.body;
        if (!body || !(0, common_1.object)(body))
            return null;
        const text = Object.values(body).filter(v => v !== null).map(v => Array.isArray(v) ? v.join('\n') : String(v)).join('\n\n');
        const bytesLength = utf8Length(text), maxBytes = input?.kind === 'archive' ? model_1.LIMITS.archive_bytes : model_1.LIMITS.body_bytes;
        if (bytesLength <= maxBytes)
            return null;
        const buffer = Buffer.from(text, 'utf8'), chunks = [];
        for (let from = 0, index = 0; from < buffer.length; index++) {
            let to = Math.min(buffer.length, from + model_1.LIMITS.archive_bytes);
            if (to < buffer.length) {
                const newline = buffer.lastIndexOf(10, to - 1);
                if (newline > from)
                    to = newline + 1;
                while (to < buffer.length && (buffer[to] & 0xc0) === 0x80)
                    to--;
            }
            chunks.push({ index, fromByte: from, toByte: to, sha256: (0, common_1.sha256)(buffer.subarray(from, to)) });
            from = to;
        }
        return { status: 'needs_archive', bodyBytes: bytesLength, maxBytes, sha256: (0, common_1.sha256)(buffer), chunks,
            message: 'The body exceeds the record limit. Store the original unchanged as ARCHIVE (split by these chunks when needed) and capture a shorter record whose Sources cite it. Whyve never condenses meaning.' };
    }
    /** Returns null when writing may proceed, or the review the caller still owes. */
    reviewGate(view, mutation, comparison, review) {
        const separate = new Set();
        if (!['capture', 'supersede'].includes(mutation.action))
            return { gate: null, separate, preconditions: [] };
        const input = mutation.action === 'capture' ? mutation.record : mutation.successor;
        const set = this.comparisonSet(view, input, mutation.action, mutation.action === 'supersede' ? mutation.id : undefined, undefined);
        const mandatory = [...set.mandatory.keys()];
        const preconditions = [...set.preconditions];
        if (!mandatory.length)
            return { gate: null, separate, preconditions };
        if (!comparison)
            return { gate: { status: 'needs_review', reason: 'comparison_required', remaining: mandatory, message: 'Compare the mandatory records, judge each from its actual body, then prepare again with the receipt and judgments.' }, separate, preconditions };
        this.checkReceiptShape(comparison);
        (0, common_1.check)(comparison.vault === (0, common_1.canonicalDigest)((0, filesystem_1.identity)(this.vault)), 'receipt_invalid', 'Receipt belongs to another vault.', {}, common_1.EXIT.conflict);
        for (const p of [...comparison.reads.map(r => ({ path: r.path, sha256: r.sha256 })), ...comparison.preconditions])
            (0, common_1.check)((0, filesystem_1.digestOrNull)(this.vault, p.path) === p.sha256, 'stale_reference', 'Compared content changed; compare again before judging.', { path: p.path }, common_1.EXIT.conflict);
        const current = new Map(mandatory.map(id => [id, set.loaded.get(id) ?? view.find(id)]));
        const missing = mandatory.filter(id => !comparison.reads.some(r => r.id === id && r.sha256 === current.get(id).digest));
        if (missing.length)
            return { gate: { status: 'needs_review', reason: 'comparison_incomplete', remaining: missing, message: 'Some mandatory bodies were not delivered completely. Continue the comparison or read them, then prepare again.' }, separate, preconditions };
        const judgments = new Map();
        (0, common_1.check)(review === undefined || ((0, common_1.object)(review) && Array.isArray(review.judgments)), 'usage_invalid', 'semanticReview must be {judgments: [{id, judgment, reason}]}.');
        for (const j of review?.judgments ?? []) {
            (0, common_1.check)((0, common_1.object)(j) && ['same', 'separate', 'support', 'conflict', 'replace', 'unclear'].includes(j.judgment) && typeof j.reason === 'string' && j.reason.trim().length > 0 && j.reason.length <= 1000, 'usage_invalid', 'Each judgment must be {id, judgment, reason} with a valid judgment and a non-empty reason.');
            (0, common_1.requireId)(j.id, 'judgments.id');
            judgments.set(j.id, j.judgment);
        }
        const unjudged = mandatory.filter(id => !judgments.has(id));
        if (unjudged.length)
            return { gate: { status: 'needs_review', reason: 'judgment_required', remaining: unjudged, message: 'Judge each mandatory record as same, separate, support, conflict, replace, or unclear.' }, separate, preconditions };
        const target = mutation.action === 'supersede' ? mutation.id : null;
        if (target && !['replace', 'same'].includes(judgments.get(target)))
            return { gate: { status: 'needs_review', reason: 'predecessor_not_replaced', remaining: [target], judgments: [{ id: target, judgment: judgments.get(target) }], message: 'Supersede requires the predecessor to be judged replace or same from its actual body.' }, separate, preconditions };
        const blocking = mandatory.filter(id => id !== target && !['separate', 'support'].includes(judgments.get(id)));
        if (blocking.length)
            return { gate: { status: 'needs_review', reason: 'semantic_conflict', remaining: blocking, judgments: blocking.map(id => ({ id, judgment: judgments.get(id) })), message: 'A mandatory record other than the supersede target was judged same, conflict, replace, or unclear. Reuse the existing record, supersede it after the user explicitly chooses to, or ask the user.' }, separate, preconditions };
        for (const id of mandatory)
            if (['separate', 'support'].includes(judgments.get(id)))
                separate.add(id);
        const reads = comparison.reads.filter(r => mandatory.includes(r.id)).map(r => ({ path: r.path, sha256: r.sha256 }));
        return { gate: null, separate, preconditions: [...preconditions, ...reads, ...comparison.preconditions] };
    }
    checkAuthorization(authorization, touched) {
        const settings = loadSettings(this.project);
        (0, common_1.check)(!settings.enabled || touched.every(k => settings.enabled.includes(k)), 'feature_disabled', 'This feature is not enabled. Enable it with $whyve:init (Codex) or /whyve:init (Claude Code).', { kinds: touched }, common_1.EXIT.conflict);
        (0, common_1.check)((0, common_1.object)(authorization) && ['user', 'policy'].includes(authorization.source), 'approval_required', 'Provide user or configured policy authorization.', {}, common_1.EXIT.conflict);
        if (authorization.source === 'user') {
            (0, common_1.check)(Object.keys(authorization).every(k => ['source', 'references', 'meaning'].includes(k)) && (authorization.references === undefined || (Array.isArray(authorization.references) && authorization.references.length <= 12)), 'usage_invalid', 'User authorization must be {source, references?, meaning?}.');
            for (const ref of authorization.references ?? [])
                (0, record_1.validateSource)({ relation: 'authorization', ref });
            return { approved: true, mode: settings.mode };
        }
        (0, common_1.check)(typeof authorization.reason === 'string' && authorization.reason.trim() && authorization.reason.length <= 1000 && ['record', 'ask'].includes(authorization.decision), 'policy_assessment_required', 'Policy authorization requires a decision (record or ask) and a reason.', {}, common_1.EXIT.conflict);
        if (!settings.config || settings.mode === 'explicit')
            return { approved: false, reason: 'Explicit mode requires the user to approve this exact preview.', mode: settings.mode };
        (0, common_1.check)((0, filesystem_1.realDirectory)(path.resolve(this.project, settings.config.vault)) === this.vault, 'vault_policy_mismatch', 'Automatic recording is limited to the configured vault.', {}, common_1.EXIT.conflict);
        if (authorization.decision === 'ask')
            return { approved: false, reason: authorization.reason, mode: settings.mode };
        return { approved: true, mode: settings.mode };
    }
    preparedPath(handle) { (0, common_1.check)(typeof handle === 'string' && /^prep_[0-9a-f]{32}$/.test(handle), 'handle_invalid', 'Unknown prepared handle.', {}, common_1.EXIT.notFound); return `${PREPARED_DIR}/${handle}.json`; }
    savePrepared(file) {
        const body = JSON.stringify({ ...file, digest: (0, common_1.canonicalDigest)(file) }) + '\n';
        (0, common_1.check)(utf8Length(body) <= model_1.LIMITS.transaction_bytes, 'request_too_large', `The prepared transaction exceeds ${model_1.LIMITS.transaction_bytes} bytes.`, {}, common_1.EXIT.conflict);
        (0, filesystem_1.atomicWrite)(this.vault, this.preparedPath(file.handle), Buffer.from(body), 0o600);
    }
    loadPrepared(handle) {
        const raw = (0, filesystem_1.bytes)(this.vault, this.preparedPath(handle), model_1.LIMITS.transaction_bytes + 4096);
        (0, common_1.check)(raw, 'handle_invalid', 'Unknown or expired prepared handle.', {}, common_1.EXIT.notFound);
        const { digest, ...file } = (0, common_1.strictJson)((0, filesystem_1.utf8)(raw), 'handle_invalid');
        (0, common_1.check)(file.schema === 'whyve-prepared/v1' && file.handle === handle && (0, common_1.canonicalDigest)(file) === digest, 'handle_invalid', 'Prepared state was altered.', {}, common_1.EXIT.integrity);
        return JSON.parse(JSON.stringify(file));
    }
    cleanupPrepared() {
        const directory = path.join(this.vault, PREPARED_DIR);
        if (!fs.existsSync(directory))
            return;
        for (const name of fs.readdirSync(directory)) {
            if (!/^prep_[0-9a-f]{32}\.json$/.test(name))
                continue;
            try {
                if (Date.now() - fs.statSync(path.join(directory, name)).mtimeMs > PREPARED_TTL_MS)
                    fs.unlinkSync(path.join(directory, name));
            }
            catch { /* concurrent cleanup */ }
        }
    }
    async prepare(request) {
        return this.locked(() => {
            (0, common_1.check)((0, common_1.object)(request), 'usage_invalid', 'prepare needs a request object.');
            if ('preparedHandle' in request)
                return this.approvePrepared(options(request, ['preparedHandle', 'authorization'], 'prepare'));
            const o = options(request, ['mutation', 'authorization', 'comparison', 'semanticReview'], 'prepare');
            const view = this.writableView();
            this.cleanupPrepared();
            const archive = this.needsArchive(o.mutation);
            if (archive)
                return archive;
            const mutation = this.normalize(o.mutation);
            // Shape and lifecycle errors come before the review gate so no comparison is wasted on an invalid write.
            let planned;
            try {
                planned = this.plan(view, mutation, o.authorization?.source ? o.authorization : { source: 'user' });
            }
            catch (e) {
                if (e instanceof common_1.WhyveError && ['body_too_large', 'archive_too_large'].includes(e.code))
                    return this.needsArchive(mutation) ?? (() => { throw e; })();
                throw e;
            }
            const gate = this.reviewGate(view, mutation, o.comparison, o.semanticReview);
            if (gate.gate)
                return gate.gate;
            const auth = this.checkAuthorization(o.authorization, planned.touched);
            this.checkIntegrity(view, planned.changes, planned.slotChanged, gate.separate);
            const referenced = new Set(planned.changes.filter(c => c.content).flatMap(c => [...c.content.matchAll(/^- [a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*: (ctx_[0-9a-f]{32})$/gm)].map(m => m[1])));
            const refPre = [...referenced].flatMap(id => { try {
                const r = view.find(id);
                return planned.changes.some(c => c.path === r.path) ? [] : [{ path: r.path, sha256: r.digest }];
            }
            catch {
                return [];
            } });
            const preconditions = [...new Map([...gate.preconditions, ...refPre].map(p => [p.path, p])).values()].sort((a, b) => (0, common_1.compareText)(a.path, b.path));
            const file = { schema: 'whyve-prepared/v1', handle: newHandle(), created_at: new Date().toISOString(), state: auth.approved ? 'prepared' : 'needs_approval', action: mutation.action, record_id: planned.recordId,
                mutation, authorization: o.authorization, separate: [...gate.separate].sort(common_1.compareText), binding: this.binding(view), preconditions, changes: planned.changes, quality_flags: planned.flags, ...(auth.approved ? {} : { reason: auth.reason }) };
            this.savePrepared(file);
            const common = { handle: file.handle, action: file.action, recordId: file.record_id, preview: { files: file.changes }, qualityFlags: (0, record_1.describeFlags)(file.quality_flags) };
            return auth.approved ? { status: 'prepared', ...common } : { status: 'needs_approval', ...common, reason: auth.reason };
        }, true);
    }
    approvePrepared(o) {
        const file = this.loadPrepared(o.preparedHandle), view = this.writableView();
        (0, common_1.check)(file.state === 'needs_approval', 'handle_state_invalid', file.state === 'applied' ? 'This preview was already applied.' : 'This preview is already approved.', { state: file.state }, common_1.EXIT.conflict);
        (0, common_1.check)((0, common_1.canonicalDigest)(file.binding) === (0, common_1.canonicalDigest)(this.binding(view)), 'project_policy_changed', 'Project, recording policy or registry changed after the preview; prepare again.', {}, common_1.EXIT.conflict);
        for (const p of file.preconditions)
            (0, common_1.check)((0, filesystem_1.digestOrNull)(this.vault, p.path) === p.sha256, 'stale_reference', 'Compared content changed after the preview; compare and prepare again.', { path: p.path }, common_1.EXIT.conflict);
        // Completing a held preview is the human's approval; a policy cannot approve what policy chose to ask about.
        (0, common_1.check)(o.authorization?.source === 'user', 'approval_required', 'Only the user can approve a preview that is waiting for approval.', {}, common_1.EXIT.conflict);
        const planned = this.plan(view, file.mutation, o.authorization);
        const auth = this.checkAuthorization(o.authorization, planned.touched);
        (0, common_1.check)(auth.approved, 'approval_required', auth.reason ?? 'Approval is still required.', {}, common_1.EXIT.conflict);
        this.checkIntegrity(view, planned.changes, planned.slotChanged, new Set(file.separate));
        const next = { ...file, state: 'prepared', authorization: o.authorization, changes: planned.changes, quality_flags: planned.flags, reason: undefined };
        delete next.reason;
        this.savePrepared(next);
        return { status: 'prepared', handle: next.handle, action: next.action, recordId: next.record_id, preview: { files: next.changes }, qualityFlags: (0, record_1.describeFlags)(next.quality_flags) };
    }
    async apply(handle) {
        return this.locked(() => {
            const file = this.loadPrepared(handle);
            if (file.state === 'applied' && file.receipt)
                return { ...file.receipt, status: 'already_applied' };
            (0, common_1.check)(file.state === 'prepared' || file.state === 'applying', 'approval_required', 'This preview is waiting for approval. After the user approves it, run prepare again with {"preparedHandle": ...} as input and --approved.', {}, common_1.EXIT.conflict);
            const view = this.writableView();
            (0, common_1.check)((0, common_1.canonicalDigest)(file.binding) === (0, common_1.canonicalDigest)(this.binding(view)), 'project_policy_changed', 'Project, recording policy, registry or runtime changed after prepare.', {}, common_1.EXIT.conflict);
            const settings = loadSettings(this.project), finish = (status, changed) => {
                const receipt = { status, handle, recordId: file.record_id, changedPaths: changed, qualityFlags: (0, record_1.describeFlags)(file.quality_flags), indexDigest: this.indexDigest(this.view(), this.view().kinds), authorization: { ...file.authorization, mode: settings.mode } };
                this.savePrepared({ ...file, state: 'applied', receipt });
                return receipt;
            };
            // Only an attempt that reached the transaction may be recognised as applied by its bytes; a never-attempted
            // preview whose target merely looks the same (e.g. a deletion done by another write) must fail its checks.
            if (file.state === 'applying' && file.changes.every(c => (0, filesystem_1.digestOrNull)(this.vault, c.path) === c.afterDigest))
                return finish('already_applied', []);
            for (const p of file.preconditions)
                (0, common_1.check)((0, filesystem_1.digestOrNull)(this.vault, p.path) === p.sha256, 'stale_reference', 'Compared or referenced content changed after prepare.', { path: p.path }, common_1.EXIT.conflict);
            const planned = this.plan(view, file.mutation, file.authorization);
            (0, common_1.check)((0, common_1.canonicalDigest)(planned.changes) === (0, common_1.canonicalDigest)(file.changes), 'plan_invalid', 'The prepared preview no longer matches the vault; prepare again.', {}, common_1.EXIT.conflict);
            const records = this.checkIntegrity(view, file.changes, planned.slotChanged, new Set(file.separate));
            const changes = file.changes.map(c => ({ path: c.path, content: c.content === null ? null : (0, common_1.fileBytes)(c.content), expected: c.beforeDigest }));
            for (const kind of planned.touched) {
                const current = (0, filesystem_1.bytes)(this.vault, (0, vault_1.areaIndexPath)(kind));
                changes.push({ path: (0, vault_1.areaIndexPath)(kind), content: (0, common_1.fileBytes)(view.renderArea(kind, records)), expected: current ? (0, common_1.sha256)(current) : null });
            }
            this.savePrepared({ ...file, state: 'applying' });
            return finish('applied', this.storage.transaction(changes));
        }, true);
    }
}
exports.Whyve = Whyve;
function createWhyve(options) { return new Whyve(options); }
