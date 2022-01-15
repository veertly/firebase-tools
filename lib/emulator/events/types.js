"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventUtils = void 0;
const _ = require("lodash");
class EventUtils {
    static isEvent(proto) {
        return _.has(proto, "context") && _.has(proto, "data");
    }
    static isLegacyEvent(proto) {
        return _.has(proto, "data") && _.has(proto, "resource");
    }
    static isBinaryCloudEvent(req) {
        return !!(req.header("ce-type") &&
            req.header("ce-specversion") &&
            req.header("ce-source") &&
            req.header("ce-id"));
    }
    static extractBinaryCloudEventContext(req) {
        const context = {};
        for (const name of Object.keys(req.headers)) {
            if (name.startsWith("ce-")) {
                const attributeName = name.substr("ce-".length);
                context[attributeName] = req.header(name);
            }
        }
        return context;
    }
}
exports.EventUtils = EventUtils;
//# sourceMappingURL=types.js.map