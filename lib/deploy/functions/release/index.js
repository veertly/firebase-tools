"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.printTriggerUrls = exports.release = void 0;
const clc = require("cli-color");
const logger_1 = require("../../../logger");
const functional_1 = require("../../../functional");
const backend = require("../backend");
const containerCleaner = require("../containerCleaner");
const planner = require("./planner");
const fabricator = require("./fabricator");
const reporter = require("./reporter");
const executor = require("./executor");
const prompts = require("../prompts");
const functionsConfig_1 = require("../../../functionsConfig");
const functionsDeployHelper_1 = require("../functionsDeployHelper");
const error_1 = require("../../../error");
async function release(context, options, payload) {
    if (!options.config.has("functions")) {
        return;
    }
    const plan = planner.createDeploymentPlan(payload.functions.backend, await backend.existingBackend(context), { filters: context.filters });
    const fnsToDelete = Object.values(plan)
        .map((regionalChanges) => regionalChanges.endpointsToDelete)
        .reduce(functional_1.reduceFlat, []);
    const shouldDelete = await prompts.promptForFunctionDeletion(fnsToDelete, options.force, options.nonInteractive);
    if (!shouldDelete) {
        for (const change of Object.values(plan)) {
            change.endpointsToDelete = [];
        }
    }
    const functionExecutor = new executor.QueueExecutor({
        retries: 30,
        backoff: 20000,
        concurrency: 40,
        maxBackoff: 40000,
    });
    const fab = new fabricator.Fabricator({
        functionExecutor,
        executor: new executor.QueueExecutor({}),
        sourceUrl: context.sourceUrl,
        storage: context.storage,
        appEngineLocation: (0, functionsConfig_1.getAppEngineLocation)(context.firebaseConfig),
    });
    const summary = await fab.applyPlan(plan);
    await reporter.logAndTrackDeployStats(summary);
    reporter.printErrors(summary);
    printTriggerUrls(payload.functions.backend);
    const haveEndpoints = backend.allEndpoints(payload.functions.backend);
    const deletedEndpoints = Object.values(plan)
        .map((r) => r.endpointsToDelete)
        .reduce(functional_1.reduceFlat, []);
    const opts = {};
    if (!context.artifactRegistryEnabled) {
        opts.ar = new containerCleaner.NoopArtifactRegistryCleaner();
    }
    await containerCleaner.cleanupBuildImages(haveEndpoints, deletedEndpoints, opts);
    const allErrors = summary.results.filter((r) => r.error).map((r) => r.error);
    if (allErrors.length) {
        const opts = allErrors.length == 1 ? { original: allErrors[0] } : { children: allErrors };
        throw new error_1.FirebaseError("There was an error deploying functions", Object.assign(Object.assign({}, opts), { exit: 2 }));
    }
}
exports.release = release;
function printTriggerUrls(results) {
    const httpsFunctions = backend.allEndpoints(results).filter(backend.isHttpsTriggered);
    if (httpsFunctions.length === 0) {
        return;
    }
    for (const httpsFunc of httpsFunctions) {
        if (!httpsFunc.uri) {
            logger_1.logger.debug("Missing URI for HTTPS function in printTriggerUrls. This shouldn't happen");
            continue;
        }
        logger_1.logger.info(clc.bold("Function URL"), `(${(0, functionsDeployHelper_1.getFunctionLabel)(httpsFunc)}):`, httpsFunc.uri);
    }
}
exports.printTriggerUrls = printTriggerUrls;
//# sourceMappingURL=index.js.map