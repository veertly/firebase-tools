"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("lodash");
const clc = require("cli-color");
const marked = require("marked");
const ora = require("ora");
const TerminalRenderer = require("marked-terminal");
const checkMinRequiredVersion_1 = require("../checkMinRequiredVersion");
const command_1 = require("../command");
const error_1 = require("../error");
const projectUtils_1 = require("../projectUtils");
const extensionsApi = require("../extensions/extensionsApi");
const extensionsHelper_1 = require("../extensions/extensionsHelper");
const paramHelper = require("../extensions/paramHelper");
const requirePermissions_1 = require("../requirePermissions");
const utils = require("../utils");
const logger_1 = require("../logger");
marked.setOptions({
    renderer: new TerminalRenderer(),
});
exports.default = new command_1.Command("ext:configure <extensionInstanceId>")
    .description("configure an existing extension instance")
    .withForce()
    .option("--params <paramsFile>", "path of params file with .env format.")
    .before(requirePermissions_1.requirePermissions, [
    "firebaseextensions.instances.update",
    "firebaseextensions.instances.get",
])
    .before(checkMinRequiredVersion_1.checkMinRequiredVersion, "extMinVersion")
    .action(async (instanceId, options) => {
    const spinner = ora(`Configuring ${clc.bold(instanceId)}. This usually takes 3 to 5 minutes...`);
    try {
        const projectId = (0, projectUtils_1.needProjectId)(options);
        let existingInstance;
        try {
            existingInstance = await extensionsApi.getInstance(projectId, instanceId);
        }
        catch (err) {
            if (err.status === 404) {
                return utils.reject(`No extension instance ${instanceId} found in project ${projectId}.`, {
                    exit: 1,
                });
            }
            throw err;
        }
        const paramSpecWithNewDefaults = paramHelper.getParamsWithCurrentValuesAsDefaults(existingInstance);
        const immutableParams = _.remove(paramSpecWithNewDefaults, (param) => {
            return param.immutable || param.param === "LOCATION";
        });
        const params = await paramHelper.getParams({
            projectId,
            paramSpecs: paramSpecWithNewDefaults,
            nonInteractive: options.nonInteractive,
            paramsEnvPath: options.params,
            instanceId,
            reconfiguring: true,
        });
        if (immutableParams.length) {
            const plural = immutableParams.length > 1;
            logger_1.logger.info(`The following param${plural ? "s are" : " is"} immutable:`);
            for (const { param } of immutableParams) {
                const value = _.get(existingInstance, `config.params.${param}`);
                logger_1.logger.info(`param: ${param}, value: ${value}`);
                params[param] = value;
            }
            logger_1.logger.info((plural
                ? "To set different values for these params"
                : "To set a different value for this param") +
                ", uninstall the extension, then install a new instance of this extension.");
        }
        spinner.start();
        const res = await extensionsApi.configureInstance({ projectId, instanceId, params });
        spinner.stop();
        utils.logLabeledSuccess(extensionsHelper_1.logPrefix, `successfully configured ${clc.bold(instanceId)}.`);
        utils.logLabeledBullet(extensionsHelper_1.logPrefix, marked(`You can view your reconfigured instance in the Firebase console: ${utils.consoleUrl(projectId, `/extensions/instances/${instanceId}?tab=config`)}`));
        return res;
    }
    catch (err) {
        if (spinner.isSpinning) {
            spinner.fail();
        }
        if (!(err instanceof error_1.FirebaseError)) {
            throw new error_1.FirebaseError(`Error occurred while configuring the instance: ${err.message}`, {
                original: err,
            });
        }
        throw err;
    }
});
//# sourceMappingURL=ext-configure.js.map