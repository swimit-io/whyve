import { check, fail, codepoints, canonicalScope, canonicalKey, compareText, requireId, timestamp, date, nfc, normalizedKey, sha256, EXIT } from './common';
import { MODEL, KINDS, LIMITS, spec, isKind, STRUCTURAL_FLAGS, FLAG_MESSAGES, MANAGED_RELATIONS, HeaderSpec, SectionSpec } from './model';
import type { Kind, HeaderValue, SourceEntry, QualityFlag, RecordInput, Authorization, BodyValue } from './host-types';

/** One record in memory. `name` is the canonical section name or null for a hand-written unregistered section. */
export interface Section { title: string; name: string | null; text: string }
export interface StoredRecord {
    headers: Record<string, HeaderValue>;
    sections: Section[];
    sources: SourceEntry[];
    /** Heading style: canonical English names or the Korean aliases. */
    alias: boolean;
}

const RESERVED_KEY = /^[a-z][a-z0-9_]*$/;
const HOST_KEY = /^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/;
const RELATION = /^[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)?$/;
const DELIMITER = /^[a-z][a-z0-9]*-(?:snap|section)-[1-9][0-9]{0,5}$/;
export const isHostKey = (key: string) => HOST_KEY.test(key) && key.length <= 80;
const utf8Bytes = (text: string) => Buffer.byteLength(text, 'utf8');
const oneLine = (value: string) => !/[\r\n]/.test(value);

export function kindOf(record: StoredRecord): Kind { const kind = record.headers.kind; check(isKind(kind), 'schema_invalid', 'Record kind is invalid.'); return kind; }
function headerSpecs(kind: Kind): HeaderSpec[] { return [...MODEL.common, ...spec(kind).headers]; }
export function sectionSpec(kind: Kind, title: string): SectionSpec | undefined { return spec(kind).sections.find(s => s.name === title || s.alias === title); }
export function sectionText(record: StoredRecord, name: string): string { return record.sections.find(s => s.name === name)?.text ?? ''; }
export const primarySection = (kind: Kind): SectionSpec => spec(kind).sections[0];
const substantive = (value: string) => !!value.trim() && !['...', 'TODO', 'TBD', 'N/A', '해당 없음'].includes(value.trim());

