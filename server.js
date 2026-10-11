const express = require('express');
const cors = require('cors');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let bossStates = {};
let notifiedOneMin = {};

const bossIntervals = {
    "死亡騎士": 240,
    "將軍": 360,
    "古代巨人": 510,
    "不死鳥": 480,
    "克特": 600
};

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID || '1556240665027936377';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

client.once('clientReady', () => {
    console.log(`Discord 機器人已成功登入: ${client.user.tag}`);
});

// 監聽 Discord 上的表情符號反應（改為監聽 💩）
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();

    const message = reaction.message;
    if (message.author.id === client.user.id && message.embeds.length > 0) {
        const embed = message.embeds[0];
        
        for (const bossName of Object.keys(bossIntervals)) {
            if (embed.description && embed.description.includes(bossName)) {
                // 點擊 💩 觸發擊殺登記
                if (reaction.emoji.name === '💩') {
                    const now = new Date();
                    const killTimeMs = now.getTime(); // 記錄擊殺當下時間
                    const intervalMs = bossIntervals[bossName] * 60000;
                    const respawnTimeMs = killTimeMs + intervalMs; // 計算重生時間

                    bossStates[bossName] = respawnTimeMs;
                    notifiedOneMin[bossName] = false;

                    const killDate = new Date(killTimeMs);
                    const killTimeStr = `${String(killDate.getHours()).padStart(2, '0')}:${String(killDate.getMinutes()).padStart(2, '0')}:${String(killDate.getSeconds()).padStart(2, '0')}`;

                    const respawnDate = new Date(respawnTimeMs);
                    const respawnTimeStr = `${String(respawnDate.getHours()).padStart(2, '0')}:${String(respawnDate.getMinutes()).padStart(2, '0')}:${String(respawnDate.getSeconds()).padStart(2, '0')}`;

                    // 同時顯示擊殺時間與重生時間
                    await message.channel.send(`【**${bossName}**】於 **${killTimeStr}** 被擊殺！預計於 **${respawnTimeStr}** 重生。`);
                }
            }
        }
    }
});

if (DISCORD_BOT_TOKEN) {
    client.login(DISCORD_BOT_TOKEN).catch(err => console.log("Discord 登入失敗:", err));
}

// API 路由
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

app.post('/api/reset', (req, res) => {
    bossStates = {};
    notifiedOneMin = {};
    res.json({ success: true, bossStates });
});

// 背景定時檢查：當王倒數剩 1 分鐘時發送通報並自動掛上 💩
setInterval(async () => {
    if (!client.isReady()) return;
    const channel = client.channels.cache.get(TARGET_CHANNEL_ID);
    if (!channel) return;

    const now = new Date().getTime();

    for (const [name, respawnTimeMs] of Object.entries(bossStates)) {
        if (!respawnTimeMs) continue;
        const intervalMs = bossIntervals[name] * 60000;
        let displayRespawnTime = respawnTimeMs;

        if (now > displayRespawnTime) {
            const diffTime = now - displayRespawnTime;
            const overdueCount = Math.floor(diffTime / intervalMs) + 1;
            displayRespawnTime += overdueCount * intervalMs;
        }

        const diff = displayRespawnTime - now;

        if (diff <= 60000 && diff > 50000) {
            if (!notifiedOneMin[name] || notifiedOneMin[name] !== displayRespawnTime) {
                notifiedOneMin[name] = displayRespawnTime;
                const respawnDate = new Date(displayRespawnTime);
                const timeStr = `${String(respawnDate.getHours()).padStart(2, '0')}:${String(respawnDate.getMinutes()).padStart(2, '0')}:${String(respawnDate.getSeconds()).padStart(2, '0')}`;

                const embed = new EmbedBuilder()
                    .setColor('#ef4444')
                    .setTitle('🚨 【重要快訊】')
                    .setDescription(`【**${name}**】將於 **1 分鐘內**（${timeStr}）重生，請點擊下方 💩 反應來記錄擊殺！`)
                    .setTimestamp();

                const sentMsg = await channel.send({ embeds: [embed] }).catch(err => console.log("發送失敗:", err));
                if (sentMsg) {
                    await sentMsg.react('💩'); // 自動幫訊息貼上 💩 圖示
                }
            }
        }
    }
}, 5000);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});