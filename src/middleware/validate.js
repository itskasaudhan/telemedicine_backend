// Usage: validate(schema) -> checks req.body and replaces it with the cleaned data
module.exports = (schema) => (req, res, next) => {
  req.body = schema.parse(req.body);
  next();
};