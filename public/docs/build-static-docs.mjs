import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const docsDir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let yaml;
try {
  // Support documentation kept in docs/ or public/docs/ using existing dependencies.
  yaml = require(require.resolve('js-yaml', { paths: [docsDir, resolve(docsDir, '../../Connector'), resolve(docsDir, '../../../Connector')] }));
} catch { throw new Error('Documentation generation needs js-yaml. Install project dependencies in Connector first. The generated HTML itself has no dependencies.'); }
const sourceSpec = yaml.load(await readFile(join(docsDir, 'tally-sync-api.openapi.yaml'), 'utf8'));
const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);

function includeInPublicDocs(path, operation) {
  if (path.startsWith('/api/console') || /\/connector(?:\/|$)/.test(path)) return false;
  if (path.startsWith('/api/v1/clients/') && path !== '/api/v1/clients/register') return false;
  const securityKeys = (operation.security || sourceSpec.security || []).flatMap((item) => Object.keys(item));
  return !securityKeys.some((key) => ['connectorApiKey', 'consoleSession'].includes(key));
}

// Apply the same audience filter to the page and its downloadable specification.
const spec = {
  ...sourceSpec,
  info: {
    ...sourceSpec.info,
    description: 'Client API for registration, Sales Orders, Sales Vouchers, Receipts, Purchase Orders, Purchases, Payments, ledger statements and PDF downloads. Application authentication uses X-Client-ID plus X-API-Key. Voucher pushes wait for a final result: HTTP 200 succeeds, 502 rejects, and 504 returns request_id when the wait expires. Pending Sales PDF exports use HTTP 202 polling. Examples use fictional values and require matching Tally masters.',
  },
  paths: Object.fromEntries(Object.entries(sourceSpec.paths).flatMap(([path, item]) => {
    const filtered = Object.fromEntries(Object.entries(item).filter(([key, value]) => !httpMethods.has(key) || includeInPublicDocs(path, value)));
    return Object.keys(filtered).some((key) => httpMethods.has(key)) ? [[path, filtered]] : [];
  })),
};
const publishedTags = new Set(Object.values(spec.paths).flatMap((item) => Object.entries(item).filter(([key]) => httpMethods.has(key)).flatMap(([, operation]) => operation.tags || [])));
spec.tags = sourceSpec.tags.filter((tag) => publishedTags.has(tag.name));
delete spec.components;

