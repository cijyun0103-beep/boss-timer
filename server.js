const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');

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
    } catch (e) {
        console.log("讀取存檔失敗:", e);
    }
}
loadData();

function saveData() {
    try {
        const tempFile = `${DATA_FILE}.tmp`;
        fs.writeFileSync(tempFile, JSON.stringify(bossStates, null, 2), 'utf8');
        fs.renameSync(tempFile, DATA_FILE);
    } catch (e) {
        console.log("寫入存檔失敗:", e);
    }
}

// 讀取環境變數或直接使用 Webhook
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "https://discord.com/api/webhooks/1558663969709883452/32kLWSD9jjvl-_ZTiUFfeosOoUE0lJJ5LRKeTVKXwP4Qyf-uqsWYlxzB5WnAlP3Z-fyK";

function sendDiscordWebhook(content, tts = false) {
    if (!DISCORD_WEBHOOK_URL) return;
    const data = JSON.stringify({ content, tts });
    const urlObj = new URL(DISCORD_WEBHOOK_URL);

    const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    };

    const req = https.request(options, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                console.log("Webhook 發送成功！");
            } else {
                console.log(`Webhook 發送失敗，狀態碼: ${res.statusCode}, 回應: ${responseBody}`);
            }
        });
    });

    req.on('error', (err) => {
        console.log("發送 Webhook 發生錯誤:", err);
    });

    req.write(data);
    req.end();
}

function getTaiwanDate(timestamp) {
    const date = new Date(timestamp + (8 * 60 * 60 * 1000));
    return date;
}

function formatTaiwanTime(timestamp, includeSeconds = false) {
    const date = getTaiwanDate(timestamp);
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    return includeSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

app.get('/api/bosses', (req, res) => {
    loadData();
    res.json({ bossStates });
});

// 接收前端更新的狀態，並發送即時登記通知
app.post('/api/bosses', async (req, res) => {
    const incomingStates = req.body?.states;
    const lastBoss = req.body?.lastUpdatedBoss;

    if (!incomingStates || typeof incomingStates !== 'object' || Array.isArray(incomingStates)) {
        return res.status(400).json({ success: false, error: 'Invalid data' });
    }

    loadData();
    for (const [bossName, rawTime] of Object.entries(incomingStates)) {
        const respawnTime = Number(rawTime);
        if (!Number.isFinite(respawnTime) || respawnTime <= 0) continue;

        if (bossStates[bossName] !== respawnTime) {
            bossStates[bossName] = respawnTime;
            // 清除舊的提醒標記以便下次重新計時
            delete bossStates[`__notified_${bossName}`];

            // 如果是這次操作更新的王，發送即時通知
            if (bossName === lastBoss) {
                const timeStr = formatTaiwanTime(respawnTime, true);
                sendDiscordWebhook(`✅ 【**${bossName}**】設定成功，將於 **${timeStr}** 重生。`);
            }
        }
    }
    saveData();

    res.json({ success: true, bossStates });
});

app.post('/api/reset', (req, res) => {
    bossStates = {};
    saveData();
    sendDiscordWebhook("⚠️ **【系統通知】** 所有王的重生時間已被重置。");
    res.json({ success: true, bossStates });
});

// 背景定時器：倒數 1 分鐘時發送提醒與 TTS 語音朗讀
let checkingRespawns = false;
setInterval(() => {
    if (checkingRespawns) return;
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

                const timeStr = formatTaiwanTime(respawnTime);
                const noticeText = `🚨 【**重要快訊**】 【**${name}**】將於 **1 分鐘內**（${timeStr}）重生，請點擊下方 💩 反應來記錄擊殺！`;
                sendDiscordWebhook(noticeText, true);
            }
        }
    } catch (err) {
        console.log("背景檢查發生錯誤:", err);
    } finally {
        checkingRespawns = false;
    }
}, 3000);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});