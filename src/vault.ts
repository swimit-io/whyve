import * as fs from 'node:fs';
import * as path from 'node:path';
import { check, fail, canonicalDigest, canonicalKey, compareText, requireId, scopesOverlap, sha256, strictJson, EXIT, WhyveError } from './common';
import { bytes, contained, readText, utf8 } from './filesystem';
import { MODEL, KINDS, spec, isKind } from './model';
import { StoredRecord, parseRecordText, kindOf, computeFlags, isHostKey, sectionText } from './record';
import { renderRow, parseRow, ParsedRow } from './index-row';
import { parseDocument, parseAreaIndex, parseFrontmatter, extractBlock, replaceBlock } from './documents';
import { registeredAreas as legacyAreas, listArtifactPaths as legacyPaths, Area as LegacyArea } from './catalog';
import { convertV2, rowFromV2, RefHeaderPreset } from './legacy';
import type { Kind, HeaderValue, Row, RowFields, RecordState } from './host-types';

export const ROOT_INDEX = 'context/context.index.md';
export const REGISTRY = '.whyve/owners/registry.json';
export const PROJECTIONS = '.whyve/index-projections.json';
export type Format = 'v3' | 'v2' | 'none';
export const areaIndexPath = (kind: Kind) => `context/${kind}/${kind}.index.md`;
const title = (kind: string) => kind[0].toUpperCase() + kind.slice(1);
const escapeCatalog = (v: string) => v.replace(/[\\·\[\]]/g, '\\$&');

export function detectFormat(root: string): Format {
    const raw = bytes(root, ROOT_INDEX);
    if (!raw) return 'none';
    const schema = /^schema: "([^"]+)"$/m.exec(utf8(raw).split('\n---\n')[0])?.[1];
    if (schema === MODEL.root_index_schema) return 'v3';
    if (schema === 'context-root-index/v1') return 'v2';
    return fail('index_noncanonical', 'Unknown root index schema.', { schema }, EXIT.integrity);
}

