"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Fabricator = void 0;
const clc = require("cli-color");
const error_1 = require("../../../error");
const sourceTokenScraper_1 = require("./sourceTokenScraper");
const timer_1 = require("./timer");
const functional_1 = require("../../../functional");
const runtimes_1 = require("../runtimes");
const api_1 = require("../../../api");
const logger_1 = require("../../../logger");
const backend = require("../backend");
const cloudtasks = require("../../../gcp/cloudtasks");
const deploymentTool = require("../../../deploymentTool");
const gcf = require("../../../gcp/cloudfunctions");
const gcfV2 = require("../../../gcp/cloudfunctionsv2");
const helper = require("../functionsDeployHelper");
const poller = require("../../../operation-poller");
const pubsub = require("../../../gcp/pubsub");
const reporter = require("./reporter");
const run = require("../../../gcp/run");
const scheduler = require("../../../gcp/cloudscheduler");
const utils = require("../../../utils");
const gcfV1PollerOptions = {
    apiOrigin: api_1.functionsOrigin,
    apiVersion: gcf.API_VERSION,
    masterTimeout: 25 * 60 * 1000,
    maxBackoff: 10000,
};
const gcfV2PollerOptions = {
    apiOrigin: api_1.functionsV2Origin,
    apiVersion: gcfV2.API_VERSION,
    masterTimeout: 25 * 60 * 1000,
    maxBackoff: 10000,
};
const DEFAULT_GCFV2_CONCURRENCY = 80;
const rethrowAs = (endpoint, op) => (err) => {
    throw new reporter.DeploymentError(endpoint, op, err);
};
class Fabricator {
    constructor(args) {
        this.executor = args.executor;
        this.functionExecutor = args.functionExecutor;
        this.sourceUrl = args.sourceUrl;
        this.storage = args.storage;
        this.appEngineLocation = args.appEngineLocation;
    }
    async applyPlan(plan) {
        const timer = new timer_1.Timer();
        const summary = {
            totalTime: 0,
            results: [],
        };
        const deployRegions = Object.values(plan).map(async (changes) => {
            const results = await this.applyRegionalChanges(changes);
            summary.results.push(...results);
            return;
        });
        const promiseResults = await utils.allSettled(deployRegions);
        const errs = promiseResults
            .filter((r) => r.status === "rejected")
            .map((r) => r.reason);
        if (errs.length) {
            logger_1.logger.debug("Fabricator.applyRegionalChanges returned an unhandled exception. This should never happen", JSON.stringify(errs, null, 2));
        }
        summary.totalTime = timer.stop();
        return summary;
    }
    async applyRegionalChanges(changes) {
        const deployResults = [];
        const handle = async (op, endpoint, fn) => {
            const timer = new timer_1.Timer();
            const result = { endpoint };
            try {
                await fn();
                this.logOpSuccess(op, endpoint);
            }
            catch (err) {
                result.error = err;
            }
            result.durationMs = timer.stop();
            deployResults.push(result);
        };
        const upserts = [];
        const scraper = new sourceTokenScraper_1.SourceTokenScraper();
        for (const endpoint of changes.endpointsToCreate) {
            this.logOpStart("creating", endpoint);
            upserts.push(handle("create", endpoint, () => this.createEndpoint(endpoint, scraper)));
        }
        for (const update of changes.endpointsToUpdate) {
            this.logOpStart("updating", update.endpoint);
            upserts.push(handle("update", update.endpoint, () => this.updateEndpoint(update, scraper)));
        }
        await utils.allSettled(upserts);
        if (deployResults.find((r) => r.error)) {
            for (const endpoint of changes.endpointsToDelete) {
                deployResults.push({
                    endpoint,
                    durationMs: 0,
                    error: new reporter.AbortedDeploymentError(endpoint),
                });
            }
            return deployResults;
        }
        const deletes = [];
        for (const endpoint of changes.endpointsToDelete) {
            this.logOpStart("deleting", endpoint);
            deletes.push(handle("delete", endpoint, () => this.deleteEndpoint(endpoint)));
        }
        await utils.allSettled(deletes);
        return deployResults;
    }
    async createEndpoint(endpoint, scraper) {
        endpoint.labels = Object.assign(Object.assign({}, endpoint.labels), deploymentTool.labels());
        if (endpoint.platform === "gcfv1") {
            await this.createV1Function(endpoint, scraper);
        }
        else if (endpoint.platform === "gcfv2") {
            await this.createV2Function(endpoint);
        }
        else {
            (0, functional_1.assertExhaustive)(endpoint.platform);
        }
        await this.setTrigger(endpoint);
    }
    async updateEndpoint(update, scraper) {
        if (update.deleteAndRecreate || update.endpoint.platform !== "gcfv2") {
            update.endpoint.labels = Object.assign(Object.assign({}, update.endpoint.labels), deploymentTool.labels());
        }
        if (update.deleteAndRecreate) {
            await this.deleteEndpoint(update.deleteAndRecreate);
            await this.createEndpoint(update.endpoint, scraper);
            return;
        }
        if (update.endpoint.platform === "gcfv1") {
            await this.updateV1Function(update.endpoint, scraper);
        }
        else if (update.endpoint.platform === "gcfv2") {
            await this.updateV2Function(update.endpoint);
        }
        else {
            (0, functional_1.assertExhaustive)(update.endpoint.platform);
        }
        await this.setTrigger(update.endpoint);
    }
    async deleteEndpoint(endpoint) {
        await this.deleteTrigger(endpoint);
        if (endpoint.platform === "gcfv1") {
            await this.deleteV1Function(endpoint);
        }
        else {
            await this.deleteV2Function(endpoint);
        }
    }
    async createV1Function(endpoint, scraper) {
        var _a;
        if (!this.sourceUrl) {
            logger_1.logger.debug("Precondition failed. Cannot create a GCF function without sourceUrl");
            throw new Error("Precondition failed");
        }
        const apiFunction = gcf.functionFromEndpoint(endpoint, this.sourceUrl);
        if (apiFunction.httpsTrigger) {
            apiFunction.httpsTrigger.securityLevel = "SECURE_ALWAYS";
        }
        apiFunction.sourceToken = await scraper.tokenPromise();
        const resultFunction = await this.functionExecutor
            .run(async () => {
            const op = await gcf.createFunction(apiFunction);
            return poller.pollOperation(Object.assign(Object.assign({}, gcfV1PollerOptions), { pollerName: `create-${endpoint.region}-${endpoint.id}`, operationResourceName: op.name, onPoll: scraper.poller }));
        })
            .catch(rethrowAs(endpoint, "create"));
        endpoint.uri = (_a = resultFunction === null || resultFunction === void 0 ? void 0 : resultFunction.httpsTrigger) === null || _a === void 0 ? void 0 : _a.url;
        if (backend.isHttpsTriggered(endpoint)) {
            const invoker = endpoint.httpsTrigger.invoker || ["public"];
            if (!invoker.includes("private")) {
                await this.executor
                    .run(async () => {
                    await gcf.setInvokerCreate(endpoint.project, backend.functionName(endpoint), invoker);
                })
                    .catch(rethrowAs(endpoint, "set invoker"));
            }
        }
        else if (backend.isTaskQueueTriggered(endpoint)) {
            const invoker = endpoint.taskQueueTrigger.invoker;
            if (invoker && !invoker.includes("private")) {
                await this.executor
                    .run(async () => {
                    await gcf.setInvokerCreate(endpoint.project, backend.functionName(endpoint), invoker);
                })
                    .catch(rethrowAs(endpoint, "set invoker"));
            }
        }
    }
    async createV2Function(endpoint) {
        var _a;
        if (!this.storage) {
            logger_1.logger.debug("Precondition failed. Cannot create a GCFv2 function without storage");
            throw new Error("Precondition failed");
        }
        const apiFunction = gcfV2.functionFromEndpoint(endpoint, this.storage[endpoint.region]);
        const topic = (_a = apiFunction.eventTrigger) === null || _a === void 0 ? void 0 : _a.pubsubTopic;
        if (topic) {
            await this.executor
                .run(async () => {
                try {
                    await pubsub.createTopic({ name: topic });
                }
                catch (err) {
                    if (err.status === 409) {
                        return;
                    }
                    throw new error_1.FirebaseError("Unexpected error creating Pub/Sub topic", {
                        original: err,
                    });
                }
            })
                .catch(rethrowAs(endpoint, "create topic"));
        }
        const resultFunction = (await this.functionExecutor
            .run(async () => {
            const op = await gcfV2.createFunction(apiFunction);
            return await poller.pollOperation(Object.assign(Object.assign({}, gcfV2PollerOptions), { pollerName: `create-${endpoint.region}-${endpoint.id}`, operationResourceName: op.name }));
        })
            .catch(rethrowAs(endpoint, "create")));
        endpoint.uri = resultFunction.serviceConfig.uri;
        const serviceName = resultFunction.serviceConfig.service;
        if (backend.isHttpsTriggered(endpoint)) {
            const invoker = endpoint.httpsTrigger.invoker || ["public"];
            if (!invoker.includes("private")) {
                await this.executor
                    .run(() => run.setInvokerCreate(endpoint.project, serviceName, invoker))
                    .catch(rethrowAs(endpoint, "set invoker"));
            }
        }
        else if (backend.isTaskQueueTriggered(endpoint)) {
            const invoker = endpoint.taskQueueTrigger.invoker;
            if (invoker && !invoker.includes("private")) {
                await this.executor
                    .run(async () => {
                    await gcf.setInvokerCreate(endpoint.project, backend.functionName(endpoint), invoker);
                })
                    .catch(rethrowAs(endpoint, "set invoker"));
            }
        }
        await this.setConcurrency(endpoint, serviceName, endpoint.concurrency || DEFAULT_GCFV2_CONCURRENCY);
    }
    async updateV1Function(endpoint, scraper) {
        var _a;
        if (!this.sourceUrl) {
            logger_1.logger.debug("Precondition failed. Cannot update a GCF function without sourceUrl");
            throw new Error("Precondition failed");
        }
        const apiFunction = gcf.functionFromEndpoint(endpoint, this.sourceUrl);
        apiFunction.sourceToken = await scraper.tokenPromise();
        const resultFunction = await this.functionExecutor
            .run(async () => {
            const op = await gcf.updateFunction(apiFunction);
            return await poller.pollOperation(Object.assign(Object.assign({}, gcfV1PollerOptions), { pollerName: `update-${endpoint.region}-${endpoint.id}`, operationResourceName: op.name, onPoll: scraper.poller }));
        })
            .catch(rethrowAs(endpoint, "update"));
        endpoint.uri = (_a = resultFunction === null || resultFunction === void 0 ? void 0 : resultFunction.httpsTrigger) === null || _a === void 0 ? void 0 : _a.url;
        let invoker;
        if (backend.isHttpsTriggered(endpoint)) {
            invoker = endpoint.httpsTrigger.invoker;
        }
        else if (backend.isTaskQueueTriggered(endpoint)) {
            invoker = endpoint.taskQueueTrigger.invoker;
        }
        if (invoker) {
            await this.executor
                .run(() => gcf.setInvokerUpdate(endpoint.project, backend.functionName(endpoint), invoker))
                .catch(rethrowAs(endpoint, "set invoker"));
        }
    }
    async updateV2Function(endpoint) {
        var _a;
        if (!this.storage) {
            logger_1.logger.debug("Precondition failed. Cannot update a GCFv2 function without storage");
            throw new Error("Precondition failed");
        }
        const apiFunction = gcfV2.functionFromEndpoint(endpoint, this.storage[endpoint.region]);
        if ((_a = apiFunction.eventTrigger) === null || _a === void 0 ? void 0 : _a.pubsubTopic) {
            delete apiFunction.eventTrigger.pubsubTopic;
        }
        const resultFunction = await this.functionExecutor
            .run(async () => {
            const op = await gcfV2.updateFunction(apiFunction);
            return await poller.pollOperation(Object.assign(Object.assign({}, gcfV2PollerOptions), { pollerName: `update-${endpoint.region}-${endpoint.id}`, operationResourceName: op.name }));
        })
            .catch(rethrowAs(endpoint, "update"));
        endpoint.uri = resultFunction.serviceConfig.uri;
        const serviceName = resultFunction.serviceConfig.service;
        let invoker;
        if (backend.isHttpsTriggered(endpoint)) {
            invoker = endpoint.httpsTrigger.invoker;
        }
        else if (backend.isTaskQueueTriggered(endpoint)) {
            invoker = endpoint.taskQueueTrigger.invoker;
        }
        if (invoker) {
            await this.executor
                .run(() => run.setInvokerUpdate(endpoint.project, serviceName, invoker))
                .catch(rethrowAs(endpoint, "set invoker"));
        }
        if (endpoint.concurrency) {
            await this.setConcurrency(endpoint, serviceName, endpoint.concurrency);
        }
    }
    async deleteV1Function(endpoint) {
        const fnName = backend.functionName(endpoint);
        await this.functionExecutor
            .run(async () => {
            const op = await gcf.deleteFunction(fnName);
            const pollerOptions = Object.assign(Object.assign({}, gcfV1PollerOptions), { pollerName: `delete-${endpoint.region}-${endpoint.id}`, operationResourceName: op.name });
            await poller.pollOperation(pollerOptions);
        })
            .catch(rethrowAs(endpoint, "delete"));
    }
    async deleteV2Function(endpoint) {
        const fnName = backend.functionName(endpoint);
        await this.functionExecutor
            .run(async () => {
            const op = await gcfV2.deleteFunction(fnName);
            const pollerOptions = Object.assign(Object.assign({}, gcfV2PollerOptions), { pollerName: `delete-${endpoint.region}-${endpoint.id}`, operationResourceName: op.name });
            await poller.pollOperation(pollerOptions);
        })
            .catch(rethrowAs(endpoint, "delete"));
    }
    async setConcurrency(endpoint, serviceName, concurrency) {
        await this.functionExecutor
            .run(async () => {
            const service = await run.getService(serviceName);
            if (service.spec.template.spec.containerConcurrency === concurrency) {
                logger_1.logger.debug("Skipping setConcurrency on", serviceName, " because it already matches");
                return;
            }
            delete service.status;
            delete service.spec.template.metadata.name;
            service.spec.template.spec.containerConcurrency = concurrency;
            await run.replaceService(serviceName, service);
        })
            .catch(rethrowAs(endpoint, "set concurrency"));
    }
    async setTrigger(endpoint) {
        if (backend.isScheduleTriggered(endpoint)) {
            if (endpoint.platform === "gcfv1") {
                await this.upsertScheduleV1(endpoint);
                return;
            }
            else if (endpoint.platform === "gcfv2") {
                await this.upsertScheduleV2(endpoint);
                return;
            }
            (0, functional_1.assertExhaustive)(endpoint.platform);
        }
        else if (backend.isTaskQueueTriggered(endpoint)) {
            await this.upsertTaskQueue(endpoint);
        }
    }
    async deleteTrigger(endpoint) {
        if (backend.isScheduleTriggered(endpoint)) {
            if (endpoint.platform === "gcfv1") {
                await this.deleteScheduleV1(endpoint);
                return;
            }
            else if (endpoint.platform === "gcfv2") {
                await this.deleteScheduleV2(endpoint);
                return;
            }
            (0, functional_1.assertExhaustive)(endpoint.platform);
        }
        else if (backend.isTaskQueueTriggered(endpoint)) {
            await this.disableTaskQueue(endpoint);
        }
    }
    async upsertScheduleV1(endpoint) {
        const job = scheduler.jobFromEndpoint(endpoint, this.appEngineLocation);
        await this.executor
            .run(() => scheduler.createOrReplaceJob(job))
            .catch(rethrowAs(endpoint, "upsert schedule"));
    }
    upsertScheduleV2(endpoint) {
        return Promise.reject(new reporter.DeploymentError(endpoint, "upsert schedule", new Error("Not implemented")));
    }
    async upsertTaskQueue(endpoint) {
        const queue = cloudtasks.queueFromEndpoint(endpoint);
        await this.executor
            .run(() => cloudtasks.upsertQueue(queue))
            .catch(rethrowAs(endpoint, "upsert task queue"));
        if (endpoint.taskQueueTrigger.invoker) {
            await this.executor
                .run(() => cloudtasks.setEnqueuer(queue.name, endpoint.taskQueueTrigger.invoker))
                .catch(rethrowAs(endpoint, "set invoker"));
        }
    }
    async deleteScheduleV1(endpoint) {
        const job = scheduler.jobFromEndpoint(endpoint, this.appEngineLocation);
        await this.executor
            .run(() => scheduler.deleteJob(job.name))
            .catch(rethrowAs(endpoint, "delete schedule"));
        await this.executor
            .run(() => pubsub.deleteTopic(job.pubsubTarget.topicName))
            .catch(rethrowAs(endpoint, "delete topic"));
    }
    deleteScheduleV2(endpoint) {
        return Promise.reject(new reporter.DeploymentError(endpoint, "delete schedule", new Error("Not implemented")));
    }
    async disableTaskQueue(endpoint) {
        const update = {
            name: cloudtasks.queueNameForEndpoint(endpoint),
            state: "DISABLED",
        };
        await this.executor
            .run(() => cloudtasks.updateQueue(update))
            .catch(rethrowAs(endpoint, "disable task queue"));
    }
    logOpStart(op, endpoint) {
        const runtime = (0, runtimes_1.getHumanFriendlyRuntimeName)(endpoint.runtime);
        const label = helper.getFunctionLabel(endpoint);
        utils.logBullet(`${clc.bold.cyan("functions:")} ${op} ${runtime} function ${clc.bold(label)}...`);
    }
    logOpSuccess(op, endpoint) {
        const label = helper.getFunctionLabel(endpoint);
        utils.logSuccess(`${clc.bold.green(`functions[${label}]`)} Successful ${op} operation.`);
    }
}
exports.Fabricator = Fabricator;
//# sourceMappingURL=fabricator.js.map