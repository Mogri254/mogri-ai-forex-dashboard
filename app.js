const markets = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "XAU/USD",
  "USD/CAD",
  "AUD/USD"
];

const tfMap = {
  "5M": "5min",
  "15M": "15min",
  "1H": "1h",
  "4H": "4h"
};

const CACHE_TIME = 60 * 1000;

const marketCache = new Map();

// IMPORTANT:
// Scanner results are saved here.
// Analyze Selected uses the exact same object.
const scannerResults = new Map();

let currentSignal = null;
let scanRunning = false;

function $(id) {
  return document.getElementById(id);
}

function selectedMarket() {
  return $("marketSelect")?.value || "EUR/USD";
}

function selectedTimeframe() {
  return $("timeframeSelect")?.value || "15M";
}

function cacheKey(pair, tf) {
  return `${pair}_${tf}`;
}

function conditionExists(value) {
  if (value === null || value === undefined) return false;

  const text = String(value).toUpperCase();

  return ![
    "",
    "NONE",
    "NEUTRAL",
    "NO",
    "FALSE",
    "NULL",
    "UNDEFINED"
  ].includes(text);
}

async function analyze(pair, tf = "15M") {
  const interval = tfMap[tf] || "15min";
  const key = cacheKey(pair, tf);

  const cached = marketCache.get(key);

  if (
    cached &&
    Date.now() - cached.timestamp < CACHE_TIME
  ) {
    return cached.data;
  }

  const url =
    `/api/market?symbol=${encodeURIComponent(pair)}` +
    `&interval=${encodeURIComponent(interval)}`;

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store"
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      `Market server returned HTTP ${response.status}.`
    );
  }

  if (!response.ok || data?.ok === false) {
    const message =
      data?.error ||
      data?.message ||
      `Market server returned HTTP ${response.status}.`;

    const error = new Error(message);

    error.status = response.status;
    error.type = data?.type || "API_ERROR";

    throw error;
  }

  marketCache.set(key, {
    timestamp: Date.now(),
    data
  });

  return data;
}

// ---------------------------------------------------------
// DISPLAY HELPERS
// ---------------------------------------------------------

function money(value) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "—";
  }

  return Number(value).toLocaleString(
    undefined,
    {
      maximumFractionDigits: 5
    }
  );
}

function signalClass(signal) {
  if (signal === "BUY") return "buy";
  if (signal === "SELL") return "sell";
  return "wait";
}

function signalTitle(signal) {
  if (signal === "BUY") return "BUY";
  if (signal === "SELL") return "SELL";
  return "WAIT";
}

function levelsHTML(data) {
  if (!data) return "";

  if (!["BUY", "SELL"].includes(data.signal)) {
    return `
      <div class="levels-card">
        <div class="levels-title">TRADE LEVELS</div>
        <div class="no-entry">
          No confirmed entry yet.
        </div>
      </div>
    `;
  }

  return `
    <div class="levels-card">
      <div class="levels-title">
        ${data.signal} TRADE LEVELS
      </div>

      <div class="level-row">
        <span>ENTRY ZONE</span>
        <strong>
          ${money(data.entryLow)}
          -
          ${money(data.entryHigh)}
        </strong>
      </div>

      <div class="level-row sl">
        <span>STOP LOSS</span>
        <strong>${money(data.sl)}</strong>
      </div>

      <div class="level-row tp">
        <span>TP1</span>
        <strong>${money(data.tp1)}</strong>
      </div>

      <div class="level-row tp">
        <span>TP2</span>
        <strong>${money(data.tp2)}</strong>
      </div>

      <div class="level-row tp">
        <span>TP3</span>
        <strong>${money(data.tp3)}</strong>
      </div>
    </div>
  `;
}

