document.addEventListener("DOMContentLoaded", () => {
 const $ = id => document.getElementById(id);
 const status = $("status");
 let peer = null, host = false, roomCode = "", myName = "", hostConn = null, clientId = "";
 let connections = [], state = null, roomReady = false;

 function message(txt, error=false){status.textContent=txt;status.style.color=error?"#ffb4b4":"#bfe5ff";}
 function makeCode(){return "LF-"+Math.floor(100000+Math.random()*900000);}
 function cleanName(v){return (v||"").trim().slice(0,18);}
 function showRoom(){
  $("salaAtiva").classList.remove("escondido");
  $("codigoExibido").textContent=roomCode;
  $("avisoAnfitriao").textContent=host?"Você é o anfitrião. Poderá pausar o leilão globalmente para todos organizarem o time a qualquer momento.":"Aguardando o anfitrião iniciar.";
  $("iniciarLeilao").classList.toggle("escondido",!host);
  renderPlayers();
 }
 function renderPlayers(){
  if(!state)return;
  $("listaParticipantes").innerHTML="";
  Object.values(state.players||{}).forEach(p=>{
   const li=document.createElement("li");
   li.textContent=p.name+(p.isBot?" 🤖 (Bot - Torneio)":p.id==="host"?" • Anfitrião (Você)":"");
   $("listaParticipantes").appendChild(li);
  });
 }
 function saveLocal(){
  sessionStorage.setItem("lf-room",JSON.stringify({host,roomCode,myName,clientId,state}));
 }
 function clientKey(){return "guest-"+Math.random().toString(36).slice(2,12);}
 function goAuction(){saveLocal();location.href="leilao.html";}
 function broadcast(data){
  connections=connections.filter(c=>c.open);
  connections.forEach(c=>c.send(data));
 }
 function setupHost(){
  state={roomCode,players:{host:{id:"host",name:myName,budget:500000000,roster:[],lineup:{},formation:"4-3-3"}},auction:null,history:[],started:false,finished:false,paused:false,results:[]};
  peer=new Peer(roomCode.toLowerCase());
  peer.on("open",()=>{roomReady=true;message("Sala criada!");showRoom();saveLocal();});
  peer.on("connection",conn=>{
   connections.push(conn);
   conn.on("data",data=>{
    if(data.type==="hello"){
     const id=conn.peer;
     if(Object.keys(state.players).length>=16){conn.send({type:"error",message:"A sala já está cheia."});conn.close();return;}
     state.players[id]={id,name:cleanName(data.name)||"Jogador",budget:500000000,roster:[],lineup:{},formation:"4-3-3"};
     conn.playerId=id;renderPlayers();saveLocal();broadcast({type:"state",state});conn.send({type:"state",state});message("Um jogador entrou na sala.");
    }
   });
   conn.on("close",()=>{if(conn.playerId){delete state.players[conn.playerId];renderPlayers();broadcast({type:"state",state});}});
  });
  peer.on("error",err=>message("Erro ao criar sala: "+err.type,true));
 }
 $("criarSala").addEventListener("click",()=>{
  if(peer)return;
  myName=cleanName($("nomeCriador").value);
  if(!myName){message("Digite seu nome.",true);return;}
  host=true;roomCode=makeCode();message("Criando sala...");
  setupHost();
 });
 $("entrarSala").addEventListener("click",()=>{
  if(peer)return;
  myName=cleanName($("nomeConvidado").value);
  roomCode=$("codigoSala").value.trim().toUpperCase();
  if(!myName||!/^LF-\d{6}$/.test(roomCode)){message("Informe seu nome e código válido.",true);return;}
  message("Conectando...");
  clientId=clientKey();
  peer=new Peer(clientId);
  peer.on("open",()=>{
   hostConn=peer.connect(roomCode.toLowerCase(),{reliable:true});
   hostConn.on("open",()=>hostConn.send({type:"hello",name:myName}));
   hostConn.on("data",data=>{
    if(data.type==="state"){state=data.state;host=false;roomReady=true;showRoom();saveLocal();message("Entrou na sala!");}
    if(data.type==="error")message(data.message,true);
    if(data.type==="start"){state=data.state;saveLocal();setTimeout(goAuction,700);}
   });
   hostConn.on("close",()=>message("Conexão encerrada.",true));
  });
  peer.on("error",err=>message("Erro de conexão.",true));
 });
 $("copiarCodigo").addEventListener("click",async()=>{
  try{await navigator.clipboard.writeText(roomCode);message("Código copiado!");}
  catch(e){message("Código: "+roomCode);}
 });
 $("iniciarLeilao").addEventListener("click",()=>{
  if(!host||!state)return;
  const botNames = ["Craque Bot", "Tite Bot", "Guardiola Bot", "Ancelotti Bot", "Abel Bot", "Jürgen Bot", "Mourinho Bot", "Xavi Bot", "Klopp Bot", "Zidane Bot", "Cafu Bot", "Ronaldo Bot", "Pelé Bot", "Kaká Bot", "Ronaldinho Bot"];
  let botIdx = 0;
  while(Object.keys(state.players).length < 16 && botIdx < botNames.length){
   const botId = "bot-" + Math.random().toString(36).slice(2,8);
   const allPlayers = typeof jogadores !== "undefined" ? jogadores : [];
   const botRoster = [];
   const botLineup = {};
   const shuffled = [...allPlayers].sort(() => 0.5 - Math.random());
   for(let i=0; i<11 && i<shuffled.length; i++){
    botRoster.push(shuffled[i]);
   }
   botRoster.forEach((j, idx) => { botLineup["slot-"+idx] = j; });

   state.players[botId] = {
    id: botId,
    name: botNames[botIdx++],
    budget: 0,
    roster: botRoster,
    lineup: botLineup,
    formation: "4-3-3",
    isBot: true
   };
  }
  state.started=true;saveLocal();broadcast({type:"start",state});setTimeout(goAuction,700);
 });
});
