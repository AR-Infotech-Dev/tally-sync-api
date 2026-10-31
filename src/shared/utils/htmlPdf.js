import puppeteer from "puppeteer";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
let browserPromise;
let fontCssPromise;
let active = 0;
const waiting = [];
const limit = 2;

async function getFontCss() {
  fontCssPromise ||= (async () => {
    const root = path.join(path.dirname(require.resolve("@fontsource/noto-sans-devanagari/package.json")), "files");
    const faces = await Promise.all(["latin", "devanagari"].flatMap((subset) => [400, 700].map(async (weight) => {
      const data = await readFile(path.join(root, `noto-sans-devanagari-${subset}-${weight}-normal.woff`));
      return `@font-face{font-family:Report-${subset};font-weight:${weight};src:url(data:font/woff;base64,${data.toString("base64")}) format('woff');}`;
    })));
    return faces.join("\n");
  })();
  return fontCssPromise;
}

async function browser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({ headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, args: process.env.PDF_BROWSER_NO_SANDBOX === "true" ? ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] : ["--disable-dev-shm-usage"] }).then((instance) => {
      instance.on("disconnected", () => { browserPromise = undefined; });
      return instance;
    }).catch((error) => { browserPromise = undefined; throw error; });
  }
  return browserPromise;
}

export async function closePdfBrowser() {
  if (browserPromise) await (await browserPromise).close();
}

export async function renderHtmlPdf(html, { landscape = false, showPageNumber = true } = {}) {
  if (active >= limit) await new Promise((resolve) => waiting.push(resolve));
  else active++;
  let page;
  try {
    page = await (await browser()).newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (request) => { if (request.url().startsWith("data:")) void request.continue(); else void request.abort(); });
    // Embed shared utility classes for every HTML PDF; local template styles remain editable.
    const [fonts, utilities] = await Promise.all([getFontCss(), readFile(new URL("../../templates/pdf.css", import.meta.url), "utf8")]);
    const style = `<style>${fonts}\n${utilities}</style>`;
    const document = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (head) => head + style) : style + html;
    await page.setContent(document, { waitUntil: "load", timeout: 30000 });
    await page.emulateMediaType("print");
    return Buffer.from(await page.pdf({ format: "A4", landscape, printBackground: true, waitForFonts: true, timeout: 30000, margin: { top: "12mm", bottom: "15mm", left: "12mm", right: "12mm" }, displayHeaderFooter: showPageNumber, headerTemplate: "<span></span>", footerTemplate: '<div style="font-size:10px;width:100%;text-align:right;padding:0 12mm;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>' }));
  } finally {
    try { await page?.close(); } finally { const next = waiting.shift(); if (next) next(); else active--; }
  }
}
