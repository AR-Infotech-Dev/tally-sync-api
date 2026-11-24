import { DOMParser } from "@xmldom/xmldom";

export function parseNotificationXml(buffer) {
  const utf16 = (buffer[0] === 0xff && buffer[1] === 0xfe) || buffer[1] === 0;
  const xml = buffer.toString(utf16 ? "utf16le" : "utf8").replace(/^\uFEFF/, "");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML declarations are not supported.");
  const document = new DOMParser({
    onError: (_level, message) => {
      throw new Error(message);
    },
  }).parseFromString(xml, "text/xml");
  const payloads = document.getElementsByTagName("FLOWUPSNOTIFICATION");
  if (payloads.length !== 1) throw new Error("Expected one notification.");
  const root = payloads.item(0);
  // Tally report exports may include an ENVELOPE wrapper around the Part XML tag.
  let branch = root;
  for (let parent = root.parentNode; parent?.nodeType === 1; parent = parent.parentNode) {
    if (!["ENVELOPE", "BODY", "DATA"].includes(parent.tagName) || parent.attributes.length)
      throw new Error("Unexpected notification wrapper.");
    for (let child = parent.firstChild; child; child = child.nextSibling)
      if (child.nodeType === 1 && child !== branch)
        throw new Error("Unexpected notification sibling.");
    branch = parent;
  }
  if (root?.tagName !== "FLOWUPSNOTIFICATION" || root.attributes.length)
    throw new Error("Expected FLOWUPSNOTIFICATION.");
  const body = Object.create(null);
  const allowed = new Set([
    "company",
    "company_guid",
    "entity",
    "action",
    "master_id",
    "voucher_guid",
    "previous_date",
  ]);
  for (let child = root.firstChild; child; child = child.nextSibling) {
    if (child.nodeType !== 1) {
      if (child.nodeType === 3 && child.nodeValue.trim()) throw new Error("Unexpected XML text.");
      continue;
    }
    const key = child.tagName.toLowerCase();
    if (!allowed.has(key) || Object.hasOwn(body, key) || child.attributes.length)
      throw new Error("Unexpected or duplicate notification field.");
    for (let value = child.firstChild; value; value = value.nextSibling)
      if (![3, 4].includes(value.nodeType)) throw new Error("Expected a text field.");
    body[key] = child.textContent.trim();
  }
  // Tally can emit empty optional tags even when their fields are invisible.
  for (const key of ["master_id", "voucher_guid", "previous_date"])
    if (body[key] === "") delete body[key];
  if (body.previous_date)
    body.previous_date = body.previous_date.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
  return body;
}
