import { loadPowerAppData } from "./core/data-service.js";
import { calculateKpis, calculateProgressByLocation, getOperationDate } from "./core/kpi-engine.js";
import { renderKpi, renderRanking, setText } from "./core/ui.js";

function waitForComponents() {
  if (document.getElementById("operationDate")) return Promise.resolve();
  return new Promise((resolve) => document.addEventListener("components:ready", resolve, { once: true }));
}

async function initDashboard() {
  try {
    const [rows] = await Promise.all([loadPowerAppData(), waitForComponents()]);
    const kpis = calculateKpis(rows);

    renderKpi("migration", kpis.migration);
    renderKpi("connection", kpis.connection);
    renderKpi("progress", kpis.progress);
    renderKpi("dbeClient", kpis.dbeClient);
    renderKpi("dbeKg", kpis.dbeKg, (metric) => `${metric.numerator.toFixed(1)} / ${metric.denominator.toFixed(1)} kg`);
    renderRanking("locationRanking", calculateProgressByLocation(rows));
    setText("operationDate", getOperationDate(rows));
  } catch (error) {
    console.error(error);
    const target = document.getElementById("dashboardError");
    if (target) {
      target.hidden = false;
      target.textContent = "No se pudo cargar PowerApp_Data.json desde RoadMap. Revisa la consola del navegador.";
    }
  }
}

document.addEventListener("DOMContentLoaded", initDashboard);
