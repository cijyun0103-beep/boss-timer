const express = require('express');
const cors = require('cors');
const fs = require('fs');
const https = require('https');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'data.json');
const PORT = process.env.PORT || 10000;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// 檢查必要環境變數
if (!WEBHOOK_URL) {
    console.error('Fatal Error: DISCORD_WEBHOOK_URL is not set.');
    process.exit(1);
}

// 讀取資料
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (err) {
        console.error('Error loading data:', err);
    }
    return {};
}

// 原子寫入資料
function saveData(data) {
    const tmpFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
    fs.renameSync(tmpFile, DATA_FILE);
}

// 發送 Discord Webhook
function sendDiscordWebhook(message) {
    const data = JSON.stringify({ content: message });
    const url = new URL(WEBHOOK_URL);

    const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            'User-Agent': 'Mozilla/5.0 (NodeJS)'
        }
    };

    const req = https.request(options, (res) => {
        let body = '';

        res.on('data', chunk => {
            body += chunk;
        });

        res.on('end', () => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                console.error(
                    `Webhook error: ${res.statusCode}; response: ${body}`
                );
            }
        });
    });

    req.on('error', (err) => {
        console.error('Webhook request error:', err);
    });

    req.write(data);
    req.end();
}

// API Endpoints
app.get('/api/bosses', (req, res) => {
    res.json(loadData());
});

app.post('/api/bosses', (req, res) => {
    const newBosses = req.body;
    const currentData = loadData();
    
    // 更新資料
    Object.keys(newBosses).forEach(boss => {
        currentData[boss] = newBosses[boss];
    });

    saveData(currentData);
    res.sendStatus(200);
});

app.post('/api/reset', (req, res) => {
    saveData({});
    sendDiscordWebhook(`系統提示：所有 Boss 資料已重置。`);
    res.sendStatus(200);
});

// 背景檢查邏輯 (每 5 秒)
setInterval(() => {
    const bossStates = loadData();
    const now = Date.now();
    let updated = false;

    Object.keys(bossStates).forEach(boss => {
        const bossTime = new Date(bossStates[boss].respawnTime).getTime();
        const diff = bossTime - now;

        // 若在一分鐘內 (60000ms) 且尚未通知過
        if (diff > 0 && diff <= 60000 && !bossStates[boss].__notified_) {
            sendDiscordWebhook(`⚠️ 重要通知：${boss} 即將在 1 分鐘內重生！`);
            bossStates[boss].__notified_ = true;
            updated = true;
        }
    });

    if (updated) {
        saveData(bossStates);
    }
}, 5000);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});