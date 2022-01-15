"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferUpdateSource = exports.updateFromPublisherSource = exports.updateToVersionFromPublisherSource = exports.updateFromUrlSource = exports.updateFromLocalSource = exports.update = exports.displayChanges = exports.warningUpdateToOtherSource = exports.getExistingSourceOrigin = void 0;
const clc = require("cli-color");
const semver = require("semver");
const marked = require("marked");
const error_1 = require("../error");
const logger_1 = require("../logger");
const resolveSource = require("./resolveSource");
const extensionsApi = require("./extensionsApi");
const refs = require("./refs");
const extensionsHelper_1 = require("./extensionsHelper");
const utils = require("../utils");
const displayExtensionInfo_1 = require("./displayExtensionInfo");
const changelog = require("./changelog");
function invalidSourceErrMsgTemplate(instanceId, source) {
    return `Unable to update from the source \`${clc.bold(source)}\`. To update this instance, you can either:\n
  - Run \`${clc.bold("firebase ext:update " + instanceId)}\` to update from the published source.\n
  - Check your directory path or URL, then run \`${clc.bold("firebase ext:update " + instanceId + " <otherSource>")}\` to update from a local directory or URL source.`;
}
async function getExistingSourceOrigin(projectId, instanceId, extensionName, existingSource) {
    const instance = await extensionsApi.getInstance(projectId, instanceId);
    return instance && instance.config.extensionRef
        ? extensionsHelper_1.SourceOrigin.PUBLISHED_EXTENSION
        : extensionsHelper_1.SourceOrigin.LOCAL;
}
exports.getExistingSourceOrigin = getExistingSourceOrigin;
function showUpdateVersionInfo(instanceId, from, to, source) {
    if (source) {
        source = clc.bold(source);
    }
    else {
        source = "version";
    }
    utils.logLabeledBullet(extensionsHelper_1.logPrefix, `Updating ${clc.bold(instanceId)} from version ${clc.bold(from)} to ${source} (${clc.bold(to)})`);
    if (semver.lt(to, from)) {
        utils.logLabeledWarning(extensionsHelper_1.logPrefix, "The version you are updating to is less than the current version for this extension. This extension may not be backwards compatible.");
    }
    return;
}
function warningUpdateToOtherSource(sourceOrigin) {
    let targetText;
    if ([extensionsHelper_1.SourceOrigin.PUBLISHED_EXTENSION, extensionsHelper_1.SourceOrigin.PUBLISHED_EXTENSION_VERSION].includes(sourceOrigin)) {
        targetText = "published extension";
    }
    else if (sourceOrigin === extensionsHelper_1.SourceOrigin.LOCAL) {
        targetText = "local directory";
    }
    else if (sourceOrigin === extensionsHelper_1.SourceOrigin.URL) {
        targetText = "URL";
    }
    const warning = `All the instance's resources and logic will be overwritten to use the source code and files from the ${targetText}.\n`;
    logger_1.logger.info(marked(warning));
}
exports.warningUpdateToOtherSource = warningUpdateToOtherSource;
async function displayChanges(args) {
    utils.logLabeledBullet("extensions", "This update contains the following changes:");
    (0, displayExtensionInfo_1.displayUpdateChangesNoInput)(args.spec, args.newSpec);
    await (0, displayExtensionInfo_1.displayUpdateChangesRequiringConfirmation)(args);
}
exports.displayChanges = displayChanges;
async function update(updateOptions) {
    const { projectId, instanceId, source, extRef, params } = updateOptions;
    if (extRef) {
        return await extensionsApi.updateInstanceFromRegistry({
            projectId,
            instanceId,
            extRef,
            params,
        });
    }
    else if (source) {
        return await extensionsApi.updateInstance({
            projectId,
            instanceId,
            extensionSource: source,
            params,
        });
    }
    throw new error_1.FirebaseError(`Neither a source nor a version of the extension was supplied for ${instanceId}. Please make sure this is a valid extension and try again.`);
}
exports.update = update;
async function updateFromLocalSource(projectId, instanceId, localSource, existingSpec) {
    (0, displayExtensionInfo_1.displayExtInfo)(instanceId, "", existingSpec, false);
    let source;
    try {
        source = await (0, extensionsHelper_1.createSourceFromLocation)(projectId, localSource);
    }
    catch (err) {
        throw new error_1.FirebaseError(invalidSourceErrMsgTemplate(instanceId, localSource));
    }
    utils.logLabeledBullet(extensionsHelper_1.logPrefix, `${clc.bold("You are updating this extension instance to a local source.")}`);
    showUpdateVersionInfo(instanceId, existingSpec.version, source.spec.version, localSource);
    warningUpdateToOtherSource(extensionsHelper_1.SourceOrigin.LOCAL);
    return source.name;
}
exports.updateFromLocalSource = updateFromLocalSource;
async function updateFromUrlSource(projectId, instanceId, urlSource, existingSpec) {
    (0, displayExtensionInfo_1.displayExtInfo)(instanceId, "", existingSpec, false);
    let source;
    try {
        source = await (0, extensionsHelper_1.createSourceFromLocation)(projectId, urlSource);
    }
    catch (err) {
        throw new error_1.FirebaseError(invalidSourceErrMsgTemplate(instanceId, urlSource));
    }
    utils.logLabeledBullet(extensionsHelper_1.logPrefix, `${clc.bold("You are updating this extension instance to a URL source.")}`);
    showUpdateVersionInfo(instanceId, existingSpec.version, source.spec.version, urlSource);
    warningUpdateToOtherSource(extensionsHelper_1.SourceOrigin.URL);
    return source.name;
}
exports.updateFromUrlSource = updateFromUrlSource;
async function updateToVersionFromPublisherSource(projectId, instanceId, extVersionRef, existingSpec) {
    let source;
    const ref = refs.parse(extVersionRef);
    const version = ref.version;
    const extensionRef = refs.toExtensionRef(ref);
    (0, displayExtensionInfo_1.displayExtInfo)(instanceId, ref.publisherId, existingSpec, true);
    const extension = await extensionsApi.getExtension(extensionRef);
    try {
        source = await extensionsApi.getExtensionVersion(extVersionRef);
    }
    catch (err) {
        throw new error_1.FirebaseError(`Could not find source '${clc.bold(extVersionRef)}' because (${clc.bold(version)}) is not a published version. To update, use the latest version of this extension (${clc.bold(extension.latestVersion)}).`);
    }
    let registryEntry;
    try {
        registryEntry = await resolveSource.resolveRegistryEntry(existingSpec.name);
    }
    catch (err) {
        logger_1.logger.debug(`Unable to fetch registry.json entry for ${existingSpec.name}`);
    }
    if (registryEntry) {
        const minVer = resolveSource.getMinRequiredVersion(registryEntry);
        if (minVer && semver.gt(minVer, source.spec.version)) {
            throw new error_1.FirebaseError(`The version you are trying to update to (${clc.bold(source.spec.version)}) is less than the minimum version required (${clc.bold(minVer)}) to use this extension.`);
        }
    }
    showUpdateVersionInfo(instanceId, existingSpec.version, source.spec.version, extVersionRef);
    warningUpdateToOtherSource(extensionsHelper_1.SourceOrigin.PUBLISHED_EXTENSION);
    const releaseNotes = await changelog.getReleaseNotesForUpdate({
        extensionRef,
        fromVersion: existingSpec.version,
        toVersion: source.spec.version,
    });
    if (Object.keys(releaseNotes).length) {
        changelog.displayReleaseNotes(releaseNotes, existingSpec.version);
    }
    return source.name;
}
exports.updateToVersionFromPublisherSource = updateToVersionFromPublisherSource;
async function updateFromPublisherSource(projectId, instanceId, extRef, existingSpec) {
    return updateToVersionFromPublisherSource(projectId, instanceId, `${extRef}@latest`, existingSpec);
}
exports.updateFromPublisherSource = updateFromPublisherSource;
function inferUpdateSource(updateSource, existingRef) {
    if (!updateSource) {
        return `${existingRef}@latest`;
    }
    if (semver.valid(updateSource)) {
        return `${existingRef}@${updateSource}`;
    }
    if (!(0, extensionsHelper_1.isLocalOrURLPath)(updateSource) && updateSource.split("/").length < 2) {
        return updateSource.includes("@")
            ? `firebase/${updateSource}`
            : `firebase/${updateSource}@latest`;
    }
    if (!(0, extensionsHelper_1.isLocalOrURLPath)(updateSource) && !updateSource.includes("@")) {
        return `${updateSource}@latest`;
    }
    return updateSource;
}
exports.inferUpdateSource = inferUpdateSource;
//# sourceMappingURL=updateHelper.js.map