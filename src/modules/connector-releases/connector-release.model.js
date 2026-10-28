import { mkdir, mkdtemp, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertInside, compareReleaseVersions, isReleaseVersion, releaseError, releaseFilename } from "./connector-release.utils.js";

const artifactPath = (root, version, architecture) => assertInside(root, path.join(root, version, architecture));

export async function createReleaseStaging(root) {
  await mkdir(root, { recursive: true });
  const directory = assertInside(root, await mkdtemp(path.join(root, ".upload-")));
  const filePath = path.join(directory, "installer.exe");
  try {
    const file = await open(filePath, "wx");
    return { directory, filePath, file };
  } catch (error) {
    await cleanupReleaseStaging(root, directory);
    throw error;
  }
}

export async function cleanupReleaseStaging(root, directory) {
  assertInside(root, directory);
  if (!path.basename(directory).startsWith(".upload-")) throw releaseError(500, "Invalid release staging path.");
  await rm(directory, { recursive: true, force: true });
}

export async function findRelease(root, version, architecture) {
  const directory = artifactPath(root, version, architecture);
  try {
    const metadata = JSON.parse(await readFile(path.join(directory, "metadata.json"), "utf8"));
    if (metadata.version !== version || metadata.architecture !== architecture || metadata.filename !== releaseFilename(version, architecture)) return null;
    const filePath = path.join(directory, "installer.exe");
    const fileStat = await stat(filePath);
    if (!fileStat.isFile() || fileStat.size !== metadata.size_bytes) return null;
    return { metadata, filePath };
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error.code)) return null;
    throw error;
  }
}

export async function findLatestRelease(root, architecture) {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  const versions = entries.filter((entry) => entry.isDirectory() && isReleaseVersion(entry.name)).map((entry) => entry.name).sort((a, b) => compareReleaseVersions(b, a));
  for (const version of versions) {
    const release = await findRelease(root, version, architecture);
    if (release) return release;
  }
  return null;
}

export async function publishRelease(root, staging, metadata) {
  await writeFile(path.join(staging.directory, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, { flag: "wx" });
  const destination = artifactPath(root, metadata.version, metadata.architecture);
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    // The directory contains both the completed file and metadata before becoming visible.
    await rename(staging.directory, destination);
    return { metadata, duplicate: false };
  } catch (error) {
    const existing = await findRelease(root, metadata.version, metadata.architecture);
    if (!existing) throw error;
    if (existing.metadata.sha256 !== metadata.sha256) throw releaseError(409, "This Connector version and architecture are already published with a different installer. Increase the package version before publishing again.");
    return { metadata: existing.metadata, duplicate: true };
  }
}
