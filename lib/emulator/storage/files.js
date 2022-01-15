"use strict";
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Persistence = exports.StorageLayer = exports.UploadStatus = exports.ResumableUpload = exports.StoredFile = void 0;
const fs_1 = require("fs");
const os_1 = require("os");
const uuid_1 = require("uuid");
const list_1 = require("./list");
const metadata_1 = require("./metadata");
const path = require("path");
const fs = require("fs");
const fse = require("fs-extra");
const rimraf = require("rimraf");
const cloudFunctions_1 = require("./cloudFunctions");
const logger_1 = require("../../logger");
class StoredFile {
    constructor(metadata, path) {
        this.metadata = metadata;
        this._path = path;
    }
    get metadata() {
        return this._metadata;
    }
    set metadata(value) {
        this._metadata = value;
    }
    get path() {
        return this._path;
    }
    set path(value) {
        this._path = value;
    }
}
exports.StoredFile = StoredFile;
class ResumableUpload {
    constructor(bucketId, objectId, uploadId, contentType, metadata) {
        this._currentBytesUploaded = 0;
        this._status = UploadStatus.ACTIVE;
        this._bucketId = bucketId;
        this._objectId = objectId;
        this._uploadId = uploadId;
        this._contentType = contentType;
        this._metadata = metadata;
        this._fileLocation = encodeURIComponent(`${uploadId}_b_${bucketId}_o_${objectId}`);
        this._currentBytesUploaded = 0;
    }
    get uploadId() {
        return this._uploadId;
    }
    get metadata() {
        return this._metadata;
    }
    get bucketId() {
        return this._bucketId;
    }
    get objectId() {
        return this._objectId;
    }
    get contentType() {
        return this._contentType;
    }
    set contentType(contentType) {
        this._contentType = contentType;
    }
    get currentBytesUploaded() {
        return this._currentBytesUploaded;
    }
    set currentBytesUploaded(value) {
        this._currentBytesUploaded = value;
    }
    set status(status) {
        this._status = status;
    }
    get status() {
        return this._status;
    }
    get fileLocation() {
        return this._fileLocation;
    }
}
exports.ResumableUpload = ResumableUpload;
var UploadStatus;
(function (UploadStatus) {
    UploadStatus[UploadStatus["ACTIVE"] = 0] = "ACTIVE";
    UploadStatus[UploadStatus["CANCELLED"] = 1] = "CANCELLED";
    UploadStatus[UploadStatus["FINISHED"] = 2] = "FINISHED";
})(UploadStatus = exports.UploadStatus || (exports.UploadStatus = {}));
class StorageLayer {
    constructor(_projectId) {
        this._projectId = _projectId;
        this.reset();
        this._cloudFunctions = new cloudFunctions_1.StorageCloudFunctions(this._projectId);
    }
    reset() {
        this._files = new Map();
        this._persistence = new Persistence(`${(0, os_1.tmpdir)()}/firebase/storage/blobs`);
        this._uploads = new Map();
        this._buckets = new Map();
    }
    createBucket(id) {
        if (!this._buckets.has(id)) {
            this._buckets.set(id, new metadata_1.CloudStorageBucketMetadata(id));
        }
    }
    listBuckets() {
        if (this._buckets.size == 0) {
            this.createBucket("default-bucket");
        }
        return [...this._buckets.values()];
    }
    getMetadata(bucket, object) {
        const key = this.path(bucket, object);
        const val = this._files.get(key);
        if (val) {
            return val.metadata;
        }
        return;
    }
    getBytes(bucket, object, size, offset) {
        const key = this.path(bucket, object);
        const val = this._files.get(key);
        if (val) {
            const len = size ? size : Number(val.metadata.size);
            return this._persistence.readBytes(this.path(bucket, object), len, offset);
        }
        return undefined;
    }
    public(value) {
        this._files = value;
    }
    startUpload(bucket, object, contentType, metadata) {
        const uploadId = (0, uuid_1.v4)();
        const upload = new ResumableUpload(bucket, object, uploadId, contentType, metadata);
        this._uploads.set(uploadId, upload);
        return upload;
    }
    queryUpload(uploadId) {
        return this._uploads.get(uploadId);
    }
    cancelUpload(uploadId) {
        const upload = this._uploads.get(uploadId);
        if (!upload) {
            return undefined;
        }
        upload.status = UploadStatus.CANCELLED;
        this._persistence.deleteFile(upload.fileLocation);
    }
    uploadBytes(uploadId, bytes) {
        const upload = this._uploads.get(uploadId);
        if (!upload) {
            return undefined;
        }
        this._persistence.appendBytes(upload.fileLocation, bytes, upload.currentBytesUploaded);
        upload.currentBytesUploaded += bytes.byteLength;
        return upload;
    }
    deleteFile(bucketId, objectId) {
        const isFolder = objectId.toLowerCase().endsWith("%2f");
        if (isFolder) {
            objectId = objectId.slice(0, -3);
        }
        let filePath = this.path(bucketId, objectId);
        if (isFolder) {
            filePath += "%2F";
        }
        const file = this._files.get(filePath);
        if (file == undefined) {
            return false;
        }
        else {
            this._files.delete(filePath);
            this._persistence.deleteFile(filePath);
            this._cloudFunctions.dispatch("delete", new metadata_1.CloudStorageObjectMetadata(file.metadata));
            return true;
        }
    }
    async deleteAll() {
        return this._persistence.deleteAll();
    }
    finalizeUpload(uploadId) {
        const upload = this._uploads.get(uploadId);
        if (!upload) {
            return undefined;
        }
        upload.status = UploadStatus.FINISHED;
        const filePath = this.path(upload.bucketId, upload.objectId);
        const bytes = this._persistence.readBytes(upload.fileLocation, upload.currentBytesUploaded);
        const finalMetadata = new metadata_1.StoredFileMetadata({
            name: upload.objectId,
            bucket: upload.bucketId,
            contentType: "",
            contentEncoding: upload.metadata.contentEncoding,
            customMetadata: upload.metadata.metadata,
        }, this._cloudFunctions, bytes, upload.metadata);
        const file = new StoredFile(finalMetadata, filePath);
        this._files.set(filePath, file);
        this._persistence.deleteFile(filePath, true);
        this._persistence.renameFile(upload.fileLocation, filePath);
        this._cloudFunctions.dispatch("finalize", new metadata_1.CloudStorageObjectMetadata(file.metadata));
        return { upload: upload, file: file };
    }
    oneShotUpload(bucket, object, contentType, incomingMetadata, bytes) {
        const filePath = this.path(bucket, object);
        this._persistence.deleteFile(filePath, true);
        this._persistence.appendBytes(filePath, bytes);
        const md = new metadata_1.StoredFileMetadata({
            name: object,
            bucket: bucket,
            contentType: incomingMetadata.contentType || "application/octet-stream",
            contentEncoding: incomingMetadata.contentEncoding,
            customMetadata: incomingMetadata.metadata,
        }, this._cloudFunctions, bytes, incomingMetadata);
        const file = new StoredFile(md, this._persistence.getDiskPath(filePath));
        this._files.set(filePath, file);
        this._cloudFunctions.dispatch("finalize", new metadata_1.CloudStorageObjectMetadata(file.metadata));
        return file.metadata;
    }
    listItemsAndPrefixes(bucket, prefix, delimiter, pageToken, maxResults) {
        if (!delimiter) {
            delimiter = "/";
        }
        if (!prefix) {
            prefix = "";
        }
        if (!prefix.endsWith(delimiter)) {
            prefix += delimiter;
        }
        if (!prefix.startsWith(delimiter)) {
            prefix = delimiter + prefix;
        }
        let items = [];
        const prefixes = new Set();
        for (const [, file] of this._files) {
            if (file.metadata.bucket != bucket) {
                continue;
            }
            let name = `${delimiter}${file.metadata.name}`;
            if (!name.startsWith(prefix)) {
                continue;
            }
            name = name.substring(prefix.length);
            if (name.startsWith(delimiter)) {
                name = name.substring(prefix.length);
            }
            const startAtIndex = name.indexOf(delimiter);
            if (startAtIndex == -1) {
                if (!file.metadata.name.endsWith("/")) {
                    items.push(file.metadata.name);
                }
            }
            else {
                const prefixPath = prefix + name.substring(0, startAtIndex + 1);
                prefixes.add(prefixPath);
            }
        }
        items.sort();
        if (pageToken) {
            const idx = items.findIndex((v) => v == pageToken);
            if (idx != -1) {
                items = items.slice(idx);
            }
        }
        if (!maxResults) {
            maxResults = 1000;
        }
        let nextPageToken = undefined;
        if (items.length > maxResults) {
            nextPageToken = items[maxResults];
            items = items.slice(0, maxResults);
        }
        return new list_1.ListResponse([...prefixes].sort(), items.map((i) => new list_1.ListItem(i, bucket)), nextPageToken);
    }
    listItems(bucket, prefix, delimiter, pageToken, maxResults) {
        if (!delimiter) {
            delimiter = "/";
        }
        if (!prefix) {
            prefix = "";
        }
        if (!prefix.endsWith(delimiter)) {
            prefix += delimiter;
        }
        let items = [];
        for (const [, file] of this._files) {
            if (file.metadata.bucket != bucket) {
                continue;
            }
            let name = file.metadata.name;
            if (!name.startsWith(prefix)) {
                continue;
            }
            name = name.substring(prefix.length);
            if (name.startsWith(delimiter)) {
                name = name.substring(prefix.length);
            }
            items.push(this.path(file.metadata.bucket, file.metadata.name));
        }
        items.sort();
        if (pageToken) {
            const idx = items.findIndex((v) => v == pageToken);
            if (idx != -1) {
                items = items.slice(idx);
            }
        }
        if (!maxResults) {
            maxResults = 1000;
        }
        return {
            kind: "#storage/objects",
            items: items.map((item) => {
                const storedFile = this._files.get(item);
                if (!storedFile) {
                    return console.warn(`No file ${item}`);
                }
                return new metadata_1.CloudStorageObjectMetadata(storedFile.metadata);
            }),
        };
    }
    addDownloadToken(bucket, object) {
        const key = this.path(bucket, object);
        const val = this._files.get(key);
        if (!val) {
            return undefined;
        }
        const md = val.metadata;
        md.addDownloadToken();
        return md;
    }
    deleteDownloadToken(bucket, object, token) {
        const key = this.path(bucket, object);
        const val = this._files.get(key);
        if (!val) {
            return undefined;
        }
        const md = val.metadata;
        md.deleteDownloadToken(token);
        return md;
    }
    path(bucket, object) {
        const directory = path.dirname(object);
        const filename = path.basename(object) + (object.endsWith("/") ? "/" : "");
        return path.join(bucket, directory, encodeURIComponent(filename));
    }
    get dirPath() {
        return this._persistence.dirPath;
    }
    async export(storageExportPath) {
        var e_1, _a;
        const bucketsList = {
            buckets: [],
        };
        for (const b of this.listBuckets()) {
            bucketsList.buckets.push({ id: b.id });
        }
        const bucketsFilePath = path.join(storageExportPath, "buckets.json");
        await fse.writeFile(bucketsFilePath, JSON.stringify(bucketsList, undefined, 2));
        const blobsDirPath = path.join(storageExportPath, "blobs");
        await fse.ensureDir(blobsDirPath);
        await fse.copy(this.dirPath, blobsDirPath, { recursive: true });
        const metadataDirPath = path.join(storageExportPath, "metadata");
        await fse.ensureDir(metadataDirPath);
        try {
            for (var _b = __asyncValues(this._files.entries()), _c; _c = await _b.next(), !_c.done;) {
                const [p, file] = _c.value;
                const metadataExportPath = path.join(metadataDirPath, p) + ".json";
                const metadataExportDirPath = path.dirname(metadataExportPath);
                await fse.ensureDir(metadataExportDirPath);
                await fse.writeFile(metadataExportPath, metadata_1.StoredFileMetadata.toJSON(file.metadata));
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) await _a.call(_b);
            }
            finally { if (e_1) throw e_1.error; }
        }
    }
    import(storageExportPath) {
        const bucketsFile = path.join(storageExportPath, "buckets.json");
        const bucketsList = JSON.parse(fs.readFileSync(bucketsFile, "utf-8"));
        for (const b of bucketsList.buckets) {
            const bucketMetadata = new metadata_1.CloudStorageBucketMetadata(b.id);
            this._buckets.set(b.id, bucketMetadata);
        }
        const metadataDir = path.join(storageExportPath, "metadata");
        const blobsDir = path.join(storageExportPath, "blobs");
        const metadataList = this.walkDirSync(metadataDir);
        const dotJson = ".json";
        for (const f of metadataList) {
            if (path.extname(f) !== dotJson) {
                logger_1.logger.debug(`Skipping unexpected storage metadata file: ${f}`);
                continue;
            }
            const metadata = metadata_1.StoredFileMetadata.fromJSON(fs.readFileSync(f, "utf-8"), this._cloudFunctions);
            const metadataRelPath = path.relative(metadataDir, f);
            const blobPath = metadataRelPath.substring(0, metadataRelPath.length - dotJson.length);
            const blobAbsPath = path.join(blobsDir, blobPath);
            if (!fs.existsSync(blobAbsPath)) {
                logger_1.logger.warn(`Could not find file "${blobPath}" in storage export.`);
                continue;
            }
            const file = new StoredFile(metadata, blobPath);
            this._files.set(blobPath, file);
        }
        fse.copySync(blobsDir, this.dirPath);
    }
    *walkDirSync(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const p = path.join(dir, file);
            if (fs.statSync(p).isDirectory()) {
                yield* this.walkDirSync(p);
            }
            else {
                yield p;
            }
        }
    }
}
exports.StorageLayer = StorageLayer;
class Persistence {
    constructor(dirPath) {
        this._dirPath = dirPath;
        if (!(0, fs_1.existsSync)(dirPath)) {
            (0, fs_1.mkdirSync)(dirPath, {
                recursive: true,
            });
        }
    }
    get dirPath() {
        return this._dirPath;
    }
    appendBytes(fileName, bytes, fileOffset) {
        const filepath = this.getDiskPath(fileName);
        const encodedSlashIndex = filepath.toLowerCase().lastIndexOf("%2f");
        const dirPath = encodedSlashIndex >= 0 ? filepath.substring(0, encodedSlashIndex) : path.dirname(filepath);
        if (!(0, fs_1.existsSync)(dirPath)) {
            (0, fs_1.mkdirSync)(dirPath, {
                recursive: true,
            });
        }
        let fd;
        try {
            fs.appendFileSync(filepath, bytes);
            return filepath;
        }
        finally {
            if (fd) {
                (0, fs_1.closeSync)(fd);
            }
        }
    }
    readBytes(fileName, size, fileOffset) {
        const path = this.getDiskPath(fileName);
        let fd;
        try {
            fd = (0, fs_1.openSync)(path, "r");
            const buf = Buffer.alloc(size);
            const offset = fileOffset && fileOffset > 0 ? fileOffset : 0;
            (0, fs_1.readSync)(fd, buf, 0, size, offset);
            return buf;
        }
        finally {
            if (fd) {
                (0, fs_1.closeSync)(fd);
            }
        }
    }
    deleteFile(fileName, failSilently = false) {
        try {
            (0, fs_1.unlinkSync)(this.getDiskPath(fileName));
        }
        catch (err) {
            if (!failSilently) {
                throw err;
            }
        }
    }
    deleteAll() {
        return new Promise((resolve, reject) => {
            rimraf(this._dirPath, (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    }
    renameFile(oldName, newName) {
        const dirPath = this.getDiskPath(path.dirname(newName));
        if (!(0, fs_1.existsSync)(dirPath)) {
            (0, fs_1.mkdirSync)(dirPath, {
                recursive: true,
            });
        }
        (0, fs_1.renameSync)(this.getDiskPath(oldName), this.getDiskPath(newName));
    }
    getDiskPath(fileName) {
        return path.join(this._dirPath, fileName);
    }
}
exports.Persistence = Persistence;
//# sourceMappingURL=files.js.map