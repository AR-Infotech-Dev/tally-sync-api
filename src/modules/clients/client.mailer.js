import nodemailer from 'nodemailer'
import { renderClientCredentialsEmail } from './client-email.template.js'
import { buildClientMailConfig } from './client-mail.config.js'

export function buildClientCredentialsMessage (input, from) {
  return {
    from,
    to: input.email,
    subject: 'Your Tally Sync Connector credentials',
    ...renderClientCredentialsEmail(input)
  }
}

export async function sendClientCredentialsEmail ({
  email,
  name,
  clientId,
  connectorId,
  apiKey,
  connectorKey,
  activationCode
}, { environment = process.env, createTransport = nodemailer.createTransport } = {}) {
  const { transport, from } = buildClientMailConfig(environment)
  const transporter = createTransport(transport)

  await transporter.sendMail(
    buildClientCredentialsMessage(
      {
        email,
        name,
        clientId,
        connectorId,
        apiKey,
        connectorKey,
        activationCode
      },
      from
    )
  )
}
