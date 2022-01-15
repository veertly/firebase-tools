"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deploy = void 0;
const tmp_1 = require("tmp");
const clc = require("cli-color");
const fs = require("fs");
const checkIam_1 = require("./checkIam");
const utils_1 = require("../../utils");
const gcs = require("../../gcp/storage");
const gcf = require("../../gcp/cloudfunctions");
const gcfv2 = require("../../gcp/cloudfunctionsv2");
const utils = require("../../utils");
const backend = require("./backend");
(0, tmp_1.setGracefulCleanup)();
async function uploadSourceV1(context, region) {
    const uploadUrl = await gcf.generateUploadUrl(context.projectId, region);
    context.sourceUrl = uploadUrl;
    const uploadOpts = {
        file: context.functionsSourceV1,
        stream: fs.createReadStream(context.functionsSourceV1),
    };
    await gcs.upload(uploadOpts, uploadUrl, {
        "x-goog-content-length-range": "0,104857600",
    });
}
async function uploadSourceV2(context, region) {
    const res = await gcfv2.generateUploadUrl(context.projectId, region);
    const uploadOpts = {
        file: context.functionsSourceV2,
        stream: fs.createReadStream(context.functionsSourceV2),
    };
    await gcs.upload(uploadOpts, res.uploadUrl);
    context.storage = Object.assign(Object.assign({}, context.storage), { [region]: res.storageSource });
}
async function deploy(context, options, payload) {
    if (!options.config.src.functions) {
        return;
    }
    if (!context.functionsSourceV1 && !context.functionsSourceV2) {
        return;
    }
    await (0, checkIam_1.checkHttpIam)(context, options, payload);
    try {
        const want = payload.functions.backend;
        const uploads = [];
        const v1Endpoints = backend.allEndpoints(want).filter((e) => e.platform === "gcfv1");
        if (v1Endpoints.length > 0) {
            uploads.push(uploadSourceV1(context, v1Endpoints[0].region));
        }
        for (const region of Object.keys(want.endpoints)) {
            if (backend.regionalEndpoints(want, region).some((e) => e.platform === "gcfv2")) {
                uploads.push(uploadSourceV2(context, region));
            }
        }
        await Promise.all(uploads);
        utils.assertDefined(options.config.src.functions.source, "Error: 'functions.source' is not defined");
        if (uploads.length) {
            (0, utils_1.logSuccess)(clc.green.bold("functions:") +
                " " +
                clc.bold(options.config.src.functions.source) +
                " folder uploaded successfully");
        }
    }
    catch (err) {
        (0, utils_1.logWarning)(clc.yellow("functions:") + " Upload Error: " + err.message);
        throw err;
    }
}
exports.deploy = deploy;
//# sourceMappingURL=deploy.js.map