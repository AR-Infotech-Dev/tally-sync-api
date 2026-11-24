import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { failureResponse, successResponse } from "../../shared/utils/apiResponse.js";
import { receiveTallyNotification } from "./tally-notification.service.js";
import {
  normalizeTallyNotification,
  validateTallyNotification,
} from "./tally-notification.validator.js";
import { parseNotificationXml } from "./tally-notification.xml.js";

export function createTallyNotificationHandler(receive = receiveTallyNotification) {
  return asyncHandler(async (req, res) => {
    const isXml = req.is(["text/xml", "application/xml"]);
    if (!isXml && !req.is("application/json"))
      return failureResponse(res, {
        code: 2001,
        httpStatus: 415,
        message: "Send application/json or Tally XML.",
      });
    let body = req.body;
    if (isXml) {
      try {
        body = parseNotificationXml(body);
      } catch {
        return failureResponse(res, {
          code: 2001,
          httpStatus: 400,
          message: "Invalid Tally notification XML.",
        });
      }
    }
    const errors = validateTallyNotification(body);
    if (errors.length)
      return failureResponse(res, {
        code: 2001,
        httpStatus: 400,
        message: "Invalid Tally notification.",
        data: { errors },
      });
    const notification = await receive(req.client.client_id, normalizeTallyNotification(body));
    if (isXml)
      return res
        .status(200)
        .type("application/xml")
        .send(
          `<ENVELOPE><HEADER><STATUS>1</STATUS></HEADER><BODY><DATA><STATUS>1</STATUS><NOTIFICATIONID>${notification.notification_id}</NOTIFICATIONID></DATA></BODY></ENVELOPE>`,
        );
    return successResponse(res, {
      message: "Tally notification received. Connector delivery is pending or in progress.",
      data: { notification },
    });
  });
}
export const postTallyNotification = createTallyNotificationHandler();
