import { CONFIG } from "./config.js";

let cache = null;

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.rows)) return payload.rows;
  throw new TypeError("PowerApp_Data.json no contiene un arreglo reconocible.");
}

export async function loadPowerAppData({ forceRefresh = false } = {}) {
  if (cache && !forceRefresh) return cache;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.fetchTimeoutMs);

  try {
    const response = await fetch(CONFIG.dataUrl, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`Error HTTP ${response.status} al obtener PowerApp_Data.json.`);
    const payload = await response.json();
    cache = extractRows(payload);
    return cache;
  } finally {
    clearTimeout(timeout);
  }
}
