import { loadPowerAppData } from "./core/data-service.js";
import { calculateKpis, operationDate } from "./core/kpi-engine.js";

const byId = (id) => document.getElementById(id);
const clean = (value) => String(value ?? "").trim().toUpperCase();
const text = (value) => String(value ?? "").trim();
const pct = (value) => `${Number(value || 0).toFixed(1)}%`;
const whole = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

function groupByVehicle(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const vehicleKey = text(row.VehicleKey);
    if (!vehicleKey) return;
    if (!groups.has(vehicleKey)) groups.set(vehicleKey, []);
    groups.get(vehicleKey).push(row);
  });
  return [...groups.entries()].map(([vehicleKey, vehicleRows]) => {
    const representative = vehicleRows[0] ?? {};
    const metrics = calculateKpis(vehicleRows);
    return {
      vehicleKey,
      location: text(representative.Location) || "Sin Location",
      migration: clean(representative.EstadoMigracion) || "SIN INFORMACIÓN",
      connection: clean(representative.EstadoConexion) || "SIN INFORMACIÓN",
      clients: metrics.progress.denominator,
      visited: metrics.progress.numerator,
      rejected: metrics.dbeClient.numerator,
      progress: metrics.progress,
      dbeClient: metrics.dbeClient,
      dbeKg: metrics.dbeKg
    };
  }).sort((a, b) => a.location.localeCompare(b.location, "es") || a.vehicleKey.localeCompare(b.vehicleKey, "es"));
}

function badge(value, goodValue) {
  const mode = value === goodValue ? "ok" : value === "NO APLICA" || value === "SIN INFORMACIÓN" ? "neutral" : "bad";
  return `<span class="vh-badge vh-badge--${mode}">${escapeHtml(value)}</span>`;
}

function metric(metricValue, kind) {
  const width = Math.min(100, Math.max(0, Number(metricValue.value) || 0));
  return `<div class="vh-metric vh-metric--${kind}" title="${escapeHtml(`${metricValue.numerator} / ${metricValue.denominator}`)}"><div class="vh-metric__track"><div class="vh-metric__fill" style="width:${width}%"></div></div><span class="vh-metric__value">${pct(metricValue.value)}</span></div>`;
}

function renderSummary(rows, vehicles) {
  const metrics = calculateKpis(rows);
  byId("totalVehicles").textContent = whole.format(vehicles.length);
  byId("migratedVehicles").textContent = whole.format(metrics.migration.numerator);
  byId("migrationPct").textContent = `${pct(metrics.migration.value)} · ${metrics.migration.numerator} / ${metrics.migration.denominator}`;
  byId("connectedVehicles").textContent = whole.format(metrics.connection.numerator);
  byId("connectionPct").textContent = `${pct(metrics.connection.value)} · ${metrics.connection.numerator} / ${metrics.connection.denominator}`;
  byId("avgProgress").textContent = pct(metrics.progress.value);
  byId("progressRatio").textContent = `${metrics.progress.numerator} / ${metrics.progress.denominator} clientes`;
  byId("dbeClient").textContent = pct(metrics.dbeClient.value);
  byId("dbeClientRatio").textContent = `${metrics.dbeClient.numerator} / ${metrics.dbeClient.denominator} clientes`;
  byId("dbeKg").textContent = pct(metrics.dbeKg.value);
  byId("dbeKgRatio").textContent = `${oneDecimal.format(metrics.dbeKg.numerator)} / ${oneDecimal.format(metrics.dbeKg.denominator)} kg`;
}

function populateLocations(vehicles) {
  [...new Set(vehicles.map((item) => item.location))].sort((a, b) => a.localeCompare(b, "es")).forEach((location) => {
    const option = document.createElement("option");
    option.value = location;
    option.textContent = location;
    byId("locationFilter").appendChild(option);
  });
}

function renderTable(vehicles) {
  const search = byId("vehicleSearch").value.trim().toLowerCase();
  const selectedLocation = byId("locationFilter").value;
  const selectedMigration = byId("migrationFilter").value;
  const filtered = vehicles.filter((vehicle) =>
    (!search || vehicle.vehicleKey.toLowerCase().includes(search)) &&
    (!selectedLocation || vehicle.location === selectedLocation) &&
    (!selectedMigration || vehicle.migration === selectedMigration)
  );

  byId("visibleCount").textContent = `${filtered.length} de ${vehicles.length} vehículos`;
  if (!filtered.length) {
    byId("vehicleTable").innerHTML = '<tr><td colspan="10" class="vh-empty">No hay vehículos para los filtros seleccionados.</td></tr>';
    return;
  }

  byId("vehicleTable").innerHTML = filtered.map((vehicle) => `<tr>
    <td class="vh-key">${escapeHtml(vehicle.vehicleKey)}</td>
    <td>${escapeHtml(vehicle.location)}</td>
    <td>${badge(vehicle.migration, "MIGRADO")}</td>
    <td>${badge(vehicle.connection, "CONECTADO")}</td>
    <td class="vh-number">${whole.format(vehicle.clients)}</td>
    <td class="vh-number">${whole.format(vehicle.visited)}</td>
    <td class="vh-number">${whole.format(vehicle.rejected)}</td>
    <td>${metric(vehicle.progress, "progress")}</td>
    <td>${metric(vehicle.dbeClient, "client")}</td>
    <td>${metric(vehicle.dbeKg, "kg")}</td>
  </tr>`).join("");
}

function waitForComponents() {
  if (byId("operationDate")) return Promise.resolve();
  return new Promise((resolve) => document.addEventListener("components:ready", resolve, { once: true }));
}

async function initVehicles() {
  try {
    const [rows] = await Promise.all([loadPowerAppData(), waitForComponents()]);
    const vehicles = groupByVehicle(rows);
    renderSummary(rows, vehicles);
    populateLocations(vehicles);
    renderTable(vehicles);
    byId("operationDate").textContent = operationDate(rows);
    ["vehicleSearch", "locationFilter", "migrationFilter"].forEach((id) => {
      byId(id).addEventListener(id === "vehicleSearch" ? "input" : "change", () => renderTable(vehicles));
    });
  } catch (error) {
    console.error(error);
    const alert = byId("vehiclesError");
    alert.hidden = false;
    alert.textContent = "No se pudieron cargar los datos de vehículos desde RoadMap.";
    byId("vehicleTable").innerHTML = '<tr><td colspan="10" class="vh-empty">Error al cargar los datos.</td></tr>';
  }
}

document.addEventListener("DOMContentLoaded", initVehicles);
