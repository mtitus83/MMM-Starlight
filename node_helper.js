// node_helper.js

var NodeHelper = require("node_helper");
var axios = require("axios");
const fs = require('fs').promises;
const path = require('path');

const LogLevels = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    VERBOSE: 4
};

const Logger = {
    level: LogLevels.INFO,  // Default log level
    moduleName: "MMM-Starlight",

    setLevel: function(level) {
        this.level = level;
    },

    error: function(...args) {
        if (this.level >= LogLevels.ERROR) console.error(`[${this.moduleName}] ERROR:`, ...args);
    },

    warn: function(...args) {
        if (this.level >= LogLevels.WARN) console.warn(`[${this.moduleName}] WARN:`, ...args);
    },

    info: function(...args) {
        if (this.level >= LogLevels.INFO) console.log(`[${this.moduleName}] INFO:`, ...args);
    },

    debug: function(...args) {
        if (this.level >= LogLevels.DEBUG) console.log(`[${this.moduleName}] DEBUG:`, ...args);
    },

    verbose: function(...args) {
        if (this.level >= LogLevels.VERBOSE) console.log(`[${this.moduleName}] VERBOSE:`, ...args);
    }
};

module.exports = NodeHelper.create({
    requestTimeout: 30000, // 30 seconds
    retryDelay: 300000, // 5 minutes
    maxRetries: 5,
    cacheFile: path.join(__dirname, 'cache', 'horoscope_cache.json'),
    imageCacheDir: path.join(__dirname, 'cache', 'images'),
    CHECK_WINDOW: 2 * 60 * 60 * 1000, // 2 hours in milliseconds
    MAX_CHECKS: 3,

    start: function() {
        console.log("Starting node helper for: " + this.name);
        this.retryCount = {};
        this.ensureCacheDirectoryExists();
        this.ensureImageCacheDirectoryExists();
        this.cache = null;
        this.config = null;
        Logger.setLevel(LogLevels.INFO);  // Set default log level
        Logger.info("Starting node helper");
    },

    log: function(message) {
        if (this.config && this.config.debug) {
            console.log(`[MMM-Starlight] ${message}`);
        }
    },

    async ensureCacheDirectoryExists() {
        const cacheDir = path.dirname(this.cacheFile);
        try {
            await fs.mkdir(cacheDir, { recursive: true });
            this.log(`Cache directory ensured: ${cacheDir}`);
        } catch (error) {
            console.error(`Error ensuring cache directory: ${error}`);
        }
    },

    async ensureImageCacheDirectoryExists() {
        try {
            await fs.mkdir(this.imageCacheDir, { recursive: true });
            this.log(`Image cache directory created: ${this.imageCacheDir}`);
        } catch (error) {
            console.error(`Error creating image cache directory: ${error}`);
        }
    },

async loadCache() {
    console.log(`${this.name}: Loading cache`);
    if (this.cache) {
        console.log(`${this.name}: Returning existing cache from memory`);
        return this.cache;
    }
    try {
        await this.ensureCacheDirectoryExists();
        const data = await fs.readFile(this.cacheFile, 'utf8');
        console.log(`${this.name}: Cache loaded successfully from file`);
        this.cache = JSON.parse(data);
        return this.cache;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`${this.name}: Cache file does not exist, creating a new one`);
            this.cache = {};
            await this.saveCache(this.cache);
            return this.cache;
        }
        console.error(`${this.name}: Error reading cache file:`, error);
        this.cache = {};
        return this.cache;
    }
},

    async saveCache(cache) {
        try {
            await fs.writeFile(this.cacheFile, JSON.stringify(cache, null, 2));
            this.log('Cache saved successfully to file');
        } catch (error) {
            console.error('Error saving cache:', error);
        }
    },

getHoroscope: async function(config) {
    this.log(`getHoroscope called for ${config.sign}, period: ${config.period}`);
    
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

    this.log(`Fetching horoscope from source: ${url}`);

    try {
        const response = await axios.get(url, { timeout: this.requestTimeout });
        if (response.data.success) {
            const now = new Date();
            let nextUpdate;
            switch(config.period) {
                case "daily":
                case "tomorrow":
                    nextUpdate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
                    break;
                case "weekly":
                    nextUpdate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                    break;
                case "monthly":
                    nextUpdate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                    break;
            }
            return {
                horoscope_data: response.data.data.horoscope_data,
                date: response.data.data.date,
                challenging_days: response.data.data.challenging_days,
                standout_days: response.data.data.standout_days,
                lastUpdate: now.toISOString(),
                nextUpdate: nextUpdate.toISOString()
            };
        } else {
            throw new Error("API returned unsuccessful response");
        }
    } catch (error) {
        console.error(`Error fetching horoscope for ${config.sign}, period: ${config.period}:`, error.message);
        throw error;
    }
},

