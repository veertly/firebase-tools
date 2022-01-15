"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = void 0;
const cors = require("cors");
const express = require("express");
const emulatorLogger_1 = require("../emulatorLogger");
const types_1 = require("../types");
const bodyParser = require("body-parser");
const gcloud_1 = require("./apis/gcloud");
const firebase_1 = require("./apis/firebase");
function createApp(defaultProjectId, emulator) {
    const { storageLayer } = emulator;
    const app = express();
    emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.STORAGE).log("DEBUG", `Temp file directory for storage emulator: ${storageLayer.dirPath}`);
    app.use(cors({
        origin: true,
        exposedHeaders: [
            "content-type",
            "x-firebase-storage-version",
            "x-goog-upload-url",
            "x-goog-upload-status",
            "x-goog-upload-command",
            "x-gupload-uploadid",
            "x-goog-upload-header-content-length",
            "x-goog-upload-header-content-type",
            "x-goog-upload-protocol",
            "x-goog-upload-status",
            "x-goog-upload-chunk-granularity",
            "x-goog-upload-control-url",
        ],
    }));
    app.use(bodyParser.raw({ limit: "130mb", type: "application/x-www-form-urlencoded" }));
    app.use(bodyParser.raw({ limit: "130mb", type: "multipart/related" }));
    app.use(express.json({
        type: ["application/json"],
    }));
    app.post("/internal/export", async (req, res) => {
        const path = req.body.path;
        if (!path) {
            res.status(400).send("Export request body must include 'path'.");
            return;
        }
        await storageLayer.export(path);
        res.sendStatus(200);
    });
    app.put("/internal/setRules", async (req, res) => {
        const rules = req.body.rules;
        if (!(rules && Array.isArray(rules.files) && rules.files.length > 0)) {
            res.status(400).send("Request body must include 'rules.files' array .");
            return;
        }
        const file = rules.files[0];
        if (!(file.name && file.content)) {
            res
                .status(400)
                .send("Request body must include 'rules.files' array where each member contains 'name' and 'content'.");
            return;
        }
        const name = file.name;
        const content = file.content;
        const issues = await emulator.loadRuleset({ files: [{ name, content }] });
        if (issues.errors.length > 0) {
            res.status(400).json({
                message: "There was an error updating rules, see logs for more details",
            });
            return;
        }
        res.status(200).json({
            message: "Rules updated successfully",
        });
    });
    app.post("/internal/reset", (req, res) => {
        storageLayer.reset();
        res.sendStatus(200);
    });
    app.use("/v0", (0, firebase_1.createFirebaseEndpoints)(emulator));
    app.use("/", (0, gcloud_1.createCloudEndpoints)(emulator));
    return Promise.resolve(app);
}
exports.createApp = createApp;
//# sourceMappingURL=server.js.map