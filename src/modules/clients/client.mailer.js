import nodemailer from "nodemailer";
import { renderClientCredentialsEmail } from "./client-email.template.js";

export function buildClientCredentialsMessage(input, from) {
  return {
    from,
    to: input.email,
    subject: "Your Tally Sync Connector credentials",
    ...renderClientCredentialsEmail(input),
  };
}

export async function sendClientCredentialsEmail({ email, name, clientId, connectorId, apiKey, connectorKey, activationCode }) {
  const { EMAIL_USER, EMAIL_PASS } = process.env;
  if (!EMAIL_USER || !EMAIL_PASS) {
    const error = new Error("Gmail is not configured. Set EMAIL_USER and EMAIL_PASS in the server environment.");
    error.status = 503;
    throw error;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });

  await transporter.sendMail(buildClientCredentialsMessage({ email, name, clientId, connectorId, apiKey, connectorKey, activationCode }, EMAIL_USER));
}
