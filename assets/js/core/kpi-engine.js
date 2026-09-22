const clean = (value) => String(value ?? "").trim().toUpperCase();
const key = (value) => String(value ?? "").trim();

function number(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").trim().replace(/\s/g, "");
  if (!text) return 0;
  const normalized = text.includes(",") && text.includes(".")
    ? text.replace(/,/g, "")
    : text.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

const ratio = (numerator, denominator) => denominator > 0 ? numerator / denominator * 100 : 0;

function uniqueBy(rows, selector) {
  const map = new Map();
  rows.forEach((row) => {
    const id = selector(row);
    if (id && !map.has(id)) map.set(id, row);
  });
  return [...map.values()];
}

function customerStatus(rows) {
  const statuses = rows.map((row) => clean(row.EstadoEntrega));
  if (statuses.includes("ENTREGADO")) return "ENTREGADO";
  if (statuses.length && statuses.every((status) => status === "RECHAZADO")) return "RECHAZADO";
  return "PENDIENTE";
}

function migratedRows(rows) {
  return rows.filter((row) => clean(row.EstadoMigracion) === "MIGRADO");
}

function customerGroups(rows) {
  const groups = new Map();
  migratedRows(rows).forEach((row) => {
    const id = key(row.CustomerAccount || row.ShipmentCustom);
    if (!id) return;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  });
  return groups;
}

export function calculateKpis(rows) {
  const vehicles = uniqueBy(rows, (row) => key(row.VehicleKey));
  const migratedVehicles = uniqueBy(migratedRows(rows), (row) => key(row.VehicleKey));
  const connectedVehicles = uniqueBy(
    migratedRows(rows).filter((row) => clean(row.EstadoConexion) === "CONECTADO"),
    (row) => key(row.VehicleKey)
  );

  const customers = customerGroups(rows);
  let visited = 0;
  let rejected = 0;
  customers.forEach((customerRows) => {
    const status = customerStatus(customerRows);
    if (status === "ENTREGADO" || status === "RECHAZADO") visited += 1;
    if (status === "RECHAZADO") rejected += 1;
  });

  const migrated = migratedRows(rows);
  const migratedKg = migrated.reduce((sum, row) => sum + number(row.KgPlanificados), 0);
  const rejectedKg = migrated
    .filter((row) => clean(row.EstadoEntrega) === "RECHAZADO")
    .reduce((sum, row) => sum + number(row.KgPlanificados), 0);

  return {
    migration: { value: ratio(migratedVehicles.length, vehicles.length), numerator: migratedVehicles.length, denominator: vehicles.length },
    connection: { value: ratio(connectedVehicles.length, migratedVehicles.length), numerator: connectedVehicles.length, denominator: migratedVehicles.length },
    progress: { value: ratio(visited, customers.size), numerator: visited, denominator: customers.size },
    dbeClient: { value: ratio(rejected, customers.size), numerator: rejected, denominator: customers.size },
    dbeKg: { value: ratio(rejectedKg, migratedKg), numerator: rejectedKg, denominator: migratedKg }
  };
}

export function calculateProgressByLocation(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const location = key(row.Location) || "Sin Location";
    if (!groups.has(location)) groups.set(location, []);
    groups.get(location).push(row);
  });

  return [...groups.entries()]
    .map(([location, locationRows]) => ({ location, value: calculateKpis(locationRows).progress.value }))
    .sort((a, b) => b.value - a.value);
}

export function getOperationDate(rows) {
  const values = rows.map((row) => row.DeliveryDate).filter(Boolean);
  return values[0] ?? "Sin fecha";
}
