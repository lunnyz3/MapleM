const mongoose = require("mongoose");

function getHealth(req, res) {
  res.json({
    ok: true,
    mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
}

module.exports = { getHealth };
