"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareFunctions = exports.missingEndpoint = exports.hasEndpoint = exports.regionalEndpoints = exports.matchingBackend = exports.someEndpoint = exports.allEndpoints = exports.checkAvailability = exports.existingBackend = exports.scheduleIdForFunction = exports.functionName = exports.isEmptyBackend = exports.of = exports.empty = exports.isTaskQueueTriggered = exports.isScheduleTriggered = exports.isEventTriggered = exports.isHttpsTriggered = exports.SCHEDULED_FUNCTION_LABEL = exports.memoryOptionDisplayName = exports.endpointTriggerType = void 0;
const gcf = require("../../gcp/cloudfunctions");
const gcfV2 = require("../../gcp/cloudfunctionsv2");
const utils = require("../../utils");
const error_1 = require("../../error");
const previews_1 = require("../../previews");
function endpointTriggerType(endpoint) {
    if (isScheduleTriggered(endpoint)) {
        return "scheduled";
    }
    else if (isHttpsTriggered(endpoint)) {
        return "https";
    }
    else if (isEventTriggered(endpoint)) {
        return endpoint.eventTrigger.eventType;
    }
    else if (isTaskQueueTriggered(endpoint)) {
        return "taskQueue";
    }
    else {
        throw new Error("Unexpected trigger type for endpoint " + JSON.stringify(endpoint));
    }
}
exports.endpointTriggerType = endpointTriggerType;
function memoryOptionDisplayName(option) {
    return {
        128: "128MB",
        256: "256MB",
        512: "512MB",
        1024: "1GB",
        2048: "2GB",
        4096: "4GB",
        8192: "8GB",
    }[option];
}
exports.memoryOptionDisplayName = memoryOptionDisplayName;
exports.SCHEDULED_FUNCTION_LABEL = Object.freeze({ deployment: "firebase-schedule" });
function isHttpsTriggered(triggered) {
    return {}.hasOwnProperty.call(triggered, "httpsTrigger");
}
exports.isHttpsTriggered = isHttpsTriggered;
function isEventTriggered(triggered) {
    return {}.hasOwnProperty.call(triggered, "eventTrigger");
}
exports.isEventTriggered = isEventTriggered;
function isScheduleTriggered(triggered) {
    return {}.hasOwnProperty.call(triggered, "scheduleTrigger");
}
exports.isScheduleTriggered = isScheduleTriggered;
function isTaskQueueTriggered(triggered) {
    return {}.hasOwnProperty.call(triggered, "taskQueueTrigger");
}
exports.isTaskQueueTriggered = isTaskQueueTriggered;
function empty() {
    return {
        requiredAPIs: {},
        endpoints: {},
        environmentVariables: {},
    };
}
exports.empty = empty;
function of(...endpoints) {
    const bkend = Object.assign({}, empty());
    for (const endpoint of endpoints) {
        bkend.endpoints[endpoint.region] = bkend.endpoints[endpoint.region] || {};
        if (bkend.endpoints[endpoint.region][endpoint.id]) {
            throw new Error("Trying to create a backend with the same endpiont twice");
        }
        bkend.endpoints[endpoint.region][endpoint.id] = endpoint;
    }
    return bkend;
}
exports.of = of;
function isEmptyBackend(backend) {
    return (Object.keys(backend.requiredAPIs).length == 0 && Object.keys(backend.endpoints).length === 0);
}
exports.isEmptyBackend = isEmptyBackend;
function functionName(cloudFunction) {
    return `projects/${cloudFunction.project}/locations/${cloudFunction.region}/functions/${cloudFunction.id}`;
}
exports.functionName = functionName;
function scheduleIdForFunction(cloudFunction) {
    return `firebase-schedule-${cloudFunction.id}-${cloudFunction.region}`;
}
exports.scheduleIdForFunction = scheduleIdForFunction;
async function existingBackend(context, forceRefresh) {
    const ctx = context;
    if (!ctx.loadedExistingBackend || forceRefresh) {
        await loadExistingBackend(ctx);
    }
    return ctx.existingBackend;
}
exports.existingBackend = existingBackend;
async function loadExistingBackend(ctx) {
    var _a;
    ctx.loadedExistingBackend = true;
    ctx.existingBackend = Object.assign({}, empty());
    ctx.unreachableRegions = {
        gcfV1: [],
        gcfV2: [],
    };
    const gcfV1Results = await gcf.listAllFunctions(ctx.projectId);
    for (const apiFunction of gcfV1Results.functions) {
        const endpoint = gcf.endpointFromFunction(apiFunction);
        ctx.existingBackend.endpoints[endpoint.region] =
            ctx.existingBackend.endpoints[endpoint.region] || {};
        ctx.existingBackend.endpoints[endpoint.region][endpoint.id] = endpoint;
    }
    ctx.unreachableRegions.gcfV1 = gcfV1Results.unreachable;
    if (!previews_1.previews.functionsv2) {
        return;
    }
    let gcfV2Results;
    try {
        gcfV2Results = await gcfV2.listAllFunctions(ctx.projectId);
    }
    catch (err) {
        if (err.status === 404 && ((_a = err.message) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes("method not found"))) {
            return;
        }
        throw err;
    }
    for (const apiFunction of gcfV2Results.functions) {
        const endpoint = gcfV2.endpointFromFunction(apiFunction);
        ctx.existingBackend.endpoints[endpoint.region] =
            ctx.existingBackend.endpoints[endpoint.region] || {};
        ctx.existingBackend.endpoints[endpoint.region][endpoint.id] = endpoint;
    }
    ctx.unreachableRegions.gcfV2 = gcfV2Results.unreachable;
}
async function checkAvailability(context, want) {
    const ctx = context;
    if (!ctx.loadedExistingBackend) {
        await loadExistingBackend(ctx);
    }
    const gcfV1Regions = new Set();
    const gcfV2Regions = new Set();
    for (const ep of allEndpoints(want)) {
        if (ep.platform == "gcfv1") {
            gcfV1Regions.add(ep.region);
        }
        else {
            gcfV2Regions.add(ep.region);
        }
    }
    const neededUnreachableV1 = ctx.unreachableRegions.gcfV1.filter((region) => gcfV1Regions.has(region));
    const neededUnreachableV2 = ctx.unreachableRegions.gcfV2.filter((region) => gcfV2Regions.has(region));
    if (neededUnreachableV1.length) {
        throw new error_1.FirebaseError("The following Cloud Functions regions are currently unreachable:\n\t" +
            neededUnreachableV1.join("\n\t") +
            "\nThis deployment contains functions in those regions. Please try again in a few minutes, or exclude these regions from your deployment.");
    }
    if (neededUnreachableV2.length) {
        throw new error_1.FirebaseError("The following Cloud Functions V2 regions are currently unreachable:\n\t" +
            neededUnreachableV2.join("\n\t") +
            "\nThis deployment contains functions in those regions. Please try again in a few minutes, or exclude these regions from your deployment.");
    }
    if (ctx.unreachableRegions.gcfV1.length) {
        utils.logLabeledWarning("functions", "The following Cloud Functions regions are currently unreachable:\n" +
            ctx.unreachableRegions.gcfV1.join("\n") +
            "\nCloud Functions in these regions won't be deleted.");
    }
    if (ctx.unreachableRegions.gcfV2.length) {
        utils.logLabeledWarning("functions", "The following Cloud Functions V2 regions are currently unreachable:\n" +
            ctx.unreachableRegions.gcfV2.join("\n") +
            "\nCloud Functions in these regions won't be deleted.");
    }
}
exports.checkAvailability = checkAvailability;
function allEndpoints(backend) {
    return Object.values(backend.endpoints).reduce((accum, perRegion) => {
        return [...accum, ...Object.values(perRegion)];
    }, []);
}
exports.allEndpoints = allEndpoints;
function someEndpoint(backend, predicate) {
    for (const endpoints of Object.values(backend.endpoints)) {
        if (Object.values(endpoints).some(predicate)) {
            return true;
        }
    }
    return false;
}
exports.someEndpoint = someEndpoint;
function matchingBackend(backend, predicate) {
    const filtered = Object.assign({}, empty());
    for (const endpoint of allEndpoints(backend)) {
        if (!predicate(endpoint)) {
            continue;
        }
        filtered.endpoints[endpoint.region] = filtered.endpoints[endpoint.region] || {};
        filtered.endpoints[endpoint.region][endpoint.id] = endpoint;
    }
    return filtered;
}
exports.matchingBackend = matchingBackend;
function regionalEndpoints(backend, region) {
    return backend.endpoints[region] ? Object.values(backend.endpoints[region]) : [];
}
exports.regionalEndpoints = regionalEndpoints;
const hasEndpoint = (backend) => (endpoint) => {
    return (!!backend.endpoints[endpoint.region] && !!backend.endpoints[endpoint.region][endpoint.id]);
};
exports.hasEndpoint = hasEndpoint;
const missingEndpoint = (backend) => (endpoint) => {
    return !(0, exports.hasEndpoint)(backend)(endpoint);
};
exports.missingEndpoint = missingEndpoint;
function compareFunctions(left, right) {
    if (left.platform != right.platform) {
        return right.platform < left.platform ? -1 : 1;
    }
    if (left.region < right.region) {
        return -1;
    }
    if (left.region > right.region) {
        return 1;
    }
    if (left.id < right.id) {
        return -1;
    }
    if (left.id > right.id) {
        return 1;
    }
    return 0;
}
exports.compareFunctions = compareFunctions;
//# sourceMappingURL=backend.js.map