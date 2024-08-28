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
        this.simulatedDate = null;

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
            console.log("Cache directories created successfully");
        } catch (error) {
            console.error("Error creating cache directories:", error);
        }

        await this.initializeCache();
        await this.checkCacheTimestamps();

        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            this.sendSocketNotification("ERROR", {
                type: "Unhandled Rejection",
                message: reason.message || "Unknown error occurred"
            });
        });

        this.log("Node helper initialized");
    },

    checkCacheTimestamps: async function() {
        this.log("Checking cache timestamps", "info");
        const currentDate = this.getCurrentDate();
        let updatesNeeded = false;

        for (let sign in this.cache) {
            for (let period of ['daily', 'tomorrow']) {
                if (this.cache[sign][period]) {
                    const cachedDate = new Date(this.cache[sign][period].timestamp);
                    if (!this.isSameDay(cachedDate, currentDate)) {
                        this.log(`Stale '${period}' data found for ${sign}. Updating...`, "warn");
                        if (period === 'tomorrow') {
                            // Move tomorrow's stale data to daily if it exists
                            if (this.cache[sign]['daily']) {
                                this.cache[sign]['daily'] = this.cache[sign]['tomorrow'];
                                this.cache[sign]['daily'].timestamp = currentDate.getTime();
                                this.log(`Updated 'daily' data for ${sign} with previous 'tomorrow' data`, "info");
                            }
                            delete this.cache[sign]['tomorrow'];
                        } else {
                            // For daily, just mark it for update
                            delete this.cache[sign]['daily'];
                        }
                        updatesNeeded = true;
                    }
                }
            }
        }

        if (updatesNeeded) {
            await this.saveCache();
            this.log("Cache updated due to stale timestamps", "info");
            // Trigger an update for the stale data
            this.updateHoroscopes();
        } else {
            this.log("All cache timestamps are current", "info");
        }
    },

    isSameDay: function(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    },

    updateHoroscopes: function() {
        this.lastUpdateAttempt = new Date().toLocaleString();
        this.log("Sending UPDATE_HOROSCOPES notification", "info");

        // Get all unique signs and periods from the cache
        const signs = new Set(Object.keys(this.cache));
        const periods = new Set();
        for (let sign in this.cache) {
            Object.keys(this.cache[sign]).forEach(period => periods.add(period));
        }

        this.sendSocketNotification("UPDATE_HOROSCOPES", {
            zodiacSigns: Array.from(signs),
            periods: Array.from(periods),
        });
    },

    log: function(message, level = "info") {
        const timestamp = this.getCurrentDate().toISOString();
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
                console.error("Error reading cache file:", error);
            } else {
                this.log("No existing cache file found. Starting with empty cache.");
            }
            this.cache = {};
        }
    },

    socketNotificationReceived: function(notification, payload) {
        this.log(`Received socket notification: ${notification}`);
        if (notification === "UPDATE_HOROSCOPES") {
            this.log("Received UPDATE_HOROSCOPES notification");
            this.log(`Payload: ${JSON.stringify(payload)}`);
            this.queueHoroscopeUpdates(payload.zodiacSigns, payload.periods);
        } else if (notification === "SET_SIMULATED_DATE") {
            this.setSimulatedDate(payload.date);
            this.scheduleUpdateWindow(); // Reschedule update window with new simulated date
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
            console.error("Error in queueHoroscopeUpdates:", error);
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

        const now = this.getCurrentDate();
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

    saveCache: async function() {
        const cacheFile = path.join(this.cacheDir, 'horoscope_cache.json');
        try {
            await fs.writeFile(cacheFile, JSON.stringify(this.cache), 'utf8');
            this.log("Cache saved successfully");
        } catch (error) {
            console.error("Error writing cache file:", error);
        }
    },

    scheduleUpdateWindow: function() {
        const now = this.getCurrentDate();
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
        this.updateWindowStart = this.getCurrentDate();
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
            this.lastUpdateCheck = this.getCurrentDate();
            this.scheduleUpdateWindow(); // Schedule next day's window
        } else {
            this.updateAttempts++;
            if (this.updateAttempts < this.settings.maxUpdateAttempts && 
                (this.getCurrentDate() - this.updateWindowStart) < this.settings.updateWindowDuration) {
                // Schedule next check with increasing interval
                const nextCheckDelay = Math.min(
                    30 * 60 * 1000 * Math.pow(2, this.updateAttempts - 1), // Start at 30 minutes, then 60, 120, etc.
                    this.settings.updateWindowDuration - (this.getCurrentDate() - this.updateWindowStart)
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
                this.lastUpdateCheck = this.getCurrentDate();
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
        if (!this.cache[config.sign]) {
            this.cache[config.sign] = {};
        }
        const cachedData = this.cache[config.sign][config.period];

        if (cachedData && this.isSameDay(new Date(cachedData.timestamp), this.getCurrentDate())) {
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
            timestamp: this.getCurrentDate().getTime()
        };
        this.log(`Updated cache for ${sign} (${period})`, "debug");
        this.saveCache();
    },

    parseSimulatedDateString: function(dateString) {
        const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
        const match = dateString.match(regex);
        if (match) {
            const [, month, day, year] = match;
            return new Date(year, month - 1, day);
        }
        return null;
    },

    setSimulatedDate: function(dateString) {
        const parsedDate = this.parseSimulatedDateString(dateString);
        if (parsedDate) {
            this.simulatedDate = parsedDate;
            this.log(`Simulated date set to: ${this.simulatedDate.toDateString()}`, "warn");
        } else {
            this.log(`Invalid simulated date format: ${dateString}. Expected format: MM/DD/YYYY`, "error");
        }
    },

    getCurrentDate: function() {
        if (this.simulatedDate) {
            // Create a new Date object with the current time but simulated date
            const now = new Date();
            return new Date(
                this.simulatedDate.getFullYear(),
                this.simulatedDate.getMonth(),
                this.simulatedDate.getDate(),
                now.getHours(),
                now.getMinutes(),
                now.getSeconds(),
                now.getMilliseconds()
            );
        }
        return new Date();
    }
});