function analysisDetailsHTML(data) {
  return `
    <div class="analysis-card">
      <div class="analysis-title">
        MARKET ANALYSIS
      </div>

      <div class="analysis-grid">

        <div>
          <span>BIAS</span>
          <strong>${data.bias || "—"}</strong>
        </div>

        <div>
          <span>STRUCTURE</span>
          <strong>${data.structure || "—"}</strong>
        </div>

        <div>
          <span>BOS</span>
          <strong>${data.bos || "—"}</strong>
        </div>

        <div>
          <span>LIQUIDITY</span>
          <strong>${data.liquidity || "—"}</strong>
        </div>

        <div>
          <span>FVG</span>
          <strong>${data.fvg || "—"}</strong>
        </div>

        <div>
          <span>MOMENTUM</span>
          <strong>${data.momentum || "—"}</strong>
        </div>

        <div>
          <span>BULL SCORE</span>
          <strong>${data.bullScore ?? "—"}</strong>
        </div>

        <div>
          <span>BEAR SCORE</span>
          <strong>${data.bearScore ?? "—"}</strong>
        </div>

      </div>
    </div>
  `;
}

function orderBlockHTML(data) {
  const type =
    data.obType ||
    data.orderBlock?.type ||
    "NONE";

  if (!conditionExists(type)) {
    return `
      <div class="analysis-card">
        <div class="analysis-title">
          ORDER BLOCK
        </div>

        <div class="no-entry">
          No confirmed order block.
        </div>
      </div>
    `;
  }

  return `
    <div class="analysis-card">
      <div class="analysis-title">
        ORDER BLOCK
      </div>

      <div class="analysis-grid">

        <div>
          <span>TYPE</span>
          <strong>${type}</strong>
        </div>

        <div>
          <span>STATUS</span>
          <strong>${data.obStatus || "—"}</strong>
        </div>

        <div>
          <span>HIGH</span>
          <strong>${money(data.obHigh)}</strong>
        </div>

        <div>
          <span>LOW</span>
          <strong>${money(data.obLow)}</strong>
        </div>

      </div>
    </div>
  `;
}

// ---------------------------------------------------------
// MAIN ANALYSIS DISPLAY
// ---------------------------------------------------------

function show(data, source = "ANALYSIS") {
  currentSignal = data;

  window.mogriCurrentSignal = data;

  const signal = data.signal || "WAIT";

  const confidence =
    Number.isFinite(Number(data.confidence))
      ? Number(data.confidence)
      : 0;

  const container =
    $("analysisResult") ||
    $("result") ||
    $("analysis");

  if (!container) return;

  container.innerHTML = `
    <div class="signal-result ${signalClass(signal)}">

      <div class="result-top">

        <div class="signal-badge">
          ${signalTitle(signal)}
        </div>

        <div class="result-time">
          ${data.time || ""}
        </div>

      </div>

      <div class="result-pair">
        ${data.pair || selectedMarket()}
      </div>

      <div class="result-signal">
        ${signal}
      </div>

      <div class="result-confidence">
        CONFIDENCE
        <strong>${confidence}%</strong>
      </div>

      <div class="result-price">
        PRICE:
        <strong>${money(data.price)}</strong>
      </div>

      <div class="result-source">
        ${source}
      </div>

      ${levelsHTML(data)}

      ${analysisDetailsHTML(data)}

      ${orderBlockHTML(data)}

    </div>
  `;

  addHistory(data);
}

// ---------------------------------------------------------
// ERROR DISPLAY
// ---------------------------------------------------------

function showError(error, pair = selectedMarket()) {
  const container =
    $("analysisResult") ||
    $("result") ||
    $("analysis");

  if (!container) return;

  let title = "Live analysis unavailable";
  let message = error?.message || "Unknown market server error.";

  if (
    error?.type === "API_LIMIT" ||
    error?.status === 429
  ) {
    title = "Twelve Data limit reached";

    message =
      "The market-data limit has been reached. " +
      "Wait for the Twelve Data limit to reset before scanning again.";
  }

  container.innerHTML = `
    <div class="signal-result wait">

      <div class="result-top">

        <div class="signal-badge">
          WAIT
        </div>

        <div class="result-time">
          ${new Date().toLocaleTimeString()}
        </div>

      </div>

      <h2>${title}</h2>

      <p>${message}</p>

      <div class="live-data-box">
        <strong>LIVE MARKET DATA</strong>
        <span>
          ${pair} • Market server response error
        </span>
      </div>

    </div>
  `;
}

// ---------------------------------------------------------
// SCANNER CARD
// ---------------------------------------------------------

