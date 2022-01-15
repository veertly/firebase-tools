"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("lodash");
const clc = require("cli-color");
const ora = require("ora");
const marked = require("marked");
const TerminalRenderer = require("marked-terminal");
const checkMinRequiredVersion_1 = require("../checkMinRequiredVersion");
const command_1 = require("../command");
const error_1 = require("../error");
const projectUtils_1 = require("../projectUtils");
const extensionsApi = require("../extensions/extensionsApi");
const secretsUtils = require("../extensions/secretsUtils");
const extensionsHelper_1 = require("../extensions/extensionsHelper");
const prompt_1 = require("../prompt");
const requirePermissions_1 = require("../requirePermissions");
const utils = require("../utils");
const logger_1 = require("../logger");
marked.setOptions({
    renderer: new TerminalRenderer(),
});
function consoleUninstallOnly(projectId, instanceId) {
    const instanceURL = `https://console.firebase.google.com/project/${projectId}/extensions/instances/${instanceId}`;
    const consoleUninstall = "This extension has additional uninstall checks that are not currently supported by the CLI, and can only be uninstalled through the Firebase Console. " +
        `Please visit **[${instanceURL}](${instanceURL})** to uninstall this extension.`;
    logger_1.logger.info("\n");
    utils.logLabeledWarning(extensionsHelper_1.logPrefix, marked(consoleUninstall));
    return Promise.resolve();
}
exports.default = new command_1.Command("ext:uninstall <extensionInstanceId>")
    .description("uninstall an extension that is installed in your Firebase project by instance ID")
    .withForce()
    .before(requirePermissions_1.requirePermissions, ["firebaseextensions.instances.delete"])
    .before(extensionsHelper_1.ensureExtensionsApiEnabled)
    .before(checkMinRequiredVersion_1.checkMinRequiredVersion, "extMinVersion")
    .action(async (instanceId, options) => {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    let instance;
    try {
        instance = await extensionsApi.getInstance(projectId, instanceId);
    }
    catch (err) {
        if (err.status === 404) {
            return utils.reject(`No extension instance ${instanceId} in project ${projectId}.`, {
                exit: 1,
            });
        }
        throw err;
    }
    if (_.get(instance, "config.source.spec.name") === "pubsub-stream-bigquery") {
        return consoleUninstallOnly(projectId, instanceId);
    }
    if (!options.force) {
        const serviceAccountMessage = `Uninstalling deletes the service account used by this extension instance:\n${clc.bold(instance.serviceAccountEmail)}\n\n`;
        const managedSecrets = await secretsUtils.getManagedSecrets(instance);
        const resourcesMessage = _.get(instance, "config.source.spec.resources", []).length
            ? "Uninstalling deletes all extension resources created for this extension instance:\n" +
                instance.config.source.spec.resources
                    .map((resource) => clc.bold(`- ${extensionsHelper_1.resourceTypeToNiceName[resource.type] || resource.type}: ${resource.name} \n`))
                    .join("") +
                managedSecrets
                    .map(secretsUtils.prettySecretName)
                    .map((s) => clc.bold(`- Secret: ${s}\n`))
                    .join("") +
                "\n"
            : "";
        const artifactsMessage = `The following ${clc.bold("will not")} be deleted:\n` +
            "Any artifacts (for example, stored images) created by this extension instance.\n" +
            "Any other project resources with which this extension instance interacted.\n";
        const extensionDeletionMessage = `Here's what will happen when you uninstall ${clc.bold(instanceId)} from project ${clc.bold(projectId)}. Be aware that this cannot be undone.\n\n` +
            `${serviceAccountMessage}` +
            `${resourcesMessage}` +
            `${artifactsMessage}`;
        logger_1.logger.info(extensionDeletionMessage);
        const confirmedExtensionDeletion = await (0, prompt_1.promptOnce)({
            type: "confirm",
            default: true,
            message: "Are you sure that you wish to uninstall this extension?",
        });
        if (!confirmedExtensionDeletion) {
            return utils.reject("Command aborted.", { exit: 1 });
        }
    }
    const spinner = ora(` ${clc.green.bold(extensionsHelper_1.logPrefix)}: uninstalling ${clc.bold(instanceId)}. This usually takes 1 to 2 minutes...`);
    spinner.start();
    try {
        spinner.info();
        spinner.text = ` ${clc.green.bold(extensionsHelper_1.logPrefix)}: deleting your extension instance's resources.`;
        spinner.start();
        await extensionsApi.deleteInstance(projectId, instanceId);
        spinner.succeed(` ${clc.green.bold(extensionsHelper_1.logPrefix)}: deleted your extension instance's resources.`);
    }
    catch (err) {
        if (spinner.isSpinning) {
            spinner.fail();
        }
        if (err instanceof error_1.FirebaseError) {
            throw err;
        }
        return utils.reject(`Error occurred uninstalling extension ${instanceId}`, { original: err });
    }
    utils.logLabeledSuccess(extensionsHelper_1.logPrefix, `uninstalled ${clc.bold(instanceId)}`);
});
//# sourceMappingURL=ext-uninstall.js.map