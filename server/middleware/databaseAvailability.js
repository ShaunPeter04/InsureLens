function databaseAvailability(connection) {
  return (_req, res, next) => {
    if (connection.readyState !== 1) {
      res.set('Retry-After', '5');
      return res.status(503).json({message:'The database is temporarily unavailable. Please try again shortly.'});
    }
    next();
  };
}
module.exports = databaseAvailability;
