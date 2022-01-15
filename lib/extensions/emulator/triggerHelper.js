"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.functionResourceToEmulatedTriggerDefintion = void 0;
const _ = require("lodash");
const functionsEmulatorShared_1 = require("../../emulator/functionsEmulatorShared");
const emulatorLogger_1 = require("../../emulator/emulatorLogger");
const types_1 = require("../../emulator/types");
function functionResourceToEmulatedTriggerDefintion(resource) {
    const etd = {
        name: resource.name,
        entryPoint: resource.name,
        platform: "gcfv1",
    };
    const properties = _.get(resource, "properties", {});
    if (properties.timeout) {
        etd.timeout = properties.timeout;
    }
    if (properties.location) {
        etd.regions = [properties.location];
    }
    if (properties.availableMemoryMb) {
        etd.availableMemoryMb = properties.availableMemoryMb;
    }
    if (properties.httpsTrigger) {
        etd.httpsTrigger = properties.httpsTrigger;
    }
    else if (properties.eventTrigger) {
        properties.eventTrigger.service = (0, functionsEmulatorShared_1.getServiceFromEventType)(properties.eventTrigger.eventType);
        etd.eventTrigger = properties.eventTrigger;
    }
    else {
        emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.FUNCTIONS).log("WARN", `Function '${resource.name} is missing a trigger in extension.yaml. Please add one, as triggers defined in code are ignored.`);
    }
    return etd;
}
exports.functionResourceToEmulatedTriggerDefintion = functionResourceToEmulatedTriggerDefintion;
//# sourceMappingURL=triggerHelper.js.map