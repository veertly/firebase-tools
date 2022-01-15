"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureStorageTriggerRegion = exports.obtainStorageBindings = void 0;
const storage = require("../../../gcp/storage");
const logger_1 = require("../../../logger");
const error_1 = require("../../../error");
const location_1 = require("../../../gcp/location");
const PUBSUB_PUBLISHER_ROLE = "roles/pubsub.publisher";
async function obtainStorageBindings(projectId, existingPolicy) {
    const storageResponse = await storage.getServiceAccount(projectId);
    const storageServiceAgent = `serviceAccount:${storageResponse.email_address}`;
    let pubsubBinding = existingPolicy.bindings.find((b) => b.role === PUBSUB_PUBLISHER_ROLE);
    if (!pubsubBinding) {
        pubsubBinding = {
            role: PUBSUB_PUBLISHER_ROLE,
            members: [],
        };
    }
    if (!pubsubBinding.members.find((m) => m === storageServiceAgent)) {
        pubsubBinding.members.push(storageServiceAgent);
    }
    return [pubsubBinding];
}
exports.obtainStorageBindings = obtainStorageBindings;
async function ensureStorageTriggerRegion(endpoint, eventTrigger) {
    if (!eventTrigger.region) {
        logger_1.logger.debug("Looking up bucket region for the storage event trigger");
        try {
            const bucket = await storage.getBucket(eventTrigger.eventFilters.bucket);
            eventTrigger.region = bucket.location.toLowerCase();
            logger_1.logger.debug("Setting the event trigger region to", eventTrigger.region, ".");
        }
        catch (err) {
            throw new error_1.FirebaseError("Can't find the storage bucket region", { original: err });
        }
    }
    if (endpoint.region !== eventTrigger.region &&
        eventTrigger.region !== "us-central1" &&
        !(0, location_1.regionInLocation)(endpoint.region, eventTrigger.region)) {
        throw new error_1.FirebaseError(`A function in region ${endpoint.region} cannot listen to a bucket in region ${eventTrigger.region}`);
    }
}
exports.ensureStorageTriggerRegion = ensureStorageTriggerRegion;
//# sourceMappingURL=storage.js.map