const API = "/api/trades";

const signalBanner = document.getElementById("signal-banner");
let todaySignal = null;

const listView = document.getElementById("list-view");
const formView = document.getElementById("form-view");
const detailView = document.getElementById("detail-view");

const tradeList = document.getElementById("trade-list");
const loadingEl = document.getElementById("loading");

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
const fAccount = document.getElementById("f-account");
const fAccountCustomWrap = document.getElementById("f-account-custom-wrap");
const fAccountCustom = document.getElementById("f-account-custom");
const fMemo = document.getElementById("f-memo");

const KNOWN_ACCOUNTS = ["키움 실전투자", "키움 모의투자", "KIS 모의투자"];

function setAccountValue(account) {
  if (!account) {
    fAccount.value = "";
    fAccountCustomWrap.hidden = true;
    fAccountCustom.value = "";
  } else if (KNOWN_ACCOUNTS.includes(account)) {
    fAccount.value = account;
    fAccountCustomWrap.hidden = true;
    fAccountCustom.value = "";
  } else {
    fAccount.value = "__custom__";
    fAccountCustomWrap.hidden = false;
    fAccountCustom.value = account;
  }
}

function getAccountValue() {
  if (fAccount.value === "__custom__") return fAccountCustom.value.trim() || null;
  return fAccount.value || null;
}

fAccount.addEventListener("change", () => {
  fAccountCustomWrap.hidden = fAccount.value !== "__custom__";
});

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

function actionLabel(action) {
  if (action === "buy") return "매수";
  if (action === "sell") return "매도";
  return "배당";
}

function renderTrades(trades, targetUl, emptyText) {
  targetUl.innerHTML = "";
  if (trades.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = emptyText || "아직 매매 기록이 없습니다.";
    targetUl.appendChild(empty);
    return;
  }

  for (const t of trades) {
    const li = document.createElement("li");
    li.className = "trade-card";
    li.addEventListener("click", () => openDetail(t));

    const badge = document.createElement("span");
    badge.className = `action-badge ${t.action}`;
    badge.textContent = actionLabel(t.action);

    const main = document.createElement("div");
    main.className = "trade-main";
    const ticker = document.createElement("div");
    ticker.className = "trade-ticker";
    ticker.textContent = t.ticker;
    const meta = document.createElement("div");
    meta.className = "trade-meta";
    const fgText = t.fg_score !== null && t.fg_score !== undefined ? ` · F&G ${t.fg_score}` : "";
    meta.textContent = t.action === "dividend"
      ? `${t.trade_date} · 세후 수령액 ${formatMoney(t.price)}원${fgText}`
      : `${t.trade_date} · 수량 ${t.quantity} · 주가 ${formatMoney(t.price)}${fgText}`;

    main.appendChild(ticker);
    main.appendChild(meta);
    li.appendChild(badge);
    li.appendChild(main);
    targetUl.appendChild(li);
  }
}

// 계좌(broker)별로 잔고 블록 안에 그 계좌 매매기록을 같이 넣는다(2026-08-14, 사용자가
// "계좌잔고(한국투자증권) 안에 매매기록(한국투자증권)이 같이 있어야 한다"고 요청) —
// account 필드 문자열(로그에 실제 찍히는 값)과 화면 라벨(BROKER_LABELS)이 서로 달라서
// 매핑 테이블이 필요하다.
const BROKER_ACCOUNT_TAG = { KIS: "KIS 모의투자", Kiwoom: "키움 모의투자" };

let allTrades = [];

function renderOrphanTrades() {
  const known = Object.values(BROKER_ACCOUNT_TAG);
  const orphans = allTrades.filter((t) => !known.includes(t.account));
  listView.hidden = orphans.length === 0;
  if (orphans.length > 0) renderTrades(orphans, tradeList);
}

async function fetchTrades() {
  loadingEl.hidden = false;
  const res = await fetch(API);
  const data = await res.json();
  loadingEl.hidden = true;
  allTrades = data.trades;
  renderOrphanTrades();
  if (Object.keys(balanceData).length > 0) renderAllBalanceSections();
}

const fQuantityLabel = document.getElementById("f-quantity-label");
const fPriceLabel = document.getElementById("f-price-label");

function updateFormLabelsForAction() {
  const isDividend = fAction.value === "dividend";
  fQuantityLabel.firstChild.textContent = isDividend ? "수량(배당은 1로 고정) " : "수량 ";
  fPriceLabel.firstChild.textContent = isDividend ? "세후 수령액 " : "주가 ";
  if (isDividend) fQuantity.value = 1;
}
fAction.addEventListener("change", updateFormLabelsForAction);

function openEditForm(trade) {
  editingId = trade.id;
  formTitle.textContent = "매매 기록 수정";
  fDate.value = trade.trade_date;
  fTicker.value = trade.ticker;
  fAction.value = trade.action;
  fQuantity.value = trade.quantity;
  fPrice.value = trade.price;
  fFg.value = trade.fg_score ?? "";
  setAccountValue(trade.account ?? null);
  fMemo.value = trade.memo ?? "";
  formError.textContent = "";
  updateFormLabelsForAction();
  showView("form");
}

