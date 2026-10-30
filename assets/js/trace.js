const componentsReady = () => document.getElementById("pedidoInput") ? Promise.resolve() : new Promise(resolve => document.addEventListener("components:ready", resolve, { once: true }));

let globalRows = [];
let dataLoaded = false;

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
        const cleanHeader = h.trim().replace(/^"|"$/g, '');
        row[cleanHeader] = values[index] ? values[index].trim().replace(/^"|"$/g, '') : "";
      });
      rows.push(row);
    }
  }
  return { headers, rows };
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
      result.push(line.substring(startValue, i));
      startValue = i + 1;
    }
  }
  result.push(line.substring(startValue));
  return result;
}

// Función global para abrir el Pop-up / Modal de previsualización
window.openPdfModal = function(url, title) {
  const modal = document.getElementById("pdfModal");
  const iframe = document.getElementById("pdfViewerFrame");
  const modalTitle = document.getElementById("pdfModalTitle");
  const downloadBtn = document.getElementById("pdfDownloadBtn");

  if (modal && iframe && modalTitle) {
    iframe.src = url;
    modalTitle.textContent = title;
    downloadBtn.href = url;
    modal.style.display = "grid";
  }
};

function setupPdfModalEvents() {
  const modal = document.getElementById("pdfModal");
  const closeBtn = document.getElementById("closePdfModal");
  const closeBtnFooter = document.getElementById("closePdfModalBtn");

  const closeModal = () => {
    if (modal) {
      modal.style.display = "none";
      document.getElementById("pdfViewerFrame").src = "";
    }
  };

  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (closeBtnFooter) closeBtnFooter.addEventListener("click", closeModal);
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }
}

// Generar botones que abren el modal en lugar de descargar directo
function renderPdfBadges(vehicleKey) {
  if (!vehicleKey) return "—";
  const fumigacionUrl = `../docs/fumigacion/${vehicleKey}.pdf`;
  const mantenimientoUrl = `../docs/mantenimiento/${vehicleKey}.pdf`;

  return `
    <div class="doc-icons">
      <button type="button" onclick="openPdfModal('${fumigacionUrl}', 'Certificado de Fumigación - Placa: ${vehicleKey}')" class="pdf-badge pdf-badge--fumigacion" title="Previsualizar fumigación"><span>🦠</span> Fumigación</button>
      <button type="button" onclick="openPdfModal('${mantenimientoUrl}', 'Orden de Mantenimiento - Placa: ${vehicleKey}')" class="pdf-badge pdf-badge--mantenimiento" title="Previsualizar mantenimiento"><span>🔧</span> Mantenimiento</button>
    </div>
  `;
}

async function checkFileExists(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (response.ok) return true;
    const getResp = await fetch(url);
    return getResp.ok;
  } catch (e) {
    return false;
  }
}

async function start() {
  await componentsReady();
  setupPdfModalEvents();

  const btnModePedido = document.getElementById("btnModePedido");
  const btnModeProducto = document.getElementById("btnModeProducto");
  const btnModeChecklist = document.getElementById("btnModeChecklist");
  
  const sectionPedido = document.getElementById("sectionPedido");
  const sectionProducto = document.getElementById("sectionProducto");
  const sectionChecklist = document.getElementById("sectionChecklist");

  const switchTab = (activeBtn, activeSection) => {
    [btnModePedido, btnModeProducto, btnModeChecklist].forEach(b => { if(b) b.classList.remove("active"); });
    [sectionPedido, sectionProducto, sectionChecklist].forEach(s => { if(s) s.style.display = "none"; });
    if(activeBtn) activeBtn.classList.add("active");
    if(activeSection) activeSection.style.display = "block";
  };

  if (btnModePedido && sectionPedido) {
    btnModePedido.addEventListener("click", () => switchTab(btnModePedido, sectionPedido));
  }
  if (btnModeProducto && sectionProducto) {
    btnModeProducto.addEventListener("click", () => switchTab(btnModeProducto, sectionProducto));
  }
  if (btnModeChecklist && sectionChecklist) {
    btnModeChecklist.addEventListener("click", () => {
      switchTab(btnModeChecklist, sectionChecklist);
      if (!dataLoaded) {
        document.getElementById("checklistResult").innerHTML = "<p>⏳ Cargando base de datos, por favor espere un momento...</p>";
      } else {
        loadChecklistData(globalRows);
      }
    });
  }

  const productoInput = document.getElementById("productoInput");
  const pedidoInput = document.getElementById("pedidoInput");
  if (productoInput) { productoInput.placeholder = "Cargando base de datos..."; productoInput.disabled = true; }
  if (pedidoInput) { pedidoInput.placeholder = "Cargando base de datos..."; pedidoInput.disabled = true; }

  try {
    const result = await loadTraceData();
    globalRows = result.rows;
    dataLoaded = true;

    if (productoInput) { productoInput.placeholder = "Escribe el nombre del producto..."; productoInput.disabled = false; }
    if (pedidoInput) { pedidoInput.placeholder = "Ej. 3033203774..."; pedidoInput.disabled = false; }

    if (btnModeChecklist && btnModeChecklist.classList.contains("active")) {
      loadChecklistData(globalRows);
    }

    initSearchFeatures(globalRows);

  } catch (error) {
    console.error(error);
    const alert = document.getElementById("traceError");
    if (alert) {
      alert.hidden = false;
      alert.textContent = "Error al cargar o parsear BaseTrazabilidad.csv. Revisa la consola del navegador.";
    }
  }
}

