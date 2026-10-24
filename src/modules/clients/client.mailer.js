import nodemailer from "nodemailer";
import { buildCredentialsEmail } from "./client-credentials.utils.js";

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

  await transporter.sendMail({
    from: EMAIL_USER,
    to: email,
    subject: "Your Tally Sync Connector credentials",
    text: buildCredentialsEmail({name, clientId, connectorId, apiKey, connectorKey, activationCode}),
  });
}
