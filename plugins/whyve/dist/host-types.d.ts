/**
 * Public host contract of Whyve 0.3 (`context-common/v3`). Apps and the CLI use these types.
 * The core supplies structure, filters, pages, coverage, integrity and frozen writes.
 * Meaning (same/separate/conflict/replace) is judged by the caller from delivered bodies.
 */
export type Kind = 'snapshot' | 'observation' | 'decision' | 'intent' | 'document' | 'assumption' | 'term' | 'archive';
export type RecordState = 'current' | 'history';
export type HeaderValue = string | string[];
export type Digest = string;
export type Cursor = string;
export type VaultFormat = 'context-common/v3' | 'context-common/v2' | 'uninitialized';
export interface SourceEntry {
    /** `[a-z][a-z0-9_-]*` with an optional `:kind` suffix, e.g. `source`, `authorization`, `serves:intent`. */
    relation: string;
    ref: string;
    note?: string;
}
export interface QualityFlag {
    code: string;
    field?: string;
    message: string;
}
export type UserAuthorization = {
    source: 'user';
    references?: string[];
    meaning?: string;
};
export type PolicyAuthorization = {
    source: 'policy';
    decision: 'record' | 'ask';
    reason: string;
};
export type Authorization = UserAuthorization | PolicyAuthorization;
/** Body fields are the `field` names of docs/record-model.md section 6 plus kind headers of section 5. */
export type BodyValue = string | string[];
export type KindBody = Record<string, BodyValue>;
export interface RecordInput {
    kind: Kind;
    title: string;
    scope: string;
    key?: string;
    summary?: string;
    keywords?: string[];
    tags?: string[];
    body: KindBody;
    sources?: SourceEntry[];
    /** Host namespace headers such as `howse.thread`. Omitted keys are absent. */
    headers?: Record<string, HeaderValue>;
}
export interface RecordPatch {
    title?: string;
    summary?: string;
    keywords?: string[];
    tags?: string[];
    /** Section fields to set; `null` removes an optional section. SNAP/DOCUMENT replace; other kinds supplement. */
    body?: Record<string, BodyValue | null>;
    /** With `replaceBody`, omitted optional sections are removed (full SNAP update). */
    replaceBody?: boolean;
    sources?: {
        add?: SourceEntry[];
        remove?: SourceEntry[];
    } | {
        replace: SourceEntry[];
    };
    headers?: {
        set?: Record<string, HeaderValue>;
        unset?: string[];
    };
}
export type Mutation = {
    action: 'capture';
    record: RecordInput;
    id?: string;
} | {
    action: 'update';
    id: string;
    expectedDigest: Digest;
    patch: RecordPatch;
} | {
    action: 'supersede';
    id: string;
    expectedDigest: Digest;
    successor: RecordInput;
    reason: string;
    successorId?: string;
} | {
    action: 'retire';
    id: string;
    expectedDigest: Digest;
    reason: string;
    note?: string;
    sources?: SourceEntry[];
} | {
    action: 'discard';
    id: string;
    expectedDigest: Digest;
} | {
    action: 'rename';
    id: string;
    expectedDigest: Digest;
    title?: string;
};
export interface PageOptions {
    limit?: number;
    cursor?: Cursor;
}
export interface ScopeFilter {
    value: string;
    match?: 'exact' | 'ancestor' | 'descendant' | 'overlap';
}
export interface TimeRange {
    from?: string;
    to?: string;
}
export interface HeaderCondition {
    key: string;
    op: 'eq' | 'contains' | 'regex';
    value: string;
    /** Only `i` for regex. */
    flags?: string;
}
export interface ListFilters {
    kinds?: Kind[];
    state?: RecordState | 'all';
    scope?: ScopeFilter;
    key?: string;
    created?: TimeRange;
    updated?: TimeRange;
    keywords?: {
        values: string[];
        match?: 'all' | 'any';
    };
    ids?: string[];
    /** Exact substring of title or summary. Not tokenized, not ranked. */
    textContains?: string;
    headers?: {
        conditions: HeaderCondition[];
        match?: 'all' | 'any';
    };
}
export interface ListOptions extends ListFilters, PageOptions {
    order?: 'default' | 'recent';
    /** Tolerant listing skips an invalid area index and reports partial coverage. */
    strictIndex?: boolean;
}
export interface RowFields {
    id: string;
    path: string;
    kind: Kind;
    state: RecordState;
    title: string;
    summary: string;
    scope: string;
    key: string;
    createdAt: string;
    updatedAt: string;
    keywords: string[];
    /** Opt-in projections only: `header.<namespace.name>`, always as a list of the header's values. */
    projections?: Record<string, string[]>;
}
export interface Row {
    fields: RowFields;
    rawLine: string;
}
export interface Coverage {
    requestedFilters: string[];
    queriedKinds: Kind[];
    unqueried: {
        kind: string;
        reason: 'not_requested' | 'feature_disabled' | 'area_unavailable' | 'index_invalid';
    }[];
    total: number | null;
    returned: number;
    preceding: number;
    remaining: number | null;
    indexStatus: 'valid' | 'partial';
    diskConsistency: 'unchecked' | 'verified';
    headerScan?: {
        scanned: number;
        errors: number;
    };
    complete: boolean;
}
export interface RowPage {
    schema: 'whyve-list/v3';
    items: Row[];
    coverage: Coverage;
    indexDigest: Digest;
    selectionDigest: Digest;
    nextCursor: Cursor | null;
    warnings: {
        code: string;
        kind?: string;
        id?: string;
    }[];
}
export interface HeaderSearchOptions extends ListFilters, PageOptions {
    headers: {
        conditions: HeaderCondition[];
        match?: 'all' | 'any';
    };
    /** Return values of these header keys (`namespace.*` selects a namespace) for matched records. */
    select?: string[];
}
export interface IdPage {
    schema: 'whyve-header-search/v1';
    ids: string[];
    matches: {
        id: string;
        path: string;
        headers?: Record<string, HeaderValue>;
    }[];
    errors: {
        id: string;
        path: string;
        code: string;
    }[];
    scanned: number;
    unscanned: number;
    matchCount: number;
    selectionDigest: Digest;
    nextCursor: Cursor | null;
    complete: boolean;
}
export interface ReadOptions {
    sections?: string[];
    maxBytes?: number;
    cursor?: Cursor;
    /** Include the raw Markdown of the file. */
    raw?: boolean;
}
export interface RecordRead {
    schema: 'whyve-record/v3';
    format: 'context-common/v3' | 'context-common/v2';
    id: string;
    kind: Kind;
    path: string;
    state: RecordState;
    title: string;
    summary: string;
    scope: string;
    key: string;
    keywords: string[];
    tags: string[];
    createdAt: string;
    updatedAt: string;
    authorizationSource: 'user' | 'policy' | 'legacy';
    qualityFlags: QualityFlag[];
    /** Every stored header, reserved and host namespaced. */
    headers: Record<string, HeaderValue>;
    sections: Record<string, string>;
    sources: SourceEntry[];
    authority: string;
    doNotFollow: boolean;
    lifecycle: {
        retiredAt: string;
        reason: string;
        successor: string | null;
        predecessors: string[];
    } | null;
    /** SHA-256 of the full file bytes. A partial page carries it for concurrency, not as proof of a full read. */
    contentDigest: Digest;
    delivered: {
        sections: string[];
        bytes: number;
        partial?: {
            section: string;
            fromByte: number;
            toByte: number;
            totalBytes: number;
        };
    };
    complete: boolean;
    nextCursor: Cursor | null;
    raw?: string;
}
export interface ReadReference {
    id: string;
    path: string;
    sha256: Digest;
}
/** Comparison inputs delivered to the judge, bound as read preconditions of a later prepare. */
export interface ComparisonReceipt {
    schema: 'whyve-comparison-receipt/v1';
    vault: Digest;
    request: Digest;
    /** Records whose complete bodies were delivered. */
    reads: ReadReference[];
    /** Index, registry and configuration files that selected the mandatory set. */
    preconditions: {
        path: string;
        sha256: Digest | null;
    }[];
    mandatory: string[];
    complete: boolean;
}
export interface CompareRequest extends PageOptions {
    record: RecordInput;
    action?: 'capture' | 'supersede' | 'update';
    /** Predecessor for supersede, target for update. */
    targetId?: string;
    /** Optional expansion beyond the mandatory set; never slot occupancy. */
    expand?: {
        sameScope?: boolean;
        crossKindKey?: boolean;
        ids?: string[];
    };
    maxBytes?: number;
}
export type CompareReason = 'target' | 'exact_slot' | 'scope_overlap' | 'term_overlap' | 'same_key' | 'referenced' | 'same_scope' | 'cross_kind_key' | 'requested';
export interface ComparisonItem {
    row: Row;
    reasons: CompareReason[];
    mandatory: boolean;
    occupiesSlot: boolean;
    sections: Record<string, string> | null;
    bodyComplete: boolean;
    /** Always null: a body larger than the page budget is continued with read(id), whose contentDigest joins the receipt. */
    readCursor: Cursor | null;
    contentDigest: Digest;
}
export interface ComparisonPage {
    schema: 'whyve-comparison/v3';
    items: ComparisonItem[];
    receipt: ComparisonReceipt;
    coverage: {
        mandatoryTotal: number;
        mandatoryDelivered: number;
        expansionTotal: number;
        expansionDelivered: number;
        remaining: number;
        complete: boolean;
    };
    nextCursor: Cursor | null;
}
export type Judgment = 'same' | 'separate' | 'support' | 'conflict' | 'replace' | 'unclear';
export interface SemanticReview {
    judgments: {
        id: string;
        judgment: Judgment;
        reason: string;
    }[];
}
export interface SlotOccupant {
    row: Row;
    reason: 'exact_slot' | 'scope_overlap' | 'term_overlap';
    replaced: boolean;
    blocking: boolean;
}
export interface SlotPage {
    schema: 'whyve-slot/v3';
    kind: Kind;
    rule: 'decision-overlap' | 'exact-scope-key' | 'term-overlap' | 'none';
    occupied: boolean;
    blocking: boolean;
    occupants: SlotOccupant[];
    total: number;
    nextCursor: Cursor | null;
}
export interface PreviewFile {
    path: string;
    beforeDigest: Digest | null;
    afterDigest: Digest | null;
    content: string | null;
}
export interface Prepared {
    status: 'prepared';
    handle: string;
    action: Mutation['action'];
    recordId: string;
    preview: {
        files: PreviewFile[];
    };
    qualityFlags: QualityFlag[];
}
export interface NeedsApproval {
    status: 'needs_approval';
    handle: string;
    action: Mutation['action'];
    recordId: string;
    preview: {
        files: PreviewFile[];
    };
    qualityFlags: QualityFlag[];
    reason: string;
}
export interface NeedsReview {
    status: 'needs_review';
    reason: 'comparison_required' | 'comparison_incomplete' | 'judgment_required' | 'semantic_conflict' | 'predecessor_not_replaced';
    remaining: string[];
    judgments?: {
        id: string;
        judgment: Judgment;
    }[];
    message: string;
}
export interface NeedsArchive {
    status: 'needs_archive';
    bodyBytes: number;
    maxBytes: number;
    message: string;
    /** Suggested ARCHIVE chunk boundaries (UTF-8 byte offsets) when the original exceeds one ARCHIVE. */
    chunks: {
        index: number;
        fromByte: number;
        toByte: number;
        sha256: Digest;
    }[];
    sha256: Digest;
}
export type PrepareResult = Prepared | NeedsApproval | NeedsReview | NeedsArchive;
export type PrepareRequest = {
    mutation: Mutation;
    authorization: Authorization;
    comparison?: ComparisonReceipt;
    semanticReview?: SemanticReview;
} | {
    preparedHandle: string;
    authorization: Authorization;
};
export interface WriteReceipt {
    status: 'applied' | 'already_applied';
    handle: string;
    recordId: string;
    changedPaths: string[];
    qualityFlags: QualityFlag[];
    indexDigest: Digest;
    authorization: Authorization & {
        mode: 'explicit' | 'auto' | 'adaptive';
    };
}
export interface Capabilities {
    schema: 'whyve-capabilities/v3';
    version: string;
    protocol: 'context-common/v3';
    kinds: Record<Kind, unknown>;
    limits: Record<string, number>;
    regex: {
        syntax: 're2-subset';
        flags: ['i'];
        maxBytes: number;
        unsupported: string[];
    };
    methods: string[];
}
export interface Status {
    format: VaultFormat;
    writable: boolean;
    indexDigest: Digest | null;
    vault: string;
    project: string;
    mode: 'explicit' | 'auto' | 'adaptive';
    enabled: Kind[] | null;
    registered: Kind[];
    version: string;
}
export interface WhyveHost {
    capabilities(): Capabilities;
    status(): Promise<Status>;
    list(options?: ListOptions): Promise<RowPage>;
    searchHeaders(options: HeaderSearchOptions): Promise<IdPage>;
    read(id: string, options?: ReadOptions): Promise<RecordRead>;
    checkSlot(record: RecordInput, options?: PageOptions & {
        existingId?: string;
        supersedeId?: string;
    }): Promise<SlotPage>;
    validateReadReceipt(receipt: ComparisonReceipt): Promise<{
        valid: boolean;
        stale: string[];
    }>;
    compare(request: CompareRequest): Promise<ComparisonPage>;
    prepare(request: PrepareRequest): Promise<PrepareResult>;
    apply(handle: string): Promise<WriteReceipt>;
}
