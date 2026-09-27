"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.casefold = exports.wordCharacters = exports.nonFilename = exports.nonAlnum = exports.UNICODE_VERSION = void 0;
exports.normalize = normalize;
const unicode_15_1_json_1 = __importDefault(require("./unicode-15.1.json"));
exports.UNICODE_VERSION = unicode_15_1_json_1.default.version;
const unassigned = new RegExp(`([${unicode_15_1_json_1.default.unassigned}])`, 'u');
const folds = unicode_15_1_json_1.default.casefold;
exports.nonAlnum = new RegExp(`[^${unicode_15_1_json_1.default.alnum}]+`, 'gu');
exports.nonFilename = new RegExp(`[^${unicode_15_1_json_1.default.alnum}\\-_.]+`, 'gu');
exports.wordCharacters = unicode_15_1_json_1.default.alnum;
/** Unicode normalization is stable for assigned characters (UAX #15). Characters
 * unassigned in the Python 3.13 baseline remain unchanged, with combining class 0,
 * even when a newer Node/Electron ICU assigns them a normalization or case map. */
function normalize(value, form) {
    return value.split(unassigned).map((segment, i) => i % 2 ? segment : segment.normalize(form)).join('');
}
const casefold = (value) => [...value].map(c => folds[c] ?? c).join('');
exports.casefold = casefold;
