export const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

export function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

export function renderKpi(id, metric, detailFormatter = (m) => `${m.numerator} / ${m.denominator}`) {
  setText(`${id}Value`, formatPercent(metric.value));
  setText(`${id}Detail`, detailFormatter(metric));
}

export function renderRanking(targetId, items) {
  const target = document.getElementById(targetId);
  if (!target) return;

  if (!items.length) {
    target.innerHTML = '<p class="loading-state">No hay datos para mostrar.</p>';
    return;
  }

  target.replaceChildren(...items.map((item) => {
    const row = document.createElement("div");
    row.className = "rank-row";
    row.innerHTML = `
      <span class="rank-name" title="${escapeHtml(item.location)}">${escapeHtml(item.location)}</span>
      <div class="rank-track" aria-hidden="true"><div class="rank-fill" style="width:${Math.min(100, Math.max(0, item.value))}%"></div></div>
      <span class="rank-value">${formatPercent(item.value)}</span>`;
    return row;
  }));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}
