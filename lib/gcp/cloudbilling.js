"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listBillingAccounts = exports.setBillingAccount = exports.checkBillingEnabled = void 0;
const api = require("../api");
const utils = require("../utils");
const API_VERSION = "v1";
async function checkBillingEnabled(projectId) {
    const res = await api.request("GET", utils.endpoint([API_VERSION, "projects", projectId, "billingInfo"]), {
        auth: true,
        origin: api.cloudbillingOrigin,
        retryCodes: [500, 503],
    });
    return res.body.billingEnabled;
}
exports.checkBillingEnabled = checkBillingEnabled;
async function setBillingAccount(projectId, billingAccountName) {
    const res = await api.request("PUT", utils.endpoint([API_VERSION, "projects", projectId, "billingInfo"]), {
        auth: true,
        origin: api.cloudbillingOrigin,
        retryCodes: [500, 503],
        data: {
            billingAccountName: billingAccountName,
        },
    });
    return res.body.billingEnabled;
}
exports.setBillingAccount = setBillingAccount;
async function listBillingAccounts() {
    const res = await api.request("GET", utils.endpoint([API_VERSION, "billingAccounts"]), {
        auth: true,
        origin: api.cloudbillingOrigin,
        retryCodes: [500, 503],
    });
    return res.body.billingAccounts || [];
}
exports.listBillingAccounts = listBillingAccounts;
//# sourceMappingURL=cloudbilling.js.map