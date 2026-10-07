// =====================================================
// MOGRI AI FOREX SIGNAL ANALYZER
// LIVE MARKET DATA • LIVE SIGNAL ANALYSIS
// =====================================================

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

// =====================================================
// SETTINGS
// =====================================================

const CACHE_TIME = 60 * 1000;

const marketCache = new Map();

// IMPORTANT:
// Stores the EXACT result produced by Scan Markets.
// Analyze Selected reads from this object instead
// of calculating another signal.
const scannerResults = new Map();

let scanRunning = false;
let currentSignal = null;

// =====================================================
// PAGE TEXT CLEANUP
// =====================================================

function cleanOldDemoText() {

  document.querySelectorAll(".demo").forEach(el => {
    el.textContent = "● LIVE MARKET DATA";
  });

  const signal = document.querySelector("#signal");

  if (signal) {

    const paragraph = signal.querySelector("p");

    if (paragraph) {
      paragraph.textContent =
        "Live market data analyzed using market structure, FVG, liquidity, momentum and Order Blocks.";
    }
  }

  const footer = document.querySelector("footer");

  if (footer) {
    footer.textContent =
      "MOGRI AI • LIVE MARKET DATA • SIGNAL ANALYSIS";
  }

  // Remove old trading controls
  const oldMode =
    document.querySelector("#mogriModeWrapper");

  if (oldMode) {
    oldMode.remove();
  }

  const oldTradeButton =
    document.querySelector("#mogriPlaceTrade");

  if (oldTradeButton) {
    oldTradeButton.remove();
  }
}

// =====================================================
// STATUS
// =====================================================

function setStatus(
  message = "● LIVE MARKET DATA"
) {

  document.querySelectorAll(".demo").forEach(el => {
    el.textContent = message;
  });
}

// =====================================================
// LIVE CLOCK
// =====================================================

function updateLiveClock() {

  const now = new Date();

  const time =
    now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });

  document
    .querySelectorAll(
      "#clock, #time, .clock, .time, .current-time"
    )
    .forEach(el => {
      el.textContent = time;
    });
}

function startLiveClock() {

  updateLiveClock();

  setInterval(
    updateLiveClock,
    1000
  );
}

// =====================================================
// PRICE FORMAT
// =====================================================

function fmt(
  value,
  pair
) {

  if (
    value === undefined ||
    value === null ||
    !Number.isFinite(
      Number(value)
    )
  ) {
    return "—";
  }

  if (
    pair === "XAU/USD"
  ) {
    return Number(value).toFixed(2);
  }

  return Number(value).toFixed(5);
}

// =====================================================
// CONDITION HELPER
// =====================================================

function conditionExists(value) {

  if (
    value === undefined ||
    value === null ||
    value === false
  ) {
    return false;
  }

  if (
    typeof value === "string"
  ) {

    const normalized =
      value
        .trim()
        .toUpperCase();

    if (
      normalized === "" ||
      normalized === "NONE" ||
      normalized === "NEUTRAL" ||
      normalized === "NO" ||
      normalized === "FALSE"
    ) {
      return false;
    }
  }

  return true;
}

// =====================================================
// CACHE
// =====================================================

function cacheKey(
  pair,
  tf
) {

  return `${pair}_${tf}`;
}

function getCached(
  pair,
  tf
) {

  const key =
    cacheKey(
      pair,
      tf
    );

  const item =
    marketCache.get(key);

  if (!item) {
    return null;
  }

  const age =
    Date.now() -
    item.time;

  if (
    age > CACHE_TIME
  ) {

    marketCache.delete(key);

    return null;
  }

  return item.data;
}

function saveCache(
  pair,
  tf,
  data
) {

  marketCache.set(
    cacheKey(
      pair,
      tf
    ),
    {
      time: Date.now(),
      data
    }
  );
}

// =====================================================
// SCANNER RESULT STORAGE
// =====================================================

