"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.grantServiceAgentRole = exports.addVersion = exports.createSecret = exports.toSecretVersionResourceName = exports.parseSecretVersionResourceName = exports.parseSecretResourceName = exports.secretExists = exports.getSecretVersion = exports.getSecret = exports.listSecrets = exports.secretManagerConsoleUri = void 0;
const utils_1 = require("../utils");
const api = require("../api");
const secretManagerConsoleUri = (projectId) => `https://console.cloud.google.com/security/secret-manager?project=${projectId}`;
exports.secretManagerConsoleUri = secretManagerConsoleUri;
async function listSecrets(projectId) {
    const listRes = await api.request("GET", `/v1beta1/projects/${projectId}/secrets`, {
        auth: true,
        origin: api.secretManagerOrigin,
    });
    return listRes.body.secrets.map((s) => parseSecretResourceName(s.name));
}
exports.listSecrets = listSecrets;
async function getSecret(projectId, name) {
    var _a;
    const getRes = await api.request("GET", `/v1beta1/projects/${projectId}/secrets/${name}`, {
        auth: true,
        origin: api.secretManagerOrigin,
    });
    const secret = parseSecretResourceName(getRes.body.name);
    secret.labels = (_a = getRes.body.labels) !== null && _a !== void 0 ? _a : {};
    return secret;
}
exports.getSecret = getSecret;
async function getSecretVersion(projectId, name, version) {
    const getRes = await api.request("GET", `/v1beta1/projects/${projectId}/secrets/${name}/versions/${version}`, {
        auth: true,
        origin: api.secretManagerOrigin,
    });
    return parseSecretVersionResourceName(getRes.body.name);
}
exports.getSecretVersion = getSecretVersion;
async function secretExists(projectId, name) {
    try {
        await getSecret(projectId, name);
        return true;
    }
    catch (err) {
        if (err.status === 404) {
            return false;
        }
        throw err;
    }
}
exports.secretExists = secretExists;
function parseSecretResourceName(resourceName) {
    const nameTokens = resourceName.split("/");
    return {
        projectId: nameTokens[1],
        name: nameTokens[3],
    };
}
exports.parseSecretResourceName = parseSecretResourceName;
function parseSecretVersionResourceName(resourceName) {
    const nameTokens = resourceName.split("/");
    return {
        secret: {
            projectId: nameTokens[1],
            name: nameTokens[3],
        },
        versionId: nameTokens[5],
    };
}
exports.parseSecretVersionResourceName = parseSecretVersionResourceName;
function toSecretVersionResourceName(secretVersion) {
    return `projects/${secretVersion.secret.projectId}/secrets/${secretVersion.secret.name}/versions/${secretVersion.versionId}`;
}
exports.toSecretVersionResourceName = toSecretVersionResourceName;
async function createSecret(projectId, name, labels) {
    const createRes = await api.request("POST", `/v1beta1/projects/${projectId}/secrets?secretId=${name}`, {
        auth: true,
        origin: api.secretManagerOrigin,
        data: {
            replication: {
                automatic: {},
            },
            labels,
        },
    });
    return parseSecretResourceName(createRes.body.name);
}
exports.createSecret = createSecret;
async function addVersion(secret, payloadData) {
    const res = await api.request("POST", `/v1beta1/projects/${secret.projectId}/secrets/${secret.name}:addVersion`, {
        auth: true,
        origin: api.secretManagerOrigin,
        data: {
            payload: {
                data: Buffer.from(payloadData).toString("base64"),
            },
        },
    });
    const nameTokens = res.body.name.split("/");
    return {
        secret: {
            projectId: nameTokens[1],
            name: nameTokens[3],
        },
        versionId: nameTokens[5],
    };
}
exports.addVersion = addVersion;
async function grantServiceAgentRole(secret, serviceAccountEmail, role) {
    const getPolicyRes = await api.request("GET", `/v1beta1/projects/${secret.projectId}/secrets/${secret.name}:getIamPolicy`, {
        auth: true,
        origin: api.secretManagerOrigin,
    });
    const bindings = getPolicyRes.body.bindings || [];
    if (bindings.find((b) => b.role == role &&
        b.members.find((m) => m == `serviceAccount:${serviceAccountEmail}`))) {
        return;
    }
    bindings.push({
        role: role,
        members: [`serviceAccount:${serviceAccountEmail}`],
    });
    await api.request("POST", `/v1beta1/projects/${secret.projectId}/secrets/${secret.name}:setIamPolicy`, {
        auth: true,
        origin: api.secretManagerOrigin,
        data: {
            policy: {
                bindings,
            },
            updateMask: {
                paths: "bindings",
            },
        },
    });
    (0, utils_1.logLabeledSuccess)("SecretManager", `Granted ${role} on projects/${secret.projectId}/secrets/${secret.name} to ${serviceAccountEmail}`);
}
exports.grantServiceAgentRole = grantServiceAgentRole;
//# sourceMappingURL=secretManager.js.map