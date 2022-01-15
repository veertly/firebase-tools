"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deploy = void 0;
const uploader_1 = require("./uploader");
const detectProjectRoot_1 = require("../../detectProjectRoot");
const listFiles_1 = require("../../listFiles");
const logger_1 = require("../../logger");
const track = require("../../track");
const utils_1 = require("../../utils");
const clc = require("cli-color");
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const _ERASE_LINE = "\x1b[2K";
async function deploy(context, options) {
    var _a, _b;
    if (!((_a = context.hosting) === null || _a === void 0 ? void 0 : _a.deploys)) {
        return;
    }
    let spins = 0;
    function updateSpinner(newMessage, debugging) {
        if (debugging) {
            (0, utils_1.logLabeledBullet)("hosting", newMessage);
        }
        else {
            process.stdout.write(_ERASE_LINE + clc.move(-9999, 0));
            process.stdout.write(clc.bold.cyan(SPINNER[spins % SPINNER.length] + "  hosting: ") + newMessage);
        }
        spins++;
    }
    async function runDeploys(deploys, debugging) {
        var _a;
        const deploy = deploys.shift();
        if (!deploy) {
            return;
        }
        if (!((_a = deploy.config) === null || _a === void 0 ? void 0 : _a.public)) {
            (0, utils_1.logLabeledBullet)(`hosting[${deploy.site}]`, 'no "public" directory to upload, continuing with release');
            return runDeploys(deploys, debugging);
        }
        (0, utils_1.logLabeledBullet)("hosting[" + deploy.site + "]", "beginning deploy...");
        const t0 = Date.now();
        const publicDir = options.config.path(deploy.config.public);
        const files = (0, listFiles_1.listFiles)(publicDir, deploy.config.ignore);
        (0, utils_1.logLabeledBullet)(`hosting[${deploy.site}]`, `found ${files.length} files in ${clc.bold(deploy.config.public)}`);
        const uploader = new uploader_1.Uploader({
            version: deploy.version,
            files: files,
            public: publicDir,
            cwd: options.cwd,
            projectRoot: (0, detectProjectRoot_1.detectProjectRoot)(options),
        });
        const progressInterval = setInterval(() => updateSpinner(uploader.statusMessage(), debugging), debugging ? 2000 : 200);
        try {
            await uploader.start();
        }
        catch (err) {
            track("Hosting Deploy", "failure");
            throw err;
        }
        finally {
            clearInterval(progressInterval);
        }
        if (!debugging) {
            process.stdout.write(_ERASE_LINE + clc.move(-9999, 0));
        }
        (0, utils_1.logLabeledSuccess)("hosting[" + deploy.site + "]", "file upload complete");
        const dt = Date.now() - t0;
        logger_1.logger.debug("[hosting] deploy completed after " + dt + "ms");
        track("Hosting Deploy", "success", dt);
        return runDeploys(deploys, debugging);
    }
    const debugging = !!(options.debug || options.nonInteractive);
    const deploys = [...(((_b = context.hosting) === null || _b === void 0 ? void 0 : _b.deploys) || [])];
    return runDeploys(deploys, debugging);
}
exports.deploy = deploy;
//# sourceMappingURL=deploy.js.map