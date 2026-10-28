# Flowups API documentation

`index.html` is the complete documentation website. Its CSS, JavaScript, code examples, and downloadable OpenAPI specification are embedded. The API reference works without a build, CDN, or connection to the API server. The Connector download card requests current installer metadata from the API server.

## Host with the existing API server

The Express application serves this HTML at `GET /docs` and `GET /docs/`. Deploy the updated `src/app.js` together with `public/docs/site/index.html`, then restart or redeploy the Server.

- Production: `https://sync.flowups.in/docs`
- Local: `http://localhost:<server-port>/docs`

The existing Dockerfile already copies `public/`, so no extra build step or proxy rewrite is needed when the domain forwards requests to this Express application. The documentation URL is separate from the `/api/v1/` API prefix.

## Connector downloads

The Download Connector section reads the newest published installer for 64-bit or 32-bit Windows. The server publishes a new version after a configured Connector build uploads successfully. Before the first release, the card explains that no installer is available.

See `Server/CONNECTOR-RELEASES.md` for the publishing key, build computer URL, and persistent server storage setup. No publishing key is included in the documentation or browser requests.

## Host on Vercel

1. Put `index.html` and `vercel.json` in a new Git repository, or use this existing Server repository.
2. Import that repository into Vercel.
3. Set **Root Directory** to `public/docs/site` when importing the Server repository. For a new repository containing these files at its root, use `./`.
4. Choose **Framework Preset: Other**, leave **Build Command** and **Install Command** empty, and set **Output Directory** to `.`. The included `vercel.json` supplies these settings.
5. Deploy. The reference itself needs no environment variables. Live Connector download information comes from the configured API server; allow the documentation origin in the Server's existing CORS settings when it is hosted separately.

If importing a repository containing both `Server` and `Connector`, use `Server/public/docs/site` as Root Directory.

Only the documentation folder should be the deployment root. The production API base URL shown in examples is `https://sync.flowups.in`; hosting documentation does not move or deploy the API.

Vercel reference: [Build configuration for static HTML sites](https://vercel.com/docs/builds/configure-a-build).

## Maintain the reference

The source contract is `../tally-sync-api.openapi.yaml`. The published page and its downloadable specification include client APIs only: Client Registration contains only `POST /api/v1/clients/register`. Internal Connector operations, activation, and Admin Console operations are excluded by the generator. The full engineering source contract remains available locally.

The renderer, styles, browser interactions, and HTML template are in the parent `docs` folder. After a documentation change, run from `Server`:

```powershell
node public/docs/build-static-docs.mjs
```

Generation uses `js-yaml` from installed project dependencies (including the existing Connector build dependencies). The generated website has no runtime dependencies. Commit the regenerated `index.html` with source documentation changes. No generation command is needed on Vercel.

Examples use placeholders. Search and code tabs are local browser interactions. The only automatic API request retrieves public installer metadata; this site does not execute the documented CRM requests or collect credentials.
