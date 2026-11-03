import { getMongoCollection } from "../../config/mongo.database.js";
import { ensureCompanySequence, isCompanySequence } from "./company-sequence.model.js";

let indexes;
async function collection() {
  const rows = await getMongoCollection("client_companies");
  indexes ||= Promise.all([
    rows.createIndex({ client_id: 1, company_id: 1 }, { unique: true }),
    rows.createIndex({ client_id: 1, tally_guid: 1 }, { unique: true }),
  ]).catch((error) => {
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
  for (const company of companies) await ensureCompanySequence(rows, clientId, company);
  if (companies.length)
    await rows.bulkWrite(
      companies.map((company) => ({
        updateOne: {
          filter: { client_id: clientId, tally_guid: company.tally_guid },
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
    if (!isCompanySequence(company.company_id))
      await ensureCompanySequence(rows, clientId, company);
  }
}
