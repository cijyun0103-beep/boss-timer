app.post('/api/bosses', async (req, res) => {
    if (req.body && req.body.states) {
        loadData();
        const oldStates = { ...bossStates };
        const incomingStates = req.body.states;
        
        // 確保機器人準備好時能夠抓到頻道
        let channel = client.channels.cache.get(TARGET_CHANNEL_ID);
        if (!channel && client.isReady()) {
            try {
                channel = await client.channels.fetch(TARGET_CHANNEL_ID);
            } catch (e) {
                console.log("無法取得 Discord 頻道:", e);
            }
        }

        for (const [bossName, newRespawnTime] of Object.entries(incomingStates)) {
            if (newRespawnTime && newRespawnTime !== oldStates[bossName]) {
                const intervalMs = (bossIntervals[bossName] || 240) * 60000;
                const killTimeMs = newRespawnTime - intervalMs;

                bossStates[bossName] = newRespawnTime;
                notifiedOneMin[bossName] = false;
                saveData();

                if (channel) {
                    await sendKillNotification(channel, bossName, killTimeMs, newRespawnTime);
                } else {
                    console.log("找不到指定的 Discord 頻道 ID:", TARGET_CHANNEL_ID);
                }
            }
        }

        res.json({ success: true, bossStates });
    } else {
        res.status(400).json({ success: false, error: 'Invalid data' });
    }
});