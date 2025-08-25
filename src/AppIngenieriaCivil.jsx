import React, { useEffect, useMemo, useState } from "react";

/* ===== Utils ===== */
const currency = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(Number(n || 0));

const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/* Calcular totales de factura */
const calcTotals = (items = [], ivaPct = 0) => {
  const subtotal = items.reduce(
    (a, it) => a + Number(it.cantidad || 0) * Number(it.precio || 0),
    0
  );
  const iva = (subtotal * Number(ivaPct || 0)) / 100;
  const total = subtotal + iva;
  return { subtotal, iva, total };
};

/* ===== API (Apps Script) ===== */
const API = (() => {
  const BASE = window.__APPSCRIPT_BASE__ || "";
  const TOKEN = window.__APPSCRIPT_TOKEN__ || "GRETA";
  const j = (r) => r.json();
  const ok = () => !!BASE;
  return {
    ok,
    listarClientes: () => fetch(`${BASE}?type=clientes&token=${TOKEN}`).then(j),
    crearCliente: (data) =>
      fetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ op: "crear_cliente", token: TOKEN, data }),
      }).then(j),
    crearFactura: (data) =>
      fetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ op: "crear_factura", token: TOKEN, data }),
      }).then(j),
    registrarCobro: (data) =>
      fetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ op: "registrar_cobro", token: TOKEN, data }),
      }).then(j),
  };
})();

