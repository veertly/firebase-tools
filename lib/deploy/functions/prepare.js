"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferDetailsFromExisting = exports.prepare = void 0;
const clc = require("cli-color");
const ensureCloudBuildEnabled_1 = require("./ensureCloudBuildEnabled");
const functionsDeployHelper_1 = require("./functionsDeployHelper");
const utils_1 = require("../../utils");
const prepareFunctionsUpload_1 = require("./prepareFunctionsUpload");
const prompts_1 = require("./prompts");
const backend = require("./backend");
const ensureApiEnabled = require("../../ensureApiEnabled");
const functionsConfig = require("../../functionsConfig");
const functionsEnv = require("../../functions/env");
const previews_1 = require("../../previews");
const projectUtils_1 = require("../../projectUtils");
const track_1 = require("../../track");
const runtimes = require("./runtimes");
const validate = require("./validate");
const logger_1 = require("../../logger");
const triggerRegionHelper_1 = require("./triggerRegionHelper");
const checkIam_1 = require("./checkIam");
const error_1 = require("../../error");
function hasUserConfig(config) {
    return Object.keys(config).length > 1;
}
function hasDotenv(opts) {
    return previews_1.previews.dotenv && functionsEnv.hasUserEnvs(opts);
}
async function maybeEnableAR(projectId) {
    if (previews_1.previews.artifactregistry) {
        return ensureApiEnabled.check(projectId, "artifactregistry.googleapis.com", "functions", true);
    }
    await ensureApiEnabled.ensure(projectId, "artifactregistry.googleapis.com", "functions");
    return true;
}
async function prepare(context, options, payload) {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const sourceDirName = options.config.get("functions.source");
    if (!sourceDirName) {
        throw new error_1.FirebaseError(`No functions code detected at default location (./functions), and no functions.source defined in firebase.json`);
    }
    const sourceDir = options.config.path(sourceDirName);
    const delegateContext = {
        projectId,
        sourceDir,
        projectDir: options.config.projectDir,
        runtime: options.config.get("functions.runtime") || "",
    };
    const runtimeDelegate = await runtimes.getRuntimeDelegate(delegateContext);
    logger_1.logger.debug(`Validating ${runtimeDelegate.name} source`);
    await runtimeDelegate.validate();
    logger_1.logger.debug(`Building ${runtimeDelegate.name} source`);
    await runtimeDelegate.build();
    const checkAPIsEnabled = await Promise.all([
        ensureApiEnabled.ensure(projectId, "cloudfunctions.googleapis.com", "functions"),
        ensureApiEnabled.check(projectId, "runtimeconfig.googleapis.com", "runtimeconfig", true),
        (0, ensureCloudBuildEnabled_1.ensureCloudBuildEnabled)(projectId),
        maybeEnableAR(projectId),
    ]);
    context.runtimeConfigEnabled = checkAPIsEnabled[1];
    context.artifactRegistryEnabled = checkAPIsEnabled[3];
    const firebaseConfig = await functionsConfig.getFirebaseConfig(options);
    context.firebaseConfig = firebaseConfig;
    const runtimeConfig = await (0, prepareFunctionsUpload_1.getFunctionsConfig)(context);
    const firebaseEnvs = functionsEnv.loadFirebaseEnvs(firebaseConfig, projectId);
    const userEnvOpt = {
        functionsSource: sourceDir,
        projectId: projectId,
        projectAlias: options.projectAlias,
    };
    const userEnvs = functionsEnv.loadUserEnvs(userEnvOpt);
    const usedDotenv = hasDotenv(userEnvOpt);
    const tag = hasUserConfig(runtimeConfig)
        ? usedDotenv
            ? "mixed"
            : "runtime_config"
        : usedDotenv
            ? "dotenv"
            : "none";
    await (0, track_1.track)("functions_codebase_deploy_env_method", tag);
    logger_1.logger.debug(`Analyzing ${runtimeDelegate.name} backend spec`);
    const wantBackend = await runtimeDelegate.discoverSpec(runtimeConfig, firebaseEnvs);
    wantBackend.environmentVariables = Object.assign(Object.assign({}, userEnvs), firebaseEnvs);
    payload.functions = { backend: wantBackend };
    if (backend.someEndpoint(wantBackend, (e) => e.platform === "gcfv2")) {
        const V2_APIS = [
            "artifactregistry.googleapis.com",
            "run.googleapis.com",
            "eventarc.googleapis.com",
            "pubsub.googleapis.com",
            "storage.googleapis.com",
        ];
        const enablements = V2_APIS.map((api) => {
            return ensureApiEnabled.ensure(context.projectId, api, "functions");
        });
        await Promise.all(enablements);
    }
    if (backend.someEndpoint(wantBackend, () => true)) {
        (0, utils_1.logBullet)(clc.cyan.bold("functions:") +
            " preparing " +
            clc.bold(sourceDirName) +
            " directory for uploading...");
    }
    if (backend.someEndpoint(wantBackend, (e) => e.platform === "gcfv1")) {
        context.functionsSourceV1 = await (0, prepareFunctionsUpload_1.prepareFunctionsUpload)(runtimeConfig, options);
    }
    if (backend.someEndpoint(wantBackend, (e) => e.platform === "gcfv2")) {
        context.functionsSourceV2 = await (0, prepareFunctionsUpload_1.prepareFunctionsUpload)(undefined, options);
    }
    for (const endpoint of backend.allEndpoints(wantBackend)) {
        endpoint.environmentVariables = wantBackend.environmentVariables;
    }
    await Promise.all(Object.values(wantBackend.requiredAPIs).map((api) => {
        return ensureApiEnabled.ensure(projectId, api, "functions", false);
    }));
    validate.functionIdsAreValid(backend.allEndpoints(wantBackend));
    context.filters = (0, functionsDeployHelper_1.getFilterGroups)(options);
    const matchingBackend = backend.matchingBackend(wantBackend, (endpoint) => {
        return (0, functionsDeployHelper_1.functionMatchesAnyGroup)(endpoint, context.filters);
    });
    const haveBackend = await backend.existingBackend(context);
    await (0, checkIam_1.ensureServiceAgentRoles)(projectId, wantBackend, haveBackend);
    inferDetailsFromExisting(wantBackend, haveBackend, usedDotenv);
    await (0, triggerRegionHelper_1.ensureTriggerRegions)(wantBackend);
    await (0, prompts_1.promptForFailurePolicies)(options, matchingBackend, haveBackend);
    await (0, prompts_1.promptForMinInstances)(options, matchingBackend, haveBackend);
    await backend.checkAvailability(context, wantBackend);
}
exports.prepare = prepare;
function inferDetailsFromExisting(want, have, usedDotenv) {
    var _a;
    for (const wantE of backend.allEndpoints(want)) {
        const haveE = (_a = have.endpoints[wantE.region]) === null || _a === void 0 ? void 0 : _a[wantE.id];
        if (!haveE) {
            continue;
        }
        if (!usedDotenv) {
            wantE.environmentVariables = Object.assign(Object.assign({}, haveE.environmentVariables), wantE.environmentVariables);
        }
        if (!wantE.availableMemoryMb && haveE.availableMemoryMb) {
            wantE.availableMemoryMb = haveE.availableMemoryMb;
        }
        maybeCopyTriggerRegion(wantE, haveE);
    }
}
exports.inferDetailsFromExisting = inferDetailsFromExisting;
function maybeCopyTriggerRegion(wantE, haveE) {
    if (!backend.isEventTriggered(wantE) || !backend.isEventTriggered(haveE)) {
        return;
    }
    if (wantE.eventTrigger.region || !haveE.eventTrigger.region) {
        return;
    }
    if (JSON.stringify(haveE.eventTrigger.eventFilters) !==
        JSON.stringify(wantE.eventTrigger.eventFilters)) {
        return;
    }
    wantE.eventTrigger.region = haveE.eventTrigger.region;
}
//# sourceMappingURL=prepare.js.map