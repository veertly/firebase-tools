"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setInvokerUpdate = exports.setInvokerCreate = exports.getIamPolicy = exports.setIamPolicy = exports.replaceService = exports.getService = exports.LOCATION_LABEL = void 0;
const apiv2_1 = require("../apiv2");
const error_1 = require("../error");
const api_1 = require("../api");
const proto = require("./proto");
const API_VERSION = "v1";
const client = new apiv2_1.Client({
    urlPrefix: api_1.runOrigin,
    auth: true,
    apiVersion: API_VERSION,
});
exports.LOCATION_LABEL = "cloud.googleapis.com/location";
async function getService(name) {
    try {
        const response = await client.get(name);
        return response.body;
    }
    catch (err) {
        throw new error_1.FirebaseError(`Failed to fetch Run service ${name}`, {
            original: err,
        });
    }
}
exports.getService = getService;
async function replaceService(name, service) {
    try {
        const response = await client.put(name, service);
        return response.body;
    }
    catch (err) {
        throw new error_1.FirebaseError(`Failed to update Run service ${name}`, {
            original: err,
        });
    }
}
exports.replaceService = replaceService;
async function setIamPolicy(name, policy, httpClient = client) {
    try {
        await httpClient.post(`${name}:setIamPolicy`, {
            policy,
            updateMask: proto.fieldMasks(policy).join(","),
        });
    }
    catch (err) {
        throw new error_1.FirebaseError(`Failed to set the IAM Policy on the Service ${name}`, {
            original: err,
        });
    }
}
exports.setIamPolicy = setIamPolicy;
async function getIamPolicy(serviceName, httpClient = client) {
    try {
        const response = await httpClient.get(`${serviceName}:getIamPolicy`);
        return response.body;
    }
    catch (err) {
        throw new error_1.FirebaseError(`Failed to get the IAM Policy on the Service ${serviceName}`, {
            original: err,
        });
    }
}
exports.getIamPolicy = getIamPolicy;
async function setInvokerCreate(projectId, serviceName, invoker, httpClient = client) {
    if (invoker.length == 0) {
        throw new error_1.FirebaseError("Invoker cannot be an empty array");
    }
    const invokerMembers = proto.getInvokerMembers(invoker, projectId);
    const invokerRole = "roles/run.invoker";
    const bindings = [{ role: invokerRole, members: invokerMembers }];
    const policy = {
        bindings: bindings,
        etag: "",
        version: 3,
    };
    await setIamPolicy(serviceName, policy, httpClient);
}
exports.setInvokerCreate = setInvokerCreate;
async function setInvokerUpdate(projectId, serviceName, invoker, httpClient = client) {
    var _a;
    if (invoker.length == 0) {
        throw new error_1.FirebaseError("Invoker cannot be an empty array");
    }
    const invokerMembers = proto.getInvokerMembers(invoker, projectId);
    const invokerRole = "roles/run.invoker";
    const currentPolicy = await getIamPolicy(serviceName, httpClient);
    const currentInvokerBinding = (_a = currentPolicy.bindings) === null || _a === void 0 ? void 0 : _a.find((binding) => binding.role === invokerRole);
    if (currentInvokerBinding &&
        JSON.stringify(currentInvokerBinding.members.sort()) === JSON.stringify(invokerMembers.sort())) {
        return;
    }
    const bindings = (currentPolicy.bindings || []).filter((binding) => binding.role !== invokerRole);
    bindings.push({
        role: invokerRole,
        members: invokerMembers,
    });
    const policy = {
        bindings: bindings,
        etag: currentPolicy.etag || "",
        version: 3,
    };
    await setIamPolicy(serviceName, policy, httpClient);
}
exports.setInvokerUpdate = setInvokerUpdate;
//# sourceMappingURL=run.js.map