function saveScannerResult(
  data
) {

  if (
    !data ||
    !data.pair
  ) {
    return;
  }

  // Store the COMPLETE API response.
  scannerResults.set(
    data.pair,
    {
      savedAt: Date.now(),
      data: {
        ...data
      }
    }
  );

  // Also expose it globally for debugging.
  window.mogriScannerResults =
    Object.fromEntries(
      scannerResults
    );

  console.log(
    "Saved exact scanner result:",
    data.pair,
    data.signal,
    data.confidence,
    data.entryLow,
    data.entryHigh,
    data.sl,
    data.tp1,
    data.tp2,
    data.tp3
  );
}

function getScannerResult(
  pair
) {

  const item =
    scannerResults.get(pair);

  if (!item) {
    return null;
  }

  const age =
    Date.now() -
    item.savedAt;

  if (
    age > CACHE_TIME
  ) {

    scannerResults.delete(pair);

    return null;
  }

  return {
    ...item.data
  };
}

// =====================================================
// API RESPONSE
// =====================================================

async function parseResponse(
  response,
  fallbackMessage
) {

  let data;

  try {

    data =
      await response.json();

  } catch {

    throw new Error(
      "Invalid response from market server."
    );
  }

  if (
    !response.ok ||
    data.error
  ) {

    throw new Error(
      data.error ||
      fallbackMessage
    );
  }

  return data;
}

// =====================================================
// SINGLE TIMEFRAME ANALYSIS
// SCANNER USES 15M
// =====================================================

async function analyze(
  pair,
  tf
) {

  const interval =
    tfMap[tf] ||
    "15min";

  const cached =
    getCached(
      pair,
      tf
    );

  if (cached) {
    return cached;
  }

  const key =
    cacheKey(
      pair,
      tf
    );

  const loadingKey =
    `${key}_loading`;

  if (
    marketCache.has(
      loadingKey
    )
  ) {

    return await marketCache.get(
      loadingKey
    );
  }

  const request =
    fetch(
      `/api/market?symbol=${encodeURIComponent(
        pair
      )}&interval=${encodeURIComponent(
        interval
      )}`
    )
      .then(response =>
        parseResponse(
          response,
          "Failed to load live market data."
        )
      )
      .then(data => {

        saveCache(
          pair,
          tf,
          data
        );

        return data;
      })
      .finally(() => {

        marketCache.delete(
          loadingKey
        );
      });

  marketCache.set(
    loadingKey,
    request
  );

  return await request;
}

// =====================================================
// SIGNAL CLASS
// =====================================================

function signalClass(
  signal
) {

  if (
    signal === "BUY"
  ) {
    return "buy";
  }

  if (
    signal === "SELL"
  ) {
    return "sell";
  }

  return "wait";
}

// =====================================================
// SIGNAL REASONS
// =====================================================

function buildReasons(
  data
) {

  const reasons = [];

  if (
    conditionExists(
      data.structure
    )
  ) {

    reasons.push(
      `Market structure: ${data.structure}`
    );
  }

  if (
    conditionExists(
      data.bos
    )
  ) {

    reasons.push(
      `BOS/CHoCH: ${data.bos}`
    );
  }

  if (
    conditionExists(
      data.liquidity
    )
  ) {

    reasons.push(
      `Liquidity: ${data.liquidity}`
    );
  }

  if (
    conditionExists(
      data.fvg
    )
  ) {

    reasons.push(
      `FVG: ${data.fvg}`
    );
  }

  if (
    conditionExists(
      data.momentum
    )
  ) {

    reasons.push(
      `Momentum: ${data.momentum}`
    );
  }

  if (
    conditionExists(
      data.obType
    )
  ) {

    reasons.push(
      `Order Block: ${data.obType}`
    );
  }

  if (
    conditionExists(
      data.obStatus
    )
  ) {

    reasons.push(
      `OB status: ${data.obStatus}`
    );
  }

  return reasons;
}

// =====================================================
// TRADE LEVELS
// =====================================================

