import React, { useState, useEffect } from "react";

const API_BASE = window.__APPSCRIPT_BASE__;
const TOKEN = window.__APPSCRIPT_TOKEN__;

function AppIngenieriaCivil() {
  const [view, setView] = useState("dashboard");
  const [clientes, setClientes] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [recibos, setRecibos] = useState([]);

  // Para nueva factura
  const [selectedCliente, setSelectedCliente] = useState("");
  const [fecha, setFecha] = useState("");
  const [numero, setNumero] = useState("");
  const [concepto, setConcepto] = useState("Servicios de ingeniería");
  const [items, setItems] = useState([{ descripcion: "", cantidad: 1, precio: 0 }]);
  const [iva, setIva] = useState(21);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const r = await fetch(`${API_BASE}?token=${TOKEN}&type=all`);
      const data = await r.json();
      if (data.ok) {
        setClientes(data.clientes || []);
        setFacturas(data.facturas || []);
        setRecibos(data.recibos || []);
      }
    } catch (e) {
      console.error("Error cargando datos", e);
    }
  };

  const fmtMoney = (v) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
    }).format(v || 0);

  const subtotal = items.reduce(
    (acc, it) => acc + Number(it.cantidad || 0) * Number(it.precio || 0),
    0
  );
  const ivaMonto = (subtotal * Number(iva || 0)) / 100;
  const total = subtotal + ivaMonto;

  const guardarFactura = async () => {
    if (!selectedCliente) {
      alert("Seleccioná un cliente");
      return;
    }
    try {
      const body = {
        token: TOKEN,
        type: "addFactura",
        clienteId: selectedCliente,
        fecha,
        numero,
        concepto,
        items_JSON: JSON.stringify(items),
        subtotal,
        iva,
        total,
      };
      const r = await fetch(API_BASE, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (data.ok) {
        alert("Factura guardada.");
        cargarDatos();
        // limpiar formulario
        setSelectedCliente("");
        setFecha("");
        setNumero("");
        setConcepto("Servicios de ingeniería");
        setItems([{ descripcion: "", cantidad: 1, precio: 0 }]);
        setIva(21);
      } else {
        alert("Error: " + data.error);
      }
    } catch (e) {
      alert("Error llamando a Apps Script: " + e.message);
    }
  };

  // Dashboard
  const Dashboard = () => {
    const abiertas = facturas.filter((f) => f.Estado !== "Pagada");
    const saldo = abiertas.reduce((acc, f) => acc + Number(f.Saldo || 0), 0);
    return (
      <div>
        <h2>Dashboard</h2>
        <p>Total clientes: {clientes.length}</p>
        <p>Facturas abiertas: {abiertas.length}</p>
        <p>Saldo por cobrar: {fmtMoney(saldo)}</p>
      </div>
    );
  };

  // Clientes
  const Clientes = () => (
    <div>
      <h2>Clientes</h2>
      <ul>
        {clientes.map((c) => (
          <li key={c.ID}>
            {c.Nombre} — {c.Empresa}
          </li>
        ))}
      </ul>
    </div>
  );

  // Nueva Factura
  const NuevaFactura = () => (
    <div>
      <h2>Nueva factura</h2>
      <div style={{ border: "1px solid #ccc", padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 20 }}>
          <div>
            <label>Cliente</label>
            <br />
            <select
              value={selectedCliente}
              onChange={(e) => setSelectedCliente(e.target.value)}
            >
              <option value="">-- elegir --</option>
              {clientes.map((c) => (
                <option key={c.ID} value={c.ID}>
                  {c.Nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Fecha</label>
            <br />
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div>
            <label>Número (opcional)</label>
            <br />
            <input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="Ej: 1001"
            />
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <label>Concepto</label>
          <br />
          <input
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        <h3 style={{ marginTop: 20 }}>Descripción</h3>
        <table width="100%">
          <thead>
            <tr>
              <th align="left">Descripción</th>
              <th>Cant.</th>
              <th>Precio</th>
              <th>Importe</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx} style={{ borderTop: "1px solid #eee" }}>
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
        <button
          onClick={() => setItems([...items, { descripcion: "", cantidad: 1, precio: 0 }])}
          style={{ marginTop: 10 }}
        >
          + Ítem
        </button>

        <div style={{ marginTop: 20 }}>
          <label>IVA %</label>
          <br />
          <input
            type="number"
            value={iva}
            onChange={(e) => setIva(e.target.value)}
            style={{ width: 100 }}
          />
        </div>

        <div style={{ marginTop: 20 }}>
          <p>Subtotal: {fmtMoney(subtotal)}</p>
          <p>IVA: {fmtMoney(ivaMonto)}</p>
          <p>Total: {fmtMoney(total)}</p>
        </div>

        <button onClick={guardarFactura} style={{ marginTop: 10 }}>
          Guardar factura
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ padding: 20, fontFamily: "Arial" }}>
      <h1>Servicios de Ingeniería Civil S.R.L.</h1>
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => setView("dashboard")}>Dashboard</button>
        <button onClick={() => setView("clientes")}>Clientes</button>
        <button onClick={() => setView("facturacion")}>Facturación</button>
        <button onClick={() => setView("cobros")}>Cobros</button>
      </div>

      {view === "dashboard" && <Dashboard />}
      {view === "clientes" && <Clientes />}
      {view === "facturacion" && <NuevaFactura />}
      {view === "cobros" && <p>Sección cobros (en construcción)</p>}
    </div>
  );
}

export default AppIngenieriaCivil;