function openDetail(trade) {
  selectedTrade = trade;
  const fgText = trade.fg_score !== null && trade.fg_score !== undefined ? trade.fg_score : "-";
  detailBody.innerHTML = `
    <div><strong>${trade.ticker}</strong> (${actionLabel(trade.action)})</div>
    <div>날짜: ${trade.trade_date}</div>
    <div>수량: ${trade.quantity}</div>
    <div>주가: ${formatMoney(trade.price)}</div>
    <div>그때 F&G 점수: ${fgText}</div>
    <div>계좌: ${trade.account ? trade.account.replace(/</g, "&lt;") : "(없음)"}</div>
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
    account: getAccountValue(),
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

cancelBtn.addEventListener("click", () => showView("list"));

detailEditBtn.addEventListener("click", () => openEditForm(selectedTrade));
detailBackBtn.addEventListener("click", () => showView("list"));
detailDeleteBtn.addEventListener("click", async () => {
  if (!selectedTrade) return;
  await fetch(`${API}/${selectedTrade.id}`, { method: "DELETE" });
  await fetchTrades();
  showView("list");
});

// 반원 게이지 SVG 생성 — CNN F&G 다이얼(edition.cnn.com/markets/fear-and-greed)을 참고해서
// 웨지(부채꼴) 5구간 + 현재 구간만 색칠하는 방식으로 만든다. 구간 경계값(25/35/65/75)은
// 우리 매매 규칙 그대로 쓰되, CNN처럼 "대기" 같은 빈 구간 없이 5구간이 끊김없이 이어지도록
// 이름만 공포/탐욕으로 채웠다(2026-07-23, 사용자가 CNN 실제 화면 캡처로 확인 후 결정).
const GAUGE_CX = 180;
const GAUGE_CY = 190;
const GAUGE_R_OUTER = 166;
const GAUGE_R_INNER = 55;
const ZONE_GAP = 0.8; // 구간 사이 살짝 벌어진 틈(값 단위) — CNN처럼 조각난 느낌을 줌

// 구간 경계값은 우리 매매 규칙(25/35/65/75)이 아니라, 일반적으로 통용되는 F&G 해석 기준
// (0~24/25~44/45~55/56~75/76~100, 나무위키 등 참고)으로 맞췄다(2026-07-23, 사용자 확인).
// 정수 구간표의 경계(24|25, 44|45, 55|56, 75|76)를 소수 점수에 맞게 중간값으로 변환.
// lines: 좁은 호 안에 "극단적 공포"를 한 줄로 우겨넣으면 너무 빽빽해서, 2단어짜리는
// 위/아래 두 줄로 나눠 쌓는다.
const GAUGE_ZONES = [
  { min: 0, max: 24.5, lines: ["극단적", "공포"], fill: "#eb9a86", stroke: "#d97552", text: "#7a3a22" },
  { min: 24.5, max: 44.5, lines: ["공포"], fill: "#f2c9a8", stroke: "#dba872", text: "#8a5a2a" },
  { min: 44.5, max: 55.5, lines: ["중립"], fill: "#ece6d6", stroke: "#c7bd9e", text: "#5c5640" },
  { min: 55.5, max: 75.5, lines: ["탐욕"], fill: "#cbe3b8", stroke: "#a0c987", text: "#3f5c2c" },
  { min: 75.5, max: 100, lines: ["극단적", "탐욕"], fill: "#8fca86", stroke: "#5fa855", text: "#254a1e" },
];

function polarPoint(radius, value) {
  const angleDeg = 180 - (value / 100) * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: GAUGE_CX + radius * Math.cos(angleRad),
    y: GAUGE_CY - radius * Math.sin(angleRad),
  };
}

// 부채꼴(annular sector) 한 조각의 SVG path — 안쪽 반지름부터 바깥 반지름까지 꽉 채운다
// (CNN처럼 얇은 링이 아니라 두툼한 조각 모양).
function sectorPath(minValue, maxValue) {
  const a = minValue + ZONE_GAP;
  const b = maxValue - ZONE_GAP;
  const outerStart = polarPoint(GAUGE_R_OUTER, a);
  const outerEnd = polarPoint(GAUGE_R_OUTER, b);
  const innerEnd = polarPoint(GAUGE_R_INNER, b);
  const innerStart = polarPoint(GAUGE_R_INNER, a);
  return (
    `M ${outerStart.x.toFixed(1)} ${outerStart.y.toFixed(1)} ` +
    `A ${GAUGE_R_OUTER} ${GAUGE_R_OUTER} 0 0 1 ${outerEnd.x.toFixed(1)} ${outerEnd.y.toFixed(1)} ` +
    `L ${innerEnd.x.toFixed(1)} ${innerEnd.y.toFixed(1)} ` +
    `A ${GAUGE_R_INNER} ${GAUGE_R_INNER} 0 0 0 ${innerStart.x.toFixed(1)} ${innerStart.y.toFixed(1)} Z`
  );
}

function findZoneIndex(score) {
  const clamped = Math.max(0, Math.min(100, score));
  const idx = GAUGE_ZONES.findIndex((z) => clamped >= z.min && clamped < z.max);
  return idx === -1 ? GAUGE_ZONES.length - 1 : idx; // score === 100은 마지막 구간
}

// 게이지 아래 텍스트는 매매 액션("매수" 등)이 아니라 게이지와 똑같은 F&G 구간 이름을 보여준다
// (2026-07-23, CNN처럼 순수 심리 지표만 보여주기로 함 — 실제 매매 액션은 별도 화면/로그에서 확인).
function zoneLabel(score) {
  return GAUGE_ZONES[findZoneIndex(score)].lines.join(" ");
}

function buildGaugeSvg(score) {
  const activeIdx = findZoneIndex(score);

  const sectors = GAUGE_ZONES.map((zone, i) => {
    const active = i === activeIdx;
    const fill = active ? zone.fill : "#ffffff";
    const stroke = active ? zone.stroke : "#e1e0d9";
    return `<path d="${sectorPath(zone.min, zone.max)}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />`;
  }).join("");

  // 구간 이름표 — 글자 하나하나가 호를 따라 휘도록 textPath를 씀(CNN처럼). 보이지 않는 안내선을
  // 반지름별로 만들어두고, 각 구간은 그 위의 %지점에만 글자를 얹는다. 값→각도가 선형이고 반지름이
  // 일정해서, 호 길이 비율이 그대로 값의 %와 같다. "극단적 공포"처럼 2단어짜리는 한 줄에 우겨넣으면
  // 좁은 호에서 너무 빽빽해지므로, 반지름을 살짝 다르게 잡아 위/아래 두 줄로 쌓는다.
  const ZONE_LABEL_R = (GAUGE_R_OUTER + GAUGE_R_INNER) / 2;
  const LINE_STEP = 11; // 두 줄 쌓을 때 위/아래로 벌리는 반지름 폭

  function labelArcPathId(radius) {
    return `zoneLabelArc${Math.round(radius * 10)}`;
  }
  function labelArcDefFor(radius) {
    const start = polarPoint(radius, 0);
    const end = polarPoint(radius, 100);
    return `<path id="${labelArcPathId(radius)}" fill="none"
      d="M ${start.x.toFixed(1)} ${start.y.toFixed(1)}
         A ${radius} ${radius} 0 0 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}" />`;
  }

  const usedRadii = new Set();
  GAUGE_ZONES.forEach((zone) => {
    if (zone.lines.length === 1) {
      usedRadii.add(ZONE_LABEL_R);
    } else {
      usedRadii.add(ZONE_LABEL_R + LINE_STEP);
      usedRadii.add(ZONE_LABEL_R - LINE_STEP);
    }
  });
  const labelArcDef = [...usedRadii].map(labelArcDefFor).join("");

  const zoneLabels = GAUGE_ZONES.map((zone, i) => {
    const active = i === activeIdx;
    const mid = (zone.min + zone.max) / 2;
    const fill = active ? zone.text : "#4a4844";
    const weight = 800;
    const radii = zone.lines.length === 1 ? [ZONE_LABEL_R] : [ZONE_LABEL_R + LINE_STEP, ZONE_LABEL_R - LINE_STEP];
    return zone.lines
      .map((line, li) => `<text font-size="13" font-weight="${weight}" fill="${fill}">
        <textPath href="#${labelArcPathId(radii[li])}" startOffset="${mid}%" text-anchor="middle" letter-spacing="0.5">${line}</textPath>
      </text>`)
      .join("");
  }).join("");

  // 조각 바깥 경계에 작은 점 + 바깥쪽 여백에 숫자 눈금(0/25/50/75/100) — 진한 검정 볼드로 표시.
  const tickMarks = [0, 25, 50, 75, 100]
    .map((v) => {
      const dot = polarPoint(GAUGE_R_OUTER, v);
      const isEdge = v === 0 || v === 100;
      const label = polarPoint(GAUGE_R_OUTER + (isEdge ? 30 : 24), v);
      const anchor = v <= 10 ? "start" : v >= 90 ? "end" : "middle";
      const dy = isEdge ? 18 : 0;
      return (
        `<circle cx="${dot.x.toFixed(1)}" cy="${dot.y.toFixed(1)}" r="3" fill="#c7c4b8" />` +
        `<text x="${label.x.toFixed(1)}" y="${(label.y + dy).toFixed(1)}" text-anchor="${anchor}" font-size="16" font-weight="800" fill="#0b0b0b">${v}</text>`
      );
    })
    .join("");

  // 바늘 — 중심(pivot)에서 살짝 굵은 쐐기 모양으로, 조각 안쪽까지만 뻗어서(CNN처럼 바깥 테두리엔 안 닿음).
  const clampedScore = Math.max(0, Math.min(100, score));
  const needleTip = polarPoint(GAUGE_R_INNER + (GAUGE_R_OUTER - GAUGE_R_INNER) * 0.6, clampedScore);
  const needleAngle = (180 - (clampedScore / 100) * 180 + 90) * (Math.PI / 180);
  const perpX = Math.cos(needleAngle) * 5;
  const perpY = -Math.sin(needleAngle) * 5;

  return `
    <svg viewBox="-50 -22 461 269" style="width: 100%; height: auto; max-width: 380px; display: block;">
      <defs>${labelArcDef}</defs>
      ${sectors}
      ${zoneLabels}
      ${tickMarks}
      <path d="M ${(GAUGE_CX - perpX).toFixed(1)} ${(GAUGE_CY - perpY).toFixed(1)}
        L ${needleTip.x.toFixed(1)} ${needleTip.y.toFixed(1)}
        L ${(GAUGE_CX + perpX).toFixed(1)} ${(GAUGE_CY + perpY).toFixed(1)} Z"
        fill="#2b2a27" />
      <circle cx="${GAUGE_CX}" cy="${GAUGE_CY}" r="9" fill="#2b2a27" />
      <circle cx="${GAUGE_CX}" cy="${GAUGE_CY}" r="4" fill="#fcfcfb" />
      <text x="${GAUGE_CX}" y="${GAUGE_CY + 46}" text-anchor="middle" font-size="40" font-weight="800" fill="#0b0b0b">${score.toFixed(0)}</text>
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
      <p class="chart-title signal-banner-title">오늘의 F&G</p>
      <div class="gauge-wrap">${buildGaugeSvg(todaySignal.score)}</div>
      <div class="signal-text">${zoneLabel(todaySignal.score)}</div>
      <div class="signal-meta">${whenText}</div>
    `;
    signalBanner.hidden = false;
  } catch {
    signalBanner.hidden = true;
  }
}

