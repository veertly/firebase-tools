"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.printSourceDownloadLink = exports.displayUpdateChangesRequiringConfirmation = exports.displayUpdateChangesNoInput = exports.displayExtInfo = void 0;
const _ = require("lodash");
const clc = require("cli-color");
const marked = require("marked");
const TerminalRenderer = require("marked-terminal");
const utils = require("../utils");
const extensionsHelper_1 = require("./extensionsHelper");
const logger_1 = require("../logger");
const error_1 = require("../error");
marked.setOptions({
    renderer: new TerminalRenderer(),
});
const additionColor = clc.green;
const deletionColor = clc.red;
function displayExtInfo(extensionName, publisher, spec, published = false) {
    const lines = [];
    lines.push(`**Name**: ${spec.displayName}`);
    if (publisher) {
        lines.push(`**Publisher**: ${publisher}`);
    }
    if (spec.description) {
        lines.push(`**Description**: ${spec.description}`);
    }
    if (published) {
        if (spec.license) {
            lines.push(`**License**: ${spec.license}`);
        }
        lines.push(`**Source code**: ${spec.sourceUrl}`);
    }
    if (lines.length > 0) {
        utils.logLabeledBullet(extensionsHelper_1.logPrefix, `information about '${clc.bold(extensionName)}':`);
        const infoStr = lines.join("\n");
        const formatted = marked(infoStr).replace(/\n+$/, "\n");
        logger_1.logger.info(formatted);
        return lines;
    }
    else {
        throw new error_1.FirebaseError("Error occurred during installation: cannot parse info from source spec", {
            context: {
                spec: spec,
                extensionName: extensionName,
            },
        });
    }
}
exports.displayExtInfo = displayExtInfo;
function displayUpdateChangesNoInput(spec, newSpec) {
    var _a, _b, _c, _d;
    const lines = [];
    if (spec.displayName !== newSpec.displayName) {
        lines.push("", "**Name:**", deletionColor(`- ${spec.displayName}`), additionColor(`+ ${newSpec.displayName}`));
    }
    if (((_a = spec.author) === null || _a === void 0 ? void 0 : _a.authorName) !== ((_b = newSpec.author) === null || _b === void 0 ? void 0 : _b.authorName)) {
        lines.push("", "**Author:**", deletionColor(`- ${(_c = spec.author) === null || _c === void 0 ? void 0 : _c.authorName}`), additionColor(`+ ${(_d = spec.author) === null || _d === void 0 ? void 0 : _d.authorName}`));
    }
    if (spec.description !== newSpec.description) {
        lines.push("", "**Description:**", deletionColor(`- ${spec.description}`), additionColor(`+ ${newSpec.description}`));
    }
    if (spec.sourceUrl !== newSpec.sourceUrl) {
        lines.push("", "**Source code:**", deletionColor(`- ${spec.sourceUrl}`), additionColor(`+ ${newSpec.sourceUrl}`));
    }
    if (spec.billingRequired && !newSpec.billingRequired) {
        lines.push("", "**Billing is no longer required for this extension.**");
    }
    logger_1.logger.info(marked(lines.join("\n")));
    return lines;
}
exports.displayUpdateChangesNoInput = displayUpdateChangesNoInput;
async function displayUpdateChangesRequiringConfirmation(args) {
    const equals = (a, b) => {
        return _.isEqual(a, b);
    };
    if (args.spec.license !== args.newSpec.license) {
        const message = "\n" +
            "**License**\n" +
            deletionColor(args.spec.license ? `- ${args.spec.license}\n` : "- None\n") +
            additionColor(args.newSpec.license ? `+ ${args.newSpec.license}\n` : "+ None\n");
        logger_1.logger.info(message);
        if (!(await (0, extensionsHelper_1.confirm)({ nonInteractive: args.nonInteractive, force: args.force, default: true }))) {
            throw new error_1.FirebaseError("Unable to update this extension instance without explicit consent for the change to 'License'.");
        }
    }
    const apisDiffDeletions = _.differenceWith(args.spec.apis, _.get(args.newSpec, "apis", []), equals);
    const apisDiffAdditions = _.differenceWith(args.newSpec.apis, _.get(args.spec, "apis", []), equals);
    if (apisDiffDeletions.length || apisDiffAdditions.length) {
        let message = "\n**APIs:**\n";
        apisDiffDeletions.forEach((api) => {
            message += deletionColor(`- ${api.apiName} (${api.reason})\n`);
        });
        apisDiffAdditions.forEach((api) => {
            message += additionColor(`+ ${api.apiName} (${api.reason})\n`);
        });
        logger_1.logger.info(message);
        if (!(await (0, extensionsHelper_1.confirm)({ nonInteractive: args.nonInteractive, force: args.force, default: true }))) {
            throw new error_1.FirebaseError("Unable to update this extension instance without explicit consent for the change to 'APIs'.");
        }
    }
    const resourcesDiffDeletions = _.differenceWith(args.spec.resources, _.get(args.newSpec, "resources", []), compareResources);
    const resourcesDiffAdditions = _.differenceWith(args.newSpec.resources, _.get(args.spec, "resources", []), compareResources);
    if (resourcesDiffDeletions.length || resourcesDiffAdditions.length) {
        let message = "\n**Resources:**\n";
        resourcesDiffDeletions.forEach((resource) => {
            message += deletionColor(` - ${getResourceReadableName(resource)}`);
        });
        resourcesDiffAdditions.forEach((resource) => {
            message += additionColor(`+ ${getResourceReadableName(resource)}`);
        });
        logger_1.logger.info(message);
        if (!(await (0, extensionsHelper_1.confirm)({ nonInteractive: args.nonInteractive, force: args.force, default: true }))) {
            throw new error_1.FirebaseError("Unable to update this extension instance without explicit consent for the change to 'Resources'.");
        }
    }
    const rolesDiffDeletions = _.differenceWith(args.spec.roles, _.get(args.newSpec, "roles", []), equals);
    const rolesDiffAdditions = _.differenceWith(args.newSpec.roles, _.get(args.spec, "roles", []), equals);
    if (rolesDiffDeletions.length || rolesDiffAdditions.length) {
        let message = "\n**Permissions:**\n";
        rolesDiffDeletions.forEach((role) => {
            message += deletionColor(`- ${role.role} (${role.reason})\n`);
        });
        rolesDiffAdditions.forEach((role) => {
            message += additionColor(`+ ${role.role} (${role.reason})\n`);
        });
        logger_1.logger.info(message);
        if (!(await (0, extensionsHelper_1.confirm)({ nonInteractive: args.nonInteractive, force: args.force, default: true }))) {
            throw new error_1.FirebaseError("Unable to update this extension instance without explicit consent for the change to 'Permissions'.");
        }
    }
    if (!args.spec.billingRequired && args.newSpec.billingRequired) {
        logger_1.logger.info("Billing is now required for the new version of this extension.");
        if (!(await (0, extensionsHelper_1.confirm)({ nonInteractive: args.nonInteractive, force: args.force, default: true }))) {
            throw new error_1.FirebaseError("Unable to update this extension instance without explicit consent for the change to 'BillingRequired'.");
        }
    }
}
exports.displayUpdateChangesRequiringConfirmation = displayUpdateChangesRequiringConfirmation;
function compareResources(resource1, resource2) {
    return resource1.name == resource2.name && resource1.type == resource2.type;
}
function getResourceReadableName(resource) {
    return resource.type === "firebaseextensions.v1beta.function"
        ? `${resource.name} (Cloud Function): ${resource.description}\n`
        : `${resource.name} (${resource.type})\n`;
}
function printSourceDownloadLink(sourceDownloadUri) {
    const sourceDownloadMsg = `Want to review the source code that will be installed? Download it here: ${sourceDownloadUri}`;
    utils.logBullet(marked(sourceDownloadMsg));
}
exports.printSourceDownloadLink = printSourceDownloadLink;
//# sourceMappingURL=displayExtensionInfo.js.map