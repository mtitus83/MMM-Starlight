Module.register("MMM-SunSigns", {
    defaults: {
        zodiacSign: ["taurus"],
        period: ["daily"],
        showImage: true,
        imageWidth: "100px",
        maxTextHeight: "400px",
        width: "400px",
        fontSize: "1em",
        debug: false,
        pauseDuration: 10000, // 10 seconds
        scrollSpeed: 7, // pixels per second
        signWaitTime: 50000, // 50 seconds
    },

    start: function() {
        Log.info("Starting module: " + this.name);
        this.horoscopes = {};
        this.currentSignIndex = 0;
        this.currentPeriodIndex = 0;
        this.loaded = false;
        this.isScrolling = false;
        this.lastUpdateAttempt = null;
        this.updateFailures = 0;
        this.transitionState = "idle";
        this.tomorrowFetched = false;

        this.scheduleInitialUpdate();
        this.scheduleMidnightShift();
        if (!this.config.period.includes("tomorrow")) {
            this.scheduleRandomTomorrowFetch();
        }
    },

    getStyles: function() {
        return ["MMM-SunSigns.css"];
    },

    scheduleInitialUpdate: function() {
        setTimeout(() => {
            this.updateHoroscopes();
        }, 1000);
    },

    scheduleMidnightShift: function() {
        var now = new Date();
        var night = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + 1, // the next day
            0, 0, 0 // at 00:00:00 hours
        );
        var msTillMidnight = night.getTime() - now.getTime();

        setTimeout(() => {
            this.shiftTomorrowToDaily();
            this.tomorrowFetched = false; // Reset for the new day
            this.scheduleMidnightShift(); // Schedule next midnight shift
            if (!this.config.period.includes("tomorrow")) {
                this.scheduleRandomTomorrowFetch(); // Schedule next random fetch for the new day
            }
        }, msTillMidnight);
    },

    scheduleRandomTomorrowFetch: function() {
        if (this.tomorrowFetched) return; // Don't schedule if already fetched today

        const minDelay = 1 * 60 * 60 * 1000; // 1 hour
        const maxDelay = 20 * 60 * 60 * 1000; // 20 hours
        const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay);

        setTimeout(() => {
            this.fetchTomorrowHoroscopes();
        }, randomDelay);
    },

    updateHoroscopes: function() {
        this.lastUpdateAttempt = new Date().toLocaleString();
        Log.info(this.name + ": Sending UPDATE_HOROSCOPES notification");
        this.sendSocketNotification("UPDATE_HOROSCOPES", {
            zodiacSigns: this.config.zodiacSign,
            periods: this.config.period,
        });
    },

    fetchTomorrowHoroscopes: function() {
        if (this.tomorrowFetched) return; // Don't fetch if already fetched today

        Log.info(this.name + ": Fetching tomorrow's horoscopes");
        this.sendSocketNotification("UPDATE_HOROSCOPES", {
            zodiacSigns: this.config.zodiacSign,
            periods: ["tomorrow"],
        });
    },

    shiftTomorrowToDaily: function() {
        Log.info(this.name + ": Shifting tomorrow's horoscopes to daily");
        for (let sign of this.config.zodiacSign) {
            if (this.horoscopes[sign] && this.horoscopes[sign].tomorrow) {
                this.horoscopes[sign].daily = this.horoscopes[sign].tomorrow;
                delete this.horoscopes[sign].tomorrow;
            }
        }
        this.updateDom();
    },

    // ... (keep other methods as they were)

    socketNotificationReceived: function(notification, payload) {
        Log.info(this.name + ": Received socket notification: " + notification);
        if (notification === "HOROSCOPE_RESULT") {
            Log.info(this.name + ": Received horoscope result", payload);
            if (payload.success) {
                if (!this.horoscopes[payload.sign]) {
                    this.horoscopes[payload.sign] = {};
                }
                this.horoscopes[payload.sign][payload.period] = payload.data;
                this.loaded = true;
                this.updateFailures = 0;
                Log.info(this.name + ": Horoscope data loaded successfully");
                if (payload.period === "tomorrow") {
                    this.tomorrowFetched = true;
                }
                if (this.transitionState === "idle") {
                    this.updateDom();
                    this.scheduleNextTransition();
                }
            } else {
                Log.error(this.name + ": Failed to fetch horoscope", payload);
                this.updateFailures++;
                // Retry in 1 hour if failed
                setTimeout(() => {
                    if (payload.period === "tomorrow") {
                        this.fetchTomorrowHoroscopes();
                    } else {
                        this.updateHoroscopes();
                    }
                }, 60 * 60 * 1000);
            }
        } else {
            Log.warn(this.name + ": Received unknown socket notification: " + notification);
        }
    }
});
