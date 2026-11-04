import { formatCompanySequence } from "../../src/modules/companies/company-sequence.model.js";
export function memoryCompanyRepository() {
  const data = [];
  const counters = new Map();
  const match = (row, filter) => Object.entries(filter).every(([key, value]) => row[key] === value);
  const rows = {
    findOne: async (filter) => data.find((row) => match(row, filter)),
    updateOne: async (filter, update, options = {}) => {
      let row = data.find((item) => match(item, filter));
      if (!row && options.upsert) {
        row = { ...filter, ...update.$setOnInsert };
        data.push(row);
      }
      if (row) Object.assign(row, update.$set);
    },
  };
  const reserve = async (client) => {
    const highest = Math.max(
      0,
      ...data.filter((row) => row.client_id === client).map((row) => Number(row.company_id) || 0),
    );
    const value = Math.max(counters.get(client) || 0, highest) + 1;
    counters.set(client, value);
    return { company_id: formatCompanySequence(value), company_sequence: value };
  };
  return { data, rows, reserve };
}
