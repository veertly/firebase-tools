"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertKeyTypes = exports.requireKeys = void 0;
const error_1 = require("../../../../error");
function requireKeys(prefix, yaml, ...keys) {
    if (prefix) {
        prefix = prefix + ".";
    }
    for (const key of keys) {
        if (!yaml[key]) {
            throw new error_1.FirebaseError(`Expected key ${prefix + key}`);
        }
    }
}
exports.requireKeys = requireKeys;
function assertKeyTypes(prefix, yaml, schema) {
    if (!yaml) {
        return;
    }
    for (const [keyAsString, value] of Object.entries(yaml)) {
        const key = keyAsString;
        const fullKey = prefix ? prefix + "." + key : key;
        if (!schema[key] || schema[key] === "omit") {
            throw new error_1.FirebaseError(`Unexpected key ${fullKey}. You may need to install a newer version of the Firebase CLI`);
        }
        if (schema[key] === "string") {
            if (typeof value !== "string") {
                throw new error_1.FirebaseError(`Expected ${fullKey} to be string; was ${typeof value}`);
            }
        }
        else if (schema[key] === "number") {
            if (typeof value !== "number") {
                throw new error_1.FirebaseError(`Expected ${fullKey} to be a number; was ${typeof value}`);
            }
        }
        else if (schema[key] === "boolean") {
            if (typeof value !== "boolean") {
                throw new error_1.FirebaseError(`Expected ${fullKey} to be a boolean; was ${typeof value}`);
            }
        }
        else if (schema[key] === "array") {
            if (!Array.isArray(value)) {
                throw new error_1.FirebaseError(`Expected ${fullKey} to be an array; was ${typeof value}`);
            }
        }
        else if (schema[key] === "object") {
            if (value === null || typeof value !== "object" || Array.isArray(value)) {
                throw new error_1.FirebaseError(`Expected ${fullKey} to be an object; was ${typeof value}`);
            }
        }
        else {
            throw new error_1.FirebaseError("YAML validation is missing a handled type " + schema[key]);
        }
    }
}
exports.assertKeyTypes = assertKeyTypes;
//# sourceMappingURL=parsing.js.map