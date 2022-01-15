"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadEmulator = void 0;
const crypto = require("crypto");
const fs = require("fs-extra");
const path = require("path");
const tmp = require("tmp");
const unzipper = require("unzipper");
const emulatorLogger_1 = require("./emulatorLogger");
const error_1 = require("../error");
const downloadableEmulators = require("./downloadableEmulators");
const downloadUtils = require("../downloadUtils");
tmp.setGracefulCleanup();
async function downloadEmulator(name) {
    const emulator = downloadableEmulators.getDownloadDetails(name);
    emulatorLogger_1.EmulatorLogger.forEmulator(name).logLabeled("BULLET", name, `downloading ${path.basename(emulator.downloadPath)}...`);
    fs.ensureDirSync(emulator.opts.cacheDir);
    const tmpfile = await downloadUtils.downloadToTmp(emulator.opts.remoteUrl);
    if (!emulator.opts.skipChecksumAndSize) {
        await validateSize(tmpfile, emulator.opts.expectedSize);
        await validateChecksum(tmpfile, emulator.opts.expectedChecksum);
    }
    if (emulator.opts.skipCache) {
        removeOldFiles(name, emulator, true);
    }
    fs.copySync(tmpfile, emulator.downloadPath);
    if (emulator.unzipDir) {
        await unzip(emulator.downloadPath, emulator.unzipDir);
    }
    const executablePath = emulator.binaryPath || emulator.downloadPath;
    fs.chmodSync(executablePath, 0o755);
    removeOldFiles(name, emulator);
}
exports.downloadEmulator = downloadEmulator;
function unzip(zipPath, unzipDir) {
    return new Promise((resolve, reject) => {
        fs.createReadStream(zipPath)
            .pipe(unzipper.Extract({ path: unzipDir }))
            .on("error", reject)
            .on("finish", resolve);
    });
}
function removeOldFiles(name, emulator, removeAllVersions = false) {
    const currentLocalPath = emulator.downloadPath;
    const currentUnzipPath = emulator.unzipDir;
    const files = fs.readdirSync(emulator.opts.cacheDir);
    for (const file of files) {
        const fullFilePath = path.join(emulator.opts.cacheDir, file);
        if (file.indexOf(emulator.opts.namePrefix) < 0) {
            continue;
        }
        if ((fullFilePath !== currentLocalPath && fullFilePath !== currentUnzipPath) ||
            removeAllVersions) {
            emulatorLogger_1.EmulatorLogger.forEmulator(name).logLabeled("BULLET", name, `Removing outdated emulator files: ${file}`);
            fs.removeSync(fullFilePath);
        }
    }
}
function validateSize(filepath, expectedSize) {
    return new Promise((resolve, reject) => {
        const stat = fs.statSync(filepath);
        return stat.size === expectedSize
            ? resolve()
            : reject(new error_1.FirebaseError(`download failed, expected ${expectedSize} bytes but got ${stat.size}`, { exit: 1 }));
    });
}
function validateChecksum(filepath, expectedChecksum) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("md5");
        const stream = fs.createReadStream(filepath);
        stream.on("data", (data) => hash.update(data));
        stream.on("end", () => {
            const checksum = hash.digest("hex");
            return checksum === expectedChecksum
                ? resolve()
                : reject(new error_1.FirebaseError(`download failed, expected checksum ${expectedChecksum} but got ${checksum}`, { exit: 1 }));
        });
    });
}
//# sourceMappingURL=download.js.map