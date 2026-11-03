import { getMongoCollection } from "../../config/mongo.database.js";

export const isCompanySequence = (value) =>
  typeof value === "string" && /^(?:0[1-9]|[1-9]\d+)$/.test(value);
export const formatCompanySequence = (value) => {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error("Company sequence is outside the supported range.");
  return String(value).padStart(2, "0");
};

export async function nextCompanySequence(clientId) {
  const counters = await getMongoCollection("client_company_counters");
  const companies = await getMongoCollection("client_companies");
  const highest = await companies.findOne(
    { client_id: clientId },
    { sort: { company_sequence: -1 }, projection: { company_sequence: 1 } },
  );
  try {
    await counters.updateOne(
      { _id: clientId },
      { $max: { value: highest?.company_sequence || 0 } },
      { upsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    await counters.updateOne(
      { _id: clientId },
      { $max: { value: highest?.company_sequence || 0 } },
    );
  }
  const counter = await counters.findOneAndUpdate(
    { _id: clientId, value: { $lt: Number.MAX_SAFE_INTEGER } },
    { $inc: { value: 1 } },
    { returnDocument: "after" },
  );
  if (!counter) throw new Error("Company sequence is outside the supported range.");
  return { company_id: formatCompanySequence(counter.value), company_sequence: counter.value };
}

// A reservation can leave a gap after a failed/concurrent insert. It is never reused.
// The conditional update ensures concurrent discoveries cannot replace an assigned ID.
export async function ensureCompanySequence(
  rows,
  clientId,
  company,
  reserve = nextCompanySequence,
) {
  const filter = { client_id: clientId, tally_guid: company.tally_guid };
  const existing = await rows.findOne(filter);
  if (isCompanySequence(existing?.company_id)) return existing;
  const sequence = await reserve(clientId);
  if (existing) {
    await rows.updateOne({ ...filter, company_id: existing.company_id }, { $set: sequence });
  } else {
    try {
      await rows.updateOne(
        filter,
        {
          $setOnInsert: {
            ...company,
            ...sequence,
            client_id: clientId,
            first_seen_at: new Date().toISOString(),
          },
        },
        { upsert: true },
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
  const saved = await rows.findOne(filter);
  if (!isCompanySequence(saved?.company_id))
    throw new Error("Company ID could not be assigned. Retry discovery.");
  return saved;
}
