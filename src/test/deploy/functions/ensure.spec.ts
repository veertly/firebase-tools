import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";

import { FirebaseError } from "../../../error";
import { logger } from "../../../logger";
import { configstore } from "../../../configstore";
import { POLL_SETTINGS } from "../../../ensureApiEnabled";
import { defaultServiceAccount } from "../../../gcp/cloudfunctions";
import * as api from "../../../api";
import * as backend from "../../../deploy/functions/backend";
import * as ensure from "../../../deploy/functions/ensure";
import * as secretManager from "../../../gcp/secretManager";
import * as prepare from "../../../deploy/functions";

describe("ensureCloudBuildEnabled()", () => {
  let restoreInterval: number;
  before(() => {
    restoreInterval = POLL_SETTINGS.pollInterval;
    POLL_SETTINGS.pollInterval = 0;
  });
  after(() => {
    POLL_SETTINGS.pollInterval = restoreInterval;
  });

  let sandbox: sinon.SinonSandbox;
  let logStub: sinon.SinonStub | null;
  beforeEach(() => {
    sandbox = sinon.createSandbox();
    logStub = sandbox.stub(logger, "warn");
  });

  afterEach(() => {
    expect(nock.isDone()).to.be.true;
    sandbox.restore();
    timeStub = null;
    logStub = null;
  });

  function mockServiceCheck(isEnabled = false): void {
    nock(api.serviceUsageOrigin)
      .get("/v1/projects/test-project/services/cloudbuild.googleapis.com")
      .reply(200, { state: isEnabled ? "ENABLED" : "DISABLED" });
  }

  function mockServiceEnableSuccess(): void {
    nock(api.serviceUsageOrigin)
      .post("/v1/projects/test-project/services/cloudbuild.googleapis.com:enable")
      .reply(200, {});
  }

  function mockServiceEnableBillingError(): void {
    nock(api.serviceUsageOrigin)
      .post("/v1/projects/test-project/services/cloudbuild.googleapis.com:enable")
      .reply(403, {
        error: {
          details: [{ violations: [{ type: "serviceusage/billing-enabled" }] }],
        },
      });
  }

  function mockServiceEnablePermissionError(): void {
    nock(api.serviceUsageOrigin)
      .post("/v1/projects/test-project/services/cloudbuild.googleapis.com:enable")
      .reply(403, {
        error: {
          status: "PERMISSION_DENIED",
        },
      });
  }

  let timeStub: sinon.SinonStub | null;
  function stubTimes(warnAfter: number, errorAfter: number): void {
    timeStub = sandbox.stub(configstore, "get");
    timeStub.withArgs("motd.cloudBuildWarnAfter").returns(warnAfter);
    timeStub.withArgs("motd.cloudBuildErrorAfter").returns(errorAfter);
  }

  describe("with cloudbuild service enabled", () => {
    beforeEach(() => {
      mockServiceCheck(true);
    });

    it("should succeed", async () => {
      stubTimes(Date.now() - 10000, Date.now() - 5000);

      await expect(ensure.ensureCloudBuildEnabled("test-project")).to.eventually.be.fulfilled;
      expect(logStub?.callCount).to.eq(0);
    });
  });

  describe("with cloudbuild service disabled, but enabling succeeds", () => {
    beforeEach(() => {
      mockServiceCheck(false);
      mockServiceEnableSuccess();
      mockServiceCheck(true);
    });

    it("should succeed", async () => {
      stubTimes(Date.now() - 10000, Date.now() - 5000);

      await expect(ensure.ensureCloudBuildEnabled("test-project")).to.eventually.be.fulfilled;
      expect(logStub?.callCount).to.eq(1); // enabling an api logs a warning
    });
  });

  describe("with cloudbuild service disabled, but enabling fails with billing error", () => {
    beforeEach(() => {
      mockServiceCheck(false);
      mockServiceEnableBillingError();
    });

    it("should error", async () => {
      stubTimes(Date.now() - 10000, Date.now() - 5000);

      await expect(ensure.ensureCloudBuildEnabled("test-project")).to.eventually.be.rejectedWith(
        FirebaseError,
        /must be on the Blaze \(pay-as-you-go\) plan to complete this command/
      );
    });
  });

  describe("with cloudbuild service disabled, but enabling fails with permission error", () => {
    beforeEach(() => {
      mockServiceCheck(false);
      mockServiceEnablePermissionError();
    });

    it("should error", async () => {
      stubTimes(Date.now() - 10000, Date.now() - 5000);

      await expect(ensure.ensureCloudBuildEnabled("test-project")).to.eventually.be.rejectedWith(
        FirebaseError,
        /Please ask a project owner to visit the following URL to enable Cloud Build/
      );
    });
  });

  describe("ensureSecretAccess", () => {
    const ENDPOINT_BASE: Omit<backend.Endpoint, "httpsTrigger"> = {
      project: "project",
      platform: "gcfv2",
      id: "id",
      region: "region",
      entryPoint: "entry",
      runtime: "nodejs16",
    };
    const ENDPOINT: backend.Endpoint = {
      ...ENDPOINT_BASE,
      httpsTrigger: {},
    };

    const project0 = "project-0";
    const project1 = "project-1";
    const secret0: backend.SecretEnvVar = {
      projectId: project0,
      key: "MY_SECRET_0",
      secret: "MY_SECRET_0",
      version: "2",
    };
    const secret1: backend.SecretEnvVar = {
      projectId: project1,
      key: "MY_SECRET_1",
      secret: "MY_SECRET_1",
      version: "2",
    };

    const e: backend.Endpoint = {
      ...ENDPOINT,
      project: project0,
      platform: "gcfv1",
      secretEnvironmentVariables: [],
    };

    let secretManagerMock: sinon.SinonMock;

    beforeEach(() => {
      secretManagerMock = sinon.mock(secretManager);
    });

    afterEach(() => {
      secretManagerMock.verify();
      secretManagerMock.restore();
    });

    it("ensures access to default service account", async () => {
      const b = backend.of({
        ...e,
        secretEnvironmentVariables: [secret0],
      });
      secretManagerMock
        .expects("ensureServiceAgentRole")
        .once()
        .withExactArgs(
          { name: secret0.secret, projectId: project0 },
          [defaultServiceAccount(e.project)],
          "roles/secretmanager.secretAccessor"
        );
      await ensure.ensureSecretAccess(b);
    });

    it("ensures access to all secrets", async () => {
      const b = backend.of({
        ...e,
        secretEnvironmentVariables: [secret0, secret1],
      });
      secretManagerMock.expects("ensureServiceAgentRole").twice();
      await ensure.ensureSecretAccess(b);
    });

    it("combines service account to make one call per secret", async () => {
      const b = backend.of(
        {
          ...e,
          secretEnvironmentVariables: [secret0],
        },
        {
          ...e,
          id: "another-id",
          serviceAccountEmail: "foo@bar.com",
          secretEnvironmentVariables: [secret0],
        }
      );
      secretManagerMock
        .expects("ensureServiceAgentRole")
        .once()
        .withExactArgs(
          { name: secret0.secret, projectId: project0 },
          [`${e.project}@appspot.gserviceaccount.com`, "foo@bar.com"],
          "roles/secretmanager.secretAccessor"
        );
      await ensure.ensureSecretAccess(b);
    });
  });
});