"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSignatureType = exports.formatHost = exports.findModuleRoot = exports.waitForBody = exports.getServiceFromEventType = exports.getFunctionService = exports.getTemporarySocketPath = exports.getEmulatedTriggersFromDefinitions = exports.emulatedFunctionsByRegion = exports.EmulatedTrigger = exports.HttpConstants = void 0;
const _ = require("lodash");
const os = require("os");
const path = require("path");
const fs = require("fs");
const constants_1 = require("./constants");
const memoryLookup = {
    "128MB": 128,
    "256MB": 256,
    "512MB": 512,
    "1GB": 1024,
    "2GB": 2048,
    "4GB": 4096,
};
class HttpConstants {
}
exports.HttpConstants = HttpConstants;
HttpConstants.CALLABLE_AUTH_HEADER = "x-callable-context-auth";
HttpConstants.ORIGINAL_AUTH_HEADER = "x-original-auth";
class EmulatedTrigger {
    constructor(definition, module) {
        this.definition = definition;
        this.module = module;
    }
    get memoryLimitBytes() {
        return memoryLookup[this.definition.availableMemoryMb || "128MB"] * 1024 * 1024;
    }
    get timeoutMs() {
        if (typeof this.definition.timeout === "number") {
            return this.definition.timeout * 1000;
        }
        else {
            return parseInt((this.definition.timeout || "60s").split("s")[0], 10) * 1000;
        }
    }
    getRawFunction() {
        if (!this.module) {
            throw new Error("EmulatedTrigger has not been provided a module.");
        }
        const func = _.get(this.module, this.definition.entryPoint);
        return func.__emulator_func || func;
    }
}
exports.EmulatedTrigger = EmulatedTrigger;
function emulatedFunctionsByRegion(definitions) {
    const regionDefinitions = [];
    for (const def of definitions) {
        if (!def.regions) {
            def.regions = ["us-central1"];
        }
        for (const region of def.regions) {
            const defDeepCopy = JSON.parse(JSON.stringify(def));
            defDeepCopy.regions = [region];
            defDeepCopy.region = region;
            defDeepCopy.id = `${region}-${defDeepCopy.name}`;
            defDeepCopy.platform = defDeepCopy.platform || "gcfv1";
            regionDefinitions.push(defDeepCopy);
        }
    }
    return regionDefinitions;
}
exports.emulatedFunctionsByRegion = emulatedFunctionsByRegion;
function getEmulatedTriggersFromDefinitions(definitions, module) {
    return definitions.reduce((obj, definition) => {
        obj[definition.id] = new EmulatedTrigger(definition, module);
        return obj;
    }, {});
}
exports.getEmulatedTriggersFromDefinitions = getEmulatedTriggersFromDefinitions;
function getTemporarySocketPath(pid, cwd) {
    if (process.platform === "win32") {
        return path.join("\\\\?\\pipe", cwd, pid.toString());
    }
    else {
        return path.join(os.tmpdir(), `fire_emu_${pid.toString()}.sock`);
    }
}
exports.getTemporarySocketPath = getTemporarySocketPath;
function getFunctionService(def) {
    var _a;
    if (def.eventTrigger) {
        return (_a = def.eventTrigger.service) !== null && _a !== void 0 ? _a : getServiceFromEventType(def.eventTrigger.eventType);
    }
    return "unknown";
}
exports.getFunctionService = getFunctionService;
function getServiceFromEventType(eventType) {
    if (eventType.includes("firestore")) {
        return constants_1.Constants.SERVICE_FIRESTORE;
    }
    if (eventType.includes("database")) {
        return constants_1.Constants.SERVICE_REALTIME_DATABASE;
    }
    if (eventType.includes("pubsub")) {
        return constants_1.Constants.SERVICE_PUBSUB;
    }
    if (eventType.includes("storage")) {
        return constants_1.Constants.SERVICE_STORAGE;
    }
    if (eventType.includes("analytics")) {
        return constants_1.Constants.SERVICE_ANALYTICS;
    }
    if (eventType.includes("auth")) {
        return constants_1.Constants.SERVICE_AUTH;
    }
    if (eventType.includes("crashlytics")) {
        return constants_1.Constants.SERVICE_CRASHLYTICS;
    }
    if (eventType.includes("remoteconfig")) {
        return constants_1.Constants.SERVICE_REMOTE_CONFIG;
    }
    if (eventType.includes("testing")) {
        return constants_1.Constants.SERVICE_TEST_LAB;
    }
    return "";
}
exports.getServiceFromEventType = getServiceFromEventType;
function waitForBody(req) {
    let data = "";
    return new Promise((resolve) => {
        req.on("data", (chunk) => {
            data += chunk;
        });
        req.on("end", () => {
            resolve(data);
        });
    });
}
exports.waitForBody = waitForBody;
function findModuleRoot(moduleName, filepath) {
    const hierarchy = filepath.split(path.sep);
    for (let i = 0; i < hierarchy.length; i++) {
        try {
            let chunks = [];
            if (i) {
                chunks = hierarchy.slice(0, -i);
            }
            else {
                chunks = hierarchy;
            }
            const packagePath = path.join(chunks.join(path.sep), "package.json");
            const serializedPackage = fs.readFileSync(packagePath, "utf8").toString();
            if (JSON.parse(serializedPackage).name === moduleName) {
                return chunks.join("/");
            }
            break;
        }
        catch (err) {
        }
    }
    return "";
}
exports.findModuleRoot = findModuleRoot;
function formatHost(info) {
    if (info.host.includes(":")) {
        return `[${info.host}]:${info.port}`;
    }
    else {
        return `${info.host}:${info.port}`;
    }
}
exports.formatHost = formatHost;
function getSignatureType(def) {
    if (def.httpsTrigger) {
        return "http";
    }
    return def.platform === "gcfv2" ? "cloudevent" : "event";
}
exports.getSignatureType = getSignatureType;
//# sourceMappingURL=functionsEmulatorShared.js.map