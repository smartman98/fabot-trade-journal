const API = "/api/trades";

const signalBanner = document.getElementById("signal-banner");
let todaySignal = null;

const listView = document.getElementById("list-view");
const formView = document.getElementById("form-view");
const detailView = document.getElementById("detail-view");

const summaryBar = document.getElementById("summary-bar");
const tradeList = document.getElementById("trade-list");
const loadingEl = document.getElementById("loading");

const addBtn = document.getElementById("add-btn");
const cancelBtn = document.getElementById("cancel-btn");
const tradeForm = document.getElementById("trade-form");
const formTitle = document.getElementById("form-title");
const formError = document.getElementById("form-error");

const fDate = document.getElementById("f-date");
const fTicker = document.getElementById("f-ticker");
const fAction = document.getElementById("f-action");
const fQuantity = document.getElementById("f-quantity");
const fPrice = document.getElementById("f-price");
const fFg = document.getElementById("f-fg");
const fMemo = document.getElementById("f-memo");

const detailBody = document.getElementById("detail-body");
const detailEditBtn = document.getElementById("detail-edit-btn");
const detailDeleteBtn = document.getElementById("detail-delete-btn");
const detailBackBtn = document.getElementById("detail-back-btn");

let editingId = null;
let selectedTrade = null;

function showView(view) {
  listView.hidden = view !== "list";
  formView.hidden = view !== "form";
  detailView.hidden = view !== "detail";
}

function formatMoney(n) {
  return Math.round(n).toLocaleString("ko-KR");
}

function renderSummary(summary) {
  summaryBar.innerHTML = "";
  const items = [
    { label: "총 매수", value: `${summary.buyCount}건`, cls: "buy" },
    { label: "총 매수금액", value: `${formatMoney(summary.buyTotal)}`, cls: "buy" },
    { label: "총 매도", value: `${summary.sellCount}건`, cls: "sell" },
    { label: "총 매도금액", value: `${formatMoney(summary.sellTotal)}`, cls: "sell" },
  ];
  for (const item of items) {
    const chip = document.createElement("div");
    chip.className = `summary-chip ${item.cls}`;
    chip.innerHTML = `<div class="label">${item.label}</div><div class="value">${item.value}</div>`;
    summaryBar.appendChild(chip);
  }
}

function renderTrades(trades) {
  tradeList.innerHTML = "";
  if (trades.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "아직 매매 기록이 없습니다.";
    tradeList.appendChild(empty);
    return;
  }

  for (const t of trades) {
    const li = document.createElement("li");
    li.className = "trade-card";
    li.addEventListener("click", () => openDetail(t));

    const badge = document.createElement("span");
    badge.className = `action-badge ${t.action}`;
    badge.textContent = t.action === "buy" ? "매수" : "매도";

    const main = document.createElement("div");
    main.className = "trade-main";
    const ticker = document.createElement("div");
    ticker.className = "trade-ticker";
    ticker.textContent = t.ticker;
    const meta = document.createElement("div");
    meta.className = "trade-meta";
    const fgText = t.fg_score !== null && t.fg_score !== undefined ? ` · F&G ${t.fg_score}` : "";
    meta.textContent = `${t.trade_date} · 수량 ${t.quantity} · 가격 ${formatMoney(t.price)}${fgText}`;

    main.appendChild(ticker);
    main.appendChild(meta);
    li.appendChild(badge);
    li.appendChild(main);
    tradeList.appendChild(li);
  }
}

async function fetchTrades() {
  loadingEl.hidden = false;
  const res = await fetch(API);
  const data = await res.json();
  loadingEl.hidden = true;
  renderSummary(data.summary);
  renderTrades(data.trades);
}

function openAddForm() {
  editingId = null;
  formTitle.textContent = "새 매매 기록";
  tradeForm.reset();
  fDate.value = new Date().toISOString().slice(0, 10);
  if (todaySignal) fFg.value = todaySignal.score;
  formError.textContent = "";
  showView("form");
}

function openEditForm(trade) {
  editingId = trade.id;
  formTitle.textContent = "매매 기록 수정";
  fDate.value = trade.trade_date;
  fTicker.value = trade.ticker;
  fAction.value = trade.action;
  fQuantity.value = trade.quantity;
  fPrice.value = trade.price;
  fFg.value = trade.fg_score ?? "";
  fMemo.value = trade.memo ?? "";
  formError.textContent = "";
  showView("form");
}

