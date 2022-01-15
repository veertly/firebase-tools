"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const clc = require("cli-color");
const _ = require("lodash");
const checkMinRequiredVersion_1 = require("../checkMinRequiredVersion");
const command_1 = require("../command");
const extensionsApi = require("../extensions/extensionsApi");
const extensionsHelper_1 = require("../extensions/extensionsHelper");
const localHelper_1 = require("../extensions/localHelper");
const logger_1 = require("../logger");
const requirePermissions_1 = require("../requirePermissions");
const utils = require("../utils");
const marked = require("marked");
const TerminalRenderer = require("marked-terminal");
const FUNCTION_TYPE_REGEX = /\..+\.function/;
exports.default = new command_1.Command("ext:info <extensionName>")
    .description("display information about an extension by name (extensionName@x.y.z for a specific version)")
    .option("--markdown", "output info in Markdown suitable for constructing a README file")
    .before(checkMinRequiredVersion_1.checkMinRequiredVersion, "extMinVersion")
    .action(async (extensionName, options) => {
    var _a, _b;
    let spec;
    if ((0, localHelper_1.isLocalExtension)(extensionName)) {
        if (!options.markdown) {
            utils.logLabeledBullet(extensionsHelper_1.logPrefix, `reading extension from directory: ${extensionName}`);
        }
        spec = await (0, localHelper_1.getLocalExtensionSpec)(extensionName);
    }
    else {
        await (0, requirePermissions_1.requirePermissions)(options, ["firebaseextensions.sources.get"]);
        await (0, extensionsHelper_1.ensureExtensionsApiEnabled)(options);
        const hasPublisherId = extensionName.split("/").length >= 2;
        if (hasPublisherId) {
            const nameAndVersion = extensionName.split("/")[1];
            if (nameAndVersion.split("@").length < 2) {
                extensionName = extensionName + "@latest";
            }
        }
        else {
            const [name, version] = extensionName.split("@");
            extensionName = `firebase/${name}@${version || "latest"}`;
        }
        const version = await extensionsApi.getExtensionVersion(extensionName);
        spec = version.spec;
    }
    if (!options.markdown) {
        utils.logLabeledBullet(extensionsHelper_1.logPrefix, `information about ${extensionName}:\n`);
    }
    const lines = [];
    if (options.markdown) {
        lines.push(`# ${spec.displayName}`);
    }
    else {
        lines.push(`**Name**: ${spec.displayName}`);
    }
    const authorName = (_a = spec.author) === null || _a === void 0 ? void 0 : _a.authorName;
    const url = (_b = spec.author) === null || _b === void 0 ? void 0 : _b.url;
    const urlMarkdown = url ? `(**[${url}](${url})**)` : "";
    lines.push(`**Author**: ${authorName} ${urlMarkdown}`);
    if (spec.description) {
        lines.push(`**Description**: ${spec.description}`);
    }
    if (spec.preinstallContent) {
        lines.push("", `**Details**: ${spec.preinstallContent}`);
    }
    if (spec.params && Array.isArray(spec.params) && spec.params.length > 0) {
        lines.push("", "**Configuration Parameters:**");
        _.forEach(spec.params, (param) => {
            lines.push(`* ${param.label}` + (param.description ? `: ${param.description}` : ""));
        });
    }
    const functions = [];
    const otherResources = [];
    _.forEach(spec.resources, (resource) => {
        if (FUNCTION_TYPE_REGEX.test(resource.type)) {
            functions.push(resource);
        }
        else {
            otherResources.push(resource);
        }
    });
    if (functions.length > 0) {
        lines.push("", "**Cloud Functions:**");
        _.forEach(functions, (func) => {
            lines.push(`* **${func.name}:** ${func.description}`);
        });
    }
    if (otherResources.length > 0) {
        lines.push("", "**Other Resources**:");
        _.forEach(otherResources, (resource) => {
            lines.push(`* ${resource.name} (${resource.type})`);
        });
    }
    if (spec.apis) {
        lines.push("", "**APIs Used**:");
        _.forEach(spec.apis, (api) => {
            lines.push(`* ${api.apiName}` + (api.reason ? ` (Reason: ${api.reason})` : ""));
        });
    }
    if (spec.roles) {
        lines.push("", "**Access Required**:");
        lines.push("", "This extension will operate with the following project IAM roles:");
        _.forEach(spec.roles, (role) => {
            lines.push(`* ${role.role}` + (role.reason ? ` (Reason: ${role.reason})` : ""));
        });
    }
    if (options.markdown) {
        logger_1.logger.info(lines.join("\n\n"));
    }
    else {
        marked.setOptions({
            renderer: new TerminalRenderer(),
        });
        logger_1.logger.info(marked(lines.join("\n")));
        utils.logLabeledBullet(extensionsHelper_1.logPrefix, `to install this extension, type ` +
            clc.bold(`firebase ext:install ${extensionName} --project=YOUR_PROJECT`));
    }
});
//# sourceMappingURL=ext-info.js.map