import {loadPowerAppData} from "./core/data-service.js";
import {operationDate} from "./core/kpi-engine.js";

const byId=id=>document.getElementById(id);
const text=v=>String(v??"").trim();
const clean=v=>text(v).toUpperCase();
const number=new Intl.NumberFormat("es-PE",{maximumFractionDigits:1});
const collator=new Intl.Collator("es",{sensitivity:"base",numeric:true});
const PAGE_SIZE=50;

let sortState={key:"account",direction:1};
let migrationState="ALL"; // ALL | MIGRADO | NO MIGRADO
let allRows=[];
let allClients=[];
let currentClients=[];
let visibleClients=[];
let renderedCount=PAGE_SIZE;
let map=null;
let markerLayer=null;
let selectedClientKey=null;
let hoveredClientKey=null;
const markersByClient=new Map();

const STATUS_COLORS={ENTREGADO:"#16a34a",RECHAZADO:"#dc2626",PENDIENTE:"#f59e0b","SIN INFORMACION":"#64748b"};

function numeric(v){if(typeof v==="number")return Number.isFinite(v)?v:0;const s=text(v).replace(/\s/g,"");if(!s)return 0;const n=Number(s.includes(",")&&s.includes(".")?s.replace(/,/g,""):s.replace(",","."));return Number.isFinite(n)?n:0;}
function coordinate(v){const n=numeric(v);return Number.isFinite(n)&&n!==0?n:null;}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function firstValue(rows,field,fallback="—"){return rows.map(row=>text(row[field])).find(Boolean)||fallback;}
function clientState(rows){const states=rows.map(r=>clean(r.EstadoEntrega));if(states.includes("ENTREGADO"))return "ENTREGADO";if(states.length&&states.every(x=>x==="RECHAZADO"))return "RECHAZADO";if(states.includes("PENDIENTE"))return "PENDIENTE";return "SIN INFORMACION";}
function clientMigration(rows){const states=rows.map(r=>clean(r.EstadoMigracion));if(states.includes("MIGRADO"))return "MIGRADO";return "NO MIGRADO";}

function buildClients(rows){
  const groups=new Map();
  rows.forEach(row=>{
    const account=text(row.CustomerAccount);
    const key=account||text(row.ShipmentCustom);
    if(!key)return;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(row);
  });
  return [...groups.entries()].map(([key,group])=>{
    const r=group[0]??{};
    return {
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
      migration:clientMigration(group),
      kg:group.reduce((sum,item)=>sum+numeric(item.KgPlanificados),0),
      latitude:group.map(item=>coordinate(item.Latitude)).find(value=>value!==null)??null,
      longitude:group.map(item=>coordinate(item.Longitude)).find(value=>value!==null)??null
    };
  });
}