// ---------- F&G 지수 추이 차트 (fg-dashboard와 동일한 구현) ----------

const SVG_NS = "http://www.w3.org/2000/svg";
// fg_data.js는 2026-07-22에 한 번 만들어진 정적 스냅샷이라 시간이 지날수록 오래된 값으로
// 굳어있다(2026-08-13 실측: "오늘의 신호"는 62인데 이 정적 스냅샷의 마지막 값은 7월 중순
// 41.7로 3주 넘게 멈춰있었음). 예전엔 이 스냅샷을 먼저 보여주고 몇 초 뒤 실시간 값으로
// 바꿔치기했는데, 사용자가 그 "잠깐 틀린 값이 보이는" 상태를 원치 않아서(2026-08-15)
// 실시간 조회(/api/signal/history)가 끝날 때까지 기다렸다가 한 번에 그린다.
// 실시간 조회 자체가 실패했을 때만 이 정적 스냅샷을 최후의 대체값으로 쓴다.
let history = [];

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
  endDot.setAttribute("fill", data[n - 1].score >= 50 ? "#aecbea" : "#f0b3b2");
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
    hoverDot.setAttribute("fill", data[idx].score >= 50 ? "#aecbea" : "#f0b3b2");
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

function currentActiveRange() {
  const activeBtn = filterRow && filterRow.querySelector(".filter-btn.active");
  return activeBtn ? activeBtn.dataset.range : "90";
}

