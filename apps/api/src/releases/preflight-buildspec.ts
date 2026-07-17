import type { ConfirmedBuildConfig, FrontendBuildConfig } from "@sketchcatch/types";

export const preflightExportedVariables = [
  "SKETCHCATCH_PREFLIGHT_STAGE",
  "SKETCHCATCH_COMMIT_SHA",
  "SKETCHCATCH_API_OCI_DIGEST",
  "SKETCHCATCH_API_ARCHIVE_DIGEST",
  "SKETCHCATCH_FRONTEND_ARCHIVE_DIGEST",
  "SKETCHCATCH_FRONTEND_MANIFEST_DIGEST",
  "SKETCHCATCH_API_ARCHIVE_SIZE",
  "SKETCHCATCH_FRONTEND_ARCHIVE_SIZE",
  "SKETCHCATCH_API_UPLOAD_ETAG",
  "SKETCHCATCH_FRONTEND_UPLOAD_ETAG",
  "SKETCHCATCH_MANIFEST_UPLOAD_ETAG"
] as const;

export function renderPreflightBuildspec(config: ConfirmedBuildConfig): string {
  const ecsWeb = config.ecsWeb;
  if (!ecsWeb) {
    throw new Error("ECS web build configuration is required for preflight");
  }
  validateBuildPath(ecsWeb.api.sourceRoot, "API source root");
  validateBuildPath(ecsWeb.api.dockerfilePath, "Dockerfile path");
  validateBuildPath(ecsWeb.frontend.sourceRoot, "frontend source root");
  validateBuildPath(ecsWeb.frontend.outputPath, "frontend output path");
  validateBuildPath(ecsWeb.frontend.packageManifestPath, "frontend package manifest path");
  validateBuildPath(ecsWeb.frontend.lockfilePath, "frontend lockfile path");
  if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/u.test(ecsWeb.api.healthCheckPath)) {
    throw new Error("ECS web health check path is invalid");
  }
  const installCommand = createFrontendInstallCommand(ecsWeb.frontend);
  const buildCommand = createFrontendBuildCommand(ecsWeb.frontend);
  const packageManagerSetupCommands = createPackageManagerSetupCommands(
    ecsWeb.frontend.packageManager
  ).map((command) => `      - ${command}`).join("\n");
  const exportedVariables = preflightExportedVariables
    .map((name) => `    - ${name}`)
    .join("\n");
  const packagerScriptBase64 = Buffer.from(renderPreflightPackagerScript(), "utf8").toString(
    "base64"
  );

  return `version: 0.2
env:
  shell: bash
  exported-variables:
${exportedVariables}
phases:
  install:
    on-failure: ABORT
    commands:
      - set -euo pipefail
      - |
        if ! command -v zstd >/dev/null 2>&1; then
          if command -v apt-get >/dev/null 2>&1; then
            apt-get update
            DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends zstd
          elif command -v dnf >/dev/null 2>&1; then
            dnf install --yes zstd
          elif command -v yum >/dev/null 2>&1; then
            yum install --yes zstd
          else
            echo "zstd installation is unavailable in this CodeBuild image" >&2
            exit 1
          fi
        fi
${packageManagerSetupCommands}
  pre_build:
    on-failure: ABORT
    commands:
      - export SKETCHCATCH_PREFLIGHT_STAGE=checkout
      - test "\${CODEBUILD_RESOLVED_SOURCE_VERSION,,}" = "\${SKETCHCATCH_CONFIRMED_COMMIT_SHA,,}"
      - export SKETCHCATCH_COMMIT_SHA="\${CODEBUILD_RESOLVED_SOURCE_VERSION,,}"
  build:
    on-failure: ABORT
    commands:
      - export SKETCHCATCH_PREFLIGHT_STAGE=api_build
      - docker build --file "\${SKETCHCATCH_DOCKERFILE_PATH}" --tag sketchcatch-preflight-api "\${SKETCHCATCH_API_SOURCE_ROOT}"
      - export SKETCHCATCH_PREFLIGHT_STAGE=api_health
      - |
        set -euo pipefail
        CONTAINER_ID=$(docker run --detach --publish "127.0.0.1:18080:\${SKETCHCATCH_CONTAINER_PORT}" sketchcatch-preflight-api)
        cleanup_container() {
          docker rm --force "\${CONTAINER_ID}" >/dev/null 2>&1 || true
        }
        trap cleanup_container EXIT
        API_HEALTHY=false
        for attempt in $(seq 1 30); do
          if curl --fail --silent --show-error "http://127.0.0.1:18080\${SKETCHCATCH_HEALTH_CHECK_PATH}"; then
            API_HEALTHY=true
            break
          fi
          if ! docker inspect --format '{{.State.Running}}' "\${CONTAINER_ID}" | grep --quiet '^true$'; then
            docker logs "\${CONTAINER_ID}" >&2 || true
            echo "API container exited before the health check passed" >&2
            exit 1
          fi
          sleep 1
        done
        if [[ "\${API_HEALTHY}" != "true" ]]; then
          docker logs "\${CONTAINER_ID}" >&2 || true
          echo "API health check timed out" >&2
          exit 1
        fi
        cleanup_container
        trap - EXIT
      - export SKETCHCATCH_PREFLIGHT_STAGE=frontend_build
      - test -f "\${SKETCHCATCH_FRONTEND_PACKAGE_MANIFEST_PATH}"
      - test -f "\${SKETCHCATCH_FRONTEND_LOCKFILE_PATH}"
      - ${installCommand}
      - ${buildCommand}
      - test -d "\${SKETCHCATCH_FRONTEND_OUTPUT_PATH}"
      - export SKETCHCATCH_PREFLIGHT_STAGE=archive
      - printf '%s' '${packagerScriptBase64}' | base64 --decode > /tmp/package-release.mjs
      - rm -rf /tmp/docker-image /tmp/oci-layout
      - mkdir -p /tmp/docker-image /tmp/oci-layout
      - docker image save sketchcatch-preflight-api --output /tmp/api-image.docker.tar
      - tar --extract --file /tmp/api-image.docker.tar --directory /tmp/docker-image
      - node /tmp/package-release.mjs /tmp/docker-image /tmp/oci-layout "\${SKETCHCATCH_FRONTEND_OUTPUT_PATH}" "\${SKETCHCATCH_COMMIT_SHA}" "\${SKETCHCATCH_CANDIDATE_ID}"
      - tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner --create --file /tmp/api-image.oci.tar --directory /tmp/oci-layout .
      - tar --zstd --create --file /tmp/frontend.tar.zst --directory "\${SKETCHCATCH_FRONTEND_OUTPUT_PATH}" .
      - export SKETCHCATCH_API_OCI_DIGEST=$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync("/tmp/preflight-metadata.json","utf8")).apiOciDigest)')
      - export SKETCHCATCH_API_ARCHIVE_DIGEST=$(sha256sum /tmp/api-image.oci.tar | awk '{print $1}')
      - export SKETCHCATCH_FRONTEND_ARCHIVE_DIGEST=$(sha256sum /tmp/frontend.tar.zst | awk '{print $1}')
      - export SKETCHCATCH_FRONTEND_MANIFEST_DIGEST=$(sha256sum /tmp/frontend-manifest.json | awk '{print $1}')
      - export SKETCHCATCH_API_ARCHIVE_SIZE=$(stat -c %s /tmp/api-image.oci.tar)
      - export SKETCHCATCH_FRONTEND_ARCHIVE_SIZE=$(stat -c %s /tmp/frontend.tar.zst)
      - export SKETCHCATCH_PREFLIGHT_STAGE=upload
      - curl --fail --silent --show-error --request PUT --upload-file /tmp/api-image.oci.tar --dump-header /tmp/api-upload.headers "\${SKETCHCATCH_API_UPLOAD_URL}"
      - curl --fail --silent --show-error --request PUT --upload-file /tmp/frontend.tar.zst --dump-header /tmp/frontend-upload.headers "\${SKETCHCATCH_FRONTEND_UPLOAD_URL}"
      - curl --fail --silent --show-error --request PUT --upload-file /tmp/frontend-manifest.json --dump-header /tmp/manifest-upload.headers "\${SKETCHCATCH_MANIFEST_UPLOAD_URL}"
      - export SKETCHCATCH_API_UPLOAD_ETAG=$(grep -i '^etag:' /tmp/api-upload.headers | tail -1 | cut -d' ' -f2 | tr -d '\\r')
      - export SKETCHCATCH_FRONTEND_UPLOAD_ETAG=$(grep -i '^etag:' /tmp/frontend-upload.headers | tail -1 | cut -d' ' -f2 | tr -d '\\r')
      - export SKETCHCATCH_MANIFEST_UPLOAD_ETAG=$(grep -i '^etag:' /tmp/manifest-upload.headers | tail -1 | cut -d' ' -f2 | tr -d '\\r')
      - test -n "\${SKETCHCATCH_API_UPLOAD_ETAG}"
      - test -n "\${SKETCHCATCH_FRONTEND_UPLOAD_ETAG}"
      - test -n "\${SKETCHCATCH_MANIFEST_UPLOAD_ETAG}"
`;
}

