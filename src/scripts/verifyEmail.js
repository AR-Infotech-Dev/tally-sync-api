import "dotenv/config";
import nodemailer from "nodemailer";
import { buildClientMailConfig } from "../modules/clients/client-mail.config.js";

try {
  const { transport } = buildClientMailConfig();
  const transporter = nodemailer.createTransport({
    ...transport,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
  await transporter.verify();
  console.info(
    "Email server connection and authentication verified. No email was sent. Sender acceptance must be checked with an actual delivery.",
  );
} catch (error) {
  // SMTP response strings may contain account details; report only safe diagnostics.
  const knownCodes = new Set([
    "EAUTH",
    "ETIMEDOUT",
    "ECONNECTION",
    "ECONNREFUSED",
    "ECONNRESET",
    "EDNS",
    "ESOCKET",
    "ETLS",
    "ENOAUTH",
  ]);
  const code = knownCodes.has(error.code) ? error.code : "EMAIL_VERIFY_FAILED";
  const smtpStatus = Number.isInteger(error.responseCode) ? ` (SMTP ${error.responseCode})` : "";
  console.error(
    error.status === 503
      ? error.message
      : `Email verification failed: ${code}${smtpStatus}. Check the mail server settings, mailbox credentials and outbound SMTP connectivity.`,
  );
  process.exitCode = 1;
}
