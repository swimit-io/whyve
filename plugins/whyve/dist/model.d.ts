import type { Kind } from './host-types';
export interface HeaderSpec {
    key: string;
    type: string;
    values?: string[];
    class: 'H' | 'S' | 'D' | 'C';
    max?: number;
    max_items?: number;
    max_item_chars?: number;
    rule: string;
}
export interface SectionSpec {
    name: string;
    alias: string;
    field: string;
    required: boolean;
    list: boolean;
    flag: string | null;
}
export interface KindSpec {
    schema: string;
    authority: string;
    key: 'none' | 'required' | 'derived';
    slot: 'none' | 'decision-overlap' | 'exact-scope-key' | 'term-overlap';
    update: 'content' | 'supplement' | 'metadata';
    filename: 'dated' | 'plain';
    retire: string[];
    summary: string;
    headers: HeaderSpec[];
    sections: SectionSpec[];
}
export interface RecordModel {
    schema: string;
    protocol: 'context-common/v3';
    area_index_schema: string;
    root_index_schema: string;
    sources_section: {
        name: string;
        alias: string;
    };
    common: HeaderSpec[];
    kinds: Record<Kind, KindSpec>;
    limits: Record<string, number>;
}
export declare const MODEL: RecordModel;
export declare const KINDS: Kind[];
export declare const LIMITS: Record<string, number>;
export declare const PROTOCOL_V3: "context-common/v3";
export declare const spec: (kind: Kind) => KindSpec;
export declare const isKind: (value: unknown) => value is Kind;
/** Structural flags recomputed on every render. Other stored flags persist until their cause is changed explicitly. */
export declare const STRUCTURAL_FLAGS: Set<string>;
export declare const FLAG_MESSAGES: Record<string, string>;
/** Relations written only by the core lifecycle and authorization binding. */
export declare const MANAGED_RELATIONS: Set<string>;
