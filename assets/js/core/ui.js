const whole=new Intl.NumberFormat("es-PE",{maximumFractionDigits:0});
const decimal=new Intl.NumberFormat("es-PE",{minimumFractionDigits:1,maximumFractionDigits:1});
export const formatPercent=value=>`${decimal.format(Number(value||0))}%`;
export const formatNumber=value=>whole.format(Number(value||0));

export function setText(id,value){const node=document.getElementById(id);if(node)node.textContent=value}

export function renderSummary(prefix,metric){
  setText(`${prefix}Value`,formatPercent(metric.value));
  const numerator=formatNumber(metric.numerator);
  const denominator=formatNumber(metric.denominator);
  setText(`${prefix}Detail`,`${numerator} / ${denominator} ${metric.unit}`);
}

function escapeHtml(value){return String(value).replace(/[&<>"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]))}
function safeWidth(value){return Math.min(100,Math.max(0,Number(value)||0))}

export function renderBreakdown(targetId,items){
  const target=document.getElementById(targetId);
  if(!target)return;
  if(!items.length){target.innerHTML='<p class="gm-empty">No hay datos para mostrar.</p>';return}
  target.innerHTML=items.map(location=>`<section class="gm-location">
    <div class="gm-location__head"><span class="gm-location__name" title="${escapeHtml(location.name)}">${escapeHtml(location.name)}</span><strong>${formatPercent(location.metric.value)}</strong></div>
    <div class="gm-bar" aria-hidden="true"><div class="gm-bar__fill" style="width:${safeWidth(location.metric.value)}%"></div></div>
    <div class="gm-channels">${location.channels.map(channel=>`<div class="gm-channel">
      <div class="gm-channel__head"><span class="gm-channel__name" title="${escapeHtml(channel.name)}">${escapeHtml(channel.name)}</span><span>${formatPercent(channel.metric.value)}</span></div>
      <div class="gm-bar" aria-hidden="true"><div class="gm-bar__fill" style="width:${safeWidth(channel.metric.value)}%"></div></div>
    </div>`).join("")}</div>
  </section>`).join("")}
