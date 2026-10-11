const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let bossStates = {};
let lastUpdatedAt = Date.now();

app.get('/api/bosses', (req, res) => {
    res.json({ bossStates, lastUpdatedAt });
});

app.post('/api/bosses', (req, res) => {
    const { states } = req.body;
    if (states && typeof states === 'object') {
        bossStates = states;
        lastUpdatedAt = Date.now();
        res.json({ success: true, lastUpdatedAt });
    } else {
        res.status(400).json({ success: false, message: "資料格式錯誤" });
    }
});

app.post('/api/reset', (req, res) => {
    bossStates = {};
    lastUpdatedAt = Date.now();
    res.json({ success: true, lastUpdatedAt });
});

app.listen(PORT, () => {
    console.log(`🚀 雲端伺服器已在 port ${PORT} 啟動`);
});