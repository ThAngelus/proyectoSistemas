const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Event = require("./models/Event");
const Command = require("./models/Command");

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://mongo:27017/robot_logs";

app.use(cors());
app.use(express.json());

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

async function connectMongo() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");
  } catch (error) {
    console.error("Initial MongoDB connection failed:", error.message);
  }
}

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected");
});

mongoose.connection.on("reconnected", () => {
  console.log("MongoDB reconnected");
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "backend",
    mongoConnected: isMongoConnected()
  });
});

const EVENT_KNOWN_FIELDS = new Set([
  "actionType",
  "source",
  "channel",
  "deviceId",
  "status",
  "message",
  "payload",
  "eventTimestamp",
  "command",
  "robotResponse",
  "cmd",
  "result"
]);

function inferActionTypeFromCommand(command) {
  if (!command || typeof command !== "string") return "";
  const type = command.split("|")[0].trim().toUpperCase();
  const map = {
    TEST: "TEST",
    TEST_ALL: "TEST_ALL",
    TXT: "DISPLAY_TEXT",
    REM: "REMINDER_SAVE",
    EDIT: "REMINDER_EDIT",
    DEL: "REMINDER_DELETE",
    CLR: "REMINDER_CLEAR",
    LIST: "REMINDER_LIST",
    LIST_FULL: "REMINDER_LIST_FULL",
    STATUS: "ROBOT_STATUS",
    GET_LOGS: "GET_LOGS",
    WALK: "ROBOT_WALK",
    WALK_STRONG: "ROBOT_WALK_STRONG",
    SHOW_SCAN: "SHOW_SCAN",
    SHOW_CUTE: "SHOW_CUTE",
    SHOW_WIN: "SHOW_WIN",
    SHOW_KICK: "SHOW_KICK",
    SHOW_BOW: "SHOW_BOW",
    SHOW_STOMP: "SHOW_STOMP",
    SHOW_ONE_FOOT: "SHOW_ONE_FOOT",
    SHOW_FULL: "SHOW_FULL",
    SHOW_RANDOM: "SHOW_RANDOM"
  };
  return map[type] || type || "";
}

function normalizeIncomingEvent(body) {
  const normalized = { ...body };

  const payload =
    normalized.payload !== undefined &&
    normalized.payload !== null &&
    typeof normalized.payload === "object" &&
    !Array.isArray(normalized.payload)
      ? { ...normalized.payload }
      : normalized.payload !== undefined && normalized.payload !== null
        ? { value: normalized.payload }
        : {};

  const flatCommand = normalized.command || normalized.cmd;
  const flatResult = normalized.robotResponse || normalized.result;

  if (flatCommand && payload.command === undefined) payload.command = flatCommand;
  if (flatResult && payload.robotResponse === undefined) payload.robotResponse = flatResult;

  normalized.payload = payload;

  if (!normalized.source) normalized.source = "robot";

  const deviceId = normalized.deviceId ? String(normalized.deviceId) : "";
  const fromRobot =
    normalized.source === "robot" ||
    /arduino|robot|ottobot/i.test(deviceId);

  if ((!normalized.channel || normalized.channel === "unknown") && fromRobot) {
    normalized.channel = "wifi";
  }

  const currentActionType =
    typeof normalized.actionType === "string"
      ? normalized.actionType.trim()
      : normalized.actionType
        ? String(normalized.actionType).trim()
        : "";

  if (!currentActionType && flatCommand) {
    normalized.actionType = inferActionTypeFromCommand(String(flatCommand));
  }

  if (!normalized.status || normalized.status === "unknown") {
    const response = String(flatResult || payload.robotResponse || "");
    if (response.startsWith("OK")) normalized.status = "executed";
    else if (response.startsWith("ERR")) normalized.status = "failed";
  }

  return normalized;
}

app.post("/events", async (req, res) => {
  console.log("Cuerpo recibido:", req.body);

  const rawBody = req.body && typeof req.body === "object" ? req.body : {};
  const body = normalizeIncomingEvent(rawBody);
  const {
    actionType,
    source,
    channel,
    deviceId,
    status,
    message,
    payload,
    eventTimestamp
  } = body;

  const actionTypeTrimmed =
    typeof actionType === "string" ? actionType.trim() : actionType ? String(actionType).trim() : "";

  if (!actionTypeTrimmed) {
    const errMsg = "Falta actionType, el Arduino debe enviarlo";
    return res.status(400).json({
      error: errMsg,
      message: errMsg
    });
  }

  const extraFields = {};
  for (const [key, value] of Object.entries(body)) {
    if (!EVENT_KNOWN_FIELDS.has(key)) {
      extraFields[key] = value;
    }
  }

  const eventData = {
    ...extraFields,
    actionType: actionTypeTrimmed,
    source: source || "robot",
    channel: channel || "unknown",
    deviceId: deviceId || "unknown",
    status: status || "unknown",
    message: message !== undefined && message !== null ? String(message) : "",
    payload:
      payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {},
    eventTimestamp: eventTimestamp ? new Date(eventTimestamp) : new Date()
  };

  if (!isMongoConnected()) {
    return res.status(202).json({
      message: "Event received but not stored (MongoDB unavailable)",
      stored: false,
      event: eventData
    });
  }

  try {
    const event = await Event.create(eventData);
    return res.status(201).json({
      message: "Event stored successfully",
      stored: true,
      event
    });
  } catch (error) {
    return res.status(500).json({
      message: "Event received but storage failed",
      stored: false,
      error: error.message
    });
  }
});

