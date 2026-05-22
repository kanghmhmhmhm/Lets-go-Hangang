const START_CASH = 1000000;

const marketTemplates = [
  {
    id: "ant",
    name: "지태전자",
    price: 10000,
    volatility: 0.018,
    drift: 0.0006,
    color: "#61a5ff",
  },
  {
    id: "moon",
    name: "세종코인",
    price: 420,
    volatility: 0.055,
    drift: -0.0003,
    color: "#ffd166",
  },
  {
    id: "paper",
    name: "휴지바이오",
    price: 2600,
    volatility: 0.04,
    drift: -0.001,
    delistRisk: 0.018,
    color: "#ff5b6b",
  },
  {
    id: "safe",
    name: "레전드금융",
    price: 58000,
    volatility: 0.01,
    drift: 0.0002,
    color: "#3ddc84",
  },
];

const newsEvents = [
  { text: "개발사 대표 야반도주 소문 확산", impact: -0.22, panic: 12 },
  { text: "대기업 인수설 등장, 커뮤니티 과열", impact: 0.28, panic: 9 },
  { text: "거래소 점검 연장 발표", impact: -0.16, panic: 16, lag: true },
  { text: "유명 방송인 '이거 간다' 발언", impact: 0.2, panic: 18 },
  { text: "인수설 사실무근 공시", impact: -0.31, panic: 20 },
  { text: "익명의 큰손 매집설", impact: 0.16, panic: 7 },
  { text: "개발팀 단체 휴가 사진 유출", impact: -0.12, panic: 8 },
  { text: "새벽 3시 백서 수정, 투자자 혼란", impact: -0.18, panic: 10 },
  { text: "해외 거래소 상장 루머", impact: 0.24, panic: 14 },
];

const state = {
  cash: START_CASH,
  selectedId: "ant",
  markets: [],
  holdings: {},
  positions: [],
  mode: "spot",
  leverage: 10,
  running: false,
  duration: 180,
  remaining: 180,
  tick: 0,
  tradeCount: 0,
  liquidationCount: 0,
  highestWorth: START_CASH,
  biggestDrawdown: 0,
  panic: 50,
  lagUntil: 0,
  timerId: null,
  chartId: null,
};

const els = {
  netWorth: document.querySelector("#netWorth"),
  cash: document.querySelector("#cash"),
  returnRate: document.querySelector("#returnRate"),
  timer: document.querySelector("#timer"),
  assetList: document.querySelector("#assetList"),
  selectedName: document.querySelector("#selectedName"),
  selectedPrice: document.querySelector("#selectedPrice"),
  selectedMove: document.querySelector("#selectedMove"),
  chartCanvas: document.querySelector("#chartCanvas"),
  tickerText: document.querySelector("#tickerText"),
  spotTab: document.querySelector("#spotTab"),
  leverageTab: document.querySelector("#leverageTab"),
  leverageControls: document.querySelector("#leverageControls"),
  orderAmount: document.querySelector("#orderAmount"),
  buyButton: document.querySelector("#buyButton"),
  sellButton: document.querySelector("#sellButton"),
  holdingsList: document.querySelector("#holdingsList"),
  newsFeed: document.querySelector("#newsFeed"),
  tradeLog: document.querySelector("#tradeLog"),
  panicMeter: document.querySelector("#panicMeter"),
  tradeCount: document.querySelector("#tradeCount"),
  toast: document.querySelector("#toast"),
  startModal: document.querySelector("#startModal"),
  startButton: document.querySelector("#startButton"),
  endModal: document.querySelector("#endModal"),
  restartButton: document.querySelector("#restartButton"),
  resultTitle: document.querySelector("#resultTitle"),
  resultStats: document.querySelector("#resultStats"),
};

const ctx = els.chartCanvas.getContext("2d");

function formatWon(value) {
  const safeValue = Math.max(0, Math.round(value));
  return `${safeValue.toLocaleString("ko-KR")}원`;
}

