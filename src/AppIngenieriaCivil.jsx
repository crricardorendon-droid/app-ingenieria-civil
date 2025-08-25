import React, { useState, useEffect } from "react";

const API_BASE = window.__APPSCRIPT_BASE__;
const TOKEN = window.__APPSCRIPT_TOKEN__;

export default function AppIngenieriaCivil() {
  const [vista, setVista] = useState("dashboard");
  const [clientes, setClientes] = useState([]);
  const [cliNombre, setCliNombre] = useState("");
  const [cliEmpresa, setCliEmpresa] = useState("");
  const [cliContacto, setCliContacto] = useState("");

  // -------------------------------
  // Cargar clientes desde el backend
  // -------------------------------
  const cargarClientes = async () => {
    try {
      const url = `${API_BASE}?token=${TOKEN}&type=clientes`;
      const r = await fetch(url);
      const txt = await r.text();
      console.log("[cargarClientes] raw:", txt);

      if (txt.startsWith("<!DOCTYPE") || txt.startsWith("<html")) {
        alert(
          "El backend devolvió una página HTML (login). En Apps Script poné 'Cualquiera' en permisos y actualizá el deployment."
        );
        return;
      }

      const data = JSON.parse(txt);
      if (data.ok) {
        setClientes(data.clientes || []);
      } else {
        alert("Error al cargar clientes: " + (data.error || ""));
      }
    } catch (e) {
      console.error(e);
      alert("No se pudieron cargar los clientes.");
    }
  };

  useEffect(() => {
    if (vista === "clientes") {
      cargarClientes();
    }
  }, [vista]);

  // -------------------------------
  // Crear cliente
  // -------------------------------
  const crearCliente = async () => {
    const nombre = (cliNombre || "").trim();
    const empresa = (cliEmpresa || "").trim();
    const contacto = (cliContacto || "").trim();

    if (!nombre) {
      alert("Poné al menos el nombre del cliente.");
      return;
    }

    const url = `${API_BASE}?token=${TOKEN}&type=crear_cliente`;
    console.log("[crearCliente] URL:", url);

    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, empresa, contacto }),
      });

      const txt = await r.text();
      console.log("[crearCliente] raw:", txt);

      if (txt.startsWith("<!DOCTYPE") || txt.startsWith("<html")) {
        alert(
          "El backend devolvió una página de login. En Apps Script poné 'Quién tiene acceso: CUALQUIERA'."
        );
        return;
      }

      let data;
      try {
        data = JSON.parse(txt);
      } catch (e) {
        alert("Respuesta no válida del servidor. Revisá la consola.");
        return;
      }

      if (!data.ok) {
        alert("No se pudo crear el cliente. " + (data.error || ""));
        return;
      }

      // refrescamos la lista desde el servidor
      await cargarClientes();

      // limpiamos inputs
      setCliNombre("");
      setCliEmpresa("");
      setCliContacto("");
    } catch (e) {
      console.error(e);
      alert("Error de red creando cliente (revisá conexión/URL/token).");
    }
  };

  // -------------------------------
  // Render
  // -------------------------------
  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h1>Servicios de Ingeniería Civil S.R.L.</h1>

      <div style={{ marginBottom: "20px" }}>
        <button onClick={() => setVista("dashboard")}>Dashboard</button>
        <button onClick={() => setVista("clientes")}>Clientes</button>
        <button onClick={() => setVista("facturacion")}>Facturación</button>
        <button onClick={() => setVista("cobros")}>Cobros</button>
      </div>

      {vista === "dashboard" && <h2>Dashboard</h2>}

      {vista === "clientes" && (
        <div>
          <h2>Clientes</h2>
          <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
            <input
              placeholder="Nombre"
              value={cliNombre}
              onChange={(e) => setCliNombre(e.target.value)}
            />
            <input
              placeholder="Empresa"
              value={cliEmpresa}
              onChange={(e) => setCliEmpresa(e.target.value)}
            />
            <input
              placeholder="Contacto"
              value={cliContacto}
              onChange={(e) => setCliContacto(e.target.value)}
            />
            <button onClick={crearCliente}>+ Agregar</button>
          </div>

          <table width="100%" border="0" cellPadding="4">
            <thead style={{ background: "#f2f2f2" }}>
              <tr>
                <th align="left">Nombre</th>
                <th align="left">Empresa</th>
                <th align="left">Contacto</th>
                <th align="left">Cuenta</th>
              </tr>
            </thead>
            <tbody>
              {clientes.length === 0 ? (
                <tr>
                  <td colSpan="4" align="center">
                    Sin clientes aún…
                  </td>
                </tr>
              ) : (
                clientes.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nombre}</td>
                    <td>{c.empresa}</td>
                    <td>{c.contacto}</td>
                    <td>-</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {vista === "facturacion" && <h2>Nueva factura (en construcción…)</h2>}
      {vista === "cobros" && <h2>Registrar cobro (en construcción…)</h2>}
    </div>
  );
}
