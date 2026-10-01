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
let visibleClients=[];
let map=null;
let markerLayer=null;
let selectedClientKey=null;
let hoveredClientKey=null;
const markersByClient=new Map();

const STATUS_COLORS={
  ENTREGADO:"#16a34a",
  RECHAZADO:"#dc2626",
  PENDIENTE:"#f59e0b",
  "SIN INFORMACION":"#64748b"
};

function numeric(v){
  if(typeof v==="number")return Number.isFinite(v)?v:0;
  const s=text(v).replace(/\s/g,"");
  if(!s)return 0;
  const n=Number(s.includes(",")&&s.includes(".")?s.replace(/,/g,""):s.replace(",","."));
  return Number.isFinite(n)?n:0;
}

function coordinate(v){
  const n=numeric(v);
  return Number.isFinite(n)&&n!==0?n:null;
}

function escapeHtml(v){
  return String(v??"").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function firstValue(rows,field,fallback="—"){
  return rows.map(row=>text(row[field])).find(Boolean)||fallback;
}

function clientState(rows){
  const states=rows.map(r=>clean(r.EstadoEntrega));
  if(states.includes("ENTREGADO"))return"ENTREGADO";
  if(states.length&&states.every(x=>x==="RECHAZADO"))return"RECHAZADO";
  if(states.includes("PENDIENTE"))return"PENDIENTE";
  return"SIN INFORMACION";
}

function keyForSelection(row){
  if(groupMode==="vehicle")return text(row.VehicleKey);
  if(groupMode==="route")return text(row.RutaVenta);
  return text(row.CustomerAccount);
}

function selectionLabel(){
  return groupMode==="vehicle"?"placa":"ruta";
}

function buildClients(rows){
  const groups=new Map();
  rows.forEach(row=>{
    const account=text(row.CustomerAccount);
    const key=account||text(row.ShipmentCustom);
    if(!key)return;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(row);
  });

  return[...groups.entries()].map(([key,group])=>{
    const r=group[0]??{};
    return{
      key,
      account:text(r.CustomerAccount)||"—",
      name:text(r.CustomerName)||"Sin nombre",
      location:text(r.Location)||"—",
      vehicle:text(r.VehicleKey)||"—",
      channel:text(r.Canal)||"—",
      route:text(r.RutaVenta)||"—",
      driverName:firstValue(group,"DriverName"),
      driverBadge:firstValue(group,"DriverBadge"),
      status:clientState(group),
      kg:group.reduce((sum,item)=>sum+numeric(item.KgPlanificados),0),
      latitude:group.map(item=>coordinate(item.Latitude)).find(value=>value!==null)??null,
      longitude:group.map(item=>coordinate(item.Longitude)).find(value=>value!==null)??null
    };
  });
}

function badge(status){
  const cls=status==="ENTREGADO"?"delivered":status==="RECHAZADO"?"rejected":status==="PENDIENTE"?"pending":"unknown";
  return`<span class="cl-badge cl-badge--${cls}">${escapeHtml(status)}</span>`;
}

function sortValue(client,key){
  return key==="kg"?client.kg:String(client[key]??"").toLowerCase();
}

function sorted(items){
  return[...items].sort((a,b)=>{
    const av=sortValue(a,sortState.key);
    const bv=sortValue(b,sortState.key);
    return(typeof av==="number"?av-bv:av.localeCompare(bv,"es"))*sortState.direction;
  });
}

function updateHeads(){
  document.querySelectorAll(".cl-sort").forEach(button=>{
    const active=button.dataset.sort===sortState.key;
    button.classList.toggle("is-active",active);
    button.querySelector("span").textContent=active?(sortState.direction===1?"↑":"↓"):"↕";
  });
}

function rowForClient(key){
  return[...document.querySelectorAll("#clientTable tr[data-client-key]")]
    .find(row=>row.dataset.clientKey===key)??null;
}

function clientForKey(key){
  return visibleClients.find(client=>client.key===key)??null;
}

function markerOptions(client,state="normal"){
  const fillColor=STATUS_COLORS[client.status]||STATUS_COLORS["SIN INFORMACION"];
  if(state==="selected")return{radius:11,color:"#2563eb",weight:4,fillColor,fillOpacity:1};
  if(state==="hovered")return{radius:9,color:"#2563eb",weight:3,fillColor,fillOpacity:1};
  return{radius:7,color:"#fff",weight:2,fillColor,fillOpacity:.95};
}

function syncVisualState(){
  document.querySelectorAll("#clientTable tr[data-client-key]").forEach(row=>{
    const selected=row.dataset.clientKey===selectedClientKey;
    const hovered=row.dataset.clientKey===hoveredClientKey&&!selected;
    row.classList.toggle("is-selected",selected);
    row.classList.toggle("is-hovered",hovered);
    row.setAttribute("aria-selected",String(selected));
  });

  markersByClient.forEach((marker,key)=>{
    const client=clientForKey(key);
    if(!client)return;
    const state=key===selectedClientKey?"selected":key===hoveredClientKey?"hovered":"normal";
    marker.setStyle(markerOptions(client,state));
    if(state!=="normal")marker.bringToFront();
  });
}

function scrollRowIntoView(key){
  const row=rowForClient(key);
  if(!row)return;
  requestAnimationFrame(()=>row.scrollIntoView({behavior:"smooth",block:"center",inline:"nearest"}));
}

function popupContent(client){
  return`<div class="cl-popup">
    <span class="cl-popup__label">Código de cliente</span>
    <strong class="cl-popup__account">${escapeHtml(client.account)}</strong>
    <span class="cl-popup__label">Cliente</span>
    <span class="cl-popup__name">${escapeHtml(client.name)}</span>
  </div>`;
}

function selectClient(key,{source="table",openPopup=true}={}){
  const client=clientForKey(key);
  if(!client)return;
  selectedClientKey=key;
  syncVisualState();

  const marker=markersByClient.get(key);
  if(marker){
    if(source==="table"){
      const targetZoom=Math.max(map.getZoom(),16);
      map.flyTo(marker.getLatLng(),targetZoom,{duration:.45});
    }
    if(openPopup)marker.openPopup();
  }
  if(source==="marker")scrollRowIntoView(key);
}

function hoverClient(key){
  hoveredClientKey=key;
  syncVisualState();
}

function clearHover(key){
  if(key&&hoveredClientKey!==key)return;
  hoveredClientKey=null;
  syncVisualState();
}

function renderTable(items=visibleClients){
  const ordered=sorted(items);
  byId("visibleCount").textContent=`${ordered.length} de ${currentClients.length} clientes`;

  if(!ordered.length){
    const message=groupMode==="client"&&!clean(byId("clientSearch").value)
      ?"Escribe un código de cliente para iniciar la búsqueda."
      :"No hay clientes para la selección y filtros aplicados.";
    byId("clientTable").innerHTML=`<tr><td colspan="10" class="cl-empty">${message}</td></tr>`;
    updateHeads();
    syncVisualState();
    return;
  }

  byId("clientTable").innerHTML=ordered.map(client=>`<tr data-client-key="${escapeHtml(client.key)}" tabindex="0" aria-selected="false" title="Seleccionar cliente en el mapa">
    <td class="cl-key">${escapeHtml(client.account)}</td>
    <td class="cl-name" title="${escapeHtml(client.name)}">${escapeHtml(client.name)}</td>
    <td>${escapeHtml(client.location)}</td>
    <td>${escapeHtml(client.vehicle)}</td>
    <td>${escapeHtml(client.channel)}</td>
    <td>${escapeHtml(client.route)}</td>
    <td class="cl-name" title="${escapeHtml(client.driverName)}">${escapeHtml(client.driverName)}</td>
    <td class="cl-contact">${escapeHtml(client.driverBadge)}</td>
    <td>${badge(client.status)}</td>
    <td>${number.format(client.kg)}</td>
  </tr>`).join("");

  updateHeads();
  syncVisualState();
}

function removeMap(){
  if(map)map.remove();
  map=null;
  markerLayer=null;
  markersByClient.clear();
}

function showMapEmpty(title,detail){
  removeMap();
  byId("clientMap").innerHTML=`<div class="cl-map-empty"><span>⌖</span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div>`;
}

function ensureMap(){
  if(map||!window.L)return;
  byId("clientMap").innerHTML="";
  map=L.map("clientMap",{preferCanvas:true,zoomControl:true});
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
    maxZoom:19,
    attribution:"© OpenStreetMap"
  }).addTo(map);
  markerLayer=L.layerGroup().addTo(map);
}

