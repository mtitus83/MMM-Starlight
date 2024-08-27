var NodeHelper = require("node_helper");
var axios = require("axios");
var cheerio = require("cheerio");
const fs = require('fs');
const path = require('path');

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node helper for: " + this.name);
        this.cacheDir = path.join(__dirname, 'cache');
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir);
        }
        this.initializeCache();
        this.requestQueue = [];
        this.isProcessingQueue = false;
        
        // Non-configurable settings
        this.settings = {
            updateInterval: 12 * 60 * 60 * 1000, // 12 hours
            cacheDuration: 11 * 60 * 60 * 1000, // 11 hours
            maxConcurrentRequests: 2,
            retryDelay: 5 * 60 * 1000, // 5 minutes
            maxRetries: 3
        };
    },

    initializeCache: function() {
        this.cache = {};
        const cacheFile = path.join(this.cacheDir, 'horoscope_cache.json');
        if (fs.existsSync(cacheFile)) {
            const data = fs.readFileSync(cacheFile, 'utf8');
            this.cache = JSON.parse(data);
        }
    },

    saveCache: function() {
        const cacheFile = path.join(this.cacheDir, 'horoscope_cache.json');
        fs.writeFileSync(cacheFile, JSON.stringify(this.cache), 'utf8');
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "UPDATE_HOROSCOPES") {
            this.queueHoroscopeUpdates(payload.zodiacSigns, payload.periods);
        }
    },

    queueHoroscopeUpdates: function(signs, periods) {
        signs.forEach(sign => {
            periods.forEach(period => {
                this.requestQueue.push({ sign, period });
            });
        });
        this.processQueue();
    },

    processQueue: function() {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;

        const processNext = () => {
            if (this.requestQueue.length === 0) {
                this.isProcessingQueue = false;
                return;
            }

            const { sign, period } = this.requestQueue.shift();
            this.getHoroscope({ sign, period })
                .then(horoscope => {
                    this.sendSocketNotification("HOROSCOPE_RESULT", {
                        success: true,
                        sign: sign,
                        period: period,
                        data: horoscope
                    });
                })
                .catch(error => {
                    console.error(`Error fetching horoscope for ${sign}, ${period}:`, error);
                    this.sendSocketNotification("HOROSCOPE_RESULT", {
                        success: false,
                        sign: sign,
                        period: period,
                        message: error.message
                    });
                })
                .finally(() => {
                    setTimeout(processNext, 5000); // 5-second delay between requests
                });
        };

        for (let i = 0; i < this.settings.maxConcurrentRequests; i++) {
            processNext();
        }
    },

    getHoroscope: async function(config) {
        const cacheKey = `${config.sign}_${config.period}`;
        const cachedData = this.cache[cacheKey];

        if (cachedData && (Date.now() - cachedData.timestamp < this.settings.cacheDuration)) {
            console.log(`${this.name}: Returning cached horoscope for ${config.sign}, period: ${config.period}`);
            return cachedData.data;
        }

        console.log(`${this.name}: Fetching new horoscope for ${config.sign}, period: ${config.period}`);
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

        let retries = 0;
        while (retries < this.settings.maxRetries) {
            try {
                const response = await axios.get(url, { timeout: 30000 });
                const $ = cheerio.load(response.data);
                const horoscope = $('.horoscope-content p').text().trim();

                if (horoscope) {
                    this.cache[cacheKey] = {
                        data: horoscope,
                        timestamp: Date.now()
                    };
                    this.saveCache();
                    return horoscope;
                } else {
                    throw new Error("Horoscope content not found");
                }
            } catch (error) {
                console.error(`${this.name}: Error fetching horoscope for ${config.sign}, ${config.period}:`, error.message);
                retries++;
                if (retries < this.settings.maxRetries) {
                    console.log(`${this.name}: Retrying in ${this.settings.retryDelay / 1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, this.settings.retryDelay));
                } else {
                    throw new Error(`Max retries reached. Unable to fetch horoscope for ${config.sign}, ${config.period}`);
                }
            }
        }
    }
});
