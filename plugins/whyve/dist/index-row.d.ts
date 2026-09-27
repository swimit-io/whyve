import type { RowFields } from './host-types';
export interface IndexRowInput extends Omit<RowFields, 'path'> {
    relativePath: string;
}
export declare function renderRow(row: IndexRowInput): string;
export interface ParsedRow {
    fields: Omit<RowFields, 'path'> & {
        relativePath: string;
    };
    rawLine: string;
}
export declare function parseRow(line: string): ParsedRow;