function badge(status){const cls=status==="ENTREGADO"?"delivered":status==="RECHAZADO"?"rejected":status==="PENDIENTE"?"pending":"unknown";return `<span class="cl-badge cl-badge--${cls}">${escapeHtml(status)}</span>`;}
function sortValue(client,key){if(key==="kg")return client.kg;if(key==="location")return `${client.location} ${client.vehicle}`.toLowerCase();if(key==="vehicle")return `${client.channel} ${client.route}`.toLowerCase();return String(client[key]??"").toLowerCase();}
function sorted(items){return [...items].sort((a,b)=>{const av=sortValue(a,sortState.key),bv=sortValue(b,sortState.key);return (typeof av==="number"?av-bv:collator.compare(av,bv))*sortState.direction;});}
function updateHeads(){document.querySelectorAll(".cl-sort").forEach(button=>{const active=button.dataset.sort===sortState.key;button.classList.toggle("is-active",active);button.querySelector("span").textContent=active?(sortState.direction===1?"↑":"↓"):"↕";button.setAttribute("aria-sort",active?(sortState.direction===1?"ascending":"descending"):"none");});}
function rowForClient(key){return [...document.querySelectorAll("#clientTable tr[data-client-key]")].find(row=>decodeURIComponent(row.dataset.clientKey)===key)??null;}
function clientForKey(key){return visibleClients.find(client=>client.key===key)??null;}
function markerOptions(client,state="normal"){const fillColor=STATUS_COLORS[client.status]||STATUS_COLORS["SIN INFORMACION"];if(state==="selected")return {radius:11,color:"#2563eb",weight:4,fillColor,fillOpacity:1};if(state==="hovered")return {radius:9,color:"#2563eb",weight:3,fillColor,fillOpacity:1};return {radius:7,color:"#fff",weight:2,fillColor,fillOpacity:.95};}
function syncVisualState(){document.querySelectorAll("#clientTable tr[data-client-key]").forEach(row=>{const key=decodeURIComponent(row.dataset.clientKey),selected=key===selectedClientKey,hovered=key===hoveredClientKey&&!selected;row.classList.toggle("is-selected",selected);row.classList.toggle("is-hovered",hovered);row.setAttribute("aria-selected",String(selected));});markersByClient.forEach((marker,key)=>{const client=clientForKey(key);if(!client)return;const state=key===selectedClientKey?"selected":key===hoveredClientKey?"hovered":"normal";marker.setStyle(markerOptions(client,state));if(state!=="normal")marker.bringToFront();});}
function scrollRowIntoView(key){const row=rowForClient(key);if(!row)return;requestAnimationFrame(()=>row.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"center",inline:"nearest"}));}
function popupContent(client){return `<div class="cl-popup"><span class="cl-popup__label">Código de cliente</span><strong class="cl-popup__account">${escapeHtml(client.account)}</strong><span class="cl-popup__label">Cliente</span><span class="cl-popup__name">${escapeHtml(client.name)}</span><span class="cl-popup__label">Operación</span><span class="cl-popup__meta">${escapeHtml(client.vehicle)} · ${escapeHtml(client.route)}</span>${badge(client.status)}</div>`;}
function selectClient(key,{source="table",openPopup=true}={}){const client=clientForKey(key);if(!client)return;selectedClientKey=key;const index=sorted(visibleClients).findIndex(item=>item.key===key);if(index>=renderedCount){renderedCount=Math.ceil((index+1)/PAGE_SIZE)*PAGE_SIZE;renderTable();}syncVisualState();const marker=markersByClient.get(key);if(marker&&map){const reveal=()=>{if(openPopup)marker.openPopup();};if(source==="table"){map.flyTo(marker.getLatLng(),Math.max(map.getZoom(),16),{duration:.45});if(typeof markerLayer?.zoomToShowLayer==="function")markerLayer.zoomToShowLayer(marker,reveal);else reveal();}else reveal();}if(source==="marker")scrollRowIntoView(key);}
function hoverClient(key){hoveredClientKey=key;syncVisualState();}
function clearHover(key){if(key&&hoveredClientKey!==key)return;hoveredClientKey=null;syncVisualState();}
function renderTable(){const ordered=sorted(visibleClients),rendered=ordered.slice(0,renderedCount);byId("visibleCount").textContent=`${visibleClients.length} clientes filtrados de ${allClients.length}`;byId("renderCount").textContent=`${rendered.length} de ${visibleClients.length} registros visibles`;byId("loadMoreButton").hidden=rendered.length>=visibleClients.length;byId("csvButton").disabled=!visibleClients.length;if(!rendered.length){byId("clientTable").innerHTML='<tr><td colspan="6" class="cl-empty">No hay clientes para la búsqueda y filtros aplicados.</td></tr>';updateHeads();return;}byId("clientTable").innerHTML=rendered.map(client=>`<tr data-client-key="${encodeURIComponent(client.key)}" tabindex="0" aria-selected="false" title="Seleccionar cliente en el mapa"><td><div class="cl-cell-stack"><strong>${escapeHtml(client.account)}</strong><small title="${escapeHtml(client.name)}">${escapeHtml(client.name)}</small></div></td><td><div class="cl-cell-stack"><span>${escapeHtml(client.location)}</span><small>${escapeHtml(client.vehicle)}</small></div></td><td><div class="cl-cell-stack"><span>${escapeHtml(client.channel)}</span><small>${escapeHtml(client.route)}</small></div></td><td><div class="cl-cell-stack"><span title="${escapeHtml(client.driverName)}">${escapeHtml(client.driverName)}</span><small>${escapeHtml(client.driverBadge)}</small></div></td><td>${badge(client.status)}</td><td class="cl-number">${number.format(client.kg)}</td></tr>`).join("");updateHeads();syncVisualState();}
function removeMap(){if(map)map.remove();map=null;markerLayer=null;markersByClient.clear();}
function showMapEmpty(title,detail){removeMap();byId("clientMap").innerHTML=`<div class="cl-map-empty"><span>⌖</span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div>`;}
function ensureMap(){if(map||!window.L)return;byId("clientMap").innerHTML="";map=L.map("clientMap",{preferCanvas:true,zoomControl:true});L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);markerLayer=typeof L.markerClusterGroup==="function"?L.markerClusterGroup({chunkedLoading:true,chunkInterval:100,chunkDelay:20,showCoverageOnHover:false,maxClusterRadius:55}):L.layerGroup();markerLayer.addTo(map);}
function renderMap(){if(!visibleClients.length){showMapEmpty("Sin clientes para mostrar","Ajusta la búsqueda o los filtros.");byId("coordinateCount").textContent="";return;}ensureMap();if(!map){showMapEmpty("No se pudo cargar el mapa","Revisa la conexión del navegador.");return;}markerLayer.clearLayers();markersByClient.clear();const bounds=[];visibleClients.forEach(client=>{if(client.latitude===null||client.longitude===null)return;const marker=L.circleMarker([client.latitude,client.longitude],markerOptions(client)).bindPopup(popupContent(client),{maxWidth:280,closeButton:true}).on("click",()=>selectClient(client.key,{source:"marker",openPopup:true})).on("mouseover",()=>hoverClient(client.key)).on("mouseout",()=>clearHover(client.key));markerLayer.addLayer(marker);markersByClient.set(client.key,marker);bounds.push([client.latitude,client.longitude]);});byId("coordinateCount").textContent=bounds.length===visibleClients.length?`${bounds.length} con coordenadas`:`${bounds.length} con coordenadas · ${visibleClients.length-bounds.length} sin coordenadas`;if(bounds.length===1)map.setView(bounds[0],15);else if(bounds.length>1)map.fitBounds(bounds,{padding:[28,28],maxZoom:16});else map.setView([-12.0464,-77.0428],10);syncVisualState();setTimeout(()=>map.invalidateSize(),0);}
function resetInteraction(){selectedClientKey=null;hoveredClientKey=null;if(map)map.closePopup();}

