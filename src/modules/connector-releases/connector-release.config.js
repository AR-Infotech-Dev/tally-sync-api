import path from "node:path";
import { fileURLToPath } from "node:url";
import { releaseError } from "./connector-release.utils.js";

const serverRoot = fileURLToPath(new URL("../../../", import.meta.url));
const publicRoot = path.join(serverRoot, "public");

export function getReleaseConfig() {
  const storageDir = path.resolve(serverRoot, process.env.CONNECTOR_RELEASES_DIR || "storage/connector-releases");
  const relativeToPublic = path.relative(publicRoot, storageDir);
  if (!relativeToPublic || (!relativeToPublic.startsWith(`..${path.sep}`) && relativeToPublic !== ".." && !path.isAbsolute(relativeToPublic))) {
    throw releaseError(503, "Connector release storage must be outside the public directory.");
  }
  const maxMb = Number(process.env.CONNECTOR_RELEASE_MAX_MB || 300);
  if (!Number.isFinite(maxMb) || maxMb <= 0 || maxMb > 2048) throw releaseError(503, "Invalid Connector release upload size configuration.");
  return {
    storageDir,
    maxBytes: Math.floor(maxMb * 1024 * 1024),
    token: process.env.CONNECTOR_RELEASE_TOKEN?.trim() || "",
  };
}
