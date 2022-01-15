"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getServiceAccount = exports.getBucket = exports.deleteObject = exports.uploadObject = exports.upload = exports.getDefaultBucket = void 0;
const path = require("path");
const api = require("../api");
const logger_1 = require("../logger");
const error_1 = require("../error");
async function getDefaultBucket(projectId) {
    try {
        const resp = await api.request("GET", "/v1/apps/" + projectId, {
            auth: true,
            origin: api.appengineOrigin,
        });
        if (resp.body.defaultBucket === "undefined") {
            logger_1.logger.debug("Default storage bucket is undefined.");
            throw new error_1.FirebaseError("Your project is being set up. Please wait a minute before deploying again.");
        }
        return resp.body.defaultBucket;
    }
    catch (err) {
        logger_1.logger.info("\n\nThere was an issue deploying your functions. Verify that your project has a Google App Engine instance setup at https://console.cloud.google.com/appengine and try again. If this issue persists, please contact support.");
        throw err;
    }
}
exports.getDefaultBucket = getDefaultBucket;
async function upload(source, uploadUrl, extraHeaders) {
    const url = new URL(uploadUrl);
    const result = await api.request("PUT", url.pathname + url.search, {
        data: source.stream,
        headers: Object.assign({ "Content-Type": "application/zip" }, extraHeaders),
        json: false,
        origin: url.origin,
        logOptions: { skipRequestBody: true },
    });
    return {
        generation: result.response.headers["x-goog-generation"],
    };
}
exports.upload = upload;
async function uploadObject(source, bucketName) {
    if (path.extname(source.file) !== ".zip") {
        throw new error_1.FirebaseError(`Expected a file name ending in .zip, got ${source.file}`);
    }
    const location = `/${bucketName}/${path.basename(source.file)}`;
    const result = await api.request("PUT", location, {
        auth: true,
        data: source.stream,
        headers: {
            "Content-Type": "application/zip",
            "x-goog-content-length-range": "0,123289600",
        },
        json: false,
        origin: api.storageOrigin,
        logOptions: { skipRequestBody: true },
    });
    return {
        bucket: bucketName,
        object: path.basename(source.file),
        generation: result.response.headers["x-goog-generation"],
    };
}
exports.uploadObject = uploadObject;
function deleteObject(location) {
    return api.request("DELETE", location, {
        auth: true,
        origin: api.storageOrigin,
    });
}
exports.deleteObject = deleteObject;
async function getBucket(bucketName) {
    try {
        const result = await api.request("GET", `/storage/v1/b/${bucketName}`, {
            auth: true,
            origin: api.storageOrigin,
        });
        return result.body;
    }
    catch (err) {
        logger_1.logger.debug(err);
        throw new error_1.FirebaseError("Failed to obtain the storage bucket", {
            original: err,
        });
    }
}
exports.getBucket = getBucket;
async function getServiceAccount(projectId) {
    try {
        const response = await api.request("GET", `/storage/v1/projects/${projectId}/serviceAccount`, {
            auth: true,
            origin: api.storageOrigin,
        });
        return response.body;
    }
    catch (err) {
        logger_1.logger.debug(err);
        throw new error_1.FirebaseError("Failed to obtain the Cloud Storage service agent", {
            original: err,
        });
    }
}
exports.getServiceAccount = getServiceAccount;
//# sourceMappingURL=storage.js.map