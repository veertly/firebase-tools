"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateProjectId = exports.Command = void 0;
const cli_color_1 = require("cli-color");
const lodash_1 = require("lodash");
const error_1 = require("./error");
const utils_1 = require("./utils");
const rc_1 = require("./rc");
const config_1 = require("./config");
const configstore_1 = require("./configstore");
const detectProjectRoot_1 = require("./detectProjectRoot");
const track = require("./track");
const clc = require("cli-color");
const auth_1 = require("./auth");
const projects_1 = require("./management/projects");
const requireAuth_1 = require("./requireAuth");
class Command {
    constructor(cmd) {
        this.cmd = cmd;
        this.name = "";
        this.descriptionText = "";
        this.options = [];
        this.actionFn = () => {
        };
        this.befores = [];
        this.helpText = "";
        this.positionalArgs = [];
        this.name = (0, lodash_1.first)(cmd.split(" ")) || "";
    }
    description(t) {
        this.descriptionText = t;
        return this;
    }
    option(...args) {
        this.options.push(args);
        return this;
    }
    withForce(message) {
        this.options.push(["-f, --force", message || "automatically accept all interactive prompts"]);
        return this;
    }
    before(fn, ...args) {
        this.befores.push({ fn: fn, args: args });
        return this;
    }
    help(t) {
        this.helpText = t;
        return this;
    }
    action(fn) {
        this.actionFn = fn;
        return this;
    }
    register(client) {
        this.client = client;
        const program = client.cli;
        const cmd = program.command(this.cmd);
        if (this.descriptionText) {
            cmd.description(this.descriptionText);
        }
        this.options.forEach((args) => {
            const flags = args.shift();
            cmd.option(flags, ...args);
        });
        if (this.helpText) {
            cmd.on("--help", () => {
                console.log(this.helpText);
            });
        }
        this.positionalArgs = cmd._args;
        cmd.action((...args) => {
            const runner = this.runner();
            const start = new Date().getTime();
            const options = (0, lodash_1.last)(args);
            if (args.length - 1 > cmd._args.length) {
                client.errorOut(new error_1.FirebaseError(`Too many arguments. Run ${(0, cli_color_1.bold)("firebase help " + this.name)} for usage instructions`, { exit: 1 }));
                return;
            }
            runner(...args)
                .then((result) => {
                if ((0, utils_1.getInheritedOption)(options, "json")) {
                    console.log(JSON.stringify({
                        status: "success",
                        result: result,
                    }, null, 2));
                }
                const duration = new Date().getTime() - start;
                track(this.name, "success", duration).then(() => process.exit());
            })
                .catch(async (err) => {
                if ((0, utils_1.getInheritedOption)(options, "json")) {
                    console.log(JSON.stringify({
                        status: "error",
                        error: err.message,
                    }, null, 2));
                }
                const duration = Date.now() - start;
                const errorEvent = err.exit === 1 ? "Error (User)" : "Error (Unexpected)";
                await Promise.all([track(this.name, "error", duration), track(errorEvent, "", duration)]);
                client.errorOut(err);
            });
        });
    }
    async prepare(options) {
        options = options || {};
        options.project = (0, utils_1.getInheritedOption)(options, "project");
        if (!process.stdin.isTTY || (0, utils_1.getInheritedOption)(options, "nonInteractive")) {
            options.nonInteractive = true;
        }
        if ((0, utils_1.getInheritedOption)(options, "interactive")) {
            options.interactive = true;
            options.nonInteractive = false;
        }
        if ((0, utils_1.getInheritedOption)(options, "debug")) {
            options.debug = true;
        }
        if ((0, utils_1.getInheritedOption)(options, "json")) {
            options.nonInteractive = true;
        }
        else {
            (0, utils_1.setupLoggers)();
        }
        if ((0, utils_1.getInheritedOption)(options, "config")) {
            options.configPath = (0, utils_1.getInheritedOption)(options, "config");
        }
        try {
            options.config = config_1.Config.load(options);
        }
        catch (e) {
            options.configError = e;
        }
        const account = (0, utils_1.getInheritedOption)(options, "account");
        options.account = account;
        options.projectRoot = (0, detectProjectRoot_1.detectProjectRoot)(options);
        const projectRoot = options.projectRoot;
        const activeAccount = (0, auth_1.selectAccount)(account, projectRoot);
        if (activeAccount) {
            (0, auth_1.setActiveAccount)(options, activeAccount);
        }
        this.applyRC(options);
        if (options.project) {
            await this.resolveProjectIdentifiers(options);
            validateProjectId(options.projectId);
        }
    }
    applyRC(options) {
        const rc = (0, rc_1.loadRC)(options);
        options.rc = rc;
        options.project =
            options.project || (configstore_1.configstore.get("activeProjects") || {})[options.projectRoot];
        if (options.config && !options.project) {
            options.project = options.config.defaults.project;
        }
        const aliases = rc.projects;
        const rcProject = (0, lodash_1.get)(aliases, options.project);
        if (rcProject) {
            options.projectAlias = options.project;
            options.project = rcProject;
        }
        else if (!options.project && (0, lodash_1.size)(aliases) === 1) {
            options.projectAlias = (0, lodash_1.head)((0, lodash_1.keys)(aliases));
            options.project = (0, lodash_1.head)((0, lodash_1.values)(aliases));
        }
    }
    async resolveProjectIdentifiers(options) {
        var _a;
        if ((_a = options.project) === null || _a === void 0 ? void 0 : _a.match(/^\d+$/)) {
            await (0, requireAuth_1.requireAuth)(options);
            const { projectId, projectNumber } = await (0, projects_1.getFirebaseProject)(options.project);
            options.projectId = projectId;
            options.projectNumber = projectNumber;
        }
        else {
            options.projectId = options.project;
        }
    }
    runner() {
        return async (...args) => {
            if (typeof (0, lodash_1.last)(args) !== "object" || (0, lodash_1.last)(args) === null) {
                args.push({});
            }
            while (args.length < this.positionalArgs.length + 1) {
                args.splice(args.length - 1, 0, "");
            }
            const options = (0, lodash_1.last)(args);
            await this.prepare(options);
            for (const before of this.befores) {
                await before.fn(options, ...before.args);
            }
            return this.actionFn(...args);
        };
    }
}
exports.Command = Command;
const PROJECT_ID_REGEX = /^(?:[^:]+:)?[a-z0-9-]+$/;
function validateProjectId(project) {
    if (PROJECT_ID_REGEX.test(project)) {
        return;
    }
    track("Project ID Check", "invalid");
    const invalidMessage = "Invalid project id: " + clc.bold(project) + ".";
    if (project.toLowerCase() !== project) {
        throw new error_1.FirebaseError(invalidMessage + "\nNote: Project id must be all lowercase.");
    }
    else {
        throw new error_1.FirebaseError(invalidMessage);
    }
}
exports.validateProjectId = validateProjectId;
//# sourceMappingURL=command.js.map