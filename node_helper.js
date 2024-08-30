const LOG_PREFIX = "MMM-SunSigns:";

const NodeHelper = require("node_helper");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require('fs').promises;
const path = require('path');

function log(message, isError = false, isDebug = false) {
    const logFunc = isError ? console.error : console.log;
    logFunc(`${LOG_PREFIX} ${message}`);
}

module.exports = NodeHelper.create({
    start: function() {
        console.log(`${LOG_PREFIX} Starting node helper`);
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
            cacheDuration: 24 * 60 * 60 * 1000,
            maxConcurrentRequests: 2,
            retryDelay: 5 * 60 * 1000,
            maxRetries: 3,
            updateWindowStartHour: 1,
            updateWindowDuration: 6 * 60 * 60 * 1000,
            maxUpdateAttempts: 6
        };

        this.initialize();
    },

    initialize: async function() {
        try {
            await this.createCacheDirectories();
            await this.initializeCache();
            await this.checkCacheTimestamps();
            log("Node helper initialized", false, true);
        } catch (error) {
            log("Error during initialization: " + error, true, true);
        }
    },

    createCacheDirectories: async function() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
            await fs.mkdir(this.imageCacheDir, { recursive: true });
            log("Cache directories created successfully", false, true);
        } catch (error) {
            log("Error creating cache directories: " + error, true, true);
            throw error;
        }
    },

    initializeCache: async function() {
        const cacheFile = path.join(this.cacheDir, 'horoscope_cache.json');
        try {
            const data = await fs.readFile(cacheFile, 'utf8');
            this.cache = JSON.parse(data);
            log("Cache initialized successfully", false, true);
        } catch (error) {
            if (error.code === 'ENOENT') {
                log("No existing cache file found. Starting with empty cache.", false, true);
                this.cache = {};
            } else {
                log("Error initializing cache: " + error, true, true);
                throw error;
            }
        }
    },

    saveCache: async function() {
        const cacheFile = path.join(this.cacheDir, 'horoscope_cache.json');
        try {
            await fs.writeFile(cacheFile, JSON.stringify(this.cache), 'utf8');
            log("Cache saved successfully", false, true);
        } catch (error) {
            log("Error saving cache:", error, true, true);
            throw error;
        }
    },

    socketNotificationReceived: function(notification, payload) {
        console.log(`${LOG_PREFIX} Received socket notification: ${notification}`);
        try {
            if (notification === "UPDATE_HOROSCOPES") {
                this.preloadHoroscopes(payload.zodiacSigns, payload.periods);
            } else if (notification === "SET_SIMULATED_DATE") {
                this.setSimulatedDate(payload.date);
            } else if (notification === "CLEAR_CACHE") {
                this.clearCache();
            } else {
                console.log(`${LOG_PREFIX} Unknown notification received: ${notification}`);
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} Error processing socket notification: ${error}`);
            this.sendSocketNotification("ERROR", {
                type: "Socket Notification Error",
                message: error.message || "Unknown error occurred while processing socket notification"
            });
        }
    },

    preloadHoroscopes: function(signs, periods) {
        console.log(`${LOG_PREFIX} Preloading horoscopes for signs: ${signs} and periods: ${periods}`);
        for (const sign of signs) {
            for (const period of periods) {
                const cachedData = this.getCachedHoroscope(sign, period);
                if (cachedData) {
                    this.sendSocketNotification("HOROSCOPE_RESULT", {
                        success: true,
                        sign: sign,
                        period: period,
                        data: cachedData.data,
                        cached: true,
                        imagePath: cachedData.imagePath
                    });
                } else {
                    this.requestQueue.push({ sign, period });
                }
            }
        }
        this.processQueue().catch(error => {
            console.error(`${LOG_PREFIX} Error in processQueue: ${error}`);
        });
    },

    processQueue: async function() {
        if (this.isProcessingQueue) {
            log("Queue is already being processed", false, true);
            return;
        }
        this.isProcessingQueue = true;
        log("Starting to process queue", false, true);

        while (this.requestQueue.length > 0) {
            const batch = this.requestQueue.splice(0, this.settings.maxConcurrentRequests);
            log('Processing batch of ' + batch.length + ' requests', false, true);

            const results = await Promise.all(batch.map(this.getHoroscope.bind(this)));
            results.forEach(result => {
                if (result.error) {
                    log('Error fetching horoscope for ' + result.sign + ' (' + result.period + '): ' + result.message, true, true);
                    this.sendSocketNotification("HOROSCOPE_RESULT", {
                        success: false,
                        sign: result.sign,
                        period: result.period,
                        message: result.message
                    });
                } else {
                    log('Successfully fetched horoscope for ' + result.sign + ' (' + result.period + ')', false, true);
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
                log("Waiting before processing next batch", false, true);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        this.isProcessingQueue = false;
        log("Queue processing complete", false, true);
    },

    getHoroscope: async function(config) {
        console.log(`${LOG_PREFIX} Getting horoscope for ${config.sign} (${config.period})`);
        try {
            if (!config.sign || !config.period) {
                throw new Error('Invalid config: sign or period missing. Config: ' + JSON.stringify(config));
            }

            const cachedData = this.getCachedHoroscope(config.sign, config.period);
            let imagePath;

            try {
                imagePath = await this.cacheImage(`https://www.sunsigns.com/wp-content/themes/sunsigns/assets/images/_sun-signs/${config.sign}/wrappable.png`, config.sign);
            } catch (imageError) {
                console.error(`${LOG_PREFIX} Error caching image for ${config.sign}: ${imageError}`);
                imagePath = null;
            }

            const currentTime = this.getCurrentDate().getTime();

            if (cachedData) {
                if (currentTime < cachedData.nextUpdateTime) {
                    console.log(`${LOG_PREFIX} Using cached horoscope for ${config.sign} (${config.period})`);
                    cachedData.imagePath = imagePath;
                    return cachedData;
                } else {
                    console.log(`${LOG_PREFIX} Cached data for ${config.sign} (${config.period}) is due for update. Fetching from source.`);
                }
            } else {
                console.log(`${LOG_PREFIX} No cached data found for ${config.sign} (${config.period}). Fetching from source.`);
            }

            console.log(`${LOG_PREFIX} Fetching new horoscope for ${config.sign} (${config.period}) from source`);
            const horoscope = await this.fetchHoroscope(config.sign, config.period);
            const result = { 
                data: horoscope,
                sign: config.sign, 
                period: config.period, 
                cached: false,
                imagePath: imagePath,
                timestamp: currentTime
            };
            this.updateCache(config.sign, config.period, result);
            return result;
        } catch (error) {
            console.error(`${LOG_PREFIX} Error in getHoroscope for ${config.sign} (${config.period}): ${error.message}`);
            return {
                error: true,
                message: error.message,
                sign: config.sign,
                period: config.period
            };
        }
    },
    fetchHoroscope: async function(sign, period) {
        let url;
        const currentDate = this.getCurrentDate();
        const currentYear = currentDate.getFullYear();

        switch (period) {
            case 'daily':
                url = `https://www.sunsigns.com/horoscopes/daily/${sign}`;
                break;
            case 'tomorrow':
                url = `https://www.sunsigns.com/horoscopes/daily/${sign}/tomorrow`;
                break;
            case 'weekly':
                url = `https://www.sunsigns.com/horoscopes/weekly/${sign}`;
                break;
            case 'monthly':
                url = `https://www.sunsigns.com/horoscopes/monthly/${sign}`;
                break;
            case 'yearly':
                url = `https://www.sunsigns.com/horoscopes/yearly/${currentYear}/${sign}`;
                break;
            default:
                throw new Error(`Invalid period: ${period}`);
        }

        log(`Fetching horoscope for ${sign} (${period}) from source`, false, true);

        try {
            const response = await axios.get(url, { timeout: 30000 });
            const $ = cheerio.load(response.data);
            let horoscope;

            if (period === 'yearly' || period === 'monthly') {
                horoscope = $('.horoscope-content').text().trim() || $('article.post').text().trim();
                horoscope = this.cleanHoroscopeText(horoscope, sign, period);
            } else {
                horoscope = $('.horoscope-content p').text().trim();
            }

            if (!horoscope) {
                throw new Error(`No horoscope content found for ${sign} (${period})`);
            }

            log(`Fetched horoscope for ${sign} (${period}) from source. Length: ${horoscope.length} characters`, false, true);
            return horoscope;
        } catch (error) {
            log(`Error fetching horoscope for ${sign} (${period}) from source: ${error.message}`, true, true);
            throw error;
        }
    },

