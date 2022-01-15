"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FunctionsServer = void 0;
const path = require("path");
const functionsEmulator_1 = require("../emulator/functionsEmulator");
const emulatorServer_1 = require("../emulator/emulatorServer");
const functionsEmulatorUtils_1 = require("../emulator/functionsEmulatorUtils");
const projectUtils_1 = require("../projectUtils");
const auth_1 = require("../auth");
const utils = require("../utils");
class FunctionsServer {
    constructor() {
        this.emulatorServer = undefined;
        this.backend = undefined;
    }
    assertServer() {
        if (!this.emulatorServer || !this.backend) {
            throw new Error("Must call start() before calling any other operation!");
        }
    }
    async start(options, partialArgs) {
        const projectId = (0, projectUtils_1.needProjectId)(options);
        utils.assertDefined(options.config.src.functions);
        utils.assertDefined(options.config.src.functions.source, "Error: 'functions.source' is not defined");
        const functionsDir = path.join(options.config.projectDir, options.config.src.functions.source);
        const account = (0, auth_1.getProjectDefaultAccount)(options.config.projectDir);
        const nodeMajorVersion = (0, functionsEmulatorUtils_1.parseRuntimeVersion)(options.config.get("functions.runtime"));
        this.backend = {
            functionsDir,
            env: {},
            nodeMajorVersion,
        };
        const args = Object.assign({ projectId, emulatableBackends: [this.backend], account }, partialArgs);
        if (options.host) {
            utils.assertIsStringOrUndefined(options.host);
            args.host = options.host;
        }
        if (options.port) {
            utils.assertIsNumber(options.port);
            const targets = options.targets;
            const port = options.port;
            const hostingRunning = targets && targets.indexOf("hosting") >= 0;
            if (hostingRunning) {
                args.port = port + 1;
            }
            else {
                args.port = port;
            }
        }
        this.emulatorServer = new emulatorServer_1.EmulatorServer(new functionsEmulator_1.FunctionsEmulator(args));
        await this.emulatorServer.start();
    }
    async connect() {
        this.assertServer();
        await this.emulatorServer.connect();
    }
    async stop() {
        this.assertServer();
        await this.emulatorServer.stop();
    }
    getBackend() {
        this.assertServer();
        return this.backend;
    }
    get() {
        this.assertServer();
        return this.emulatorServer.get();
    }
}
exports.FunctionsServer = FunctionsServer;
//# sourceMappingURL=functions.js.map