import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const LOCALE_ES = "es-GT";
const POLL_MS = 8000;

function resolveApiBaseUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  const host = window.location.hostname || "localhost";
  return `http://${host}:3000`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString(LOCALE_ES, {
    dateStyle: "short",
    timeStyle: "medium"
  });
}

function formatDateLong(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString(LOCALE_ES, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function statusBadgeClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "executed" || s === "stored" || s === "received") return "badge badge--ok";
  if (s === "failed") return "badge badge--err";
  return "badge badge--warn";
}

function etiquetaFiltro(valor) {
  if (valor === "all") return null;
  if (valor === "unknown") return "desconocido";
  return valor;
}

const CMD_PRESETS = [
  { label: "TEST", type: "TEST", text: "TEST" },
  { label: "STATUS", type: "STATUS", text: "STATUS" },
  { label: "LIST", type: "LIST", text: "LIST" },
  { label: "TXT", type: "TXT", text: "TXT|OTTOBOT_ONLINE" },
  { label: "WALK", type: "WALK", text: "WALK" }
];

export default function App() {
  const apiBaseUrl = useMemo(() => resolveApiBaseUrl(), []);
  const [events, setEvents] = useState([]);
  const [commands, setCommands] = useState([]);
  const [summary, setSummary] = useState({ total: 0, bySource: [], byStatus: [] });
  const [loadingInicial, setLoadingInicial] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [mongoConnected, setMongoConnected] = useState(null);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [targetDeviceId, setTargetDeviceId] = useState("arduino_nano_33_01");
  const [commandType, setCommandType] = useState("TEST");
  const [commandText, setCommandText] = useState("TEST");
  const [commandFeedback, setCommandFeedback] = useState("");
  const logScrollRef = useRef(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/health`);
      if (!res.ok) throw new Error("Sin respuesta del servidor");
      const data = await res.json();
      setMongoConnected(data.mongoConnected);
    } catch (_err) {
      setMongoConnected(false);
    }
  }, [apiBaseUrl]);

  const fetchEvents = useCallback(
    async ({ silencioso = false } = {}) => {
      if (!silencioso) {
        setError("");
        setLoadingInicial(true);
      } else {
        setSincronizando(true);
      }

      try {
        const res = await fetch(`${apiBaseUrl}/events`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || "No se pudieron obtener los eventos");
        }
        const data = await res.json();
        setEvents(Array.isArray(data) ? data : []);
        setUpdatedAt(new Date());

        if (silencioso && logScrollRef.current) {
          logScrollRef.current.classList.remove("log-sync-flash");
          void logScrollRef.current.offsetWidth;
          logScrollRef.current.classList.add("log-sync-flash");
          window.setTimeout(() => {
            logScrollRef.current?.classList.remove("log-sync-flash");
          }, 450);
        }
      } catch (err) {
        if (!silencioso) {
          setError(err.message || "Error al cargar eventos");
        }
      } finally {
        if (!silencioso) {
          setLoadingInicial(false);
        } else {
          setSincronizando(false);
        }
      }
    },
    [apiBaseUrl]
  );

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/events/summary`);
      if (!res.ok) return;
      const data = await res.json();
      setSummary({
        total: data.total || 0,
        bySource: Array.isArray(data.bySource) ? data.bySource : [],
        byStatus: Array.isArray(data.byStatus) ? data.byStatus : []
      });
    } catch (_err) {
      /* ignorar en segundo plano */
    }
  }, [apiBaseUrl]);

  const fetchCommands = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/commands`);
      if (!res.ok) return;
      const data = await res.json();
      setCommands(Array.isArray(data) ? data : []);
    } catch (_err) {
      /* ignorar */
    }
  }, [apiBaseUrl]);

  const sincronizarTodo = useCallback(
    async ({ silencioso = false } = {}) => {
      await Promise.all([fetchHealth(), fetchEvents({ silencioso }), fetchSummary(), fetchCommands()]);
    },
    [fetchHealth, fetchEvents, fetchSummary, fetchCommands]
  );

  async function queueCommand(submitEvent) {
    submitEvent.preventDefault();
    setCommandFeedback("");

    try {
      const res = await fetch(`${apiBaseUrl}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commandText,
          commandType,
          targetDeviceId,
          source: "dashboard"
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || "No se pudo encolar el comando");
      }

      setCommandFeedback("Comando encolado correctamente.");
      await sincronizarTodo({ silencioso: true });
    } catch (err) {
      setCommandFeedback(`Error: ${err.message}`);
    }
  }

  const sourceOptions = useMemo(() => {
    const values = new Set(events.map((event) => event.source || "unknown"));
    return ["all", ...Array.from(values)];
  }, [events]);

  const statusOptions = useMemo(() => {
    const values = new Set(events.map((event) => event.status || "unknown"));
    return ["all", ...Array.from(values)];
  }, [events]);

  const channelOptions = useMemo(() => {
    const values = new Set(events.map((event) => event.channel || "unknown"));
    return ["all", ...Array.from(values)];
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const sourceMatches = sourceFilter === "all" || (event.source || "unknown") === sourceFilter;
      const statusMatches = statusFilter === "all" || (event.status || "unknown") === statusFilter;
      const channelMatches = channelFilter === "all" || (event.channel || "unknown") === channelFilter;
      return sourceMatches && statusMatches && channelMatches;
    });
  }, [events, sourceFilter, statusFilter, channelFilter]);

  const ultimoEvento = events[0] || null;
  const idUltimoLog = ultimoEvento?._id;
  const ultimoVisibleEnTabla = useMemo(() => {
    if (!idUltimoLog) return false;
    return filteredEvents.some((e) => e._id === idUltimoLog);
  }, [filteredEvents, idUltimoLog]);

  const pendingCommands = useMemo(
    () => commands.filter((c) => c.status === "pending" || c.status === "sent").length,
    [commands]
  );

  useEffect(() => {
    let cancelado = false;

    (async () => {
      await sincronizarTodo({ silencioso: false });
    })();

    const intervalo = window.setInterval(() => {
      if (cancelado) return;
      sincronizarTodo({ silencioso: true });
    }, POLL_MS);

    return () => {
      cancelado = true;
      window.clearInterval(intervalo);
    };
  }, [sincronizarTodo]);

  function applyPreset(p) {
    setCommandType(p.type);
    setCommandText(p.text);
  }

  function clearLogView() {
    setSourceFilter("all");
    setStatusFilter("all");
    setChannelFilter("all");
    if (logScrollRef.current) {
      logScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <div className="otto-app">
      <div className="otto-bg-grid" aria-hidden="true" />
      <div className="otto-bg-glow" aria-hidden="true" />
      <div className="otto-bg-glow-2" aria-hidden="true" />

      <div className="otto-shell">
        <header className="otto-topbar">
          <div className="otto-brand">
            <div className="otto-logo" aria-hidden="true">
              <i className="fa-solid fa-robot" />
            </div>
            <div className="otto-brand-text">
              <h1>OTTOBOT</h1>
            </div>
          </div>
          <div className="otto-top-actions">
            {sincronizando ? (
              <span className="sync-hint" aria-live="polite">
                <i className="fa-solid fa-circle-notch fa-spin" />
              </span>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => sincronizarTodo({ silencioso: true })}
              disabled={sincronizando}
            >
              <i className="fa-solid fa-rotate" /> Sincronizar
            </button>
          </div>
        </header>

        <div className="bento">
          <section className="glass bento-card span-12">
            <div className="glass-header">
              <div>
                <h2 className="glass-title">
                  <i className="fa-solid fa-server" /> Servidor
                </h2>
              </div>
              <span
                className={`status-dot ${mongoConnected ? "" : "status-dot--off"}`}
                title={mongoConnected ? "MongoDB conectado" : "MongoDB desconectado"}
              />
            </div>
            <div className="metric-row">
              <div className="metric">
                <div className="metric-label">MongoDB</div>
                <div className={`metric-value mono ${mongoConnected ? "" : "metric-value--blue"}`}>
                  {mongoConnected === null ? "…" : mongoConnected ? "ACTIVO" : "INACTIVO"}
                </div>
              </div>
              <div className="metric">
                <div className="metric-label">Eventos (total)</div>
                <div className="metric-value mono">{summary.total || events.length}</div>
              </div>
              <div className="metric">
                <div className="metric-label">Comandos pendientes</div>
                <div className="metric-value metric-value--blue mono">{pendingCommands}</div>
              </div>
            </div>
            <p className="glass-sub" style={{ marginTop: "0.75rem" }}>
              <i className="fa-solid fa-link" style={{ color: "var(--neon-blue)", marginRight: 6 }} />
              <span className="mono" style={{ color: "var(--neon-green)", wordBreak: "break-all" }}>
                {apiBaseUrl}
              </span>
            </p>
          </section>

          <section className="glass bento-card span-6">
            <div className="glass-header">
              <div>
                <h2 className="glass-title">
                  <i className="fa-solid fa-gamepad" /> Comandos
                </h2>
              </div>
            </div>
            <div className="cmd-presets" style={{ marginBottom: "0.65rem" }}>
              {CMD_PRESETS.map((p) => (
                <button key={p.label} type="button" className="cmd-preset" onClick={() => applyPreset(p)}>
                  <i className="fa-solid fa-bolt" style={{ marginRight: 4 }} />
                  {p.label}
                </button>
              ))}
            </div>
            <form className="cmd-form" onSubmit={queueCommand}>
              <div className="cmd-row">
                <div className="cmd-field">
                  <label htmlFor="deviceId">ID del dispositivo</label>
                  <input
                    id="deviceId"
                    value={targetDeviceId}
                    onChange={(e) => setTargetDeviceId(e.target.value)}
                    required
                    autoComplete="off"
                  />
                </div>
                <div className="cmd-field">
                  <label htmlFor="cmdType">Tipo</label>
                  <input id="cmdType" value={commandType} onChange={(e) => setCommandType(e.target.value)} required />
                </div>
              </div>
              <div className="cmd-field">
                <label htmlFor="cmdText">Comando BLE (texto)</label>
                <input id="cmdText" value={commandText} onChange={(e) => setCommandText(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>
                <i className="fa-solid fa-paper-plane" /> Encolar comando
              </button>
            </form>
            {commandFeedback ? (
              <p
                className={`cmd-feedback mono ${commandFeedback.startsWith("Error") ? "cmd-feedback--err" : "cmd-feedback--ok"}`}
              >
                {commandFeedback}
              </p>
            ) : null}
          </section>

          <section className="glass bento-card span-6">
            <div className="glass-header">
              <div>
                <h2 className="glass-title">
                  <i className="fa-solid fa-list-check" /> Cola
                </h2>
              </div>
            </div>
            {commands.length === 0 ? (
              <p className="glass-sub">Sin comandos encolados aún.</p>
            ) : (
              <div className="mini-table-wrap">
                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>Estado</th>
                      <th>Comando</th>
                      <th>Respuesta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commands.slice(0, 12).map((command) => (
                      <tr key={command._id}>
                        <td>
                          <span className={statusBadgeClass(command.status)}>{command.status}</span>
                        </td>
                        <td className="mono" style={{ color: "var(--text)", fontSize: "0.72rem" }}>
                          {command.commandText}
                        </td>
                        <td className="mono" style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>
                          {command.robotResponse || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="glass bento-card span-12">
            <div className="glass-header">
              <div>
                <h2 className="glass-title">
                  <i className="fa-solid fa-table-list" /> Eventos
                </h2>
                {updatedAt ? (
                  <p className="glass-sub mono">
                    {formatDate(updatedAt)}
                  </p>
                ) : null}
              </div>
              <button type="button" className="btn btn-ghost" onClick={clearLogView}>
                <i className="fa-solid fa-broom" /> Limpiar vista
              </button>
            </div>

            {ultimoEvento ? (
              <div className="last-log-banner">
                <div className="last-log-banner__badge">
                  <i className="fa-solid fa-bolt" /> Último registro
                </div>
                <div className="last-log-banner__main">
                  <p className="last-log-banner__datetime mono">{formatDateLong(ultimoEvento.eventTimestamp || ultimoEvento.createdAt)}</p>
                  <p className="last-log-banner__action">
                    <strong>{ultimoEvento.actionType}</strong>
                    {ultimoEvento.message ? (
                      <span className="last-log-banner__msg"> — {ultimoEvento.message}</span>
                    ) : null}
                  </p>
                </div>
                {!ultimoVisibleEnTabla ? (
                  <p className="last-log-banner__hint">
                    <i className="fa-solid fa-filter" /> Oculto por filtros.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="log-toolbar">
              <div className="chip-group" aria-label="Filtro por fuente">
                {sourceOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`chip ${sourceFilter === option ? "chip--active" : ""}`}
                    onClick={() => setSourceFilter(option)}
                  >
                    {option === "all" ? "Todos" : etiquetaFiltro(option) || option}
                  </button>
                ))}
              </div>
              <div className="chip-group" aria-label="Filtro por canal">
                {channelOptions.map((option) => (
                  <button
                    key={`ch-${option}`}
                    type="button"
                    className={`chip ${channelFilter === option ? "chip--active" : ""}`}
                    onClick={() => setChannelFilter(option)}
                  >
                    {option === "all" ? "Canal: todos" : `Canal: ${etiquetaFiltro(option) || option}`}
                  </button>
                ))}
              </div>
              <div className="chip-group" aria-label="Filtro por estado">
                {statusOptions.map((option) => (
                  <button
                    key={`st-${option}`}
                    type="button"
                    className={`chip ${statusFilter === option ? "chip--active" : ""}`}
                    onClick={() => setStatusFilter(option)}
                  >
                    {option === "all" ? "Estado: todos" : `Estado: ${etiquetaFiltro(option) || option}`}
                  </button>
                ))}
              </div>
            </div>

            {loadingInicial && (
              <div className="loading-line">
                <i className="fa-solid fa-circle-notch fa-spin" /> Cargando eventos…
              </div>
            )}
            {error && (
              <p className="cmd-feedback cmd-feedback--err mono">
                <i className="fa-solid fa-triangle-exclamation" /> {error}
              </p>
            )}

            {!loadingInicial && !error && filteredEvents.length === 0 && (
              <p className="glass-sub">No hay eventos para los filtros actuales.</p>
            )}

            {!loadingInicial && !error && filteredEvents.length > 0 && (
              <div className="log-scroll" ref={logScrollRef}>
                <table className="log-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Fecha y hora</th>
                      <th>Origen</th>
                      <th>Canal</th>
                      <th>Acción</th>
                      <th>Estado</th>
                      <th>Dispositivo</th>
                      <th>Mensaje</th>
                      <th title="Información extra guardada con el evento (por ejemplo ID de comando o lecturas)">
                        Datos adicionales
                      </th>
                    </tr>
                  </thead>
                  <tbody className={sincronizando ? "log-tbody--idle" : ""}>
                    {filteredEvents.map((event, index) => {
                      const esUltimo = idUltimoLog && event._id === idUltimoLog;
                      return (
                        <tr key={event._id} className={esUltimo ? "log-row--latest" : undefined}>
                          <td className="mono" style={{ color: "var(--text-muted)" }}>
                            {index + 1}
                          </td>
                          <td className="mono log-cell-datetime" style={{ fontSize: "0.72rem" }}>
                            {esUltimo ? (
                              <span className="log-latest-mark">
                                <i className="fa-solid fa-star" /> {formatDate(event.eventTimestamp || event.createdAt)}
                              </span>
                            ) : (
                              formatDate(event.eventTimestamp || event.createdAt)
                            )}
                          </td>
                          <td>{etiquetaFiltro(event.source) || event.source || "—"}</td>
                          <td>{etiquetaFiltro(event.channel) || event.channel || "—"}</td>
                          <td>
                            <strong>{event.actionType}</strong>
                          </td>
                          <td>
                            <span className={statusBadgeClass(event.status)}>{event.status || "—"}</span>
                          </td>
                          <td className="mono" style={{ fontSize: "0.72rem" }}>
                            {event.deviceId || "—"}
                          </td>
                          <td style={{ maxWidth: 200 }}>{event.message || "—"}</td>
                          <td>
                            <pre className="log-payload">{JSON.stringify(event.payload || {}, null, 2)}</pre>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
