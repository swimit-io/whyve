import { ObjectValue, check, canonicalKey, canonicalScope, compareText, sha256, EXIT } from './common';
import { ContextDocument, sectionName } from './documents';
import { spec, isKind } from './model';
import { StoredRecord, Section, validateSource } from './record';
import type { Kind, HeaderValue, SourceEntry, RowFields } from './host-types';

/**
 * Reads a context-common/v2 record into the v3 model without writing. The same mapping drives read
 * compatibility and the explicit format migration. Unknown values are preserved, never guessed.
 */
export type RefHeaderPreset = 'howse' | null;
const HOWSE_REFS: Record<string, string> = { thread: 'howse.thread', run: 'howse.run', by: 'howse.author', rev: 'howse.revision', task: 'howse.task', topic: 'howse.topic', 'origin-run': 'howse.origin-run', covers: 'howse.covers', channel: 'howse.channel' };
const KNOWN_V2 = new Set(['schema', 'id', 'title', 'summary', 'created_at', 'updated_at', 'captured_from', 'source_refs', 'tags', 'search_terms', 'anchors', 'section_delimiter', 'kind_hint', 'verified_at', 'affects_paths', 'relations', 'supersedes', 'superseded_by', 'retired_at', 'retired_reason', 'retirement_note', 'scope', 'decision_key', 'intent_key', 'document_key', 'term_key', 'revisit_when', 'revisit_on', 'term', 'aliases', 'deprecated_terms', 'related', 'impacted_decisions', 'evidence_refs', 'refutation_reason', 'deprecation_reason', 'replacement_term']);
export interface LegacyNote { code: string; field?: string; detail?: string }
export interface Converted { record: StoredRecord; notes: LegacyNote[] }
const listText = (items: string[]) => items.map(item => '- ' + item.replace(/\n/g, '\n  ')).join('\n');
function unique(values: string[], field: string, notes: LegacyNote[]): string[] {
    const out = [...new Set(values)];
    if (out.length !== values.length) notes.push({ code: 'duplicate_item_removed', field });
    return out;
}
export const legacyKind = (schema: string): Kind => { const kind = /^context-(.+)\/v1$/.exec(schema)?.[1]; check(isKind(kind), 'schema_invalid', 'Unknown v2 record schema.', { schema }); return kind; };

