// =====================================================
// MOGRI AI FOREX SIGNAL ANALYZER
// LIVE MARKET DATA • PAPER / DEMO / REAL MODE
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

let scanRunning = false;


// =====================================================
// TRADING MODE
// =====================================================

const TRADING_MODES = [
  "MANUAL",
  "DEMO",
  "REAL"
];


function getTradingMode() {

  const saved =
    localStorage.getItem(
      "mogriTradingMode"
    );

  if (
    TRADING_MODES.includes(saved)
  ) {

    return saved;

  }

  return "DEMO";

}


function setTradingMode(mode) {

  if (
    !TRADING_MODES.includes(mode)
  ) {

    return;

  }


  if (mode === "REAL") {

    const confirmed =
      confirm(
        "REAL MODE WARNING\n\n" +
        "This mode is intended for real-money trading.\n\n" +
        "Do you want to enable REAL mode?"
      );


    if (!confirmed) {

      updateTradingModeUI();

      return;

    }

  }


  localStorage.setItem(
    "mogriTradingMode",
    mode
  );


  updateTradingModeUI();


  setStatus(
    `● LIVE DATA • ${mode} MODE`
  );

}


function updateTradingModeUI() {

  let selector =
    document.querySelector(
      "#mogriTradingMode"
    );


  if (!selector) {

    const signalBox =
      document.querySelector(
        "#signal"
      );


    if (!signalBox) {

      return;

    }


    const wrapper =
      document.createElement(
        "div"
      );


    wrapper.id =
      "mogriModeWrapper";


    wrapper.style =
      `
        margin-bottom:12px;
        padding:10px;
        border-radius:10px;
        background:rgba(255,255,255,.04);
      `;


    wrapper.innerHTML = `

      <label
        style="
          display:block;
          font-size:11px;
          color:#8b96a8;
          margin-bottom:5px;
        "
      >
        TRADING MODE
      </label>

      <select
        id="mogriTradingMode"
        style="
          width:100%;
          padding:10px;
          border-radius:8px;
          border:1px solid rgba(255,255,255,.1);
          background:#111827;
          color:white;
        "
      >

        <option value="MANUAL">
          MANUAL
        </option>

        <option value="DEMO">
          DEMO
        </option>

        <option value="REAL">
          REAL
        </option>

      </select>

    `;


    signalBox.parentNode.insertBefore(
      wrapper,
      signalBox
    );


    selector =
      document.querySelector(
        "#mogriTradingMode"
      );


    if (selector) {

      selector.addEventListener(
        "change",
        () => {

          setTradingMode(
            selector.value
          );

        }
      );

    }

  }


  const mode =
    getTradingMode();


  if (selector) {

    selector.value =
      mode;

  }

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


  const elements =
    document.querySelectorAll(
      "#clock, #time, .clock, .time, .current-time"
    );


  elements.forEach(
    element => {

      element.textContent =
        time;

    }
  );

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
// STATUS
// =====================================================

function setStatus(
  message
) {

  const elements =
    document.querySelectorAll(
      ".demo"
    );


  elements.forEach(
    element => {

      element.textContent =
        message;

    }
  );

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
    marketCache.get(
      key
    );


  if (!item) {

    return null;

  }


  const age =
    Date.now() -
    item.time;


  if (
    age >
    CACHE_TIME
  ) {

    marketCache.delete(
      key
    );

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
// SINGLE TIMEFRAME ANALYSIS
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
      `/api/market?symbol=${encodeURIComponent(pair)}&interval=${encodeURIComponent(interval)}`
    )

      .then(
        async response => {

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
              "Failed to load market data."
            );

          }


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
      `/api/market?symbol=${encodeURIComponent(pair)}&mtf=true`
    )

      .then(
        async response => {

          let data;


          try {

            data =
              await response.json();

          } catch {

            throw new Error(
              "Invalid MTF response from market server."
            );

          }


          if (
            !response.ok ||
            data.error
          ) {

            throw new Error(
              data.error ||
              "Multi-timeframe analysis failed."
            );

          }


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
// ORDER BLOCK INFORMATION
// =====================================================

function getOBType(
  data
) {

  return (
    data.m5OBType ||
    data.obType ||
    "NONE"
  );

}


function getOBStatus(
  data
) {

  return (
    data.m5OBStatus ||
    data.obStatus ||
    "NONE"
  );

}


function getOBHigh(
  data
) {

  return (
    data.m5OBHigh ??
    data.obHigh ??
    null
  );

}


function getOBLow(
  data
) {

  return (
    data.m5OBLow ??
    data.obLow ??
    null
  );

}


function getOBStrength(
  data
) {

  return (
    data.m5OBStrength ??
    data.obStrength ??
    null
  );

}


function orderBlockHTML(
  data
) {

  const type =
    getOBType(data);


  const status =
    getOBStatus(data);


  const high =
    getOBHigh(data);


  const low =
    getOBLow(data);


  const strength =
    getOBStrength(data);


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
      status === "ABOVE_ZONE"
    ) {

      message =
        "WAITING FOR OB RETEST";

    } else if (
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
      class="ob-panel"
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
          gap:10px;
          align-items:center;
          margin-bottom:8px;
        "
      >

        <b>
          ORDER BLOCK
        </b>

        <span
          class="pill ${
            type === "BULLISH"
              ? "buy"
              :
            type === "BEARISH"
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
          gap:8px;
        "
      >

        <div>

          <small>
            OB HIGH
          </small>

          <br>

          <b>
            ${fmt(high, data.pair)}
          </b>

        </div>


        <div>

          <small>
            OB LOW
          </small>

          <br>

          <b>
            ${fmt(low, data.pair)}
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
    signal === "BUY"
      ? "buy"
      : signal === "SELL"
      ? "sell"
      : "wait";


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

        <span class="pill ${className}">
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
          OB:
          ${obType}
        </span>

        <span>
          ${obStatus}
        </span>

      </div>

    </div>

  `;

}


// =====================================================
// PLACE TRADE BUTTON
// =====================================================

function createTradeButton(
  data
) {

  const signal =
    data.signal;


  if (
    signal !== "BUY" &&
    signal !== "SELL"
  ) {

    return "";

  }


  const mode =
    getTradingMode();


  const text =
    mode === "MANUAL"
      ? "VIEW TRADE LEVELS"
      :
    mode === "DEMO"
      ? `PLACE ${signal} • DEMO`
      :
      `PLACE ${signal} • REAL`;


  return `

    <button
      id="mogriPlaceTrade"
      class="trade-button"
      style="
        width:100%;
        margin-top:14px;
        padding:13px;
        border:0;
        border-radius:10px;
        font-weight:700;
        cursor:pointer;
      "
    >

      ${text}

    </button>

  `;

}


// =====================================================
// PLACE TRADE
// =====================================================

async function placeTrade(
  data
) {

  const mode =
    getTradingMode();


  const signal =
    data.signal;


  if (
    signal !== "BUY" &&
    signal !== "SELL"
  ) {

    alert(
      "There is no confirmed trade signal."
    );

    return;

  }


  const entryLow =
    Number(
      data.entryLow
    );


  const entryHigh =
    Number(
      data.entryHigh
    );


  const entry =
    (
      entryLow +
      entryHigh
    ) / 2;


  const sl =
    Number(
      data.sl
    );


  const tp1 =
    Number(
      data.tp1
    );


  const tp2 =
    Number(
      data.tp2
    );


  const tp3 =
    Number(
      data.tp3
    );


  if (
    !Number.isFinite(entry) ||
    !Number.isFinite(sl) ||
    !Number.isFinite(tp1)
  ) {

    alert(
      "Trade levels are incomplete."
    );

    return;

  }


  if (
    mode === "MANUAL"
  ) {

    alert(

      `${signal} TRADE LEVELS\n\n` +

      `Pair: ${data.pair}\n` +

      `Entry: ${fmt(
        entry,
        data.pair
      )}\n` +

      `Entry Zone: ${fmt(
        entryLow,
        data.pair
      )} - ${fmt(
        entryHigh,
        data.pair
      )}\n` +

      `SL: ${fmt(
        sl,
        data.pair
      )}\n` +

      `TP1: ${fmt(
        tp1,
        data.pair
      )}\n` +

      `TP2: ${fmt(
        tp2,
        data.pair
      )}\n` +

      `TP3: ${fmt(
        tp3,
        data.pair
      )}`

    );


    return;

  }


  if (
    mode === "REAL"
  ) {

    const confirmed =
      confirm(

        `REAL TRADE WARNING\n\n` +

        `${signal} ${data.pair}\n\n` +

        `Entry: ${fmt(
          entry,
          data.pair
        )}\n` +

        `SL: ${fmt(
          sl,
          data.pair
        )}\n` +

        `TP1: ${fmt(
          tp1,
          data.pair
        )}\n` +

        `TP2: ${fmt(
          tp2,
          data.pair
        )}\n` +

        `TP3: ${fmt(
          tp3,
          data.pair
        )}\n\n` +

        `Continue?`

      );


    if (!confirmed) {

      return;

    }

  }


  try {

    const response =
      await fetch(
        "/api/trade",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({

              mode,

              symbol:
                data.pair,

              side:
                signal,

              entry,

              entryLow,

              entryHigh,

              stopLoss:
                sl,

              takeProfit1:
                tp1,

              takeProfit2:
               