app.get("/events", async (_req, res) => {
  if (!isMongoConnected()) {
    return res.status(503).json({
      message: "MongoDB unavailable",
      events: []
    });
  }

  try {
    const events = await Event.find().sort({ createdAt: -1 }).limit(200);
    return res.status(200).json(events);
  } catch (error) {
    return res.status(500).json({
      message: "Could not fetch events",
      error: error.message
    });
  }
});

app.get("/events/summary", async (_req, res) => {
  if (!isMongoConnected()) {
    return res.status(503).json({
      message: "MongoDB unavailable"
    });
  }

  try {
    const total = await Event.countDocuments();
    return res.status(200).json({ total });
  } catch (error) {
    return res.status(500).json({
      message: "Could not build events summary",
      error: error.message
    });
  }
});

app.post("/commands", async (req, res) => {
  const { commandText, commandType, targetDeviceId, source } = req.body;

  if (!commandText || !targetDeviceId) {
    return res.status(400).json({
      message: "commandText and targetDeviceId are required"
    });
  }

  if (!isMongoConnected()) {
    return res.status(503).json({
      message: "MongoDB unavailable, cannot queue commands"
    });
  }

  try {
    const command = await Command.create({
      commandText,
      commandType: commandType || "GENERIC",
      targetDeviceId,
      source: source || "dashboard",
      status: "pending"
    });

    await Event.create({
      actionType: "COMMAND_QUEUED",
      source: source || "dashboard",
      channel: "http",
      deviceId: targetDeviceId,
      status: "stored",
      message: `Command queued: ${command.commandType}`,
      payload: {
        commandId: command._id,
        commandText: command.commandText
      },
      eventTimestamp: new Date()
    });

    return res.status(201).json(command);
  } catch (error) {
    return res.status(500).json({
      message: "Could not queue command",
      error: error.message
    });
  }
});

app.get("/commands/pending", async (req, res) => {
  const { deviceId } = req.query;

  if (!deviceId) {
    return res.status(400).json({
      message: "deviceId query param is required"
    });
  }

  if (!isMongoConnected()) {
    return res.status(503).json({
      message: "MongoDB unavailable"
    });
  }

  try {
    const commands = await Command.find({
      targetDeviceId: deviceId,
      status: "pending"
    })
      .sort({ createdAt: 1 })
      .limit(20);

    const ids = commands.map((command) => command._id);
    if (ids.length > 0) {
      await Command.updateMany(
        { _id: { $in: ids }, status: "pending" },
        { $set: { status: "sent", sentAt: new Date() } }
      );
    }

    return res.status(200).json(commands);
  } catch (error) {
    return res.status(500).json({
      message: "Could not fetch pending commands",
      error: error.message
    });
  }
});

app.post("/commands/:id/ack", async (req, res) => {
  const { id } = req.params;
  const { status, robotResponse, executionNotes, source } = req.body;

  if (!status || !["executed", "failed"].includes(status)) {
    return res.status(400).json({
      message: "status must be 'executed' or 'failed'"
    });
  }

  if (!isMongoConnected()) {
    return res.status(503).json({
      message: "MongoDB unavailable"
    });
  }

  try {
    const command = await Command.findByIdAndUpdate(
      id,
      {
        $set: {
          status,
          robotResponse: robotResponse || "",
          executionNotes: executionNotes || "",
          executedAt: new Date()
        }
      },
      { new: true }
    );

    if (!command) {
      return res.status(404).json({
        message: "Command not found"
      });
    }

    await Event.create({
      actionType: "COMMAND_ACK",
      source: source || "flutter_app",
      channel: "ble",
      deviceId: command.targetDeviceId,
      status: status === "executed" ? "executed" : "failed",
      message: `Command ${status}`,
      payload: {
        commandId: command._id,
        commandText: command.commandText,
        robotResponse: robotResponse || ""
      },
      eventTimestamp: new Date()
    });

    return res.status(200).json(command);
  } catch (error) {
    return res.status(500).json({
      message: "Could not ack command",
      error: error.message
    });
  }
});

app.get("/commands", async (_req, res) => {
  if (!isMongoConnected()) {
    return res.status(503).json({
      message: "MongoDB unavailable"
    });
  }

  try {
    const commands = await Command.find().sort({ createdAt: -1 }).limit(100);
    return res.status(200).json(commands);
  } catch (error) {
    return res.status(500).json({
      message: "Could not fetch commands",
      error: error.message
    });
  }
});

connectMongo().finally(() => {
  app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
  });
});
