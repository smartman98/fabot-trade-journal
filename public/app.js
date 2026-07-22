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
    bandArc(0, 25, "#ef4444"), // 매수 신호대
    bandArc(25, 35, "#e5e7eb"), // 대기
    bandArc(35, 65, "#6366f1"), // 커버드콜 (평시)
    bandArc(65, 75, "#e5e7eb"), // 대기
    bandArc(75, 100, "#2563eb"), // 매도 신호대
  ].join("");

  const needleTip = polarPoint(GAUGE_R - 26, Math.max(0, Math.min(100, score)));

  const ticks = [0, 25, 50, 75, 100]
    .map((v) => {
      const p = polarPoint(GAUGE_R + 15, v);
      const anchor = v <= 10 ? "start" : v >= 90 ? "end" : "middle";
      const dy = v === 0 || v === 100 ? 4 : 0;
      return `<text x="${p.x.toFixed(1)}" y="${(p.y + dy).toFixed(1)}" text-anchor="${anchor}" font-size="11" fill="#9ca3af">${v}</text>`;
    })
    .join("");

  return `
    <svg viewBox="0 -10 260 160" width="220" height="135">
      ${bands}
      ${ticks}
      <line x1="${GAUGE_CX}" y1="${GAUGE_CY}" x2="${needleTip.x.toFixed(1)}" y2="${needleTip.y.toFixed(1)}"
        stroke="#374151" stroke-width="3" stroke-linecap="round" />
      <circle cx="${GAUGE_CX}" cy="${GAUGE_CY}" r="6" fill="#374151" />
      <text x="${GAUGE_CX}" y="${GAUGE_CY - 14}" text-anchor="middle" font-size="30" font-weight="800" fill="#111827">${score.toFixed(0)}</text>
    </svg>
  `;
}

const TREND_W = 260;
const TREND_H = 70;
const TREND_PAD = { top: 6, bottom: 6, left: 4, right: 4 };

function buildTrendSvg(series) {
  if (!series || series.length < 2) return "";
  const plotW = TREND_W - TREND_PAD.left - TREND_PAD.right;
  const plotH = TREND_H - TREND_PAD.top - TREND_PAD.bottom;
  const n = series.length;

  const x = (i) => TREND_PAD.left + (i / (n - 1)) * plotW;
  const y = (v) => TREND_PAD.top + (1 - v / 100) * plotH;
  const baselineY = y(50).toFixed(1);

  let lineD = "";
  series.forEach((d, i) => {
    lineD += (i === 0 ? "M " : "L ") + x(i).toFixed(1) + " " + y(d.score).toFixed(1) + " ";
  });

  const first = series[0].date;
  const last = series[n - 1].date;

  return `
    <svg viewBox="0 0 ${TREND_W} ${TREND_H + 14}" width="240" height="76" class="trend-svg">
      <line x1="${TREND_PAD.left}" y1="${baselineY}" x2="${TREND_W - TREND_PAD.right}" y2="${baselineY}"
        stroke="#e5e7eb" stroke-width="1" stroke-dasharray="3 3" />
      <path d="${lineD}" fill="none" stroke="#6366f1" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <text x="${TREND_PAD.left}" y="${TREND_H + 12}" font-size="10" fill="#9ca3af">${first}</text>
      <text x="${TREND_W - TREND_PAD.right}" y="${TREND_H + 12}" text-anchor="end" font-size="10" fill="#9ca3af">${last}</text>
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
      <div id="trend-wrap" class="trend-wrap"></div>
    `;
    signalBanner.hidden = false;

    const historyRes = await fetch("/api/signal/history");
    if (historyRes.ok) {
      const series = await historyRes.json();
      document.getElementById("trend-wrap").innerHTML = buildTrendSvg(series);
    }
  } catch {
    signalBanner.hidden = true;
  }
}

fetchTrades();
fetchTodaySignal();