function createPackageManagerSetupCommands(
  packageManager: FrontendBuildConfig["packageManager"]
): string[] {
  if (packageManager === "npm") {
    return ['npm install --global "npm@${SKETCHCATCH_PACKAGE_MANAGER_VERSION}"'];
  }
  return [
    "corepack enable",
    'corepack prepare "${SKETCHCATCH_PACKAGE_MANAGER}@${SKETCHCATCH_PACKAGE_MANAGER_VERSION}" --activate'
  ];
}

export function renderPreflightPackagerScript(): string {
  return preflightPackagerScript;
}

const preflightPackagerScript = String.raw`import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, lstat, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

const [dockerRootArg, ociRootArg, frontendRootArg, commitSha, candidateId] = process.argv.slice(2);
if (!dockerRootArg || !ociRootArg || !frontendRootArg || !commitSha || !candidateId) {
  throw new Error("preflight packager arguments are missing");
}
if (!/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(commitSha) || !/^[A-Za-z0-9-]{1,64}$/.test(candidateId)) {
  throw new Error("preflight release identity is invalid");
}
const dockerRoot = resolve(dockerRootArg);
const ociRoot = resolve(ociRootArg);
const frontendRoot = resolve(frontendRootArg);
const blobsRoot = join(ociRoot, "blobs", "sha256");
await mkdir(blobsRoot, { recursive: true });

const dockerManifest = JSON.parse(await readFile(join(dockerRoot, "manifest.json"), "utf8"));
if (!Array.isArray(dockerManifest) || dockerManifest.length !== 1) {
  throw new Error("Docker archive must contain exactly one image");
}
const image = dockerManifest[0];
if (!image || typeof image.Config !== "string" || !Array.isArray(image.Layers)) {
  throw new Error("Docker archive manifest is invalid");
}

const configSource = safeArchivePath(dockerRoot, image.Config);
const configDigest = await hashFile(configSource);
const configSize = (await stat(configSource)).size;
await copyFile(configSource, join(blobsRoot, configDigest));

const layers = [];
for (const [index, layerName] of image.Layers.entries()) {
  if (typeof layerName !== "string") throw new Error("Docker archive layer path is invalid");
  const source = safeArchivePath(dockerRoot, layerName);
  const temporary = join(blobsRoot, ".layer-" + index);
  await pipeline(createReadStream(source), createGzip({ level: 9, mtime: 0 }), createWriteStream(temporary));
  const digest = await hashFile(temporary);
  const size = (await stat(temporary)).size;
  await rename(temporary, join(blobsRoot, digest));
  layers.push({
    mediaType: "application/vnd.oci.image.layer.v1.tar+gzip",
    digest: "sha256:" + digest,
    size
  });
}

const ociManifest = {
  schemaVersion: 2,
  mediaType: "application/vnd.oci.image.manifest.v1+json",
  config: {
    mediaType: "application/vnd.oci.image.config.v1+json",
    digest: "sha256:" + configDigest,
    size: configSize
  },
  layers
};
const manifestBytes = Buffer.from(JSON.stringify(ociManifest));
const manifestDigest = sha256(manifestBytes);
await writeFile(join(blobsRoot, manifestDigest), manifestBytes);
await writeFile(join(ociRoot, "oci-layout"), JSON.stringify({ imageLayoutVersion: "1.0.0" }));
await writeFile(join(ociRoot, "index.json"), JSON.stringify({
  schemaVersion: 2,
  manifests: [{
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    digest: "sha256:" + manifestDigest,
    size: manifestBytes.length,
    annotations: { "org.opencontainers.image.ref.name": commitSha }
  }]
}));

const indexPath = join(frontendRoot, "index.html");
let indexHtml = await readFile(indexPath, "utf8");
const marker = '<meta name="sketchcatch-release" content="' + commitSha + ':' + candidateId + '">';
indexHtml = indexHtml.replace(/<meta\s+name=["']sketchcatch-release["'][^>]*>\s*/giu, "");
indexHtml = /<\/head>/iu.test(indexHtml)
  ? indexHtml.replace(/<\/head>/iu, marker + "</head>")
  : marker + indexHtml;
await writeFile(indexPath, indexHtml);
await writeFile(join(frontendRoot, "sketchcatch-release.json"), JSON.stringify({
  schemaVersion: 1,
  commitSha,
  candidateId
}));

const frontendFiles = [];
for (const filePath of await walkFiles(frontendRoot)) {
  const path = relative(frontendRoot, filePath).split(sep).join("/");
  const fileStat = await stat(filePath);
  frontendFiles.push({
    path,
    sha256: await hashFile(filePath),
    size: fileStat.size,
    contentType: contentTypeFor(path)
  });
}
frontendFiles.sort((left, right) => left.path.localeCompare(right.path));
const indexEntry = frontendFiles.find((file) => file.path === "index.html");
if (!indexEntry) throw new Error("frontend index.html is missing");
await writeFile("/tmp/frontend-manifest.json", JSON.stringify({
  schemaVersion: 1,
  commitSha,
  candidateId,
  marker: commitSha + ':' + candidateId,
  index: { path: indexEntry.path, sha256: indexEntry.sha256 },
  files: frontendFiles
}));
await writeFile("/tmp/preflight-metadata.json", JSON.stringify({
  apiOciDigest: manifestDigest,
  apiConfigDigest: configDigest,
  frontendIndexDigest: indexEntry.sha256
}));

function safeArchivePath(root, value) {
  const path = resolve(root, value);
  if (path !== root && !path.startsWith(root + sep)) throw new Error("Docker archive path escapes root");
  return path;
}

async function walkFiles(root) {
  const results = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) throw new Error("frontend artifact cannot contain symbolic links");
    if (metadata.isDirectory()) results.push(...await walkFiles(path));
    else if (metadata.isFile()) results.push(path);
    else throw new Error("frontend artifact contains an unsupported entry");
  }
  return results;
}

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function contentTypeFor(path) {
  return ({
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2"
  })[extname(path).toLowerCase()] || "application/octet-stream";
}
`;

