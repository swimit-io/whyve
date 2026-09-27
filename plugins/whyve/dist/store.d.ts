import { ObjectValue } from './common';
import type { HeaderValue, RecordInput, ListOptions, RowPage, HeaderSearchOptions, IdPage, ReadOptions, RecordRead, ComparisonReceipt, CompareRequest, ComparisonPage, SlotPage, PrepareRequest, PrepareResult, WriteReceipt, Capabilities, Status, WhyveHost, PageOptions } from './host-types';
export type ApprovalMode = 'explicit' | 'auto' | 'adaptive';
export type Feature = 'decision' | 'assumption' | 'term' | 'intent' | 'document';
export interface WhyveOptions {
    vault?: string;
    project?: string;
    lockTimeoutMs?: number;
}
export interface InitializeOptions {
    features?: Feature[];
    approvalMode?: ApprovalMode;
    host?: 'codex' | 'claude-code';
}
/** Reads only the opening header block (at most 16 KiB); record bodies are never read. */
export declare function readHeaders(root: string, relative: string): Record<string, HeaderValue>;
export declare class Whyve implements WhyveHost {
    readonly vault: string;
    readonly project: string;
    private readonly storage;
    private readonly projectStorage;
    constructor(options: WhyveOptions);
    private locked;
    private view;
    private writableView;
    private binding;
    settings(): ObjectValue;
    capabilities(): Capabilities;
    status(): Promise<Status>;
    private indexDigest;
    adoptLegacy(confirmLegacyStopped: boolean): ObjectValue;
    recoverRuntime(): Promise<ObjectValue>;
    initialize(options?: InitializeOptions): Promise<ObjectValue>;
    /** Verifies records, links, slots and indexes. With fix, regenerates indexes and the registry from records. */
    refresh(fix?: boolean): Promise<ObjectValue>;
    private selectKinds;
    private filterRows;
    private headerValues;
    list(input?: ListOptions): Promise<RowPage>;
    searchHeaders(input: HeaderSearchOptions): Promise<IdPage>;
    read(id: string, input?: ReadOptions): Promise<RecordRead>;
    private readResult;
    private candidateView;
    checkSlot(input: RecordInput, o?: PageOptions & {
        existingId?: string;
        supersedeId?: string;
    }): Promise<SlotPage>;
    /** Mandatory and optional comparison sets (docs/record-model.md; design 3.4). Meaning is judged by the caller. */
    private comparisonSet;
    compare(request: CompareRequest): Promise<ComparisonPage>;
    validateReadReceipt(receipt: ComparisonReceipt): Promise<{
        valid: boolean;
        stale: string[];
    }>;
    private checkReceiptShape;
    private findCurrent;
    private destination;
    /** Renders the frozen mutation into file changes. Deterministic for the same vault state, now and IDs. */
    private plan;
    private checkIntegrity;
    private normalize;
    private needsArchive;
    /** Returns null when writing may proceed, or the review the caller still owes. */
    private reviewGate;
    private checkAuthorization;
    private preparedPath;
    private savePrepared;
    private loadPrepared;
    private cleanupPrepared;
    prepare(request: PrepareRequest): Promise<PrepareResult>;
    private approvePrepared;
    apply(handle: string): Promise<WriteReceipt>;
}
export declare function createWhyve(options: WhyveOptions): Whyve;
