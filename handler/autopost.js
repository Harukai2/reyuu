const axios = require('axios');

let isCronStarted = false;

module.exports.handleEvent = async function({ api }) {
    if (!isCronStarted) {
        startAutoPost(api);
        isCronStarted = true;
    }
};

function getRandomInterval() {
    const minHour = 1; // Minimum 1 hour
    const maxHour = 2.5; // Maximum 2 hours and 30 minutes
    const randomHours = Math.random() * (maxHour - minHour) + minHour;
    return randomHours * 60 * 60 * 1000; // Convert hours to milliseconds
}

async function autoPost(api) {
    try {
        const response = await axios.get("https://api.popcat.xyz/pickuplines");
        const pickupLine = response.data.pickupline;

        const message = global.convertToGothic(`"${pickupLine}"`);

        const formData = {
            input: {
                composer_entry_point: "inline_composer",
                composer_source_surface: "timeline",
                idempotence_token: `${Date.now()}_FEED`,
                source: "WWW",
                message: {
                    text: message,
                },
                audience: {
                    privacy: {
                        base_state: "EVERYONE",
                    },
                },
                actor_id: api.getCurrentUserID(),
            },
        };

        await api.httpPost(
            "https://www.facebook.com/api/graphql/",
            {
                av: api.getCurrentUserID(),
                fb_api_req_friendly_name: "ComposerStoryCreateMutation",
                fb_api_caller_class: "RelayModern",
                doc_id: "7711610262190099",
                variables: JSON.stringify(formData),
            }
        );
        console.log('Posted successfully!');

    } catch (error) {
        console.error("Error during auto-posting:", error);
    }

    // Schedule the next post with a random interval
    const randomInterval = getRandomInterval();
    console.log(`Next post in ${randomInterval / (60 * 60 * 1000)} hours`);
    setTimeout(() => autoPost(api), randomInterval);
}

function startAutoPost(api) {
    // Initial post after 1 hour
    const initialInterval = 1 * 60 * 60 * 1000; // 1 hour in milliseconds
    setTimeout(() => autoPost(api), initialInterval);
}
