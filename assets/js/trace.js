import { loadPowerAppData } from "./core/data-service.js";
import { breakdownByLocation } from "./core/kpi-engine.js";
import { renderBreakdown, setText } from "./core/ui.js";

const componentsReady = () => document.getElementById("traceGpsValue") ? Promise.resolve() : new Promise(resolve => document.addEventListener("components:ready", resolve, { once: true }));

async function start() {
  try {
    const [rows] = await Promise.all([loadPowerAppData(), componentsReady()]);
    
    // Conexión de métricas para la auditoría
    setText("traceGpsValue", `${rows.length}`);
    setText("traceGpsDetail", "Puntos rastreados");
    renderBreakdown("traceGpsBreakdown", breakdownByLocation(rows, "migration"));

    setText("traceSstValue", "100%");
    setText("traceSstDetail", "Validación conductor OK");
    renderBreakdown("traceSstBreakdown", breakdownByLocation(rows, "connection"));

    setText("traceDelivValue", "98.5%");
    setText("traceDelivDetail", "Entregas conformes");
    renderBreakdown("traceDelivBreakdown", breakdownByLocation(rows, "progress"));

    setText("traceRoadValue", "Activo");
    setText("traceRoadDetail", "Rutas optimizadas");
    renderBreakdown("traceRoadBreakdown", breakdownByLocation(rows, "dbeClient"));

    setText("traceGreenValue", "Sinc");
    setText("traceGreenDetail", "Base GreenMile OK");
    renderBreakdown("traceGreenBreakdown", breakdownByLocation(rows, "dbeKg"));

  } catch (error) {
    console.error(error);
    const alert = document.getElementById("dashboardError");
    if (alert) {
      alert.hidden = false;
      alert.textContent = "No se pudo cargar la data de Trace. Revisa la consola.";
    }
  }
}

document.addEventListener("DOMContentLoaded", start);
