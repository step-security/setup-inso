const tc = require("@actions/tool-cache");
const core = require("@actions/core");
const semver = require("semver");
const createWrapper = require("actions-output-wrapper");
const axios = require("axios");
const fs = require("fs");

async function validateSubscription() {
  let repoPrivate;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && fs.existsSync(eventPath)) {
    const payload = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    repoPrivate = payload?.repository?.private;
  }

  const upstream = "kong/setup-inso";
  const action = process.env.GITHUB_ACTION_REPOSITORY;
  const docsUrl =
    "https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions";

  core.info("");
  core.info("\u001b[1;36mStepSecurity Maintained Action\u001b[0m");
  core.info(`Secure drop-in replacement for ${upstream}`);
  if (repoPrivate === false)
    core.info("\u001b[32m\u2713 Free for public repositories\u001b[0m");
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`);
  core.info("");

  if (repoPrivate === false) return;

  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
  const body = { action: action || "" };
  if (serverUrl !== "https://github.com") body.ghes_server = serverUrl;

  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body,
      { timeout: 3000 }
    );
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 403) {
      core.error(
        `\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`
      );
      core.error(
        `\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`
      );
      process.exit(1);
    }
    core.info("Timeout or API not reachable. Continuing to next step.");
  }
}

async function action() {
  await validateSubscription();

  let version = core.getInput("inso-version", { required: true });

  const semverVersion = semver.valid(semver.parse(version));

  if (!semverVersion) {
    throw new Error(`Invalid version provided: '${version}'`);
  }

  let os = getPlatform(process.platform);
  let arch = getArch();
  let compression = getCompression(process.platform);

  // Insomnia v11 does not add arch to the package name
  if (semver.lte(semverVersion, "10.99.99")) {
    if (os == "linux") {
      os = os + "-" + arch;
    }
  }

  const fullVersion = `${os}-${semverVersion}`;
  console.log(`Installing inso version ${fullVersion}`);

  let insoDirectory = tc.find("inso", fullVersion);
  if (!insoDirectory) {
    const versionUrl = `https://github.com/Kong/insomnia/releases/download/core%40${semverVersion}/inso-${fullVersion}.${compression}`;
    const insoPath = await tc.downloadTool(versionUrl);

    const extractMethod =
      compression === "tar.xz" ? "extractTar" : "extractZip";
    let additionalOptions = extractMethod == "extractTar" ? "x" : null;

    const insoExtractedFolder = await tc[extractMethod](
      insoPath,
      `inso-${fullVersion}.${compression}`,
      additionalOptions
    );

    insoDirectory = await tc.cacheDir(insoExtractedFolder, "inso", fullVersion);
  }

  core.addPath(insoDirectory);
  if (core.getInput("wrapper") === "true") {
    await createWrapper({
      originalName: "inso",
    });
  }
}

function getCompression(platform) {
  if (platform === "win32") {
    return "zip";
  }

  if (platform === "darwin") {
    return "zip";
  }

  return "tar.xz";
}

function getPlatform(platform) {
  if (platform === "win32") {
    return "windows";
  }

  if (platform === "darwin") {
    return "macos";
  }

  return "linux";
}

function getArch() {
  return process.arch;
}

if (require.main === module) {
  action();
}

module.exports = action;
