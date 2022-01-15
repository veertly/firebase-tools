"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveVersion = exports.want = exports.have = exports.getExtension = exports.getExtensionVersion = void 0;
const semver = require("semver");
const error_1 = require("../../error");
const extensionsApi = require("../../extensions/extensionsApi");
const extensionsHelper_1 = require("../../extensions/extensionsHelper");
const refs = require("../../extensions/refs");
const params_1 = require("./params");
const logger_1 = require("../../logger");
async function getExtensionVersion(i) {
    if (!i.extensionVersion) {
        if (!i.ref) {
            throw new error_1.FirebaseError(`Can't get ExtensionVersion for ${i.instanceId} because it has no ref`);
        }
        i.extensionVersion = await extensionsApi.getExtensionVersion(refs.toExtensionVersionRef(i.ref));
    }
    return i.extensionVersion;
}
exports.getExtensionVersion = getExtensionVersion;
async function getExtension(i) {
    if (!i.ref) {
        throw new error_1.FirebaseError(`Can't get Extensionfor ${i.instanceId} because it has no ref`);
    }
    if (!i.extension) {
        i.extension = await extensionsApi.getExtension(refs.toExtensionRef(i.ref));
    }
    return i.extension;
}
exports.getExtension = getExtension;
async function have(projectId) {
    const instances = await extensionsApi.listInstances(projectId);
    return instances.map((i) => {
        const dep = {
            instanceId: i.name.split("/").pop(),
            params: i.config.params,
        };
        if (i.config.extensionRef) {
            const ref = refs.parse(i.config.extensionRef);
            dep.ref = ref;
            dep.ref.version = i.config.extensionVersion;
        }
        return dep;
    });
}
exports.have = have;
async function want(args) {
    const instanceSpecs = [];
    const errors = [];
    for (const e of Object.entries(args.extensions)) {
        try {
            const instanceId = e[0];
            const ref = refs.parse(e[1]);
            ref.version = await resolveVersion(ref);
            const params = (0, params_1.readParams)({
                projectDir: args.projectDir,
                instanceId,
                projectId: args.projectId,
                projectNumber: args.projectNumber,
                aliases: args.aliases,
            });
            const autoPopulatedParams = await (0, extensionsHelper_1.getFirebaseProjectParams)(args.projectId);
            const subbedParams = (0, extensionsHelper_1.substituteParams)(params, autoPopulatedParams);
            instanceSpecs.push({
                instanceId,
                ref,
                params: subbedParams,
            });
        }
        catch (err) {
            logger_1.logger.debug(`Got error reading extensions entry ${e}: ${err}`);
            errors.push(err);
        }
    }
    if (errors.length) {
        const messages = errors.map((err) => `- ${err.message}`).join("\n");
        throw new error_1.FirebaseError(`Errors while reading 'extensions' in 'firebase.json'\n${messages}`);
    }
    return instanceSpecs;
}
exports.want = want;
async function resolveVersion(ref) {
    if (!ref.version || ref.version == "latest") {
        return "latest";
    }
    const extensionRef = refs.toExtensionRef(ref);
    const versions = await extensionsApi.listExtensionVersions(extensionRef);
    const maxSatisfying = semver.maxSatisfying(versions.map((ev) => ev.spec.version), ref.version);
    if (!maxSatisfying) {
        throw new error_1.FirebaseError(`No version of ${extensionRef} matches requested version ${ref.version}`);
    }
    return maxSatisfying;
}
exports.resolveVersion = resolveVersion;
//# sourceMappingURL=planner.js.map