function levelsHTML(
  data
) {

  const signal =
    data.signal;

  if (
    signal !== "BUY" &&
    signal !== "SELL"
  ) {

    return `
      <div
        style="
          margin-top:16px;
          padding:14px;
          border-radius:10px;
          background:rgba(255,255,255,.025);
          border:1px solid rgba(255,255,255,.06);
        "
      >

        <b>
          WAITING FOR CLEAN SETUP
        </b>

        <div
          class="muted"
          style="margin-top:6px"
        >
          No confirmed entry, stop loss or
          take-profit levels yet.
        </div>

      </div>
    `;
  }

  return `
    <div
      style="
        margin-top:16px;
        padding:14px;
        border-radius:10px;
        background:rgba(255,255,255,.025);
        border:1px solid rgba(255,255,255,.06);
      "
    >

      <b>
        TRADE LEVELS
      </b>

      <div
        style="
          display:grid;
          grid-template-columns:
            repeat(2,minmax(0,1fr));
          gap:10px;
          margin-top:12px;
        "
      >

        <div>
          <small>
            ENTRY ZONE
          </small>
          <br>
          <b>
            ${fmt(
              data.entryLow,
              data.pair
            )}
            -
            ${fmt(
              data.entryHigh,
              data.pair
            )}
          </b>
        </div>

        <div>
          <small>
            STOP LOSS
          </small>
          <br>
          <b>
            ${fmt(
              data.sl,
              data.pair
            )}
          </b>
        </div>

        <div>
          <small>
            TAKE PROFIT 1
          </small>
          <br>
          <b>
            ${fmt(
              data.tp1,
              data.pair
            )}
          </b>
        </div>

        <div>
          <small>
            TAKE PROFIT 2
          </small>
          <br>
          <b>
            ${fmt(
              data.tp2,
              data.pair
            )}
          </b>
        </div>

        <div>
          <small>
            TAKE PROFIT 3
          </small>
          <br>
          <b>
            ${fmt(
              data.tp3,
              data.pair
            )}
          </b>
        </div>

      </div>

      <div
        class="muted"
        style="margin-top:12px"
      >
        These are the exact levels returned by
        the MOGRI market analysis.
      </div>

      <div
        class="muted"
        style="margin-top:6px"
      >
        Execute orders manually through your
        broker or MT5.
      </div>

    </div>
  `;
}

// =====================================================
// ANALYSIS DETAILS
// =====================================================

function analysisDetailsHTML(
  data
) {

  const reasons =
    buildReasons(
      data
    );

  return `
    <div
      style="
        margin-top:16px;
        padding:14px;
        border-radius:10px;
        background:rgba(255,255,255,.025);
        border:1px solid rgba(255,255,255,.06);
      "
    >

      <b>
        MARKET ANALYSIS
      </b>

      <div
        style="
          display:grid;
          grid-template-columns:
            repeat(2,minmax(0,1fr));
          gap:10px;
          margin-top:12px;
        "
      >

        <div>
          <small>
            PRICE
          </small>
          <br>
          <b>
            ${fmt(
              data.price,
              data.pair
            )}
          </b>
        </div>

        <div>
          <small>
            TIMEFRAME
          </small>
          <br>
          <b>
            ${data.tf || "15M"}
          </b>
        </div>

        <div>
          <small>
            STRUCTURE
          </small>
          <br>
          <b>
            ${data.structure || "NEUTRAL"}
          </b>
        </div>

        <div>
          <small>
            BOS / CHOCH
          </small>
          <br>
          <b>
            ${data.bos || "NONE"}
          </b>
        </div>

        <div>
          <small>
            LIQUIDITY
          </small>
          <br>
          <b>
            ${data.liquidity || "NONE"}
          </b>
        </div>

        <div>
          <small>
            FVG
          </small>
          <br>
          <b>
            ${data.fvg || "NONE"}
          </b>
        </div>

        <div>
          <small>
            MOMENTUM
          </small>
          <br>
          <b>
            ${data.momentum || "NEUTRAL"}
          </b>
        </div>

        <div>
          <small>
            ORDER BLOCK
          </small>
          <br>
          <b>
            ${data.obType || "NONE"}
          </b>
        </div>

      </div>

      <div
        style="
          margin-top:14px;
        "
      >

        <b>
          CONFIRMATIONS
        </b>

        ${
          reasons.length
            ? `
              <ul
                style="
                  margin-top:8px;
                  padding-left:20px;
                "
              >

                ${reasons
                  .map(
                    reason =>
                      `<li style="margin-bottom:5px">${reason}</li>`
                  )
                  .join("")}

              </ul>
            `
            : `
              <div
                class="muted"
                style="margin-top:7px"
              >
                Waiting for stronger
                market confirmation.
              </div>
            `
        }

      </div>

    </div>
  `;
}

