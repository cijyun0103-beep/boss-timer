const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'data.json');

let bossStates = {};
let notifiedOneMin = {};

// 啟動時讀取存檔
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const rawData = fs.readFileSync(DATA_FILE, 'utf8');
            bossStates = JSON.parse(rawData);
            console.log("已成功載入王表紀錄:", bossStates);
        }
    } catch (e) {
        console.log("讀取存檔失敗:", e);
    }
}
loadData();

// 強制寫入檔案的存檔函式
function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(bossStates, null, 2));
        console.log("已成功將王表紀錄寫入檔案:", bossStates);
    } catch (e) {
        console.log("寫入存檔失敗:", e);
    }
}

const bossIntervals = {
    "死亡騎士": 240,
    "將軍": 360,
    "古代巨人": 510,
    "不死鳥": 480,
    "克特": 600
};

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID || '1556240665027936377';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

client.once('clientReady', () => {
    console.log(`Discord 機器人已成功登入: ${client.user.tag}`);
});

function getTaiwanDate(timestamp = Date.now()) {
    const date = new Date(timestamp);
    return new Date(date.getTime() + (8 * 60 * 60 * 1000));
}

async function sendKillNotification(channel, bossName, killTimeMs, respawnTimeMs) {
    if (!channel) return;
    
    const killDate = getTaiwanDate(killTimeMs);
    const killTimeStr = `${String(killDate.getUTCHours()).padStart(2, '0')}:${String(killDate.getUTCMinutes()).padStart(2, '0')}:${String(killDate.getUTCSeconds()).padStart(2, '0')}`;
    
    const respawnDate = getTaiwanDate(respawnTimeMs);
    const respawnTimeStr = `${String(respawnDate.getUTCHours()).padStart(2, '0')}:${String(respawnDate.getUTCMinutes()).padStart(2, '0')}:${String(respawnDate.getUTCSeconds()).padStart(2, '0')}`;

    await channel.send(`【**${bossName}**】於 **${killTimeStr}** 被擊殺！預計於 **${respawnTimeStr}** 重生。`);
}

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();

    const message = reaction.message;
    if (message.author.id === client.user.id && message.embeds.length > 0) {
        const embed = message.embeds[0];
        for (const bossName of Object.keys(bossIntervals)) {
            if (embed.description && embed.description.includes(bossName)) {
                if (reaction.emoji.name === '💩') {
                    const killTimeMs = Date.now();
                    const intervalMs = bossIntervals[bossName] * 60000;
                    const respawnTimeMs = killTimeMs + intervalMs;

                    bossStates[bossName] = respawnTimeMs;
                    notifiedOneMin[bossName] = false;
                    saveData(); // 立即存檔

                    await sendKillNotification(message.channel, bossName, killTimeMs, respawnTimeMs);
                }
            }
        }
    }
});

if (DISCORD_BOT_TOKEN) {
    client.login(DISCORD_BOT_TOKEN).catch(err => console.log("Discord 登入失敗:", err));
}

app.get('/api/bosses', (req, res) => {
    loadData(); // 每次讀取前重新確認檔案內容
    res.json({ bossStates });
});

app.post('/api/bosses', async (req, res) => {
    if (req.body && req.body.states) {
        loadData();
        const oldStates = { ...bossStates };
        const incomingStates = req.body.states;
        const channel = client.channels.cache.get(TARGET_CHANNEL_ID);

        for (const [bossName, newRespawnTime] of Object.entries(incomingStates)) {
            if (newRespawnTime && newRespawnTime !== oldStates[bossName]) {
                const intervalMs = (bossIntervals[bossName] || 240) * 60000;
                const killTimeMs = newRespawnTime - intervalMs;

                bossStates[bossName] = newRespawnTime;
                notifiedOneMin[bossName] = false;
                saveData(); // 立即存檔

                if (channel) {
                    await sendKillNotification(channel, bossName, killTimeMs, newRespawnTime);
                }
            }
        }

        res.json({ success: true, bossStates });
    } else {
        res.status(400).json({ success: false, error: 'Invalid data' });
    }
});

app.post('/api/reset', (req, res) => {
    bossStates = {};
    notifiedOneMin = {};
    saveData(); // 寫入空檔（清空）
    res.json({ success: true, bossStates });
});

setInterval(async () => {
    if (!client.isReady()) return;
    const channel = client.channels.cache.get(TARGET_CHANNEL_ID);
    if (!channel) return;

    const now = Date.now();
    for (const [name, respawnTimeMs] of Object.entries(bossStates)) {
        if (!respawnTimeMs) continue;
        const intervalMs = bossIntervals[name] * 60000;
        let displayRespawnTime = respawnTimeMs;

        if (now > displayRespawnTime) {
            const diffTime = now - displayRespawnTime;
            const overdueCount = Math.floor(diffTime / intervalMs) + 1;
            displayRespawnTime += overdueCount * intervalMs;
        }

        const diff = displayRespawnTime - now;
        if (diff <= 60000 && diff > 50000) {
            if (!notifiedOneMin[name] || notifiedOneMin[name] !== displayRespawnTime) {
                notifiedOneMin[name] = displayRespawnTime;

                const respawnDate = getTaiwanDate(displayRespawnTime);
                const timeStr = `${String(respawnDate.getUTCHours()).padStart(2, '0')}:${String(respawnDate.getUTCMinutes()).padStart(2, '0')}:${String(respawnDate.getUTCSeconds()).padStart(2, '0')}`;

                const embed = new EmbedBuilder()
                    .setColor('#ef4444')
                    .setTitle('🚨 【重要快訊】')
                    .setDescription(`【**${name}**】將於 **1 分鐘內**（${timeStr}）重生，請點擊下方 💩 反應來記錄擊殺！`)
                    .setTimestamp();

                const sentMsg = await channel.send({ embeds: [embed] }).catch(err => console.log("發送失敗:", err));
                if (sentMsg) {
                    await sentMsg.react('💩');
                }
            }
        }
    }
}, 5000);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});