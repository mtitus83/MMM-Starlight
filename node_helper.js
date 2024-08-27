var NodeHelper = require("node_helper");
var axios = require("axios");
var cheerio = require("cheerio");
const fs = require('fs').promises;
const path = require('path');

module.exports = NodeHelper.create({
    start: async function() {
        console.log("Starting node helper for: " + this.name);
        this.cacheDir = path.join(__dirname, 'cache');
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
        } catch (error) {
            console.error("Error creating cache directory:", error);
        }
        await this.initializeCache();
        this.requestQueue = [];
        this.isProcessingQueue = false;
        this.debug = true;

        this.settings = {
            updateInterval: 12 * 60 * 60 * 1000, // 12 hours
            cacheDuration: 11 * 60 * 60 * 1000, // 11 hours
            maxConcurrentRequests: 2,
            retryDelay: 5 * 60 * 1000, // 5 minutes
            maxRetries: 3
        };

        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            this.sendSocketNotification("ERROR", {
                type: "Unhandled Rejection",
                message: reason.message || "Unknown error occurred"
            });
        });
        
        this.log("Node helper initialized");
    },

    log: function(message) {
        if (this.debug) {
            console.log(`[MMM-SunSigns] ${message}`);
        }
    },

    initializeCache: async function() {
        this.cache = {};
        const cacheFile = path.join(this.cacheDir, 'horoscope_cache.json');
        try {
            const data = await fs.readFile(cacheFile, 'utf8');
            this.cache = JSON.parse(data);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error("Error reading cache file:", error);
            }
            this.cache = {};
        }
    },

    saveCache: async function() {
        const cacheFile = path.join(this.cacheDir, 'horoscope_cache.json');
        try {
            await fs.writeFile(cacheFile, JSON.stringify(this.cache), 'utf8');
        } catch (error) {
            console.error("Error writing cache file:", error);
        }
    },

    socketNotificationReceived: function(notification, payload) {
        this.log(`Received socket notification: ${notification}`);
        if (notification === "UPDATE_HOROSCOPES") {
            this.log("Received UPDATE_HOROSCOPES notification");
            this.log(`Payload: ${JSON.stringify(payload)}`);
            this.queueHoroscopeUpdates(payload.zodiacSigns, payload.periods, payload.signWaitTime, payload.pauseDuration, payload.scrollSpeed);
        }
    },

    queueHoroscopeUpdates: function(signs, periods, signWaitTime, pauseDuration, scrollSpeed) {
        this.log(`Queueing updates for signs: ${signs.join(', ')} and periods: ${periods.join(', ')}`);
        signs.forEach(sign => {
            periods.forEach(period => {
                this.requestQueue.push({ sign, period });
            });
        });
        this.log(`Queue size after adding requests: ${this.requestQueue.length}`);
        this.processQueue(signWaitTime, pauseDuration, scrollSpeed).catch(error => {
            console.error("Error in queueHoroscopeUpdates:", error);
            this.sendSocketNotification("ERROR", {
                type: "Queue Processing Error",
                message: error.message
            });
        });
    },

    processQueue: async function(signWaitTime, pauseDuration, scrollSpeed) {
        if (this.isProcessingQueue) {
            this.log("Queue is already being processed");
            return;
        }
        this.isProcessingQueue = true;
        this.log("Starting to process queue");

        try {
            while (this.requestQueue.length > 0) {
                const batch = this.requestQueue.splice(0, this.settings.maxConcurrentRequests);
                this.log(`Processing batch of ${batch.length} requests`);

                const promises = batch.map(item => this.getHoroscope(item).catch(error => ({
                    error,
                    sign: item.sign,
                    period: item.period
                })));

                const results = await Promise.all(promises);

                results.forEach(result => {
                    if (result.error) {
                        this.log(`Error fetching horoscope for ${result.sign}, ${result.period}: ${result.error.message}`);
                        this.sendSocketNotification("HOROSCOPE_RESULT", {
                            success: false,
                            sign: result.sign,
                            period: result.period,
                            message: result.error.message
                        });
                    } else {
                        this.log(`Successfully fetched horoscope for ${result.sign}, ${result.period}`);
                        this.sendSocketNotification("HOROSCOPE_RESULT", {
                            success: true,
                            sign: result.sign,
                            period: result.period,
                            data: result.data,
                            cached: result.cached,
                            signWaitTime: signWaitTime,
                            pauseDuration: pauseDuration,
                            scrollSpeed: scrollSpeed
                        });
                    }
                });

                if (this.requestQueue.length > 0) {
                    this.log("Waiting before processing next batch");
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        } catch (error) {
            console.error("Unexpected error in processQueue:", error);
            this.sendSocketNotification("ERROR", {
                type: "Queue Processing Error",
                message: error.message
            });
        } finally {
            this.isProcessingQueue = false;
            this.log("Queue processing complete");
        }
    },

    getHoroscope: async function(config) {
        const cacheKey = `${config.sign}_${config.period}`;
        const cachedData = this.cache[cacheKey];

        if (cachedData && (Date.now() - cachedData.timestamp < this.settings.cacheDuration)) {
            this.log(`Returning cached horoscope for ${config.sign}, period: ${config.period}`);
            return { ...cachedData.data, sign: config.sign, period: config.period, cached: true };
        }

        this.log(`Fetching new horoscope for ${config.sign}, period: ${config.period}`);
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
                    const result = { data: horoscope, sign: config.sign, period: config.period, cached: false };
                    this.cache[cacheKey] = {
                        data: result,
                        timestamp: Date.now()
                    };
                    await this.saveCache();
                    return result;
                } else {
                    throw new Error("Horoscope content not found");
                }
            } catch (error) {
                console.error(`${this.name}: Error fetching horoscope for ${config.sign}, ${config.period}:`, error.message);
                retries++;
                if (retries < this.settings.maxRetries) {
                    this.log(`Retrying in ${this.settings.retryDelay / 1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, this.settings.retryDelay));
                } else {
                    throw new Error(`Max retries reached. Unable to fetch horoscope for ${config.sign}, ${config.period}`);
                }
            }
        }
    }
});
