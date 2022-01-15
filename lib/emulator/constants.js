"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Constants = exports.EMULATOR_DESCRIPTION = exports.FIND_AVAILBLE_PORT_BY_DEFAULT = void 0;
const url = require("url");
const DEFAULT_PORTS = {
    ui: 4000,
    hub: 4400,
    logging: 4500,
    hosting: 5000,
    functions: 5001,
    firestore: 8080,
    pubsub: 8085,
    database: 9000,
    auth: 9099,
    storage: 9199,
};
exports.FIND_AVAILBLE_PORT_BY_DEFAULT = {
    ui: true,
    hub: true,
    logging: true,
    hosting: false,
    functions: false,
    firestore: false,
    database: false,
    pubsub: false,
    auth: false,
    storage: false,
};
exports.EMULATOR_DESCRIPTION = {
    ui: "Emulator UI",
    hub: "emulator hub",
    logging: "Logging Emulator",
    hosting: "Hosting Emulator",
    functions: "Functions Emulator",
    firestore: "Firestore Emulator",
    database: "Database Emulator",
    pubsub: "Pub/Sub Emulator",
    auth: "Authentication Emulator",
    storage: "Storage Emulator",
};
const DEFAULT_HOST = "localhost";
class Constants {
    static getServiceName(service) {
        switch (service) {
            case this.SERVICE_FIRESTORE:
                return "firestore";
            case this.SERVICE_REALTIME_DATABASE:
                return "database";
            case this.SERVICE_PUBSUB:
                return "pubsub";
            case this.SERVICE_ANALYTICS:
                return "analytics";
            case this.SERVICE_AUTH:
                return "auth";
            case this.SERVICE_CRASHLYTICS:
                return "crashlytics";
            case this.SERVICE_REMOTE_CONFIG:
                return "remote config";
            case this.SERVICE_STORAGE:
                return "storage";
            case this.SERVICE_TEST_LAB:
                return "test lab";
            default:
                return service;
        }
    }
    static getDefaultHost(emulator) {
        return DEFAULT_HOST;
    }
    static getDefaultPort(emulator) {
        return DEFAULT_PORTS[emulator];
    }
    static description(name) {
        return exports.EMULATOR_DESCRIPTION[name];
    }
    static normalizeHost(host) {
        let normalized = host;
        if (!normalized.startsWith("http")) {
            normalized = `http://${normalized}`;
        }
        const u = url.parse(normalized);
        return u.hostname || DEFAULT_HOST;
    }
    static isDemoProject(projectId) {
        return !!projectId && projectId.startsWith(this.FAKE_PROJECT_ID_PREFIX);
    }
}
exports.Constants = Constants;
Constants.FAKE_PROJECT_ID_PREFIX = "demo-";
Constants.DEFAULT_DATABASE_EMULATOR_NAMESPACE = "fake-server";
Constants.FIRESTORE_EMULATOR_HOST = "FIRESTORE_EMULATOR_HOST";
Constants.FIREBASE_DATABASE_EMULATOR_HOST = "FIREBASE_DATABASE_EMULATOR_HOST";
Constants.FIREBASE_AUTH_EMULATOR_HOST = "FIREBASE_AUTH_EMULATOR_HOST";
Constants.FIREBASE_STORAGE_EMULATOR_HOST = "FIREBASE_STORAGE_EMULATOR_HOST";
Constants.CLOUD_STORAGE_EMULATOR_HOST = "STORAGE_EMULATOR_HOST";
Constants.FIREBASE_EMULATOR_HUB = "FIREBASE_EMULATOR_HUB";
Constants.SERVICE_FIRESTORE = "firestore.googleapis.com";
Constants.SERVICE_REALTIME_DATABASE = "firebaseio.com";
Constants.SERVICE_PUBSUB = "pubsub.googleapis.com";
Constants.SERVICE_ANALYTICS = "app-measurement.com";
Constants.SERVICE_AUTH = "firebaseauth.googleapis.com";
Constants.SERVICE_CRASHLYTICS = "fabric.io";
Constants.SERVICE_REMOTE_CONFIG = "firebaseremoteconfig.googleapis.com";
Constants.SERVICE_STORAGE = "storage.googleapis.com";
Constants.SERVICE_TEST_LAB = "testing.googleapis.com";
//# sourceMappingURL=constants.js.map