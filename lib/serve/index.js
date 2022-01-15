"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serve = void 0;
const _ = require("lodash");
const logger_1 = require("../logger");
const { FunctionsServer } = require("./functions");
const TARGETS = {
    hosting: require("./hosting"),
    functions: new FunctionsServer(),
};
async function serve(options) {
    const targetNames = options.targets;
    options.port = parseInt(options.port, 10);
    await Promise.all(_.map(targetNames, (targetName) => {
        return TARGETS[targetName].start(options);
    }));
    await Promise.all(_.map(targetNames, (targetName) => {
        return TARGETS[targetName].connect();
    }));
    await new Promise((resolve) => {
        process.on("SIGINT", () => {
            logger_1.logger.info("Shutting down...");
            return Promise.all(_.map(targetNames, (targetName) => {
                return TARGETS[targetName].stop(options);
            }))
                .then(resolve)
                .catch(resolve);
        });
    });
}
exports.serve = serve;
//# sourceMappingURL=index.js.map