// =====================================================
// ORDER BLOCK
// =====================================================

function orderBlockHTML(
  data
) {

  const type =
    data.obType ||
    "NONE";

  const status =
    data.obStatus ||
    "NONE";

  const high =
    data.obHigh ??
    null;

  const low =
    data.obLow ??
    null;

  const strength =
    data.obStrength ??
    null;

  const hasOB =
    type === "BULLISH OB" ||
    type === "BEARISH OB";

  let message =
    "No confirmed Order Block";

  if (hasOB) {

    if (
      status === "IN_ZONE"
    ) {

      message =
        "PRICE INSIDE ORDER BLOCK";

    } else if (
      status === "ABOVE_ZONE" ||
      status === "BELOW_ZONE"
    ) {

      message =
        "WAITING FOR OB RETEST";

    } else if (
      status === "AWAY"
    ) {

      message =
        "ORDER BLOCK AWAY FROM PRICE";

    } else {

      message =
        "ORDER BLOCK DETECTED";
    }
  }

  return `
    <div
      style="
        margin-top:14px;
        padding:12px;
        border-radius:10px;
        border:1px solid rgba(255,255,255,.08);
        background:rgba(255,255,255,.025);
      "
    >

      <div
        style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          margin-bottom:10px;
        "
      >

        <b>
          ORDER BLOCK
        </b>

        <span
          class="pill ${
            type === "BULLISH OB"
              ? "buy"
              : type === "BEARISH OB"
              ? "sell"
              : "wait"
          }"
        >
          ${hasOB ? type : "NONE"}
        </span>

      </div>

      <div
        style="
          display:grid;
          grid-template-columns:
            repeat(2,minmax(0,1fr));
          gap:9px;
        "
      >

        <div>
          <small>
            OB HIGH
          </small>
          <br>
          <b>
            ${fmt(
              high,
              data.pair
            )}
          </b>
        </div>

        <div>
          <small>
            OB LOW
          </small>
          <br>
          <b>
            ${fmt(
              low,
              data.pair
            )}
          </b>
        </div>

        <div>
          <small>
            STATUS
          </small>
          <br>
          <b>
            ${status}
          </b>
        </div>

        <div>
          <small>
            STRENGTH
          </small>
          <br>
          <b>
            ${
              strength === null ||
              strength === undefined
                ? "—"
                : strength
            }
          </b>
        </div>

      </div>

      <div
        class="muted"
        style="margin-top:10px"
      >
        ${message}
      </div>

    </div>
  `;
}

// =====================================================
// SCANNER CARD
// =====================================================

function card(
  data
) {

  const signal =
    data.signal ||
    "WAIT";

  const className =
    signalClass(
      signal
    );

  const confidence =
    Number(
      data.confidence || 0
    );

  const obType =
    data.obType ||
    "NONE";

  const obStatus =
    data.obStatus ||
    "NONE";

  return `
    <div
      class="card"
      data-pair="${data.pair}"
    >

      <div class="pairrow">

        <b>
          ${data.pair}
        </b>

        <span
          class="pill ${className}"
        >
          ${signal}
        </span>

      </div>

      <h3>
        ${confidence}%

        <span
          style="
            font-size:11px;
            color:#748092;
          "
        >
          confidence
        </span>
      </h3>

      <div class="bar">

        <i
          style="
            width:${Math.min(
              confidence,
              100
            )}%
          "
        ></i>

      </div>

      <div class="mini">

        <span>
          ${data.tf || "15min"}
        </span>

        <span>

          FVG
          ${
            conditionExists(
              data.fvg
            )
              ? "✓"
              : "—"
          }

          •

          LIQ
          ${
            conditionExists(
              data.liquidity
            )
              ? "✓"
              : "—"
          }

        </span>

      </div>

      <div
        class="mini"
        style="margin-top:7px"
      >

        <span>
          Structure:
          ${data.structure || "NEUTRAL"}
        </span>

        <span>
          BOS:
          ${data.bos || "NONE"}
        </span>

      </div>

      <div
        class="mini"
        style="margin-top:7px"
      >

        <span>
          OB:
          ${obType}
        </span>

        <span>
          ${obStatus}
        </span>

      </div>

      ${
        signal === "BUY" ||
        signal === "SELL"
          ? `
            <div
              class="mini"
              style="
                margin-top:9px;
                display:block;
              "
            >
              Entry:
              <b>
                ${fmt(
                  data.entryLow,
                  data.pair
                )}
                -
                ${fmt(
                  data.entryHigh,
                  data.pair
                )}
              </b>
            </div>
          `
          : ""
      }

    </div>
  `;
}

