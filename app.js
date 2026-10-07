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

// Authoritative results produced by Scan Markets
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

  const signal =
    document.querySelector("#signal");

  if (signal) {

    const paragraph =
      signal.querySelector("p");

    if (paragraph) {

      paragraph.textContent =
        "Live market data analyzed using market structure, FVG, liquidity, momentum and multi-timeframe confirmation.";

    }
  }

  const footer =
    document.querySelector("footer");

  if (footer) {

    footer.textContent =
      "MOGRI AI • LIVE MARKET DATA • SIGNAL ANALYSIS";

  }

  const oldMode =
    document.querySelector(
      "#mogriModeWrapper"
    );

  if (oldMode) {
    oldMode.remove();
  }

  const oldTradeButton =
    document.querySelector(
      "#mogriPlaceTrade"
    );

  if (oldTradeButton) {
    oldTradeButton.remove();
  }
}

// =====================================================
// LIVE STATUS
// =====================================================

function setStatus(
  message = "● LIVE MARKET DATA"
) {

  document
    .querySelectorAll(".demo")
    .forEach(el => {

      el.textContent =
        message;

    });
}

// =====================================================
// LIVE CLOCK
// =====================================================

function updateLiveClock() {

  const now =
    new Date();

  const time =
    now.toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }
    );

  document
    .querySelectorAll(
      "#clock, #time, .clock, .time, .current-time"
    )
    .forEach(el => {

      el.textContent =
        time;

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
// FORMAT PRICE
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

    return Number(value)
      .toFixed(2);

  }

  return Number(value)
    .toFixed(5);
}

// =====================================================
// CONDITION HELPER
// =====================================================

function conditionExists(
  value
) {

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
    cacheKey(pair, tf);

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

  console.log(
    "Using cached data:",
    pair,
    tf
  );

  return item.data;
}

function saveCache(
  pair,
  tf,
  data
) {

  marketCache.set(
    cacheKey(pair, tf),
    {
      time: Date.now(),
      data
    }
  );

}

// =====================================================
// SCANNER RESULT STORAGE
//
// IMPORTANT:
// The scanner result becomes the authoritative result
// for Analyze Selected.
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

  try {

    scannerResults.set(
      data.pair,
      {
        savedAt: Date.now(),
        data:
          structuredClone(data)
      }
    );

  } catch {

    scannerResults.set(
      data.pair,
      {
        savedAt: Date.now(),
        data
      }
    );

  }

  window.mogriScannerResults =
    scannerResults;

  console.log(
    "Saved scanner result:",
    data.pair,
    data.signal,
    data.confidence
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

    scannerResults.delete(
      pair
    );

    return null;

  }

  try {

    return structuredClone(
      item.data
    );

  } catch {

    return item.data;

  }
}

// =====================================================
// API ERROR HANDLING
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
// SINGLE TIMEFRAME MARKET DATA
// Scanner uses this.
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
      .then(
        response =>
          parseResponse(
            response,
            "Failed to load live market data."
          )
      )
      .then(
        data => {

          saveCache(
            pair,
            tf,
            data
          );

          return data;

        }
      )
      .finally(
        () => {

          marketCache.delete(
            loadingKey
          );

        }
      );

  marketCache.set(
    loadingKey,
    request
  );

  return await request;
}

// =====================================================
// MULTI-TIMEFRAME ANALYSIS
//
// Kept available for future use.
// Analyze Selected now prefers the exact scanner
// result so signal/confidence cannot change.
// =====================================================

