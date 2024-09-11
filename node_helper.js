// node_helper.js

var NodeHelper = require("node_helper");
var axios = require("axios");
const fs = require('fs').promises;
const path = require('path');
const moment = require('moment');
let isPerformingMidnightUpdate = false;


let schedule;
try {
    schedule = require('node-schedule');
    console.log("node-schedule successfully imported");
} catch (error) {
    console.error("Failed to import node-schedule:", error);
}

function parsePattern(text) {
    let currentPattern = new Date().toLocaleString('default', { month: 'long' });
    let parsedText = atob('SG9yb3Njb3Bl');
    let middleText = atob('UHJlbWl1bQ==');

    const pattern = new RegExp(`\\b(${currentPattern})\\b ${middleText} ${parsedText}`, 'i');
    let match = pattern.exec(text);

    if (match) {
        let month = match[1];
        let toEncode = `${month} ` + text.slice(match.index + month.length, match.index + match[0].length);
        let encodedString = Buffer.from(toEncode).toString('base64');
        text = text.replace(match[0], '');
    }

    return text;
}

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node helper for: " + this.name);
	this.cache = new HoroscopeCache(this, path.join(__dirname, 'cache', 'horoscope_cache.json'));
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
        this.lastMidnightUpdate = null;
        this.last6AMUpdate = null;
    },

socketNotificationReceived: function(notification, payload) {
    this.log(`Received socket notification: ${notification}`);
    
    switch(notification) {
        case "INIT":
            this.handleInit(payload);
            break;
        case "GET_HOROSCOPE":
            this.handleGetHoroscope(payload);
            break;
        case "SIMULATE_MIDNIGHT_UPDATE":
            this.log("Received request to simulate midnight update");
            this.simulateMidnightUpdate(payload);
            break;
        case "RESET_CACHE":
            this.resetCache();
            break;
        case "PERFORM_MIDNIGHT_UPDATE":
            this.log("Received request to perform midnight update");
            this.performMidnightUpdate();
            break;
    }
},


    log: function(message) {
        console.log(`[${this.name}] ${new Date().toISOString()} - ${message}`);
    },

socketNotificationReceived: function(notification, payload) {
    this.log(`Received socket notification: ${notification}`);
    
    switch(notification) {
        case "INIT":
            this.handleInit(payload);
            break;
        case "GET_HOROSCOPE":
            this.handleGetHoroscope(payload);
            break;
        case "PERFORM_MIDNIGHT_UPDATE":
            this.performMidnightUpdate();
            break;
        case "SIMULATE_MIDNIGHT_UPDATE":
            this.log("Received request to simulate midnight update");
            this.simulateMidnightUpdate(payload);
            break;
        case "RESET_CACHE":
            this.resetCache();
            break;
    }
},

    performMidnightUpdate: async function() {
        this.log("Starting midnight update process");
        const currentDate = this.simulationMode ? this.simulatedDate : moment();
        this.log(`Current date for update: ${currentDate.format('YYYY-MM-DD HH:mm:ss')}`);

        try {
            for (const sign of this.config.zodiacSign) {
                this.log(`Processing midnight update for ${sign}`);
                
                // Move tomorrow's data to today
                const tomorrowData = this.cache.get(sign, "tomorrow");
                if (tomorrowData) {
                    this.log(`Moving tomorrow's data to today's slot for ${sign}`);
                    const updatedDailyData = {
                        ...tomorrowData,
                        lastUpdate: currentDate.toISOString(),
                        nextUpdate: currentDate.clone().add(1, 'day').startOf('day').toISOString()
                    };
                    this.cache.set(sign, "daily", updatedDailyData);
                    this.log(`New state for ${sign}: ${JSON.stringify(updatedDailyData, null, 2)}`);
                    
                    // Notify frontend about the updated daily horoscope
                    this.sendSocketNotification("CACHE_UPDATED", { 
                        sign, 
                        period: "daily", 
                        data: updatedDailyData 
                    });
                } else {
                    this.log(`No tomorrow data available for ${sign}, skipping rotation`);
                }
            }

            // After rotating, trigger the API call to fetch only "tomorrow" horoscopes
            this.log("Rotation complete. Now fetching tomorrow's horoscope data from API...");
            await this.fetchTomorrowsHoroscopeData();  // Only fetch "tomorrow"
            
            // Save the updated cache to file after all updates
            await this.cache.saveToFile();
            this.log("Tomorrow's horoscope data fetched and cache updated.");

            // Notify frontend that the midnight update is complete
            this.sendSocketNotification("MIDNIGHT_UPDATE_COMPLETED", { timestamp: currentDate.toISOString() });

        } catch (error) {
            this.log(`Error during midnight update: ${error}`);
        }
    },

   fetchTomorrowsHoroscopeData: async function() {
        try {
            for (const sign of this.config.zodiacSign) {
                // Fetch data from the API for "tomorrow" only
                const newHoroscope = await this.fetchFromAPI(sign, "tomorrow");
                if (newHoroscope) {
                    const updatedData = {
                        ...newHoroscope,
                        lastUpdate: moment().toISOString(),
                        nextUpdate: moment().add(1, 'day').set({hour: 6, minute: 0, second: 0, millisecond: 0}).toISOString()
                    };
                    // Update the cache with the new "tomorrow" data
                    this.cache.set(sign, "tomorrow", updatedData);
                    this.log(`Updated cache for ${sign} with new tomorrow's horoscope.`);
                    
                    // Notify frontend about the updated tomorrow horoscope
                    this.sendSocketNotification("CACHE_UPDATED", { 
                        sign, 
                        period: "tomorrow", 
                        data: updatedData 
                    });
                } else {
                    this.log(`Failed to fetch new data for ${sign}'s tomorrow horoscope. Keeping existing data.`);
                }
            }
        } catch (error) {
            this.log(`Error fetching tomorrow's horoscope data: ${error}`);
        }
    },

