"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getParams = exports.buildOptions = void 0;
const fs = require("fs-extra");
const _ = require("lodash");
const path = require("path");
const paramHelper = require("../paramHelper");
const specHelper = require("./specHelper");
const localHelper = require("../localHelper");
const triggerHelper = require("./triggerHelper");
const extensionsHelper = require("../extensionsHelper");
const config_1 = require("../../config");
const error_1 = require("../../error");
const emulatorLogger_1 = require("../../emulator/emulatorLogger");
const projectUtils_1 = require("../../projectUtils");
const types_1 = require("../../emulator/types");
async function buildOptions(options) {
    const extensionDir = localHelper.findExtensionYaml(process.cwd());
    options.extensionDir = extensionDir;
    const spec = await specHelper.readExtensionYaml(extensionDir);
    extensionsHelper.validateSpec(spec);
    const params = getParams(options, spec);
    extensionsHelper.validateCommandLineParams(params, spec.params);
    const functionResources = specHelper.getFunctionResourcesWithParamSubstitution(spec, params);
    let testConfig;
    if (options.testConfig) {
        testConfig = readTestConfigFile(options.testConfig);
        checkTestConfig(testConfig, functionResources);
    }
    options.config = buildConfig(functionResources, testConfig);
    options.extensionEnv = params;
    const functionEmuTriggerDefs = functionResources.map((r) => triggerHelper.functionResourceToEmulatedTriggerDefintion(r));
    options.extensionTriggers = functionEmuTriggerDefs;
    options.extensionNodeVersion = specHelper.getNodeVersion(functionResources);
    return options;
}
exports.buildOptions = buildOptions;
function getParams(options, extensionSpec) {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const userParams = paramHelper.readEnvFile(options.testParams);
    const autoParams = {
        PROJECT_ID: projectId,
        EXT_INSTANCE_ID: extensionSpec.name,
        DATABASE_INSTANCE: projectId,
        DATABASE_URL: `https://${projectId}.firebaseio.com`,
        STORAGE_BUCKET: `${projectId}.appspot.com`,
    };
    const unsubbedParamsWithoutDefaults = Object.assign(autoParams, userParams);
    const unsubbedParams = extensionsHelper.populateDefaultParams(unsubbedParamsWithoutDefaults, extensionSpec.params);
    return extensionsHelper.substituteParams(unsubbedParams, unsubbedParams);
}
exports.getParams = getParams;
function checkTestConfig(testConfig, functionResources) {
    const logger = emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.FUNCTIONS);
    if (!testConfig.functions && functionResources.length) {
        logger.log("WARN", "This extension uses functions," +
            "but 'firebase.json' provided by --test-config is missing a top-level 'functions' object." +
            "Functions will not be emulated.");
    }
    if (!testConfig.firestore && shouldEmulateFirestore(functionResources)) {
        logger.log("WARN", "This extension interacts with Cloud Firestore," +
            "but 'firebase.json' provided by --test-config is missing a top-level 'firestore' object." +
            "Cloud Firestore will not be emulated.");
    }
    if (!testConfig.database && shouldEmulateDatabase(functionResources)) {
        logger.log("WARN", "This extension interacts with Realtime Database," +
            "but 'firebase.json' provided by --test-config is missing a top-level 'database' object." +
            "Realtime Database will not be emulated.");
    }
    if (!testConfig.storage && shouldEmulateStorage(functionResources)) {
        logger.log("WARN", "This extension interacts with Cloud Storage," +
            "but 'firebase.json' provided by --test-config is missing a top-level 'storage' object." +
            "Cloud Storage will not be emulated.");
    }
}
function readTestConfigFile(testConfigPath) {
    try {
        const buf = fs.readFileSync(path.resolve(testConfigPath));
        return JSON.parse(buf.toString());
    }
    catch (err) {
        throw new error_1.FirebaseError(`Error reading --test-config file: ${err.message}\n`, {
            original: err,
        });
    }
}
function buildConfig(functionResources, testConfig) {
    const config = new config_1.Config(testConfig || {}, { projectDir: process.cwd(), cwd: process.cwd() });
    const emulateFunctions = shouldEmulateFunctions(functionResources);
    if (!testConfig) {
        if (emulateFunctions) {
            config.set("functions", {});
        }
        if (shouldEmulateFirestore(functionResources)) {
            config.set("firestore", {});
        }
        if (shouldEmulateDatabase(functionResources)) {
            config.set("database", {});
        }
        if (shouldEmulatePubsub(functionResources)) {
            config.set("pubsub", {});
        }
        if (shouldEmulateStorage(functionResources)) {
            config.set("storage", {});
        }
    }
    if (config.src.functions) {
        const sourceDirectory = getFunctionSourceDirectory(functionResources);
        config.set("functions.source", sourceDirectory);
    }
    return config;
}
function getFunctionSourceDirectory(functionResources) {
    let sourceDirectory;
    for (const r of functionResources) {
        let dir = _.get(r, "properties.sourceDirectory");
        if (!dir) {
            dir = "functions";
        }
        if (!sourceDirectory) {
            sourceDirectory = dir;
        }
        else if (sourceDirectory != dir) {
            throw new error_1.FirebaseError(`Found function resources with different sourceDirectories: '${sourceDirectory}' and '${dir}'. The extensions emulator only supports a single sourceDirectory.`);
        }
    }
    return sourceDirectory;
}
function shouldEmulateFunctions(resources) {
    return resources.length > 0;
}
function shouldEmulate(emulatorName, resources) {
    for (const r of resources) {
        const eventType = _.get(r, "properties.eventTrigger.eventType", "");
        if (eventType.includes(emulatorName)) {
            return true;
        }
    }
    return false;
}
function shouldEmulateFirestore(resources) {
    return shouldEmulate("cloud.firestore", resources);
}
function shouldEmulateDatabase(resources) {
    return shouldEmulate("google.firebase.database", resources);
}
function shouldEmulatePubsub(resources) {
    return shouldEmulate("google.pubsub", resources);
}
function shouldEmulateStorage(resources) {
    return shouldEmulate("google.storage", resources);
}
//# sourceMappingURL=optionsHelper.js.map