// Keep only components reachable from the published operations, including nested refs.
const components = {};
const visitedRefs = new Set();
function retainReferences(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.$ref === 'string' && value.$ref.startsWith('#/') && !visitedRefs.has(value.$ref)) {
    visitedRefs.add(value.$ref);
    const segments = value.$ref.slice(2).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
    const target = segments.reduce((object, key) => object?.[key], sourceSpec);
    if (!target) throw new Error(`Unresolved source reference: ${value.$ref}`);
    if (segments[0] === 'components') {
      const [, section, name] = segments;
      const component = sourceSpec.components[section][name];
      (components[section] ||= {})[name] = component;
      retainReferences(component);
    } else retainReferences(target);
  }
  for (const child of Object.values(value)) retainReferences(child);
  for (const security of Array.isArray(value.security) ? value.security : []) {
    for (const name of Object.keys(security)) {
      retainReferences({ $ref: `#/components/securitySchemes/${name}` });
    }
  }
}
retainReferences(spec);
spec.components = components;
const escape = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const rich = (value = '') => escape(value).replace(/`([^`]+)`/g, '<code>$1</code>');
const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const json = (value) => JSON.stringify(value, null, 2);
function deref(value) {
  if (!value?.$ref) return value || {};
  if (!value.$ref.startsWith('#/')) throw new Error(`External reference is not supported: ${value.$ref}`);
  const result = value.$ref.slice(2).split('/').reduce((object, part) => object?.[part.replace(/~1/g, '/').replace(/~0/g, '~')], spec);
  if (!result) throw new Error(`Unresolved OpenAPI reference: ${value.$ref}`);
  return { ...deref(result), ...Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$ref')) };
}
function schemaOf(input) {
  const schema = deref(input);
  if (!schema.allOf) return schema;
  return schema.allOf.map(schemaOf).reduce((result, child) => ({ ...result, ...child, properties: { ...result.properties, ...child.properties }, required: [...new Set([...(result.required || []), ...(child.required || [])])] }), schema);
}
function exampleOf(media) {
  if (!media) return undefined;
  if (media.example !== undefined) return media.example;
  const first = Object.values(media.examples || {})[0];
  if (first) return deref(first).value;
  return schemaOf(media.schema).example;
}
const defaults = {
  company: 'Demo Company', ledger_name: 'Demo Customer', party_ledger: 'Demo Customer',
  voucher_no: 'INV-1001', voucher_number: 'INV-1001', voucher_date: '2026-10-28',
  activation_code: 'PASTE_43_CHARACTER_CODE_FROM_EMAIL', username: 'YOUR_CONSOLE_USERNAME',
  password: 'YOUR_CONSOLE_PASSWORD', requestId: '18771bcc-5374-4c11-8e43-0b930659de08',
};
function schemaExample(input, name = '', depth = 0) {
  const schema = schemaOf(input);
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (defaults[name]) return defaults[name];
  if (schema.enum) return schema.enum[0];
  if (depth > 5) return {};
  if (schema.type === 'object' || schema.properties) return Object.fromEntries(Object.entries(schema.properties || {}).filter(([key]) => !schema.required?.length || schema.required.includes(key)).map(([key, child]) => [key, schemaExample(child, key, depth + 1)]));
  if (schema.type === 'array') return [schemaExample(schema.items, name, depth + 1)];
  if (schema.type === 'boolean') return true;
  if (['integer', 'number'].includes(schema.type)) return typeof schema.minimum === 'number' ? schema.minimum : 1;
  if (schema.format === 'date') return '2026-10-28';
  return 'string';
}
function fieldRows(input, prefix = '', depth = 0, parentRequired = true) {
  const schema = schemaOf(input);
  if (depth > 5) return [];
  return Object.entries(schema.properties || {}).flatMap(([name, value]) => {
    const child = schemaOf(value);
    const path = prefix ? `${prefix}.${name}` : name;
    const required = (schema.required || []).includes(name);
    const parts = [];
    if (child.description) parts.push(child.description);
    if (child.enum) parts.push(`Allowed: ${child.enum.map((item) => JSON.stringify(item)).join(', ')}.`);
    if (child.default !== undefined) parts.push(`Default: ${JSON.stringify(child.default)}.`);
    if (child.maxLength) parts.push(`Maximum ${child.maxLength} characters.`);
    if (typeof child.minimum === 'number') parts.push(`Minimum: ${child.minimum}.`);
    if (child.exclusiveMinimum === true) parts.push('Value must exceed the minimum.');
    else if (typeof child.exclusiveMinimum === 'number') parts.push(`Must be greater than ${child.exclusiveMinimum}.`);
    if (child.minItems) parts.push(`At least ${child.minItems} item${child.minItems === 1 ? '' : 's'}.`);
    if (required && !parentRequired) parts.push('Required when its parent object is supplied.');
    const type = child.type || (child.properties ? 'object' : child.oneOf ? 'one of' : 'any');
    const row = `<div class="field"><div class="field-meta"><code class="field-name">${escape(path)}</code><span class="field-type">${escape(type)}${child.format ? ` · ${escape(child.format)}` : ''}</span>${required ? '<span class="required">required</span>' : ''}</div><div class="field-description">${parts.map(rich).join(' ') || 'See the request example.'}</div></div>`;
    const nested = child.type === 'array' ? fieldRows(child.items, `${path}[]`, depth + 1, required && parentRequired) : fieldRows(child, path, depth + 1, required && parentRequired);
    return [row, ...nested];
  });
}
const copyButton = '<button type="button" class="copy-button" aria-label="Copy code"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4"/></svg><span>Copy</span></button>';
function codePanel(title, text, language = 'json') {
  return `<div class="code-panel"><div class="code-heading"><span>${escape(title)}</span>${copyButton}</div><pre><code class="language-${language}">${escape(text)}</code></pre></div>`;
}
function authType(operation) {
  const keys = (operation.security || spec.security || []).flatMap((item) => Object.keys(item));
  if (keys.includes('connectorApiKey')) return 'connector';
  if (keys.includes('consoleSession')) return 'console';
  if (keys.includes('clientApiKey')) return 'client';
  return 'public';
}
function groupName(path, operation) {
  if (authType(operation) === 'connector') return 'Connector Reference';
  if (path.startsWith('/api/console')) return 'Admin Console';
  if (path.startsWith('/api/v1/purchase-orders')) return 'Purchase Orders';
  if (path.startsWith('/api/v1/purchases')) return 'Purchase Vouchers';
  if (path.startsWith('/api/v1/payments')) return 'Payment Vouchers';
  return operation.tags?.[0] || 'Other';
}
const operations = Object.entries(spec.paths).flatMap(([path, item]) => Object.entries(item).filter(([method]) => ['get', 'post', 'put', 'patch', 'delete'].includes(method)).map(([method, operation]) => ({ path, method: method.toUpperCase(), operation, id: `op-${slug(operation.operationId || `${method}-${path}`)}`, parameters: [...(item.parameters || []), ...(operation.parameters || [])].map(deref) })));
if (new Set(operations.map(({ id }) => id)).size !== operations.length) throw new Error('Operation IDs must be unique.');
const groupOrder = ['Client Registration', 'Sales Orders', 'Sales Vouchers', 'Receipt Vouchers', 'Purchase Orders', 'Purchase Vouchers', 'Payment Vouchers', 'Ledger Statements', 'Health'];
const descriptions = {
  'Client Registration': 'Register your application and receive your credentials by email.',
  'Sales Orders': 'Create Sales Orders and retrieve existing orders directly from Tally.',
  'Sales Vouchers': 'Create invoices, look up Sales vouchers, and export Tally invoice PDFs.',
  'Receipt Vouchers': 'Record money received from customers against a cash or bank ledger.',
  'Purchase Orders': 'Create supplier purchase orders with an explicit delivery due date.',
  'Purchase Vouchers': 'Record supplier purchases with inventory and a purchase ledger.',
  'Payment Vouchers': 'Record supplier payments from a cash or bank ledger.',
  'Ledger Statements': 'Read a synced ledger statement as JSON or a downloadable PDF.',
  Health: 'Check whether the API server is running. This does not confirm Tally connectivity.',
  'Connector Reference': 'Internal desktop Connector endpoints. Use Connector credentials; CRM applications use the client endpoints above.',
  'Admin Console': 'Operations console endpoints. Session authentication is independent of the CRM API key.',
};
const baseUrl = spec.servers.find((server) => server.url.startsWith('https://'))?.url || spec.servers[0].url;
function requestSamples(entry) {
  const { method, path, parameters, operation } = entry;
  const body = deref(operation.requestBody);
  const jsonMedia = body.content?.['application/json'];
  const binary = !!body.content?.['application/pdf'];
  const example = jsonMedia ? (exampleOf(jsonMedia) ?? schemaExample(jsonMedia.schema)) : undefined;
  const query = parameters.filter((parameter) => parameter.in === 'query' && parameter.required).map((parameter) => `${encodeURIComponent(parameter.name)}=${encodeURIComponent(parameter.example ?? parameter.schema?.example ?? defaults[parameter.name] ?? 'value')}`).join('&');
  const url = `${baseUrl}${path.replace(/\{([^}]+)\}/g, (_match, name) => defaults[name] || 'REQUEST_ID')}${query ? `?${query}` : ''}`;
  const auth = authType(operation);
  const curlHeaders = [];
  const jsHeaders = [];
  const pyHeaders = [];
  if (auth === 'client' || auth === 'connector') {
    curlHeaders.push('X-Client-ID: $CLIENT_ID', auth === 'client' ? 'X-API-Key: $API_KEY' : 'X-Connector-Key: $CONNECTOR_KEY');
    jsHeaders.push(`'X-Client-ID': process.env.CLIENT_ID`, `'${auth === 'client' ? 'X-API-Key' : 'X-Connector-Key'}': process.env.${auth === 'client' ? 'API_KEY' : 'CONNECTOR_KEY'}`);
    pyHeaders.push(`"X-Client-ID": os.environ["CLIENT_ID"]`, `"${auth === 'client' ? 'X-API-Key' : 'X-Connector-Key'}": os.environ["${auth === 'client' ? 'API_KEY' : 'CONNECTOR_KEY'}"]`);
  }
  if (auth === 'console') { curlHeaders.push('Cookie: $CONSOLE_COOKIE'); jsHeaders.push(`'Cookie': process.env.CONSOLE_COOKIE`); pyHeaders.push('"Cookie": os.environ["CONSOLE_COOKIE"]'); }
  if (jsonMedia || binary) {
    const contentType = binary ? 'application/pdf' : 'application/json';
    curlHeaders.push(`Content-Type: ${contentType}`);
    jsHeaders.push(`'Content-Type': '${contentType}'`);
    pyHeaders.push(`"Content-Type": "${contentType}"`);
  }
  const curl = [`curl --request ${method} '${url}'`, ...curlHeaders.map((header) => `  --header "${header}"`), ...(binary ? ["  --data-binary '@voucher.pdf'"] : example === undefined ? [] : [`  --data '${json(example).replace(/'/g, "'\\''")}'`])].join(' \\\n');
  const js = `${binary ? "import { readFile } from 'node:fs/promises';\n\n" : ''}const response = await fetch(${JSON.stringify(url)}, {\n  method: '${method}',\n  headers: {${jsHeaders.length ? `\n    ${jsHeaders.join(',\n    ')}\n  ` : ''}}${binary ? ",\n  body: await readFile('voucher.pdf')" : example === undefined ? '' : `,\n  body: JSON.stringify(${json(example).replace(/\n/g, '\n  ')})`}\n});\n\n// Inspect the status before treating a PDF export as complete.\nconst contentType = response.headers.get('content-type') || '';\nconst result = contentType.includes('application/pdf')\n  ? await response.arrayBuffer()\n  : await response.json();\nconsole.log(response.status, result);`;
  const pythonBody = example === undefined ? '' : `payload = json.loads(r'''${json(example).replace(/'''/g, "\\u0027\\u0027\\u0027")}''')\n\n`;
  const python = `import os\n${example === undefined ? '' : 'import json\n'}import requests\n\n${pythonBody}${binary ? 'with open("voucher.pdf", "rb") as pdf_file:\n    ' : ''}response = requests.request(\n${binary ? '    ' : ''}    ${JSON.stringify(method)},\n${binary ? '    ' : ''}    ${JSON.stringify(url)},\n${binary ? '    ' : ''}    headers={${pyHeaders.length ? `\n${binary ? '    ' : ''}        ${pyHeaders.join(`,\n${binary ? '    ' : ''}        `)}\n${binary ? '    ' : ''}    ` : ''}},${binary ? '\n        data=pdf_file,' : example === undefined ? '' : '\n    json=payload,'}\n${binary ? '    ' : ''}    timeout=150,\n${binary ? '    ' : ''})\n\nresult = (response.content\n          if 'application/pdf' in response.headers.get('Content-Type', '')\n          else response.json())\nprint(response.status_code, result)`;
  return { snippets: [curl, js, python], example, jsonMedia, binary };
}
function renderOperation(entry) {
  const { id, method, path, operation, parameters } = entry;
  const { snippets, example, jsonMedia, binary } = requestSamples(entry);
  const auth = authType(operation);
  const authLabel = { public: 'Public endpoint · no API key required', client: 'Client authentication · X-Client-ID + X-API-Key', connector: 'Connector only · X-Client-ID + X-Connector-Key', console: 'Admin authentication · tally_console_session cookie' }[auth];
  const parameterFields = parameters.map((parameter) => `<div class="field"><div class="field-meta"><code class="field-name">${escape(parameter.name)}</code><span class="field-type">${escape(parameter.in)} · ${escape(parameter.schema?.type || 'string')}</span>${parameter.required ? '<span class="required">required</span>' : ''}</div><div class="field-description">${rich(parameter.description || '')}${parameter.schema?.enum ? ` Allowed: ${parameter.schema.enum.map(escape).join(', ')}.` : ''}</div></div>`).join('');
  const responses = Object.entries(operation.responses || {}).map(([status, input]) => {
    const response = deref(input);
    const media = response.content?.['application/json'];
    const responseExample = exampleOf(media);
    return `<details class="response"><summary><span class="http-code ${Number(status) < 300 ? 'ok' : ''}">${escape(status)}</span><span class="response-description">${rich(response.description || '')}</span></summary><div class="response-body">${responseExample !== undefined ? codePanel('Example response · JSON', json(responseExample)) : response.content?.['application/pdf'] ? codePanel('Response · application/pdf', 'Binary PDF bytes. Save the successful response as a .pdf file.', 'text') : '<p class="muted">This response uses the description above; no fixed response example is specified.</p>'}</div></details>`;
  }).join('');
  const searchText = `${method} ${path} ${operation.summary} ${operation.description || ''} ${groupName(path, operation)} ${jsonMedia ? fieldRows(jsonMedia.schema).join(' ').replace(/<[^>]+>/g, ' ') : ''}`.toLowerCase();
  return `<details class="endpoint" id="${id}" data-search="${escape(searchText)}"><summary><span class="method ${method.toLowerCase()}">${method}</span><code class="endpoint-path">${escape(path)}</code><span class="endpoint-summary">${escape(operation.summary)}</span><span class="endpoint-chevron" aria-hidden="true">⌄</span></summary><div class="endpoint-body"><div class="endpoint-grid"><div class="endpoint-description"><div class="auth-note ${auth}">${authLabel}</div>${operation.description ? `<p>${rich(operation.description)}</p>` : ''}${parameterFields ? `<h4>Parameters</h4><div class="field-list">${parameterFields}</div>` : ''}${jsonMedia ? `<h4>Request body <span class="field-type">application/json</span></h4><div class="field-list">${fieldRows(jsonMedia.schema).join('')}</div>` : binary ? '<h4>Request body</h4><p>Raw PDF bytes with <code>Content-Type: application/pdf</code>. This is a binary upload, not multipart form data.</p>' : ''}</div><div class="examples"><div class="code-panel"><div class="code-heading"><div class="code-tabs" role="tablist" aria-label="${escape(operation.summary)} request language">${['cURL', 'JavaScript', 'Python'].map((language, index) => `<button type="button" role="tab" class="code-tab" id="${id}-tab-${index}" aria-controls="${id}-code-${index}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${language}</button>`).join('')}</div>${copyButton}</div>${snippets.map((snippet, index) => `<pre role="tabpanel" tabindex="0" id="${id}-code-${index}" aria-labelledby="${id}-tab-${index}"${index ? ' hidden' : ''}><code>${escape(snippet)}</code></pre>`).join('')}</div>${example === undefined ? '' : codePanel('Example request body', json(example))}</div></div><h4>Responses</h4><div class="response-list">${responses}</div><a class="endpoint-permalink" href="#${id}">Link to this endpoint ↗</a></div></details>`;
}

