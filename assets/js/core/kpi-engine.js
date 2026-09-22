const clean=value=>String(value??"").trim().toUpperCase();
const text=value=>String(value??"").trim();
const percent=(numerator,denominator)=>denominator>0?numerator/denominator*100:0;

function numeric(value){
  if(typeof value==="number")return Number.isFinite(value)?value:0;
  const raw=String(value??"").trim().replace(/\s/g,"");
  if(!raw)return 0;
  const normalized=raw.includes(",")&&raw.includes(".")?raw.replace(/,/g,""):raw.replace(",",".");
  const result=Number(normalized);
  return Number.isFinite(result)?result:0;
}

function unique(rows,selector){
  const values=new Set();
  rows.forEach(row=>{const value=selector(row);if(value)values.add(value)});
  return values;
}

const migrated=rows=>rows.filter(row=>clean(row.EstadoMigracion)==="MIGRADO");

function customerGroups(rows){
  const groups=new Map();
  migrated(rows).forEach(row=>{
    const customer=text(row.CustomerAccount||row.ShipmentCustom);
    if(!customer)return;
    if(!groups.has(customer))groups.set(customer,[]);
    groups.get(customer).push(row);
  });
  return groups;
}

function customerState(rows){
  const states=rows.map(row=>clean(row.EstadoEntrega));
  if(states.includes("ENTREGADO"))return"ENTREGADO";
  if(states.length&&states.every(state=>state==="RECHAZADO"))return"RECHAZADO";
  return"PENDIENTE";
}

export function calculateKpis(rows){
  const vehicles=unique(rows,row=>text(row.VehicleKey));
  const migratedVehicles=unique(migrated(rows),row=>text(row.VehicleKey));
  const connectedVehicles=unique(migrated(rows).filter(row=>clean(row.EstadoConexion)==="CONECTADO"),row=>text(row.VehicleKey));
  const customers=customerGroups(rows);
  let visited=0,rejected=0;
  customers.forEach(group=>{const state=customerState(group);if(state==="ENTREGADO"||state==="RECHAZADO")visited++;if(state==="RECHAZADO")rejected++});
  const migratedData=migrated(rows);
  const migratedKg=migratedData.reduce((sum,row)=>sum+numeric(row.KgPlanificados),0);
  const rejectedKg=migratedData.filter(row=>clean(row.EstadoEntrega)==="RECHAZADO").reduce((sum,row)=>sum+numeric(row.KgPlanificados),0);
  return{
    migration:{value:percent(migratedVehicles.size,vehicles.size),numerator:migratedVehicles.size,denominator:vehicles.size,unit:"vehículos"},
    connection:{value:percent(connectedVehicles.size,migratedVehicles.size),numerator:connectedVehicles.size,denominator:migratedVehicles.size,unit:"vehículos"},
    progress:{value:percent(visited,customers.size),numerator:visited,denominator:customers.size,unit:"clientes"},
    dbeClient:{value:percent(rejected,customers.size),numerator:rejected,denominator:customers.size,unit:"clientes"},
    dbeKg:{value:percent(rejectedKg,migratedKg),numerator:rejectedKg,denominator:migratedKg,unit:"kg"}
  };
}

const metricValue=(rows,key)=>calculateKpis(rows)[key];

export function breakdownByLocationAndChannel(rows,metricKey){
  const locations=new Map();
  rows.forEach(row=>{
    const location=text(row.Location)||"Sin Location";
    if(!locations.has(location))locations.set(location,[]);
    locations.get(location).push(row);
  });

  return[...locations.entries()].map(([location,locationRows])=>{
    const channels=new Map();
    locationRows.forEach(row=>{
      const channel=text(row.Canal)||"Sin Canal";
      if(!channels.has(channel))channels.set(channel,[]);
      channels.get(channel).push(row);
    });
    return{
      name:location,
      metric:metricValue(locationRows,metricKey),
      channels:[...channels.entries()].map(([name,channelRows])=>({name,metric:metricValue(channelRows,metricKey)})).sort((a,b)=>b.metric.value-a.metric.value)
    };
  }).sort((a,b)=>b.metric.value-a.metric.value);
}

export function operationDate(rows){return rows.find(row=>row.DeliveryDate)?.DeliveryDate??"Sin fecha"}
