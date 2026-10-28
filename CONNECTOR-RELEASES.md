# Publish Connector installers from a Windows build

`npm run package:win` builds the protected Windows installer and uploads that exact installer when a release server URL is configured. The documentation at `/docs` reads the latest published release and provides a public Windows download button. The publish key is used only by the build computer and the Server.

## 1. Configure and deploy the Server

Generate a random publishing key on your own machine:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Add the following settings to the Server environment. Use the generated value for the key:

```dotenv
CONNECTOR_RELEASE_TOKEN=YOUR_RANDOM_PUBLISHING_KEY
CONNECTOR_RELEASES_DIR=/app/storage/connector-releases
CONNECTOR_RELEASE_MAX_MB=300
```

The key must be at least 32 characters. It is independent of registration credentials, application API keys, and Connector client keys. Do not put it in the HTML, a public URL, or the installed Connector application.

For a local Server, omit `CONNECTOR_RELEASES_DIR` to use `Server/storage/connector-releases`. For Docker/Coolify, mount persistent storage at `/app/storage/connector-releases` and give the container's `node` user write access. The Dockerfile creates this directory, but a persistent volume or bind mount is needed to retain installers across container replacement. Keep the environment path and mounted path the same.

Deploy the updated Server source and `public/docs/site/index.html`, then restart. If a reverse proxy sits in front of the Server, allow installer request bodies up to the configured limit and an upload duration appropriate for your connection. The default maximum is 300 MB. Proxy limits apply before Express receives a request.

## 2. Configure the build computer

From `Connector`, copy the sample settings:

```powershell
Copy-Item .env.release.example .env.release
```

Edit `.env.release`:

```dotenv
CONNECTOR_RELEASE_SERVER_URL=https://sync.flowups.in
CONNECTOR_RELEASE_TOKEN=YOUR_RANDOM_PUBLISHING_KEY
```

Use the same publishing key on the Server and the build computer. The URL is the API Server origin (`https://host` or `https://host:port`), without `/docs`, an API path, query parameters, or a fragment. Remote publishing requires HTTPS. HTTP is accepted for loopback testing only. Environment variables take precedence over `.env.release`.

`.env.release` is ignored by Git and is not copied into the packaged application. If no release URL is set, packaging remains a local build. If a URL is set but the key or URL is invalid, publishing configuration fails instead of silently skipping the upload.

## 3. Version, build, and publish

The installer version comes from `Connector/package.json`. Use a three-part numeric version such as `0.0.1`, `0.1.1`, or `0.1.2`. The existing project version is not changed by publishing.

For a new release, update the version first. For example:

```powershell
npm version 0.1.2 --no-git-tag-version
npm run package:win
```

The default build is Windows x64. To build the existing 32-bit target:

```powershell
npm run package:win -- --ia32
```

After packaging succeeds, the build streams the installer from `Connector/release/` to the configured Server. The Server checks its checksum and publishes it only after the complete file is saved. The build prints the resulting download information; it never prints the publishing key.

Open your Server's `/docs` page. The Connector download card shows the latest version available for the selected Windows architecture. Refresh the card or reload the page after publishing.

## Retry an upload without rebuilding

If upload fails, the local installer remains in `release/`. Correct the URL, key, proxy settings, or network problem, then run:

```powershell
npm run release:upload
# For a 32-bit installer:
npm run release:upload -- --ia32
```

This uploads the installer matching the current `package.json` version and architecture. It does not build another installer. Do not change the version between the failed build and this retry.

Published versions are immutable. Uploading the exact same file for a version/architecture is safe; different bytes for an existing version return a conflict. Increase the version for a changed build. Older versions remain downloadable; publishing an older version does not replace a newer version in the download card.

## Release service contract

The operational OpenAPI contract lives beside the release module. Publishing is intentionally absent from the client API reference.

| Request | Purpose |
| --- | --- |
| `POST /api/v1/connector-releases` | Publish a raw installer using `X-Release-Token`, version, architecture, and SHA-256 headers. |
| `GET /api/v1/connector-releases/latest?arch=x64` | Read public metadata for the latest release of an architecture. |
| `GET /api/v1/connector-releases/{version}/{architecture}/download` | Download the published installer, with normal HEAD/range support. |

No uploaded release returns `404` from the latest metadata endpoint, and the documentation shows an unavailable download state. Publish requests without a configured Server key return `503`; invalid credentials return `401`. A checksum mismatch or invalid installer never replaces an existing download.

The self-contained HTML can also be hosted separately on Vercel. In that case it requests metadata from the API base URL embedded by the documentation generator. Add the documentation site's exact origin to the Server's existing allowed origins for cross-origin metadata requests. When `/docs` is served by this Server, it uses the same origin.