const groupNames = [...new Set([...groupOrder, ...operations.map((entry) => groupName(entry.path, entry.operation))])].filter((name) => operations.some((entry) => groupName(entry.path, entry.operation) === name));
const navigation = groupNames.map((name) => {
  const entries = operations.filter((entry) => groupName(entry.path, entry.operation) === name);
  const id = `group-${slug(name)}`;
  return `<details class="nav-group" data-group-link="${id}"><summary>${escape(name)}<span class="count">${entries.length}</span></summary><div class="nav-endpoints"><a class="nav-group-overview" href="#${id}">Overview ↗</a>${entries.map((entry) => `<a href="#${entry.id}" data-endpoint-link="${entry.id}"><span class="method-mini ${entry.method.toLowerCase()}">${entry.method}</span><span>${escape(entry.operation.summary.replace(/\s*\(Connector only\)/g, ''))}</span></a>`).join('')}</div></details>`;
}).join('');
const reference = groupNames.map((name) => {
  const entries = operations.filter((entry) => groupName(entry.path, entry.operation) === name);
  return `<section class="endpoint-group" id="group-${slug(name)}"><div class="group-header"><div><p class="section-kicker">${['Connector Reference', 'Admin Console'].includes(name) ? 'Advanced reference' : 'API reference'}</p><h2>${escape(name)} <span class="count">${entries.length} endpoints</span></h2><p class="group-description">${escape(descriptions[name] || '')}</p></div></div>${entries.map(renderOperation).join('')}</section>`;
}).join('');

let html = await readFile(join(docsDir, 'static-docs.template.html'), 'utf8');
const replacements = {
  STYLES: await readFile(join(docsDir, 'static-docs.css'), 'utf8'),
  SCRIPT: await readFile(join(docsDir, 'static-docs.js'), 'utf8'),
  NAVIGATION: navigation,
  API_REFERENCE: reference,
  ENDPOINT_COUNT: String(operations.length),
  BASE_URL: escape(baseUrl),
  SPEC_JSON: json(spec).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'),
};
html = html.replace(/\/\* DOCS_(STYLES|SCRIPT) \*\/|\{\{([A-Z_]+)\}\}/g, (match, assetKey, templateKey) => {
  const key = assetKey || templateKey;
  if (!(key in replacements)) throw new Error(`Unknown template placeholder ${match}`);
  return replacements[key];
});
await mkdir(join(docsDir, 'site'), { recursive: true });
await writeFile(join(docsDir, 'site/index.html'), html, 'utf8');
console.log(`Generated site/index.html: ${operations.length} endpoints, ${groupNames.length} groups, ${Buffer.byteLength(html)} bytes. No runtime dependencies.`);
