"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletesSummary = exports.configuresSummary = exports.updatesSummary = exports.createsSummary = exports.humanReadable = void 0;
const clc = require("cli-color");
const refs = require("../../extensions/refs");
const humanReadable = (dep) => `${clc.bold(dep.instanceId)} (${dep.ref ? `${refs.toExtensionVersionRef(dep.ref)}` : `Installed from local source`})`;
exports.humanReadable = humanReadable;
const humanReadableUpdate = (from, to) => {
    var _a, _b, _c, _d, _e;
    if (((_a = from.ref) === null || _a === void 0 ? void 0 : _a.publisherId) == ((_b = to.ref) === null || _b === void 0 ? void 0 : _b.publisherId) &&
        ((_c = from.ref) === null || _c === void 0 ? void 0 : _c.extensionId) == ((_d = to.ref) === null || _d === void 0 ? void 0 : _d.extensionId)) {
        return `\t${clc.bold(from.instanceId)} (${refs.toExtensionVersionRef(from.ref)} => ${(_e = to.ref) === null || _e === void 0 ? void 0 : _e.version})`;
    }
    else {
        const fromRef = from.ref
            ? `${refs.toExtensionVersionRef(from.ref)}`
            : `Installed from local source`;
        return `\t${clc.bold(from.instanceId)} (${fromRef} => ${refs.toExtensionVersionRef(to.ref)})`;
    }
};
function createsSummary(toCreate) {
    const instancesToCreate = toCreate.map((s) => `\t${(0, exports.humanReadable)(s)}`).join("\n");
    return toCreate.length
        ? `The following extension instances will be created:\n${instancesToCreate}\n`
        : "";
}
exports.createsSummary = createsSummary;
function updatesSummary(toUpdate, have) {
    const instancesToUpdate = toUpdate
        .map((to) => {
        const from = have.find((exists) => exists.instanceId == to.instanceId);
        return humanReadableUpdate(from, to);
    })
        .join("\n");
    return toUpdate.length
        ? `The following extension instances will be updated:\n${instancesToUpdate}\n`
        : "";
}
exports.updatesSummary = updatesSummary;
function configuresSummary(toConfigure) {
    const instancesToConfigure = toConfigure.map((s) => `\t${(0, exports.humanReadable)(s)}`).join("\n");
    return toConfigure.length
        ? `The following extension instances will be configured:\n${instancesToConfigure}\n`
        : "";
}
exports.configuresSummary = configuresSummary;
function deletesSummary(toDelete) {
    const instancesToDelete = toDelete.map((s) => `\t${(0, exports.humanReadable)(s)}`).join("\n");
    return toDelete.length
        ? `The following extension instances are not listed in 'firebase.json':\n${instancesToDelete}\n`
        : "";
}
exports.deletesSummary = deletesSummary;
//# sourceMappingURL=deploymentSummary.js.map