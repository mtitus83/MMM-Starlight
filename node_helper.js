var NodeHelper = require("node_helper");
var axios = require("axios");
var cheerio = require("cheerio");
const fs = require('fs').promises;
const path = require('path');

module.exports = NodeHelper.create({
    start: async function() {
        console.log("Starting node helper for: " + this.name);
        this.cacheDir = path.join(__dirname, 'cache');
        this.imageCacheDir = path.join(this.cacheDir, 'images');
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
            await fs.mkdir(this.imageCacheDir, { recursive: true });
            console.log("Cache directories created successfully");
        } catch (error) {
            console.error("Error creating cache directories:", error);
        }
        await this.initializeCache();
        this.requestQueue = [];
        this.isProcessingQueue = false;
        this.debug = true;

        this.settings = {
            updateInterval: 12 * 60 * 60 * 1000, // 12 hours
            cacheDuration: 11 * 60 * 60 * 1000, // 11 hours
            maxConcurrentRequests: 2,
            retryDelay: 5 * 60 * 1000, // 5 minutes
            maxRetries: 3
        };

        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            this.sendSocketNotification("ERROR", {
                type: "Unhandled Rejection",
                message: reason.message || "Unknown error occurred"
            });
        });

        this.log("Node helper initialized");
    },

    log: function(message) {
        if (this.debug) {
            console.log(`[MMM-SunSigns] ${message}`);
        }
    },

    // ... (other methods remain the same)

    getHoroscope: async function(config) {
        const cacheKey = `${config.sign}_${config.period}`;
        const cachedData = this.cache[cacheKey];

        if (cachedData && (Date.now() - cachedData.timestamp < this.settings.cacheDuration)) {
            this.log(`Returning cached horoscope for ${config.sign}, period: ${config.period}`);
            // Always try to cache the image, even for cached horoscopes
            const imageUrl = `https://www.sunsigns.com/wp-content/themes/sunsigns/assets/images/_sun-signs/${config.sign}/wrappable.png`;
            const imagePath = await this.cacheImage(imageUrl, config.sign);
            return { ...cachedData.data, sign: config.sign, period: config.period, cached: true, imagePath: imagePath };
        }

        this.log(`Fetching new horoscope for ${config.sign}, period: ${config.period}`);
        let baseUrl = 'https://www.sunsigns.com/horoscopes';
        let url;

        // ... (switch statement for url remains the same)

        let retries = 0;
        while (retries < this.settings.maxRetries) {
            try {
                const response = await axios.get(url, { timeout: 30000 });
                const $ = cheerio.load(response.data);
                const horoscope = $('.horoscope-content p').text().trim();

                if (horoscope) {
                    const imageUrl = `https://www.sunsigns.com/wp-content/themes/sunsigns/assets/images/_sun-signs/${config.sign}/wrappable.png`;
                    const imagePath = await this.cacheImage(imageUrl, config.sign);
                    
                    const result = { 
                        data: horoscope, 
                        sign: config.sign, 
                        period: config.period, 
                        cached: false,
                        imagePath: imagePath
                    };
                    this.cache[cacheKey] = {
                        data: result,
                        timestamp: Date.now()
                    };
                    await this.saveCache();
                    return result;
                } else {
                    throw new Error("Horoscope content not found");
                }
            } catch (error) {
                console.error(`${this.name}: Error fetching horoscope for ${config.sign}, ${config.period}:`, error.message);
                retries++;
                if (retries < this.settings.maxRetries) {
                    this.log(`Retrying in ${this.settings.retryDelay / 1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, this.settings.retryDelay));
                } else {
                    throw new Error(`Max retries reached. Unable to fetch horoscope for ${config.sign}, ${config.period}`);
                }
            }
        }
    },

    cacheImage: async function(imageUrl, sign) {
        const imagePath = path.join(this.imageCacheDir, `${sign}.png`);
        
        try {
            // Check if image already exists
            await fs.access(imagePath);
            this.log(`Image for ${sign} already cached at ${imagePath}`);
            return path.relative(__dirname, imagePath);
        } catch (error) {
            // Image doesn't exist, download it
            this.log(`Attempting to download image for ${sign} from ${imageUrl}`);
            try {
                const response = await axios({
                    url: imageUrl,
                    method: 'GET',
                    responseType: 'arraybuffer'
                });
                await fs.writeFile(imagePath, response.data);
                this.log(`Image successfully cached for ${sign} at ${imagePath}`);
                return path.relative(__dirname, imagePath);
            } catch (error) {
                console.error(`Error caching image for ${sign}:`, error);
                if (error.response) {
                    console.error(`Status: ${error.response.status}`);
                    console.error(`Headers:`, error.response.headers);
                }
                return null;
            }
        }
    }
});
