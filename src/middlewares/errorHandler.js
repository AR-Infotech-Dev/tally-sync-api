import { failureResponse } from '../shared/utils/apiResponse.js'

export function errorHandler (error, req, res, next) {
  if (res.headersSent) return next(error)
  if (error.apiCode)
    return failureResponse(res, {
      code: error.apiCode,
      httpStatus: error.status || 500,
      message: error.message,
      data: error.data
    })
  const status = error.status || 500
  const payload = {
    flag: 'F',
    statusCode: status,
    msg: error.message || 'Internal server error',
    data: error.data || []
  }

  if (process.env.NODE_ENV !== 'production') {
    payload.stack = error.stack
  }
  // Keep legacy aliases during migration while exposing the standard API envelope.
  return failureResponse(res, {
    code: status === 400 ? 2001 : 2000,
    httpStatus: status,
    message: payload.msg,
    data: payload
  })
}
