// =====================================================
// MOGRI AI FOREX SIGNAL ANALYZER
// LIVE MARKET DATA • PAPER MODE
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

  // Look for common clock elements
  const clockElements =
    document.querySelectorAll(
      "#clock, #time, .clock, .time, .current-time"
    );

  clockElements.forEach(element => {
    element.textContent = time;
  });

}


// =====================================================
// START LIVE CLOCK
// =====================================================

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

function fmt(value, pair) {

  if (
    value === undefined ||
    value === null ||
    !Number.isFinite(Number(value))
  ) {
    return "—";
  }

  if (pair === "XAU/USD") {
    return Number(value).toFixed(2);
  }

  return Number(value).toFixed(5);
}


// =====================================================
// STATUS
// =====================================================

function setStatus(message) {

  const elements =
    document.querySelectorAll(".demo");

  elements.forEach(element => {
    element.textContent = message;
  });

}


// =====================================================
// CACHE KEY
// =====================================================

function cacheKey(pair, tf) {

  return `${pair}_${tf}`;

}


// =====================================================
// GET CACHE
// =====================================================

function getCached(pair, tf) {

  const key =
    cacheKey(pair, tf);

  const item =
    marketCache.get(key);

  if (!item) {
    return null;
  }

  const age =
    Date.now() - item.time;

  if (age > CACHE_TIME) {

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


// =====================================================
// SAVE CACHE
// =====================================================

function saveCache(pair, tf, data) {

  marketCache.set(
    cacheKey(pair, tf),
    {
      time: Date.now(),
      data: data
    }
  );

}


// =====================================================
// LOAD MARKET DATA
// =====================================================

async function analyze(pair, tf) {

  const interval =
    tfMap[tf] || "15min";


  // Check cache first
  const cached =
    getCached(pair, tf);

  if (cached) {
    return cached;
  }


  const key =
    cacheKey(pair, tf);


  // Prevent duplicate requests
  const loadingKey =
    `${key}_loading`;


  if (
    marketCache.has(loadingKey)
  ) {

    return await marketCache.get(
      loadingKey
    );

  }


  const request =
    fetch(
      `/api/market?symbol=${encodeURIComponent(pair)}&interval=${encodeURIComponent(interval)}`
    )

      .then(async response => {

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
// SCANNER CARD
// =====================================================

function card(data) {

  const signal =
    data.signal || "WAIT";


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
            width:${confidence}%
          "
        ></i>

      </div>


      <div class="mini">

        <span>
          ${data.tf || "15min"}
        </span>

        <span>

          FVG
          ${data.fvg ? "✓" : "—"}

          •

          LIQ
          ${data.liquidity ? "✓" : "—"}

        </span>

      </div>

    </div>

  `;

}


// =====================================================
// SHOW SIGNAL
// =====================================================

function show(data) {

  const signal =
    data.signal || "WAIT";


  const className =
    signal === "BUY"
      ? "buy"
      : signal === "SELL"
      ? "sell"
      : "wait";


  const signalBox =
    document.querySelector("#signal");


  if (!signalBox) {
    return;
  }


  signalBox.className =
    "signal";


  signalBox.innerHTML = `

    <div class="signal-top">

      <span class="pill ${className}">
        ${signal}
      </span>

      <span>

        ${data.pair}

        •

        ${data.tf}

        •

        ${data.time || ""}

      </span>

    </div>


    <h2>

      ${
        signal === "WAIT"
          ? "NO TRADE — WAIT"
          : signal + " SETUP DETECTED"
      }

    </h2>


    <div class="levels">


      <div class="level">

        <small>
          PRICE
        </small>

        <b>
          ${fmt(
            data.price,
            data.pair
          )}
        </b>

      </div>


      <div class="level">

        <small>
          ENTRY ZONE
        </small>

        <b>

          ${
            signal === "WAIT"

              ? "—"

              :

                fmt(
                  data.entryLow,
                  data.pair
                )
                +
                " – "
                +
                fmt(
                  data.entryHigh,
                  data.pair
                )

          }

        </b>

      </div>


      <div class="level">

        <small>
          STOP LOSS
        </small>

        <b>

          ${
            signal === "WAIT"

              ? "—"

              :

                fmt(
                  data.sl,
                  data.pair
                )

          }

        </b>

      </div>


      <div class="level">

        <small>
          TP1 / TP2 / TP3
        </small>

        <b>

          ${
            signal === "WAIT"

              ? "—"

              :

                fmt(
                  data.tp1,
                  data.pair
                )
                +
                " / "
                +
                fmt(
                  data.tp2,
                  data.pair
                )
                +
                " / "
                +
                fmt(
                  data.tp3,
                  data.pair
                )

          }

        </b>

      </div>


    </div>


    <div class="reasons">


      <span class="reason">

        ${data.fvg ? "✓" : "✕"}

        Fair Value Gap

      </span>


      <span class="reason">

        ${data.liquidity ? "✓" : "✕"}

        Liquidity Sweep

      </span>


      <span class="reason">

        ${data.structure ? "✓" : "✕"}

        Market Structure

      </span>


      <span class="reason">

        ${data.breakRetest ? "✓" : "✕"}

        Breakout / Retest

      </span>


      <span class="reason">

        ${
          data.bias === "BULLISH"

            ? "✓ Bullish Bias"

            :

          data.bias === "BEARISH"

            ? "✓ Bearish Bias"

            :

            "• Neutral Bias"
        }

      </span>


    </div>

  `;

}


// =====================================================
// SIGNAL HISTORY
// =====================================================

function history(data) {

  if (
    !data ||
    data.signal === "WAIT"
  ) {
    return;
  }


  const historyBox =
    document.querySelector(
      "#history"
    );


  if (!historyBox) {
    return;
  }


  historyBox.innerHTML = `

    <div class="row">

      <b>
        ${data.pair}
      </b>

      <span>
        ${data.signal}
      </span>

      <span>
        ${data.confidence}%
      </span>

      <span>
        ${data.time || ""}
      </span>

    </div>

  ` + historyBox.innerHTML;

}


// =====================================================
// RENDER SCANNER
// =====================================================

function renderScanner(results) {

  const marketsBox =
    document.querySelector(
      "#markets"
    );


  if (!marketsBox) {
    return;
  }


  if (!results.length) {

    marketsBox.innerHTML = `

      <div class="card">

        <b>
          Market data unavailable
        </b>

        <p class="muted">

          No market data was returned.

        </p>

      </div>

    `;

    return;
  }


  marketsBox.innerHTML =
    results
      .map(card)
      .join("");


  // Count BUY and SELL only
  const strongSetups =
    results.filter(
      item =>
        item.signal === "BUY" ||
        item.signal === "SELL"
    );


  const setupsBox =
    document.querySelector(
      "#setups"
    );


  if (setupsBox) {

    setupsBox.textContent =
      strongSetups.length;

  }


  // Average confidence
  const confidenceBox =
    document.querySelector(
      "#confidence"
    );


  if (confidenceBox) {

    const average =
      Math.round(

        results.reduce(
          (sum, item) =>
            sum +
            Number(
              item.confidence || 0
            ),
          0
        )
        /
        results.length

      );


    confidenceBox.textContent =
      average + "%";

  }

}


// =====================================================
// SCAN ALL MARKETS
// =====================================================

async function scan() {

  if (scanRunning) {
    return;
  }


  scanRunning = true;


  const scanButton =
    document.querySelector(
      "#scan"
    );


  if (scanButton) {

    scanButton.disabled =
      true;

    scanButton.textContent =
      "Scanning…";

  }


  setStatus(
    "● SCANNING LIVE DATA • PAPER MODE"
  );


  const results = [];


  try {

    for (
      const pair of markets
    ) {

      try {

        const data =
          await analyze(
            pair,
            "15M"
          );


        results.push(
          data
        );


      } catch (error) {

        console.error(
          pair,
          error
        );

      }

    }


    renderScanner(
      results
    );


    if (results.length) {

      setStatus(
        "● LIVE DATA • PAPER MODE"
      );

    } else {

      setStatus(
        "● DATA UNAVAILABLE"
      );

    }


  } catch (error) {

    console.error(
      error
    );


    setStatus(
      "● DATA ERROR"
    );


  } finally {

    scanRunning =
      false;


    if (scanButton) {

      scanButton.disabled =
        false;

      scanButton.textContent =
        "↻ Scan Markets";

    }

  }

}


// =====================================================
// ANALYZE SELECTED MARKET
// =====================================================

async function analyzeSelected() {

  const pairElement =
    document.querySelector(
      "#pair"
    );


  const tfElement =
    document.querySelector(
      "#tf"
    );


  const signalBox =
    document.querySelector(
      "#signal"
    );


  if (!pairElement || !tfElement) {

    console.error(
      "Pair or timeframe selector not found."
    );

    return;

  }


  const pair =
    pairElement.value;


  const tf =
    tfElement.value;


  const analyzeButton =
    document.querySelector(
      "#analyze"
    );


  if (analyzeButton) {

    analyzeButton.disabled =
      true;

    analyzeButton.textContent =
      "Analyzing…";

  }


  setStatus(
    "● CHECKING LIVE DATA • PAPER MODE"
  );


  try {

    const data =
      await analyze(
        pair,
        tf
      );


    show(
      data
    );


    history(
      data
    );


    setStatus(
      "● LIVE DATA • PAPER MODE"
    );


  } catch (error) {

    console.error(
      error
    );


    if (signalBox) {

      signalBox.className =
        "signal";


      signalBox.innerHTML = `

        <div class="signal-top">

          <span class="pill wait">
            DATA ERROR
          </span>

        </div>


        <h2>
          Failed to load data
        </h2>


        <p class="muted">

          ${error.message}

        </p>


        <p class="muted">

          If you have reached the
          Twelve Data API limit,
          wait for the next minute
          before trying again.

        </p>

      `;

    }


    setStatus(
      "● API LIMIT / DATA ERROR"
    );


  } finally {

    if (analyzeButton) {

      analyzeButton.disabled =
        false;

      analyzeButton.textContent =
        "Analyze Selected";

    }

  }

}


// =====================================================
// CONNECT BUTTONS AFTER PAGE LOAD
// =====================================================

function initializeMogriAI() {

  console.log(
    "MOGRI AI starting..."
  );


  const scanButton =
    document.querySelector(
      "#scan"
    );


  const analyzeButton =
    document.querySelector(
      "#analyze"
    );


  // Scan button
  if (scanButton) {

    scanButton.addEventListener(
      "click",
      scan
    );


    console.log(
      "Scan button connected."
    );

  } else {

    console.error(
      "Scan button #scan not found."
    );

  }


  // Analyze button
  if (analyzeButton) {

    analyzeButton.addEventListener(
      "click",
      analyzeSelected
    );


    console.log(
      "Analyze button connected."
    );

  } else {

    console.error(
      "Analyze button #analyze not found."
    );

  }


  // Start real-time device clock
  startLiveClock();


  // Initial status
  setStatus(
    "● LIVE DATA • PAPER MODE"
  );


  console.log(
    "MOGRI AI initialized."
  );


  console.log(
    "Market data cache: 60 seconds."
  );


  console.log(
    "Automatic scanning: OFF."
  );


  console.log(
    "Live clock: ON."
  );

}


// =====================================================
// PAGE LOAD
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
