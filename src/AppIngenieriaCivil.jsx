import React, { useEffect, useMemo, useState } from "react";

/* ===== Utilidades ===== */
const currency = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(Number(n || 0));

const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/* ===== Cliente API (Apps Script / Google Sheets) ===== */
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

/* ===== App ===== */
export default function AppIngenieriaCivil() {
  const initial = {
    empresa: {
      nombre: "Servicios de Ingeniería Civil S.R.L.",
      cuit: "30-12345678-9",
      domicilio: "Bv. Mitre 123, Córdoba",
    },
    consecutivos: { factura: 1, recibo: 1 },
    clientes: [],
    facturas: [],
    recibos: [],
  };

  const [data, setData] = useState(initial);
  const [tab, setTab] = useState("dashboard");

  /* ---- Persistencia local: cargar al iniciar ---- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("iciv-data");
      if (raw) {
        const saved = JSON.parse(raw);
        // merge básico para no perder estructura nueva si actualizamos
        setData((prev) => ({
          ...prev,
          ...saved,
          consecutivos: { ...prev.consecutivos, ...(saved.consecutivos || {}) },
        }));
      }
    } catch {}
  }, []);

  /* ---- Persistencia local: guardar cada cambio ---- */
  useEffect(() => {
    try {
      localStorage.setItem("iciv-data", JSON.stringify(data));
    } catch {}
  }, [data]);

  /* ---- Cargar clientes desde Google Sheets (si la API responde) ---- */
  useEffect(() => {
    (async () => {
      if (!API.ok()) return;
      try {
        const res = await API.listarClientes();
        console.log("API listarClientes →", res);
        if (res?.ok && Array.isArray(res.data)) {
          // Si hay datos en Sheets, los fusionamos con los locales
          const externos = res.data.map((r) => ({
            id: r.ID || uid(),
            nombre: r.Nombre || "",
            cuit: r.CUIT || "",
            email: r.Contacto || "",
            telefono: r.Telefono || "",
            direccion: r.Empresa || "",
          }));
          setData((prev) => {
            // evitamos duplicar por nombre + contacto
            const key = (c) => `${c.nombre}::${c.email || c.telefono || ""}`.toLowerCase();
            const existentes = new Map(prev.clientes.map((c) => [key(c), c]));
            externos.forEach((c) => {
              if (!existentes.has(key(c))) existentes.set(key(c), c);
            });
            return { ...prev, clientes: Array.from(existinges.values ? existentes.values() : existentes) };
          });
        }
      } catch (err) {
        console.error("API clientes", err);
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

  // >>> Crear Cliente (con persistencia local + llamada a Apps Script + logs/alertas)
  const crearCliente = async (cliente) => {
    const nuevo = { id: uid(), ...cliente };

    // 1) actualizamos memoria y guardamos en localStorage (se hace también por el useEffect)
    setData((prev) => {
      const next = { ...prev, clientes: [...prev.clientes, nuevo] };
      try {
        localStorage.setItem("iciv-data", JSON.stringify(next));
      } catch {}
      return next;
    });

    // 2) intentamos escribir en Apps Script
    if (API.ok()) {
      try {
        const res = await API.crearCliente({
          Nombre: cliente.nombre,
          Empresa: cliente.direccion || "",
          Contacto: cliente.email || cliente.telefono || "",
        });
        console.log("API crearCliente →", res);
        if (!res?.ok) alert("No se pudo guardar en el Sheet: " + (res?.error || "desconocido"));
      } catch (e) {
        console.error("Error crearCliente:", e);
        alert("Error llamando a Apps Script (revisá URL/permiso): " + e.message);
      }
    } else {
      alert("API BASE vacía. Revisá window.__APPSCRIPT_BASE__ en index.html");
    }
  };

  const crearFactura = async ({ clienteId, fecha, concepto, total }) => {
    const numero = String(data.consecutivos.factura).padStart(8, "0");
    const f = {
      id: uid(),
      numero,
      clienteId,
      fecha,
      concepto,
      total: Number(total),
      saldo: Number(total),
      estado: "Pendiente",
    };
    setData((prev) => {
      const next = {
        ...prev,
        consecutivos: { ...prev.consecutivos, factura: prev.consecutivos.factura + 1 },
        facturas: [f, ...prev.facturas],
      };
      try {
        localStorage.setItem("iciv-data", JSON.stringify(next));
      } catch {}
      return next;
    });

    if (API.ok()) {
      try {
        const cliente = clientesMap[clienteId];
        const res = await API.crearFactura({
          Fecha: fecha,
          Nombre: cliente?.nombre || "",
          Numero: numero,
          Subtotal: total,
          Total: total,
          Concepto: concepto,
          ClienteID: clienteId,
        });
        console.log("API crearFactura →", res);
        if (!res?.ok) alert("No se pudo guardar FACTURA en el Sheet: " + (res?.error || "desconocido"));
      } catch (e) {
        console.error("Error crearFactura:", e);
        alert("Error llamando a Apps Script (factura): " + e.message);
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
      try {
        localStorage.setItem("iciv-data", JSON.stringify(next));
      } catch {}
      return next;
    });

    if (API.ok()) {
      try {
        const cliente = clientesMap[cobro.clienteId];
        const res = await API.registrarCobro({
          Numero: numero,
          Fecha: cobro.fecha,
          Nombre: cliente?.nombre || "",
          Monto: cobro.monto,
          Medio: cobro.metodo,
          items: cobro.items.map((i) => ({
            facturaId: i.facturaId,
            aplicado: i.aplicado,
          })),
          Observaciones: cobro.observaciones || "",
        });
        console.log("API registrarCobro →", res);
        if (!res?.ok) alert("No se pudo guardar RECIBO en el Sheet: " + (res?.error || "desconocido"));
      } catch (e) {
        console.error("Error registrarCobro:", e);
        alert("Error llamando a Apps Script (recibo): " + e.message);
      }
    }
  };

  /* ===== UI ===== */
  return (
    <div style={{ padding: 20, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <h1>{data.empresa.nombre}</h1>

      <div style={{ marginBottom: 20 }}>
        <button onClick={() => setTab("dashboard")}>Dashboard</button>{" "}
        <button onClick={() => setTab("clientes")}>Clientes</button>{" "}
        <button onClick={() => setTab("facturacion")}>Facturación</button>{" "}
        <button onClick={() => setTab("cobros")}>Cobros</button>
      </div>

      {tab === "dashboard" && (
        <div>
          <h2>Dashboard</h2>
          <p>Total clientes: {data.clientes.length}</p>
          <p>Facturas abiertas: {data.facturas.filter((f) => (f.saldo ?? 0) > 0).length}</p>
          <p>
            Saldo por cobrar:{" "}
            {currency(data.facturas.reduce((a, f) => a + Number(f.saldo || 0), 0))}
          </p>
        </div>
      )}

      {tab === "clientes" && (
        <div>
          <h2>Clientes</h2>
          <div style={{ marginBottom: 10 }}>
            <button
              onClick={() =>
                crearCliente({
                  nombre: "Cliente demo",
                  email: "demo@mail.com",
                  telefono: "123",
                  direccion: "Córdoba",
                })
              }
            >
              + Cliente demo
            </button>
          </div>

          <ul>
            {data.clientes.map((c) => (
              <li key={c.id}>
                {c.nombre} — Saldo: {currency(saldoCliente(c.id))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "facturacion" && (
        <div>
          <h2>Nueva factura</h2>
          <div style={{ marginBottom: 10 }}>
            <button
              onClick={() =>
                crearFactura({
                  clienteId: data.clientes[0]?.id,
                  fecha: todayISO(),
                  concepto: "Servicio de ingeniería",
                  total: 10000,
                })
              }
              disabled={!data.clientes[0]}
            >
              + Factura demo
            </button>
          </div>

          <ul>
            {data.facturas.map((f) => (
              <li key={f.id}>
                {f.numero} — {f.concepto} — {currency(f.saldo)} ({f.estado})
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "cobros" && (
        <div>
          <h2>Registrar cobro</h2>
          <div style={{ marginBottom: 10 }}>
            <button
              onClick={() =>
                registrarCobro({
                  clienteId: data.clientes[0]?.id,
                  fecha: todayISO(),
                  metodo: "Transferencia",
                  monto: 5000,
                  items: data.facturas[0]
                    ? [{ facturaId: data.facturas[0].id, aplicado: 5000 }]
                    : [],
                  observaciones: "Pago parcial",
                })
              }
              disabled={!data.clientes[0] || !data.facturas[0]}
            >
              + Cobro demo
            </button>
          </div>

          <ul>
            {data.recibos.map((r) => (
              <li key={r.id}>
                {r.numero} — {currency(r.monto)} — {r.metodo}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