scheduleUpdate: async function(sign, period) {
    this.log(`Checking if update is needed for ${sign} ${period} horoscope at ${new Date().toLocaleString()}`);
    try {
        const cache = await this.loadCache();
        if (!cache[sign]) {
            cache[sign] = {};
        }
        if (!cache[sign][period] || this.shouldUpdate(cache[sign][period], period)) {
            this.log(`Update needed for ${sign} ${period} horoscope. Starting update process.`);
            await this.performUpdateChecks(sign, period);
        } else {
            this.log(`No update needed for ${sign} ${period} horoscope.`);
            this.scheduleNextUpdate(sign, period);
        }
    } catch (error) {
        console.error(`Error in scheduleUpdate for ${sign} ${period}:`, error);
        this.sendSocketNotification("HOROSCOPE_RESULT", {
            success: false,
            sign: sign,
            period: period,
            message: `Error updating horoscope for ${sign} ${period}`,
            error: error.toString()
        });
    }
},

shouldUpdate: function(cachedData, period) {
    if (!cachedData || !cachedData.timestamp) return true;

    const now = new Date();
    const cacheTime = new Date(cachedData.timestamp);

    switch(period) {
        case "daily":
        case "tomorrow":
            return now.toDateString() !== cacheTime.toDateString();
        case "weekly":
            return (now - cacheTime) >= 7 * 24 * 60 * 60 * 1000;
        case "monthly":
            return now.getMonth() !== cacheTime.getMonth() || 
                   now.getFullYear() !== cacheTime.getFullYear();
        default:
            return true;
    }
},

performUpdateChecks: async function(sign, period) {
    let checksPerformed = 0;
    const startTime = Date.now();
    const endTime = startTime + this.CHECK_WINDOW;

    const performCheck = async () => {
        if (checksPerformed >= this.MAX_CHECKS || Date.now() >= endTime) {
            this.log(`Failed to update ${period} horoscope for ${sign} after ${checksPerformed} attempts`);
            this.scheduleNextUpdate(sign, period);
            return;
        }

        this.log(`Attempt ${checksPerformed + 1} to update ${sign} ${period} horoscope at ${new Date().toLocaleString()}`);
        if (await this.attemptUpdate(sign, period)) {
            this.log(`Successfully updated ${period} horoscope for ${sign}`);
            this.scheduleNextUpdate(sign, period);
            return;
        }

        checksPerformed++;
        const delay = await this.randomDelay(endTime);
        const nextAttemptTime = new Date(Date.now() + delay);
        this.log(`Next attempt for ${sign} ${period} horoscope scheduled for: ${nextAttemptTime.toLocaleString()}`);
        
        this.safeSetTimeout(performCheck, delay);
    };

    performCheck();
},

    attemptUpdate: async function(sign, period) {
        try {
            this.log(`Fetching ${period} horoscope for ${sign} from API`);
            const data = await this.getHoroscope({ sign, period });
            const cache = await this.loadCache();
            if (!cache[sign]) {
                cache[sign] = {};
            }
            cache[sign][period] = {
                ...data,
                timestamp: new Date().toISOString()
            };
            await this.saveCache(cache);
            this.log(`Cache updated for ${sign} ${period} horoscope at ${new Date().toLocaleString()}`);
            return true;
        } catch (error) {
            console.error(`Error updating horoscope for ${sign}, ${period} at ${new Date().toLocaleString()}:`, error);
            return false;
        }
    },

randomDelay: function(endTime) {
    const MAX_DELAY = 2147483647; // Maximum value for setTimeout (about 24.8 days)
    const now = Date.now();
    const maxDelay = Math.min(endTime - now, MAX_DELAY, 30 * 60 * 1000); // Max 30 minutes, MAX_DELAY, or time until endTime, whichever is smallest
    
    if (maxDelay <= 0) {
        return Promise.resolve(0); // Return immediately if endTime has passed
    }

    const delay = Math.floor(Math.random() * maxDelay);
    return new Promise(resolve => setTimeout(resolve, delay));
},

