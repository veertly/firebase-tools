"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readEnvFile = exports.getParamsFromFile = exports.promptForNewParams = exports.getParamsForUpdate = exports.getParams = exports.getParamsWithCurrentValuesAsDefaults = void 0;
const _ = require("lodash");
const path = require("path");
const clc = require("cli-color");
const fs = require("fs-extra");
const error_1 = require("../error");
const logger_1 = require("../logger");
const extensionsHelper_1 = require("./extensionsHelper");
const askUserForParam = require("./askUserForParam");
const track = require("../track");
const env = require("../functions/env");
function setNewDefaults(params, newDefaults) {
    params.forEach((param) => {
        if (newDefaults[param.param.toUpperCase()]) {
            param.default = newDefaults[param.param.toUpperCase()];
        }
    });
    return params;
}
function getParamsWithCurrentValuesAsDefaults(extensionInstance) {
    const specParams = _.cloneDeep(_.get(extensionInstance, "config.source.spec.params", []));
    const currentParams = _.cloneDeep(_.get(extensionInstance, "config.params", {}));
    return setNewDefaults(specParams, currentParams);
}
exports.getParamsWithCurrentValuesAsDefaults = getParamsWithCurrentValuesAsDefaults;
async function getParams(args) {
    let params;
    if (args.nonInteractive && !args.paramsEnvPath) {
        const paramsMessage = args.paramSpecs
            .map((p) => {
            return `\t${p.param}${p.required ? "" : " (Optional)"}`;
        })
            .join("\n");
        throw new error_1.FirebaseError("In non-interactive mode but no `--params` flag found. " +
            "To install this extension in non-interactive mode, set `--params` to a path to an .env file" +
            " containing values for this extension's params:\n" +
            paramsMessage);
    }
    else if (args.paramsEnvPath) {
        params = getParamsFromFile({
            projectId: args.projectId,
            paramSpecs: args.paramSpecs,
            paramsEnvPath: args.paramsEnvPath,
        });
    }
    else {
        const firebaseProjectParams = await (0, extensionsHelper_1.getFirebaseProjectParams)(args.projectId);
        params = await askUserForParam.ask(args.projectId, args.instanceId, args.paramSpecs, firebaseProjectParams, !!args.reconfiguring);
    }
    track("Extension Params", _.isEmpty(params) ? "Not Present" : "Present", _.size(params));
    return params;
}
exports.getParams = getParams;
async function getParamsForUpdate(args) {
    let params;
    if (args.nonInteractive && !args.paramsEnvPath) {
        const paramsMessage = args.newSpec.params
            .map((p) => {
            return `\t${p.param}${p.required ? "" : " (Optional)"}`;
        })
            .join("\n");
        throw new error_1.FirebaseError("In non-interactive mode but no `--params` flag found. " +
            "To update this extension in non-interactive mode, set `--params` to a path to an .env file" +
            " containing values for this extension's params:\n" +
            paramsMessage);
    }
    else if (args.paramsEnvPath) {
        params = getParamsFromFile({
            projectId: args.projectId,
            paramSpecs: args.newSpec.params,
            paramsEnvPath: args.paramsEnvPath,
        });
    }
    else {
        params = await promptForNewParams({
            spec: args.spec,
            newSpec: args.newSpec,
            currentParams: args.currentParams,
            projectId: args.projectId,
            instanceId: args.instanceId,
        });
    }
    track("Extension Params", _.isEmpty(params) ? "Not Present" : "Present", _.size(params));
    return params;
}
exports.getParamsForUpdate = getParamsForUpdate;
async function promptForNewParams(args) {
    const firebaseProjectParams = await (0, extensionsHelper_1.getFirebaseProjectParams)(args.projectId);
    const comparer = (param1, param2) => {
        return param1.type === param2.type && param1.param === param2.param;
    };
    let paramsDiffDeletions = _.differenceWith(args.spec.params, _.get(args.newSpec, "params", []), comparer);
    paramsDiffDeletions = (0, extensionsHelper_1.substituteParams)(paramsDiffDeletions, firebaseProjectParams);
    let paramsDiffAdditions = _.differenceWith(args.newSpec.params, _.get(args.spec, "params", []), comparer);
    paramsDiffAdditions = (0, extensionsHelper_1.substituteParams)(paramsDiffAdditions, firebaseProjectParams);
    if (paramsDiffDeletions.length) {
        logger_1.logger.info("The following params will no longer be used:");
        paramsDiffDeletions.forEach((param) => {
            logger_1.logger.info(clc.red(`- ${param.param}: ${args.currentParams[param.param.toUpperCase()]}`));
            delete args.currentParams[param.param.toUpperCase()];
        });
    }
    if (paramsDiffAdditions.length) {
        logger_1.logger.info("To update this instance, configure the following new parameters:");
        for (const param of paramsDiffAdditions) {
            const chosenValue = await askUserForParam.askForParam(args.projectId, args.instanceId, param, false);
            args.currentParams[param.param] = chosenValue;
        }
    }
    return args.currentParams;
}
exports.promptForNewParams = promptForNewParams;
function getParamsFromFile(args) {
    let envParams;
    try {
        envParams = readEnvFile(args.paramsEnvPath);
        track("Extension Env File", "Present");
    }
    catch (err) {
        track("Extension Env File", "Invalid");
        throw new error_1.FirebaseError(`Error reading env file: ${err.message}\n`, { original: err });
    }
    const params = (0, extensionsHelper_1.populateDefaultParams)(envParams, args.paramSpecs);
    (0, extensionsHelper_1.validateCommandLineParams)(params, args.paramSpecs);
    logger_1.logger.info(`Using param values from ${args.paramsEnvPath}`);
    return params;
}
exports.getParamsFromFile = getParamsFromFile;
function readEnvFile(envPath) {
    const buf = fs.readFileSync(path.resolve(envPath), "utf8");
    const result = env.parse(buf.toString().trim());
    if (result.errors.length) {
        throw new error_1.FirebaseError(`Error while parsing ${envPath} - unable to parse following lines:\n${result.errors.join("\n")}`);
    }
    return result.envs;
}
exports.readEnvFile = readEnvFile;
//# sourceMappingURL=paramHelper.js.map