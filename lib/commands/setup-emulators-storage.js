"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const command_1 = require("../command");
const download_1 = require("../emulator/download");
const EMULATOR_NAME = "storage";
module.exports = new command_1.Command(`setup:emulators:${EMULATOR_NAME}`)
    .description(`downloads the ${EMULATOR_NAME} emulator`)
    .action(() => {
    return (0, download_1.downloadEmulator)(EMULATOR_NAME);
});
//# sourceMappingURL=setup-emulators-storage.js.map