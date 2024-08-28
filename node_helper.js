var NodeHelper = require("node_helper");
var axios = require("axios");
var cheerio = require("cheerio");
const fs = require('fs').promises;
const path = require('path');

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node helper for: " + this.name);
        this.cacheDir = path.join(__dirname, 'cache');
        this.imageCacheDir = path.join(this.cacheDir, 'images');
        this.cache = {};
        this.requestQueue = [];
        this.isProcessingQueue = false;
        this.debug = true;
        this.lastUpdateCheck = null;
        this.updateWindowStart = null;
        this.updateAttempts = 0;

        this.settings = {
            cacheDuration: 24 * 60 * 60 * 1000, // 24 hours
            maxConcurrentRequests: 2,
            retryDelay: 5 * 60 * 1000, // 5 minutes
            maxRetries: 3,
            updateWindowStartHour: 1, // 1 AM
            updateWindowDuration: 6 * 60 * 60 * 1000, // 6 hours
            maxUpdateAttempts: 6
        };

        this.initialize();
    },

    initialize: async function() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
            await fs.mkdir(this.imageCacheDir, { recursive: true });
            this.log("Cache directories created successfully");
        } catch (error) {
            this.log("Error creating cache directories: " + error, "error");
        }

        await this.initializeCache();

        process.on('unhandledRejection', (reason, promise) => {
            this.log('Unhandled Rejection at: ' + promise + ' reason: ' + reason, "error");
            this.sendSocketNotification("ERROR", {
                type: "Unhandled Rejection",
                message: reason.message || "Unknown error occurred"
            });
        });

        this.log("Node helper initialized");
        this.scheduleUpdateWindow();
    },

    log: function(message, level = "info") {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${this.name}] [${level.toUpperCase()}] ${message}`;
        
        console.log(logMessage);
        
        // You could also implement file logging here if desired
    },

    initializeCache: async function() {
        const cacheFile = path.join(this.cacheDir, 'horoscope_cache.json');
        try {
            const data = await fs.readFile(cacheFile, 'utf8');
            this.cache = JSON.parse(data);
            this.log("Cache initialized successfully");
        } catch (error) {
            if (error.code !== 'ENOENT') {
                this.log("Error reading cache file: " + error, "error");
            } else {
                this.log("No existing cache file found. Starting with empty cache.");
            }
            this.cache = {};
        }
    },

    saveCache: async function() {
        const cacheFile = path.join(this.cacheDir, 'horoscope_cache.json');
        try {
            await fs.writeFile(cacheFile, JSON.stringify(this.cache), 'utf8');
            this.log("Cache saved successfully");
        } catch (error) {
            this.log("Error writing cache file: " + error, "error");
        }
    },

    socketNotificationReceived: function(notification, payload) {
        this.log(`Received socket notification: ${notification}`);
        if (notification === "UPDATE_HOROSCOPES") {
            this.log("Received UPDATE_HOROSCOPES notification");
            this.log(`Payload: ${JSON.stringify(payload)}`);
            this.queueHoroscopeUpdates(payload.zodiacSigns, payload.periods);
        }
    },

    queueHoroscopeUpdates: function(signs, periods) {
        this.log(`Queueing updates for signs: ${signs.join(', ')} and periods: ${periods.join(', ')}`);
        signs.forEach(sign => {
            periods.forEach(period => {
                this.requestQueue.push({ sign, period });
            });
        });
        this.log(`Queue size after adding requests: ${this.requestQueue.length}`);
        this.processQueue().catch(error => {
            this.log("Error in queueHoroscopeUpdates: " + error, "error");
            this.sendSocketNotification("ERROR", {
                type: "Queue Processing Error",
                message: error.message
            });
        });
    },

    processQueue: async function() {
        if (this.isProcessingQueue) {
            this.log("Queue is already being processed");
            return;
        }
        this.isProcessingQueue = true;
        this.log("Starting to process queue");

        const now = new Date();
        if (!this.lastUpdateCheck || this.lastUpdateCheck.getDate() !== now.getDate()) {
            this.swapTomorrowToDaily();
            this.scheduleUpdateWindow();
        }

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
                        this.log(`Error fetching horoscope for ${result.sign}, ${result.period}: ${result.error.message}`, "error");
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
                            imagePath: result.imagePath
                        });
                    }
                });

                if (this.requestQueue.length > 0) {
                    this.log("Waiting before processing next batch");
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        } catch (error) {
            this.log("Unexpected error in processQueue: " + error, "error");
            this.sendSocketNotification("ERROR", {
                type: "Queue Processing Error",
                message: error.message
            });
        } finally {
            this.isProcessingQueue = false;
            this.log("Queue processing complete");
        }
    },

    swapTomorrowToDaily: function() {
        this.log("Swapping tomorrow's horoscopes to daily");
        for (let sign in this.cache) {
            if (this.cache[sign] && this.cache[sign]['tomorrow']) {
                this.cache[sign]['daily'] = this.cache[sign]['tomorrow'];
                delete this.cache[sign]['tomorrow'];
            }
        }
        this.saveCache();
    },

    scheduleUpdateWindow: function() {
        const now = new Date();
        const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), this.settings.updateWindowStartHour, 0, 0, 0);
        if (now > startTime) {
            startTime.setDate(startTime.getDate() + 1);
        }
        const msUntilStart = startTime.getTime() - now.getTime();
        
        this.updateWindowStart = null;
        this.updateAttempts = 0;
        
        setTimeout(() => this.startUpdateWindow(), msUntilStart);
        this.log(`Scheduled update window to start in ${msUntilStart / 3600000} hours`);
    },

    startUpdateWindow: function() {
        this.updateWindowStart = new Date();
        this.log("Starting update window", "info");
        this.performUpdateCheck();
    },

    performUpdateCheck: async function() {
        this.log(`Performing update check. Attempt ${this.updateAttempts + 1} of ${this.settings.maxUpdateAttempts}`, "info");
        let updatesFound = false;

        for (let sign in this.cache) {
            try {
                this.log(`Checking for updates for ${sign}`, "debug");
                const newTomorrowHoroscope = await this.fetchHoroscope(sign, 'tomorrow');
                if (this.isNewContent(sign, newTomorrowHoroscope)) {
                    this.log(`New content found for ${sign}, updating cache`, "info");
                    this.updateCache(sign, 'tomorrow', newTomorrowHoroscope);
                    updatesFound = true;
                } else {
                    this.log(`No new content found for ${sign}`, "debug");
                }
            } catch (error) {
                this.log(`Error checking update for ${sign}: ${error.message}`, "error");
            }
        }

        if (updatesFound) {
            this.log("Updates found and applied", "info");
            this.sendSocketNotification("HOROSCOPES_UPDATED", {});
            this.lastUpdateCheck = new Date();
            this.scheduleUpdateWindow(); // Schedule next day's window
        } else {
            this.updateAttempts++;
            if (this.updateAttempts < this.settings.maxUpdateAttempts && 
                (new Date() - this.updateWindowStart) < this.settings.updateWindowDuration) {
                // Schedule next check with increasing interval
                const nextCheckDelay = Math.min(
                    30 * 60 * 1000 * Math.pow(2, this.updateAttempts - 1), // Start at 30 minutes, then 60, 120, etc.
                    this.settings.updateWindowDuration - (new Date() - this.updateWindowStart)
                );
                this.log(`No updates found. Next check in ${nextCheckDelay / 60000} minutes`, "info");
                setTimeout(() => this.performUpdateCheck(), nextCheckDelay);
            } else {
                this.log("Update window closed without finding updates", "warn");
                this.sendSocketNotification("UPDATE_WINDOW_EXPIRED", {
                    message: "Update window expired without finding new content",
                    lastUpdateCheck: this.lastUpdateCheck,
                    attempts: this.updateAttempts
                });
                this.lastUpdateCheck = new Date();
                this.scheduleUpdateWindow(); // Schedule next day's window
            }
        }
    },

    isNewContent: function(sign, newHoroscope) {
        const currentDaily = this.cache[sign]?.['daily']?.data;
        const currentTomorrow = this.cache[sign]?.['tomorrow']?.data;
        return newHoroscope !== currentDaily && newHoroscope !== currentTomorrow;
    },

    fetchHoroscope: async function(sign, period) {
        const url = `https://www.sunsigns.com/horoscopes/${period === 'tomorrow' ? 'daily/' + sign + '/tomorrow' : period + '/' + sign}`;
        this.log(`Fetching horoscope for ${sign} (${period}) from ${url}`, "debug");
        const response = await axios.get(url, { timeout: 30000 });
        const $ = cheerio.load(response.data);
        const horoscope = $('.horoscope-content p').text().trim();
        this.log(`Fetched horoscope for ${sign} (${period}). Length: ${horoscope.length} characters`, "debug");
        return horoscope;
    },

    getHoroscope: async function(config) {
        const cacheKey = `${config.sign}_${config.period}`;
        const cachedData = this.cache[cacheKey];

        if (cachedData && (Date.now() - cachedData.timestamp < this.settings.cacheDuration)) {
            this.log(`Returning cached horoscope for ${config.sign}, period: ${config.period}`);
            const imageUrl = `https://www.sunsigns.com/wp-content/themes/sunsigns/assets/images/_sun-signs/${config.sign}/wrappable.png`;
            const imagePath = await this.cacheImage(imageUrl, config.sign);
            return { ...cachedData.data, sign: config.sign, period: config.period, cached: true, imagePath: imagePath };
        }

        this.log(`Fetching new horoscope for ${config.sign}, period: ${config.period}`);
        try {
            const horoscope = await this.fetchHoroscope(config.sign, config.period);
            const imageUrl = `https://www.sunsigns.com/wp-content/themes/sunsigns/assets/images/_sun-signs/${config.sign}/wrappable.png`;
            const imagePath = await this.cacheImage(imageUrl, config.sign);

            const result = { 
                data: horoscope, 
                sign: config.sign, 
                period: config.period, 
                cached: false,
                imagePath: imagePath
            };
            this.updateCache(config.sign, config.period, result);
            return result;
        } catch (error) {
            this.log(`Error fetching horoscope for ${config.sign}, ${config.period}: ${error.message}`, "error");
            throw error;
        }
    },

    updateCache: function(sign, period, content) {
        if (!this.cache[sign]) {
            this.cache[sign] = {};
        }
        this.cache[sign][period] = {
            data: content,
            timestamp: Date.now()
        };
        this.log(`Updated cache for ${sign} (${period})`, "debug");
        this.saveCache();
    },

    cacheImage: async function(imageUrl, sign) {
        const imagePath = path.join(this.imageCacheDir, `${sign}.png`);

        try {
            // Check if image already exists
            await fs.access(imagePath);
            this.log(`Image for ${sign} already cached at ${imagePath}`, "debug");
            return path.relative(__dirname, imagePath);
        } catch (error) {
            // Image doesn't exist, download it
            this.log(`Attempting to download image for ${sign} from ${imageUrl}`, "debug");
            try {
                const response = await axios({
                    url: imageUrl,
                    method: 'GET',
                    responseType: 'arraybuffer'
                });
                await fs.writeFile(imagePath, response.data);
                this.log(`Image successfully cached for ${sign} at ${imagePath}`, "debug");
                return path.relative(__dirname, imagePath);
            } catch (error) {
                this.log(`Error caching image for ${sign}: ${error}`, "error");
                if (error.response) {
                    this.log(`Status: ${error.response.status}`, "error");
                    this.log(`Headers: ${JSON.stringify(error.response.headers)}`, "error");
                }
                return null;
            }
        }
    }
});
