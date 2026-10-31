# HTML PDF rendering

Ledger Statement, Group Summary, Outstanding and Stock Item Movement Analysis
use Puppeteer through `src/shared/utils/htmlPdf.js`. The API routes and request
bodies are unchanged. Sales Invoice remains a native Tally PDF export.

Edit normal HTML, Handlebars and CSS in `src/templates/*.hbs`. Each report
owns its print styles in its own `<style>` tag. The renderer embeds fonts and
the reusable utility classes from `src/templates/pdf.css` into every HTML PDF.
No external CSS URL or CDN is needed, including in Docker.

For example, `<th class="border-top border-bottom text-right px-2 py-1">Amount</th>`
adds header rules and alignment. Use `border-none` or `border-left-none` on the
individual `th`/`td` to remove cell borders. Utility spacing uses 4px units;
these are project utilities, not the complete Tailwind framework.
No `data-pdfmake` attributes are needed. Fonts are embedded, remote resources
are blocked, and JavaScript is disabled. Use embedded data URLs for images.
The browser is reused with at most two active PDF pages.

## Local development

Run `npm ci`. Puppeteer downloads its compatible Chrome during installation.
If dependency install scripts were disabled, run `npx puppeteer browsers install chrome`.
Start the API normally using `npm run dev`.

## Coolify / Docker

Use the repository Dockerfile as the Coolify build pack. It installs Debian
Chromium and fonts during image build; users do not install a browser on their
computers. Rebuild/redeploy the image after pulling these changes.

The image sets `PUPPETEER_SKIP_DOWNLOAD=true`,
`PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` and
`PDF_BROWSER_NO_SANDBOX=true`. The last setting supports containers where
Chromium's sandbox cannot start; the browser runs as the existing non-root
`node` user. Do not copy that setting to environments that support sandboxing.

Browser launch uses `/usr/bin/chromium` in Docker and Puppeteer's downloaded
Chrome locally. Keep at least enough memory for two browser pages and your API.
This setup requires Dockerfile builds; a Nixpacks build does not execute this file.
