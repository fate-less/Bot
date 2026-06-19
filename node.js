const fs = require('fs');
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Bot running'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ===================== STORAGE =====================
const games = {};
const challenges = {};
const PvPGames = {};

const DATA_FILE = './stats.json';
let stats = {};

if (fs.existsSync(DATA_FILE)) {
    stats = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

// ===================== HELPERS =====================
function generateNumber() {
    const digits = [];

    while (digits.length < 4) {
        const digit = Math.floor(Math.random() * 10).toString();
        if (!digits.includes(digit)) digits.push(digit);
    }

    return digits.join('');
}

function checkGuess(secret, guess) {
    let fames = 0;
    let dots = 0;

    for (let i = 0; i < 4; i++) {
        if (guess[i] === secret[i]) fames++;
        else if (secret.includes(guess[i])) dots++;
    }

    return { fames, dots };
}

function initStats(id) {
    if (!stats[id]) {
        stats[id] = {
            soloWins: 0,
            pvpWins: 0,
            pvpLosses: 0,
            gamesPlayed: 0
        };
    }
}

function saveStats() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(stats, null, 2));
}

// ===================== READY =====================
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// ===================== COMMANDS =====================
client.on('messageCreate', async message => {

    if (message.author.bot) return;

    // ---------------- PING ----------------
    if (message.content === '!ping') {
        return message.reply('Pong!');
    }

    // ---------------- START ----------------
    if (message.content === '!start') {

        if (games[message.author.id]) {
            return message.reply('You already have an active game.');
        }

        games[message.author.id] = {
            secret: generateNumber(),
            moves: []
        };

        return message.reply(
            'Game started! Guess a 4-digit number using !guess ####'
        );
    }

    // ---------------- MOVES ----------------
    if (message.content === '!moves') {

        const game = games[message.author.id];

        if (!game) return message.reply('Start a game first using !start');
        if (game.moves.length === 0) return message.reply('No moves yet.');

        let history = '**Move History**\n';

        game.moves.forEach((m, i) => {
            history += `${i + 1}. ${m.guess} → ${m.fames} Fames, ${m.dots} Dots\n`;
        });

        return message.reply(history);
    }

    // ---------------- RESIGN ----------------
    if (message.content === '!resign') {

        const game = games[message.author.id];

        if (!game) return message.reply('No active game.');

        const answer = game.secret;

        delete games[message.author.id];

        return message.reply(`You resigned. Answer was ${answer}`);
    }

    // ---------------- CHALLENGE ----------------
    if (message.content.startsWith('!challenge')) {

        const opponent = message.mentions.users.first();

        if (!opponent) return message.reply('Mention a player.');
        if (opponent.bot) return message.reply('Cannot challenge bot.');
        if (opponent.id === message.author.id) return message.reply('No self challenge.');

        challenges[opponent.id] = message.author.id;

        return message.channel.send(
            `${opponent}, challenged by ${message.author}! Type !accept`
        );
    }

    // ---------------- ACCEPT ----------------
    if (message.content === '!accept') {

        const challengerId = challenges[message.author.id];

        if (!challengerId) return message.reply('No pending challenge.');

        PvPGames[challengerId] = {
            player1: challengerId,
            player2: message.author.id,
            code: null,
            code2: null,
            turn: null
        };

        delete challenges[message.author.id];

        return message.channel.send(
            `Challenge accepted! Both players use !submit #### in DM`
        );
    }

    // ---------------- SUBMIT ----------------
    if (message.content.startsWith('!submit ')) {

        if (message.guild) return message.reply('Use DM only.');

        const code = message.content.split(' ')[1];

        if (!/^\d{4}$/.test(code)) return message.reply('4 digits only.');
        if (new Set(code).size !== 4) return message.reply('Digits must be unique.');

        const game = Object.values(PvPGames).find(
            g => g.player1 === message.author.id || g.player2 === message.author.id
        );

        if (!game) return message.reply('Not in PvP game.');

        if (game.player1 === message.author.id) game.code = code;
        else game.code2 = code;

        await message.reply('Code saved.');

        if (game.code && game.code2) {
            game.turn = game.player1;

            return message.channel.send(
                `Game started!\n<@${game.player1}> vs <@${game.player2}>\n<@${game.player1}> starts`
            );
        }
    }

    // ---------------- STATS ----------------
    if (message.content.startsWith('!submit ')) {

    // STRICT DM CHECK
    if (message.channel.type !== 1) {
        return message.reply('Use DM only.');
    }

    const parts = message.content.trim().split(' ');
    const code = parts[1];

    if (!code) return message.reply('Provide code: !submit 1234');

    if (!/^\d{4}$/.test(code)) {
        return message.reply('4 digits only.');
    }

    if (new Set(code).size !== 4) {
        return message.reply('Digits must be unique.');
    }

    const gameEntry = Object.entries(PvPGames).find(([_, g]) =>
        g.player1 === message.author.id || g.player2 === message.author.id
    );

    if (!gameEntry) {
        return message.reply('Not in PvP game.');
    }

    const [gameId, game] = gameEntry;

    if (game.player1 === message.author.id) {
        game.code = code;
    } else {
        game.code2 = code;
    }

    await message.reply('Code saved.');

    if (game.code && game.code2) {

        game.turn = game.player1;

        return message.channel.send(
            `Game started!\n<@${game.player1}> vs <@${game.player2}>\n<@${game.player1}> starts`
        );
    }
}
    // ---------------- LEADERBOARD ----------------
    if (message.content === '!leaderboard') {

        if (!stats || Object.keys(stats).length === 0) {
            return message.reply('No stats yet.');
        }

        const sorted = Object.entries(stats)
            .map(([id, s]) => ({
                id,
                wins: (s.soloWins || 0) + (s.pvpWins || 0)
            }))
            .sort((a, b) => b.wins - a.wins)
            .slice(0, 10);

        let text = '🏆 Leaderboard\n\n';

        sorted.forEach((p, i) => {
            text += `${i + 1}. <@${p.id}> - ${p.wins} wins\n`;
        });

        return message.reply(text);
    }

    // ---------------- HELP ----------------
    if (message.content === '!help') {

        return message.reply(
`🎮 Fames & Dots

Solo:
!start
!guess ####
!moves
!resign

PvP:
!challenge @user
!accept
!submit #### (DM)
!guess ####

Stats:
!stats
!leaderboard`
        );
    }

    // ===================== GUESS =====================
    if (message.content.startsWith('!guess ')) {

        const guess = message.content.split(' ')[1];

        if (!/^\d{4}$/.test(guess)) {
            return message.reply('4 digits only.');
        }

        if (new Set(guess).size !== 4) {
            return message.reply('Digits must be unique.');
        }

        // ---------------- PVP ----------------
        const pvpGame = Object.values(PvPGames).find(
            g => g.player1 === message.author.id || g.player2 === message.author.id
        );

        if (pvpGame) {

            if (pvpGame.turn !== message.author.id) {
                return message.reply('Not your turn.');
            }

            const opponentCode =
                pvpGame.player1 === message.author.id
                    ? pvpGame.code2
                    : pvpGame.code;

            if (!opponentCode) {
                return message.reply('Opponent not ready.');
            }

            const result = checkGuess(opponentCode, guess);

            if (result.fames === 4) {

                const winnerId = message.author.id;
                const loserId =
                    pvpGame.player1 === winnerId
                        ? pvpGame.player2
                        : pvpGame.player1;

                initStats(winnerId);
                initStats(loserId);

                stats[winnerId].pvpWins++;
                stats[loserId].pvpLosses++;

                stats[winnerId].gamesPlayed++;
                stats[loserId].gamesPlayed++;

                saveStats();

                delete PvPGames[pvpGame.player1];
                delete PvPGames[pvpGame.player2];

                return message.channel.send(
                    `🏆 <@${winnerId}> wins! Code was ${opponentCode}`
                );
            }

            pvpGame.turn =
                pvpGame.turn === pvpGame.player1
                    ? pvpGame.player2
                    : pvpGame.player1;

            return message.reply(
                `${result.fames} Fames, ${result.dots} Dots`
            );
        }

        // ---------------- SOLO ----------------
        if (!games[message.author.id]) {
            return message.reply('Start with !start');
        }

        const result = checkGuess(
            games[message.author.id].secret,
            guess
        );

        games[message.author.id].moves.push({
            guess,
            fames: result.fames,
            dots: result.dots
        });

        const moveNumber = games[message.author.id].moves.length;

        if (result.fames === 4) {

            initStats(message.author.id);

            stats[message.author.id].soloWins++;
            stats[message.author.id].gamesPlayed++;

            saveStats();

            delete games[message.author.id];

            return message.reply(`🎉 You won in ${moveNumber} moves!`);
        }

        return message.reply(
            `Move ${moveNumber}: ${guess}\n${result.fames} Fames, ${result.dots} Dots`
        );
    }

});

// ===================== LOGIN =====================
client.login(process.env.TOKEN);