function card(data) {
  const signal = data.signal || "WAIT";

  return `
    <div
      class="scanner-card ${signalClass(signal)}"
      data-pair="${data.pair}"
    >

      <div class="scanner-header">

        <strong>
          ${data.pair}
        </strong>

        <span class="scanner-signal">
          ${signal}
        </span>

      </div>

      <div class="scanner-confidence">
        ${data.confidence ?? 0}%
      </div>

      <div class="scanner-timeframe">
        ${data.tf || "15M"}
      </div>

      <div class="scanner-details">

        <div>
          <span>FVG</span>
          <strong>${data.fvg || "NONE"}</strong>
        </div>

        <div>
          <span>LIQUIDITY</span>
          <strong>${data.liquidity || "NONE"}</strong>
        </div>

        <div>
          <span>STRUCTURE</span>
          <strong>${data.structure || "—"}</strong>
        </div>

        <div>
          <span>BOS</span>
          <strong>${data.bos || "—"}</strong>
        </div>

        <div>
          <span>OB</span>
          <strong>${data.obType || "NONE"}</strong>
        </div>

      </div>

      ${
        ["BUY", "SELL"].includes(signal)
          ? `
            <div class="scanner-levels">
              <div>
                <span>ENTRY</span>
                <strong>
                  ${money(data.entryLow)}
                  -
                  ${money(data.entryHigh)}
                </strong>
              </div>

              <div>
                <span>SL</span>
                <strong>${money(data.sl)}</strong>
              </div>

              <div>
                <span>TP1</span>
                <strong>${money(data.tp1)}</strong>
              </div>

              <div>
                <span>TP2</span>
                <strong>${money(data.tp2)}</strong>
              </div>

              <div>
                <span>TP3</span>
                <strong>${money(data.tp3)}</strong>
              </div>
            </div>
          `
          : `
            <div class="scanner-wait">
              No confirmed entry.
            </div>
          `
      }

    </div>
  `;
}

// ---------------------------------------------------------
// SCAN ALL MARKETS
// ---------------------------------------------------------

async function scan() {
  if (scanRunning) return;

  scanRunning = true;

  const scanner =
    $("scannerResults") ||
    $("marketScanner") ||
    $("scanner");

  if (scanner) {
    scanner.innerHTML = `
      <div class="scanner-loading">
        Scanning live market data...
      </div>
    `;
  }

  const results = [];

  for (const pair of markets) {
    try {
      // IMPORTANT:
      // Scanner uses 15M.
      // Analyze Selected will use this exact saved result.
      const data = await analyze(pair, "15M");

      scannerResults.set(pair, data);

      results.push(data);

      if (scanner) {
        scanner.innerHTML =
          results.map(card).join("");
      }

    } catch (error) {
      console.error(
        `Scanner error for ${pair}:`,
        error
      );

      results.push({
        pair,
        signal: "ERROR",
        confidence: 0,
        error: error.message
      });

      if (scanner) {
        scanner.innerHTML =
          results
            .map(item =>
              item.signal === "ERROR"
                ? `
                  <div class="scanner-card wait">
                    <div class="scanner-header">
                      <strong>${item.pair}</strong>
                      <span class="scanner-signal">
                        ERROR
                      </span>
                    </div>

                    <div class="scanner-wait">
                      ${item.error}
                    </div>
                  </div>
                `
                : card(item)
            )
            .join("");
      }
    }
  }

  scanRunning = false;

  updateStats(results);
}

// ---------------------------------------------------------
// ANALYZE SELECTED
// ---------------------------------------------------------

async function analyzeSelected() {
  const pair = selectedMarket();

  /*
   * CRITICAL FIX:
   *
   * If Scanner already analyzed this pair,
   * DO NOT call the API again.
   *
   * We display the exact saved scanner result.
   *
   * Therefore:
   * Scanner signal = Analyze signal
   * Scanner confidence = Analyze confidence
   * Scanner entry = Analyze entry
   * Scanner SL = Analyze SL
   * Scanner TP1/TP2/TP3 = Analyze TP1/TP2/TP3
   */

  const saved = scannerResults.get(pair);

  if (saved) {
    show(
      saved,
      "SCANNER CONFIRMED RESULT"
    );

    return;
  }

  /*
   * If Scanner has not been run yet,
   * perform ONE 15M analysis and save it.
   */

  try {
    const data = await analyze(pair, "15M");

    scannerResults.set(pair, data);

    show(
      data,
      "LIVE 15M ANALYSIS"
    );

  } catch (error) {
    console.error(
      "Analyze Selected error:",
      error
    );

    showError(error, pair);
  }
}

