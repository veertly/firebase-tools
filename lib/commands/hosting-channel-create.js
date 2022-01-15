"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cli_color_1 = require("cli-color");
const api_1 = require("../hosting/api");
const command_1 = require("../command");
const expireUtils_1 = require("../hosting/expireUtils");
const error_1 = require("../error");
const utils_1 = require("../utils");
const prompt_1 = require("../prompt");
const requirePermissions_1 = require("../requirePermissions");
const projectUtils_1 = require("../projectUtils");
const logger_1 = require("../logger");
const requireConfig = require("../requireConfig");
const marked = require("marked");
const requireHostingSite_1 = require("../requireHostingSite");
const LOG_TAG = "hosting:channel";
exports.default = new command_1.Command("hosting:channel:create [channelId]")
    .description("create a Firebase Hosting channel")
    .option("-e, --expires <duration>", "duration string (e.g. 12h or 30d) for channel expiration, max 30d")
    .option("--site <siteId>", "site for which to create the channel")
    .before(requireConfig)
    .before(requirePermissions_1.requirePermissions, ["firebasehosting.sites.update"])
    .before(requireHostingSite_1.requireHostingSite)
    .action(async (channelId, options) => {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const site = options.site;
    let expireTTL = expireUtils_1.DEFAULT_DURATION;
    if (options.expires) {
        expireTTL = (0, expireUtils_1.calculateChannelExpireTTL)(options.expires);
    }
    if (channelId) {
        options.channelId = channelId;
    }
    channelId =
        channelId ||
            (await (0, prompt_1.promptOnce)({
                type: "input",
                message: "Please provide a URL-friendly name for the channel:",
                validate: (s) => s.length > 0,
            }));
    channelId = (0, api_1.normalizeName)(channelId);
    let channel;
    try {
        channel = await (0, api_1.createChannel)(projectId, site, channelId, expireTTL);
    }
    catch (e) {
        if (e.status === 409) {
            throw new error_1.FirebaseError(`Channel ${(0, cli_color_1.bold)(channelId)} already exists on site ${(0, cli_color_1.bold)(site)}. Deploy to ${(0, cli_color_1.bold)(channelId)} with: ${(0, cli_color_1.yellow)(`firebase hosting:channel:deploy ${channelId}`)}`, { original: e });
        }
        throw e;
    }
    try {
        await (0, api_1.addAuthDomains)(projectId, [channel.url]);
    }
    catch (e) {
        (0, utils_1.logLabeledWarning)(LOG_TAG, marked(`Unable to add channel domain to Firebase Auth. Visit the Firebase Console at ${(0, utils_1.consoleUrl)(projectId, "/authentication/providers")}`));
        logger_1.logger.debug("[hosting] unable to add auth domain", e);
    }
    logger_1.logger.info();
    (0, utils_1.logLabeledSuccess)(LOG_TAG, `Channel ${(0, cli_color_1.bold)(channelId)} has been created on site ${(0, cli_color_1.bold)(site)}.`);
    (0, utils_1.logLabeledSuccess)(LOG_TAG, `Channel ${(0, cli_color_1.bold)(channelId)} will expire at ${(0, cli_color_1.bold)((0, utils_1.datetimeString)(new Date(channel.expireTime)))}.`);
    (0, utils_1.logLabeledSuccess)(LOG_TAG, `Channel URL: ${channel.url}`);
    logger_1.logger.info();
    logger_1.logger.info(`To deploy to this channel, use ${(0, cli_color_1.yellow)(`firebase hosting:channel:deploy ${channelId}`)}.`);
    return channel;
});
//# sourceMappingURL=hosting-channel-create.js.map