import { ObjectValue } from './common';
export declare const SNAP_MAX_BYTES: number;
export declare const SNAP_CANDIDATE_MAX_BYTES: number;
export declare const SNAP_TRANSPORT_MAX_BYTES: number;
export declare const snapshotCandidate: (candidate: ObjectValue) => boolean;
/** Content is not short metadata. Retain Markdown whitespace and Unicode. */
export declare function snapshotText(value: unknown, field: string, required?: boolean): string;
export declare function snapshotList(value: unknown, field: string, minimum?: number): string[];
export declare const renderSnapshotList: (items: string[]) => string;
/** One projection for capture and the final merged update; excludes generated framing/identity. */
export declare function snapshotPayload(fm: ObjectValue, sections: Record<string, string>): ObjectValue;
export declare function validateSnapshotSize(fm: ObjectValue, sections: Record<string, string>): void;
