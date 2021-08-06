// JavaScript Document

var players = 1;
var subtitle 		  = document.getElementById("subtitle");
var select_container  = document.getElementById("select_container");
var players_container = document.getElementById("players_container");
var players_circle 	  = document.getElementById("players_circle");
var formulario		  = document.getElementById("formulario");
var boton_continuar   = document.getElementById("continuar_btn");
var infocard          = document.getElementById("infoCard");
var eventRow          = document.getElementById("eventRow");
var info_btn_prev     = document.getElementById("info_btn_prev");
var info_btn_next     = document.getElementById("info_btn_next");

var circles;
var selectedPlayer;
var selectedPlayerCircle;
var selectedPlayerID = 0;
var selectedPlayerName = "";
var selectedPlayerRoll = "";
var rollText;

var rollsUsed   = [];
var playerRolls = [];

var currentStepName = "";
var currentStep = 0;
var totalSteps  = 0;
var steps = {};
var events = [];
var event;
var currentNight = 0;

var inputName     = document.getElementById("inputName");
var inputRoll     = document.getElementById("inputRoll");
var inputNight    = document.getElementById("inputNight");
var inputNightTwo = document.getElementById("inputNightTwo");

var acceptedWolves = ["LOB","INF","PER","ALB"]
var rollOrderFirstNight = ["NIN","CUP"]; //"DOM","ANC"
var rollOrderNight      = ["ACT","CUE","PRO","VID","PIR","LOB","ALB","BRU"];

var playerColors = {
	"ALD":"a08d63",
	"VID":"d076d7",
	"ANC":"40943c",
	"BRU":"cd9df7",
	"PIR":"ff9c4f",
	"CUE":"ddcb4a",
	"PRO":"a3ff83",
	"NIN":"d5b45a",
	"DOM":"a47777",
	"CUP":"6164f3",
	"CAZ":"6d9740",
	"ANG":"8faae5",
	"ACT":"e8c986",
	"NIA":"47bfef",
	"LOB":"f56565",
	"PER":"c16565",
	"INF":"822b2b",
	"ALB":"ffbcbc",
};

var playerTitles = {
	"NIN":"Niño Salvaje",
	"CUP":"Cupido",
	"ACT":"Actor",
	"CUE":"Cuervo",
	"PRO":"Protector",
	"VID":"Vidente",
	"PIR":"Pirómano",
	"LOB":"Hombres Lobo",
	"ALB":"Hombre Lobo Albino",
	"BRU":"Bruja"
};

var playerDescriptions = {
	"NIN":"Elige a su padre.",
	"CUP":"Debe elegir a dos enamorados.",
	"ACT":"Elige un papel.",
	"CUE":"Debe dar un voto más a alguien.",
	"PRO":"Elige proteger a alguien.",
	"VID":"Decide ver el papel de alguien.",
	"PIR":"Elige quemar la casa de otro jugador.",
	"LOB":"Eligen una víctima.",
	"ALB":"Elige otra víctima.",
	"BRU":"Decide proteger o matar a alguien."
};

function playersSelected(e){
	var btn = document.getElementById(e);
	//console.log(btn.innerText);
	players = parseInt(btn.innerText);
	hideIntro();
	showCircle();
}

function hideIntro(){
	subtitle.innerText = "Lista de Jugadores:";
	select_container.style.display = "none";
}

function showCircle(){
	players_container.style.display = "flex";
	var degrees = 360/players;
	var colors = 255/players;
	var i;
	for (i = 0; i < players; i++) {
	  players_circle.innerHTML += '<div class="circles" onClick="definePlayer(this.id)" id="player'+i+'" style="transform: rotate('+degrees*i+'deg) translateX('+(players_circle.offsetWidth/2)*0.8+'px); background-color: rgb('+(200+55*(colors*i)/255)+','+(200+55*(colors*i)/255)+','+(200+55*(colors*i)/255)+')"><div class="playertext" id="playertext'+i+'" style="transform: translateY('+50+'px) rotate('+(-degrees*i)+'deg)">Jugador</div><div class="rolltext" style="transform: translateY('+80+'px) translateX(-80px) rotate('+(-degrees*i)+'deg)"></div></div>';
	}
}

