import test from "node:test";
import assert from "node:assert/strict";
import {
  queueConnectorJob,
  requestConnectorReport,
} from "../src/modules/connector-jobs/connector-job.service.js";

const unavailable = (error) => {
  assert.equal(error.name, "Error");
  assert.equal(error.status, 503);
  assert.equal(error.apiCode, 2013);
  assert.equal(error.data?.error_code, "CONNECTOR_NOT_CONNECTED");
  return true;
};

test("real queue entry point executes the imported responsiveness guard before database or dispatch", async () => {
  for (const type of ["item_sales", "sales_voucher"])
    await assert.rejects(
      queueConnectorJob({
        client_id: "QUEUE_REGRESSION_NO_CONNECTOR",
        transaction_type: type,
        lookup: { company_id: "02" },
      }),
      unavailable,
    );
});

test("real cached-report request returns the availability error rather than a ReferenceError", async () => {
  await assert.rejects(
    requestConnectorReport(
      "QUEUE_REGRESSION_NO_CONNECTOR",
      { company_id: "02", match_by: "item_code" },
      "item_sales",
      () => false,
    ),
    unavailable,
  );
});
