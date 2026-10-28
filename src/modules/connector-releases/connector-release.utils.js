import { createHash, timingSafeEqual } from "node:crypto";
import path from "node:path";

export const releaseArchitectures = ["x64", "ia32", "arm64"];
const versionPattern = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;

export function releaseError(status, message, data) {
  return Object.assign(new Error(message), { status, apiCode: status === 401 ? 2005 : status === 404 ? 2004 : status === 400 ? 2001 : 2000, data });
}

export const isReleaseVersion = (value) => typeof value === "string" && versionPattern.test(value);
export const isReleaseArchitecture = (value) => typeof value === "string" && releaseArchitectures.includes(value);

export function assertReleaseIdentity(version, architecture) {
  const errors = [];
  if (!isReleaseVersion(version)) errors.push({ field: "version", message: "Use a stable version in X.Y.Z format, for example 0.0.1." });
  if (!isReleaseArchitecture(architecture)) errors.push({ field: "architecture", message: "Architecture must be x64, ia32, or arm64." });
  if (errors.length) throw releaseError(400, "Invalid Connector release details.", { errors });
}

export function compareReleaseVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

export function releaseFilename(version, architecture) {
  return `Flowups-Tally-Sync-Connector-Setup-${version}-${architecture}.exe`;
}

export function publicRelease(metadata) {
  return {
    version: metadata.version,
    architecture: metadata.architecture,
    filename: metadata.filename,
    size_bytes: metadata.size_bytes,
    sha256: metadata.sha256,
    published_at: metadata.published_at,
    download_url: `/api/v1/connector-releases/${metadata.version}/${metadata.architecture}/download`,
  };
}

export function assertInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw releaseError(500, "Invalid release storage path.");
  }
  return candidate;
}

export function releaseTokensMatch(received, expected) {
  if (typeof received !== "string" || !received) return false;
  const hash = (value) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(received), hash(expected));
}