function definePlayer(e){
	selectedPlayerID = e;
	selectedPlayerCircle = document.getElementById(selectedPlayerID)
	selectedPlayer = selectedPlayerCircle.getElementsByClassName("playertext")[0];
	rollText = selectedPlayerCircle.getElementsByClassName("rolltext")[0];
	if (selectedPlayer.innerText != "Jugador"){
		inputName.value = selectedPlayer.innerText;
	} else {
		inputName.value = "";
	}
	formulario.style.display = "inline-flex";
}

function endDefinePlayer(){
	selectedPlayer.innerText = inputName.value;
	rollText.innerText = inputRoll.value;
	selectedPlayerCircle.style.backgroundColor = "#"+(playerColors[inputRoll.value]).toString();
	selectedPlayerCircle.style.borderColor = "#"+(LightenDarkenColor(playerColors[inputRoll.value],-40)).toString()
	formulario.style.display = "None";
	checkFilled();
}

function startGame(){
	var i;
	for(i=0; i<circles.length; i++){
		let player = {
			name:circles[i].getElementsByClassName("playertext")[0].innerText,
			roll:circles[i].getElementsByClassName("rolltext")[0].innerText,
			alive:true,
			protection:0,
			prot_wolf:0,
			inlove: false,
			actor: false,
			id:i
		}
		if(player.roll == "ANC"){
			player.prot_wolf = 1;
		}
		playerRolls.push(player)
		rollsUsed.push(circles[i].getElementsByClassName("rolltext")[0].innerText);
	}
	//console.log(playerRolls);
	boton_continuar.style.display = "none";
	infocard.style.display = "block";
	disableEditing();
	calculateFirstNight();
}

function disableEditing(){
	var i;
	for(i=0; i<circles.length; i++){
		circles[i].setAttribute( "onClick", "" );
	}
}

function calculateFirstNight(){
	var i;
	var roll;
	for(i=0;i<rollOrderFirstNight.length;i++){
		roll = rollOrderFirstNight[i];
		if(rollsUsed.includes(roll)){
			steps[totalSteps] = roll;
			totalSteps += 1;
		}
	}
	for(i=0;i<rollOrderNight.length;i++){
		roll = rollOrderNight[i];
		if(rollsUsed.includes(roll)){
			steps[totalSteps] = roll;
			totalSteps += 1;
		}
	}
	//console.log(steps);
}

function calculateNight(){
	var i;
	var roll;
	steps = [];
	totalSteps = 0;
	currentStep = 0;
	for(i=0;i<rollOrderNight.length;i++){
		roll = rollOrderNight[i];
		if(rollsUsed.includes(roll)){
			steps[totalSteps] = roll;
			totalSteps += 1;
		}
	}
}

function nextStep(){
	if(currentStep < totalSteps){
		if(currentStep != 0){
			configureLastStep(steps[currentStep-1]);
		}
		currentStepName = steps[currentStep];
		infocard.getElementsByClassName("infoTitle")[0].innerText = playerTitles[currentStepName];
		infocard.getElementsByClassName("infoText")[0].innerText = playerDescriptions[currentStepName];

		infocard.style.backgroundColor = "#"+(playerColors[currentStepName]).toString();
		infocard.style.color = "#"+(LightenDarkenColor(playerColors[currentStepName],-60)).toString();
		
		configureNewStep(steps[currentStep]);
		
		currentStep += 1;
	} else {
		endNight();
	}
}

function endNight(){
	inputNight.style.display = "none";
	inputNightTwo.style.display = "none";
	info_btn_prev.style.display = "none";
	configureLastStep(steps[currentStep-1]);
	infocard.getElementsByClassName("infoTitle")[0].innerText = "Pueblo despierta!";
	infocard.getElementsByClassName("infoText")[0].innerText = "El pueblo discute los sucesos de la noche.";

	infocard.style.backgroundColor = "#ffecb0";
	infocard.style.color  = "#0088e1";
	info_btn_next.setAttribute( "onClick", "startDay()" );
	prepararInforme();
	calculateStartDay();
}

function startDay(){
	infocard.style.display = "none";
	eventRow.style.display = "none";
	boton_continuar.style.display = "block";
	boton_continuar.setAttribute( "onClick", "startNight()" );
}

