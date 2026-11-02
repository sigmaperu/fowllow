const componentsReady = () => document.getElementById("pedidoInput") ? Promise.resolve() : new Promise(resolve => document.addEventListener("components:ready", resolve, { once: true }));

let globalRows = [];
let checklistMap = new Map(); // Mapa de placa -> proveedor
let dataLoaded = false;
let checklistInitialized = false;

async function loadTraceData() {
  const traceUrl = "https://raw.githubusercontent.com/sigmaperu/fowllow/refs/heads/main/data/BaseTrazabilidad.csv";
  const checkUrl = "https://raw.githubusercontent.com/sigmaperu/fowllow/refs/heads/main/data/CheckList.csv";

  const [traceRes, checkRes] = await Promise.all([
    fetch(traceUrl),
    fetch(checkUrl).catch(() => null)
  ]);

  if (!traceRes.ok) throw new Error("No se pudo conectar con BaseTrazabilidad.csv en el repositorio.");
  const traceText = await traceRes.text();
  const traceData = parseCSV(traceText);

  if (checkRes && checkRes.ok) {
    const checkText = await checkRes.text();
    const checkData = parseCSV(checkText);
    checkData.rows.forEach(r => {
      const placa = (r["Placa"] || r["Placa de vehículo"] || "").trim();
      const proveedor = (r["PROVEEDOR"] || r["Proveedor"] || "").trim();
      if (placa && proveedor) {
        checklistMap.set(placa, proveedor);
      }
    });
  }

  return traceData;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };

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

