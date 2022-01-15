"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.start = exports.downloadIfNecessary = exports.stop = exports.getPID = exports.get = exports.getDownloadDetails = exports.handleEmulatorProcessError = exports._getCommand = exports.getLogFileName = exports.DownloadDetails = void 0;
const types_1 = require("./types");
const constants_1 = require("./constants");
const error_1 = require("../error");
const childProcess = require("child_process");
const utils = require("../utils");
const emulatorLogger_1 = require("./emulatorLogger");
const clc = require("cli-color");
const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const registry_1 = require("./registry");
const download_1 = require("../emulator/download");
const EMULATOR_INSTANCE_KILL_TIMEOUT = 4000;
const CACHE_DIR = process.env.FIREBASE_EMULATORS_PATH || path.join(os.homedir(), ".cache", "firebase", "emulators");
exports.DownloadDetails = {
    database: {
        downloadPath: path.join(CACHE_DIR, "firebase-database-emulator-v4.7.3.jar"),
        version: "4.7.3",
        opts: {
            cacheDir: CACHE_DIR,
            remoteUrl: "https://storage.googleapis.com/firebase-preview-drop/emulator/firebase-database-emulator-v4.7.3.jar",
            expectedSize: 28862098,
            expectedChecksum: "8f696f24ee89c937a789498a0c0e4899",
            namePrefix: "firebase-database-emulator",
        },
    },
    firestore: {
        downloadPath: path.join(CACHE_DIR, "cloud-firestore-emulator-v1.13.1.jar"),
        version: "1.13.1",
        opts: {
            cacheDir: CACHE_DIR,
            remoteUrl: "https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.13.1.jar",
            expectedSize: 60486708,
            expectedChecksum: "e0590880408eacb790874643147c0081",
            namePrefix: "cloud-firestore-emulator",
        },
    },
    storage: {
        downloadPath: path.join(CACHE_DIR, "cloud-storage-rules-runtime-v1.0.1.jar"),
        version: "1.0.1",
        opts: {
            cacheDir: CACHE_DIR,
            remoteUrl: "https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-storage-rules-runtime-v1.0.1.jar",
            expectedSize: 32729999,
            expectedChecksum: "1a441f5e16c17aa7a27db71c9c9186d5",
            namePrefix: "cloud-storage-rules-emulator",
        },
    },
    ui: {
        version: "1.6.4",
        downloadPath: path.join(CACHE_DIR, "ui-v1.6.4.zip"),
        unzipDir: path.join(CACHE_DIR, "ui-v1.6.4"),
        binaryPath: path.join(CACHE_DIR, "ui-v1.6.4", "server.bundle.js"),
        opts: {
            cacheDir: CACHE_DIR,
            remoteUrl: "https://storage.googleapis.com/firebase-preview-drop/emulator/ui-v1.6.4.zip",
            expectedSize: 3757300,
            expectedChecksum: "20d4ee71e4ff7527b1843b6a8636142e",
            namePrefix: "ui",
        },
    },
    pubsub: {
        downloadPath: path.join(CACHE_DIR, "pubsub-emulator-0.1.0.zip"),
        version: "0.1.0",
        unzipDir: path.join(CACHE_DIR, "pubsub-emulator-0.1.0"),
        binaryPath: path.join(CACHE_DIR, "pubsub-emulator-0.1.0", `pubsub-emulator/bin/cloud-pubsub-emulator${process.platform === "win32" ? ".bat" : ""}`),
        opts: {
            cacheDir: CACHE_DIR,
            remoteUrl: "https://storage.googleapis.com/firebase-preview-drop/emulator/pubsub-emulator-0.1.0.zip",
            expectedSize: 36623622,
            expectedChecksum: "81704b24737d4968734d3e175f4cde71",
            namePrefix: "pubsub-emulator",
        },
    },
};
const EmulatorDetails = {
    database: {
        name: types_1.Emulators.DATABASE,
        instance: null,
        stdout: null,
    },
    firestore: {
        name: types_1.Emulators.FIRESTORE,
        instance: null,
        stdout: null,
    },
    storage: {
        name: types_1.Emulators.STORAGE,
        instance: null,
        stdout: null,
    },
    pubsub: {
        name: types_1.Emulators.PUBSUB,
        instance: null,
        stdout: null,
    },
    ui: {
        name: types_1.Emulators.UI,
        instance: null,
        stdout: null,
    },
};
const Commands = {
    database: {
        binary: "java",
        args: ["-Duser.language=en", "-jar", getExecPath(types_1.Emulators.DATABASE)],
        optionalArgs: ["port", "host", "functions_emulator_port", "functions_emulator_host"],
        joinArgs: false,
    },
    firestore: {
        binary: "java",
        args: [
            "-Dgoogle.cloud_firestore.debug_log_level=FINE",
            "-Duser.language=en",
            "-jar",
            getExecPath(types_1.Emulators.FIRESTORE),
        ],
        optionalArgs: [
            "port",
            "webchannel_port",
            "host",
            "rules",
            "functions_emulator",
            "seed_from_export",
        ],
        joinArgs: false,
    },
    storage: {
        binary: "java",
        args: [
            "-jar",
            "-Duser.language=en",
            getExecPath(types_1.Emulators.STORAGE),
            "serve",
        ],
        optionalArgs: [],
        joinArgs: false,
    },
    pubsub: {
        binary: getExecPath(types_1.Emulators.PUBSUB),
        args: [],
        optionalArgs: ["port", "host"],
        joinArgs: true,
    },
    ui: {
        binary: "node",
        args: [getExecPath(types_1.Emulators.UI)],
        optionalArgs: [],
        joinArgs: false,
    },
};
function getExecPath(name) {
    const details = getDownloadDetails(name);
    return details.binaryPath || details.downloadPath;
}
function getLogFileName(name) {
    return `${name}-debug.log`;
}
exports.getLogFileName = getLogFileName;
function _getCommand(emulator, args) {
    const baseCmd = Commands[emulator];
    const defaultPort = constants_1.Constants.getDefaultPort(emulator);
    if (!args.port) {
        args.port = defaultPort;
    }
    const cmdLineArgs = baseCmd.args.slice();
    if (baseCmd.binary === "java" &&
        utils.isRunningInWSL() &&
        (!args.host || !args.host.includes(":"))) {
        cmdLineArgs.unshift("-Djava.net.preferIPv4Stack=true");
    }
    const logger = emulatorLogger_1.EmulatorLogger.forEmulator(emulator);
    Object.keys(args).forEach((key) => {
        if (!baseCmd.optionalArgs.includes(key)) {
            logger.log("DEBUG", `Ignoring unsupported arg: ${key}`);
            return;
        }
        const argKey = "--" + key;
        const argVal = args[key];
        if (argVal === undefined) {
            logger.log("DEBUG", `Ignoring empty arg for key: ${key}`);
            return;
        }
        if (baseCmd.joinArgs) {
            cmdLineArgs.push(`${argKey}=${argVal}`);
        }
        else {
            cmdLineArgs.push(argKey, argVal);
        }
    });
    return {
        binary: baseCmd.binary,
        args: cmdLineArgs,
        optionalArgs: baseCmd.optionalArgs,
        joinArgs: baseCmd.joinArgs,
    };
}
exports._getCommand = _getCommand;
async function _fatal(emulator, errorMsg) {
    try {
        const logger = emulatorLogger_1.EmulatorLogger.forEmulator(emulator);
        logger.logLabeled("WARN", emulator, `Fatal error occurred: \n   ${errorMsg}, \n   stopping all running emulators`);
        await registry_1.EmulatorRegistry.stopAll();
    }
    finally {
        process.exit(1);
    }
}
async function handleEmulatorProcessError(emulator, err) {
    const description = constants_1.Constants.description(emulator);
    if (err.path === "java" && err.code === "ENOENT") {
        await _fatal(emulator, `${description} has exited because java is not installed, you can install it from https://openjdk.java.net/install/`);
    }
    else {
        await _fatal(emulator, `${description} has exited: ${err}`);
    }
}
exports.handleEmulatorProcessError = handleEmulatorProcessError;
async function _runBinary(emulator, command, extraEnv) {
    return new Promise((resolve) => {
        const logger = emulatorLogger_1.EmulatorLogger.forEmulator(emulator.name);
        emulator.stdout = fs.createWriteStream(getLogFileName(emulator.name));
        try {
            emulator.instance = childProcess.spawn(command.binary, command.args, {
                env: Object.assign(Object.assign({}, process.env), extraEnv),
                detached: true,
                stdio: ["inherit", "pipe", "pipe"],
            });
        }
        catch (e) {
            if (e.code === "EACCES") {
                logger.logLabeled("WARN", emulator.name, `Could not spawn child process for emulator, check that java is installed and on your $PATH.`);
            }
            _fatal(emulator.name, e);
        }
        const description = constants_1.Constants.description(emulator.name);
        if (emulator.instance == null) {
            logger.logLabeled("WARN", emulator.name, `Could not spawn child process for ${description}.`);
            return;
        }
        logger.logLabeled("BULLET", emulator.name, `${description} logging to ${clc.bold(getLogFileName(emulator.name))}`);
        emulator.instance.stdout.on("data", (data) => {
            logger.log("DEBUG", data.toString());
            emulator.stdout.write(data);
        });
        emulator.instance.stderr.on("data", (data) => {
            logger.log("DEBUG", data.toString());
            emulator.stdout.write(data);
            if (data.toString().includes("java.lang.UnsupportedClassVersionError")) {
                logger.logLabeled("WARN", emulator.name, "Unsupported java version, make sure java --version reports 1.8 or higher.");
            }
        });
        emulator.instance.on("error", (err) => {
            handleEmulatorProcessError(emulator.name, err);
        });
        emulator.instance.once("exit", async (code, signal) => {
            if (signal) {
                utils.logWarning(`${description} has exited upon receiving signal: ${signal}`);
            }
            else if (code && code !== 0 && code !== 130) {
                await _fatal(emulator.name, `${description} has exited with code: ${code}`);
            }
        });
        resolve();
    });
}
function getDownloadDetails(emulator) {
    return exports.DownloadDetails[emulator];
}
exports.getDownloadDetails = getDownloadDetails;
function get(emulator) {
    return EmulatorDetails[emulator];
}
exports.get = get;
function getPID(emulator) {
    const emulatorInstance = get(emulator).instance;
    return emulatorInstance && emulatorInstance.pid ? emulatorInstance.pid : 0;
}
exports.getPID = getPID;
async function stop(targetName) {
    const emulator = get(targetName);
    return new Promise((resolve, reject) => {
        const logger = emulatorLogger_1.EmulatorLogger.forEmulator(emulator.name);
        if (emulator.instance) {
            const killTimeout = setTimeout(() => {
                const pid = emulator.instance ? emulator.instance.pid : -1;
                const errorMsg = constants_1.Constants.description(emulator.name) + ": Unable to terminate process (PID=" + pid + ")";
                logger.log("DEBUG", errorMsg);
                reject(new error_1.FirebaseError(emulator.name + ": " + errorMsg));
            }, EMULATOR_INSTANCE_KILL_TIMEOUT);
            emulator.instance.once("exit", () => {
                clearTimeout(killTimeout);
                resolve();
            });
            emulator.instance.kill("SIGINT");
        }
        else {
            resolve();
        }
    });
}
exports.stop = stop;
async function downloadIfNecessary(targetName) {
    const hasEmulator = fs.existsSync(getExecPath(targetName));
    if (hasEmulator) {
        return;
    }
    await (0, download_1.downloadEmulator)(targetName);
}
exports.downloadIfNecessary = downloadIfNecessary;
async function start(targetName, args, extraEnv = {}) {
    const downloadDetails = exports.DownloadDetails[targetName];
    const emulator = get(targetName);
    const hasEmulator = fs.existsSync(getExecPath(targetName));
    const logger = emulatorLogger_1.EmulatorLogger.forEmulator(targetName);
    if (!hasEmulator || downloadDetails.opts.skipCache) {
        if (args.auto_download) {
            if (process.env.CI) {
                utils.logWarning(`It appears you are running in a CI environment. You can avoid downloading the ${constants_1.Constants.description(targetName)} repeatedly by caching the ${downloadDetails.opts.cacheDir} directory.`);
            }
            await (0, download_1.downloadEmulator)(targetName);
        }
        else {
            utils.logWarning("Setup required, please run: firebase setup:emulators:" + targetName);
            throw new error_1.FirebaseError("emulator not found");
        }
    }
    const command = _getCommand(targetName, args);
    logger.log("DEBUG", `Starting ${constants_1.Constants.description(targetName)} with command ${JSON.stringify(command)}`);
    return _runBinary(emulator, command, extraEnv);
}
exports.start = start;
//# sourceMappingURL=downloadableEmulators.js.map