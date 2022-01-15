"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.endpointFromFunction = exports.functionFromEndpoint = exports.deleteFunction = exports.updateFunction = exports.listAllFunctions = exports.listFunctions = exports.getFunction = exports.createFunction = exports.generateUploadUrl = exports.megabytes = exports.PUBSUB_PUBLISH_EVENT = exports.API_VERSION = void 0;
const clc = require("cli-color");
const apiv2_1 = require("../apiv2");
const error_1 = require("../error");
const api_1 = require("../api");
const logger_1 = require("../logger");
const backend = require("../deploy/functions/backend");
const runtimes = require("../deploy/functions/runtimes");
const proto = require("./proto");
const utils = require("../utils");
exports.API_VERSION = "v2alpha";
const client = new apiv2_1.Client({
    urlPrefix: api_1.functionsV2Origin,
    auth: true,
    apiVersion: exports.API_VERSION,
});
exports.PUBSUB_PUBLISH_EVENT = "google.cloud.pubsub.topic.v1.messagePublished";
const BYTES_PER_UNIT = {
    "": 1,
    k: 1e3,
    M: 1e6,
    G: 1e9,
    T: 1e12,
    Ki: 1 << 10,
    Mi: 1 << 20,
    Gi: 1 << 30,
    Ti: 1 << 40,
};
function megabytes(memory) {
    const re = /^([0-9]+(\.[0-9]*)?)(Ki|Mi|Gi|Ti|k|M|G|T|([eE]([0-9]+)))?$/;
    const matches = re.exec(memory);
    if (!matches) {
        throw new Error(`Invalid memory quantity "${memory}""`);
    }
    const quantity = Number.parseFloat(matches[1]);
    let bytes;
    if (matches[5]) {
        bytes = quantity * Math.pow(10, Number.parseFloat(matches[5]));
    }
    else {
        const suffix = matches[3] || "";
        bytes = quantity * BYTES_PER_UNIT[suffix];
    }
    return bytes / 1e6;
}
exports.megabytes = megabytes;
function functionsOpLogReject(funcName, type, err) {
    var _a, _b;
    if (((_b = (_a = err === null || err === void 0 ? void 0 : err.context) === null || _a === void 0 ? void 0 : _a.response) === null || _b === void 0 ? void 0 : _b.statusCode) === 429) {
        utils.logWarning(`${clc.bold.yellow("functions:")} got "Quota Exceeded" error while trying to ${type} ${funcName}. Waiting to retry...`);
    }
    else {
        utils.logWarning(clc.bold.yellow("functions:") + " failed to " + type + " function " + funcName);
    }
    throw new error_1.FirebaseError(`Failed to ${type} function ${funcName}`, {
        original: err,
        context: { function: funcName },
    });
}
async function generateUploadUrl(projectId, location) {
    try {
        const res = await client.post(`projects/${projectId}/locations/${location}/functions:generateUploadUrl`);
        return res.body;
    }
    catch (err) {
        logger_1.logger.info("\n\nThere was an issue deploying your functions. Verify that your project has a Google App Engine instance setup at https://console.cloud.google.com/appengine and try again. If this issue persists, please contact support.");
        throw err;
    }
}
exports.generateUploadUrl = generateUploadUrl;
async function createFunction(cloudFunction) {
    const components = cloudFunction.name.split("/");
    const functionId = components.splice(-1, 1)[0];
    try {
        const res = await client.post(components.join("/"), cloudFunction, { queryParams: { functionId } });
        return res.body;
    }
    catch (err) {
        throw functionsOpLogReject(cloudFunction.name, "create", err);
    }
}
exports.createFunction = createFunction;
async function getFunction(projectId, location, functionId) {
    const name = `projects/${projectId}/locations/${location}/functions/${functionId}`;
    const res = await client.get(name);
    return res.body;
}
exports.getFunction = getFunction;
async function listFunctions(projectId, region) {
    const res = await listFunctionsInternal(projectId, region);
    if (res.unreachable.includes(region)) {
        throw new error_1.FirebaseError(`Cloud Functions region ${region} is unavailable`);
    }
    return res.functions;
}
exports.listFunctions = listFunctions;
async function listAllFunctions(projectId) {
    return await listFunctionsInternal(projectId, "-");
}
exports.listAllFunctions = listAllFunctions;
async function listFunctionsInternal(projectId, region) {
    const functions = [];
    const unreacahble = new Set();
    let pageToken = "";
    while (true) {
        const url = `projects/${projectId}/locations/${region}/functions`;
        const opts = pageToken == "" ? {} : { queryParams: { pageToken } };
        const res = await client.get(url, opts);
        functions.push(...(res.body.functions || []));
        for (const region of res.body.unreachable || []) {
            unreacahble.add(region);
        }
        if (!res.body.nextPageToken) {
            return {
                functions,
                unreachable: Array.from(unreacahble),
            };
        }
        pageToken = res.body.nextPageToken;
    }
}
async function updateFunction(cloudFunction) {
    try {
        const queryParams = {
            updateMask: proto.fieldMasks(cloudFunction).join(","),
        };
        const res = await client.patch(cloudFunction.name, cloudFunction, { queryParams });
        return res.body;
    }
    catch (err) {
        throw functionsOpLogReject(cloudFunction.name, "update", err);
    }
}
exports.updateFunction = updateFunction;
async function deleteFunction(cloudFunction) {
    try {
        const res = await client.delete(cloudFunction);
        return res.body;
    }
    catch (err) {
        throw functionsOpLogReject(cloudFunction, "update", err);
    }
}
exports.deleteFunction = deleteFunction;
function functionFromEndpoint(endpoint, source) {
    if (endpoint.platform != "gcfv2") {
        throw new error_1.FirebaseError("Trying to create a v2 CloudFunction with v1 API. This should never happen");
    }
    if (!runtimes.isValidRuntime(endpoint.runtime)) {
        throw new error_1.FirebaseError("Failed internal assertion. Trying to deploy a new function with a deprecated runtime." +
            " This should never happen");
    }
    const gcfFunction = {
        name: backend.functionName(endpoint),
        buildConfig: {
            runtime: endpoint.runtime,
            entryPoint: endpoint.entryPoint,
            source: {
                storageSource: source,
            },
            environmentVariables: {},
        },
        serviceConfig: {},
    };
    proto.copyIfPresent(gcfFunction, endpoint, "labels");
    proto.copyIfPresent(gcfFunction.serviceConfig, endpoint, "environmentVariables", "vpcConnector", "vpcConnectorEgressSettings", "serviceAccountEmail", "ingressSettings");
    proto.renameIfPresent(gcfFunction.serviceConfig, endpoint, "availableMemory", "availableMemoryMb", (mb) => `${mb}M`);
    proto.renameIfPresent(gcfFunction.serviceConfig, endpoint, "timeoutSeconds", "timeout", proto.secondsFromDuration);
    proto.renameIfPresent(gcfFunction.serviceConfig, endpoint, "minInstanceCount", "minInstances");
    proto.renameIfPresent(gcfFunction.serviceConfig, endpoint, "maxInstanceCount", "maxInstances");
    if (backend.isEventTriggered(endpoint)) {
        gcfFunction.eventTrigger = {
            eventType: endpoint.eventTrigger.eventType,
        };
        if (gcfFunction.eventTrigger.eventType === exports.PUBSUB_PUBLISH_EVENT) {
            gcfFunction.eventTrigger.pubsubTopic = endpoint.eventTrigger.eventFilters.resource;
        }
        else {
            gcfFunction.eventTrigger.eventFilters = [];
            for (const [attribute, value] of Object.entries(endpoint.eventTrigger.eventFilters)) {
                gcfFunction.eventTrigger.eventFilters.push({ attribute, value });
            }
        }
        proto.renameIfPresent(gcfFunction.eventTrigger, endpoint.eventTrigger, "triggerRegion", "region");
        if (endpoint.eventTrigger.retry) {
            logger_1.logger.warn("Cannot set a retry policy on Cloud Function", endpoint.id);
        }
    }
    else if (backend.isScheduleTriggered(endpoint)) {
        gcfFunction.labels = Object.assign(Object.assign({}, gcfFunction.labels), { "deployment-scheduled": "true" });
    }
    else if (backend.isTaskQueueTriggered(endpoint)) {
        gcfFunction.labels = Object.assign(Object.assign({}, gcfFunction.labels), { "deployment-taskqueue": "true" });
    }
    return gcfFunction;
}
exports.functionFromEndpoint = functionFromEndpoint;
function endpointFromFunction(gcfFunction) {
    var _a, _b;
    const [, project, , region, , id] = gcfFunction.name.split("/");
    let trigger;
    if (((_a = gcfFunction.labels) === null || _a === void 0 ? void 0 : _a["deployment-scheduled"]) === "true") {
        trigger = {
            scheduleTrigger: {},
        };
    }
    else if (((_b = gcfFunction.labels) === null || _b === void 0 ? void 0 : _b["deployment-taskqueue"]) === "true") {
        trigger = {
            taskQueueTrigger: {},
        };
    }
    else if (gcfFunction.eventTrigger) {
        trigger = {
            eventTrigger: {
                eventType: gcfFunction.eventTrigger.eventType,
                eventFilters: {},
                retry: false,
            },
        };
        if (gcfFunction.eventTrigger.pubsubTopic) {
            trigger.eventTrigger.eventFilters.resource = gcfFunction.eventTrigger.pubsubTopic;
        }
        else {
            for (const { attribute, value } of gcfFunction.eventTrigger.eventFilters || []) {
                trigger.eventTrigger.eventFilters[attribute] = value;
            }
        }
        proto.renameIfPresent(trigger.eventTrigger, gcfFunction.eventTrigger, "region", "triggerRegion");
    }
    else {
        trigger = { httpsTrigger: {} };
    }
    if (!runtimes.isValidRuntime(gcfFunction.buildConfig.runtime)) {
        logger_1.logger.debug("GCFv2 function has a deprecated runtime:", JSON.stringify(gcfFunction, null, 2));
    }
    const endpoint = Object.assign(Object.assign({ platform: "gcfv2", id,
        project,
        region }, trigger), { entryPoint: gcfFunction.buildConfig.entryPoint, runtime: gcfFunction.buildConfig.runtime, uri: gcfFunction.serviceConfig.uri });
    proto.copyIfPresent(endpoint, gcfFunction.serviceConfig, "serviceAccountEmail", "vpcConnector", "vpcConnectorEgressSettings", "ingressSettings", "environmentVariables");
    proto.renameIfPresent(endpoint, gcfFunction.serviceConfig, "availableMemoryMb", "availableMemory", megabytes);
    proto.renameIfPresent(endpoint, gcfFunction.serviceConfig, "timeout", "timeoutSeconds", proto.durationFromSeconds);
    proto.renameIfPresent(endpoint, gcfFunction.serviceConfig, "minInstances", "minInstanceCount");
    proto.renameIfPresent(endpoint, gcfFunction.serviceConfig, "maxInstances", "maxInstanceCount");
    proto.copyIfPresent(endpoint, gcfFunction, "labels");
    return endpoint;
}
exports.endpointFromFunction = endpointFromFunction;
//# sourceMappingURL=cloudfunctionsv2.js.map