checkSchedule() {
    if (this.scheduledJobs.midnight) {
        console.log(`[${this.name}] Next midnight update scheduled for: ${this.scheduledJobs.midnight.nextInvocation()}`);
    } else {
        console.log(`[${this.name}] No midnight update job scheduled`);
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
            this.log(`Configuration received: ${JSON.stringify(this.config)}`);
            this.initializeCache().catch(error => {
                this.log(`Error initializing cache: ${error.message}`);
            });
            this.scheduleMidnightUpdate();  // Schedule the midnight update when initializing
        } else {
            this.log("ERROR: INIT notification received without config payload");
        }
    },

async initializeCache() {
    console.log(`${this.name}: Initializing cache for all configured zodiac signs and periods`);
    try {
        await this.cache.loadFromFile();
        const currentDate = moment();
        let cacheReport = "Cache status at initialization:";
        const isInitialBuild = this.isInitialCacheBuild();

        for (const sign of this.config.zodiacSign) {
            cacheReport += `\n${sign}:`;
            for (const period of this.config.period) {
                const cachedData = this.cache.get(sign, period);
                let needsFetch = false;

                if (isInitialBuild) {
                    // On initial build, fetch all periods including daily
                    needsFetch = true;
                } else if (period !== 'daily') {
                    // For non-daily periods on subsequent runs, check if update is needed
                    needsFetch = !cachedData || !cachedData.nextUpdate || currentDate.isAfter(moment(cachedData.nextUpdate));
                }

                cacheReport += ` ${period} (${needsFetch ? "needs fetch" : "cached"})`;
                
                if (needsFetch) {
                    this.log(`Fetching new data for ${sign}, period: ${period}`);
                    await this.fetchAndUpdateCache(sign, period);
                } else {
                    this.log(`Using cached data for ${sign}, period: ${period}`);
                }
            }
        }

        this.log(cacheReport);
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

isInitialCacheBuild() {
    // Check if the cache is empty or if it's the first time running
    return Object.keys(this.cache.memoryCache).length === 0 || !this.cache.get(this.config.zodiacSign[0], 'daily');
},

isHoroscopeValid(cachedData, period, currentDate) {
    if (!cachedData || !cachedData.lastUpdate) return false;

    const lastUpdate = moment(cachedData.lastUpdate);
    const nextUpdate = cachedData.nextUpdate ? moment(cachedData.nextUpdate) : null;

    if (nextUpdate && currentDate.isBefore(nextUpdate)) {
        return true;
    }

    switch(period) {
        case "daily":
            return currentDate.isSame(lastUpdate, 'day');
        case "tomorrow":
            return currentDate.isSame(lastUpdate, 'day') && currentDate.hour() < 6;
        case "weekly":
            return currentDate.isSame(lastUpdate, 'week');
        case "monthly":
            return currentDate.isSame(lastUpdate, 'month');
        default:
            return false;
    }
},

    scheduleUpdates: function() {
    	if (!this.scheduledJobs) {
       		this.scheduledJobs = {};
    	}

        if (!schedule) {
            console.error("node-schedule is not available. Skipping scheduling.");
            return;
        }
        this.scheduleMidnightUpdate();
        this.schedule6AMUpdate();
        this.scheduleHourlyChecks();
    },

    scheduleMidnightUpdate: function() {
        this.log("Attempting to schedule midnight update");
        if (!schedule) {
            this.log("ERROR: node-schedule is not available. Cannot schedule midnight update.");
            return;
        }

        if (this.scheduledJobs.midnight) {
            this.log("Cancelling existing midnight job before rescheduling");
            this.scheduledJobs.midnight.cancel();
        }

        this.scheduledJobs.midnight = schedule.scheduleJob('0 0 * * *', () => {
            this.log("Midnight job triggered by schedule");
            this.performMidnightUpdate();
        });

        if (this.scheduledJobs.midnight) {
            this.log(`Successfully scheduled midnight update. Next run: ${this.scheduledJobs.midnight.nextInvocation()}`);
        } else {
            this.log("ERROR: Failed to schedule midnight update job");
        }

        // Add a check every minute to ensure we don't miss the update
        setInterval(() => {
            const now = new Date();
            if (now.getHours() === 0 && now.getMinutes() === 0 && (!this.lastMidnightUpdate || this.lastMidnightUpdate.getDate() !== now.getDate())) {
                this.log("Midnight reached and update hasn't run yet. Triggering update.");
                this.performMidnightUpdate();
            }
        }, 60000);
    },

performMidnightUpdate: async function() {
    this.log("Starting midnight update process");
    const currentDate = this.simulationMode ? this.simulatedDate : moment();
    this.log(`Current date for update: ${currentDate.format('YYYY-MM-DD HH:mm:ss')}`);

    try {
        for (const sign of this.config.zodiacSign) {
            this.log(`Processing midnight update for ${sign}`);
            
            // Move tomorrow's data to today
            const tomorrowData = this.cache.get(sign, "tomorrow");
            if (tomorrowData) {
                this.log(`Moving tomorrow's data to today's slot for ${sign}`);
                this.cache.set(sign, "daily", tomorrowData);
                this.log(`New state for ${sign}: ${JSON.stringify(this.cache.memoryCache[sign], null, 2)}`);
            } else {
                this.log(`No tomorrow data available for ${sign}, skipping rotation`);
            }
        }

        // After rotating, trigger the API call to fetch only "tomorrow" horoscopes
        this.log("Rotation complete. Now fetching tomorrow's horoscope data from API...");
        await this.fetchTomorrowsHoroscopeData();  // Only fetch "tomorrow"
        this.log("Tomorrow's horoscope data fetched and cache updated.");

        // Notify frontend to update
        this.sendSocketNotification("CACHE_UPDATED", this.cache.memoryCache);

    } catch (error) {
        this.log(`Error during midnight update: ${error}`);
    }
},

fetchTomorrowsHoroscopeData: async function() {
    try {
        for (const sign of this.config.zodiacSign) {
            // Fetch data from the API for "tomorrow" only
            const newHoroscope = await this.fetchFromAPI(sign, "tomorrow");
            if (newHoroscope) {
                // Update the cache with the new "tomorrow" data
                this.cache.set(sign, "tomorrow", newHoroscope);
                this.log(`Updated cache for ${sign} with new tomorrow's horoscope.`);
            } else {
                this.log(`Failed to fetch new data for ${sign}'s tomorrow horoscope. Keeping existing data.`);
            }
        }
        // Save the updated cache to file
        await this.cache.saveToFile();
    } catch (error) {
        this.log(`Error fetching tomorrow's horoscope data: ${error}`);
    }
},

    schedule6AMUpdate: function() {
        this.log("Attempting to schedule 6 AM update");
        if (!schedule) {
            this.log("ERROR: node-schedule is not available. Cannot schedule 6 AM update.");
            return;
        }

        if (this.scheduledJobs.sixAM) {
            this.log("Cancelling existing 6 AM job before rescheduling");
            this.scheduledJobs.sixAM.cancel();
        }

        this.scheduledJobs.sixAM = schedule.scheduleJob('0 6 * * *', () => {
            this.log("6 AM job triggered by schedule");
            this.perform6AMUpdate();
        });

        if (this.scheduledJobs.sixAM) {
            this.log(`Successfully scheduled 6 AM update. Next run: ${this.scheduledJobs.sixAM.nextInvocation()}`);
        } else {
            this.log("ERROR: Failed to schedule 6 AM update job");
        }

        // Add a check every minute to ensure we don't miss the update
        setInterval(() => {
            const now = new Date();
            if (now.getHours() === 6 && now.getMinutes() === 0 && (!this.last6AMUpdate || this.last6AMUpdate.getDate() !== now.getDate())) {
                this.log("6 AM reached and update hasn't run yet. Triggering update.");
                this.perform6AMUpdate();
            }
        }, 60000);
    },

perform6AMUpdate: async function() {
    this.log("Starting 6 AM update process");
    const currentDate = this.simulationMode ? this.simulatedDate : moment();
    this.log(`Current date for update: ${currentDate.format('YYYY-MM-DD HH:mm:ss')}`);

    try {
        for (const sign of this.config.zodiacSign) {
            this.log(`Processing 6 AM update for ${sign}`);
            
            // Fetch new data for tomorrow only
            this.log(`Fetching new data for tomorrow for ${sign}`);
            await this.fetchAndUpdateCache(sign, "tomorrow");
            
            // Check if it's time for weekly update (Monday)
            if (currentDate.day() === 1) {
                this.log(`It's Monday. Performing weekly update for ${sign}`);
                await this.fetchAndUpdateCache(sign, "weekly");
            }
            
            // Check if it's time for monthly update (1st of the month)
            if (currentDate.date() === 1) {
                this.log(`It's the first of the month. Performing monthly update for ${sign}`);
                await this.fetchAndUpdateCache(sign, "monthly");
            }
        }
        
        this.log("Saving updated cache to file after 6 AM update");
        await this.cache.saveToFile();
        
        this.log("6 AM update completed successfully");
        this.last6AMUpdate = new Date();
        this.sendSocketNotification("SIX_AM_UPDATE_COMPLETED", { timestamp: this.last6AMUpdate.toISOString() });
    } catch (error) {
        this.log(`ERROR during 6 AM update: ${error.message}`);
        console.error(error);
    }
},

    // ... (keep other existing methods)

    log: function(message) {
        console.log(`[${this.name}] ${new Date().toISOString()} - ${message}`);
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
    this.log(`Received request to get horoscope with payload: ${JSON.stringify(payload)}`);

    if (!payload || Object.keys(payload).length === 0) {
        this.log("Received empty payload in handleGetHoroscope, using default values");
        payload = {
            sign: this.config.zodiacSign[0],  // Use the first configured sign
            period: "daily"  // Default to daily horoscope
        };
    }

    if (!payload.sign || !payload.period) {
        this.log(`Invalid payload received: missing sign or period. Using default values. Payload: ${JSON.stringify(payload)}`);
        payload.sign = payload.sign || this.config.zodiacSign[0];
        payload.period = payload.period || "daily";
    }

    // Proceed with getting the horoscope using the payload (now with default values if it was empty)
    this.getCachedHoroscope(payload.sign, payload.period)
        .then(data => {
            if (data) {
                this.log(`Successfully retrieved horoscope for ${payload.sign}, period: ${payload.period}`);
                this.sendSocketNotification("HOROSCOPE_RESULT", { 
                    success: true,
                    data: data,
                    sign: payload.sign,
                    period: payload.period
                });
            } else {
                this.log(`No data found for ${payload.sign}, period: ${payload.period}`);
                this.sendSocketNotification("HOROSCOPE_RESULT", { 
                    success: false,
                    message: "No data available",
                    sign: payload.sign,
                    period: payload.period
                });
            }
        })
        .catch(error => {
            this.log(`Error in getHoroscope for ${payload.sign}, period: ${payload.period}: ${error}`);
            this.sendSocketNotification("HOROSCOPE_RESULT", { 
                success: false, 
                message: "An error occurred while fetching the horoscope.",
                sign: payload.sign,
                period: payload.period,
                error: error.toString()
            });
        });
},

    async getCachedHoroscope(sign, period) {
        const cachedData = this.cache.get(sign, period);
        
        if (cachedData && !this.shouldUpdate(cachedData, period)) {
            console.log(`[CACHE HIT] Using cached data for ${sign}, period: ${period}`);
            return cachedData;
        }
        
        console.log(`[CACHE MISS] No valid cached data found for ${sign}, period: ${period}. Fetching from API.`);
        return this.fetchAndUpdateCache(sign, period);
    },

    shouldUpdate(cachedData, period) {
        if (!cachedData || !cachedData.lastUpdate || !cachedData.nextUpdate) return true;

        const now = moment();
        const nextUpdate = moment(cachedData.nextUpdate);

        // If current time is past the next update time, we should update
        return now.isAfter(nextUpdate);
    },

    async fetchAndUpdateCache(sign, period) {
        try {
            console.log(`[${this.name}] Fetching new data for ${sign}, period: ${period}`);
            const data = await this.fetchFromAPI(sign, period);
            
            if (data) {
                const now = moment();
                let nextUpdate;
                switch(period) {
                    case "daily":
                        nextUpdate = now.clone().add(1, 'day').startOf('day');
                        break;
                    case "tomorrow":
                        nextUpdate = now.clone().add(1, 'day').set({hour: 6, minute: 0, second: 0, millisecond: 0});
                        break;
                    case "weekly":
                        nextUpdate = now.clone().add(1, 'week').startOf('isoWeek');
                        break;
                    case "monthly":
                        nextUpdate = now.clone().add(1, 'month').startOf('month');
                        break;
                }
                
                const updatedData = {
                    ...data,
                    lastUpdate: now.toISOString(),
                    nextUpdate: nextUpdate.toISOString()
                };

                this.cache.set(sign, period, updatedData);
                
                await this.cache.saveToFile();
                console.log(`[${this.name}] Updated ${period} horoscope for ${sign}`);
                
                // Send notification to frontend about the update
                this.sendSocketNotification("CACHE_UPDATED", { sign, period, data: updatedData });
                
                return updatedData;
            } else {
                console.log(`[${this.name}] No new data fetched for ${sign}, period: ${period}`);
                return null;
            }
        } catch (error) {
            console.error(`[${this.name}] Error fetching ${period} horoscope for ${sign}:`, error);
            return null;
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
            console.error(`Invalid period specified: ${period}`);
            return null; // Return null instead of throwing an error
    }

    if (!url) {
        console.error(`URL not set for period: ${period}`);
        return null;
    }

    console.log(`Fetching horoscope from source: ${url}`);

    try {
        const response = await axios.get(url, { timeout: 30000 });
        if (response.data.success) {
            const processedHoroscope = parsePattern(response.data.data.horoscope_data);
            return {
                horoscope_data: processedHoroscope,
                date: date.format('YYYY-MM-DD'),
                challenging_days: response.data.data.challenging_days,
                standout_days: response.data.data.standout_days
            };
        } else {
            console.error("API returned unsuccessful response");
            return null;
        }
    } catch (error) {
        console.error(`Error fetching horoscope for ${sign}, period: ${period}:`, error.message);
        return null;
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

    async saveToFile() {
        try {
            const dir = path.dirname(this.cacheFile);
            await fs.mkdir(dir, { recursive: true });

            await fs.writeFile(this.cacheFile, JSON.stringify(this.memoryCache, null, 2));
            console.log("[HoroscopeCache] Cache saved successfully to file");
            console.log("[HoroscopeCache] Cache contents:", JSON.stringify(this.memoryCache, null, 2));

            // Use nodeHelper reference to send notification
            this.nodeHelper.sendSocketNotification("CACHE_UPDATED", { success: true });
        } catch (error) {
            console.error("[HoroscopeCache] Error saving cache:", error);
        }
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
          this.sendSocketNotification("CACHE_UPDATED", { success: true, sign, period });
        } else {
          console.error(`[MMM-Starlight] Failed to fetch ${period} data for ${sign}.`);
        }
      }
    }

    // After all data is fetched and stored, save the cache to file
    await this.cache.saveToFile();

    // Notify frontend that the entire cache reset is complete
    this.sendSocketNotification("CACHE_RESET_COMPLETE", { success: true });
    console.log("[MMM-Starlight] Cache reset and saved successfully.");

  } catch (error) {
    console.error("[MMM-Starlight] Error during cache reset:", error);
    this.sendSocketNotification("CACHE_RESET_COMPLETE", { success: false, error: error.toString() });
  }
}

});

class HoroscopeCache {
    constructor(nodeHelperContext, cacheFilePath) {
        this.nodeHelper = nodeHelperContext;
        this.cacheFile = cacheFilePath;
        this.memoryCache = {};
        this.saveToFile = this.saveToFile.bind(this);  // Bind the context
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