scheduleNextUpdate: function(sign, period) {
    const now = new Date();
    let nextUpdate;

    switch(period) {
        case "daily":
        case "tomorrow":
            nextUpdate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            break;
        case "weekly":
            nextUpdate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            break;
        case "monthly":
            nextUpdate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            break;
    }

    const delay = nextUpdate.getTime() - now.getTime();
    this.log(`Next update for ${sign} ${period} horoscope scheduled for: ${nextUpdate.toLocaleString()}`);

    this.safeSetTimeout(() => this.scheduleUpdate(sign, period), delay);
},

safeSetTimeout: function(callback, delay) {
    const MAX_DELAY = 2147483647; // Maximum value for setTimeout (about 24.8 days)

    if (delay <= MAX_DELAY) {
        setTimeout(callback, delay);
    } else {
        setTimeout(() => {
            this.safeSetTimeout(callback, delay - MAX_DELAY);
        }, MAX_DELAY);
    }
},

startUpdateTicker: function() {
    setInterval(async () => {
        try {
            await this.checkForUpdates();
        } catch (error) {
            console.error("Error in update ticker:", error);
        }
    }, 3600000); // Check every hour
},

checkForUpdates: async function() {
    const now = new Date();
    try {
        const cache = await this.loadCache();
        for (const sign of this.config.zodiacSign) {
            for (const period of this.config.period) {
                if (cache[sign] && cache[sign][period] && new Date(cache[sign][period].nextUpdate) <= now) {
                    await this.scheduleUpdate(sign, period);
                }
            }
        }
    } catch (error) {
        console.error("Error in checkForUpdates:", error);
    }
},

initializeCache: async function(config) {
    console.log(`${this.name}: Initializing cache for all configured zodiac signs and periods`);
    try {
        const cache = await this.loadCache();
        console.log(`${this.name}: Current cache:`, JSON.stringify(cache));
        for (const sign of config.zodiacSign) {
            for (const period of [...config.period, "tomorrow"]) {
                console.log(`${this.name}: Scheduling update for ${sign}, ${period}`);
                await this.scheduleUpdate(sign, period);
            }
        }
        this.startUpdateTicker();
        console.log(`${this.name}: Cache initialization completed`);
        this.sendSocketNotification("CACHE_INITIALIZED");
    } catch (error) {
        console.error(`${this.name}: Error initializing cache:`, error);
        this.sendSocketNotification("HOROSCOPE_RESULT", {
            success: false,
            message: "Error initializing cache",
            error: error.toString()
        });
    }
},

socketNotificationReceived: function(notification, payload) {
    Logger.debug(`Received socket notification: ${notification}`);
    console.log(`[MMM-Starlight] Received socket notification: ${notification}`);
    if (notification === "INIT") {
        console.log(`[MMM-Starlight] Received INIT notification`);
        if (payload && payload.config) {
            this.config = payload.config;
            console.log(`[MMM-Starlight] Configuration received:`, JSON.stringify(this.config));
            this.initializeCache(this.config).catch(error => {
                console.error(`[MMM-Starlight] Error initializing cache:`, error);
            });
        } else {
            console.error(`[MMM-Starlight] INIT notification received without config payload`);
        }
    } else if (notification === "GET_HOROSCOPE") {
        console.log(`[MMM-Starlight] Received GET_HOROSCOPE notification for ${payload.sign}, period: ${payload.period}`);
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
                console.error(`[MMM-Starlight] Error in getHoroscope:`, error);
                this.sendSocketNotification("HOROSCOPE_RESULT", { 
                    success: false, 
                    message: "An error occurred while fetching the horoscope.",
                    sign: payload.sign,
                    period: payload.period,
                    error: error.toString()
                });
            });
    } else if (notification === "GET_IMAGE") {
        console.log(`[MMM-Starlight] Received GET_IMAGE notification for ${payload.sign}`);
        this.getCachedImage(payload.sign)
            .then(imagePath => {
                this.sendSocketNotification("IMAGE_RESULT", {
                    success: true,
                    imagePath: imagePath,
                    sign: payload.sign
                });
            })
            .catch(error => {
                console.error(`[MMM-Starlight] Error in getCachedImage:`, error);
                this.sendSocketNotification("IMAGE_RESULT", {
                    success: false,
                    message: "An error occurred while fetching the image.",
                    sign: payload.sign,
                    error: error.toString()
                });
            });
    } else if (notification === "SIMULATE_MIDNIGHT_UPDATE") {
        console.log(`[MMM-Starlight] Received SIMULATE_MIDNIGHT_UPDATE notification`);
        this.simulateMidnightUpdate()
            .then(() => {
                console.log(`[MMM-Starlight] Midnight update simulation completed`);
                this.sendSocketNotification("MIDNIGHT_UPDATE_SIMULATED");
            })
            .catch(error => {
                console.error(`[MMM-Starlight] Error in simulateMidnightUpdate:`, error);
            });
    } else if (notification === "RESET_CACHE") {
        console.log(`[MMM-Starlight] Received RESET_CACHE notification`);
        this.resetCache()
            .then(() => {
                console.log(`[MMM-Starlight] Cache reset completed`);
                this.sendSocketNotification("CACHE_RESET_COMPLETE", {
                    success: true,
                    message: "Cache reset and data refreshed"
                });
            })
            .catch(error => {
                console.error(`[MMM-Starlight] Error resetting cache:`, error);
                this.sendSocketNotification("CACHE_RESET_COMPLETE", {
                    success: false,
                    message: "Error resetting cache",
                    error: error.toString()
                });
            });
    }
},

