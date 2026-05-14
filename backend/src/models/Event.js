const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    actionType: {
      type: String,
      required: true,
      trim: true
    },
    source: {
      type: String,
      default: "robot"
    },
    channel: {
      type: String,
      default: "unknown"
    },
    deviceId: {
      type: String,
      default: "unknown"
    },
    status: {
      type: String,
      default: "unknown"
    },
    message: {
      type: String,
      default: ""
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    eventTimestamp: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    strict: false
  }
);

module.exports = mongoose.model("Event", eventSchema);