function openDetail(trade) {
  selectedTrade = trade;
  const fgText = trade.fg_score !== null && trade.fg_score !== undefined ? trade.fg_score : "-";
  detailBody.innerHTML = `
    <div><strong>${trade.ticker}</strong> (${trade.action === "buy" ? "매수" : "매도"})</div>
    <div>날짜: ${trade.trade_date}</div>
    <div>수량: ${trade.quantity}</div>
    <div>가격: ${formatMoney(trade.price)}</div>
    <div>그때 F&G 점수: ${fgText}</div>
    <div>메모: ${trade.memo ? trade.memo.replace(/</g, "&lt;") : "(없음)"}</div>
  `;
  showView("detail");
}

tradeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.textContent = "";

  const payload = {
    trade_date: fDate.value,
    ticker: fTicker.value.trim(),
    action: fAction.value,
    quantity: fQuantity.value,
    price: fPrice.value,
    fg_score: fFg.value === "" ? null : fFg.value,
    memo: fMemo.value.trim() || null,
  };

  const url = editingId ? `${API}/${editingId}` : API;
  const method = editingId ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json();
    formError.textContent = err.error || "저장 중 오류가 발생했습니다.";
    return;
  }

  await fetchTrades();
  showView("list");
});

addBtn.addEventListener("click", openAddForm);
cancelBtn.addEventListener("click", () => showView("list"));

detailEditBtn.addEventListener("click", () => openEditForm(selectedTrade));
detailBackBtn.addEventListener("click", () => showView("list"));
detailDeleteBtn.addEventListener("click", async () => {
  if (!selectedTrade) return;
  await fetch(`${API}/${selectedTrade.id}`, { method: "DELETE" });
  await fetchTrades();
  showView("list");
});

// 반원 게이지 SVG 생성 — CNN F&G 다이얼과 비슷한 형태지만,
// 색 구간은 우리 매매 규칙(매수/대기/커버드콜/매도)을 그대로 반영한다.
const GAUGE_CX = 130;
const GAUGE_CY = 128;
const GAUGE_R = 108;

function polarPoint(radius, value) {
  const angleDeg = 180 - (value / 100) * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: GAUGE_CX + radius * Math.cos(angleRad),
    y: GAUGE_CY - radius * Math.sin(angleRad),
  };
}

function bandArc(startValue, endValue, color) {
  const start = polarPoint(GAUGE_R, startValue);
  const end = polarPoint(GAUGE_R, endValue);
  return `<path d="M ${start.x} ${start.y} A ${GAUGE_R} ${GAUGE_R} 0 0 1 ${end.x} ${end.y}"
    fill="none" stroke="${color}" stroke-width="20" stroke-linecap="butt" />`;
}

function buildGaugeSvg(score) {
  const bands = [
    bandArc(0, 25, "#e34948"), // 매수 신호대 (diverge-red)
    bandArc(25, 35, "#e1e0d9"), // 대기 (gridline)
    bandArc(35, 65, "#1baf7a"), // 커버드콜 (평시) (cat-2)
    bandArc(65, 75, "#e1e0d9"), // 대기 (gridline)
    bandArc(75, 100, "#2a78d6"), // 매도 신호대 (diverge-blue)
  ].join("");

  const needleTip = polarPoint(GAUGE_R - 26, Math.max(0, Math.min(100, score)));

  const ticks = [0, 25, 50, 75, 100]
    .map((v) => {
      const p = polarPoint(GAUGE_R + 15, v);
      const anchor = v <= 10 ? "start" : v >= 90 ? "end" : "middle";
      const dy = v === 0 || v === 100 ? 4 : 0;
      return `<text x="${p.x.toFixed(1)}" y="${(p.y + dy).toFixed(1)}" text-anchor="${anchor}" font-size="11" fill="#898781">${v}</text>`;
    })
    .join("");

  return `
    <svg viewBox="0 -10 260 160" width="220" height="135">
      ${bands}
      ${ticks}
      <line x1="${GAUGE_CX}" y1="${GAUGE_CY}" x2="${needleTip.x.toFixed(1)}" y2="${needleTip.y.toFixed(1)}"
        stroke="#52514e" stroke-width="3" stroke-linecap="round" />
      <circle cx="${GAUGE_CX}" cy="${GAUGE_CY}" r="6" fill="#52514e" />
      <text x="${GAUGE_CX}" y="${GAUGE_CY - 14}" text-anchor="middle" font-size="30" font-weight="800" fill="#0b0b0b">${score.toFixed(0)}</text>
    </svg>
  `;
}

async function fetchTodaySignal() {
  try {
    const res = await fetch("/api/signal/today");
    if (!res.ok) {
      signalBanner.hidden = true;
      return;
    }
    todaySignal = await res.json();
    const when = new Date(todaySignal.computed_at);
    const pad = (n) => String(n).padStart(2, "0");
    const whenText = `${when.getMonth() + 1}/${when.getDate()} ${pad(when.getHours())}:${pad(when.getMinutes())} 기준`;

    signalBanner.innerHTML = `
      <div class="gauge-wrap">${buildGaugeSvg(todaySignal.score)}</div>
      <div class="signal-text">${todaySignal.signal}</div>
      <div class="signal-meta">${whenText}</div>
    `;
    signalBanner.hidden = false;
  } catch {
    signalBanner.hidden = true;
  }
}

