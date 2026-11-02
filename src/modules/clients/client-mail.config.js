function configurationError (message) {
  return Object.assign(new Error(message), { status: 503 })
}

export function buildClientMailConfig (environment = process.env) {
  const smtpKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS']
  const useSmtp = smtpKeys.some(key => Boolean(environment[key]))
  let transport
  let user

  if (useSmtp) {
    const host = String(environment.SMTP_HOST || '').trim()
    user = String(environment.SMTP_USER || '').trim()
    const pass = environment.SMTP_PASS
    if (!host || !user || !pass) {
      throw configurationError('Email is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS in the server environment.')
    }
    const port = Number(environment.SMTP_PORT || 465)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw configurationError('SMTP_PORT must be an integer between 1 and 65535.')
    }
    const secureSetting = String(environment.SMTP_SECURE || '').trim().toLowerCase()
    if (secureSetting && !['true', 'false'].includes(secureSetting)) {
      throw configurationError('SMTP_SECURE must be true or false.')
    }
    transport = {
      host,
      port,
      secure: secureSetting ? secureSetting === 'true' : port === 465,
      auth: { user, pass }
    }
  } else {
    user = String(environment.EMAIL_USER || '').trim()
    const pass = environment.EMAIL_PASS
    if (!user || !pass) {
      throw configurationError('Email is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS, or use EMAIL_USER and EMAIL_PASS for Gmail.')
    }
    transport = { service: 'gmail', auth: { user, pass } }
  }

  return { transport, from: String(environment.MAIL_FROM || '').trim() || user }
}