// =====================================================
// SHOW SIGNAL
// =====================================================

function show(
  data
) {

  currentSignal =
    data;

  window.mogriCurrentSignal =
    data;

  const signalBox =
    document.querySelector(
      "#signal"
    );

  if (!signalBox) {
    return;
  }

  const signal =
    data.signal ||
    "WAIT";

  const confidence =
    Number(
      data.confidence || 0
    );

  const className =
    signalClass(
      signal
    );

  const signalTime =
    data.time
      ? String(data.time)
      : new Date().toISOString();

  signalBox.classList.remove(
    "empty"
  );

  signalBox.innerHTML = `

    <div class="signal-top">

      <span
        class="pill ${className}"
      >
        ${signal}
      </span>

      <span id="time">
        ${signalTime}
      </span>

    </div>

    <h2>
      ${data.pair || "Market"}
      •
      ${signal}
    </h2>

    <div
      style="
        font-size:28px;
        font-weight:800;
        margin-top:8px;
      "
    >
      ${confidence}%
    </div>

    <div
      class="muted"
      style="margin-top:3px"
    >
      Signal confidence
    </div>

    <div
      style="
        margin-top:14px;
        padding:10px 12px;
        border-radius:8px;
        background:rgba(200,255,0,.06);
        border:1px solid rgba(200,255,0,.12);
      "
    >

      <b>
        ● LIVE MARKET DATA
      </b>

      <div
        class="muted"
        style="margin-top:4px"
      >
        MOGRI AI is analyzing current
        market conditions.
      </div>

    </div>

    ${levelsHTML(data)}

    ${analysisDetailsHTML(data)}

    ${orderBlockHTML(data)}

    <div
      class="muted"
      style="
        margin-top:14px;
        font-size:12px;
      "
    >
      Signal is analytical only.
      Place any order manually through
      your broker or MT5.
    </div>

  `;

  addHistory(
    data
  );
}

// =====================================================
// HISTORY
// =====================================================

function getHistory() {

  try {

    return JSON.parse(
      localStorage.getItem(
        "mogriSignalHistory"
      ) || "[]"
    );

  } catch {

    return [];
  }
}

function saveHistory(
  history
) {

  localStorage.setItem(
    "mogriSignalHistory",
    JSON.stringify(
      history
    )
  );
}

function addHistory(
  data
) {

  const history =
    getHistory();

  const item = {

    pair:
      data.pair,

    signal:
      data.signal,

    confidence:
      data.confidence,

    price:
      data.price,

    entryLow:
      data.entryLow,

    entryHigh:
      data.entryHigh,

    sl:
      data.sl,

    tp1:
      data.tp1,

    tp2:
      data.tp2,

    tp3:
      data.tp3,

    time:
      data.time ||
      new Date().toISOString()
  };

  const duplicate =
    history.length > 0 &&
    history[0].pair ===
      item.pair &&
    history[0].signal ===
      item.signal &&
    history[0].time ===
      item.time;

  if (!duplicate) {
    history.unshift(
      item
    );
  }

  saveHistory(
    history.slice(
      0,
      20
    )
  );

  renderHistory();
}

