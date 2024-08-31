const NodeHelper = require("node_helper");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require('fs').promises;
const path = require('path');

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node helper for: " + this.name);
        this.cacheDir = path.join(__dirname, 'cache');
        this.cacheFile = path.join(this.cacheDir, 'horoscope_cache.json');
        this.imageDir = path.join(this.cacheDir, 'images');
        this.cache = null;
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

    sendInitialData: function(config) {
        this.log('debug', "Sending initial data from cache");
        this.log('debug', `Cache contents: ${JSON.stringify(this.cache, null, 2)}`);
        
        for (let sign of config.zodiacSign) {
            for (let period of config.period) {
                const horoscope = this.getHoroscope(sign, period);
                this.sendSocketNotification("HOROSCOPE_RESULT", {
                    sign: sign,
                    period: period,
                    data: horoscope
                });
                this.log('debug', `Sent horoscope for ${sign}, ${period}`);
            }
            const imagePath = this.getImage(sign);
            this.sendSocketNotification("IMAGE_RESULT", {
                sign: sign,
                path: imagePath
            });
            this.log('debug', `Sent image path for ${sign}`);
        }
        this.sendSocketNotification("CACHE_BUILT");
        this.log('debug', "Sent CACHE_BUILT notification");
    },

    getHoroscopeUrl: function(sign, period) {
        let baseUrl = 'https://www.sunsigns.com/horoscopes';
        if (period === 'tomorrow') {
            return `${baseUrl}/daily/${sign}/tomorrow`;
        } else if (period === 'yearly') {
            const currentYear = new Date().getFullYear();
            return `${baseUrl}/yearly/${currentYear}/${sign}`;
        } else {
            return `${baseUrl}/${period}/${sign}`;
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

    buildCache: async function(config) {
        try {
            this.config = config;
            const zodiacSigns = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];
            const periods = ['daily', 'tomorrow', 'weekly', 'monthly', 'yearly'];
    
            this.cache = {
                timestamp: new Date().toISOString(),
                horoscopes: {},
                images: {}
            };
    
            const fetchPromises = zodiacSigns.flatMap(sign => 
                periods.map(period => this.fetchHoroscope(sign, period))
                    .concat(this.fetchImage(sign))
            );
    
            await Promise.all(fetchPromises);
    
            await this.saveCacheToFile();
            this.log('info', `Cache file built successfully at ${this.cache.timestamp}`);
    
            if (this.config.debug && this.config.test) {
                this.simulateDateChange(this.config.test);
            }
        } catch (error) {
            this.log('error', `Error building cache: ${error}`);
            throw error; // Re-throw the error if you want it to propagate
        }
    },

    fetchHoroscope: async function(sign, period) {
        if (this.cache.horoscopes[sign] && this.cache.horoscopes[sign][period]) {
            const cachedData = this.cache.horoscopes[sign][period];
            const cacheAge = new Date() - new Date(cachedData.timestamp);
            if (cacheAge < this.getCacheValidityPeriod(period)) {
                this.log('debug', `Using cached ${period} horoscope for ${sign}`);
                return;
            }
        }

        const url = this.getHoroscopeUrl(sign, period);
        try {
            const response = await axios.get(url, { timeout: 10000 }); // 10 seconds timeout
            const $ = cheerio.load(response.data);
            const horoscope = $('.horoscope-content p').text().trim();
            this.cache.horoscopes[sign] = this.cache.horoscopes[sign] || {};
            this.cache.horoscopes[sign][period] = {
                content: horoscope,
                timestamp: new Date().toISOString()
            };
            this.log('debug', `Fetched ${period} horoscope for ${sign} from ${url}`);
        } catch (error) {
            console.error(`Error fetching ${period} horoscope for ${sign}:`, error);
        }
    },

    fetchImage: async function(sign) {
        const url = `https://www.sunsigns.com/wp-content/themes/sunsigns/assets/images/_sun-signs/${sign}/wrappable.png`;
        const imagePath = path.join(this.imageDir, `${sign}.png`);
        try {
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            await fs.writeFile(imagePath, response.data);
            this.cache.images[sign] = imagePath;
            this.log('debug', `Fetched image for ${sign} from ${url}`);
        } catch (error) {
            this.log('error', `Error fetching image for ${sign}: ${error.message}`);
            // Don't store the image path if fetch failed
            this.cache.images[sign] = null;
        }
    },

    getHoroscope: function(sign, period) {
        this.log('debug', `Getting horoscope for ${sign}, ${period}`);
        if (this.cache && this.cache.horoscopes && this.cache.horoscopes[sign] && this.cache.horoscopes[sign][period]) {
            const cachedData = this.cache.horoscopes[sign][period];
            const cacheAge = new Date() - new Date(cachedData.timestamp);
            if (cacheAge < this.getCacheValidityPeriod(period)) {
                this.log('debug', `Using cached horoscope for ${sign}, ${period}`);
                return cachedData;
            }
        }
        this.log('debug', `Cache miss or expired for ${sign}, ${period}. Fetching new data.`);
        this.fetchHoroscope(sign, period);
        return { content: "Updating horoscope...", timestamp: new Date().toISOString() };
    },

    saveCacheToFile: async function() {
        try {
            await fs.writeFile(this.cacheFile, JSON.stringify(this.cache, null, 2));
            this.log('info', `Cache file updated at ${new Date().toISOString()}`);
        } catch (error) {
            console.error("Error writing cache file:", error);
        }
    },

    getCacheValidityPeriod: function(period) {
        switch(period) {
            case 'daily':
            case 'tomorrow':
                return 6 * 60 * 60 * 1000; // 6 hours
            case 'weekly':
                return 24 * 60 * 60 * 1000; // 1 day
            case 'monthly':
                return 7 * 24 * 60 * 60 * 1000; // 1 week
            case 'yearly':
                return 30 * 24 * 60 * 60 * 1000; // 1 month
            default:
                return 24 * 60 * 60 * 1000; // 1 day (default)
        }
    },

    simulateDateChange: function(period) {
        this.log('debug', `Simulating date change for testing: ${period}`);
        let newDate = new Date();

        switch(period) {
            case 'daily':
                newDate.setDate(newDate.getDate() + 1);
                break;
            case 'weekly':
                newDate.setDate(newDate.getDate() + 7);
                break;
            case 'monthly':
                newDate.setMonth(newDate.getMonth() + 1);
                break;
            case 'yearly':
                newDate.setFullYear(newDate.getFullYear() + 1);
                break;
            default:
                this.log('error', `Invalid test period: ${period}`);
                return;
        }

        this.cache.timestamp = newDate.toISOString();
        this.updateCache(newDate);
    },

    updateCache: async function(testDate) {
        const now = testDate || new Date();
        const cacheDate = new Date(this.cache.timestamp);

        if (now.toDateString() !== cacheDate.toDateString()) {
            // Date has changed, update daily and tomorrow
            for (let sign in this.cache.horoscopes) {
                await this.fetchHoroscope(sign, 'daily');
                await this.fetchHoroscope(sign, 'tomorrow');
            }
            this.log('info', `Cache updated: New day (${now.toDateString()}), daily and tomorrow horoscopes updated`);
        }

        // Check for week, month, year changes
        if (this.isNewWeek(now, cacheDate)) {
            await this.updatePeriod('weekly');
        }
        if (now.getMonth() !== cacheDate.getMonth()) {
            await this.updatePeriod('monthly');
        }
        if (now.getFullYear() !== cacheDate.getFullYear()) {
            await this.updatePeriod('yearly');
        }

        this.cache.timestamp = now.toISOString();
        await this.saveCacheToFile();
    },

    isNewWeek: function(now, cacheDate) {
        const startOfWeek = this.config.startOfWeek || 'Sunday';
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const startDay = days.indexOf(startOfWeek);
        const nowDay = (now.getDay() - startDay + 7) % 7;
        const cacheDay = (cacheDate.getDay() - startDay + 7) % 7;
        return nowDay < cacheDay || (nowDay === 0 && cacheDay !== 0);
    },

    updatePeriod: async function(period) {
        for (let sign in this.cache.horoscopes) {
            await this.fetchHoroscope(sign, period);
        }
        this.log('info', `Cache updated: ${period} horoscopes updated`);
    },

    getHoroscope: function(sign, period) {
        if (this.cache.horoscopes[sign] && this.cache.horoscopes[sign][period]) {
            const cachedData = this.cache.horoscopes[sign][period];
            const cacheAge = new Date() - new Date(cachedData.timestamp);
            if (cacheAge < this.getCacheValidityPeriod(period)) {
                return cachedData;
            }
        }
        this.fetchHoroscope(sign, period);
        return { content: "Updating horoscope...", timestamp: new Date().toISOString() };
    },

    getImage: function(sign) {
        this.log('debug', `Getting image for ${sign}`);
        if (this.cache && this.cache.images && this.cache.images[sign]) {
            this.log('debug', `Returning cached image path for ${sign}: ${this.cache.images[sign]}`);
            return this.cache.images[sign];
        } else {
            this.log('debug', `No cached image found for ${sign}, using default URL`);
            return `https://www.sunsigns.com/wp-content/themes/sunsigns/assets/images/_sun-signs/${sign}/wrappable.png`;
        }
    },

    getCacheState: function() {
        return {
            timestamp: this.cache.timestamp,
            sampleData: {
                aries: {
                    daily: this.cache.horoscopes.aries.daily,
                    tomorrow: this.cache.horoscopes.aries.tomorrow
                }
            }
        };
    },

    log: function(level, message) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${this.name} [${level.toUpperCase()}]: ${message}`);
    },

    socketNotificationReceived: function(notification, payload) {
        this.log('debug', `Received notification: ${notification}`);
        if (notification === "INIT_MODULE") {
            this.config = payload;
            if (!this.cache) {
                this.log('debug', "Cache not found, building new cache");
                this.buildCache(payload).then(() => {
                    this.log('debug', "Cache built, sending initial data");
                    this.sendInitialData(payload);
                }).catch(error => {
                    this.log('error', `Error building cache: ${error}`);
                });
            } else {
                this.log('debug', "Cache found, sending initial data");
                this.sendInitialData(payload);
            }
        } else if (notification === "GET_HOROSCOPE") {
            const horoscope = this.getHoroscope(payload.sign, payload.period);
            this.sendSocketNotification("HOROSCOPE_RESULT", {
                sign: payload.sign,
                period: payload.period,
                data: horoscope
            });
        } else if (notification === "GET_IMAGE") {
            const imagePath = this.getImage(payload.sign);
            this.sendSocketNotification("IMAGE_RESULT", {
                sign: payload.sign,
                path: imagePath
            });
        } else if (notification === "UPDATE_CACHE") {
            this.updateCache();
        }
    },

});
