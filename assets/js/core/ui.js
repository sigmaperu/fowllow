const whole=new Intl.NumberFormat("es-PE",{maximumFractionDigits:0});
const decimal=new Intl.NumberFormat("es-PE",{minimumFractionDigits:1,maximumFractionDigits:1});
export const formatPercent=value=>`${decimal.format(Number(value||0))}%`;
export const formatNumber=value=>whole.format(Number(value||0));

export function setText(id,value){const node=document.getElementById(id);if(node)node.textContent=value}

export function renderSummary(prefix,metric){
  const gauge=document.getElementById(`${prefix}Gauge`);
  if(gauge)gauge.style.setProperty("--gauge-value",Math.min(100,Math.max(0,Number(metric.value)||0)));
  setText(`${prefix}Value`,formatPercent(metric.value));
  setText(`${prefix}Detail`,`${formatNumber(metric.numerator)} / ${formatNumber(metric.denominator)} ${metric.unit}`);
}

function escapeHtml(value){return String(value).replace(/[&<>"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]))}
function safeWidth(value){return Math.min(100,Math.max(0,Number(value)||0))}

export function renderBreakdown(targetId,items){
  const target=document.getElementById(targetId);
  if(!target)return;
  if(!items.length){target.innerHTML='<p class="gm-empty">No hay datos para mostrar.</p>';return}
  target.innerHTML=items.map(item=>`<section class="gm-location">
    <div class="gm-location__head">
      <span class="gm-location__name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
      <span class="gm-location__ratio">${formatNumber(item.metric.numerator)} / ${formatNumber(item.metric.denominator)} ${escapeHtml(item.metric.unit)}</span>
    </div>
    <div class="gm-capsule-row">
      <div class="gm-capsule" aria-hidden="true"><div class="gm-capsule__fill" style="width:${safeWidth(item.metric.value)}%"></div></div>
      <span class="gm-location__percent">${formatPercent(item.metric.value)}</span>
    </div>
  </section>`).join("")
}
