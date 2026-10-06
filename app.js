const symbols=["BTCUSDT","ETHUSDT","SOLUSDT"];
const names={BTCUSDT:"BTC/USDT",ETHUSDT:"ETH/USDT",SOLUSDT:"SOL/USDT"};
const state={};

function fmtPrice(v){
  if(v>=1000) return "$"+Number(v).toLocaleString(undefined,{maximumFractionDigits:2});
  if(v>=1) return "$"+Number(v).toLocaleString(undefined,{maximumFractionDigits:3});
  return "$"+Number(v).toLocaleString(undefined,{maximumFractionDigits:6});
}
function scoreTicker(t){
  const ch=Number(t.price24hPcnt)*100;
  let score=50+Math.max(-25,Math.min(25,ch*3));
  return Math.round(Math.max(1,Math.min(99,score)));
}
async function getTickers(){
  const url="https://api.bitget.com/api/v3/market/tickers?category=SPOT";
  const r=await fetch(url,{cache:"no-store"});
  if(!r.ok) throw new Error("Bitget HTTP "+r.status);
  const j=await r.json();
  if(j.code!=="00000") throw new Error(j.msg||"Bitget API error");
  return j.data.filter(x=>symbols.includes(x.symbol));
}
function renderMarkets(data){
  const grid=document.getElementById("marketGrid");
  grid.innerHTML=data.map(t=>{
    const pct=Number(t.price24hPcnt)*100;
    const cls=pct>=0?"up":"down";
    return `<div class="market-card"><div class="symbol">${names[t.symbol]}</div><div class="price">${fmtPrice(t.lastPrice)}</div><div class="${cls}">${pct>=0?"+":""}${pct.toFixed(2)}%</div><small>24H • High ${fmtPrice(t.highPrice24h)} • Low ${fmtPrice(t.lowPrice24h)}</small></div>`;
  }).join("");
}
function renderBoard(data){
  const board=document.getElementById("opportunityBoard");
  const rows=data.map(t=>{
    const score=scoreTicker(t), pct=Number(t.price24hPcnt)*100;
    const signal=score>=70?"BUY WATCH":score>=55?"WATCH":"WAIT";
    const cls=pct>=0?"green":"down";
    return `<div class="row"><b>${names[t.symbol]}</b><strong>${score}/100</strong><em class="${signal==="BUY WATCH"?"green":""}">${signal}</em><span class="${cls}">${pct>=0?"+":""}${pct.toFixed(2)}%</span><button class="mini" onclick="review('${names[t.symbol]}',${score})">Review</button></div>`;
  }).join("");
  board.innerHTML='<div class="row head"><span>Asset</span><span>AI Score</span><span>Signal</span><span>24H</span><span>Action</span></div>'+rows;
  document.getElementById("signals").textContent=data.filter(t=>scoreTicker(t)>=70).length;
}
async function refreshAll(){
  const status=document.getElementById("dataStatus");
  try{
    const data=await getTickers();
    data.forEach(t=>state[t.symbol]=t);
    renderMarkets(data); renderBoard(data);
    status.textContent="LIVE • BITGET";
    document.querySelector(".top-status").classList.remove("offline");
    document.getElementById("lastUpdate").textContent=new Date().toLocaleTimeString();
  }catch(e){
    status.textContent="OFFLINE";
    document.querySelector(".top-status").classList.add("offline");
    console.error(e);
  }
}
function runScan(){
  const count=document.getElementById("signals").textContent;
  alert("Market Scout scan complete. Current live ticker opportunities: "+count+". Full technical/news/risk agents are the next build stage.");
}
function review(symbol,score){
  alert(symbol+" — live-ticker score "+score+"/100. No order is created. Full AI analysis will be added in the next stage.");
}
function stopAI(){alert("AI trading is locked. This site cannot place real orders.");}
refreshAll();
setInterval(refreshAll,15000);
