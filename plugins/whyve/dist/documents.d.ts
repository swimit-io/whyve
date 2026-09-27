import { ObjectValue } from './common';
export type Kind = 'snapshot' | 'observation' | 'archive' | 'decision' | 'assumption' | 'term' | 'intent' | 'document';
export interface ContextDocument {
    frontmatter: ObjectValue;
    sections: Record<string, string>;
    warnings: ObjectValue[];
}
export declare const kinds: Kind[];
export declare const schemaKind: (schema: string) => string;
export declare function descriptorFor(kind: string): ObjectValue | undefined;
export declare function sectionName(schema: string, name: string): string;
export declare function sectionValue(doc: ContextDocument, name: string): string;
export declare function existingStyle(schema: string, sections: Record<string, string>, existing: Record<string, string>): Record<string, string>;
export declare function validFrontmatterValue(value: unknown, nested?: boolean): boolean;
export declare function parseFrontmatter(text: string): {
    frontmatter: ObjectValue;
    lines: string[];
    closing: number;
};
export declare function validateDescriptor(d: ObjectValue): void;
export declare function validateFrontmatter(fm: ObjectValue, descriptor?: ObjectValue): ObjectValue[];
export declare function validateLifecycle(fm: ObjectValue, state: string, descriptor?: ObjectValue): void;
export declare function parseDocument(text: string, descriptor?: ObjectValue): ContextDocument;
export declare function renderDocument(frontmatter: ObjectValue, sections: Record<string, string>, descriptor?: ObjectValue): string;
export declare function extractBlock(text: string, name: string): string[];
export declare function replaceBlock(text: string, name: string, lines: string[]): string;
export declare function readProfile(text: string): ObjectValue | undefined;
export declare const markdownEscape: (text: string) => string;
export declare const entryRow: (row: ObjectValue) => string;
export declare function parseAreaIndex(text: string, tolerant?: boolean): {
    frontmatter: ObjectValue;
    current: ObjectValue[];
    history: ObjectValue[];
    descriptor?: ObjectValue;
};
