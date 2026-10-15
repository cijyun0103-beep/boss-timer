const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'data.json');

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

// 你的 Discord Webhook 網址
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1558663969709883452/32kLWSD9jjvl-_ZTiUFfeosOoUE0lJJ5LRKeTVKXwP4Qyf-uqsWYlxzB5WnAlP3Z-fyK";

async function sendDiscordWebhook(content, tts = false) {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, tts })
        });
        if (!response.ok) {
            console.log("Webhook 發送失敗，狀態碼:", response.status);
        }
    } catch (err) {
        console.log("發送 Webhook 發生例外錯誤:", err);
    }
}

function getTaiwanDate(timestamp) {
    const date = new Date(timestamp);
    return new Date(date.getTime() + (8 * 60 * 60 * 1000));
}

app.get('/api/bosses', (req, res) => {
    loadData();
    res.json({ bossStates });
});

// 當網頁更新王的時間時，透過 Webhook 發送通知到 Discord
app.post('/api/bosses', async (req, res) => {
    if (req.body && req.body.states) {
        loadData();
        const incomingStates = req.body.states;

        for (const [bossName, newRespawnTime] of Object.entries(incomingStates)) {
            if (newRespawnTime && newRespawnTime > 0) {
                if (bossStates[bossName] !== newRespawnTime) {
                    bossStates[bossName] = newRespawnTime;
                    notifiedMap[bossName] = 0; 
                    saveData();

                    const respDate = getTaiwanDate(newRespawnTime);
                    const timeStr = `${String(respDate.getUTCHours()).padStart(2, '0')}:${String(respDate.getUTCMinutes()).padStart(2, '0')}:${String(respDate.getUTCSeconds()).padStart(2, '0')}`;
                    
                    // 實際執行發送
                    await sendDiscordWebhook(`✅ 【**${bossName}**】設定成功，將於 **${timeStr}** 重生。`);
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
    notifiedMap = {};
    saveData();
    res.json({ success: true, bossStates });
});

// 背景定時器：倒數 1 分鐘時發送提醒與 TTS 語音朗讀
setInterval(async () => {
    const now = Date.now();
    for (const [name, respawnTimeMs] of Object.entries(bossStates)) {
        if (!respawnTimeMs || respawnTimeMs <= 0) continue;

        const diff = respawnTimeMs - now;

        if (diff <= 65000 && diff >= 55000) {
            if (notifiedMap[name] !== respawnTimeMs) {
                notifiedMap[name] = respawnTimeMs; 

                const respawnDate = getTaiwanDate(respawnTimeMs);
                const timeStr = `${String(respawnDate.getUTCHours()).padStart(2, '0')}:${String(respawnDate.getUTCMinutes()).padStart(2, '0')}`;

                const noticeText = `🚨 【**重要快訊**】 【**${name}**】將於 **1 分鐘內**（${timeStr}）重生！`;
                
                // 實際執行發送 (啟用 TTS 語音朗讀)
                await sendDiscordWebhook(noticeText, true);
            }
        }
    }
}, 3000);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});