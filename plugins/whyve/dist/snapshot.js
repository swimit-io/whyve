"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderSnapshotList = exports.snapshotCandidate = exports.SNAP_TRANSPORT_MAX_BYTES = exports.SNAP_CANDIDATE_MAX_BYTES = exports.SNAP_MAX_BYTES = void 0;
exports.snapshotText = snapshotText;
exports.snapshotList = snapshotList;
exports.snapshotPayload = snapshotPayload;
exports.validateSnapshotSize = validateSnapshotSize;
const common_1 = require("./common");
exports.SNAP_MAX_BYTES = common_1.contracts.capabilities.snapshot.storage_limits.max_input_bytes;
exports.SNAP_CANDIDATE_MAX_BYTES = common_1.contracts.capabilities.snapshot.storage_limits.max_candidate_bytes;
exports.SNAP_TRANSPORT_MAX_BYTES = common_1.contracts.capabilities.snapshot.storage_limits.max_transport_bytes;
const snapshotCandidate = (candidate) => (0, common_1.object)(candidate) && (0, common_1.object)(candidate.owner_inputs?.snapshot) && (candidate.requested_kind === 'snapshot' || (candidate.requested_kind == null && (Array.isArray(candidate.specialized_kinds) && candidate.specialized_kinds.includes('snapshot') || candidate.fallback_kind === 'snapshot')));
exports.snapshotCandidate = snapshotCandidate;
/** Content is not short metadata. Retain Markdown whitespace and Unicode. */
function snapshotText(value, field, required = true) {
    (0, common_1.check)(typeof value === 'string' && (!required || (0, common_1.substantive)(value)), 'schema_invalid', `${field} must contain text${required ? ' that is non-empty' : ''}.`, { field });
    const text = value.replace(/\r\n/g, '\n');
    (0, common_1.check)(!text.includes('\r'), 'schema_invalid', 'SNAP content supports LF or CRLF newlines.', { field });
    return text;
}
function snapshotList(value, field, minimum = 0) {
    (0, common_1.check)(Array.isArray(value) && value.length >= minimum, 'schema_invalid', `${field} has an invalid item count.`, { field });
    return value.map(item => snapshotText(item, field));
}
const renderSnapshotList = (items) => items.map(item => '- ' + item.replace(/\n/g, '\n  ')).join('\n');
exports.renderSnapshotList = renderSnapshotList;
/** One projection for capture and the final merged update; excludes generated framing/identity. */
function snapshotPayload(fm, sections) {
    return { title: fm.title, summary: fm.summary, captured_from: fm.captured_from,
        source_refs: fm.source_refs ?? [], tags: fm.tags ?? [], search_terms: fm.search_terms ?? [], anchors: fm.anchors ?? [], sections };
}
function validateSnapshotSize(fm, sections) {
    const actual_bytes = Buffer.byteLength(JSON.stringify(snapshotPayload(fm, sections)));
    (0, common_1.check)(actual_bytes <= exports.SNAP_MAX_BYTES, 'snapshot_input_too_large', `SNAP input is ${actual_bytes} bytes; maximum is ${exports.SNAP_MAX_BYTES} bytes.`, { actual_bytes, max_bytes: exports.SNAP_MAX_BYTES, measurement: 'snapshot_payload_utf8' }, common_1.EXIT.conflict);
}