function renderMap(items=visibleClients){
  if(!items.length){
    const title=groupMode==="client"&&!clean(byId("clientSearch").value)
      ?"Busca un código de cliente"
      :"Sin clientes para mostrar";
    const detail=groupMode==="client"&&!clean(byId("clientSearch").value)
      ?"Introduce el código de cliente para cargar el mapa."
      :"Ajusta la selección o los filtros.";
    showMapEmpty(title,detail);
    return;
  }

  ensureMap();
  if(!map){
    byId("clientMap").innerHTML='<div class="cl-map-empty"><span>⌖</span><strong>No se pudo cargar el mapa</strong><small>Revisa la conexión del navegador.</small></div>';
    return;
  }

  markerLayer.clearLayers();
  markersByClient.clear();
  const bounds=[];

  items.forEach(client=>{
    if(client.latitude===null||client.longitude===null)return;
    const marker=L.circleMarker([client.latitude,client.longitude],markerOptions(client))
      .bindPopup(popupContent(client),{maxWidth:280,closeButton:true})
      .on("click",()=>selectClient(client.key,{source:"marker",openPopup:true}))
      .on("mouseover",()=>hoverClient(client.key))
      .on("mouseout",()=>clearHover(client.key))
      .addTo(markerLayer);
    markersByClient.set(client.key,marker);
    bounds.push([client.latitude,client.longitude]);
  });

  if(bounds.length===1)map.setView(bounds[0],15);
  else if(bounds.length>1)map.fitBounds(bounds,{padding:[28,28],maxZoom:16});
  else{
    map.setView([-12.0464,-77.0428],10);
    byId("visibleCount").textContent+=` · sin coordenadas válidas`;
  }

  syncVisualState();
  setTimeout(()=>map.invalidateSize(),0);
}

