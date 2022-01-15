"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listExtensions = void 0;
const _ = require("lodash");
const clc = require("cli-color");
const Table = require("cli-table");
const extensionsApi_1 = require("./extensionsApi");
const extensionsHelper_1 = require("./extensionsHelper");
const utils = require("../utils");
const extensionsUtils = require("./utils");
async function listExtensions(projectId) {
    const instances = await (0, extensionsApi_1.listInstances)(projectId);
    if (instances.length < 1) {
        utils.logLabeledBullet(extensionsHelper_1.logPrefix, `there are no extensions installed on project ${clc.bold(projectId)}.`);
        return [];
    }
    const table = new Table({
        head: ["Extension", "Publisher", "Instance ID", "State", "Version", "Your last update"],
        style: { head: ["yellow"] },
    });
    const sorted = _.sortBy(instances, "createTime", "asc").reverse();
    const formatted = [];
    sorted.forEach((instance) => {
        var _a, _b, _c, _d;
        let extension = _.get(instance, "config.extensionRef", "");
        let publisher;
        if (extension === "") {
            extension = _.get(instance, "config.source.spec.name", "");
            publisher = "N/A";
        }
        else {
            publisher = extension.split("/")[0];
        }
        const instanceId = (_a = _.last(instance.name.split("/"))) !== null && _a !== void 0 ? _a : "";
        const state = instance.state +
            (_.get(instance, "config.source.state", "ACTIVE") === "DELETED" ? " (UNPUBLISHED)" : "");
        const version = (_d = (_c = (_b = instance === null || instance === void 0 ? void 0 : instance.config) === null || _b === void 0 ? void 0 : _b.source) === null || _c === void 0 ? void 0 : _c.spec) === null || _d === void 0 ? void 0 : _d.version;
        const updateTime = extensionsUtils.formatTimestamp(instance.updateTime);
        table.push([extension, publisher, instanceId, state, version, updateTime]);
        formatted.push({
            extension,
            publisher,
            instanceId,
            state,
            version,
            updateTime,
        });
    });
    utils.logLabeledBullet(extensionsHelper_1.logPrefix, `list of extensions installed in ${clc.bold(projectId)}:`);
    return formatted;
}
exports.listExtensions = listExtensions;
//# sourceMappingURL=listExtensions.js.map