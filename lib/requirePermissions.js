"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePermissions = void 0;
const cli_color_1 = require("cli-color");
const projectUtils_1 = require("./projectUtils");
const requireAuth_1 = require("./requireAuth");
const logger_1 = require("./logger");
const error_1 = require("./error");
const iam_1 = require("./gcp/iam");
const BASE_PERMISSIONS = ["firebase.projects.get"];
async function requirePermissions(options, permissions = []) {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const requiredPermissions = BASE_PERMISSIONS.concat(permissions).sort();
    await (0, requireAuth_1.requireAuth)(options);
    logger_1.logger.debug(`[iam] checking project ${projectId} for permissions ${JSON.stringify(requiredPermissions)}`);
    try {
        const iamResult = await (0, iam_1.testIamPermissions)(projectId, requiredPermissions);
        if (!iamResult.passed) {
            throw new error_1.FirebaseError(`Authorization failed. This account is missing the following required permissions on project ${(0, cli_color_1.bold)(projectId)}:\n\n  ${iamResult.missing.join("\n  ")}`);
        }
    }
    catch (err) {
        logger_1.logger.debug(`[iam] error while checking permissions, command may fail: ${err}`);
        return;
    }
}
exports.requirePermissions = requirePermissions;
//# sourceMappingURL=requirePermissions.js.map