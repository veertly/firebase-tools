"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const spawn = require("cross-spawn");
const uuid = require("uuid");
const command_1 = require("../command");
const downloadUtils = require("../downloadUtils");
const error_1 = require("../error");
const logger_1 = require("../logger");
const rimraf = require("rimraf");
const utils = require("../utils");
var SymbolGenerator;
(function (SymbolGenerator) {
    SymbolGenerator["breakpad"] = "breakpad";
    SymbolGenerator["csym"] = "csym";
})(SymbolGenerator || (SymbolGenerator = {}));
const SYMBOL_CACHE_ROOT_DIR = process.env.FIREBASE_CRASHLYTICS_CACHE_PATH || os.tmpdir();
const JAR_CACHE_DIR = process.env.FIREBASE_CRASHLYTICS_BUILDTOOLS_PATH ||
    path.join(os.homedir(), ".cache", "firebase", "crashlytics", "buildtools");
const JAR_VERSION = "2.8.0";
const JAR_URL = `https://dl.google.com/android/maven2/com/google/firebase/firebase-crashlytics-buildtools/${JAR_VERSION}/firebase-crashlytics-buildtools-${JAR_VERSION}.jar`;
exports.default = new command_1.Command("crashlytics:symbols:upload <symbolFiles...>")
    .description("Upload symbols for native code, to symbolicate stack traces.")
    .option("--app <appID>", "the app id of your Firebase app")
    .option("--generator [breakpad|csym]", "the symbol generator being used, defaults to breakpad.")
    .option("--dry-run", "generate symbols without uploading them")
    .option("--debug", "print debug output and logging from the underlying uploader tool")
    .action(async (symbolFiles, options) => {
    const app = getGoogleAppID(options) || "";
    const generator = getSymbolGenerator(options);
    const dryRun = !!options.dryRun;
    const debug = !!options.debug;
    let jarFile = await downloadBuiltoolsJar();
    if (process.env.LOCAL_JAR) {
        jarFile = process.env.LOCAL_JAR;
    }
    const jarOptions = {
        jarFile,
        app,
        generator,
        cachePath: path.join(SYMBOL_CACHE_ROOT_DIR, `crashlytics-${uuid.v4()}`, "nativeSymbols", app.replace(/:/g, "-"), generator),
        symbolFile: "",
        generate: true,
    };
    for (const symbolFile of symbolFiles) {
        utils.logBullet(`Generating symbols for ${symbolFile}`);
        const generateArgs = buildArgs(Object.assign(Object.assign({}, jarOptions), { symbolFile }));
        const output = runJar(generateArgs, debug);
        if (output.length > 0) {
            utils.logBullet(output);
        }
        else {
            utils.logBullet(`Generated symbols for ${symbolFile}`);
            utils.logBullet(`Output Path: ${jarOptions.cachePath}`);
        }
    }
    if (dryRun) {
        utils.logBullet("Skipping upload because --dry-run was passed");
        return;
    }
    utils.logBullet(`Uploading all generated symbols`);
    const uploadArgs = buildArgs(Object.assign(Object.assign({}, jarOptions), { generate: false }));
    const output = runJar(uploadArgs, debug);
    if (output.length > 0) {
        utils.logBullet(output);
    }
    else {
        utils.logBullet("Successfully uploaded all symbols");
    }
});
function getGoogleAppID(options) {
    if (!options.app) {
        throw new error_1.FirebaseError("set the --app option to a valid Firebase app id and try again");
    }
    return options.app;
}
function getSymbolGenerator(options) {
    if (!options.generator) {
        return SymbolGenerator.breakpad;
    }
    if (!Object.values(SymbolGenerator).includes(options.generator)) {
        throw new error_1.FirebaseError('--symbol-generator should be set to either "breakpad" or "csym"');
    }
    return options.generator;
}
async function downloadBuiltoolsJar() {
    const jarPath = path.join(JAR_CACHE_DIR, `crashlytics-buildtools-${JAR_VERSION}.jar`);
    if (fs.existsSync(jarPath)) {
        logger_1.logger.debug(`Buildtools Jar already downloaded at ${jarPath}`);
        return jarPath;
    }
    if (fs.existsSync(JAR_CACHE_DIR)) {
        logger_1.logger.debug(`Deleting Jar cache at ${JAR_CACHE_DIR} because the CLI was run with a newer Jar version`);
        rimraf.sync(JAR_CACHE_DIR);
    }
    utils.logBullet("Downloading buildtools.jar to " + jarPath);
    utils.logBullet("For open source licenses used by this command, look in the META-INF directory in the buildtools.jar file");
    const tmpfile = await downloadUtils.downloadToTmp(JAR_URL);
    fs.mkdirSync(JAR_CACHE_DIR, { recursive: true });
    fs.copySync(tmpfile, jarPath);
    return jarPath;
}
function buildArgs(options) {
    const baseArgs = [
        "-jar",
        options.jarFile,
        `-symbolGenerator=${options.generator}`,
        `-symbolFileCacheDir=${options.cachePath}`,
        "-verbose",
    ];
    if (options.generate) {
        return baseArgs.concat(["-generateNativeSymbols", `-unstrippedLibrary=${options.symbolFile}`]);
    }
    return baseArgs.concat([
        "-uploadNativeSymbols",
        `-googleAppId=${options.app}`,
    ]);
}
function runJar(args, debug) {
    var _a, _b, _c;
    const outputs = spawn.sync("java", args, {
        stdio: debug ? "inherit" : "pipe",
    });
    if (outputs.status || 0 > 0) {
        if (!debug) {
            utils.logWarning(((_a = outputs.stdout) === null || _a === void 0 ? void 0 : _a.toString()) || "An unknown error occurred");
        }
        throw new error_1.FirebaseError("Failed to upload symbols");
    }
    if (!debug) {
        let logRegex = /(Generated symbol file.*$)/m;
        let matched = (((_b = outputs.stdout) === null || _b === void 0 ? void 0 : _b.toString()) || "").match(logRegex);
        if (matched) {
            return matched[1];
        }
        logRegex = /(Crashlytics symbol file uploaded successfully.*$)/m;
        matched = (((_c = outputs.stdout) === null || _c === void 0 ? void 0 : _c.toString()) || "").match(logRegex);
        if (matched) {
            return matched[1];
        }
        return "";
    }
    return "";
}
//# sourceMappingURL=crashlytics-symbols-upload.js.map