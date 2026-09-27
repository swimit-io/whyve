"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANAGED_RELATIONS = exports.FLAG_MESSAGES = exports.STRUCTURAL_FLAGS = exports.isKind = exports.spec = exports.PROTOCOL_V3 = exports.LIMITS = exports.KINDS = exports.MODEL = void 0;
const model_json_1 = __importDefault(require("./model.json"));
exports.MODEL = model_json_1.default;
exports.KINDS = Object.keys(exports.MODEL.kinds);
exports.LIMITS = exports.MODEL.limits;
exports.PROTOCOL_V3 = exports.MODEL.protocol;
const spec = (kind) => exports.MODEL.kinds[kind];
exports.spec = spec;
const isKind = (value) => typeof value === 'string' && Object.hasOwn(exports.MODEL.kinds, value);
exports.isKind = isKind;
/** Structural flags recomputed on every render. Other stored flags persist until their cause is changed explicitly. */
exports.STRUCTURAL_FLAGS = new Set([...exports.KINDS.flatMap(k => (0, exports.spec)(k).sections.map(s => s.flag).filter((f) => !!f)), 'source_missing', 'project_signal_missing', 'authorization_unverified']);
exports.FLAG_MESSAGES = {
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
exports.MANAGED_RELATIONS = new Set(['supersedes', 'superseded-by', 'authorization']);
