"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const types_1 = require("./types");
const functionsEmulatorShared_1 = require("./functionsEmulatorShared");
const functionsEmulatorUtils_1 = require("./functionsEmulatorUtils");
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const url_1 = require("url");
const _ = require("lodash");
let triggers;
let developerPkgJSON;
const dynamicImport = new Function("modulePath", "return import(modulePath)");
function isFeatureEnabled(frb, feature) {
    return frb.disabled_features ? !frb.disabled_features[feature] : true;
}
function noOp() {
    return false;
}
function requireAsync(moduleName, opts) {
    return new Promise((res, rej) => {
        try {
            res(require(require.resolve(moduleName, opts)));
        }
        catch (e) {
            rej(e);
        }
    });
}
function requireResolveAsync(moduleName, opts) {
    return new Promise((res, rej) => {
        try {
            res(require.resolve(moduleName, opts));
        }
        catch (e) {
            rej(e);
        }
    });
}
class Proxied {
    constructor(original) {
        this.original = original;
        this.rewrites = {};
        this.proxy = new Proxy(this.original, {
            get: (target, key) => {
                key = key.toString();
                if (this.rewrites[key]) {
                    return this.rewrites[key](target, key);
                }
                if (this.anyValue) {
                    return this.anyValue(target, key);
                }
                return Proxied.getOriginal(target, key);
            },
            apply: (target, thisArg, argArray) => {
                if (this.appliedValue) {
                    return this.appliedValue.apply(thisArg);
                }
                else {
                    return Proxied.applyOriginal(target, thisArg, argArray);
                }
            },
        });
    }
    static getOriginal(target, key) {
        const value = target[key];
        if (!Proxied.isExists(value)) {
            return undefined;
        }
        else if (Proxied.isConstructor(value) || typeof value !== "function") {
            return value;
        }
        else {
            return value.bind(target);
        }
    }
    static applyOriginal(target, thisArg, argArray) {
        return target.apply(thisArg, argArray);
    }
    static isConstructor(obj) {
        return !!obj.prototype && !!obj.prototype.constructor.name;
    }
    static isExists(obj) {
        return obj !== undefined;
    }
    when(key, value) {
        this.rewrites[key] = value;
        return this;
    }
    any(value) {
        this.anyValue = value;
        return this;
    }
    applied(value) {
        this.appliedValue = value;
        return this;
    }
    finalize() {
        return this.proxy;
    }
}
async function resolveDeveloperNodeModule(frb, name) {
    const pkg = requirePackageJson(frb);
    if (!pkg) {
        new types_1.EmulatorLog("SYSTEM", "missing-package-json", "").log();
        throw new Error("Could not find package.json");
    }
    const dependencies = pkg.dependencies;
    const devDependencies = pkg.devDependencies;
    const isInPackageJSON = dependencies[name] || devDependencies[name];
    if (!isInPackageJSON) {
        return { declared: false, installed: false };
    }
    const resolveResult = await requireResolveAsync(name, { paths: [frb.cwd] }).catch(noOp);
    if (!resolveResult) {
        return { declared: true, installed: false };
    }
    const modPackageJSON = require(path.join((0, functionsEmulatorShared_1.findModuleRoot)(name, resolveResult), "package.json"));
    const moduleResolution = {
        declared: true,
        installed: true,
        version: modPackageJSON.version,
        resolution: resolveResult,
    };
    logDebug(`Resolved module ${name}`, moduleResolution);
    return moduleResolution;
}
async function assertResolveDeveloperNodeModule(frb, name) {
    const resolution = await resolveDeveloperNodeModule(frb, name);
    if (!(resolution.installed && resolution.declared && resolution.resolution && resolution.version)) {
        throw new Error(`Assertion failure: could not fully resolve ${name}: ${JSON.stringify(resolution)}`);
    }
    return resolution;
}
async function verifyDeveloperNodeModules(frb) {
    const modBundles = [
        { name: "firebase-admin", isDev: false, minVersion: "8.9.0" },
        { name: "firebase-functions", isDev: false, minVersion: "3.13.1" },
    ];
    for (const modBundle of modBundles) {
        const resolution = await resolveDeveloperNodeModule(frb, modBundle.name);
        if (!resolution.declared) {
            new types_1.EmulatorLog("SYSTEM", "missing-module", "", modBundle).log();
            return false;
        }
        if (!resolution.installed) {
            new types_1.EmulatorLog("SYSTEM", "uninstalled-module", "", modBundle).log();
            return false;
        }
        if ((0, functionsEmulatorUtils_1.compareVersionStrings)(resolution.version, modBundle.minVersion) < 0) {
            new types_1.EmulatorLog("SYSTEM", "out-of-date-module", "", modBundle).log();
            return false;
        }
    }
    return true;
}
function requirePackageJson(frb) {
    if (developerPkgJSON) {
        return developerPkgJSON;
    }
    try {
        const pkg = require(`${frb.cwd}/package.json`);
        developerPkgJSON = {
            engines: pkg.engines || {},
            dependencies: pkg.dependencies || {},
            devDependencies: pkg.devDependencies || {},
        };
        return developerPkgJSON;
    }
    catch (err) {
        return;
    }
}
function initializeNetworkFiltering(frb) {
    const networkingModules = [
        { name: "http", module: require("http"), path: ["request"] },
        { name: "http", module: require("http"), path: ["get"] },
        { name: "https", module: require("https"), path: ["request"] },
        { name: "https", module: require("https"), path: ["get"] },
        { name: "net", module: require("net"), path: ["connect"] },
    ];
    const history = {};
    const results = networkingModules.map((bundle) => {
        let obj = bundle.module;
        for (const field of bundle.path.slice(0, -1)) {
            obj = obj[field];
        }
        const method = bundle.path.slice(-1)[0];
        const original = obj[method].bind(bundle.module);
        obj[method] = function (...args) {
            const hrefs = args
                .map((arg) => {
                if (typeof arg === "string") {
                    try {
                        new url_1.URL(arg);
                        return arg;
                    }
                    catch (err) {
                        return;
                    }
                }
                else if (typeof arg === "object") {
                    return arg.href;
                }
                else {
                    return;
                }
            })
                .filter((v) => v);
            const href = (hrefs.length && hrefs[0]) || "";
            if (href && !history[href] && !href.startsWith("http://localhost")) {
                history[href] = true;
                if (href.indexOf("googleapis.com") !== -1) {
                    new types_1.EmulatorLog("SYSTEM", "googleapis-network-access", "", {
                        href,
                        module: bundle.name,
                    }).log();
                }
                else {
                    new types_1.EmulatorLog("SYSTEM", "unidentified-network-access", "", {
                        href,
                        module: bundle.name,
                    }).log();
                }
            }
            try {
                return original(...args);
            }
            catch (e) {
                const newed = new original(...args);
                return newed;
            }
        };
        return { name: bundle.name, status: "mocked" };
    });
    logDebug("Outgoing network have been stubbed.", results);
}
async function initializeFirebaseFunctionsStubs(frb) {
    const firebaseFunctionsResolution = await assertResolveDeveloperNodeModule(frb, "firebase-functions");
    const firebaseFunctionsRoot = (0, functionsEmulatorShared_1.findModuleRoot)("firebase-functions", firebaseFunctionsResolution.resolution);
    const httpsProviderResolution = path.join(firebaseFunctionsRoot, "lib/providers/https");
    const httpsProviderV1Resolution = path.join(firebaseFunctionsRoot, "lib/v1/providers/https");
    let httpsProvider;
    try {
        httpsProvider = require(httpsProviderV1Resolution);
    }
    catch (e) {
        httpsProvider = require(httpsProviderResolution);
    }
    const onRequestInnerMethodName = "_onRequestWithOptions";
    const onRequestMethodOriginal = httpsProvider[onRequestInnerMethodName];
    httpsProvider[onRequestInnerMethodName] = (handler, opts) => {
        const cf = onRequestMethodOriginal(handler, opts);
        cf.__emulator_func = handler;
        return cf;
    };
    httpsProvider.onRequest = (handler) => {
        return httpsProvider[onRequestInnerMethodName](handler, {});
    };
    const onCallInnerMethodName = "_onCallWithOptions";
    const onCallMethodOriginal = httpsProvider[onCallInnerMethodName];
    if (onCallMethodOriginal.length === 3) {
        httpsProvider[onCallInnerMethodName] = (opts, handler, deployOpts) => {
            const wrapped = wrapCallableHandler(handler);
            const cf = onCallMethodOriginal(opts, wrapped, deployOpts);
            return cf;
        };
    }
    else {
        httpsProvider[onCallInnerMethodName] = (handler, opts) => {
            const wrapped = wrapCallableHandler(handler);
            const cf = onCallMethodOriginal(wrapped, opts);
            return cf;
        };
    }
    httpsProvider.onCall = function (optsOrHandler, handler) {
        if (onCallMethodOriginal.length === 3) {
            let opts;
            if (arguments.length === 1) {
                opts = {};
                handler = optsOrHandler;
            }
            else {
                opts = optsOrHandler;
            }
            return httpsProvider[onCallInnerMethodName](opts, handler, {});
        }
        else {
            return httpsProvider[onCallInnerMethodName](optsOrHandler, {});
        }
    };
}
function wrapCallableHandler(handler) {
    const newHandler = (data, context) => {
        if (context.rawRequest) {
            const authContext = context.rawRequest.header(functionsEmulatorShared_1.HttpConstants.CALLABLE_AUTH_HEADER);
            if (authContext) {
                logDebug("Callable functions auth override", {
                    key: functionsEmulatorShared_1.HttpConstants.CALLABLE_AUTH_HEADER,
                    value: authContext,
                });
                context.auth = JSON.parse(decodeURIComponent(authContext));
                delete context.rawRequest.headers[functionsEmulatorShared_1.HttpConstants.CALLABLE_AUTH_HEADER];
            }
            else {
                logDebug("No callable functions auth found");
            }
            const originalAuth = context.rawRequest.header(functionsEmulatorShared_1.HttpConstants.ORIGINAL_AUTH_HEADER);
            if (originalAuth) {
                context.rawRequest.headers["authorization"] = originalAuth;
                delete context.rawRequest.headers[functionsEmulatorShared_1.HttpConstants.ORIGINAL_AUTH_HEADER];
            }
        }
        return handler(data, context);
    };
    return newHandler;
}
function getDefaultConfig() {
    return JSON.parse(process.env.FIREBASE_CONFIG || "{}");
}
function initializeRuntimeConfig(frb) {
    if (!process.env.CLOUD_RUNTIME_CONFIG) {
        const configPath = `${frb.cwd}/.runtimeconfig.json`;
        try {
            const configContent = fs.readFileSync(configPath, "utf8");
            if (configContent) {
                try {
                    JSON.parse(configContent.toString());
                    logDebug(`Found local functions config: ${configPath}`);
                    process.env.CLOUD_RUNTIME_CONFIG = configContent.toString();
                }
                catch (e) {
                    new types_1.EmulatorLog("SYSTEM", "function-runtimeconfig-json-invalid", "").log();
                }
            }
        }
        catch (e) {
        }
    }
}
async function initializeFirebaseAdminStubs(frb) {
    const adminResolution = await assertResolveDeveloperNodeModule(frb, "firebase-admin");
    const localAdminModule = require(adminResolution.resolution);
    const functionsResolution = await assertResolveDeveloperNodeModule(frb, "firebase-functions");
    const localFunctionsModule = require(functionsResolution.resolution);
    const defaultConfig = getDefaultConfig();
    const adminModuleProxy = new Proxied(localAdminModule);
    const proxiedAdminModule = adminModuleProxy
        .when("initializeApp", (adminModuleTarget) => (opts, appName) => {
        if (appName) {
            new types_1.EmulatorLog("SYSTEM", "non-default-admin-app-used", "", { appName, opts }).log();
            return adminModuleTarget.initializeApp(opts, appName);
        }
        const defaultAppOptions = opts ? opts : defaultConfig;
        new types_1.EmulatorLog("SYSTEM", "default-admin-app-used", `config=${defaultAppOptions}`, {
            opts: defaultAppOptions,
        }).log();
        const defaultApp = makeProxiedFirebaseApp(frb, adminModuleTarget.initializeApp(defaultAppOptions));
        logDebug("initializeApp(DEFAULT)", defaultAppOptions);
        localFunctionsModule.app.setEmulatedAdminApp(defaultApp);
        if (frb.emulators.auth) {
            if ((0, functionsEmulatorUtils_1.compareVersionStrings)(adminResolution.version, "9.3.0") < 0) {
                new types_1.EmulatorLog("WARN_ONCE", "runtime-status", "The Firebase Authentication emulator is running, but your 'firebase-admin' dependency is below version 9.3.0, so calls to Firebase Authentication will affect production.").log();
            }
            else if ((0, functionsEmulatorUtils_1.compareVersionStrings)(adminResolution.version, "9.4.2") <= 0) {
                const auth = defaultApp.auth();
                if (typeof auth.setJwtVerificationEnabled === "function") {
                    logDebug("auth.setJwtVerificationEnabled(false)", {});
                    auth.setJwtVerificationEnabled(false);
                }
                else {
                    logDebug("auth.setJwtVerificationEnabled not available", {});
                }
            }
        }
        return defaultApp;
    })
        .when("firestore", (target) => {
        warnAboutFirestoreProd(frb);
        return Proxied.getOriginal(target, "firestore");
    })
        .when("database", (target) => {
        warnAboutDatabaseProd(frb);
        return Proxied.getOriginal(target, "database");
    })
        .when("auth", (target) => {
        warnAboutAuthProd(frb);
        return Proxied.getOriginal(target, "auth");
    })
        .finalize();
    require.cache[adminResolution.resolution] = {
        exports: proxiedAdminModule,
        path: path.dirname(adminResolution.resolution),
    };
    logDebug("firebase-admin has been stubbed.", {
        adminResolution,
    });
}
function makeProxiedFirebaseApp(frb, original) {
    const appProxy = new Proxied(original);
    return appProxy
        .when("firestore", (target) => {
        warnAboutFirestoreProd(frb);
        return Proxied.getOriginal(target, "firestore");
    })
        .when("database", (target) => {
        warnAboutDatabaseProd(frb);
        return Proxied.getOriginal(target, "database");
    })
        .when("auth", (target) => {
        warnAboutAuthProd(frb);
        return Proxied.getOriginal(target, "auth");
    })
        .finalize();
}
function warnAboutFirestoreProd(frb) {
    if (frb.emulators.firestore) {
        return;
    }
    new types_1.EmulatorLog("WARN_ONCE", "runtime-status", "The Cloud Firestore emulator is not running, so calls to Firestore will affect production.").log();
}
function warnAboutDatabaseProd(frb) {
    if (frb.emulators.database) {
        return;
    }
    new types_1.EmulatorLog("WARN_ONCE", "runtime-status", "The Realtime Database emulator is not running, so calls to Realtime Database will affect production.").log();
}
function warnAboutAuthProd(frb) {
    if (frb.emulators.auth) {
        return;
    }
    new types_1.EmulatorLog("WARN_ONCE", "runtime-status", "The Firebase Authentication emulator is not running, so calls to Firebase Authentication will affect production.").log();
}
async function initializeFunctionsConfigHelper(frb) {
    const functionsResolution = await assertResolveDeveloperNodeModule(frb, "firebase-functions");
    const localFunctionsModule = require(functionsResolution.resolution);
    logDebug("Checked functions.config()", {
        config: localFunctionsModule.config(),
    });
    const originalConfig = localFunctionsModule.config();
    const proxiedConfig = new Proxied(originalConfig)
        .any((parentConfig, parentKey) => {
        const isInternal = parentKey.startsWith("Symbol(") || parentKey.startsWith("inspect");
        if (!parentConfig[parentKey] && !isInternal) {
            new types_1.EmulatorLog("SYSTEM", "functions-config-missing-value", "", {
                key: parentKey,
            }).log();
        }
        return parentConfig[parentKey];
    })
        .finalize();
    const functionsModuleProxy = new Proxied(localFunctionsModule);
    const proxiedFunctionsModule = functionsModuleProxy
        .when("config", (target) => () => {
        return proxiedConfig;
    })
        .finalize();
    require.cache[functionsResolution.resolution] = {
        exports: proxiedFunctionsModule,
        path: path.dirname(functionsResolution.resolution),
    };
    logDebug("firebase-functions has been stubbed.", {
        functionsResolution,
    });
}
function rawBodySaver(req, res, buf) {
    req.rawBody = buf;
}
async function processHTTPS(frb, trigger) {
    const ephemeralServer = express();
    const functionRouter = express.Router();
    const socketPath = frb.socketPath;
    if (!socketPath) {
        new types_1.EmulatorLog("FATAL", "runtime-error", "Called processHTTPS with no socketPath").log();
        return;
    }
    await new Promise((resolveEphemeralServer, rejectEphemeralServer) => {
        const handler = async (req, res) => {
            try {
                logDebug(`Ephemeral server handling ${req.method} request`);
                const func = trigger.getRawFunction();
                res.on("finish", () => {
                    instance.close((err) => {
                        if (err) {
                            rejectEphemeralServer(err);
                        }
                        else {
                            resolveEphemeralServer();
                        }
                    });
                });
                await runHTTPS([req, res], func);
            }
            catch (err) {
                rejectEphemeralServer(err);
            }
        };
        ephemeralServer.enable("trust proxy");
        ephemeralServer.use(bodyParser.json({
            limit: "10mb",
            verify: rawBodySaver,
        }));
        ephemeralServer.use(bodyParser.text({
            limit: "10mb",
            verify: rawBodySaver,
        }));
        ephemeralServer.use(bodyParser.urlencoded({
            extended: true,
            limit: "10mb",
            verify: rawBodySaver,
        }));
        ephemeralServer.use(bodyParser.raw({
            type: "*/*",
            limit: "10mb",
            verify: rawBodySaver,
        }));
        functionRouter.all("*", handler);
        ephemeralServer.use([`/`, `/*`], functionRouter);
        logDebug(`Attempting to listen to socketPath: ${socketPath}`);
        const instance = ephemeralServer.listen(socketPath, () => {
            new types_1.EmulatorLog("SYSTEM", "runtime-status", "ready", { state: "ready" }).log();
        });
        instance.on("error", rejectEphemeralServer);
    });
}
async function processBackground(frb, trigger, signature) {
    const proto = frb.proto;
    logDebug("ProcessBackground", proto);
    if (signature === "cloudevent") {
        return runCloudEvent(proto, trigger.getRawFunction());
    }
    const data = proto.data;
    delete proto.data;
    const context = proto.context ? proto.context : proto;
    if (!proto.eventType || !proto.eventType.startsWith("google.storage")) {
        if (context.resource && context.resource.name) {
            logDebug("ProcessBackground: lifting resource.name from resource", context.resource);
            context.resource = context.resource.name;
        }
    }
    await runBackground({ data, context }, trigger.getRawFunction());
}
async function runFunction(func) {
    let caughtErr;
    try {
        await func();
    }
    catch (err) {
        caughtErr = err;
    }
    logDebug(`Ephemeral server survived.`);
    if (caughtErr) {
        throw caughtErr;
    }
}
async function runBackground(proto, func) {
    logDebug("RunBackground", proto);
    await runFunction(() => {
        return func(proto.data, proto.context);
    });
}
async function runCloudEvent(event, func) {
    logDebug("RunCloudEvent", event);
    await runFunction(() => {
        return func(event);
    });
}
async function runHTTPS(args, func) {
    if (args.length < 2) {
        throw new Error("Function must be passed 2 args.");
    }
    await runFunction(() => {
        return func(args[0], args[1]);
    });
}
async function moduleResolutionDetective(frb, error) {
    const clues = {
        tsconfigJSON: await requireAsync("./tsconfig.json", { paths: [frb.cwd] }).catch(noOp),
        packageJSON: await requireAsync("./package.json", { paths: [frb.cwd] }).catch(noOp),
    };
    const isPotentially = {
        typescript: false,
        uncompiled: false,
        wrong_directory: false,
    };
    isPotentially.typescript = !!clues.tsconfigJSON;
    isPotentially.wrong_directory = !clues.packageJSON;
    isPotentially.uncompiled = !!_.get(clues.packageJSON, "scripts.build", false);
    new types_1.EmulatorLog("SYSTEM", "function-code-resolution-failed", "", {
        isPotentially,
        error: error.stack,
    }).log();
}
function logDebug(msg, data) {
    new types_1.EmulatorLog("DEBUG", "runtime-status", `[${process.pid}] ${msg}`, data).log();
}
async function invokeTrigger(frb, triggers) {
    if (!frb.triggerId) {
        throw new Error("frb.triggerId unexpectedly null");
    }
    new types_1.EmulatorLog("INFO", "runtime-status", `Beginning execution of "${frb.triggerId}"`, {
        frb,
    }).log();
    const trigger = triggers[frb.triggerId];
    logDebug("triggerDefinition", trigger.definition);
    const signature = (0, functionsEmulatorShared_1.getSignatureType)(trigger.definition);
    logDebug(`Running ${frb.triggerId} in signature ${signature}`);
    let seconds = 0;
    const timerId = setInterval(() => {
        seconds++;
    }, 1000);
    let timeoutId;
    if (isFeatureEnabled(frb, "timeout")) {
        timeoutId = setTimeout(() => {
            new types_1.EmulatorLog("WARN", "runtime-status", `Your function timed out after ~${trigger.definition.timeout || "60s"}. To configure this timeout, see
      https://firebase.google.com/docs/functions/manage-functions#set_timeout_and_memory_allocation.`).log();
            throw new Error("Function timed out.");
        }, trigger.timeoutMs);
    }
    switch (signature) {
        case "event":
        case "cloudevent":
            await processBackground(frb, triggers[frb.triggerId], signature);
            break;
        case "http":
            await processHTTPS(frb, triggers[frb.triggerId]);
            break;
    }
    if (timeoutId) {
        clearTimeout(timeoutId);
    }
    clearInterval(timerId);
    new types_1.EmulatorLog("INFO", "runtime-status", `Finished "${frb.triggerId}" in ~${Math.max(seconds, 1)}s`).log();
}
async function initializeRuntime(frb, serializedFunctionTrigger, extensionTriggers) {
    logDebug(`Disabled runtime features: ${JSON.stringify(frb.disabled_features)}`);
    const verified = await verifyDeveloperNodeModules(frb);
    if (!verified) {
        new types_1.EmulatorLog("INFO", "runtime-status", `Your functions could not be parsed due to an issue with your node_modules (see above)`).log();
        return;
    }
    initializeRuntimeConfig(frb);
    initializeNetworkFiltering(frb);
    await initializeFunctionsConfigHelper(frb);
    await initializeFirebaseFunctionsStubs(frb);
    await initializeFirebaseAdminStubs(frb);
    let parsedDefinitions = [];
    let triggerModule;
    if (serializedFunctionTrigger) {
        triggerModule = eval(serializedFunctionTrigger)();
    }
    else {
        try {
            triggerModule = require(frb.cwd);
        }
        catch (err) {
            if (err.code !== "ERR_REQUIRE_ESM") {
                await moduleResolutionDetective(frb, err);
                return;
            }
            const modulePath = require.resolve(frb.cwd);
            const moduleURL = (0, url_1.pathToFileURL)(modulePath).href;
            triggerModule = await dynamicImport(moduleURL);
        }
    }
    if (extensionTriggers) {
        parsedDefinitions = extensionTriggers;
    }
    else {
        require("../deploy/functions/runtimes/node/extractTriggers")(triggerModule, parsedDefinitions);
    }
    const triggerDefinitions = (0, functionsEmulatorShared_1.emulatedFunctionsByRegion)(parsedDefinitions);
    const triggers = (0, functionsEmulatorShared_1.getEmulatedTriggersFromDefinitions)(triggerDefinitions, triggerModule);
    new types_1.EmulatorLog("SYSTEM", "triggers-parsed", "", { triggers, triggerDefinitions }).log();
    return triggers;
}
async function flushAndExit(code) {
    await types_1.EmulatorLog.waitForFlush();
    process.exit(code);
}
async function goIdle() {
    new types_1.EmulatorLog("SYSTEM", "runtime-status", "Runtime is now idle", { state: "idle" }).log();
    await types_1.EmulatorLog.waitForFlush();
}
async function handleMessage(message) {
    let runtimeArgs;
    try {
        runtimeArgs = JSON.parse(message);
    }
    catch (e) {
        new types_1.EmulatorLog("FATAL", "runtime-error", `Got unexpected message body: ${message}`).log();
        await flushAndExit(1);
        return;
    }
    if (!triggers) {
        const serializedTriggers = runtimeArgs.opts ? runtimeArgs.opts.serializedTriggers : undefined;
        const extensionTriggers = runtimeArgs.opts ? runtimeArgs.opts.extensionTriggers : undefined;
        triggers = await initializeRuntime(runtimeArgs.frb, serializedTriggers, extensionTriggers);
    }
    if (!triggers) {
        await flushAndExit(1);
        return;
    }
    if (!runtimeArgs.frb.triggerId) {
        await goIdle();
        return;
    }
    if (!triggers[runtimeArgs.frb.triggerId]) {
        new types_1.EmulatorLog("FATAL", "runtime-status", `Could not find trigger "${runtimeArgs.frb.triggerId}" in your functions directory.`).log();
        return;
    }
    else {
        logDebug(`Trigger "${runtimeArgs.frb.triggerId}" has been found, beginning invocation!`);
    }
    try {
        await invokeTrigger(runtimeArgs.frb, triggers);
        if (runtimeArgs.opts && runtimeArgs.opts.serializedTriggers) {
            await flushAndExit(0);
        }
        else {
            await goIdle();
        }
    }
    catch (err) {
        new types_1.EmulatorLog("FATAL", "runtime-error", err.stack ? err.stack : err).log();
        await flushAndExit(1);
    }
}
function main() {
    let lastSignal = new Date().getTime();
    let signalCount = 0;
    process.on("SIGINT", () => {
        const now = new Date().getTime();
        if (now - lastSignal < 100) {
            return;
        }
        signalCount = signalCount + 1;
        lastSignal = now;
        if (signalCount >= 2) {
            process.exit(1);
        }
    });
    logDebug("Functions runtime initialized.", {
        cwd: process.cwd(),
        node_version: process.versions.node,
    });
    let messageHandlePromise = Promise.resolve();
    process.on("message", (message) => {
        messageHandlePromise = messageHandlePromise
            .then(() => {
            return handleMessage(message);
        })
            .catch((err) => {
            logDebug(`Error in handleMessage: ${message} => ${err}: ${err.stack}`);
            new types_1.EmulatorLog("FATAL", "runtime-error", err.message || err, err).log();
            return flushAndExit(1);
        });
    });
}
if (require.main === module) {
    main();
}
//# sourceMappingURL=functionsEmulatorRuntime.js.map