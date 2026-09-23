import {loadPowerAppData} from "./core/data-service.js";
import {operationDate} from "./core/kpi-engine.js";

const byId=id=>document.getElementById(id);
const text=v=>String(v??"").trim();
const clean=v=>text(v).toUpperCase();
const number=new Intl.NumberFormat("es-PE",{maximumFractionDigits:1});
let groupMode="vehicle";
let sortState={key:"account",direction:1};
let allRows=[];
let currentClients=[];
let map=null;
let markerLayer=null;

const STATUS_COLORS={ENTREGADO:"#16a34a",RECHAZADO:"#dc2626",PENDIENTE:"#f59e0b","SIN INFORMACION":"#64748b"};
function numeric(v){if(typeof v==="number")return Number.isFinite(v)?v:0;const s=text(v).replace(/\s/g,"");if(!s)return 0;const n=Number(s.includes(",")&&s.includes(".")?s.replace(/,/g,""):s.replace(",","."));return Number.isFinite(n)?n:0}
function coordinate(v){const n=numeric(v);return Number.isFinite(n)&&n!==0?n:null}
function escapeHtml(v){return String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function clientState(rows){const states=rows.map(r=>clean(r.EstadoEntrega));if(states.includes("ENTREGADO"))return"ENTREGADO";if(states.length&&states.every(x=>x==="RECHAZADO"))return"RECHAZADO";if(states.includes("PENDIENTE"))return"PENDIENTE";return"SIN INFORMACION"}
function keyForSelection(row){return groupMode==="vehicle"?text(row.VehicleKey):text(row.RutaVenta)}
function selectionLabel(){return groupMode==="vehicle"?"placa":"ruta"}

function buildClients(rows){const groups=new Map();rows.forEach(row=>{const account=text(row.CustomerAccount);const key=account||text(row.ShipmentCustom);if(!key)return;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)});return[...groups.entries()].map(([key,group])=>{const r=group[0]??{};return{key,account:text(r.CustomerAccount)||"—",name:text(r.CustomerName)||"Sin nombre",location:text(r.Location)||"—",vehicle:text(r.VehicleKey)||"—",channel:text(r.Canal)||"—",route:text(r.RutaVenta)||"—",status:clientState(group),kg:group.reduce((s,x)=>s+numeric(x.KgPlanificados),0),latitude:group.map(x=>coordinate(x.Latitude)).find(x=>x!==null)??null,longitude:group.map(x=>coordinate(x.Longitude)).find(x=>x!==null)??null}})}
function badge(status){const cls=status==="ENTREGADO"?"delivered":status==="RECHAZADO"?"rejected":status==="PENDIENTE"?"pending":"unknown";return`<span class="cl-badge cl-badge--${cls}">${escapeHtml(status)}</span>`}
function sortValue(c,key){return key==="kg"?c.kg:String(c[key]??"").toLowerCase()}
function sorted(items){return[...items].sort((a,b)=>{const av=sortValue(a,sortState.key),bv=sortValue(b,sortState.key);return(typeof av==="number"?av-bv:av.localeCompare(bv,"es"))*sortState.direction})}
function updateHeads(){document.querySelectorAll(".cl-sort").forEach(b=>{const active=b.dataset.sort===sortState.key;b.classList.toggle("is-active",active);b.querySelector("span").textContent=active?(sortState.direction===1?"↑":"↓"):"↕"})}

function renderTable(){const q=clean(byId("clientSearch").value);const filtered=currentClients.filter(c=>!q||clean(`${c.account} ${c.name}`).includes(q));const items=sorted(filtered);byId("visibleCount").textContent=`${items.length} de ${currentClients.length} clientes`;if(!items.length){byId("clientTable").innerHTML='<tr><td colspan="8" class="cl-empty">No hay clientes para la búsqueda.</td></tr>';return}byId("clientTable").innerHTML=items.map(c=>`<tr><td class="cl-key">${escapeHtml(c.account)}</td><td class="cl-name" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</td><td>${escapeHtml(c.location)}</td><td>${escapeHtml(c.vehicle)}</td><td>${escapeHtml(c.channel)}</td><td>${escapeHtml(c.route)}</td><td>${badge(c.status)}</td><td>${number.format(c.kg)}</td></tr>`).join("");updateHeads()}