function createFrontendInstallCommand(frontend: FrontendBuildConfig): string {
  const installRoot = getParentRepositoryPath(frontend.lockfilePath);
  if (frontend.installPreset === "pnpm_frozen_lockfile") {
    return `pnpm --dir "${installRoot}" install --frozen-lockfile`;
  }
  if (frontend.installPreset === "npm_ci") {
    return `npm --prefix "${installRoot}" ci`;
  }
  if (frontend.installPreset === "yarn_frozen_lockfile") {
    return `yarn --cwd "${installRoot}" install --frozen-lockfile`;
  }
  throw new Error("Unsupported frontend install preset");
}

function getParentRepositoryPath(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator === -1 ? "." : path.slice(0, separator);
}

function createFrontendBuildCommand(frontend: FrontendBuildConfig): string {
  const sameOriginEnvironment = 'VITE_API_BASE_URL="/"';
  if (frontend.buildPreset === "pnpm_build") {
    return `${sameOriginEnvironment} pnpm --dir "\${SKETCHCATCH_FRONTEND_SOURCE_ROOT}" run build`;
  }
  if (frontend.buildPreset === "npm_build") {
    return `${sameOriginEnvironment} npm --prefix "\${SKETCHCATCH_FRONTEND_SOURCE_ROOT}" run build`;
  }
  if (frontend.buildPreset === "yarn_build") {
    return `${sameOriginEnvironment} yarn --cwd "\${SKETCHCATCH_FRONTEND_SOURCE_ROOT}" run build`;
  }
  throw new Error("Unsupported frontend build preset");
}

function validateBuildPath(value: string, label: string): void {
  if (
    !value ||
    value.startsWith("/") ||
    value.split("/").some((segment) => segment === "..") ||
    !/^[A-Za-z0-9._/@+-]+$/u.test(value)
  ) {
    throw new Error(`${label} is invalid`);
  }
}