// ---------- F&G 지수 추이 차트 (fg-dashboard와 동일한 구현) ----------

const SVG_NS = "http://www.w3.org/2000/svg";
const history = typeof FG_DATA !== "undefined" ? FG_DATA.history : [];

function filterRange(rangeKey) {
  if (rangeKey === "all") return history;
  const days = Number(rangeKey);
  return history.slice(-days);
}

function renderTable(data) {
  const tbody = document.getElementById("table-body");
  tbody.innerHTML = "";
  const recentFirst = data.slice().reverse();
  for (const row of recentFirst) {
    const tr = document.createElement("tr");
    const tdDate = document.createElement("td");
    tdDate.textContent = row.date;
    const tdScore = document.createElement("td");
    tdScore.textContent = row.score.toFixed(1);
    tr.appendChild(tdDate);
    tr.appendChild(tdScore);
    tbody.appendChild(tr);
  }
}

const CHART_W = 640;
const CHART_H = 260;
const CHART_PAD = { top: 16, right: 12, bottom: 24, left: 30 };
const chartPlotW = CHART_W - CHART_PAD.left - CHART_PAD.right;
const chartPlotH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;

function chartXScale(i, n) {
  if (n <= 1) return CHART_PAD.left;
  return CHART_PAD.left + (i / (n - 1)) * chartPlotW;
}
function chartYScale(v) {
  return CHART_PAD.top + (1 - v / 100) * chartPlotH;
}

function drawGridlines(svg, highlightBaseline) {
  [0, 50, 100].forEach((v) => {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", CHART_PAD.left);
    line.setAttribute("x2", CHART_W - CHART_PAD.right);
    line.setAttribute("y1", chartYScale(v));
    line.setAttribute("y2", chartYScale(v));
    line.setAttribute("stroke", highlightBaseline && v === 50 ? "#c3c2b7" : "#e1e0d9");
    line.setAttribute("stroke-width", "1");
    svg.appendChild(line);

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", CHART_PAD.left - 6);
    label.setAttribute("y", chartYScale(v) + 4);
    label.setAttribute("text-anchor", "end");
    label.setAttribute("font-size", "10");
    label.setAttribute("fill", "#898781");
    label.textContent = v;
    svg.appendChild(label);
  });
}

function createChartCrosshair(svg) {
  const crosshair = document.createElementNS(SVG_NS, "line");
  crosshair.setAttribute("y1", CHART_PAD.top);
  crosshair.setAttribute("y2", CHART_H - CHART_PAD.bottom);
  crosshair.setAttribute("stroke", "#898781");
  crosshair.setAttribute("stroke-width", "1");
  crosshair.setAttribute("visibility", "hidden");
  svg.appendChild(crosshair);
  return crosshair;
}

function createChartHitArea(svg) {
  const hitArea = document.createElementNS(SVG_NS, "rect");
  hitArea.setAttribute("x", CHART_PAD.left);
  hitArea.setAttribute("y", CHART_PAD.top);
  hitArea.setAttribute("width", chartPlotW);
  hitArea.setAttribute("height", chartPlotH);
  hitArea.setAttribute("fill", "transparent");
  svg.appendChild(hitArea);
  return hitArea;
}

