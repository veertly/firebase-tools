"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePreviewToggles = void 0;
const lodash_1 = require("lodash");
const cli_color_1 = require("cli-color");
const configstore_1 = require("./configstore");
const previews_1 = require("./previews");
function _errorOut(name) {
    console.log(cli_color_1.bold.red("Error:"), "Did not recognize preview feature", (0, cli_color_1.bold)(name));
    process.exit(1);
}
function handlePreviewToggles(args) {
    const isValidPreview = (0, lodash_1.has)(previews_1.previews, args[1]);
    if (args[0] === "--open-sesame") {
        if (isValidPreview) {
            console.log("Enabling preview feature", (0, cli_color_1.bold)(args[1]) + "...");
            previews_1.previews[args[1]] = true;
            configstore_1.configstore.set("previews", previews_1.previews);
            console.log("Preview feature enabled!");
            return process.exit(0);
        }
        _errorOut();
    }
    else if (args[0] === "--close-sesame") {
        if (isValidPreview) {
            console.log("Disabling preview feature", (0, cli_color_1.bold)(args[1]));
            (0, lodash_1.unset)(previews_1.previews, args[1]);
            configstore_1.configstore.set("previews", previews_1.previews);
            return process.exit(0);
        }
        _errorOut();
    }
}
exports.handlePreviewToggles = handlePreviewToggles;
//# sourceMappingURL=handlePreviewToggles.js.map