function exactSearch(){
  const mode=byId("searchMode").value;
  let value="";
  if(mode==="vehicle"||mode==="route")value=byId("quickSearchSelect").value;
  else if(mode==="client")value=byId("quickSearch").value;
  const q=clean(value);
  if(mode==="all")return allClients;
  if(!q)return [];
  const field=mode==="vehicle"?"vehicle":mode==="route"?"route":"account";
  return allClients.filter(client=>clean(client[field])===q);
}

function applyView(){
  const channel=clean(byId("channelFilter").value),
        status=clean(byId("statusFilter").value);

  currentClients=exactSearch();
  visibleClients=currentClients.filter(client=>{
    const matchChannel=!channel||clean(client.channel)===channel;
    const matchStatus=!status||clean(client.status)===status;
    const matchMigration=migrationState==="ALL"||client.migration===migrationState;
    return matchChannel&&matchStatus&&matchMigration;
  });

  const keys=new Set(visibleClients.map(client=>client.key));
  if(selectedClientKey&&!keys.has(selectedClientKey))selectedClientKey=null;
  if(hoveredClientKey&&!keys.has(hoveredClientKey))hoveredClientKey=null;
  renderedCount=PAGE_SIZE;
  updateFilterCount();
  renderTable();
  renderMap();
}

function updateFilterCount(){
  const count=Number(Boolean(byId("channelFilter").value))+Number(Boolean(byId("statusFilter").value));
  byId("filterCount").textContent=String(count);
  byId("filterCount").hidden=!count;
}

function populateQuickSelect(mode){
  const selector=byId("quickSearchSelect");
  const field=mode==="vehicle"?"vehicle":"route";
  const label=mode==="vehicle"?"Selecciona una placa":"Selecciona una ruta";
  const values=[...new Set(allClients.map(client=>text(client[field])).filter(value=>value&&value!=="—"))].sort(collator.compare);
  selector.innerHTML="";
  selector.add(new Option(label,""));
  values.forEach(value=>selector.add(new Option(value,value)));
  selector.value="";
}

function updateSearchControl(){
  const mode=byId("searchMode").value,
        input=byId("quickSearch"),
        selector=byId("quickSearchSelect"),
        button=byId("searchButton");
  
  const usesSelect=mode==="vehicle"||mode==="route";
  const isAll=mode==="all";

  selector.hidden=!usesSelect;
  selector.disabled=!usesSelect;

  input.hidden=usesSelect;
  input.disabled=isAll;
  input.value="";

  if(usesSelect){
    populateQuickSelect(mode);
  }else{
    selector.innerHTML='<option value="">Selecciona una opción</option>';
    selector.value="";
  }

  input.placeholder=isAll?"Todos los clientes (sin filtro)":mode==="client"?"Ej. 6244872":"Vista general";
  button.disabled=isAll||(usesSelect?!selector.value:!input.value.trim());

  if(isAll){
    applyView();
  }else if(mode==="client"){
    input.focus();
  }else if(usesSelect){
    selector.focus();
  }
}