// ---------------------------------------------------------------- header values
function validateValue(kind: Kind | null, s: HeaderSpec, value: unknown, headers: Record<string, HeaderValue>): void {
    const field = s.key, fail_ = (message: string): never => fail('schema_invalid', `${field}: ${message}`, { field });
    if (s.type === 'string_list' || s.type === 'id_list') {
        if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) fail_('must be a list of strings.');
        const list = value as string[], maxItems = s.max_items ?? s.max ?? 12;
        if (list.length > maxItems) fail_(`at most ${maxItems} items.`);
        if (new Set(list).size !== list.length) fail_('items must be unique.');
        for (const item of list) {
            if (s.type === 'id_list') requireId(item, field);
            else if (!substantive(item) || !oneLine(item) || codepoints(item) > (s.max_item_chars ?? 500)) fail_(`items must be non-empty single lines of at most ${s.max_item_chars} codepoints.`);
        }
        return;
    }
    if (typeof value !== 'string') fail_('must be a string.');
    const text = value as string;
    switch (s.type) {
        case 'string': case 'delimiter':
            if (!oneLine(text) || !substantive(text) || (s.max !== undefined && codepoints(text) > s.max)) fail_(`must be one non-empty line of at most ${s.max} codepoints.`);
            if (s.type === 'delimiter' && !DELIMITER.test(text)) fail_('invalid section delimiter.');
            return;
        case 'kind': if (!isKind(text)) fail_('unknown kind.'); return;
        case 'scope': check(canonicalScope(text) === text, 'slot_invalid', 'Stored scope must be canonical.', { field }); return;
        case 'key': check(canonicalKey(text) === text, 'slot_invalid', 'Stored key must be canonical.', { field }); return;
        case 'timestamp': timestamp(text); return;
        case 'date': date(text); return;
        case 'id': requireId(text, field); return;
        case 'digest': if (!/^sha256:[0-9a-f]{64}$/.test(text)) fail_('invalid digest.'); return;
        case 'schema': if (!kind || text !== spec(kind).schema) fail_('schema differs from kind.'); return;
        case 'state': if (!['current', 'history'].includes(text)) fail_('state must be current or history.'); return;
        case 'authorization': if (!['user', 'policy', 'legacy'].includes(text)) fail_('invalid authorization source.'); return;
        case 'reason': if (!kind || !spec(kind).retire.includes(text)) fail_(`not a ${kind} lifecycle reason.`); return;
        case 'enum': if (!s.values!.includes(text)) fail_(`must be one of ${s.values!.join(', ')}.`); return;
    }
    fail_(`unsupported type ${s.type}.`);
}
function validateHostHeaders(headers: Record<string, HeaderValue>): void {
    const keys = Object.keys(headers).filter(k => !RESERVED_KEY.test(k));
    check(keys.length <= LIMITS.custom_header_keys, 'custom_header_invalid', `At most ${LIMITS.custom_header_keys} host headers.`, {}, EXIT.usage);
    let total = 0;
    for (const key of keys) {
        check(isHostKey(key), 'custom_header_invalid', 'Host headers use namespace.name with [a-z][a-z0-9_-]* parts, at most 80 characters.', { key });
        check(!key.startsWith('whyve.'), 'custom_header_invalid', 'The whyve. namespace is reserved.', { key });
        const value = headers[key], list = Array.isArray(value) ? value : [value];
        check(list.every(v => typeof v === 'string' && oneLine(v) && utf8Bytes(v) <= LIMITS.custom_value_bytes) && (!Array.isArray(value) || value.length <= LIMITS.custom_list_items), 'custom_header_invalid',
            `Host header values are single-line strings of at most ${LIMITS.custom_value_bytes} bytes; lists hold at most ${LIMITS.custom_list_items} items.`, { key });
        total += utf8Bytes(`${key}: ${JSON.stringify(value)}\n`);
    }
    check(total <= LIMITS.custom_header_bytes, 'custom_header_invalid', `Host headers exceed ${LIMITS.custom_header_bytes} bytes.`, { bytes: total });
}
export function validateHeaders(headers: Record<string, HeaderValue>): Kind {
    const kind = headers.kind;
    check(isKind(kind), 'schema_invalid', 'Header kind is missing or unknown.', { field: 'kind' });
    const specs = headerSpecs(kind), known = new Set(specs.map(s => s.key));
    for (const key of Object.keys(headers))
        check(known.has(key) || !RESERVED_KEY.test(key), 'header_unknown', `Header ${key} is not part of ${kind} records; host data uses namespace.name keys.`, { key });
    const history = headers.state === 'history', keyRule = spec(kind).key, lifecycle = ['retired_at', 'lifecycle_reason'];
    for (const s of specs) {
        const present = Object.hasOwn(headers, s.key);
        // Stored files always carry a summary; the core derives one when the input omits it.
        const required = s.class === 'H' || s.key === 'summary' || (s.key === 'key' && keyRule !== 'none') || (lifecycle.includes(s.key) && history);
        const forbidden = (s.key === 'key' && keyRule === 'none') || (lifecycle.includes(s.key) && !history);
        if (required) check(present, 'schema_invalid', `Required header ${s.key} is missing.`, { missing: [s.key] });
        if (forbidden) check(!present, 'lifecycle_invalid', `${s.key} is not allowed on this ${kind} record.`, { field: s.key }, EXIT.conflict);
        if (present) validateValue(kind, s, headers[s.key], headers);
    }
    if (kind === 'term') {
        check(headers.key === canonicalKey(headers.term as string), 'slot_invalid', 'TERM key must be derived from term.');
        const vocabulary = [headers.term as string, ...((headers.aliases as string[]) ?? []), ...((headers.deprecated_terms as string[]) ?? [])].map(canonicalKey);
        check(new Set(vocabulary).size === vocabulary.length, 'term_overlap', 'Term vocabulary must have disjoint canonical keys.', {}, EXIT.conflict);
    }
    const created = Date.parse(headers.created_at as string);
    for (const key of ['updated_at', 'retired_at', 'verified_at'])
        if (typeof headers[key] === 'string') check(Date.parse(headers[key] as string) >= created, 'clock_invalid', `${key} cannot precede created_at.`, {}, EXIT.conflict);
    validateHostHeaders(headers);
    return kind;
}