// ------------------------------------------------------------------ v3 catalog files
export const descriptorDigest = (kind: Kind) => canonicalDigest(spec(kind));
export function renderRegistry(kinds: Kind[]): string {
    const areas = Object.fromEntries([...kinds].sort(compareText).map(k => [k, { schema: spec(k).schema, descriptor_digest: descriptorDigest(k), descriptor: spec(k) }]));
    return JSON.stringify({ schema: 'whyve-owner-registry/v1', protocol: MODEL.protocol, areas }, null, 1) + '\n';
}
export interface Registry { kinds: Kind[]; outdated: Kind[]; digest: string }
export function readRegistry(root: string): Registry {
    const raw = bytes(root, REGISTRY, 1024 * 1024);
    check(raw, 'registry_missing', 'Owner registry is missing; run whyve refresh --fix.', { path: REGISTRY }, EXIT.integrity);
    const value = strictJson(utf8(raw), 'registry_invalid');
    check(value.schema === 'whyve-owner-registry/v1' && value.protocol === MODEL.protocol && value.areas && typeof value.areas === 'object', 'registry_invalid', 'Owner registry is invalid.', {}, EXIT.integrity);
    const kinds = Object.keys(value.areas);
    check(kinds.every(isKind), 'registry_invalid', 'Owner registry names an unknown kind.', {}, EXIT.integrity);
    for (const kind of kinds as Kind[]) check(canonicalDigest(value.areas[kind].descriptor) === value.areas[kind].descriptor_digest, 'registry_invalid', 'Descriptor digest differs.', { kind }, EXIT.integrity);
    return { kinds: (kinds as Kind[]).sort(compareText), outdated: (kinds as Kind[]).filter(k => value.areas[k].descriptor_digest !== descriptorDigest(k)), digest: sha256(raw) };
}
export function readProjections(root: string): string[] {
    const raw = bytes(root, PROJECTIONS, 64 * 1024);
    if (!raw) return [];
    const value = strictJson(utf8(raw), 'projections_invalid');
    check(value.schema === 'whyve-index-projections/v1' && Array.isArray(value.keys) && value.keys.length <= 8 && value.keys.every((k: unknown) => typeof k === 'string' && isHostKey(k)) && new Set(value.keys).size === value.keys.length && Object.keys(value).length === 2,
        'projections_invalid', 'index-projections.json lists at most eight namespace.name keys.', {}, EXIT.integrity);
    return [...value.keys].sort(compareText);
}
export function renderRoot(kinds: Kind[]): string {
    const rows = [...kinds].sort(compareText).map(k => `- [${title(k)}](${k}/${k}.index.md) · ${k} · ${escapeCatalog(spec(k).summary)}`);
    return ['---', `schema: ${JSON.stringify(MODEL.root_index_schema)}`, `protocol: ${JSON.stringify(MODEL.protocol)}`, 'summary: "Catalog of shared project context areas"', '---', '', '# Context', '', '## Areas',
        '<!-- BEGIN CONTEXT GENERATED:areas -->', ...rows, '<!-- END CONTEXT GENERATED:areas -->', ''].join('\n');
}
export function rootKinds(text: string): Kind[] {
    return extractBlock(text, 'areas').map(line => {
        const kind = /^- \[[^\]]*\]\(([a-z]+)\/\1\.index\.md\) · ([a-z]+) · /.exec(line);
        check(kind && kind[1] === kind[2] && isKind(kind[1]), 'index_noncanonical', 'Invalid root catalog row.', { line: line.slice(0, 120) }, EXIT.integrity);
        return kind[1] as Kind;
    });
}
export function emptyArea(kind: Kind): string {
    return ['---', `schema: ${JSON.stringify(MODEL.area_index_schema)}`, `area: ${JSON.stringify(kind)}`, `authority: ${JSON.stringify(spec(kind).authority)}`, `summary: ${JSON.stringify(spec(kind).summary)}`, '---', '',
        `# ${title(kind)}`, '', '## Current', '<!-- BEGIN CONTEXT GENERATED:current -->', '<!-- END CONTEXT GENERATED:current -->', '', '## History', '<!-- BEGIN CONTEXT GENERATED:history -->', '<!-- END CONTEXT GENERATED:history -->', ''].join('\n');
}
export function parseArea(text: string, kind: Kind): { current: ParsedRow[]; history: ParsedRow[] } {
    const { frontmatter } = parseFrontmatter(text);
    check(frontmatter.schema === MODEL.area_index_schema && frontmatter.area === kind, 'index_noncanonical', 'Invalid area index metadata.', { kind }, EXIT.integrity);
    const result = { current: [] as ParsedRow[], history: [] as ParsedRow[] };
    for (const state of ['current', 'history'] as const)
        for (const line of extractBlock(text, state)) {
            const row = parseRow(line);
            check(row.fields.kind === kind && row.fields.state === state, 'index_wrong_state', 'Index row is in the wrong area or block.', { id: row.fields.id }, EXIT.integrity);
            result[state].push(row);
        }
    return result;
}

