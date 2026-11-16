import { createReportHandlers } from "../../shared/http/reportHandlers.js";
import { requestGroupList } from "./group.service.js";
import { validateGroupList } from "./group.validator.js";

export const getGroups = createReportHandlers({
  
  label: "Accounting groups",
  validate: validateGroupList,
  request: requestGroupList,
  resultKey: "groups",
  messages: { success: "Accounting groups retrieved from Tally." },
}).json;

