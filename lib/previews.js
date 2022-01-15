"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.previews = void 0;
const lodash_1 = require("lodash");
const configstore_1 = require("./configstore");
exports.previews = Object.assign({ rtdbrules: false, ext: false, extdev: false, rtdbmanagement: false, functionsv2: false, golang: false, deletegcfartifacts: false, dotenv: false, artifactregistry: false }, configstore_1.configstore.get("previews"));
if (process.env.FIREBASE_CLI_PREVIEWS) {
    process.env.FIREBASE_CLI_PREVIEWS.split(",").forEach((feature) => {
        if ((0, lodash_1.has)(exports.previews, feature)) {
            (0, lodash_1.set)(exports.previews, feature, true);
        }
    });
}
//# sourceMappingURL=previews.js.map