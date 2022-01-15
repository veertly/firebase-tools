"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFunctionLabel = exports.getFilterGroups = exports.functionMatchesGroup = exports.functionMatchesAnyGroup = void 0;
function functionMatchesAnyGroup(func, filterGroups) {
    if (!filterGroups.length) {
        return true;
    }
    return filterGroups.some((groupChunk) => functionMatchesGroup(func, groupChunk));
}
exports.functionMatchesAnyGroup = functionMatchesAnyGroup;
function functionMatchesGroup(func, groupChunks) {
    const functionNameChunks = func.id.split("-").slice(0, groupChunks.length);
    if (functionNameChunks.length != groupChunks.length) {
        return false;
    }
    for (let i = 0; i < groupChunks.length; i += 1) {
        if (groupChunks[i] !== functionNameChunks[i]) {
            return false;
        }
    }
    return true;
}
exports.functionMatchesGroup = functionMatchesGroup;
function getFilterGroups(options) {
    if (!options.only) {
        return [];
    }
    const only = options.only.split(",");
    const onlyFunctions = only.filter((filter) => {
        const opts = filter.split(":");
        return opts[0] == "functions" && opts[1];
    });
    return onlyFunctions.map((filter) => {
        return filter.split(":")[1].split(/[.-]/);
    });
}
exports.getFilterGroups = getFilterGroups;
function getFunctionLabel(fn) {
    return `${fn.id}(${fn.region})`;
}
exports.getFunctionLabel = getFunctionLabel;
//# sourceMappingURL=functionsDeployHelper.js.map