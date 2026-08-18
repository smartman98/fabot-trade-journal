// KIS/Kiwoom 모의투자 계좌 잔고를 실시간으로 조회한다 — fg-index의 push_demo_balance.py /
// push_demo_balance_kiwoom.py(파이썬, 로컬 스케줄 실행)와 정확히 같은 필드/엔드포인트를
// Node로 그대로 옮긴 버전. "새로고침" 버튼을 눌렀을 때 그 자리에서 최신값을 받아오기 위해
// 클라우드(Render)에 배포된 이 서버 안에서 직접 호출한다.
//
// 두 증권사 중 하나의 API키가 없거나(Render 환경변수 미설정) 호출이 실패해도 나머지 하나는
// 정상 동작해야 하므로, 각 브로커 조회는 개별적으로 catch해서 { error } 형태로 반환한다 —
// 절대 전체 요청을 함께 죽이지 않는다.

const COVERED_CALL_STOCK_CODE = "472150";
const COVERED_CALL_LABEL = "TIGER 배당커버드콜액티브(472150)";
const TQQQ_EXCG = "NASD";
const ACNT_PRDT_CD = "01";

let lastCallAt = 0;
const MIN_CALL_INTERVAL_MS = 1000;
async function throttle() {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_CALL_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_CALL_INTERVAL_MS - elapsed));
  }
  lastCallAt = Date.now();
}

// ── KIS ──────────────────────────────────────────────────────────────────

const KIS_BASE_URL = "https://openapivts.koreainvestment.com:29443";
let kisToken = null; // { access_token, access_token_token_expired }

function kisCano() {
  const cano = process.env.KIS_PAPER_STOCK;
  if (!cano) throw new Error("KIS_PAPER_STOCK 환경변수가 없습니다.");
  return cano;
}

function kisIsTokenValid() {
  if (!kisToken) return false;
  const expiresAt = new Date(kisToken.access_token_token_expired.replace(" ", "T") + "+09:00");
  return expiresAt.getTime() - Date.now() > 5 * 60 * 1000;
}

async function kisGetToken() {
  if (kisIsTokenValid()) return kisToken.access_token;

  const appKey = process.env.KIS_PAPER_APP_KEY;
  const appSecret = process.env.KIS_PAPER_APP_SECRET;
  if (!appKey || !appSecret) throw new Error("KIS_PAPER_APP_KEY/SECRET 환경변수가 없습니다.");

  await throttle();
  const response = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret }),
  });
  if (!response.ok) throw new Error(`KIS 토큰 발급 실패: HTTP ${response.status}`);
  kisToken = await response.json();
  return kisToken.access_token;
}

async function kisHeaders(trId) {
  const token = await kisGetToken();
  return {
    "content-type": "application/json; charset=utf-8",
    authorization: `Bearer ${token}`,
    appkey: process.env.KIS_PAPER_APP_KEY,
    appsecret: process.env.KIS_PAPER_APP_SECRET,
    tr_id: trId,
    custtype: "P",
  };
}

