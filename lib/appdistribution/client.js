"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppDistributionClient = exports.UploadReleaseResult = exports.IntegrationState = void 0;
const _ = require("lodash");
const api = require("../api");
const utils = require("../utils");
const operationPoller = require("../operation-poller");
const error_1 = require("../error");
const apiv2_1 = require("../apiv2");
var IntegrationState;
(function (IntegrationState) {
    IntegrationState["AAB_INTEGRATION_STATE_UNSPECIFIED"] = "AAB_INTEGRATION_STATE_UNSPECIFIED";
    IntegrationState["INTEGRATED"] = "INTEGRATED";
    IntegrationState["PLAY_ACCOUNT_NOT_LINKED"] = "PLAY_ACCOUNT_NOT_LINKED";
    IntegrationState["NO_APP_WITH_GIVEN_BUNDLE_ID_IN_PLAY_ACCOUNT"] = "NO_APP_WITH_GIVEN_BUNDLE_ID_IN_PLAY_ACCOUNT";
    IntegrationState["APP_NOT_PUBLISHED"] = "APP_NOT_PUBLISHED";
    IntegrationState["AAB_STATE_UNAVAILABLE"] = "AAB_STATE_UNAVAILABLE";
    IntegrationState["PLAY_IAS_TERMS_NOT_ACCEPTED"] = "PLAY_IAS_TERMS_NOT_ACCEPTED";
})(IntegrationState = exports.IntegrationState || (exports.IntegrationState = {}));
var UploadReleaseResult;
(function (UploadReleaseResult) {
    UploadReleaseResult["UPLOAD_RELEASE_RESULT_UNSPECIFIED"] = "UPLOAD_RELEASE_RESULT_UNSPECIFIED";
    UploadReleaseResult["RELEASE_CREATED"] = "RELEASE_CREATED";
    UploadReleaseResult["RELEASE_UPDATED"] = "RELEASE_UPDATED";
    UploadReleaseResult["RELEASE_UNMODIFIED"] = "RELEASE_UNMODIFIED";
})(UploadReleaseResult = exports.UploadReleaseResult || (exports.UploadReleaseResult = {}));
class AppDistributionClient {
    constructor() {
        this.appDistroV2Client = new apiv2_1.Client({
            urlPrefix: api.appDistributionOrigin,
            apiVersion: "v1",
        });
    }
    async getAabInfo(appName) {
        const apiResponse = await api.request("GET", `/v1/${appName}/aabInfo`, {
            origin: api.appDistributionOrigin,
            auth: true,
        });
        return _.get(apiResponse, "body");
    }
    async uploadRelease(appName, distribution) {
        const apiResponse = await api.request("POST", `/upload/v1/${appName}/releases:upload`, {
            auth: true,
            origin: api.appDistributionOrigin,
            headers: {
                "X-Goog-Upload-File-Name": distribution.getFileName(),
                "X-Goog-Upload-Protocol": "raw",
                "Content-Type": "application/octet-stream",
            },
            data: distribution.readStream(),
            json: false,
        });
        return _.get(JSON.parse(apiResponse.body), "name");
    }
    async pollUploadStatus(operationName) {
        return operationPoller.pollOperation({
            pollerName: "App Distribution Upload Poller",
            apiOrigin: api.appDistributionOrigin,
            apiVersion: "v1",
            operationResourceName: operationName,
            masterTimeout: 5 * 60 * 1000,
            backoff: 1000,
            maxBackoff: 10 * 1000,
        });
    }
    async updateReleaseNotes(releaseName, releaseNotes) {
        if (!releaseNotes) {
            utils.logWarning("no release notes specified, skipping");
            return;
        }
        utils.logBullet("updating release notes...");
        const data = {
            name: releaseName,
            releaseNotes: {
                text: releaseNotes,
            },
        };
        try {
            await api.request("PATCH", `/v1/${releaseName}?updateMask=release_notes.text`, {
                origin: api.appDistributionOrigin,
                auth: true,
                data,
            });
        }
        catch (err) {
            throw new error_1.FirebaseError(`failed to update release notes with ${err === null || err === void 0 ? void 0 : err.message}`, { exit: 1 });
        }
        utils.logSuccess("added release notes successfully");
    }
    async distribute(releaseName, testerEmails = [], groupAliases = []) {
        if (testerEmails.length === 0 && groupAliases.length === 0) {
            utils.logWarning("no testers or groups specified, skipping");
            return;
        }
        utils.logBullet("distributing to testers/groups...");
        const data = {
            testerEmails,
            groupAliases,
        };
        try {
            await api.request("POST", `/v1/${releaseName}:distribute`, {
                origin: api.appDistributionOrigin,
                auth: true,
                data,
            });
        }
        catch (err) {
            let errorMessage = err.message;
            if (_.has(err, "context.body.error")) {
                const errorStatus = _.get(err, "context.body.error.status");
                if (errorStatus === "FAILED_PRECONDITION") {
                    errorMessage = "invalid testers";
                }
                else if (errorStatus === "INVALID_ARGUMENT") {
                    errorMessage = "invalid groups";
                }
            }
            throw new error_1.FirebaseError(`failed to distribute to testers/groups: ${errorMessage}`, {
                exit: 1,
            });
        }
        utils.logSuccess("distributed to testers/groups successfully");
    }
    async addTesters(projectName, emails) {
        try {
            await this.appDistroV2Client.request({
                method: "POST",
                path: `${projectName}/testers:batchAdd`,
                body: { emails: emails },
            });
        }
        catch (err) {
            throw new error_1.FirebaseError(`Failed to add testers ${err}`);
        }
        utils.logSuccess(`Testers created successfully`);
    }
    async removeTesters(projectName, emails) {
        let apiResponse;
        try {
            apiResponse = await this.appDistroV2Client.request({
                method: "POST",
                path: `${projectName}/testers:batchRemove`,
                body: { emails: emails },
            });
        }
        catch (err) {
            throw new error_1.FirebaseError(`Failed to remove testers ${err}`);
        }
        return apiResponse.body;
    }
}
exports.AppDistributionClient = AppDistributionClient;
//# sourceMappingURL=client.js.map