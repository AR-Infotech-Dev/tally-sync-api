import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Browser, computeExecutablePath, detectBrowserPlatform, install } from '@puppeteer/browsers';
import { PUPPETEER_REVISIONS } from 'puppeteer-core';

export function createPdfBrowserResolver({ env = process.env, platform = process.platform, exists = async p => { try { await access(p, constants.X_OK); return true; } catch { return false; } }, installBrowser = install } = {}) {
  let pending;
  return async function resolveBrowser() {
    if (env.PDF_BROWSER_EXECUTABLE_PATH) {
      if (await exists(env.PDF_BROWSER_EXECUTABLE_PATH)) return env.PDF_BROWSER_EXECUTABLE_PATH;
      throw new Error('Configured PDF_BROWSER_EXECUTABLE_PATH is unavailable. Correct it or remove it to enable automatic browser setup.');
    }
    const systemPaths = platform === 'win32' ? [
      path.join(env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
      path.join(env.PROGRAMFILES || 'C:/Program Files', 'Microsoft/Edge/Application/msedge.exe'),
      path.join(env.PROGRAMFILES || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
    ] : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/microsoft-edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
    for (const candidate of systemPaths) if (await exists(candidate)) return candidate;
    const options = {
      browser: Browser.CHROME,
      buildId: PUPPETEER_REVISIONS.chrome,
      platform: detectBrowserPlatform(),
      cacheDir: env.PDF_BROWSER_CACHE_DIR || fileURLToPath(new URL('../../../.cache/pdf-browser', import.meta.url)),
    };
    if (!options.platform) throw new Error('Automatic PDF browser setup does not support this platform. Set PDF_BROWSER_EXECUTABLE_PATH.');
    const executable = computeExecutablePath(options);
    if (await exists(executable)) return executable;
    if (!pending) pending = installBrowser({...options, installDeps: env.PDF_BROWSER_INSTALL_DEPS === 'true'})
      .then(browser => browser.executablePath)
      .catch(error => { throw new Error(`Automatic PDF browser installation failed: ${error.message}. Check outbound download access and PDF_BROWSER_CACHE_DIR write permission.`); })
      .finally(() => { pending = undefined; });
    return pending;
  };
}

export const resolvePdfBrowser = createPdfBrowserResolver();
