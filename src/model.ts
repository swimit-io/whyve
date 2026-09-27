import modelData from './model.json';
import type { Kind } from './host-types';

export interface HeaderSpec { key: string; type: string; values?: string[]; class: 'H' | 'S' | 'D' | 'C'; max?: number; max_items?: number; max_item_chars?: number; rule: string }
export interface SectionSpec { name: string; alias: string; field: string; required: boolean; list: boolean; flag: string | null }
export interface KindSpec {
    schema: string; authority: string; key: 'none' | 'required' | 'derived'; slot: 'none' | 'decision-overlap' | 'exact-scope-key' | 'term-overlap';
    update: 'content' | 'supplement' | 'metadata'; filename: 'dated' | 'plain'; retire: string[]; summary: string; headers: HeaderSpec[]; sections: SectionSpec[];
}
export interface RecordModel {
    schema: string; protocol: 'context-common/v3'; area_index_schema: string; root_index_schema: string;
    sources_section: { name: string; alias: string }; common: HeaderSpec[]; kinds: Record<Kind, KindSpec>; limits: Record<string, number>;
}
export const MODEL = modelData as unknown as RecordModel;
export const KINDS = Object.keys(MODEL.kinds) as Kind[];
export const LIMITS = MODEL.limits;
export const PROTOCOL_V3 = MODEL.protocol;
export const spec = (kind: Kind): KindSpec => MODEL.kinds[kind];
export const isKind = (value: unknown): value is Kind => typeof value === 'string' && Object.hasOwn(MODEL.kinds, value);
/** Structural flags recomputed on every render. Other stored flags persist until their cause is changed explicitly. */
export const STRUCTURAL_FLAGS = new Set([...KINDS.flatMap(k => spec(k).sections.map(s => s.flag).filter((f): f is string => !!f)), 'source_missing', 'project_signal_missing', 'authorization_unverified']);
export const FLAG_MESSAGES: Record<string, string> = {
    evidence_missing: 'No evidence or basis is recorded.',
    rationale_missing: 'No rationale is recorded.',
    alternatives_missing: 'No rejected alternatives are recorded.',
    success_criteria_missing: 'No success criteria are recorded.',
    source_missing: 'The archive names no original source.',
    project_signal_missing: 'The term does not state why it is project-specific.',
    authorization_unverified: 'Migrated record; the original approval was not recorded.',
    legacy_scope_defaulted: 'Migrated record without a scope; scope global was assigned.',
    summary_derived: 'The summary is a deterministic excerpt of the primary section.',
};
/** Relations written only by the core lifecycle and authorization binding. */
export const MANAGED_RELATIONS = new Set(['supersedes', 'superseded-by', 'authorization']);