// ------------------------------------------------------------------ records on disk
export interface Loaded {
    path: string;
    content: string;
    digest: string;
    record: StoredRecord;
    kind: Kind;
    id: string;
    state: RecordState;
    format: 'v3' | 'v2';
}
export function stateOfPath(relative: string): RecordState { return relative.split('/')[2] === 'retired' ? 'history' : 'current'; }
export function listRecordPaths(root: string, kind: Kind): string[] {
    const out: string[] = [];
    for (const directory of [`context/${kind}`, `context/${kind}/retired`]) {
        const target = contained(root, directory);
        if (!fs.existsSync(target)) continue;
        for (const item of fs.readdirSync(target, { withFileTypes: true })) {
            if (!item.name.endsWith('.md') || item.name.endsWith('.index.md')) continue;
            check(item.isFile() && !item.isSymbolicLink(), 'path_unsafe', 'Records must be regular files.', { path: directory + '/' + item.name }, EXIT.integrity);
            out.push(directory + '/' + item.name);
        }
    }
    return out.sort(compareText);
}
export function loadV3(relative: string, content: string, expected?: Kind): Loaded {
    let record: StoredRecord;
    try { record = parseRecordText(content); }
    catch (error) { if (error instanceof WhyveError) throw new WhyveError(error.code, `${relative}: ${error.message}`, { ...error.details, path: relative }, error.exitCode); throw error; }
    const kind = kindOf(record), state = stateOfPath(relative);
    check(!expected || kind === expected, 'schema_area_mismatch', 'Record kind differs from its area.', { path: relative }, EXIT.integrity);
    check(record.headers.state === state, 'state_path_mismatch', 'Record state differs from its directory.', { path: relative }, EXIT.integrity);
    return { path: relative, content, digest: sha256(Buffer.from(content, 'utf8')), record, kind, id: record.headers.id as string, state, format: 'v3' };
}
export function loadV2(relative: string, content: string, area: LegacyArea, preset: RefHeaderPreset = 'howse'): Loaded & { notes: ReturnType<typeof convertV2>['notes'] } {
    const state: RecordState = relative.startsWith(`context/${area.row.area}/retired/`) ? 'history' : 'current';
    const { record, notes } = convertV2(parseDocument(content, area.descriptor), state, preset);
    return { path: relative, content, digest: sha256(Buffer.from(content, 'utf8')), record, kind: kindOf(record), id: record.headers.id as string, state, format: 'v2', notes };
}
/** A row projection of a stored record, identical to its index line. */
export function rowOf(loaded: Loaded, projections: string[] = []): Row {
    const h = loaded.record.headers, dir = `context/${loaded.kind}/`;
    const projected: Record<string, string[]> = {};
    for (const key of projections) if (Object.hasOwn(h, key)) projected[key] = Array.isArray(h[key]) ? h[key] : [h[key] as string];
    const fields = { id: loaded.id, kind: loaded.kind, state: loaded.state, title: h.title as string, summary: h.summary as string, scope: h.scope as string, key: (h.key as string) ?? '',
        createdAt: h.created_at as string, updatedAt: (h.updated_at as string) ?? '', keywords: (h.keywords as string[]) ?? [], ...(Object.keys(projected).length ? { projections: projected } : {}) };
    const rawLine = renderRow({ ...fields, relativePath: loaded.path.slice(dir.length) });
    return { fields: { ...fields, path: loaded.path }, rawLine };
}

