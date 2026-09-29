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
exports.KINDS = exports.sectionText = exports.computeFlags = exports.VaultView = exports.descriptorDigest = exports.areaIndexPath = exports.PROJECTIONS = exports.REGISTRY = exports.ROOT_INDEX = void 0;
exports.detectFormat = detectFormat;
exports.renderRegistry = renderRegistry;
exports.readRegistry = readRegistry;
exports.readProjections = readProjections;
exports.renderRoot = renderRoot;
exports.rootKinds = rootKinds;
exports.emptyArea = emptyArea;
exports.parseArea = parseArea;
exports.stateOfPath = stateOfPath;
exports.listRecordPaths = listRecordPaths;
exports.loadV3 = loadV3;
exports.loadV2 = loadV2;
exports.rowOf = rowOf;
exports.validateRelations = validateRelations;
exports.slotView = slotView;
exports.slotRelation = slotRelation;
exports.validateSlots = validateSlots;
const fs = __importStar(require("node:fs"));
const common_1 = require("./common");
const filesystem_1 = require("./filesystem");
const model_1 = require("./model");
Object.defineProperty(exports, "KINDS", { enumerable: true, get: function () { return model_1.KINDS; } });
const record_1 = require("./record");
Object.defineProperty(exports, "computeFlags", { enumerable: true, get: function () { return record_1.computeFlags; } });
Object.defineProperty(exports, "sectionText", { enumerable: true, get: function () { return record_1.sectionText; } });
const index_row_1 = require("./index-row");
const documents_1 = require("./documents");
const catalog_1 = require("./catalog");
const legacy_1 = require("./legacy");
exports.ROOT_INDEX = 'context/context.index.md';
exports.REGISTRY = '.whyve/owners/registry.json';
exports.PROJECTIONS = '.whyve/index-projections.json';
const areaIndexPath = (kind) => `context/${kind}/${kind}.index.md`;
exports.areaIndexPath = areaIndexPath;
const title = (kind) => kind[0].toUpperCase() + kind.slice(1);
const escapeCatalog = (v) => v.replace(/[\\·\[\]]/g, '\\$&');
function detectFormat(root) {
    const raw = (0, filesystem_1.bytes)(root, exports.ROOT_INDEX);
    if (!raw)
        return 'none';
    const schema = /^schema: "([^"]+)"$/m.exec((0, filesystem_1.utf8)(raw).split('\n---\n')[0])?.[1];
    if (schema === model_1.MODEL.root_index_schema)
        return 'v3';
    if (schema === 'context-root-index/v1')
        return 'v2';
    return (0, common_1.fail)('index_noncanonical', 'Unknown root index schema.', { schema }, common_1.EXIT.integrity);
}
// ------------------------------------------------------------------ v3 catalog files
const descriptorDigest = (kind) => (0, common_1.canonicalDigest)((0, model_1.spec)(kind));
exports.descriptorDigest = descriptorDigest;
function renderRegistry(kinds) {
    const areas = Object.fromEntries([...kinds].sort(common_1.compareText).map(k => [k, { schema: (0, model_1.spec)(k).schema, descriptor_digest: (0, exports.descriptorDigest)(k), descriptor: (0, model_1.spec)(k) }]));
    return JSON.stringify({ schema: 'whyve-owner-registry/v1', protocol: model_1.MODEL.protocol, areas }, null, 1) + '\n';
}
function readRegistry(root) {
    const raw = (0, filesystem_1.bytes)(root, exports.REGISTRY, 1024 * 1024);
    (0, common_1.check)(raw, 'registry_missing', 'Owner registry is missing. Run refresh --fix (whyve refresh --fix, or context_cli.mjs refresh --fix in the plugin).', { path: exports.REGISTRY }, common_1.EXIT.integrity);
    const value = (0, common_1.strictJson)((0, filesystem_1.utf8)(raw), 'registry_invalid');
    (0, common_1.check)(value.schema === 'whyve-owner-registry/v1' && value.protocol === model_1.MODEL.protocol && value.areas && typeof value.areas === 'object', 'registry_invalid', 'Owner registry is invalid.', {}, common_1.EXIT.integrity);
    const kinds = Object.keys(value.areas);
    (0, common_1.check)(kinds.every(model_1.isKind), 'registry_invalid', 'Owner registry names an unknown kind.', {}, common_1.EXIT.integrity);
    for (const kind of kinds)
        (0, common_1.check)((0, common_1.canonicalDigest)(value.areas[kind].descriptor) === value.areas[kind].descriptor_digest, 'registry_invalid', 'Descriptor digest differs.', { kind }, common_1.EXIT.integrity);
    return { kinds: kinds.sort(common_1.compareText), outdated: kinds.filter(k => value.areas[k].descriptor_digest !== (0, exports.descriptorDigest)(k)), digest: (0, common_1.sha256)(raw) };
}
function readProjections(root) {
    const raw = (0, filesystem_1.bytes)(root, exports.PROJECTIONS, 64 * 1024);
    if (!raw)
        return [];
    const value = (0, common_1.strictJson)((0, filesystem_1.utf8)(raw), 'projections_invalid');
    (0, common_1.check)(value.schema === 'whyve-index-projections/v1' && Array.isArray(value.keys) && value.keys.length <= 8 && value.keys.every((k) => typeof k === 'string' && (0, record_1.isHostKey)(k)) && new Set(value.keys).size === value.keys.length && Object.keys(value).length === 2, 'projections_invalid', 'index-projections.json must list at most eight unique namespace.name keys.', {}, common_1.EXIT.integrity);
    return [...value.keys].sort(common_1.compareText);
}
function renderRoot(kinds) {
    const rows = [...kinds].sort(common_1.compareText).map(k => `- [${title(k)}](${k}/${k}.index.md) · ${k} · ${escapeCatalog((0, model_1.spec)(k).summary)}`);
    return ['---', `schema: ${JSON.stringify(model_1.MODEL.root_index_schema)}`, `protocol: ${JSON.stringify(model_1.MODEL.protocol)}`, 'summary: "Catalog of shared project context areas"', '---', '', '# Context', '', '## Areas',
        '<!-- BEGIN CONTEXT GENERATED:areas -->', ...rows, '<!-- END CONTEXT GENERATED:areas -->', ''].join('\n');
}
function rootKinds(text) {
    return (0, documents_1.extractBlock)(text, 'areas').map(line => {
        const kind = /^- \[[^\]]*\]\(([a-z]+)\/\1\.index\.md\) · ([a-z]+) · /.exec(line);
        (0, common_1.check)(kind && kind[1] === kind[2] && (0, model_1.isKind)(kind[1]), 'index_noncanonical', 'Invalid root catalog row.', { line: line.slice(0, 120) }, common_1.EXIT.integrity);
        return kind[1];
    });
}
function emptyArea(kind) {
    return ['---', `schema: ${JSON.stringify(model_1.MODEL.area_index_schema)}`, `area: ${JSON.stringify(kind)}`, `authority: ${JSON.stringify((0, model_1.spec)(kind).authority)}`, `summary: ${JSON.stringify((0, model_1.spec)(kind).summary)}`, '---', '',
        `# ${title(kind)}`, '', '## Current', '<!-- BEGIN CONTEXT GENERATED:current -->', '<!-- END CONTEXT GENERATED:current -->', '', '## History', '<!-- BEGIN CONTEXT GENERATED:history -->', '<!-- END CONTEXT GENERATED:history -->', ''].join('\n');
}
function parseArea(text, kind) {
    const { frontmatter } = (0, documents_1.parseFrontmatter)(text);
    (0, common_1.check)(frontmatter.schema === model_1.MODEL.area_index_schema && frontmatter.area === kind, 'index_noncanonical', 'Invalid area index metadata.', { kind }, common_1.EXIT.integrity);
    const result = { current: [], history: [] };
    for (const state of ['current', 'history'])
        for (const line of (0, documents_1.extractBlock)(text, state)) {
            const row = (0, index_row_1.parseRow)(line);
            (0, common_1.check)(row.fields.kind === kind && row.fields.state === state, 'index_wrong_state', 'Index row is in the wrong area or block.', { id: row.fields.id }, common_1.EXIT.integrity);
            result[state].push(row);
        }
    return result;
}
function stateOfPath(relative) { return relative.split('/')[2] === 'retired' ? 'history' : 'current'; }
function listRecordPaths(root, kind) {
    const out = [];
    for (const directory of [`context/${kind}`, `context/${kind}/retired`]) {
        const target = (0, filesystem_1.contained)(root, directory);
        if (!fs.existsSync(target))
            continue;
        for (const item of fs.readdirSync(target, { withFileTypes: true })) {
            if (!item.name.endsWith('.md') || item.name.endsWith('.index.md'))
                continue;
            (0, common_1.check)(item.isFile() && !item.isSymbolicLink(), 'path_unsafe', 'Records must be regular files.', { path: directory + '/' + item.name }, common_1.EXIT.integrity);
            out.push(directory + '/' + item.name);
        }
    }
    return out.sort(common_1.compareText);
}
function loadV3(relative, content, expected) {
    let record;
    try {
        record = (0, record_1.parseRecordText)(content);
    }
    catch (error) {
        if (error instanceof common_1.WhyveError)
            throw new common_1.WhyveError(error.code, `${relative}: ${error.message}`, { ...error.details, path: relative }, error.exitCode);
        throw error;
    }
    const kind = (0, record_1.kindOf)(record), state = stateOfPath(relative);
    (0, common_1.check)(!expected || kind === expected, 'schema_area_mismatch', 'Record kind differs from its area.', { path: relative }, common_1.EXIT.integrity);
    (0, common_1.check)(record.headers.state === state, 'state_path_mismatch', 'Record state differs from its directory.', { path: relative }, common_1.EXIT.integrity);
    return { path: relative, content, digest: (0, common_1.sha256)(Buffer.from(content, 'utf8')), record, kind, id: record.headers.id, state, format: 'v3' };
}
function loadV2(relative, content, area, preset = 'howse') {
    const state = relative.startsWith(`context/${area.row.area}/retired/`) ? 'history' : 'current';
    const { record, notes } = (0, legacy_1.convertV2)((0, documents_1.parseDocument)(content, area.descriptor), state, preset);
    return { path: relative, content, digest: (0, common_1.sha256)(Buffer.from(content, 'utf8')), record, kind: (0, record_1.kindOf)(record), id: record.headers.id, state, format: 'v2', notes };
}
/** A row projection of a stored record, identical to its index line. */
function rowOf(loaded, projections = []) {
    const h = loaded.record.headers, dir = `context/${loaded.kind}/`;
    const projected = {};
    for (const key of projections)
        if (Object.hasOwn(h, key))
            projected[key] = Array.isArray(h[key]) ? h[key] : [h[key]];
    const fields = { id: loaded.id, kind: loaded.kind, state: loaded.state, title: h.title, summary: h.summary, scope: h.scope, key: h.key ?? '',
        createdAt: h.created_at, updatedAt: h.updated_at ?? '', keywords: h.keywords ?? [], ...(Object.keys(projected).length ? { projections: projected } : {}) };
    const rawLine = (0, index_row_1.renderRow)({ ...fields, relativePath: loaded.path.slice(dir.length) });
    return { fields: { ...fields, path: loaded.path }, rawLine };
}
/** One consistent view of a vault. v2 vaults are read through the compatibility mapping and are never written. */
class VaultView {
    root;
    format;
    kinds;
    projections;
    legacy = [];
    registryDigest;
    outdated = [];
    /** `repair` reads a v3 vault whose registry or root index is damaged, using the given kinds. */
    constructor(root, repair) {
        this.root = root;
        this.format = detectFormat(root);
        (0, common_1.check)(this.format !== 'none', 'context_root_missing', 'Context root index is missing. Initialize Whyve first ($whyve:init in Codex, /whyve:init in Claude Code, or whyve init).', { path: exports.ROOT_INDEX }, common_1.EXIT.notFound);
        if (this.format === 'v3' && repair) {
            this.kinds = [...repair.kinds].sort(common_1.compareText);
            this.registryDigest = null;
        }
        else if (this.format === 'v3') {
            const registry = readRegistry(root);
            this.kinds = registry.kinds;
            this.outdated = registry.outdated;
            this.registryDigest = registry.digest;
            const listed = rootKinds((0, filesystem_1.readText)(root, exports.ROOT_INDEX));
            (0, common_1.check)(listed.join() === this.kinds.join(), 'index_stale', 'Root index areas differ from the owner registry. Run refresh --fix (whyve refresh --fix, or context_cli.mjs refresh --fix in the plugin).', {}, common_1.EXIT.integrity);
        }
        else {
            this.legacy = (0, catalog_1.registeredAreas)(root);
            this.kinds = this.legacy.map(a => a.row.area).filter(model_1.isKind).sort(common_1.compareText);
            this.registryDigest = null;
        }
        this.projections = this.format === 'v3' ? readProjections(root) : [];
    }
    areaText(kind) { return (0, filesystem_1.readText)(this.root, (0, exports.areaIndexPath)(kind)); }
    areaDigest(kind) { const raw = (0, filesystem_1.bytes)(this.root, (0, exports.areaIndexPath)(kind)); return raw ? (0, common_1.sha256)(raw) : null; }
    legacyArea(kind) { const a = this.legacy.find(x => x.row.area === kind); (0, common_1.check)(a, 'area_not_registered', 'Requested area is not registered.', { kind }, common_1.EXIT.notFound); return a; }
    /** Index rows of one area. Throws index errors; callers decide tolerance. */
    rows(kind) {
        if (this.format === 'v3') {
            const parsed = parseArea(this.areaText(kind), kind);
            return [...parsed.current, ...parsed.history].map(r => ({ rawLine: r.rawLine, fields: { ...r.fields, path: `context/${kind}/${r.fields.relativePath}` } })).map(({ rawLine, fields }) => {
                const { relativePath: _, ...rest } = fields;
                return { rawLine, fields: rest };
            });
        }
        const area = this.legacyArea(kind), parsed = (0, documents_1.parseAreaIndex)(area.text);
        const lines = new Map([...area.text.split('\n')].map(l => [/<!-- context-entry (\{.*\}) -->$/.exec(l)?.[1] ?? '', l]));
        return [...parsed.current, ...parsed.history].map(row => ({ fields: (0, legacy_1.rowFromV2)(row, kind), rawLine: [...lines.values()].find(l => l.includes(`"id":"${row.id}"`)) ?? '' }));
    }
    load(relative, kind) {
        const content = (0, filesystem_1.readText)(this.root, relative);
        return this.format === 'v3' ? loadV3(relative, content, kind) : loadV2(relative, content, this.legacyArea(kind));
    }
    paths(kind) { return this.format === 'v3' ? listRecordPaths(this.root, kind) : (0, catalog_1.listArtifactPaths)(this.root, kind); }
    /** Every record of the selected kinds, with pending changes overlaid (null deletes). */
    scan(kinds = this.kinds, overlay = new Map()) {
        const out = [], ids = new Set();
        for (const kind of kinds) {
            const paths = new Set([...this.paths(kind), ...[...overlay.keys()].filter(p => p.startsWith(`context/${kind}/`) && p.endsWith('.md') && !p.endsWith('.index.md'))]);
            for (const relative of [...paths].sort(common_1.compareText)) {
                const content = overlay.has(relative) ? overlay.get(relative) : (0, filesystem_1.readText)(this.root, relative);
                if (content === null)
                    continue;
                const loaded = this.format === 'v3' ? loadV3(relative, content, kind) : loadV2(relative, content, this.legacyArea(kind));
                (0, common_1.check)(!ids.has(loaded.id), 'duplicate_id', 'Record ID is present more than once.', { id: loaded.id }, common_1.EXIT.integrity);
                ids.add(loaded.id);
                out.push(loaded);
            }
        }
        return out;
    }
    find(id, kinds = this.kinds) {
        (0, common_1.requireId)(id);
        for (const kind of kinds) {
            let rows;
            try {
                rows = this.rows(kind);
            }
            catch (error) {
                if (error instanceof common_1.WhyveError && !['path_escape', 'symlink_path'].includes(error.code))
                    continue;
                throw error;
            }
            const row = rows.find(r => r.fields.id === id);
            if (row && (0, filesystem_1.bytes)(this.root, row.fields.path)) {
                const loaded = this.load(row.fields.path, kind);
                if (loaded.id === id)
                    return loaded;
            }
        }
        // An explicit ID may be recovered from disk when an index row is stale.
        const matches = this.scan(kinds).filter(r => r.id === id);
        (0, common_1.check)(matches.length === 1, 'not_found', 'Record ID was not found.', { id }, common_1.EXIT.notFound);
        return matches[0];
    }
    renderArea(kind, records) {
        let text = this.format === 'v3' && (0, filesystem_1.bytes)(this.root, (0, exports.areaIndexPath)(kind)) ? this.areaText(kind) : emptyArea(kind);
        for (const state of ['current', 'history']) {
            const rows = records.filter(r => r.kind === kind && r.state === state).sort((a, b) => (0, common_1.compareText)(a.record.headers.created_at, b.record.headers.created_at) || (0, common_1.compareText)(a.id, b.id));
            text = (0, documents_1.replaceBlock)(text, state, rows.map(r => rowOf(r, this.projections).rawLine));
        }
        return text;
    }
}
exports.VaultView = VaultView;
// ------------------------------------------------------------------ integrity
function validateRelations(records) {
    const byId = new Map(records.map(r => [r.id, r]));
    const successorOf = (r) => r.record.sources.find(s => s.relation === 'superseded-by')?.ref;
    for (const r of records) {
        for (const s of r.record.sources) {
            const typed = s.relation.split(':')[1];
            if (typed)
                (0, common_1.check)(byId.get(s.ref)?.kind === typed, 'typed_relation_invalid', 'Typed relation target is missing or has the wrong kind.', { id: r.id, relation: s.relation, target: s.ref }, common_1.EXIT.integrity);
            if (s.relation === 'supersedes')
                (0, common_1.check)(byId.get(s.ref) && successorOf(byId.get(s.ref)) === r.id, 'lifecycle_invalid', 'Predecessor edge is not reciprocal.', { id: r.id, target: s.ref }, common_1.EXIT.integrity);
        }
        const successor = successorOf(r);
        (0, common_1.check)(r.record.sources.filter(s => s.relation === 'superseded-by').length <= 1, 'lifecycle_invalid', 'A record must have at most one successor.', { id: r.id }, common_1.EXIT.integrity);
        if (r.state === 'history' && r.record.headers.lifecycle_reason === 'superseded')
            (0, common_1.check)(successor, 'lifecycle_invalid', 'A superseded record must name its successor.', { id: r.id }, common_1.EXIT.integrity);
        if (successor) {
            (0, common_1.check)(r.state === 'history', 'lifecycle_invalid', 'Only history records can name a successor.', { id: r.id }, common_1.EXIT.integrity);
            (0, common_1.check)(byId.get(successor)?.record.sources.some(s => s.relation === 'supersedes' && s.ref === r.id), 'lifecycle_invalid', 'Successor edge is not reciprocal.', { id: r.id }, common_1.EXIT.integrity);
        }
    }
    for (const r of records) {
        const seen = new Set();
        for (let current = r; current; current = byId.get(successorOf(current) ?? '')) {
            (0, common_1.check)(!seen.has(current.id), 'lifecycle_cycle', 'Supersession contains a cycle.', { id: r.id }, common_1.EXIT.integrity);
            seen.add(current.id);
        }
    }
}
function slotView(loaded) {
    const h = loaded.record.headers;
    return { id: loaded.id, kind: loaded.kind, scope: h.scope, key: h.key ?? '',
        vocabulary: loaded.kind === 'term' ? [h.term, ...(h.aliases ?? []), ...(h.deprecated_terms ?? [])].map(common_1.canonicalKey) : undefined };
}
/** The single slot rule (docs/record-model.md section 8) shared by prepare, apply and checkSlot. */
function slotRelation(a, b) {
    if (a.kind !== b.kind)
        return null;
    const rule = (0, model_1.spec)(a.kind).slot;
    if (rule === 'none')
        return null;
    if (rule === 'term-overlap')
        return (0, common_1.scopesOverlap)(a.scope, b.scope) && a.vocabulary.some(x => b.vocabulary.includes(x)) ? 'term_overlap' : null;
    if (a.key !== b.key)
        return null;
    if (a.scope === b.scope)
        return 'exact_slot';
    return rule === 'decision-overlap' && (0, common_1.scopesOverlap)(a.scope, b.scope) ? 'scope_overlap' : null;
}
/** Checks pairs that involve a changed slot. `separate` holds IDs whose scope overlap the judge found compatible. */
function validateSlots(records, changed, separate = new Set(), ignoreOverlap = false) {
    const current = records.filter(r => r.state === 'current' && (0, model_1.spec)(r.kind).slot !== 'none');
    for (let i = 0; i < current.length; i++)
        for (let j = i + 1; j < current.length; j++) {
            const a = current[i], b = current[j];
            if (a.kind !== b.kind || (!changed.has(a.id) && !changed.has(b.id)))
                continue;
            const relation = slotRelation(slotView(a), slotView(b));
            if (!relation)
                continue;
            const permitted = relation === 'scope_overlap' && (ignoreOverlap || separate.has(a.id) || separate.has(b.id));
            (0, common_1.check)(permitted, relation === 'term_overlap' ? 'term_conflict' : 'duplicate_current_slot', relation === 'term_overlap' ? 'Current terminology overlaps in related scopes.' : 'Current records occupy the same or overlapping slot.', { ids: [a.id, b.id], reason: relation }, common_1.EXIT.conflict);
        }
}