function resetInteraction(){
  selectedClientKey=null;
  hoveredClientKey=null;
  markersByClient.clear();
  if(map)map.closePopup();
}

function filteredClients(){
  const q=clean(byId("clientSearch").value);
  const channel=clean(byId("channelFilter").value);
  const status=clean(byId("statusFilter").value);

  if(groupMode==="client"&&!q)return[];

  return currentClients.filter(client=>{
    const matchesQuery=!q||(groupMode==="client"
      ?clean(client.account).includes(q)
      :clean(`${client.account} ${client.name}`).includes(q));
    const matchesChannel=!channel||clean(client.channel)===channel;
    const matchesStatus=!status||clean(client.status)===status;
    return matchesQuery&&matchesChannel&&matchesStatus;
  });
}

function applyView(){
  visibleClients=filteredClients();
  const visibleKeys=new Set(visibleClients.map(client=>client.key));
  if(selectedClientKey&&!visibleKeys.has(selectedClientKey))selectedClientKey=null;
  if(hoveredClientKey&&!visibleKeys.has(hoveredClientKey))hoveredClientKey=null;
  renderTable(visibleClients);
  renderMap(visibleClients);
}

function setControlsEnabled(enabled){
  byId("clientSearch").disabled=!enabled;
  byId("channelFilter").disabled=!enabled;
  byId("statusFilter").disabled=!enabled;
}

function clearFilters(){
  byId("clientSearch").value="";
  byId("channelFilter").value="";
  byId("statusFilter").value="";
}

function loadSelection(){
  resetInteraction();
  const selected=byId("groupSelector").value;

  if(groupMode==="client"){
    currentClients=buildClients(allRows);
    setControlsEnabled(true);
    byId("clientSearch").placeholder="Buscar por código de cliente…";
    applyView();
    return;
  }

  if(!selected){
    currentClients=[];
    visibleClients=[];
    setControlsEnabled(false);
    clearFilters();
    byId("clientSearch").placeholder="Buscar cuenta o cliente…";
    byId("visibleCount").textContent=`Selecciona una ${selectionLabel()} para cargar clientes`;
    byId("clientTable").innerHTML=`<tr><td colspan="10" class="cl-empty">Selecciona una ${selectionLabel()} para mostrar clientes.</td></tr>`;
    showMapEmpty("Selecciona una placa o ruta","El mapa cargará únicamente los clientes de la selección.");
    return;
  }

  currentClients=buildClients(allRows.filter(row=>keyForSelection(row)===selected));
  setControlsEnabled(true);
  byId("clientSearch").placeholder="Buscar cuenta o cliente…";
  applyView();
}

