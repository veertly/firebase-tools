"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logEntries = exports.getApiFilter = void 0;
const logger_1 = require("../logger");
const previews_1 = require("../previews");
function getApiFilter(functionList) {
    const baseFilter = previews_1.previews.functionsv2
        ? 'resource.type="cloud_function" OR ' +
            '(resource.type="cloud_run_revision" AND ' +
            'labels."goog-managed-by"="cloudfunctions")'
        : 'resource.type="cloud_function"';
    if (functionList) {
        const apiFuncFilters = functionList.split(",").map((fn) => {
            return previews_1.previews.functionsv2
                ? `resource.labels.function_name="${fn}" ` + `OR resource.labels.service_name="${fn}"`
                : `resource.labels.function_name="${fn}"`;
        });
        return baseFilter + `\n(${apiFuncFilters.join(" OR ")})`;
    }
    return baseFilter;
}
exports.getApiFilter = getApiFilter;
function logEntries(entries) {
    if (!entries || entries.length === 0) {
        logger_1.logger.info("No log entries found.");
        return;
    }
    for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        const timestamp = entry.timestamp || "---";
        const severity = (entry.severity || "?").substring(0, 1);
        const name = entry.resource.labels.function_name || entry.resource.labels.service_name;
        const message = entry.textPayload ||
            JSON.stringify(entry.jsonPayload) ||
            JSON.stringify(entry.protoPayload) ||
            "";
        logger_1.logger.info(`${timestamp} ${severity} ${name}: ${message}`);
    }
}
exports.logEntries = logEntries;
//# sourceMappingURL=functionslog.js.map