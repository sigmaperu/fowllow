const componentsReady = () => document.getElementById("pedidoInput") ? Promise.resolve() : new Promise(resolve => document.addEventListener("components:ready", resolve, { once: true }));

async function loadTraceData() {
  const url = "https://raw.githubusercontent.com/sigmaperu/fowllow/refs/heads/main/data/BaseTrazabilidad.csv";
  const response = await fetch(url);
  if (!response.ok) throw new Error("No se pudo conectar con BaseTrazabilidad.csv en el repositorio.");
  const text = await response.text();
  return parseCSV(text);
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length > 0) {
      const row = {};
      headers.forEach((h, index) => {
        row[h.trim()] = values[index] ? values[index].trim() : "";
      });
      rows.push(row);
    }
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let startValue = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(line.substring(startValue, i).replace(/^"|"$/g, ''));
      startValue = i + 1;
    }
  }
  result.push(line.substring(startValue).replace(/^"|"$/g, ''));
  return result;
}

async function start() {
  try {
    await componentsReady();
    const rows = await loadTraceData();

    // --- 1. LÓGICA DE BÚSQUEDA POR PEDIDO (Shipment Custom) ---
    const pedidoInput = document.getElementById("pedidoInput");
    const buscarPedidoBtn = document.getElementById("buscarPedidoBtn");
    const pedidoResult = document.getElementById("pedidoResult");

    const executarBusquedaPedido = () => {
      const query = pedidoInput.value.trim().toLowerCase();
      if (!query) return;

      const match = rows.find(r => (r["Shipment Custom"] || "").toLowerCase() === query);
      pedidoResult.style.display = "block";

      if (match) {
        pedidoResult.innerHTML = `
          <strong style="color: var(--gm-blue, #2563eb);">Pedido Encontrado:</strong> ${match["Shipment Custom"]}<br>
          <strong style="color: #1e293b;">Vehículo / Placa:</strong> ${match["Vehicle Key"] || "No especificado"}<br>
          <strong style="color: #1e293b;">Fecha de Entrega:</strong> ${match["Delivery Date"] || "No especificada"}
        `;
      } else {
        pedidoResult.innerHTML = `<span style="color: #dc2626;">No se encontró ningún registro para el pedido "${pedidoInput.value}".</span>`;
      }
    };

    buscarPedidoBtn.addEventListener("click", executarBusquedaPedido);
    pedidoInput.addEventListener("keypress", (e) => { if (e.key === "Enter") executarBusquedaPedido(); });

    // --- 2. LÓGICA DE BÚSQUEDA POR PRODUCTO (Item Description con Autocompletado) ---
    const productoInput = document.getElementById("productoInput");
    const autocompleteList = document.getElementById("productoAutocomplete");
    const buscarProductoBtn = document.getElementById("buscarProductoBtn");
    const productoResult = document.getElementById("productoResult");

    // Obtener valores únicos de la columna de producto
    const uniqueProducts = [...new Set(rows.map(r => r["Item Description"]).filter(Boolean))];

    productoInput.addEventListener("input", () => {
      const val = productoInput.value.trim().toLowerCase();
      autocompleteList.innerHTML = "";
      if (!val) {
        autocompleteList.style.display = "none";
        return;
      }

      const filtered = uniqueProducts.filter(p => p.toLowerCase().includes(val)).slice(0, 15);
      if (filtered.length > 0) {
        autocompleteList.style.display = "block";
        filtered.forEach(item => {
          const div = document.createElement("div");
          div.className = "autocomplete-item";
          div.textContent = item;
          div.addEventListener("click", () => {
            productoInput.value = item;
            autocompleteList.style.display = "none";
            showProductSummary(item, rows);
          });
          autocompleteList.appendChild(div);
        });
      } else {
        autocompleteList.style.display = "none";
      }
    });

    const executarBusquedaProducto = () => {
      const val = productoInput.value.trim();
      autocompleteList.style.display = "none";
      if (val) {
        showProductSummary(val, rows);
      }
    };

    buscarProductoBtn.addEventListener("click", executarBusquedaProducto);
    productoInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        autocompleteList.style.display = "none";
        executarBusquedaProducto();
      }
    });

    // Ocultar autocompleado al hacer clic fuera
    document.addEventListener("click", (e) => {
      if (!productoInput.contains(e.target) && !autocompleteList.contains(e.target)) {
        autocompleteList.style.display = "none";
      }
    });

  } catch (error) {
    console.error(error);
    const alert = document.getElementById("traceError");
    if (alert) {
      alert.hidden = false;
      alert.textContent = "Error al cargar o parsear BaseTrazabilidad.csv. Revisa la consola.";
    }
  }
}

function showProductSummary(productName, rows) {
  const productoResult = document.getElementById("productoResult");
  const matchedRows = rows.filter(r => (r["Item Description"] || "").toLowerCase() === productName.toLowerCase());

  productoResult.style.display = "block";

  if (matchedRows.length === 0) {
    productoResult.innerHTML = `<span style="color: #dc2626;">No se encontraron registros para el producto "${productName}".</span>`;
    return;
  }

  // Valores únicos sin repetir
  const dates = [...new Set(matchedRows.map(r => r["Delivery Date"]).filter(Boolean))];
  const shipments = [...new Set(matchedRows.map(r => r["Shipment Custom"]).filter(Boolean))];
  const vehicles = [...new Set(matchedRows.map(r => r["Vehicle Key"]).filter(Boolean))];

  productoResult.innerHTML = `
    <h3 style="margin-bottom: 10px; color: var(--gm-navy, #1e3a8a); font-size: 1.05rem;">Resumen Consolidado: ${productName}</h3>
    <p style="margin-bottom: 8px;"><strong>Total de ocurrencias / filas:</strong> ${matchedRows.length}</p>
    <div style="display: grid; gap: 8px; margin-top: 10px;">
      <div>
        <strong>Fechas de entrega únicas (${dates.length}):</strong><br>
        <span style="font-size: 0.85rem; color: #475569;">${dates.join(", ")}</span>
      </div>
      <div>
        <strong>Placas / Vehículos únicos (${vehicles.length}):</strong><br>
        <span style="font-size: 0.85rem; color: #475569;">${vehicles.join(", ")}</span>
      </div>
      <div>
        <strong>Pedidos únicos (${shipments.length}):</strong><br>
        <span style="font-size: 0.85rem; color: #475569;">${shipments.slice(0, 30).join(", ")}${shipments.length > 30 ? ' ... (y más)' : ''}</span>
      </div>
    </div>
  `;
}

document.addEventListener("DOMContentLoaded", start);
