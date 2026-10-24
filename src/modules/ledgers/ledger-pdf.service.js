import Handlebars from 'handlebars';
import pdfmake from 'pdfmake';
import htmlToPdfmake from 'html-to-pdfmake';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { buildLedgerPdfData } from './ledger-pdf.utils.js';
import { applyStatementFonts } from './ledger-pdf-fonts.utils.js';

const require = createRequire(import.meta.url);
const fontRoot = path.join(path.dirname(require.resolve('@fontsource/noto-sans-devanagari/package.json')), 'files');
const fontFiles = new Set();
const fonts = (subset) => {
  const normal=path.join(fontRoot, `noto-sans-devanagari-${subset}-400-normal.woff`);
  const bold=path.join(fontRoot, `noto-sans-devanagari-${subset}-700-normal.woff`);
  fontFiles.add(normal); fontFiles.add(bold);
  return {normal, bold, italics:normal, bolditalics:bold};
};
pdfmake.addFonts({Statement:fonts('latin'), StatementDevanagari:fonts('devanagari')});
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((file) => fontFiles.has(path.resolve(file)));
const handlebars=Handlebars.create();

export function ledgerPdfFilename(statement) {
  const ledger=String(statement.ledger_name || 'ledger').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0,80);
  return `statement-${ledger}-${statement.from_date}-${statement.to_date}.pdf`;
}

export async function renderLedgerStatementHtml(statement) {
  const template=await readFile(new URL('../../templates/ledger-statement.hbs', import.meta.url),'utf8');
  return handlebars.compile(template)(buildLedgerPdfData(statement));
}

function convertHtml(html) {
  // DOM parsing only: no scripts execute and no external resources are loaded.
  const {window}=new JSDOM('');
  try {
    return applyStatementFonts(htmlToPdfmake(html, {
      window, removeExtraBlanks:true,
      defaultStyles:{p:{margin:[0,0,0,5]},h1:{fontSize:19,margin:[0,0,0,4]},h2:{fontSize:10,color:'#2862d7',margin:[0,0,0,10]},th:{bold:true,fillColor:'#eaf0f8'},table:{margin:[0,6,0,8]}},
    }));
  } finally {window.close();}
}

export async function buildLedgerPdfDefinition(statement) {
  const [html,footer]=await Promise.all([
    renderLedgerStatementHtml(statement),
    readFile(new URL('../../templates/pdf-footer.hbs',import.meta.url),'utf8'),
  ]);
  const renderFooter=handlebars.compile(footer);
  return {
    pageSize:'A4',pageMargins:[34,35,34,42],
    info:{title:`Ledger statement - ${statement.ledger_name}`,author:statement.company || ''},
    defaultStyle:{font:'Statement',fontSize:8,color:'#243247',lineHeight:1.15},
    styles:{number:{alignment:'right'},type:{fontSize:7,color:'#69768a'},narration:{fontSize:7,color:'#69768a'},muted:{fontSize:7,color:'#69768a'},ledger:{fontSize:11},stale:{color:'#8d5900',background:'#fff5df'},note:{fontSize:7,color:'#69768a'}},
    content:convertHtml(html),
    footer:(page,total)=>({text:renderFooter({page_number:page,page_count:total}).trim(),alignment:'right',margin:[34,8,34,0],fontSize:7,color:'#69768a'}),
  };
}

export async function generateLedgerStatementPdf(statement) {
  return Buffer.from(await pdfmake.createPdf(await buildLedgerPdfDefinition(statement)).getBuffer());
}
