"use strict";
module.exports = {
    account: require("./account").doSetup,
    database: require("./database").doSetup,
    firestore: require("./firestore").doSetup,
    functions: require("./functions"),
    hosting: require("./hosting"),
    storage: require("./storage").doSetup,
    emulators: require("./emulators").doSetup,
    project: require("./project").doSetup,
    remoteconfig: require("./remoteconfig").doSetup,
    "hosting:github": require("./hosting/github").initGitHub,
};
//# sourceMappingURL=index.js.map