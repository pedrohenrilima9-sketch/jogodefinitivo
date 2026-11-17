document.addEventListener("DOMContentLoaded", () => {
 const $ = id => document.getElementById(id);
 let saved = {};
 try { saved = JSON.parse(sessionStorage.getItem("lf-room") || "{}"); } catch(e) {}

 let host = !!saved.host;
 let roomCode = saved.roomCode || "";
 let myName = saved.myName || "Jogador";
 let peer = null, hostConn = null, conns = [];
 let state = saved.state || null;
 let timerId = null, ended = false;

 const formacoes = {
  "4-3-3":   [["PE","ATA","PD"], ["MC","MC","MEI"], ["LE","ZAG","ZAG","LD"], ["GOL"]],
  "4-2-3-1": [["ATA"], ["PE","MEI","PD"], ["VOL","VOL"], ["LE","ZAG","ZAG","LD"], ["GOL"]],
  "4-4-2":   [["ATA","ATA"], ["MEI","MC","MC","MEI"], ["LE","ZAG","ZAG","LD"], ["GOL"]],
  "3-5-2":   [["ATA","ATA"], ["MEI","MC","VOL","MC","MEI"], ["ZAG","ZAG","ZAG"], ["GOL"]],
  "3-4-3":   [["PE","ATA","PD"], ["MC","MC","MEI","MEI"], ["ZAG","ZAG","ZAG"], ["GOL"]]
 };

 const nomesPosicao = {
  GOL: "Goleiro", LE: "Lateral Esquerdo", LD: "Lateral Direito", ZAG: "Zagueiro",
  VOL: "Volante", MC: "Meio-Campista", MEI: "Meia Ofensivo", PE: "Ponta Esquerdo",
  PD: "Ponta Direito", ATA: "Atacante / CA"
 };

 const compatibilidade = {
  GOL: ["GOL"], LE: ["LE"], LD: ["LD"], ZAG: ["ZAG"],
  VOL: ["VOL", "MC"], MC: ["MC", "VOL", "MEI"], MEI: ["MEI", "MC", "PE", "PD"],
  PE: ["PE", "MEI", "ATA"], PD: ["PD", "MEI", "ATA"], ATA: ["ATA", "PE", "PD"]
 };

 const fmt = n => "€ " + Math.round(n || 0).toLocaleString("pt-BR");
 function msg(t) { $("mensagem").textContent = t; }
 function playersList() { return typeof jogadores !== "undefined" ? jogadores : []; }
 function currentUserId() { return host ? "host" : (saved.clientId || peer?.id || "guest"); }
 function myPlayer() { return state?.players?.[currentUserId()] || null; }

 function broadcast(data) {
  conns = conns.filter(c => c.open);
  conns.forEach(c => c.send(data));
 }

 function sendToHost(data) {
  if (host) { handleHostMessage(data, "host"); }
  else if (hostConn?.open) { hostConn.send(data); }
 }

 function publish() {
  render();
  sessionStorage.setItem("lf-room", JSON.stringify({ host, roomCode, myName, clientId: saved.clientId || "", state }));
  if (host) broadcast({ type: "state", state });
 }

 function getFormationSlots(formacao) {
  const rows = formacoes[formacao] || formacoes["4-3-3"];
  const slots = [];
  let idx = 0;
  rows.forEach((row, rIdx) => {
   row.forEach((pos, cIdx) => { slots.push({ id: "slot-" + idx++, pos, row: rIdx, col: cIdx }); });
  });
  return slots;
 }

 function isCompatible(slotPos, playerPos) {
  return (compatibilidade[slotPos] || [slotPos]).includes(playerPos);
 }

 function countLineup(player) {
  if (!player || !player.lineup) return 0;
  return Object.keys(player.lineup).length;
 }

 function allHumanTeamsFull() {
  const players = Object.values(state?.players || {}).filter(p => !p.isBot);
  if (players.length < 1) return false;
  return players.every(p => countLineup(p) >= 11);
 }

 function calcularForcaTime(playerObj) {
  const lineup = playerObj.lineup || {};
  const slots = getFormationSlots(playerObj.formation || "4-3-3");
  let somaOverall = 0;
  let count = 0;
  let bonusPernaBoa = 0;

  slots.forEach(s => {
   const j = lineup[s.id];
   if (j) {
    somaOverall += (j.overall || 75);
    count++;
    if (j.pernaBoa === "Ambidestro") {
     bonusPernaBoa += 1.5;
    } else if (s.pos === "LE" && j.pernaBoa === "Esquerda") {
     bonusPernaBoa += 2;
    } else if (s.pos === "LD" && j.pernaBoa === "Direita") {
     bonusPernaBoa += 2;
    } else if (s.pos === "PE" && j.pernaBoa === "Direita") {
     bonusPernaBoa += 1.5;
    } else if (s.pos === "PD" && j.pernaBoa === "Esquerda") {
     bonusPernaBoa += 1.5;
    }
   }
  });

  if (count === 0) return 75;
  const mediaBase = somaOverall / count;
  return mediaBase + (bonusPernaBoa / Math.max(1, count)) * 0.8;
 }

 function render() {
  if (!state) return;
  $("roomLabel").textContent = "Sala " + roomCode;
  $("conexao").textContent = host ? "Anfitrião do Torneio" : "Conectado ao Anfitrião";

  const me = myPlayer();
  $("saldo").textContent = fmt(me?.budget);

  // Mostrar painel de controle do anfitrião se for host
  $("areaControleAnfitriao").classList.toggle("escondido", !host);
  if (host) {
   $("botaoPausaGlobal").textContent = state.paused ? "▶️ Retomar Leilão" : "⏸️ Pausar Leilão (Organizar Time)";
  }

  // Se o leilão estiver pausado globalmente, exibe o modal para todos
  if (state.paused && !state.finished) {
   const forca = me ? calcularForcaTime(me) : 75;
   $("mediaOverallModal").textContent = forca.toFixed(1);
   $("titularesModalCount").textContent = (me ? countLineup(me) : 0) + " / 11";
   $("modalPausaGlobal").classList.add("ativo");

   // Se for anfitrião, coloca botão de retomar dentro do modal também
   const areaRetomar = $("areaBotaoRetomar");
   areaRetomar.innerHTML = "";
   if (host) {
    const btnRet = document.createElement("button");
    btnRet.textContent = "▶️ Retomar Leilão para Todos";
    btnRet.style.width = "100%";
    btnRet.style.background = "linear-gradient(90deg,#00b8ff,#007bd1)";
    btnRet.style.padding = "14px";
    btnRet.style.fontWeight = "bold";
    btnRet.style.borderRadius = "8px";
    btnRet.onclick = () => {
     sendToHost({ type: "togglePause" });
    };
    areaRetomar.appendChild(btnRet);
   } else {
    const pInfo = document.createElement("p");
    pInfo.style.color = "#ffaa00";
    pInfo.style.textAlign = "center";
    pInfo.style.fontWeight = "bold";
    pInfo.textContent = "Aguardando o anfitrião retomar o leilão...";
    areaRetomar.appendChild(pInfo);
   }
  } else {
   $("modalPausaGlobal").classList.remove("ativo");
  }

  $("participantes").innerHTML = "";
  Object.values(state.players || {}).forEach(p => {
   if (p.isBot) return;
   const li = document.createElement("li");
   const esc = countLineup(p);
   li.textContent = `${p.name} — ${fmt(p.budget)} • Titulares: ${esc}/11`;
   $("participantes").appendChild(li);
  });

  $("historico").innerHTML = "";
  (state.history || []).slice(-10).reverse().forEach(item => {
   const li = document.createElement("li");
   li.textContent = item;
   $("historico").appendChild(li);
  });

  const leilaoIniciado = !!(state.auction || state.auctionStarted || state.finished);
  $("secaoEscalacao").classList.toggle("escondido", !leilaoIniciado);

  if (state.finished) {
   $("areaLeilao").classList.add("escondido");
   $("resultados").classList.remove("escondido");
   renderMataMataBracket();
  } else {
   $("areaLeilao").classList.remove("escondido");
   $("resultados").classList.add("escondido");
  }

  if (state.auction && !state.finished && !state.paused) {
   const a = state.auction;
   $("nomeJogador").textContent = a.player.nome;
   $("dadosJogador").textContent = `${nomesPosicao[a.player.posicao] || a.player.posicao} (${a.player.posicao}) • Perna: ${a.player.pernaBoa} • Overall ${a.player.overall}`;
   $("avatar").textContent = a.player.posicao === "GOL" ? "🧤" : "⚽";
   $("maiorLance").textContent = fmt(a.highestBid);
   const bidder = state.players[a.highestBidder];
   $("maiorLicitante").textContent = bidder ? bidder.name : "Nenhum lance ainda (Começa em € 0)";
   $("timer").textContent = state.seconds + "s";

   const jaLotado = countLineup(me) >= 11 && (me?.roster?.length || 0) >= 11;
   const valInput = parseInt($("valorLanceInput").value) || 0;
   const minPermitido = a.highestBid + 1;
   $("darLanceCustom").disabled = !me || me.budget < valInput || valInput < minPermitido || jaLotado;
   $("passar").disabled = false;
  } else if (state.paused) {
   $("timer").textContent = "PAUSADO";
   $("darLanceCustom").disabled = true;
   $("passar").disabled = true;
  }

  if (leilaoIniciado && me) {
   renderEscalacao(me);
  }
 }

 window.adicionarLance = function(valor) {
  if (!state?.auction || state.finished || state.paused) return;
  const a = state.auction;
  const atual = parseInt($("valorLanceInput").value) || a.highestBid;
  $("valorLanceInput").value = atual + valor;
  const me = myPlayer();
  const valInput = parseInt($("valorLanceInput").value) || 0;
  const jaLotado = countLineup(me) >= 11 && (me?.roster?.length || 0) >= 11;
  $("darLanceCustom").disabled = !me || me.budget < valInput || valInput <= a.highestBid || jaLotado;
 };

 $("darLanceCustom").addEventListener("click", () => {
  if (!state?.auction || state.finished || state.paused) return;
  const val = parseInt($("valorLanceInput").value);
  const a = state.auction;
  const me = myPlayer();
  if (isNaN(val) || val <= a.highestBid) {
   msg("O lance precisa ser maior que o lance atual (" + fmt(a.highestBid) + ").");
   return;
  }
  if (me && me.budget < val) {
   msg("Você não tem saldo suficiente!");
   return;
  }
  sendToHost({ type: "bid", amount: val });
  $("valorLanceInput").value = "";
 });

 $("botaoPausaGlobal").addEventListener("click", () => {
  if (!host) return;
  sendToHost({ type: "togglePause" });
 });

 function renderEscalacao(me) {
  const formacaoAtual = me.formation || "4-3-3";
  if ($("formacao").value !== formacaoAtual) { $("formacao").value = formacaoAtual; }

  const lineup = me.lineup || {};
  $("totalEscalados").textContent = Object.keys(lineup).length + "/11";
  const forca = calcularForcaTime(me);
  $("mediaOverallTopo").textContent = forca.toFixed(1);

  const rows = formacoes[formacaoAtual] || formacoes["4-3-3"];
  const campo = $("campoJogadores");
  campo.innerHTML = "";
  let idx = 0;

  rows.forEach(row => {
   const line = document.createElement("div");
   line.className = "linha-jogadores";
   row.forEach(pos => {
    const slotId = "slot-" + idx++;
    const jog = lineup[slotId];
    const card = document.createElement("div");
    card.className = "card-jogador" + (jog ? "" : " vazio");
    if (jog) {
     card.innerHTML = `<div class="foto-jogador">${jog.nome[0]}</div><strong>${jog.nome}</strong><span class="posicao">${pos} (${jog.posicao})</span><span class="perna-tag">Perna: ${jog.pernaBoa[0]}</span><small>${jog.overall} ⭐</small>`;
    } else {
     card.innerHTML = `<div class="foto-jogador">+</div><strong>Vaga ${pos}</strong><span class="posicao">${nomesPosicao[pos] || pos}</span><small>Clique p/ escalar</small>`;
    }
    card.onclick = () => abrirModalVaga(slotId, pos);
    line.appendChild(card);
   });
   campo.appendChild(line);
  });

  const escaladosNomes = new Set(Object.values(lineup).map(j => j.nome));
  const banco = (me.roster || []).filter(j => !escaladosNomes.has(j.nome));
  const listaBanco = $("listaBanco");
  listaBanco.innerHTML = "";

  if (!banco.length) {
   listaBanco.innerHTML = `<p style="color:#8ca4bb;font-size:13px">Nenhum jogador aguardando no banco.</p>`;
  } else {
   banco.forEach(j => {
    const item = document.createElement("div");
    item.className = "item-banco";
    item.innerHTML = `<div><strong>${j.nome}</strong> <small style="color:#27aaff">(${j.posicao} • Perna: ${j.pernaBoa})</small></div><span>${j.overall} ⭐</span>`;
    item.onclick = () => abrirModalJogadorParaVaga(j);
    listaBanco.appendChild(item);
   });
  }
 }

 function abrirModalVaga(slotId, slotPos) {
  if (state.finished) return;
  const me = myPlayer();
  if (!me) return;

  const lineup = me.lineup || {};
  const atualNaVaga = lineup[slotId];
  const escaladosOutros = new Set(Object.entries(lineup).filter(([k]) => k !== slotId).map(([, v]) => v.nome));
  const compativeis = (me.roster || []).filter(j => isCompatible(slotPos, j.posicao) && !escaladosOutros.has(j.nome));

  $("posicaoSelecionada").textContent = `Vaga: ${nomesPosicao[slotPos] || slotPos} (${slotPos})`;
  const container = $("opcoesJogadores");
  container.innerHTML = "";

  if (atualNaVaga) {
   const btnRemover = document.createElement("button");
   btnRemover.className = "opcao-jogador secundario";
   btnRemover.innerHTML = `<strong>Remover ${atualNaVaga.nome}</strong><span>Banco</span>`;
   btnRemover.onclick = () => { sendToHost({ type: "unassignSlot", slotId }); fecharModais(); };
   container.appendChild(btnRemover);
  }

  if (!compativeis.length) {
   const p = document.createElement("p"); p.style.color = "#ffb4b4"; p.style.fontSize = "13px";
   p.textContent = "Sem jogadores compatíveis disponíveis."; container.appendChild(p);
  } else {
   compativeis.forEach(j => {
    const b = document.createElement("button"); b.className = "opcao-jogador";
    b.innerHTML = `<strong>${j.nome} (${j.posicao} • Perna: ${j.pernaBoa})</strong><span>${j.overall} ⭐</span>`;
    b.onclick = () => { sendToHost({ type: "assignSlot", slotId, playerName: j.nome }); fecharModais(); };
    container.appendChild(b);
   });
  }
  $("modalJogadores").classList.add("ativo");
 }

 function abrirModalJogadorParaVaga(jogador) {
  if (state.finished) return;
  const me = myPlayer(); if (!me) return;
  const slots = getFormationSlots(me.formation || "4-3-3");
  const lineup = me.lineup || {};
  const slotsCompativeis = slots.filter(s => isCompatible(s.pos, jogador.posicao));

  $("jogadorParaEscalar").textContent = `${jogador.nome} (${jogador.posicao} • Perna: ${jogador.pernaBoa} • ${jogador.overall} ⭐)`;
  const container = $("opcoesPosicoes"); container.innerHTML = "";

  if (!slotsCompativeis.length) {
   const p = document.createElement("p"); p.style.color = "#ffb4b4"; p.style.fontSize = "13px";
   p.textContent = "Nenhuma posição compatível na formação atual."; container.appendChild(p);
  } else {
   slotsCompativeis.forEach(s => {
    const ocupante = lineup[s.id];
    const b = document.createElement("button"); b.className = "opcao-jogador";
    b.innerHTML = `<strong>${nomesPosicao[s.pos] || s.pos} (${s.pos})</strong><span>${ocupante ? "Trocar " + ocupante.nome : "Vaga livre"}</span>`;
    b.onclick = () => { sendToHost({ type: "assignSlot", slotId: s.id, playerName: jogador.nome }); fecharModais(); };
    container.appendChild(b);
   });
  }
  $("modalPosicoes").classList.add("ativo");
 }

 function fecharModais() {
  $("modalJogadores").classList.remove("ativo");
  $("modalPosicoes").classList.remove("ativo");
 }

 $("fecharModal").onclick = fecharModais;
 $("fecharModalPos").onclick = fecharModais;
 window.onclick = e => {
  if (e.target === $("modalJogadores")) fecharModais();
  if (e.target === $("modalPosicoes")) fecharModais();
 };

 $("formacao").addEventListener("change", e => { sendToHost({ type: "setFormation", formation: e.target.value }); });

 function computeTournament() {
  const playersArr = Object.values(state.players || {});
  let teams = playersArr.map(p => {
   const forcaBase = calcularForcaTime(p);
   return { id: p.id, name: p.name, forca: forcaBase };
  });

  while(teams.length < 16) {
   teams.push({ id: "extra-"+teams.length, name: "Bot Extra " + (teams.length+1), forca: 75 });
  }
  teams.sort(() => Math.random() - 0.5);

  function simulateMatch(t1, t2) {
   const diff = (t1.forca - t2.forca) / 4;
   const fatorAleatorioT1 = (Math.random() * 5 - 2.5);
   const fatorAleatorioT2 = (Math.random() * 5 - 2.5);

   const g1 = Math.max(0, Math.round(1.5 + diff * 0.4 + fatorAleatorioT1));
   const g2 = Math.max(0, Math.round(1.5 - diff * 0.4 + fatorAleatorioT2));

   if (g1 !== g2) return g1 > g2 ? { winner: t1, score: `${g1} × ${g2}` } : { winner: t2, score: `${g1} × ${g2}` };
   return Math.random() > 0.5 ? { winner: t1, score: `${g1} × ${g2} (pên.)` } : { winner: t2, score: `${g1} × ${g2} (pên.)` };
  }

  let oitavas = [], vencedoresOitavas = [];
  for(let i=0; i<16; i+=2) {
   const res = simulateMatch(teams[i], teams[i+1]);
   oitavas.push({ t1: teams[i], t2: teams[i+1], score: res.score, winner: res.winner });
   vencedoresOitavas.push(res.winner);
  }

  let quartas = [], vencedoresQuartas = [];
  for(let i=0; i<8; i+=2) {
   const res = simulateMatch(vencedoresOitavas[i], vencedoresOitavas[i+1]);
   quartas.push({ t1: vencedoresOitavas[i], t2: vencedoresOitavas[i+1], score: res.score, winner: res.winner });
   vencedoresQuartas.push(res.winner);
  }

  let semis = [], vencedoresSemis = [];
  for(let i=0; i<4; i+=2) {
   const res = simulateMatch(vencedoresQuartas[i], vencedoresQuartas[i+1]);
   semis.push({ t1: vencedoresQuartas[i], t2: vencedoresQuartas[i+1], score: res.score, winner: res.winner });
   vencedoresSemis.push(res.winner);
  }

  const finalRes = simulateMatch(vencedoresSemis[0], vencedoresSemis[1]);
  const finalJogo = { t1: vencedoresSemis[0], t2: vencedoresSemis[1], score: finalRes.score, winner: finalRes.winner };

  return { oitavas, quartas, semis, final: finalJogo };
 }

 function renderMataMataBracket() {
  if (!state.tournament) {
   if (host) {
    state.tournament = computeTournament();
    publish();
   } else {
    return;
   }
  }

  const t = state.tournament;
  const container = $("bracketContainer");
  container.innerHTML = "";

  function createPhaseCol(title, matches) {
   const col = document.createElement("div");
   col.className = "fase-col";
   col.innerHTML = `<h3>${title}</h3>`;
   matches.forEach(m => {
    const div = document.createElement("div");
    div.className = "jogo-mata";
    const v1 = m.winner.id === m.t1.id ? "vencedor" : "";
    const v2 = m.winner.id === m.t2.id ? "vencedor" : "";
    div.innerHTML = `
     <div class="time-jogo ${v1}"><span>${m.t1.name}</span><span>${m.score.split("×")[0]}</span></div>
     <div class="time-jogo ${v2}"><span>${m.t2.name}</span><span>${m.score.split("×")[1] || ""}</span></div>
    `;
    col.appendChild(div);
   });
   return col;
  }

  container.appendChild(createPhaseCol("⚡ Oitavas de Final", t.oitavas));
  container.appendChild(createPhaseCol("🔥 Quartas de Final", t.quartas));
  container.appendChild(createPhaseCol("⭐ Semifinais", t.semis));
  
  const finalCol = document.createElement("div");
  finalCol.className = "fase-col";
  finalCol.innerHTML = `<h3>🏆 GRANDE FINAL</h3>`;
  const fd = document.createElement("div");
  fd.className = "jogo-mata";
  fd.style.border = "2px solid #5ee0ae";
  const fv1 = t.final.winner.id === t.final.t1.id ? "vencedor" : "";
  const fv2 = t.final.winner.id === t.final.t2.id ? "vencedor" : "";
  fd.innerHTML = `
   <div style="color:#5ee0ae;font-weight:bold;margin-bottom:6px;text-align:center">👑 CAMPEÃO: ${t.final.winner.name}</div>
   <div class="time-jogo ${fv1}"><span>${t.final.t1.name}</span></div>
   <div class="time-jogo ${fv2}"><span>${t.final.t2.name}</span></div>
   <div style="text-align:center;margin-top:6px;color:#27aaff">${t.final.score}</div>
  `;
  finalCol.appendChild(fd);
  container.appendChild(finalCol);
 }

 function handleHostMessage(data, from) {
  if (!host || !state) return;
  const p = state.players[from]; if (!p) return;

  if (data.type === "togglePause") {
   state.paused = !state.paused;
   state.history.push(state.paused ? "⏸️ Anfitrião pausou o leilão globalmente!" : "▶️ Anfitrião retomou o leilão!");
   publish();
   return;
  }

  if (state.paused) return; // Se estiver pausado, bloqueia lances e alterações até retomar

  if (data.type === "bid") {
   const a = state.auction;
   if (!a || state.finished || p.budget < data.amount || data.amount <= a.highestBid) return;
   if (countLineup(p) >= 11 && (p.roster?.length || 0) >= 11) return;

   a.highestBid = data.amount;
   a.highestBidder = from;
   state.seconds = 5;
   state.history.push(`${p.name} ofereceu ${fmt(data.amount)} por ${a.player.nome}`);
   publish();
   msg(`Novo lance de ${p.name}!`);
  }

  if (data.type === "setFormation") {
   if (!formacoes[data.formation]) return;
   p.formation = data.formation;
   const slots = getFormationSlots(p.formation);
   const old = Object.values(p.lineup || {});
   const newLineup = {};
   old.forEach(jog => {
    const free = slots.find(s => !newLineup[s.id] && isCompatible(s.pos, jog.posicao));
    if (free) newLineup[free.id] = jog;
   });
   p.lineup = newLineup;
   publish();
  }

  if (data.type === "assignSlot") {
   if (state.finished) return;
   const slots = getFormationSlots(p.formation || "4-3-3");
   const target = slots.find(s => s.id === data.slotId);
   const jogador = (p.roster || []).find(j => j.nome === data.playerName);
   if (!target || !jogador || !isCompatible(target.pos, jogador.posicao)) return;

   p.lineup = p.lineup || {};
   Object.keys(p.lineup).forEach(k => { if (p.lineup[k]?.nome === jogador.nome) delete p.lineup[k]; });
   p.lineup[target.id] = jogador;
   publish();

   if (allHumanTeamsFull()) {
    state.history.push("Todos os humanos completaram os times! Iniciando o Mata-Mata...");
    finishAuction();
   }
  }

  if (data.type === "unassignSlot") {
   if (state.finished || !p.lineup) return;
   delete p.lineup[data.slotId];
   publish();
  }
 }

 function autoPlace(playerObj, novoJogador) {
  const slots = getFormationSlots(playerObj.formation || "4-3-3");
  playerObj.lineup = playerObj.lineup || {};
  const free = slots.find(s => !playerObj.lineup[s.id] && isCompatible(s.pos, novoJogador.posicao));
  if (free) playerObj.lineup[free.id] = novoJogador;
 }

 function nextPlayer() {
  if (!host || ended) return;
  if (state.paused) return; // Se pausado, não avança rodada

  if (state.auction?.highestBidder) {
   const vencedor = state.players[state.auction.highestBidder];
   const j = state.auction.player;
   if (vencedor) {
    vencedor.budget -= state.auction.highestBid;
    const comprado = { ...j, valor: state.auction.highestBid };
    vencedor.roster.push(comprado);
    autoPlace(vencedor, comprado);
    state.history.push(`${vencedor.name} contratou ${j.nome} por ${fmt(state.auction.highestBid)}`);
   }
  } else if (state.auction) {
   state.history.push(`Ninguém comprou ${state.auction.player.nome} (passou em branco)`);
  }

  if (allHumanTeamsFull()) {
   finishAuction();
   return;
  }

  const available = playersList().filter(j => !state.used.includes(j.nome) && Object.values(state.players).filter(p => !p.isBot).some(p => countLineup(p) < 11));
  if (!available.length) { finishAuction(); return; }

  const player = available[Math.floor(Math.random() * available.length)];
  state.used.push(player.nome);

  state.auction = { player, highestBid: 0, highestBidder: null };
  state.seconds = 5;
  $("valorLanceInput").value = "";
  publish();
  msg("Novo jogador em leilão! Lance inicial € 0");

  clearInterval(timerId);
  timerId = setInterval(() => {
   if (!host || ended) return;
   if (state.paused) return; // Se pausado, congela o cronômetro do timer
   state.seconds--;
   publish();
   if (state.seconds <= 0) {
    clearInterval(timerId);
    nextPlayer();
   }
  }, 1000);
 }

 function finishAuction() {
  clearInterval(timerId);
  ended = true;
  state.finished = true;
  state.auction = null;
  state.tournament = computeTournament();
  publish();
  msg("Leilão encerrado! Chaveamento do mata-mata gerado.");
 }

 function startAuction() {
  if (!host) return;
  state.used = [];
  state.history = ["Leilão iniciado! Lance inicial € 0."];
  state.finished = false;
  state.paused = false;
  state.auctionStarted = true;
  ended = false;
  nextPlayer();
 }

 $("passar").addEventListener("click", () => msg("Você passou nesta rodada."));

 function connect() {
  if (!roomCode) { $("conexao").textContent = "Sala não encontrada."; return; }

  if (host) {
   state = state || {
    roomCode,
    players: { host: { id: "host", name: myName, budget: 500000000, roster: [], lineup: {}, formation: "4-3-3" } },
    history: [], used: [], auction: null, auctionStarted: false, finished: false, paused: false, tournament: null, seconds: 5
   };

   Object.values(state.players).forEach(p => {
    p.roster = p.roster || []; p.lineup = p.lineup || {}; p.formation = p.formation || "4-3-3";
   });

   peer = new Peer(roomCode.toLowerCase());
   peer.on("open", () => {
    conns = []; render();
    $("conexao").textContent = "Sala pronta. Clique em Começar leilão.";
   });

   peer.on("connection", conn => {
    conns.push(conn);
    conn.on("data", data => {
     if (data.type === "hello") {
      const id = data.clientId || conn.peer;
      if (!state.players[id]) {
       state.players[id] = { id, name: data.name || "Jogador", budget: 500000000, roster: [], lineup: {}, formation: "4-3-3" };
      }
      conn.playerId = id; publish(); conn.send({ type: "state", state });
     } else {
      handleHostMessage(data, conn.playerId || conn.peer);
     }
    });
    conn.on("close", () => { if (conn.playerId && !state.auctionStarted) { delete state.players[conn.playerId]; publish(); } });
   });

   peer.on("error", e => { $("conexao").textContent = "Erro de conexão: " + e.type; });

   if (!state.auctionStarted) {
    const startButton = document.createElement("button");
    startButton.textContent = "Começar leilão e torneio";
    startButton.style.marginTop = "14px";
    startButton.addEventListener("click", () => {
     startButton.remove();
     startAuction();
    });
    $("areaBotaoIniciar").appendChild(startButton);
   }
  } else {
   const myClientId = saved.clientId || ("guest-" + Math.random().toString(36).slice(2, 10));
   saved.clientId = myClientId;
   peer = new Peer(myClientId);
   peer.on("open", () => {
    hostConn = peer.connect(roomCode.toLowerCase(), { reliable: true });
    hostConn.on("open", () => { hostConn.send({ type: "hello", name: myName, clientId: myClientId }); });
    hostConn.on("data", data => {
     if (data.type === "state") { state = data.state; render(); }
     if (data.type === "error") msg(data.message);
    });
    hostConn.on("close", () => { $("conexao").textContent = "Conexão perdida."; });
   });
   peer.on("error", e => { $("conexao").textContent = "Erro de conexão: " + e.type; });
  }
 }

 connect();
});
