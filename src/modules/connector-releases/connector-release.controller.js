import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { successResponse } from "../../shared/utils/apiResponse.js";
import { getConnectorReleaseDownload, getLatestConnectorRelease, uploadConnectorRelease } from "./connector-release.service.js";

export const publishConnectorRelease = asyncHandler(async (req, res) => {
  const result = await uploadConnectorRelease(req);
  return successResponse(res, {
    code: result.duplicate ? 1000 : 1001,
    httpStatus: result.duplicate ? 200 : 201,
    message: result.duplicate ? "This Connector installer is already published." : "Connector installer published.",
    data: result,
  });
});

export const readLatestConnectorRelease = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");
  const release = await getLatestConnectorRelease(req.query.arch === undefined ? "x64" : req.query.arch);
  return successResponse(res, { message: "Latest Connector installer retrieved.", data: { release } });
});

export const downloadConnectorRelease = asyncHandler(async (req, res, next) => {
  const result = await getConnectorReleaseDownload(req.params.version, req.params.architecture);
  res.set({ "Content-Type": "application/octet-stream", "X-Installer-SHA256": result.release.sha256, "Cache-Control": "public, max-age=31536000, immutable" });
  res.download(result.filePath, result.release.filename, (error) => { if (error) next(error); });
});
