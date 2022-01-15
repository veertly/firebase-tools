"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsageMode = exports.TenantProjectState = exports.AgentProjectState = exports.ProjectState = exports.SIGNIN_METHOD_EMAIL_LINK = exports.PROVIDER_GAME_CENTER = exports.PROVIDER_CUSTOM = exports.PROVIDER_ANONYMOUS = exports.PROVIDER_PHONE = exports.PROVIDER_PASSWORD = void 0;
const utils_1 = require("./utils");
const cloudFunctions_1 = require("./cloudFunctions");
const errors_1 = require("./errors");
exports.PROVIDER_PASSWORD = "password";
exports.PROVIDER_PHONE = "phone";
exports.PROVIDER_ANONYMOUS = "anonymous";
exports.PROVIDER_CUSTOM = "custom";
exports.PROVIDER_GAME_CENTER = "gc.apple.com";
exports.SIGNIN_METHOD_EMAIL_LINK = "emailLink";
class ProjectState {
    constructor(projectId) {
        this.projectId = projectId;
        this.users = new Map();
        this.localIdForEmail = new Map();
        this.localIdForInitialEmail = new Map();
        this.localIdForPhoneNumber = new Map();
        this.localIdsForProviderEmail = new Map();
        this.userIdForProviderRawId = new Map();
        this.refreshTokens = new Map();
        this.refreshTokensForLocalId = new Map();
        this.oobs = new Map();
        this.verificationCodes = new Map();
        this.temporaryProofs = new Map();
    }
    get projectNumber() {
        return "12345";
    }
    createUser(props) {
        for (let i = 0; i < 10; i++) {
            const localId = (0, utils_1.randomId)(28);
            const user = this.createUserWithLocalId(localId, props);
            if (user) {
                return user;
            }
        }
        throw new Error("Cannot generate a random unique localId after 10 tries.");
    }
    createUserWithLocalId(localId, props) {
        if (this.users.has(localId)) {
            return undefined;
        }
        const timestamp = new Date();
        this.users.set(localId, {
            localId,
            createdAt: props.createdAt || timestamp.getTime().toString(),
            lastLoginAt: timestamp.getTime().toString(),
        });
        const user = this.updateUserByLocalId(localId, props, {
            upsertProviders: props.providerUserInfo,
        });
        this.authCloudFunction.dispatch("create", user);
        return user;
    }
    overwriteUserWithLocalId(localId, props) {
        const userInfoBefore = this.users.get(localId);
        if (userInfoBefore) {
            this.removeUserFromIndex(userInfoBefore);
        }
        const timestamp = new Date();
        this.users.set(localId, {
            localId,
            createdAt: props.createdAt || timestamp.getTime().toString(),
            lastLoginAt: timestamp.getTime().toString(),
        });
        const user = this.updateUserByLocalId(localId, props, {
            upsertProviders: props.providerUserInfo,
        });
        return user;
    }
    deleteUser(user) {
        this.users.delete(user.localId);
        this.removeUserFromIndex(user);
        const refreshTokens = this.refreshTokensForLocalId.get(user.localId);
        if (refreshTokens) {
            this.refreshTokensForLocalId.delete(user.localId);
            for (const refreshToken of refreshTokens) {
                this.refreshTokens.delete(refreshToken);
            }
        }
        this.authCloudFunction.dispatch("delete", user);
    }
    updateUserByLocalId(localId, fields, options = {}) {
        var _a, _b;
        const upsertProviders = (_a = options.upsertProviders) !== null && _a !== void 0 ? _a : [];
        const deleteProviders = (_b = options.deleteProviders) !== null && _b !== void 0 ? _b : [];
        const user = this.users.get(localId);
        if (!user) {
            throw new Error(`Internal assertion error: trying to update nonexistent user: ${localId}`);
        }
        const oldEmail = user.email;
        const oldPhoneNumber = user.phoneNumber;
        for (const field of Object.keys(fields)) {
            (0, utils_1.mirrorFieldTo)(user, field, fields);
        }
        if (oldEmail && oldEmail !== user.email) {
            this.localIdForEmail.delete(oldEmail);
        }
        if (user.email) {
            this.localIdForEmail.set(user.email, user.localId);
        }
        if (user.email && (user.passwordHash || user.emailLinkSignin)) {
            upsertProviders.push({
                providerId: exports.PROVIDER_PASSWORD,
                email: user.email,
                federatedId: user.email,
                rawId: user.email,
                displayName: user.displayName,
                photoUrl: user.photoUrl,
            });
        }
        else {
            deleteProviders.push(exports.PROVIDER_PASSWORD);
        }
        if (user.initialEmail) {
            this.localIdForInitialEmail.set(user.initialEmail, user.localId);
        }
        if (oldPhoneNumber && oldPhoneNumber !== user.phoneNumber) {
            this.localIdForPhoneNumber.delete(oldPhoneNumber);
        }
        if (user.phoneNumber) {
            this.localIdForPhoneNumber.set(user.phoneNumber, user.localId);
            upsertProviders.push({
                providerId: exports.PROVIDER_PHONE,
                phoneNumber: user.phoneNumber,
                rawId: user.phoneNumber,
            });
        }
        else {
            deleteProviders.push(exports.PROVIDER_PHONE);
        }
        if (user.mfaInfo) {
            this.validateMfaEnrollments(user.mfaInfo);
        }
        return this.updateUserProviderInfo(user, upsertProviders, deleteProviders);
    }
    validateMfaEnrollments(enrollments) {
        const phoneNumbers = new Set();
        const enrollmentIds = new Set();
        for (const enrollment of enrollments) {
            (0, errors_1.assert)(enrollment.phoneInfo && (0, utils_1.isValidPhoneNumber)(enrollment.phoneInfo), "INVALID_MFA_PHONE_NUMBER : Invalid format.");
            (0, errors_1.assert)(enrollment.mfaEnrollmentId, "INVALID_MFA_ENROLLMENT_ID : mfaEnrollmentId must be defined.");
            (0, errors_1.assert)(!enrollmentIds.has(enrollment.mfaEnrollmentId), "DUPLICATE_MFA_ENROLLMENT_ID");
            (0, errors_1.assert)(!phoneNumbers.has(enrollment.phoneInfo), "INTERNAL_ERROR : MFA Enrollment Phone Numbers must be unique.");
            phoneNumbers.add(enrollment.phoneInfo);
            enrollmentIds.add(enrollment.mfaEnrollmentId);
        }
        return enrollments;
    }
    updateUserProviderInfo(user, upsertProviders, deleteProviders) {
        var _a, _b;
        const oldProviderEmails = getProviderEmailsForUser(user);
        if (user.providerUserInfo) {
            const updatedProviderUserInfo = [];
            for (const info of user.providerUserInfo) {
                if (deleteProviders.includes(info.providerId)) {
                    (_a = this.userIdForProviderRawId.get(info.providerId)) === null || _a === void 0 ? void 0 : _a.delete(info.rawId);
                }
                else {
                    updatedProviderUserInfo.push(info);
                }
            }
            user.providerUserInfo = updatedProviderUserInfo;
        }
        if (upsertProviders.length) {
            user.providerUserInfo = (_b = user.providerUserInfo) !== null && _b !== void 0 ? _b : [];
            for (const upsert of upsertProviders) {
                const providerId = upsert.providerId;
                let users = this.userIdForProviderRawId.get(providerId);
                if (!users) {
                    users = new Map();
                    this.userIdForProviderRawId.set(providerId, users);
                }
                users.set(upsert.rawId, user.localId);
                const index = user.providerUserInfo.findIndex((info) => info.providerId === upsert.providerId);
                if (index < 0) {
                    user.providerUserInfo.push(upsert);
                }
                else {
                    user.providerUserInfo[index] = upsert;
                }
            }
        }
        for (const email of getProviderEmailsForUser(user)) {
            oldProviderEmails.delete(email);
            let localIds = this.localIdsForProviderEmail.get(email);
            if (!localIds) {
                localIds = new Set();
                this.localIdsForProviderEmail.set(email, localIds);
            }
            localIds.add(user.localId);
        }
        for (const oldEmail of oldProviderEmails) {
            this.removeProviderEmailForUser(oldEmail, user.localId);
        }
        return user;
    }
    getUserByEmail(email) {
        const localId = this.localIdForEmail.get(email);
        if (!localId) {
            return undefined;
        }
        return this.getUserByLocalIdAssertingExists(localId);
    }
    getUserByInitialEmail(initialEmail) {
        const localId = this.localIdForInitialEmail.get(initialEmail);
        if (!localId) {
            return undefined;
        }
        return this.getUserByLocalIdAssertingExists(localId);
    }
    getUserByLocalIdAssertingExists(localId) {
        const userInfo = this.getUserByLocalId(localId);
        if (!userInfo) {
            throw new Error(`Internal state invariant broken: no user with ID: ${localId}`);
        }
        return userInfo;
    }
    getUsersByEmailOrProviderEmail(email) {
        var _a;
        const users = [];
        const seenLocalIds = new Set();
        const localId = this.localIdForEmail.get(email);
        if (localId) {
            users.push(this.getUserByLocalIdAssertingExists(localId));
            seenLocalIds.add(localId);
        }
        for (const localId of (_a = this.localIdsForProviderEmail.get(email)) !== null && _a !== void 0 ? _a : []) {
            if (!seenLocalIds.has(localId)) {
                users.push(this.getUserByLocalIdAssertingExists(localId));
                seenLocalIds.add(localId);
            }
        }
        return users;
    }
    getUserByPhoneNumber(phoneNumber) {
        const localId = this.localIdForPhoneNumber.get(phoneNumber);
        if (!localId) {
            return undefined;
        }
        return this.getUserByLocalIdAssertingExists(localId);
    }
    removeProviderEmailForUser(email, localId) {
        const localIds = this.localIdsForProviderEmail.get(email);
        if (!localIds) {
            return;
        }
        localIds.delete(localId);
        if (localIds.size === 0) {
            this.localIdsForProviderEmail.delete(email);
        }
    }
    getUserByProviderRawId(provider, rawId) {
        var _a;
        const localId = (_a = this.userIdForProviderRawId.get(provider)) === null || _a === void 0 ? void 0 : _a.get(rawId);
        if (!localId) {
            return undefined;
        }
        return this.getUserByLocalIdAssertingExists(localId);
    }
    listProviderInfosByProviderId(provider) {
        var _a;
        const users = this.userIdForProviderRawId.get(provider);
        if (!users) {
            return [];
        }
        const infos = [];
        for (const localId of users.values()) {
            const user = this.getUserByLocalIdAssertingExists(localId);
            const info = (_a = user.providerUserInfo) === null || _a === void 0 ? void 0 : _a.find((info) => info.providerId === provider);
            if (!info) {
                throw new Error(`Internal assertion error: User ${localId} does not have providerInfo ${provider}.`);
            }
            infos.push(info);
        }
        return infos;
    }
    getUserByLocalId(localId) {
        return this.users.get(localId);
    }
    createRefreshTokenFor(userInfo, provider, { extraClaims = {}, secondFactor, } = {}) {
        const localId = userInfo.localId;
        const refreshToken = (0, utils_1.randomBase64UrlStr)(204);
        this.refreshTokens.set(refreshToken, {
            localId,
            provider,
            extraClaims,
            secondFactor,
            tenantId: userInfo.tenantId,
        });
        let refreshTokens = this.refreshTokensForLocalId.get(localId);
        if (!refreshTokens) {
            refreshTokens = new Set();
            this.refreshTokensForLocalId.set(localId, refreshTokens);
        }
        refreshTokens.add(refreshToken);
        return refreshToken;
    }
    validateRefreshToken(refreshToken) {
        const record = this.refreshTokens.get(refreshToken);
        if (!record) {
            return undefined;
        }
        return {
            user: this.getUserByLocalIdAssertingExists(record.localId),
            provider: record.provider,
            extraClaims: record.extraClaims,
            secondFactor: record.secondFactor,
        };
    }
    createOob(email, requestType, generateLink) {
        const oobCode = (0, utils_1.randomBase64UrlStr)(54);
        const oobLink = generateLink(oobCode);
        const oob = {
            email,
            requestType,
            oobCode,
            oobLink,
        };
        this.oobs.set(oobCode, oob);
        return oob;
    }
    validateOobCode(oobCode) {
        return this.oobs.get(oobCode);
    }
    deleteOobCode(oobCode) {
        return this.oobs.delete(oobCode);
    }
    listOobCodes() {
        return this.oobs.values();
    }
    createVerificationCode(phoneNumber) {
        const sessionInfo = (0, utils_1.randomBase64UrlStr)(226);
        const verification = {
            code: (0, utils_1.randomDigits)(6),
            phoneNumber,
            sessionInfo,
        };
        this.verificationCodes.set(sessionInfo, verification);
        return verification;
    }
    getVerificationCodeBySessionInfo(sessionInfo) {
        return this.verificationCodes.get(sessionInfo);
    }
    deleteVerificationCodeBySessionInfo(sessionInfo) {
        return this.verificationCodes.delete(sessionInfo);
    }
    listVerificationCodes() {
        return this.verificationCodes.values();
    }
    deleteAllAccounts() {
        this.users.clear();
        this.localIdForEmail.clear();
        this.localIdForPhoneNumber.clear();
        this.localIdsForProviderEmail.clear();
        this.userIdForProviderRawId.clear();
        this.refreshTokens.clear();
        this.refreshTokensForLocalId.clear();
    }
    getUserCount() {
        return this.users.size;
    }
    queryUsers(filter, options) {
        const users = [];
        for (const user of this.users.values()) {
            if (!options.startToken || user.localId > options.startToken) {
                filter;
                users.push(user);
            }
        }
        users.sort((a, b) => {
            if (options.sortByField === "localId") {
                if (a.localId < b.localId) {
                    return -1;
                }
                else if (a.localId > b.localId) {
                    return 1;
                }
            }
            return 0;
        });
        return options.order === "DESC" ? users.reverse() : users;
    }
    createTemporaryProof(phoneNumber) {
        const record = {
            phoneNumber,
            temporaryProof: (0, utils_1.randomBase64UrlStr)(119),
            temporaryProofExpiresIn: "3600",
        };
        this.temporaryProofs.set(record.temporaryProof, record);
        return record;
    }
    validateTemporaryProof(temporaryProof, phoneNumber) {
        const record = this.temporaryProofs.get(temporaryProof);
        if (!record || record.phoneNumber !== phoneNumber) {
            return undefined;
        }
        return record;
    }
    removeUserFromIndex(user) {
        var _a, _b;
        if (user.email) {
            this.localIdForEmail.delete(user.email);
        }
        if (user.initialEmail) {
            this.localIdForInitialEmail.delete(user.initialEmail);
        }
        if (user.phoneNumber) {
            this.localIdForPhoneNumber.delete(user.phoneNumber);
        }
        for (const info of (_a = user.providerUserInfo) !== null && _a !== void 0 ? _a : []) {
            (_b = this.userIdForProviderRawId.get(info.providerId)) === null || _b === void 0 ? void 0 : _b.delete(info.rawId);
            if (info.email) {
                this.removeProviderEmailForUser(info.email, user.localId);
            }
        }
    }
}
exports.ProjectState = ProjectState;
class AgentProjectState extends ProjectState {
    constructor(projectId) {
        super(projectId);
        this._oneAccountPerEmail = true;
        this._usageMode = UsageMode.DEFAULT;
        this.tenantProjectForTenantId = new Map();
        this._authCloudFunction = new cloudFunctions_1.AuthCloudFunction(this.projectId);
    }
    get authCloudFunction() {
        return this._authCloudFunction;
    }
    get oneAccountPerEmail() {
        return this._oneAccountPerEmail;
    }
    set oneAccountPerEmail(oneAccountPerEmail) {
        this._oneAccountPerEmail = oneAccountPerEmail;
    }
    get usageMode() {
        return this._usageMode;
    }
    set usageMode(usageMode) {
        this._usageMode = usageMode;
    }
    get allowPasswordSignup() {
        return true;
    }
    get disableAuth() {
        return false;
    }
    get mfaConfig() {
        return { state: "ENABLED", enabledProviders: ["PHONE_SMS"] };
    }
    get enableAnonymousUser() {
        return true;
    }
    get enableEmailLinkSignin() {
        return true;
    }
    getTenantProject(tenantId) {
        if (!this.tenantProjectForTenantId.has(tenantId)) {
            this.createTenantWithTenantId(tenantId, {
                tenantId,
                allowPasswordSignup: true,
                disableAuth: false,
                mfaConfig: {
                    state: "ENABLED",
                    enabledProviders: ["PHONE_SMS"],
                },
                enableAnonymousUser: true,
                enableEmailLinkSignin: true,
            });
        }
        return this.tenantProjectForTenantId.get(tenantId);
    }
    listTenants(startToken) {
        const tenantProjects = [];
        for (const tenantProject of this.tenantProjectForTenantId.values()) {
            if (!startToken || tenantProject.tenantId > startToken) {
                tenantProjects.push(tenantProject);
            }
        }
        tenantProjects.sort((a, b) => {
            if (a.tenantId < b.tenantId) {
                return -1;
            }
            else if (a.tenantId > b.tenantId) {
                return 1;
            }
            return 0;
        });
        return tenantProjects.map((tenantProject) => tenantProject.tenantConfig);
    }
    createTenant(tenant) {
        for (let i = 0; i < 10; i++) {
            const tenantId = (0, utils_1.randomId)(28);
            const createdTenant = this.createTenantWithTenantId(tenantId, tenant);
            if (createdTenant) {
                return createdTenant;
            }
        }
        throw new Error("Could not generate a random unique tenantId after 10 tries");
    }
    createTenantWithTenantId(tenantId, tenant) {
        if (this.tenantProjectForTenantId.has(tenantId)) {
            return undefined;
        }
        tenant.name = `projects/${this.projectId}/tenants/${tenantId}`;
        tenant.tenantId = tenantId;
        this.tenantProjectForTenantId.set(tenantId, new TenantProjectState(this.projectId, tenantId, tenant, this));
        return tenant;
    }
    deleteTenant(tenantId) {
        this.tenantProjectForTenantId.delete(tenantId);
    }
}
exports.AgentProjectState = AgentProjectState;
class TenantProjectState extends ProjectState {
    constructor(projectId, tenantId, _tenantConfig, parentProject) {
        super(projectId);
        this.tenantId = tenantId;
        this._tenantConfig = _tenantConfig;
        this.parentProject = parentProject;
    }
    get oneAccountPerEmail() {
        return this.parentProject.oneAccountPerEmail;
    }
    get authCloudFunction() {
        return this.parentProject.authCloudFunction;
    }
    get usageMode() {
        return this.parentProject.usageMode;
    }
    get tenantConfig() {
        return this._tenantConfig;
    }
    get allowPasswordSignup() {
        return this._tenantConfig.allowPasswordSignup;
    }
    get disableAuth() {
        return this._tenantConfig.disableAuth;
    }
    get mfaConfig() {
        return this._tenantConfig.mfaConfig;
    }
    get enableAnonymousUser() {
        return this._tenantConfig.enableAnonymousUser;
    }
    get enableEmailLinkSignin() {
        return this._tenantConfig.enableEmailLinkSignin;
    }
    delete() {
        this.parentProject.deleteTenant(this.tenantId);
    }
    updateTenant(update, updateMask) {
        var _a, _b, _c, _d, _e;
        if (!updateMask) {
            const mfaConfig = (_a = update.mfaConfig) !== null && _a !== void 0 ? _a : {};
            if (!("state" in mfaConfig)) {
                mfaConfig.state = "DISABLED";
            }
            if (!("enabledProviders" in mfaConfig)) {
                mfaConfig.enabledProviders = [];
            }
            this._tenantConfig = {
                tenantId: this.tenantId,
                name: this.tenantConfig.name,
                allowPasswordSignup: (_b = update.allowPasswordSignup) !== null && _b !== void 0 ? _b : false,
                disableAuth: (_c = update.disableAuth) !== null && _c !== void 0 ? _c : false,
                mfaConfig: mfaConfig,
                enableAnonymousUser: (_d = update.enableAnonymousUser) !== null && _d !== void 0 ? _d : false,
                enableEmailLinkSignin: (_e = update.enableEmailLinkSignin) !== null && _e !== void 0 ? _e : false,
                displayName: update.displayName,
            };
            return this.tenantConfig;
        }
        const paths = updateMask.split(",");
        for (const path of paths) {
            const fields = path.split(".");
            let updateField = update;
            let existingField = this._tenantConfig;
            let field;
            for (let i = 0; i < fields.length - 1; i++) {
                field = fields[i];
                if (updateField[field] == null) {
                    console.warn(`Unable to find field '${field}' in update '${updateField}`);
                    break;
                }
                if (Array.isArray(updateField[field]) ||
                    Object(updateField[field]) !== updateField[field]) {
                    console.warn(`Field '${field}' is singular and cannot have sub-fields`);
                    break;
                }
                if (!existingField[field]) {
                    existingField[field] = {};
                }
                updateField = updateField[field];
                existingField = existingField[field];
            }
            field = fields[fields.length - 1];
            if (updateField[field] == null) {
                console.warn(`Unable to find field '${field}' in update '${JSON.stringify(updateField)}`);
                continue;
            }
            existingField[field] = updateField[field];
        }
        return this.tenantConfig;
    }
}
exports.TenantProjectState = TenantProjectState;
function getProviderEmailsForUser(user) {
    var _a;
    const emails = new Set();
    (_a = user.providerUserInfo) === null || _a === void 0 ? void 0 : _a.forEach(({ email }) => {
        if (email) {
            emails.add(email);
        }
    });
    return emails;
}
var UsageMode;
(function (UsageMode) {
    UsageMode["DEFAULT"] = "DEFAULT";
    UsageMode["PASSTHROUGH"] = "PASSTHROUGH";
})(UsageMode = exports.UsageMode || (exports.UsageMode = {}));
//# sourceMappingURL=state.js.map