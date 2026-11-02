export function asyncHandler(fn) {
  return function wrappedHandler(req, res, next) {
    return Promise.resolve()
      .then(() => fn(req, res, next))
      .catch(next);
  };
}
