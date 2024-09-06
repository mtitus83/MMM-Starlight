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
            tomorrow: false,
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
            this.scheduleUpdates();
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

    scheduleUpdates() {
        this.scheduleMidnightUpdate();
        this.schedule6AMUpdate();
        this.scheduleHourlyChecks();
    },

    scheduleMidnightUpdate() {
        const now = moment();
        const midnight = moment(now).add(1, 'day').startOf('day');
        const msUntilMidnight = midnight.diff(now);

        setTimeout(() => {
            this.performMidnightUpdate();
            this.scheduleMidnightUpdate(); // Reschedule for the next day
        }, msUntilMidnight);
    },

    async performMidnightUpdate() {
        console.log("Performing midnight update");
        for (const sign of this.config.zodiacSign) {
            const tomorrowData = this.cache.get(sign, "tomorrow");
            if (tomorrowData) {
                this.cache.set(sign, "daily", tomorrowData);
                this.cache.set(sign, "tomorrow", null); // Clear tomorrow's data
            }
            // Fetch new data for tomorrow
            await this.fetchAndUpdateCache(sign, "tomorrow");
        }
        this.updateStatus.daily = false;
        this.updateStatus.tomorrow = false;
        await this.cache.saveToFile();
    },

    schedule6AMUpdate() {
        const now = moment();
        const sixAM = moment(now).startOf('day').add(6, 'hours');
        if (now.isAfter(sixAM)) {
            sixAM.add(1, 'day');
        }
        const msUntil6AM = sixAM.diff(now);

        setTimeout(() => {
            this.perform6AMUpdate();
            this.schedule6AMUpdate(); // Reschedule for the next day
        }, msUntil6AM);
    },

    async perform6AMUpdate() {
        console.log("Performing 6 AM update");
        for (const sign of this.config.zodiacSign) {
            await this.checkAndUpdateHoroscope(sign, "daily");
            await this.checkAndUpdateHoroscope(sign, "tomorrow");
            
            if (moment().day() === 1) { // Monday
                await this.checkAndUpdateHoroscope(sign, "weekly");
            }
            
            if (moment().date() === 1) {
                await this.checkAndUpdateHoroscope(sign, "monthly");
            }
        }
    },

    scheduleHourlyChecks() {
        setInterval(async () => {
            await this.performHourlyCheck();
        }, 3600000); // Check every hour
    },

async performHourlyCheck() {
    console.log("Performing hourly check");
    const now = moment();
    
    // Only check 'tomorrow' horoscope after 6 AM
    if (now.hour() >= 6 && !this.updateStatus.tomorrow) {
        for (const sign of this.config.zodiacSign) {
            await this.checkAndUpdateHoroscope(sign, "tomorrow");
        }
    }
    
    // Check weekly on Mondays
    if (now.day() === 1) { // Monday
        for (const sign of this.config.zodiacSign) {
            await this.checkAndUpdateHoroscope(sign, "weekly");
        }
    }
    
    // Check monthly on the 1st of the month
    if (now.date() === 1) {
        for (const sign of this.config.zodiacSign) {
            await this.checkAndUpdateHoroscope(sign, "monthly");
        }
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
    if (!cachedData || !cachedData.lastUpdate) return true;
    if (period === "daily") return false; // Daily is always up to date due to midnight swap

    const now = moment();
    const lastUpdate = moment(cachedData.lastUpdate);
    const nextUpdate = cachedData.nextUpdate ? moment(cachedData.nextUpdate) : null;

    if (nextUpdate) {
        return now.isAfter(nextUpdate);
    } else {
        // If no nextUpdate, use period-specific logic
        switch(period) {
            case "tomorrow":
                return now.hour() >= 6 && now.isAfter(lastUpdate, 'day');
            case "weekly":
                return now.isAfter(lastUpdate, 'week') && now.day() === 1; // Monday
            case "monthly":
                return now.isAfter(lastUpdate, 'month') && now.date() === 1;
            default:
                return true;
        }
    }
},

async fetchAndUpdateCache(sign, period) {
    try {
        const data = await this.fetchFromAPI(sign, period);
        const now = moment();
        let nextUpdate;
        switch(period) {
            case "daily":
                // Daily doesn't need a next update time because it's swapped at midnight
                nextUpdate = null;
                break;
            case "tomorrow":
                // Next update for tomorrow's horoscope is at 6 AM today or tomorrow if it's past 6 AM
                nextUpdate = now.hour() < 6 ? now.clone().set({hour: 6, minute: 0, second: 0, millisecond: 0}) 
                                            : now.clone().add(1, 'day').set({hour: 6, minute: 0, second: 0, millisecond: 0});
                break;
            case "weekly":
                nextUpdate = now.clone().add(1, 'week').startOf('isoWeek'); // Next Monday
                break;
            case "monthly":
                nextUpdate = now.clone().add(1, 'month').startOf('month'); // First day of next month
                break;
        }
        this.cache.set(sign, period, {
            ...data,
            lastUpdate: now.toISOString(),
            nextUpdate: nextUpdate ? nextUpdate.toISOString() : null
        });
        await this.cache.saveToFile();
        console.log(`Updated ${period} horoscope for ${sign}`);
        return this.cache.get(sign, period);
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

    async checkAndUpdateHoroscope(sign, period) {
        const cachedData = this.cache.get(sign, period);
        if (!cachedData || this.shouldUpdate(cachedData, period)) {
            try {
                await this.fetchAndUpdateCache(sign, period);
                if (period === "daily" || period === "tomorrow") {
                    this.updateStatus[period] = true;
                }
                return true;
            } catch (error) {
                console.error(`Error updating ${period} horoscope for ${sign}:`, error);
                return false;
            }
        }
        return false;
    },

    async simulateMidnightUpdate() {
        console.log("Simulating midnight update");
        await this.performMidnightUpdate();
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
                await this.saveToFile();  // This will create the file
            } else {
                console.error("Error reading cache file:", error);
            }
            return this.memoryCache;
        }
    }

    async saveToFile() {
        try {
            // Ensure the directory exists before writing the file
            const dir = path.dirname(this.cacheFile);
            await fs.mkdir(dir, { recursive: true });

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
