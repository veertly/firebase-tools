"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExtension = exports.deleteExtension = exports.unpublishExtension = exports.publishExtensionVersion = exports.undeprecateExtensionVersion = exports.deprecateExtensionVersion = exports.registerPublisherProfile = exports.getPublisherProfile = exports.listExtensionVersions = exports.listExtensions = exports.getExtensionVersion = exports.getSource = exports.createSource = exports.updateInstanceFromRegistry = exports.updateInstance = exports.configureInstance = exports.listInstances = exports.getInstance = exports.deleteInstance = exports.createInstance = exports.ParamType = exports.Visibility = exports.RegistryLaunchStage = void 0;
const yaml = require("js-yaml");
const _ = require("lodash");
const clc = require("cli-color");
const marked = require("marked");
const api = require("../api");
const apiv2 = require("../apiv2");
const refs = require("./refs");
const logger_1 = require("../logger");
const operationPoller = require("../operation-poller");
const error_1 = require("../error");
const VERSION = "v1beta";
const PAGE_SIZE_MAX = 100;
var RegistryLaunchStage;
(function (RegistryLaunchStage) {
    RegistryLaunchStage["EXPERIMENTAL"] = "EXPERIMENTAL";
    RegistryLaunchStage["BETA"] = "BETA";
    RegistryLaunchStage["GA"] = "GA";
    RegistryLaunchStage["DEPRECATED"] = "DEPRECATED";
    RegistryLaunchStage["REGISTRY_LAUNCH_STAGE_UNSPECIFIED"] = "REGISTRY_LAUNCH_STAGE_UNSPECIFIED";
})(RegistryLaunchStage = exports.RegistryLaunchStage || (exports.RegistryLaunchStage = {}));
var Visibility;
(function (Visibility) {
    Visibility["UNLISTED"] = "unlisted";
    Visibility["PUBLIC"] = "public";
})(Visibility = exports.Visibility || (exports.Visibility = {}));
var ParamType;
(function (ParamType) {
    ParamType["STRING"] = "STRING";
    ParamType["SELECT"] = "SELECT";
    ParamType["MULTISELECT"] = "MULTISELECT";
    ParamType["SECRET"] = "SECRET";
})(ParamType = exports.ParamType || (exports.ParamType = {}));
async function createInstanceHelper(projectId, instanceId, config, validateOnly = false) {
    const createRes = await api.request("POST", `/${VERSION}/projects/${projectId}/instances/`, {
        auth: true,
        origin: api.extensionsOrigin,
        data: {
            name: `projects/${projectId}/instances/${instanceId}`,
            config: config,
        },
        query: {
            validateOnly,
        },
    });
    if (validateOnly) {
        return createRes;
    }
    const pollRes = await operationPoller.pollOperation({
        apiOrigin: api.extensionsOrigin,
        apiVersion: VERSION,
        operationResourceName: createRes.body.name,
        masterTimeout: 600000,
    });
    return pollRes;
}
async function createInstance(args) {
    var _a, _b;
    const config = {
        params: args.params,
    };
    if (args.extensionSource && args.extensionVersionRef) {
        throw new error_1.FirebaseError("ExtensionSource and ExtensionVersion both provided, but only one should be.");
    }
    else if (args.extensionSource) {
        config.source = { name: (_a = args.extensionSource) === null || _a === void 0 ? void 0 : _a.name };
    }
    else if (args.extensionVersionRef) {
        const ref = refs.parse(args.extensionVersionRef);
        config.extensionRef = refs.toExtensionRef(ref);
        config.extensionVersion = (_b = ref.version) !== null && _b !== void 0 ? _b : "";
    }
    else {
        throw new error_1.FirebaseError("No ExtensionVersion or ExtensionSource provided but one is required.");
    }
    return createInstanceHelper(args.projectId, args.instanceId, config, args.validateOnly);
}
exports.createInstance = createInstance;
async function deleteInstance(projectId, instanceId) {
    const deleteRes = await api.request("DELETE", `/${VERSION}/projects/${projectId}/instances/${instanceId}`, {
        auth: true,
        origin: api.extensionsOrigin,
    });
    const pollRes = await operationPoller.pollOperation({
        apiOrigin: api.extensionsOrigin,
        apiVersion: VERSION,
        operationResourceName: deleteRes.body.name,
        masterTimeout: 600000,
    });
    return pollRes;
}
exports.deleteInstance = deleteInstance;
async function getInstance(projectId, instanceId, options = {}) {
    const res = await api.request("GET", `/${VERSION}/projects/${projectId}/instances/${instanceId}`, _.assign({
        auth: true,
        origin: api.extensionsOrigin,
    }, options));
    return res.body;
}
exports.getInstance = getInstance;
async function listInstances(projectId) {
    const instances = [];
    const getNextPage = async (pageToken) => {
        const res = await api.request("GET", `/${VERSION}/projects/${projectId}/instances`, {
            auth: true,
            origin: api.extensionsOrigin,
            query: {
                pageSize: PAGE_SIZE_MAX,
                pageToken,
            },
        });
        if (Array.isArray(res.body.instances)) {
            instances.push(...res.body.instances);
        }
        if (res.body.nextPageToken) {
            await getNextPage(res.body.nextPageToken);
        }
    };
    await getNextPage();
    return instances;
}
exports.listInstances = listInstances;
async function configureInstance(args) {
    var _a;
    const res = await patchInstance({
        projectId: args.projectId,
        instanceId: args.instanceId,
        updateMask: "config.params",
        validateOnly: (_a = args.validateOnly) !== null && _a !== void 0 ? _a : false,
        data: {
            config: {
                params: args.params,
            },
        },
    });
    return res;
}
exports.configureInstance = configureInstance;
async function updateInstance(args) {
    var _a;
    const body = {
        config: {
            source: { name: args.extensionSource.name },
        },
    };
    let updateMask = "config.source.name";
    if (args.params) {
        body.config.params = args.params;
        updateMask += ",config.params";
    }
    return await patchInstance({
        projectId: args.projectId,
        instanceId: args.instanceId,
        updateMask,
        validateOnly: (_a = args.validateOnly) !== null && _a !== void 0 ? _a : false,
        data: body,
    });
}
exports.updateInstance = updateInstance;
async function updateInstanceFromRegistry(args) {
    var _a;
    const ref = refs.parse(args.extRef);
    const body = {
        config: {
            extensionRef: refs.toExtensionRef(ref),
            extensionVersion: ref.version,
        },
    };
    let updateMask = "config.extension_ref,config.extension_version";
    if (args.params) {
        body.config.params = args.params;
        updateMask += ",config.params";
    }
    return await patchInstance({
        projectId: args.projectId,
        instanceId: args.instanceId,
        updateMask,
        validateOnly: (_a = args.validateOnly) !== null && _a !== void 0 ? _a : false,
        data: body,
    });
}
exports.updateInstanceFromRegistry = updateInstanceFromRegistry;
async function patchInstance(args) {
    const updateRes = await api.request("PATCH", `/${VERSION}/projects/${args.projectId}/instances/${args.instanceId}`, {
        auth: true,
        origin: api.extensionsOrigin,
        query: {
            updateMask: args.updateMask,
            validateOnly: args.validateOnly,
        },
        data: args.data,
    });
    if (args.validateOnly) {
        return updateRes;
    }
    const pollRes = await operationPoller.pollOperation({
        apiOrigin: api.extensionsOrigin,
        apiVersion: VERSION,
        operationResourceName: updateRes.body.name,
        masterTimeout: 600000,
    });
    return pollRes;
}
function populateResourceProperties(spec) {
    if (spec) {
        spec.resources.forEach((r) => {
            try {
                if (r.propertiesYaml) {
                    r.properties = yaml.safeLoad(r.propertiesYaml);
                }
            }
            catch (err) {
                logger_1.logger.debug(`[ext] failed to parse resource properties yaml: ${err}`);
            }
        });
    }
}
async function createSource(projectId, packageUri, extensionRoot) {
    const createRes = await api.request("POST", `/${VERSION}/projects/${projectId}/sources/`, {
        auth: true,
        origin: api.extensionsOrigin,
        data: {
            packageUri,
            extensionRoot,
        },
    });
    const pollRes = await operationPoller.pollOperation({
        apiOrigin: api.extensionsOrigin,
        apiVersion: VERSION,
        operationResourceName: createRes.body.name,
        masterTimeout: 600000,
    });
    if (pollRes.spec) {
        populateResourceProperties(pollRes.spec);
    }
    return pollRes;
}
exports.createSource = createSource;
function getSource(sourceName) {
    return api
        .request("GET", `/${VERSION}/${sourceName}`, {
        auth: true,
        origin: api.extensionsOrigin,
    })
        .then((res) => {
        if (res.body.spec) {
            populateResourceProperties(res.body.spec);
        }
        return res.body;
    });
}
exports.getSource = getSource;
async function getExtensionVersion(extensionVersionRef) {
    const ref = refs.parse(extensionVersionRef);
    if (!ref.version) {
        throw new error_1.FirebaseError(`ExtensionVersion ref "${extensionVersionRef}" must supply a version.`);
    }
    try {
        const res = await api.request("GET", `/${VERSION}/${refs.toExtensionVersionName(ref)}`, {
            auth: true,
            origin: api.extensionsOrigin,
        });
        if (res.body.spec) {
            populateResourceProperties(res.body.spec);
        }
        return res.body;
    }
    catch (err) {
        if (err.status === 404) {
            throw refNotFoundError(ref);
        }
        else if (err instanceof error_1.FirebaseError) {
            throw err;
        }
        throw new error_1.FirebaseError(`Failed to query the extension version '${clc.bold(extensionVersionRef)}': ${err}`);
    }
}
exports.getExtensionVersion = getExtensionVersion;
async function listExtensions(publisherId) {
    const extensions = [];
    const getNextPage = async (pageToken) => {
        const res = await api.request("GET", `/${VERSION}/publishers/${publisherId}/extensions`, {
            auth: true,
            origin: api.extensionsOrigin,
            showUnpublished: false,
            query: {
                pageSize: PAGE_SIZE_MAX,
                pageToken,
            },
        });
        if (Array.isArray(res.body.extensions)) {
            extensions.push(...res.body.extensions);
        }
        if (res.body.nextPageToken) {
            await getNextPage(res.body.nextPageToken);
        }
    };
    await getNextPage();
    return extensions;
}
exports.listExtensions = listExtensions;
async function listExtensionVersions(ref, filter) {
    const { publisherId, extensionId } = refs.parse(ref);
    const extensionVersions = [];
    const getNextPage = async (pageToken) => {
        const res = await api.request("GET", `/${VERSION}/publishers/${publisherId}/extensions/${extensionId}/versions`, {
            auth: true,
            origin: api.extensionsOrigin,
            query: {
                filter,
                pageSize: PAGE_SIZE_MAX,
                pageToken,
            },
        });
        if (Array.isArray(res.body.extensionVersions)) {
            extensionVersions.push(...res.body.extensionVersions);
        }
        if (res.body.nextPageToken) {
            await getNextPage(res.body.nextPageToken);
        }
    };
    await getNextPage();
    return extensionVersions;
}
exports.listExtensionVersions = listExtensionVersions;
async function getPublisherProfile(projectId, publisherId) {
    const client = new apiv2.Client({ urlPrefix: api.extensionsOrigin });
    const res = await client.get(`/${VERSION}/projects/${projectId}/publisherProfile`, {
        queryParams: publisherId == undefined
            ? undefined
            : {
                publisherId,
            },
    });
    return res.body;
}
exports.getPublisherProfile = getPublisherProfile;
async function registerPublisherProfile(projectId, publisherId) {
    const res = await api.request("POST", `/${VERSION}/projects/${projectId}/publisherProfile:register`, {
        auth: true,
        origin: api.extensionsOrigin,
        data: { publisherId },
    });
    return res.body;
}
exports.registerPublisherProfile = registerPublisherProfile;
async function deprecateExtensionVersion(extensionRef, deprecationMessage) {
    const ref = refs.parse(extensionRef);
    try {
        const res = await api.request("POST", `/${VERSION}/${refs.toExtensionVersionName(ref)}:deprecate`, {
            auth: true,
            origin: api.extensionsOrigin,
            data: { deprecationMessage },
        });
        return res.body;
    }
    catch (err) {
        if (err.status === 403) {
            throw new error_1.FirebaseError(`You are not the owner of extension '${clc.bold(extensionRef)}' and don’t have the correct permissions to deprecate this extension version.` + err, { status: err.status });
        }
        else if (err.status === 404) {
            throw new error_1.FirebaseError(`Extension version ${clc.bold(extensionRef)} was not found.`);
        }
        else if (err instanceof error_1.FirebaseError) {
            throw err;
        }
        throw new error_1.FirebaseError(`Error occurred deprecating extension version '${extensionRef}': ${err}`, {
            status: err.status,
        });
    }
}
exports.deprecateExtensionVersion = deprecateExtensionVersion;
async function undeprecateExtensionVersion(extensionRef) {
    const ref = refs.parse(extensionRef);
    try {
        const res = await api.request("POST", `/${VERSION}/${refs.toExtensionVersionName(ref)}:undeprecate`, {
            auth: true,
            origin: api.extensionsOrigin,
        });
        return res.body;
    }
    catch (err) {
        if (err.status === 403) {
            throw new error_1.FirebaseError(`You are not the owner of extension '${clc.bold(extensionRef)}' and don’t have the correct permissions to undeprecate this extension version.`, { status: err.status });
        }
        else if (err.status === 404) {
            throw new error_1.FirebaseError(`Extension version ${clc.bold(extensionRef)} was not found.`);
        }
        else if (err instanceof error_1.FirebaseError) {
            throw err;
        }
        throw new error_1.FirebaseError(`Error occurred undeprecating extension version '${extensionRef}': ${err}`, {
            status: err.status,
        });
    }
}
exports.undeprecateExtensionVersion = undeprecateExtensionVersion;
async function publishExtensionVersion(extensionVersionRef, packageUri, extensionRoot) {
    const ref = refs.parse(extensionVersionRef);
    if (!ref.version) {
        throw new error_1.FirebaseError(`ExtensionVersion ref "${extensionVersionRef}" must supply a version.`);
    }
    const publishRes = await api.request("POST", `/${VERSION}/${refs.toExtensionName(ref)}/versions:publish`, {
        auth: true,
        origin: api.extensionsOrigin,
        data: {
            versionId: ref.version,
            packageUri,
            extensionRoot: extensionRoot !== null && extensionRoot !== void 0 ? extensionRoot : "/",
        },
    });
    const pollRes = await operationPoller.pollOperation({
        apiOrigin: api.extensionsOrigin,
        apiVersion: VERSION,
        operationResourceName: publishRes.body.name,
        masterTimeout: 600000,
    });
    return pollRes;
}
exports.publishExtensionVersion = publishExtensionVersion;
async function unpublishExtension(extensionRef) {
    const ref = refs.parse(extensionRef);
    if (ref.version) {
        throw new error_1.FirebaseError(`Extension reference "${extensionRef}" must not contain a version.`);
    }
    const url = `/${VERSION}/${refs.toExtensionName(ref)}:unpublish`;
    try {
        await api.request("POST", url, {
            auth: true,
            origin: api.extensionsOrigin,
        });
    }
    catch (err) {
        if (err.status === 403) {
            throw new error_1.FirebaseError(`You are not the owner of extension '${clc.bold(extensionRef)}' and don’t have the correct permissions to unpublish this extension.`, { status: err.status });
        }
        else if (err instanceof error_1.FirebaseError) {
            throw err;
        }
        throw new error_1.FirebaseError(`Error occurred unpublishing extension '${extensionRef}': ${err}`, {
            status: err.status,
        });
    }
}
exports.unpublishExtension = unpublishExtension;
async function deleteExtension(extensionRef) {
    const ref = refs.parse(extensionRef);
    if (ref.version) {
        throw new error_1.FirebaseError(`Extension reference "${extensionRef}" must not contain a version.`);
    }
    const url = `/${VERSION}/${refs.toExtensionName(ref)}`;
    try {
        await api.request("DELETE", url, {
            auth: true,
            origin: api.extensionsOrigin,
        });
    }
    catch (err) {
        if (err.status === 403) {
            throw new error_1.FirebaseError(`You are not the owner of extension '${clc.bold(extensionRef)}' and don’t have the correct permissions to delete this extension.`, { status: err.status });
        }
        else if (err.status === 404) {
            throw new error_1.FirebaseError(`Extension ${clc.bold(extensionRef)} was not found.`);
        }
        else if (err instanceof error_1.FirebaseError) {
            throw err;
        }
        throw new error_1.FirebaseError(`Error occurred delete extension '${extensionRef}': ${err}`, {
            status: err.status,
        });
    }
}
exports.deleteExtension = deleteExtension;
async function getExtension(extensionRef) {
    const ref = refs.parse(extensionRef);
    try {
        const res = await api.request("GET", `/${VERSION}/${refs.toExtensionName(ref)}`, {
            auth: true,
            origin: api.extensionsOrigin,
        });
        return res.body;
    }
    catch (err) {
        if (err.status === 404) {
            throw refNotFoundError(ref);
        }
        else if (err instanceof error_1.FirebaseError) {
            throw err;
        }
        throw new error_1.FirebaseError(`Failed to query the extension '${clc.bold(extensionRef)}': ${err}`, {
            status: err.status,
        });
    }
}
exports.getExtension = getExtension;
function refNotFoundError(ref) {
    return new error_1.FirebaseError(`The extension reference '${clc.bold(ref.version ? refs.toExtensionVersionRef(ref) : refs.toExtensionRef(ref))}' doesn't exist. This could happen for two reasons:\n` +
        `  -The publisher ID '${clc.bold(ref.publisherId)}' doesn't exist or could be misspelled\n` +
        `  -The name of the ${ref.version ? "extension version" : "extension"} '${clc.bold(ref.version ? `${ref.extensionId}@${ref.version}` : ref.extensionId)}' doesn't exist or could be misspelled\n\n` +
        `Please correct the extension reference and try again. If you meant to install an extension from a local source, please provide a relative path prefixed with '${clc.bold("./")}', '${clc.bold("../")}', or '${clc.bold("~/")}'. Learn more about local extension installation at ${marked("[https://firebase.google.com/docs/extensions/alpha/install-extensions_community#install](https://firebase.google.com/docs/extensions/alpha/install-extensions_community#install).")}`, { status: 404 });
}
//# sourceMappingURL=extensionsApi.js.map