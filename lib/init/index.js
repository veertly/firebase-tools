"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.init = void 0;
const _ = require("lodash");
const clc = require("cli-color");
const logger_1 = require("../logger");
const _features = require("./features");
const utils = require("../utils");
const features = _features;
async function init(setup, config, options) {
    const nextFeature = setup.features ? setup.features.shift() : undefined;
    if (nextFeature) {
        if (!features[nextFeature]) {
            return utils.reject(clc.bold(nextFeature) +
                " is not a valid feature. Must be one of " +
                _.without(_.keys(features), "project").join(", "));
        }
        logger_1.logger.info(clc.bold("\n" + clc.white("=== ") + _.capitalize(nextFeature) + " Setup"));
        await Promise.resolve(features[nextFeature](setup, config, options));
        return init(setup, config, options);
    }
}
exports.init = init;
//# sourceMappingURL=index.js.map