// ---------------------------------------------------------------- sources
export function escapeRef(value: string): string { return value.replace(/\\/g, '\\\\').replace(/—/g, '\\—'); }
export function renderSource(entry: SourceEntry): string {
    return `- ${entry.relation}: ${escapeRef(entry.ref)}${entry.note !== undefined ? ' — ' + entry.note.replace(/\\/g, '\\\\') : ''}`;
}
export function parseSource(line: string): SourceEntry {
    const match = /^- ([a-z][a-z0-9_:-]*): (.*)$/.exec(line);
    check(match, 'sources_invalid', 'A Sources line is `- relation: ref` with an optional ` — note`.', { line: line.slice(0, 200) });
    const [, relation, rest] = match;
    let ref = '', note: string | undefined, i = 0;
    for (; i < rest.length; i++) {
        const c = rest[i];
        if (c === '\\') { check(i + 1 < rest.length, 'sources_invalid', 'Dangling escape in a Sources ref.'); ref += rest[++i]; continue; }
        if (c === '—' && rest[i - 1] === ' ' && rest[i + 1] === ' ') { ref = ref.slice(0, -1); note = rest.slice(i + 2).replace(/\\\\/g, '\\'); break; }
        ref += c;
    }
    const entry: SourceEntry = { relation, ref, ...(note !== undefined ? { note } : {}) };
    validateSource(entry);
    return entry;
}
export function validateSource(entry: SourceEntry): void {
    check(entry && typeof entry === 'object' && typeof entry.relation === 'string' && RELATION.test(entry.relation) && entry.relation.length <= 80, 'sources_invalid', 'Source relation must be [a-z][a-z0-9_-]* with an optional :kind suffix.', { relation: entry?.relation });
    check(typeof entry.ref === 'string' && entry.ref.trim() === entry.ref && entry.ref.length > 0 && oneLine(entry.ref) && codepoints(entry.ref) <= LIMITS.source_ref_codepoints, 'sources_invalid', `Source refs are non-empty trimmed single lines of at most ${LIMITS.source_ref_codepoints} codepoints.`, { relation: entry.relation });
    check(entry.note === undefined || (typeof entry.note === 'string' && entry.note.length > 0 && entry.note.trim() === entry.note && oneLine(entry.note) && codepoints(entry.note) <= LIMITS.source_note_codepoints), 'sources_invalid', `Source notes are trimmed single lines of at most ${LIMITS.source_note_codepoints} codepoints.`, { relation: entry.relation });
    const extra = Object.keys(entry).filter(k => !['relation', 'ref', 'note'].includes(k));
    check(!extra.length, 'sources_invalid', 'Source entries have relation, ref and note only.', { fields: extra });
    const typed = entry.relation.split(':')[1];
    if (typed) check(isKind(typed), 'sources_invalid', 'Typed relation suffix must be a record kind.', { relation: entry.relation });
    if (['supersedes', 'superseded-by'].includes(entry.relation) || typed) requireId(entry.ref, entry.relation);
}
export const sameSource = (a: SourceEntry, b: SourceEntry) => a.relation === b.relation && a.ref === b.ref && (a.note ?? null) === (b.note ?? null);

