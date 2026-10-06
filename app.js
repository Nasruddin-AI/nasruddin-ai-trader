const symbols=["BTCUSDT","ETHUSDT","SOLUSDT"];
const names={BTCUSDT:"BTC/USDT",ETHUSDT:"ETH/USDT",SOLUSDT:"SOL/USDT"};
const state={};
const interval="15m";
function fmtPrice(v){v=Number(v);if(v>=1000)return "$"+v.toLocaleString(undefined,{maximumFractionDigits:2});if(v>=1)return "$"+v.toLocaleString(undefined,{maximumFractionDigits:3});return "$"+v.toLocaleString(undefined,{maximumFractionDigits:6})}
function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,v))}
function avg(a){return a.reduce((x,y)=>x+y,0)/a.length}
function ema(values,n){if(values.length<n)return null;let e=avg(values.slice(0,n)),k=2/(n+1);for(let i=n;i<values.length;i++)e=values[i]*k+e*(1-k);return e}
function rsi(values,n=14){if(values.length<=n)return 50;let gains=0,losses=0;for(let i=1;i<=n;i++){let d=values[i]-values[i-1];if(d>=0)gains+=d;else losses-=d}let ag=gains/n,al=losses/n;for(let i=n+1;i<values.length;i++){let d=values[i]-values[i-1];ag=((ag*(n-1))+Math.max(d,0))/n;al=((al*(n-1))+Math.max(-d,0))/n}if(al===0)return 100;return 100-(100/(1+ag/al))}
function atr(c,n=14){if(c.length<=n)return 0;const tr=[];for(let i=1;i<c.length;i++){const h=c[i][2],l=c[i][3],pc=c[i-1][4];tr.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)))}return avg(tr.slice(-n))}
function technical(candles,ticker){
  const c=candles.map(x=>({ts:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]}));
  const closes=c.map(x=>x.c), volumes=c.map(x=>x.v), last=closes.at(-1);
  const e20=ema(closes,20),e50=ema(closes,50),r=rsi(closes,14);
  const m12=ema(closes,12),m26=ema(closes,26);let macdSeries=[];
  for(let i=26;i<=closes.length;i++){const s=closes.slice(0,i);macdSeries.push(ema(s,12)-ema(s,26))}
  const signal=ema(macdSeries,9);const macd=macdSeries.at(-1);const atrVal=atr(c,14);
  const ret5=closes.length>5?(last/closes.at(-6)-1)*100:0;const ret20=closes.length>20?(last/closes.at(-21)-1)*100:0;
  const volAvg=avg(volumes.slice(-21,-1));const volRatio=volAvg?volumes.at(-1)/volAvg:1;
  const trend= e20&&e50 ? (last>e20&&e20>e50?88:last<e20&&e20<e50?25:55):50;
  const rsiScore= r>=55&&r<=70?82:r>70?55:r>=45?60:r>=30?40:68;
  const macdScore=signal!==null?(macd>signal&&macd>0?85:macd>signal?72:macd<signal&&macd<0?25:45):50;
  const momentum=clamp(50+ret5*9+ret20*3);
  const volume=clamp(50+(volRatio-1)*35);
  const risk=clamp(100-(atrVal/last*100)*45);
  const technicalScore=Math.round(avg([trend,rsiScore,macdScore,momentum]));
  const marketScore=Math.round(avg([technicalScore,volume,50+Number(ticker.price24hPcnt)*100*2]));
  const finalScore=Math.round(avg([technicalScore,momentum,marketScore,risk]));
  let signalLabel=finalScore>=72?"BUY WATCH":finalScore>=58?"WATCH":"WAIT";
  if(r>78||r<22) signalLabel=finalScore>=75&&r<78?"BUY WATCH":"WAIT";
  return {rsi:r,ema20:e20,ema50:e50,macd,signal:signal,atr:atrVal,ret5,ret20,volRatio,technicalScore,marketScore,risk,finalScore,signalLabel,last};
}
async function getTickers(){const r=await fetch("https://api.bitget.com/api/v3/market/tickers?category=SPOT",{cache:"no-store"});if(!r.ok)throw Error("Bitget HTTP "+r.status);const j=await r.json();if(j.code!=="00000")throw Error(j.msg||"Bitget API error");return j.data.filter(x=>symbols.includes(x.symbol))}
async function getCandles(symbol){const u=`https://api.bitget.com/api/v3/market/candles?category=SPOT&symbol=${symbol}&interval=${interval}&limit=100`;const r=await fetch(u,{cache:"no-store"});if(!r.ok)throw Error("Candle HTTP "+r.status);const j=await r.json();if(j.code!=="00000")throw Error(j.msg||"Candle API error");return j.data.sort((a,b)=>Number(a[0])-Number(b[0]))}
function renderMarkets(data){document.getElementById("marketGrid").innerHTML=data.map(t=>{const p=Number(t.price24hPcnt)*100,cls=p>=0?"up":"down";return `<div class="market-card"><div class="symbol">${names[t.symbol]}</div><div class="price">${fmtPrice(t.lastPrice)}</div><div class="${cls}">${p>=0?"+":""}${p.toFixed(2)}%</div><small>24H • High ${fmtPrice(t.highPrice24h)} • Low ${fmtPrice(t.lowPrice24h)}</small></div>`}).join("")}
function renderBoard(data){const rows=data.map(t=>{const a=state[t.symbol]?.analysis||{};const p=Number(t.price24hPcnt)*100,cls=p>=0?"green":"down";const sig=a.signalLabel||"WAIT";return `<div class="row"><b>${names[t.symbol]}</b><strong>${a.finalScore??"--"}/100</strong><em class="${sig==="BUY WATCH"?"green":""}">${sig}</em><span class="${cls}">${p>=0?"+":""}${p.toFixed(2)}%</span><button class="mini" onclick="review('${t.symbol}')">Review</button></div>`}).join("");document.getElementById("opportunityBoard").innerHTML='<div class="row head"><span>Asset</span><span>AI Score</span><span>Signal</span><span>24H</span><span>Action</span></div>'+rows;document.getElementById("signals").textContent=data.filter(t=>(state[t.symbol]?.analysis?.finalScore||0)>=70).length}
function review(symbol){const t=state[symbol]?.ticker,a=state[symbol]?.analysis;if(!a)return alert("Analysis is still loading.");alert(`${names[symbol]}\n\nAI score: ${a.finalScore}/100\nSignal: ${a.signalLabel}\nTechnical: ${a.technicalScore}/100\nMomentum: ${Math.round(a.ret5>=0?Math.min(99,50+a.ret5*9):Math.max(1,50+a.ret5*9))}/100\nRisk: ${Math.round(a.risk)}/100\nRSI: ${a.rsi.toFixed(1)}\nEMA20: ${fmtPrice(a.ema20)}\nEMA50: ${fmtPrice(a.ema50)}\nMACD: ${a.macd.toFixed(4)}\nVolume ratio: ${a.volRatio.toFixed(2)}x\n\nPaper signal only. No order is created.`)}
async function refreshAll(){const status=document.getElementById("dataStatus");try{const tickers=await getTickers();for(const t of tickers){state[t.symbol]={ticker:t};try{const candles=await getCandles(t.symbol);state[t.symbol].analysis=technical(candles,t)}catch(e){console.error(e)}}renderMarkets(tickers);renderBoard(tickers);status.textContent="LIVE • BITGET";document.querySelector(".top-status").classList.remove("offline");document.getElementById("lastUpdate").textContent=new Date().toLocaleTimeString()}catch(e){status.textContent="OFFLINE";document.querySelector(".top-status").classList.add("offline");console.error(e)}}
function runScan(){const ready=symbols.map(s=>state[s]?.analysis).filter(Boolean);if(!ready.length)return alert("AI analysis is still loading.");const best=ready.slice().sort((a,b)=>b.finalScore-a.finalScore)[0];const bestSym=symbols.find(s=>state[s]?.analysis===best);alert(`Multi-agent market scan complete.\n\nTop paper candidate: ${names[bestSym]}\nAI score: ${best.finalScore}/100\nSignal: ${best.signalLabel}\nTechnical: ${best.technicalScore}/100\nRisk: ${Math.round(best.risk)}/100\n\nThis is a rules-based V3 analysis engine using live Bitget candles. News, fundamental context, backtesting and secure paper execution are next stages. No real order is placed.`)}
function stopAI(){alert("AI trading is locked. This site cannot place real orders.")}
refreshAll();setInterval(refreshAll,30000);
