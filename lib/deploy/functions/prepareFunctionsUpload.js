"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareFunctionsUpload = exports.getFunctionsConfig = void 0;
const _ = require("lodash");
const archiver = require("archiver");
const clc = require("cli-color");
const filesize = require("filesize");
const fs = require("fs");
const path = require("path");
const tmp = require("tmp");
const error_1 = require("../../error");
const logger_1 = require("../../logger");
const functionsConfig = require("../../functionsConfig");
const utils = require("../../utils");
const fsAsync = require("../../fsAsync");
const CONFIG_DEST_FILE = ".runtimeconfig.json";
async function getFunctionsConfig(context) {
    var _a, _b;
    let config = {};
    if (context.runtimeConfigEnabled) {
        try {
            config = await functionsConfig.materializeAll(context.firebaseConfig.projectId);
        }
        catch (err) {
            logger_1.logger.debug(err);
            let errorCode = (_b = (_a = err === null || err === void 0 ? void 0 : err.context) === null || _a === void 0 ? void 0 : _a.response) === null || _b === void 0 ? void 0 : _b.statusCode;
            if (!errorCode) {
                logger_1.logger.debug("Got unexpected error from Runtime Config; it has no status code:", err);
                errorCode = 500;
            }
            if (errorCode === 500 || errorCode === 503) {
                throw new error_1.FirebaseError("Cloud Runtime Config is currently experiencing issues, " +
                    "which is preventing your functions from being deployed. " +
                    "Please wait a few minutes and then try to deploy your functions again." +
                    "\nRun `firebase deploy --except functions` if you want to continue deploying the rest of your project.");
            }
            config = {};
        }
    }
    config.firebase = context.firebaseConfig;
    return config;
}
exports.getFunctionsConfig = getFunctionsConfig;
async function pipeAsync(from, to) {
    return new Promise((resolve, reject) => {
        to.on("finish", resolve);
        to.on("error", reject);
        from.pipe(to);
    });
}
async function packageSource(options, sourceDir, configValues) {
    var _a;
    const tmpFile = tmp.fileSync({ prefix: "firebase-functions-", postfix: ".zip" }).name;
    const fileStream = fs.createWriteStream(tmpFile, {
        flags: "w",
        encoding: "binary",
    });
    const archive = archiver("zip");
    const ignore = ((_a = options.config.src.functions) === null || _a === void 0 ? void 0 : _a.ignore) || ["node_modules", ".git"];
    ignore.push("firebase-debug.log", "firebase-debug.*.log", CONFIG_DEST_FILE);
    try {
        const files = await fsAsync.readdirRecursive({ path: sourceDir, ignore: ignore });
        _.forEach(files, (file) => {
            archive.file(file.name, {
                name: path.relative(sourceDir, file.name),
                mode: file.mode,
            });
        });
        if (typeof configValues !== "undefined") {
            archive.append(JSON.stringify(configValues, null, 2), {
                name: CONFIG_DEST_FILE,
                mode: 420,
            });
        }
        archive.finalize();
        await pipeAsync(archive, fileStream);
    }
    catch (err) {
        throw new error_1.FirebaseError("Could not read source directory. Remove links and shortcuts and try again.", {
            original: err,
            exit: 1,
        });
    }
    utils.assertDefined(options.config.src.functions);
    utils.assertDefined(options.config.src.functions.source, "Error: 'functions.source' is not defined");
    utils.logBullet(clc.cyan.bold("functions:") +
        " packaged " +
        clc.bold(options.config.src.functions.source) +
        " (" +
        filesize(archive.pointer()) +
        ") for uploading");
    return tmpFile;
}
async function prepareFunctionsUpload(runtimeConfig, options) {
    utils.assertDefined(options.config.src.functions);
    utils.assertDefined(options.config.src.functions.source, "Error: 'functions.source' is not defined");
    const sourceDir = options.config.path(options.config.src.functions.source);
    return packageSource(options, sourceDir, runtimeConfig);
}
exports.prepareFunctionsUpload = prepareFunctionsUpload;
//# sourceMappingURL=prepareFunctionsUpload.js.map