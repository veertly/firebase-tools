"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkForV2Upgrade = exports.checkForIllegalUpdate = exports.upgradedScheduleFromV1ToV2 = exports.changedV2PubSubTopic = exports.changedTriggerRegion = exports.upgradedToGCFv2WithoutSettingConcurrency = exports.createDeploymentPlan = exports.calculateUpdate = exports.calculateRegionalChanges = void 0;
const functionsDeployHelper_1 = require("../functionsDeployHelper");
const functionsDeployHelper_2 = require("../functionsDeployHelper");
const deploymentTool_1 = require("../../../deploymentTool");
const error_1 = require("../../../error");
const utils = require("../../../utils");
const backend = require("../backend");
const gcfv2 = require("../../../gcp/cloudfunctionsv2");
function calculateRegionalChanges(want, have, options) {
    const endpointsToCreate = Object.keys(want)
        .filter((id) => !have[id])
        .map((id) => want[id]);
    const endpointsToDelete = Object.keys(have)
        .filter((id) => !want[id])
        .filter((id) => options.deleteAll || (0, deploymentTool_1.isFirebaseManaged)(have[id].labels || {}))
        .map((id) => have[id]);
    const endpointsToUpdate = Object.keys(want)
        .filter((id) => have[id])
        .map((id) => calculateUpdate(want[id], have[id]));
    return { endpointsToCreate, endpointsToUpdate, endpointsToDelete };
}
exports.calculateRegionalChanges = calculateRegionalChanges;
function calculateUpdate(want, have) {
    checkForIllegalUpdate(want, have);
    const update = {
        endpoint: want,
    };
    const needsDelete = changedTriggerRegion(want, have) ||
        changedV2PubSubTopic(want, have) ||
        upgradedScheduleFromV1ToV2(want, have);
    if (needsDelete) {
        update.deleteAndRecreate = have;
    }
    return update;
}
exports.calculateUpdate = calculateUpdate;
function createDeploymentPlan(want, have, options = {}) {
    const deployment = {};
    want = backend.matchingBackend(want, (endpoint) => {
        return (0, functionsDeployHelper_1.functionMatchesAnyGroup)(endpoint, options.filters || []);
    });
    have = backend.matchingBackend(have, (endpoint) => {
        return (0, functionsDeployHelper_1.functionMatchesAnyGroup)(endpoint, options.filters || []);
    });
    const regions = new Set([...Object.keys(want.endpoints), ...Object.keys(have.endpoints)]);
    for (const region of regions) {
        deployment[region] = calculateRegionalChanges(want.endpoints[region] || {}, have.endpoints[region] || {}, options);
    }
    if (upgradedToGCFv2WithoutSettingConcurrency(want, have)) {
        utils.logLabeledBullet("functions", "You are updating one or more functions to Google Cloud Functions v2, " +
            "which introduces support for concurrent execution. New functions " +
            "default to 80 concurrent executions, but existing functions keep the " +
            "old default of 1. You can change this with the 'concurrency' option.");
    }
    return deployment;
}
exports.createDeploymentPlan = createDeploymentPlan;
function upgradedToGCFv2WithoutSettingConcurrency(want, have) {
    return backend.someEndpoint(want, (endpoint) => {
        var _a, _b;
        if (((_b = (_a = have.endpoints[endpoint.region]) === null || _a === void 0 ? void 0 : _a[endpoint.id]) === null || _b === void 0 ? void 0 : _b.platform) !== "gcfv1") {
            return false;
        }
        if (endpoint.platform !== "gcfv2") {
            return false;
        }
        if (endpoint.concurrency) {
            return false;
        }
        return true;
    });
}
exports.upgradedToGCFv2WithoutSettingConcurrency = upgradedToGCFv2WithoutSettingConcurrency;
function changedTriggerRegion(want, have) {
    if (want.platform != "gcfv2") {
        return false;
    }
    if (have.platform != "gcfv2") {
        return false;
    }
    if (!backend.isEventTriggered(want)) {
        return false;
    }
    if (!backend.isEventTriggered(have)) {
        return false;
    }
    return want.eventTrigger.region != have.eventTrigger.region;
}
exports.changedTriggerRegion = changedTriggerRegion;
function changedV2PubSubTopic(want, have) {
    if (want.platform !== "gcfv2") {
        return false;
    }
    if (have.platform !== "gcfv2") {
        return false;
    }
    if (!backend.isEventTriggered(want)) {
        return false;
    }
    if (!backend.isEventTriggered(have)) {
        return false;
    }
    if (want.eventTrigger.eventType != gcfv2.PUBSUB_PUBLISH_EVENT) {
        return false;
    }
    if (have.eventTrigger.eventType !== gcfv2.PUBSUB_PUBLISH_EVENT) {
        return false;
    }
    return have.eventTrigger.eventFilters["resource"] != want.eventTrigger.eventFilters["resource"];
}
exports.changedV2PubSubTopic = changedV2PubSubTopic;
function upgradedScheduleFromV1ToV2(want, have) {
    if (have.platform !== "gcfv1") {
        return false;
    }
    if (want.platform !== "gcfv2") {
        return false;
    }
    if (!backend.isScheduleTriggered(have)) {
        return false;
    }
    if (!backend.isScheduleTriggered(want)) {
        return false;
    }
    return true;
}
exports.upgradedScheduleFromV1ToV2 = upgradedScheduleFromV1ToV2;
function checkForIllegalUpdate(want, have) {
    const triggerType = (e) => {
        if (backend.isHttpsTriggered(e)) {
            return "an HTTPS";
        }
        else if (backend.isEventTriggered(e)) {
            return "a background triggered";
        }
        else if (backend.isScheduleTriggered(e)) {
            return "a scheduled";
        }
        else if (backend.isTaskQueueTriggered(e)) {
            return "a task queue";
        }
        throw Error("Functions release planner is not able to handle an unknown trigger type");
    };
    const wantType = triggerType(want);
    const haveType = triggerType(have);
    if (wantType != haveType) {
        throw new error_1.FirebaseError(`[${(0, functionsDeployHelper_2.getFunctionLabel)(want)}] Changing from ${haveType} function to ${wantType} function is not allowed. Please delete your function and create a new one instead.`);
    }
    if (want.platform == "gcfv1" && have.platform == "gcfv2") {
        throw new error_1.FirebaseError(`[${(0, functionsDeployHelper_2.getFunctionLabel)(want)}] Functions cannot be downgraded from GCFv2 to GCFv1`);
    }
    exports.checkForV2Upgrade(want, have);
}
exports.checkForIllegalUpdate = checkForIllegalUpdate;
function checkForV2Upgrade(want, have) {
    if (want.platform == "gcfv2" && have.platform == "gcfv1") {
        throw new error_1.FirebaseError(`[${(0, functionsDeployHelper_2.getFunctionLabel)(have)}] Upgrading from GCFv1 to GCFv2 is not yet supported. Please delete your old function or wait for this feature to be ready.`);
    }
}
exports.checkForV2Upgrade = checkForV2Upgrade;
//# sourceMappingURL=planner.js.map