function getWeekNumber(dateStr) {
  const parts = dateStr.split("/");
  if (parts.length !== 3) return 40;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  
  const targetDate = new Date(year, month, day);
  const firstDayOfYear = new Date(year, 0, 1);
  const pastDaysOfYear = (targetDate - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

// Modal para PDF único
window.openPdfModal = function(url, title) {
  const modal = document.getElementById("pdfModal");
  const bodyContainer = document.getElementById("pdfModalBodyContainer");
  const iframe = document.getElementById("pdfViewerFrame");
  const modalTitle = document.getElementById("pdfModalTitle");
  const downloadBtn = document.getElementById("pdfDownloadBtn");
  const backBtn = document.getElementById("backToDirectoryBtn");

  if (modal && iframe && modalTitle) {
    bodyContainer.className = "pdf-modal-body single-view";
    iframe.src = url;
    modalTitle.textContent = title;
    downloadBtn.href = url;
    downloadBtn.style.display = "inline-flex";
    if (backBtn) backBtn.style.display = "none";
    modal.style.display = "grid";
  }
};

// Guardamos globalmente la placa actual para poder regresar a la lista de contratos del proveedor
let currentVehicleForContracts = "";

window.openProviderContractsModal = async function(vehicleKey) {
  currentVehicleForContracts = vehicleKey;
  const modal = document.getElementById("pdfModal");
  const bodyContainer = document.getElementById("pdfModalBodyContainer");
  const modalTitle = document.getElementById("pdfModalTitle");
  const directoryView = document.getElementById("pdfDirectoryView");
  const downloadBtn = document.getElementById("pdfDownloadBtn");
  const backBtn = document.getElementById("backToDirectoryBtn");

  if (modal && directoryView && modalTitle) {
    bodyContainer.className = "pdf-modal-body directory-view";
    const proveedor = checklistMap.get(vehicleKey) || "Proveedor General";
    modalTitle.textContent = `Contratos - Proveedor: ${proveedor} (Placa: ${vehicleKey})`;
    downloadBtn.style.display = "none";
    if (backBtn) backBtn.style.display = "none";

    directoryView.innerHTML = `<p style="color: #64748b;">⏳ Consultando archivos reales en la carpeta del proveedor...</p>`;
    modal.style.display = "grid";

    try {
      const encodedProvider = encodeURIComponent(proveedor);
      const apiUrl = `https://api.github.com/repos/sigmaperu/fowllow/contents/docs/Contratos/${encodedProvider}`;
      
      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error("Carpeta no encontrada en el repositorio.");
      
      const files = await response.json();
      const pdfFiles = files.filter(f => f.type === "file" && f.name.toLowerCase().endsWith(".pdf"));

      if (pdfFiles.length === 0) {
        directoryView.innerHTML = `<p style="color: #dc2626;">No se encontraron archivos PDF dentro de la carpeta de este proveedor en GitHub.</p>`;
        return;
      }

      directoryView.innerHTML = `
        <p style="margin-bottom: 12px; font-size: 0.85rem; color: #64748b;">Archivos encontrados en la carpeta de <strong>${proveedor}</strong>:</p>
        ${pdfFiles.map(f => {
          // Construimos la ruta local directa para GitHub Pages (ej: ../docs/Contratos/PROVEEDOR/nombre.pdf)
          const localPdfUrl = `../docs/Contratos/${proveedor}/${f.name}`;
          return `
            <div class="contract-list-item">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span>📁</span>
                <strong style="font-size: 0.9rem; color: #1e293b;">${f.name}</strong>
              </div>
              <button type="button" onclick="previewContractFile('${localPdfUrl}', '${f.name}')" class="trace-btn" style="padding: 6px 14px; font-size: 0.8rem;">Ver PDF</button>
            </div>
          `;
        }).join("")}
      `;
    } catch (e) {
      console.error(e);
      directoryView.innerHTML = `<p style="color: #dc2626;">⚠️ No se pudo acceder a la carpeta. Asegúrate de que el nombre de la carpeta en GitHub coincida exactamente con el proveedor registrado en el CSV.</p>`;
    }
  }
};

window.previewContractFile = function(url, name) {
  const bodyContainer = document.getElementById("pdfModalBodyContainer");
  const iframe = document.getElementById("pdfViewerFrame");
  const modalTitle = document.getElementById("pdfModalTitle");
  const downloadBtn = document.getElementById("pdfDownloadBtn");
  const backBtn = document.getElementById("backToDirectoryBtn");

  bodyContainer.className = "pdf-modal-body single-view";
  iframe.src = url;
  modalTitle.textContent = name;
  downloadBtn.href = url;
  downloadBtn.style.display = "inline-flex";
  if (backBtn) {
    backBtn.style.display = "inline-flex";
    backBtn.onclick = () => {
      openProviderContractsModal(currentVehicleForContracts);
    };
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

function renderPdfBadges(vehicleKey, deliveryDate) {
  if (!vehicleKey) return "—";
  const weekNum = deliveryDate ? getWeekNumber(deliveryDate) : 40;

  const fumigacionUrl = `../docs/fumigacion/${vehicleKey}.pdf`;
  const mantenimientoUrl = `../docs/mantenimiento/${vehicleKey}.pdf`;
  const limpiezaUrl = `../docs/limpieza/Limpieza Semana ${weekNum}.pdf`;
  const condicionUrl = `../docs/condicion/Condicion Semana ${weekNum}.pdf`;

  return `
    <div class="doc-icons">
      <button type="button" onclick="openPdfModal('${fumigacionUrl}', 'Fumigación - Placa: ${vehicleKey}')" class="pdf-icon-btn pdf-icon-btn--fumigacion" title="Certificado de Fumigación">🦠</button>
      <button type="button" onclick="openPdfModal('${mantenimientoUrl}', 'Mantenimiento - Placa: ${vehicleKey}')" class="pdf-icon-btn pdf-icon-btn--mantenimiento" title="Orden de Mantenimiento">🔧</button>
      <button type="button" onclick="openPdfModal('${limpiezaUrl}', 'Limpieza - Semana ${weekNum}')" class="pdf-icon-btn pdf-icon-btn--limpieza" title="Control de Limpieza (Semana ${weekNum})">🧹</button>
      <button type="button" onclick="openPdfModal('${condicionUrl}', 'Condición - Semana ${weekNum}')" class="pdf-icon-btn pdf-icon-btn--condicion" title="Condición de Unidades (Semana ${weekNum})">📋</button>
      <button type="button" onclick="openProviderContractsModal('${vehicleKey}')" class="pdf-icon-btn pdf-icon-btn--contratos" title="Ver Contratos del Proveedor">📁</button>
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
    [sectionPedido, sectionProducto, sectionChecklist].forEach(s => { if(s) s.classList.remove("active"); });
    if(activeBtn) activeBtn.classList.add("active");
    if(activeSection) activeSection.classList.add("active");
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
      if (dataLoaded && !checklistInitialized) {
        loadChecklistData(globalRows);
        checklistInitialized = true;
      } else if (!dataLoaded) {
        document.getElementById("checklistResult").innerHTML = "<p>⏳ Cargando base de datos, por favor espere...</p>";
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

    if (btnModeChecklist && btnModeChecklist.classList.contains("active") && !checklistInitialized) {
      loadChecklistData(globalRows);
      checklistInitialized = true;
    }

    initSearchFeatures(globalRows);

  } catch (error) {
    console.error(error);
    const alert = document.getElementById("traceError");
    if (alert) {
      alert.hidden = false;
      alert.textContent = "Error al cargar o parsear datos. Revisa la consola del navegador.";
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
      const date = match["Delivery Date"] || "";
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
                <td>${date}</td>
                <td><strong>${vehicle}</strong></td>
                <td>${match["Customer Name"] || "—"}</td>
                <td>${match["Customer Name2"] || "—"}</td>
                <td>${renderPdfBadges(vehicle, date)}</td>
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
              <td>${renderPdfBadges(item.vehicle, item.date)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function loadChecklistData(rows) {
  const checklistResult = document.getElementById("checklistResult");
  checklistResult.innerHTML = "<p>Filtrando operaciones de octubre (excluyendo RES-CLI y FRT-001) y validando archivos...</p>";

  const excludedVehicles = ["RES-CLI", "FRT-001"];

  const octoberRows = rows.filter(r => {
    const dateStr = r["Delivery Date"] || "";
    const vehicleKey = (r["Vehicle Key"] || "").trim();
    if (excludedVehicles.includes(vehicleKey)) return false;

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
    <p style="margin-bottom: 10px; font-size: 0.85rem; color: #64748b;">Se encontraron <strong>${uniqueVehicles.length}</strong> placas únicas operando en octubre. Validando PDFs de Fumigación y Mantenimiento...</p>
    <div class="table-responsive">
      <table class="gm-table" id="checklistTable">
        <thead>
          <tr>
            <th>N°</th>
            <th>Placa / Vehículo</th>
            <th>Fumigación (PDF)</th>
            <th>Mantenimiento (PDF)</th>
            <th>Ver Documentos</th>
          </tr>
        </thead>
        <tbody>
          ${uniqueVehicles.map((veh, index) => `
            <tr id="check-row-${veh}">
              <td>${index + 1}</td>
              <td><strong>${veh}</strong></td>
              <td id="fum-${veh}">⌛ Verificando...</td>
              <td id="mnt-${veh}">⌛ Verificando...</td>
              <td>
                <div class="doc-icons">
                  <button type="button" onclick="openPdfModal('../docs/fumigacion/${veh}.pdf', 'Fumigación - Placa: ${veh}')" class="pdf-icon-btn pdf-icon-btn--fumigacion" title="Fumigación">🦠</button>
                  <button type="button" onclick="openPdfModal('../docs/mantenimiento/${veh}.pdf', 'Mantenimiento - Placa: ${veh}')" class="pdf-icon-btn pdf-icon-btn--mantenimiento" title="Mantenimiento">🔧</button>
                </div>
              </td>
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
