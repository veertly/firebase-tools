"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const command_1 = require("../command");
const controller = require("../emulator/controller");
const commandUtils = require("../emulator/commandUtils");
module.exports = new command_1.Command("emulators:export <path>")
    .description("export data from running emulators")
    .withForce("overwrite any export data in the target directory")
    .option(commandUtils.FLAG_ONLY, commandUtils.DESC_ONLY)
    .action(controller.exportEmulatorData);
//# sourceMappingURL=emulators-export.js.map