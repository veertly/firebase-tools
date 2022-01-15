"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const clc = require("cli-color");
const _ = require("lodash");
const marked = require("marked");
const ora = require("ora");
const TerminalRenderer = require("marked-terminal");
const checkMinRequiredVersion_1 = require("../checkMinRequiredVersion");
const command_1 = require("../command");
const error_1 = require("../error");
const billingMigrationHelper_1 = require("../extensions/billingMigrationHelper");
const checkProjectBilling_1 = require("../extensions/checkProjectBilling");
const cloudbilling_1 = require("../gcp/cloudbilling");
const extensionsApi = require("../extensions/extensionsApi");
const secretsUtils = require("../extensions/secretsUtils");
const provisioningHelper = require("../extensions/provisioningHelper");
const extensionsHelper_1 = require("../extensions/extensionsHelper");
const paramHelper = require("../extensions/paramHelper");
const updateHelper_1 = require("../extensions/updateHelper");
const refs = require("../extensions/refs");
const projectUtils_1 = require("../projectUtils");
const requirePermissions_1 = require("../requirePermissions");
const utils = require("../utils");
const previews_1 = require("../previews");
marked.setOptions({
    renderer: new TerminalRenderer(),
});
function isValidUpdate(existingSourceOrigin, newSourceOrigin) {
    if (existingSourceOrigin === extensionsHelper_1.SourceOrigin.PUBLISHED_EXTENSION) {
        return [extensionsHelper_1.SourceOrigin.PUBLISHED_EXTENSION, extensionsHelper_1.SourceOrigin.PUBLISHED_EXTENSION_VERSION].includes(newSourceOrigin);
    }
    else if (existingSourceOrigin === extensionsHelper_1.SourceOrigin.LOCAL) {
        return [extensionsHelper_1.SourceOrigin.LOCAL, extensionsHelper_1.SourceOrigin.URL].includes(newSourceOrigin);
    }
    return false;
}
exports.default = new command_1.Command("ext:update <extensionInstanceId> [updateSource]")
    .description(previews_1.previews.extdev
    ? "update an existing extension instance to the latest version or from a local or URL source"
    : "update an existing extension instance to the latest version")
    .before(requirePermissions_1.requirePermissions, [
    "firebaseextensions.instances.update",
    "firebaseextensions.instances.get",
])
    .before(extensionsHelper_1.ensureExtensionsApiEnabled)
    .before(checkMinRequiredVersion_1.checkMinRequiredVersion, "extMinVersion")
    .withForce()
    .option("--params <paramsFile>", "name of params variables file with .env format.")
    .action(async (instanceId, updateSource, options) => {
    const spinner = ora(`Updating ${clc.bold(instanceId)}. This usually takes 3 to 5 minutes...`);
    try {
        const projectId = (0, projectUtils_1.needProjectId)(options);
        let existingInstance;
        try {
            existingInstance = await extensionsApi.getInstance(projectId, instanceId);
        }
        catch (err) {
            if (err.status === 404) {
                throw new error_1.FirebaseError(`Extension instance '${clc.bold(instanceId)}' not found in project '${clc.bold(projectId)}'.`);
            }
            throw err;
        }
        const existingSpec = existingInstance.config.source.spec;
        if (existingInstance.config.source.state === "DELETED") {
            throw new error_1.FirebaseError(`Instance '${clc.bold(instanceId)}' cannot be updated anymore because the underlying extension was unpublished from Firebase's registry of extensions. Going forward, you will only be able to re-configure or uninstall this instance.`);
        }
        const existingParams = existingInstance.config.params;
        const existingSource = existingInstance.config.source.name;
        if (existingInstance.config.extensionRef) {
            updateSource = (0, updateHelper_1.inferUpdateSource)(updateSource, existingInstance.config.extensionRef);
        }
        let newSourceName;
        const existingSourceOrigin = await (0, updateHelper_1.getExistingSourceOrigin)(projectId, instanceId, existingSpec.name, existingSource);
        const newSourceOrigin = (0, extensionsHelper_1.getSourceOrigin)(updateSource);
        const validUpdate = isValidUpdate(existingSourceOrigin, newSourceOrigin);
        if (!validUpdate) {
            throw new error_1.FirebaseError(`Cannot update from a(n) ${existingSourceOrigin} to a(n) ${newSourceOrigin}. Please provide a new source that is a(n) ${existingSourceOrigin} and try again.`);
        }
        switch (newSourceOrigin) {
            case extensionsHelper_1.SourceOrigin.LOCAL:
                if (previews_1.previews.extdev) {
                    newSourceName = await (0, updateHelper_1.updateFromLocalSource)(projectId, instanceId, updateSource, existingSpec);
                    break;
                }
            case extensionsHelper_1.SourceOrigin.URL:
                if (previews_1.previews.extdev) {
                    newSourceName = await (0, updateHelper_1.updateFromUrlSource)(projectId, instanceId, updateSource, existingSpec);
                    break;
                }
            case extensionsHelper_1.SourceOrigin.PUBLISHED_EXTENSION_VERSION:
                newSourceName = await (0, updateHelper_1.updateToVersionFromPublisherSource)(projectId, instanceId, updateSource, existingSpec);
                break;
            case extensionsHelper_1.SourceOrigin.PUBLISHED_EXTENSION:
                newSourceName = await (0, updateHelper_1.updateFromPublisherSource)(projectId, instanceId, updateSource, existingSpec);
                break;
            default:
                throw new error_1.FirebaseError(`Unknown source '${clc.bold(updateSource)}.'`);
        }
        if (!(await (0, extensionsHelper_1.confirm)({
            nonInteractive: options.nonInteractive,
            force: options.force,
            default: true,
        }))) {
            throw new error_1.FirebaseError(`Update cancelled.`);
        }
        const newSource = await extensionsApi.getSource(newSourceName);
        const newSpec = newSource.spec;
        if (![extensionsHelper_1.SourceOrigin.LOCAL, extensionsHelper_1.SourceOrigin.URL].includes(newSourceOrigin) &&
            existingSpec.version === newSpec.version) {
            utils.logLabeledBullet(extensionsHelper_1.logPrefix, `${clc.bold(instanceId)} is already up to date. Its version is ${clc.bold(existingSpec.version)}.`);
            const retry = await (0, extensionsHelper_1.confirm)({
                nonInteractive: options.nonInteractive,
                force: options.force,
                default: false,
            });
            if (!retry) {
                utils.logLabeledBullet(extensionsHelper_1.logPrefix, "Update aborted.");
                return;
            }
        }
        await (0, updateHelper_1.displayChanges)({
            spec: existingSpec,
            newSpec: newSpec,
            nonInteractive: options.nonInteractive,
            force: options.force,
        });
        await provisioningHelper.checkProductsProvisioned(projectId, newSpec);
        const usesSecrets = secretsUtils.usesSecrets(newSpec);
        if (newSpec.billingRequired || usesSecrets) {
            const enabled = await (0, cloudbilling_1.checkBillingEnabled)(projectId);
            (0, billingMigrationHelper_1.displayNode10UpdateBillingNotice)(existingSpec, newSpec);
            if (!(await (0, extensionsHelper_1.confirm)({
                nonInteractive: options.nonInteractive,
                force: options.force,
                default: true,
            }))) {
                throw new error_1.FirebaseError("Update cancelled.");
            }
            if (!enabled) {
                if (!options.nonInteractive) {
                    await (0, checkProjectBilling_1.enableBilling)(projectId);
                }
                else {
                    throw new error_1.FirebaseError("The extension requires your project to be upgraded to the Blaze plan. " +
                        "To run this command in non-interactive mode, first upgrade your project: " +
                        marked(`https://console.cloud.google.com/billing/linkedaccount?project=${projectId}`));
                }
            }
            if (usesSecrets) {
                await secretsUtils.ensureSecretManagerApiEnabled(options);
            }
        }
        const oldParamValues = Object.assign({}, existingParams);
        const newParams = await paramHelper.getParamsForUpdate({
            spec: existingSpec,
            newSpec,
            currentParams: existingParams,
            projectId,
            paramsEnvPath: options.params,
            nonInteractive: options.nonInteractive,
            instanceId,
        });
        spinner.start();
        const updateOptions = {
            projectId,
            instanceId,
        };
        if (newSourceName.includes("publisher")) {
            updateOptions.extRef = refs.toExtensionVersionRef(refs.parse(newSourceName));
        }
        else {
            updateOptions.source = newSource;
        }
        if (!_.isEqual(newParams, oldParamValues)) {
            updateOptions.params = newParams;
        }
        await (0, updateHelper_1.update)(updateOptions);
        spinner.stop();
        utils.logLabeledSuccess(extensionsHelper_1.logPrefix, `successfully updated ${clc.bold(instanceId)}.`);
        utils.logLabeledBullet(extensionsHelper_1.logPrefix, marked(`You can view your updated instance in the Firebase console: ${utils.consoleUrl(projectId, `/extensions/instances/${instanceId}?tab=usage`)}`));
    }
    catch (err) {
        if (spinner.isSpinning) {
            spinner.fail();
        }
        if (!(err instanceof error_1.FirebaseError)) {
            throw new error_1.FirebaseError(`Error occurred while updating the instance: ${err.message}`, {
                original: err,
            });
        }
        throw err;
    }
});
//# sourceMappingURL=ext-update.js.map