function calculateStartDay(){
	console.log(rollsUsed);
	var i;
	var playerSelected;
	var deadPlayers = [];
	var playerName;
	for(i=0; i<playerRolls.length; i++){
		playerSelected = playerRolls[i];
		// AQUI AQUI AQUI 
		console.log(playerSelected.alive);
		
		if(!playerSelected.alive){
			deadPlayers.push(playerSelected.name);
			console.log("Estoy aqui: "+playerSelected.roll);
			if(rollsUsed.includes(playerSelected.roll) && (playerSelected.roll != "LOB")){
				rollsUsed.splice(rollsUsed.indexOf(playerSelected.roll),1);
			}
			console.log(rollsUsed);
		}
	}

	for(i=0; i<circles.length; i++){
		playerName = circles[i].getElementsByClassName("playertext")[0].innerText;
		
		if(deadPlayers.includes(playerName)){
			circles[i].style.backgroundColor = "#d8d8d8";
			circles[i].style.color = "#a3a3a3";
			circles[i].style.borderColor = "#a3a3a3";
		}
	}
}

function startNight(){
	currentNight += 1;
	calculateNight();
	boton_continuar.style.display = "none";
	infocard.getElementsByClassName("infoTitle")[0].innerText = "Pueblo Duerme";
	infocard.getElementsByClassName("infoText")[0].innerText = "Todos los aldeanos a dormir.";
	infocard.style.backgroundColor = "darkblue";
	info_btn_next.setAttribute( "onClick", "nextStep()" );
	info_btn_prev.style.display = "block";
	infocard.style.display = "block";
}

function configureNewStep(step){
	switch(step){
		case "CUE":
			inputNight.style.display = "block";
			inputNight.innerHTML = "";
			fillOptionsByRoll("CUE");
			break;
		case "PIR":
			inputNight.style.display = "block";
			inputNight.innerHTML = "";
			fillOptionsByRoll("PIR");
			break;
		case "PRO":
			inputNight.style.display = "block";
			inputNight.innerHTML = "";
			fillOptionsByRoll("PRO");
			break;
		case "VID":
			inputNight.style.display = "block";
			inputNight.innerHTML = "";
			fillOptionsByRoll("VID");
			break;
		case "LOB":
			inputNight.style.display = "block";
			inputNight.innerHTML = "";
			fillOptionsByRoll("LOB");
			break;
		case "ALB":
			inputNight.style.display = "block";
			inputNight.innerHTML = "";
			fillOptionsByRoll("ALB");
			break;
		case "NIN":
			inputNight.style.display = "block";
			inputNight.innerHTML = "";
			fillOptionsByRoll("NIN");
			break;
		case "BRU":
			inputNight.style.display = "block";
			inputNightTwo.style.display = "block";
			inputNight.innerHTML = "";
			inputNightTwo.innerHTML = "";
			fillOptionsByRoll("BRU");
			
			break;
		default:
			inputNight.style.display = "none";
			inputNightTwo.style.display = "none";
	}
}

function configureLastStep(step){
	switch(step){
		case "CUE":
			event = {
				roll:"CUE",
				playerID:inputNight.value,
				playerName:inputNight.options[inputNight.selectedIndex].text,
				description:"El cuervo ha añadido un voto a ",
				night:currentNight,
				show:true
			};
			events.push(event);
			break;
		case "PIR":
			event = {
				roll:"PIR",
				playerID:inputNight.value,
				playerName:inputNight.options[inputNight.selectedIndex].text,
				description:"El pirómano ha quemado la casa de ",
				night:currentNight,
				show:true,
			};
			events.push(event);
			break;
		case "PRO":
			event = {
				roll:"PRO",
				playerID:inputNight.value,
				playerName:inputNight.options[inputNight.selectedIndex].text,
				description:"El protector ha protegido a ",
				night:currentNight,
				show:false
			};
			events.push(event);
			break;
		case "VID":
			event = {
				roll:"VID",
				playerID:inputNight.value,
				playerName:inputNight.options[inputNight.selectedIndex].text,
				description:"El vidente ha visto la carta de ",
				night:currentNight,
				show:false
			};
			events.push(event);
			break;
		case "LOB":
			event = {
				roll:"LOB",
				playerID:inputNight.value,
				playerName:inputNight.options[inputNight.selectedIndex].text,
				description:"Ha muerto ",
				night:currentNight,
				show:true
			};
			events.push(event);
			break;
		case "ALB":
			event = {
				roll:"ALB",
				playerID:inputNight.value,
				playerName:inputNight.options[inputNight.selectedIndex].text,
				description:"Ha muerto ",
				night:currentNight,
				show:true
			};
			events.push(event);
			break;
		case "NIN":
			event = {
				roll:"NIN",
				playerID:inputNight.value,
				playerName:inputNight.options[inputNight.selectedIndex].text,
				description:"El niño salvaje ha elegido a ",
				night:currentNight,
				show:false
			};
			events.push(event);
			break;
		default:
			break;
	}
	//console.log(events);
}

