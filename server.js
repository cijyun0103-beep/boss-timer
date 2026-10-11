const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

// 監聽 KB 指令：顯示 Boss 列表與對應的擊殺按鈕
if (cmd === 'KB') {
    const now = Date.now();
    const embeds = [];
    const components = [];

    // 為每一隻王建立一個獨立的 Embed 區塊與紅色擊殺按鈕
    bossList.forEach((boss, index) => {
        const respawnTime = global.bossStates && global.bossStates[boss.name];
        let timeStr = "尚未登記";

        if (respawnTime && respawnTime > 0) {
            const date = new Date(respawnTime);
            timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
        }

        // 建立類似截圖的 Embed 樣式
        const embed = new EmbedBuilder()
            .setColor(0x3b82f6)
            .setDescription(`**[天堂M] ${boss.name}**\n重生時間: ${timeStr} (Asia/Taipei)`);

        embeds.push(embed);

        // 每隻王下方帶有一顆紅色的「擊殺」按鈕
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`kill_${boss.name}`)
                .setLabel('擊殺')
                .setStyle(ButtonStyle.Danger) // 紅色按鈕
        );
        components.push(row);
    });

    // 由於 Discord 單則訊息最多帶 10 個 embeds，這裡可以一次發送或分批發送
    // 為了排版整齊，可以將清單整合或分則發送。這裡示範將全部 Embed 與按鈕組合發送：
    return message.reply({ embeds: embeds.slice(0, 10), components: components.slice(0, 5) });
}