/* ===== APP ===== */
export default function AppIngenieriaCivil() {
  const initial = {
    empresa: { nombre: "Servicios de Ingeniería Civil S.R.L." },
    consecutivos: { factura: 1, recibo: 1 },
    clientes: [],
    facturas: [],
    recibos: [],
  };

  const [data, setData] = useState(initial);
  const [tab, setTab] = useState("dashboard"); // dashboard | clientes | facturacion | cobros
  const [vistaClienteId, setVistaClienteId] = useState(null);

  /* ---- Cargar/guardar local ---- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("iciv-data");
      if (raw) setData((prev) => ({ ...prev, ...JSON.parse(raw) }));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("iciv-data", JSON.stringify(data));
    } catch {}
  }, [data]);

  /* ---- Traer clientes del Sheet y fusionar ---- */
  useEffect(() => {
    (async () => {
      if (!API.ok()) return;
      try {
        const res = await API.listarClientes();
        if (res?.ok && Array.isArray(res.data)) {
          const externos = res.data.map((r) => ({
            id: r.ID || uid(),
            nombre: r.Nombre || "",
            email: r.Contacto || "",
            telefono: r.Telefono || "",
            direccion: r.Empresa || "",
          }));
          setData((prev) => {
            const key = (c) =>
              `${(c.nombre || "").trim().toLowerCase()}::${(
                c.email || c.telefono || ""
              )
                .trim()
                .toLowerCase()}`;
            const merged = new Map(prev.clientes.map((c) => [key(c), c]));
            externos.forEach((c) => merged.set(key(c), c));
            return { ...prev, clientes: Array.from(merged.values()) };
          });
        }
      } catch (e) {
        console.error("Error cargando clientes:", e);
      }
    })();
  }, []);

  const clientesMap = useMemo(
    () => Object.fromEntries(data.clientes.map((c) => [c.id, c])),
    [data.clientes]
  );

  const saldoCliente = (clienteId) =>
    (data.facturas || [])
      .filter((f) => f.clienteId === clienteId)
      .reduce((acc, f) => acc + (Number(f.saldo) || 0), 0);

  /* ===== Acciones ===== */

  const crearCliente = async (cliente) => {
    const nuevo = { id: uid(), ...cliente };
    setData((prev) => {
      const next = { ...prev, clientes: [...prev.clientes, nuevo] };
      try { localStorage.setItem("iciv-data", JSON.stringify(next)); } catch {}
      return next;
    });
    if (API.ok()) {
      try {
        const res = await API.crearCliente({
          Nombre: cliente.nombre,
          Empresa: cliente.direccion || "",
          Contacto: cliente.email || cliente.telefono || "",
        });
        if (!res?.ok)
          alert("No se pudo guardar en el Sheet: " + (res?.error || "desconocido"));
      } catch (e) {
        console.error("crearCliente:", e);
        alert("Error Apps Script (cliente): " + e.message);
      }
    }
  };

  const crearFactura = async ({ clienteId, fecha, concepto, items, ivaPct }) => {
    const numero = String(data.consecutivos.factura).padStart(8, "0");
    const { subtotal, iva, total } = calcTotals(items, ivaPct);

    const f = {
      id: uid(),
      numero,
      clienteId,
      fecha,
      concepto,
      items,         // guardamos ítems localmente
      ivaPct: Number(ivaPct || 0),
      subtotal,
      iva,
      total,
      saldo: total,
      estado: "Pendiente",
    };

    // local
    setData((prev) => {
      const next = {
        ...prev,
        consecutivos: { ...prev.consecutivos, factura: prev.consecutivos.factura + 1 },
        facturas: [f, ...prev.facturas],
      };
      try { localStorage.setItem("iciv-data", JSON.stringify(next)); } catch {}
      return next;
    });

    // remoto
    if (API.ok()) {
      try {
        const cli = clientesMap[clienteId];
        const res = await API.crearFactura({
          Fecha: fecha,
          Nombre: cli?.nombre || "",
          Numero: numero,
          Subtotal: subtotal,
          Total: total,
          Concepto: concepto,
          ClienteID: clienteId,
          IVA: f.ivaPct,
          Items_JSON: JSON.stringify(items || []),
        });
        if (!res?.ok)
          alert("No se pudo guardar FACTURA: " + (res?.error || "desconocido"));
      } catch (e) {
        console.error("crearFactura:", e);
        alert("Error Apps Script (factura): " + e.message);
      }
    }
  };

  const registrarCobro = async (cobro) => {
    const numero = `RC-${String(data.consecutivos.recibo).padStart(6, "0")}`;
    const nuevo = { id: uid(), numero, ...cobro };

    const nuevasFacturas = data.facturas.map((f) => {
      const it = cobro.items.find((i) => i.facturaId === f.id);
      if (!it) return f;
      const saldo = Math.max(0, Number(f.saldo) - Number(it.aplicado));
      const estado = saldo === 0 ? "Pagada" : saldo < f.total ? "Parcial" : "Pendiente";
      return { ...f, saldo, estado };
    });

    setData((prev) => {
      const next = {
        ...prev,
        consecutivos: { ...prev.consecutivos, recibo: prev.consecutivos.recibo + 1 },
        facturas: nuevasFacturas,
        recibos: [nuevo, ...prev.recibos],
      };
      try { localStorage.setItem("iciv-data", JSON.stringify(next)); } catch {}
      return next;
    });

    if (API.ok()) {
      try {
        const cli = clientesMap[cobro.clienteId];
        const res = await API.registrarCobro({
          Numero: numero,
          Fecha: cobro.fecha,
          Nombre: cli?.nombre || "",
          Monto: cobro.monto,
          Medio: cobro.metodo,
          items: cobro.items.map((i) => ({ facturaId: i.facturaId, aplicado: i.aplicado })),
          Observaciones: cobro.observaciones || "",
        });
        if (!res?.ok)
          alert("No se pudo guardar RECIBO: " + (res?.error || "desconocido"));
      } catch (e) {
        console.error("registrarCobro:", e);
        alert("Error Apps Script (recibo): " + e.message);
      }
    }
  };

  /* ===== Vistas ===== */
  return (
    <div style={{ padding: 20, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <h1>{data.empresa.nombre}</h1>

      <div style={{ marginBottom: 20 }}>
        <button onClick={() => { setTab("dashboard"); setVistaClienteId(null); }}>Dashboard</button>{" "}
        <button onClick={() => { setTab("clientes"); setVistaClienteId(null); }}>Clientes</button>{" "}
        <button onClick={() => { setTab("facturacion"); setVistaClienteId(null); }}>Facturación</button>{" "}
        <button onClick={() => { setTab("cobros"); setVistaClienteId(null); }}>Cobros</button>
      </div>

      {/* Dashboard */}
      {tab === "dashboard" && (
        <div>
          <h2>Dashboard</h2>
          <p>Total clientes: {data.clientes.length}</p>
          <p>Facturas abiertas: {data.facturas.filter((f) => (f.saldo ?? 0) > 0).length}</p>
          <p>Saldo por cobrar: {currency(data.facturas.reduce((a, f) => a + Number(f.saldo || 0), 0))}</p>
        </div>
      )}

      {/* Clientes */}
      {tab === "clientes" && (
        vistaClienteId ? (
          <ClienteDetalle
            cliente={clientesMap[vistaClienteId]}
            facturas={(data.facturas || []).filter(f => f.clienteId === vistaClienteId)}
            onVolver={() => setVistaClienteId(null)}
            onCobrar={async (items, metodo, fecha, observaciones) => {
              const monto = items.reduce((acc, i) => acc + Number(i.aplicado || 0), 0);
              await registrarCobro({
                clienteId: vistaClienteId,
                fecha,
                metodo,
                monto,
                items,
                observaciones,
              });
            }}
          />
        ) : (
          <ClientesLista
            data={data}
            saldoCliente={saldoCliente}
            onNuevo={(c) => crearCliente(c)}
            onVer={(id) => setVistaClienteId(id)}
          />
        )
      )}

      {/* Facturación */}
      {tab === "facturacion" && (
        <div>
          <h2>Nueva factura</h2>

          <FacturaForm
            clientes={data.clientes}
            onCrear={(payload) => crearFactura(payload)}
          />

          <h3 style={{ marginTop: 28 }}>Últimas facturas</h3>
          <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 980 }}>
            <thead>
              <tr>
                <th style={th}>N°</th>
                <th style={th}>Fecha</th>
                <th style={th}>Cliente</th>
                <th style={th}>Concepto</th>
                <th style={th}>Subtotal</th>
                <th style={th}>IVA</th>
                <th style={th}>Total</th>
                <th style={th}>Saldo</th>
                <th style={th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.facturas.map((f) => (
                <tr key={f.id}>
                  <td style={td}>{f.numero}</td>
                  <td style={td}>{f.fecha}</td>
                  <td style={td}>{clientesMap[f.clienteId]?.nombre || "-"}</td>
                  <td style={td}>{f.concepto}</td>
                  <td style={td}>{currency(f.subtotal ?? f.total)}</td>
                  <td style={td}>{currency(f.iva ?? 0)} {f.ivaPct ? `(${f.ivaPct}%)` : ""}</td>
                  <td style={td}>{currency(f.total)}</td>
                  <td style={td}>{currency(f.saldo)}</td>
                  <td style={td}>{f.estado}</td>
                </tr>
              ))}
              {data.facturas.length === 0 && (
                <tr><td style={td} colSpan={9}>Aún no hay facturas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Cobros (demo listado) */}
      {tab === "cobros" && (
        <div>
          <h2>Cobros</h2>
          <ul>
            {data.recibos.map((r) => (
              <li key={r.id}>
                {r.numero} — {currency(r.monto)} — {r.metodo} — {r.fecha}
              </li>
            ))}
            {data.recibos.length === 0 && <li>No hay cobros.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ================== Subcomponentes ================== */

function ClientesLista({ data, saldoCliente, onNuevo, onVer }) {
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState({ nombre: "", email: "", telefono: "", direccion: "" });

  return (
    <div>
      <h2>Clientes</h2>

      <div style={{ marginBottom: 12 }}>
        <button onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancelar" : "+ Nuevo cliente"}
        </button>
      </div>

      {showForm && (
        <div style={{ border: "1px solid #ddd", padding: 12, marginBottom: 16, maxWidth: 520 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <input placeholder="Nombre" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
            <input placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <input placeholder="Teléfono" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
            <input placeholder="Empresa / Dirección" value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} />
            <div>
              <button
                onClick={() => {
                  if (!f.nombre.trim()) return alert("Ingresá un nombre");
                  onNuevo(f);
                  setF({ nombre: "", email: "", telefono: "", direccion: "" });
                  setShowForm(false);
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 900 }}>
        <thead>
          <tr>
            <th style={th}>Cliente</th>
            <th style={th}>Email</th>
            <th style={th}>Teléfono</th>
            <th style={th}>Saldo</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {data.clientes.map((c) => (
            <tr key={c.id}>
              <td style={td}>{c.nombre}</td>
              <td style={td}>{c.email}</td>
              <td style={td}>{c.telefono}</td>
              <td style={td}>{currency((data.facturas || []).filter(f => f.clienteId === c.id).reduce((a, f) => a + Number(f.saldo || 0), 0))}</td>
              <td style={td}>
                <button onClick={() => onVer(c.id)}>Ver cuenta</button>
              </td>
            </tr>
          ))}
          {data.clientes.length === 0 && (
            <tr><td style={td} colSpan={5}>Sin clientes todavía.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ClienteDetalle({ cliente, facturas, onVolver, onCobrar }) {
  const [seleccion, setSeleccion] = useState({});
  const [metodo, setMetodo] = useState("Transferencia");
  const [fecha, setFecha] = useState(todayISO());
  const [obs, setObs] = useState("");

  if (!cliente) {
    return (
      <div>
        <button onClick={onVolver}>← Volver</button>
        <p>No se encontró el cliente.</p>
      </div>
    );
  }

  const totalAplicado = Object.values(seleccion).reduce((a, v) => a + Number(v || 0), 0);

  const toggle = (f) => {
    setSeleccion((prev) => {
      const next = { ...prev };
      if (next[f.id]) delete next[f.id];
      else next[f.id] = f.saldo;
      return next;
    });
  };

  return (
    <div>
      <button onClick={onVolver}>← Volver</button>
      <h2>{cliente.nombre}</h2>
      <p><b>Email:</b> {cliente.email || "-"} &nbsp; <b>Tel:</b> {cliente.telefono || "-"}</p>

      <h3>Cuenta corriente</h3>
      <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 900 }}>
        <thead>
          <tr>
            <th style={th}></th>
            <th style={th}>N°</th>
            <th style={th}>Fecha</th>
            <th style={th}>Concepto</th>
            <th style={th}>Total</th>
            <th style={th}>Saldo</th>
            <th style={th}>Aplicar</th>
          </tr>
        </thead>
        <tbody>
          {facturas.length === 0 && (
            <tr><td style={td} colSpan={7}>Este cliente no tiene facturas.</td></tr>
          )}
          {facturas.map((f) => (
            <tr key={f.id}>
              <td style={td}>
                <input type="checkbox" checked={!!seleccion[f.id]} onChange={() => toggle(f)} />
              </td>
              <td style={td}>{f.numero}</td>
              <td style={td}>{f.fecha}</td>
              <td style={td}>{f.concepto}</td>
              <td style={td}>{currency(f.total)}</td>
              <td style={td}>{currency(f.saldo)}</td>
              <td style={td}>
                {seleccion[f.id] !== undefined && (
                  <input
                    type="number"
                    min={0}
                    max={f.saldo}
                    step="0.01"
                    value={seleccion[f.id]}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(Number(e.target.value || 0), Number(f.saldo)));
                      setSeleccion((prev) => ({ ...prev, [f.id]: v }));
                    }}
                    style={{ width: 120 }}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16, display: "grid", gap: 8, maxWidth: 520 }}>
        <label>
          Fecha:&nbsp;
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label>
          Medio de pago:&nbsp;
          <select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            <option>Transferencia</option>
            <option>Efectivo</option>
            <option>Tarjeta</option>
            <option>Cheque</option>
          </select>
        </label>
        <textarea
          placeholder="Observaciones (opcional)"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          rows={2}
        />
        <div><b>Total a cobrar:</b> {currency(totalAplicado)}</div>
        <div>
          <button
            disabled={totalAplicado <= 0}
            onClick={() => {
              const items = Object.entries(seleccion).map(([facturaId, aplicado]) => ({
                facturaId,
                aplicado: Number(aplicado || 0),
              })).filter(i => i.aplicado > 0);
              if (items.length === 0) return;
              onCobrar(items, metodo, fecha, obs);
              setSeleccion({});
              setObs("");
            }}
          >
            Generar cobro
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------ Formulario de Factura con ítems ------ */
function FacturaForm({ clientes = [], onCrear }) {
  const [clienteId, setClienteId] = useState("");
  const [fecha, setFecha] = useState(todayISO());
  const [concepto, setConcepto] = useState("Servicios de ingeniería");
  const [ivaPct, setIvaPct] = useState(21);
  const [items, setItems] = useState([
    { id: uid(), descripcion: "Tarea / rubro", cantidad: 1, precio: 0 },
  ]);

  const totals = useMemo(() => calcTotals(items, ivaPct), [items, ivaPct]);

  const addRow = () =>
    setItems((prev) => [
      ...prev,
      { id: uid(), descripcion: "", cantidad: 1, precio: 0 },
    ]);
  const delRow = (id) => setItems((prev) => prev.filter((r) => r.id !== id));
  const updateRow = (id, patch) =>
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const canSave =
    clienteId &&
    items.length > 0 &&
    items.some((r) => Number(r.cantidad) > 0 && Number(r.precio) > 0);

  return (
    <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 6, maxWidth: 980 }}>
      {clientes.length === 0 ? (
        <p>Primero creá un cliente para poder facturar.</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <label>
              Cliente<br />
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">-- elegir --</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </label>
            <label>
              Fecha<br />
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </label>
            <label style={{ gridColumn: "1 / span 2" }}>
              Concepto<br />
              <input
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder="Concepto general / Observación"
              />
            </label>
          </div>

          <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 10 }}>
            <thead>
              <tr>
                <th style={th}>Descripción</th>
                <th style={th}>Cant.</th>
                <th style={th}>Precio</th>
                <th style={th}>Importe</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const importe = Number(r.cantidad || 0) * Number(r.precio || 0);
                return (
                  <tr key={r.id}>
                    <td style={td}>
                      <input
                        value={r.descripcion}
                        onChange={(e) => updateRow(r.id, { descripcion: e.target.value })}
                        placeholder="Descripción del ítem"
                        style={{ width: "100%" }}
                      />
                    </td>
                    <td style={td} width={110}>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={r.cantidad}
                        onChange={(e) => updateRow(r.id, { cantidad: Number(e.target.value || 0) })}
                        style={{ width: "100%" }}
                      />
                    </td>
                    <td style={td} width={140}>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={r.precio}
                        onChange={(e) => updateRow(r.id, { precio: Number(e.target.value || 0) })}
                        style={{ width: "100%" }}
                      />
                    </td>
                    <td style={td} width={140}>{currency(importe)}</td>
                    <td style={td} width={80}>
                      <button onClick={() => delRow(r.id)}>×</button>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td style={td} colSpan={5}>Sin ítems.</td></tr>
              )}
            </tbody>
          </table>

          <div style={{ marginBottom: 10 }}>
            <button onClick={addRow}>+ Ítem</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "center" }}>
            <label>
              IVA %<br />
              <input
                type="number"
                min={0}
                step="0.01"
                value={ivaPct}
                onChange={(e) => setIvaPct(Number(e.target.value || 0))}
                style={{ width: 120 }}
              />
            </label>
            <div style={{ textAlign: "right" }}>
              <div>Subtotal: <b>{currency(totals.subtotal)}</b></div>
              <div>IVA: <b>{currency(totals.iva)}</b></div>
              <div>Total: <b>{currency(totals.total)}</b></div>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <button
              disabled={!canSave}
              onClick={() => {
                onCrear({ clienteId, fecha, concepto, items, ivaPct });
                // limpiar form
                setClienteId("");
                setFecha(todayISO());
                setConcepto("Servicios de ingeniería");
                setIvaPct(21);
                setItems([{ id: uid(), descripcion: "Tarea / rubro", cantidad: 1, precio: 0 }]);
              }}
            >
              Guardar factura
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ===== estilos mínimos de tabla ===== */
const th = { borderBottom: "1px solid #ddd", textAlign: "left", padding: "8px 6px" };
const td = { borderBottom: "1px solid #f0f0f0", padding: "6px" };


