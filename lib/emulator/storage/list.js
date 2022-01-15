"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListResponse = exports.ListItem = void 0;
class ListItem {
    constructor(name, bucket) {
        this.name = name;
        this.bucket = bucket;
    }
}
exports.ListItem = ListItem;
class ListResponse {
    constructor(prefixes, items, nextPageToken) {
        this.prefixes = prefixes;
        this.items = items;
        this.nextPageToken = nextPageToken;
    }
}
exports.ListResponse = ListResponse;
//# sourceMappingURL=list.js.map