function ensureMap(){if(map||!window.L)return;byId("clientMap").innerHTML="";map=L.map("clientMap",{preferCanvas:true,zoomControl:true});L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);markerLayer=L.layerGroup().addTo(map)}
function renderMap(){ensureMap();if(!map){byId("clientMap").innerHTML='<div class="cl-map-empty"><span>⌖</span><strong>No se pudo cargar el mapa</strong><small>Revisa la conexión del navegador.</small></div>';return}markerLayer.clearLayers();const bounds=[];currentClients.forEach(c=>{if(c.latitude===null||c.longitude===null)return;const color=STATUS_COLORS[c.status]||STATUS_COLORS["SIN INFORMACION"];L.circleMarker([c.latitude,c.longitude],{radius:7,color:"#fff",weight:2,fillColor:color,fillOpacity:.95}).addTo(markerLayer);bounds.push([c.latitude,c.longitude])});if(bounds.length===1)map.setView(bounds[0],15);else if(bounds.length>1)map.fitBounds(bounds,{padding:[28,28],maxZoom:16});else{map.setView([-12.0464,-77.0428],10);byId("visibleCount").textContent+=` · sin coordenadas válidas`}setTimeout(()=>map.invalidateSize(),0)}

function loadSelection(){const selected=byId("groupSelector").value;if(!selected){currentClients=[];byId("clientSearch").disabled=true;byId("clientSearch").value="";byId("visibleCount").textContent=`Selecciona una ${selectionLabel()} para cargar clientes`;byId("clientTable").innerHTML=`<tr><td colspan="8" class="cl-empty">Selecciona una ${selectionLabel()} para mostrar clientes.</td></tr>`;if(map){map.remove();map=null;markerLayer=null}byId("clientMap").innerHTML=`<div class="cl-map-empty"><span>⌖</span><strong>Selecciona una placa o ruta</strong><small>El mapa cargará únicamente los clientes de la selección.</small></div>`;return}const rows=allRows.filter(r=>keyForSelection(r)===selected);currentClients=buildClients(rows);byId("clientSearch").disabled=false;renderMap();renderTable()}
function populateSelector(){const selector=byId("groupSelector");const label=selectionLabel();byId("groupLabel").textContent=`Selecciona una ${label}`;selector.innerHTML=`<option value="">Selecciona una ${label}</option>`;[...new Set(allRows.map(keyForSelection).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es")).forEach(value=>{const o=document.createElement("option");o.value=value;o.textContent=value;selector.appendChild(o)});loadSelection()}
function wire(){document.querySelectorAll(".cl-group-switch__button").forEach(button=>button.addEventListener("click",()=>{groupMode=button.dataset.group;document.querySelectorAll(".cl-group-switch__button").forEach(item=>{const active=item===button;item.classList.toggle("is-active",active);item.setAttribute("aria-pressed",String(active))});populateSelector()}));byId("groupSelector").addEventListener("change",loadSelection);byId("clientSearch").addEventListener("input",renderTable);document.querySelectorAll(".cl-sort").forEach(button=>button.addEventListener("click",()=>{const key=button.dataset.sort;if(sortState.key===key)sortState.direction*=-1;else sortState={key,direction:1};renderTable()}))}
function waitComponents(){if(byId("operationDate"))return Promise.resolve();return new Promise(resolve=>document.addEventListener("components:ready",resolve,{once:true}))}
async function init(){try{const[rows]=await Promise.all([loadPowerAppData(),waitComponents()]);allRows=rows;wire();populateSelector();byId("operationDate").textContent=operationDate(rows)}catch(error){console.error(error);byId("clientsError").hidden=false;byId("clientsError").textContent="No se pudieron cargar los datos de clientes desde RoadMap."}}
document.addEventListener("DOMContentLoaded",init);