async function fetchFgHistory() {
  try {
    const res = await fetch("/api/signal/history", { cache: "no-store" });
    if (!res.ok) throw new Error("history fetch failed");
    const live = await res.json();
    if (live.length === 0) throw new Error("empty history");
    history = live;
  } catch {
    // 실시간 조회가 실패했을 때만 정적 스냅샷으로 대체한다(둘 다 없으면 빈 차트로 둠).
    if (history.length === 0 && typeof FG_DATA !== "undefined") history = FG_DATA.history;
  }
  if (history.length > 0) renderFgAll(currentActiveRange());
}

fetchTrades();
fetchTodaySignal();
fetchFgHistory();

// fg-dashboard(smartman98.github.io/fg-dashboard)와 같은 주기(1분)로 화면을 자동 갱신한다 —
// 안 그러면 페이지를 열어둔 채로 기다려도 값이 그대로라, 매번 새로고침해야 최신값이 보였다.
setInterval(fetchTodaySignal, 60000);
setInterval(fetchFgHistory, 60000);

// ---------- 계좌 잔고 (모의투자) ----------
// push_demo_balance.py가 스케줄 실행마다(15:20/04:50) Supabase demo_balance 표에
// 저장해두는 스냅샷을 그대로 읽어온다 — "새로고침"은 실시간으로 계좌를 다시 조회하는
// 게 아니라, 마지막으로 저장된 스냅샷을 다시 받아오는 것이다(로컬 PC에서만 접근 가능한
// 키움/KIS API를 이 배포된 웹서버가 직접 호출할 수는 없어서).

// 증권사별로 완전히 별개 계좌라(KIS 모의투자 / 키움증권 모의투자) 화면도 따로 그린다
// (2026-08-14: 두 계좌가 우연히 같은 종목 472150을 동시에 보유하고 있어서, 하나로
// 합쳐 보여주면 "어느 계좌 건지" 헷갈린다는 걸 사용자가 실제 키움 HTS 화면과 대조
// 하다가 확인함).

const BROKER_LABELS = { KIS: "한국투자증권 모의계좌", Kiwoom: "키움증권 모의계좌" };
const balanceSectionsEl = document.getElementById("balance-sections");
let balanceData = {}; // { KIS: {rows, summary}, Kiwoom: {rows, summary} }
const balanceCurrencyByBroker = {}; // broker -> "KRW" | "NATIVE" | "ALL"

