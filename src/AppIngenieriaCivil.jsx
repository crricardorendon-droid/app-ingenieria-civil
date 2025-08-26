import React, { useEffect, useMemo, useState } from "react";

/** Config desde index.html (ya lo tenés) */
const BASE = window.__APPSCRIPT_BASE__;
const TOKEN = window.__APPSCRIPT_TOKEN__ || "GRETA";

/** Helper API (todas GET para evitar CORS) */
async function api(params) {
  const qs = new URLSearchParams({ token: TOKEN, ...params }).toString();
  const url = `${BASE}?${qs}`;
  const r = await fetch(url);
  const txt = await r.text();
  try {
    const j = JSON.parse(txt);
    if (!j.ok) throw new Error(j.error || "Error API");
    return j;
  } catch (e) {
    // Si devolvió HTML (login), lo aviso claro
    if (txt.startsWith("<")) {
      throw new Error(
        "El backend devolvió HTML (login). En Apps Script: 'Cualquiera con el enlace' + volver a Implementar."
      );
    }
    throw e;
  }
}

/** Formatos */
const fmtMoney = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(Number(n || 0));

const todayISO = () => new Date().toISOString().slice(0, 10);
const ddmmyyyy = (v) => {
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
};

export default function AppIngenieriaCivil() {
  const [vista, setVista] = useState("dashboard"); // dashboard | clientes | facturacion | cta | cobros
  const [loading, setLoading] = useState(false);

  /** CLIENTES */
  const [clientes, setClientes] = useState([]);
  const [nuevoCli, setNuevoCli] = useState({ nombre: "", empresa: "", contacto: "" });
  const [editCliId, setEditCliId] = useState(null);
  const [editCli, setEditCli] = useState({ nombre: "", empresa: "", contacto: "" });

  /** CTA CLIENTE */
  const [clienteSel, setClienteSel] = useState(null); // {id, nombre,...}
  const [cta, setCta] = useState({
    facturas: [],
    recibos: [],
    totales: { facturado: 0, cobrado: 0, saldo: 0 },
  });

  /** FACTURA (crear) */
  const [fact, setFact] = useState({
    clienteId: "",
    nombre: "",
    fecha: todayISO(),
    numero: "", // manual
    concepto: "Servicios de ingeniería",
    iva: 0, // fijo 0% por defecto (editable)
    items: [{ descripcion: "", cantidad: 1, precio: 0 }],
  });

  /** COBRO (recibo) */
  const [rc, setRc] = useState({
    fecha: todayISO(),
    nombre: "", // se completa con clienteSel.nombre si cobrás desde CTA
    medio: "Transferencia",
    obs: "",
    // Aplicación manual por factura: { [facturaId]: montoAplicado }
    aplica: {},
  });

  // ====== CARGA INICIAL ======
  useEffect(() => {
    cargarClientes();
  }, []);

  async function cargarClientes() {
    try {
      setLoading(true);
      const j = await api({ type: "clientes_list" });
      setClientes(j.clientes || []);
    } catch (e) {
      alert("No se pudo cargar clientes: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  // ========== CLIENTES ==========
  async function crearCliente() {
    if (!nuevoCli.nombre.trim()) {
      alert("Poné un nombre.");
      return;
    }
    try {
      setLoading(true);
      await api({
        type: "cliente_create",
        nombre: nuevoCli.nombre,
        empresa: nuevoCli.empresa,
        contacto: nuevoCli.contacto,
      });
      setNuevoCli({ nombre: "", empresa: "", contacto: "" });
      await cargarClientes();
      alert("Cliente creado.");
    } catch (e) {
      alert("No se pudo crear el cliente: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  function startEditCliente(c) {
    setEditCliId(c.id);
    setEditCli({ nombre: c.nombre || "", empresa: c.empresa || "", contacto: c.contacto || "" });
  }

  async function saveEditCliente(id) {
    try {
      setLoading(true);
      await api({
        type: "cliente_update",
        id,
        nombre: editCli.nombre,
        empresa: editCli.empresa,
        contacto: editCli.contacto,
      });
      setEditCliId(null);
      await cargarClientes();
    } catch (e) {
      alert("No se pudo actualizar: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function borrarCliente(id) {
    if (!confirm("¿Eliminar cliente? (No afecta facturas/recibos existentes)")) return;
    try {
      setLoading(true);
      await api({ type: "cliente_delete", id });
      await cargarClientes();
    } catch (e) {
      alert("No se pudo borrar: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  // ========== FACTURACIÓN ==========
  const subTotal = useMemo(
    () =>
      fact.items.reduce(
        (s, it) => s + Number(it.cantidad || 0) * Number(it.precio || 0),
        0
      ),
    [fact.items]
  );
  const ivaMonto = useMemo(() => (subTotal * Number(fact.iva || 0)) / 100, [subTotal, fact.iva]);
  const total = subTotal + ivaMonto;

  function addItem() {
    setFact((f) => ({
      ...f,
      items: [...f.items, { descripcion: "", cantidad: 1, precio: 0 }],
    }));
  }
  function delItem(idx) {
    setFact((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  async function guardarFactura() {
    if (!fact.clienteId) return alert("Elegí un cliente");
    if (!fact.items.length) return alert("Agregá al menos un ítem");
    try {
      setLoading(true);
      await api({
        type: "factura_create",
        clienteId: fact.clienteId,
        nombre:
          fact.nombre ||
          (clientes.find((c) => c.id === fact.clienteId)?.nombre || ""),
        fecha: fact.fecha,
        numero: fact.numero, // manual (puede ir vacío)
        concepto: fact.concepto,
        iva: String(fact.iva ?? 0),
        items: JSON.stringify(fact.items),
      });
      alert("Factura guardada.");
      // limpiar formulario
      setFact({
        clienteId: "",
        nombre: "",
        fecha: todayISO(),
        numero: "",
        concepto: "Servicios de ingeniería",
        iva: 0,
        items: [{ descripcion: "", cantidad: 1, precio: 0 }],
      });
      // refrescar CTA si estoy adentro
      if (vista === "cta" && clienteSel?.id) await cargarCTA(clienteSel.id);
    } catch (e) {
      alert("No se pudo guardar la factura: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  // ========== CTA CLIENTE ==========
  async function verCTA(cli) {
    setClienteSel(cli);
    setVista("cta");
    await cargarCTA(cli.id);
  }

  async function cargarCTA(clienteId) {
    try {
      setLoading(true);
      const j = await api({ type: "cta_cliente", clienteId });
      setCta(j);
      // preparar form de cobro (aplicaciones en 0)
      const aplica = {};
      (j.facturas || [])
        .filter((f) => Number(f.saldo || 0) > 0)
        .forEach((f) => (aplica[f.id] = 0));
      setRc({
        fecha: todayISO(),
        nombre:
          clientes.find((c) => c.id === clienteSel?.id)?.nombre ||
          clienteSel?.nombre ||
          "",
        medio: "Transferencia",
        obs: "",
        aplica,
      });
    } catch (e) {
      alert("No se pudo cargar la cuenta: " + e.message);
      setVista("clientes");
      setClienteSel(null);
    } finally {
      setLoading(false);
    }
  }

  // ========== COBROS ==========
  const totalAplicado = useMemo(() => {
    return Object.values(rc.aplica || {}).reduce(
      (s, v) => s + Number(v || 0),
      0
    );
  }, [rc.aplica]);

  function setAplicado(facturaId, valor, saldoFactura) {
    const v = Math.max(0, Math.min(Number(valor || 0), Number(saldoFactura || 0)));
    setRc((x) => ({ ...x, aplica: { ...x.aplica, [facturaId]: v } }));
  }

  async function guardarRecibo() {
    // construir items para backend
    const items = (cta.facturas || [])
      .filter((f) => Number(rc.aplica?.[f.id] || 0) > 0)
      .map((f) => ({
        facturaId: f.id,
        numero: f.numero || "",
        aplicado: Number(rc.aplica[f.id] || 0),
      }));

    if (!items.length) return alert("Ingresá montos a aplicar.");

    try {
      setLoading(true);
      const j = await api({
        type: "recibo_create",
        fecha: rc.fecha,
        nombre:
          rc.nombre ||
          (clientes.find((c) => c.id === clienteSel?.id)?.nombre ||
            clienteSel?.nombre ||
            ""),
        medio: rc.medio,
        obs: rc.obs,
        items: JSON.stringify(items),
        // monto: opcional (si no lo pasamos, el backend suma aplicado)
      });
      alert(`Recibo guardado. N° ${j.numero}`);

      // actualizar CTA (saldos)
      await cargarCTA(clienteSel.id);

      // preguntar PDF
      const siPdf = confirm("¿Querés generar el PDF del recibo ahora?");
      if (siPdf) {
        const pdf = await api({ type: "recibo_pdf", id: j.id });
        if (pdf.url) window.open(pdf.url, "_blank");
      }
    } catch (e) {
      alert("No se pudo guardar el recibo: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  // ======== UI ========
  return (
    <div style={{ padding: 20, fontFamily: "Inter, Arial, sans-serif" }}>
      <h1>Servicios de Ingeniería Civil S.R.L.</h1>

      {/* Menú */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button onClick={() => setVista("dashboard")}>Dashboard</button>
        <button onClick={() => setVista("clientes")}>Clientes</button>
        <button onClick={() => setVista("facturacion")}>Facturación</button>
        {vista === "cta" ? (
          <button onClick={() => setVista("cta")}>Cuenta Corriente</button>
        ) : (
          <button disabled>Cuenta Corriente</button>
        )}
      </div>

      {loading && (
        <div style={{ marginBottom: 12, color: "#555" }}>Procesando…</div>
      )}

      {/* DASHBOARD simple */}
      {vista === "dashboard" && (
        <div>
          <h2>Dashboard</h2>
          <p>Clientes: <b>{clientes.length}</b></p>
          {clienteSel && (
            <p>
              Cliente seleccionado: <b>{clienteSel.nombre}</b> — Saldo:{" "}
              <b>{fmtMoney(cta?.totales?.saldo || 0)}</b>
            </p>
          )}
          <p style={{ color: "#777" }}>
            (Podemos mejorar este tablero en V2 con más métricas)
          </p>
        </div>
      )}

      {/* CLIENTES */}
      {vista === "clientes" && (
        <div>
          <h2>Clientes</h2>

          {/* Alta */}
          <div style={{ display: "flex", gap: 8, margin: "8px 0 16px" }}>
            <input
              placeholder="Nombre"
              value={nuevoCli.nombre}
              onChange={(e) =>
                setNuevoCli({ ...nuevoCli, nombre: e.target.value })
              }
            />
            <input
              placeholder="Empresa"
              value={nuevoCli.empresa}
              onChange={(e) =>
                setNuevoCli({ ...nuevoCli, empresa: e.target.value })
              }
            />
            <input
              placeholder="Contacto"
              value={nuevoCli.contacto}
              onChange={(e) =>
                setNuevoCli({ ...nuevoCli, contacto: e.target.value })
              }
            />
            <button onClick={crearCliente}>+ Agregar</button>
          </div>

          {/* Tabla */}
          <table width="100%" cellPadding={8} style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th align="left">Nombre</th>
                <th align="left">Empresa</th>
                <th align="left">Contacto</th>
                <th align="left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clientes.length === 0 && (
                <tr>
                  <td colSpan={4} align="center" style={{ color: "#666" }}>
                    Sin clientes aún…
                  </td>
                </tr>
              )}
              {clientes.map((c) => (
                <tr key={c.id} style={{ borderTop: "1px solid #eee" }}>
                  <td>
                    {editCliId === c.id ? (
                      <input
                        value={editCli.nombre}
                        onChange={(e) =>
                          setEditCli({ ...editCli, nombre: e.target.value })
                        }
                      />
                    ) : (
                      c.nombre
                    )}
                  </td>
                  <td>
                    {editCliId === c.id ? (
                      <input
                        value={editCli.empresa}
                        onChange={(e) =>
                          setEditCli({ ...editCli, empresa: e.target.value })
                        }
                      />
                    ) : (
                      c.empresa
                    )}
                  </td>
                  <td>
                    {editCliId === c.id ? (
                      <input
                        value={editCli.contacto}
                        onChange={(e) =>
                          setEditCli({ ...editCli, contacto: e.target.value })
                        }
                      />
                    ) : (
                      c.contacto
                    )}
                  </td>
                  <td>
                    {editCliId === c.id ? (
                      <>
                        <button onClick={() => saveEditCliente(c.id)}>
                          Guardar
                        </button>{" "}
                        <button onClick={() => setEditCliId(null)}>
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => verCTA(c)}>Ver cuenta</button>{" "}
                        <button onClick={() => startEditCliente(c)}>Editar</button>{" "}
                        <button onClick={() => borrarCliente(c.id)}>Eliminar</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* FACTURACIÓN */}
      {vista === "facturacion" && (
        <div>
          <h2>Nueva factura</h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div>
              <label>Cliente</label>
              <br />
              <select
                value={fact.clienteId}
                onChange={(e) => {
                  const id = e.target.value;
                  const cli = clientes.find((c) => c.id === id);
                  setFact((f) => ({ ...f, clienteId: id, nombre: cli?.nombre || "" }));
                }}
              >
                <option value="">-- elegir --</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Fecha</label>
              <br />
              <input
                type="date"
                value={fact.fecha}
                onChange={(e) => setFact({ ...fact, fecha: e.target.value })}
              />
            </div>

            <div>
              <label>Número (manual / opcional)</label>
              <br />
              <input
                value={fact.numero}
                onChange={(e) => setFact({ ...fact, numero: e.target.value })}
                placeholder="F-1001"
              />
            </div>

            <div>
              <label>IVA %</label>
              <br />
              <input
                type="number"
                value={fact.iva}
                onChange={(e) => setFact({ ...fact, iva: Number(e.target.value || 0) })}
                style={{ width: 100 }}
              />
            </div>

            <div style={{ gridColumn: "1 / span 2" }}>
              <label>Concepto</label>
              <br />
              <input
                value={fact.concepto}
                onChange={(e) => setFact({ ...fact, concepto: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <h3>Ítems</h3>
          <table width="100%" cellPadding={8} style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th align="left">Descripción</th>
                <th>Cant.</th>
                <th>Precio</th>
                <th align="right">Importe</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fact.items.map((it, idx) => (
                <tr key={idx} style={{ borderTop: "1px solid #eee" }}>
                  <td>
                    <input
                      value={it.descripcion}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFact((f) => {
                          const a = [...f.items];
                          a[idx] = { ...a[idx], descripcion: v };
                          return { ...f, items: a };
                        });
                      }}
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td width={120} align="center">
                    <input
                      type="number"
                      min="0"
                      value={it.cantidad}
                      onChange={(e) => {
                        const v = Number(e.target.value || 0);
                        setFact((f) => {
                          const a = [...f.items];
                          a[idx] = { ...a[idx], cantidad: v };
                          return { ...f, items: a };
                        });
                      }}
                      style={{ width: 90, textAlign: "right" }}
                    />
                  </td>
                  <td width={160} align="center">
                    <input
                      type="number"
                      min="0"
                      value={it.precio}
                      onChange={(e) => {
                        const v = Number(e.target.value || 0);
                        setFact((f) => {
                          const a = [...f.items];
                          a[idx] = { ...a[idx], precio: v };
                          return { ...f, items: a };
                        });
                      }}
                      style={{ width: 120, textAlign: "right" }}
                    />
                  </td>
                  <td align="right">{fmtMoney((it.cantidad || 0) * (it.precio || 0))}</td>
                  <td align="center" width={50}>
                    <button onClick={() => delItem(idx)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 8 }}>
            <button onClick={addItem}>+ Ítem</button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 320px",
              gap: 12,
              marginTop: 12,
            }}
          >
            <div></div>
            <div style={{ textAlign: "right", lineHeight: 1.8 }}>
              <div>Subtotal: {fmtMoney(subTotal)}</div>
              <div>IVA: {fmtMoney(ivaMonto)}</div>
              <div>
                <b>Total: {fmtMoney(total)}</b>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <button onClick={guardarFactura} disabled={loading}>
              {loading ? "Guardando…" : "Guardar factura"}
            </button>
          </div>
        </div>
      )}

      {/* CTA + COBROS */}
      {vista === "cta" && clienteSel && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <button onClick={() => setVista("clientes")}>← Volver a clientes</button>
          </div>

          <h2>Cuenta Corriente — {clienteSel.nombre}</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Facturas */}
            <div>
              <h3>Facturas</h3>
              <table width="100%" cellPadding={6} style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f5f5f5" }}>
                    <th>Fecha</th>
                    <th>Número</th>
                    <th>Total</th>
                    <th>Saldo</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {cta.facturas.map((f) => (
                    <tr key={f.id} style={{ borderTop: "1px solid #eee" }}>
                      <td>{ddmmyyyy(f.fecha)}</td>
                      <td>{f.numero || "-"}</td>
                      <td>{fmtMoney(f.total)}</td>
                      <td>{fmtMoney(f.saldo)}</td>
                      <td>{f.estado}</td>
                    </tr>
                  ))}
                  {cta.facturas.length === 0 && (
                    <tr>
                      <td colSpan={5} align="center" style={{ color: "#666" }}>
                        Sin facturas…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div style={{ marginTop: 10 }}>
                <b>Totales:</b> Facturado {fmtMoney(cta.totales.facturado)} — Cobrado{" "}
                {fmtMoney(cta.totales.cobrado)} — Saldo{" "}
                <b>{fmtMoney(cta.totales.saldo)}</b>
              </div>
            </div>

            {/* Recibos y Cobro */}
            <div>
              <h3>Recibos</h3>
              <table width="100%" cellPadding={6} style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f5f5f5" }}>
                    <th>Fecha</th>
                    <th>Número</th>
                    <th>Medio</th>
                    <th>Aplicado</th>
                  </tr>
                </thead>
                <tbody>
                  {cta.recibos.map((r) => (
                    <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
                      <td>{ddmmyyyy(r.fecha)}</td>
                      <td>{r.numero}</td>
                      <td>{r.medio}</td>
                      <td>{fmtMoney(r.aplicadoAlCliente)}</td>
                    </tr>
                  ))}
                  {cta.recibos.length === 0 && (
                    <tr>
                      <td colSpan={4} align="center" style={{ color: "#666" }}>
                        Sin cobros…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div style={{ marginTop: 16, borderTop: "1px solid #eee", paddingTop: 12 }}>
                <h3>Registrar cobro</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <label>Fecha</label>
                    <br />
                    <input
                      type="date"
                      value={rc.fecha}
                      onChange={(e) => setRc({ ...rc, fecha: e.target.value })}
                    />
                  </div>
                  <div>
                    <label>Medio de pago</label>
                    <br />
                    <input
                      value={rc.medio}
                      onChange={(e) => setRc({ ...rc, medio: e.target.value })}
                    />
                  </div>
                  <div style={{ gridColumn: "1 / span 2" }}>
                    <label>Observaciones</label>
                    <br />
                    <input
                      value={rc.obs}
                      onChange={(e) => setRc({ ...rc, obs: e.target.value })}
                      style={{ width: "100%" }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <b>Aplicar a facturas</b>
                  <table width="100%" cellPadding={6} style={{ borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f5f5f5" }}>
                        <th>Número</th>
                        <th>Saldo</th>
                        <th>Aplicar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cta.facturas
                        .filter((f) => Number(f.saldo || 0) > 0)
                        .map((f) => (
                          <tr key={f.id} style={{ borderTop: "1px solid #eee" }}>
                            <td>{f.numero || f.id}</td>
                            <td>{fmtMoney(f.saldo)}</td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={rc.aplica?.[f.id] ?? 0}
                                onChange={(e) =>
                                  setAplicado(f.id, e.target.value, f.saldo)
                                }
                                style={{ width: 120, textAlign: "right" }}
                              />
                            </td>
                          </tr>
                        ))}
                      {cta.facturas.filter((f) => Number(f.saldo || 0) > 0).length === 0 && (
                        <tr>
                          <td colSpan={3} align="center" style={{ color: "#666" }}>
                            No hay facturas abiertas.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <div style={{ textAlign: "right", marginTop: 8 }}>
                    Total a cobrar: <b>{fmtMoney(totalAplicado)}</b>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <button onClick={guardarRecibo} disabled={loading || totalAplicado <= 0}>
                      {loading ? "Guardando…" : "Guardar recibo"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