function clearAll(){
  byId("searchMode").value="all";
  byId("quickSearch").value="";
  byId("quickSearchSelect").value="";
  byId("channelFilter").value="";
  byId("statusFilter").value="";
  byId("filtersPanel").open=false;

  // Restaurar opción por defecto 'Planificados' (ALL)
  migrationState="ALL";
  document.querySelectorAll(".cl-segmented__btn").forEach(btn=>{
    btn.classList.toggle("is-active",btn.dataset.migration==="ALL");
  });

  resetInteraction();
  updateSearchControl();
}

function populateChannelFilter(){
  const selector=byId("channelFilter");
  selector.innerHTML='<option value="">Todos los canales</option>';
  [...new Set(allClients.map(c=>c.channel).filter(v=>v&&v!=="—"))].sort(collator.compare).forEach(value=>selector.add(new Option(value,value)));
}

function csvCell(v){
  const value=String(v??"");
  return /[";\n\r]/.test(value)?`"${value.replace(/"/g,'""')}"`:value;
}

function downloadCsv(){
  if(!visibleClients.length)return;
  const header=["Cuenta","Cliente","Location","Placa","Canal","Ruta","DriverName","DriverBadge","Estado","Migracion","Kg"];
  const rows=sorted(visibleClients).map(c=>[c.account,c.name,c.location,c.vehicle,c.channel,c.route,c.driverName,c.driverBadge,c.status,c.migration,String(c.kg).replace(".",",")]);
  const csv="\uFEFF"+[header,...rows].map(row=>row.map(csvCell).join(";")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");
  a.href=url;
  a.download=`clientes-greenmile-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),0);
}

function wireTableInteraction(){
  const table=byId("clientTable");
  table.addEventListener("click",event=>{
    const row=event.target.closest("tr[data-client-key]");
    if(row)selectClient(decodeURIComponent(row.dataset.clientKey),{source:"table"});
  });
  table.addEventListener("keydown",event=>{
    const row=event.target.closest("tr[data-client-key]");
    if(!row||!(event.key==="Enter"||event.key===" "))return;
    event.preventDefault();
    selectClient(decodeURIComponent(row.dataset.clientKey),{source:"table"});
  });
  table.addEventListener("mouseover",event=>{
    const row=event.target.closest("tr[data-client-key]");
    if(row&&!row.contains(event.relatedTarget))hoverClient(decodeURIComponent(row.dataset.clientKey));
  });
  table.addEventListener("mouseout",event=>{
    const row=event.target.closest("tr[data-client-key]");
    if(row&&!row.contains(event.relatedTarget))clearHover(decodeURIComponent(row.dataset.clientKey));
  });
}

function wire(){
  byId("searchMode").addEventListener("change",updateSearchControl);
  byId("searchButton").addEventListener("click",applyView);
  byId("quickSearch").addEventListener("input",event=>{byId("searchButton").disabled=!event.target.value.trim();});
  byId("quickSearch").addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();applyView();}});
  byId("quickSearchSelect").addEventListener("change",event=>{byId("searchButton").disabled=!event.target.value;});
  byId("channelFilter").addEventListener("change",applyView);
  byId("statusFilter").addEventListener("change",applyView);
  byId("clearButton").addEventListener("click",clearAll);
  byId("csvButton").addEventListener("click",downloadCsv);
  byId("loadMoreButton").addEventListener("click",()=>{renderedCount+=PAGE_SIZE;renderTable();});

  // Switch de opciones de migración
  document.querySelectorAll(".cl-segmented__btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      document.querySelectorAll(".cl-segmented__btn").forEach(b=>b.classList.remove("is-active"));
      btn.classList.add("is-active");
      migrationState=btn.dataset.migration;
      applyView();
    });
  });

  document.querySelectorAll(".cl-sort").forEach(button=>button.addEventListener("click",()=>{
    const key=button.dataset.sort;
    if(sortState.key===key)sortState.direction*=-1;
    else sortState={key,direction:1};
    renderTable();
  }));

  wireTableInteraction();
}

function waitComponents(){
  if(byId("operationDate"))return Promise.resolve();
  return new Promise(resolve=>document.addEventListener("components:ready",resolve,{once:true}));
}

async function init(){
  try{
    const [rows]=await Promise.all([loadPowerAppData(),waitComponents()]);
    allRows=Array.isArray(rows)?rows:[];
    allClients=buildClients(allRows);
    populateChannelFilter();
    wire();
    updateSearchControl();
    const dateNode=byId("operationDate");
    if(dateNode)dateNode.textContent=operationDate(allRows);
  }catch(error){
    console.error(error);
    byId("clientsError").hidden=false;
    byId("clientsError").textContent="No se pudieron cargar los datos de clientes desde RoadMap.";
    showMapEmpty("Datos no disponibles","Revisa la fuente y vuelve a intentarlo.");
  }
}

document.addEventListener("DOMContentLoaded",init);
