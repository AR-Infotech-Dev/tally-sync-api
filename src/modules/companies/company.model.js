import { getMongoCollection } from "../../config/mongo.database.js";
import { ensureCompanySequence, isCompanySequence } from "./company-sequence.model.js";

let indexes;
export async function ensureCompanyIndexes(rows) {
  await rows.createIndex({ client_id: 1, company_id: 1 }, { unique: true });
  await rows.createIndex(
    { client_id: 1, company_key: 1 },
    { unique: true, partialFilterExpression: { company_key: { $type: "string" } } },
  );
  // GUIDs may be shared by restored branch companies. Keep IDs, replace only the obsolete index.
  const existing = await rows.listIndexes().toArray();
  for (const index of existing)
    if (
      index.unique &&
      Object.keys(index.key).length === 2 &&
      index.key.client_id === 1 &&
      index.key.tally_guid === 1
    ) {
      try {
        await rows.dropIndex(index.name);
      } catch (error) {
        if (error.code !== 27) throw error;
      }
    }
}
async function collection() {
  const rows = await getMongoCollection("client_companies");
  indexes ||= ensureCompanyIndexes(rows).catch((error) => {
    indexes = null;
    throw error;
  });
  await indexes;
  return rows;
}
export async function saveClientCompanies(clientId, companies) {
  const rows = await collection();
  await migrateCompanyIds(rows, clientId);
  const now = new Date().toISOString();
  for (const company of companies) {
    const unambiguous =
      companies.filter(
        (row) => row.tally_guid === company.tally_guid && row.company_name === company.company_name,
      ).length === 1;
    await ensureCompanySequence(rows, clientId, company, undefined, unambiguous);
  }
  if (companies.length)
    await rows.bulkWrite(
      companies.map((company) => ({
        updateOne: {
          filter: { client_id: clientId, company_key: company.company_key },
          update: {
            $set: {
              ...Object.fromEntries(
                Object.entries(company).filter(
                  ([key, value]) =>
                    !["company_id", "company_sequence"].includes(key) &&
                    (key !== "last_synced_at" || value !== null),
                ),
              ),
              last_seen_at: now,
            },
            $setOnInsert: { client_id: clientId, first_seen_at: now },
          },
        },
      })),
    );
}
export async function readClientCompanies(clientId) {
  const rows = await collection();
  await migrateCompanyIds(rows, clientId);
  return rows
    .find({ client_id: clientId }, { projection: { _id: 0, client_id: 0 } })
    .sort({ company_sequence: 1 })
    .toArray();
}
async function migrateCompanyIds(rows, clientId) {
  const known = await rows
    .find({ client_id: clientId })
    .sort({ first_seen_at: 1, company_id: 1 })
    .toArray();
  for (const company of known) {
    if (!company.company_key || !isCompanySequence(company.company_id))
      await ensureCompanySequence(rows, clientId, company);
  }
}