getCachedHoroscope: async function(config) {
    const cache = await this.loadCache();
    
    if (cache[config.sign] && 
        cache[config.sign][config.period] && 
        !this.shouldUpdate(cache[config.sign][config.period], config.period)) {
        this.log(`[CACHE HIT] Using cached data for ${config.sign}, period: ${config.period}`);
        return cache[config.sign][config.period];
    }
    
    this.log(`[CACHE MISS] No valid cached data found for ${config.sign}, period: ${config.period}. Fetching from API.`);
    return this.attemptUpdate(config.sign, config.period);
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
            this.log(`Image for ${sign} downloaded and cached`);
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
            Logger.debug(`Using cached image for ${sign}`);
            return `modules/${this.name}/cache/images/${sign}.png`;  // Return relative path
        } catch (error) {
            Logger.info(`No cached image found for ${sign}. Downloading...`);
            return await this.downloadAndCacheImage(sign);
        }
    },

    simulateMidnightUpdate: async function() {
        this.log("Updating daily horoscopes with tomorrow's data");
        const cache = await this.loadCache();

        for (const sign in cache) {
            if (cache[sign].daily && cache[sign].tomorrow) {
                cache[sign].daily = cache[sign].tomorrow;
                delete cache[sign].tomorrow;
                this.log(`Updated daily horoscope for ${sign}`);
                
                // Fetch new data for tomorrow
                try {
                    const newTomorrowData = await this.getHoroscope({ sign: sign, period: "tomorrow" });
                    cache[sign].tomorrow = {
                        ...newTomorrowData,
                        timestamp: new Date().toISOString()
                    };
		    this.log(`Fetched new tomorrow's data for ${sign}`);
                } catch (error) {
                    console.error(`Error fetching new tomorrow's horoscope for ${sign}:`, error);
                }
            }
        }

        await this.saveCache(cache);
        this.sendSocketNotification("MIDNIGHT_UPDATE_SIMULATED");
    },

resetCache: async function() {
    this.log("Resetting cache");
    try {
        // Clear the in-memory cache
        this.cache = null;
        
        // Delete the cache file
        await this.ensureCacheDirectoryExists();
        await fs.unlink(this.cacheFile).catch(error => {
            if (error.code !== 'ENOENT') {
                console.error(`Error deleting cache file:`, error);
            }
        });
        
        // Reinitialize the cache
        await this.initializeCache(this.config);
        
        // Force update for all configured signs and periods
        for (const sign of this.config.zodiacSign) {
            for (const period of this.config.period) {
                await this.attemptUpdate(sign, period);
            }
        }
        
        this.log("Cache reset and data refreshed");
        this.sendSocketNotification("CACHE_RESET_COMPLETE", {
            success: true,
            message: "Cache reset and data refreshed"
        });
    } catch (error) {
        console.error("Error resetting cache:", error);
        this.sendSocketNotification("CACHE_RESET_COMPLETE", {
            success: false,
            message: "Error resetting cache",
            error: error.toString()
        });
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
            this.log(`Retry attempt ${this.retryCount[config.sign]} of ${this.maxRetries} in ${this.retryDelay / 1000} seconds for ${config.sign}`);
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
    }
});
