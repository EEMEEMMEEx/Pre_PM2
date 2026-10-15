const handleRoute = require("./_handler.js");

module.exports = async (req, res) => {
  return handleRoute(req, res, "delete");
};
