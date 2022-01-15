"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FunctionsEmulator = void 0;
const _ = require("lodash");
const fs = require("fs");
const path = require("path");
const express = require("express");
const clc = require("cli-color");
const http = require("http");
const jwt = require("jsonwebtoken");
const url_1 = require("url");
const api = require("../api");
const logger_1 = require("../logger");
const track = require("../track");
const constants_1 = require("./constants");
const types_1 = require("./types");
const chokidar = require("chokidar");
const spawn = require("cross-spawn");
const child_process_1 = require("child_process");
const functionsEmulatorShared_1 = require("./functionsEmulatorShared");
const registry_1 = require("./registry");
const events_1 = require("events");
const emulatorLogger_1 = require("./emulatorLogger");
const functionsRuntimeWorker_1 = require("./functionsRuntimeWorker");
const error_1 = require("../error");
const workQueue_1 = require("./workQueue");
const utils_1 = require("../utils");
const defaultCredentials_1 = require("../defaultCredentials");
const adminSdkConfig_1 = require("./adminSdkConfig");
const functionsEnv = require("../functions/env");
const types_2 = require("./events/types");
const validate_1 = require("../deploy/functions/validate");
const EVENT_INVOKE = "functions:invoke";
const DATABASE_PATH_PATTERN = new RegExp("^projects/[^/]+/instances/([^/]+)/refs(/.*)$");
class FunctionsEmulator {
    constructor(args) {
        this.args = args;
        this.triggers = {};
        this.triggerGeneration = 0;
        this.logger = emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.FUNCTIONS);
        this.multicastTriggers = {};
        emulatorLogger_1.EmulatorLogger.verbosity = this.args.quiet ? emulatorLogger_1.Verbosity.QUIET : emulatorLogger_1.Verbosity.DEBUG;
        if (this.args.debugPort) {
            this.args.disabledRuntimeFeatures = this.args.disabledRuntimeFeatures || {};
            this.args.disabledRuntimeFeatures.timeout = true;
        }
        this.adminSdkConfig = {
            projectId: this.args.projectId,
        };
        const mode = this.args.debugPort
            ? types_1.FunctionsExecutionMode.SEQUENTIAL
            : types_1.FunctionsExecutionMode.AUTO;
        this.workerPool = new functionsRuntimeWorker_1.RuntimeWorkerPool(mode);
        this.workQueue = new workQueue_1.WorkQueue(mode);
    }
    static getHttpFunctionUrl(host, port, projectId, name, region) {
        return `http://${host}:${port}/${projectId}/${region}/${name}`;
    }
    async getCredentialsEnvironment() {
        const credentialEnv = {};
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            this.logger.logLabeled("WARN", "functions", `Your GOOGLE_APPLICATION_CREDENTIALS environment variable points to ${process.env.GOOGLE_APPLICATION_CREDENTIALS}. Non-emulated services will access production using these credentials. Be careful!`);
        }
        else if (this.args.account) {
            const defaultCredPath = await (0, defaultCredentials_1.getCredentialPathAsync)(this.args.account);
            if (defaultCredPath) {
                this.logger.log("DEBUG", `Setting GAC to ${defaultCredPath}`);
                credentialEnv.GOOGLE_APPLICATION_CREDENTIALS = defaultCredPath;
            }
        }
        else {
            this.logger.logLabeled("WARN", "functions", "You are not signed in to the Firebase CLI. If you have authorized this machine using gcloud application-default credentials those may be discovered and used to access production services.");
        }
        return credentialEnv;
    }
    createHubServer() {
        this.workQueue.start();
        const hub = express();
        const dataMiddleware = (req, res, next) => {
            const chunks = [];
            req.on("data", (chunk) => {
                chunks.push(chunk);
            });
            req.on("end", () => {
                req.rawBody = Buffer.concat(chunks);
                next();
            });
        };
        const backgroundFunctionRoute = `/functions/projects/:project_id/triggers/:trigger_name`;
        const httpsFunctionRoute = `/${this.args.projectId}/:region/:trigger_name`;
        const multicastFunctionRoute = `/functions/projects/:project_id/trigger_multicast`;
        const httpsFunctionRoutes = [httpsFunctionRoute, `${httpsFunctionRoute}/*`];
        const backgroundHandler = (req, res) => {
            var _a;
            const region = req.params.region;
            const triggerId = req.params.trigger_name;
            const projectId = req.params.project_id;
            const reqBody = req.rawBody;
            let proto = JSON.parse(reqBody.toString());
            if ((_a = req.headers["content-type"]) === null || _a === void 0 ? void 0 : _a.includes("cloudevent")) {
                if (types_2.EventUtils.isBinaryCloudEvent(req)) {
                    proto = types_2.EventUtils.extractBinaryCloudEventContext(req);
                    proto.data = req.body;
                }
            }
            this.workQueue.submit(() => {
                this.logger.log("DEBUG", `Accepted request ${req.method} ${req.url} --> ${triggerId}`);
                return this.handleBackgroundTrigger(projectId, triggerId, proto)
                    .then((x) => res.json(x))
                    .catch((errorBundle) => {
                    if (errorBundle.body) {
                        res.status(errorBundle.code).send(errorBundle.body);
                    }
                    else {
                        res.sendStatus(errorBundle.code);
                    }
                });
            });
        };
        const httpsHandler = (req, res) => {
            this.workQueue.submit(() => {
                return this.handleHttpsTrigger(req, res);
            });
        };
        const multicastHandler = (req, res) => {
            var _a;
            const projectId = req.params.project_id;
            const reqBody = req.rawBody;
            let proto = JSON.parse(reqBody.toString());
            let triggerKey;
            if ((_a = req.headers["content-type"]) === null || _a === void 0 ? void 0 : _a.includes("cloudevent")) {
                triggerKey = `${this.args.projectId}:${proto.type}`;
                if (types_2.EventUtils.isBinaryCloudEvent(req)) {
                    proto = types_2.EventUtils.extractBinaryCloudEventContext(req);
                    proto.data = req.body;
                }
            }
            else {
                triggerKey = `${this.args.projectId}:${proto.eventType}`;
            }
            if (proto.data.bucket) {
                triggerKey += `:${proto.data.bucket}`;
            }
            const triggers = this.multicastTriggers[triggerKey] || [];
            triggers.forEach((triggerId) => {
                this.workQueue.submit(() => {
                    this.logger.log("DEBUG", `Accepted multicast request ${req.method} ${req.url} --> ${triggerId}`);
                    return this.handleBackgroundTrigger(projectId, triggerId, proto);
                });
            });
            res.json({ status: "multicast_acknowledged" });
        };
        hub.post(backgroundFunctionRoute, dataMiddleware, backgroundHandler);
        hub.post(multicastFunctionRoute, dataMiddleware, multicastHandler);
        hub.all(httpsFunctionRoutes, dataMiddleware, httpsHandler);
        hub.all("*", dataMiddleware, (req, res) => {
            logger_1.logger.debug(`Functions emulator received unknown request at path ${req.path}`);
            res.sendStatus(404);
        });
        return hub;
    }
    startFunctionRuntime(backend, triggerId, targetName, signatureType, proto, runtimeOpts) {
        const bundleTemplate = this.getBaseBundle(backend);
        const runtimeBundle = Object.assign(Object.assign({}, bundleTemplate), { emulators: {
                firestore: this.getEmulatorInfo(types_1.Emulators.FIRESTORE),
                database: this.getEmulatorInfo(types_1.Emulators.DATABASE),
                pubsub: this.getEmulatorInfo(types_1.Emulators.PUBSUB),
                auth: this.getEmulatorInfo(types_1.Emulators.AUTH),
                storage: this.getEmulatorInfo(types_1.Emulators.STORAGE),
            }, nodeMajorVersion: backend.nodeMajorVersion, proto,
            triggerId,
            targetName });
        if (!backend.nodeBinary) {
            throw new error_1.FirebaseError(`No node binary for ${triggerId}. This should never happen.`);
        }
        const opts = runtimeOpts || {
            nodeBinary: backend.nodeBinary,
            extensionTriggers: backend.predefinedTriggers,
        };
        const worker = this.invokeRuntime(runtimeBundle, opts, this.getRuntimeEnvs(backend, { targetName, signatureType }));
        return worker;
    }
    async start() {
        for (const backend of this.args.emulatableBackends) {
            backend.nodeBinary = this.getNodeBinary(backend);
        }
        const credentialEnv = await this.getCredentialsEnvironment();
        for (const e of this.args.emulatableBackends) {
            e.env = Object.assign(Object.assign({}, credentialEnv), e.env);
        }
        const adminSdkConfig = await (0, adminSdkConfig_1.getProjectAdminSdkConfigOrCached)(this.args.projectId);
        if (adminSdkConfig) {
            this.adminSdkConfig = adminSdkConfig;
        }
        else {
            this.logger.logLabeled("WARN", "functions", "Unable to fetch project Admin SDK configuration, Admin SDK behavior in Cloud Functions emulator may be incorrect.");
            this.adminSdkConfig = (0, adminSdkConfig_1.constructDefaultAdminSdkConfig)(this.args.projectId);
        }
        const { host, port } = this.getInfo();
        this.workQueue.start();
        const server = this.createHubServer().listen(port, host);
        this.destroyServer = (0, utils_1.createDestroyer)(server);
        return Promise.resolve();
    }
    async connect() {
        const loadTriggerPromises = [];
        for (const backend of this.args.emulatableBackends) {
            this.logger.logLabeled("BULLET", "functions", `Watching "${backend.functionsDir}" for Cloud Functions...`);
            const watcher = chokidar.watch(backend.functionsDir, {
                ignored: [
                    /.+?[\\\/]node_modules[\\\/].+?/,
                    /(^|[\/\\])\../,
                    /.+\.log/,
                ],
                persistent: true,
            });
            const debouncedLoadTriggers = _.debounce(() => this.loadTriggers(backend), 1000);
            watcher.on("change", (filePath) => {
                this.logger.log("DEBUG", `File ${filePath} changed, reloading triggers`);
                return debouncedLoadTriggers();
            });
            loadTriggerPromises.push(this.loadTriggers(backend, true));
        }
        await Promise.all(loadTriggerPromises);
        return;
    }
    async stop() {
        try {
            await this.workQueue.flush();
        }
        catch (e) {
            this.logger.logLabeled("WARN", "functions", "Functions emulator work queue did not empty before stopping");
        }
        this.workQueue.stop();
        this.workerPool.exit();
        if (this.destroyServer) {
            await this.destroyServer();
        }
    }
    async loadTriggers(emulatableBackend, force = false) {
        this.workerPool.refresh();
        if (!emulatableBackend.nodeBinary) {
            throw new error_1.FirebaseError(`No node binary for ${emulatableBackend.functionsDir}. This should never happen.`);
        }
        const worker = this.invokeRuntime(this.getBaseBundle(emulatableBackend), {
            nodeBinary: emulatableBackend.nodeBinary,
            extensionTriggers: emulatableBackend.predefinedTriggers,
        }, Object.assign(Object.assign(Object.assign(Object.assign({}, this.getSystemEnvs()), this.getEmulatorEnvs()), { FIREBASE_CONFIG: this.getFirebaseConfig() }), emulatableBackend.env));
        const triggerParseEvent = await types_1.EmulatorLog.waitForLog(worker.runtime.events, "SYSTEM", "triggers-parsed");
        const parsedDefinitions = triggerParseEvent.data
            .triggerDefinitions;
        const triggerDefinitions = (0, functionsEmulatorShared_1.emulatedFunctionsByRegion)(parsedDefinitions);
        const toSetup = triggerDefinitions.filter((definition) => {
            if (force) {
                return true;
            }
            const anyEnabledMatch = Object.values(this.triggers).some((record) => {
                const sameEntryPoint = record.def.entryPoint === definition.entryPoint;
                const sameEventTrigger = JSON.stringify(record.def.eventTrigger) === JSON.stringify(definition.eventTrigger);
                if (sameEntryPoint && !sameEventTrigger) {
                    this.logger.log("DEBUG", `Definition for trigger ${definition.entryPoint} changed from ${JSON.stringify(record.def.eventTrigger)} to ${JSON.stringify(definition.eventTrigger)}`);
                }
                return record.enabled && sameEntryPoint && sameEventTrigger;
            });
            return !anyEnabledMatch;
        });
        for (const definition of toSetup) {
            try {
                (0, validate_1.functionIdsAreValid)([definition]);
            }
            catch (e) {
                this.logger.logLabeled("WARN", `functions[${definition.id}]`, `Invalid function id: ${e.message}`);
                continue;
            }
            let added = false;
            let url = undefined;
            if (definition.httpsTrigger) {
                const { host, port } = this.getInfo();
                added = true;
                url = FunctionsEmulator.getHttpFunctionUrl(host, port, this.args.projectId, definition.name, definition.region);
            }
            else if (definition.eventTrigger) {
                const service = (0, functionsEmulatorShared_1.getFunctionService)(definition);
                const key = this.getTriggerKey(definition);
                const signature = (0, functionsEmulatorShared_1.getSignatureType)(definition);
                switch (service) {
                    case constants_1.Constants.SERVICE_FIRESTORE:
                        added = await this.addFirestoreTrigger(this.args.projectId, key, definition.eventTrigger);
                        break;
                    case constants_1.Constants.SERVICE_REALTIME_DATABASE:
                        added = await this.addRealtimeDatabaseTrigger(this.args.projectId, key, definition.eventTrigger);
                        break;
                    case constants_1.Constants.SERVICE_PUBSUB:
                        added = await this.addPubsubTrigger(definition.name, key, definition.eventTrigger, signature, definition.schedule);
                        break;
                    case constants_1.Constants.SERVICE_AUTH:
                        added = this.addAuthTrigger(this.args.projectId, key, definition.eventTrigger);
                        break;
                    case constants_1.Constants.SERVICE_STORAGE:
                        added = this.addStorageTrigger(this.args.projectId, key, definition.eventTrigger);
                        break;
                    default:
                        this.logger.log("DEBUG", `Unsupported trigger: ${JSON.stringify(definition)}`);
                        break;
                }
            }
            else {
                this.logger.log("WARN", `Trigger trigger "${definition.name}" has has neither "httpsTrigger" or "eventTrigger" member`);
            }
            const ignored = !added;
            this.addTriggerRecord(definition, { backend: emulatableBackend, ignored, url });
            const type = definition.httpsTrigger
                ? "http"
                : constants_1.Constants.getServiceName((0, functionsEmulatorShared_1.getFunctionService)(definition));
            if (ignored) {
                const msg = `function ignored because the ${type} emulator does not exist or is not running.`;
                this.logger.logLabeled("BULLET", `functions[${definition.id}]`, msg);
            }
            else {
                const msg = url
                    ? `${clc.bold(type)} function initialized (${url}).`
                    : `${clc.bold(type)} function initialized.`;
                this.logger.logLabeled("SUCCESS", `functions[${definition.id}]`, msg);
            }
        }
    }
    addRealtimeDatabaseTrigger(projectId, key, eventTrigger) {
        const databaseEmu = registry_1.EmulatorRegistry.get(types_1.Emulators.DATABASE);
        if (!databaseEmu) {
            return Promise.resolve(false);
        }
        const result = DATABASE_PATH_PATTERN.exec(eventTrigger.resource);
        if (result === null || result.length !== 3) {
            this.logger.log("WARN", `Event trigger "${key}" has malformed "resource" member. ` + `${eventTrigger.resource}`);
            return Promise.reject();
        }
        const instance = result[1];
        const bundle = JSON.stringify({
            name: `projects/${projectId}/locations/_/functions/${key}`,
            path: result[2],
            event: eventTrigger.eventType,
            topic: `projects/${projectId}/topics/${key}`,
        });
        logger_1.logger.debug(`addRealtimeDatabaseTrigger[${instance}]`, JSON.stringify(bundle));
        let setTriggersPath = "/.settings/functionTriggers.json";
        if (instance !== "") {
            setTriggersPath += `?ns=${instance}`;
        }
        else {
            this.logger.log("WARN", `No project in use. Registering function trigger for sentinel namespace '${constants_1.Constants.DEFAULT_DATABASE_EMULATOR_NAMESPACE}'`);
        }
        return api
            .request("POST", setTriggersPath, {
            origin: `http://${registry_1.EmulatorRegistry.getInfoHostString(databaseEmu.getInfo())}`,
            headers: {
                Authorization: "Bearer owner",
            },
            data: bundle,
            json: false,
        })
            .then(() => {
            return true;
        })
            .catch((err) => {
            this.logger.log("WARN", "Error adding trigger: " + err);
            throw err;
        });
    }
    addFirestoreTrigger(projectId, key, eventTrigger) {
        const firestoreEmu = registry_1.EmulatorRegistry.get(types_1.Emulators.FIRESTORE);
        if (!firestoreEmu) {
            return Promise.resolve(false);
        }
        const bundle = JSON.stringify({ eventTrigger });
        logger_1.logger.debug(`addFirestoreTrigger`, JSON.stringify(bundle));
        return api
            .request("PUT", `/emulator/v1/projects/${projectId}/triggers/${key}`, {
            origin: `http://${registry_1.EmulatorRegistry.getInfoHostString(firestoreEmu.getInfo())}`,
            data: bundle,
            json: false,
        })
            .then(() => {
            return true;
        })
            .catch((err) => {
            this.logger.log("WARN", "Error adding trigger: " + err);
            throw err;
        });
    }
    async addPubsubTrigger(triggerName, key, eventTrigger, signatureType, schedule) {
        const pubsubPort = registry_1.EmulatorRegistry.getPort(types_1.Emulators.PUBSUB);
        if (!pubsubPort) {
            return false;
        }
        const pubsubEmulator = registry_1.EmulatorRegistry.get(types_1.Emulators.PUBSUB);
        logger_1.logger.debug(`addPubsubTrigger`, JSON.stringify({ eventTrigger }));
        const resource = eventTrigger.resource;
        let topic;
        if (schedule) {
            topic = "firebase-schedule-" + triggerName;
        }
        else {
            const resourceParts = resource.split("/");
            topic = resourceParts[resourceParts.length - 1];
        }
        try {
            await pubsubEmulator.addTrigger(topic, key, signatureType);
            return true;
        }
        catch (e) {
            return false;
        }
    }
    addAuthTrigger(projectId, key, eventTrigger) {
        logger_1.logger.debug(`addAuthTrigger`, JSON.stringify({ eventTrigger }));
        const eventTriggerId = `${projectId}:${eventTrigger.eventType}`;
        const triggers = this.multicastTriggers[eventTriggerId] || [];
        triggers.push(key);
        this.multicastTriggers[eventTriggerId] = triggers;
        return true;
    }
    addStorageTrigger(projectId, key, eventTrigger) {
        logger_1.logger.debug(`addStorageTrigger`, JSON.stringify({ eventTrigger }));
        const bucket = eventTrigger.resource.startsWith("projects/_/buckets/")
            ? eventTrigger.resource.split("/")[3]
            : eventTrigger.resource;
        const eventTriggerId = `${projectId}:${eventTrigger.eventType}:${bucket}`;
        const triggers = this.multicastTriggers[eventTriggerId] || [];
        triggers.push(key);
        this.multicastTriggers[eventTriggerId] = triggers;
        return true;
    }
    getProjectId() {
        return this.args.projectId;
    }
    getInfo() {
        const host = this.args.host || constants_1.Constants.getDefaultHost(types_1.Emulators.FUNCTIONS);
        const port = this.args.port || constants_1.Constants.getDefaultPort(types_1.Emulators.FUNCTIONS);
        return {
            name: this.getName(),
            host,
            port,
        };
    }
    getName() {
        return types_1.Emulators.FUNCTIONS;
    }
    getTriggerDefinitions() {
        return Object.values(this.triggers).map((record) => record.def);
    }
    getTriggerRecordByKey(triggerKey) {
        const record = this.triggers[triggerKey];
        if (!record) {
            logger_1.logger.debug(`Could not find key=${triggerKey} in ${JSON.stringify(this.triggers)}`);
            throw new error_1.FirebaseError(`No trigger with key ${triggerKey}`);
        }
        return record;
    }
    getTriggerKey(def) {
        return def.eventTrigger ? `${def.id}-${this.triggerGeneration}` : def.id;
    }
    getBackends() {
        return this.args.emulatableBackends;
    }
    addTriggerRecord(def, opts) {
        const key = this.getTriggerKey(def);
        this.triggers[key] = {
            def,
            enabled: true,
            backend: opts.backend,
            ignored: opts.ignored,
            url: opts.url,
        };
    }
    setTriggersForTesting(triggers, backend) {
        triggers.forEach((def) => this.addTriggerRecord(def, { backend, ignored: false }));
    }
    getBaseBundle(backend) {
        return {
            cwd: backend.functionsDir,
            projectId: this.args.projectId,
            triggerId: "",
            targetName: "",
            emulators: {
                firestore: registry_1.EmulatorRegistry.getInfo(types_1.Emulators.FIRESTORE),
                database: registry_1.EmulatorRegistry.getInfo(types_1.Emulators.DATABASE),
                pubsub: registry_1.EmulatorRegistry.getInfo(types_1.Emulators.PUBSUB),
                auth: registry_1.EmulatorRegistry.getInfo(types_1.Emulators.AUTH),
                storage: registry_1.EmulatorRegistry.getInfo(types_1.Emulators.STORAGE),
            },
            adminSdkConfig: {
                databaseURL: this.adminSdkConfig.databaseURL,
                storageBucket: this.adminSdkConfig.storageBucket,
            },
            disabled_features: this.args.disabledRuntimeFeatures,
        };
    }
    getRequestedNodeRuntimeVersion(frb) {
        const pkg = require(path.join(frb.cwd, "package.json"));
        return frb.nodeMajorVersion || (pkg.engines && pkg.engines.node);
    }
    getNodeBinary(backend) {
        const pkg = require(path.join(backend.functionsDir, "package.json"));
        if ((!pkg.engines || !pkg.engines.node) && !backend.nodeMajorVersion) {
            this.logger.log("WARN", `Your functions directory ${backend.functionsDir} does not specify a Node version.\n   ` +
                "- Learn more at https://firebase.google.com/docs/functions/manage-functions#set_runtime_options");
            return process.execPath;
        }
        const hostMajorVersion = process.versions.node.split(".")[0];
        const requestedMajorVersion = backend.nodeMajorVersion
            ? `${backend.nodeMajorVersion}`
            : pkg.engines.node;
        let localMajorVersion = "0";
        const localNodePath = path.join(backend.functionsDir, "node_modules/.bin/node");
        try {
            const localNodeOutput = (0, child_process_1.spawnSync)(localNodePath, ["--version"]).stdout.toString();
            localMajorVersion = localNodeOutput.slice(1).split(".")[0];
        }
        catch (err) {
        }
        if (requestedMajorVersion === localMajorVersion) {
            this.logger.logLabeled("SUCCESS", "functions", `Using node@${requestedMajorVersion} from local cache.`);
            return localNodePath;
        }
        if (requestedMajorVersion === hostMajorVersion) {
            this.logger.logLabeled("SUCCESS", "functions", `Using node@${requestedMajorVersion} from host.`);
        }
        this.logger.log("WARN", `Your requested "node" version "${requestedMajorVersion}" doesn't match your global version "${hostMajorVersion}"`);
        return process.execPath;
    }
    getUserEnvs(backend) {
        const projectInfo = {
            functionsSource: backend.functionsDir,
            projectId: this.args.projectId,
            isEmulator: true,
        };
        if (functionsEnv.hasUserEnvs(projectInfo)) {
            try {
                return functionsEnv.loadUserEnvs(projectInfo);
            }
            catch (e) {
                logger_1.logger.debug("Failed to load local environment variables", e);
            }
        }
        return {};
    }
    getSystemEnvs(triggerDef) {
        const envs = {};
        envs.GCLOUD_PROJECT = this.args.projectId;
        envs.K_REVISION = "1";
        envs.PORT = "80";
        if (triggerDef) {
            const service = triggerDef.targetName;
            const target = service.replace(/-/g, ".");
            envs.FUNCTION_TARGET = target;
            envs.FUNCTION_SIGNATURE_TYPE = triggerDef.signatureType;
            envs.K_SERVICE = service;
        }
        return envs;
    }
    getEmulatorEnvs() {
        const envs = {};
        envs.FUNCTIONS_EMULATOR = "true";
        envs.TZ = "UTC";
        envs.FIREBASE_DEBUG_MODE = "true";
        envs.FIREBASE_DEBUG_FEATURES = JSON.stringify({ skipTokenVerification: true });
        const firestoreEmulator = this.getEmulatorInfo(types_1.Emulators.FIRESTORE);
        if (firestoreEmulator != null) {
            envs[constants_1.Constants.FIRESTORE_EMULATOR_HOST] = (0, functionsEmulatorShared_1.formatHost)(firestoreEmulator);
        }
        const databaseEmulator = this.getEmulatorInfo(types_1.Emulators.DATABASE);
        if (databaseEmulator) {
            envs[constants_1.Constants.FIREBASE_DATABASE_EMULATOR_HOST] = (0, functionsEmulatorShared_1.formatHost)(databaseEmulator);
        }
        const authEmulator = this.getEmulatorInfo(types_1.Emulators.AUTH);
        if (authEmulator) {
            envs[constants_1.Constants.FIREBASE_AUTH_EMULATOR_HOST] = (0, functionsEmulatorShared_1.formatHost)(authEmulator);
        }
        const storageEmulator = this.getEmulatorInfo(types_1.Emulators.STORAGE);
        if (storageEmulator) {
            envs[constants_1.Constants.FIREBASE_STORAGE_EMULATOR_HOST] = (0, functionsEmulatorShared_1.formatHost)(storageEmulator);
            envs[constants_1.Constants.CLOUD_STORAGE_EMULATOR_HOST] = `http://${(0, functionsEmulatorShared_1.formatHost)(storageEmulator)}`;
        }
        const pubsubEmulator = this.getEmulatorInfo(types_1.Emulators.PUBSUB);
        if (pubsubEmulator) {
            const pubsubHost = (0, functionsEmulatorShared_1.formatHost)(pubsubEmulator);
            process.env.PUBSUB_EMULATOR_HOST = pubsubHost;
        }
        return envs;
    }
    getFirebaseConfig() {
        const databaseEmulator = this.getEmulatorInfo(types_1.Emulators.DATABASE);
        let emulatedDatabaseURL = undefined;
        if (databaseEmulator) {
            let ns = this.args.projectId;
            if (this.adminSdkConfig.databaseURL) {
                const asUrl = new url_1.URL(this.adminSdkConfig.databaseURL);
                ns = asUrl.hostname.split(".")[0];
            }
            emulatedDatabaseURL = `http://${(0, functionsEmulatorShared_1.formatHost)(databaseEmulator)}/?ns=${ns}`;
        }
        return JSON.stringify({
            storageBucket: this.adminSdkConfig.storageBucket,
            databaseURL: emulatedDatabaseURL || this.adminSdkConfig.databaseURL,
            projectId: this.args.projectId,
        });
    }
    getRuntimeEnvs(backend, triggerDef) {
        return Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, this.getUserEnvs(backend)), this.getSystemEnvs(triggerDef)), this.getEmulatorEnvs()), { FIREBASE_CONFIG: this.getFirebaseConfig() }), backend.env);
    }
    invokeRuntime(frb, opts, runtimeEnv) {
        if (this.workerPool.readyForWork(frb.triggerId)) {
            return this.workerPool.submitWork(frb.triggerId, frb, opts);
        }
        const emitter = new events_1.EventEmitter();
        const args = [path.join(__dirname, "functionsEmulatorRuntime")];
        if (opts.ignore_warnings) {
            args.unshift("--no-warnings");
        }
        if (this.args.debugPort) {
            if (process.env.FIREPIT_VERSION && process.execPath == opts.nodeBinary) {
                const requestedMajorNodeVersion = this.getRequestedNodeRuntimeVersion(frb);
                this.logger.log("WARN", `To enable function inspection, please run "${process.execPath} is:npm i node@${requestedMajorNodeVersion} --save-dev" in your functions directory`);
            }
            else {
                const { host } = this.getInfo();
                args.unshift(`--inspect=${host}:${this.args.debugPort}`);
            }
        }
        const pnpPath = path.join(frb.cwd, ".pnp.js");
        if (fs.existsSync(pnpPath)) {
            emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.FUNCTIONS).logLabeled("WARN_ONCE", "functions", "Detected yarn@2 with PnP. " +
                "Cloud Functions for Firebase requires a node_modules folder to work correctly and is therefore incompatible with PnP. " +
                "See https://yarnpkg.com/getting-started/migration#step-by-step for more information.");
        }
        const childProcess = spawn(opts.nodeBinary, args, {
            env: Object.assign(Object.assign({ node: opts.nodeBinary }, process.env), (runtimeEnv !== null && runtimeEnv !== void 0 ? runtimeEnv : {})),
            cwd: frb.cwd,
            stdio: ["pipe", "pipe", "pipe", "ipc"],
        });
        const buffers = {
            stderr: { pipe: childProcess.stderr, value: "" },
            stdout: { pipe: childProcess.stdout, value: "" },
        };
        const ipcBuffer = { value: "" };
        childProcess.on("message", (message) => {
            this.onData(childProcess, emitter, ipcBuffer, message);
        });
        for (const id in buffers) {
            if (buffers.hasOwnProperty(id)) {
                const buffer = buffers[id];
                buffer.pipe.on("data", (buf) => {
                    this.onData(childProcess, emitter, buffer, buf);
                });
            }
        }
        const runtime = {
            pid: childProcess.pid,
            exit: new Promise((resolve) => {
                childProcess.on("exit", resolve);
            }),
            events: emitter,
            shutdown: () => {
                childProcess.kill();
            },
            kill: (signal) => {
                childProcess.kill(signal);
                emitter.emit("log", new types_1.EmulatorLog("SYSTEM", "runtime-status", "killed"));
            },
            send: (args) => {
                return childProcess.send(JSON.stringify(args));
            },
        };
        this.workerPool.addWorker(frb.triggerId, runtime);
        return this.workerPool.submitWork(frb.triggerId, frb, opts);
    }
    async disableBackgroundTriggers() {
        Object.values(this.triggers).forEach((record) => {
            if (record.def.eventTrigger && record.enabled) {
                this.logger.logLabeled("BULLET", `functions[${record.def.entryPoint}]`, "function temporarily disabled.");
                record.enabled = false;
            }
        });
        await this.workQueue.flush();
    }
    async reloadTriggers() {
        this.triggerGeneration++;
        const loadTriggerPromises = [];
        for (const backend of this.args.emulatableBackends) {
            loadTriggerPromises.push(this.loadTriggers(backend));
        }
        return Promise.all(loadTriggerPromises);
    }
    async handleBackgroundTrigger(projectId, triggerKey, proto) {
        const record = this.getTriggerRecordByKey(triggerKey);
        if (record && !record.enabled) {
            return Promise.reject({ code: 204, body: "Background triggers are curently disabled." });
        }
        const trigger = record.def;
        const service = (0, functionsEmulatorShared_1.getFunctionService)(trigger);
        const worker = this.startFunctionRuntime(record.backend, trigger.id, trigger.name, (0, functionsEmulatorShared_1.getSignatureType)(trigger), proto);
        return new Promise((resolve, reject) => {
            if (projectId !== this.args.projectId) {
                if (service !== constants_1.Constants.SERVICE_REALTIME_DATABASE) {
                    logger_1.logger.debug(`Received functions trigger for service "${service}" for unknown project "${projectId}".`);
                    reject({ code: 404 });
                    return;
                }
                if (!trigger.eventTrigger.resource.startsWith(`projects/_/instances/${projectId}`)) {
                    logger_1.logger.debug(`Received functions trigger for function "${trigger.name}" of project "${projectId}" that did not match definition: ${JSON.stringify(trigger)}.`);
                    reject({ code: 404 });
                    return;
                }
            }
            worker.onLogs((el) => {
                if (el.level === "FATAL") {
                    reject({ code: 500, body: el.text });
                }
            });
            track(EVENT_INVOKE, (0, functionsEmulatorShared_1.getFunctionService)(trigger));
            worker.waitForDone().then(() => {
                resolve({ status: "acknowledged" });
            });
        });
    }
    getEmulatorInfo(emulator) {
        if (this.args.remoteEmulators) {
            if (this.args.remoteEmulators[emulator]) {
                return this.args.remoteEmulators[emulator];
            }
        }
        return registry_1.EmulatorRegistry.getInfo(emulator);
    }
    tokenFromAuthHeader(authHeader) {
        const match = authHeader.match(/^Bearer (.*)$/);
        if (!match) {
            return;
        }
        let idToken = match[1];
        logger_1.logger.debug(`ID Token: ${idToken}`);
        if (idToken && idToken.includes("=")) {
            idToken = idToken.replace(/[=]+?\./g, ".");
            logger_1.logger.debug(`ID Token contained invalid padding, new value: ${idToken}`);
        }
        try {
            const decoded = jwt.decode(idToken, { complete: true });
            if (!decoded || typeof decoded !== "object") {
                logger_1.logger.debug(`Failed to decode ID Token: ${decoded}`);
                return;
            }
            const claims = decoded.payload;
            claims.uid = claims.sub;
            return claims;
        }
        catch (e) {
            return;
        }
    }
    async handleHttpsTrigger(req, res) {
        const method = req.method;
        const region = req.params.region;
        const triggerName = req.params.trigger_name;
        const triggerId = `${region}-${triggerName}`;
        if (!this.triggers[triggerId]) {
            res
                .status(404)
                .send(`Function ${triggerId} does not exist, valid triggers are: ${Object.keys(this.triggers).join(", ")}`);
            return;
        }
        const record = this.getTriggerRecordByKey(triggerId);
        const trigger = record.def;
        logger_1.logger.debug(`Accepted request ${method} ${req.url} --> ${triggerId}`);
        const reqBody = req.rawBody;
        const isCallable = trigger.labels && trigger.labels["deployment-callable"] === "true";
        const authHeader = req.header("Authorization");
        if (authHeader && isCallable && trigger.platform !== "gcfv2") {
            const token = this.tokenFromAuthHeader(authHeader);
            if (token) {
                const contextAuth = {
                    uid: token.uid,
                    token: token,
                };
                req.headers[functionsEmulatorShared_1.HttpConstants.ORIGINAL_AUTH_HEADER] = req.headers["authorization"];
                delete req.headers["authorization"];
                req.headers[functionsEmulatorShared_1.HttpConstants.CALLABLE_AUTH_HEADER] = encodeURIComponent(JSON.stringify(contextAuth));
            }
        }
        const worker = this.startFunctionRuntime(record.backend, trigger.id, trigger.name, "http", undefined);
        worker.onLogs((el) => {
            if (el.level === "FATAL") {
                res.status(500).send(el.text);
            }
        });
        await worker.waitForSocketReady();
        track(EVENT_INVOKE, "https");
        this.logger.log("DEBUG", `[functions] Runtime ready! Sending request!`);
        if (!worker.lastArgs) {
            throw new error_1.FirebaseError("Cannot execute on a worker with no arguments");
        }
        if (!worker.lastArgs.frb.socketPath) {
            throw new error_1.FirebaseError(`Cannot execute on a worker without a socketPath: ${JSON.stringify(worker.lastArgs)}`);
        }
        const url = new url_1.URL(`${req.protocol}://${req.hostname}${req.url}`);
        const path = `${url.pathname}${url.search}`.replace(new RegExp(`\/${this.args.projectId}\/[^\/]*\/${triggerName}\/?`), "/");
        this.logger.log("DEBUG", `[functions] Got req.url=${req.url}, mapping to path=${path}`);
        const runtimeReq = http.request({
            method,
            path,
            headers: req.headers,
            socketPath: worker.lastArgs.frb.socketPath,
        }, (runtimeRes) => {
            function forwardStatusAndHeaders() {
                res.status(runtimeRes.statusCode || 200);
                if (!res.headersSent) {
                    Object.keys(runtimeRes.headers).forEach((key) => {
                        const val = runtimeRes.headers[key];
                        if (val) {
                            res.setHeader(key, val);
                        }
                    });
                }
            }
            runtimeRes.on("data", (buf) => {
                forwardStatusAndHeaders();
                res.write(buf);
            });
            runtimeRes.on("close", () => {
                forwardStatusAndHeaders();
                res.end();
            });
            runtimeRes.on("end", () => {
                forwardStatusAndHeaders();
                res.end();
            });
        });
        runtimeReq.on("error", () => {
            res.end();
        });
        if (reqBody) {
            runtimeReq.write(reqBody);
            runtimeReq.end();
        }
        req.pipe(runtimeReq, { end: true }).on("error", () => {
            res.end();
        });
        await worker.waitForDone();
    }
    onData(runtime, emitter, buffer, buf) {
        buffer.value += buf.toString();
        const lines = buffer.value.split("\n");
        if (lines.length > 1) {
            lines.slice(0, -1).forEach((line) => {
                const log = types_1.EmulatorLog.fromJSON(line);
                emitter.emit("log", log);
                if (log.level === "FATAL") {
                    emitter.emit("log", new types_1.EmulatorLog("SYSTEM", "runtime-status", "killed"));
                    runtime.kill();
                }
            });
        }
        buffer.value = lines[lines.length - 1];
    }
}
exports.FunctionsEmulator = FunctionsEmulator;
//# sourceMappingURL=functionsEmulator.js.map