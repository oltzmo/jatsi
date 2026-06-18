const audio = new Audio("https://cdn.glitch.global/903914a5-7337-40c5-9f3b-9e8cd1fa7ab3/notification.wav?v=1671146933037");
(() => {

	const socket = io();

	const initCont = document.getElementById("initContainer");
	const logo = document.getElementById("logo");
	const loginForm = document.querySelector("#login form");
	const nameInput = loginForm.getElementsByTagName("input")[0];
	const notification = document.getElementById("notification");
	const lobbyCont = document.getElementById("lobbyContainer");
	const playerListEl = document.querySelector("#playerList ul");
	const lobbyChat = document.querySelector("#lobbyChat ul");
	const lobbyMsg = document.querySelector("#lobbyChat input[type='text']");
	const lobbyChatForm = document.querySelector("#lobbyChat form");
	const createGameBtn = document.getElementById("createGame");
	const gameCreation = document.getElementById("gameCreation");
	const gameCont = document.getElementById("gameContainer");
	const scoreTableEl = document.querySelector("#scores .box");
	const playArea = document.getElementById("playArea");
	const playAreaHeader = document.querySelector("#playArea h3");
	const dicesEl = document.getElementById("dices");
	const rollBtn = document.getElementsByClassName("roll")[0];
	const playInfoEl = document.querySelector("#playArea .info");
	const playInfo2El = document.querySelector("#playArea .info2");
	const playInfo3El = document.querySelector("#playArea .info3");
	const timerEl = document.getElementsByClassName("countdown")[0];
	const toLobbyBtn = document.getElementById("toLobby");
	const gameChat = document.querySelector("#gameChat ul");
	const gameMsg = document.querySelector("#gameChat input[type='text']");
	const gameChatForm = document.querySelector("#gameChat form");

	let nameEl;
	let rollAnims = [null, null, null, null, null];
	let t1;
	let rollLock = true;
	let myName;
	// name of the owner of the game currently joined 
	let currentGameID = null;
	// Game object of current game (whether im the owner or not)
	let Game = null;
	// -1 if not my turn
	let rollsLeft = -1;
	let turnTimer;
	let turnHandler;
	let resuming = false;
	let myUid = sessionStorage.getItem("uid");
	let eventsActivated = false;
  let connectionsNo = 0;

	socket.on("connect", () => {
    connectionsNo++;
    if(connectionsNo > 1)
      location.reload();
	})
  
  if(sessionStorage.getItem("uid")) {
    console.log("trying resume")
    socket.emit("player sent uid", sessionStorage.getItem("uid"));
  }

	socket.on("clear uid", () => {
    console.log("uid cleared")
		sessionStorage.removeItem("uid");
		myUid = null;
	})

	setInterval(() => {
		fetch(window.location.href);
	},294000);

	nameInput.focus();

	loginForm.onsubmit = ev => {
		ev.preventDefault();

		myName = nameInput.value.trim();
		if(myName.length > 0) {
			socket.emit("player sent name", myName, sessionStorage.getItem("uid"));
		}
	};

	socket.on("name validated", (status, playerList, lobbyMsgs, pendingGames, myUid)  => {
		if(status === 0)
			notification.textContent = "Nimi on jo käytössä";
		else if(status === 1)
			notification.textContent = "Nimi ei saa sisältää välilyöntejä tai erikoismerkkejä";
		else if(status === 2)
			notification.textContent = "Nimi on liian pitkä";
		else if(status === 3) {
			initLobby(playerList, lobbyMsgs, pendingGames);
			sessionStorage.setItem("uid", myUid);
			gameEvents();
		}
	});

	socket.on("resume game", (name, gameInfo, scores, currentDices, rollsLeftThis, timestamp) => {
		console.log("resume game")
    resuming = true;
		clearTimeout(turnHandler);
		clearInterval(turnTimer);
		myName = name;
		gameEvents();
		initCont.style.display = "none";
		initGame(JSON.parse(gameInfo));
		Game.scores = JSON.parse(scores);
		document.querySelector(".scoreBox ." + Game.turn).click();
		handleNewTurn(timestamp);
		if(Game.turn == myName) {
			rollsLeft = rollsLeftThis;
			/*if(rollsLeft > 0 && JSON.parse(timestamp) !== null) {
				console.log("no rolllock")
				rollLock = false;
			}*/
		}
		if(+rollsLeftThis < 3)
			handleNewRoll(JSON.parse(currentDices), rollsLeftThis);
		resuming = false;
	});

	function gameEvents() {
		if(eventsActivated)
			return;
		eventsActivated = true;
		socket.on("player joined lobby", name => {
			const li = document.createElement("li");
			li.textContent = name;
			li.className = name;
			playerListEl.appendChild(li);
		});

		// handle incoming chat message
		socket.on("lobbyMsg", (msg, name) => {
			newMsg(msg, name, true);
		});

		// handle incoming chat message
		socket.on("gameMsg", (msg, name) => {
			newMsg(msg, name, false);
		});

		// handle incoming gamebox
		socket.on("game created", name => {
			newPendingGame(name, [name]);
		});

		// handle someone canceling their game
		socket.on("game removed", name => {
			const gameBox = document.getElementById(name);
			if(gameBox.id == currentGameID) {
				currentGameID = null;
			}
			gameBox.remove();
		});

		// handle someone leaving lobby
		socket.on("player left", name => {
			const player = playerListEl.querySelector("." + name);
			if(player)
				player.remove();
		});

		// handle someone joining someones pending game
		socket.on("player joined pending game", (name, id) => {
			const gameBox = document.getElementById(id);

			const playerCountEl = gameBox.getElementsByClassName("playerCount")[0];
			const playersEl = gameBox.getElementsByClassName("players")[0];

			if(myName == id) {
				const notif =  gameBox.getElementsByClassName("notification")[0];
				const startBtn = gameBox.getElementsByClassName("startGame")[0];
				startBtn.className = "startGame";
				notif.textContent = "";
			}


			playerCountEl.textContent = parseInt(playerCountEl.textContent) + 1;
			playersEl.textContent += ", " + name;

			const playerCount = parseInt(playerCountEl.textContent);

			const joinBtn = gameBox.getElementsByClassName("joinGame")[0];

			if(myName != id && playerCount == 8 && joinBtn) {
				joinBtn.className = "joinGame disabled";
			}
		});

		// handle someone canceling their join to someones game
		socket.on("player canceled", (playerName, ownerName) => {
			clearPlayerFromGameBox(playerName, ownerName);
			const gameBox = document.getElementById(ownerName);
			const playerCountEl = gameBox.getElementsByClassName("playerCount")[0];
			const count = parseInt(playerCountEl.textContent);
			
			if(ownerName == myName && count == 1) {
				
				const notif = gameBox.getElementsByClassName("notification")[0];
				const startBtn = gameBox.getElementsByClassName("startGame")[0];
				startBtn.className = "startGame disabled";
				notif.textContent = "Odotetaan väh. 1 pelaajan liittymistä";

			}

			const joinBtn = gameBox.getElementsByClassName("joinGame")[0];

			if(ownerName != myName && count == 7 && joinBtn) {
				joinBtn.className = "joinGame";
			}
		});

		socket.on("game start", gameInfo => {
			gameInfo = JSON.parse(gameInfo);
			const players = gameInfo.players;
			if(players.indexOf(myName) > -1) {
				initGame(gameInfo);
			}
			else {
				document.getElementById(gameInfo.owner).remove();
				for(let i = 0; i < players.length; i++) {
					const name = players[i];
					playerListEl.getElementsByClassName(name)[0].remove();
				}
			}
		});

		socket.on("new turn starts", timestamp => { 
			handleNewTurn(timestamp) 
		});

		socket.on("unlock dice", diceIndex => {
			const dices = dicesEl.getElementsByClassName("dice");
			if(dices.length == 5) 
				dices[diceIndex].classList.add("unlocked");
		});

		socket.on("lock dice", diceIndex => {
			const dices = dicesEl.getElementsByClassName("dice");
			if(dices.length == 5) 
				dices[diceIndex].classList.remove("unlocked");
		});

		// New dices values fetched from server for every / chosen dices
		socket.on("roll dices", (rolledDices, rollsLeftThisPlayer) => {
			handleNewRoll(rolledDices, rollsLeftThisPlayer)
		});

		socket.on("register score", (scoreName, score, playerName, nextPlayerName) => {
			clearInterval(turnTimer);
			if(Game === null)
				return;

			// if scorename == fail, game status text comes from timer function
			if(scoreName != "fail") {
				if(scoreName != "left")
					Game.scores[playerName][scoreName] = score;
				timerEl.textContent = scoreName != "left" ? "" : "Pelaaja poistui pelistä";
				playInfoEl.textContent = "";
				playInfo2El.textContent = "";
				playInfo3El.textContent = "";
				rollBtn.style.display = "none";
			}

			scoreTableEl.classList.remove("turn");
			//playArea.className = "";

			const dices = document.getElementsByClassName("dice");

			for(let i = 0; i < dices.length; i++) {
				dices[i].classList.add("unlocked");
				dices[i].onclick = "";
			}

			Game.turn = nextPlayerName;

			if(scoreName != "fail" && scoreName != "left") {

				if(playerName == myName) 
					rollsLeft = -1;

				if(Object.keys(Game.scores[playerName]).indexOf("Välisumma") > Object.keys(Game.scores[playerName]).indexOf(scoreName))
					Game.scores[playerName]["Välisumma"] += score;

				if(Game.scores[playerName]["Välisumma"] >= 63 && Game.scores[playerName]["Bonus"] === false)
					Game.scores[playerName]["Välisumma"] += 50;

				if(Game.scores[playerName]["Välisumma"] >= 63 && Game.scores[playerName]["Bonus"] === false) {
					Game.scores[playerName]["Summa"] += 50;
					Game.scores[playerName]["Bonus"] = true;
				}

				Game.scores[playerName]["Summa"] += score;
				
				if(scoreTableEl.getElementsByClassName(playerName)[0].classList.contains("active")) {
					const row = getRowElByScoreName(scoreTableEl, scoreName);
					row.getElementsByTagName("div")[1].textContent = score;
					if(myName != playerName)
						indicateRow(row);

					if(Object.keys(Game.scores[playerName]).indexOf("Välisumma") > Object.keys(Game.scores[playerName]).indexOf(scoreName))
						scoreTableEl.querySelector(".midsum div:last-child").textContent = parseInt(Game.scores[playerName]["Välisumma"]);

					scoreTableEl.querySelector(".sum div:last-child").textContent = parseInt(Game.scores[playerName]["Summa"]);
				}
			}

			const duration = score !== false ? 0 : 1500;

			if(duration == 0)
				turnTransition();
			else {
				turnHandler = setTimeout(turnTransition, duration);
			}

			function turnTransition() {
				if(Game.status == "finished")
					return;
				if(scoreName == "fail" && playerName == myName) {
					toLobbyBtn.click();
				}
				playAreaHeader.textContent = "Seuraava pelaaja: ";
				dicesEl.innerHTML = "";
				playArea.className = "";
				timerEl.textContent = nextPlayerName;
			}

		});

		socket.on("player left to lobby", (name, playerList, lobbyMsgs, pendingGames) => {
			if(name == myName) {
				initLobby(playerList, lobbyMsgs, pendingGames);
			}
			else {
				const nameBoxes = nameEl.getElementsByTagName("div");
				if(nameBoxes.length > 1) {
					for(let i = 0; i < nameBoxes.length; i++) {
						if(nameBoxes[i].classList.contains(name) && nameBoxes[i].classList.contains("active")) {
							if(nameBoxes[i+1]) {
								nameBoxes[i+1].click();
							}
							else {
								nameBoxes[0].click();
							}
							nameBoxes[i].remove();
							break;
						}
						if(i == nameBoxes.length - 1)
							nameEl.getElementsByClassName(name)[0].remove();
					}
					
				}
				const index = playerList.indexOf(name);
				if(index !== -1)
					playerList.splice(index, 1);
			}
		});

		socket.on("game ended", finalScores => {
			if(Game)
				Game.status = "finished";
			timerEl.innerHTML = "";

			if(typeof finalScores == "string") {
				playAreaHeader.innerHTML = finalScores == myName ? "Vastustaja poistui pelistä.<br><br>" + finalScores + " voitti!" : "Et pelannut vuorollasi.<br><br>" + finalScores + " voitti!";
			}
			else {
				playAreaHeader.innerHTML = finalScores[0][0] + " voitti!";
				for(let i = 0; i < finalScores.length; i++) {
					timerEl.innerHTML += finalScores[i][0] + ": " + finalScores[i][1] + "p<br>";
				}
			}

			rollBtn.style.display = "none";
			playInfoEl.textContent = "";
			playInfo2El.textContent = "";
			playInfo3El.textContent = "";
			playArea.className = "";
			dicesEl.innerHTML = "";
			clearTimeout(turnHandler);
			clearInterval(turnTimer);
		});

	}

	function initLobby(playerList, lobbyMsgs, pendingGames) {
		initCont.style.display = "none";
		lobbyCont.style.display = "block";
		gameCont.style.display = "none";

		scoreTableEl.innerHTML = "";
		playAreaHeader.textContent = "";
		timerEl.textContent = "";
		playInfoEl.textContent = "";
		playInfo2El.textContent = "";
		playInfo3El.textContent = "";
		rollBtn.style.display = "none";
		dicesEl.innerHTML = "";

		for(let i = 0; i < playerList.length; i++) {
			const li = document.createElement("li");
			li.textContent = playerList[i];
			li.className = playerList[i];
			playerListEl.appendChild(li);
		}

		for(let i = 0; i < lobbyMsgs.length; i++) {
			newMsg(lobbyMsgs[i][1], lobbyMsgs[i][0], true)
		}

		pendingGames = JSON.parse(pendingGames);

		for(let i = 0, keys = Object.keys(pendingGames); i < keys.length; i++) {
			const game = pendingGames[keys[i]];
			newPendingGame(game.owner, game.players);
		}

		const li = document.createElement("li");
		li.textContent = myName;

		playerListEl.appendChild(li);

		// handle my chat message
		lobbyChatForm.onsubmit = ev => {
			ev.preventDefault();

			if(lobbyMsg.value.length < 1)
				return;

			socket.emit("lobbyMsg", lobbyMsg.value);
			lobbyMsg.value = "";
		}

		// handle creating my game
		createGameBtn.onclick = ev => {
			if(currentGameID !== null)
				return;

			currentGameID = myName;

			const gameBox = document.createElement("div");
			gameBox.className = "gameBox box shadow";
			gameBox.id = myName;
			gameBox.innerHTML = `<div class='cancelGame'>Peruuta peli</div>
			<div class='notification'>Odotetaan väh. 1 pelaajan liittymistä</div>
			<div class='gameInfo'>Pelaajat (<span class='playerCount'>1</span>/8): <span class='players'>${myName}</span></div>
			<button class='startGame disabled'>Aloita peli</button>`;

			const cancelBtn = gameBox.getElementsByClassName("cancelGame")[0];
			const startBtn = gameBox.getElementsByClassName("startGame")[0];


			// handle canceling my game
			cancelBtn.onclick = () => {
				socket.emit("game removed");
				gameBox.remove();
				currentGameID = null;
			};

			// handle starting my game
			startBtn.onclick = () => {
				const gameBox = document.getElementById(currentGameID);
				const playerCount = parseInt(gameBox.getElementsByClassName("playerCount")[0].textContent);
				if(playerCount >= 2) {
					socket.emit("game start");
				}
			}

			gameCreation.appendChild(gameBox);

			socket.emit("game created");
		}
	}

	function newMsg(msg, name, isLobby) {
		const el = isLobby ? lobbyChat : gameChat;
		const li = document.createElement("li");
		const b = document.createElement("b");
		const p = document.createElement("p");

		b.textContent = name + ":";
		p.textContent = msg;

		li.appendChild(b);
		li.appendChild(p);

		el.appendChild(li);
		el.scrollTop = el.scrollHeight;
	}

	function newPendingGame(name, players) {
		let playersStr = "";

		for(let i = 0; i < players.length; i++) {
			if(i != players.length - 1) {
				playersStr += players[i] + ", "
			}
			else {
				playersStr += players[i];
			}
		}

		const gameBox = document.createElement("div");
		gameBox.className = "gameBox box shadow";
		gameBox.id = name;
		gameBox.innerHTML = `<div class='gameTitle'>${name}n peli</div>
		<div class="notification"></div>
		<div class='gameInfo'>Pelaajat (<span class='playerCount'>${players.length}</span>/8): <span class='players'>${playersStr}</span></div>
		<button class='joinGame'>Liity peliin</button>`;

		const joinBtn = gameBox.getElementsByClassName("joinGame")[0];

		// handle me joining a pending game
		joinBtn.onclick = ev => { handleJoinBtnClick(ev.target, gameBox, name) };

		gameCreation.appendChild(gameBox);
	}

	function handleJoinBtnClick(joinBtn, gameBox, owner) {
			if(currentGameID == myName)
				return;

			const countEl = gameBox.getElementsByClassName("playerCount")[0];
			const playerCount = parseInt(countEl.textContent);

			if(countEl.textContent >= 8)
				return;

			if(currentGameID) {
				const gameBox = document.getElementById(currentGameID);
				const btn = gameBox.getElementsByClassName("leaveGame")[0];
				const notif = gameBox.getElementsByClassName("notification")[0];
				notif.textContent = "";
				btn.className = "joinGame";
				btn.textContent = "Liity peliin";
				btn.onclick = ev => { handleJoinBtnClick(ev.target, gameBox, gameBox.id) };
				clearPlayerFromGameBox(myName, currentGameID);

			}

			socket.emit("join game", gameBox.id);

			currentGameID = gameBox.id;

			const playersEl = gameBox.getElementsByClassName("players")[0];

			countEl.textContent = parseInt(countEl.textContent) + 1;
			playersEl.textContent += ", " + myName;

			joinBtn.className = "leaveGame";
			joinBtn.textContent = "Poistu";

			const gameTitle = gameBox.getElementsByClassName("gameTitle")[0];

			const notif = gameBox.getElementsByClassName("notification")[0];

			notif.innerHTML = "Odotetaan että " + owner + " aloittaa pelin";

			// cancel my joining to pending game
			// joinBtn = cancel button at this point
			joinBtn.onclick = () => {
				socket.emit("cancel joining", owner);
				currentGameID = null;

				joinBtn.className = "joinGame";
				joinBtn.textContent = "Liity peliin";

				countEl.textContent = parseInt(countEl.textContent) - 1;
				playersEl.textContent = playersEl.textContent.replace(myName + ", ", "");
				playersEl.textContent = playersEl.textContent.replace(", " + myName, "");

				notif.innerHTML = "";

				joinBtn.onclick = ev => { handleJoinBtnClick(ev.target, gameBox, owner) };

			}
	}

	function clearPlayerFromGameBox(playerName, ownerName) {
		const gameBox = document.getElementById(ownerName);
		const countEl = gameBox.getElementsByClassName("playerCount")[0];
		const playersEl = gameBox.getElementsByClassName("players")[0];

		countEl.textContent = parseInt(countEl.textContent) - 1;
		playersEl.textContent = playersEl.textContent.replace(playerName + ", ", "");
		playersEl.textContent = playersEl.textContent.replace(", " + playerName, "");
	}

	function initGame(gameInfo) {
		Game = gameInfo;
		Game.scores = {};

		gameCont.style.display = "";
		lobbyCont.style.display = "none";
		gameChat.innerHTML = "";

		lobbyCont.querySelector("#playerList ul").innerHTML = "";
		lobbyCont.querySelector("#lobbyChat ul").innerHTML = "";
		const gameBoxes = lobbyCont.getElementsByClassName("gameBox");

		for(let i = 0; i < gameBoxes.length; i++) {
			gameBoxes[i].remove();
		}

		const players = gameInfo.players;

		for(let i = 0; i < players.length; i++) {
			Game.scores[players[i]] = {
				"Ykköset": null,
				"Kakkoset": null,
				"Kolmoset": null,
				"Neloset": null,
				"Viitoset": null,
				"Kuutoset": null,
				"Välisumma": 0,
				"Pari": null,
				"Kaksi paria": null,
				"Kolme samaa": null,
				"Neljä samaa": null,
				"Pieni suora": null,
				"Iso suora": null,
				"Täyskäsi (mökki)": null,
				"Sattuma": null,
				"Jatsi": null,
				"Summa": 0,
				"Bonus": false,
			};
		}

		const scoreTable = createScoreTable(players);

		scoreTableEl.appendChild(scoreTable);

		playAreaHeader.textContent = "Pelin aloittaa:";

		timerEl.textContent = Game.turn;		

		toLobbyBtn.onclick = () => {
			socket.emit("I left to lobby");
			currentGameID = null;
			Game = null;
			rollsLeft = -1;
			setTimeout(() => {
				clearInterval(turnTimer);
				clearTimeout(turnHandler);
			},30)

		}

		gameChatForm.onsubmit = ev => {
			ev.preventDefault();

			if(gameMsg.value.length < 1)
				return;

			socket.emit("gameMsg", gameMsg.value);
			//newLobbyMsg(lobbyMsg.value, myName);
			gameMsg.value = "";
		}

	}

	// name is string (if mine) or array (if other players)
	function createScoreTable(name) {
		const scoreBox = document.createElement("div");
		nameEl = document.createElement("div");
		scoreBox.className = "scoreBox";
		nameEl.className = "name";

		for(let i = 0; i < name.length; i++) {
			const playerName = name[i]

			const nameBox = document.createElement("div");
			nameBox.textContent = playerName;
			nameBox.className = playerName;


			nameBox.onclick = () => {
				const scores = Game.scores[playerName];

				for(let i = 0, keys = Object.keys(scores); i < keys.length; i++) {
					const point = scores[keys[i]];
					let pointBox = scoreBox.getElementsByClassName("row")[i];
					if(pointBox)
						pointBox = pointBox.getElementsByTagName("div")[1];
					else
						return;
					pointBox.textContent = point !== null ? point : ""; 
					nameEl.getElementsByClassName("active")[0].classList.remove("active");
					nameBox.classList.add("active");
					if(playerName == myName && Game.turn == myName)
						scoreTableEl.classList.add("turn");
					else
						scoreTableEl.classList.remove("turn");
				}
			}

			if(Game.players.length == 2) {
				nameBox.style.width = "50%";
				nameBox.style.height = "40px";
				nameBox.style.paddingTop = "10px";
			}

			nameEl.appendChild(nameBox);
		}

		// Move game owner / starter to last in opp scores
		/*
		if(myName != Game.owner) 
			nameEl.appendChild(nameEl.getElementsByClassName(Game.owner)[0]);*/

		nameEl.getElementsByClassName(Game.turn)[0].classList.add("active");
		
		scoreBox.appendChild(nameEl);

		const rowNames = ["Ykköset","Kakkoset","Kolmoset","Neloset","Viitoset","Kuutoset","Välisumma (50p bonus jos &#8805; 63p)","Pari"
		,"Kaksi paria", "Kolme samaa", "Neljä samaa", "Pieni suora", "Iso suora", "Täyskäsi (mökki)", "Sattuma", "Jatsi", "Summa"];

		for(let i = 0; i < 17; i++) {
			const row = document.createElement("div");
			row.className = "row";

			const nameCell = document.createElement("div");
			const scoreCell = document.createElement("div");

			nameCell.textContent = rowNames[i];

			if(i == 6) {
				row.className = "row midsum";
				nameCell.innerHTML = rowNames[i];
				scoreCell.textContent = 0;
			}
			else if(i == 16) {
				row.className = "row sum";
				scoreCell.textContent = 0;
			}
			else {
				row.onclick = () => {
					console.log("rollselft: " + rollsLeft)
					if(Game.turn != myName || rollsLeft < 0 || rollsLeft == 3 || !nameEl.getElementsByClassName(myName)[0].classList.contains("active"))
						return;

					socket.emit("register score", rowNames[i]);
					rollLock = true;
				}
			}


			row.appendChild(nameCell);
			row.appendChild(scoreCell);

			scoreBox.appendChild(row);
		}

		return scoreBox;
	}

	function handleNewTurn(timestamp) {
		console.log("timestamp: " + timestamp)
    timestamp = JSON.parse(timestamp);
    const elapsed = (new Date().getTime() - new Date(timestamp)) / 1000;
    if(timestamp !== null) {
			startTimer(120 - elapsed, timerEl);
			if(Game.turn == myName)
				rollLock = false;
    }
		if(Game.turn == myName) {
			playArea.className = "turn";
			playAreaHeader.textContent = "Sinun vuorosi";
			rollBtn.style.display = "";
			rollsLeft = 3;
			audio.play();
		}
		else 
			playAreaHeader.textContent = Game.turn + "n vuoro";

		scoreTableEl.getElementsByClassName(Game.turn)[0].click();

		rollBtn.onclick = () => {
			if(Game.turn != myName || rollLock || rollsLeft <= 0 || (playArea.getElementsByClassName("dice").length > 0 && playArea.getElementsByClassName("unlocked").length == 0))
				return;

			rollsLeft -= 1;

			if(rollsLeft == 2 && nameEl.getElementsByClassName(myName)[0].classList.contains("active"))
				scoreTableEl.classList.add("turn");

			rollLock = true;

			// fetch random values from server
			const unlockedIs = unlockedIndices();

			const rolledDices = {};
			for(let i = 0; i < unlockedIs.length; i++) {
				rolledDices[unlockedIs[i]] = 0;
			}

			rollDicesAnim(rolledDices, true, false);

			socket.emit("roll dices", unlockedIs);

			if(rollsLeft <= 0) {
				const dices = document.getElementsByClassName("dice");
				if(dices.length == 0) 
					return;

				for(let i = 0; i < dices.length; i++) {
					if(!dices[i].classList.contains("unlocked"))
						dices[i].classList.add("unlocked")
					dices[i].style.cssText = "cursor: auto !important;";
				}
				rollBtn.style.display = "none";
				playInfo3El.textContent = "Kirjaa pisteesi klikkaamalla pistetaulukkoasi";
				playInfoEl.textContent = "";
			}

		}
	}

	function handleNewRoll(rolledDices, rollsLeftThisPlayer) {
		if(!dicesEl.getElementsByClassName("dice")[0]) {
			dicesEl.innerHTML = `	
			<div class="dice one unlocked"></div>
			<div class="dice two unlocked"></div>
			<div class="dice three unlocked"></div>
			<div class="dice four unlocked"></div>
			<div class="dice five unlocked"></div>
			`;
		}
		
		playInfo2El.innerHTML = "Heittoja jäljellä " + rollsLeftThisPlayer + " kpl";

		if(Game.turn == myName) {

			if(!resuming)
				rollDicesAnim(rolledDices, true, true, performance.now());
			else
				presentDices(rolledDices);

			if(rollsLeftThisPlayer == 2)
				playInfoEl.textContent = "Klikkaa noppaa lukitaksesi sen";

			/*if(rollsLeftThisPlayer === 0)
				playInfo3El.textContent = "Kirjaa pisteesi klikkaamalla pistetaulukkoasi";*/

		}
		else {
			if(!resuming)
				rollDicesAnim(rolledDices, false, false);
			else
				presentDices(rolledDices);
		}

		const dices = dicesEl.getElementsByClassName("dice");

		for(let i = 0; i < dices.length; i++) {
			const dice = dices[i];

			dice.onclick = () => {
				if(rollsLeft <= 0)
					return;

				if(dice.classList.contains("unlocked")) {
					dice.classList.remove("unlocked");
					socket.emit("lock dice", i);
				}
				else {
					dice.classList.add("unlocked");
					socket.emit("unlock dice", i);
				}
			}
		}
	}

	function rollDicesAnim(rolledDices, mine, onlyStopRolling, t2) {
		if(!dicesEl.getElementsByClassName("dice")[0]) {
			dicesEl.innerHTML = `	
			<div class="dice one unlocked"></div>
			<div class="dice two unlocked"></div>
			<div class="dice three unlocked"></div>
			<div class="dice four unlocked"></div>
			<div class="dice five unlocked"></div>
			`;
		}
		const classes = ["one", "two", "three", "four", "five", "six"];
		if(!onlyStopRolling)
			t1 = performance.now() + 20;
		for(let i = 0, keys = Object.keys(rolledDices); i < keys.length; i++) {
			const dice = dicesEl.getElementsByClassName("dice")[keys[i]];
			const newValue = rolledDices[keys[i]];
			if(!onlyStopRolling) {

				rollAnims[i] = setInterval(() => {
					let newClass = classes[Math.floor(Math.random() * 6)];
					while(dice.className.indexOf(newClass) !== -1) {
						newClass = classes[Math.floor(Math.random() * 6)];
					}
					dice.className = "dice unlocked " + newClass;
				},20);
			}
			if(!mine || onlyStopRolling) {
				let time;
				if(!mine)
					time = 500;
				else
					time = 500-(t2-t1)

				setTimeout(() => { 
					if(i === 0)
						setTimeout(() => {rollLock=false;},1000);
					clearInterval(rollAnims[i]);
					setTimeout(() => {
						dice.className = "dice unlocked " + classes[newValue - 1];
					},20)
				}, time);
			}
		}
	}

	function presentDices(dices) {
		console.log("presentdices")
		console.log(JSON.stringify(dices))
		if(!dicesEl.getElementsByClassName("dice")[0]) {
			dicesEl.innerHTML = `	
			<div class="dice one unlocked"></div>
			<div class="dice two unlocked"></div>
			<div class="dice three unlocked"></div>
			<div class="dice four unlocked"></div>
			<div class="dice five unlocked"></div>
			`;
		}

		const classes = ["one", "two", "three", "four", "five", "six"]

		for(let i = 0, keys = Object.keys(dices); i < keys.length; i++) {
			const dice = dicesEl.getElementsByClassName("dice")[i];
			const val = dices[keys[i]];
			dice.className = "dice " + classes[val - 1] + " unlocked";
			console.log(val)
		}
	}

	function startTimer(duration, display) {
		clearInterval(turnTimer);
	    let timeLeft = duration, minutes, seconds;
	    refresh();
	    turnTimer = setInterval(refresh, 1000);
	    
	    function refresh() {
	        minutes = parseInt(timeLeft / 60, 10);
	        seconds = parseInt(timeLeft % 60, 10);

	        minutes = minutes < 10 ? "0" + minutes : minutes;
	        seconds = seconds < 10 ? "0" + seconds : seconds;

	        display.textContent = minutes + ":" + seconds;

	        if (--timeLeft < 0) {
	            clearInterval(turnTimer);
	            timerEl.textContent = Game.turn == myName ? "Et pelannut vuorollasi, joten putosit pelistä" : Game.turn + " putosi pelistä, koska ei pelannut vuorollaan";
				scoreTableEl.classList.remove("turn");

				const dices = document.getElementsByClassName("dice");

				for(let i = 0; i < dices.length; i++) {
					dices[i].classList.add("unlocked");
					dices[i].onclick = "";
				}
				Game.turn = null;
				playInfoEl.textContent = "";
				dicesEl.innerHTML = "";
				playInfo2El.textContent = "";
				playInfo3El.textContent = "";
				rollBtn.style.display = "none";
	        }
	    }
	    
	}

	// returns array with indices of unlocked dices
	function unlockedIndices() {
		const dices = dicesEl.getElementsByClassName("dice");

		// If no dices on ui, roll all
		if(!dices[0])
			return [0,1,2,3,4];

		const arr = [];

		for(let i = 0; i < dices.length; i++) {
			if(dices[i].classList.contains("unlocked"))
				arr.push(i);
		}

		return arr;
	}


	function indicateRow(row) {
		const orig = window.getComputedStyle(row).getPropertyValue("background-color");
		row.style.transition = "1.5s";
		row.style.backgroundColor = "rgb(161,0,0)";
		row.style.color = "#fff";
		setTimeout(() => { 
			row.style.backgroundColor = orig;
			row.style.color = "grey";
			setTimeout(() => { 
				row.style.transition = "";
				row.style.backgroundColor = "";
				row.style.color = "";
			}, 1500)
		}, 1500)
	} 

	function getRowElByScoreName(cont, scoreName) {
		const rows = cont.getElementsByClassName("row");
		for(let i = 0; i < rows.length; i++) {
			const row = rows[i];
			const rowName = rows[i].getElementsByTagName("div")[0].textContent;
			if(rowName.indexOf(scoreName) > -1)
				return row;
		}
	}

})();
