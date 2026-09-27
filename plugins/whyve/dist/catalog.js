"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROOT_INDEX = void 0;
exports.registeredAreas = registeredAreas;
exports.listArtifactPaths = listArtifactPaths;
const fs = __importStar(require("node:fs"));
const common_1 = require("./common");
const documents_1 = require("./documents");
const filesystem_1 = require("./filesystem");
exports.ROOT_INDEX = 'context/context.index.md';
function registeredAreas(root) {
    const raw = (0, filesystem_1.bytes)(root, exports.ROOT_INDEX);
    (0, common_1.check)(raw, 'context_root_missing', 'Context root index is missing.', { path: exports.ROOT_INDEX }, common_1.EXIT.notFound);
    const rootText = (0, filesystem_1.utf8)(raw), fm = (0, documents_1.parseFrontmatter)(rootText).frontmatter;
    (0, common_1.check)(fm.schema === 'context-root-index/v1' && fm.index === true, 'index_noncanonical', 'Invalid root index metadata.', {}, common_1.EXIT.integrity);
    const seen = new Set();
    return (0, documents_1.extractBlock)(rootText, 'areas').map(line => {
        const match = /<!-- context-area (\{.*\}) -->$/.exec(line);
        (0, common_1.check)(match, 'index_noncanonical', 'Invalid root catalog row.', {}, common_1.EXIT.integrity);
        const row = (0, common_1.strictJson)(match[1]);
        (0, common_1.check)(typeof row.area === 'string' && /^[a-z][a-z0-9_-]{0,79}$/.test(row.area) && row.path === `context/${row.area}/${row.area}.index.md` && !seen.has(row.area), 'index_noncanonical', 'Invalid or duplicate root area.', {}, common_1.EXIT.integrity);
        seen.add(row.area);
        const text = (0, filesystem_1.readText)(root, row.path), metadata = (0, documents_1.parseFrontmatter)(text).frontmatter, descriptor = (0, documents_1.readProfile)(text) ?? (0, documents_1.descriptorFor)(row.area);
        (0, common_1.check)(metadata.area === row.area && metadata.owner === row.owner && metadata.artifact_schema === row.artifact_schema && metadata.authority === row.authority, 'index_stale', 'Area metadata differs from root catalog.', { area: row.area }, common_1.EXIT.integrity);
        if (descriptor) {
            (0, documents_1.validateDescriptor)(descriptor);
            if (descriptor.schema === 'context-owner-descriptor/v2') {
                const profile = (0, documents_1.readProfile)(text);
                (0, common_1.check)(profile, 'owner_profile_invalid', 'Profiled owner index has no descriptor.', {}, common_1.EXIT.integrity);
                const registry = (0, documents_1.extractBlock)(rootText, 'owner-profiles').map(x => /<!-- context-owner-profile (\{.*\}) -->$/.exec(x)).map(m => m ? (0, common_1.strictJson)(m[1]) : null).find(x => x?.area === row.area);
                (0, common_1.check)(registry && registry.descriptor_digest === (0, common_1.canonicalDigest)(profile), 'owner_profile_invalid', 'Root registry and area descriptor differ.', {}, common_1.EXIT.integrity);
            }
        }
        return { row, metadata, descriptor, text };
    });
}
function listArtifactPaths(root, area, includeHistory = true) {
    const output = [];
    for (const directory of [`context/${area}`, ...(includeHistory ? [`context/${area}/retired`] : [])]) {
        const target = (0, filesystem_1.contained)(root, directory);
        if (!fs.existsSync(target))
            continue;
        for (const item of fs.readdirSync(target, { withFileTypes: true })) {
            if (!item.name.endsWith('.md') || item.name.endsWith('.index.md'))
                continue;
            (0, common_1.check)(item.isFile() && !item.isSymbolicLink(), 'path_unsafe', 'Artifacts must be regular files.', { path: directory + '/' + item.name }, common_1.EXIT.integrity);
            output.push(directory + '/' + item.name);
        }
    }
    return output.sort(common_1.compareText);
}
