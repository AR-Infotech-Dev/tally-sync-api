// Keep Devanagari words/combining marks together for font shaping.
function fontRuns(value) {
  if (!/[\u0900-\u097f\u200c\u200d]/.test(value)) return value;
  return value.split(/([\u0900-\u097f\u200c\u200d]+)/).filter(Boolean).map(text=>({text,font:/[\u0900-\u097f\u200c\u200d]/.test(text)?'StatementDevanagari':'Statement'}));
}
export function applyStatementFonts(value) {
  if (Array.isArray(value)) return value.map(applyStatementFonts);
  if (!value || typeof value!=='object') return value;
  const result={...value};
  for (const [key,child] of Object.entries(result)) {
    if (key==='text' && typeof child==='string') result[key]=fontRuns(child);
    else if (key==='text' && Array.isArray(child)) result[key]=child.flatMap(item=>typeof item==='string'?fontRuns(item):applyStatementFonts(item));
    else if (child && typeof child==='object') result[key]=applyStatementFonts(child);
  }
  return result;
}