// ---------------------------------------------------------------- parse
interface HeaderBlock { headers: Record<string, HeaderValue>; lines: string[]; closing: number }
export function parseHeaderBlock(text: string): HeaderBlock {
    check(!text.startsWith('﻿'), 'header_invalid', 'UTF-8 BOM is not supported.');
    check(!text.includes('\r'), 'header_invalid', 'Stored records use LF newlines.');
    const lines = text.split('\n'), closing = lines.indexOf('---', 1);
    check(lines[0] === '---' && closing > 0, 'header_invalid', 'Header delimiters are required.');
    check(utf8Bytes(lines.slice(0, closing + 1).join('\n') + '\n') <= LIMITS.header_bytes, 'header_too_large', `Header block exceeds ${LIMITS.header_bytes} bytes.`);
    const headers: Record<string, HeaderValue> = {};
    for (const line of lines.slice(1, closing)) {
        const split = line.indexOf(': '), key = line.slice(0, split), raw = line.slice(split + 2);
        check(split > 0 && (RESERVED_KEY.test(key) || isHostKey(key)) && !Object.hasOwn(headers, key), 'header_invalid', 'Invalid or duplicate header key.', { key: key.slice(0, 100) });
        let value: unknown;
        try { value = JSON.parse(raw); } catch { fail('header_invalid', 'Header value must be compact JSON.', { key }); }
        check((typeof value === 'string' || (Array.isArray(value) && value.every(v => typeof v === 'string'))) && JSON.stringify(value) === raw, 'header_invalid', 'Header values are compact JSON strings or string arrays.', { key });
        Object.defineProperty(headers, key, { value, enumerable: true, writable: true, configurable: true });
    }
    return { headers, lines, closing };
}
function fenceToggle(line: string, fence: string | undefined): string | undefined {
    const f = /^\s*(```+|~~~+)/.exec(line)?.[1][0];
    return f ? (fence === f ? undefined : fence ?? f) : fence;
}
function isSourcesTitle(title: string): boolean { return title === MODEL.sources_section.name || title === MODEL.sources_section.alias; }
export function parseRecordText(text: string): StoredRecord {
    const { headers, lines, closing } = parseHeaderBlock(text), kind = validateHeaders(headers);
    check(lines[closing + 1] === '' && lines.at(-1) === '', 'section_schema_error', 'A blank line follows the header and the file ends with a newline.');
    const sections: Section[] = [], sources: SourceEntry[] = [], delimiter = headers.section_delimiter as string | undefined;
    let i = closing + 2, inSources = false;
    const addSection = (title: string, body: string) => {
        const s = sectionSpec(kind, title);
        check(!sections.some(x => x.title === title || (s && x.name === s.name)), 'section_schema_error', 'Duplicate section.', { section: title });
        sections.push({ title, name: s?.name ?? null, text: body });
    };
    const end = lines.length - 1;
    if (delimiter) {
        const begin = `<!-- ${delimiter} begin -->`, stop = `<!-- ${delimiter} end -->`;
        while (i < end) {
            if (lines[i] === '') { i++; continue; }
            const title = /^## (.+)$/.exec(lines[i])?.[1];
            check(title, 'section_schema_error', 'Framed records contain only framed sections and Sources.', { line: i + 1 });
            if (isSourcesTitle(title)) { inSources = true; i++; break; }
            check(lines[i + 1] === '' && lines[i + 2] === begin, 'section_schema_error', 'Framed section begin marker is missing.', { section: title });
            const close = lines.indexOf(stop, i + 3);
            check(close >= i + 3, 'section_schema_error', 'Framed section end marker is missing.', { section: title });
            addSection(title, lines.slice(i + 3, close).join('\n'));
            i = close + 1;
        }
    }
    else {
        let fence: string | undefined, current: string | undefined, buffer: string[] = [];
        const save = () => { if (current !== undefined) addSection(current, buffer.join('\n').trim()); };
        for (; i < end; i++) {
            const line = lines[i], heading = !fence ? /^## (.+)$/.exec(line) : null;
            fence = fenceToggle(line, fence);
            if (heading) {
                save();
                if (isSourcesTitle(heading[1])) { current = undefined; inSources = true; i++; break; }
                current = heading[1];
                buffer = [];
            }
            else {
                check(current !== undefined || !line.trim(), 'section_schema_error', 'Content before the first section is forbidden.', { line: i + 1 });
                if (current !== undefined) buffer.push(line);
            }
        }
        if (!inSources) save();
    }
    if (inSources)
        for (; i < end; i++) {
            if (!lines[i].trim()) continue;
            check(!lines[i].startsWith('## '), 'sources_not_last', 'Sources is the last section.', { line: i + 1 });
            sources.push(parseSource(lines[i]));
        }
    const firstRegistered = sections.find(s => s.name);
    const record: StoredRecord = { headers, sections, sources, alias: !!firstRegistered && firstRegistered.title !== firstRegistered.name };
    validateBody(record);
    return record;
}
export function validateBody(record: StoredRecord): void {
    const kind = kindOf(record), primary = primarySection(kind);
    check(substantive(sectionText(record, primary.name)), 'section_schema_error', 'The primary section is missing or empty.', { section: primary.name });
    for (const s of record.sections) check(typeof s.text === 'string' && !s.text.includes('\r'), 'section_schema_error', 'Sections use LF newlines.', { section: s.title });
    const bytes = bodyBytes(record);
    if (kind === 'archive') check(utf8Bytes(sectionText(record, 'Content')) <= LIMITS.archive_bytes, 'archive_too_large', `ARCHIVE Content exceeds ${LIMITS.archive_bytes} bytes.`, { bytes: utf8Bytes(sectionText(record, 'Content')) }, EXIT.conflict);
    else check(bytes <= LIMITS.body_bytes, 'body_too_large', `Record body exceeds ${LIMITS.body_bytes} bytes; store the original as ARCHIVE.`, { bytes }, EXIT.conflict);
    check(record.sources.length <= LIMITS.source_entries, 'sources_invalid', `At most ${LIMITS.source_entries} Sources entries.`);
    record.sources.forEach(validateSource);
    if (kind === 'archive' && typeof record.headers.content_digest === 'string')
        check(record.headers.content_digest === sha256(Buffer.from(sectionText(record, 'Content'), 'utf8')), 'archive_digest_mismatch', 'ARCHIVE content_digest differs from Content.', {}, EXIT.integrity);
}
export function bodyBytes(record: StoredRecord): number { return record.sections.reduce((sum, s) => sum + utf8Bytes(s.text), 0); }

// ---------------------------------------------------------------- quality flags
export function computeFlags(record: StoredRecord): string[] {
    const kind = kindOf(record), flags = new Set<string>();
    for (const s of spec(kind).sections) if (s.flag && !substantive(sectionText(record, s.name))) flags.add(s.flag);
    if (kind === 'archive' && !record.sources.some(x => x.relation === 'source')) flags.add('source_missing');
    if (kind === 'term' && !record.headers.project_signal) flags.add('project_signal_missing');
    if (record.headers.authorization_source === 'legacy') flags.add('authorization_unverified');
    for (const stored of (record.headers.quality_flags as string[] | undefined) ?? []) if (!STRUCTURAL_FLAGS.has(stored)) flags.add(stored);
    return [...flags].sort(compareText);
}
export const describeFlags = (codes: string[]): QualityFlag[] => codes.map(code => ({ code, message: FLAG_MESSAGES[code] ?? code }));

// ---------------------------------------------------------------- render
function orderedHeaders(record: StoredRecord): [string, HeaderValue][] {
    const kind = kindOf(record), known = headerSpecs(kind).map(s => s.key);
    return [...known.filter(k => Object.hasOwn(record.headers, k)).map(k => [k, record.headers[k]] as [string, HeaderValue]),
        ...Object.keys(record.headers).filter(k => !known.includes(k)).sort(compareText).map(k => [k, record.headers[k]] as [string, HeaderValue])];
}
function orderedSections(record: StoredRecord): Section[] {
    const kind = kindOf(record), order = spec(kind).sections.map(s => s.name);
    return [...order.flatMap(name => record.sections.filter(s => s.name === name)), ...record.sections.filter(s => !s.name)];
}
function renderWith(record: StoredRecord): string {
    const delimiter = record.headers.section_delimiter as string | undefined;
    const out = ['---', ...orderedHeaders(record).map(([k, v]) => `${k}: ${JSON.stringify(v)}`), '---', ''];
    const title = (s: Section) => s.name ? (record.alias ? spec(kindOf(record)).sections.find(x => x.name === s.name)!.alias : s.name) : s.title;
    for (const s of orderedSections(record)) {
        out.push(`## ${title(s)}`, '');
        if (delimiter) out.push(`<!-- ${delimiter} begin -->`, ...(s.text === '' ? [] : [s.text]), `<!-- ${delimiter} end -->`, '');
        else out.push(s.text, '');
    }
    if (record.sources.length) out.push(`## ${record.alias ? MODEL.sources_section.alias : MODEL.sources_section.name}`, '', ...record.sources.map(renderSource), '');
    return out.join('\n').replace(/\n*$/, '') + '\n';
}
/** Renders canonical bytes; frames sections only when plain Markdown would not round-trip. */
export function renderRecord(input: StoredRecord): string {
    const record: StoredRecord = { ...input, headers: { ...input.headers } };
    const flags = computeFlags(record);
    if (flags.length) record.headers.quality_flags = flags; else delete record.headers.quality_flags;
    delete record.headers.section_delimiter;
    validateHeaders(record.headers);
    validateBody(record);
    const shape = (r: StoredRecord) => JSON.stringify([orderedSections(r).map(s => [s.name ?? s.title, s.text]), r.sources]);
    const same = (parsed: StoredRecord) => shape(parsed) === shape(record);
    let text = renderWith(record);
    // Any parse difference of the plain form (a trimmed edge, an H2-like line, an unbalanced fence) selects framing.
    try { if (same(parseRecordText(text))) return text; }
    catch (error) { if (!(error instanceof Error && 'code' in error)) throw error; }
    let n = 1, delimiter = typeof input.headers.section_delimiter === 'string' ? input.headers.section_delimiter : `whyve-section-${n}`;
    while (record.sections.some(s => s.text.includes(delimiter))) delimiter = `whyve-section-${++n}`;
    record.headers.section_delimiter = delimiter;
    text = renderWith(record);
    check(same(parseRecordText(text)), 'render_invalid', 'Record did not round-trip after framing.', {}, EXIT.integrity);
    check(utf8Bytes(text.slice(0, text.indexOf('\n---\n') + 5)) <= LIMITS.header_bytes, 'header_too_large', `Header block exceeds ${LIMITS.header_bytes} bytes.`);
    return text;
}