async function kisGet(path, trId, params) {
  await throttle();
  const url = new URL(`${KIS_BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = await fetch(url, { headers: await kisHeaders(trId) });
  if (!response.ok) throw new Error(`KIS API 실패 (${trId}): HTTP ${response.status}`);
  const data = await response.json();
  if (data.rt_cd !== "0") throw new Error(`KIS API 실패 (${trId}): ${data.msg1}`);
  return data;
}

async function kisDomesticAskingPrice(pdno) {
  const data = await kisGet(
    "/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn",
    "FHKST01010200",
    { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: pdno }
  );
  return data.output1;
}

async function kisDomesticBalanceRaw() {
  return kisGet("/uapi/domestic-stock/v1/trading/inquire-balance", "VTTC8434R", {
    CANO: kisCano(),
    ACNT_PRDT_CD,
    AFHR_FLPR_YN: "N",
    OFL_YN: "",
    INQR_DVSN: "02",
    UNPR_DVSN: "01",
    FUND_STTL_ICLD_YN: "N",
    FNCG_AMT_AUTO_RDPT_YN: "N",
    PRCS_DVSN: "00",
    CTX_AREA_FK100: "",
    CTX_AREA_NK100: "",
  });
}

async function kisGetHolding(pdno) {
  const data = await kisDomesticBalanceRaw();
  const match = data.output1.find((r) => r.pdno === pdno);
  if (!match) return null;
  return { qty: Number(match.hldg_qty), avg_price: Number(match.pchs_avg_pric) };
}

async function kisGetCashBalance() {
  const data = await kisDomesticBalanceRaw();
  return Number(data.output2[0].dnca_tot_amt);
}

const QUOTE_EXCD_BY_ORDER_EXCG = { NASD: "NAS", NYSE: "NYS", AMEX: "AMS" };

async function kisOverseasAskingPrice(pdno, excg) {
  const quoteExcd = QUOTE_EXCD_BY_ORDER_EXCG[excg] || excg;
  const data = await kisGet("/uapi/overseas-price/v1/quotations/inquire-asking-price", "HHDFS76200100", {
    AUTH: "",
    EXCD: quoteExcd,
    SYMB: pdno,
  });
  return data.output2; // 단일 객체
}

async function kisGetOverseasHolding(pdno, excg) {
  const data = await kisGet("/uapi/overseas-stock/v1/trading/inquire-balance", "VTTS3012R", {
    CANO: kisCano(),
    ACNT_PRDT_CD,
    OVRS_EXCG_CD: excg,
    TR_CRCY_CD: "USD",
    CTX_AREA_FK200: "",
    CTX_AREA_NK200: "",
  });
  const match = data.output1.find((r) => r.ovrs_pdno === pdno);
  if (!match) return null;
  return { qty: Number(match.ovrs_cblc_qty), avg_price: Number(match.pchs_avg_pric) };
}

async function kisGetOverseasCashBalanceUsd(pdno, excg, refPrice) {
  const data = await kisGet("/uapi/overseas-stock/v1/trading/inquire-psamount", "VTTS3007R", {
    CANO: kisCano(),
    ACNT_PRDT_CD,
    OVRS_EXCG_CD: excg,
    OVRS_ORD_UNPR: refPrice.toFixed(2),
    ITEM_CD: pdno,
  });
  return Number(data.output.ord_psbl_frcr_amt);
}

async function kisGetUsdKrwRate(refPrice) {
  const data = await kisGet("/uapi/overseas-stock/v1/trading/inquire-psamount", "VTTS3007R", {
    CANO: kisCano(),
    ACNT_PRDT_CD,
    OVRS_EXCG_CD: TQQQ_EXCG,
    OVRS_ORD_UNPR: refPrice.toFixed(2),
    ITEM_CD: "TQQQ",
  });
  return Number(data.output.exrt);
}

// 장이 닫혀 호가가 0으로 오면(2026-08-14 파이썬 스크립트에서 실측된 현상과 동일), 방금
// 저장돼있던 현재가를 그대로 재사용한다 — supabase 클라이언트는 server.js에서 주입받는다.
async function previousCurrentPrice(supabase, broker, ticker) {
  const { data } = await supabase
    .from("demo_balance")
    .select("current_price")
    .eq("broker", broker)
    .eq("ticker", ticker)
    .maybeSingle();
  return data ? Number(data.current_price) : null;
}

async function fetchKisSnapshot(supabase) {
  const rows = [];

  const domestic = await kisGetHolding(COVERED_CALL_STOCK_CODE);
  if (domestic && domestic.qty > 0) {
    const book = await kisDomesticAskingPrice(COVERED_CALL_STOCK_CODE);
    let currentPrice = Number(book.askp1);
    if (!(currentPrice > 0)) {
      currentPrice = (await previousCurrentPrice(supabase, "KIS", COVERED_CALL_STOCK_CODE)) ?? domestic.avg_price;
    }
    rows.push({
      broker: "KIS",
      ticker: COVERED_CALL_STOCK_CODE,
      market: "domestic",
      label: COVERED_CALL_LABEL,
      quantity: domestic.qty,
      avg_price: domestic.avg_price,
      current_price: currentPrice,
      currency: "KRW",
      krw_avg_value: domestic.avg_price * domestic.qty,
      krw_current_value: currentPrice * domestic.qty,
    });
  }

  const overseas = await kisGetOverseasHolding("TQQQ", TQQQ_EXCG);
  let exrtForCash = null;
  if (overseas && overseas.qty > 0) {
    const book = await kisOverseasAskingPrice("TQQQ", TQQQ_EXCG);
    let currentPrice = Number(book.pask1);
    if (!(currentPrice > 0)) {
      currentPrice = (await previousCurrentPrice(supabase, "KIS", "TQQQ")) ?? overseas.avg_price;
    }
    const exrt = await kisGetUsdKrwRate(currentPrice);
    exrtForCash = exrt;
    rows.push({
      broker: "KIS",
      ticker: "TQQQ",
      market: "overseas",
      label: "TQQQ",
      quantity: overseas.qty,
      avg_price: overseas.avg_price,
      current_price: currentPrice,
      currency: "USD",
      krw_avg_value: overseas.avg_price * overseas.qty * exrt,
      krw_current_value: currentPrice * overseas.qty * exrt,
    });
  }

  const domesticCash = await kisGetCashBalance();
  const book = await kisOverseasAskingPrice("TQQQ", TQQQ_EXCG);
  const refPrice = Number(book.pask1) || 1.0;
  const overseasCashUsd = await kisGetOverseasCashBalanceUsd("TQQQ", TQQQ_EXCG, refPrice);
  const exrt = exrtForCash ?? (await kisGetUsdKrwRate(refPrice));
  const cashKrw = domesticCash + overseasCashUsd * exrt;

  return { rows, cashKrw };
}

// ── Kiwoom ───────────────────────────────────────────────────────────────

const KIWOOM_DEMO_BASE_URL = "https://mockapi.kiwoom.com";
let kiwoomToken = null; // { token, expires_dt }

function kiwoomIsTokenValid() {
  if (!kiwoomToken) return false;
  // expires_dt 포맷: YYYYMMDDHHMMSS (kiwoom_client.py와 동일)
  const s = kiwoomToken.expires_dt;
  const expiresAt = new Date(
    `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}`
  );
  return expiresAt.getTime() - Date.now() > 5 * 60 * 1000;
}

async function kiwoomGetToken() {
  if (kiwoomIsTokenValid()) return kiwoomToken.token;

  const appKey = process.env.KIWOOM_PAPER_APP_KEY;
  const appSecret = process.env.KIWOOM_PAPER_APP_SECRET;
  if (!appKey || !appSecret) throw new Error("KIWOOM_PAPER_APP_KEY/SECRET 환경변수가 없습니다.");

  await throttle();
  const response = await fetch(`${KIWOOM_DEMO_BASE_URL}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/json;charset=UTF-8" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, secretkey: appSecret }),
  });
  if (!response.ok) throw new Error(`Kiwoom 토큰 발급 실패: HTTP ${response.status}`);
  const body = await response.json();
  if (!body.token) throw new Error(`Kiwoom 토큰 발급 실패: ${JSON.stringify(body)}`);
  kiwoomToken = body;
  return kiwoomToken.token;
}

