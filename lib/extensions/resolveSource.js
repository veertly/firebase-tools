"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTrustedPublishers = exports.getExtensionRegistry = exports.getMinRequiredVersion = exports.getTargetVersion = exports.resolveRegistryEntry = exports.isOfficialSource = exports.resolveSourceUrl = exports.confirmUpdateWarning = void 0;
const _ = require("lodash");
const clc = require("cli-color");
const marked = require("marked");
const api = require("../api");
const error_1 = require("../error");
const logger_1 = require("../logger");
const prompt_1 = require("../prompt");
const EXTENSIONS_REGISTRY_ENDPOINT = "/extensions.json";
async function confirmUpdateWarning(updateWarning) {
    logger_1.logger.info(marked(updateWarning.description));
    if (updateWarning.action) {
        logger_1.logger.info(marked(updateWarning.action));
    }
    const continueUpdate = await (0, prompt_1.promptOnce)({
        type: "confirm",
        message: "Do you wish to continue with this update?",
        default: false,
    });
    if (!continueUpdate) {
        throw new error_1.FirebaseError(`Update cancelled.`, { exit: 2 });
    }
}
exports.confirmUpdateWarning = confirmUpdateWarning;
function resolveSourceUrl(registryEntry, name, version) {
    const targetVersion = getTargetVersion(registryEntry, version);
    const sourceUrl = _.get(registryEntry, ["versions", targetVersion]);
    if (!sourceUrl) {
        throw new error_1.FirebaseError(`Could not find version ${clc.bold(version)} of extension ${clc.bold(name)}.`);
    }
    return sourceUrl;
}
exports.resolveSourceUrl = resolveSourceUrl;
function isOfficialSource(registryEntry, sourceUrl) {
    const versions = _.get(registryEntry, "versions");
    return _.includes(versions, sourceUrl);
}
exports.isOfficialSource = isOfficialSource;
async function resolveRegistryEntry(name) {
    const extensionsRegistry = await getExtensionRegistry();
    const registryEntry = _.get(extensionsRegistry, name);
    if (!registryEntry) {
        throw new error_1.FirebaseError(`Unable to find extension source named ${clc.bold(name)}.`);
    }
    return registryEntry;
}
exports.resolveRegistryEntry = resolveRegistryEntry;
function getTargetVersion(registryEntry, versionOrLabel) {
    const seekVersion = versionOrLabel || "latest";
    const versionFromLabel = _.get(registryEntry, ["labels", seekVersion]);
    return versionFromLabel || seekVersion;
}
exports.getTargetVersion = getTargetVersion;
function getMinRequiredVersion(registryEntry) {
    return _.get(registryEntry, ["labels", "minRequired"]);
}
exports.getMinRequiredVersion = getMinRequiredVersion;
async function getExtensionRegistry(onlyFeatured) {
    const res = await api.request("GET", EXTENSIONS_REGISTRY_ENDPOINT, {
        origin: api.firebaseExtensionsRegistryOrigin,
    });
    const extensions = _.get(res, "body.mods");
    if (onlyFeatured) {
        const featuredList = _.get(res, "body.featured.discover");
        return _.pickBy(extensions, (_entry, extensionName) => {
            return _.includes(featuredList, extensionName);
        });
    }
    return extensions;
}
exports.getExtensionRegistry = getExtensionRegistry;
async function getTrustedPublishers() {
    let registry;
    try {
        registry = await getExtensionRegistry();
    }
    catch (err) {
        logger_1.logger.debug("Couldn't get extensions registry, assuming no trusted publishers except Firebase.");
        return ["firebase"];
    }
    const publisherIds = new Set();
    for (const entry in registry) {
        publisherIds.add(registry[entry].publisher);
    }
    return Array.from(publisherIds);
}
exports.getTrustedPublishers = getTrustedPublishers;
//# sourceMappingURL=resolveSource.js.map