export function convertV2(doc: ContextDocument, state: 'current' | 'history', preset: RefHeaderPreset = 'howse'): Converted {
    const fm = doc.frontmatter, kind = legacyKind(fm.schema), s = spec(kind), notes: LegacyNote[] = [], headers: Record<string, HeaderValue> = {}, sources: SourceEntry[] = [];
    const flags: string[] = [];
    headers.title = fm.title;
    headers.summary = fm.summary;
    headers.kind = kind;
    if (typeof fm.scope === 'string') headers.scope = canonicalScope(fm.scope);
    else { headers.scope = 'global'; flags.push('legacy_scope_defaulted'); }
    const keyField = { decision: 'decision_key', intent: 'intent_key', document: 'document_key', term: 'term_key' }[kind as string];
    if (keyField) headers.key = kind === 'term' ? canonicalKey(fm.term) : fm[keyField];
    if (fm.search_terms?.length) headers.keywords = unique(fm.search_terms, 'search_terms', notes);
    if (fm.tags?.length) headers.tags = unique(fm.tags, 'tags', notes);
    headers.created_at = fm.created_at;
    if (fm.updated_at) headers.updated_at = fm.updated_at;
    if (flags.length) headers.quality_flags = flags;
    headers.id = fm.id;
    headers.schema = s.schema;
    headers.state = state;
    headers.authorization_source = 'legacy';
    if (state === 'history') { headers.retired_at = fm.retired_at; headers.lifecycle_reason = fm.retired_reason; }
    if (fm.section_delimiter) headers.section_delimiter = fm.section_delimiter;
    for (const key of ['anchors', 'kind_hint', 'verified_at', 'revisit_on', 'term', 'aliases', 'deprecated_terms'])
        if (fm[key] !== undefined && (!Array.isArray(fm[key]) || fm[key].length)) headers[key] = fm[key];
    if (kind === 'assumption') headers.assumption_status = state === 'history' && ['confirmed', 'refuted'].includes(fm.retired_reason) ? fm.retired_reason : 'unverified';
    // Sections keep their text and heading style; v2 aliases resolve to the v3 canonical names.
    const sections: Section[] = [];
    let alias = false, first = true;
    for (const [title, text] of Object.entries(doc.sections)) {
        const canonical = sectionName(fm.schema, title), known = s.sections.find(x => x.name === canonical || x.alias === title);
        if (first && known) { alias = title !== known.name; first = false; }
        if (!known) notes.push({ code: 'unregistered_section_preserved', field: title });
        sections.push({ title, name: known?.name ?? null, text });
    }
    if (kind === 'decision' && fm.revisit_when?.length) {
        const existing = sections.find(x => x.name === 'Revisit conditions');
        if (!existing) sections.push({ title: 'Revisit conditions', name: 'Revisit conditions', text: listText(fm.revisit_when) });
        // v2 rendered frontmatter lists as '- item' lines without indenting continuation lines.
        else if (existing.text !== listText(fm.revisit_when) && existing.text !== fm.revisit_when.map((v: string) => '- ' + v).join('\n')) {
            notes.push({ code: 'revisit_when_differs', field: 'revisit_when' });
            for (const item of fm.revisit_when) sources.push({ relation: 'revisit-when', ref: item });
        }
    }
    if (kind === 'archive') headers.content_digest = sha256(Buffer.from(sections.find(x => x.name === 'Content')?.text ?? '', 'utf8'));
    // Relations, lifecycle links and provenance become Sources; Howse metadata becomes host headers.
    const multi: Record<string, string[]> = {};
    for (const ref of fm.source_refs ?? []) {
        const match = preset === 'howse' ? /^howse:([a-z-]+):(.*)$/.exec(ref) : null;
        if (match && HOWSE_REFS[match[1]] && match[2]) (multi[HOWSE_REFS[match[1]]] ??= []).push(match[2]);
        else {
            if (match) notes.push({ code: 'unknown_host_ref_preserved', detail: ref.slice(0, 120) });
            sources.push({ relation: 'source', ref });
        }
    }
    for (const [key, values] of Object.entries(multi)) headers[key] = values.length === 1 ? values[0] : values;
    for (const [predicate, ids] of Object.entries((fm.relations ?? {}) as Record<string, string[]>))
        for (const id of ids) sources.push({ relation: predicate, ref: id });
    for (const id of fm.supersedes ?? []) sources.push({ relation: 'supersedes', ref: id });
    if (fm.superseded_by) sources.push({ relation: 'superseded-by', ref: fm.superseded_by });
    const textSource = (relation: string, value: unknown) => { if (typeof value === 'string' && value) sources.push({ relation, ref: value.replace(/\s*\n\s*/g, ' ').trim() }); };
    // A v2 lifecycle note may exceed one Sources line (v2 allowed 800 codepoints); a long one keeps its text as a section.
    const noteOrSection = (relation: string, title: string, value: unknown) => {
        if (typeof value !== 'string' || !value) return;
        if ([...value].length <= 500 && !/[\r\n]/.test(value)) textSource(relation, value);
        else { sections.push({ title, name: null, text: value }); notes.push({ code: 'long_note_preserved_as_section', field: title }); }
    };
    noteOrSection('retirement-note', 'Retirement note', fm.retirement_note);
    noteOrSection('refutation-reason', 'Refutation reason', fm.refutation_reason);
    noteOrSection('deprecation-reason', 'Deprecation reason', fm.deprecation_reason);
    textSource('replacement-term', fm.replacement_term);
    for (const value of fm.evidence_refs ?? []) textSource('evidence', value);
    for (const value of fm.impacted_decisions ?? []) sources.push({ relation: 'impacts:decision', ref: value });
    for (const value of fm.related ?? []) textSource('related-term', value);
    for (const value of fm.affects_paths ?? []) textSource('affects-path', value);
    if (fm.captured_from) notes.push({ code: 'captured_from_dropped', detail: fm.captured_from });
    for (const key of Object.keys(fm).filter(k => !KNOWN_V2.has(k)).sort(compareText)) {
        const value = fm[key], legacyKey = `legacy.${key.replace(/_/g, '-')}`;
        headers[legacyKey] = typeof value === 'string' || (Array.isArray(value) && value.every((v: unknown) => typeof v === 'string')) ? value : JSON.stringify(value);
        notes.push({ code: 'unknown_field_preserved', field: key });
    }
    for (const entry of sources) {
        try { validateSource(entry); }
        catch (error: any) { check(false, 'migration_blocked', `A v2 value cannot be represented as a Sources line: ${error.message}`, { id: fm.id, relation: entry.relation }, EXIT.conflict); }
    }
    return { record: { headers, sections, sources, alias }, notes };
}
/** v2 area index rows as v3 list fields. rawLine keeps the stored v2 line. */
export function rowFromV2(row: ObjectValue, kind: Kind): Omit<RowFields, 'path'> & { path: string } {
    const keyField = { decision: 'decision_key', intent: 'intent_key', document: 'document_key', term: 'term_key' }[kind as string];
    return { id: row.id, path: row.path, kind, state: row.state, title: row.title, summary: row.summary, scope: typeof row.scope === 'string' ? row.scope : 'global',
        // v2 index rows merged tags and search terms; this read-only view cannot separate them without opening files.
        key: keyField && typeof row[keyField] === 'string' ? row[keyField] : '', createdAt: row.created_at, updatedAt: row.updated_at ?? '', keywords: row.terms ?? [] };
}
export { HOWSE_REFS };
