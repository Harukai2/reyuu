const cron = require('node-cron');

const setupAutogreet = (api) => {
    cron.schedule('0 30 6 * * *', () => {
        api.getThreadList(30, null, ["INBOX"], (err, list) => {
            if (err) return console.log("ERR: " + err);
            list.forEach(now => (now.isGroup === true && now.threadID !== list.threadID) ? 
                api.sendMessage("Goodmorning everyone, time to eat breakfast!", now.threadID) : '');
        });
    }, {
        scheduled: true,
        timezone: "Asia/Manila"
    });

    cron.schedule('0 2 12 * * *', () => {
        api.getThreadList(30, null, ["INBOX"], (err, list) => {
            if (err) return console.log("ERR: " + err);
            list.forEach(now => (now.isGroup === true && now.threadID !== list.threadID) ? 
                api.sendMessage("It's already 12, kain naaaa", now.threadID) : '');
        });
    }, {
        scheduled: true,
        timezone: "Asia/Manila"
    });

    cron.schedule('0 2 20 * * *', () => {
        api.getThreadList(30, null, ["INBOX"], (err, list) => {
            if (err) return console.log("ERR: " + err);
            list.forEach(now => (now.isGroup === true && now.threadID !== list.threadID) ? 
                api.sendMessage("Goodevening humans, it's already 8pm, have you all eaten?", now.threadID) : '');
        });
    }, {
        scheduled: true,
        timezone: "Asia/Manila"
    });
};

module.exports = { setupAutogreet };
