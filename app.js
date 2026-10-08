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

const cache = new Map();
const scannerResults = new Map();

let scanning = false;
let currentSignal = null;

const $ = id => document.getElementById(id);

function money(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "—";
  }

  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 5
  });
}

function signalClass(signal) {
  if (signal === "BUY") return "buy";
  if (signal === "SELL") return "sell";
  return "wait";
}

function errorMessage(error) {
  if (error?.type === "API_LIMIT" || error?.status === 429) {
    return "Twelve Data API limit reached. Please wait for the limit to reset.";
  }

  return error?.message || "Market server error.";
}

// --------------------------------------------------
// API
// --------------------------------------------------

async function getMarket(pair, tf = "15M") {
  const interval = tfMap[tf] || "15min";
  const key = `${pair}_${interval}`;

  const cached = cache.get(key);

  if (cached && Date.now() - cached.time < CACHE_TIME) {
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
    throw new Error(`Server returned HTTP ${response.status}`);
  }

  if (!response.ok || data.ok === false) {
    const error = new Error(
      data.error || `Server returned HTTP ${response.status}`
    );

    error.status = response.status;
    error.type = data.type;

    throw error;
  }

  cache.set(key, {
    time: Date.now(),
    data
  });

  return data;
}

// --------------------------------------------------
// TRADE LEVELS
// --------------------------------------------------

function levelsHTML(data) {
  if (!["BUY", "SELL"].includes(data.signal)) {
    return `
      <div class="levels">
        <h3>TRADE LEVELS</h3>
        <p>No confirmed entry yet.</p>
      </div>
    `;
  }

  return `
    <div class="levels">
      <h3>${data.signal} TRADE LEVELS</h3>

      <div>
        <span>ENTRY</span>
        <strong>
          ${money(data.entryLow)}
          -
          ${money(data.entryHigh)}
        </strong>
      </div>

      <div>
        <span>STOP LOSS</span>
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
  `;
}

// --------------------------------------------------
// SHOW ANALYSIS
// --------------------------------------------------

function showAnalysis(data, source = "LIVE MARKET DATA") {
  currentSignal = data;
  window.mogriCurrentSignal = data;

  const signalBox = $("signal");

  if (!signalBox) return;

  const signal = data.signal || "WAIT";
  const confidence = data.confidence ?? 0;

  $("time").textContent =
    data.time ||
    new Date().toLocaleTimeString();

  signalBox.className =
    `signal ${signalClass(signal)}`;

  signalBox.innerHTML = `
    <div class="signal-top">
      <span class="pill ${signalClass(signal)}">
        ${signal}
      </span>

      <span id="time">
        ${data.time || new Date().toLocaleTimeString()}
      </span>
    </div>

    <h2>
      ${data.pair || "Market"}
      — ${signal}
    </h2>

    <div class="confidence">
      <small>CONFIDENCE</small>
      <strong>${confidence}%</strong>
    </div>

    <div class="price">
      PRICE:
      <strong>${money(data.price)}</strong>
    </div>

    <div class="analysis-source">
      ${source}
    </div>

    ${levelsHTML(data)}

    <div class="details">

      <div>
        <small>BIAS</small>
        <strong>${data.bias || "—"}</strong>
      </div>

      <div>
        <small>STRUCTURE</small>
        <strong>${data.structure || "—"}</strong>
      </div>

      <div>
        <small>BOS</small>
        <strong>${data.bos || "—"}</strong>
      </div>

      <div>
        <small>LIQUIDITY</small>
        <strong>${data.liquidity || "—"}</strong>
      </div>

      <div>
        <small>FVG</small>
        <strong>${data.fvg || "—"}</strong>
      </div>

      <div>
        <small>MOMENTUM</small>
        <strong>${data.momentum || "—"}</strong>
      </div>

      <div>
        <small>BULL SCORE</small>
        <strong>${data.bullScore ?? "—"}</strong>
      </div>

      <div>
        <small>BEAR SCORE</small>
        <strong>${data.bearScore ?? "—"}</strong>
      </div>

    </div>

    <div class="order-block">
      <h3>ORDER BLOCK</h3>

      <p>
        Type:
        <strong>
          ${data.obType || "NONE"}
        </strong>
      </p>

      <p>
        Status:
        <strong>
          ${data.obStatus || "—"}
        </strong>
      </p>

      <p>
        Zone:
        <strong>
          ${money(data.obLow)}
          -
          ${money(data.obHigh)}
        </strong>
      </p>
    </div>
  `;

  addHistory(data);
}

