"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const clc = require("cli-color");
const marked = require("marked");
const ora = require("ora");
const TerminalRenderer = require("marked-terminal");
const askUserForConsent = require("../extensions/askUserForConsent");
const displayExtensionInfo_1 = require("../extensions/displayExtensionInfo");
const billingMigrationHelper_1 = require("../extensions/billingMigrationHelper");
const checkProjectBilling_1 = require("../extensions/checkProjectBilling");
const cloudbilling_1 = require("../gcp/cloudbilling");
const checkMinRequiredVersion_1 = require("../checkMinRequiredVersion");
const command_1 = require("../command");
const error_1 = require("../error");
const projectUtils_1 = require("../projectUtils");
const extensionsApi = require("../extensions/extensionsApi");
const secretsUtils = require("../extensions/secretsUtils");
const provisioningHelper = require("../extensions/provisioningHelper");
const refs = require("../extensions/refs");
const warnings_1 = require("../extensions/warnings");
const paramHelper = require("../extensions/paramHelper");
const extensionsHelper_1 = require("../extensions/extensionsHelper");
const updateHelper_1 = require("../extensions/updateHelper");
const utils_1 = require("../extensions/utils");
const requirePermissions_1 = require("../requirePermissions");
const utils = require("../utils");
const track_1 = require("../track");
const logger_1 = require("../logger");
const previews_1 = require("../previews");
marked.setOptions({
    renderer: new TerminalRenderer(),
});
async function installExtension(options) {
    const { projectId, extensionName, source, extVersion, paramsEnvPath, nonInteractive, force } = options;
    const spec = (source === null || source === void 0 ? void 0 : source.spec) || (extVersion === null || extVersion === void 0 ? void 0 : extVersion.spec);
    if (!spec) {
        throw new error_1.FirebaseError(`Could not find the extension.yaml for ${extensionName}. Please make sure this is a valid extension and try again.`);
    }
    const spinner = ora();
    try {
        await provisioningHelper.checkProductsProvisioned(projectId, spec);
        const usesSecrets = secretsUtils.usesSecrets(spec);
        if (spec.billingRequired || usesSecrets) {
            const enabled = await (0, cloudbilling_1.checkBillingEnabled)(projectId);
            if (!enabled && nonInteractive) {
                throw new error_1.FirebaseError(`This extension requires the Blaze plan, but project ${projectId} is not on the Blaze plan. ` +
                    marked("Please visit https://console.cloud.google.com/billing/linkedaccount?project=${projectId} to upgrade your project."));
            }
            else if (!enabled) {
                await (0, billingMigrationHelper_1.displayNode10CreateBillingNotice)(spec, false);
                await (0, checkProjectBilling_1.enableBilling)(projectId);
            }
            else {
                await (0, billingMigrationHelper_1.displayNode10CreateBillingNotice)(spec, !nonInteractive);
            }
        }
        const apis = spec.apis || [];
        if (usesSecrets) {
            apis.push({
                apiName: "secretmanager.googleapis.com",
                reason: `To access and manage secrets which are used by this extension. By using this product you agree to the terms and conditions of the following license: https://console.cloud.google.com/tos?id=cloud&project=${projectId}`,
            });
        }
        if (apis.length) {
            askUserForConsent.displayApis(spec.displayName || spec.name, projectId, apis);
            const consented = await (0, extensionsHelper_1.confirm)({ nonInteractive, force, default: true });
            if (!consented) {
                throw new error_1.FirebaseError("Without explicit consent for the APIs listed, we cannot deploy this extension.");
            }
        }
        if (usesSecrets) {
            await secretsUtils.ensureSecretManagerApiEnabled(options);
        }
        const roles = spec.roles ? spec.roles.map((role) => role.role) : [];
        if (roles.length) {
            await askUserForConsent.displayRoles(spec.displayName || spec.name, projectId, roles);
            const consented = await (0, extensionsHelper_1.confirm)({ nonInteractive, force, default: true });
            if (!consented) {
                throw new error_1.FirebaseError("Without explicit consent for the roles listed, we cannot deploy this extension.");
            }
        }
        let instanceId = spec.name;
        let choice;
        const anotherInstanceExists = await (0, extensionsHelper_1.instanceIdExists)(projectId, instanceId);
        if (anotherInstanceExists) {
            if (!nonInteractive) {
                choice = await (0, extensionsHelper_1.promptForRepeatInstance)(projectId, spec.name);
            }
            else if (nonInteractive && force) {
                choice = "installNew";
            }
            else {
                throw new error_1.FirebaseError(`An extension with the ID '${clc.bold(extensionName)}' already exists in the project '${clc.bold(projectId)}'.` +
                    ` To update or reconfigure this instance instead, rerun this command with the --force flag.`);
            }
        }
        else {
            choice = "installNew";
        }
        let params;
        switch (choice) {
            case "installNew":
                instanceId =
                    options.instanceId ||
                        (await (0, extensionsHelper_1.promptForValidInstanceId)(`${instanceId}-${(0, utils_1.getRandomString)(4)}`));
                params = await paramHelper.getParams({
                    projectId,
                    paramSpecs: spec.params,
                    nonInteractive,
                    paramsEnvPath,
                    instanceId,
                });
                spinner.text = "Installing your extension instance. This usually takes 3 to 5 minutes...";
                spinner.start();
                await extensionsApi.createInstance({
                    projectId,
                    instanceId,
                    extensionSource: source,
                    extensionVersionRef: extVersion === null || extVersion === void 0 ? void 0 : extVersion.ref,
                    params,
                });
                spinner.stop();
                utils.logLabeledSuccess(extensionsHelper_1.logPrefix, `Successfully installed your instance of ${clc.bold(spec.displayName || spec.name)}! ` +
                    `Its Instance ID is ${clc.bold(instanceId)}.`);
                break;
            case "updateExisting":
                params = await paramHelper.getParams({
                    projectId,
                    paramSpecs: spec.params,
                    nonInteractive,
                    paramsEnvPath,
                    instanceId,
                });
                spinner.text = "Updating your extension instance. This usually takes 3 to 5 minutes...";
                spinner.start();
                await (0, updateHelper_1.update)({
                    projectId,
                    instanceId,
                    source,
                    extRef: extVersion === null || extVersion === void 0 ? void 0 : extVersion.ref,
                    params,
                });
                spinner.stop();
                utils.logLabeledSuccess(extensionsHelper_1.logPrefix, `Successfully updated your instance of ${clc.bold(spec.displayName || spec.name)}! ` +
                    `Its Instance ID is ${clc.bold(instanceId)}.`);
                break;
            case "cancel":
                return;
        }
        utils.logLabeledBullet(extensionsHelper_1.logPrefix, marked("Go to the Firebase console to view instructions for using your extension, " +
            `which may include some required post-installation tasks: ${utils.consoleUrl(projectId, `/extensions/instances/${instanceId}?tab=usage`)}`));
        logger_1.logger.info(marked("You can run `firebase ext` to view available Firebase Extensions commands, " +
            "including those to update, reconfigure, or delete your installed extension."));
    }
    catch (err) {
        if (spinner.isSpinning) {
            spinner.fail();
        }
        if (err instanceof error_1.FirebaseError) {
            throw err;
        }
        throw new error_1.FirebaseError(`Error occurred installing extension: ${err.message}`, {
            original: err,
        });
    }
}
async function infoInstallBySource(projectId, extensionName) {
    let source;
    try {
        source = await (0, extensionsHelper_1.createSourceFromLocation)(projectId, extensionName);
    }
    catch (err) {
        throw new error_1.FirebaseError(`Unable to find published extension '${clc.bold(extensionName)}', ` +
            `and encountered the following error when trying to create an instance of extension '${clc.bold(extensionName)}':\n ${err.message}`);
    }
    (0, displayExtensionInfo_1.displayExtInfo)(extensionName, "", source.spec);
    return source;
}
async function infoInstallByReference(extensionName, interactive) {
    if (extensionName.split("/").length < 2) {
        const [extensionID, version] = extensionName.split("@");
        extensionName = `firebase/${extensionID}@${version || "latest"}`;
    }
    const ref = refs.parse(extensionName);
    const extension = await extensionsApi.getExtension(refs.toExtensionRef(ref));
    if (!ref.version) {
        (0, track_1.track)("Extension Install", "Install by Extension Version Ref", interactive ? 1 : 0);
        extensionName = `${extensionName}@latest`;
    }
    const extVersion = await extensionsApi.getExtensionVersion(extensionName);
    (0, displayExtensionInfo_1.displayExtInfo)(extensionName, ref.publisherId, extVersion.spec, true);
    await (0, warnings_1.displayWarningPrompts)(ref.publisherId, extension.registryLaunchStage, extVersion);
    return extVersion;
}
exports.default = new command_1.Command("ext:install [extensionName]")
    .description("install an official extension if [extensionName] or [extensionName@version] is provided; " +
    (previews_1.previews.extdev
        ? "install a local extension if [localPathOrUrl] or [url#root] is provided; install a published extension (not authored by Firebase) if [publisherId/extensionId] is provided "
        : "") +
    "or run with `-i` to see all available extensions.")
    .withForce()
    .option("--params <paramsFile>", "name of params variables file with .env format.")
    .option("--instanceId <instanceId>", "instance id prefix.")
    .before(requirePermissions_1.requirePermissions, ["firebaseextensions.instances.create"])
    .before(extensionsHelper_1.ensureExtensionsApiEnabled)
    .before(checkMinRequiredVersion_1.checkMinRequiredVersion, "extMinVersion")
    .action(async (extensionName, options) => {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const paramsEnvPath = options.params;
    let learnMore = false;
    if (!extensionName) {
        if (options.interactive) {
            learnMore = true;
            extensionName = await (0, extensionsHelper_1.promptForOfficialExtension)("Which official extension do you wish to install?\n" +
                "  Select an extension, then press Enter to learn more.");
        }
        else {
            throw new error_1.FirebaseError(`Unable to find published extension '${clc.bold(extensionName)}'. ` +
                `Run ${clc.bold("firebase ext:install -i")} to select from the list of all available published extensions.`);
        }
    }
    let source;
    let extVersion;
    if ((0, extensionsHelper_1.isLocalOrURLPath)(extensionName)) {
        (0, track_1.track)("Extension Install", "Install by Source", options.interactive ? 1 : 0);
        source = await infoInstallBySource(projectId, extensionName);
    }
    else {
        (0, track_1.track)("Extension Install", "Install by Extension Ref", options.interactive ? 1 : 0);
        extVersion = await infoInstallByReference(extensionName, options.interactive);
    }
    if (!(await (0, extensionsHelper_1.confirm)({
        nonInteractive: options.nonInteractive,
        force: options.force,
        default: true,
    }))) {
        return;
    }
    if (!source && !extVersion) {
        throw new error_1.FirebaseError("Could not find a source. Please specify a valid source to continue.");
    }
    const spec = (source === null || source === void 0 ? void 0 : source.spec) || (extVersion === null || extVersion === void 0 ? void 0 : extVersion.spec);
    if (!spec) {
        throw new error_1.FirebaseError(`Could not find the extension.yaml for extension '${clc.bold(extensionName)}'. Please make sure this is a valid extension and try again.`);
    }
    if (learnMore) {
        utils.logLabeledBullet(extensionsHelper_1.logPrefix, `You selected: ${clc.bold(spec.displayName)}.\n` +
            `${spec.description}\n` +
            `View details: https://firebase.google.com/products/extensions/${spec.name}\n`);
    }
    try {
        return installExtension({
            paramsEnvPath,
            projectId,
            extensionName,
            source,
            extVersion,
            nonInteractive: options.nonInteractive,
            force: options.force,
            instanceId: options.instanceId,
        });
    }
    catch (err) {
        if (!(err instanceof error_1.FirebaseError)) {
            throw new error_1.FirebaseError(`Error occurred installing the extension: ${err.message}`, {
                original: err,
            });
        }
        throw err;
    }
});
//# sourceMappingURL=ext-install.js.map