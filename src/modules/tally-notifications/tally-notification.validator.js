import { isIsoDate } from "../../shared/utils/dateValidation.js";

const guid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
export function validateTallyNotification(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return [{ field: "body", message: "A notification object is required." }];
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  if (typeof body.company !== "string" || !body.company.trim() || body.company.length > 500)
    add("company", "Send the Tally company name.");
  if (typeof body.company_guid !== "string" || !guid.test(body.company_guid.trim()))
    add("company_guid", "Send the native Tally company GUID.");
  const entity = body.entity ?? "voucher";
  if (!["voucher", "masters"].includes(entity)) add("entity", "Use voucher or masters.");
  if (
    !(entity === "masters" ? ["update"] : ["create", "update", "cancel", "delete"]).includes(
      body.action,
    )
  )
    add("action", "Send a valid notification action.");
  if (entity === "voucher") {
    const masterId = typeof body.master_id === "string" && /^[1-9]\d{0,14}$/.test(body.master_id);
    const voucherGuid =
      typeof body.voucher_guid === "string" &&
      /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}(?:-[a-f\d]{1,16})?$/i.test(body.voucher_guid);
    if (!masterId && (!voucherGuid || body.action === "delete"))
      add(
        "master_id",
        "Send MasterID, or voucher_guid for a saved voucher. Deletions require MasterID.",
      );
    if (body.voucher_guid !== undefined && !voucherGuid)
      add("voucher_guid", "Send a valid Tally voucher GUID.");
  }
  if (body.previous_date !== undefined && !isIsoDate(body.previous_date))
    add("previous_date", "Use YYYY-MM-DD.");
  return errors;
}

export function normalizeTallyNotification(body) {
  return {
    company: body.company.trim(),
    company_guid: body.company_guid.trim().toLowerCase(),
    entity: body.entity ?? "voucher",
    action: body.action,
    ...(typeof body.master_id === "string" && /^[1-9]\d{0,14}$/.test(body.master_id)
      ? { master_id: body.master_id }
      : {}),
    ...(body.voucher_guid ? { voucher_guid: body.voucher_guid.toLowerCase() } : {}),
    ...(body.previous_date ? { previous_date: body.previous_date } : {}),
  };
}
