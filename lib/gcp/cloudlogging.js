"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listEntries = void 0;
const api = require("../api");
const error_1 = require("../error");
const API_VERSION = "v2";
async function listEntries(projectId, filter, pageSize, order) {
    const endpoint = `/${API_VERSION}/entries:list`;
    try {
        const result = await api.request("POST", endpoint, {
            auth: true,
            data: {
                resourceNames: [`projects/${projectId}`],
                filter: filter,
                orderBy: "timestamp " + order,
                pageSize: pageSize,
            },
            origin: api.cloudloggingOrigin,
        });
        return result.body.entries;
    }
    catch (err) {
        throw new error_1.FirebaseError("Failed to retrieve log entries from Google Cloud.", {
            original: err,
        });
    }
}
exports.listEntries = listEntries;
//# sourceMappingURL=cloudlogging.js.map