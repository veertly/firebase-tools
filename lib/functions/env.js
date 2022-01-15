"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadFirebaseEnvs = exports.loadUserEnvs = exports.hasUserEnvs = exports.validateKey = exports.KeyValidationError = exports.parse = void 0;
const clc = require("cli-color");
const fs = require("fs");
const path = require("path");
const error_1 = require("../error");
const logger_1 = require("../logger");
const previews_1 = require("../previews");
const utils_1 = require("../utils");
const FUNCTIONS_EMULATOR_DOTENV = ".env.local";
const RESERVED_KEYS = [
    "FIREBASE_CONFIG",
    "CLOUD_RUNTIME_CONFIG",
    "ENTRY_POINT",
    "GCP_PROJECT",
    "GCLOUD_PROJECT",
    "GOOGLE_CLOUD_PROJECT",
    "FUNCTION_TRIGGER_TYPE",
    "FUNCTION_NAME",
    "FUNCTION_MEMORY_MB",
    "FUNCTION_TIMEOUT_SEC",
    "FUNCTION_IDENTITY",
    "FUNCTION_REGION",
    "FUNCTION_TARGET",
    "FUNCTION_SIGNATURE_TYPE",
    "K_SERVICE",
    "K_REVISION",
    "PORT",
    "K_CONFIGURATION",
];
const LINE_RE = new RegExp("^" +
    "\\s*" +
    "(\\w+)" +
    "\\s*=[\\f\\t\\v]*" +
    "(" +
    "\\s*'(?:\\\\'|[^'])*'|" +
    '\\s*"(?:\\\\"|[^"])*"|' +
    "[^#\\r\\n]*" +
    ")?" +
    "\\s*" +
    "(?:#[^\\n]*)?" +
    "$", "gms");
function parse(data) {
    const envs = {};
    const errors = [];
    data = data.replace(/\r\n?/, "\n");
    let match;
    while ((match = LINE_RE.exec(data))) {
        let [, k, v] = match;
        v = (v || "").trim();
        let quotesMatch;
        if ((quotesMatch = /^(["'])(.*)\1$/ms.exec(v)) != null) {
            v = quotesMatch[2];
            if (quotesMatch[1] === '"') {
                v = v.replace("\\n", "\n").replace("\\r", "\r").replace("\\t", "\t").replace("\\v", "\v");
                v = v.replace(/\\([\\'"])/g, "$1");
            }
        }
        envs[k] = v;
    }
    const nonmatches = data.replace(LINE_RE, "");
    for (let line of nonmatches.split(/[\r\n]+/)) {
        line = line.trim();
        if (line.startsWith("#")) {
            continue;
        }
        if (line.length)
            errors.push(line);
    }
    return { envs, errors };
}
exports.parse = parse;
class KeyValidationError extends Error {
    constructor(key, message) {
        super(`Failed to validate key ${key}: ${message}`);
        this.key = key;
        this.message = message;
    }
}
exports.KeyValidationError = KeyValidationError;
function validateKey(key) {
    if (RESERVED_KEYS.includes(key)) {
        throw new KeyValidationError(key, `Key ${key} is reserved for internal use.`);
    }
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
        throw new KeyValidationError(key, `Key ${key} must start with an uppercase ASCII letter or underscore` +
            ", and then consist of uppercase ASCII letters, digits, and underscores.");
    }
    if (key.startsWith("X_GOOGLE_") || key.startsWith("FIREBASE_")) {
        throw new KeyValidationError(key, `Key ${key} starts with a reserved prefix (X_GOOGLE_ or FIREBASE_)`);
    }
}
exports.validateKey = validateKey;
function parseStrict(data) {
    const { envs, errors } = parse(data);
    if (errors.length) {
        throw new error_1.FirebaseError(`Invalid dotenv file, error on lines: ${errors.join(",")}`);
    }
    const validationErrors = [];
    for (const key of Object.keys(envs)) {
        try {
            validateKey(key);
        }
        catch (err) {
            logger_1.logger.debug(`Failed to validate key ${key}: ${err}`);
            if (err instanceof KeyValidationError) {
                validationErrors.push(err);
            }
            else {
                throw err;
            }
        }
    }
    if (validationErrors.length > 0) {
        throw new error_1.FirebaseError("Validation failed", { children: validationErrors });
    }
    return envs;
}
function findEnvfiles(functionsSource, projectId, projectAlias, isEmulator) {
    const files = [".env"];
    if (isEmulator) {
        files.push(FUNCTIONS_EMULATOR_DOTENV);
    }
    else {
        files.push(`.env.${projectId}`);
        if (projectAlias && projectAlias.length) {
            files.push(`.env.${projectAlias}`);
        }
    }
    return files
        .map((f) => path.join(functionsSource, f))
        .filter(fs.existsSync)
        .map((p) => path.basename(p));
}
function hasUserEnvs({ functionsSource, projectId, projectAlias, isEmulator, }) {
    return findEnvfiles(functionsSource, projectId, projectAlias, isEmulator).length > 0;
}
exports.hasUserEnvs = hasUserEnvs;
function loadUserEnvs({ functionsSource, projectId, projectAlias, isEmulator, }) {
    var _a;
    if (!previews_1.previews.dotenv) {
        return {};
    }
    const envFiles = findEnvfiles(functionsSource, projectId, projectAlias, isEmulator);
    if (envFiles.length == 0) {
        return {};
    }
    if (projectAlias) {
        if (envFiles.includes(`.env.${projectId}`) && envFiles.includes(`.env.${projectAlias}`)) {
            throw new error_1.FirebaseError(`Can't have both dotenv files with projectId (env.${projectId}) ` +
                `and projectAlias (.env.${projectAlias}) as extensions.`);
        }
    }
    let envs = {};
    for (const f of envFiles) {
        try {
            const data = fs.readFileSync(path.join(functionsSource, f), "utf8");
            envs = Object.assign(Object.assign({}, envs), parseStrict(data));
        }
        catch (err) {
            throw new error_1.FirebaseError(`Failed to load environment variables from ${f}.`, {
                exit: 2,
                children: ((_a = err.children) === null || _a === void 0 ? void 0 : _a.length) > 0 ? err.children : [err],
            });
        }
    }
    (0, utils_1.logBullet)(clc.cyan.bold("functions: ") + `Loaded environment variables from ${envFiles.join(", ")}.`);
    return envs;
}
exports.loadUserEnvs = loadUserEnvs;
function loadFirebaseEnvs(firebaseConfig, projectId) {
    return {
        FIREBASE_CONFIG: JSON.stringify(firebaseConfig),
        GCLOUD_PROJECT: projectId,
    };
}
exports.loadFirebaseEnvs = loadFirebaseEnvs;
//# sourceMappingURL=env.js.map