function renderFgChart(data) {
  const svg = document.getElementById("chart");
  svg.innerHTML = "";
  const n = data.length;
  if (n === 0) return;

  const baselineY = chartYScale(50);
  drawGridlines(svg, true);

  function buildAreaPath(clampFn) {
    let d = `M ${chartXScale(0, n)} ${baselineY} `;
    for (let i = 0; i < n; i++) {
      d += `L ${chartXScale(i, n)} ${chartYScale(clampFn(data[i].score))} `;
    }
    d += `L ${chartXScale(n - 1, n)} ${baselineY} Z`;
    return d;
  }

  const abovePath = document.createElementNS(SVG_NS, "path");
  abovePath.setAttribute("d", buildAreaPath((v) => Math.max(v, 50)));
  abovePath.setAttribute("fill", "rgba(42,120,214,0.10)");
  svg.appendChild(abovePath);

  const belowPath = document.createElementNS(SVG_NS, "path");
  belowPath.setAttribute("d", buildAreaPath((v) => Math.min(v, 50)));
  belowPath.setAttribute("fill", "rgba(227,73,72,0.10)");
  svg.appendChild(belowPath);

  let lineD = "";
  data.forEach((d, i) => {
    lineD += (i === 0 ? "M " : "L ") + chartXScale(i, n) + " " + chartYScale(d.score) + " ";
  });
  const linePath = document.createElementNS(SVG_NS, "path");
  linePath.setAttribute("d", lineD);
  linePath.setAttribute("fill", "none");
  linePath.setAttribute("stroke", "#52514e");
  linePath.setAttribute("stroke-width", "2");
  linePath.setAttribute("stroke-linejoin", "round");
  linePath.setAttribute("stroke-linecap", "round");
  svg.appendChild(linePath);

  const lastX = chartXScale(n - 1, n);
  const lastY = chartYScale(data[n - 1].score);
  const endDot = document.createElementNS(SVG_NS, "circle");
  endDot.setAttribute("cx", lastX);
  endDot.setAttribute("cy", lastY);
  endDot.setAttribute("r", "4");
  endDot.setAttribute("fill", data[n - 1].score >= 50 ? "#2a78d6" : "#e34948");
  endDot.setAttribute("stroke", "#fcfcfb");
  endDot.setAttribute("stroke-width", "2");
  svg.appendChild(endDot);

  const endLabel = document.createElementNS(SVG_NS, "text");
  endLabel.setAttribute("x", lastX - 6);
  endLabel.setAttribute("y", lastY - 10);
  endLabel.setAttribute("text-anchor", "end");
  endLabel.setAttribute("font-size", "12");
  endLabel.setAttribute("font-weight", "700");
  endLabel.setAttribute("fill", "#0b0b0b");
  endLabel.textContent = data[n - 1].score.toFixed(1);
  svg.appendChild(endLabel);

  const crosshair = createChartCrosshair(svg);
  const hoverDot = document.createElementNS(SVG_NS, "circle");
  hoverDot.setAttribute("r", "5");
  hoverDot.setAttribute("stroke", "#fcfcfb");
  hoverDot.setAttribute("stroke-width", "2");
  hoverDot.setAttribute("visibility", "hidden");
  svg.appendChild(hoverDot);

  const hitArea = createChartHitArea(svg);
  const tooltip = document.getElementById("tooltip");

  function showTooltipAt(clientEvtX) {
    const rect = svg.getBoundingClientRect();
    const relX = ((clientEvtX - rect.left) / rect.width) * CHART_W;
    let idx = Math.round(((relX - CHART_PAD.left) / chartPlotW) * (n - 1));
    idx = Math.max(0, Math.min(n - 1, idx));

    const px = chartXScale(idx, n);
    const py = chartYScale(data[idx].score);
    crosshair.setAttribute("x1", px);
    crosshair.setAttribute("x2", px);
    crosshair.setAttribute("visibility", "visible");
    hoverDot.setAttribute("cx", px);
    hoverDot.setAttribute("cy", py);
    hoverDot.setAttribute("fill", data[idx].score >= 50 ? "#2a78d6" : "#e34948");
    hoverDot.setAttribute("visibility", "visible");

    tooltip.style.opacity = "1";
    tooltip.innerHTML = "";
    const dateLine = document.createElement("div");
    dateLine.textContent = data[idx].date;
    const valueLine = document.createElement("div");
    valueLine.className = "tt-value";
    valueLine.textContent = data[idx].score.toFixed(1) + "점";
    tooltip.appendChild(dateLine);
    tooltip.appendChild(valueLine);

    const svgPixelRect = svg.getBoundingClientRect();
    const scaleX = svgPixelRect.width / CHART_W;
    const tooltipX = px * scaleX;
    tooltip.style.left = Math.min(tooltipX + 10, svgPixelRect.width - 110) + "px";
    tooltip.style.top = (py * (svgPixelRect.height / CHART_H) - 40) + "px";
  }

  function hideTooltip() {
    crosshair.setAttribute("visibility", "hidden");
    hoverDot.setAttribute("visibility", "hidden");
    tooltip.style.opacity = "0";
  }

  hitArea.addEventListener("pointermove", (e) => showTooltipAt(e.clientX));
  hitArea.addEventListener("pointerleave", hideTooltip);
}

function renderFgAll(rangeKey) {
  const data = filterRange(rangeKey);
  renderFgChart(data);
  renderTable(data);
}

const filterRow = document.getElementById("filter-row");
if (filterRow) {
  filterRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    filterRow.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderFgAll(btn.dataset.range);
  });
}

const tableToggleBtn = document.getElementById("table-toggle");
if (tableToggleBtn) {
  tableToggleBtn.addEventListener("click", () => {
    const wrap = document.getElementById("table-wrap");
    wrap.hidden = !wrap.hidden;
    tableToggleBtn.textContent = wrap.hidden ? "표로 보기" : "표 숨기기";
  });
}

if (history.length > 0) renderFgAll("90");

fetchTrades();
fetchTodaySignal();
