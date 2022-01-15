"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageEmulator = void 0;
const utils = require("../../utils");
const constants_1 = require("../constants");
const types_1 = require("../types");
const server_1 = require("./server");
const files_1 = require("./files");
const chokidar = require("chokidar");
const emulatorLogger_1 = require("../emulatorLogger");
const fs = require("fs");
const runtime_1 = require("./rules/runtime");
const error_1 = require("../../error");
const downloadableEmulators_1 = require("../downloadableEmulators");
class StorageEmulator {
    constructor(args) {
        this.args = args;
        this._logger = emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.STORAGE);
        const downloadDetails = (0, downloadableEmulators_1.getDownloadDetails)(types_1.Emulators.STORAGE);
        this._rulesRuntime = new runtime_1.StorageRulesRuntime();
        this._storageLayer = new files_1.StorageLayer(args.projectId);
    }
    get storageLayer() {
        return this._storageLayer;
    }
    get rules() {
        return this._rules;
    }
    get logger() {
        return this._logger;
    }
    async start() {
        const { host, port } = this.getInfo();
        await this._rulesRuntime.start(this.args.auto_download);
        this._app = await (0, server_1.createApp)(this.args.projectId, this);
        if (typeof this.args.rules == "string") {
            const rulesFile = this.args.rules;
            this.updateRulesSource(rulesFile);
        }
        else {
            this._rulesetSource = this.args.rules;
        }
        if (!this._rulesetSource || this._rulesetSource.files.length == 0) {
            throw new error_1.FirebaseError("Can not initialize Storage emulator without a rules source / file.");
        }
        else if (this._rulesetSource.files.length > 1) {
            throw new error_1.FirebaseError("Can not initialize Storage emulator with more than one rules source / file.");
        }
        await this.loadRuleset();
        const rulesPath = this._rulesetSource.files[0].name;
        this._rulesWatcher = chokidar.watch(rulesPath, { persistent: true, ignoreInitial: true });
        this._rulesWatcher.on("change", async () => {
            await new Promise((res) => setTimeout(res, 5));
            this._logger.logLabeled("BULLET", "storage", `Change detected, updating rules for Cloud Storage...`);
            this.updateRulesSource(rulesPath);
            await this.loadRuleset();
        });
        const server = this._app.listen(port, host);
        this.destroyServer = utils.createDestroyer(server);
    }
    updateRulesSource(rulesFile) {
        this._rulesetSource = {
            files: [
                {
                    name: rulesFile,
                    content: fs.readFileSync(rulesFile).toString(),
                },
            ],
        };
    }
    async loadRuleset(source) {
        if (source) {
            this._rulesetSource = source;
        }
        if (!this._rulesetSource) {
            const msg = "Attempting to update ruleset without a source.";
            this._logger.log("WARN", msg);
            const error = JSON.stringify({ error: msg });
            return new runtime_1.StorageRulesIssues([error], []);
        }
        const { ruleset, issues } = await this._rulesRuntime.loadRuleset(this._rulesetSource);
        if (!ruleset) {
            issues.all.forEach((issue) => {
                let parsedIssue;
                try {
                    parsedIssue = JSON.parse(issue);
                }
                catch (_a) {
                }
                if (parsedIssue) {
                    this._logger.log("WARN", `${parsedIssue.description_.replace(/\.$/, "")} in ${parsedIssue.sourcePosition_.fileName_}:${parsedIssue.sourcePosition_.line_}`);
                }
                else {
                    this._logger.log("WARN", issue);
                }
            });
            delete this._rules;
        }
        else {
            this._rules = ruleset;
        }
        return issues;
    }
    async connect() {
    }
    async stop() {
        await this.storageLayer.deleteAll();
        return this.destroyServer ? this.destroyServer() : Promise.resolve();
    }
    getInfo() {
        const host = this.args.host || constants_1.Constants.getDefaultHost(types_1.Emulators.STORAGE);
        const port = this.args.port || constants_1.Constants.getDefaultPort(types_1.Emulators.STORAGE);
        return {
            name: this.getName(),
            host,
            port,
        };
    }
    getName() {
        return types_1.Emulators.STORAGE;
    }
    getApp() {
        return this._app;
    }
}
exports.StorageEmulator = StorageEmulator;
//# sourceMappingURL=index.js.map