const GAME_STATE = {
	PRE: 0,
	SET: 1,
	DAY: 2,
	NIT: 3
}

const DEAD_COLOR = "#566573";

const PLAYER_STATES = {
    ALD: {color:"#f1c40f", is_lobo:false, full_name:"Aldeano"             , acr_name:"ALD"},
    ACT: {color:"#c39bd3", is_lobo:false, full_name:"Actor"               , acr_name:"ACT"},
    ANC: {color:"#2ecc71", is_lobo:false, full_name:"Anciano"             , acr_name:"ANC"},
    ANG: {color:"#a3e4d7", is_lobo:false, full_name:"Angel"               , acr_name:"ANG"},
    BRU: {color:"#c8a3ff", is_lobo:false, full_name:"Bruja"               , acr_name:"BRU"},
    CAZ: {color:"#f8c471", is_lobo:false, full_name:"Cazador"             , acr_name:"CAZ"},
    CUE: {color:"#f39c12", is_lobo:false, full_name:"Cuervo"              , acr_name:"CUE"},
    CUP: {color:"#ffcaf5", is_lobo:false, full_name:"Cupido"              , acr_name:"CUP"},
    DOM: {color:"#e6b0aa", is_lobo:false, full_name:"Domador de Osos"     , acr_name:"DOM"},
    NIN: {color:"#85c1e9", is_lobo:false, full_name:"Niña Pequeña"        , acr_name:"NIN"},
    PIR: {color:"#FA8072", is_lobo:false, full_name:"Pirómano"            , acr_name:"PIR"},
    PRO: {color:"#82e0aa", is_lobo:false, full_name:"Protector"           , acr_name:"PRO"},
    VID: {color:"#45b39d", is_lobo:false, full_name:"Vidente"             , acr_name:"VID"},
    LOB: {color:"#cb4335", is_lobo:true , full_name:"Hombre Lobo"         , acr_name:"LOB"},
    ALB: {color:"#f1948a", is_lobo:true , full_name:"Lobo Albino"         , acr_name:"ALB"},
}

const MIN_PLAYERS =  4;
const MAX_PLAYERS = 15;

function Game() {
    this.days = 0;
    this.time = GAME_STATE.PRE;
    this.player_count = 0;
    this.players = [];

    this.set_player_count = function set_player_count(count) {
        this.player_count = count;
    };

    this.get_player_count = function get_player_count() {
        return this.player_count;
    };

    this.set_game_time = function set_game_time(game_state) {
        game.time = game_state;
    };

    this.get_game_time = function get_game_time() {
        return this.time;
    };
}

function Player(player_index) {
    this.player_state = PLAYER_STATES.ALD; // Aldeano
    this.is_alive = true;
    this.player_name = "Jugador";
    this.player_index = player_index;
}

//Start game
var game = new Game();
var player_edit_index = -1;

// On start
for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count++) {
    let button_div = `<button type="button" class="btn btn-dark" onclick="start_setup(${count})">${count} Jugadores</button>`;
    $("#player_selector").append(button_div);
}

//Static functions
function start_setup(player_count) {
    game.set_game_time(GAME_STATE.SET);
    game.set_player_count(player_count);
    setup_game();
}
 
function setup_game(){
    // Ocultar selector de jugadores
    $("#player_selector").hide();

    for (let index = 0; index < game.get_player_count(); index++) {
        game.players.push(new Player(index));
    }

    let player_states_iterator = Object.values(PLAYER_STATES);
    for (let index = 0; index < player_states_iterator.length; index++) {
        let state_dict = player_states_iterator[index];
        var form_option = `<option value="${state_dict.acr_name}" style="color: ${state_dict.color}">${state_dict.full_name}</option>`;
        $("#player_form_type").append(form_option);
    }

    update_player_board();
}

function update_player_board() {
    let m = game.get_player_count();
    let tan = Math.tan(Math.PI/m); /* tangent of half the base angle */
    let base_fs = 35;
    let mini_fs = 0.7;
    let base_d = 12; /* bubble size */ 
    let mini_d = 0.3;
    let base_rel = 1.5; /* extra space we want between bubbles */
    let mini_rel = 0.08;

    $("#player_container").empty();

    $("#player_container").attr("style", `--m: ${m}; --tan: ${+tan.toFixed(2)}; --d:${base_d-m*mini_d}em; --rel:${base_rel-m*mini_rel}`);
    for (let index = 0; index < game.get_player_count(); index++) {
        var it_player = game.players[index];
        if (it_player.is_alive) {
            if (it_player.player_state.is_lobo) {
                var bubble_style = `"--i: ${index}; color:${it_player.player_state.color}; border-color:${it_player.player_state.color}; box-shadow: 0 0px 15px 15px rgba(200, 0, 0, 0.6);"`;
            } else {
                var bubble_style = `"--i: ${index}; color:${it_player.player_state.color}; border-color:${it_player.player_state.color};"`;
            }
        } else {
            var bubble_style = `"--i: ${index}; color:${DEAD_COLOR}; border-color:${DEAD_COLOR};"`;
        }
        
        var player_bubble = `<div class="player_bubble" id="player_id_${it_player.player_index}" style=${bubble_style} onclick="player_bubble_clicked(${it_player.player_index})">
                                <div class="player_name" 
                                style="font-size: ${base_fs-m*mini_fs}px">
                                ${it_player.player_name}
                                </div>
                                <div class="player_name" 
                                style="font-size: ${(base_fs-m*mini_fs)/1.4}px">
                                ${it_player.player_state.acr_name}
                                </div>
                            </div>`;
        $("#player_container").append(player_bubble);
    }

    $("#player_container").show()
}

function player_bubble_clicked(player_index) {
    // Check game state
    if (game.time == GAME_STATE.SET) {
        open_player_setup(player_index);
    }
}

function open_player_setup(player_index) {
    player_edit_index = player_index;
    $("#player_form").show()
}

function end_player_setup() {
    $("#player_form").hide();
    let new_player_name = $("#player_form_name").val();
    let new_player_roll = $("#player_form_type").val();

    game.players[player_edit_index].player_name = new_player_name;
    if (new_player_roll != "") {
        game.players[player_edit_index].player_state = PLAYER_STATES[new_player_roll];
    } else {
        game.players[player_edit_index].player_state = PLAYER_STATES.ALD;
    }
    
    update_player_board();

    player_edit_index = -1;
}