// ---------------------------------------------------------------- input
function listText(items: string[]): string { return items.map(item => '- ' + item.replace(/\n/g, '\n  ')).join('\n'); }
export function bodyText(value: BodyValue, field: string): string {
    if (Array.isArray(value)) {
        check(value.every(v => typeof v === 'string' && substantive(v)), 'schema_invalid', `${field} items must be non-empty strings.`, { field });
        return listText(value.map(v => v.replace(/\r\n/g, '\n')));
    }
    check(typeof value === 'string', 'schema_invalid', `${field} must be text or a list of text.`, { field });
    const text = value.replace(/\r\n/g, '\n');
    check(!text.includes('\r'), 'schema_invalid', 'Text supports LF or CRLF newlines.', { field });
    return text;
}
export function deriveSummary(text: string, title: string): string {
    const line = text.split('\n').map(l => l.replace(/^\s*(?:[-*+]|\d+\.|#+|>)\s+/, '').trim()).find(Boolean) ?? title;
    const collapsed = line.replace(/\s+/g, ' ');
    return codepoints(collapsed) <= 280 ? collapsed : [...collapsed].slice(0, 279).join('') + '…';
}
const INPUT_FIELDS = ['kind', 'title', 'scope', 'key', 'summary', 'keywords', 'tags', 'body', 'sources', 'headers'];
export interface BuildOptions { id: string; now: string; authorization: Authorization }
export function authorizationSources(authorization: Authorization): SourceEntry[] {
    if (authorization.source === 'policy') return [{ relation: 'authorization', ref: 'policy', note: [...authorization.reason.replace(/\s+/g, ' ').trim()].slice(0, 500).join('').trim() || 'policy' }];
    return (authorization.references ?? []).map(ref => ({ relation: 'authorization', ref }));
}
export function applyBody(record: StoredRecord, kind: Kind, body: Record<string, BodyValue | null>, mode: 'create' | 'replace' | 'supplement'): void {
    const sections = spec(kind).sections, kindHeaders = spec(kind).headers.filter(h => h.class !== 'D');
    for (const [field, value] of Object.entries(body)) {
        const section = sections.find(s => s.field === field), header = kindHeaders.find(h => h.key === field);
        check(section || header, 'schema_invalid', `Unknown ${kind} body field ${field}.`, { field, allowed: [...sections.map(s => s.field), ...kindHeaders.map(h => h.key)] });
        if (header) {
            if (kind === 'term' && field === 'term' && mode !== 'create') check(value === record.headers.term, 'immutable_field', 'Changing a term requires supersede.', { field }, EXIT.conflict);
            if (mode === 'supplement') {
                // A supplement fills an absent value or extends a list; replacing or removing one is a meaning change.
                const current = record.headers[field], next = value === null ? undefined : value;
                const extends_ = Array.isArray(current) && Array.isArray(next) && current.every(item => next.includes(item));
                const later = field === 'verified_at' && typeof current === 'string' && typeof next === 'string' && Date.parse(next) >= Date.parse(current);
                check(current === undefined || JSON.stringify(current) === JSON.stringify(next) || extends_ || later, 'immutable_field', 'This kind only fills or extends this field; other changes require supersede.', { field }, EXIT.conflict);
            }
            if (value === null || (Array.isArray(value) && !value.length)) { check(header.class !== 'H', 'schema_invalid', `${field} is required.`, { field }); delete record.headers[field]; }
            else record.headers[field] = Array.isArray(value) ? value.map(v => nfc(v)) : value as string;
            continue;
        }
        const s = section!, existing = record.sections.find(x => x.name === s.name);
        const text = value === null ? '' : bodyText(value, field);
        if (existing && existing.text === text) continue; // restating a section unchanged is not a change
        if (mode === 'supplement') {
            check(s !== sections[0], 'immutable_primary', 'Primary meaning changes require supersede.', { section: s.name }, EXIT.conflict);
            check(!existing || !existing.text.trim() || text.startsWith(existing.text), 'immutable_section', 'This kind only fills an empty section or extends it; other changes require supersede.', { section: s.name }, EXIT.conflict);
        }
        if (!text.trim()) {
            check(!s.required, 'section_schema_error', `${s.name} is required.`, { section: s.name });
            record.sections = record.sections.filter(x => x.name !== s.name);
        }
        else if (existing) existing.text = text;
        else record.sections.push({ title: s.name, name: s.name, text });
    }
}
export function recordFromInput(input: RecordInput, options: BuildOptions): StoredRecord {
    check(input && typeof input === 'object' && !Array.isArray(input), 'schema_invalid', 'Record input must be an object.');
    const extra = Object.keys(input).filter(k => !INPUT_FIELDS.includes(k));
    check(!extra.length, 'schema_invalid', 'Unknown record input fields.', { fields: extra });
    check(isKind(input.kind), 'schema_invalid', 'Unknown record kind.', { kind: input.kind });
    const kind = input.kind, s = spec(kind);
    check(input.body && typeof input.body === 'object' && !Array.isArray(input.body), 'schema_invalid', 'body must be an object of kind fields.');
    const headers: Record<string, HeaderValue> = { title: typeof input.title === 'string' ? input.title.trim() : input.title as any };
    const record: StoredRecord = { headers, sections: [], sources: [], alias: false };
    applyBody(record, kind, input.body, 'create');
    const primary = sectionText(record, s.sections[0].name);
    let derived = false;
    if (input.summary === undefined) { headers.summary = deriveSummary(primary, String(input.title)); derived = true; }
    else headers.summary = typeof input.summary === 'string' ? input.summary.trim() : input.summary as any;
    headers.kind = kind;
    headers.scope = canonicalScope(input.scope);
    if (s.key === 'required') { check(typeof input.key === 'string', 'key_invalid', `${kind} records require a key.`); headers.key = canonicalKey(input.key); }
    else if (s.key === 'derived') {
        check(typeof headers.term === 'string', 'schema_invalid', 'TERM requires body.term.', { field: 'term' });
        headers.key = canonicalKey(headers.term as string);
        check(input.key === undefined || canonicalKey(input.key) === headers.key, 'key_invalid', 'TERM key is derived from term.');
    }
    else check(input.key === undefined, 'key_invalid', `${kind} records have no key.`);
    if (input.keywords?.length) headers.keywords = input.keywords;
    if (input.tags?.length) headers.tags = input.tags;
    headers.created_at = options.now;
    if (derived) headers.quality_flags = ['summary_derived'];
    headers.id = options.id;
    headers.schema = s.schema;
    headers.state = 'current';
    headers.authorization_source = options.authorization.source;
    if (kind === 'assumption') headers.assumption_status = 'unverified';
    if (kind === 'archive') headers.content_digest = sha256(Buffer.from(primary, 'utf8'));
    for (const [key, value] of Object.entries(input.headers ?? {})) {
        check(!RESERVED_KEY.test(key), 'custom_header_invalid', 'Host headers use namespace.name keys.', { key });
        headers[key] = value;
    }
    for (const entry of input.sources ?? []) {
        validateSource(entry);
        check(!MANAGED_RELATIONS.has(entry.relation), 'sources_invalid', `${entry.relation} entries are written by the core.`, { relation: entry.relation });
        record.sources.push({ ...entry });
    }
    record.sources.push(...authorizationSources(options.authorization));
    validateHeaders(headers);
    validateBody(record);
    return record;
}

// ---------------------------------------------------------------- filenames
const FORBIDDEN = /[\/\\<>:"|?*\[\]#^%\x00-\x1f\x7f\s]+/gu;
export function slug(title: string): string {
    let stem = nfc(title.trim()).replace(FORBIDDEN, '-').replace(/-{2,}/g, '-').replace(/^[-._]+|[-._]+$/g, '');
    if (!stem) stem = 'record';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem) || normalizedKey(stem).endsWith('.index')) stem += '-record';
    return stem;
}
/** Basename without collision suffix. The suffix budget keeps `-NNN.md` inside the byte limit. */
export function baseFilename(kind: Kind, title: string, createdAt: string): string {
    const prefix = spec(kind).filename === 'dated' ? createdAt.slice(0, 10) + '-' : '';
    let stem = slug(title);
    const budget = LIMITS.filename_bytes - utf8Bytes(prefix) - '.md'.length - 4;
    while (utf8Bytes(stem) > budget) stem = [...stem].slice(0, -1).join('');
    stem = stem.replace(/[-._]+$/, '') || 'record';
    return prefix + stem;
}
export function allocateFilename(stem: string, taken: (basename: string) => boolean): string {
    for (let n = 1; n < 1000; n++) {
        const name = `${stem}${n === 1 ? '' : '-' + n}.md`;
        if (!taken(normalizedKey(name))) return name;
    }
    return fail('path_exists', 'No free filename for this title.', { stem }, EXIT.conflict);
}
export { KINDS };
