const NodeHelper = require("node_helper");
const axios = require("axios");
const fs = require('fs').promises;
const path = require('path');

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node helper for: " + this.name);
        this.cacheDir = path.join(__dirname, 'cache');
        this.cacheFile = path.join(this.cacheDir, 'horoscope_cache.json');
        this.imageDir = path.join(this.cacheDir, 'images');
        this.cache = null;
        this.lastCacheUpdateLog = null;
        this.ensureCacheDirs().then(() => {
            this.loadCacheFromFile();
        });
    },

    ensureCacheDirs: async function() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
            await fs.mkdir(this.imageDir, { recursive: true });
        } catch (error) {
            console.error("Error creating cache directories:", error);
        }
    },

    checkForUpdates: function() {
        for (let sign of this.config.zodiacSign) {
            for (let period of this.config.period) {
                this.checkAndUpdateHoroscope(sign, period);
            }
        }
    },

    checkAndUpdateHoroscope: async function(sign, period) {
        const now = new Date();
        const cachedData = this.cache.horoscopes[sign]?.[period];
    
        if (!this.shouldCheckForUpdate(sign, period, now)) {
            this.log('debug', `Not time to check ${period} horoscope for ${sign} yet.`);
            return;
        }
    
        try {
            // TODO: Replace this with actual API call
            const newContent = await this.fetchHoroscopeFromAPI(sign, period);
            
            if (!cachedData || newContent !== cachedData.content) {
                this.log('debug', `New content found for ${sign} (${period}). Updating cache.`);
this.updateCache(sign, period, newContent);
            } else {
                this.log('debug', `No changes in content for ${sign} (${period}). Updating last check time.`);
                this.updateLastCheckTime(sign, period);
            }
    
            this.markAsCheckedForPeriod(sign, period, now);
        } catch (error) {
            this.log('error', `Error checking horoscope for ${sign} (${period}): ${error.message}`);
            if (error.stack) {
                this.log('error', `Stack trace: ${error.stack}`);
            }
        }
    },

    fetchHoroscopeFromAPI: async function(sign, period) {
        // TODO: Implement actual API call here
        // This is a placeholder function that should be replaced with real API integration
        return `This is a placeholder horoscope for ${sign} (${period}). Replace with actual API call.`;
    },

    markAsCheckedForPeriod: function(sign, period, now) {
        if (!this.cache.horoscopes[sign]) {
            this.cache.horoscopes[sign] = {};
        }
        if (!this.cache.horoscopes[sign][period]) {
            this.cache.horoscopes[sign][period] = {};
        }
        
        this.cache.horoscopes[sign][period].lastChecked = now.toISOString();
        this.cache.horoscopes[sign][period].nextCheckDate = this.getNextCheckDate(period, now).toISOString();
        
        this.saveCacheToFile();
    },

    getNextCheckDate: function(period, now) {
        const nextCheck = new Date(now);
        switch(period) {
            case 'daily':
            case 'tomorrow':
                nextCheck.setMinutes(nextCheck.getMinutes() + 45);
                break;
            case 'weekly':
                nextCheck.setDate(nextCheck.getDate() + 7);
                break;
            case 'monthly':
                nextCheck.setMonth(nextCheck.getMonth() + 1);
                nextCheck.setDate(1);
                break;
            default:
                nextCheck.setDate(nextCheck.getDate() + 1);
        }
        return nextCheck;
    },

    updateLastCheckTime: function(sign, period) {
        if (this.cache.horoscopes[sign]?.[period]) {
            this.cache.horoscopes[sign][period].lastChecked = new Date().toISOString();
            this.saveCacheToFile();
        }
    },

    shouldCheckForUpdate: function(sign, period, now) {
        const cachedData = this.cache.horoscopes[sign]?.[period];
        if (!cachedData) return true;
    
        const lastChecked = new Date(cachedData.lastChecked);
    
        switch(period) {
            case 'daily':
            case 'tomorrow':
                return (now - lastChecked) >= 45 * 60 * 1000;
            case 'weekly':
                return now.getDay() === 1 && this.isFirstCheckOfDay(lastChecked, now);
            case 'monthly':
                return now.getDate() === 1 && this.isFirstCheckOfDay(lastChecked, now);
            default:
                return this.isFirstCheckOfDay(lastChecked, now);
        }
    },
    
    isFirstCheckOfDay: function(lastChecked, now) {
        return lastChecked.getDate() !== now.getDate() || lastChecked.getMonth() !== now.getMonth() || lastChecked.getFullYear() !== now.getFullYear();
    },

    getImage: function(sign) {
        this.log('debug', `Getting image for ${sign}`);
        if (this.cache && this.cache.images && this.cache.images[sign]) {
            const imagePath = this.cache.images[sign];
            this.log('debug', `Returning cached image path for ${sign}: ${imagePath}`);
            // Check if the file exists
            fs.access(imagePath, fs.constants.F_OK, (err) => {
                if (err) {
                    this.log('error', `Cached image file does not exist: ${imagePath}`);
                    this.fetchImage(sign);
                } else {
                    this.log('debug', `Cached image file exists: ${imagePath}`);
                }
            });
            return imagePath;
        } else {
            this.log('debug', `No cached image found for ${sign}, fetching from Wikimedia`);
            this.fetchImage(sign);
            return null;
        }
    },

    fetchImage: async function(sign) {
        var capitalizedSign = sign.charAt(0).toUpperCase() + sign.slice(1);
        var svgFileName = `${capitalizedSign}_symbol_(outline).svg`;
        var encodedFileName = encodeURIComponent(svgFileName);
        var pngUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodedFileName}?width=240`;
        
        const imagePath = path.join(this.imageDir, `${sign}.png`);

        try {
            this.log('debug', `Fetching image for ${sign} from ${pngUrl}`);
            const response = await axios({
                method: 'get',
                url: pngUrl,
                responseType: 'arraybuffer'
            });

            await fs.writeFile(imagePath, response.data);

            this.cache.images[sign] = imagePath;
            this.log('debug', `Image for ${sign} fetched and saved to ${imagePath}`);
            this.saveCacheToFile();
        } catch (error) {
            this.log('error', `Error fetching image for ${sign}: ${error.message}`);
            this.cache.images[sign] = null;
        }
    },

    loadCacheFromFile: async function() {
        try {
            await fs.access(this.cacheFile, fs.constants.F_OK);
            const data = await fs.readFile(this.cacheFile, 'utf8');
            this.cache = JSON.parse(data);
            this.log('info', `Cache file loaded from ${this.cache.timestamp}`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.log('info', "Cache file does not exist. A new cache will be built when the module initializes.");
            } else {
                console.error("Error reading cache file:", error);
            }
            this.cache = null;
        }
    },

    saveCacheToFile: async function() {
        try {
            await fs.writeFile(this.cacheFile, JSON.stringify(this.cache, null, 2));
            
            const now = new Date();
            if (!this.lastCacheUpdateLog || (now - this.lastCacheUpdateLog) > 5 * 60 * 1000) {
                this.log('info', `Cache file updated at ${now.toISOString()}`);
                this.lastCacheUpdateLog = now;
            }
        } catch (error) {
            console.error("Error writing cache file:", error);
        }
    },

    updateCache: function(sign, period, content) {
        if (!this.cache.horoscopes[sign]) {
            this.cache.horoscopes[sign] = {};
        }
    
        if (period === 'daily' && this.cache.horoscopes[sign]?.tomorrow) {
            this.log('debug', `Rotating tomorrow's horoscope to today for ${sign} at ${new Date().toISOString()}`);
            this.cache.horoscopes[sign].daily = this.cache.horoscopes[sign].tomorrow;
            delete this.cache.horoscopes[sign].tomorrow;
        }
    
        this.log('debug', `Updating cache for ${sign} (${period}) at ${new Date().toISOString()}`);
        this.cache.horoscopes[sign][period] = {
            content: content,
            timestamp: new Date().toISOString(),
            lastChecked: new Date().toISOString()
        };
    
        this.saveCacheToFile();
        this.sendSocketNotification("HOROSCOPE_UPDATED", { sign, period, data: content });
    },

    socketNotificationReceived: function(notification, payload) {
        this.log('debug', `Received notification: ${notification}`);
        if (notification === "INIT_MODULE") {
            this.config = payload;
            if (!this.cache) {
                this.log('debug', "Cache not found, building new cache");
                this.buildCache(payload).then(() => {
                    this.log('debug', "Cache built, sending initial data");
                    this.sendHoroscopesToMain();
                }).catch(error => {
                    this.log('error', `Error building cache: ${error}`);
                });
            } else {
                this.log('debug', "Cache found, sending initial data");
                this.sendHoroscopesToMain();
            }
        } else if (notification === "GET_IMAGE") {
            const imagePath = this.getImage(payload.sign);
            this.sendSocketNotification("IMAGE_RESULT", {
                sign: payload.sign,
                path: imagePath
            });
        } else if (notification === "GET_IMAGE_DATA") {
            this.getImageData(payload.sign, payload.path);
        } else if (notification === "CHECK_FOR_UPDATES") {
            this.checkForUpdates();
        }
    },
    sendHoroscopesToMain: function() {
        for (let sign of this.config.zodiacSign) {
            for (let period of this.config.period) {
                const horoscope = this.getHoroscope(sign, period);
                this.sendSocketNotification("HOROSCOPE_RESULT", {
                    sign: sign,
                    period: period,
                    data: horoscope
                });
            }
            const imagePath = this.getImage(sign);
            this.sendSocketNotification("IMAGE_RESULT", {
                sign: sign,
                path: imagePath
            });
        }
        this.sendSocketNotification("CACHE_BUILT");
    },

    getHoroscope: function(sign, period) {
        if (this.cache.horoscopes[sign] && this.cache.horoscopes[sign][period]) {
            return this.cache.horoscopes[sign][period];
        }
        return { content: "Updating horoscope...", timestamp: new Date().toISOString() };
    },

    log: function(level, message) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${this.name} [${level.toUpperCase()}]: ${message}`);
    },

getImageData: async function(sign, imagePath) {
    this.log('debug', `Attempting to read image file for ${sign} from path: ${imagePath}`);
    try {
        const data = await fs.readFile(imagePath);
        this.log('debug', `Successfully read image file for ${sign}. File size: ${data.length} bytes`);
        const base64Image = data.toString('base64');
        const dataUrl = `data:image/png;base64,${base64Image}`;
        this.log('debug', `Sending IMAGE_DATA_RESULT notification for ${sign}`);
        this.sendSocketNotification("IMAGE_DATA_RESULT", {
            sign: sign,
            dataUrl: dataUrl
        });
    } catch (err) {
        this.log('error', `Error reading image file for ${sign}: ${err}`);
    }
},

    buildCache: async function(config) {
        try {
            this.config = config;
            this.cache = {
                timestamp: new Date().toISOString(),
                horoscopes: {},
                images: {}
            };
    
            const fetchPromises = this.config.zodiacSign.flatMap(sign => 
                this.config.period.map(period => this.fetchHoroscopeFromAPI(sign, period))
                    .concat(this.fetchImage(sign))
            );
    
            await Promise.all(fetchPromises);
    
            await this.saveCacheToFile();
            this.log('info', `Cache file built successfully at ${this.cache.timestamp}`);
        } catch (error) {
            this.log('error', `Error building cache: ${error}`);
            throw error;
        }
    },
});
