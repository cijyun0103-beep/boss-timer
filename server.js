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

// 各王的重生間隔時間（分鐘）
const bossIntervals = {
    "死亡騎士": 240,
    "將軍": 360,
    "古代巨人": 510,
    "不死鳥": 480,
    "克特": 600
};

let bossStates = {};
let notifiedMap = {}; 

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const rawData = fs.readFileSync(DATA_FILE, 'utf8');
            const saved = JSON.parse(rawData);
            if (saved && Object.keys(saved).length > 0) {
                bossStates = saved;
            }
        }
    } catch (e) {
        console.log("讀取存檔失敗:", e);
    }
}
loadData();

function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(bossStates, null, 2));
    } catch (e) {
        console.log("寫入存檔失敗:", e);
    }
}

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID || '1556240665027936377';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('clientReady', () => {
    console.log(`Discord 機器人已成功登入: ${client.user.tag}`);
});

function getTaiwanDate(timestamp) {
    const date = new Date(timestamp);
    return new Date(date.getTime() + (8 * 60 * 60 * 1000));
}

async function getTargetChannel() {
    let channel = client.channels.cache.get(TARGET_CHANNEL_ID);
    if (!channel && client.isReady()) {
        try {
            channel = await client.channels.fetch(TARGET_CHANNEL_ID);
        } catch (e) {
            console.log("無法取得 Discord 頻道:", e);
        }
    }
    return channel;
}

// API: 取得目前所有王的狀態
app.get('/api/bosses', (req, res) => {
    loadData();
    res.json({ bossStates });
});

// API: 接收前端更新的重生時間
app.post('/api/bosses', async (req, res) => {
    if (req.body && req.body.states) {
        loadData();
        const incomingStates = req.body.states;
        const channel = await getTargetChannel();

        for (const [bossName, newRespawnTime] of Object.entries(incomingStates)) {
            if (newRespawnTime && newRespawnTime > 0) {
                if (bossStates[bossName] !== newRespawnTime) {
                    bossStates[bossName] = newRespawnTime;
                    notifiedMap[bossName] = 0; 
                    saveData();

                    if (channel) {
                        const respDate = getTaiwanDate(newRespawnTime);
                        const timeStr = `${String(respDate.getUTCHours()).padStart(2, '0')}:${String(respDate.getUTCMinutes()).padStart(2, '0')}:${String(respDate.getUTCSeconds()).padStart(2, '0')}`;
                        await channel.send(`✅ 【**${bossName}**】設定成功，將於 **${timeStr}** 重生。`).catch(err => {});
                    }
                }
            }
        }

        res.json({ success: true, bossStates });
    } else {
        res.status(400).json({ success: false, error: 'Invalid data' });
    }
});

// API: 重置所有資料
app.post('/api/reset', (req, res) => {
    bossStates = {};
    notifiedMap = {};
    saveData();
    res.json({ success: true, bossStates });
});

// 核心背景定時器：每 3 秒檢查一次，抓準提前 1 分鐘時發送 TTS 語音朗讀通知
setInterval(async () => {
    if (!client.isReady()) return;
    const channel = await getTargetChannel();
    if (!channel) return;

    const now = Date.now();
    for (const [name, respawnTimeMs] of Object.entries(bossStates)) {
        if (!respawnTimeMs || respawnTimeMs <= 0) continue;

        const diff = respawnTimeMs - now;

        if (diff <= 65000 && diff >= 55000) {
            if (notifiedMap[name] !== respawnTimeMs) {
                notifiedMap[name] = respawnTimeMs; 

                const respawnDate = getTaiwanDate(respawnTimeMs);
                const timeStr = `${String(respawnDate.getUTCHours()).padStart(2, '0')}:${String(respawnDate.getUTCMinutes()).padStart(2, '0')}`;

                const noticeText = `注意！${name}將於一分鐘後的 ${timeStr} 重生！`;

                await channel.send({
                    content: noticeText,
                    tts: true
                }).catch(err => console.log("發送 TTS 失敗:", err));
            }
        }
    }
}, 3000);

// 確保執行 Discord 登入
if (DISCORD_BOT_TOKEN) {
    client.login(DISCORD_BOT_TOKEN)
        .then(() => console.log("Discord login executed successfully."))
        .catch(err => console.log("Discord 登入失敗，請檢查 Token:", err));
} else {
    console.log("錯誤：找不到 DISCORD_BOT_TOKEN 環境變數！");
}

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});