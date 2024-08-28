var NodeHelper = require("node_helper");
var axios = require("axios");
var cheerio = require("cheerio");
const fs = require('fs').promises;
const path = require('path');

const CACHE_VERSION = 1; // Increment this when you make significant changes to cache structure

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

    initializeCache: async function() {
        const cacheFile = path.join(this.cacheDir, 'horoscope_cache.json');
        try {
            const data = await fs.readFile(cacheFile, 'utf8');
            const parsedCache = JSON.parse(data);
            
            if (parsedCache.version !== CACHE_VERSION) {
                this.log("Cache version mismatch. Clearing old cache.", "warn");
                this.cache = { version: CACHE_VERSION };
            } else {
                this.cache = parsedCache;
            }
            this.log("Cache initialized successfully");
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error("Error reading cache file:", error);
            } else {
                this.log("No existing cache file found. Starting with empty cache.");
            }
            this.cache = { version: CACHE_VERSION };
        }
    },

    saveCache: async function() {
        const cacheFile = path.join(this.cacheDir, 'horoscope_cache.json');
        try {
            await fs.writeFile(cacheFile, JSON.stringify({ ...this.cache, version: CACHE_VERSION }), 'utf8');
            this.log("Cache saved successfully");
        } catch (error) {
            console.error("Error writing cache file:", error);
        }
    },

    clearCache: async function() {
        this.cache = { version: CACHE_VERSION };
        await this.saveCache();
        this.log("Cache cleared successfully", "info");
    },

    checkCacheTimestamps: async function() {
        this.log("Checking cache timestamps", "info");
        const currentDate = this.getCurrentDate();
        let updatesNeeded = false;

        for (let sign in this.cache) {
            if (sign === 'version') continue;
            for (let period of ['daily', 'tomorrow']) {
                if (this.cache[sign][period]) {
                    const cachedDate = new Date(this.cache[sign][period].timestamp);
                    if (!this.isSameDay(cachedDate, currentDate)) {
                        this.log(`Stale '${period}' data found for ${sign}. Updating...`, "warn");
                        if (period === 'tomorrow') {
                            if (this.cache[sign]['daily']) {
                                this.cache[sign]['daily'] = this.cache[sign]['tomorrow'];
                                this.cache[sign]['daily'].timestamp = currentDate.getTime();
                                this.log(`Updated 'daily' data for ${sign} with previous 'tomorrow' data`, "info");
                            }
                            delete this.cache[sign]['tomorrow'];
                        } else {
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
            this.updateHoroscopes();
        } else {
            this.log("All cache timestamps are current", "info");
        }
    },

    log: function(message, level = "info") {
        const timestamp = this.getCurrentDate().toISOString();
        const logMessage = `[${timestamp}] [${this.name}] [${level.toUpperCase()}] ${message}`;
        console.log(logMessage);
    },

    isSameDay: function(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    },

    getCurrentDate: function() {
        if (this.simulatedDate) {
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
    },

    getHoroscope: async function(config) {
        try {
            if (!config.sign || !config.period) {
                throw new Error(`Invalid config: sign or period missing. Config: ${JSON.stringify(config)}`);
            }
    
            if (!this.cache[config.sign]) {
                this.cache[config.sign] = {};
            }
            const cachedData = this.cache[config.sign][config.period];
    
            if (!this.config.bypassCache && cachedData && this.isSameDay(new Date(cachedData.timestamp), this.getCurrentDate())) {
                this.log(`Returning cached horoscope for ${config.sign}, period: ${config.period}`);
                const imageUrl = `https://www.sunsigns.com/wp-content/themes/sunsigns/assets/images/_sun-signs/${config.sign}/wrappable.png`;
                const imagePath = await this.cacheImage(imageUrl, config.sign);
                
                return { 
                    data: cachedData.data,
                    sign: config.sign, 
                    period: config.period, 
                    cached: true, 
                    imagePath: imagePath 
                };
            }
    
            this.log(`Fetching new horoscope for ${config.sign}, period: ${config.period}`);
            const horoscope = await this.fetchHoroscope(config.sign, config.period);
            const imageUrl = `https://www.sunsigns.com/wp-content/themes/sunsigns/assets/images/_sun-signs/${config.sign}/wrappable.png`;
            const imagePath = await this.cacheImage(imageUrl, config.sign);
    
            const extractedHoroscope = this.extractHoroscopeText(horoscope);
    
            const result = { 
                data: extractedHoroscope,
                sign: config.sign, 
                period: config.period, 
                cached: false,
                imagePath: imagePath
            };
    
            if (!this.config.bypassCache) {
                this.updateCache(config.sign, config.period, result);
            }
    
            return result;
        } catch (error) {
            this.log(`Error in getHoroscope for ${config.sign}, ${config.period}: ${error.message}`, "error");
            return {
                error: true,
                message: error.message,
                sign: config.sign,
                period: config.period
            };
        }
    },

    updateCache: function(sign, period, content) {
        if (!this.cache[sign]) {
            this.cache[sign] = {};
        }
        
        let horoscopeText = this.extractHoroscopeText(content.data);
        
        this.cache[sign][period] = {
            data: horoscopeText,
            timestamp: this.getCurrentDate().getTime()
        };
        this.log(`Updated cache for ${sign} (${period}): ${horoscopeText.substring(0, 50)}...`, "debug");
        this.saveCache();
    },

    extractHoroscopeText: function(data) {
        const extractText = (obj) => {
            if (typeof obj === 'string') {
                return obj;
            } else if (obj && typeof obj === 'object') {
                if (obj.data) return extractText(obj.data);
                if (obj.text) return obj.text;
            }
            return null;
        };

        let result = data;
        let attempts = 0;
        while (typeof result === 'string' && attempts < 3) {
            try {
                result = JSON.parse(result);
                attempts++;
            } catch (e) {
                break;
            }
        }

        const extractedText = extractText(result);
        if (extractedText) {
            return extractedText;
        } else {
            this.log(`Unable to extract horoscope text from: ${JSON.stringify(result)}`, "warn");
            return "Horoscope text not available. Please try again later.";
        }
    },

    fetchHoroscope: async function(sign, period) {
        const url = `https://www.sunsigns.com/horoscopes/${period === 'tomorrow' ? 'daily/' + sign + '/tomorrow' : period + '/' + sign}`;
        this.log(`Fetching horoscope for ${sign} (${period}) from ${url}`, "debug");
        const response = await axios.get(url, { timeout: 30000 });
        const $ = cheerio.load(response.data);
        const horoscope = $('.horoscope-content p').text().trim();
        if (!horoscope) {
            throw new Error(`No horoscope content found for ${sign} (${period})`);
        }
        this.log(`Fetched horoscope for ${sign} (${period}). Length: ${horoscope.length} characters`, "debug");
        return horoscope;
    },

    cacheImage: async function(imageUrl, sign) {
        const imagePath = path.join(this.imageCacheDir, `${sign}.png`);

        try {
            await fs.access(imagePath);
            this.log(`Image for ${sign} already cached at ${imagePath}`, "debug");
            return path.relative(__dirname, imagePath);
        } catch (error) {
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
                return null;
            }
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
            this.scheduleUpdateWindow();
        } else if (notification === "CLEAR_CACHE") {
            this.clearCache();
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

        try {
            while (this.requestQueue.length > 0) {
                const batch = this.requestQueue.splice(0, this.settings.maxConcurrentRequests);
                this.log(`Processing batch of ${batch.length} requests`);

                const promises = batch.map(item => this.getHoroscope(item));

                const results = await Promise.all(promises);

                results.forEach(result => {
                    if (result.error) {
                        this.log(`Error fetching horoscope for ${result.sign}, ${result.period}: ${result.message}`, "error");
                        this.sendSocketNotification("HOROSCOPE_RESULT", {
                            success: false,
                            sign: result.sign,
                            period: result.period,
                            message: result.message
                        });
                    } else {
                        const previewText = result.data ? result.data.substring(0, 50) : 'No horoscope text available';
                        this.log(`Successfully fetched horoscope for ${result.sign}, ${result.period}: ${previewText}...`);
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

    setSimulatedDate: function(dateString) {
        const parsedDate = this.parseSimulatedDateString(dateString);
        if (parsedDate) {
            this.simulatedDate = parsedDate;
            this.log(`Simulated date set to: ${this.simulatedDate.toDateString()}`, "warn");
        } else {
            this.log(`Invalid simulated date format: ${dateString}. Expected format: MM/DD/YYYY`, "error");
        }
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
            if (sign === 'version') continue;
            try {
                this.log(`Checking for updates for ${sign}`, "debug");
                const newTomorrowHoroscope = await this.fetchHoroscope(sign, 'tomorrow');
                if (this.isNewContent(sign, newTomorrowHoroscope)) {
                    this.log(`New content found for ${sign}, updating cache`, "info");
                    this.updateCache(sign, 'tomorrow', { data: newTomorrowHoroscope });
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
            this.scheduleUpdateWindow();
        } else {
            this.updateAttempts++;
            if (this.updateAttempts < this.settings.maxUpdateAttempts && 
                (this.getCurrentDate() - this.updateWindowStart) < this.settings.updateWindowDuration) {
                const nextCheckDelay = Math.min(
                    30 * 60 * 1000 * Math.pow(2, this.updateAttempts - 1),
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
                this.scheduleUpdateWindow();
            }
        }
    },

    isNewContent: function(sign, newHoroscope) {
        const currentDaily = this.cache[sign]?.['daily']?.data;
        const currentTomorrow = this.cache[sign]?.['tomorrow']?.data;
        return newHoroscope !== currentDaily && newHoroscope !== currentTomorrow;
    },

    updateHoroscopes: function() {
        this.lastUpdateAttempt = new Date().toLocaleString();
        this.log("Sending UPDATE_HOROSCOPES notification", "info");

        const signs = new Set(Object.keys(this.cache).filter(key => key !== 'version'));
        const periods = new Set();
        for (let sign of signs) {
            Object.keys(this.cache[sign]).forEach(period => periods.add(period));
        }

        this.sendSocketNotification("UPDATE_HOROSCOPES", {
            zodiacSigns: Array.from(signs),
            periods: Array.from(periods),
        });
    },
});