cleanHoroscopeText: function(text, sign, period) {
        try {
            // Create a pattern that works for both yearly and monthly
            const pattern = new RegExp(`^.*?${sign}\\s+${period}\\s+Horoscope.*?(?:\\d{4})?`, 'is');

            // Remove the unwanted header text
            text = text.replace(pattern, '').trim();

            // Additional cleaning for monthly horoscopes if needed
            if (period === 'monthly') {
                // Remove any remaining date headers (e.g., "May 2024")
                text = text.replace(/^\s*[A-Z][a-z]+(?:\s+\d{4})?\s*/g, '');
            }

            log(`Cleaned ${period} horoscope for ${sign}: ${text.substring(0, 100)}...`, false, true);
            return text;
        } catch (error) {
            log(`Error cleaning horoscope text for ${sign} (${period}): ${error}`, true, true);
            return text; // Return original text if cleaning fails
        }
    },

    updateCache: function(sign, period, content) {
        if (!this.cache[sign]) {
            this.cache[sign] = {};
        }

        const currentTime = this.getCurrentDate().getTime();
        let nextUpdateInterval;

        // If this is the first time we're caching this data, set nextUpdateTime to now
        const isFirstCache = !this.cache[sign][period];

        if (isFirstCache) {
            nextUpdateInterval = 0; // Immediate update
        } else {
            switch(period) {
                case 'daily':
                case 'tomorrow':
                    nextUpdateInterval = this.getRandomInterval(4, 8); // 4-8 hours
                    break;
                case 'weekly':
                    nextUpdateInterval = this.getRandomInterval(24, 48); // 1-2 days
                    break;
                case 'monthly':
                    nextUpdateInterval = this.getRandomInterval(72, 120); // 3-5 days
                    break;
                case 'yearly':
                    nextUpdateInterval = this.getRandomInterval(168, 336); // 7-14 days
                    break;
                default:
                    nextUpdateInterval = this.getRandomInterval(4, 8); // Default to 4-8 hours
            }
        }

        const nextUpdateTime = currentTime + nextUpdateInterval;

        this.cache[sign][period] = {
            data: content.data,
            timestamp: currentTime,
            imagePath: content.imagePath,
            nextUpdateTime: nextUpdateTime
        };

        const updateDate = new Date(currentTime);
        const nextUpdateDate = new Date(nextUpdateTime);
        log(`Updated cache for ${sign} (${period}) on ${updateDate.toLocaleString()}. ${isFirstCache ? 'First cache, immediate update scheduled.' : `Next update scheduled for ${nextUpdateDate.toLocaleString()}`}. Data: ${content.data.substring(0, 50)}...`, false, true);
        this.saveCache();
    },

    getCachedHoroscope: function(sign, period) {
        if (!this.cache[sign] || !this.cache[sign][period]) {
            log(`No cached data found for ${sign} (${period})`, false, true);
            return null;
        }
        const cachedData = this.cache[sign][period];
        const currentDate = this.getCurrentDate();
        const cachedDate = new Date(cachedData.timestamp);

        let isValid = false;
        let nextUpdateTime = cachedData.nextUpdateTime;

        switch(period) {
            case 'daily':
                isValid = this.isSameDay(cachedDate, currentDate);
                break;
            case 'tomorrow':
                const tomorrow = new Date(currentDate);
                tomorrow.setDate(tomorrow.getDate() + 1);
                isValid = this.isSameDay(cachedDate, tomorrow);
                break;
            case 'weekly':
                isValid = this.isInSameWeek(cachedDate, currentDate);
                break;
            case 'monthly':
                isValid = this.isSameMonth(cachedDate, currentDate);
                break;
            case 'yearly':
                isValid = this.isSameYear(cachedDate, currentDate);
                break;
            default:
                isValid = false;
        }

        if (!isValid) {
            log(`Cached data for ${sign} (${period}) has expired. Last updated: ${cachedDate.toLocaleString()}`, false, true);
            return null; // This will trigger a new fetch
        }

        log(`Retrieved cached data for ${sign} (${period}). Next update scheduled for: ${new Date(nextUpdateTime).toLocaleString()}`, false, true);
        return { 
            data: cachedData.data,
            sign: sign, 
            period: period, 
            cached: true, 
            imagePath: cachedData.imagePath,
            timestamp: cachedData.timestamp,
            nextUpdateTime: nextUpdateTime
        };
    },

    cacheImage: async function(imageUrl, sign) {
        const imagePath = path.join(this.imageCacheDir, sign + '.png');

        try {
            // Check if the image file already exists
            await fs.access(imagePath);
            log(`Image for ${sign} already cached at ${imagePath}`, false, true);
            return path.relative(__dirname, imagePath);
        } catch (error) {
            // If the file doesn't exist, download and cache it
            log(`Downloading image for ${sign} from source`, false, true);
            try {
                const response = await axios({
                    url: imageUrl,
                    method: 'GET',
                    responseType: 'arraybuffer'
                });
                await fs.writeFile(imagePath, response.data);
                log(`Image successfully cached for ${sign} at ${imagePath}`, false, true);
                return path.relative(__dirname, imagePath);
            } catch (downloadError) {
                log(`Error caching image for ${sign} from source: ${downloadError}`, true, true);
                throw downloadError;
            }
        }
    },   

    setSimulatedDate: function(dateString) {
        const parsedDate = this.parseSimulatedDateString(dateString);
        if (parsedDate) {
            this.simulatedDate = parsedDate;
            log('Simulated date set to: ' + this.simulatedDate.toDateString(), false, true);
        } else {
            log('Invalid simulated date format: ' + dateString + '. Expected format: MM/DD/YYYY', true, false);
        }
    },

    parseSimulatedDateString: function(dateString) {
        const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
        const match = dateString.match(regex);
        if (match) {
            const month = parseInt(match[1]) - 1,
                  day = parseInt(match[2]),
                  year = parseInt(match[3]);
            return new Date(year, month, day);
        }
        return null;
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

    isSameDay: function(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    },

    isInSameWeek: function(date1, date2) {
        const d1 = new Date(Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate()));
        const d2 = new Date(Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate()));
        const dayNum1 = d1.getUTCDay() || 7;
        const dayNum2 = d2.getUTCDay() || 7;
        d1.setUTCDate(d1.getUTCDate() + 4 - dayNum1);
        d2.setUTCDate(d2.getUTCDate() + 4 - dayNum2);
        return Math.floor((d1.getTime() - new Date(Date.UTC(d1.getUTCFullYear(), 0, 1)).getTime()) / 86400000 / 7) ===
               Math.floor((d2.getTime() - new Date(Date.UTC(d2.getUTCFullYear(), 0, 1)).getTime()) / 86400000 / 7);
    },

    getWeekNumber: function(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
    },

    isSameMonth: function(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth();
    },

    isSameYear: function(date1, date2) {
        return date1.getFullYear() === date2.getFullYear();
    },

    checkCacheTimestamps: async function() {
        log("Checking cache timestamps", false, true);
        const currentTime = Date.now();
        let cacheUpdated = false;

        for (const sign in this.cache) {
            for (const period in this.cache[sign]) {
                const cacheEntry = this.cache[sign][period];
                if (currentTime - cacheEntry.timestamp > this.settings.cacheDuration) {
                    log(`Cache expired for ${sign} (${period}). Removing entry.`, false, true);
                    delete this.cache[sign][period];
                    cacheUpdated = true;
                }
            }
            if (Object.keys(this.cache[sign]).length === 0) {
                delete this.cache[sign];
                cacheUpdated = true;
            }
        }

        if (cacheUpdated) {
            await this.saveCache();
            log("Cache updated after timestamp check", false, true);
        } else {
            log("No cache entries expired", false, true);
        }
    },

    getRandomInterval: function(minHours, maxHours) {
        return Math.floor(Math.random() * (maxHours - minHours + 1) + minHours) * 60 * 60 * 1000;
    },

    clearCache: async function() {
        try {
            this.cache = {};
            await this.saveCache();
            log("Cache cleared successfully", false, true);
            this.sendSocketNotification("CACHE_CLEARED", {});
        } catch (error) {
            log("Error clearing cache: " + error, true, true);
            this.sendSocketNotification("ERROR", {
                type: "Cache Clear Error",
                message: error.message || "Unknown error occurred while clearing cache"
            });
        }
    }
});

log("MMM-SunSigns node_helper file has been fully loaded", false, true);
