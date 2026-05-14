// =====================================================
// WiFiEvents.reference.ino - Plantilla para el equipo
// Arduino Nano 33 IoT -> POST /events al backend Docker
// Copiar/adaptar en el proyecto OttoBot del companero.
// =====================================================

#include <WiFiNINA.h>

// --- CONFIGURACION (editar) ---
char WIFI_SSID[] = "TU_RED_WIFI";
char WIFI_PASS[] = "TU_PASSWORD";
char SERVER_HOST[] = "172.20.10.2";  // IPv4 Wi-Fi del PC/servidor (ipconfig), NO WSL
const int SERVER_PORT = 3000;
const char* EVENTS_PATH = "/events";
const char* DEVICE_ID = "arduino_nano_33_01";

#define WIFI_EVENT_QUEUE_SIZE 8
#define WIFI_JSON_MAX 384

struct WiFiEventItem {
  char json[WIFI_JSON_MAX];
  bool used;
};

WiFiEventItem wifiEventQueue[WIFI_EVENT_QUEUE_SIZE];
int wifiEventHead = 0;
int wifiEventTail = 0;
int wifiEventCount = 0;
bool wifiReady = false;
unsigned long lastWifiAttempt = 0;

void setupWiFiEvents() {
  for (int i = 0; i < WIFI_EVENT_QUEUE_SIZE; i++) {
    wifiEventQueue[i].used = false;
    wifiEventQueue[i].json[0] = '\0';
  }
  reconnectWiFiEventsIfNeeded();
}

void reconnectWiFiEventsIfNeeded() {
  if (WiFi.status() == WL_CONNECTED) {
    wifiReady = true;
    return;
  }

  unsigned long now = millis();
  if (now - lastWifiAttempt < 5000) return;
  lastWifiAttempt = now;

  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  for (int i = 0; i < 20; i++) {
    if (WiFi.status() == WL_CONNECTED) {
      wifiReady = true;
      queueEventLog("BOOT", "OttoBot WiFi conectado", "", "OK|WIFI_CONNECTED");
      return;
    }
    delay(500);
  }

  wifiReady = false;
}

bool enqueueWifiJson(const char* json) {
  if (wifiEventCount >= WIFI_EVENT_QUEUE_SIZE) return false;
  strncpy(wifiEventQueue[wifiEventTail].json, json, WIFI_JSON_MAX - 1);
  wifiEventQueue[wifiEventTail].json[WIFI_JSON_MAX - 1] = '\0';
  wifiEventQueue[wifiEventTail].used = true;
  wifiEventTail = (wifiEventTail + 1) % WIFI_EVENT_QUEUE_SIZE;
  wifiEventCount++;
  return true;
}

// Escapa comillas simples en strings para JSON basico
String jsonEscape(const String& input) {
  String out = "";
  for (unsigned int i = 0; i < input.length(); i++) {
    char c = input.charAt(i);
    if (c == '"') out += "\\\"";
    else if (c == '\\') out += "\\\\";
    else out += c;
  }
  return out;
}

void queueEventLog(const String& actionType, const String& message, const String& command, const String& robotResponse) {
  String json = "{";
  json += "\"actionType\":\"" + jsonEscape(actionType) + "\",";
  json += "\"message\":\"" + jsonEscape(message) + "\",";
  json += "\"deviceId\":\"" + String(DEVICE_ID) + "\"";

  if (command.length() > 0) {
    json += ",\"command\":\"" + jsonEscape(command) + "\"";
  }
  if (robotResponse.length() > 0) {
    json += ",\"robotResponse\":\"" + jsonEscape(robotResponse) + "\"";
  }

  json += "}";

  if (!enqueueWifiJson(json.c_str())) {
    Serial.println("WARN: cola WiFi llena, evento descartado");
  }
}

bool postEventJson(const char* jsonBody) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClient client;
  if (!client.connect(SERVER_HOST, SERVER_PORT)) {
    return false;
  }

  client.print("POST ");
  client.print(EVENTS_PATH);
  client.println(" HTTP/1.1");
  client.print("Host: ");
  client.println(SERVER_HOST);
  client.println("Content-Type: application/json");
  client.print("Content-Length: ");
  client.println(strlen(jsonBody));
  client.println("Connection: close");
  client.println();
  client.print(jsonBody);

  unsigned long timeout = millis();
  while (client.connected() && millis() - timeout < 3000) {
    while (client.available()) {
      client.read();
    }
  }

  client.stop();
  return true;
}

void sendQueuedEvents() {
  if (wifiEventCount == 0) return;
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiEventItem& item = wifiEventQueue[wifiEventHead];
  if (!item.used) return;

  if (postEventJson(item.json)) {
    item.used = false;
    item.json[0] = '\0';
    wifiEventHead = (wifiEventHead + 1) % WIFI_EVENT_QUEUE_SIZE;
    wifiEventCount--;
  }
}

void updateWiFiEvents() {
  reconnectWiFiEventsIfNeeded();
  sendQueuedEvents();
}

// --- INTEGRACION EN OttoBot ---
// 1) setup(): setupWiFiEvents();
// 2) loop(): updateWiFiEvents();
// 3) dentro de while(central.connected()) en updateBLE(): updateWiFiEvents();
// 4) en logInstruction(...): queueEventLog("REMINDER_SAVE", "...", command, result);