/** One consistent view of a vault. v2 vaults are read through the compatibility mapping and are never written. */
export class VaultView {
    readonly format: Format;
    readonly kinds: Kind[];
    readonly projections: string[];
    private readonly legacy: LegacyArea[] = [];
    readonly registryDigest: string | null;
    readonly outdated: Kind[] = [];
    /** `repair` reads a v3 vault whose registry or root index is damaged, using the given kinds. */
    constructor(readonly root: string, repair?: { kinds: Kind[] }) {
        this.format = detectFormat(root);
        check(this.format !== 'none', 'context_root_missing', 'Context root index is missing; run whyve init.', { path: ROOT_INDEX }, EXIT.notFound);
        if (this.format === 'v3' && repair) {
            this.kinds = [...repair.kinds].sort(compareText);
            this.registryDigest = null;
        }
        else if (this.format === 'v3') {
            const registry = readRegistry(root);
            this.kinds = registry.kinds;
            this.outdated = registry.outdated;
            this.registryDigest = registry.digest;
            const listed = rootKinds(readText(root, ROOT_INDEX));
            check(listed.join() === this.kinds.join(), 'index_stale', 'Root index areas differ from the owner registry; run whyve refresh --fix.', {}, EXIT.integrity);
        }
        else {
            this.legacy = legacyAreas(root);
            this.kinds = this.legacy.map(a => a.row.area).filter(isKind).sort(compareText);
            this.registryDigest = null;
        }
        this.projections = this.format === 'v3' ? readProjections(root) : [];
    }
    areaText(kind: Kind): string { return readText(this.root, areaIndexPath(kind)); }
    areaDigest(kind: Kind): string | null { const raw = bytes(this.root, areaIndexPath(kind)); return raw ? sha256(raw) : null; }
    legacyArea(kind: Kind): LegacyArea { const a = this.legacy.find(x => x.row.area === kind); check(a, 'area_not_registered', 'Requested area is not registered.', { kind }, EXIT.notFound); return a; }
    /** Index rows of one area. Throws index errors; callers decide tolerance. */
    rows(kind: Kind): Row[] {
        if (this.format === 'v3') {
            const parsed = parseArea(this.areaText(kind), kind);
            return [...parsed.current, ...parsed.history].map(r => ({ rawLine: r.rawLine, fields: { ...r.fields, path: `context/${kind}/${r.fields.relativePath}` } })).map(({ rawLine, fields }) => {
                const { relativePath: _, ...rest } = fields as RowFields & { relativePath: string };
                return { rawLine, fields: rest };
            });
        }
        const area = this.legacyArea(kind), parsed = parseAreaIndex(area.text);
        const lines = new Map([...area.text.split('\n')].map(l => [/<!-- context-entry (\{.*\}) -->$/.exec(l)?.[1] ?? '', l]));
        return [...parsed.current, ...parsed.history].map(row => ({ fields: rowFromV2(row, kind), rawLine: [...lines.values()].find(l => l.includes(`"id":"${row.id}"`)) ?? '' }));
    }
    load(relative: string, kind: Kind): Loaded {
        const content = readText(this.root, relative);
        return this.format === 'v3' ? loadV3(relative, content, kind) : loadV2(relative, content, this.legacyArea(kind));
    }
    paths(kind: Kind): string[] { return this.format === 'v3' ? listRecordPaths(this.root, kind) : legacyPaths(this.root, kind); }
    /** Every record of the selected kinds, with pending changes overlaid (null deletes). */
    scan(kinds: Kind[] = this.kinds, overlay = new Map<string, string | null>()): Loaded[] {
        const out: Loaded[] = [], ids = new Set<string>();
        for (const kind of kinds) {
            const paths = new Set([...this.paths(kind), ...[...overlay.keys()].filter(p => p.startsWith(`context/${kind}/`) && p.endsWith('.md') && !p.endsWith('.index.md'))]);
            for (const relative of [...paths].sort(compareText)) {
                const content = overlay.has(relative) ? overlay.get(relative)! : readText(this.root, relative);
                if (content === null) continue;
                const loaded = this.format === 'v3' ? loadV3(relative, content, kind) : loadV2(relative, content, this.legacyArea(kind));
                check(!ids.has(loaded.id), 'duplicate_id', 'Record ID is present more than once.', { id: loaded.id }, EXIT.integrity);
                ids.add(loaded.id);
                out.push(loaded);
            }
        }
        return out;
    }
    find(id: string, kinds: Kind[] = this.kinds): Loaded {
        requireId(id);
        for (const kind of kinds) {
            let rows: Row[];
            try { rows = this.rows(kind); }
            catch (error) { if (error instanceof WhyveError && !['path_escape', 'symlink_path'].includes(error.code)) continue; throw error; }
            const row = rows.find(r => r.fields.id === id);
            if (row && bytes(this.root, row.fields.path)) {
                const loaded = this.load(row.fields.path, kind);
                if (loaded.id === id) return loaded;
            }
        }
        // An explicit ID may be recovered from disk when an index row is stale.
        const matches = this.scan(kinds).filter(r => r.id === id);
        check(matches.length === 1, 'not_found', 'Record ID was not found.', { id }, EXIT.notFound);
        return matches[0];
    }
    renderArea(kind: Kind, records: Loaded[]): string {
        let text = this.format === 'v3' && bytes(this.root, areaIndexPath(kind)) ? this.areaText(kind) : emptyArea(kind);
        for (const state of ['current', 'history'] as const) {
            const rows = records.filter(r => r.kind === kind && r.state === state).sort((a, b) => compareText(a.record.headers.created_at as string, b.record.headers.created_at as string) || compareText(a.id, b.id));
            text = replaceBlock(text, state, rows.map(r => rowOf(r, this.projections).rawLine));
        }
        return text;
    }
}

