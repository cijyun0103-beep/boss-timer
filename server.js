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

// --- 安全性檢查：強制從環境變數讀取 Webhook ---
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
if (!DISCORD_WEBHOOK_URL) {
    console.error('致命錯誤：未設定 DISCORD_WEBHOOK_URL 環境變數');
    process.exit(1);
}

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
        // 使用原子寫入確保檔案不損壞
        const tempFile = `${DATA_FILE}.tmp`;
        fs.writeFileSync(tempFile, JSON.stringify(bossStates, null, 2), 'utf8');
        fs.renameSync(tempFile, DATA_FILE);
    } catch (err) {
        console.error('寫入存檔失敗:', err);
    }
}

function sendDiscordWebhook(content, tts = false) {
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
        if (res.statusCode < 200 || res.statusCode >= 300) {
            console.error(`Webhook 發送失敗，狀態碼: ${res.statusCode}`);
        }
    });

    req.on('error', (err) => console.error('Webhook 連線錯誤:', err));
    req.write(data);
    req.end();
}

function formatTaiwanTime(timestamp) {
    const date = new Date(timestamp + 8 * 60 * 60 * 1000);
    return date.toISOString().replace('T', ' ').substring(11, 19);
}

app.get('/api/bosses', (req, res) => {
    const cleanStates = Object.fromEntries(
        Object.entries(bossStates).filter(([k]) => !k.startsWith('__notified_'))
    );
    res.json({ bossStates: cleanStates });
});

app.post('/api/bosses', (req, res) => {
    const { states, lastUpdatedBoss } = req.body;
    if (!states || typeof states !== 'object') {
        return res.status(400).json({ success: false, error: '無效資料' });
    }

    let updatedBossName = null;
    let updatedRespawnTime = null;

    for (const [bossName, rawTime] of Object.entries(states)) {
        const respawnTime = Number(rawTime);
        if (!Number.isFinite(respawnTime) || respawnTime <= 0) continue;

        if (bossStates[bossName] !== respawnTime) {
            bossStates[bossName] = respawnTime;
            delete bossStates[`__notified_${bossName}`];

            if (bossName === lastUpdatedBoss) {
                updatedBossName = bossName;
                updatedRespawnTime = respawnTime;
            }
        }
    }
    saveData();

    if (updatedBossName) {
        sendDiscordWebhook(`✅ 【**${updatedBossName}**】設定成功，重生時間：${formatTaiwanTime(updatedRespawnTime)}`);
    }

    res.json({ success: true });
});

app.post('/api/reset', (req, res) => {
    bossStates = {};
    saveData();
    sendDiscordWebhook("⚠️ **【系統通知】** 所有王的重生時間已被重置。");
    res.json({ success: true });
});

// 定時提醒器（每 5 秒檢查一次，當剩餘 1 分鐘內時發送 TTS 語音朗讀通知）
setInterval(() => {
    const now = Date.now();
    for (const [name, respawnTimeMs] of Object.entries(bossStates)) {
        if (name.startsWith('__notified_')) continue;

        const respawnTime = Number(respawnTimeMs);
        const diff = respawnTime - now;

        if (diff > 0 && diff <= 60000) {
            bossStates[`__notified_${name}`] = respawnTime;
            saveData();
            sendDiscordWebhook(`🚨 【**重要快訊**】 【**${name}**】將於 **1 分鐘內**重生！`, true);
        }
    }
}, 5000);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));