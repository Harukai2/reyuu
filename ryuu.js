const fs = require('fs');
const path = require('path');
const axios = require('axios');
const login = require('./ryuu-chat-api/index.js');
const { convertToGothic } = require('./utils/fontUtils.js');
const cron = require('node-cron');
const autopost = require('./handler/autopost.js');
const gradient = require('gradient-string');
const { setupAutogreet } = require('./custom.js'); // Added reference to custom.js

const systemLog = (message) => {
    console.log(gradient.pastel(`[ SYSTEM ] ${message}`));
};

const logSeparator = (message) => {
    const separator = '—'.repeat(10);
    console.log(gradient.pastel(`${separator} ${message} ${separator}`));
};

global.config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
global.botname = config.botname;
global.prefix = global.config.prefix;
global.apiOptions = global.config.apiOptions;
global.adminBot = global.config.adminBot || [];
global.autoLoad = global.config.autoLoad ?? false;
global.autogreet = global.config.autogreet ?? false;
global.proxy = global.config.proxy;
global.owner = config.owner;
global.convertToGothic = convertToGothic;

global.modules = new Object({
    commands: new Map(),
    events: new Map(),
});

const loadFiles = async (directory, type) => {
    const files = fs.readdirSync(path.join(__dirname, directory)).filter(file => file.endsWith('.js'));
    logSeparator(`Deploying ${type.charAt(0).toUpperCase() + type.slice(1)}`);
    
    await Promise.all(files.map(async (file) => {
        try {
            const module = require(`./${directory}/${file}`);
            if (type === 'commands') {
                global.modules.commands.set(module.name, module);
                systemLog(`Command "${module.name}" successfully deployed.`);
            } else if (type === 'events') {
                global.modules.events.set(module.name, module);
                systemLog(`Event "${module.name}" successfully deployed.`);
            }
        } catch (error) {
            systemLog(`Failed to deploy ${file}: ${error.message}`);
        }
    }));
    
    logSeparator(`${type.charAt(0).toUpperCase() + type.slice(1)} Deployed`);
};

const reloadFiles = async (directory, type) => {
    logSeparator(`Reloading ${type.charAt(0).toUpperCase() + type.slice(1)}`);
    if (type === 'commands') {
        global.modules.commands.clear();
        await loadFiles('commands', 'commands');
    } else if (type === 'events') {
        global.modules.events.clear();
        await loadFiles('events', 'events');
    }
};

const watchFiles = (directory, type) => {
    fs.watch(path.join(__dirname, directory), (eventType, filename) => {
        if (filename && filename.endsWith('.js') && eventType === 'change') {
            reloadFiles(directory, type);
        }
    });
};

const initialize = async () => {
    systemLog(`Starting up ${global.botname}...`);
    systemLog("Deploying all variables...");

    await loadFiles('commands', 'commands');
    await loadFiles('events', 'events');

    if (global.autoLoad) {
        watchFiles('commands', 'commands');
        watchFiles('events', 'events');
    }
};

const startListening = (api) => {
    let lastMessageTimestamp = Date.now();

    // Reconnect logic and listen to MQTT events
    api.listenMqtt(async (err, event) => { // Made this function async
        if (err) {
            systemLog(`Error listening to MQTT: ${JSON.stringify(err, null, 2)}`);

            // Reconnect after a delay if disconnected
            setTimeout(() => {
                systemLog("Reconnecting to MQTT...");
                startListening(api);
            }, 10000);  // Reconnect after 10 seconds
            return;
        }

        // Update last message timestamp on receiving an event
        lastMessageTimestamp = Date.now();

        // Handle auto commands and events
        for (const [commandName, command] of global.modules.commands) {
            if (command.auto && command.autoActivate && command.autoActivate(event.body)) {
                try {
                    await command.execute(api, event, []); // Added await here since it's an async function
                } catch (error) {
                    systemLog(`Auto command execution error: ${error}`);
                }
                return;
            }
        }

        // Handle commands triggered by messages
        const message = event.body ?? "";
        const isPrefixed = message.startsWith(global.prefix);

        let commandName = "";
        let args = [];

        if (isPrefixed) {
            [commandName, ...args] = message.slice(global.prefix.length).trim().split(/ +/g);
        } else {
            [commandName, ...args] = message.trim().split(/ +/g);
        }

        const command = global.modules.commands.get(commandName) || global.modules.commands.get(commandName.toLowerCase());

        if (command) {
            if (isPrefixed && command.prefixRequired === false) {
                api.sendMessage(global.convertToGothic('This command does not require a prefix.'), event.threadID, event.messageID);
            } else if (!isPrefixed && command.prefixRequired === true) {
                api.sendMessage(global.convertToGothic('This command requires a prefix to start.'), event.threadID, event.messageID);
            } else if (command.adminOnly && !global.adminBot.includes(event.senderID)) {
                api.sendMessage(global.convertToGothic('Only bot admins have access to this command.'), event.threadID, event.messageID);
            } else {
                try {
                    await command.execute(api, event, args, global.modules.commands, api); // Fixed the error by wrapping await inside async
                } catch (error) {
                    systemLog(`Command execution error: ${error}`);
                }
            }
        } else if (isPrefixed) {
            api.sendMessage(global.convertToGothic(`The command "${commandName}" does not exist. Please type ${global.prefix}help to see the list of commands.`), event.threadID, event.messageID);
        }
    });

    // Periodic check to see if no messages have been received
    setInterval(() => {
        const timeSinceLastMessage = Date.now() - lastMessageTimestamp;
        
        if (timeSinceLastMessage > 2 * 60 * 60 * 1000) {  // 2 hours without messages
            systemLog("No messages received for 1 hour. Restarting connection...");
            process.exit(1);  // Optionally restart the process
        }
    }, 10 * 60 * 1000);  // Check every 10 minutes
};

const runBot = () => {
    systemLog("Checking appstate...");

    fs.readFile('appstate.json', 'utf8', (err, data) => {
        if (err) {
            systemLog(`Error reading appstate.json: ${err.message}`);
            return;
        }

        let appState;
        try {
            appState = JSON.parse(data);
        } catch (error) {
            systemLog(`Error parsing appstate.json: ${error.message}`);
            return;
        }
        
        const options = {
            appState: appState,
            ...global.proxy && { request: { proxy: global.proxy } }
        };

        systemLog("Attempting to log in...");

        login(options, (loginError, api) => {
            if (loginError) {
                systemLog(`Login error: ${loginError}`);
                return;
            }

            systemLog(`${global.botname} successfully logged in!`);
            api.setOptions(global.apiOptions);

            // Start listening to MQTT messages with reconnection logic
            startListening(api);

            // Set up autogreet if enabled
            if (global.autogreet) {
                setupAutogreet(api);
            }

            if (global.config.autopost) { 
                autopost.handleEvent({ api });
            }

            process.on('unhandledRejection', (err, p) => {
                systemLog(`Unhandled Rejection: ${err.message}`);
            });
        });
    });
};

(async () => {
    await initialize();
    runBot();
})();