function renderHistory() {

  const container =
    document.querySelector(
      "#history"
    );

  if (!container) {
    return;
  }

  const history =
    getHistory();

  if (!history.length) {

    container.innerHTML = `
      <div
        class="muted"
        style="padding:12px 0"
      >
        No signals analyzed yet.
      </div>
    `;

    return;
  }

  container.innerHTML =
    history
      .map(
        item => `

          <div
            style="
              display:grid;
              grid-template-columns:
                1fr auto auto;
              gap:10px;
              align-items:center;
              padding:11px 0;
              border-bottom:
                1px solid rgba(255,255,255,.05);
            "
          >

            <div>

              <b>
                ${item.pair}
              </b>

              <div
                class="muted"
                style="font-size:11px"
              >
                ${
                  new Date(
                    item.time
                  ).toLocaleString()
                }
              </div>

            </div>

            <span
              class="pill ${signalClass(
                item.signal
              )}"
            >
              ${item.signal}
            </span>

            <b>
              ${Number(
                item.confidence || 0
              )}%
            </b>

          </div>

        `
      )
      .join("");
}

// =====================================================
// SCANNER STATS
// =====================================================

function setScannerStats(
  scanned,
  setups,
  confidence
) {

  const scannedEl =
    document.querySelector(
      "#scanned"
    );

  const setupsEl =
    document.querySelector(
      "#setups"
    );

  const confidenceEl =
    document.querySelector(
      "#confidence"
    );

  if (scannedEl) {
    scannedEl.textContent =
      scanned;
  }

  if (setupsEl) {
    setupsEl.textContent =
      setups;
  }

  if (confidenceEl) {
    confidenceEl.textContent =
      confidence;
  }
}

// =====================================================
// SCAN MARKETS
// =====================================================

async function scan() {

  if (scanRunning) {
    return;
  }

  scanRunning =
    true;

  // Clear previous scanner results.
  scannerResults.clear();

  const button =
    document.querySelector(
      "#scan"
    );

  const marketsBox =
    document.querySelector(
      "#markets"
    );

  if (button) {

    button.disabled =
      true;

    button.textContent =
      "Scanning live data...";
  }

  setStatus(
    "● LIVE MARKET DATA • SCANNING"
  );

  if (marketsBox) {
    marketsBox.innerHTML =
      "";
  }

  let results = [];

  let setups = 0;

  const confidenceValues =
    [];

  try {

    // =================================================
    // IMPORTANT:
    // Scanner uses 15M.
    // One Twelve Data request per market.
    //
    // The COMPLETE result is saved.
    // Analyze Selected will use this exact result.
    // =================================================

    for (
      const pair of markets
    ) {

      try {

        const data =
          await analyze(
            pair,
            "15M"
          );

        // ---------------------------------------------
        // SAVE EXACT SCANNER RESULT
        // ---------------------------------------------

        saveScannerResult(
          data
        );

        results.push(
          data
        );

        if (
          data.signal === "BUY" ||
          data.signal === "SELL"
        ) {

          setups++;
        }

        if (
          Number.isFinite(
            Number(
              data.confidence
            )
          )
        ) {

          confidenceValues.push(
            Number(
              data.confidence
            )
          );
        }

        if (marketsBox) {

          marketsBox.insertAdjacentHTML(
            "beforeend",
            card(data)
          );
        }

      } catch (
        error
      ) {

        console.error(
          `Scanner error for ${pair}:`,
          error
        );

        if (marketsBox) {

          marketsBox.insertAdjacentHTML(
            "beforeend",
            `
              <div class="card">

                <div class="pairrow">

                  <b>
                    ${pair}
                  </b>

                  <span
                    class="pill wait"
                  >
                    ERROR
                  </span>

                </div>

                <div
                  class="muted"
                  style="margin-top:8px"
                >
                  ${error.message}
                </div>

              </div>
            `
          );
        }
      }
    }

    const avg =
      confidenceValues.length
        ? Math.round(
            confidenceValues.reduce(
              (
                a,
                b
              ) =>
                a + b,
              0
            ) /
            confidenceValues.length
          ) + "%"
        : "—";

    setScannerStats(
      results.length,
      setups,
      avg
    );

    setStatus(
      "● LIVE MARKET DATA"
    );

    console.log(
      "MOGRI scanner complete:",
      results
    );

  } catch (
    error
  ) {

    console.error(
      "Scanner error:",
      error
    );

    setStatus(
      "● LIVE MARKET DATA"
    );

    alert(
      error.message ||
      "Unable to scan live market data."
    );

  } finally {

    scanRunning =
      false;

    if (button) {

      button.disabled =
        false;

      button.textContent =
        "↻ Scan Markets";
    }
  }
}

