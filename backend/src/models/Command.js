const mongoose = require("mongoose");

const commandSchema = new mongoose.Schema(
  {
    commandText: {
      type: String,
      required: true,
      trim: true
    },
    commandType: {
      type: String,
      default: "GENERIC"
    },
    targetDeviceId: {
      type: String,
      required: true,
      trim: true
    },
    source: {
      type: String,
      default: "dashboard"
    },
    status: {
      type: String,
      enum: ["pending", "sent", "executed", "failed", "expired"],
      default: "pending"
    },
    robotResponse: {
      type: String,
      default: ""
    },
    executionNotes: {
      type: String,
      default: ""
    },
    sentAt: {
      type: Date
    },
    executedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Command", commandSchema);
