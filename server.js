const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let bossStates = {};

// 你的 Discord Webhook
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1558663969709883452/32kLWSD9jjvl-_ZTiUFfeosOoUE0lJJ5LRKeTVKXwP4Qyf-uqsWYlxzB5WnAlP3Z-fyK';

async function sendDiscordNotification(message) {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message })
        });
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

// 💡 接收來自前端的 Discord 警報請求
app.post('/api/discord-alert', async (req, res) => {
    const { message } = req.body;
    if (message) {
        await sendDiscordNotification(message);
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, error: 'Missing message' });
    }
});

// 全部重置
app.post('/api/reset', (req, res) => {
    bossStates = {};
    res.json({ success: true, bossStates });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});