// ---------------------------------------------------------
// STATS
// ---------------------------------------------------------

function updateStats(results) {
  const valid = results.filter(
    r => r && r.signal && r.signal !== "ERROR"
  );

  const buy = valid.filter(
    r => r.signal === "BUY"
  ).length;

  const sell = valid.filter(
    r => r.signal === "SELL"
  ).length;

  const wait = valid.filter(
    r => r.signal === "WAIT"
  ).length;

  const avg =
    valid.length
      ? Math.round(
          valid.reduce(
            (sum, r) =>
              sum + Number(r.confidence || 0),
            0
          ) / valid.length
        )
      : null;

  setText(
    [
      "marketsScanned",
      "scannedCount",
      "totalMarkets"
    ],
    valid.length
  );

  setText(
    [
      "buySignals",
      "buyCount"
    ],
    buy
  );

  setText(
    [
      "sellSignals",
      "sellCount"
    ],
    sell
  );

  setText(
    [
      "waitSignals",
      "waitCount"
    ],
    wait
  );

  setText(
    [
      "avgConfidence",
      "averageConfidence"
    ],
    avg === null ? "—" : `${avg}%`
  );
}

function setText(ids, value) {
  for (const id of ids) {
    const el = $(id);

    if (el) {
      el.textContent = value;
      return;
    }
  }
}

// ---------------------------------------------------------
// HISTORY
// ---------------------------------------------------------

function addHistory(data) {
  if (!data) return;

  const history =
    $("signalHistory") ||
    $("history");

  if (!history) return;

  const item = document.createElement("div");

  item.className =
    `history-item ${signalClass(data.signal)}`;

  item.innerHTML = `
    <div>
      <strong>${data.pair}</strong>
      <span>${data.signal}</span>
    </div>

    <div>
      ${data.confidence ?? 0}%
    </div>

    <small>
      ${new Date().toLocaleTimeString()}
    </small>
  `;

  history.prepend(item);

  while (history.children.length > 10) {
    history.removeChild(
      history.lastElementChild
    );
  }
}

// ---------------------------------------------------------
// MODE / OLD DEMO TEXT CLEANUP
// ---------------------------------------------------------

function cleanOldDemoText() {
  const elements =
    document.querySelectorAll(
      "body *"
    );

  elements.forEach(el => {
    if (el.children.length > 0) return;

    const text =
      el.textContent?.trim() || "";

    if (
      /DEMO MODE.*NO ACTUAL TRADES/i.test(text) ||
      /DEMO MODE/i.test(text)
    ) {
      el.textContent =
        "● LIVE MARKET DATA";
    }
  });
}

// ---------------------------------------------------------
// EVENT SETUP
// ---------------------------------------------------------

function setup() {
  cleanOldDemoText();

  const scanButton =
    $("scanButton") ||
    $("scanMarkets") ||
    $("scanBtn");

  if (scanButton) {
    scanButton.addEventListener(
      "click",
      scan
    );
  }

  const analyzeButton =
    $("analyzeSelected") ||
    $("analyzeButton") ||
    $("analyzeBtn");

  if (analyzeButton) {
    analyzeButton.addEventListener(
      "click",
      analyzeSelected
    );
  }

  const marketSelect =
    $("marketSelect");

  const timeframeSelect =
    $("timeframeSelect");

  if (marketSelect) {
    marketSelect.addEventListener(
      "change",
      () => {
        const saved =
          scannerResults.get(
            marketSelect.value
          );

        if (saved) {
          show(
            saved,
            "SCANNER CONFIRMED RESULT"
          );
        }
      }
    );
  }

  if (timeframeSelect) {
    timeframeSelect.addEventListener(
      "change",
      () => {
        /*
         * We intentionally do not automatically
         * call the API here.
         *
         * This protects the Twelve Data quota.
         */
      }
    );
  }

  window.mogriScan = scan;
  window.mogriAnalyzeSelected =
    analyzeSelected;

  console.log(
    "MOGRI AI FOREX SIGNAL ANALYZER ready."
  );
}

// ---------------------------------------------------------
// START
// ---------------------------------------------------------

if (
  document.readyState === "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    setup
  );
} else {
  setup();
}
