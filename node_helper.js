var NodeHelper = require("node_helper");
var axios = require("axios");
var cheerio = require("cheerio");

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node helper for: " + this.name);
        this.retryCount = {};

        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            this.sendSocketNotification("UNHANDLED_ERROR", {
                message: "An unexpected error occurred in the node helper.",
                error: reason.toString()
            });
        });
    },

    getHoroscope: async function(config) {
        console.log(`${this.name}: getHoroscope called for ${config.sign}, period: ${config.period}`);
        let baseUrl = 'https://www.sunsigns.com/horoscopes';
        let url;

        if (config.period === 'tomorrow') {
            url = `${baseUrl}/daily/${config.sign}/tomorrow`;
        } else if (config.period === 'yearly') {
            const currentYear = new Date().getFullYear();
            url = `${baseUrl}/yearly/${currentYear}/${config.sign}`;
        } else {
            url = `${baseUrl}/${config.period}/${config.sign}`;
        }

        console.log(this.name + ": Fetching horoscope from " + url);

        try {
            const response = await axios.get(url, { timeout: config.timeout });
            const $ = cheerio.load(response.data);
            const horoscope = $('.horoscope-content p').text().trim();
            
            if (horoscope) {
                this.retryCount[config.sign] = 0;
                this.sendSocketNotification("HOROSCOPE_RESULT", {
                    success: true,
                    data: horoscope,
                    sign: config.sign,
                    period: config.period
                });
            } else {
                throw new Error("Horoscope content not found");
            }
        } catch (error) {
            console.error(`${this.name}: Error in getHoroscope:`, error);
            await this.handleHoroscopeError(error, config);
        }
    },

    handleHoroscopeError: async function(error, config) {
        console.log(`${this.name}: handleHoroscopeError called for ${config.sign}`);
        this.retryCount[config.sign] = (this.retryCount[config.sign] || 0) + 1;
        console.error(this.name + ": Error fetching horoscope for " + config.sign + ":", error.message);
        
        if (this.retryCount[config.sign] <= config.maxRetries) {
            console.log(this.name + `: Retry attempt ${this.retryCount[config.sign]} of ${config.maxRetries} in ${config.retryDelay / 1000} seconds for ${config.sign}`);
            try {
                await new Promise(resolve => setTimeout(resolve, config.retryDelay));
                await this.getHoroscope(config);
            } catch (retryError) {
                console.error(`${this.name}: Error in retry for ${config.sign}:`, retryError);
                this.sendSocketNotification("HOROSCOPE_RESULT", { 
                    success: false, 
                    message: "Error in retry attempt for " + config.sign,
                    sign: config.sign,
                    period: config.period,
                    error: retryError.toString()
                });
            }
        } else {
            this.retryCount[config.sign] = 0;
            this.sendSocketNotification("HOROSCOPE_RESULT", { 
                success: false, 
                message: "Max retries reached. Unable to fetch horoscope for " + config.sign,
                sign: config.sign,
                period: config.period
            });
        }
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "GET_HOROSCOPE") {
            console.log(this.name + ": Received request to get horoscope for " + payload.sign + ", period: " + payload.period);
            this.getHoroscope(payload).catch(error => {
                console.error(this.name + ": Unhandled error in getHoroscope:", error);
                this.sendSocketNotification("HOROSCOPE_RESULT", { 
                    success: false, 
                    message: "An unexpected error occurred while fetching the horoscope.",
                    sign: payload.sign,
                    period: payload.period,
                    error: error.toString()
                });
            });
        }
    }
});
