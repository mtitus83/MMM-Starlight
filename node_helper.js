var NodeHelper = require("node_helper");
var axios = require("axios");
const fs = require('fs').promises;
const path = require('path');

module.exports = NodeHelper.create({
    requestTimeout: 30000, // 30 seconds
    retryDelay: 300000, // 5 minutes
    maxRetries: 5,
    cacheFile: path.join(__dirname, 'cache', 'horoscope_cache.json'),
    imageCacheDir: path.join(__dirname, 'cache', 'images'),
    updateInterval: 24 * 60 * 60 * 1000, // 24 hours

    start: function() {
        console.log("Starting node helper for: " + this.name);
        this.retryCount = {};
        this.ensureCacheDirectoryExists();
        this.ensureImageCacheDirectoryExists();
        this.cache = null;
        this.config = null;
        this.midnightTimer = null;
    },

    updateDailyHoroscopes: async function() {
        console.log("Updating daily horoscopes with tomorrow's data");
        const cache = await this.loadCache();

        for (const sign in cache) {
            if (cache[sign].daily && cache[sign].tomorrow) {
                // Replace daily with tomorrow's data
                cache[sign].daily = cache[sign].tomorrow;

                // Fetch new data for tomorrow
                try {
                    const newTomorrowData = await this.getHoroscope({ sign: sign, period: "tomorrow" });
                    cache[sign].tomorrow = newTomorrowData;
                } catch (error) {
                    console.error(`Error fetching new tomorrow's horoscope for ${sign}:`, error);
                }
            }
        }

        await this.saveCache(cache);
        this.sendSocketNotification("DAILY_HOROSCOPES_UPDATED");
    },

    scheduleMidnightUpdate: function() {
        const now = new Date();
        const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
        const timeUntilMidnight = midnight - now;

        clearTimeout(this.midnightTimer);
        this.midnightTimer = setTimeout(() => {
            this.updateDailyHoroscopes();
            this.scheduleMidnightUpdate(); // Schedule the next midnight update
        }, timeUntilMidnight);
    },

    async ensureCacheDirectoryExists() {
        const cacheDir = path.dirname(this.cacheFile);
        try {
            await fs.mkdir(cacheDir, { recursive: true });
            console.log(`Cache directory ensured: ${cacheDir}`);
        } catch (error) {
            console.error(`Error ensuring cache directory: ${error}`);
        }
    },

    async ensureImageCacheDirectoryExists() {
        try {
            await fs.mkdir(this.imageCacheDir, { recursive: true });
            console.log(`Image cache directory created: ${this.imageCacheDir}`);
        } catch (error) {
            console.error(`Error creating image cache directory: ${error}`);
        }
    },

    async loadCache() {
        if (this.cache) {
            return this.cache;
        }
        try {
            await this.ensureCacheDirectoryExists();
            const data = await fs.readFile(this.cacheFile, 'utf8');
            console.log('Cache loaded successfully from file');
            this.cache = JSON.parse(data);
            return this.cache;
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('Cache file does not exist, creating a new one.');
                this.cache = {};
                await this.saveCache(this.cache);
                return this.cache;
            }
            console.error('Error reading cache file:', error);
            this.cache = {};
            return this.cache;
        }
    },

    async saveCache(cache) {
        try {
            await fs.writeFile(this.cacheFile, JSON.stringify(cache, null, 2));
            console.log('Cache saved successfully to file');
        } catch (error) {
            console.error('Error saving cache:', error);
        }
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
                throw new Error("Invalid period specified");
        }

        console.log(this.name + ": Fetching horoscope from source");

        try {
            const response = await axios.get(url, { timeout: this.requestTimeout });
            if (response.data.success) {
                return {
                    horoscope_data: response.data.data.horoscope_data,
                    date: response.data.data.date,
                    challenging_days: response.data.data.challenging_days,
                    standout_days: response.data.data.standout_days
                };
            } else {
                throw new Error("API returned unsuccessful response");
            }
        } catch (error) {
            console.error(`Error fetching horoscope for ${config.sign}, period: ${config.period}:`, error.message);
            throw error;
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
                return await this.getHoroscope(config);
            } catch (retryError) {
                console.error(`${this.name}: Error in retry for ${config.sign}:`, retryError);
                throw retryError;
            }
        } else {
            this.retryCount[config.sign] = 0;
            throw new Error(`Max retries reached. Unable to fetch horoscope for ${config.sign}`);
        }
    },

    async getCachedHoroscope(config) {
        const cache = await this.loadCache();
        
        if (cache[config.sign] && 
            cache[config.sign][config.period] && 
            this.isCacheValid(cache[config.sign][config.period], config.period)) {
            console.log(`[CACHE HIT] Using cached data for ${config.sign}, period: ${config.period}`);
            return cache[config.sign][config.period];
        }
        
        console.log(`[CACHE MISS] No valid cached data found for ${config.sign}, period: ${config.period}. Fetching from API.`);
        try {
            const data = await this.getHoroscope(config);
            if (!cache[config.sign]) {
                cache[config.sign] = {};
            }
            cache[config.sign][config.period] = {
                ...data,
                timestamp: new Date().toISOString()
            };
            await this.saveCache(cache);
            console.log(`Cached ${config.period} for ${config.sign}`);
            return cache[config.sign][config.period];
        } catch (error) {
            console.error(`Error fetching horoscope for ${config.sign}, period: ${config.period}:`, error);
            return null;
        }
    },

    isCacheValid(cachedData, period) {
        if (!cachedData || !cachedData.timestamp) return false;

        const now = new Date();
        const cacheTime = new Date(cachedData.timestamp);

        switch(period) {
            case "daily":
                // Valid if cache is from today
                return now.toDateString() === cacheTime.toDateString();
            case "tomorrow":
                // Valid if cache is from today or yesterday
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                return cacheTime.toDateString() === now.toDateString() || 
                       cacheTime.toDateString() === yesterday.toDateString();
            case "weekly":
                // Valid if cache is from this week
                const weekDiff = (now - cacheTime) / (1000 * 60 * 60 * 24 * 7);
                return weekDiff < 1;
            case "monthly":
                // Valid if cache is from this month
                return now.getMonth() === cacheTime.getMonth() && 
                       now.getFullYear() === cacheTime.getFullYear();
            default:
                return false;
        }
    },

    getZodiacImageUrl: function(sign) {
        const capitalizedSign = sign.charAt(0).toUpperCase() + sign.slice(1);
        let zodiacSign = capitalizedSign;
        if (zodiacSign === "Capricorn") zodiacSign = "Capricornus";
        if (zodiacSign === "Scorpio") zodiacSign = "Scorpius";
        const svgFileName = `${zodiacSign}_symbol_(outline).svg`;
        const encodedFileName = encodeURIComponent(svgFileName);
        return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodedFileName}?width=240`;
    },

    downloadAndCacheImage: async function(sign) {
        const imageUrl = this.getZodiacImageUrl(sign);
        const imagePath = path.join(this.imageCacheDir, `${sign}.png`);

        try {
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: this.requestTimeout });
            await fs.writeFile(imagePath, response.data);
            console.log(`Image for ${sign} downloaded and cached`);
            return `modules/${this.name}/cache/images/${sign}.png`;  // Return relative path
        } catch (error) {
            console.error(`Error downloading image for ${sign}:`, error);
            throw error;
        }
    },

    getCachedImage: async function(sign) {
        const imagePath = path.join(this.imageCacheDir, `${sign}.png`);
        try {
            await fs.access(imagePath);
            console.log(`[CACHE HIT] Using cached image for ${sign}`);
            return `modules/${this.name}/cache/images/${sign}.png`;  // Return relative path
        } catch (error) {
            console.log(`[CACHE MISS] No cached image found for ${sign}. Downloading...`);
            return await this.downloadAndCacheImage(sign);
        }
    },

resetCache: async function() {
    await this.ensureCacheDirectoryExists();
    await fs.unlink(this.cacheFile).catch(error => {
        if (error.code !== 'ENOENT') {
            console.error(`Error deleting cache file:`, error);
        }
    });
    this.cache = null;
    this.sendSocketNotification("CACHE_RESET");
},

socketNotificationReceived: function(notification, payload) {
    if (notification === "RESET_CACHE") {
        this.resetCache();
    }
    if (notification === "INIT") {
        console.log(`${this.name}: Received INIT notification`);
        if (payload && payload.config) {
            this.config = payload.config;
            this.initializeCache(this.config);
        } else {
            console.error("INIT notification received without config payload");
        }
    } else if (notification === "GET_HOROSCOPE") {
        console.log(`${this.name}: Received GET_HOROSCOPE notification for ${payload.sign}, period: ${payload.period}`);
        this.getCachedHoroscope(payload)
            .then(data => {
                this.sendSocketNotification("HOROSCOPE_RESULT", { 
                    success: true,
                    data: data,
                    sign: payload.sign,
                    period: payload.period
                });
            })
            .catch(error => {
                console.error(`${this.name}: Error in getHoroscope:`, error);
                this.sendSocketNotification("HOROSCOPE_RESULT", { 
                    success: false, 
                    message: "An error occurred while fetching the horoscope.",
                    sign: payload.sign,
                    period: payload.period,
                    error: error.toString()
                });
            });
    } else if (notification === "GET_IMAGE") {
        console.log(`${this.name}: Received GET_IMAGE notification for ${payload.sign}`);
        this.getCachedImage(payload.sign)
            .then(imagePath => {
                this.sendSocketNotification("IMAGE_RESULT", {
                    success: true,
                    imagePath: imagePath,
                    sign: payload.sign
                });
            })
            .catch(error => {
                console.error(`${this.name}: Error in getCachedImage:`, error);
                this.sendSocketNotification("IMAGE_RESULT", {
                    success: false,
                    message: "An error occurred while fetching the image.",
                    sign: payload.sign,
                    error: error.toString()
                });
            });
    } else if (notification === "SIMULATE_MIDNIGHT_UPDATE") {
        console.log(`${this.name}: Received SIMULATE_MIDNIGHT_UPDATE notification`);
        this.simulateMidnightUpdate()
            .then(() => {
                console.log(`${this.name}: Midnight update simulation completed`);
                this.sendSocketNotification("MIDNIGHT_UPDATE_SIMULATED");
            })
            .catch(error => {
                console.error(`${this.name}: Error in simulateMidnightUpdate:`, error);
            });
    } else {
        console.log(`${this.name}: Received unknown notification: ${notification}`);
    }
},

    simulateMidnightUpdate: async function() {
        console.log("Updating daily horoscopes with tomorrow's data");
        const cache = await this.loadCache();

        for (const sign in cache) {
            if (cache[sign].daily && cache[sign].tomorrow) {
                cache[sign].daily = cache[sign].tomorrow;
                delete cache[sign].tomorrow;
                console.log(`Updated daily horoscope for ${sign}`);
                
                // Fetch new data for tomorrow
                try {
                    const newTomorrowData = await this.getHoroscope({ sign: sign, period: "tomorrow" });
                    cache[sign].tomorrow = {
                        ...newTomorrowData,
                        timestamp: new Date().toISOString()
                    };
                    console.log(`Fetched new tomorrow's data for ${sign}`);
                } catch (error) {
                    console.error(`Error fetching new tomorrow's horoscope for ${sign}:`, error);
                }
            }
        }

        await this.saveCache(cache);
        this.sendSocketNotification("MIDNIGHT_UPDATE_SIMULATED");
    },

    scheduleNextUpdate: function() {
        setTimeout(() => {
            this.updateCache();
        }, this.updateInterval);
    },

    updateCache: async function() {
        console.log("Updating cache...");
        if (this.config) {
            await this.initializeCache(this.config);
        } else {
            console.error("Cannot update cache: config is not set");
        }
        this.scheduleNextUpdate();
    },

    initializeCache: async function(config) {
        if (!config) {
            console.error("Cannot initialize cache: config is not provided");
            return;
        }
        console.log("Initializing cache for all configured zodiac signs and periods");
        const cache = await this.loadCache();
        
        let cacheUpdated = false;
        for (const sign of config.zodiacSign) {
            if (!cache[sign]) {
                cache[sign] = {};
            }
            for (const period of [...config.period, "tomorrow"]) {
                if (!cache[sign][period] || !this.isCacheValid(cache[sign][period], period)) {
                    try {
                        console.log(`Fetching data for ${sign}, period: ${period}`);
                        const data = await this.getHoroscope({ sign, period });
                        cache[sign][period] = {
                            ...data,
                            timestamp: new Date().toISOString()
                        };
                        console.log(`Cached ${period} for ${sign}`);
                        cacheUpdated = true;
                    } catch (error) {
                        console.error(`Error fetching data for ${sign}, period: ${period}:`, error);
                    }
                } else {
                    console.log(`Using existing valid cache for ${sign}, period: ${period}`);
                }
            }
            try {
                await this.getCachedImage(sign);
            } catch (error) {
                console.error(`Error caching image for ${sign}:`, error);
            }
        }
        
        if (cacheUpdated) {
            await this.saveCache(cache);
        }
        console.log("Cache initialization completed");
        this.sendSocketNotification("CACHE_INITIALIZED");
        this.scheduleNextUpdate();
        this.scheduleMidnightUpdate();
    }
});