function fillOptionsByRoll(roll){
	var i;
	var currentPlayer;
	for(i=0;i<playerRolls.length;i++){
		currentPlayer = playerRolls[i];
		if(currentPlayer.alive && (currentPlayer.roll != roll) && (roll != "LOB")){
			inputNight.innerHTML += '<option value="'+currentPlayer.id+'">'+currentPlayer.name+'</option>';
		} else if(currentPlayer.alive && (!acceptedWolves.includes(currentPlayer.roll))){
			inputNight.innerHTML += '<option value="'+currentPlayer.id+'">'+currentPlayer.name+'</option>';
		}
	}
	if(roll=="BRU"){
		inputNightTwo.innerHTML = "<option value='SAVE'>Curar</option><option value='KILL'>Matar</option>";
	}
}

function prevStep(){
	if(currentStep == steps.length){
		eventRow.style.display = "none";
	}
	if(currentStep > 0){
		events.pop();
		currentStep -= 1;
		currentStepName = steps[currentStep];
		infocard.getElementsByClassName("infoTitle")[0].innerText = playerTitles[currentStepName];
		infocard.getElementsByClassName("infoText")[0].innerText = playerDescriptions[currentStepName];

		infocard.style.backgroundColor = "#"+(playerColors[currentStepName]).toString();
		infocard.style.color = "#"+(LightenDarkenColor(playerColors[currentStepName],-60)).toString();
		configureNewStep(steps[currentStep]);
	}
}

function checkFilled(){
	circles = document.getElementsByClassName("circles");
	var i;
	var allFilled = true;
	for(i=0; i<circles.length; i++){
		if(circles[i].getElementsByClassName("playertext")[0].innerText == "Jugador"){
		   allFilled = false;
		}
	}
	if(allFilled){
		boton_continuar.style.display = "block";
	}
}

function prepararInforme(){
	eventRow.style.display = "block";
	eventRow.innerHTML = "";
	var i;
	var eventoAct;
	var findID = "";
	for(i=0;i<events.length;i++){
		eventoAct = events[i];
		switch(eventoAct.roll){
			case "PRO":
				findID = eventoAct.playerID;
				var protectedPlayer = findPlayer(findID);
				protectedPlayer.protection = 1;
				updatePlayer(protectedPlayer);
				console.log("Han protegido a " + protectedPlayer.name);
				break;
			case "ALB":
			case "LOB":
				findID = eventoAct.playerID;
				var victimPlayer = findPlayer(findID);
				if(victimPlayer.prot_wolf != 0){
					victimPlayer.prot_wolf = 0;
					eventoAct.description = "Han intentado matar a ";
					eventoAct.show = false;
				} else if(victimPlayer.protection != 0){
					victimPlayer.protection = 0;
					eventoAct.description = "Han intentado matar a ";
					eventoAct.show = false;
				} else {
					victimPlayer.alive = false;
				}
				updatePlayer(victimPlayer);
				events[i] = eventoAct;
				break;
		}
		
		if(eventoAct.show && (eventoAct.night == currentNight)){
			eventRow.innerHTML += "<div class='displayCards' style='background-color: #"+playerColors[eventoAct.roll]+"; color: #"+LightenDarkenColor(playerColors[eventoAct.roll],-60)+"'>"+eventoAct.description+" <span class='infobadge badge bg-light text-dark'>"+eventoAct.playerName+"</span></div>";
		}
	}
}



function findPlayer(playerID){
	var i;
	var player;
	for(i=0;i<playerRolls.length;i++){
		player = playerRolls[i];
		if(player.id == playerID){
			return player;
		}
	}
	return;
}

function updatePlayer(playerUp){
	var i;
	var player;
	for(i=0;i<playerRolls.length;i++){
		player = playerRolls[i];
		if(player.id == playerUp.id){
			playerRolls[i] = playerUp;
		}
	}
	return;
}













