import { loadPowerAppData } from "./core/data-service.js";
import { operationDate } from "./core/kpi-engine.js";

const byId=id=>document.getElementById(id);
const clean=value=>String(value??"").trim().toUpperCase();
const text=value=>String(value??"").trim();
const ratio=(n,d)=>d>0?n/d*100:0;
const pct=value=>`${Number(value||0).toFixed(1)}%`;
const whole=new Intl.NumberFormat("es-PE",{maximumFractionDigits:0});
const decimal=new Intl.NumberFormat("es-PE",{minimumFractionDigits:1,maximumFractionDigits:1});
let activeScope="PLANIFICADOS";
let sortState={key:"vehicleKey",direction:1};

function numeric(value){if(typeof value==="number")return Number.isFinite(value)?value:0;const raw=String(value??"").trim().replace(/\s/g,"");if(!raw)return 0;const normalized=raw.includes(",")&&raw.includes(".")?raw.replace(/,/g,""):raw.replace(",",".");const result=Number(normalized);return Number.isFinite(result)?result:0}
function escapeHtml(value){return String(value??"").replace(/[&<>"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]))}
function customerKey(row){return text(row.CustomerAccount||row.ShipmentCustom)}
function customerState(rows){const states=rows.map(row=>clean(row.EstadoEntrega));if(states.includes("ENTREGADO"))return"ENTREGADO";if(states.length&&states.every(state=>state==="RECHAZADO"))return"RECHAZADO";return"PENDIENTE"}

function operationalMetrics(rows){
  const customers=new Map();
  rows.forEach(row=>{const key=customerKey(row);if(!key)return;if(!customers.has(key))customers.set(key,[]);customers.get(key).push(row)});
  let visited=0,rejected=0;
  customers.forEach(group=>{const state=customerState(group);if(state==="ENTREGADO"||state==="RECHAZADO")visited++;if(state==="RECHAZADO")rejected++});
  const totalKg=rows.reduce((sum,row)=>sum+numeric(row.KgPlanificados),0);
  const rejectedKg=rows.filter(row=>clean(row.EstadoEntrega)==="RECHAZADO").reduce((sum,row)=>sum+numeric(row.KgPlanificados),0);
  return{
    progress:{value:ratio(visited,customers.size),numerator:visited,denominator:customers.size,unit:"clientes"},
    dbeClient:{value:ratio(rejected,customers.size),numerator:rejected,denominator:customers.size,unit:"clientes"},
    dbeKg:{value:ratio(rejectedKg,totalKg),numerator:rejectedKg,denominator:totalKg,unit:"kg"}
  };
}

function groupRows(rows){const groups=new Map();rows.forEach(row=>{const key=text(row.VehicleKey);if(!key)return;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)});return groups}
function buildVehicle([vehicleKey,rawRows]){const representative=rawRows[0]??{};const metrics=operationalMetrics(rawRows);const migrated=rawRows.some(row=>clean(row.EstadoMigracion)==="MIGRADO");const connected=rawRows.some(row=>clean(row.EstadoConexion)==="CONECTADO");const disconnected=rawRows.some(row=>clean(row.EstadoConexion)==="SIN CONEXION");return{vehicleKey,rawRows,location:text(representative.Location)||"Sin Centro",migrated,migration:migrated?"MIGRADO":"NO MIGRADO",connection:connected?"CONECTADO":disconnected?"SIN CONEXION":"NO APLICA",...metrics}}
function badge(value,good){const mode=value===good?"ok":value==="NO APLICA"?"neutral":"bad";return`<span class="vh-badge vh-badge--${mode}">${escapeHtml(value)}</span>`}
function ratioLabel(metricValue){const formatter=metricValue.unit==="kg"?decimal:whole;return`${formatter.format(metricValue.numerator)} / ${formatter.format(metricValue.denominator)} ${escapeHtml(metricValue.unit)}`}
function metric(metricValue,kind){const width=Math.min(100,Math.max(0,Number(metricValue.value)||0));return`<div class="vh-metric vh-metric--${kind}"><div class="vh-metric__ratio">${ratioLabel(metricValue)}</div><div class="vh-metric__body"><div class="vh-metric__track"><div class="vh-metric__fill" style="width:${width}%"></div></div><span class="vh-metric__value">${pct(metricValue.value)}</span></div></div>`}
function scopeMatches(vehicle){if(activeScope==="MIGRADOS")return vehicle.migrated;if(activeScope==="NO_MIGRADOS")return!vehicle.migrated;return true}
function contextVehicles(vehicles){const center=byId("locationFilter").value;return vehicles.filter(vehicle=>scopeMatches(vehicle)&&(!center||vehicle.location===center))}
function tableVehicles(context){const search=byId("vehicleSearch").value.trim().toLowerCase();return context.filter(vehicle=>!search||vehicle.vehicleKey.toLowerCase().includes(search))}

function aggregate(vehicles){return operationalMetrics(vehicles.flatMap(vehicle=>vehicle.rawRows))}
function setGauge(id,value){const gauge=byId(id);if(gauge)gauge.style.setProperty("--gauge-value",Math.min(100,Math.max(0,Number(value)||0)))}
function renderCards(context){const metrics=aggregate(context);byId("avgProgress").textContent=pct(metrics.progress.value);byId("progressRatio").textContent=ratioLabel(metrics.progress);byId("dbeClient").textContent=pct(metrics.dbeClient.value);byId("dbeClientRatio").textContent=ratioLabel(metrics.dbeClient);byId("dbeKg").textContent=pct(metrics.dbeKg.value);byId("dbeKgRatio").textContent=ratioLabel(metrics.dbeKg);setGauge("progressGauge",metrics.progress.value);setGauge("dbeClientGauge",metrics.dbeClient.value);setGauge("dbeKgGauge",metrics.dbeKg.value)}

function sortValue(vehicle,key){if(["progress","dbeClient","dbeKg"].includes(key))return vehicle[key].value;return String(vehicle[key]??"").toLocaleLowerCase()}
function sorted(items){return[...items].sort((a,b)=>{const av=sortValue(a,sortState.key),bv=sortValue(b,sortState.key);if(typeof av==="number")return(av-bv)*sortState.direction;return av.localeCompare(bv,"es")*sortState.direction})}
function updateSortHeaders(){document.querySelectorAll(".vh-sort").forEach(button=>{const active=button.dataset.sort===sortState.key;button.classList.toggle("is-active",active);button.querySelector("span").textContent=active?(sortState.direction===1?"↑":"↓"):"↕";button.setAttribute("aria-sort",active?(sortState.direction===1?"ascending":"descending"):"none")})}

function renderTable(items,contextTotal,allTotal){const ordered=sorted(items);byId("visibleCount").textContent=`${ordered.length} visibles · ${contextTotal} en selección · ${allTotal} planificados`;if(!ordered.length){byId("vehicleTable").innerHTML='<tr><td colspan="7" class="vh-empty">No hay vehículos para los filtros seleccionados.</td></tr>';return}byId("vehicleTable").innerHTML=ordered.map(vehicle=>`<tr><td class="vh-key">${escapeHtml(vehicle.vehicleKey)}</td><td>${escapeHtml(vehicle.location)}</td><td>${badge(vehicle.migration,"MIGRADO")}</td><td>${badge(vehicle.connection,"CONECTADO")}</td><td>${metric(vehicle.progress,"progress")}</td><td>${metric(vehicle.dbeClient,"client")}</td><td>${metric(vehicle.dbeKg,"kg")}</td></tr>`).join("");updateSortHeaders()}
function render(vehicles){const context=contextVehicles(vehicles);const table=tableVehicles(context);renderCards(context);renderTable(table,context.length,vehicles.length)}
function populateCenters(vehicles){[...new Set(vehicles.map(v=>v.location))].sort((a,b)=>a.localeCompare(b,"es")).forEach(center=>{const option=document.createElement("option");option.value=center;option.textContent=center;byId("locationFilter").appendChild(option)})}
function wireScope(vehicles){document.querySelectorAll(".vh-segmented__button").forEach(button=>button.addEventListener("click",()=>{activeScope=button.dataset.scope;document.querySelectorAll(".vh-segmented__button").forEach(item=>{const active=item===button;item.classList.toggle("is-active",active);item.setAttribute("aria-pressed",String(active))});render(vehicles)}))}
function wireSorting(vehicles){document.querySelectorAll(".vh-sort").forEach(button=>button.addEventListener("click",()=>{const key=button.dataset.sort;if(sortState.key===key)sortState.direction*=-1;else sortState={key,direction:1};render(vehicles)}))}
function waitForComponents(){if(byId("operationDate"))return Promise.resolve();return new Promise(resolve=>document.addEventListener("components:ready",resolve,{once:true}))}

async function init(){try{const[rows]=await Promise.all([loadPowerAppData(),waitForComponents()]);const vehicles=[...groupRows(rows).entries()].map(buildVehicle);populateCenters(vehicles);wireScope(vehicles);wireSorting(vehicles);byId("vehicleSearch").addEventListener("input",()=>render(vehicles));byId("locationFilter").addEventListener("change",()=>render(vehicles));render(vehicles);byId("operationDate").textContent=operationDate(rows)}catch(error){console.error(error);const alert=byId("vehiclesError");alert.hidden=false;alert.textContent="No se pudieron cargar los datos de vehículos desde RoadMap.";byId("vehicleTable").innerHTML='<tr><td colspan="7" class="vh-empty">Error al cargar los datos.</td></tr>'}}
document.addEventListener("DOMContentLoaded",init);
