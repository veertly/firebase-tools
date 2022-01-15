"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cli_color_1 = require("cli-color");
const marked_1 = require("marked");
const command_1 = require("../command");
const utils_1 = require("../utils");
const api_1 = require("../hosting/api");
const prompt_1 = require("../prompt");
const requireHostingSite_1 = require("../requireHostingSite");
const requirePermissions_1 = require("../requirePermissions");
const projectUtils_1 = require("../projectUtils");
const requireConfig = require("../requireConfig");
const logger_1 = require("../logger");
exports.default = new command_1.Command("hosting:channel:delete <channelId>")
    .description("delete a Firebase Hosting channel")
    .withForce()
    .option("--site <siteId>", "site in which the channel exists")
    .before(requireConfig)
    .before(requirePermissions_1.requirePermissions, ["firebasehosting.sites.update"])
    .before(requireHostingSite_1.requireHostingSite)
    .action(async (channelId, options) => {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const siteId = options.site;
    channelId = (0, api_1.normalizeName)(channelId);
    const channel = await (0, api_1.getChannel)(projectId, siteId, channelId);
    const confirmed = await (0, prompt_1.promptOnce)({
        name: "force",
        type: "confirm",
        message: `Are you sure you want to delete the Hosting Channel ${(0, cli_color_1.underline)(channelId)} for site ${(0, cli_color_1.underline)(siteId)}?`,
        default: false,
    }, options);
    if (!confirmed) {
        return;
    }
    await (0, api_1.deleteChannel)(projectId, siteId, channelId);
    if (channel) {
        try {
            await (0, api_1.removeAuthDomain)(projectId, channel.url);
        }
        catch (e) {
            (0, utils_1.logLabeledWarning)("hosting:channel", (0, marked_1.default)(`Unable to remove channel domain from Firebase Auth. Visit the Firebase Console at ${(0, utils_1.consoleUrl)(projectId, "/authentication/providers")}`));
            logger_1.logger.debug("[hosting] unable to remove auth domain", e);
        }
    }
    (0, utils_1.logLabeledSuccess)("hosting:channels", `Successfully deleted channel ${(0, cli_color_1.bold)(channelId)} for site ${(0, cli_color_1.bold)(siteId)}.`);
});
//# sourceMappingURL=hosting-channel-delete.js.map