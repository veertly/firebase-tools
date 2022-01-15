"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const checkMinRequiredVersion_1 = require("../checkMinRequiredVersion");
const command_1 = require("../command");
const projectUtils_1 = require("../projectUtils");
const listExtensions_1 = require("../extensions/listExtensions");
const extensionsHelper_1 = require("../extensions/extensionsHelper");
const requirePermissions_1 = require("../requirePermissions");
module.exports = new command_1.Command("ext:list")
    .description("list all the extensions that are installed in your Firebase project")
    .before(requirePermissions_1.requirePermissions, ["firebaseextensions.instances.list"])
    .before(extensionsHelper_1.ensureExtensionsApiEnabled)
    .before(checkMinRequiredVersion_1.checkMinRequiredVersion, "extMinVersion")
    .action((options) => {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    return (0, listExtensions_1.listExtensions)(projectId);
});
//# sourceMappingURL=ext-list.js.map