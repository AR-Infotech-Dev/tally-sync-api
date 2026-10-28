import { assertReleaseIdentity, releaseError } from "./connector-release.utils.js";

export function validateReleaseUpload(req, maxBytes) {
  const version = req.get("x-connector-version");
  const architecture = req.get("x-connector-arch");
  assertReleaseIdentity(version, architecture);
  if (req.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/octet-stream") {
    throw releaseError(415, "Upload the installer as raw application/octet-stream bytes.");
  }
  const sha256 = req.get("x-installer-sha256");
  if (typeof sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(sha256)) {
    throw releaseError(400, "X-Installer-SHA256 must contain the installer's 64-character SHA-256 checksum.", { errors: [{ field: "sha256", message: "A valid SHA-256 checksum is required." }] });
  }
  const length = req.get("content-length");
  if (length !== undefined && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) throw releaseError(400, "Invalid Content-Length header.");
  if (length !== undefined && Number(length) > maxBytes) throw releaseError(413, "Connector installer exceeds the configured upload size limit.");
  if (length !== undefined && Number(length) < 2) throw releaseError(400, "A Windows executable installer is required.");
  return { version, architecture, sha256: sha256.toLowerCase(), contentLength: length === undefined ? null : Number(length) };
}
