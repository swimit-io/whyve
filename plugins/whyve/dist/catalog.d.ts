import { ObjectValue } from './common';
import { ContextDocument } from './documents';
/** Read-only v2 (context-common/v2) catalog access for compatibility reads and the explicit format migration. */
export interface Area {
    row: ObjectValue;
    metadata: ObjectValue;
    descriptor?: ObjectValue;
    text: string;
}
export interface RecordEntry {
    path: string;
    content: string;
    document: ContextDocument;
    row: ObjectValue;
    kind: string;
    area: Area;
}
export declare const ROOT_INDEX = "context/context.index.md";
export declare function registeredAreas(root: string): Area[];
export declare function listArtifactPaths(root: string, area: string, includeHistory?: boolean): string[];
