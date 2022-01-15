"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.functionFromEndpoint = exports.endpointFromFunction = exports.listAllFunctions = exports.listFunctions = exports.deleteFunction = exports.updateFunction = exports.setInvokerUpdate = exports.setInvokerCreate = exports.getIamPolicy = exports.setIamPolicy = exports.createFunction = exports.generateUploadUrl = exports.API_VERSION = void 0;
const clc = require("cli-color");
const error_1 = require("../error");
const logger_1 = require("../logger");
const previews_1 = require("../previews");
const api = require("../api");
const backend = require("../deploy/functions/backend");
const utils = require("../utils");
const proto = require("./proto");
const runtimes = require("../deploy/functions/runtimes");
exports.API_VERSION = "v1";
function validateFunction(func) {
    proto.assertOneOf("Cloud Function", func, "sourceCode", "sourceArchiveUrl", "sourceRepository", "sourceUploadUrl");
    proto.assertOneOf("Cloud Function", func, "trigger", "httpsTrigger", "eventTrigger");
}
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
    const parent = "projects/" + projectId + "/locations/" + location;
    const endpoint = "/" + exports.API_VERSION + "/" + parent + "/functions:generateUploadUrl";
    try {
        const res = await api.request("POST", endpoint, {
            auth: true,
            json: false,
            origin: api.functionsOrigin,
            retryCodes: [503],
        });
        const responseBody = JSON.parse(res.body);
        return responseBody.uploadUrl;
    }
    catch (err) {
        logger_1.logger.info("\n\nThere was an issue deploying your functions. Verify that your project has a Google App Engine instance setup at https://console.cloud.google.com/appengine and try again. If this issue persists, please contact support.");
        throw err;
    }
}
exports.generateUploadUrl = generateUploadUrl;
async function createFunction(cloudFunction) {
    const apiPath = cloudFunction.name.substring(0, cloudFunction.name.lastIndexOf("/"));
    const endpoint = `/${exports.API_VERSION}/${apiPath}`;
    try {
        const headers = {};
        if (previews_1.previews.artifactregistry) {
            headers["X-Firebase-Artifact-Registry"] = "optin";
        }
        const res = await api.request("POST", endpoint, {
            headers,
            auth: true,
            data: cloudFunction,
            origin: api.functionsOrigin,
        });
        return {
            name: res.body.name,
            type: "create",
            done: false,
        };
    }
    catch (err) {
        throw functionsOpLogReject(cloudFunction.name, "create", err);
    }
}
exports.createFunction = createFunction;
async function setIamPolicy(options) {
    const endpoint = `/${exports.API_VERSION}/${options.name}:setIamPolicy`;
    try {
        await api.request("POST", endpoint, {
            auth: true,
            data: {
                policy: options.policy,
                updateMask: Object.keys(options.policy).join(","),
            },
            origin: api.functionsOrigin,
        });
    }
    catch (err) {
        throw new error_1.FirebaseError(`Failed to set the IAM Policy on the function ${options.name}`, {
            original: err,
        });
    }
}
exports.setIamPolicy = setIamPolicy;
async function getIamPolicy(fnName) {
    const endpoint = `/${exports.API_VERSION}/${fnName}:getIamPolicy`;
    try {
        return await api.request("GET", endpoint, {
            auth: true,
            origin: api.functionsOrigin,
        });
    }
    catch (err) {
        throw new error_1.FirebaseError(`Failed to get the IAM Policy on the function ${fnName}`, {
            original: err,
        });
    }
}
exports.getIamPolicy = getIamPolicy;
async function setInvokerCreate(projectId, fnName, invoker) {
    if (invoker.length == 0) {
        throw new error_1.FirebaseError("Invoker cannot be an empty array");
    }
    const invokerMembers = proto.getInvokerMembers(invoker, projectId);
    const invokerRole = "roles/cloudfunctions.invoker";
    const bindings = [{ role: invokerRole, members: invokerMembers }];
    const policy = {
        bindings: bindings,
        etag: "",
        version: 3,
    };
    await setIamPolicy({ name: fnName, policy: policy });
}
exports.setInvokerCreate = setInvokerCreate;
async function setInvokerUpdate(projectId, fnName, invoker) {
    var _a;
    if (invoker.length == 0) {
        throw new error_1.FirebaseError("Invoker cannot be an empty array");
    }
    const invokerMembers = proto.getInvokerMembers(invoker, projectId);
    const invokerRole = "roles/cloudfunctions.invoker";
    const currentPolicy = await getIamPolicy(fnName);
    const currentInvokerBinding = (_a = currentPolicy.bindings) === null || _a === void 0 ? void 0 : _a.find((binding) => binding.role === invokerRole);
    if (currentInvokerBinding &&
        JSON.stringify(currentInvokerBinding.members.sort()) === JSON.stringify(invokerMembers.sort())) {
        return;
    }
    const bindings = (currentPolicy.bindings || []).filter((binding) => binding.role !== invokerRole);
    bindings.push({
        role: invokerRole,
        members: invokerMembers,
    });
    const policy = {
        bindings: bindings,
        etag: currentPolicy.etag || "",
        version: 3,
    };
    await setIamPolicy({ name: fnName, policy: policy });
}
exports.setInvokerUpdate = setInvokerUpdate;
async function updateFunction(cloudFunction) {
    const endpoint = `/${exports.API_VERSION}/${cloudFunction.name}`;
    const fieldMasks = proto.fieldMasks(cloudFunction, "labels", "environmentVariables");
    try {
        const headers = {};
        if (previews_1.previews.artifactregistry) {
            headers["X-Firebase-Artifact-Registry"] = "optin";
        }
        const res = await api.request("PATCH", endpoint, {
            headers,
            qs: {
                updateMask: fieldMasks.join(","),
            },
            auth: true,
            data: cloudFunction,
            origin: api.functionsOrigin,
        });
        return {
            done: false,
            name: res.body.name,
            type: "update",
        };
    }
    catch (err) {
        throw functionsOpLogReject(cloudFunction.name, "update", err);
    }
}
exports.updateFunction = updateFunction;
async function deleteFunction(name) {
    const endpoint = `/${exports.API_VERSION}/${name}`;
    try {
        const res = await api.request("DELETE", endpoint, {
            auth: true,
            origin: api.functionsOrigin,
        });
        return {
            done: false,
            name: res.body.name,
            type: "delete",
        };
    }
    catch (err) {
        throw functionsOpLogReject(name, "delete", err);
    }
}
exports.deleteFunction = deleteFunction;
async function list(projectId, region) {
    const endpoint = "/" + exports.API_VERSION + "/projects/" + projectId + "/locations/" + region + "/functions";
    try {
        const res = await api.request("GET", endpoint, {
            auth: true,
            origin: api.functionsOrigin,
        });
        if (res.body.unreachable && res.body.unreachable.length > 0) {
            logger_1.logger.debug(`[functions] unable to reach the following regions: ${res.body.unreachable.join(", ")}`);
        }
        return {
            functions: res.body.functions || [],
            unreachable: res.body.unreachable || [],
        };
    }
    catch (err) {
        logger_1.logger.debug(`[functions] failed to list functions for ${projectId}`);
        logger_1.logger.debug(`[functions] ${err === null || err === void 0 ? void 0 : err.message}`);
        throw new error_1.FirebaseError(`Failed to list functions for ${projectId}`, {
            original: err,
        });
    }
}
async function listFunctions(projectId, region) {
    const res = await list(projectId, region);
    return res.functions;
}
exports.listFunctions = listFunctions;
async function listAllFunctions(projectId) {
    return list(projectId, "-");
}
exports.listAllFunctions = listAllFunctions;
function endpointFromFunction(gcfFunction) {
    var _a, _b, _c;
    const [, project, , region, , id] = gcfFunction.name.split("/");
    let trigger;
    let uri;
    if ((_a = gcfFunction.labels) === null || _a === void 0 ? void 0 : _a["deployment-scheduled"]) {
        trigger = {
            scheduleTrigger: {},
        };
    }
    else if ((_b = gcfFunction.labels) === null || _b === void 0 ? void 0 : _b["deployment-taskqueue"]) {
        trigger = {
            taskQueueTrigger: {},
        };
    }
    else if (gcfFunction.httpsTrigger) {
        trigger = { httpsTrigger: {} };
        uri = gcfFunction.httpsTrigger.url;
    }
    else {
        trigger = {
            eventTrigger: {
                eventType: gcfFunction.eventTrigger.eventType,
                eventFilters: {
                    resource: gcfFunction.eventTrigger.resource,
                },
                retry: !!((_c = gcfFunction.eventTrigger.failurePolicy) === null || _c === void 0 ? void 0 : _c.retry),
            },
        };
    }
    if (!runtimes.isValidRuntime(gcfFunction.runtime)) {
        logger_1.logger.debug("GCFv1 function has a deprecated runtime:", JSON.stringify(gcfFunction, null, 2));
    }
    const endpoint = Object.assign(Object.assign({ platform: "gcfv1", id,
        project,
        region }, trigger), { entryPoint: gcfFunction.entryPoint, runtime: gcfFunction.runtime });
    if (uri) {
        endpoint.uri = uri;
    }
    proto.copyIfPresent(endpoint, gcfFunction, "serviceAccountEmail", "availableMemoryMb", "timeout", "minInstances", "maxInstances", "vpcConnector", "vpcConnectorEgressSettings", "ingressSettings", "labels", "environmentVariables", "sourceUploadUrl");
    return endpoint;
}
exports.endpointFromFunction = endpointFromFunction;
function functionFromEndpoint(endpoint, sourceUploadUrl) {
    if (endpoint.platform != "gcfv1") {
        throw new error_1.FirebaseError("Trying to create a v1 CloudFunction with v2 API. This should never happen");
    }
    if (!runtimes.isValidRuntime(endpoint.runtime)) {
        throw new error_1.FirebaseError("Failed internal assertion. Trying to deploy a new function with a deprecated runtime." +
            " This should never happen");
    }
    const gcfFunction = {
        name: backend.functionName(endpoint),
        sourceUploadUrl: sourceUploadUrl,
        entryPoint: endpoint.entryPoint,
        runtime: endpoint.runtime,
    };
    proto.copyIfPresent(gcfFunction, endpoint, "labels");
    if (backend.isEventTriggered(endpoint)) {
        gcfFunction.eventTrigger = {
            eventType: endpoint.eventTrigger.eventType,
            resource: endpoint.eventTrigger.eventFilters.resource,
        };
        gcfFunction.eventTrigger.failurePolicy = endpoint.eventTrigger.retry
            ? { retry: {} }
            : undefined;
    }
    else if (backend.isScheduleTriggered(endpoint)) {
        const id = backend.scheduleIdForFunction(endpoint);
        gcfFunction.eventTrigger = {
            eventType: "google.pubsub.topic.publish",
            resource: `projects/${endpoint.project}/topics/${id}`,
        };
        gcfFunction.labels = Object.assign(Object.assign({}, gcfFunction.labels), { "deployment-scheduled": "true" });
    }
    else if (backend.isTaskQueueTriggered(endpoint)) {
        gcfFunction.httpsTrigger = {};
        gcfFunction.labels = Object.assign(Object.assign({}, gcfFunction.labels), { "deployment-taskqueue": "true" });
    }
    else {
        gcfFunction.httpsTrigger = {};
    }
    proto.copyIfPresent(gcfFunction, endpoint, "serviceAccountEmail", "timeout", "availableMemoryMb", "minInstances", "maxInstances", "vpcConnector", "vpcConnectorEgressSettings", "ingressSettings", "environmentVariables");
    return gcfFunction;
}
exports.functionFromEndpoint = functionFromEndpoint;
//# sourceMappingURL=cloudfunctions.js.map