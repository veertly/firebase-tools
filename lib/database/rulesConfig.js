"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRulesConfig = exports.normalizeRulesConfig = void 0;
const error_1 = require("../error");
const logger_1 = require("../logger");
const utils = require("../utils");
function normalizeRulesConfig(rulesConfig, options) {
    const config = options.config;
    return rulesConfig.map((rc) => {
        return {
            instance: rc.instance,
            rules: config.path(rc.rules),
        };
    });
}
exports.normalizeRulesConfig = normalizeRulesConfig;
function getRulesConfig(projectId, options) {
    const dbConfig = options.config.src.database;
    if (dbConfig === undefined) {
        return [];
    }
    if (!Array.isArray(dbConfig)) {
        if (dbConfig && dbConfig.rules) {
            utils.assertIsStringOrUndefined(options.instance);
            const instance = options.instance || `${options.project}-default-rtdb`;
            return [{ rules: dbConfig.rules, instance }];
        }
        else {
            logger_1.logger.debug("Possibly invalid database config: ", JSON.stringify(dbConfig));
            return [];
        }
    }
    const results = [];
    const rc = options.rc;
    for (const c of dbConfig) {
        if (c.target) {
            rc.requireTarget(projectId, "database", c.target);
            const instances = rc.target(projectId, "database", c.target);
            for (const i of instances) {
                results.push({ instance: i, rules: c.rules });
            }
        }
        else if (c.instance) {
            results.push(c);
        }
        else {
            throw new error_1.FirebaseError('Must supply either "target" or "instance" in database config');
        }
    }
    return results;
}
exports.getRulesConfig = getRulesConfig;
//# sourceMappingURL=rulesConfig.js.map