async function analyzeMTF(
  pair
) {

  const cached =
    getCached(
      pair,
      "MTF"
    );

  if (cached) {

    console.log(
      "Using cached MTF data:",
      pair
    );

    return cached;

  }

  const key =
    cacheKey(
      pair,
      "MTF"
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
      )}&mtf=true`
    )
      .then(
        response =>
          parseResponse(
            response,
            "Multi-timeframe analysis failed."
          )
      )
      .then(
        data => {

          saveCache(
            pair,
            "MTF",
            data
          );

          return data;

        }
      )
      .finally(
        () => {

          marketCache.delete(
            loadingKey
          );

        }
      );

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

  return reasons;
}

// =====================================================
// MTF REASONS
// =====================================================

function buildMTFReasons(
  data
) {

  const reasons = [];

  if (
    conditionExists(
      data.h4Bias
    )
  ) {

    reasons.push(
      `4H bias: ${data.h4Bias}`
    );

  }

  if (
    conditionExists(
      data.h1Structure
    )
  ) {

    reasons.push(
      `1H structure: ${data.h1Structure}`
    );

  }

  if (
    conditionExists(
      data.m15Structure
    )
  ) {

    reasons.push(
      `15M structure: ${data.m15Structure}`
    );

  }

  if (
    conditionExists(
      data.m5Structure
    )
  ) {

    reasons.push(
      `5M structure: ${data.m5Structure}`
    );

  }

  if (
    conditionExists(
      data.m5BOS
    )
  ) {

    reasons.push(
      `5M BOS/CHoCH: ${data.m5BOS}`
    );

  }

  if (
    conditionExists(
      data.m5Liquidity
    )
  ) {

    reasons.push(
      `5M liquidity: ${data.m5Liquidity}`
    );

  }

  if (
    conditionExists(
      data.m5FVG
    )
  ) {

    reasons.push(
      `5M FVG: ${data.m5FVG}`
    );

  }

  if (
    conditionExists(
      data.m5Momentum
    )
  ) {

    reasons.push(
      `5M momentum: ${data.m5Momentum}`
    );

  }

  return reasons;
}

// =====================================================
// TRADE LEVELS HTML
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
        Execute orders manually in your
        broker/MT5.
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

  const isMTF =
    data.tf === "MTF";

  const reasons =
    isMTF
      ? buildMTFReasons(data)
      : buildReasons(data);

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
        ${
          isMTF
            ? "MULTI-TIMEFRAME ANALYSIS"
            : "MARKET ANALYSIS"
        }
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
            ${
              data.tf ||
              data.selectedTF ||
              "—"
            }
          </b>
        </div>

        <div>
          <small>
            STRUCTURE
          </small>

          <br>

          <b>
            ${
              data.structure ||
              data.h4Bias ||
              "NEUTRAL"
            }
          </b>
        </div>

        <div>
          <small>
            BOS / CHOCH
          </small>

          <br>

          <b>
            ${
              data.bos ||
              data.m5BOS ||
              "NONE"
            }
          </b>
        </div>

        <div>
          <small>
            LIQUIDITY
          </small>

          <br>

          <b>
            ${
              data.liquidity ||
              data.m5Liquidity ||
              "NONE"
            }
          </b>
        </div>

        <div>
          <small>
            FVG
          </small>

          <br>

          <b>
            ${
              data.fvg ||
              data.m5FVG ||
              "NONE"
            }
          </b>
        </div>

      </div>

      ${
        isMTF
          ? `
            <div
              style="
                margin-top:12px;
                display:grid;
                grid-template-columns:
                  repeat(2,minmax(0,1fr));
                gap:10px;
              "
            >

              <div>
                <small>
                  BULL SCORE
                </small>

                <br>

                <b>
                  ${
                    data.bullScore ??
                    "—"
                  }
                </b>
              </div>

              <div>
                <small>
                  BEAR SCORE
                </small>

                <br>

                <b>
                  ${
                    data.bearScore ??
                    "—"
                  }
                </b>
              </div>

            </div>
          `
          : ""
      }

      <div
        style="margin-top:14px"
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
                      `<li style="margin-bottom:5px">
                        ${reason}
                      </li>`
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
// ORDER BLOCK UI
// =====================================================

function orderBlockHTML(
  data
) {

  const type =
    data.m5OBType ||
    data.obType ||
    "NONE";

  const status =
    data.m5OBStatus ||
    data.obStatus ||
    "NONE";

  const high =
    data.m5OBHigh ??
    data.obHigh ??
    null;

  const low =
    data.m5OBLow ??
    data.obLow ??
    null;

  const strength =
    data.m5OBStrength ??
    data.obStrength ??
    null;

  const hasOB =
    type === "BULLISH" ||
    type === "BEARISH";

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
            type === "BULLISH"
              ? "buy"
              : type === "BEARISH"
              ? "sell"
              : "wait"
          }"
        >
          ${
            hasOB
              ? type
              : "NONE"
          }
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
    data.m5OBType ||
    data.obType ||
    "NONE";

  const obStatus =
    data.m5OBStatus ||
    data.obStatus ||
    "NONE";

  return `
    <div class="card">

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
          ${
            data.structure ||
            "NEUTRAL"
          }
        </span>

        <span>
          BOS:
          ${
            data.bos ||
            "NONE"
          }
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
              style="
                margin-top:12px;
                padding-top:10px;
                border-top:
                  1px solid
                  rgba(255,255,255,.06);
              "
            >

              <div class="mini">

                <span>
                  ENTRY
                </span>

                <b>
                  ${
                    fmt(
                      data.entryLow,
                      data.pair
                    )
                  }
                  -
                  ${
                    fmt(
                      data.entryHigh,
                      data.pair
                    )
                  }
                </b>

              </div>

              <div
                class="mini"
                style="margin-top:5px"
              >

                <span>
                  SL
                </span>

                <b>
                  ${
                    fmt(
                      data.sl,
                      data.pair
                    )
                  }
                </b>

              </div>

              <div
                class="mini"
                style="margin-top:5px"
              >

                <span>
                  TP1
                </span>

                <b>
                  ${
                    fmt(
                      data.tp1,
                      data.pair
                    )
                  }
                </b>

              </div>

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

      ${
        data.tf === "MTF"
          ? " MTF"
          : data.tf
          ? ` ${data.tf}`
          : ""
      }

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
      Place any order manually
      through your broker or MT5.

    </div>

  `;

  addHistory(data);
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
                1px solid
                rgba(255,255,255,.05);
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
              ${
                Number(
                  item.confidence || 0
                )
              }%
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
// SCANNER
// =====================================================

async function scan() {

  if (scanRunning) {
    return;
  }

  scanRunning =
    true;

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

    // ================================================
    // Scan all six markets using 15M.
    // ================================================

    for (
      const pair of markets
    ) {

      try {

        const data =
          await analyze(
            pair,
            "15M"
          );

        // ============================================
        // IMPORTANT:
        // Store the EXACT scanner result.
        // ============================================

        saveScannerResult(
          data
        );

        results.push(
          data
        );

        if (
          data.signal ===
            "BUY" ||
          data.signal ===
            "SELL"
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
// SELECTED MARKET ANALYSIS
//
// IMPORTANT:
// 1. First uses exact scanner result.
// 2. Does NOT recalculate confidence.
// 3. Does NOT change BUY/SELL/WAIT.
// 4. Preserves entry/SL/TP from scanner.
// =====================================================

async function analyzeSelected() {

  const pairSelect =
    document.querySelector(
      "#pair"
    );

  const tfSelect =
    document.querySelector(
      "#tf"
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

  const selectedTF =
    tfSelect
      ? tfSelect.value
      : "15M";

  if (button) {

    button.disabled =
      true;

    button.textContent =
      "Loading signal...";

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
        Loading the latest MOGRI AI
        scanner result.
      </p>

    `;

  }

  try {

    // =================================================
    // FIRST:
    // Use exact scanner result.
    // =================================================

    let data =
      getScannerResult(
        pair
      );

    if (data) {

      console.log(
        "Using EXACT scanner result:",
        pair,
        data.signal,
        data.confidence
      );

      /*
       * Do NOT change:
       * signal
       * confidence
       * price
       * entry
       * SL
       * TP1
       * TP2
       * TP3
       */

      data.selectedTF =
        selectedTF;

      data.analysisSource =
        "SCANNER_RESULT";

      show(data);

      setStatus(
        "● LIVE MARKET DATA"
      );

      return;
    }

    // =================================================
    // No scanner result exists.
    //
    // In that situation, make ONE direct live
    // request using the selected timeframe.
    // =================================================

    console.log(
      "No scanner result found.",
      "Running direct analysis:",
      pair,
      selectedTF
    );

    data =
      await analyze(
        pair,
        selectedTF
      );

    data.selectedTF =
      selectedTF;

    data.analysisSource =
      "DIRECT_LIVE_ANALYSIS";

    saveScannerResult(
      data
    );

    show(data);

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
            or wait for the API limit
            to reset.

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
