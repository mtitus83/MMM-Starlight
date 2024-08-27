var NodeHelper = require("node_helper");
var axios = require("axios");
var cheerio = require("cheerio");
const fs = require('fs').promises;
const path = require('path');

module.exports = NodeHelper.create({
    start: async function() {
        console.log("Starting node helper for: " + this.name);
        this.cacheDir = path.join(__dirname, 'cache');
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
        } catch (error) {
            console.error("Error creating cache directory:", error);
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
        console.log(`[MMM-SunSigns] ${message}`);
    },

    // ... (keep other methods as they are)

    socketNotificationReceived: function(notification, payload) {
        this.log(`Received socket notification: ${notification}`);
        if (notification === "UPDATE_HOROSCOPES") {
            this.log("Received UPDATE_HOROSCOPES notification");
            this.log(`Payload: ${JSON.stringify(payload)}`);
            this.queueHoroscopeUpdates(payload.zodiacSigns, payload.periods, payload.signWaitTime, payload.pauseDuration, payload.scrollSpeed);
        }
    },

    queueHoroscopeUpdates: function(signs, periods, signWaitTime, pauseDuration, scrollSpeed) {
        this.log(`Queueing updates for signs: ${signs.join(', ')} and periods: ${periods.join(', ')}`);
        signs.forEach(sign => {
            periods.forEach(period => {
                this.requestQueue.push({ sign, period });
            });
        });
        this.log(`Queue size after adding requests: ${this.requestQueue.length}`);
        this.processQueue(signWaitTime, pauseDuration, scrollSpeed).catch(error => {
            console.error("Error in queueHoroscopeUpdates:", error);
            this.sendSocketNotification("ERROR", {
                type: "Queue Processing Error",
                message: error.message
            });
        });
    },

    processQueue: async function(signWaitTime, pauseDuration, scrollSpeed) {
        if (this.isProcessingQueue) {
            this.log("Queue is already being processed");
            return;
        }
        this.isProcessingQueue = true;
        this.log("Starting to process queue");

        try {
            while (this.requestQueue.length > 0) {
                const batch = this.requestQueue.splice(0, this.settings.maxConcurrentRequests);
                this.log(`Processing batch of ${batch.length} requests`);

                const promises = batch.map(item => this.getHoroscope(item).catch(error => ({
                    error,
                    sign: item.sign,
                    period: item.period
                })));

                const results = await Promise.all(promises);

                results.forEach(result => {
                    if (result.error) {
                        this.log(`Error fetching horoscope for ${result.sign}, ${result.period}: ${result.error.message}`);
                        this.sendSocketNotification("HOROSCOPE_RESULT", {
                            success: false,
                            sign: result.sign,
                            period: result.period,
                            message: result.error.message
                        });
                    } else {
                        this.log(`Successfully fetched horoscope for ${result.sign}, ${result.period}`);
                        this.sendSocketNotification("HOROSCOPE_RESULT", {
                            success: true,
                            sign: result.sign,
                            period: result.period,
                            data: result.data,
                            cached: result.cached,
                            signWaitTime: signWaitTime,
                            pauseDuration: pauseDuration,
                            scrollSpeed: scrollSpeed
                        });
                    }
                });

                if (this.requestQueue.length > 0) {
                    this.log("Waiting before processing next batch");
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        } catch (error) {
            console.error("Unexpected error in processQueue:", error);
            this.sendSocketNotification("ERROR", {
                type: "Queue Processing Error",
                message: error.message
            });
        } finally {
            this.isProcessingQueue = false;
            this.log("Queue processing complete");
        }
    },

    // ... (keep the getHoroscope method as it is)
});
