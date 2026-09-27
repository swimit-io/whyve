"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KINDS = exports.describeFlags = exports.sameSource = exports.primarySection = exports.isHostKey = void 0;
exports.kindOf = kindOf;
exports.sectionSpec = sectionSpec;
exports.sectionText = sectionText;
exports.validateHeaders = validateHeaders;
exports.escapeRef = escapeRef;
exports.renderSource = renderSource;
exports.parseSource = parseSource;
exports.validateSource = validateSource;
exports.parseHeaderBlock = parseHeaderBlock;
exports.parseRecordText = parseRecordText;
exports.validateBody = validateBody;
exports.bodyBytes = bodyBytes;
exports.computeFlags = computeFlags;
exports.renderRecord = renderRecord;
exports.bodyText = bodyText;
exports.deriveSummary = deriveSummary;
exports.authorizationSources = authorizationSources;
exports.applyBody = applyBody;
exports.recordFromInput = recordFromInput;
exports.slug = slug;
exports.baseFilename = baseFilename;
exports.allocateFilename = allocateFilename;
const common_1 = require("./common");
const model_1 = require("./model");
Object.defineProperty(exports, "KINDS", { enumerable: true, get: function () { return model_1.KINDS; } });
const RESERVED_KEY = /^[a-z][a-z0-9_]*$/;
const HOST_KEY = /^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/;
const RELATION = /^[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)?$/;
const DELIMITER = /^[a-z][a-z0-9]*-(?:snap|section)-[1-9][0-9]{0,5}$/;
const isHostKey = (key) => HOST_KEY.test(key) && key.length <= 80;
exports.isHostKey = isHostKey;
const utf8Bytes = (text) => Buffer.byteLength(text, 'utf8');
const oneLine = (value) => !/[\r\n]/.test(value);
function kindOf(record) { const kind = record.headers.kind; (0, common_1.check)((0, model_1.isKind)(kind), 'schema_invalid', 'Record kind is invalid.'); return kind; }
function headerSpecs(kind) { return [...model_1.MODEL.common, ...(0, model_1.spec)(kind).headers]; }
function sectionSpec(kind, title) { return (0, model_1.spec)(kind).sections.find(s => s.name === title || s.alias === title); }
function sectionText(record, name) { return record.sections.find(s => s.name === name)?.text ?? ''; }
const primarySection = (kind) => (0, model_1.spec)(kind).sections[0];
exports.primarySection = primarySection;
const substantive = (value) => !!value.trim() && !['...', 'TODO', 'TBD', 'N/A', '해당 없음'].includes(value.trim());
// ---------------------------------------------------------------- header values
function validateValue(kind, s, value, headers) {
    const field = s.key, fail_ = (message) => (0, common_1.fail)('schema_invalid', `${field}: ${message}`, { field });
    if (s.type === 'string_list' || s.type === 'id_list') {
        if (!Array.isArray(value) || !value.every(v => typeof v === 'string'))
            fail_('must be a list of strings.');
        const list = value, maxItems = s.max_items ?? s.max ?? 12;
        if (list.length > maxItems)
            fail_(`at most ${maxItems} items.`);
        if (new Set(list).size !== list.length)
            fail_('items must be unique.');
        for (const item of list) {
            if (s.type === 'id_list')
                (0, common_1.requireId)(item, field);
            else if (!substantive(item) || !oneLine(item) || (0, common_1.codepoints)(item) > (s.max_item_chars ?? 500))
                fail_(`items must be non-empty single lines of at most ${s.max_item_chars} codepoints.`);
        }
        return;
    }
    if (typeof value !== 'string')
        fail_('must be a string.');
    const text = value;
    switch (s.type) {
        case 'string':
        case 'delimiter':
            if (!oneLine(text) || !substantive(text) || (s.max !== undefined && (0, common_1.codepoints)(text) > s.max))
                fail_(`must be one non-empty line of at most ${s.max} codepoints.`);
            if (s.type === 'delimiter' && !DELIMITER.test(text))
                fail_('invalid section delimiter.');
            return;
        case 'kind':
            if (!(0, model_1.isKind)(text))
                fail_('unknown kind.');
            return;
        case 'scope':
            (0, common_1.check)((0, common_1.canonicalScope)(text) === text, 'slot_invalid', 'Stored scope must be canonical.', { field });
            return;
        case 'key':
            (0, common_1.check)((0, common_1.canonicalKey)(text) === text, 'slot_invalid', 'Stored key must be canonical.', { field });
            return;
        case 'timestamp':
            (0, common_1.timestamp)(text);
            return;
        case 'date':
            (0, common_1.date)(text);
            return;
        case 'id':
            (0, common_1.requireId)(text, field);
            return;
        case 'digest':
            if (!/^sha256:[0-9a-f]{64}$/.test(text))
                fail_('invalid digest.');
            return;
        case 'schema':
            if (!kind || text !== (0, model_1.spec)(kind).schema)
                fail_('schema differs from kind.');
            return;
        case 'state':
            if (!['current', 'history'].includes(text))
                fail_('state must be current or history.');
            return;
        case 'authorization':
            if (!['user', 'policy', 'legacy'].includes(text))
                fail_('invalid authorization source.');
            return;
        case 'reason':
            if (!kind || !(0, model_1.spec)(kind).retire.includes(text))
                fail_(`not a ${kind} lifecycle reason.`);
            return;
        case 'enum':
            if (!s.values.includes(text))
                fail_(`must be one of ${s.values.join(', ')}.`);
            return;
    }
    fail_(`unsupported type ${s.type}.`);
}
function validateHostHeaders(headers) {
    const keys = Object.keys(headers).filter(k => !RESERVED_KEY.test(k));
    (0, common_1.check)(keys.length <= model_1.LIMITS.custom_header_keys, 'custom_header_invalid', `At most ${model_1.LIMITS.custom_header_keys} host headers.`, {}, common_1.EXIT.usage);
    let total = 0;
    for (const key of keys) {
        (0, common_1.check)((0, exports.isHostKey)(key), 'custom_header_invalid', 'Host headers use namespace.name with [a-z][a-z0-9_-]* parts, at most 80 characters.', { key });
        (0, common_1.check)(!key.startsWith('whyve.'), 'custom_header_invalid', 'The whyve. namespace is reserved.', { key });
        const value = headers[key], list = Array.isArray(value) ? value : [value];
        (0, common_1.check)(list.every(v => typeof v === 'string' && oneLine(v) && utf8Bytes(v) <= model_1.LIMITS.custom_value_bytes) && (!Array.isArray(value) || value.length <= model_1.LIMITS.custom_list_items), 'custom_header_invalid', `Host header values are single-line strings of at most ${model_1.LIMITS.custom_value_bytes} bytes; lists hold at most ${model_1.LIMITS.custom_list_items} items.`, { key });
        total += utf8Bytes(`${key}: ${JSON.stringify(value)}\n`);
    }
    (0, common_1.check)(total <= model_1.LIMITS.custom_header_bytes, 'custom_header_invalid', `Host headers exceed ${model_1.LIMITS.custom_header_bytes} bytes.`, { bytes: total });
}
function validateHeaders(headers) {
    const kind = headers.kind;
    (0, common_1.check)((0, model_1.isKind)(kind), 'schema_invalid', 'Header kind is missing or unknown.', { field: 'kind' });
    const specs = headerSpecs(kind), known = new Set(specs.map(s => s.key));
    for (const key of Object.keys(headers))
        (0, common_1.check)(known.has(key) || !RESERVED_KEY.test(key), 'header_unknown', `Header ${key} is not part of ${kind} records; host data uses namespace.name keys.`, { key });
    const history = headers.state === 'history', keyRule = (0, model_1.spec)(kind).key, lifecycle = ['retired_at', 'lifecycle_reason'];
    for (const s of specs) {
        const present = Object.hasOwn(headers, s.key);
        // Stored files always carry a summary; the core derives one when the input omits it.
        const required = s.class === 'H' || s.key === 'summary' || (s.key === 'key' && keyRule !== 'none') || (lifecycle.includes(s.key) && history);
        const forbidden = (s.key === 'key' && keyRule === 'none') || (lifecycle.includes(s.key) && !history);
        if (required)
            (0, common_1.check)(present, 'schema_invalid', `Required header ${s.key} is missing.`, { missing: [s.key] });
        if (forbidden)
            (0, common_1.check)(!present, 'lifecycle_invalid', `${s.key} is not allowed on this ${kind} record.`, { field: s.key }, common_1.EXIT.conflict);
        if (present)
            validateValue(kind, s, headers[s.key], headers);
    }
    if (kind === 'term') {
        (0, common_1.check)(headers.key === (0, common_1.canonicalKey)(headers.term), 'slot_invalid', 'TERM key must be derived from term.');
        const vocabulary = [headers.term, ...(headers.aliases ?? []), ...(headers.deprecated_terms ?? [])].map(common_1.canonicalKey);
        (0, common_1.check)(new Set(vocabulary).size === vocabulary.length, 'term_overlap', 'Term vocabulary must have disjoint canonical keys.', {}, common_1.EXIT.conflict);
    }
    const created = Date.parse(headers.created_at);
    for (const key of ['updated_at', 'retired_at', 'verified_at'])
        if (typeof headers[key] === 'string')
            (0, common_1.check)(Date.parse(headers[key]) >= created, 'clock_invalid', `${key} cannot precede created_at.`, {}, common_1.EXIT.conflict);
    validateHostHeaders(headers);
    return kind;
}
// ---------------------------------------------------------------- sources
function escapeRef(value) { return value.replace(/\\/g, '\\\\').replace(/—/g, '\\—'); }
function renderSource(entry) {
    return `- ${entry.relation}: ${escapeRef(entry.ref)}${entry.note !== undefined ? ' — ' + entry.note.replace(/\\/g, '\\\\') : ''}`;
}
function parseSource(line) {
    const match = /^- ([a-z][a-z0-9_:-]*): (.*)$/.exec(line);
    (0, common_1.check)(match, 'sources_invalid', 'A Sources line is `- relation: ref` with an optional ` — note`.', { line: line.slice(0, 200) });
    const [, relation, rest] = match;
    let ref = '', note, i = 0;
    for (; i < rest.length; i++) {
        const c = rest[i];
        if (c === '\\') {
            (0, common_1.check)(i + 1 < rest.length, 'sources_invalid', 'Dangling escape in a Sources ref.');
            ref += rest[++i];
            continue;
        }
        if (c === '—' && rest[i - 1] === ' ' && rest[i + 1] === ' ') {
            ref = ref.slice(0, -1);
            note = rest.slice(i + 2).replace(/\\\\/g, '\\');
            break;
        }
        ref += c;
    }
    const entry = { relation, ref, ...(note !== undefined ? { note } : {}) };
    validateSource(entry);
    return entry;
}
function validateSource(entry) {
    (0, common_1.check)(entry && typeof entry === 'object' && typeof entry.relation === 'string' && RELATION.test(entry.relation) && entry.relation.length <= 80, 'sources_invalid', 'Source relation must be [a-z][a-z0-9_-]* with an optional :kind suffix.', { relation: entry?.relation });
    (0, common_1.check)(typeof entry.ref === 'string' && entry.ref.trim() === entry.ref && entry.ref.length > 0 && oneLine(entry.ref) && (0, common_1.codepoints)(entry.ref) <= model_1.LIMITS.source_ref_codepoints, 'sources_invalid', `Source refs are non-empty trimmed single lines of at most ${model_1.LIMITS.source_ref_codepoints} codepoints.`, { relation: entry.relation });
    (0, common_1.check)(entry.note === undefined || (typeof entry.note === 'string' && entry.note.length > 0 && entry.note.trim() === entry.note && oneLine(entry.note) && (0, common_1.codepoints)(entry.note) <= model_1.LIMITS.source_note_codepoints), 'sources_invalid', `Source notes are trimmed single lines of at most ${model_1.LIMITS.source_note_codepoints} codepoints.`, { relation: entry.relation });
    const extra = Object.keys(entry).filter(k => !['relation', 'ref', 'note'].includes(k));
    (0, common_1.check)(!extra.length, 'sources_invalid', 'Source entries have relation, ref and note only.', { fields: extra });
    const typed = entry.relation.split(':')[1];
    if (typed)
        (0, common_1.check)((0, model_1.isKind)(typed), 'sources_invalid', 'Typed relation suffix must be a record kind.', { relation: entry.relation });
    if (['supersedes', 'superseded-by'].includes(entry.relation) || typed)
        (0, common_1.requireId)(entry.ref, entry.relation);
}
const sameSource = (a, b) => a.relation === b.relation && a.ref === b.ref && (a.note ?? null) === (b.note ?? null);
exports.sameSource = sameSource;
function parseHeaderBlock(text) {
    (0, common_1.check)(!text.startsWith('﻿'), 'header_invalid', 'UTF-8 BOM is not supported.');
    (0, common_1.check)(!text.includes('\r'), 'header_invalid', 'Stored records use LF newlines.');
    const lines = text.split('\n'), closing = lines.indexOf('---', 1);
    (0, common_1.check)(lines[0] === '---' && closing > 0, 'header_invalid', 'Header delimiters are required.');
    (0, common_1.check)(utf8Bytes(lines.slice(0, closing + 1).join('\n') + '\n') <= model_1.LIMITS.header_bytes, 'header_too_large', `Header block exceeds ${model_1.LIMITS.header_bytes} bytes.`);
    const headers = {};
    for (const line of lines.slice(1, closing)) {
        const split = line.indexOf(': '), key = line.slice(0, split), raw = line.slice(split + 2);
        (0, common_1.check)(split > 0 && (RESERVED_KEY.test(key) || (0, exports.isHostKey)(key)) && !Object.hasOwn(headers, key), 'header_invalid', 'Invalid or duplicate header key.', { key: key.slice(0, 100) });
        let value;
        try {
            value = JSON.parse(raw);
        }
        catch {
            (0, common_1.fail)('header_invalid', 'Header value must be compact JSON.', { key });
        }
        (0, common_1.check)((typeof value === 'string' || (Array.isArray(value) && value.every(v => typeof v === 'string'))) && JSON.stringify(value) === raw, 'header_invalid', 'Header values are compact JSON strings or string arrays.', { key });
        Object.defineProperty(headers, key, { value, enumerable: true, writable: true, configurable: true });
    }
    return { headers, lines, closing };
}
function fenceToggle(line, fence) {
    const f = /^\s*(```+|~~~+)/.exec(line)?.[1][0];
    return f ? (fence === f ? undefined : fence ?? f) : fence;
}
function isSourcesTitle(title) { return title === model_1.MODEL.sources_section.name || title === model_1.MODEL.sources_section.alias; }
function parseRecordText(text) {
    const { headers, lines, closing } = parseHeaderBlock(text), kind = validateHeaders(headers);
    (0, common_1.check)(lines[closing + 1] === '' && lines.at(-1) === '', 'section_schema_error', 'A blank line follows the header and the file ends with a newline.');
    const sections = [], sources = [], delimiter = headers.section_delimiter;
    let i = closing + 2, inSources = false;
    const addSection = (title, body) => {
        const s = sectionSpec(kind, title);
        (0, common_1.check)(!sections.some(x => x.title === title || (s && x.name === s.name)), 'section_schema_error', 'Duplicate section.', { section: title });
        sections.push({ title, name: s?.name ?? null, text: body });
    };
    const end = lines.length - 1;
    if (delimiter) {
        const begin = `<!-- ${delimiter} begin -->`, stop = `<!-- ${delimiter} end -->`;
        while (i < end) {
            if (lines[i] === '') {
                i++;
                continue;
            }
            const title = /^## (.+)$/.exec(lines[i])?.[1];
            (0, common_1.check)(title, 'section_schema_error', 'Framed records contain only framed sections and Sources.', { line: i + 1 });
            if (isSourcesTitle(title)) {
                inSources = true;
                i++;
                break;
            }
            (0, common_1.check)(lines[i + 1] === '' && lines[i + 2] === begin, 'section_schema_error', 'Framed section begin marker is missing.', { section: title });
            const close = lines.indexOf(stop, i + 3);
            (0, common_1.check)(close >= i + 3, 'section_schema_error', 'Framed section end marker is missing.', { section: title });
            addSection(title, lines.slice(i + 3, close).join('\n'));
            i = close + 1;
        }
    }
    else {
        let fence, current, buffer = [];
        const save = () => { if (current !== undefined)
            addSection(current, buffer.join('\n').trim()); };
        for (; i < end; i++) {
            const line = lines[i], heading = !fence ? /^## (.+)$/.exec(line) : null;
            fence = fenceToggle(line, fence);
            if (heading) {
                save();
                if (isSourcesTitle(heading[1])) {
                    current = undefined;
                    inSources = true;
                    i++;
                    break;
                }
                current = heading[1];
                buffer = [];
            }
            else {
                (0, common_1.check)(current !== undefined || !line.trim(), 'section_schema_error', 'Content before the first section is forbidden.', { line: i + 1 });
                if (current !== undefined)
                    buffer.push(line);
            }
        }
        if (!inSources)
            save();
    }
    if (inSources)
        for (; i < end; i++) {
            if (!lines[i].trim())
                continue;
            (0, common_1.check)(!lines[i].startsWith('## '), 'sources_not_last', 'Sources is the last section.', { line: i + 1 });
            sources.push(parseSource(lines[i]));
        }
    const firstRegistered = sections.find(s => s.name);
    const record = { headers, sections, sources, alias: !!firstRegistered && firstRegistered.title !== firstRegistered.name };
    validateBody(record);
    return record;
}
function validateBody(record) {
    const kind = kindOf(record), primary = (0, exports.primarySection)(kind);
    (0, common_1.check)(substantive(sectionText(record, primary.name)), 'section_schema_error', 'The primary section is missing or empty.', { section: primary.name });
    for (const s of record.sections)
        (0, common_1.check)(typeof s.text === 'string' && !s.text.includes('\r'), 'section_schema_error', 'Sections use LF newlines.', { section: s.title });
    const bytes = bodyBytes(record);
    if (kind === 'archive')
        (0, common_1.check)(utf8Bytes(sectionText(record, 'Content')) <= model_1.LIMITS.archive_bytes, 'archive_too_large', `ARCHIVE Content exceeds ${model_1.LIMITS.archive_bytes} bytes.`, { bytes: utf8Bytes(sectionText(record, 'Content')) }, common_1.EXIT.conflict);
    else
        (0, common_1.check)(bytes <= model_1.LIMITS.body_bytes, 'body_too_large', `Record body exceeds ${model_1.LIMITS.body_bytes} bytes; store the original as ARCHIVE.`, { bytes }, common_1.EXIT.conflict);
    (0, common_1.check)(record.sources.length <= model_1.LIMITS.source_entries, 'sources_invalid', `At most ${model_1.LIMITS.source_entries} Sources entries.`);
    record.sources.forEach(validateSource);
    if (kind === 'archive' && typeof record.headers.content_digest === 'string')
        (0, common_1.check)(record.headers.content_digest === (0, common_1.sha256)(Buffer.from(sectionText(record, 'Content'), 'utf8')), 'archive_digest_mismatch', 'ARCHIVE content_digest differs from Content.', {}, common_1.EXIT.integrity);
}
function bodyBytes(record) { return record.sections.reduce((sum, s) => sum + utf8Bytes(s.text), 0); }
// ---------------------------------------------------------------- quality flags
function computeFlags(record) {
    const kind = kindOf(record), flags = new Set();
    for (const s of (0, model_1.spec)(kind).sections)
        if (s.flag && !substantive(sectionText(record, s.name)))
            flags.add(s.flag);
    if (kind === 'archive' && !record.sources.some(x => x.relation === 'source'))
        flags.add('source_missing');
    if (kind === 'term' && !record.headers.project_signal)
        flags.add('project_signal_missing');
    if (record.headers.authorization_source === 'legacy')
        flags.add('authorization_unverified');
    for (const stored of record.headers.quality_flags ?? [])
        if (!model_1.STRUCTURAL_FLAGS.has(stored))
            flags.add(stored);
    return [...flags].sort(common_1.compareText);
}
const describeFlags = (codes) => codes.map(code => ({ code, message: model_1.FLAG_MESSAGES[code] ?? code }));
exports.describeFlags = describeFlags;
// ---------------------------------------------------------------- render
function orderedHeaders(record) {
    const kind = kindOf(record), known = headerSpecs(kind).map(s => s.key);
    return [...known.filter(k => Object.hasOwn(record.headers, k)).map(k => [k, record.headers[k]]),
        ...Object.keys(record.headers).filter(k => !known.includes(k)).sort(common_1.compareText).map(k => [k, record.headers[k]])];
}
function orderedSections(record) {
    const kind = kindOf(record), order = (0, model_1.spec)(kind).sections.map(s => s.name);
    return [...order.flatMap(name => record.sections.filter(s => s.name === name)), ...record.sections.filter(s => !s.name)];
}
function renderWith(record) {
    const delimiter = record.headers.section_delimiter;
    const out = ['---', ...orderedHeaders(record).map(([k, v]) => `${k}: ${JSON.stringify(v)}`), '---', ''];
    const title = (s) => s.name ? (record.alias ? (0, model_1.spec)(kindOf(record)).sections.find(x => x.name === s.name).alias : s.name) : s.title;
    for (const s of orderedSections(record)) {
        out.push(`## ${title(s)}`, '');
        if (delimiter)
            out.push(`<!-- ${delimiter} begin -->`, ...(s.text === '' ? [] : [s.text]), `<!-- ${delimiter} end -->`, '');
        else
            out.push(s.text, '');
    }
    if (record.sources.length)
        out.push(`## ${record.alias ? model_1.MODEL.sources_section.alias : model_1.MODEL.sources_section.name}`, '', ...record.sources.map(renderSource), '');
    return out.join('\n').replace(/\n*$/, '') + '\n';
}
/** Renders canonical bytes; frames sections only when plain Markdown would not round-trip. */
function renderRecord(input) {
    const record = { ...input, headers: { ...input.headers } };
    const flags = computeFlags(record);
    if (flags.length)
        record.headers.quality_flags = flags;
    else
        delete record.headers.quality_flags;
    delete record.headers.section_delimiter;
    validateHeaders(record.headers);
    validateBody(record);
    const shape = (r) => JSON.stringify([orderedSections(r).map(s => [s.name ?? s.title, s.text]), r.sources]);
    const same = (parsed) => shape(parsed) === shape(record);
    let text = renderWith(record);
    // Any parse difference of the plain form (a trimmed edge, an H2-like line, an unbalanced fence) selects framing.
    try {
        if (same(parseRecordText(text)))
            return text;
    }
    catch (error) {
        if (!(error instanceof Error && 'code' in error))
            throw error;
    }
    let n = 1, delimiter = typeof input.headers.section_delimiter === 'string' ? input.headers.section_delimiter : `whyve-section-${n}`;
    while (record.sections.some(s => s.text.includes(delimiter)))
        delimiter = `whyve-section-${++n}`;
    record.headers.section_delimiter = delimiter;
    text = renderWith(record);
    (0, common_1.check)(same(parseRecordText(text)), 'render_invalid', 'Record did not round-trip after framing.', {}, common_1.EXIT.integrity);
    (0, common_1.check)(utf8Bytes(text.slice(0, text.indexOf('\n---\n') + 5)) <= model_1.LIMITS.header_bytes, 'header_too_large', `Header block exceeds ${model_1.LIMITS.header_bytes} bytes.`);
    return text;
}
// ---------------------------------------------------------------- input
function listText(items) { return items.map(item => '- ' + item.replace(/\n/g, '\n  ')).join('\n'); }
function bodyText(value, field) {
    if (Array.isArray(value)) {
        (0, common_1.check)(value.every(v => typeof v === 'string' && substantive(v)), 'schema_invalid', `${field} items must be non-empty strings.`, { field });
        return listText(value.map(v => v.replace(/\r\n/g, '\n')));
    }
    (0, common_1.check)(typeof value === 'string', 'schema_invalid', `${field} must be text or a list of text.`, { field });
    const text = value.replace(/\r\n/g, '\n');
    (0, common_1.check)(!text.includes('\r'), 'schema_invalid', 'Text supports LF or CRLF newlines.', { field });
    return text;
}
function deriveSummary(text, title) {
    const line = text.split('\n').map(l => l.replace(/^\s*(?:[-*+]|\d+\.|#+|>)\s+/, '').trim()).find(Boolean) ?? title;
    const collapsed = line.replace(/\s+/g, ' ');
    return (0, common_1.codepoints)(collapsed) <= 280 ? collapsed : [...collapsed].slice(0, 279).join('') + '…';
}
const INPUT_FIELDS = ['kind', 'title', 'scope', 'key', 'summary', 'keywords', 'tags', 'body', 'sources', 'headers'];
function authorizationSources(authorization) {
    if (authorization.source === 'policy')
        return [{ relation: 'authorization', ref: 'policy', note: [...authorization.reason.replace(/\s+/g, ' ').trim()].slice(0, 500).join('').trim() || 'policy' }];
    return (authorization.references ?? []).map(ref => ({ relation: 'authorization', ref }));
}
function applyBody(record, kind, body, mode) {
    const sections = (0, model_1.spec)(kind).sections, kindHeaders = (0, model_1.spec)(kind).headers.filter(h => h.class !== 'D');
    for (const [field, value] of Object.entries(body)) {
        const section = sections.find(s => s.field === field), header = kindHeaders.find(h => h.key === field);
        (0, common_1.check)(section || header, 'schema_invalid', `Unknown ${kind} body field ${field}.`, { field, allowed: [...sections.map(s => s.field), ...kindHeaders.map(h => h.key)] });
        if (header) {
            if (kind === 'term' && field === 'term' && mode !== 'create')
                (0, common_1.check)(value === record.headers.term, 'immutable_field', 'Changing a term requires supersede.', { field }, common_1.EXIT.conflict);
            if (mode === 'supplement') {
                // A supplement fills an absent value or extends a list; replacing or removing one is a meaning change.
                const current = record.headers[field], next = value === null ? undefined : value;
                const extends_ = Array.isArray(current) && Array.isArray(next) && current.every(item => next.includes(item));
                const later = field === 'verified_at' && typeof current === 'string' && typeof next === 'string' && Date.parse(next) >= Date.parse(current);
                (0, common_1.check)(current === undefined || JSON.stringify(current) === JSON.stringify(next) || extends_ || later, 'immutable_field', 'This kind only fills or extends this field; other changes require supersede.', { field }, common_1.EXIT.conflict);
            }
            if (value === null || (Array.isArray(value) && !value.length)) {
                (0, common_1.check)(header.class !== 'H', 'schema_invalid', `${field} is required.`, { field });
                delete record.headers[field];
            }
            else
                record.headers[field] = Array.isArray(value) ? value.map(v => (0, common_1.nfc)(v)) : value;
            continue;
        }
        const s = section, existing = record.sections.find(x => x.name === s.name);
        const text = value === null ? '' : bodyText(value, field);
        if (existing && existing.text === text)
            continue; // restating a section unchanged is not a change
        if (mode === 'supplement') {
            (0, common_1.check)(s !== sections[0], 'immutable_primary', 'Primary meaning changes require supersede.', { section: s.name }, common_1.EXIT.conflict);
            (0, common_1.check)(!existing || !existing.text.trim() || text.startsWith(existing.text), 'immutable_section', 'This kind only fills an empty section or extends it; other changes require supersede.', { section: s.name }, common_1.EXIT.conflict);
        }
        if (!text.trim()) {
            (0, common_1.check)(!s.required, 'section_schema_error', `${s.name} is required.`, { section: s.name });
            record.sections = record.sections.filter(x => x.name !== s.name);
        }
        else if (existing)
            existing.text = text;
        else
            record.sections.push({ title: s.name, name: s.name, text });
    }
}
function recordFromInput(input, options) {
    (0, common_1.check)(input && typeof input === 'object' && !Array.isArray(input), 'schema_invalid', 'Record input must be an object.');
    const extra = Object.keys(input).filter(k => !INPUT_FIELDS.includes(k));
    (0, common_1.check)(!extra.length, 'schema_invalid', 'Unknown record input fields.', { fields: extra });
    (0, common_1.check)((0, model_1.isKind)(input.kind), 'schema_invalid', 'Unknown record kind.', { kind: input.kind });
    const kind = input.kind, s = (0, model_1.spec)(kind);
    (0, common_1.check)(input.body && typeof input.body === 'object' && !Array.isArray(input.body), 'schema_invalid', 'body must be an object of kind fields.');
    const headers = { title: typeof input.title === 'string' ? input.title.trim() : input.title };
    const record = { headers, sections: [], sources: [], alias: false };
    applyBody(record, kind, input.body, 'create');
    const primary = sectionText(record, s.sections[0].name);
    let derived = false;
    if (input.summary === undefined) {
        headers.summary = deriveSummary(primary, String(input.title));
        derived = true;
    }
    else
        headers.summary = typeof input.summary === 'string' ? input.summary.trim() : input.summary;
    headers.kind = kind;
    headers.scope = (0, common_1.canonicalScope)(input.scope);
    if (s.key === 'required') {
        (0, common_1.check)(typeof input.key === 'string', 'key_invalid', `${kind} records require a key.`);
        headers.key = (0, common_1.canonicalKey)(input.key);
    }
    else if (s.key === 'derived') {
        (0, common_1.check)(typeof headers.term === 'string', 'schema_invalid', 'TERM requires body.term.', { field: 'term' });
        headers.key = (0, common_1.canonicalKey)(headers.term);
        (0, common_1.check)(input.key === undefined || (0, common_1.canonicalKey)(input.key) === headers.key, 'key_invalid', 'TERM key is derived from term.');
    }
    else
        (0, common_1.check)(input.key === undefined, 'key_invalid', `${kind} records have no key.`);
    if (input.keywords?.length)
        headers.keywords = input.keywords;
    if (input.tags?.length)
        headers.tags = input.tags;
    headers.created_at = options.now;
    if (derived)
        headers.quality_flags = ['summary_derived'];
    headers.id = options.id;
    headers.schema = s.schema;
    headers.state = 'current';
    headers.authorization_source = options.authorization.source;
    if (kind === 'assumption')
        headers.assumption_status = 'unverified';
    if (kind === 'archive')
        headers.content_digest = (0, common_1.sha256)(Buffer.from(primary, 'utf8'));
    for (const [key, value] of Object.entries(input.headers ?? {})) {
        (0, common_1.check)(!RESERVED_KEY.test(key), 'custom_header_invalid', 'Host headers use namespace.name keys.', { key });
        headers[key] = value;
    }
    for (const entry of input.sources ?? []) {
        validateSource(entry);
        (0, common_1.check)(!model_1.MANAGED_RELATIONS.has(entry.relation), 'sources_invalid', `${entry.relation} entries are written by the core.`, { relation: entry.relation });
        record.sources.push({ ...entry });
    }
    record.sources.push(...authorizationSources(options.authorization));
    validateHeaders(headers);
    validateBody(record);
    return record;
}
// ---------------------------------------------------------------- filenames
const FORBIDDEN = /[\/\\<>:"|?*\[\]#^%\x00-\x1f\x7f\s]+/gu;
function slug(title) {
    let stem = (0, common_1.nfc)(title.trim()).replace(FORBIDDEN, '-').replace(/-{2,}/g, '-').replace(/^[-._]+|[-._]+$/g, '');
    if (!stem)
        stem = 'record';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem) || (0, common_1.normalizedKey)(stem).endsWith('.index'))
        stem += '-record';
    return stem;
}
/** Basename without collision suffix. The suffix budget keeps `-NNN.md` inside the byte limit. */
function baseFilename(kind, title, createdAt) {
    const prefix = (0, model_1.spec)(kind).filename === 'dated' ? createdAt.slice(0, 10) + '-' : '';
    let stem = slug(title);
    const budget = model_1.LIMITS.filename_bytes - utf8Bytes(prefix) - '.md'.length - 4;
    while (utf8Bytes(stem) > budget)
        stem = [...stem].slice(0, -1).join('');
    stem = stem.replace(/[-._]+$/, '') || 'record';
    return prefix + stem;
}
function allocateFilename(stem, taken) {
    for (let n = 1; n < 1000; n++) {
        const name = `${stem}${n === 1 ? '' : '-' + n}.md`;
        if (!taken((0, common_1.normalizedKey)(name)))
            return name;
    }
    return (0, common_1.fail)('path_exists', 'No free filename for this title.', { stem }, common_1.EXIT.conflict);
}
