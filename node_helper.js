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
        this.ensureCacheDirs();
    },

    ensureCacheDirs: async function() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
            await fs.mkdir(this.imageDir, { recursive: true });
        } catch (error) {
            console.error("Error creating cache directories:", error);
        }
    },

    buildCache: async function(config) {
        this.config = config;
        const zodiacSigns = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];
        const periods = ['daily', 'tomorrow', 'weekly', 'monthly', 'yearly'];
        
        this.cache = {
            timestamp: new Date().toISOString(),
            horoscopes: {},
            images: {}
        };

        for (let sign of zodiacSigns) {
            this.cache.horoscopes[sign] = {};
            for (let period of periods) {
                await this.fetchHoroscope(sign, period);
            }
            await this.fetchImage(sign);
        }

        await this.saveCacheToFile();
        this.log('info', `Cache file built successfully at ${this.cache.timestamp}`);

        if (this.config.debug && this.config.test) {
            this.simulateDateChange(this.config.test);
        }
    },

    fetchHoroscope: async function(sign, period) {
        const url = this.getHoroscopeUrl(sign, period);
        try {
            const response = await axios.get(url, { timeout: this.config.timeout });
            const $ = cheerio.load(response.data);
            const horoscope = $('.horoscope-content p').text().trim();
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
            console.error(`Error fetching image for ${sign}:`, error);
        }
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

    saveCacheToFile: async function() {
        try {
            await fs.writeFile(this.cacheFile, JSON.stringify(this.cache, null, 2));
            this.log('info', `Cache file updated at ${new Date().toISOString()}`);
        } catch (error) {
            console.error("Error writing cache file:", error);
        }
    },

    loadCacheFromFile: async function() {
        try {
            const data = await fs.readFile(this.cacheFile, 'utf8');
            this.cache = JSON.parse(data);
            this.log('info', `Cache file loaded from ${this.cache.timestamp}`);
        } catch (error) {
            console.error("Error reading cache file:", error);
            return null;
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
                const oldDaily = this.cache.horoscopes[sign]['daily'].content;
                const newDaily = this.cache.horoscopes[sign]['tomorrow'].content;
                this.cache.horoscopes[sign]['daily'] = this.cache.horoscopes[sign]['tomorrow'];
                await this.fetchHoroscope(sign, 'tomorrow');
                
                this.log('debug', `For ${sign}:\nOld Daily: "${oldDaily.substring(0, 50)}..."\nNew Daily (was Tomorrow): "${newDaily.substring(0, 50)}..."\nNew Tomorrow: "${this.cache.horoscopes[sign]['tomorrow'].content.substring(0, 50)}..."`);
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
        
        if (testDate) {
            this.sendSocketNotification("TEST_RESULT", this.getCacheState());
        }
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
        return this.cache.horoscopes[sign][period];
    },

    getImage: function(sign) {
        return this.cache.images[sign];
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
        if (level === 'info' || (level === 'debug' && this.config.debug)) {
            console.log(`${this.name} [${level.toUpperCase()}]: ${message}`);
        }
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "INIT_MODULE") {
            this.buildCache(payload);
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
    }
});