function populateChannelFilter(){
  const selector=byId("channelFilter");
  selector.innerHTML='<option value="">Todos los canales</option>';
  [...new Set(allRows.map(row=>text(row.Canal)).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,"es"))
    .forEach(value=>{
      const option=document.createElement("option");
      option.value=value;
      option.textContent=value;
      selector.appendChild(option);
    });
}

function populateSelector(){
  const selector=byId("groupSelector");
  const wrapper=byId("groupSelectorWrap");
  clearFilters();

  if(groupMode==="client"){
    wrapper.hidden=true;
    selector.disabled=true;
    loadSelection();
    byId("clientSearch").focus();
    return;
  }

  wrapper.hidden=false;
  selector.disabled=false;
  const label=selectionLabel();
  byId("groupLabel").textContent=`Selecciona una ${label}`;
  selector.innerHTML=`<option value="">Selecciona una ${label}</option>`;

  [...new Set(allRows.map(keyForSelection).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,"es"))
    .forEach(value=>{
      const option=document.createElement("option");
      option.value=value;
      option.textContent=value;
      selector.appendChild(option);
    });

  loadSelection();
}

function wireTableInteraction(){
  const table=byId("clientTable");

  table.addEventListener("click",event=>{
    const row=event.target.closest("tr[data-client-key]");
    if(row)selectClient(row.dataset.clientKey,{source:"table",openPopup:true});
  });

  table.addEventListener("keydown",event=>{
    const row=event.target.closest("tr[data-client-key]");
    if(!row||!(event.key==="Enter"||event.key===" "))return;
    event.preventDefault();
    selectClient(row.dataset.clientKey,{source:"table",openPopup:true});
  });

  table.addEventListener("mouseover",event=>{
    const row=event.target.closest("tr[data-client-key]");
    if(row&&!row.contains(event.relatedTarget))hoverClient(row.dataset.clientKey);
  });

  table.addEventListener("mouseout",event=>{
    const row=event.target.closest("tr[data-client-key]");
    if(row&&!row.contains(event.relatedTarget))clearHover(row.dataset.clientKey);
  });
}

function wire(){
  document.querySelectorAll(".cl-group-switch__button").forEach(button=>button.addEventListener("click",()=>{
    groupMode=button.dataset.group;
    document.querySelectorAll(".cl-group-switch__button").forEach(item=>{
      const active=item===button;
      item.classList.toggle("is-active",active);
      item.setAttribute("aria-pressed",String(active));
    });
    populateSelector();
  }));

  byId("groupSelector").addEventListener("change",loadSelection);
  byId("clientSearch").addEventListener("input",applyView);
  byId("channelFilter").addEventListener("change",applyView);
  byId("statusFilter").addEventListener("change",applyView);

  document.querySelectorAll(".cl-sort").forEach(button=>button.addEventListener("click",()=>{
    const key=button.dataset.sort;
    if(sortState.key===key)sortState.direction*=-1;
    else sortState={key,direction:1};
    renderTable(visibleClients);
  }));

  wireTableInteraction();
}

function waitComponents(){
  if(byId("operationDate"))return Promise.resolve();
  return new Promise(resolve=>document.addEventListener("components:ready",resolve,{once:true}));
}

async function init(){
  try{
    const[rows]=await Promise.all([loadPowerAppData(),waitComponents()]);
    allRows=rows;
    populateChannelFilter();
    wire();
    populateSelector();
    byId("operationDate").textContent=operationDate(rows);
  }catch(error){
    console.error(error);
    byId("clientsError").hidden=false;
    byId("clientsError").textContent="No se pudieron cargar los datos de clientes desde RoadMap.";
  }
}

document.addEventListener("DOMContentLoaded",init);
