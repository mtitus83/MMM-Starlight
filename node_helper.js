const NodeHelper = require("node_helper");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require('fs').promises;
const path = require('path');

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node helper for MMM-SunSigns");
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
            console.log("Node helper initialized");
        } catch (error) {
            console.error("Error during initialization:", error);
        }
    },

    createCacheDirectories: async function() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
            await fs.mkdir(this.imageCacheDir, { recursive: true });
            console.log("Cache directories created successfully");
        } catch (error) {
            console.error("Error creating cache directories:", error);
            throw error;
        }
    },

    initializeCache: async function() {
        const cacheFile = path.join(this.cacheDir, 'horoscope_cache.json');
        try {
            const data = await fs.readFile(cacheFile, 'utf8');
            this.cache = JSON.parse(data);
            console.log("Cache initialized successfully");
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log("No existing cache file found. Starting with empty cache.");
                this.cache = {};
            } else {
                console.error("Error initializing cache:", error);
                throw error;
            }
        }
    },

saveCache: async function() {
        const cacheFile = path.join(this.cacheDir, 'horoscope_cache.json');
        try {
            await fs.writeFile(cacheFile, JSON.stringify(this.cache), 'utf8');
            console.log("Cache saved successfully");
        } catch (error) {
            console.error("Error saving cache:", error);
            throw error;
        }
    },

    socketNotificationReceived: function(notification, payload) {
        console.log("Received socket notification:", notification);
        try {
            if (notification === "UPDATE_HOROSCOPES") {
                this.preloadHoroscopes(payload.zodiacSigns, payload.periods);
            } else if (notification === "SET_SIMULATED_DATE") {
                this.setSimulatedDate(payload.date);
            } else if (notification === "CLEAR_CACHE") {
                this.clearCache();
            } else {
                console.log("Unknown notification received:", notification);
            }
        } catch (error) {
            console.error("Error processing socket notification:", error);
            this.sendSocketNotification("ERROR", {
                type: "Socket Notification Error",
                message: error.message || "Unknown error occurred while processing socket notification"
            });
        }
    },

    preloadHoroscopes: function(signs, periods) {
        console.log('Preloading horoscopes for signs:', signs, 'and periods:', periods);
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
            console.error("Error in processQueue:", error);
        });
    },

    processQueue: async function() {
        if (this.isProcessingQueue) {
            console.log("Queue is already being processed");
            return;
        }
        this.isProcessingQueue = true;
        console.log("Starting to process queue");

        while (this.requestQueue.length > 0) {
            const batch = this.requestQueue.splice(0, this.settings.maxConcurrentRequests);
            console.log('Processing batch of', batch.length, 'requests');

            const results = await Promise.all(batch.map(this.getHoroscope.bind(this)));
            results.forEach(result => {
                if (result.error) {
                    console.error('Error fetching horoscope for', result.sign, result.period, ':', result.message);
                    this.sendSocketNotification("HOROSCOPE_RESULT", {
                        success: false,
                        sign: result.sign,
                        period: result.period,
                        message: result.message
                    });
                } else {
                    console.log('Successfully fetched horoscope for', result.sign, result.period);
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
                console.log("Waiting before processing next batch");
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        this.isProcessingQueue = false;
        console.log("Queue processing complete");
    },

getHoroscope: async function(config) {
        try {
            if (!config.sign || !config.period) {
                throw new Error('Invalid config: sign or period missing. Config: ' + JSON.stringify(config));
            }

            const cachedData = this.getCachedHoroscope(config.sign, config.period);
            if (cachedData) {
                console.log('Returning cached horoscope for', config.sign, 'period:', config.period);
                return cachedData;
            }

            console.log('Fetching new horoscope for', config.sign, 'period:', config.period);
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
            console.error('Error in getHoroscope for', config.sign, config.period, ':', error.message);
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
        if (period === 'yearly') {
            const currentYear = new Date().getFullYear();
            url = `https://www.sunsigns.com/horoscopes/yearly/${currentYear}/${sign}`;
        } else {
            url = `https://www.sunsigns.com/horoscopes/${period === 'tomorrow' ? 'daily/' + sign + '/tomorrow' : period + '/' + sign}`;
        }
        console.log('Fetching horoscope for', sign, '('+period+')', 'from', url);

        try {
            const response = await axios.get(url, { timeout: 30000 });
            const $ = cheerio.load(response.data);
            let horoscope;
            if (period === 'yearly') {
                horoscope = $('.horoscope-content').text().trim() || $('article.post').text().trim();
            } else {
                horoscope = $('.horoscope-content p').text().trim();
            }
            if (!horoscope) {
                throw new Error('No horoscope content found for ' + sign + ' (' + period + ')');
            }
            console.log('Fetched horoscope for', sign, '('+period+'). Length:', horoscope.length, 'characters');
            return horoscope;
        } catch (error) {
            console.error('Error fetching horoscope for', sign, '('+period+'):', error.message);
            throw error;
        }
    },

    updateCache: function(sign, period, content) {
        if (!this.cache[sign]) {
            this.cache[sign] = {};
        }

        this.cache[sign][period] = {
            data: content.data,
            timestamp: this.getCurrentDate().getTime(),
            imagePath: content.imagePath
        };
        console.log('Updated cache for', sign, '('+period+'):', content.data.substring(0, 50) + '...');
        this.saveCache();
    },

    getCachedHoroscope: function(sign, period) {
        if (!this.cache[sign] || !this.cache[sign][period]) {
            return null;
        }
        const cachedData = this.cache[sign][period];
        if (this.isSameDay(new Date(cachedData.timestamp), this.getCurrentDate())) {
            return { 
                data: cachedData.data,
                sign: sign, 
                period: period, 
                cached: true, 
                imagePath: cachedData.imagePath 
            };
        }
        return null;
    },

    cacheImage: async function(imageUrl, sign) {
        const imagePath = path.join(this.imageCacheDir, sign + '.png');

        try {
            await fs.access(imagePath);
            console.log('Image for', sign, 'already cached at', imagePath);
            return path.relative(__dirname, imagePath);
        } catch (error) {
            console.log('Attempting to download image for', sign, 'from', imageUrl);
            try {
                const response = await axios({
                    url: imageUrl,
                    method: 'GET',
                    responseType: 'arraybuffer'
                });
                await fs.writeFile(imagePath, response.data);
                console.log('Image successfully cached for', sign, 'at', imagePath);
                return path.relative(__dirname, imagePath);
            } catch (downloadError) {
                console.error('Error caching image for', sign, ':', downloadError);
                throw downloadError;
            }
        }
    },

    setSimulatedDate: function(dateString) {
        const parsedDate = this.parseSimulatedDateString(dateString);
        if (parsedDate) {
            this.simulatedDate = parsedDate;
            console.log('Simulated date set to:', this.simulatedDate.toDateString());
        } else {
            console.error('Invalid simulated date format:', dateString, '. Expected format: MM/DD/YYYY');
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

    checkCacheTimestamps: async function() {
        console.log("Checking cache timestamps");
        const currentTime = Date.now();
        let cacheUpdated = false;

        for (const sign in this.cache) {
            for (const period in this.cache[sign]) {
                const cacheEntry = this.cache[sign][period];
                if (currentTime - cacheEntry.timestamp > this.settings.cacheDuration) {
                    console.log(`Cache expired for ${sign} (${period}). Removing entry.`);
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
            console.log("Cache updated after timestamp check");
        } else {
            console.log("No cache entries expired");
        }
    },

    clearCache: async function() {
        try {
            this.cache = {};
            await this.saveCache();
            console.log("Cache cleared successfully");
            this.sendSocketNotification("CACHE_CLEARED", {});
        } catch (error) {
            console.error("Error clearing cache:", error);
            this.sendSocketNotification("ERROR", {
                type: "Cache Clear Error",
                message: error.message || "Unknown error occurred while clearing cache"
            });
        }
    }
});

console.log("MMM-SunSigns node_helper file has been fully loaded");
