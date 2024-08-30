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
                const currentTime = this.getCurrentDate().getTime();
                if (cachedData && currentTime < cachedData.nextUpdateTime) {
                    console.log(`Using valid cached data for ${sign} (${period})`);
                    this.sendSocketNotification("HOROSCOPE_RESULT", {
                        success: true,
                        sign: sign,
                        period: period,
                        data: cachedData.data,
                        cached: true,
                        imagePath: cachedData.imagePath
                    });
                } else {
                    console.log(`No valid cached data for ${sign} (${period}). Adding to request queue.`);
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
            const currentTime = this.getCurrentDate().getTime();
    
            if (cachedData && currentTime < cachedData.nextUpdateTime) {
                console.log(`Using valid cached horoscope for ${config.sign} (${config.period})`);
                return cachedData;
            }
    
            console.log(`Fetching new horoscope for ${config.sign} (${config.period}) from source`);
            const horoscope = await this.fetchHoroscope(config.sign, config.period);
            const imagePath = await this.cacheImage(`https://www.sunsigns.com/wp-content/themes/sunsigns/assets/images/_sun-signs/${config.sign}/wrappable.png`, config.sign);
            
            const result = { 
                data: horoscope,
                sign: config.sign, 
                period: config.period, 
                cached: false,
                imagePath: imagePath,
                timestamp: currentTime,
                nextUpdateTime: this.calculateNextUpdateTime(config.period, currentTime)
            };
            this.updateCache(config.sign, config.period, result);
            return result;
        } catch (error) {
            console.error(`Error in getHoroscope for ${config.sign} (${config.period}):`, error.message);
            return {
                error: true,
                message: error.message,
                sign: config.sign,
                period: config.period
            };
        }
    },

    calculateNextUpdateTime: function(period, currentTime) {
        let nextUpdateTime;
        const currentDate = new Date(currentTime);
    
        switch(period) {
            case 'daily':
                // Set to 3 AM the next day
                nextUpdateTime = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 1, 3, 0, 0, 0).getTime();
                break;
            case 'tomorrow':
                // Set to 3 AM two days from now
                nextUpdateTime = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 2, 3, 0, 0, 0).getTime();
                break;
            case 'weekly':
                // Set to next Monday at 3 AM
                const daysUntilMonday = (1 + 7 - currentDate.getDay()) % 7;
                nextUpdateTime = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + daysUntilMonday, 3, 0, 0, 0).getTime();
                break;
            case 'monthly':
                // Set to the 1st of next month at 3 AM
                nextUpdateTime = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1, 3, 0, 0, 0).getTime();
                break;
            case 'yearly':
                // Set to January 1st of next year at 3 AM
                nextUpdateTime = new Date(currentDate.getFullYear() + 1, 0, 1, 3, 0, 0, 0).getTime();
                break;
            default:
                // Default to 24 hours from now
                nextUpdateTime = currentTime + (24 * 60 * 60 * 1000);
        }
    
        return nextUpdateTime;
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
    
        console.log(`Fetching horoscope for ${sign} (${period}) from source`);
    
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
    
            console.log(`Fetched horoscope for ${sign} (${period}) from source. Length: ${horoscope.length} characters`);
            return horoscope;
        } catch (error) {
            console.error(`Error fetching horoscope for ${sign} (${period}) from source:`, error.message);
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
    
            console.log(`Cleaned ${period} horoscope for ${sign}:`, text.substring(0, 100) + '...');
            return text;
        } catch (error) {
            console.error(`Error cleaning horoscope text for ${sign} (${period}):`, error);
            return text; // Return original text if cleaning fails
        }
    },

    updateCache: function(sign, period, content) {
        if (!this.cache[sign]) {
            this.cache[sign] = {};
        }
    
        this.cache[sign][period] = content;
    
        const updateDate = new Date(content.timestamp);
        const nextUpdateDate = new Date(content.nextUpdateTime);
        console.log(`Updated cache for ${sign} (${period}) on ${updateDate.toLocaleString()}. Next update scheduled for ${nextUpdateDate.toLocaleString()}. Data: ${content.data.substring(0, 50)}...`);
        this.saveCache();
    },
    
        const updateDate = new Date(currentTime);
        const nextUpdateDate = new Date(nextUpdateTime);
        console.log(`Updated cache for ${sign} (${period}) on ${updateDate.toLocaleString()}. ${isFirstCache ? 'First cache, immediate update scheduled.' : `Next update scheduled for ${nextUpdateDate.toLocaleString()}`}. Data: ${content.data.substring(0, 50)}...`);
        this.saveCache();
    },
      
    getCachedHoroscope: function(sign, period) {
        console.log(`Checking cache for ${sign} (${period})`);
        if (!this.cache[sign] || !this.cache[sign][period]) {
            console.log(`No cached data found for ${sign} (${period})`);
            return null;
        }
        const cachedData = this.cache[sign][period];
        console.log(`Retrieved cached data for ${sign} (${period}). Next update scheduled for: ${new Date(cachedData.nextUpdateTime).toLocaleString()}`);
        return cachedData;
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

    getRandomInterval: function(minHours, maxHours) {
        return Math.floor(Math.random() * (maxHours - minHours + 1) + minHours) * 60 * 60 * 1000;
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
