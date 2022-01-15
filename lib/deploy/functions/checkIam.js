"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureServiceAgentRoles = exports.mergeBindings = exports.checkHttpIam = exports.checkServiceAccountIam = void 0;
const cli_color_1 = require("cli-color");
const logger_1 = require("../../logger");
const functionsDeployHelper_1 = require("./functionsDeployHelper");
const error_1 = require("../../error");
const iam = require("../../gcp/iam");
const backend = require("./backend");
const track = require("../../track");
const utils = require("../../utils");
const resourceManager_1 = require("../../gcp/resourceManager");
const services_1 = require("./services");
const PERMISSION = "cloudfunctions.functions.setIamPolicy";
async function checkServiceAccountIam(projectId) {
    const saEmail = `${projectId}@appspot.gserviceaccount.com`;
    let passed = false;
    try {
        const iamResult = await iam.testResourceIamPermissions("https://iam.googleapis.com", "v1", `projects/${projectId}/serviceAccounts/${saEmail}`, ["iam.serviceAccounts.actAs"]);
        passed = iamResult.passed;
    }
    catch (err) {
        logger_1.logger.debug("[functions] service account IAM check errored, deploy may fail:", err);
        return;
    }
    if (!passed) {
        throw new error_1.FirebaseError(`Missing permissions required for functions deploy. You must have permission ${(0, cli_color_1.bold)("iam.serviceAccounts.ActAs")} on service account ${(0, cli_color_1.bold)(saEmail)}.\n\n` +
            `To address this error, ask a project Owner to assign your account the "Service Account User" role from this URL:\n\n` +
            `https://console.cloud.google.com/iam-admin/iam?project=${projectId}`);
    }
}
exports.checkServiceAccountIam = checkServiceAccountIam;
async function checkHttpIam(context, options, payload) {
    const filterGroups = context.filters || (0, functionsDeployHelper_1.getFilterGroups)(options);
    const httpEndpoints = backend
        .allEndpoints(payload.functions.backend)
        .filter(backend.isHttpsTriggered)
        .filter((f) => (0, functionsDeployHelper_1.functionMatchesAnyGroup)(f, filterGroups));
    const existing = await backend.existingBackend(context);
    const newHttpsEndpoints = httpEndpoints.filter(backend.missingEndpoint(existing));
    if (newHttpsEndpoints.length === 0) {
        return;
    }
    logger_1.logger.debug("[functions] found", newHttpsEndpoints.length, "new HTTP functions, testing setIamPolicy permission...");
    let passed = true;
    try {
        const iamResult = await iam.testIamPermissions(context.projectId, [PERMISSION]);
        passed = iamResult.passed;
    }
    catch (e) {
        logger_1.logger.debug("[functions] failed http create setIamPolicy permission check. deploy may fail:", e);
        return;
    }
    if (!passed) {
        track("Error (User)", "deploy:functions:http_create_missing_iam");
        throw new error_1.FirebaseError(`Missing required permission on project ${(0, cli_color_1.bold)(context.projectId)} to deploy new HTTPS functions. The permission ${(0, cli_color_1.bold)(PERMISSION)} is required to deploy the following functions:\n\n- ` +
            newHttpsEndpoints.map((func) => func.id).join("\n- ") +
            `\n\nTo address this error, please ask a project Owner to assign your account the "Cloud Functions Admin" role at the following URL:\n\nhttps://console.cloud.google.com/iam-admin/iam?project=${context.projectId}`);
    }
    logger_1.logger.debug("[functions] found setIamPolicy permission, proceeding with deploy");
}
exports.checkHttpIam = checkHttpIam;
function reduceEventsToServices(services, endpoint) {
    const service = (0, services_1.serviceForEndpoint)(endpoint);
    if (service.requiredProjectBindings && !services.find((s) => s.name === service.name)) {
        services.push(service);
    }
    return services;
}
function mergeBindings(policy, allRequiredBindings) {
    for (const requiredBindings of allRequiredBindings) {
        if (requiredBindings.length === 0) {
            continue;
        }
        for (const requiredBinding of requiredBindings) {
            const ndx = policy.bindings.findIndex((policyBinding) => policyBinding.role === requiredBinding.role);
            if (ndx === -1) {
                policy.bindings.push(requiredBinding);
                continue;
            }
            requiredBinding.members.forEach((updatedMember) => {
                if (!policy.bindings[ndx].members.find((member) => member === updatedMember)) {
                    policy.bindings[ndx].members.push(updatedMember);
                }
            });
        }
    }
}
exports.mergeBindings = mergeBindings;
async function ensureServiceAgentRoles(projectId, want, have) {
    const wantServices = backend.allEndpoints(want).reduce(reduceEventsToServices, []);
    const haveServices = backend.allEndpoints(have).reduce(reduceEventsToServices, []);
    const newServices = wantServices.filter((wantS) => !haveServices.find((haveS) => wantS.name === haveS.name));
    if (newServices.length === 0) {
        return;
    }
    let policy;
    try {
        policy = await (0, resourceManager_1.getIamPolicy)(projectId);
    }
    catch (err) {
        utils.logLabeledBullet("functions", "Could not verify the necessary IAM configuration for the following newly-integrated services: " +
            `${newServices.map((service) => service.api).join(", ")}` +
            ". Deployment may fail.", "warn");
        return;
    }
    const findRequiredBindings = [];
    newServices.forEach((service) => findRequiredBindings.push(service.requiredProjectBindings(projectId, policy)));
    const allRequiredBindings = await Promise.all(findRequiredBindings);
    mergeBindings(policy, allRequiredBindings);
    try {
        await (0, resourceManager_1.setIamPolicy)(projectId, policy, "bindings");
    }
    catch (err) {
        throw new error_1.FirebaseError("We failed to modify the IAM policy for the project. The functions " +
            "deployment requires specific roles to be granted to service agents," +
            " otherwise the deployment will fail.", { original: err });
    }
}
exports.ensureServiceAgentRoles = ensureServiceAgentRoles;
//# sourceMappingURL=checkIam.js.map