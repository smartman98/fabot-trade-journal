const API = "/api/trades";

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

fetchTrades();
