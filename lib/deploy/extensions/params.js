"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readParams = void 0;
const path = require("path");
const logger_1 = require("../../logger");
const paramHelper_1 = require("../../extensions/paramHelper");
const error_1 = require("../../error");
const ENV_DIRECTORY = "extensions";
function readParams(args) {
    const filesToCheck = [
        `${args.instanceId}.env`,
        ...args.aliases.map((alias) => `${args.instanceId}.env.${alias}`),
        `${args.instanceId}.env.${args.projectNumber}`,
        `${args.instanceId}.env.${args.projectId}`,
    ];
    let noFilesFound = true;
    const combinedParams = {};
    for (const fileToCheck of filesToCheck) {
        try {
            const params = readParamsFile(args.projectDir, fileToCheck);
            logger_1.logger.debug(`Successfully read params from ${fileToCheck}`);
            noFilesFound = false;
            Object.assign(combinedParams, params);
        }
        catch (err) {
            logger_1.logger.debug(`${err}`);
        }
    }
    if (noFilesFound) {
        throw new error_1.FirebaseError(`No params file found for ${args.instanceId}`);
    }
    return combinedParams;
}
exports.readParams = readParams;
function readParamsFile(projectDir, fileName) {
    const paramPath = path.join(projectDir, ENV_DIRECTORY, fileName);
    const params = (0, paramHelper_1.readEnvFile)(paramPath);
    return params;
}
//# sourceMappingURL=params.js.map