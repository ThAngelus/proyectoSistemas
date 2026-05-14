# Proyecto Final - Sistemas Operativos II (UMG)

Sistema de monitoreo de eventos de robotica con arquitectura de tres componentes en contenedores Docker:

- Backend de logs (Node.js + Express + MongoDB)
- Base de datos no relacional (MongoDB)
- Frontend dashboard web (React + Vite + Nginx)

## 1) Direccion IP publica del servidor

- `http://167.99.155.211` -> Frontend
- `http://167.99.155.211:3000/health` -> Health backend

En desarrollo local en Windows, si el puerto 80 esta ocupado, crea `docker-compose.override.yml` (no se sube a Git) con:

```yaml
services:
  frontend:
    ports:
      - "8080:80"
```

El dashboard local queda en **http://localhost:8080**.

## 2) Diseno de arquitectura del sistema

El log central acepta eventos por **dos caminos** (flexibles, no excluyentes):

1. **Arduino Nano 33 IoT por WiFi** — `POST /events` directo a `http://<IP_SERVIDOR>:3000/events` (sin app).
2. **App Flutter (opcional)** — BLE al robot y/o reenvio de eventos al mismo endpoint.
3. **Dashboard web (opcional)** — encola comandos con `POST /commands` para que Flutter los ejecute por BLE.

Flujo tipico con robot autonomo (sin app):

1. El Arduino ejecuta una accion (comando BLE local, recordatorio, sensor, etc.).
2. El firmware del Arduino envia `POST /events` al backend por WiFi.
3. MongoDB persiste el evento.
4. El dashboard muestra el log en tiempo casi real.

Flujo con app movil:

1. Flutter envia instrucciones al robot por BLE.
2. Flutter tambien puede reportar `POST /events` (o el Arduino lo hace por WiFi en paralelo).
3. Comandos remotos: dashboard -> `POST /commands` -> Flutter `GET /commands/pending` -> BLE -> `POST /commands/:id/ack`.

Servicios (mismo servidor Linux):

- `umg_frontend` (puerto 80 en produccion; 8080 en local Windows)
- `umg_backend` (puerto 3000)
- `umg_mongo` (puerto 27017)

## 3) Tecnologias utilizadas

- Node.js 20 + Express
- MongoDB 7 + Mongoose
- React 18 + Vite + Nginx
- Docker + Docker Compose

## 4) Instrucciones de uso

### Requisitos

- Docker y Docker Compose instalados
- Puertos 80 (o 8080 en local) y 3000 abiertos en firewall del servidor

### Ejecutar en local o servidor Linux

Desde la raiz del repositorio:

```bash
docker compose up -d --build
docker compose ps
```

Dashboard local: http://localhost (o http://localhost:8080 con `docker-compose.override.yml` en Windows)

### Desarrollo sin Docker (opcional)

```bash
cd backend && npm install && npm start
cd frontend && npm install && npm run dev
```

El proyecto usa **npm** (`package-lock.json`). Tambien puedes usar **pnpm** en local si lo prefieres (`pnpm install` / `pnpm run build`); los Dockerfiles usan npm por compatibilidad con el lockfile actual del equipo.

### Endpoints backend

- `GET /health` estado de backend y MongoDB
- `POST /events` registrar evento
- `GET /events` listar ultimos 200 eventos
- `GET /events/summary` total de eventos en base de datos
- `POST /commands` encolar comando para robot
- `GET /commands/pending?deviceId=arduino_nano_33_01` obtener comandos pendientes para Flutter puente
- `POST /commands/:id/ack` confirmar ejecucion (`executed`/`failed`) con respuesta del robot
- `GET /commands` listar comandos recientes

### Ejemplo de evento desde Arduino (WiFi, minimo)

```json
{
  "actionType": "REMINDER_SAVE",
  "deviceId": "arduino_nano_33_01",
  "message": "Recordatorio guardado",
  "command": "REM|12|2026-05-02|16:30|TOMAR AGUA",
  "robotResponse": "OK|REMINDER_SAVED"
}
```

El backend asigna `source: "robot"` y `channel: "wifi"` si no se envian.

### Ejemplo de evento desde Flutter (BLE, opcional)

```json
{
  "actionType": "REMINDER_SAVE",
  "source": "flutter_app",
  "channel": "ble",
  "deviceId": "arduino_nano_33_01",
  "status": "executed",
  "message": "Recordatorio guardado en robot",
  "payload": {
    "command": "REM|12|2026-05-02|16:30|TOMAR AGUA",
    "robotResponse": "OK|REMINDER_SAVED",
    "mobileUserId": "u01"
  },
  "eventTimestamp": "2026-05-02T16:30:00.000Z"
}
```

### Prueba rapida con curl

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d "{\"actionType\":\"TEST\",\"source\":\"flutter_app\",\"channel\":\"ble\",\"deviceId\":\"arduino_nano_33_01\",\"status\":\"executed\",\"message\":\"Prueba manual\",\"payload\":{\"command\":\"TEST\",\"robotResponse\":\"OK|TEST\"}}"
```

### Flujo de comando remoto (servidor -> Flutter -> Arduino)

1) Encolar comando desde dashboard o curl:

```bash
curl -X POST http://localhost:3000/commands \
  -H "Content-Type: application/json" \
  -d "{\"commandText\":\"TEST\",\"commandType\":\"TEST\",\"targetDeviceId\":\"arduino_nano_33_01\",\"source\":\"dashboard\"}"
```

2) Flutter consulta pendientes:

```bash
curl "http://localhost:3000/commands/pending?deviceId=arduino_nano_33_01"
```

3) Flutter envia el comando por BLE al Arduino y reporta ACK:

```bash
curl -X POST http://localhost:3000/commands/<COMMAND_ID>/ack \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"executed\",\"robotResponse\":\"OK|TEST\",\"executionNotes\":\"Comando ejecutado por BLE\",\"source\":\"flutter_app\"}"
```

## 5) Demostracion solicitada por el curso

### A. Mostrar servidor Linux y contenedores

```bash
docker compose ps
```

### B. Pausar backend y validar que no se registran eventos

```bash
docker pause umg_backend
docker unpause umg_backend
```

Resultado esperado:
- Flutter no podra reportar eventos al backend mientras este pausado.

### C. Pausar base de datos y validar que se reciben, pero no se almacenan

```bash
docker pause umg_mongo
docker unpause umg_mongo
```

Resultado esperado:
- `POST /events` responde `202` con `stored: false` cuando Mongo esta no disponible.

### D. Pausar frontend y validar que no se accede al dashboard

```bash
docker pause umg_frontend
docker unpause umg_frontend
```

Resultado esperado:
- La interfaz web no carga, pero backend y recepcion de eventos siguen activos.

## 6) Colaboracion en GitHub

- Mantener el proyecto en un repositorio publico del grupo.
- Realizar commits individuales de cada integrante para evidenciar contribucion real.
