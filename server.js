const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let bossStates = {};
let notifiedOneMin = {};

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
        
        const responseText = await response.text();
        console.log(`[Discord 狀態] 碼: ${response.status}, 回應: ${responseText}`);
    } catch (err) {
        console.log("[Discord 錯誤] 發送失敗:", err);
    }
}

// 💡 測試路由：只要在瀏覽器打開你的 Render 網址 /test-discord 就能立刻測試 Discord 是否會跳出訊息
app.get('/test-discord', async (req, res) => {
    await sendDiscordNotification("🚨 **[測試訊息]** 機器人連線成功！Discord Webhook 運作正常！");
    res.send("已嘗試發送 Discord 測試訊息，請檢查頻道！");
});

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

// 背景定時檢查
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

        if (now > displayRespawnTime) {
            const diffTime = now - displayRespawnTime;
            const overdueCount = Math.floor(diffTime / intervalMs) + 1;
            displayRespawnTime += overdueCount * intervalMs;
        }

        const diff = displayRespawnTime - now;

        // 當剩餘時間在 50 秒到 60 秒之間時觸發
        if (diff <= 60000 && diff > 50000) {
            if (!notifiedOneMin[name] || notifiedOneMin[name] !== displayRespawnTime) {
                notifiedOneMin[name] = displayRespawnTime;
                const respawnDate = new Date(displayRespawnTime);
                const timeStr = `${String(respawnDate.getHours()).padStart(2, '0')}:${String(respawnDate.getMinutes()).padStart(2, '0')}:${String(respawnDate.getSeconds()).padStart(2, '0')}`;
                
                sendDiscordNotification(`🚨 **[天堂M 王表通知]** 警告！**${name}** 將於 1 分鐘後（${timeStr}）重生，請血盟成員準備集合！`);
            }
        }
    }
}, 5000);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});