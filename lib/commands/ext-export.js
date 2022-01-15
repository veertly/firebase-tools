"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const checkMinRequiredVersion_1 = require("../checkMinRequiredVersion");
const command_1 = require("../command");
const planner = require("../deploy/extensions/planner");
const export_1 = require("../extensions/export");
const extensionsHelper_1 = require("../extensions/extensionsHelper");
const functional_1 = require("../functional");
const getProjectNumber_1 = require("../getProjectNumber");
const logger_1 = require("../logger");
const projectUtils_1 = require("../projectUtils");
const prompt_1 = require("../prompt");
const requirePermissions_1 = require("../requirePermissions");
module.exports = new command_1.Command("ext:export")
    .description("export all Extension instances installed on a project to a local Firebase directory")
    .before(requirePermissions_1.requirePermissions, ["firebaseextensions.instances.list"])
    .before(extensionsHelper_1.ensureExtensionsApiEnabled)
    .before(checkMinRequiredVersion_1.checkMinRequiredVersion, "extMinVersion")
    .withForce()
    .action(async (options) => {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const projectNumber = await (0, getProjectNumber_1.getProjectNumber)(options);
    const have = await Promise.all((await planner.have(projectId)).map(async (i) => {
        const subbed = await (0, export_1.setSecretParamsToLatest)(i);
        return (0, export_1.parameterizeProject)(projectId, projectNumber, subbed);
    }));
    if (have.length == 0) {
        logger_1.logger.info(`No extension instances installed on ${projectId}, so there is nothing to export.`);
        return;
    }
    const [withRef, withoutRef] = (0, functional_1.partition)(have, (s) => !!s.ref);
    (0, export_1.displayExportInfo)(withRef, withoutRef);
    if (!options.nonInteractive &&
        !options.force &&
        !(await (0, prompt_1.promptOnce)({
            message: "Do you wish to add these Extension instances to firebase.json?",
            type: "confirm",
            default: true,
        }))) {
        logger_1.logger.info("Exiting. No changes made.");
        return;
    }
    await (0, export_1.writeFiles)(withRef, options);
});
//# sourceMappingURL=ext-export.js.map