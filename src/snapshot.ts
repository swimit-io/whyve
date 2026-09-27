import { ObjectValue, contracts, object, check, substantive, EXIT } from './common';

export const SNAP_MAX_BYTES: number = contracts.capabilities.snapshot.storage_limits.max_input_bytes;
export const SNAP_CANDIDATE_MAX_BYTES: number = contracts.capabilities.snapshot.storage_limits.max_candidate_bytes;
export const SNAP_TRANSPORT_MAX_BYTES: number = contracts.capabilities.snapshot.storage_limits.max_transport_bytes;
export const snapshotCandidate = (candidate: ObjectValue): boolean => object(candidate) && object(candidate.owner_inputs?.snapshot) && (candidate.requested_kind === 'snapshot' || (candidate.requested_kind == null && (Array.isArray(candidate.specialized_kinds) && candidate.specialized_kinds.includes('snapshot') || candidate.fallback_kind === 'snapshot')));

/** Content is not short metadata. Retain Markdown whitespace and Unicode. */
export function snapshotText(value: unknown, field: string, required = true): string {
    check(typeof value === 'string' && (!required || substantive(value)), 'schema_invalid', `${field} must contain text${required ? ' that is non-empty' : ''}.`, { field });
    const text = value.replace(/\r\n/g, '\n');
    check(!text.includes('\r'), 'schema_invalid', 'SNAP content supports LF or CRLF newlines.', { field });
    return text;
}
export function snapshotList(value: unknown, field: string, minimum = 0): string[] {
    check(Array.isArray(value) && value.length >= minimum, 'schema_invalid', `${field} has an invalid item count.`, { field });
    return value.map(item => snapshotText(item, field));
}
export const renderSnapshotList = (items: string[]): string => items.map(item => '- ' + item.replace(/\n/g, '\n  ')).join('\n');

/** One projection for capture and the final merged update; excludes generated framing/identity. */
export function snapshotPayload(fm: ObjectValue, sections: Record<string, string>): ObjectValue {
    return { title: fm.title, summary: fm.summary, captured_from: fm.captured_from,
        source_refs: fm.source_refs ?? [], tags: fm.tags ?? [], search_terms: fm.search_terms ?? [], anchors: fm.anchors ?? [], sections };
}
export function validateSnapshotSize(fm: ObjectValue, sections: Record<string, string>): void {
    const actual_bytes = Buffer.byteLength(JSON.stringify(snapshotPayload(fm, sections)));
    check(actual_bytes <= SNAP_MAX_BYTES, 'snapshot_input_too_large', `SNAP input is ${actual_bytes} bytes; maximum is ${SNAP_MAX_BYTES} bytes.`,
        { actual_bytes, max_bytes: SNAP_MAX_BYTES, measurement: 'snapshot_payload_utf8' }, EXIT.conflict);
}
