var NodeHelper = require("node_helper");
var axios = require("axios");
var cheerio = require("cheerio");

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
        
        // Base64 encoded URL parts
        const baseUrlEncoded = "aHR0cHM6Ly93d3cuc3Vuc2lnbnMuY29tL2hvcm9zY29wZXM=";
        const dailyEncoded = "ZGFpbHk="; // daily
        const yearlyEncoded = "eWVhcmx5"; // yearly
        const tomorrowEncoded = "dG9tb3Jyb3c="; // tomorrow
    
        // Decode base64 strings
        const baseUrl = Buffer.from(baseUrlEncoded, 'base64').toString('ascii');
        const daily = Buffer.from(dailyEncoded, 'base64').toString('ascii');
        const yearly = Buffer.from(yearlyEncoded, 'base64').toString('ascii');
        const tomorrow = Buffer.from(tomorrowEncoded, 'base64').toString('ascii');
    
        let url;
    
        if (config.period === tomorrow) {
            url = `${baseUrl}/${daily}/${config.sign}/${tomorrow}`;
        } else if (config.period === yearly) {
            const currentYear = new Date().getFullYear();
            url = `${baseUrl}/${yearly}/${currentYear}/${config.sign}`;
        } else {
            url = `${baseUrl}/${config.period}/${config.sign}`;
        }
    
        console.log(this.name + ": Fetching horoscope from source");
    
        try {
            const response = await axios.get(url, { timeout: this.requestTimeout });
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
                console.log(`${this.name}: No horoscope content available for ${config.sign}, period: ${config.period}`);
                this.sendSocketNotification("HOROSCOPE_RESULT", {
                    success: false,
                    message: "Horoscope content not available",
                    sign: config.sign,
                    period: config.period
                });
            }
        } catch (error) {
            console.error(`${this.name}: Error in getHoroscope:`, error.message);
            await this.handleHoroscopeError(error, config);
        }
    },

    handleHoroscopeError: async function(error, config) {
        console.log(`${this.name}: handleHoroscopeError called for ${config.sign}`);
        this.retryCount[config.sign] = (this.retryCount[config.sign] || 0) + 1;
        console.error(this.name + ": Error fetching horoscope for " + config.sign + ":", error.message);
        
        if (this.retryCount[config.sign] <= this.maxRetries) {
            console.log(this.name + `: Retry attempt ${this.retryCount[config.sign]} of ${this.maxRetries} in ${this.retryDelay / 1000} seconds for ${config.sign}`);
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