// =====================================================
// ANALYZE SELECTED
//
// IMPORTANT:
// This NO LONGER calls the MTF endpoint.
//
// It displays the EXACT scanner result for the
// selected pair.
//
// Example:
//
// Scanner:
// EUR/USD SELL 92%
//
// Analyze Selected:
// EUR/USD SELL 92%
//
// Same entry.
// Same SL.
// Same TP.
// Same confidence.
// =====================================================

async function analyzeSelected() {

  const pairSelect =
    document.querySelector(
      "#pair"
    );

  const button =
    document.querySelector(
      "#analyze"
    );

  const signalBox =
    document.querySelector(
      "#signal"
    );

  const pair =
    pairSelect
      ? pairSelect.value
      : "EUR/USD";

  if (button) {

    button.disabled =
      true;

    button.textContent =
      "Loading scanner result...";
  }

  setStatus(
    "● LIVE MARKET DATA • ANALYZING"
  );

  if (signalBox) {

    signalBox.innerHTML = `
      <div class="signal-top">

        <span class="pill wait">
          WAIT
        </span>

        <span id="time">
          LIVE
        </span>

      </div>

      <h2>
        Loading ${pair}
      </h2>

      <p class="muted">
        MOGRI AI is loading the exact
        result from the latest market scan.
      </p>
    `;
  }

  try {

    // =================================================
    // FIRST:
    // Use exact result from Scan Markets.
    // =================================================

    let data =
      getScannerResult(
        pair
      );

    // =================================================
    // IF THE MARKET HAS NOT BEEN SCANNED YET:
    // Make one 15M request and save it as the
    // authoritative result.
    // =================================================

    if (!data) {

      console.log(
        "No scanner result for",
        pair,
        "— requesting fresh 15M data."
      );

      data =
        await analyze(
          pair,
          "15M"
        );

      saveScannerResult(
        data
      );
    }

    // =================================================
    // FORCE THE DISPLAY TO USE THE SCANNER TIMEFRAME.
    // =================================================

    data = {
      ...data,
      tf: "15M"
    };

    // =================================================
    // SHOW EXACT SAME RESULT.
    // =================================================

    console.log(
      "Analyze Selected using exact scanner result:",
      data
    );

    show(
      data
    );

    setStatus(
      "● LIVE MARKET DATA"
    );

  } catch (
    error
  ) {

    console.error(
      "Selected analysis error:",
      error
    );

    setStatus(
      "● LIVE MARKET DATA"
    );

    if (signalBox) {

      signalBox.innerHTML = `
        <div class="signal-top">

          <span class="pill wait">
            WAIT
          </span>

          <span id="time">
            ERROR
          </span>

        </div>

        <h2>
          Live analysis unavailable
        </h2>

        <p class="muted">
          ${error.message}
        </p>

        <div
          style="
            margin-top:14px;
            padding:12px;
            border-radius:8px;
            background:rgba(255,255,255,.03);
          "
        >

          <b>
            LIVE MARKET DATA
          </b>

          <div
            class="muted"
            style="margin-top:5px"
          >
            Check your Twelve Data quota
            or wait for the API limit to reset.
          </div>

        </div>
      `;
    }

  } finally {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        "Analyze Selected";
    }
  }
}

// =====================================================
// INITIALIZE
// =====================================================

function initializeMogriAI() {

  cleanOldDemoText();

  setStatus(
    "● LIVE MARKET DATA"
  );

  startLiveClock();

  renderHistory();

  const scanButton =
    document.querySelector(
      "#scan"
    );

  const analyzeButton =
    document.querySelector(
      "#analyze"
    );

  if (scanButton) {

    scanButton.addEventListener(
      "click",
      scan
    );
  }

  if (analyzeButton) {

    analyzeButton.addEventListener(
      "click",
      analyzeSelected
    );
  }

  console.log(
    "MOGRI AI initialized — LIVE MARKET DATA"
  );
}

// =====================================================
// START
// =====================================================

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initializeMogriAI
  );

} else {

  initializeMogriAI();
}
