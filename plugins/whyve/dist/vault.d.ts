import { KINDS } from './model';
import { StoredRecord, computeFlags, sectionText } from './record';
import { ParsedRow } from './index-row';
import { Area as LegacyArea } from './catalog';
import { convertV2, RefHeaderPreset } from './legacy';
import type { Kind, Row, RecordState } from './host-types';
export declare const ROOT_INDEX = "context/context.index.md";
export declare const REGISTRY = ".whyve/owners/registry.json";
export declare const PROJECTIONS = ".whyve/index-projections.json";
export type Format = 'v3' | 'v2' | 'none';
export declare const areaIndexPath: (kind: Kind) => string;
export declare function detectFormat(root: string): Format;
export declare const descriptorDigest: (kind: Kind) => string;
export declare function renderRegistry(kinds: Kind[]): string;
export interface Registry {
    kinds: Kind[];
    outdated: Kind[];
    digest: string;
}
export declare function readRegistry(root: string): Registry;
export declare function readProjections(root: string): string[];
export declare function renderRoot(kinds: Kind[]): string;
export declare function rootKinds(text: string): Kind[];
export declare function emptyArea(kind: Kind): string;
export declare function parseArea(text: string, kind: Kind): {
    current: ParsedRow[];
    history: ParsedRow[];
};
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
export declare function stateOfPath(relative: string): RecordState;
export declare function listRecordPaths(root: string, kind: Kind): string[];
export declare function loadV3(relative: string, content: string, expected?: Kind): Loaded;
export declare function loadV2(relative: string, content: string, area: LegacyArea, preset?: RefHeaderPreset): Loaded & {
    notes: ReturnType<typeof convertV2>['notes'];
};
/** A row projection of a stored record, identical to its index line. */
export declare function rowOf(loaded: Loaded, projections?: string[]): Row;
/** One consistent view of a vault. v2 vaults are read through the compatibility mapping and are never written. */
export declare class VaultView {
    readonly root: string;
    readonly format: Format;
    readonly kinds: Kind[];
    readonly projections: string[];
    private readonly legacy;
    readonly registryDigest: string | null;
    readonly outdated: Kind[];
    /** `repair` reads a v3 vault whose registry or root index is damaged, using the given kinds. */
    constructor(root: string, repair?: {
        kinds: Kind[];
    });
    areaText(kind: Kind): string;
    areaDigest(kind: Kind): string | null;
    legacyArea(kind: Kind): LegacyArea;
    /** Index rows of one area. Throws index errors; callers decide tolerance. */
    rows(kind: Kind): Row[];
    load(relative: string, kind: Kind): Loaded;
    paths(kind: Kind): string[];
    /** Every record of the selected kinds, with pending changes overlaid (null deletes). */
    scan(kinds?: Kind[], overlay?: Map<string, string | null>): Loaded[];
    find(id: string, kinds?: Kind[]): Loaded;
    renderArea(kind: Kind, records: Loaded[]): string;
}
export declare function validateRelations(records: Loaded[]): void;
export interface SlotView {
    id: string;
    kind: Kind;
    scope: string;
    key: string;
    vocabulary?: string[];
}
export declare function slotView(loaded: {
    id: string;
    kind: Kind;
    record: StoredRecord;
}): SlotView;
/** The single slot rule (docs/record-model.md section 8) shared by prepare, apply and checkSlot. */
export declare function slotRelation(a: SlotView, b: SlotView): 'exact_slot' | 'scope_overlap' | 'term_overlap' | null;
/** Checks pairs that involve a changed slot. `separate` holds IDs whose scope overlap the judge found compatible. */
export declare function validateSlots(records: Loaded[], changed: Set<string>, separate?: Set<string>, ignoreOverlap?: boolean): void;
export { computeFlags, sectionText, KINDS };
