const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let bossStates = {};
let notifiedOneMin = {}; // 紀錄已經發送過 1 分鐘通知的狀態，避免重複洗版

// 你的 Discord Webhook 網址
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1558663969709883452/32kLWSD9jjvl-_ZTiUFfeosOoUE0lJJ5LRKeTVKXwP4Qyf-uqsWYlxzB5WnAlP3Z-fyK';

async function sendDiscordNotification(message) {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message })
        });
        const resultText = await response.text();
        console.log("Discord 通知結果:", response.status, resultText);
    } catch (err) {
        console.log("Discord 通知發送失敗:", err);
    }
}

// 取得目前的王表狀態
app.get('/api/bosses', (req, res) => {
    res.json({ bossStates });
});

// 更新王表狀態
app.post('/api/bosses', (req, res) => {
    if (req.body && req.body.states) {
        bossStates = req.body.states;
        res.json({ success: true, bossStates });
    } else {
        res.status(400).json({ success: false, error: 'Invalid data' });
    }
});

// 全部重置
app.post('/api/reset', (req, res) => {
    bossStates = {};
    notifiedOneMin = {};
    res.json({ success: true, bossStates });
});

// 💡 伺服器端背景定時檢查（每 10 秒執行一次）
const bossIntervals = {
    "死亡騎士": 240,
    "將軍": 360,
    "古代巨人": 510,
    "不死鳥": 480,
    "克特": 600
};

setInterval(() => {
    const now = new Date().getTime();

    for (const [name, respawnTimeMs] of Object.entries(bossStates)) {
        if (!respawnTimeMs) continue;
        const intervalMs = (bossIntervals[name] || 240) * 60000;
        let displayRespawnTime = respawnTimeMs;

        // 計算超時後的最近重生點
        if (now > displayRespawnTime) {
            const diffTime = now - displayRespawnTime;
            const overdueCount = Math.floor(diffTime / intervalMs) + 1;
            displayRespawnTime += overdueCount * intervalMs;
        }

        const diff = displayRespawnTime - now;

        // 當剩餘時間小於等於 60 秒且大於 0 秒
        if (diff <= 60000 && diff > 0) {
            if (!notifiedOneMin[name] || notifiedOneMin[name] !== displayRespawnTime) {
                notifiedOneMin[name] = displayRespawnTime;
                const respawnDate = new Date(displayRespawnTime);
                const timeStr = `${String(respawnDate.getHours()).padStart(2, '0')}:${String(respawnDate.getMinutes()).padStart(2, '0')}:${String(respawnDate.getSeconds()).padStart(2, '0')}`;
                
                sendDiscordNotification(`🚨 **[天堂M 王表通知]** 警告！**${name}** 將於 1 分鐘後（${timeStr}）重生，請血盟成員準備集合！`);
            }
        }
    }
}, 10000);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});