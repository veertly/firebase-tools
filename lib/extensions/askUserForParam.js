"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ask = exports.getInquirerDefault = exports.promptCreateSecret = exports.askForParam = exports.checkResponse = void 0;
const _ = require("lodash");
const clc = require("cli-color");
const marked = require("marked");
const extensionsApi_1 = require("./extensionsApi");
const secretManagerApi = require("../gcp/secretManager");
const secretsUtils = require("./secretsUtils");
const extensionsHelper_1 = require("./extensionsHelper");
const utils_1 = require("./utils");
const logger_1 = require("../logger");
const prompt_1 = require("../prompt");
const utils = require("../utils");
var SecretUpdateAction;
(function (SecretUpdateAction) {
    SecretUpdateAction[SecretUpdateAction["LEAVE"] = 0] = "LEAVE";
    SecretUpdateAction[SecretUpdateAction["SET_NEW"] = 1] = "SET_NEW";
})(SecretUpdateAction || (SecretUpdateAction = {}));
function checkResponse(response, spec) {
    let valid = true;
    let responses;
    if (spec.required && (response == "" || response == undefined)) {
        utils.logWarning(`Param ${spec.param} is required, but no value was provided.`);
        return false;
    }
    if (spec.type === extensionsApi_1.ParamType.MULTISELECT) {
        responses = response.split(",");
    }
    else {
        responses = [response];
    }
    if (spec.validationRegex && !!response) {
        const re = new RegExp(spec.validationRegex);
        _.forEach(responses, (resp) => {
            if ((spec.required || resp !== "") && !re.test(resp)) {
                const genericWarn = `${resp} is not a valid value for ${spec.param} since it` +
                    ` does not meet the requirements of the regex validation: "${spec.validationRegex}"`;
                utils.logWarning(spec.validationErrorMessage || genericWarn);
                valid = false;
            }
        });
    }
    if (spec.type && (spec.type === extensionsApi_1.ParamType.MULTISELECT || spec.type === extensionsApi_1.ParamType.SELECT)) {
        _.forEach(responses, (r) => {
            const validChoice = _.some(spec.options, (option) => {
                return r === option.value;
            });
            if (!validChoice) {
                utils.logWarning(`${r} is not a valid option for ${spec.param}.`);
                valid = false;
            }
        });
    }
    return valid;
}
exports.checkResponse = checkResponse;
async function askForParam(projectId, instanceId, paramSpec, reconfiguring) {
    let valid = false;
    let response = "";
    const description = paramSpec.description || "";
    const label = paramSpec.label.trim();
    logger_1.logger.info(`\n${clc.bold(label)}${clc.bold(paramSpec.required ? "" : " (Optional)")}: ${marked(description).trim()}`);
    while (!valid) {
        switch (paramSpec.type) {
            case extensionsApi_1.ParamType.SELECT:
                response = await (0, prompt_1.promptOnce)({
                    name: "input",
                    type: "list",
                    default: () => {
                        if (paramSpec.default) {
                            return getInquirerDefault(_.get(paramSpec, "options", []), paramSpec.default);
                        }
                    },
                    message: "Which option do you want enabled for this parameter? " +
                        "Select an option with the arrow keys, and use Enter to confirm your choice. " +
                        "You may only select one option.",
                    choices: (0, utils_1.convertExtensionOptionToLabeledList)(paramSpec.options),
                });
                valid = checkResponse(response, paramSpec);
                break;
            case extensionsApi_1.ParamType.MULTISELECT:
                response = await (0, utils_1.onceWithJoin)({
                    name: "input",
                    type: "checkbox",
                    default: () => {
                        if (paramSpec.default) {
                            const defaults = paramSpec.default.split(",");
                            return defaults.map((def) => {
                                return getInquirerDefault(_.get(paramSpec, "options", []), def);
                            });
                        }
                    },
                    message: "Which options do you want enabled for this parameter? " +
                        "Press Space to select, then Enter to confirm your choices. " +
                        "You may select multiple options.",
                    choices: (0, utils_1.convertExtensionOptionToLabeledList)(paramSpec.options),
                });
                valid = checkResponse(response, paramSpec);
                break;
            case extensionsApi_1.ParamType.SECRET:
                response = reconfiguring
                    ? await promptReconfigureSecret(projectId, instanceId, paramSpec)
                    : await promptCreateSecret(projectId, instanceId, paramSpec);
                valid = true;
                break;
            default:
                response = await (0, prompt_1.promptOnce)({
                    name: paramSpec.param,
                    type: "input",
                    default: paramSpec.default,
                    message: `Enter a value for ${label}:`,
                });
                valid = checkResponse(response, paramSpec);
        }
    }
    return response;
}
exports.askForParam = askForParam;
async function promptReconfigureSecret(projectId, instanceId, paramSpec) {
    const action = await (0, prompt_1.promptOnce)({
        type: "list",
        message: `Choose what you would like to do with this secret:`,
        choices: [
            { name: "Leave unchanged", value: SecretUpdateAction.LEAVE },
            { name: "Set new value", value: SecretUpdateAction.SET_NEW },
        ],
    });
    switch (action) {
        case SecretUpdateAction.SET_NEW:
            let secret;
            let secretName;
            if (paramSpec.default) {
                secret = secretManagerApi.parseSecretResourceName(paramSpec.default);
                secretName = secret.name;
            }
            else {
                secretName = await generateSecretName(projectId, instanceId, paramSpec.param);
            }
            const secretValue = await (0, prompt_1.promptOnce)({
                name: paramSpec.param,
                type: "password",
                message: `This secret will be stored in Cloud Secret Manager as ${secretName}.\nEnter new value for ${paramSpec.label.trim()}:`,
            });
            if (secretValue === "" && paramSpec.required) {
                logger_1.logger.info(`Secret value cannot be empty for required param ${paramSpec.param}`);
                return promptReconfigureSecret(projectId, instanceId, paramSpec);
            }
            else if (secretValue !== "") {
                if (checkResponse(secretValue, paramSpec)) {
                    if (!secret) {
                        secret = await secretManagerApi.createSecret(projectId, secretName, secretsUtils.getSecretLabels(instanceId));
                    }
                    return addNewSecretVersion(projectId, instanceId, secret, paramSpec, secretValue);
                }
                else {
                    return promptReconfigureSecret(projectId, instanceId, paramSpec);
                }
            }
            else {
                return "";
            }
        case SecretUpdateAction.LEAVE:
        default:
            return paramSpec.default || "";
    }
}
async function promptCreateSecret(projectId, instanceId, paramSpec, secretName) {
    const name = secretName !== null && secretName !== void 0 ? secretName : (await generateSecretName(projectId, instanceId, paramSpec.param));
    const secretValue = await (0, prompt_1.promptOnce)({
        name: paramSpec.param,
        type: "password",
        default: paramSpec.default,
        message: `This secret will be stored in Cloud Secret Manager (https://cloud.google.com/secret-manager/pricing) as ${name} and managed by Firebase Extensions (Firebase Extensions Service Agent will be granted Secret Admin role on this secret).\nEnter a value for ${paramSpec.label.trim()}:`,
    });
    if (secretValue === "" && paramSpec.required) {
        logger_1.logger.info(`Secret value cannot be empty for required param ${paramSpec.param}`);
        return promptCreateSecret(projectId, instanceId, paramSpec, name);
    }
    else if (secretValue !== "") {
        if (checkResponse(secretValue, paramSpec)) {
            const secret = await secretManagerApi.createSecret(projectId, name, secretsUtils.getSecretLabels(instanceId));
            return addNewSecretVersion(projectId, instanceId, secret, paramSpec, secretValue);
        }
        else {
            return promptCreateSecret(projectId, instanceId, paramSpec, name);
        }
    }
    else {
        return "";
    }
}
exports.promptCreateSecret = promptCreateSecret;
async function generateSecretName(projectId, instanceId, paramName) {
    let secretName = `ext-${instanceId}-${paramName}`;
    while (await secretManagerApi.secretExists(projectId, secretName)) {
        secretName += `-${(0, utils_1.getRandomString)(3)}`;
    }
    return secretName;
}
async function addNewSecretVersion(projectId, instanceId, secret, paramSpec, secretValue) {
    const version = await secretManagerApi.addVersion(secret, secretValue);
    await secretsUtils.grantFirexServiceAgentSecretAdminRole(secret);
    return `projects/${version.secret.projectId}/secrets/${version.secret.name}/versions/${version.versionId}`;
}
function getInquirerDefault(options, def) {
    const defaultOption = _.find(options, (option) => {
        return option.value === def;
    });
    return defaultOption ? defaultOption.label || defaultOption.value : "";
}
exports.getInquirerDefault = getInquirerDefault;
async function ask(projectId, instanceId, paramSpecs, firebaseProjectParams, reconfiguring) {
    if (_.isEmpty(paramSpecs)) {
        logger_1.logger.debug("No params were specified for this extension.");
        return {};
    }
    utils.logLabeledBullet(extensionsHelper_1.logPrefix, "answer the questions below to configure your extension:");
    const substituted = (0, extensionsHelper_1.substituteParams)(paramSpecs, firebaseProjectParams);
    const result = {};
    const promises = _.map(substituted, (paramSpec) => {
        return async () => {
            result[paramSpec.param] = await askForParam(projectId, instanceId, paramSpec, reconfiguring);
        };
    });
    await promises.reduce((prev, cur) => prev.then(cur), Promise.resolve());
    logger_1.logger.info();
    return result;
}
exports.ask = ask;
//# sourceMappingURL=askUserForParam.js.map