function formatPercent(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function selectedMarket() {
  return state.markets.find((market) => market.id === state.selectedId);
}

function resetGame(duration = state.duration) {
  state.cash = START_CASH;
  state.selectedId = "ant";
  state.markets = marketTemplates.map((market) => ({
    ...market,
    startPrice: market.price,
    price: market.price,
    history: Array.from({ length: 80 }, () => market.price),
    delisted: false,
  }));
  state.holdings = {};
  state.positions = [];
  state.mode = "spot";
  state.leverage = 10;
  state.running = false;
  state.duration = duration;
  state.remaining = duration;
  state.tick = 0;
  state.tradeCount = 0;
  state.liquidationCount = 0;
  state.highestWorth = START_CASH;
  state.biggestDrawdown = 0;
  state.panic = 50;
  state.lagUntil = 0;
  els.newsFeed.innerHTML = "";
  els.tradeLog.innerHTML = "";
  els.orderAmount.value = 100000;
  updateModeTabs();
  render();
}

function startGame() {
  resetGame(state.duration);
  state.running = true;
  els.startModal.classList.add("hidden");
  els.endModal.classList.add("hidden");
  addNews("장 시작. 오늘도 시장은 아무 책임을 지지 않습니다.", "flat");
  state.timerId = setInterval(gameTick, 1000);
  state.chartId = setInterval(() => {
    renderChart();
    renderHeader();
  }, 120);
}

function stopGame(reason = "time") {
  state.running = false;
  clearInterval(state.timerId);
  clearInterval(state.chartId);
  state.timerId = null;
  state.chartId = null;
  showResults(reason);
}

function gameTick() {
  if (!state.running) return;

  state.remaining -= 1;
  state.tick += 1;

  state.markets.forEach(updateMarket);

  if (Math.random() < 0.35) triggerNewsEvent();
  if (Math.random() < 0.035) triggerRiggedTiming();

  updateLiquidations();
  const worth = calculateNetWorth();
  state.highestWorth = Math.max(state.highestWorth, worth);
  state.biggestDrawdown = Math.max(state.biggestDrawdown, (state.highestWorth - worth) / state.highestWorth);

  if (worth <= 0) {
    stopGame("bankrupt");
    return;
  }

  if (state.remaining <= 0) {
    stopGame("time");
    return;
  }

  render();
}

function updateMarket(market) {
  if (market.delisted) {
    if (Math.random() < 0.01) {
      market.delisted = false;
      market.price = Math.max(1, market.startPrice * 8);
      addNews(`${market.name} 기적의 재상장. 10,000% 간다는 말이 다시 돕니다.`, "positive");
    } else {
      market.price = Math.max(1, market.price * 0.99);
    }
  } else {
    const noise = (Math.random() - 0.5) * market.volatility * 2;
    const panicNoise = ((state.panic - 50) / 50) * market.volatility * (Math.random() - 0.45);
    const nextPrice = market.price * (1 + market.drift + noise + panicNoise);
    market.price = Math.max(1, nextPrice);

    if (market.delistRisk && Math.random() < market.delistRisk && market.price < market.startPrice * 0.55) {
      market.delisted = true;
      market.price = Math.max(1, market.price * 0.03);
      addNews(`${market.name} 거래정지 공포. 호가창이 종이처럼 얇아졌습니다.`, "negative");
    }
  }

  market.history.push(market.price);
  if (market.history.length > 120) market.history.shift();
}

function triggerNewsEvent() {
  const market = state.markets[Math.floor(Math.random() * state.markets.length)];
  const event = newsEvents[Math.floor(Math.random() * newsEvents.length)];
  const impact = event.impact * (0.7 + Math.random() * 0.7);
  market.price = Math.max(1, market.price * (1 + impact));
  market.history.push(market.price);
  state.panic = clamp(state.panic + event.panic * Math.sign(Math.abs(event.impact)), 0, 100);
  if (event.lag) state.lagUntil = Date.now() + 4500;
  addNews(`${market.name}: ${event.text} (${formatPercent(impact * 100)})`, impact >= 0 ? "positive" : "negative");
}

function triggerRiggedTiming() {
  const market = selectedMarket();
  const drop = 0.08 + Math.random() * 0.18;
  market.price = Math.max(1, market.price * (1 - drop));
  market.history.push(market.price);
  state.lagUntil = Date.now() + 2600;
  addNews(`${market.name}: 악재 미끄럼틀 발동. 방금 산 사람만 아는 그 맛.`, "negative");
  showToast("주문 폭주로 인한 매도 지연");
}

function buy() {
  if (!state.running) return;
  const market = selectedMarket();
  const amount = readOrderAmount();
  if (amount <= 0 || state.cash < amount) {
    showToast("주문 가능 금액이 부족합니다.");
    return;
  }

  if (state.mode === "leverage") {
    const size = amount * state.leverage;
    state.cash -= amount;
    state.positions.push({
      marketId: market.id,
      margin: amount,
      size,
      entry: market.price,
      leverage: state.leverage,
    });
    state.tradeCount += 1;
    addTrade(`${market.name} ${state.leverage}x 진입: 증거금 ${formatWon(amount)}`);
  } else {
    const quantity = amount / market.price;
    state.cash -= amount;
    state.holdings[market.id] = (state.holdings[market.id] || 0) + quantity;
    state.tradeCount += 1;
    addTrade(`${market.name} 매수: ${formatWon(amount)}`);
  }

  if (Math.random() < 0.18) {
    setTimeout(triggerRiggedTiming, 180);
  }

  render();
}

function sell() {
  if (!state.running) return;
  if (Date.now() < state.lagUntil) {
    showToast("매도 주문 처리 중... 처리 중... 처리 중...");
    return;
  }

  const market = selectedMarket();

  if (state.mode === "leverage") {
    const related = state.positions.filter((position) => position.marketId === market.id);
    if (!related.length) {
      showToast("청산할 레버리지 포지션이 없습니다.");
      return;
    }
    state.positions = state.positions.filter((position) => position.marketId !== market.id);
    related.forEach((position) => {
      const pnl = ((market.price - position.entry) / position.entry) * position.size;
      state.cash += Math.max(0, position.margin + pnl);
      addTrade(`${market.name} ${position.leverage}x 종료: ${formatWon(position.margin + pnl)}`, pnl >= 0 ? "positive" : "negative");
    });
  } else {
    const quantity = state.holdings[market.id] || 0;
    if (quantity <= 0) {
      showToast("매도할 보유 수량이 없습니다.");
      return;
    }
    const value = quantity * market.price;
    state.cash += value;
    state.holdings[market.id] = 0;
    addTrade(`${market.name} 전량 매도: ${formatWon(value)}`);
  }

  state.tradeCount += 1;
  render();
}

function updateLiquidations() {
  const survivors = [];

  state.positions.forEach((position) => {
    const market = state.markets.find((item) => item.id === position.marketId);
    const move = (market.price - position.entry) / position.entry;
    const equity = position.margin + move * position.size;
    const liquidationLine = position.margin * 0.16;

    if (equity <= liquidationLine) {
      state.liquidationCount += 1;
      addTrade(`${market.name} ${position.leverage}x 강제 청산`, "negative");
      showToast("강제 청산: 증거금이 사라졌습니다.");
    } else {
      survivors.push(position);
    }
  });

  state.positions = survivors;
}

function calculateNetWorth() {
  const spotValue = Object.entries(state.holdings).reduce((total, [id, quantity]) => {
    const market = state.markets.find((item) => item.id === id);
    return total + quantity * market.price;
  }, 0);

  const positionValue = state.positions.reduce((total, position) => {
    const market = state.markets.find((item) => item.id === position.marketId);
    const pnl = ((market.price - position.entry) / position.entry) * position.size;
    return total + Math.max(0, position.margin + pnl);
  }, 0);

  return state.cash + spotValue + positionValue;
}

function readOrderAmount() {
  const value = Number(els.orderAmount.value);
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

function render() {
  renderAssets();
  renderHeader();
  renderHoldings();
  renderChart();

  const worth = calculateNetWorth();
  const rate = ((worth - START_CASH) / START_CASH) * 100;
  els.netWorth.textContent = formatWon(worth);
  els.cash.textContent = formatWon(state.cash);
  els.returnRate.textContent = formatPercent(rate);
  els.returnRate.className = rate > 0 ? "positive" : rate < 0 ? "negative" : "flat";
  els.timer.textContent = formatTime(state.remaining);
  els.panicMeter.textContent = `탐욕 ${Math.round(state.panic)}`;
  els.tradeCount.textContent = `${state.tradeCount}회`;
}

function renderAssets() {
  els.assetList.innerHTML = "";
  state.markets.forEach((market) => {
    const change = ((market.price - market.startPrice) / market.startPrice) * 100;
    const button = document.createElement("button");
    button.className = `asset-button ${market.id === state.selectedId ? "active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <span class="asset-name">${market.name}</span>
      <span class="${change >= 0 ? "up" : "down"}">${formatPercent(change)}</span>
      <span class="asset-price">${formatWon(market.price)}</span>
      <span class="asset-price">${market.delisted ? "거래정지" : "거래중"}</span>
    `;
    button.addEventListener("click", () => {
      state.selectedId = market.id;
      render();
    });
    els.assetList.appendChild(button);
  });
}

function renderHeader() {
  const market = selectedMarket();
  const prev = market.history[Math.max(0, market.history.length - 12)] || market.startPrice;
  const move = ((market.price - prev) / prev) * 100;
  els.selectedName.textContent = market.name;
  els.selectedPrice.textContent = formatWon(market.price);
  els.selectedMove.textContent = formatPercent(move);
  els.selectedMove.className = move > 0 ? "positive" : move < 0 ? "negative" : "flat";
  els.tickerText.textContent = Date.now() < state.lagUntil
    ? "주문 폭주로 매도 처리가 지연되고 있습니다."
    : "뉴스는 랜덤이고, 책임은 계좌가 집니다.";
}

function renderHoldings() {
  const rows = [];

  Object.entries(state.holdings).forEach(([id, quantity]) => {
    if (quantity <= 0) return;
    const market = state.markets.find((item) => item.id === id);
    rows.push(`<div class="holding-row"><span>${market.name}</span><strong>${formatWon(quantity * market.price)}</strong></div>`);
  });

  state.positions.forEach((position) => {
    const market = state.markets.find((item) => item.id === position.marketId);
    const pnlRate = ((market.price - position.entry) / position.entry) * position.leverage * 100;
    rows.push(`<div class="holding-row"><span>${market.name} ${position.leverage}x</span><strong class="${pnlRate >= 0 ? "positive" : "negative"}">${formatPercent(pnlRate)}</strong></div>`);
  });

  els.holdingsList.innerHTML = rows.join("") || `<div class="holding-row"><span>보유 없음</span><strong>대기중</strong></div>`;
}

function renderChart() {
  syncCanvasSize();
  const market = selectedMarket();
  const width = els.chartCanvas.width;
  const height = els.chartCanvas.height;
  const padding = 30;
  const history = market.history;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = Math.max(1, max - min);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0d0f12";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#20242b";
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i += 1) {
    const y = padding + ((height - padding * 2) / 5) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  ctx.strokeStyle = market.price >= market.startPrice ? "#3ddc84" : "#ff5b6b";
  ctx.lineWidth = 3;
  ctx.beginPath();
  history.forEach((price, index) => {
    const x = padding + (index / Math.max(1, history.length - 1)) * (width - padding * 2);
    const y = height - padding - ((price - min) / range) * (height - padding * 2);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const lastY = height - padding - ((market.price - min) / range) * (height - padding * 2);
  ctx.fillStyle = market.color;
  ctx.beginPath();
  ctx.arc(width - padding, lastY, 5, 0, Math.PI * 2);
  ctx.fill();
}

function syncCanvasSize() {
  const rect = els.chartCanvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const nextWidth = Math.max(320, Math.floor(rect.width * scale));
  const nextHeight = Math.max(260, Math.floor(rect.height * scale));

  if (els.chartCanvas.width !== nextWidth || els.chartCanvas.height !== nextHeight) {
    els.chartCanvas.width = nextWidth;
    els.chartCanvas.height = nextHeight;
  }
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function addNews(text, tone = "flat") {
  const line = document.createElement("p");
  line.className = tone;
  line.textContent = `[${formatTime(state.remaining)}] ${text}`;
  els.newsFeed.appendChild(line);
}

function addTrade(text, tone = "flat") {
  const line = document.createElement("p");
  line.className = tone;
  line.textContent = `[${formatTime(state.remaining)}] ${text}`;
  els.tradeLog.appendChild(line);
}

function showToast(text) {
  els.toast.textContent = text;
  els.toast.classList.remove("hidden");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => els.toast.classList.add("hidden"), 1800);
}

function showResults(reason) {
  const worth = calculateNetWorth();
  const rate = ((worth - START_CASH) / START_CASH) * 100;
  const titleMap = {
    bankrupt: "파산했습니다",
    time: rate >= 0 ? "수익 실현" : "손실 마감",
  };

  els.resultTitle.textContent = titleMap[reason] || "결과";
  els.resultStats.innerHTML = `
    <div class="stat-row"><span>최종 자산</span><strong>${formatWon(worth)}</strong></div>
    <div class="stat-row"><span>최종 수익률</span><strong class="${rate >= 0 ? "positive" : "negative"}">${formatPercent(rate)}</strong></div>
    <div class="stat-row"><span>최고 자산</span><strong>${formatWon(state.highestWorth)}</strong></div>
    <div class="stat-row"><span>최대 낙폭</span><strong class="negative">${formatPercent(-state.biggestDrawdown * 100)}</strong></div>
    <div class="stat-row"><span>매매 횟수</span><strong>${state.tradeCount}회</strong></div>
    <div class="stat-row"><span>청산 횟수</span><strong>${state.liquidationCount}회</strong></div>
  `;
  els.endModal.classList.remove("hidden");
}

function updateModeTabs() {
  els.spotTab.classList.toggle("active", state.mode === "spot");
  els.leverageTab.classList.toggle("active", state.mode === "leverage");
  els.leverageControls.classList.toggle("hidden", state.mode !== "leverage");
}

els.spotTab.addEventListener("click", () => {
  state.mode = "spot";
  updateModeTabs();
});

els.leverageTab.addEventListener("click", () => {
  state.mode = "leverage";
  updateModeTabs();
});

document.querySelectorAll("[data-percent]").forEach((button) => {
  button.addEventListener("click", () => {
    const percent = Number(button.dataset.percent);
    els.orderAmount.value = Math.floor(state.cash * percent);
  });
});

document.querySelectorAll("[data-lev]").forEach((button) => {
  button.addEventListener("click", () => {
    state.leverage = Number(button.dataset.lev);
    document.querySelectorAll("[data-lev]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
  });
});

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    state.duration = Number(button.dataset.mode);
    state.remaining = state.duration;
    document.querySelectorAll("[data-mode]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    render();
  });
});

els.buyButton.addEventListener("click", buy);
els.sellButton.addEventListener("click", sell);
els.startButton.addEventListener("click", startGame);
els.restartButton.addEventListener("click", () => {
  els.endModal.classList.add("hidden");
  els.startModal.classList.remove("hidden");
  resetGame(state.duration);
});

window.addEventListener("resize", renderChart);

resetGame(180);
