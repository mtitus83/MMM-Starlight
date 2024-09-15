var NodeHelper = require("node_helper");
var axios = require("axios");
const fs = require('fs').promises;
const path = require('path');
const moment = require('moment');

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
        this.apiCallCount = 0;
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
                this.simulateMidnightUpdate(payload);
                break;
            case "RESET_CACHE":
                this.resetCache();
                break;
            case "PERFORM_MIDNIGHT_UPDATE":
                this.performMidnightUpdate();
                break;
            case "MODULE_STARTED":
                this.initializeModule();
                break;
        }
    },

    initializeModule: function() {
        console.log(`[${this.name}] Initializing module`);
        if (this.config) {
            this.initializeCache().catch(error => {
                console.error(`[${this.name}] Error initializing cache:`, error);
                this.sendSocketNotification("ERROR", { error: "Failed to initialize cache" });
            });
        } else {
            console.error(`[${this.name}] Configuration not set. Cannot initialize.`);
            this.sendSocketNotification("ERROR", { error: "Configuration not set" });
        }
    },

    log: function(message) {
        console.log(`[${this.name}] ${new Date().toISOString()} - ${message}`);
    },

    handleInit: function(payload) {
        if (payload && payload.config) {
            this.config = payload.config;
            this.log(`Configuration received: ${JSON.stringify(this.config)}`);
            this.initializeCache().catch(error => {
                this.log(`Error initializing cache: ${error.message}`);
                this.sendSocketNotification("ERROR", { error: error.toString() });
            });
        } else {
            this.log("ERROR: INIT notification received without config payload");
            this.sendSocketNotification("ERROR", { error: "No config received" });
        }
    },

    initializeCache: async function() {
        console.log(`[${this.name}] Initializing cache`);
        try {
            await this.cache.loadFromFile();
            console.log(`[${this.name}] Cache loaded from file`);

            const zodiacSign = this.config.zodiacSign[0];
            const period = this.config.period[0];
            
            console.log(`[${this.name}] Attempting to fetch initial horoscope for ${zodiacSign}, ${period}`);
            const data = await this.fetchAndUpdateCache(zodiacSign, period);
            
            if (data) {
                console.log(`[${this.name}] Successfully fetched initial horoscope`);
                this.sendSocketNotification("MODULE_INITIALIZED", {});
            } else {
                throw new Error("Failed to fetch initial horoscope");
            }

            this.scheduleUpdates();
        } catch (error) {
            console.error(`[${this.name}] Error in initializeCache:`, error);
            this.sendSocketNotification("ERROR", { error: error.toString() });
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
                    
                    this.sendSocketNotification("CACHE_UPDATED", { 
                        sign, 
                        period: "daily", 
                        data: updatedDailyData 
                    });
                } else {
                    this.log(`No tomorrow data available for ${sign}, skipping rotation`);
                }
            }

            this.log("Rotation complete. Now fetching tomorrow's horoscope data from API...");
            await this.fetchTomorrowsHoroscopeData();
            
            await this.cache.saveToFile();
            this.log("Tomorrow's horoscope data fetched and cache updated.");

            this.sendSocketNotification("MIDNIGHT_UPDATE_COMPLETED", { 
                timestamp: currentDate.toISOString(),
                updatedCache: this.cache.memoryCache
            });

        } catch (error) {
            this.log(`Error during midnight update: ${error}`);
            this.sendSocketNotification("MIDNIGHT_UPDATE_ERROR", { error: error.toString() });
        }

        this.lastMidnightUpdate = new Date();
    },

    fetchTomorrowsHoroscopeData: async function() {
        try {
            for (const sign of this.config.zodiacSign) {
                const newHoroscope = await this.fetchFromAPI(sign, "tomorrow");
                if (newHoroscope) {
                    this.cache.set(sign, "tomorrow", newHoroscope);
                    this.log(`Updated cache for ${sign} with new tomorrow's horoscope.`);
                } else {
                    this.log(`Failed to fetch new data for ${sign}'s tomorrow horoscope. Keeping existing data.`);
                }
            }
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
    },

    perform6AMUpdate: async function() {
        this.log("Starting 6 AM update process");
        const currentDate = this.simulationMode ? this.simulatedDate : moment();
        this.log(`Current date for update: ${currentDate.format('YYYY-MM-DD HH:mm:ss')}`);

        try {
            for (const sign of this.config.zodiacSign) {
                this.log(`Processing 6 AM update for ${sign}`);
                
                await this.fetchAndUpdateCache(sign, "tomorrow");
                
                if (currentDate.day() === 1) {
                    this.log(`It's Monday. Performing weekly update for ${sign}`);
                    await this.fetchAndUpdateCache(sign, "weekly");
                }
                
                if (currentDate.date() === 1) {
                    this.log(`It's the first of the month. Performing monthly update for ${sign}`);
                    await this.fetchAndUpdateCache(sign, "monthly");
                }
            }
            
            this.log("Saving updated cache to file after 6 AM update");
            await this.cache.saveToFile();
            
            this.log("6 AM update completed successfully");
            this.last6AMUpdate = new Date();
            this.sendSocketNotification("SIX_AM_UPDATE_COMPLETED", { 
                timestamp: this.last6AMUpdate.toISOString(),
                updatedCache: this.cache.memoryCache
            });
        } catch (error) {
            this.log(`ERROR during 6 AM update: ${error.message}`);
            console.error(error);
            this.sendSocketNotification("SIX_AM_UPDATE_ERROR", { error: error.toString() });
        }

        this.last6AMUpdate = new Date();
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
        
        if (now.hour() >= 6 && !this.updateStatus.tomorrow) {
            for (const sign of this.config.zodiacSign) {
                await this.checkAndUpdateHoroscope(sign, "tomorrow");
            }
        }
        
        if (now.day() === 1) {
            for (const sign of this.config.zodiacSign) {
                await this.checkAndUpdateHoroscope(sign, "weekly");
            }
        }
        
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
            sign: this.config.zodiacSign[0],
            period: "daily"
        };
    }

    if (!payload.sign || !payload.period) {
        this.log(`Invalid payload received: missing sign or period. Using default values. Payload: ${JSON.stringify(payload)}`);
        payload.sign = payload.sign || this.config.zodiacSign[0];
        payload.period = payload.period || "daily";
    }

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

class HoroscopeCache {
    constructor(nodeHelperContext, cacheFilePath) {
        this.nodeHelper = nodeHelperContext;
        this.cacheFile = cacheFilePath;
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
                await this.saveToFile();
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
            await fs.unlink(this.cacheFile);
            console.log("[HoroscopeCache] Cache file deleted successfully.");

            this.memoryCache = {};

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

    async saveToFile() {
        try {
            const dir = path.dirname(this.cacheFile);
            await fs.mkdir(dir, { recursive: true });

            await fs.writeFile(this.cacheFile, JSON.stringify(this.memoryCache, null, 2));
            console.log("[HoroscopeCache] Cache saved successfully to file");
            console.log("[HoroscopeCache] Cache contents:", JSON.stringify(this.memoryCache, null, 2));

            this.nodeHelper.sendSocketNotification("CACHE_UPDATED", { success: true });
        } catch (error) {
            console.error("[HoroscopeCache] Error saving cache:", error);
        }
    }
}
