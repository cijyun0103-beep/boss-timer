const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let bossStates = {};

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
        console.log(`[Discord 回應] 狀態碼: ${response.status}, 內容: ${responseText}`);
    } catch (err) {
        console.log("[Discord 錯誤]:", err);
    }
}

app.get('/api/bosses', (req, res) => {
    res.json({ bossStates });
});

app.post('/api/bosses', (req, res) => {
    if (req.body && req.body.states) {
        bossStates = req.body.states;
        res.json({ success: true, bossStates });
    } else {
        res.status(400).json({ success: false, error: 'Invalid data' });
    }
});

// 💡 接收前端傳來的 Discord 警報並轉發
app.post('/api/discord-alert', async (req, res) => {
    const { message } = req.body;
    if (message) {
        await sendDiscordNotification(message);
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, error: 'Missing message' });
    }
});

app.post('/api/reset', (req, res) => {
    bossStates = {};
    res.json({ success: true, bossStates });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});