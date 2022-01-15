"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobFromEndpoint = exports.createOrReplaceJob = exports.updateJob = exports.getJob = exports.deleteJob = exports.createJob = exports.assertValidJob = void 0;
const _ = require("lodash");
const error_1 = require("../error");
const logger_1 = require("../logger");
const api = require("../api");
const backend = require("../deploy/functions/backend");
const proto = require("./proto");
const functional_1 = require("../functional");
const VERSION = "v1beta1";
const DEFAULT_TIME_ZONE = "America/Los_Angeles";
function assertValidJob(job) {
    proto.assertOneOf("Scheduler Job", job, "target", "httpTarget", "pubsubTarget");
    if (job.httpTarget) {
        proto.assertOneOf("Scheduler Job", job.httpTarget, "httpTarget.authorizationHeader", "oauthToken", "odicToken");
    }
}
exports.assertValidJob = assertValidJob;
function createJob(job) {
    const strippedName = job.name.substring(0, job.name.lastIndexOf("/"));
    return api.request("POST", `/${VERSION}/${strippedName}`, {
        auth: true,
        origin: api.cloudschedulerOrigin,
        data: Object.assign({ timeZone: DEFAULT_TIME_ZONE }, job),
    });
}
exports.createJob = createJob;
function deleteJob(name) {
    return api.request("DELETE", `/${VERSION}/${name}`, {
        auth: true,
        origin: api.cloudschedulerOrigin,
    });
}
exports.deleteJob = deleteJob;
function getJob(name) {
    return api.request("GET", `/${VERSION}/${name}`, {
        auth: true,
        origin: api.cloudschedulerOrigin,
        resolveOnHTTPError: true,
    });
}
exports.getJob = getJob;
function updateJob(job) {
    return api.request("PATCH", `/${VERSION}/${job.name}`, {
        auth: true,
        origin: api.cloudschedulerOrigin,
        data: Object.assign({ timeZone: DEFAULT_TIME_ZONE }, job),
    });
}
exports.updateJob = updateJob;
async function createOrReplaceJob(job) {
    var _a, _b;
    const jobName = job.name.split("/").pop();
    const existingJob = await getJob(job.name);
    if (existingJob.status === 404) {
        let newJob;
        try {
            newJob = await createJob(job);
        }
        catch (err) {
            if (((_b = (_a = err === null || err === void 0 ? void 0 : err.context) === null || _a === void 0 ? void 0 : _a.response) === null || _b === void 0 ? void 0 : _b.statusCode) === 404) {
                throw new error_1.FirebaseError(`Cloud resource location is not set for this project but scheduled functions require it. ` +
                    `Please see this documentation for more details: https://firebase.google.com/docs/projects/locations.`);
            }
            throw new error_1.FirebaseError(`Failed to create scheduler job ${job.name}: ${err.message}`);
        }
        logger_1.logger.debug(`created scheduler job ${jobName}`);
        return newJob;
    }
    if (!job.timeZone) {
        job.timeZone = DEFAULT_TIME_ZONE;
    }
    if (isIdentical(existingJob.body, job)) {
        logger_1.logger.debug(`scheduler job ${jobName} is up to date, no changes required`);
        return;
    }
    const updatedJob = await updateJob(job);
    logger_1.logger.debug(`updated scheduler job ${jobName}`);
    return updatedJob;
}
exports.createOrReplaceJob = createOrReplaceJob;
function isIdentical(job, otherJob) {
    return (job &&
        otherJob &&
        job.schedule === otherJob.schedule &&
        job.timeZone === otherJob.timeZone &&
        _.isEqual(job.retryConfig, otherJob.retryConfig));
}
function jobFromEndpoint(endpoint, appEngineLocation) {
    const job = {};
    if (endpoint.platform === "gcfv1") {
        const id = backend.scheduleIdForFunction(endpoint);
        const region = appEngineLocation;
        job.name = `projects/${endpoint.project}/locations/${region}/jobs/${id}`;
        job.pubsubTarget = {
            topicName: `projects/${endpoint.project}/topics/${id}`,
            attributes: {
                scheduled: "true",
            },
        };
    }
    else if (endpoint.platform === "gcfv2") {
        throw new error_1.FirebaseError("Do not know how to create a scheduled GCFv2 function");
    }
    else {
        (0, functional_1.assertExhaustive)(endpoint.platform);
    }
    proto.copyIfPresent(job, endpoint.scheduleTrigger, "schedule", "retryConfig", "timeZone");
    return job;
}
exports.jobFromEndpoint = jobFromEndpoint;
//# sourceMappingURL=cloudscheduler.js.map