// --------------------------------------------------
// ERROR
// --------------------------------------------------

function showError(error) {
  const signalBox = $("signal");

  if (!signalBox) return;

  const message = errorMessage(error);

  signalBox.className = "signal wait";

  signalBox.innerHTML = `
    <div class="signal-top">
      <span class="pill wait">WAIT</span>
      <span>
        ${new Date().toLocaleTimeString()}
      </span>
    </div>

    <h2>Live analysis unavailable</h2>

    <p class="muted">
      ${message}
    </p>

    <div class="live-data">
      <strong>● LIVE MARKET DATA</strong>
      <p>
        Check the market server response and Twelve Data connection.
      </p>
    </div>
  `;
}

// --------------------------------------------------
// SCANNER CARD
// --------------------------------------------------

function scannerCard(data) {
  const signal = data.signal || "WAIT";

  if (signal === "ERROR") {
    return `
      <article class="market-card wait">
        <div class="market-head">
          <strong>${data.pair}</strong>
          <span class="pill wait">ERROR</span>
        </div>

        <p class="muted">
          ${data.error}
        </p>
      </article>
    `;
  }

  return `
    <article class="market-card ${signalClass(signal)}">

      <div class="market-head">
        <strong>${data.pair}</strong>

        <span class="pill ${signalClass(signal)}">
          ${signal}
        </span>
      </div>

      <div class="scanner-confidence">
        ${data.confidence ?? 0}%
      </div>

      <div class="scanner-info">
        <span>
          ${data.tf || "15M"}
        </span>

        <span>
          ${data.structure || "NEUTRAL"}
        </span>

        <span>
          ${data.bos || "NONE"}
        </span>
      </div>

      <div class="scanner-info">
        <span>
          FVG: ${data.fvg || "NONE"}
        </span>

        <span>
          LIQ: ${data.liquidity || "NONE"}
        </span>

        <span>
          OB: ${data.obType || "NONE"}
        </span>
      </div>

      ${
        ["BUY", "SELL"].includes(signal)
          ? `
            <div class="scanner-levels">

              <p>
                <b>ENTRY:</b>
                ${money(data.entryLow)}
                -
                ${money(data.entryHigh)}
              </p>

              <p>
                <b>SL:</b>
                ${money(data.sl)}
              </p>

              <p>
                <b>TP1:</b>
                ${money(data.tp1)}
              </p>

              <p>
                <b>TP2:</b>
                ${money(data.tp2)}
              </p>

              <p>
                <b>TP3:</b>
                ${money(data.tp3)}
              </p>

            </div>
          `
          : `
            <p class="muted">
              No confirmed entry.
            </p>
          `
      }

    </article>
  `;
}

// --------------------------------------------------
// SCAN MARKETS
// --------------------------------------------------