let balanceHistoryData = {}; // { KIS: [{snapshot_date, krw_profit, krw_profit_rate, ...}], Kiwoom: [...] }
const balanceMetricByBroker = {}; // broker -> "rate" | "profit"

// 값 배열을 간단한 SVG 꺾은선 그래프로 그린다(F&G 차트처럼 0~100 고정범위가 아니라
// 데이터 최소/최대에 맞춰 자동으로 축을 잡아야 해서 별도로 만듦 — 음수(손실)도 나올 수 있음).
function buildMiniLineChartSvg(points) {
  const W = 640, H = 200, PAD = { top: 14, right: 12, bottom: 20, left: 46 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  if (points.length === 0) {
    return `<svg viewBox="0 0 ${W} ${H}"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="var(--text-muted)" font-size="13">아직 쌓인 데이터가 없습니다(장 마감 무렵부터 하루 1건씩 쌓입니다)</text></svg>`;
  }

  const values = points.map((p) => p.value);
  let min = Math.min(...values, 0);
  let max = Math.max(...values, 0);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  min -= span * 0.1;
  max += span * 0.1;

  const x = (i) => (points.length <= 1 ? PAD.left : PAD.left + (i / (points.length - 1)) * plotW);
  const y = (v) => PAD.top + (1 - (v - min) / (max - min)) * plotH;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const zeroY = y(0).toFixed(1);

  const dots = points
    .map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3" fill="${p.value >= 0 ? "var(--diverge-red)" : "var(--diverge-blue)"}" />`)
    .join("");

  const firstLabel = points[0].label;
  const lastLabel = points[points.length - 1].label;

  return `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="일별 수익 추이 차트">
      <line x1="${PAD.left}" y1="${zeroY}" x2="${W - PAD.right}" y2="${zeroY}" stroke="var(--baseline)" stroke-dasharray="3,3" />
      <path d="${path}" fill="none" stroke="var(--cat-2)" stroke-width="2" />
      ${dots}
      <text x="${PAD.left}" y="${H - 4}" font-size="11" fill="var(--text-muted)">${firstLabel}</text>
      <text x="${W - PAD.right}" y="${H - 4}" font-size="11" fill="var(--text-muted)" text-anchor="end">${lastLabel}</text>
    </svg>
  `;
}

function renderBalanceChart(broker) {
  const wrap = document.getElementById(`balance-chart-${broker}`);
  if (!wrap) return;
  const metric = balanceMetricByBroker[broker] || "rate";
  const history = balanceHistoryData[broker] || [];
  const points = history.map((h) => ({
    label: h.snapshot_date.slice(5), // MM-DD만
    value: metric === "rate" ? Number(h.krw_profit_rate) : Number(h.krw_profit),
  }));
  wrap.innerHTML = buildMiniLineChartSvg(points);
}

async function fetchBalanceHistory() {
  try {
    const res = await fetch("/api/balance-history", { cache: "no-store" });
    if (!res.ok) return;
    balanceHistoryData = await res.json();
    for (const broker of Object.keys(balanceData)) renderBalanceChart(broker);
  } catch {
    // 조용히 넘어감 — 잔고/매매기록 등 다른 화면은 정상 동작해야 하므로.
  }
}

// 현재가 옆에 붙는 "전일대비" — prevClose가 없으면(예: 옛날에 저장된 행이라 아직
// 채워지지 않음, 또는 KIS 전일종가 조회가 실패함) 조용히 빈 문자열을 반환한다.
function dayChangeHtml(current, prevClose, formatFn) {
  if (prevClose == null || !(prevClose > 0)) return "";
  const diff = current - prevClose;
  const rate = (diff / prevClose) * 100;
  const cls = diff > 0 ? "pos" : diff < 0 ? "neg" : "";
  const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "-";
  return ` <span class="day-change ${cls}">${arrow}${formatFn(Math.abs(diff))} (${diff >= 0 ? "+" : ""}${rate.toFixed(2)}%)</span>`;
}

function renderBalanceRowsFor(broker) {
  const tbody = document.getElementById(`balance-body-${broker}`);
  if (!tbody) return;
  const currency = balanceCurrencyByBroker[broker] || "KRW";
  tbody.innerHTML = "";
  for (const r of balanceData[broker].rows) {
    const isKrwView = currency === "KRW" || (currency === "NATIVE" && r.currency === "KRW");
    const nativeSymbol = r.currency === "USD" ? "$" : "";
    let qty, avg, cur, pnl, rate, dayChange;

    if (isKrwView) {
      qty = Number(r.quantity).toLocaleString("ko-KR");
      avg = formatMoney(r.krw_avg_value / r.quantity);
      const curValue = r.krw_current_value / r.quantity;
      cur = formatMoney(curValue);
      pnl = r.krw_current_value - r.krw_avg_value;
      rate = r.krw_avg_value > 0 ? (pnl / r.krw_avg_value) * 100 : 0;
      pnl = `${pnl >= 0 ? "+" : ""}${formatMoney(pnl)}`;
      dayChange = dayChangeHtml(curValue, r.krw_prev_close, (v) => `${formatMoney(v)}원`);
    } else {
      qty = Number(r.quantity).toLocaleString("ko-KR");
      avg = `${nativeSymbol}${Number(r.avg_price).toLocaleString("ko-KR")}`;
      cur = `${nativeSymbol}${Number(r.current_price).toLocaleString("ko-KR")}`;
      const nativePnl = (r.current_price - r.avg_price) * r.quantity;
      rate = r.avg_price > 0 ? ((r.current_price - r.avg_price) / r.avg_price) * 100 : 0;
      const sign = nativePnl >= 0 ? "+" : "-";
      pnl = `${sign}${nativeSymbol}${Math.abs(nativePnl).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}`;
      dayChange = dayChangeHtml(
        r.current_price, r.prev_close,
        (v) => `${nativeSymbol}${v.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}`
      );
    }

    let krwHint = "";
    if (currency === "ALL" && r.currency === "USD") {
      krwHint = ` <span class="muted">(${formatMoney(r.krw_current_value / r.quantity)}원)</span>`;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.market === "domestic" ? "국내" : "해외"}</td>
      <td>${r.label}</td>
      <td>${qty}</td>
      <td>${avg}</td>
      <td>${cur}${dayChange}${krwHint}</td>
      <td class="${rate >= 0 ? "pos" : "neg"}">${pnl}</td>
      <td class="${rate >= 0 ? "pos" : "neg"}">${rate >= 0 ? "+" : ""}${rate.toFixed(2)}%</td>
    `;
    tbody.appendChild(tr);
  }
}

const COMPOSITION_COLORS = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)"];
let cashByBroker = {}; // { KIS: krw_amount, Kiwoom: krw_amount }

// 사용자가 참고로 보여준 실계좌 앱 화면(총 투자자산 → 색상 바 → 종목별 %)과 같은 스타일로,
// 모의계좌 보유종목 + 예수금(현금)의 비중(%)을 보여준다 — 통화 토글과 무관하게 항상 원화 기준.
// 현금은 demo_balance가 아니라 별도 demo_cash 표에서 오므로, 계좌 잔고 요약(총매입/총평가/
// 총수익률)의 기존 계산에는 영향을 주지 않는다.
function renderAssetComposition(broker) {
  const wrap = document.getElementById(`asset-composition-${broker}`);
  if (!wrap) return;
  const info = balanceData[broker];
  const stockItems = (info ? info.rows : []).map((r) => ({
    label: `${r.market === "domestic" ? "국내" : "해외"} · ${r.label}`,
    value: Number(r.krw_current_value),
  }));
  const cash = cashByBroker[broker];
  const items = cash ? [...stockItems, { label: "현금(예수금)", value: cash }] : stockItems;

  if (!items.length) {
    wrap.innerHTML = `<p class="muted">보유 종목이 없습니다.</p>`;
    return;
  }

  items.sort((a, b) => b.value - a.value);
  const total = items.reduce((sum, it) => sum + it.value, 0);
  const segments = items.map((it, i) => ({
    ...it,
    pct: total > 0 ? (it.value / total) * 100 : 0,
    color: COMPOSITION_COLORS[i % COMPOSITION_COLORS.length],
  }));

  const bar = segments
    .map((s) => `<div class="composition-bar-segment" style="width:${s.pct.toFixed(2)}%; background:${s.color};"></div>`)
    .join("");

  const list = segments
    .map((s) => `
      <div class="composition-row">
        <span class="composition-dot" style="background:${s.color};"></span>
        <span class="composition-label">${s.label}</span>
        <span class="composition-pct">${s.pct.toFixed(1)}%</span>
        <span class="composition-value">${formatMoney(s.value)}원</span>
      </div>
    `)
    .join("");

  // 월 현금흐름 = 커버드콜(472150) 평가금액 * 0.0125 (연 15% 배당수익률 가정, CLAUDE.md
  // 실측 기준 — 실제 배당기록과는 별개로, "지금 배분이면 매달 이만큼 나온다"는 예상치임.
  const coveredCallRow = (info ? info.rows : []).find((r) => r.ticker === "472150");
  const monthlyCashflowHtml = coveredCallRow
    ? `<p class="composition-cashflow">예상 월 현금흐름 (커버드콜 기준) <span class="composition-cashflow-amount">${formatMoney(Number(coveredCallRow.krw_current_value) * 0.0125)}원</span></p>`
    : "";

  wrap.innerHTML = `
    <p class="composition-total">총 투자 자산 <span class="composition-total-amount">${formatMoney(total)}원</span></p>
    <div class="composition-bar">${bar}</div>
    <div class="composition-list">${list}</div>
    ${monthlyCashflowHtml}
  `;
}

async function fetchCash() {
  try {
    const res = await fetch("/api/cash", { cache: "no-store" });
    if (!res.ok) return;
    cashByBroker = await res.json();
    for (const broker of Object.keys(balanceData)) renderAssetComposition(broker);
  } catch {
    // 조용히 넘어감 — 잔고/매매기록 등 다른 화면은 정상 동작해야 하므로.
  }
}

function renderBalanceSection(broker) {
  const { rows, summary } = balanceData[broker];
  const profitCls = summary.krwProfit >= 0 ? "buy" : "sell";
  const latest = rows.reduce((max, r) => (r.updated_at > max ? r.updated_at : max), "");
  const asofText = latest
    ? `${new Date(latest).toLocaleString("ko-KR")} 기준 — 새로고침(↻) 또는 접속 시 실시간 갱신됨`
    : "";

  const section = document.createElement("div");
  section.className = "balance-broker-block";
  section.innerHTML = `
    <h3>계좌 잔고 (${BROKER_LABELS[broker] || broker})</h3>

    <div class="asset-composition" id="asset-composition-${broker}"></div>

    <div class="filter-row balance-currency-row" data-broker="${broker}">
      <button class="filter-btn active" data-currency="KRW">원화</button>
      <button class="filter-btn" data-currency="NATIVE">외화</button>
      <button class="filter-btn" data-currency="ALL">모두</button>
      <button class="ghost-btn balance-refresh-btn" data-broker="${broker}" title="잔고 새로고침" aria-label="잔고 새로고침">↻</button>
    </div>
    <div class="summary-bar">
      <div class="summary-chip"><div class="label">총매입(원)</div><div class="value">${formatMoney(summary.krwAvgTotal)}</div></div>
      <div class="summary-chip"><div class="label">총평가(원)</div><div class="value">${formatMoney(summary.krwCurrentTotal)}</div></div>
      <div class="summary-chip ${profitCls}"><div class="label">총수익(원)</div><div class="value">${formatMoney(summary.krwProfit)}</div></div>
      <div class="summary-chip ${profitCls}"><div class="label">총수익률</div><div class="value">${summary.krwProfitRate >= 0 ? "+" : ""}${summary.krwProfitRate.toFixed(2)}%</div></div>
    </div>
    <div class="table-wrap">
      <table class="balance-table">
        <thead><tr><th>시장</th><th>종목명</th><th>보유량</th><th>매입가</th><th>현재가</th><th>평가손익</th><th>수익률</th></tr></thead>
        <tbody id="balance-body-${broker}"></tbody>
      </table>
    </div>
    <p class="sub balance-asof">${asofText}</p>

    <h4>일별 수익 추이 (${BROKER_LABELS[broker] || broker})</h4>
    <div class="filter-row balance-metric-row" data-broker="${broker}">
      <button class="filter-btn active" data-metric="rate">수익률</button>
      <button class="filter-btn" data-metric="profit">수익(원)</button>
    </div>
    <div class="balance-chart-wrap" id="balance-chart-${broker}"></div>

    <h4>매매기록 (${BROKER_LABELS[broker] || broker})</h4>
    <ul class="trade-list" id="trade-list-${broker}"></ul>
    <div class="dividend-list-header">
      <h4>배당기록 (${BROKER_LABELS[broker] || broker})</h4>
      <button type="button" class="ghost-btn add-dividend-btn" data-broker="${broker}">+ 배당 기록 추가</button>
    </div>
    <ul class="trade-list" id="dividend-list-${broker}"></ul>
  `;
  balanceSectionsEl.appendChild(section);
  renderBalanceRowsFor(broker);
  renderAssetComposition(broker);
  renderBalanceChart(broker);

  const tradesForBroker = allTrades.filter((t) => t.account === BROKER_ACCOUNT_TAG[broker]);
  renderTrades(tradesForBroker.filter((t) => t.action !== "dividend"), document.getElementById(`trade-list-${broker}`), "아직 매매 기록이 없습니다.");
  renderTrades(tradesForBroker.filter((t) => t.action === "dividend"), document.getElementById(`dividend-list-${broker}`), "아직 배당 기록이 없습니다.");
}

function renderAllBalanceSections() {
  balanceSectionsEl.innerHTML = "";
  for (const broker of Object.keys(balanceData)) {
    renderBalanceSection(broker);
  }
}

async function fetchBalance() {
  try {
    const res = await fetch("/api/balance", { cache: "no-store" });
    if (!res.ok) return;
    balanceData = await res.json();
    renderAllBalanceSections();
    renderOrphanTrades();
  } catch {
    // 조용히 넘어감 — 매매 기록 등 다른 화면은 정상 동작해야 하므로.
  }
}

// KIS/Kiwoom API를 서버가 그 자리에서 직접 호출해 demo_balance/demo_cash를 최신값으로
// upsert한 다음(POST /api/balance/refresh), 그 결과를 화면에 반영한다(GET 재조회) —
// "새로고침을 눌러도 몇 분 전 스케줄 값 그대로"였던 문제(2026-08-18)를 없애기 위해 도입.
// 증권사 하나가 실패해도(장 마감/키 미설정 등) errors에만 담기고 나머지는 정상 반영된다.
async function refreshLiveBalances() {
  // 먼저 저장된(직전) 값으로 화면부터 빠르게 채운다 — 실시간 조회는 KIS/Kiwoom
  // API를 여러 번 순차 호출해서 몇 초 걸리는데, 그동안 화면이 통째로 비어있는 것처럼
  // 보이던 문제(2026-08-20 피드백)를 없애기 위함. 이후 실시간 값이 오면 다시 그린다.
  await Promise.all([fetchBalance(), fetchBalanceHistory(), fetchCash()]);

  let errors = {};
  try {
    const res = await fetch("/api/balance/refresh", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      errors = data.errors || {};
    }
  } catch {
    // 네트워크 실패 — 이미 저장된 값이 화면에 떠 있으니 조용히 넘어간다.
  }
  await Promise.all([fetchBalance(), fetchBalanceHistory(), fetchCash()]);
  return errors;
}

balanceSectionsEl.addEventListener("click", (e) => {
  const currencyBtn = e.target.closest(".balance-currency-row .filter-btn");
  if (currencyBtn) {
    const row = currencyBtn.closest(".balance-currency-row");
    const broker = row.dataset.broker;
    row.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    currencyBtn.classList.add("active");
    balanceCurrencyByBroker[broker] = currencyBtn.dataset.currency;
    renderBalanceRowsFor(broker);
    return;
  }
  const metricBtn = e.target.closest(".balance-metric-row .filter-btn");
  if (metricBtn) {
    const row = metricBtn.closest(".balance-metric-row");
    const broker = row.dataset.broker;
    row.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    metricBtn.classList.add("active");
    balanceMetricByBroker[broker] = metricBtn.dataset.metric;
    renderBalanceChart(broker);
    return;
  }
  const refreshBtn = e.target.closest(".balance-refresh-btn");
  if (refreshBtn) {
    // 눌러도 화면에 아무 반응이 없어서 "안 눌리는 것 같다"는 피드백(2026-08-18)을 받아서
    // 추가함 — 실제로는 정상 동작하고 있었지만 로딩 표시가 전혀 없었던 게 문제였음.
    refreshBtn.classList.add("spinning");
    refreshBtn.disabled = true;
    refreshLiveBalances()
      .then((errors) => {
        const failedBrokers = Object.keys(errors);
        if (failedBrokers.length > 0) {
          const detail = failedBrokers.map((b) => `${BROKER_LABELS[b] || b}: ${errors[b]}`).join("\n");
          alert(`실시간 갱신에 실패한 계좌가 있습니다(저장된 값을 그대로 보여줍니다):\n${detail}`);
        }
      })
      .finally(() => {
        refreshBtn.classList.remove("spinning");
        refreshBtn.disabled = false;
      });
    return;
  }
  const dividendBtn = e.target.closest(".add-dividend-btn");
  if (dividendBtn) openDividendModal(dividendBtn.dataset.broker);
});

// ---------- 배당 기록 추가 모달(별도 창) ----------
const dividendModalOverlay = document.getElementById("dividend-modal-overlay");
const dividendModalTitle = document.getElementById("dividend-modal-title");
const dividendForm = document.getElementById("dividend-form");
const dmDate = document.getElementById("dm-date");
const dmTicker = document.getElementById("dm-ticker");
const dmAmount = document.getElementById("dm-amount");
const dmMemo = document.getElementById("dm-memo");
const dmError = document.getElementById("dm-error");
const dmCancelBtn = document.getElementById("dm-cancel-btn");

let dividendModalBroker = null;

function openDividendModal(broker) {
  dividendModalBroker = broker;
  dividendModalTitle.textContent = `배당 기록 추가 (${BROKER_LABELS[broker] || broker})`;
  dividendForm.reset();
  dmDate.value = new Date().toISOString().slice(0, 10);
  dmError.textContent = "";
  dividendModalOverlay.hidden = false;
}

function closeDividendModal() {
  dividendModalOverlay.hidden = true;
  dividendModalBroker = null;
}

dmCancelBtn.addEventListener("click", closeDividendModal);
dividendModalOverlay.addEventListener("click", (e) => {
  if (e.target === dividendModalOverlay) closeDividendModal();
});

dividendForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  dmError.textContent = "";

  const payload = {
    trade_date: dmDate.value,
    ticker: dmTicker.value.trim(),
    action: "dividend",
    quantity: 1,
    price: dmAmount.value,
    fg_score: null,
    account: BROKER_ACCOUNT_TAG[dividendModalBroker],
    memo: dmMemo.value.trim() || null,
  };

  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json();
    dmError.textContent = err.error || "저장 중 오류가 발생했습니다.";
    return;
  }

  closeDividendModal();
  await fetchTrades();
});

refreshLiveBalances();

// 1분마다 자동으로 실시간 재조회 — 화면을 계속 열어두고 있으면 값이 계속 최신으로
// 유지된다(2026-08-18, 사용자 요청). 수동 새로고침 버튼과 달리 실패해도 alert로
// 방해하지 않고 콘솔에만 남긴다 — 매분 팝업이 뜨면 오히려 불편하기 때문.
setInterval(() => {
  refreshLiveBalances().then((errors) => {
    if (Object.keys(errors).length > 0) console.warn("자동 새로고침 중 일부 계좌 실패:", errors);
  });
}, 60_000);
