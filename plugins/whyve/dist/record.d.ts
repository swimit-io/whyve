import { KINDS, SectionSpec } from './model';
import type { Kind, HeaderValue, SourceEntry, QualityFlag, RecordInput, Authorization, BodyValue } from './host-types';
/** One record in memory. `name` is the canonical section name or null for a hand-written unregistered section. */
export interface Section {
    title: string;
    name: string | null;
    text: string;
}
export interface StoredRecord {
    headers: Record<string, HeaderValue>;
    sections: Section[];
    sources: SourceEntry[];
    /** Heading style: canonical English names or the Korean aliases. */
    alias: boolean;
}
export declare const isHostKey: (key: string) => boolean;
export declare function kindOf(record: StoredRecord): Kind;
export declare function sectionSpec(kind: Kind, title: string): SectionSpec | undefined;
export declare function sectionText(record: StoredRecord, name: string): string;
export declare const primarySection: (kind: Kind) => SectionSpec;
export declare function validateHeaders(headers: Record<string, HeaderValue>): Kind;
export declare function escapeRef(value: string): string;
export declare function renderSource(entry: SourceEntry): string;
export declare function parseSource(line: string): SourceEntry;
export declare function validateSource(entry: SourceEntry): void;
export declare const sameSource: (a: SourceEntry, b: SourceEntry) => boolean;
interface HeaderBlock {
    headers: Record<string, HeaderValue>;
    lines: string[];
    closing: number;
}
export declare function parseHeaderBlock(text: string): HeaderBlock;
export declare function parseRecordText(text: string): StoredRecord;
export declare function validateBody(record: StoredRecord): void;
export declare function bodyBytes(record: StoredRecord): number;
export declare function computeFlags(record: StoredRecord): string[];
export declare const describeFlags: (codes: string[]) => QualityFlag[];
/** Renders canonical bytes; frames sections only when plain Markdown would not round-trip. */
export declare function renderRecord(input: StoredRecord): string;
export declare function bodyText(value: BodyValue, field: string): string;
export declare function deriveSummary(text: string, title: string): string;
export interface BuildOptions {
    id: string;
    now: string;
    authorization: Authorization;
}
export declare function authorizationSources(authorization: Authorization): SourceEntry[];
export declare function applyBody(record: StoredRecord, kind: Kind, body: Record<string, BodyValue | null>, mode: 'create' | 'replace' | 'supplement'): void;
export declare function recordFromInput(input: RecordInput, options: BuildOptions): StoredRecord;
export declare function slug(title: string): string;
/** Basename without collision suffix. The suffix budget keeps `-NNN.md` inside the byte limit. */
export declare function baseFilename(kind: Kind, title: string, createdAt: string): string;
export declare function allocateFilename(stem: string, taken: (basename: string) => boolean): string;
export { KINDS };
