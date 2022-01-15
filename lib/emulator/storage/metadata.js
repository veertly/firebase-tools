"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toSerializedDate = exports.CloudStorageObjectMetadata = exports.CloudStorageObjectAccessControlMetadata = exports.CloudStorageBucketMetadata = exports.OutgoingFirebaseMetadata = exports.StoredFileMetadata = void 0;
const uuid = require("uuid");
const crypto = require("crypto");
const registry_1 = require("../registry");
const types_1 = require("../types");
const crc_1 = require("./crc");
class StoredFileMetadata {
    constructor(opts, _cloudFunctions, bytes, incomingMetadata) {
        this._cloudFunctions = _cloudFunctions;
        this.name = opts.name;
        this.bucket = opts.bucket;
        this.contentType = opts.contentType;
        this.metageneration = opts.metageneration || 1;
        this.generation = opts.generation || Date.now();
        this.storageClass = opts.storageClass || "STANDARD";
        this.etag = opts.etag || "someETag";
        this.contentDisposition = opts.contentDisposition || "inline";
        this.cacheControl = opts.cacheControl;
        this.contentLanguage = opts.contentLanguage;
        this.customTime = opts.customTime;
        this.contentEncoding = opts.contentEncoding || "identity";
        this.customMetadata = opts.customMetadata;
        this.downloadTokens = opts.downloadTokens || [];
        this.timeCreated = opts.timeCreated ? new Date(opts.timeCreated) : new Date();
        this.updated = opts.updated ? new Date(opts.updated) : this.timeCreated;
        if (bytes) {
            this.size = bytes.byteLength;
            this.md5Hash = generateMd5Hash(bytes);
            this.crc32c = `${(0, crc_1.crc32c)(bytes)}`;
        }
        else if (opts.size !== undefined && opts.md5Hash && opts.crc32c) {
            this.size = opts.size;
            this.md5Hash = opts.md5Hash;
            this.crc32c = opts.crc32c;
        }
        else {
            throw new Error("Must pass bytes array or opts object with size, md5hash, and crc32c");
        }
        if (incomingMetadata) {
            this.update(incomingMetadata);
        }
        this.deleteFieldsSetAsNull();
        this.setDownloadTokensFromCustomMetadata();
    }
    asRulesResource(proposedChanges) {
        let rulesResource = {
            name: this.name,
            bucket: this.bucket,
            generation: this.generation,
            metageneration: this.metageneration,
            size: this.size,
            timeCreated: this.timeCreated,
            updated: this.updated,
            md5Hash: this.md5Hash,
            crc32c: this.crc32c,
            etag: this.etag,
            contentDisposition: this.contentDisposition,
            contentEncoding: this.contentEncoding,
            contentType: this.contentType,
            metadata: this.customMetadata || {},
        };
        if (proposedChanges) {
            if (proposedChanges.md5Hash !== rulesResource.md5Hash) {
                rulesResource.generation = Date.now();
                rulesResource.metageneration = 1;
                rulesResource.timeCreated = new Date();
                rulesResource.updated = rulesResource.timeCreated;
            }
            else {
                rulesResource.metageneration++;
            }
            rulesResource = Object.assign(Object.assign({}, rulesResource), proposedChanges);
        }
        return rulesResource;
    }
    setDownloadTokensFromCustomMetadata() {
        if (!this.customMetadata) {
            return;
        }
        if (this.customMetadata.firebaseStorageDownloadTokens) {
            this.downloadTokens = [
                ...this.downloadTokens,
                ...this.customMetadata.firebaseStorageDownloadTokens.split(","),
            ];
            delete this.customMetadata.firebaseStorageDownloadTokens;
        }
    }
    deleteFieldsSetAsNull() {
        const deletableFields = [
            "contentDisposition",
            "contentType",
            "contentLanguage",
            "contentEncoding",
            "cacheControl",
        ];
        deletableFields.map((field) => {
            if (this[field] === null) {
                delete this[field];
            }
        });
        if (this.customMetadata) {
            Object.keys(this.customMetadata).map((key) => {
                if (!this.customMetadata)
                    return;
                if (this.customMetadata[key] === null) {
                    delete this.customMetadata[key];
                }
            });
        }
    }
    update(incoming) {
        if (incoming.contentDisposition) {
            this.contentDisposition = incoming.contentDisposition;
        }
        if (incoming.contentType) {
            this.contentType = incoming.contentType;
        }
        if (incoming.metadata) {
            this.customMetadata = incoming.metadata;
        }
        if (incoming.contentLanguage) {
            this.contentLanguage = incoming.contentLanguage;
        }
        if (incoming.contentEncoding) {
            this.contentEncoding = incoming.contentEncoding;
        }
        if (this.generation) {
            this.generation++;
        }
        this.updated = new Date();
        if (incoming.cacheControl) {
            this.cacheControl = incoming.cacheControl;
        }
        this.setDownloadTokensFromCustomMetadata();
        this.deleteFieldsSetAsNull();
        this._cloudFunctions.dispatch("metadataUpdate", new CloudStorageObjectMetadata(this));
    }
    addDownloadToken() {
        if (!this.downloadTokens.length) {
            this.downloadTokens.push(uuid.v4());
            return;
        }
        this.downloadTokens = [...this.downloadTokens, uuid.v4()];
        this.update({});
    }
    deleteDownloadToken(token) {
        if (!this.downloadTokens.length) {
            return;
        }
        const remainingTokens = this.downloadTokens.filter((t) => t != token);
        this.downloadTokens = remainingTokens;
        if (remainingTokens.length == 0) {
            this.addDownloadToken();
        }
        this.update({});
    }
    static fromJSON(data, cloudFunctions) {
        const opts = JSON.parse(data);
        return new StoredFileMetadata(opts, cloudFunctions);
    }
    static toJSON(metadata) {
        return JSON.stringify(metadata, (key, value) => {
            if (key.startsWith("_")) {
                return undefined;
            }
            return value;
        }, 2);
    }
}
exports.StoredFileMetadata = StoredFileMetadata;
class OutgoingFirebaseMetadata {
    constructor(md) {
        this.name = md.name;
        this.bucket = md.bucket;
        this.generation = md.generation.toString();
        this.metageneration = md.metageneration.toString();
        this.contentType = md.contentType;
        this.timeCreated = toSerializedDate(md.timeCreated);
        this.updated = toSerializedDate(md.updated);
        this.storageClass = md.storageClass;
        this.size = md.size.toString();
        this.md5Hash = md.md5Hash;
        this.crc32c = md.crc32c;
        this.etag = md.etag;
        this.downloadTokens = md.downloadTokens.join(",");
        this.contentEncoding = md.contentEncoding;
        this.contentDisposition = md.contentDisposition;
        this.metadata = md.customMetadata;
        this.contentLanguage = md.contentLanguage;
        this.cacheControl = md.cacheControl;
    }
}
exports.OutgoingFirebaseMetadata = OutgoingFirebaseMetadata;
class CloudStorageBucketMetadata {
    constructor(id) {
        var _a, _b;
        this.kind = "#storage/bucket";
        this.name = id;
        this.id = id;
        this.selfLink = `http://${(_a = registry_1.EmulatorRegistry.getInfo(types_1.Emulators.STORAGE)) === null || _a === void 0 ? void 0 : _a.host}:${(_b = registry_1.EmulatorRegistry.getInfo(types_1.Emulators.STORAGE)) === null || _b === void 0 ? void 0 : _b.port}/v1/b/${this.id}`;
        this.timeCreated = toSerializedDate(new Date());
        this.updated = this.timeCreated;
        this.projectNumber = "000000000000";
        this.metageneration = "1";
        this.location = "US";
        this.storageClass = "STANDARD";
        this.etag = "====";
        this.locationType = "mutli-region";
    }
}
exports.CloudStorageBucketMetadata = CloudStorageBucketMetadata;
class CloudStorageObjectAccessControlMetadata {
    constructor(object, generation, selfLink, id, role, entity, bucket, etag) {
        this.object = object;
        this.generation = generation;
        this.selfLink = selfLink;
        this.id = id;
        this.role = role;
        this.entity = entity;
        this.bucket = bucket;
        this.etag = etag;
        this.kind = "storage#objectAccessControl";
    }
}
exports.CloudStorageObjectAccessControlMetadata = CloudStorageObjectAccessControlMetadata;
class CloudStorageObjectMetadata {
    constructor(md) {
        var _a, _b, _c, _d;
        this.kind = "#storage#object";
        this.name = md.name;
        this.bucket = md.bucket;
        this.generation = md.generation.toString();
        this.metageneration = md.metageneration.toString();
        this.contentType = md.contentType;
        this.timeCreated = toSerializedDate(md.timeCreated);
        this.updated = toSerializedDate(md.updated);
        this.storageClass = md.storageClass;
        this.size = md.size.toString();
        this.md5Hash = md.md5Hash;
        this.etag = md.etag;
        this.metadata = {};
        if (Object.keys(md.customMetadata || {})) {
            this.metadata = Object.assign(Object.assign({}, this.metadata), md.customMetadata);
        }
        if (md.downloadTokens.length) {
            this.metadata = Object.assign(Object.assign({}, this.metadata), { firebaseStorageDownloadTokens: md.downloadTokens.join(",") });
        }
        if (!Object.keys(this.metadata).length) {
            delete this.metadata;
        }
        if (md.contentLanguage) {
            this.contentLanguage = md.contentLanguage;
        }
        if (md.cacheControl) {
            this.cacheControl = md.cacheControl;
        }
        if (md.customTime) {
            this.customTime = toSerializedDate(md.customTime);
        }
        this.crc32c = "----" + Buffer.from([md.crc32c]).toString("base64");
        this.timeStorageClassUpdated = toSerializedDate(md.timeCreated);
        this.id = `${md.bucket}/${md.name}/${md.generation}`;
        this.selfLink = `http://${(_a = registry_1.EmulatorRegistry.getInfo(types_1.Emulators.STORAGE)) === null || _a === void 0 ? void 0 : _a.host}:${(_b = registry_1.EmulatorRegistry.getInfo(types_1.Emulators.STORAGE)) === null || _b === void 0 ? void 0 : _b.port}/storage/v1/b/${md.bucket}/o/${encodeURIComponent(md.name)}`;
        this.mediaLink = `http://${(_c = registry_1.EmulatorRegistry.getInfo(types_1.Emulators.STORAGE)) === null || _c === void 0 ? void 0 : _c.host}:${(_d = registry_1.EmulatorRegistry.getInfo(types_1.Emulators.STORAGE)) === null || _d === void 0 ? void 0 : _d.port}/download/storage/v1/b/${md.bucket}/o/${encodeURIComponent(md.name)}?generation=${md.generation}&alt=media`;
    }
}
exports.CloudStorageObjectMetadata = CloudStorageObjectMetadata;
function toSerializedDate(d) {
    const day = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d
        .getDate()
        .toString()
        .padStart(2, "0")}`;
    const time = `${d.getHours().toString().padStart(2, "0")}:${d
        .getMinutes()
        .toString()
        .padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}.${d
        .getMilliseconds()
        .toString()
        .padStart(3, "0")}`;
    return `${day}T${time}Z`;
}
exports.toSerializedDate = toSerializedDate;
function generateMd5Hash(bytes) {
    const hash = crypto.createHash("md5");
    hash.update(bytes);
    return hash.digest("base64");
}
//# sourceMappingURL=metadata.js.map