// ------------------------------------------------------------------ integrity
export function validateRelations(records: Loaded[]): void {
    const byId = new Map(records.map(r => [r.id, r]));
    const successorOf = (r: Loaded) => r.record.sources.find(s => s.relation === 'superseded-by')?.ref;
    for (const r of records) {
        for (const s of r.record.sources) {
            const typed = s.relation.split(':')[1];
            if (typed) check(byId.get(s.ref)?.kind === typed, 'typed_relation_invalid', 'Typed relation target is missing or has the wrong kind.', { id: r.id, relation: s.relation, target: s.ref }, EXIT.integrity);
            if (s.relation === 'supersedes') check(byId.get(s.ref) && successorOf(byId.get(s.ref)!) === r.id, 'lifecycle_invalid', 'Predecessor edge is not reciprocal.', { id: r.id, target: s.ref }, EXIT.integrity);
        }
        const successor = successorOf(r);
        check(r.record.sources.filter(s => s.relation === 'superseded-by').length <= 1, 'lifecycle_invalid', 'A record has at most one successor.', { id: r.id }, EXIT.integrity);
        if (r.state === 'history' && r.record.headers.lifecycle_reason === 'superseded') check(successor, 'lifecycle_invalid', 'A superseded record names its successor.', { id: r.id }, EXIT.integrity);
        if (successor) {
            check(r.state === 'history', 'lifecycle_invalid', 'Only history records name a successor.', { id: r.id }, EXIT.integrity);
            check(byId.get(successor)?.record.sources.some(s => s.relation === 'supersedes' && s.ref === r.id), 'lifecycle_invalid', 'Successor edge is not reciprocal.', { id: r.id }, EXIT.integrity);
        }
    }
    for (const r of records) {
        const seen = new Set<string>();
        for (let current: Loaded | undefined = r; current; current = byId.get(successorOf(current) ?? '')) {
            check(!seen.has(current.id), 'lifecycle_cycle', 'Supersession contains a cycle.', { id: r.id }, EXIT.integrity);
            seen.add(current.id);
        }
    }
}
export interface SlotView { id: string; kind: Kind; scope: string; key: string; vocabulary?: string[] }
export function slotView(loaded: { id: string; kind: Kind; record: StoredRecord }): SlotView {
    const h = loaded.record.headers;
    return { id: loaded.id, kind: loaded.kind, scope: h.scope as string, key: (h.key as string) ?? '',
        vocabulary: loaded.kind === 'term' ? [h.term as string, ...((h.aliases as string[]) ?? []), ...((h.deprecated_terms as string[]) ?? [])].map(canonicalKey) : undefined };
}
/** The single slot rule (docs/record-model.md section 8) shared by prepare, apply and checkSlot. */
export function slotRelation(a: SlotView, b: SlotView): 'exact_slot' | 'scope_overlap' | 'term_overlap' | null {
    if (a.kind !== b.kind) return null;
    const rule = spec(a.kind).slot;
    if (rule === 'none') return null;
    if (rule === 'term-overlap') return scopesOverlap(a.scope, b.scope) && a.vocabulary!.some(x => b.vocabulary!.includes(x)) ? 'term_overlap' : null;
    if (a.key !== b.key) return null;
    if (a.scope === b.scope) return 'exact_slot';
    return rule === 'decision-overlap' && scopesOverlap(a.scope, b.scope) ? 'scope_overlap' : null;
}
/** Checks pairs that involve a changed slot. `separate` holds IDs whose scope overlap the judge found compatible. */
export function validateSlots(records: Loaded[], changed: Set<string>, separate: Set<string> = new Set(), ignoreOverlap = false): void {
    const current = records.filter(r => r.state === 'current' && spec(r.kind).slot !== 'none');
    for (let i = 0; i < current.length; i++)
        for (let j = i + 1; j < current.length; j++) {
            const a = current[i], b = current[j];
            if (a.kind !== b.kind || (!changed.has(a.id) && !changed.has(b.id))) continue;
            const relation = slotRelation(slotView(a), slotView(b));
            if (!relation) continue;
            const permitted = relation === 'scope_overlap' && (ignoreOverlap || separate.has(a.id) || separate.has(b.id));
            check(permitted, relation === 'term_overlap' ? 'term_conflict' : 'duplicate_current_slot', relation === 'term_overlap' ? 'Current terminology overlaps in related scopes.' : 'Current records occupy the same or overlapping slot.', { ids: [a.id, b.id], reason: relation }, EXIT.conflict);
        }
}
export { computeFlags, sectionText, KINDS };
