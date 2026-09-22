import{loadPowerAppData}from"./core/data-service.js";
import{calculateKpis,breakdownByLocation,operationDate}from"./core/kpi-engine.js";
import{renderSummary,renderBreakdown,setText}from"./core/ui.js";

const componentsReady=()=>document.getElementById("operationDate")?Promise.resolve():new Promise(resolve=>document.addEventListener("components:ready",resolve,{once:true}));
const cards=[
  ["migration","migration","migrationBreakdown"],
  ["connection","connection","connectionBreakdown"],
  ["progress","progress","progressBreakdown"],
  ["dbeClient","dbeClient","dbeClientBreakdown"],
  ["dbeKg","dbeKg","dbeKgBreakdown"]
];

async function start(){
  try{
    const[rows]=await Promise.all([loadPowerAppData(),componentsReady()]);
    const metrics=calculateKpis(rows);
    cards.forEach(([prefix,key,target])=>{
      renderSummary(prefix,metrics[key]);
      renderBreakdown(target,breakdownByLocation(rows,key));
    });
    setText("operationDate",operationDate(rows));
  }catch(error){
    console.error(error);
    const alert=document.getElementById("dashboardError");
    if(alert){alert.hidden=false;alert.textContent="No se pudo cargar PowerApp_Data.json desde RoadMap. Revisa la consola del navegador."}
  }
}

document.addEventListener("DOMContentLoaded",start);
