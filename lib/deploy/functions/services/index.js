"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serviceForEndpoint = exports.EVENT_SERVICE_MAPPING = exports.StorageService = exports.PubSubService = exports.NoOpService = void 0;
const backend = require("../backend");
const storage_1 = require("./storage");
const noop = () => Promise.resolve();
exports.NoOpService = {
    name: "noop",
    api: "",
    requiredProjectBindings: undefined,
    ensureTriggerRegion: noop,
};
exports.PubSubService = {
    name: "pubsub",
    api: "pubsub.googleapis.com",
    requiredProjectBindings: undefined,
    ensureTriggerRegion: noop,
};
exports.StorageService = {
    name: "storage",
    api: "storage.googleapis.com",
    requiredProjectBindings: storage_1.obtainStorageBindings,
    ensureTriggerRegion: storage_1.ensureStorageTriggerRegion,
};
exports.EVENT_SERVICE_MAPPING = {
    "google.cloud.pubsub.topic.v1.messagePublished": exports.PubSubService,
    "google.cloud.storage.object.v1.finalized": exports.StorageService,
    "google.cloud.storage.object.v1.archived": exports.StorageService,
    "google.cloud.storage.object.v1.deleted": exports.StorageService,
    "google.cloud.storage.object.v1.metadataUpdated": exports.StorageService,
};
function serviceForEndpoint(endpoint) {
    if (!backend.isEventTriggered(endpoint)) {
        return exports.NoOpService;
    }
    return exports.EVENT_SERVICE_MAPPING[endpoint.eventTrigger.eventType] || exports.NoOpService;
}
exports.serviceForEndpoint = serviceForEndpoint;
//# sourceMappingURL=index.js.map