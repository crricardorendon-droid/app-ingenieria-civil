import React, { useEffect, useMemo, useState } from "react";

/* ================== Helpers ================== */

const BASE = window.__APPSCRIPT_BASE__;
const TOKEN = window.__APPSCRIPT_TOKEN__; // "GRETA"

const fmtMoney = (n) =>
  (Number(n || 0)).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  });

const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const j = (r) => r.json();

/* ================== API ================== */

const API = {
  ping: () => fetch(`${BASE}?type=ping&token=${TOKEN}`).then(j),
  clientes: () => fetch(`${BASE}?type=clientes&token=${TOKEN}`).then(j),
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

/* ================== UI: Nav ================== */

function Nav({ vista, setVista }) {
  const Tab = ({ id, children }) => (
    <button
      onClick={() => setVista(id)}
      style={{
        padding: "8px 12px",
        marginRight: 10,
        border: "1px solid #999",
        borderRadius: 6,
        background: vista === id ? "#eee" : "#fff",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
  return (
    <div style={{ marginBottom: 24 }}>
      <Tab id="dashboard">Dashboard</Tab>
      <Tab id="clientes">Clientes</Tab>
      <Tab id="facturacion">Facturación</Tab>
      <Tab id="cobros">Cobros</Tab>
    </div>
  );
}

/* ================== Dashboard ================== */

function Dashboard({ clientes, facturas }) {
  const totalClientes = clientes.length;
  const facturasAbiertas = facturas.filter((f) => !f.cobrada).length;
  const saldo = facturas
    .filter((f) => !f.cobrada)
    .reduce((acc, f) => acc + Number(f.total || 0), 0);

  return (
    <>
      <h2>Dashboard</h2>
      <p>Total clientes: {totalClientes}</p>
      <p>Facturas abiertas: {facturasAbiertas}</p>
      <p>Saldo por cobrar: {fmtMoney(saldo)}</p>
    </>
  );
}

/* ================== Clientes ================== */

function Clientes({ clientes, onAdd, onVerCuenta }) {
  const [form, setForm] = useState({ nombre: "", empresa: "", contacto: "" });

  return (
    <div>
      <h2>Clientes</h2>

      <div style={{ marginBottom: 12 }}>
        <input
          placeholder="Nombre"
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          style={{ padding: 8, width: 220, marginRight: 8 }}
        />
        <input
          placeholder="Empresa"
          value={form.empresa}
          onChange={(e) => setForm({ ...form, empresa: e.target.value })}
          style={{ padding: 8, width: 220, marginRight: 8 }}
        />
        <input
          placeholder="Contacto"
          value={form.contacto}
          onChange={(e) => setForm({ ...form, contacto: e.target.value })}
          style={{ padding: 8, width: 220, marginRight: 8 }}
        />
        <button
          onClick={() => {
            if (!form.nombre.trim()) {
              alert("El nombre es obligatorio.");
              return;
            }
            onAdd(form);
            setForm({ nombre: "", empresa: "", contacto: "" });
          }}
          style={{ padding: "8px 12px" }}
        >
          + Agregar
        </button>
      </div>

      <table width="100%" cellPadding="8" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f3f3f3" }}>
            <th align="left">Nombre</th>
            <th align="left">Empresa</th>
            <th align="left">Contacto</th>
            <th align="left">Cuenta</th>
          </tr>
        </thead>
        <tbody>
          {clientes.map((c) => (
            <tr key={c.ID} style={{ borderTop: "1px solid #eee" }}>
              <td>{c.Nombre}</td>
              <td>{c.Empresa}</td>
              <td>{c.Contacto}</td>
              <td>
                <button onClick={() => onVerCuenta(c.ID)}>Ver cuenta</button>
              </td>
            </tr>
          ))}
          {!clientes.length && (
            <tr>
              <td colSpan={4} style={{ padding: 18, color: "#666" }}>
                Sin clientes aún…
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ================== Nueva Factura ================== */

function NuevaFactura({ clientes, onCrearFactura }) {
  const [data, setData] = useState({
    clienteId: "",
    fecha: todayISO(),
    concepto: "Servicios de ingeniería",
    iva: 21,
    numero: "",
  });

  const [items, setItems] = useState([
    { descripcion: "", cantidad: 1, precio: 0 },
  ]);

  const [saving, setSaving] = useState(false); // para “Guardando…”

  const subt = useMemo(
    () =>
      items.reduce(
        (acc, it) => acc + Number(it.cantidad || 0) * Number(it.precio || 0),
        0
      ),
    [items]
  );
  const ivaMonto = (subt * Number(data.iva || 0)) / 100;
  const total = subt + ivaMonto;

  const cli = clientes.find((c) => c.ID === data.clienteId);

  const handleSave = async () => {
    if (!data.clienteId) {
      alert("Elegí un cliente");
      return;
    }

    const payload = {
      ClienteID: data.clienteId,
      Fecha: data.fecha,
      Numero: data.numero || "",
      Nombre: cli?.Nombre || "",
      Concepto: data.concepto,
      Subtotal: subt,
      IVA: ivaMonto,
      Total: total,
      Items_JSON: JSON.stringify(items),
    };

    setSaving(true);
    try {
      const ok = await onCrearFactura(payload); // el padre devuelve true/false
      if (ok) {
        // limpiar formulario
        setData({
          clienteId: "",
          fecha: todayISO(),
          concepto: "Servicios de ingeniería",
          iva: 21,
          numero: "",
        });
        setItems([{ descripcion: "", cantidad: 1, precio: 0 }]);
        alert("Factura guardada.");
      } else {
        alert("No se pudo guardar la factura.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2>Nueva factura</h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <div style={{ marginBottom: 10 }}>
            <div>Cliente</div>
            <select
              value={data.clienteId}
              onChange={(e) => setData({ ...data, clienteId: e.target.value })}
              style={{ padding: 8, width: "100%" }}
            >
              <option value="">-- elegir --</option>
              {clientes.map((c) => (
                <option key={c.ID} value={c.ID}>
                  {c.Nombre}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div>Concepto</div>
            <input
              value={data.concepto}
              onChange={(e) => setData({ ...data, concepto: e.target.value })}
              style={{ padding: 8, width: "100%" }}
            />
          </div>
        </div>

        <div>
          <div style={{ marginBottom: 10 }}>
            <div>Fecha</div>
            <input
              type="date"
              value={data.fecha}
              onChange={(e) => setData({ ...data, fecha: e.target.value })}
              style={{ padding: 8 }}
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <div>Número (opcional)</div>
            <input
              placeholder="00000001"
              value={data.numero}
              onChange={(e) => setData({ ...data, numero: e.target.value })}
              style={{ padding: 8, width: "100%" }}
            />
          </div>
        </div>
      </div>

      <h3>Descripción</h3>
      <table width="100%" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f8f8f8" }}>
            <th align="left">Descripción</th>
            <th>Cant.</th>
            <th>Precio</th>
            <th align="right">Importe</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={idx} style={{ borderTop: "1px solid "#eee" }}>
              <td>
                <input
                  placeholder="Tarea / rubro"
                  value={it.descripcion}
                  onChange={(e) => {
                    const v = [...items];
                    v[idx].descripcion = e.target.value;
                    setItems(v);
                  }}
                  style={{ padding: 8, width: "100%" }}
                />
              </td>
              <td width={120} align="center">
                <input
                  type="number"
                  min="0"
                  value={it.cantidad}
                  onChange={(e) => {
                    const v = [...items];
                    v[idx].cantidad = e.target.value;
                    setItems(v);
                  }}
                  style={{ padding: 8, width: 100, textAlign: "right" }}
                />
              </td>
              <td width={160} align="center">
                <input
                  type="number"
                  min="0"
                  value={it.precio}
                  onChange={(e) => {
                    const v = [...items];
                    v[idx].precio = e.target.value;
                    setItems(v);
                  }}
                  style={{ padding: 8, width: 120, textAlign: "right" }}
                />
              </td>
              <td align="right" style={{ paddingRight: 8 }}>
                {fmtMoney(Number(it.cantidad || 0) * Number(it.precio || 0))}
              </td>
              <td align="center" width={50}>
                <button onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 10 }}>
        <button
          onClick={() =>
            setItems([...items, { descripcion: "", cantidad: 1, precio: 0 }])
          }
        >
          + Ítem
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, marginTop: 16 }}>
        <div>
          <div>
            IVA %
            <input
              type="number"
              value={data.iva}
              onChange={(e) => setData({ ...data, iva: e.target.value })}
              style={{ padding: 8, width: 100, marginLeft: 10 }}
            />
          </div>
        </div>
        <div style={{ textAlign: "right", lineHeight: 1.8 }}>
          <div>Subtotal: {fmtMoney(subt)}</div>
          <div>IVA: {fmtMoney(ivaMonto)}</div>
          <div>
            <b>Total: {fmtMoney(total)}</b>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <button
          disabled={saving}
          onClick={handleSave}
          style={{ padding: "10px 14px", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Guardando…" : "Guardar factura"}
        </button>
      </div>
    </div>
  );
}

/* ============ Cuenta Corriente / Cobros ============ */

function ClienteDetalle({ cliente, facturas, onCobrar }) {
  const [seleccion, setSeleccion] = useState({});
  const [metodo, setMetodo] = useState("Transferencia");
  const [fecha, setFecha] = useState(todayISO());
  const [obs, setObs] = useState("");

  const totalAplicado = useMemo(
    () => Object.values(seleccion).reduce((acc, v) => acc + Number(v || 0), 0),
    [seleccion]
  );

  return (
    <div>
      <h3>Cuenta corriente de {cliente?.Nombre || ""}</h3>

      <table width="100%" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f8f8f8" }}>
            <th align="left">Fecha</th>
            <th align="left">N°</th>
            <th align="right">Saldo</th>
            <th align="right">Aplicar</th>
          </tr>
        </thead>
        <tbody>
          {facturas.map((f) => (
            <tr key={f.id} style={{ borderTop: "1px solid #eee" }}>
              <td>{f.fecha}</td>
              <td>{f.numero}</td>
              <td align="right">{fmtMoney(f.saldo)}</td>
              <td align="right">
                <input
                  type="number"
                  min="0"
                  max={f.saldo}
                  value={seleccion[f.id] || ""}
                  onChange={(e) =>
                    setSeleccion({
                      ...seleccion,
                      [f.id]: e.target.value,
                    })
                  }
                  style={{ width: 120, padding: 6, textAlign: "right" }}
                />
              </td>
            </tr>
          ))}
          {!facturas.length && (
            <tr>
              <td colSpan={4} style={{ padding: 12, color: "#666" }}>
                Sin facturas abiertas.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 10 }}>
          <b>Total a aplicar:</b> {fmtMoney(totalAplicado)}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div>
            Método:
            <select
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
              style={{ padding: 8, marginLeft: 8 }}
            >
              <option>Transferencia</option>
              <option>Efectivo</option>
              <option>Cheque</option>
              <option>Tarjeta</option>
            </select>
          </div>
          <div>
            Fecha:
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              style={{ padding: 8, marginLeft: 8 }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            Observaciones:
            <input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              style={{ padding: 8, marginLeft: 8, width: "100%" }}
            />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <button
            disabled={totalAplicado <= 0}
            onClick={() => {
              const items = facturas
                .filter(
                  (f) => seleccion[f.id] !== undefined && Number(seleccion[f.id]) > 0
                )
                .map((f) => ({
                  facturaId: f.id,
                  numero: f.numero,        // incluimos número
                  aplicado: Number(seleccion[f.id] || 0),
                }));

              if (!items.length) return;

              onCobrar(items, metodo, fecha, obs);
              setSeleccion({});
              setObs("");
            }}
            style={{ padding: "10px 14px" }}
          >
            Generar cobro
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================== App principal ================== */

export default function AppIngenieriaCivil() {
  const [vista, setVista] = useState("dashboard");
  const [clientes, setClientes] = useState([]);
  const [facturas, setFacturas] = useState([]);    // facturas generadas en esta sesión
  const [vistaClienteId, setVistaClienteId] = useState(null);

  useEffect(() => {
    // “calentar” Apps Script (reduce la primera latencia)
    API.ping().catch(() => {});

    API.clientes()
      .then((r) => setClientes(r?.data || []))
      .catch(() => setClientes([]));
  }, []);

  const clienteActual =
    clientes.find((c) => c.ID === vistaClienteId) || null;

  const facturasCliente = useMemo(() => {
    return facturas
      .filter((f) => f.clienteId === vistaClienteId && !f.cobrada)
      .map((f) => ({
        id: f.id,
        numero: f.numero || "",
        fecha: f.fecha || "",
        saldo: Number(f.saldo ?? f.total ?? 0),
      }));
  }, [facturas, vistaClienteId]);

  return (
    <div style={{ maxWidth: 980, margin: "30px auto", padding: "0 12px" }}>
      <h1>Servicios de Ingeniería Civil S.R.L.</h1>
      <Nav vista={vista} setVista={setVista} />

      {vista === "dashboard" && (
        <Dashboard clientes={clientes} facturas={facturas} />
      )}

      {vista === "clientes" && (
        <Clientes
          clientes={clientes}
          onAdd={async (f) => {
            const res = await API.crearCliente({
              Nombre: f.nombre,
              Empresa: f.empresa,
              Contacto: f.contacto,
            });
            if (!res.ok) {
              alert("No se pudo crear el cliente");
              return;
            }
            API.clientes().then((r) => setClientes(r?.data || []));
          }}
          onVerCuenta={(id) => {
            setVistaClienteId(id);
            setVista("cobros");
          }}
        />
      )}

      {vista === "facturacion" && (
        <NuevaFactura
          clientes={clientes}
          onCrearFactura={async (payload) => {
            const r = await API.crearFactura(payload);
            if (!r.ok) {
              return false; // informa al hijo que no limpie
            }
            // guardamos en estado local para poder cobrarla
            const id = crypto.randomUUID();
            setFacturas((prev) => [
              ...prev,
              {
                id,
                clienteId: payload.ClienteID,
                numero: payload.Numero || "",
                fecha: payload.Fecha,
                total: payload.Total,
                saldo: payload.Total,
                cobrada: false,
              },
            ]);
            return true; // OK -> el hijo limpia
          }}
        />
      )}

      {vista === "cobros" && clienteActual && (
        <ClienteDetalle
          cliente={clienteActual}
          facturas={facturasCliente}
          onCobrar={async (items, metodo, fecha, observaciones) => {
            const monto = items.reduce(
              (acc, it) => acc + Number(it.aplicado || 0),
              0
            );

            const numeroRecibo = `RC-${String(
              Math.floor(Math.random() * 1000000)
            ).padStart(6, "0")}`;

            const data = {
              Numero: numeroRecibo,
              Fecha: fecha,
              Nombre: clienteActual?.Nombre || "",
              Monto: monto,
              Medio: metodo,
              items,                         // incluye numero
              Observaciones: observaciones,
            };

            const r = await API.registrarCobro(data);
            if (!r.ok) {
              alert("No se pudo registrar el cobro");
              return;
            }

            // actualizar saldos locales
            setFacturas((prev) =>
              prev.map((f) => {
                const it = items.find((i) => i.facturaId === f.id);
                if (!it) return f;
                const nuevoSaldo = Math.max(
                  0,
                  Number(f.saldo || f.total) - Number(it.aplicado || 0)
                );
                return {
                  ...f,
                  saldo: nuevoSaldo,
                  cobrada: nuevoSaldo <= 0.0001,
                };
              })
            );

            alert("Cobro registrado.");
          }}
        />
      )}

      {vista === "cobros" && !clienteActual && (
        <div>
          <h3>Seleccioná un cliente desde la pestaña “Clientes”</h3>
        </div>
      )}
    </div>
  );
}
