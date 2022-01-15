"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const command_1 = require("../command");
const error_1 = require("../error");
const projectUtils_1 = require("../projectUtils");
const requirePermissions_1 = require("../requirePermissions");
const backend = require("../deploy/functions/backend");
const previews_1 = require("../previews");
const logger_1 = require("../logger");
const Table = require("cli-table");
exports.default = new command_1.Command("functions:list")
    .description("list all deployed functions in your Firebase project")
    .before(requirePermissions_1.requirePermissions, ["cloudfunctions.functions.list"])
    .action(async (options) => {
    try {
        const context = {
            projectId: (0, projectUtils_1.needProjectId)(options),
        };
        const existing = await backend.existingBackend(context);
        const endpointsList = backend.allEndpoints(existing).sort(backend.compareFunctions);
        const table = previews_1.previews.functionsv2
            ? new Table({
                head: ["Function", "Version", "Trigger", "Location", "Memory", "Runtime"],
                style: { head: ["yellow"] },
            })
            : new Table({
                head: ["Function", "Trigger", "Location", "Memory", "Runtime"],
                style: { head: ["yellow"] },
            });
        for (const endpoint of endpointsList) {
            const trigger = backend.endpointTriggerType(endpoint);
            const availableMemoryMb = endpoint.availableMemoryMb || "---";
            const entry = previews_1.previews.functionsv2
                ? [
                    endpoint.id,
                    endpoint.platform === "gcfv2" ? "v2" : "v1",
                    trigger,
                    endpoint.region,
                    availableMemoryMb,
                    endpoint.runtime,
                ]
                : [endpoint.id, trigger, endpoint.region, availableMemoryMb, endpoint.runtime];
            table.push(entry);
        }
        logger_1.logger.info(table.toString());
        return endpointsList;
    }
    catch (err) {
        throw new error_1.FirebaseError("Failed to list functions", {
            exit: 1,
            original: err,
        });
    }
});
//# sourceMappingURL=functions-list.js.map