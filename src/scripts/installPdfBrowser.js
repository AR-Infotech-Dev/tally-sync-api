import 'dotenv/config';
import { resolvePdfBrowser } from '../modules/ledgers/pdf-browser.service.js';

try {
  console.info(`PDF browser ready: ${await resolvePdfBrowser()}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
