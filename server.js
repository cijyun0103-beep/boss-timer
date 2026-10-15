app.post('/api/bosses', async (req, res) => {
    if (req.body && req.body.states) {
        loadData();
        const incomingStates = req.body.states;
        
        let channel = client.channels.cache.get(TARGET_CHANNEL_ID);
        if (!channel && client.isReady()) {
            try {
                channel = await client.channels.fetch(TARGET_CHANNEL_ID);
            } catch (e) {
                console.log("無法取得 Discord 頻道:", e);
            }
        }

        for (const [bossName, newRespawnTime] of Object.entries(incomingStates)) {
            if (newRespawnTime && newRespawnTime > 0) {
                const intervalMs = (bossIntervals[bossName] || 240) * 60000;
                const killTimeMs = newRespawnTime - intervalMs;

                // 檢查是否為新登記的時間（避免重複發送相同的擊殺）
                if (bossStates[bossName] !== newRespawnTime) {
                    bossStates[bossName] = newRespawnTime;
                    notifiedOneMin[bossName] = 0; // 重置 1 分鐘提醒鎖
                    saveData();

                    // 強制發送當下擊殺通知
                    if (channel) {
                        await sendKillNotification(channel, bossName, killTimeMs, newRespawnTime);
                    }
                }
            }
        }

        res.json({ success: true, bossStates });
    } else {
        res.status(400).json({ success: false, error: 'Invalid data' });
    }
});