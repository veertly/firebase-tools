"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Delegate = exports.tryCreateDelegate = void 0;
const util_1 = require("util");
const fs = require("fs");
const path = require("path");
const error_1 = require("../../../../error");
const parseRuntimeAndValidateSDK_1 = require("./parseRuntimeAndValidateSDK");
const logger_1 = require("../../../../logger");
const validate = require("./validate");
const versioning = require("./versioning");
const parseTriggers = require("./parseTriggers");
async function tryCreateDelegate(context) {
    const packageJsonPath = path.join(context.sourceDir, "package.json");
    if (!(await (0, util_1.promisify)(fs.exists)(packageJsonPath))) {
        logger_1.logger.debug("Customer code is not Node");
        return undefined;
    }
    const runtime = (0, parseRuntimeAndValidateSDK_1.getRuntimeChoice)(context.sourceDir, context.runtime);
    if (!runtime.startsWith("nodejs")) {
        logger_1.logger.debug("Customer has a package.json but did not get a nodejs runtime. This should not happen");
        throw new error_1.FirebaseError(`Unexpected runtime ${runtime}`);
    }
    return new Delegate(context.projectId, context.projectDir, context.sourceDir, runtime);
}
exports.tryCreateDelegate = tryCreateDelegate;
class Delegate {
    constructor(projectId, projectDir, sourceDir, runtime) {
        this.projectId = projectId;
        this.projectDir = projectDir;
        this.sourceDir = sourceDir;
        this.runtime = runtime;
        this.name = "nodejs";
        this._sdkVersion = "";
    }
    get sdkVersion() {
        if (!this._sdkVersion) {
            this._sdkVersion = versioning.getFunctionsSDKVersion(this.sourceDir) || "";
        }
        return this._sdkVersion;
    }
    validate() {
        versioning.checkFunctionsSDKVersion(this.sdkVersion);
        const relativeDir = path.relative(this.projectDir, this.sourceDir);
        validate.packageJsonIsValid(relativeDir, this.sourceDir, this.projectDir);
        return Promise.resolve();
    }
    async build() {
    }
    watch() {
        return Promise.resolve(() => Promise.resolve());
    }
    async discoverSpec(config, env) {
        return parseTriggers.discoverBackend(this.projectId, this.sourceDir, this.runtime, config, env);
    }
}
exports.Delegate = Delegate;
//# sourceMappingURL=index.js.map