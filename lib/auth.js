"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = exports.getAccessToken = exports.findAccountByEmail = exports.loginGithub = exports.loginGoogle = exports.setGlobalDefaultAccount = exports.setProjectAccount = exports.loginAdditionalAccount = exports.selectAccount = exports.setRefreshToken = exports.setActiveAccount = exports.getAllAccounts = exports.getAdditionalAccounts = exports.getProjectDefaultAccount = exports.getGlobalDefaultAccount = void 0;
const clc = require("cli-color");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const http = require("http");
const opn = require("open");
const path = require("path");
const portfinder = require("portfinder");
const url = require("url");
const util = require("util");
const api = require("./api");
const apiv2 = require("./apiv2");
const configstore_1 = require("./configstore");
const error_1 = require("./error");
const utils = require("./utils");
const logger_1 = require("./logger");
const prompt_1 = require("./prompt");
const scopes = require("./scopes");
const defaultCredentials_1 = require("./defaultCredentials");
portfinder.basePort = 9005;
function getGlobalDefaultAccount() {
    const user = configstore_1.configstore.get("user");
    const tokens = configstore_1.configstore.get("tokens");
    if (!user || !tokens) {
        return undefined;
    }
    return {
        user,
        tokens,
    };
}
exports.getGlobalDefaultAccount = getGlobalDefaultAccount;
function getProjectDefaultAccount(projectDir) {
    if (!projectDir) {
        return getGlobalDefaultAccount();
    }
    const activeAccounts = configstore_1.configstore.get("activeAccounts") || {};
    const email = activeAccounts[projectDir];
    if (!email) {
        return getGlobalDefaultAccount();
    }
    const allAccounts = getAllAccounts();
    return allAccounts.find((a) => a.user.email === email);
}
exports.getProjectDefaultAccount = getProjectDefaultAccount;
function getAdditionalAccounts() {
    return configstore_1.configstore.get("additionalAccounts") || [];
}
exports.getAdditionalAccounts = getAdditionalAccounts;
function getAllAccounts() {
    const res = [];
    const defaultUser = getGlobalDefaultAccount();
    if (defaultUser) {
        res.push(defaultUser);
    }
    res.push(...getAdditionalAccounts());
    return res;
}
exports.getAllAccounts = getAllAccounts;
function setActiveAccount(options, account) {
    if (account.tokens.refresh_token) {
        setRefreshToken(account.tokens.refresh_token);
    }
    options.user = account.user;
    options.tokens = account.tokens;
}
exports.setActiveAccount = setActiveAccount;
function setRefreshToken(token) {
    api.setRefreshToken(token);
    apiv2.setRefreshToken(token);
}
exports.setRefreshToken = setRefreshToken;
function selectAccount(account, projectRoot) {
    const defaultUser = getProjectDefaultAccount(projectRoot);
    if (!account) {
        return defaultUser;
    }
    if (!defaultUser) {
        throw new error_1.FirebaseError(`Account ${account} not found, have you run "firebase login"?`);
    }
    const matchingAccount = getAllAccounts().find((a) => a.user.email === account);
    if (matchingAccount) {
        return matchingAccount;
    }
    throw new error_1.FirebaseError(`Account ${account} not found, run "firebase login:list" to see existing accounts or "firebase login:add" to add a new one`);
}
exports.selectAccount = selectAccount;
async function loginAdditionalAccount(useLocalhost, email) {
    const result = await loginGoogle(useLocalhost, email);
    if (typeof result.user === "string") {
        throw new error_1.FirebaseError("Failed to parse auth response, see debug log.");
    }
    const resultEmail = result.user.email;
    if (email && resultEmail !== email) {
        utils.logWarning(`Chosen account ${resultEmail} does not match account hint ${email}`);
    }
    const allAccounts = getAllAccounts();
    const newAccount = {
        user: result.user,
        tokens: result.tokens,
    };
    const existingAccount = allAccounts.find((a) => a.user.email === resultEmail);
    if (existingAccount) {
        utils.logWarning(`Already logged in as ${resultEmail}.`);
        updateAccount(newAccount);
    }
    else {
        const additionalAccounts = getAdditionalAccounts();
        additionalAccounts.push(newAccount);
        configstore_1.configstore.set("additionalAccounts", additionalAccounts);
    }
    return newAccount;
}
exports.loginAdditionalAccount = loginAdditionalAccount;
function setProjectAccount(projectDir, email) {
    logger_1.logger.debug(`setProjectAccount(${projectDir}, ${email})`);
    const activeAccounts = configstore_1.configstore.get("activeAccounts") || {};
    activeAccounts[projectDir] = email;
    configstore_1.configstore.set("activeAccounts", activeAccounts);
}
exports.setProjectAccount = setProjectAccount;
function setGlobalDefaultAccount(account) {
    configstore_1.configstore.set("user", account.user);
    configstore_1.configstore.set("tokens", account.tokens);
    const additionalAccounts = getAdditionalAccounts();
    const index = additionalAccounts.findIndex((a) => a.user.email === account.user.email);
    if (index >= 0) {
        additionalAccounts.splice(index, 1);
        configstore_1.configstore.set("additionalAccounts", additionalAccounts);
    }
}
exports.setGlobalDefaultAccount = setGlobalDefaultAccount;
function open(url) {
    opn(url).catch((err) => {
        logger_1.logger.debug("Unable to open URL: " + err.stack);
    });
}
function invalidCredentialError() {
    return new error_1.FirebaseError("Authentication Error: Your credentials are no longer valid. Please run " +
        clc.bold("firebase login --reauth") +
        "\n\n" +
        "For CI servers and headless environments, generate a new token with " +
        clc.bold("firebase login:ci"), { exit: 1 });
}
const FIFTEEN_MINUTES_IN_MS = 15 * 60 * 1000;
const SCOPES = [
    scopes.EMAIL,
    scopes.OPENID,
    scopes.CLOUD_PROJECTS_READONLY,
    scopes.FIREBASE_PLATFORM,
    scopes.CLOUD_PLATFORM,
];
const _nonce = Math.floor(Math.random() * (2 << 29) + 1).toString();
const getPort = portfinder.getPortPromise;
let lastAccessToken;
function getCallbackUrl(port) {
    if (typeof port === "undefined") {
        return "urn:ietf:wg:oauth:2.0:oob";
    }
    return `http://localhost:${port}`;
}
function queryParamString(args) {
    const tokens = [];
    for (const [key, value] of Object.entries(args)) {
        if (typeof value === "string") {
            tokens.push(key + "=" + encodeURIComponent(value));
        }
    }
    return tokens.join("&");
}
function getLoginUrl(callbackUrl, userHint) {
    return (api.authOrigin +
        "/o/oauth2/auth?" +
        queryParamString({
            client_id: api.clientId,
            scope: SCOPES.join(" "),
            response_type: "code",
            state: _nonce,
            redirect_uri: callbackUrl,
            login_hint: userHint,
        }));
}
async function getTokensFromAuthorizationCode(code, callbackUrl) {
    var _a, _b;
    let res;
    try {
        res = await api.request("POST", "/o/oauth2/token", {
            origin: api.authOrigin,
            form: {
                code: code,
                client_id: api.clientId,
                client_secret: api.clientSecret,
                redirect_uri: callbackUrl,
                grant_type: "authorization_code",
            },
        });
    }
    catch (err) {
        if (err instanceof Error) {
            logger_1.logger.debug("Token Fetch Error:", err.stack || "");
        }
        else {
            logger_1.logger.debug("Token Fetch Error");
        }
        throw invalidCredentialError();
    }
    if (!((_a = res === null || res === void 0 ? void 0 : res.body) === null || _a === void 0 ? void 0 : _a.access_token) && !((_b = res === null || res === void 0 ? void 0 : res.body) === null || _b === void 0 ? void 0 : _b.refresh_token)) {
        logger_1.logger.debug("Token Fetch Error:", res.statusCode, res.body);
        throw invalidCredentialError();
    }
    lastAccessToken = Object.assign({
        expires_at: Date.now() + res.body.expires_in * 1000,
    }, res.body);
    return lastAccessToken;
}
const GITHUB_SCOPES = ["read:user", "repo", "public_repo"];
function getGithubLoginUrl(callbackUrl) {
    return (api.githubOrigin +
        "/login/oauth/authorize?" +
        queryParamString({
            client_id: api.githubClientId,
            state: _nonce,
            redirect_uri: callbackUrl,
            scope: GITHUB_SCOPES.join(" "),
        }));
}
async function getGithubTokensFromAuthorizationCode(code, callbackUrl) {
    const res = await api.request("POST", "/login/oauth/access_token", {
        origin: api.githubOrigin,
        form: {
            client_id: api.githubClientId,
            client_secret: api.githubClientSecret,
            code,
            redirect_uri: callbackUrl,
            state: _nonce,
        },
    });
    return res.body.access_token;
}
async function respondWithFile(req, res, statusCode, filename) {
    const response = await util.promisify(fs.readFile)(path.join(__dirname, filename));
    res.writeHead(statusCode, {
        "Content-Length": response.length,
        "Content-Type": "text/html",
    });
    res.end(response);
    req.socket.destroy();
}
async function loginWithoutLocalhost(userHint) {
    const callbackUrl = getCallbackUrl();
    const authUrl = getLoginUrl(callbackUrl, userHint);
    logger_1.logger.info();
    logger_1.logger.info("Visit this URL on any device to log in:");
    logger_1.logger.info(clc.bold.underline(authUrl));
    logger_1.logger.info();
    open(authUrl);
    const code = await (0, prompt_1.promptOnce)({
        type: "input",
        name: "code",
        message: "Paste authorization code here:",
    });
    const tokens = await getTokensFromAuthorizationCode(code, callbackUrl);
    return {
        user: jwt.decode(tokens.id_token),
        tokens: tokens,
        scopes: SCOPES,
    };
}
async function loginWithLocalhostGoogle(port, userHint) {
    const callbackUrl = getCallbackUrl(port);
    const authUrl = getLoginUrl(callbackUrl, userHint);
    const successTemplate = "../templates/loginSuccess.html";
    const tokens = await loginWithLocalhost(port, callbackUrl, authUrl, successTemplate, getTokensFromAuthorizationCode);
    return {
        user: jwt.decode(tokens.id_token),
        tokens: tokens,
        scopes: tokens.scopes,
    };
}
async function loginWithLocalhostGitHub(port) {
    const callbackUrl = getCallbackUrl(port);
    const authUrl = getGithubLoginUrl(callbackUrl);
    const successTemplate = "../templates/loginSuccessGithub.html";
    return loginWithLocalhost(port, callbackUrl, authUrl, successTemplate, getGithubTokensFromAuthorizationCode);
}
async function loginWithLocalhost(port, callbackUrl, authUrl, successTemplate, getTokens) {
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            let tokens;
            const query = url.parse(`${req.url}`, true).query || {};
            const queryState = query.state;
            const queryCode = query.code;
            if (queryState !== _nonce || typeof queryCode !== "string") {
                await respondWithFile(req, res, 400, "../templates/loginFailure.html");
                reject(new error_1.FirebaseError("Unexpected error while logging in"));
                server.close();
                return;
            }
            try {
                const tokens = await getTokens(queryCode, callbackUrl);
                await respondWithFile(req, res, 200, successTemplate);
                resolve(tokens);
            }
            catch (err) {
                await respondWithFile(req, res, 400, "../templates/loginFailure.html");
                reject(err);
            }
            server.close();
            return;
        });
        server.listen(port, () => {
            logger_1.logger.info();
            logger_1.logger.info("Visit this URL on this device to log in:");
            logger_1.logger.info(clc.bold.underline(authUrl));
            logger_1.logger.info();
            logger_1.logger.info("Waiting for authentication...");
            open(authUrl);
        });
        server.on("error", (err) => {
            reject(err);
        });
    });
}
async function loginGoogle(localhost, userHint) {
    if (localhost) {
        const port = await getPort();
        try {
            const port = await getPort();
            return await loginWithLocalhostGoogle(port, userHint);
        }
        catch (_a) {
            return await loginWithoutLocalhost(userHint);
        }
    }
    return await loginWithoutLocalhost(userHint);
}
exports.loginGoogle = loginGoogle;
async function loginGithub() {
    const port = await getPort();
    return loginWithLocalhostGitHub(port);
}
exports.loginGithub = loginGithub;
function findAccountByEmail(email) {
    return getAllAccounts().find((a) => a.user.email === email);
}
exports.findAccountByEmail = findAccountByEmail;
function haveValidTokens(refreshToken, authScopes) {
    var _a;
    if (!(lastAccessToken === null || lastAccessToken === void 0 ? void 0 : lastAccessToken.access_token)) {
        const tokens = configstore_1.configstore.get("tokens");
        if (refreshToken === (tokens === null || tokens === void 0 ? void 0 : tokens.refresh_token)) {
            lastAccessToken = tokens;
        }
    }
    const hasTokens = !!(lastAccessToken === null || lastAccessToken === void 0 ? void 0 : lastAccessToken.access_token);
    const oldScopesJSON = JSON.stringify(((_a = lastAccessToken === null || lastAccessToken === void 0 ? void 0 : lastAccessToken.scopes) === null || _a === void 0 ? void 0 : _a.sort()) || []);
    const newScopesJSON = JSON.stringify(authScopes.sort());
    const hasSameScopes = oldScopesJSON === newScopesJSON;
    const isExpired = ((lastAccessToken === null || lastAccessToken === void 0 ? void 0 : lastAccessToken.expires_at) || 0) < Date.now() + FIFTEEN_MINUTES_IN_MS;
    return hasTokens && hasSameScopes && !isExpired;
}
function deleteAccount(account) {
    const defaultAccount = getGlobalDefaultAccount();
    if (account.user.email === (defaultAccount === null || defaultAccount === void 0 ? void 0 : defaultAccount.user.email)) {
        configstore_1.configstore.delete("user");
        configstore_1.configstore.delete("tokens");
        configstore_1.configstore.delete("usage");
        configstore_1.configstore.delete("analytics-uuid");
    }
    const additionalAccounts = getAdditionalAccounts();
    const remainingAccounts = additionalAccounts.filter((a) => a.user.email !== account.user.email);
    configstore_1.configstore.set("additionalAccounts", remainingAccounts);
    const activeAccounts = configstore_1.configstore.get("activeAccounts") || {};
    for (const [projectDir, projectAccount] of Object.entries(activeAccounts)) {
        if (projectAccount === account.user.email) {
            delete activeAccounts[projectDir];
        }
    }
    configstore_1.configstore.set("activeAccounts", activeAccounts);
}
function updateAccount(account) {
    const defaultAccount = getGlobalDefaultAccount();
    if (account.user.email === (defaultAccount === null || defaultAccount === void 0 ? void 0 : defaultAccount.user.email)) {
        configstore_1.configstore.set("user", account.user);
        configstore_1.configstore.set("tokens", account.tokens);
    }
    const additionalAccounts = getAdditionalAccounts();
    const accountIndex = additionalAccounts.findIndex((a) => a.user.email === account.user.email);
    if (accountIndex >= 0) {
        additionalAccounts.splice(accountIndex, 1, account);
        configstore_1.configstore.set("additionalAccounts", additionalAccounts);
    }
}
function findAccountByRefreshToken(refreshToken) {
    return getAllAccounts().find((a) => a.tokens.refresh_token === refreshToken);
}
function logoutCurrentSession(refreshToken) {
    const account = findAccountByRefreshToken(refreshToken);
    if (!account) {
        return;
    }
    (0, defaultCredentials_1.clearCredentials)(account);
    deleteAccount(account);
}
async function refreshTokens(refreshToken, authScopes) {
    var _a, _b, _c;
    logger_1.logger.debug("> refreshing access token with scopes:", JSON.stringify(authScopes));
    try {
        const res = await api.request("POST", "/oauth2/v3/token", {
            origin: api.googleOrigin,
            form: {
                refresh_token: refreshToken,
                client_id: api.clientId,
                client_secret: api.clientSecret,
                grant_type: "refresh_token",
                scope: (authScopes || []).join(" "),
            },
            logOptions: { skipRequestBody: true, skipQueryParams: true, skipResponseBody: true },
        });
        if (res.status === 401 || res.status === 400) {
            return { access_token: refreshToken };
        }
        if (typeof ((_a = res.body) === null || _a === void 0 ? void 0 : _a.access_token) !== "string") {
            throw invalidCredentialError();
        }
        lastAccessToken = Object.assign({
            expires_at: Date.now() + res.body.expires_in * 1000,
            refresh_token: refreshToken,
            scopes: authScopes,
        }, res.body);
        const account = findAccountByRefreshToken(refreshToken);
        if (account && lastAccessToken) {
            account.tokens = lastAccessToken;
            updateAccount(account);
        }
        return lastAccessToken;
    }
    catch (err) {
        if (((_c = (_b = err === null || err === void 0 ? void 0 : err.context) === null || _b === void 0 ? void 0 : _b.body) === null || _c === void 0 ? void 0 : _c.error) === "invalid_scope") {
            throw new error_1.FirebaseError("This command requires new authorization scopes not granted to your current session. Please run " +
                clc.bold("firebase login --reauth") +
                "\n\n" +
                "For CI servers and headless environments, generate a new token with " +
                clc.bold("firebase login:ci"), { exit: 1 });
        }
        throw invalidCredentialError();
    }
}
async function getAccessToken(refreshToken, authScopes) {
    if (haveValidTokens(refreshToken, authScopes)) {
        return lastAccessToken;
    }
    return refreshTokens(refreshToken, authScopes);
}
exports.getAccessToken = getAccessToken;
async function logout(refreshToken) {
    if ((lastAccessToken === null || lastAccessToken === void 0 ? void 0 : lastAccessToken.refresh_token) === refreshToken) {
        lastAccessToken = undefined;
    }
    logoutCurrentSession(refreshToken);
    try {
        await api.request("GET", "/o/oauth2/revoke", {
            origin: api.authOrigin,
            data: {
                token: refreshToken,
            },
        });
    }
    catch (thrown) {
        const err = thrown instanceof Error ? thrown : new Error(thrown);
        throw new error_1.FirebaseError("Authentication Error.", {
            exit: 1,
            original: err,
        });
    }
}
exports.logout = logout;
//# sourceMappingURL=auth.js.map