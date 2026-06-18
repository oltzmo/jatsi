const http = require("http");
const express = require("express");
const app = express();
const socketIo = require("socket.io");
const port = process.env.PORT || 8080;
const server = http.Server(app).listen(port);
const io = socketIo(server);

let prod = process.env.NODE_ENV === "production";



function forwardHttps(req, res, next) {
  if(req.get('X-Forwarded-Proto').indexOf("https") > -1)
    return next();
  else 
    res.redirect('https://' + req.hostname + req.url);
}

if(prod)
	app.all('*', forwardHttps);

app.use(express.static(__dirname + "/../client/"));

let players = {};
let lobbyMsgs = [];
let games = {};

let newGameID = 1;
//121000
const turnTimeout = 121000;


io.on("connection", socket => {

	let myGameID;


	// Player gave a name
	socket.on("player sent name", (myName, uid = null) => {
		
		//console.log("uid socket: " + getSocketByUid(uid))
		if(players[socket.id] || getSocketByUid(uid) !== null) {
				//console.log("nimeä ei rekisteröity")
				return;
		}

		// Check if name already in use
		if(getSocketByName(myName) !== null) {
			socket.emit("name validated", 0);
			return;
		}

		if(/[ `!@#$%^&*()+\=\[\]{};':"\\|,.<>\/?~]/.test(myName)) {
			socket.emit("name validated", 1);
			return;
		} 

		if(myName.length > 20) {
			socket.emit("name validated", 2)
			return;
		}

		const myUid = socket.id;

		socket.emit("name validated", 3, getUsersInLobby(), lobbyMsgs, JSON.stringify(getPendingGames()), myUid);

		// null, if there's no game by this player
		myGameID = null;

		// status: idle / beforeGame / beforeMyGame / inGame
		// currentGame: game object this user currently in
		// currentdices: object of current dice values if this player's turn
		players[socket.id] = {
			name: myName,
			uid: myUid,
			socket: socket,
			room: "lobby",
			status: "idle",
			currentGame: null,
			scores: {
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
			},
			currentDices: {},
			rollsLeft: -1,
			turnTimer: null,
			leaveTimer: null,
			online: true,
		};

		socket.join("lobby");
		// send info me joining the lobby
		socket.to("lobby").emit("player joined lobby", myName);
		gameEvents(socket, myName);
	});

	socket.on("player sent uid", uid => {
    // kommentit kokeiluna
		/*if(players[socket.id] || false)
				return;*/

		const oldSocket = getSocketByUid(uid);

    //todo
		if(oldSocket && players[oldSocket.id] && players[oldSocket.id].online === true) {
			return;
    }

		if(!oldSocket || !players[oldSocket.id] || !players[oldSocket.id].currentGame || players[oldSocket.id].currentGame.status != "ongoing") {
			socket.emit("clear uid");
			return;
		}

		players[oldSocket.id].online = true;

		// todo join game ja lähetä pelitiedot
		//console.log("dc peruttu")
		clearTimeout(players[oldSocket.id].leaveTimer);

		players[socket.id] = players[oldSocket.id];
		players[socket.id].socket = socket;
		players[socket.id].online = true;
		let myName = players[socket.id].name;
		delete players[oldSocket.id];

		socket.join(players[socket.id].currentGame.id);

		// todo sisällytä pelaajien pisteet tietoihin
		const playerArr = players[socket.id].currentGame.players;
		const scores = {};
		for(let i = 0; i < playerArr.length; i++) {
			const name = playerArr[i];
			const sid = getSocketIDByName(name);
			scores[name] = players[sid].scores;
		}
		const currentDices = players[getSocketIDByName(players[socket.id].currentGame.turn)].currentDices;
		const rollsLeft = players[getSocketIDByName(players[socket.id].currentGame.turn)].rollsLeft;
		//socket.emit("resume game", myName, JSON.stringify(players[socket.id].currentGame), JSON.stringify(scores), JSON.stringify(currentDices), rollsLeft, getUsersInLobby(), lobbyMsgs, JSON.stringify(getPendingGames()));
		socket.emit("resume game", myName, JSON.stringify(players[socket.id].currentGame), JSON.stringify(scores), JSON.stringify(currentDices), rollsLeft, JSON.stringify(players[socket.id].currentGame.turnStamp));
		gameEvents(socket, players[socket.id].name);

	})

	function gameEvents(socket, myName) {
		//send info my chat msg lobby
		socket.on("lobbyMsg", msg => {
			if(msg.trim().length < 1)
				return; 

			msg = msg.trim();

			if(lobbyMsgs.length == 100)
				lobbyMsgs.shift();

			lobbyMsgs.push([myName, msg]);
			io.to("lobby").emit("lobbyMsg", msg, myName);
		});

		socket.on("gameMsg", msg => {
			if(msg.trim().length < 1)
				return; 

			msg = msg.trim();

			io.to(players[socket.id].currentGame.id).emit("gameMsg", msg, myName);
		});


		// send info me creating pending game
		socket.on("game created", () => {
			if(players[socket.id].status != "idle")
				return;

			games[newGameID] = {
				owner: myName,
				status: "pending",
				players: [myName],
				turn: null,
				id: newGameID,
				turnStamp: null,
			}

			players[socket.id].currentGame = games[newGameID];

			myGameID = newGameID;

			newGameID += 1;

			players[socket.id].status = "beforeMyGame";
			socket.to("lobby").emit("game created", myName);
		});

		// send info me joining a pending game
		socket.on("join game", name => {
			// name == id of the owner of the game (its the same as element id)

			const pendingGame = getPendingGameByName(name);

			if(pendingGame.players.length >= 8)
				return;

			if(players[socket.id].status != "beforeMyGame" && players[socket.id].status != "inGame" && pendingGame !== null && pendingGame != players[socket.id].currentGame) {

				if(players[socket.id].currentGame) {
				socket.to("lobby").emit("player canceled", myName, players[socket.id].currentGame.owner);
				}
				
				clearMyCurrentGame();

				players[socket.id].currentGame = pendingGame;

				pendingGame.players.push(myName);
				players[socket.id].status = "beforeGame";

				// name = name of owner of the game = id of the gamebox element
				socket.to("lobby").emit("player joined pending game", myName, name)


			}

		});

		//send info me canceling my pending game
		socket.on("game removed", () => {
			handlePendingRemoval();
		})

		// send info me canceling my joining to game
		socket.on("cancel joining", name => {
			clearMyCurrentGame();

			socket.to("lobby").emit("player canceled", myName, name);
		});


		// send info me starting my game (to me also)
		socket.on("game start", () => {
			if(myGameID === null || games[myGameID].players.length <= 1)
				return;

			// Player who joined first after game creation gets first turn
			games[myGameID].turn = games[myGameID].players[1];

			let startingPlayerID = getSocketIDByName(games[myGameID].turn);
			const startingPlayer = players[startingPlayerID];
			startingPlayer.rollsLeft = 3;
			const startingPlayerName = startingPlayer.name;

			games[myGameID].players.push(games[myGameID].players[0]);
			games[myGameID].players.shift();

			games[myGameID].status = "ongoing";

			io.to("lobby").emit("game start", JSON.stringify(games[myGameID]));

			const plrs = games[myGameID].players;

			for(let i = 0; i < plrs.length; i++) {
				const sid = getSocketIDByName(plrs[i]);
				players[sid].socket.leave("lobby");
				players[sid].socket.join(myGameID);
				players[sid].room = myGameID;
				players[sid].status = "inGame";
			}

			const gid = players[socket.id].currentGame.id;

			setTimeout(() => {
				startingPlayerID = getSocketIDByName(startingPlayerName);
				if(!players[startingPlayerID] || !players[startingPlayerID].currentGame || players[startingPlayerID].currentGame.id != gid || players[startingPlayerID].currentGame.turn != players[startingPlayerID].name)
					return;
				const timestamp = new Date();
				players[startingPlayerID].currentGame.turnStamp = timestamp;
				io.to(gid).emit("new turn starts", JSON.stringify(timestamp));
				players[startingPlayerID].turnTimer = setTimeout(() => {
					registerScore("fail", startingPlayerName);
				}, turnTimeout);
			}, 3000);
		});

		// broadcast my dice roll
		socket.on("roll dices", indices => {
			if(players[socket.id].rollsLeft <= 0)
				return;
			let diceValues = {};

			for(let i = 0; i < indices.length; i++) {
				const index = indices[i];
				diceValues[index] = Math.floor(Math.random() * 6 + 1);
				players[socket.id].currentDices[index] = diceValues[index];
			}
			players[socket.id].rollsLeft -= 1;
			console.log(myName + " nopat heiton jälkeen: " + Object.values(players[socket.id].currentDices))
			io.to(players[socket.id].currentGame.id).emit("roll dices", diceValues, players[socket.id].rollsLeft)
		});

		// broadcast my dice unlock/lock
		socket.on("unlock dice", diceIndex => {
			if(players[socket.id].rollsLeft <= 0)
				return;
			
			socket.to(players[socket.id].currentGame.id).emit("unlock dice", diceIndex)
		});

		socket.on("lock dice", diceIndex => {
			if(players[socket.id].rollsLeft <= 0)
				return;
			
			socket.to(players[socket.id].currentGame.id).emit("lock dice", diceIndex)
		});

		// register & broadcast my score
		socket.on("register score", scoreName => {
			clearTimeout(players[socket.id].turnTimer);
			registerScore(scoreName, myName);
		});

		// broadcast me leaving the game to lobby
		socket.on("I left to lobby", () => {
			if(players[socket.id].currentGame.turn == myName) {
				registerScore("left", myName);
			}
			else {
				const myGamePlayers = players[socket.id].currentGame.players;
				if(myGamePlayers.length == 2 && players[socket.id].currentGame.status != "finished") {
					lastPlayerWins(myGamePlayers);
				}
			}

			//console.log(myName + " left to lobby")
			
			socket.join("lobby");
			io.to(players[socket.id].currentGame.id).emit("player left to lobby", myName, getUsersInLobby(), lobbyMsgs, JSON.stringify(getPendingGames()));

			const myGamePlayers = players[socket.id].currentGame.players;

			socket.leave(players[socket.id].currentGame.id);
			socket.to("lobby").emit("player joined lobby", myName);
			
			myGameID = null;
			players[socket.id].currentDices = {};
			players[socket.id].scores = {
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
			players[socket.id].room = "lobby";
			players[socket.id].rollsLeft = -1;
			clearTimeout(players[socket.id].turnTimer);
			clearMyCurrentGame();
		});

		socket.on("disconnect", () => {handleDc(registerScore, lastPlayerWins)});

		// returns score for current dice values (stored in currentDices object)
		function scoreCalculator(scoreName, currentDices) {
			switch(scoreName) {
				case "Ykköset":
					return xsScore(Object.values(currentDices), 1);
				break;
				case "Kakkoset":
					return xsScore(Object.values(currentDices), 2);
				break;
				case "Kolmoset":
					return xsScore(Object.values(currentDices), 3);
				break;
				case "Neloset":
					return xsScore(Object.values(currentDices), 4);
				break;
				case "Viitoset":
					return xsScore(Object.values(currentDices), 5);
				break;
				case "Kuutoset":
					return xsScore(Object.values(currentDices), 6);
				break;
				case "Pari":
					return pairScore(Object.values(currentDices));
				break;
				case "Kaksi paria":
					return twoPairsScore(Object.values(currentDices));
				break;
				case "Kolme samaa":
					return threeSameScore(Object.values(currentDices));
				break;
				case "Neljä samaa":
					return fourSameScore(Object.values(currentDices));
				break;
				case "Pieni suora":
					return smallStraightScore(Object.values(currentDices));
				break;
				case "Iso suora":
					return bigStraightScore(Object.values(currentDices));
				break;
				case "Täyskäsi (mökki)":
					return fullHouseScore(Object.values(currentDices));
				break;
				case "Sattuma":
					return chanceScore(Object.values(currentDices));
				break;
				case "Jatsi":
					return yatzyScore(Object.values(currentDices));
				break;
				default:
					return false;
				break;
			}
		}

		function registerScore(scoreName, name) {
			
			const sid = getSocketIDByName(name);
			if(!players[sid] || !players[sid].currentGame || (players[sid].scores[scoreName] !== null && scoreName !== "fail" && scoreName !== "left"))
				return;


			if(players[sid].currentGame.turn != players[sid].name || players[sid].rollsLeft < 0)
				return;


			players[sid].currentGame.turnStamp = null;

			const score = scoreCalculator(scoreName, players[sid].currentDices);


			if(score !== false) {

				players[sid].scores[scoreName] = score;
				players[sid].currentDices = {};
				players[sid].rollsLeft = -1;

				if(scoreName == "Ykköset" || scoreName == "Kakkoset" || scoreName == "Kolmoset" || scoreName == "Neloset" || scoreName == "Viitoset" || scoreName == "Kuutoset")
					players[sid].scores["Välisumma"] += score;

				players[sid].scores["Summa"] += score;
				if(players[sid].scores["Välisumma"] >= 63 && players[sid].scores["Bonus"] === false) {
					players[sid].scores["Bonus"] = true;
					players[sid].scores["Välisumma"] += 50;
					players[sid].scores["Summa"] += 50;
				}

			}

			const myGamePlayers = players[sid].currentGame.players;
			let nextPlayer;

			if(myGamePlayers.indexOf(players[sid].name) == myGamePlayers.length - 1)
				nextPlayer = myGamePlayers[0];
			else 
				nextPlayer = myGamePlayers[myGamePlayers.indexOf(players[sid].name) + 1];

			players[sid].currentGame.turn = nextPlayer;
			let nextPlayerId = getSocketIDByName(nextPlayer);
			players[nextPlayerId].rollsLeft = 3;
			const nextPlayerName = players[nextPlayerId].name;

			const finalScores = gameHasEnded(players[sid].currentGame.players, scoreName, sid);

			io.to(players[sid].currentGame.id).emit("register score", scoreName, score, players[sid].name, nextPlayer);

			if(finalScores) {
				if(players[sid].currentGame.status == "finished")
					return;

				players[sid].currentGame.status = "finished";
				io.to(players[sid].currentGame.id).emit("game ended", finalScores);
				return;
			}

			const gid = players[sid].currentGame.id;

			setTimeout(() => {
				nextPlayerId = getSocketIDByName(nextPlayerName);
				if(!players[nextPlayerId] || !players[nextPlayerId].currentGame || players[nextPlayerId].currentGame.id != gid)
					return;

				if(players[nextPlayerId].currentGame.turn != players[nextPlayerId].name || players[nextPlayerId].rollsLeft != 3)
					return;

				io.to(players[nextPlayerId].currentGame.id).emit("new turn starts", JSON.stringify(new Date()));
				const timestamp = new Date();
				players[nextPlayerId].currentGame.turnStamp = timestamp;
				players[nextPlayerId].turnTimer = setTimeout(() => {
					registerScore("fail", nextPlayerName);
				}, turnTimeout);
			},3000)


		}

		function gameHasEnded(playerArr, scoreName, sid) {

			//if(playerArr.length == 1)
			//	return playerArr[0];
		

			if(playerArr.length == 2) {
				if(scoreName == "fail") {
					const failedPlayer = players[sid].name;
					const winner = playerArr[0] == failedPlayer ? playerArr[1] : playerArr[0];
					return winner;
				}
				else if(scoreName == "left") {
					const failedPlayer = players[sid].name;
					const winner = playerArr[0] == failedPlayer ? playerArr[1] : playerArr[0];
					return winner;
				}
			}

			const lastPlayer = playerArr[playerArr.length - 1];
			const lastId = getSocketIDByName(lastPlayer);
			const scores = players[lastId].scores;

			// === 0
			if(Object.values(scores).filter(el => el === null).length === 0) {

				const finalScores = [];
				for(let i = 0; i < playerArr.length; i++) {
					const name = playerArr[i];
					const sid = getSocketIDByName(name);
					finalScores.push([name, players[sid].scores["Summa"]]);
				}
				finalScores.sort((a,b) => b[1] - a[1]);
				return finalScores;
			}
			return false;
			
		}

		function lastPlayerWins(myGamePlayers) {
			if(players[socket.id].currentGame.status == "finished")
				return;


			const winner = myGamePlayers[0] == myName ? myGamePlayers[1] : myGamePlayers[0];
			const winnerId = getSocketIDByName(winner);
			const gid = players[winnerId].currentGame.id;
			clearTimeout(players[winnerId].turnTimer);
			players[winnerId].rollsLeft = -1;
			players[winnerId].currentGame.turn = null;
			socket.to(gid).emit("game ended", winner);
			players[socket.id].currentGame.status = "finished";
		} 

	}

	function handleDc(registerScore, lastPlayerWins) {

	//console.log("dc event")
  if(!players[socket.id])
    return;
 const myName = players[socket.id].name;
	players[socket.id].online = false;

	const delay = players[socket.id].status === "inGame" && players[socket.id].currentGame.status != "finished" ? 30000 : 0;
	//console.log("disconnect in " + delay);
	players[socket.id].leaveTimer = setTimeout(() => {
		//console.log(players[socket.id].name + " disconnected!")
		clearTimeout(players[socket.id].turnTimer);
		if(players[socket.id].status != "inGame")
			handlePendingRemoval();

		if(players[socket.id].currentGame && players[socket.id].status != "inGame") {
			socket.to("lobby").emit("player canceled", myName, players[socket.id].currentGame.owner);
		}
		if(players[socket.id].status == "inGame") {
			if(players[socket.id].currentGame.turn == myName)
				registerScore("left", myName);
			else {
				const myGamePlayers = players[socket.id].currentGame.players;
				if(myGamePlayers.length == 2 && players[socket.id].currentGame.status != "finished") {
					lastPlayerWins(myGamePlayers);
				}
			}
			io.to(players[socket.id].currentGame.id).emit("player left to lobby", myName, getUsersInLobby(), lobbyMsgs, JSON.stringify(getPendingGames()));
			
		}

		clearMyCurrentGame();


		if(players[socket.id].room == "lobby")
			socket.to("lobby").emit("player left", myName);

		if(Object.keys(players).length === 1) {
			players = {};
			games = {};
			lobbyMsgs = [];
		}
		else
			delete players[socket.id];
	}, delay);
}

function handlePendingRemoval() {
	if(!myGameID)
		return;

	const myName = players[socket.id].name;

	const playersArr = games[myGameID].players;

	for(let i = 0; i < playersArr.length; i++) {
		const sid = getSocketIDByName(playersArr[i]);
		if(players[sid]) {
			players[sid].status = "idle";
			players[sid].currentGame = null;
		}
	}

	delete games[myGameID];

	myGameID = null;
	players[socket.id].currentGame = null;

	socket.to("lobby").emit("game removed", myName);
}

function clearMyCurrentGame() {
	const myName = players[socket.id].name;
	if(players[socket.id].currentGame) {
		const index = players[socket.id].currentGame.players.indexOf(myName);
		if(index !== -1)
			players[socket.id].currentGame.players.splice(index, 1);
	}
	if(players[socket.id].currentGame && players[socket.id].currentGame.players.length == 0)
		delete games[players[socket.id].currentGame.id];

	players[socket.id].currentGame = null;
	players[socket.id].status = "idle";
}


});

function getSocketByName(name) {
	for(let i = 0, keys = Object.keys(players); i < keys.length; i++) {
		const sid = keys[i];
		if(players[sid]["name"] === name)
			return players[sid].socket;
	}
	return null;
}

function getSocketIDByName(name) {
	for(let i = 0, keys = Object.keys(players); i < keys.length; i++) {
		const sid = keys[i];
		if(players[sid]["name"] === name)
			return sid;
	}
	return null;
}

function getSocketByUid(uid) {
	for(let i = 0, keys = Object.keys(players); i < keys.length; i++) {
		const sid = keys[i];
		if(players[sid]["uid"] === uid)
			return players[sid].socket;
	}
	return null;
}

function getUsersInLobby() {
	const arr = [];
	for(let i = 0, keys = Object.keys(players); i < keys.length; i++) {
		const sid = keys[i];
		if(players[sid].room === "lobby")
			arr.push(players[sid].name)
	}
	return arr;
}

function getPendingGames() {
	const pends = {};
	for(let i = 0, keys = Object.keys(games); i < keys.length; i++) {
		const gameID = keys[i];
		if(games[gameID].status === "pending") {
			pends[gameID] = games[gameID];
		}
	}
	return pends;
}

function getPendingGameByName(name) {
	for(let i = 0, keys = Object.keys(games); i < keys.length; i++) {
		const gameID = keys[i];
		if(games[gameID].status === "pending" && games[gameID].owner === name) {
			return games[gameID];
		}
	}
	return null;
}

function xsScore(diceArr, x) {
	let count = 0;
	for(let i = 0; i < diceArr.length; i++) {
		if(diceArr[i] === x)
			count += 1;
	}
	return count * x;
}

function pairScore(diceArr) {
	diceArr.sort().reverse();
	for(let i = 0; i < diceArr.length - 1; i++)
		if(diceArr[i] === diceArr[i+1])
			return diceArr[i]*2;

	return 0;
}

function twoPairsScore(diceArr) {
	diceArr.sort().reverse();
	if(diceArr[0] === diceArr[1] && diceArr[2] === diceArr[3] && diceArr[0] != diceArr[2])
		return diceArr[0] * 2 + diceArr[2] * 2
	else if(diceArr[1] === diceArr[2] && diceArr[3] === diceArr[4] && diceArr[1] != diceArr[3]) 
		return diceArr[1] * 2 + diceArr[3] * 2;
	else if(diceArr[0] === diceArr[1] && diceArr[3] === diceArr[4] && diceArr[0] != diceArr[3]) 
		return diceArr[0] * 2 + diceArr[3] * 2;

	return 0;
}

function threeSameScore(diceArr) {
	diceArr.sort().reverse();
	for(let i = 0; i < diceArr.length - 2; i++)
		if(diceArr[i] === diceArr[i+1] && diceArr[i+1] === diceArr[i+2])
			return diceArr[i]*3;

	return 0;
}

function fourSameScore(diceArr) {
	diceArr.sort().reverse();
	for(let i = 0; i < diceArr.length - 3; i++)
		if(diceArr[i] === diceArr[i+1] && diceArr[i+1] === diceArr[i+2] && diceArr[i+2] === diceArr[i+3])
			return diceArr[i]*4;

	return 0;
}

function smallStraightScore(diceArr) {
	const str = diceArr.sort().join("");
	if(str === "12345")
		return 15;
	return 0;
}

function bigStraightScore(diceArr) {
	const str = diceArr.sort().join("");
	if(str === "23456")
		return 20;
	return 0;
}

function fullHouseScore(diceArr) {
	diceArr.sort();
	if(diceArr[0] === diceArr[1] && diceArr[1] === diceArr[2] && diceArr[3] === diceArr[4] && diceArr[0] != diceArr[4])
		return diceArr[0] * 3 + diceArr[3] * 2;
	if(diceArr[0] === diceArr[1] && diceArr[2] === diceArr[3] && diceArr[3] === diceArr[4] && diceArr[0] != diceArr[4])
		return diceArr[0] * 2 + diceArr[3] * 3;
	return 0;
}

function chanceScore(diceArr) {
	let sum = 0;

	for(let i = 0; i < diceArr.length; i++) {
		sum += diceArr[i]
	}

	return sum;
}

function yatzyScore(diceArr) {
	for(let i = 0; i < diceArr.length - 1; i++) {
		if(diceArr[i] != diceArr[i+1])
			return 0;
	}
	return 50;
}