var NodeHelper = require("node_helper");
var axios = require("axios");

module.exports = NodeHelper.create({
    requestTimeout: 30000, // 30 seconds
    retryDelay: 300000, // 5 minutes
    maxRetries: 5,

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
        
        let url;
        switch(config.period) {
            case "daily":
                url = `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${config.sign}&day=today`;
                break;
            case "tomorrow":
                url = `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${config.sign}&day=tomorrow`;
                break;
            case "weekly":
                url = `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/weekly?sign=${config.sign}`;
                break;
            case "monthly":
                url = `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/monthly?sign=${config.sign}`;
                break;
            default:
                this.sendSocketNotification("HOROSCOPE_RESULT", {
                    success: false,
                    message: "Invalid period specified",
                    sign: config.sign,
                    period: config.period
                });
                return;
        }

        console.log(this.name + ": Fetching horoscope from source");

        try {
            const response = await axios.get(url, { timeout: this.requestTimeout });
            if (response.data.success) {
                this.retryCount[config.sign] = 0;
                this.sendSocketNotification("HOROSCOPE_RESULT", {
                    success: true,
                    data: response.data.data,
                    sign: config.sign,
                    period: config.period
                });
            } else {
                throw new Error("API returned unsuccessful response");
            }
        } catch (error) {
            await this.handleHoroscopeError(error, config);
        }
    },

    handleHoroscopeError: async function(error, config) {
        console.error(`${this.name}: Error fetching horoscope for ${config.sign}:`, error.message);
        
        if (error.response) {
            console.error(`${this.name}: API responded with status:`, error.response.status);
            console.error(`${this.name}: API response data:`, error.response.data);
        } else if (error.request) {
            console.error(`${this.name}: No response received from API`);
        }

        this.retryCount[config.sign] = (this.retryCount[config.sign] || 0) + 1;
        
        if (this.retryCount[config.sign] <= this.maxRetries) {
            console.log(`${this.name}: Retry attempt ${this.retryCount[config.sign]} of ${this.maxRetries} in ${this.retryDelay / 1000} seconds for ${config.sign}`);
            try {
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
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
