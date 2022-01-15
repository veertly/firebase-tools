"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const clc = require("cli-color");
const logger_1 = require("../../../logger");
const prompt_1 = require("../../../prompt");
const requirePermissions_1 = require("../../../requirePermissions");
const previews_1 = require("../../../previews");
const ensureApiEnabled_1 = require("../../../ensureApiEnabled");
module.exports = async function (setup, config, options) {
    var _a, _b;
    logger_1.logger.info();
    logger_1.logger.info("A " + clc.bold("functions") + " directory will be created in your project with sample code");
    logger_1.logger.info("pre-configured. Functions can be deployed with " + clc.bold("firebase deploy") + ".");
    logger_1.logger.info();
    setup.functions = {};
    const projectId = (_b = (_a = setup === null || setup === void 0 ? void 0 : setup.rcfile) === null || _a === void 0 ? void 0 : _a.projects) === null || _b === void 0 ? void 0 : _b.default;
    if (projectId) {
        await (0, requirePermissions_1.requirePermissions)(Object.assign(Object.assign({}, options), { project: projectId }));
        await Promise.all([
            (0, ensureApiEnabled_1.ensure)(projectId, "cloudfunctions.googleapis.com", "unused", true),
            (0, ensureApiEnabled_1.ensure)(projectId, "runtimeconfig.googleapis.com", "unused", true),
        ]);
    }
    const choices = [
        {
            name: "JavaScript",
            value: "javascript",
        },
        {
            name: "TypeScript",
            value: "typescript",
        },
    ];
    if (previews_1.previews.golang) {
        choices.push({
            name: "Go",
            value: "golang",
        });
    }
    const language = await (0, prompt_1.promptOnce)({
        type: "list",
        message: "What language would you like to use to write Cloud Functions?",
        default: "javascript",
        choices,
    });
    return require("./" + language)(setup, config);
};
//# sourceMappingURL=index.js.map