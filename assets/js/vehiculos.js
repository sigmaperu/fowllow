import { loadPowerAppData } from "./core/data-service.js";
import { calculateKpis, operationDate } from "./core/kpi-engine.js";

const byId = (id) => document.getElementById(id);
const clean = (value) => String(value ?? "").trim().toUpperCase();
const text = (value) => String(value ?? "").trim();
const pct = (value) => `${Number(value || 0).toFixed(1)}%`;
const whole = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

let activeScope = "PLANIFICADOS";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;"
  })[char]);
}

function vehicleIsMigrated(rows) {
  return rows.some((row) => clean(row.EstadoMigracion) === "MIGRADO");
}

function groupRawRowsByVehicle(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const vehicleKey = text(row.VehicleKey);
    if (!vehicleKey) return;
    if (!groups.has(vehicleKey)) groups.set(vehicleKey, []);
    groups.get(vehicleKey).push(row);
  });
  return groups;
}

function buildVehicle([vehicleKey, vehicleRows]) {
  const representative = vehicleRows[0] ?? {};
  const metrics = calculateKpis(vehicleRows);
  const migrated = vehicleIsMigrated(vehicleRows);
  const connected = vehicleRows.some((row) => clean(row.EstadoConexion) === "CONECTADO");
  const noConnection = vehicleRows.some((row) => clean(row.EstadoConexion) === "SIN CONEXION");

  return {
    vehicleKey,
    rawRows: vehicleRows,
    location: text(representative.Location) || "Sin Centro",
    migrated,
    migration: migrated ? "MIGRADO" : "NO MIGRADO",
    connection: connected ? "CONECTADO" : noConnection ? "SIN CONEXION" : clean(representative.EstadoConexion) || "NO APLICA",
    progress: metrics.progress,
    dbeClient: metrics.dbeClient,
    dbeKg: metrics.dbeKg
  };
}

function badge(value, goodValue) {
  const mode = value === goodValue
    ? "ok"
    : value === "NO APLICA" || value === "SIN INFORMACIÓN"
      ? "neutral"
      : "bad";
  return `<span class="vh-badge vh-badge--${mode}">${escapeHtml(value)}</span>`;
}

function ratioLabel(metricValue) {
  const formatter = metricValue.unit === "kg" ? decimal : whole;
  return `${formatter.format(metricValue.numerator)} / ${formatter.format(metricValue.denominator)} ${escapeHtml(metricValue.unit)}`;
}

function metric(metricValue, kind) {
  const width = Math.min(100, Math.max(0, Number(metricValue.value) || 0));
  return `<div class="vh-metric vh-metric--${kind}">
    <div class="vh-metric__ratio">${ratioLabel(metricValue)}</div>
    <div class="vh-metric__body">
      <div class="vh-metric__track" aria-hidden="true">
        <div class="vh-metric__fill" style="width:${width}%"></div>
      </div>
      <span class="vh-metric__value">${pct(metricValue.value)}</span>
    </div>
  </div>`;
}

function scopeMatches(vehicle) {
  if (activeScope === "MIGRADOS") return vehicle.migrated;
  if (activeScope === "NO_MIGRADOS") return !vehicle.migrated;
  return true;
}

function filterContextVehicles(vehicles) {
  const center = byId("locationFilter").value;
  return vehicles.filter((vehicle) => scopeMatches(vehicle) && (!center || vehicle.location === center));
}

function filterTableVehicles(contextVehicles) {
  const search = byId("vehicleSearch").value.trim().toLowerCase();
  return contextVehicles.filter((vehicle) => !search || vehicle.vehicleKey.toLowerCase().includes(search));
}

function renderCards(contextVehicles) {
  const rows = contextVehicles.flatMap((vehicle) => vehicle.rawRows);
  const metrics = calculateKpis(rows);

  byId("avgProgress").textContent = pct(metrics.progress.value);
  byId("progressRatio").textContent = ratioLabel(metrics.progress);
  byId("dbeClient").textContent = pct(metrics.dbeClient.value);
  byId("dbeClientRatio").textContent = ratioLabel(metrics.dbeClient);
  byId("dbeKg").textContent = pct(metrics.dbeKg.value);
  byId("dbeKgRatio").textContent = ratioLabel(metrics.dbeKg);
}

function renderTable(tableVehicles, contextTotal, allTotal) {
  byId("visibleCount").textContent = `${tableVehicles.length} visibles · ${contextTotal} en selección · ${allTotal} planificados`;

  if (!tableVehicles.length) {
    byId("vehicleTable").innerHTML = '<tr><td colspan="7" class="vh-empty">No hay vehículos para los filtros seleccionados.</td></tr>';
    return;
  }

  byId("vehicleTable").innerHTML = tableVehicles.map((vehicle) => `<tr>
    <td class="vh-key">${escapeHtml(vehicle.vehicleKey)}</td>
    <td>${escapeHtml(vehicle.location)}</td>
    <td>${badge(vehicle.migration, "MIGRADO")}</td>
    <td>${badge(vehicle.connection, "CONECTADO")}</td>
    <td>${metric(vehicle.progress, "progress")}</td>
    <td>${metric(vehicle.dbeClient, "client")}</td>
    <td>${metric(vehicle.dbeKg, "kg")}</td>
  </tr>`).join("");
}

function render(vehicles) {
  const contextVehicles = filterContextVehicles(vehicles);
  const tableVehicles = filterTableVehicles(contextVehicles);
  renderCards(contextVehicles);
  renderTable(tableVehicles, contextVehicles.length, vehicles.length);
}

function populateCenters(vehicles) {
  [...new Set(vehicles.map((vehicle) => vehicle.location))]
    .sort((a, b) => a.localeCompare(b, "es"))
    .forEach((center) => {
      const option = document.createElement("option");
      option.value = center;
      option.textContent = center;
      byId("locationFilter").appendChild(option);
    });
}

function wireSegmentedSwitch(vehicles) {
  document.querySelectorAll(".vh-segmented__button").forEach((button) => {
    button.addEventListener("click", () => {
      activeScope = button.dataset.scope;
      document.querySelectorAll(".vh-segmented__button").forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      render(vehicles);
    });
  });
}

function waitForComponents() {
  if (byId("operationDate")) return Promise.resolve();
  return new Promise((resolve) => document.addEventListener("components:ready", resolve, { once: true }));
}

async function initVehicles() {
  try {
    const [rows] = await Promise.all([loadPowerAppData(), waitForComponents()]);
    const vehicles = [...groupRawRowsByVehicle(rows).entries()]
      .map(buildVehicle)
      .sort((a, b) => a.location.localeCompare(b.location, "es") || a.vehicleKey.localeCompare(b.vehicleKey, "es"));

    populateCenters(vehicles);
    wireSegmentedSwitch(vehicles);
    byId("vehicleSearch").addEventListener("input", () => render(vehicles));
    byId("locationFilter").addEventListener("change", () => render(vehicles));
    render(vehicles);
    byId("operationDate").textContent = operationDate(rows);
  } catch (error) {
    console.error(error);
    const alert = byId("vehiclesError");
    alert.hidden = false;
    alert.textContent = "No se pudieron cargar los datos de vehículos desde RoadMap.";
    byId("vehicleTable").innerHTML = '<tr><td colspan="7" class="vh-empty">Error al cargar los datos.</td></tr>';
  }
}

document.addEventListener("DOMContentLoaded", initVehicles);
