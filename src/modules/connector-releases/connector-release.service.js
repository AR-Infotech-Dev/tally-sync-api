import { createHash } from "node:crypto";
import { createReleaseStaging, cleanupReleaseStaging, findLatestRelease, findRelease, publishRelease } from "./connector-release.model.js";
import { getReleaseConfig } from "./connector-release.config.js";
import { assertReleaseIdentity, publicRelease, releaseError, releaseFilename } from "./connector-release.utils.js";
import { validateReleaseUpload } from "./connector-release.validator.js";

export async function uploadConnectorRelease(req) {
  const config = req.releaseConfig;
  const input = validateReleaseUpload(req, config.maxBytes);
  const staging = await createReleaseStaging(config.storageDir);
  let size = 0;
  let signature = Buffer.alloc(0);
  const digest = createHash("sha256");
  try {
    try {
      // Keep the incoming socket usable for a JSON error response on a size failure.
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > config.maxBytes) throw releaseError(413, "Connector installer exceeds the configured upload size limit.");
        if (signature.length < 2) signature = Buffer.concat([signature, chunk.subarray(0, 2 - signature.length)]);
        if (signature.length === 2 && signature.toString("ascii") !== "MZ") throw releaseError(400, "The uploaded file is not a Windows executable installer.");
        digest.update(chunk);
        let offset = 0;
        while (offset < chunk.length) {
          const { bytesWritten } = await staging.file.write(chunk, offset, chunk.length - offset, null);
          if (!bytesWritten) throw releaseError(500, "Could not write the Connector installer.");
          offset += bytesWritten;
        }
      }
      if (req.aborted || !req.complete || size < 2 || (input.contentLength !== null && size !== input.contentLength)) throw releaseError(400, "The Connector installer upload did not complete.");
      if (digest.digest("hex") !== input.sha256) throw releaseError(400, "The uploaded installer checksum does not match X-Installer-SHA256.");
      await staging.file.sync();
    } finally { await staging.file.close(); }
    const metadata = {
      version: input.version,
      architecture: input.architecture,
      filename: releaseFilename(input.version, input.architecture),
      size_bytes: size,
      sha256: input.sha256,
      published_at: new Date().toISOString(),
    };
    const published = await publishRelease(config.storageDir, staging, metadata);
    return { release: publicRelease(published.metadata), duplicate: published.duplicate };
  } catch (error) {
    if (!req.aborted && !req.readableEnded) req.resume();
    if (error.apiCode) throw error;
    if (req.aborted || error.code === "ECONNRESET") throw releaseError(400, "The Connector installer upload was interrupted.");
    throw releaseError(500, "The Connector installer could not be stored. Check the server release storage configuration.");
  } finally { await cleanupReleaseStaging(config.storageDir, staging.directory); }
}

export async function getLatestConnectorRelease(architecture = "x64") {
  assertReleaseIdentity("0.0.0", architecture);
  const { storageDir } = getReleaseConfig();
  const found = await findLatestRelease(storageDir, architecture);
  if (!found) throw releaseError(404, "No Connector installer has been published for this architecture yet.");
  return publicRelease(found.metadata);
}

export async function getConnectorReleaseDownload(version, architecture) {
  assertReleaseIdentity(version, architecture);
  const { storageDir } = getReleaseConfig();
  const found = await findRelease(storageDir, version, architecture);
  if (!found) throw releaseError(404, "Connector installer not found.");
  return { ...found, release: publicRelease(found.metadata) };
}