function initSearchFeatures(rows) {
  const pedidoInput = document.getElementById("pedidoInput");
  const buscarPedidoBtn = document.getElementById("buscarPedidoBtn");
  const pedidoResult = document.getElementById("pedidoResult");

  const executarBusquedaPedido = () => {
    const query = pedidoInput.value.trim().toLowerCase();
    if (!query) return;

    const match = rows.find(r => (r["Shipment Custom"] || "").toLowerCase() === query);
    pedidoResult.style.display = "block";

    if (match) {
      const vehicle = match["Vehicle Key"] || "";
      pedidoResult.innerHTML = `
        <div class="table-responsive">
          <table class="gm-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Fecha</th>
                <th>Placa</th>
                <th>Cliente</th>
                <th>Razón Comercial</th>
                <th>Documentos (SST)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>${match["Shipment Custom"] || "—"}</strong></td>
                <td>${match["Delivery Date"] || "—"}</td>
                <td><strong>${vehicle}</strong></td>
                <td>${match["Customer Name"] || "—"}</td>
                <td>${match["Customer Name2"] || "—"}</td>
                <td>${renderPdfBadges(vehicle)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    } else {
      pedidoResult.innerHTML = `<span style="color: #dc2626;">No se encontró ningún registro para el pedido "${pedidoInput.value}".</span>`;
    }
  };

  if (buscarPedidoBtn) buscarPedidoBtn.addEventListener("click", executarBusquedaPedido);
  if (pedidoInput) {
    pedidoInput.addEventListener("keypress", (e) => { if (e.key === "Enter") executarBusquedaPedido(); });
  }

  const productoInput = document.getElementById("productoInput");
  const autocompleteList = document.getElementById("productoAutocomplete");
  const buscarProductoBtn = document.getElementById("buscarProductoBtn");
  const productoResult = document.getElementById("productoResult");

  const uniqueProducts = [...new Set(rows.map(r => r["Item Description"]).filter(Boolean))];

  if (productoInput && autocompleteList) {
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
            showProductTable(item, rows);
          });
          autocompleteList.appendChild(div);
        });
      } else {
        autocompleteList.style.display = "none";
      }
    });
  }

  const executarBusquedaProducto = () => {
    const val = productoInput.value.trim();
    autocompleteList.style.display = "none";
    if (val) {
      showProductTable(val, rows);
    }
  };

  if (buscarProductoBtn) buscarProductoBtn.addEventListener("click", executarBusquedaProducto);
  if (productoInput) {
    productoInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        autocompleteList.style.display = "none";
        executarBusquedaProducto();
      }
    });
  }

  document.addEventListener("click", (e) => {
    if (productoInput && autocompleteList && !productoInput.contains(e.target) && !autocompleteList.contains(e.target)) {
      autocompleteList.style.display = "none";
    }
  });
}

function showProductTable(productName, rows) {
  const productoResult = document.getElementById("productoResult");
  const matchedRows = rows.filter(r => (r["Item Description"] || "").toLowerCase() === productName.toLowerCase());

  productoResult.style.display = "block";

  if (matchedRows.length === 0) {
    productoResult.innerHTML = `<span style="color: #dc2626;">No se encontraron registros para el producto "${productName}".</span>`;
    return;
  }

  const uniqueMap = new Map();
  matchedRows.forEach(r => {
    const key = `${r["Delivery Date"]}|${r["Vehicle Key"]}|${r["Customer Name"]}|${r["Customer Name2"]}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, {
        date: r["Delivery Date"],
        vehicle: r["Vehicle Key"],
        customer: r["Customer Name"],
        commercial: r["Customer Name2"]
      });
    }
  });

  const uniqueList = Array.from(uniqueMap.values());

  productoResult.innerHTML = `
    <h3 style="margin-bottom: 6px; color: var(--gm-navy, #1e3a8a); font-size: 1.05rem;">Resumen Consolidado: ${productName}</h3>
    <p style="margin-bottom: 10px; font-size: 0.85rem; color: #64748b;">Mostrando ${uniqueList.length} registros únicos con acceso a documentos.</p>
    <div class="table-responsive">
      <table class="gm-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Placa</th>
            <th>Cliente</th>
            <th>Razón Comercial</th>
            <th>Documentos (SST)</th>
          </tr>
        </thead>
        <tbody>
          ${uniqueList.map(item => `
            <tr>
              <td>${item.date || "—"}</td>
              <td><strong>${item.vehicle || "—"}</strong></td>
              <td>${item.customer || "—"}</td>
              <td>${item.commercial || "—"}</td>
              <td>${renderPdfBadges(item.vehicle)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// --- 3. CHECKLIST OCTUBRE (Filtro estrictamente octubre y exclusión de placas) ---
async function loadChecklistData(rows) {
  const checklistResult = document.getElementById("checklistResult");
  checklistResult.innerHTML = "<p>Filtrando operaciones de octubre (excluyendo RES-CLI y FRT-001) y validando archivos...</p>";

  // Placas excluidas por requerimiento
  const excludedVehicles = ["RES-CLI", "FRT-001"];

  const octoberRows = rows.filter(r => {
    const dateStr = r["Delivery Date"] || "";
    const vehicleKey = (r["Vehicle Key"] || "").trim();

    // Validar exclusión de placas
    if (excludedVehicles.includes(vehicleKey)) return false;

    // Validar estricto mes de octubre (part[1] === "10")
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      return parts[1] === "10";
    }
    return false;
  });

  const uniqueVehicles = [...new Set(octoberRows.map(r => r["Vehicle Key"]).filter(Boolean))].sort();

  if (uniqueVehicles.length === 0) {
    checklistResult.innerHTML = `<span style="color: #dc2626;">No se encontraron registros de vehículos válidos para el mes de octubre.</span>`;
    return;
  }

  checklistResult.innerHTML = `
    <p style="margin-bottom: 10px; font-size: 0.85rem; color: #64748b;">Se encontraron <strong>${uniqueVehicles.length}</strong> placas únicas operando en octubre (excluyendo RES-CLI y FRT-001). Validando PDFs...</p>
    <div class="table-responsive">
      <table class="gm-table" id="checklistTable">
        <thead>
          <tr>
            <th>N°</th>
            <th>Placa / Vehículo</th>
            <th>Fumigación (PDF)</th>
            <th>Mantenimiento (PDF)</th>
            <th>Acción / Ver Documentos</th>
          </tr>
        </thead>
        <tbody>
          ${uniqueVehicles.map((veh, index) => `
            <tr id="check-row-${veh}">
              <td>${index + 1}</td>
              <td><strong>${veh}</strong></td>
              <td id="fum-${veh}">⌛ Verificando...</td>
              <td id="mnt-${veh}">⌛ Verificando...</td>
              <td>${renderPdfBadges(veh)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  for (const veh of uniqueVehicles) {
    const fumUrl = `../docs/fumigacion/${veh}.pdf`;
    const mntUrl = `../docs/mantenimiento/${veh}.pdf`;

    const [fumExists, mntExists] = await Promise.all([
      checkFileExists(fumUrl),
      checkFileExists(mntUrl)
    ]);

    const fumCell = document.getElementById(`fum-${veh}`);
    const mntCell = document.getElementById(`mnt-${veh}`);

    if (fumCell) {
      fumCell.innerHTML = fumExists 
        ? `<span class="status-badge" style="color: #10b981;" title="Documento encontrado">✅ Sí</span>` 
        : `<span class="status-badge" style="color: #ef4444;" title="Falta archivo PDF">❌ No</span>`;
    }

    if (mntCell) {
      mntCell.innerHTML = mntExists 
        ? `<span class="status-badge" style="color: #10b981;" title="Documento encontrado">✅ Sí</span>` 
        : `<span class="status-badge" style="color: #ef4444;" title="Falta archivo PDF">❌ No</span>`;
    }
  }
}

document.addEventListener("DOMContentLoaded", start);
