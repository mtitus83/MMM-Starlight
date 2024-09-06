// node_helper.js

var NodeHelper = require("node_helper");
var axios = require("axios");
const fs = require('fs').promises;
const path = require('path');
const moment = require('moment');

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node helper for: " + this.name);
        this.cache = new HoroscopeCache(path.join(__dirname, 'cache', 'horoscope_cache.json'));
        this.config = null;
        this.updateStatus = {
            daily: false,
            weekly: false,
            monthly: false
        };
    },

    socketNotificationReceived: function(notification, payload) {
        console.log(`[${this.name}] Received socket notification: ${notification}`);
        
        switch(notification) {
            case "INIT":
                this.handleInit(payload);
                break;
            case "GET_HOROSCOPE":
                this.handleGetHoroscope(payload);
                break;
            case "GET_IMAGE":
                this.handleGetImage(payload);
                break;
            case "SIMULATE_MIDNIGHT_UPDATE":
                this.simulateMidnightUpdate();
                break;
            case "RESET_CACHE":
                this.resetCache();
                break;
        }
    },

    handleInit: function(payload) {
        if (payload && payload.config) {
            this.config = payload.config;
            console.log(`[${this.name}] Configuration received:`, JSON.stringify(this.config));
            this.initializeCache().catch(error => {
                console.error(`[${this.name}] Error initializing cache:`, error);
            });
        } else {
            console.error(`[${this.name}] INIT notification received without config payload`);
        }
    },

    async initializeCache() {
        console.log(`${this.name}: Initializing cache for all configured zodiac signs and periods`);
        try {
            await this.cache.initialize();
            for (const sign of this.config.zodiacSign) {
                for (const period of [...this.config.period, "tomorrow"]) {
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

    handleGetHoroscope: function(payload) {
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
                console.error(`[${this.name}] Error in getHoroscope:`, error);
                this.sendSocketNotification("HOROSCOPE_RESULT", { 
                    success: false, 
                    message: "An error occurred while fetching the horoscope.",
                    sign: payload.sign,
                    period: payload.period,
                    error: error.toString()
                });
            });
    },

    handleGetImage: function(payload) {
        const imagePath = `modules/${this.name}/assets/${payload.sign.toLowerCase()}.png`;
        this.sendSocketNotification("IMAGE_RESULT", {
            success: true,
            imagePath: imagePath,
            sign: payload.sign
        });
    },

    async getCachedHoroscope(config) {
        const cachedData = this.cache.get(config.sign, config.period);
        
        if (cachedData && !this.shouldUpdate(cachedData, config.period)) {
            console.log(`[CACHE HIT] Using cached data for ${config.sign}, period: ${config.period}`);
            return cachedData;
        }
        
        console.log(`[CACHE MISS] No valid cached data found for ${config.sign}, period: ${config.period}. Fetching from API.`);
        return this.fetchAndUpdateCache(config.sign, config.period);
    },

    shouldUpdate(cachedData, period) {
        if (!cachedData || !cachedData.timestamp) return true;

        const now = moment();
        const cacheTime = moment(cachedData.timestamp);

        switch(period) {
            case "daily":
            case "tomorrow":
                return !now.isSame(cacheTime, 'day');
            case "weekly":
                return now.diff(cacheTime, 'weeks') >= 1;
            case "monthly":
                return !now.isSame(cacheTime, 'month');
            default:
                return true;
        }
    },

    async fetchAndUpdateCache(sign, period) {
        try {
            const data = await this.fetchFromAPI(sign, period);
            this.cache.set(sign, period, {
                ...data,
                timestamp: new Date().toISOString()
            });
            await this.cache.saveToFile();
            console.log(`Updated ${period} horoscope for ${sign}`);
            return data;
        } catch (error) {
            console.error(`Error fetching ${period} horoscope for ${sign}:`, error);
            throw error;
        }
    },

    async fetchFromAPI(sign, period) {
        let url;
        switch(period) {
            case "daily":
                url = `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${sign}&day=today`;
                break;
            case "tomorrow":
                url = `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${sign}&day=tomorrow`;
                break;
            case "weekly":
                url = `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/weekly?sign=${sign}`;
                break;
            case "monthly":
                url = `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/monthly?sign=${sign}`;
                break;
            default:
                throw new Error("Invalid period specified");
        }

        console.log(`Fetching horoscope from source: ${url}`);

        try {
            const response = await axios.get(url, { timeout: 30000 });
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
            console.error(`Error fetching horoscope for ${sign}, period: ${period}:`, error.message);
            throw error;
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

    async getCachedImage(sign) {
        const imageCacheDir = path.join(__dirname, 'cache', 'images');
        const imagePath = path.join(imageCacheDir, `${sign}.png`);
        try {
            await fs.access(imagePath);
            console.log(`Using cached image for ${sign}`);
            return `modules/${this.name}/cache/images/${sign}.png`;  // Return relative path
        } catch (error) {
            console.log(`No cached image found for ${sign}. Downloading...`);
            return await this.downloadAndCacheImage(sign);
        }
    },

    async downloadAndCacheImage(sign) {
        const imageUrl = this.getZodiacImageUrl(sign);
        const imageCacheDir = path.join(__dirname, 'cache', 'images');
        const imagePath = path.join(imageCacheDir, `${sign}.png`);

        try {
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
            await fs.mkdir(imageCacheDir, { recursive: true });
            await fs.writeFile(imagePath, response.data);
            console.log(`Image for ${sign} downloaded and cached`);
            return `modules/${this.name}/cache/images/${sign}.png`;  // Return relative path
        } catch (error) {
            console.error(`Error downloading image for ${sign}:`, error);
            throw error;
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

    async checkForUpdates() {
        const now = moment();
        console.log(`Checking for updates at ${now.format()}`);
        try {
            for (const sign of this.config.zodiacSign) {
                for (const period of this.config.period) {
                    const cachedData = this.cache.get(sign, period);
                    if (!cachedData || this.shouldUpdate(cachedData, period)) {
                        console.log(`Update due for ${sign} ${period} horoscope`);
                        await this.scheduleUpdate(sign, period);
                    } else {
                        console.log(`No update needed for ${sign} ${period} horoscope`);
                    }
                }
            }
        } catch (error) {
            console.error("Error in checkForUpdates:", error);
        }
    },

    async scheduleUpdate(sign, period) {
        console.log(`Scheduling update for ${sign} ${period} horoscope`);
        const now = moment();
        const sixAM = moment().set({hour: 6, minute: 0, second: 0, millisecond: 0});
        
        if (now.isBefore(sixAM)) {
            const delay = sixAM.diff(now);
            setTimeout(() => this.performUpdate(sign, period), delay);
        } else {
            this.performUpdate(sign, period);
        }
    },

    async performUpdate(sign, period) {
        if (this.updateStatus[period]) return;

        try {
            console.log(`Performing update for ${sign} ${period} horoscope`);
            await this.fetchAndUpdateCache(sign, period);
            this.updateStatus[period] = true;
        } catch (error) {
            console.error(`Error updating ${period} horoscope for ${sign}:`, error);
        }

        // Schedule next check in an hour
        setTimeout(() => {
            this.updateStatus[period] = false;
            this.performUpdate(sign, period);
        }, 3600000);
    },

    async simulateMidnightUpdate() {
        console.log("Updating daily horoscopes with tomorrow's data");
        const cache = await this.cache.loadFromFile();

        for (const sign in cache) {
            if (cache[sign].daily && cache[sign].tomorrow) {
                console.log(`Updated daily horoscope for ${sign}`);
                cache[sign].daily = cache[sign].tomorrow;
                delete cache[sign].tomorrow;
                
                try {
                    const newTomorrowData = await this.fetchFromAPI(sign, "tomorrow");
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

        await this.cache.saveToFile(cache);
        this.sendSocketNotification("MIDNIGHT_UPDATE_SIMULATED");
    },

    async resetCache() {
        console.log("Resetting cache");
        try {
            await this.cache.clear();
            await this.initializeCache();
            console.log("Cache reset and data refreshed");
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
    }
});

class HoroscopeCache {
    constructor(cacheFile) {
        this.cacheFile = cacheFile;
        this.memoryCache = {};
    }

    async initialize() {
        await this.loadFromFile();
    }

    async loadFromFile() {
        try {
            const data = await fs.readFile(this.cacheFile, 'utf8');
            this.memoryCache = JSON.parse(data);
            console.log("Cache loaded successfully from file");
            return this.memoryCache;
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log("Cache file does not exist, creating a new one");
                this.memoryCache = {};
                await this.saveToFile();
            } else {
                console.error("Error reading cache file:", error);
            }
            return this.memoryCache;
        }
    }

    async saveToFile() {
        try {
            await fs.writeFile(this.cacheFile, JSON.stringify(this.memoryCache, null, 2));
            console.log("Cache saved successfully to file");
        } catch (error) {
            console.error("Error saving cache:", error);
        }
    }

    get(sign, period) {
        return this.memoryCache[sign]?.[period];
    }

    set(sign, period, data) {
        if (!this.memoryCache[sign]) this.memoryCache[sign] = {};
        this.memoryCache[sign][period] = data;
    }

    async clear() {
        this.memoryCache = {};
        await this.saveToFile();
    }
}
