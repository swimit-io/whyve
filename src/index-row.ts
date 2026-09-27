import { check, EXIT, requireId } from './common';
import { isKind } from './model';
import type { HeaderValue, RowFields, Kind, RecordState } from './host-types';

/** docs/record-model.md section 9. The row is the single stored projection; rawLine and fields come from the same line. */
const escapeLabel = (v: string) => v.replace(/[\\\[\]]/g, '\\$&');
const escapeSummary = (v: string) => v.replace(/[\\·]/g, '\\$&');
const escapeValue = (v: string) => v.replace(/[\\·;=,]/g, '\\$&');
const encodePath = (v: string) => v.replace(/[% ()]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
const TAIL = ['id', 'kind', 'state', 'scope', 'key', 'created', 'updated', 'keywords'] as const;
export interface IndexRowInput extends Omit<RowFields, 'path'> { relativePath: string }

export function renderRow(row: IndexRowInput): string {
    const tail: [string, string][] = [['id', row.id], ['kind', row.kind], ['state', row.state], ['scope', row.scope], ['key', row.key], ['created', row.createdAt], ['updated', row.updatedAt], ['keywords', row.keywords.map(escapeValue).join(',')]];
    const values = tail.map(([k, v]) => `${k}=${k === 'keywords' ? v : escapeValue(v)}`);
    for (const [key, value] of Object.entries(row.projections ?? {}).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
        values.push(`header.${key}=${(Array.isArray(value) ? value : [value]).map(escapeValue).join(',')}`);
    return `- [${escapeLabel(row.title)}](${encodePath(row.relativePath)}) · ${escapeSummary(row.summary)} · ${values.join('; ')}`;
}
/** Splits on unescaped separators and unescapes each part. */
function split(text: string, separator: string): string[] {
    const parts: string[] = [];
    let current = '';
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '\\') { check(i + 1 < text.length, 'index_row_invalid', 'Dangling escape in an index row.', {}, EXIT.integrity); current += text[i] + text[++i]; continue; }
        if (text.startsWith(separator, i)) { parts.push(current); current = ''; i += separator.length - 1; continue; }
        current += text[i];
    }
    parts.push(current);
    return parts;
}
const unescape = (v: string) => v.replace(/\\(.)/g, '$1');
export interface ParsedRow { fields: Omit<RowFields, 'path'> & { relativePath: string }; rawLine: string }
export function parseRow(line: string): ParsedRow {
    const invalid = (reason: string): never => check(false, 'index_row_invalid', `Malformed index row: ${reason}.`, { line: line.slice(0, 200) }, EXIT.integrity) as never;
    if (!line.startsWith('- [')) invalid('expected "- [title](path)"');
    let i = 3, title = '';
    for (; i < line.length && line[i] !== ']'; i++) {
        if (line[i] === '\\') { title += line[++i] ?? ''; continue; }
        if (line[i] === '[') invalid('unescaped [ in title');
        title += line[i];
    }
    if (line[i] !== ']' || line[i + 1] !== '(') invalid('missing path');
    const close = line.indexOf(')', i + 2);
    if (close < 0) invalid('unterminated path');
    let relativePath: string;
    try { relativePath = decodeURIComponent(line.slice(i + 2, close)); } catch { return invalid('bad percent-encoding'); }
    if (!/^(?:retired\/)?[^/\\]+\.md$/.test(relativePath) || relativePath.split('/').some(p => p === '.' || p === '..')) invalid('path escapes its area');
    const rest = line.slice(close + 1);
    if (!rest.startsWith(' · ')) invalid('missing summary separator');
    const columns = split(rest.slice(3), ' · ');
    if (columns.length !== 2) invalid('expected summary and fields');
    const summary = unescape(columns[0]), values = new Map<string, string>(), projections: Record<string, string[]> = {};
    for (const part of split(columns[1], '; ')) {
        const eq = part.indexOf('=');
        if (eq <= 0) invalid('field without =');
        const key = part.slice(0, eq), raw = part.slice(eq + 1);
        // Projections are always lists: one index cell cannot tell a one-item list from a string.
        if (key.startsWith('header.')) { projections[key.slice(7)] = raw === '' ? [] : split(raw, ',').map(unescape); continue; }
        if (values.has(key) || !(TAIL as readonly string[]).includes(key)) invalid(`unexpected field ${key}`);
        values.set(key, key === 'keywords' ? raw : unescape(raw));
    }
    if ([...values.keys()].join() !== TAIL.join()) invalid('fields out of order or missing');
    const id = values.get('id')!, kind = values.get('kind')!, state = values.get('state')!;
    requireId(id);
    if (!isKind(kind) || !['current', 'history'].includes(state)) invalid('kind or state');
    if ((state === 'history') !== relativePath.startsWith('retired/')) invalid('state differs from path');
    const keywordsRaw = values.get('keywords')!;
    return {
        rawLine: line,
        fields: { id, relativePath, kind: kind as Kind, state: state as RecordState, title, summary, scope: values.get('scope')!, key: values.get('key')!, createdAt: values.get('created')!, updatedAt: values.get('updated')!,
            keywords: keywordsRaw === '' ? [] : split(keywordsRaw, ',').map(unescape), ...(Object.keys(projections).length ? { projections } : {}) },
    };
}
