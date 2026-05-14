# Integracion Arduino Nano 33 IoT por WiFi

El robot puede enviar logs **directamente al backend** por HTTP, sin depender de la app Flutter.
La app Flutter sigue siendo opcional (BLE + reenvio de eventos o comandos remotos).

## Arquitectura (dos entradas al mismo log)

```
Arduino (WiFi) ----POST /events----> Backend ----> MongoDB ----> Dashboard
Flutter (BLE)  ----POST /events---->     ^
Dashboard      ----POST /commands-->    | (cola para Flutter, opcional)
```

## Red y URL

| Dato | Valor |
|------|-------|
| Metodo | `POST` |
| Ruta | `/events` |
| URL local | `http://<IP_WIFI_PC>:3000/events` |
| Cabecera | `Content-Type: application/json` |

**Importante:** usar la IPv4 del adaptador **Wi-Fi/Ethernet** del PC (`ipconfig`), por ejemplo `172.20.10.2`.
No usar la IP de WSL/Hyper-V (`172.21.x.x`) si Docker corre en Windows.

Misma red WiFi entre Arduino y PC/servidor. Puerto **3000** abierto en firewall.

## JSON minimo (obligatorio `actionType`)

```json
{
  "actionType": "BOOT",
  "message": "OttoBot iniciado",
  "deviceId": "arduino_nano_33_01"
}
```

El backend completa por defecto: `source: "robot"`, `channel: "wifi"`.

## JSON recomendado (alineado al log interno del firmware)

Cuando ocurre algo en `logInstruction(source, command, result)`:

```json
{
  "actionType": "REMINDER_SAVE",
  "deviceId": "arduino_nano_33_01",
  "message": "Recordatorio guardado",
  "command": "REM|12|2026-05-02|16:30|TOMAR AGUA",
  "robotResponse": "OK|REMINDER_SAVED"
}
```

Alias aceptados: `cmd` / `result` en lugar de `command` / `robotResponse`.

Si falta `actionType` pero viene `command`, el backend infiere el tipo desde el primer segmento (`REM` -> `REMINDER_SAVE`, etc.).

## Mapeo sugerido desde comandos BLE

| Comando BLE (`type\|...`) | `actionType` |
|---------------------------|--------------|
| `TEST` | `TEST` |
| `REM` | `REMINDER_SAVE` |
| `EDIT` | `REMINDER_EDIT` |
| `DEL` | `REMINDER_DELETE` |
| `CLR` | `REMINDER_CLEAR` |
| `WALK` | `ROBOT_WALK` |
| Evento autonomo recordatorio | `REMINDER_TRIGGERED` |

## Respuestas del backend

| Codigo | Significado |
|--------|-------------|
| `201` | Guardado en Mongo (`stored: true`) |
| `202` | Recibido pero Mongo no disponible (`stored: false`) — demo del curso |
| `400` | Falta `actionType` (y no se pudo inferir desde `command`) |

## Depuracion

En la terminal del backend debe aparecer:

```
Cuerpo recibido: { ... }
```

```bash
docker compose logs -f backend
```

Prueba desde PC:

```bash
curl -X POST http://127.0.0.1:3000/events \
  -H "Content-Type: application/json" \
  -d "{\"actionType\":\"TEST_WIFI\",\"message\":\"prueba\",\"deviceId\":\"arduino_nano_33_01\"}"
```

## Notas para el firmware (WiFiEvents.ino)

1. Llamar el envio WiFi tambien **dentro** del `while (central.connected())` de BLE; si no, con el celular conectado no se mandan logs.
2. Encolar con `queueEventLog(...)` en cada `logInstruction(...)` o evento importante (`BOOT`, recordatorio disparado, errores).
3. Reintentos en cola local si WiFi o servidor no estan disponibles.
4. `deviceId` fijo del equipo, por ejemplo `arduino_nano_33_01`.

Ver plantilla de referencia: `docs/arduino/WiFiEvents.reference.ino`
