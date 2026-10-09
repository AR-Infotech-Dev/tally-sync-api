import nodemailer from "nodemailer";

export async function sendClientCredentialsEmail({ email, name, clientId, connectorId, apiKey, connectorKey }) {
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
    text: [
      `Hello ${name},`,
      "",
      "Your Tally Sync client registration is complete.",
      `Client ID: ${clientId}`,
      `Connector ID: ${connectorId}`,
      "",
      `API key: ${apiKey}`,
      `Connector key: ${connectorKey}`,
      "",
      "Use the API key only in your application. Enter the Connector key in the Tally Sync Connector app.",
      "These credentials are shown only in this email. Store them securely.",
    ].join("\n"),
  });
}
