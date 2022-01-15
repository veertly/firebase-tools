"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backendFromV1Alpha1 = void 0;
const backend = require("../../backend");
const proto_1 = require("../../../../gcp/proto");
const parsing_1 = require("./parsing");
const error_1 = require("../../../../error");
function backendFromV1Alpha1(yaml, project, region, runtime) {
    const manifest = JSON.parse(JSON.stringify(yaml));
    const bkend = backend.empty();
    bkend.requiredAPIs = parseRequiredAPIs(manifest);
    (0, parsing_1.requireKeys)("", manifest, "endpoints");
    (0, parsing_1.assertKeyTypes)("", manifest, {
        specVersion: "string",
        requiredAPIs: "object",
        endpoints: "object",
    });
    for (const id of Object.keys(manifest.endpoints)) {
        for (const parsed of parseEndpoints(manifest, id, project, region, runtime)) {
            bkend.endpoints[parsed.region] = bkend.endpoints[parsed.region] || {};
            bkend.endpoints[parsed.region][parsed.id] = parsed;
        }
    }
    return bkend;
}
exports.backendFromV1Alpha1 = backendFromV1Alpha1;
function parseRequiredAPIs(manifest) {
    const requiredAPIs = {};
    if (typeof manifest !== "object" || Array.isArray(manifest)) {
        throw new error_1.FirebaseError("Expected requiredApis to be a map of string to string");
    }
    for (const [api, reason] of Object.entries(manifest.requiredAPIs || {})) {
        if (typeof reason !== "string") {
            throw new error_1.FirebaseError(`Invalid reason "${JSON.stringify(reason)} for API ${api}. Expected string`);
        }
        requiredAPIs[api] = reason;
    }
    return requiredAPIs;
}
function parseEndpoints(manifest, id, project, defaultRegion, runtime) {
    const allParsed = [];
    const prefix = `endpoints[${id}]`;
    const ep = manifest.endpoints[id];
    (0, parsing_1.assertKeyTypes)(prefix, ep, {
        region: "array",
        platform: "string",
        entryPoint: "string",
        availableMemoryMb: "number",
        maxInstances: "number",
        minInstances: "number",
        concurrency: "number",
        serviceAccountEmail: "string",
        timeout: "string",
        vpcConnector: "string",
        vpcConnectorEgressSettings: "string",
        labels: "object",
        ingressSettings: "string",
        environmentVariables: "object",
        httpsTrigger: "object",
        eventTrigger: "object",
        scheduleTrigger: "object",
        taskQueueTrigger: "object",
    });
    let triggerCount = 0;
    if (ep.httpsTrigger) {
        triggerCount++;
    }
    if (ep.eventTrigger) {
        triggerCount++;
    }
    if (ep.scheduleTrigger) {
        triggerCount++;
    }
    if (ep.taskQueueTrigger) {
        triggerCount++;
    }
    if (!triggerCount) {
        throw new error_1.FirebaseError("Expected trigger in endpoint" + id);
    }
    if (triggerCount > 1) {
        throw new error_1.FirebaseError("Multiple triggers defined for endpoint" + id);
    }
    for (const region of ep.region || [defaultRegion]) {
        let triggered;
        if (backend.isEventTriggered(ep)) {
            (0, parsing_1.requireKeys)(prefix + ".eventTrigger", ep.eventTrigger, "eventType", "eventFilters");
            (0, parsing_1.assertKeyTypes)(prefix + ".eventTrigger", ep.eventTrigger, {
                eventFilters: "object",
                eventType: "string",
                retry: "boolean",
                region: "string",
                serviceAccountEmail: "string",
            });
            triggered = { eventTrigger: ep.eventTrigger };
        }
        else if (backend.isHttpsTriggered(ep)) {
            (0, parsing_1.assertKeyTypes)(prefix + ".httpsTrigger", ep.httpsTrigger, {
                invoker: "array",
            });
            triggered = { httpsTrigger: {} };
            (0, proto_1.copyIfPresent)(triggered.httpsTrigger, ep.httpsTrigger, "invoker");
        }
        else if (backend.isScheduleTriggered(ep)) {
            (0, parsing_1.assertKeyTypes)(prefix + ".scheduleTrigger", ep.scheduleTrigger, {
                schedule: "string",
                timeZone: "string",
                retryConfig: "object",
            });
            (0, parsing_1.assertKeyTypes)(prefix + ".scheduleTrigger.retryConfig", ep.scheduleTrigger.retryConfig, {
                retryCount: "number",
                maxDoublings: "number",
                minBackoffDuration: "string",
                maxBackoffDuration: "string",
                maxRetryDuration: "string",
            });
            triggered = { scheduleTrigger: ep.scheduleTrigger };
        }
        else if (backend.isTaskQueueTriggered(ep)) {
            (0, parsing_1.assertKeyTypes)(prefix + ".taskQueueTrigger", ep.taskQueueTrigger, {
                rateLimits: "object",
                retryConfig: "object",
                invoker: "array",
            });
            if (ep.taskQueueTrigger.rateLimits) {
                (0, parsing_1.assertKeyTypes)(prefix + ".taskQueueTrigger.rateLimits", ep.taskQueueTrigger.rateLimits, {
                    maxBurstSize: "number",
                    maxConcurrentDispatches: "number",
                    maxDispatchesPerSecond: "number",
                });
            }
            if (ep.taskQueueTrigger.retryConfig) {
                (0, parsing_1.assertKeyTypes)(prefix + ".taskQueueTrigger.retryConfig", ep.taskQueueTrigger.retryConfig, {
                    maxAttempts: "number",
                    maxRetryDuration: "string",
                    minBackoff: "string",
                    maxBackoff: "string",
                    maxDoublings: "number",
                });
            }
            triggered = { taskQueueTrigger: ep.taskQueueTrigger };
        }
        else {
            throw new error_1.FirebaseError(`Do not recognize trigger type for endpoint ${id}. Try upgrading ` +
                "firebase-tools with npm install -g firebase-tools@latest");
        }
        (0, parsing_1.requireKeys)(prefix, ep, "entryPoint");
        const parsed = Object.assign({ platform: ep.platform || "gcfv2", id,
            region,
            project,
            runtime, entryPoint: ep.entryPoint }, triggered);
        (0, proto_1.copyIfPresent)(parsed, ep, "availableMemoryMb", "maxInstances", "minInstances", "concurrency", "serviceAccountEmail", "timeout", "vpcConnector", "vpcConnectorEgressSettings", "labels", "ingressSettings", "environmentVariables");
        allParsed.push(parsed);
    }
    return allParsed;
}
//# sourceMappingURL=v1alpha1.js.map