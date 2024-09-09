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
        this.simulationMode = false;
        this.simulatedDate = null;
        this.scheduledJobs = {};
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
                this.simulateMidnightUpdate(payload);
                break;
            case "RESET_CACHE":
                this.resetCache();
                break;
        }
    },

fetchHoroscope: async function (period, zodiacSign) {
  try {
    let requestUrl;
    switch (period) {
      case "daily":
        requestUrl = `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${zodiacSign}&day=today`;
        break;
      case "tomorrow":
        requestUrl = `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${zodiacSign}&day=tomorrow`;
        break;
      case "weekly":
        requestUrl = `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/weekly?sign=${zodiacSign}`;
        break;
      case "monthly":
        requestUrl = `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/monthly?sign=${zodiacSign}`;
        break;
      default:
        throw new Error(`Invalid period: ${period}`);
    }

    console.log("[MMM-Starlight] Requesting URL:", requestUrl);

    const response = await axios.get(requestUrl);
    const data = response.data;

    // Log the fetched data
    console.log("[MMM-Starlight] Fetched horoscope data for", zodiacSign, ":", JSON.stringify(data, null, 2));

    return data;
  } catch (error) {
    console.error("[MMM-Starlight] Error fetching horoscope data for " + zodiacSign + ": ", error);
    return null;
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
        if (this.scheduledJobs.midnight) {
            this.scheduledJobs.midnight.cancel();
        }

        this.scheduledJobs.midnight = schedule.scheduleJob('0 0 * * *', () => {
            console.log(`[${this.name}] Triggering scheduled midnight update`);
            this.performMidnightUpdate();
        });

        console.log(`[${this.name}] Scheduled midnight update`);
    },

    performMidnightUpdate: async function() {
        console.log(`[${this.name}] Performing ${this.simulationMode ? 'simulated' : 'real'} midnight update`);
        const currentDate = this.simulationMode ? this.simulatedDate : moment();
        
        for (const sign of this.config.zodiacSign) {
            // Move tomorrow's data to today
            const tomorrowData = this.cache.get(sign, "tomorrow");
            if (tomorrowData) {
                this.cache.set(sign, "daily", tomorrowData);
                this.cache.set(sign, "tomorrow", null);
            }
            
            // Fetch new data for tomorrow
            await this.fetchAndUpdateCache(sign, "tomorrow");
            
            // Check if it's time for weekly update (Monday)
            if (currentDate.day() === 1) {
                await this.fetchAndUpdateCache(sign, "weekly");
            }
            
            // Check if it's time for monthly update (1st of the month)
            if (currentDate.date() === 1) {
                await this.fetchAndUpdateCache(sign, "monthly");
            }
        }
        
        this.updateStatus.daily = false;
        this.updateStatus.tomorrow = false;
        await this.cache.saveToFile();
        
        if (this.simulationMode) {
            this.sendSocketNotification("MIDNIGHT_UPDATE_SIMULATED", {
                date: this.simulatedDate.format('YYYY-MM-DD'),
                updatedWeekly: this.simulatedDate.day() === 1,
                updatedMonthly: this.simulatedDate.date() === 1
            });
            this.simulationMode = false;
            this.simulatedDate = null;
        }

        this.sendSocketNotification("MIDNIGHT_UPDATE_COMPLETED");
    },

    schedule6AMUpdate() {
        if (this.scheduledJobs.sixAM) {
            this.scheduledJobs.sixAM.cancel();
        }

        this.scheduledJobs.sixAM = schedule.scheduleJob('0 6 * * *', () => {
            console.log(`[${this.name}] Triggering scheduled 6 AM update`);
            this.perform6AMUpdate();
        });

        console.log(`[${this.name}] Scheduled 6 AM update`);
    },

    async perform6AMUpdate() {
        console.log(`[${this.name}] Performing 6 AM update`);
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
        this.sendSocketNotification("SIX_AM_UPDATE_COMPLETED");
    },


    scheduleHourlyChecks() {
        if (this.scheduledJobs.hourly) {
            this.scheduledJobs.hourly.cancel();
        }

        this.scheduledJobs.hourly = schedule.scheduleJob('0 * * * *', () => {
            console.log(`[${this.name}] Triggering scheduled hourly check`);
            this.performHourlyCheck();
        });

        console.log(`[${this.name}] Scheduled hourly checks`);
    },

    async performHourlyCheck() {
        console.log(`[${this.name}] Performing hourly check`);
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

        this.sendSocketNotification("HOURLY_CHECK_COMPLETED");
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
            console.log(`[${this.name}] Fetching and updating cache for ${sign}, period: ${period}`);
            console.log(`[${this.name}] Cache contents before update:`, JSON.stringify(this.cache.memoryCache, null, 2));

            const data = await this.fetchFromAPI(sign, period);
            const now = moment();
            let nextUpdate;
            switch(period) {
                case "daily":
                    nextUpdate = null;
                    break;
                case "tomorrow":
                    nextUpdate = now.hour() < 6 ? now.clone().set({hour: 6, minute: 0, second: 0, millisecond: 0}) 
                                                : now.clone().add(1, 'day').set({hour: 6, minute: 0, second: 0, millisecond: 0});
                    break;
                case "weekly":
                    nextUpdate = now.clone().add(1, 'week').startOf('isoWeek');
                    break;
                case "monthly":
                    nextUpdate = now.clone().add(1, 'month').startOf('month');
                    break;
            }
            this.cache.set(sign, period, {
                ...data,
                lastUpdate: now.toISOString(),
                nextUpdate: nextUpdate ? nextUpdate.toISOString() : null
            });
            await this.cache.saveToFile();
            console.log(`[${this.name}] Updated ${period} horoscope for ${sign}`);
            console.log(`[${this.name}] Cache contents after update:`, JSON.stringify(this.cache.memoryCache, null, 2));

            // Send notification to frontend about the update
            this.sendSocketNotification("CACHE_UPDATED", { sign, period });
            console.log(`[${this.name}] Sent CACHE_UPDATED notification to frontend for ${sign}, period: ${period}`);

            return this.cache.get(sign, period);
        } catch (error) {
            console.error(`[${this.name}] Error fetching ${period} horoscope for ${sign}:`, error);
            throw error;
        }
    },

    fetchFromAPI: async function(sign, period) {
        let url;
        const date = this.simulationMode ? this.simulatedDate : moment();
        
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
                    date: date.format('YYYY-MM-DD'),
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

    simulateMidnightUpdate: function(payload) {
        this.simulationMode = true;
        this.simulatedDate = moment(payload.date);
        console.log(`[${this.name}] Starting simulation for date: ${this.simulatedDate.format('YYYY-MM-DD')}`);
        this.performMidnightUpdate();
    },

resetCache: async function () {
  try {
    console.log("[MMM-Starlight] Resetting cache...");

    // Clear the in-memory cache
    this.cache.memoryCache = {};

    // Re-fetch fresh data for all zodiac signs
    const zodiacSigns = this.config.zodiacSign;
    const periods = this.config.period;

    for (const sign of zodiacSigns) {
      console.log(`[MMM-Starlight] Fetching horoscope data for ${sign}...`);
      this.cache.memoryCache[sign] = {};

      for (const period of periods) {
        const data = await this.fetchHoroscope(period, sign);
        if (data) {
          this.cache.memoryCache[sign][period] = data;
          console.log(`[MMM-Starlight] Fetched and stored ${period} data for ${sign}.`);
          // Notify frontend of each update
          this.sendSocketNotification("CACHE_UPDATED", { sign, period });
        } else {
          console.error(`[MMM-Starlight] Failed to fetch ${period} data for ${sign}.`);
        }
      }
    }

    // Save the reset cache to file
    await this.cache.saveToFile();
    console.log("[MMM-Starlight] Cache reset and saved successfully.");

    // Notify frontend that cache reset is complete
    this.sendSocketNotification("CACHE_RESET_COMPLETE", { success: true });
  } catch (error) {
    console.error("[MMM-Starlight] Error during cache reset:", error);
    this.sendSocketNotification("CACHE_RESET_COMPLETE", { success: false, error: error.toString() });
  }
},

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
            console.log("[HoroscopeCache] Cache loaded successfully from file");
            console.log("[HoroscopeCache] Cache contents:", JSON.stringify(this.memoryCache, null, 2));
            return this.memoryCache;
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log("[HoroscopeCache] Cache file does not exist, creating a new one");
                this.memoryCache = {};
                await this.saveToFile();  // This will create the file
            } else {
                console.error("[HoroscopeCache] Error reading cache file:", error);
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
            console.log("[HoroscopeCache] Cache saved successfully to file");
        } catch (error) {
            console.error("[HoroscopeCache] Error saving cache:", error);
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

    async reset() {
        try {
            // Remove the cache file if it exists
            await fs.unlink(this.cacheFile);
            console.log("[HoroscopeCache] Cache file deleted successfully.");

            // Clear in-memory cache
            this.memoryCache = {};

            // Recreate the cache file
            await this.saveToFile();
            console.log("[HoroscopeCache] Cache reset and recreated successfully.");
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log("[HoroscopeCache] Cache file does not exist, nothing to reset.");
            } else {
                console.error("[HoroscopeCache] Error resetting cache file:", error);
            }
        }
    }
}