async function scanMarkets() {
  if (scanning) return;

  scanning = true;

  const button = $("scan");

  if (button) {
    button.disabled = true;
    button.textContent = "Scanning...";
  }

  const marketsBox = $("markets");

  if (marketsBox) {
    marketsBox.innerHTML = `
      <div class="muted">
        Scanning live market data...
      </div>
    `;
  }

  let results = [];

  for (const pair of markets) {
    try {
      /*
       * ONE 15M request per market.
       *
       * The result is saved and Analyze Selected
       * will use this exact result.
       */

      const data = await getMarket(pair, "15M");

      scannerResults.set(pair, data);

      results.push(data);

      if (marketsBox) {
        marketsBox.innerHTML =
          results.map(scannerCard).join("");
      }

    } catch (error) {
      console.error(pair, error);

      const failed = {
        pair,
        signal: "ERROR",
        confidence: 0,
        error: errorMessage(error)
      };

      results.push(failed);

      if (marketsBox) {
        marketsBox.innerHTML =
          results.map(scannerCard).join("");
      }
    }
  }

  updateStats(results);

  scanning = false;

  if (button) {
    button.disabled = false;
    button.textContent = "↻ Scan Markets";
  }
}

// --------------------------------------------------
// ANALYZE SELECTED
// --------------------------------------------------

async function analyzeSelected() {
  const pair = $("pair").value;

  /*
   * CRITICAL:
   *
   * If scanner already has this pair,
   * show the EXACT SAME result.
   */

  const saved = scannerResults.get(pair);

  if (saved) {
    showAnalysis(
      saved,
      "SCANNER CONFIRMED RESULT"
    );

    return;
  }

  /*
   * If scanner hasn't been run yet,
   * get one 15M result and save it.
   */

  const button = $("analyze");

  if (button) {
    button.disabled = true;
    button.textContent = "Analyzing...";
  }

  try {
    const data = await getMarket(pair, "15M");

    scannerResults.set(pair, data);

    showAnalysis(
      data,
      "LIVE 15M ANALYSIS"
    );

  } catch (error) {
    console.error(error);

    showError(error);

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Analyze Selected";
    }
  }
}

// --------------------------------------------------
// STATS
// --------------------------------------------------

function updateStats(results) {
  const valid = results.filter(
    r => r.signal !== "ERROR"
  );

  const strong = valid.filter(
    r =>
      r.signal === "BUY" ||
      r.signal === "SELL"
  );

  const average =
    valid.length
      ? Math.round(
          valid.reduce(
            (sum, r) =>
              sum + Number(r.confidence || 0),
            0
          ) / valid.length
        )
      : 0;

  $("scanned").textContent = valid.length;
  $("setups").textContent = strong.length;

  $("confidence").textContent =
    valid.length
      ? `${average}%`
      : "—";
}

// --------------------------------------------------
// HISTORY
// --------------------------------------------------

function addHistory(data) {
  const history = $("history");

  if (!history || !data) return;

  const item = document.createElement("div");

  item.className =
    `history-item ${signalClass(data.signal)}`;

  item.innerHTML = `
    <strong>
      ${data.pair}
    </strong>

    <span>
      ${data.signal}
    </span>

    <span>
      ${data.confidence ?? 0}%
    </span>

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

// --------------------------------------------------
// BUTTONS
// --------------------------------------------------

function setup() {

  // REAL IDs FROM index.html

  const scanButton = $("scan");

  const analyzeButton = $("analyze");

  if (!scanButton) {
    console.error(
      "MOGRI: Scan button #scan not found."
    );
  }

  if (!analyzeButton) {
    console.error(
      "MOGRI: Analyze button #analyze not found."
    );
  }

  if (scanButton) {
    scanButton.addEventListener(
      "click",
      scanMarkets
    );
  }

  if (analyzeButton) {
    analyzeButton.addEventListener(
      "click",
      analyzeSelected
    );
  }

  // When changing pair, show saved scanner result
  $("pair").addEventListener(
    "change",
    () => {

      const pair = $("pair").value;

      const saved =
        scannerResults.get(pair);

      if (saved) {
        showAnalysis(
          saved,
          "SCANNER CONFIRMED RESULT"
        );
      }
    }
  );

  console.log(
    "MOGRI AI FOREX SIGNAL ANALYZER loaded."
  );
}

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