async function kiwoomPost(apiId, path, body, { retryOnInvalidToken = true } = {}) {
  await throttle();
  const token = await kiwoomGetToken();
  const response = await fetch(`${KIWOOM_DEMO_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json;charset=UTF-8",
      authorization: `Bearer ${token}`,
      "api-id": apiId,
      "cont-yn": "N",
      "next-key": "",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Kiwoom API 실패 (${apiId}): HTTP ${response.status}`);
  const data = await response.json();
  if (data.return_code === 0 || data.return_code === "0" || data.return_code == null) return data;

  const msg = String(data.return_msg || "");
  const invalidToken = msg.includes("Token") && (msg.includes("유효하지") || msg.includes("인증에 실패"));
  if (retryOnInvalidToken && invalidToken) {
    kiwoomToken = null;
    return kiwoomPost(apiId, path, body, { retryOnInvalidToken: false });
  }
  throw new Error(`Kiwoom API 실패 (${apiId}): ${msg}`);
}

async function kiwoomGetDomesticHoldings() {
  return kiwoomPost("kt00018", "/api/dostk/acnt", { qry_tp: "1", dmst_stex_tp: "KRX" });
}

async function kiwoomGetDomesticCashBalance() {
  return kiwoomPost("kt00001", "/api/dostk/acnt", { qry_tp: "2" });
}

async function fetchKiwoomSnapshot() {
  const data = await kiwoomGetDomesticHoldings();
  const rows = [];
  for (const holding of data.acnt_evlt_remn_indv_tot || []) {
    const qty = Number(holding.rmnd_qty);
    if (!(qty > 0)) continue;
    const avgPrice = Number(holding.pur_pric);
    const currentPrice = Number(holding.cur_prc);
    const stkCd = String(holding.stk_cd).replace(/^A/, "");
    rows.push({
      broker: "Kiwoom",
      ticker: stkCd,
      market: "domestic",
      label: `${holding.stk_nm}(${stkCd})`,
      quantity: qty,
      avg_price: avgPrice,
      current_price: currentPrice,
      currency: "KRW",
      krw_avg_value: avgPrice * qty,
      krw_current_value: currentPrice * qty,
    });
  }

  const cashData = await kiwoomGetDomesticCashBalance();
  const cashKrw = Number(cashData.ord_alow_amt);

  return { rows, cashKrw };
}

// ── 통합 ─────────────────────────────────────────────────────────────────

// 두 브로커를 각각 독립적으로 조회한다 — 한쪽 API키가 없거나 실패해도 다른 쪽은 그대로 반환.
async function fetchLiveSnapshot(supabase) {
  const result = {};

  try {
    result.KIS = { ...(await fetchKisSnapshot(supabase)), error: null };
  } catch (err) {
    result.KIS = { rows: null, cashKrw: null, error: err.message };
  }

  try {
    result.Kiwoom = { ...(await fetchKiwoomSnapshot()), error: null };
  } catch (err) {
    result.Kiwoom = { rows: null, cashKrw: null, error: err.message };
  }

  return result;
}

module.exports = { fetchLiveSnapshot };
