import test from 'node:test'
import assert from 'node:assert/strict'
import { buildClientMailConfig } from '../src/modules/clients/client-mail.config.js'
import { sendClientCredentialsEmail } from '../src/modules/clients/client.mailer.js'

const smtp = {
  SMTP_HOST: 'smtp.hostinger.com',
  SMTP_PORT: '465',
  SMTP_SECURE: 'true',
  SMTP_USER: 'admin@example.com',
  SMTP_PASS: 'test-mailbox-password',
  MAIL_FROM: 'Flowups <admin@example.com>'
}

test('Hostinger uses custom SMTP and the configured sender', () => {
  const config = buildClientMailConfig(smtp)
  assert.deepEqual(config, {
    transport: {
      host: 'smtp.hostinger.com', port: 465, secure: true,
      auth: { user: 'admin@example.com', pass: 'test-mailbox-password' }
    },
    from: 'Flowups <admin@example.com>'
  })
  assert.equal(config.transport.service, undefined)
})

test('SMTP port and TLS defaults support 465 and 587', () => {
  assert.equal(buildClientMailConfig({ ...smtp, SMTP_PORT: undefined, SMTP_SECURE: undefined }).transport.secure, true)
  const transport = buildClientMailConfig({ ...smtp, SMTP_PORT: '587', SMTP_SECURE: undefined }).transport
  assert.equal(transport.port, 587)
  assert.equal(transport.secure, false)
  assert.equal(buildClientMailConfig({ ...smtp, SMTP_PORT: '587', SMTP_SECURE: 'false' }).transport.secure, false)
})

test('Sender defaults to the SMTP account without MAIL_FROM', () => {
  assert.equal(buildClientMailConfig({ ...smtp, MAIL_FROM: undefined }).from, smtp.SMTP_USER)
})

test('Gmail fallback remains available only without SMTP settings', () => {
  const gmail = { EMAIL_USER: 'test@gmail.com', EMAIL_PASS: 'sample-app-password' }
  assert.deepEqual(buildClientMailConfig(gmail), {
    transport: { service: 'gmail', auth: { user: gmail.EMAIL_USER, pass: gmail.EMAIL_PASS } },
    from: gmail.EMAIL_USER
  })
  assert.throws(() => buildClientMailConfig({ ...gmail, SMTP_HOST: 'smtp.hostinger.com' }), error => error.status === 503 && /SMTP_USER/.test(error.message))
  assert.equal(buildClientMailConfig({ ...smtp, ...gmail }).transport.host, 'smtp.hostinger.com')
})

test('Missing configuration fails before an SMTP connection is created', async () => {
  await assert.rejects(sendClientCredentialsEmail({}, {
    environment: {}, createTransport: () => assert.fail('must not connect')
  }), error => error.status === 503 && /Email is not configured/.test(error.message))
  for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) {
    assert.throws(() => buildClientMailConfig({ ...smtp, [key]: '' }), error => error.status === 503)
  }
})

test('Invalid SMTP ports and booleans return safe configuration errors', () => {
  for (const port of ['abc', '0', '-1', '65536', '465.5']) {
    assert.throws(() => buildClientMailConfig({ ...smtp, SMTP_PORT: port }), error => error.status === 503 && /SMTP_PORT/.test(error.message))
  }
  assert.throws(() => buildClientMailConfig({ ...smtp, SMTP_SECURE: 'yes' }), error => error.status === 503 && /SMTP_SECURE/.test(error.message))
})

const credentials = {
  email: 'customer@example.com', name: 'Test Client', clientId: 'CLIENT_TEST',
  connectorId: 'CONNECTOR_TEST', apiKey: 'test-api-key',
  connectorKey: 'test-connector-key', activationCode: 'test-activation-code'
}

test('Registration mail uses SMTP sender and preserves HTML and plain-text credentials templates', async () => {
  let sent
  await sendClientCredentialsEmail(credentials, {
    environment: smtp,
    createTransport: options => {
      assert.equal(options.host, 'smtp.hostinger.com')
      return { sendMail: async message => { sent = message } }
    }
  })
  assert.equal(sent.from, smtp.MAIL_FROM)
  assert.equal(sent.to, credentials.email)
  assert.equal(sent.subject, 'Your Tally Sync Connector credentials')
  assert(sent.html.includes(credentials.clientId))
  assert(sent.text.includes(credentials.activationCode))
})

test('Delivery errors propagate to the existing registration rollback handler', async () => {
  const failure = Object.assign(new Error('authentication failed'), { code: 'EAUTH' })
  await assert.rejects(sendClientCredentialsEmail(credentials, {
    environment: smtp,
    createTransport: () => ({ sendMail: async () => { throw failure } })
  }), error => error === failure)
})
