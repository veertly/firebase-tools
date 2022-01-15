"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.functionIdsAreValid = exports.functionsDirectoryExists = void 0;
const path = require("path");
const clc = require("cli-color");
const error_1 = require("../../error");
const fsutils = require("../../fsutils");
function functionsDirectoryExists(sourceDir, projectDir) {
    if (!fsutils.dirExistsSync(sourceDir)) {
        const sourceDirName = path.relative(projectDir, sourceDir);
        const msg = `could not deploy functions because the ${clc.bold('"' + sourceDirName + '"')} ` +
            `directory was not found. Please create it or specify a different source directory in firebase.json`;
        throw new error_1.FirebaseError(msg);
    }
}
exports.functionsDirectoryExists = functionsDirectoryExists;
function functionIdsAreValid(functions) {
    const v1FunctionName = /^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/;
    const invalidV1Ids = functions.filter((fn) => {
        return fn.platform === "gcfv1" && !v1FunctionName.test(fn.id);
    });
    if (invalidV1Ids.length !== 0) {
        const msg = `${invalidV1Ids.map((f) => f.id).join(", ")} function name(s) can only contain letters, ` +
            `numbers, hyphens, and not exceed 62 characters in length`;
        throw new error_1.FirebaseError(msg);
    }
    const v2FunctionName = /^[a-z][a-z0-9-]{0,62}$/;
    const invalidV2Ids = functions.filter((fn) => {
        return fn.platform === "gcfv2" && !v2FunctionName.test(fn.id);
    });
    if (invalidV2Ids.length !== 0) {
        const msg = `${invalidV2Ids.map((f) => f.id).join(", ")} v2 function name(s) can only contin lower ` +
            `case letters, numbers, hyphens, and not exceed 62 characters in length`;
        throw new error_1.FirebaseError(msg);
    }
}
exports.functionIdsAreValid = functionIdsAreValid;
//# sourceMappingURL=validate.js.map