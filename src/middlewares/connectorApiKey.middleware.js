import { matchesCredentialHash } from '../shared/utils/credentialHash.js'
import { asyncHandler } from '../shared/utils/asyncHandler.js'
import { failureResponse } from '../shared/utils/apiResponse.js'
import { findActiveClient } from '../modules/clients/client.model.js'

export const requireConnectorKey = asyncHandler(async (req, res, next) => {
  const clientId = req.get('x-client-id')
  const connectorKey = req.get('x-connector-key')
  if (!clientId || !connectorKey)
    return failureResponse(res, {
      code: 2005,
      httpStatus: 401,
      message: 'Connector credentials are required.'
    })
  const client = await findActiveClient(clientId)
  const storedHash = client?.connector_key_hash
  if (!matchesCredentialHash(connectorKey, storedHash))
    return failureResponse(res, {
      code: 2005,
      httpStatus: 401,
      message: 'Invalid connector credentials.'
    })
  req.client = { client_id: client.client_id }
  return next()
})
