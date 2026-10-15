const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'data.json');

let bossStates = {};

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) return;
        const rawData = fs.readFileSync(DATA_FILE, 'utf8');
        const saved = JSON.parse(rawData);
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
            bossStates = saved;
        }
    } catch (err) {
        console.error('讀取存檔失敗:', err);
    }
}
loadData();

function saveData() {
    try {
        const tempFile = `${DATA_FILE}.tmp`;
        fs.writeFileSync(tempFile, JSON.stringify(bossStates, null, 2), 'utf8');
        fs.renameSync(tempFile, DATA_FILE);
    } catch (err) {
        console.error('寫入存檔失敗:', err);
    }
}

// 讀取 Render 環境變數裡的 Bot Token 與 頻道 ID
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID || '1556240665027936377';

if (!DISCORD_BOT_TOKEN) {
    console.error('致命錯誤：未設定 DISCORD_BOT_TOKEN 環境變數');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`[成功] Discord 機器人已成功登入: ${client.user.tag}`);
});

client.login(DISCORD_BOT_TOKEN).catch(err => {
    console.error("Discord 登入失敗：", err);
});

function getTaiwanDate(timestamp) {
    return new Date(timestamp + 8 * 60 * 60 * 1000);
}

function formatTaiwanTime(timestamp, includeSeconds = false) {
    const date = getTaiwanDate(timestamp);
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    return includeSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

async function sendDiscordMessage(content, tts = false) {
    try {
        let channel = client.channels.cache.get(TARGET_CHANNEL_ID);
        if (!channel && client.isReady()) {
            channel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
        }
        if (channel) {
            await channel.send({ content, tts });
            console.log("Discord 訊息發送成功");
        } else {
            console.log("找不到指定的 Discord 頻道");
        }
    } catch (err) {
        console.error("發送 Discord 訊息發生錯誤：", err);
    }
}

app.get('/api/bosses', (req, res) => {
    loadData();
    const cleanStates = {};
    for (const [k, v] of Object.entries(bossStates)) {
        if (!k.startsWith('__notified_')) {
            cleanStates[k] = v;
        }
    }
    res.json({ bossStates: cleanStates });
});

app.post('/api/bosses', async (req, res) => {
    const incomingStates = req.body?.states;
    const lastBoss = req.body?.lastUpdatedBoss;

    if (!incomingStates || typeof incomingStates !== 'object' || Array.isArray(incomingStates)) {
        return res.status(400).json({ success: false, error: 'Invalid data' });
    }

    loadData();
    let updatedBossName = null;
    let updatedRespawnTime = null;

    for (const [bossName, rawTime] of Object.entries(incomingStates)) {
        const respawnTime = Number(rawTime);
        if (!Number.isFinite(respawnTime) || respawnTime <= 0) continue;

        if (bossStates[bossName] !== respawnTime) {
            bossStates[bossName] = respawnTime;
            delete bossStates[`__notified_${bossName}`];

            if (bossName === lastBoss) {
                updatedBossName = bossName;
                updatedRespawnTime = respawnTime;
            }
        }
    }
    saveData();

    const cleanStates = {};
    for (const [k, v] of Object.entries(bossStates)) {
        if (!k.startsWith('__notified_')) {
            cleanStates[k] = v;
        }
    }
    res.json({ success: true, bossStates: cleanStates });

    if (updatedBossName && updatedRespawnTime) {
        const timeStr = formatTaiwanTime(updatedRespawnTime, true);
        await sendDiscordMessage(`✅ 【**${updatedBossName}**】設定成功，將於 **${timeStr}** 重生。`);
    }
});

app.post('/api/reset', async (req, res) => {
    bossStates = {};
    saveData();
    await sendDiscordMessage("⚠️ **【系統通知】** 所有王的重生時間已被重置。");
    res.json({ success: true, bossStates: {} });
});

// 背景定時器：倒數 1 分鐘時發送提醒與 TTS 語音朗讀
let checkingRespawns = false;
setInterval(async () => {
    if (checkingRespawns || !client.isReady()) return;
    checkingRespawns = true;

    try {
        const now = Date.now();
        for (const [name, respawnTimeMs] of Object.entries(bossStates)) {
            if (name.startsWith('__notified_')) continue;
            const respawnTime = Number(respawnTimeMs);
            if (!Number.isFinite(respawnTime) || respawnTime <= 0) continue;

            const diff = respawnTime - now;

            if (diff <= 65000 && diff >= 55000) {
                if (bossStates[`__notified_${name}`] === respawnTime) continue;

                bossStates[`__notified_${name}`] = respawnTime;
                saveData();

                const timeStr = formatTaiwanTime(respawnTime, true);
                const noticeText = `🚨 【**重要快訊**】 【**${name}**】將於 **1 分鐘內**（${timeStr}）重生！`;
                await sendDiscordMessage(noticeText, true);
            }
        }
    } catch (err) {
        console.error('背景檢查發生錯誤:', err);
    } finally {
        checkingRespawns = false;
    }
}, 3000);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});