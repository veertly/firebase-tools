"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatServiceAccount = exports.getInvokerMembers = exports.fieldMasks = exports.renameIfPresent = exports.copyIfPresent = exports.assertOneOf = exports.durationFromSeconds = exports.secondsFromDuration = void 0;
const error_1 = require("../error");
function secondsFromDuration(d) {
    return +d.slice(0, d.length - 1);
}
exports.secondsFromDuration = secondsFromDuration;
function durationFromSeconds(s) {
    return `${s}s`;
}
exports.durationFromSeconds = durationFromSeconds;
function assertOneOf(typename, obj, oneof, ...fields) {
    const defined = [];
    for (const key of fields) {
        const value = obj[key];
        if (typeof value !== "undefined" && value != null) {
            defined.push(key);
        }
    }
    if (defined.length > 1) {
        throw new error_1.FirebaseError(`Invalid ${typename} definition. ${oneof} can only have one field defined, but found ${defined.join(",")}`);
    }
}
exports.assertOneOf = assertOneOf;
function copyIfPresent(dest, src, ...fields) {
    for (const field of fields) {
        if (!Object.prototype.hasOwnProperty.call(src, field)) {
            continue;
        }
        dest[field] = src[field];
    }
}
exports.copyIfPresent = copyIfPresent;
function renameIfPresent(dest, src, destField, srcField, converter = (from) => {
    return from;
}) {
    if (!Object.prototype.hasOwnProperty.call(src, srcField)) {
        return;
    }
    dest[destField] = converter(src[srcField]);
}
exports.renameIfPresent = renameIfPresent;
function fieldMasks(object, ...doNotRecurseIn) {
    const masks = [];
    fieldMasksHelper([], object, doNotRecurseIn, masks);
    return masks;
}
exports.fieldMasks = fieldMasks;
function fieldMasksHelper(prefixes, cursor, doNotRecurseIn, masks) {
    if (typeof cursor !== "object" || Array.isArray(cursor) || cursor === null) {
        masks.push(prefixes.join("."));
        return;
    }
    const entries = Object.entries(cursor);
    if (entries.length === 0) {
        masks.push(prefixes.join("."));
        return;
    }
    for (const [key, value] of entries) {
        const newPrefixes = [...prefixes, key];
        if (doNotRecurseIn.includes(newPrefixes.join("."))) {
            masks.push(newPrefixes.join("."));
            continue;
        }
        fieldMasksHelper(newPrefixes, value, doNotRecurseIn, masks);
    }
}
function getInvokerMembers(invoker, projectId) {
    if (invoker.includes("private")) {
        return [];
    }
    if (invoker.includes("public")) {
        return ["allUsers"];
    }
    return invoker.map((inv) => formatServiceAccount(inv, projectId));
}
exports.getInvokerMembers = getInvokerMembers;
function formatServiceAccount(serviceAccount, projectId) {
    if (serviceAccount.length === 0) {
        throw new error_1.FirebaseError("Service account cannot be an empty string");
    }
    if (!serviceAccount.includes("@")) {
        throw new error_1.FirebaseError("Service account must be of the form 'service-account@' or 'service-account@{project-id}.iam.gserviceaccount.com'");
    }
    if (serviceAccount.endsWith("@")) {
        const suffix = `${projectId}.iam.gserviceaccount.com`;
        return `serviceAccount:${serviceAccount}${suffix}`;
    }
    return `serviceAccount:${serviceAccount}`;
}
exports.formatServiceAccount = formatServiceAccount;
//# sourceMappingURL=proto.js.map