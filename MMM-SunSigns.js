console.log("MMM-SunSigns module file is being loaded");
console.log("MMM-SunSigns module is being registered");

Module.register("MMM-SunSigns", {
    defaults: {
        zodiacSign: ["taurus"],
        period: ["daily"],
        showImage: true,
        imageWidth: "100px",
        maxTextHeight: "400px",
        width: "400px",
        fontSize: "1em",
        pauseDuration: 10000, // 10 seconds
        scrollSpeed: 7, // pixels per second
        signWaitTime: 50000, // 50 seconds
        startOfWeek: "Sunday",
        simulateDate: null, //Format MMDDYYYY 
        debug: false,
        clearCacheOnStart: false,
        bypassCache: false
    },

    start: function() {
        console.log("MMM-SunSigns start function called");
        Log.info("Starting module: " + this.name);
        this.horoscopes = {};
        this.currentSignIndex = 0;
        this.currentPeriodIndex = 0;
        this.loaded = false;
        this.isScrolling = false;
        this.lastUpdateAttempt = null;
        this.updateFailures = 0;
        this.transitionState = "idle";

        console.log("MMM-SunSigns configuration:", JSON.stringify(this.config));

        // Ensure that only configured periods are used
        this.config.period = this.config.period.filter(period => 
            ["daily", "tomorrow", "weekly", "monthly", "yearly"].includes(period)
        );
        console.log("MMM-SunSigns filtered periods:", JSON.stringify(this.config.period));

        this.sendSocketNotification("UPDATE_HOROSCOPES", {
            zodiacSigns: this.config.zodiacSign,
            periods: this.config.period,
        });

        this.scheduleMidnightUpdate();

        if (this.config.simulateDate) {
            console.log("MMM-SunSigns setting simulated date:", this.config.simulateDate);
            this.sendSocketNotification("SET_SIMULATED_DATE", { date: this.config.simulateDate });
        }

        console.log("MMM-SunSigns start function completed");
    },

    getStyles: function() {
        return ["MMM-SunSigns.css"];
    },

    scheduleInitialUpdate: function() {
        Log.info(this.name + ": Scheduling initial update");
        setTimeout(() => {
            Log.info(this.name + ": Executing initial update");
            this.sendSocketNotification("UPDATE_HOROSCOPES", {
                zodiacSigns: this.config.zodiacSign,
                periods: this.config.period,
            });
        }, 1000);
    },

    scheduleMidnightUpdate: function() {
        var now = new Date();
        var night = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + 1, // the next day
            0, 0, 0 // at 00:00:00 hours
        );
        var msTillMidnight = night.getTime() - now.getTime();

        setTimeout(() => {
            this.updateHoroscopes();
            this.scheduleMidnightUpdate(); // Schedule next midnight update
        }, msTillMidnight);
    },

    updateHoroscopes: function() {
        this.lastUpdateAttempt = new Date().toLocaleString();
        Log.info(this.name + ": Sending UPDATE_HOROSCOPES notification");
        Log.info(this.name + ": Zodiac signs:", JSON.stringify(this.config.zodiacSign));
        Log.info(this.name + ": Periods:", JSON.stringify(this.config.period));

        this.sendSocketNotification("UPDATE_HOROSCOPES", {
            zodiacSigns: this.config.zodiacSign,
            periods: this.config.period,
        });
    },

    getDom: function() {
        var wrapper = document.createElement("div");
        wrapper.className = "MMM-SunSigns";
        wrapper.style.width = this.config.width;
        wrapper.style.fontSize = this.config.fontSize;
    
        if (!this.loaded) {
            wrapper.innerHTML = "Loading horoscope...";
            if (this.config.debug) {
                wrapper.innerHTML += "<br>Last attempt: " + this.lastUpdateAttempt;
                wrapper.innerHTML += "<br>Update failures: " + this.updateFailures;
            }
        } else if (Object.keys(this.horoscopes).length === 0) {
            wrapper.innerHTML = "No horoscope data available.";
            if (this.config.debug) {
                wrapper.innerHTML += "<br>Check your configuration and network connection.";
            }
        } else {
            var slideContainer = document.createElement("div");
            slideContainer.className = "sunsigns-slide-container";
    
            var currentSign = this.config.zodiacSign[this.currentSignIndex];
            var currentPeriod = this.config.period[this.currentPeriodIndex];
            slideContainer.appendChild(this.createSignElement(currentSign, "current", currentPeriod));
    
            var nextIndices = this.getNextIndices();
            var nextSign = this.config.zodiacSign[nextIndices.signIndex];
            var nextPeriod = this.config.period[nextIndices.periodIndex];
            slideContainer.appendChild(this.createSignElement(nextSign, "next", nextPeriod));
    
            wrapper.appendChild(slideContainer);
        }
    
        if (this.config.debug) {
            var debugInfo = document.createElement("div");
            debugInfo.className = "small dimmed";
            debugInfo.innerHTML = `Last Update: ${this.lastUpdateAttempt}<br>
                                   Update Failures: ${this.updateFailures}<br>
                                   Current State: ${this.transitionState}<br>
                                   Simulated Date: ${this.config.simulateDate || "Not set"}`;
            wrapper.appendChild(debugInfo);
        }
    
        return wrapper;
    },

    retryFetchHoroscope: function(sign, period, retryCount = 0) {
        const maxRetries = 3;
        const retryDelay = 5000; // 5 seconds
    
        return new Promise((resolve, reject) => {
            this.fetchHoroscope(sign, period)
                .then(resolve)
                .catch((error) => {
                    if (retryCount < maxRetries) {
                        console.log(`Retry ${retryCount + 1} for ${sign} (${period})`);
                        setTimeout(() => {
                            this.retryFetchHoroscope(sign, period, retryCount + 1)
                                .then(resolve)
                                .catch(reject);
                        }, retryDelay);
                    } else {
                        reject(error);
                    }
                });
        });
    },
    
    validateConfig: function(config) {
        const validZodiacSigns = [
            "aries", "taurus", "gemini", "cancer", "leo", "virgo",
            "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"
        ];
        const validPeriods = ["daily", "tomorrow", "weekly", "monthly", "yearly"];
    
        if (!Array.isArray(config.zodiacSign) || config.zodiacSign.length === 0) {
            throw new Error("zodiacSign must be a non-empty array");
        }
    
        if (!Array.isArray(config.period) || config.period.length === 0) {
            throw new Error("period must be a non-empty array");
        }
    
        config.zodiacSign.forEach(sign => {
            if (!validZodiacSigns.includes(sign.toLowerCase())) {
                throw new Error(`Invalid zodiac sign: ${sign}`);
            }
        });
    
        config.period.forEach(period => {
            if (!validPeriods.includes(period.toLowerCase())) {
                throw new Error(`Invalid period: ${period}`);
            }
        });
    
        return true;
    },

    createSignElement: function(sign, className, period) {
        var slideWrapper = document.createElement("div");
        slideWrapper.className = "sunsigns-slide-wrapper " + className;

        var contentWrapper = document.createElement("div");
        contentWrapper.className = "sunsigns-content-wrapper";

        var textContent = document.createElement("div");
        textContent.className = "sunsigns-text-content";

        var periodText = document.createElement("div");
        periodText.className = "sunsigns-period";
        periodText.innerHTML = this.formatPeriodText(period) + " Horoscope for " + sign.charAt(0).toUpperCase() + sign.slice(1);
        textContent.appendChild(periodText);

        var horoscopeWrapper = document.createElement("div");
        horoscopeWrapper.className = "sunsigns-text-wrapper";
        horoscopeWrapper.style.maxHeight = this.config.maxTextHeight;

        var horoscopeTextElement = document.createElement("div");
        horoscopeTextElement.className = "sunsigns-text";
        if (this.horoscopes[sign] && this.horoscopes[sign][period]) {
            horoscopeTextElement.innerHTML = this.horoscopes[sign][period].data || "No horoscope data available.";
        } else {
            horoscopeTextElement.innerHTML = "Loading " + period + " horoscope for " + sign + "...";
        }
        horoscopeWrapper.appendChild(horoscopeTextElement);

        textContent.appendChild(horoscopeWrapper);
        contentWrapper.appendChild(textContent);

        if (this.config.showImage) {
            var imageWrapper = document.createElement("div");
            imageWrapper.className = "sunsigns-image-wrapper";
            var image = document.createElement("img");
            if (this.horoscopes[sign] && this.horoscopes[sign][period] && this.horoscopes[sign][period].imagePath) {
                image.src = this.file(this.horoscopes[sign][period].imagePath);
            } else {
                image.src = `https://www.sunsigns.com/wp-content/themes/sunsigns/assets/images/_sun-signs/${sign}/wrappable.png`;
            }
            image.alt = sign + " zodiac sign";
            image.style.width = this.config.imageWidth;
            imageWrapper.appendChild(image);
            contentWrapper.appendChild(imageWrapper);
        }

        slideWrapper.appendChild(contentWrapper);

        return slideWrapper;
    },

    formatPeriodText: function(period) {
        if (period === "tomorrow") {
            return "Tomorrow's";
        }
        return period.charAt(0).toUpperCase() + period.slice(1);
    },

    getNextIndices: function() {
        let nextPeriodIndex = (this.currentPeriodIndex + 1) % this.config.period.length;
        let nextSignIndex = this.currentSignIndex;
        if (nextPeriodIndex === 0) {
            nextSignIndex = (this.currentSignIndex + 1) % this.config.zodiacSign.length;
        }
        return { signIndex: nextSignIndex, periodIndex: nextPeriodIndex };
    },

    scheduleNextTransition: function() {
        if (this.config.zodiacSign.length === 1 && this.config.period.length === 1) {
            return;
        }

        this.transitionState = "waiting";
        setTimeout(() => {
            this.transitionState = "sliding";
            this.updateDom(0); // Update DOM immediately
            this.startSlideTransition();
        }, this.config.signWaitTime);
    },

    startSlideTransition: function() {
        var slideContainer = document.querySelector(".MMM-SunSigns .sunsigns-slide-container");
        if (slideContainer) {
            slideContainer.style.transition = `transform 1000ms ease-in-out`; // Hard-coded 1 second transition
            slideContainer.style.transform = "translateX(-50%)";

            setTimeout(() => {
                this.finishTransition();
            }, 1000); // Hard-coded 1 second wait
        }
    },

    finishTransition: function() {
        let nextIndices = this.getNextIndices();
        this.currentSignIndex = nextIndices.signIndex;
        this.currentPeriodIndex = nextIndices.periodIndex;
        this.transitionState = "pausing";
        this.updateDom(0);

        var slideContainer = document.querySelector(".MMM-SunSigns .sunsigns-slide-container");
        if (slideContainer) {
            slideContainer.style.transition = "none";
            slideContainer.style.transform = "translateX(0)";
        }

        setTimeout(() => {
            this.transitionState = "scrolling";
            this.startScrolling();
        }, this.config.pauseDuration);
    },

    startScrolling: function() {
        var self = this;
        var textWrapper = document.querySelector(".MMM-SunSigns .sunsigns-text-wrapper");
        var textContent = document.querySelector(".MMM-SunSigns .sunsigns-text");

        if (textWrapper && textContent) {
            var wrapperHeight = textWrapper.offsetHeight;
            var contentHeight = textContent.offsetHeight;

            if (contentHeight > wrapperHeight) {
                this.isScrolling = true;
                var scrollDistance = contentHeight - wrapperHeight;
                var scrollDuration = (scrollDistance / this.config.scrollSpeed) * 1000;

                textContent.style.transition = `transform ${scrollDuration}ms linear`;
                textContent.style.transform = `translateY(-${scrollDistance}px)`;

                setTimeout(() => {
                    this.isScrolling = false;
                    this.transitionState = "idle";
                    this.scheduleNextTransition();
                }, scrollDuration + this.config.pauseDuration);
            } else {
                this.transitionState = "idle";
                this.scheduleNextTransition();
            }
        }
    },

    socketNotificationReceived: function(notification, payload) {
        Log.info(this.name + ": Received socket notification: " + notification);
        if (notification === "HOROSCOPE_RESULT") {
            Log.info(this.name + ": Received horoscope result", payload);
            if (payload.success) {
                if (!this.horoscopes[payload.sign]) {
                    this.horoscopes[payload.sign] = {};
                }
                this.horoscopes[payload.sign][payload.period] = {
                    data: payload.data,
                    cached: payload.cached,
                    imagePath: payload.imagePath
                };
    
                this.loaded = true;
                this.updateFailures = 0;
                Log.info(this.name + ": Horoscope data loaded successfully");
                if (this.transitionState === "idle") {
                    this.updateDom();
                    this.scheduleNextTransition();
                }
            } else {
                Log.error(this.name + ": Failed to fetch horoscope", payload);
                this.updateFailures++;
                // Retry in 1 hour if failed
                setTimeout(() => {
                    this.updateHoroscopes();
                }, 60 * 60 * 1000);
            }
        } else if (notification === "HOROSCOPES_UPDATED") {
            Log.info(this.name + ": Horoscopes updated");
            this.updateDom(1000);
        } else if (notification === "UPDATE_WINDOW_EXPIRED") {
            Log.warn(this.name + ": Update window expired without finding new content");
            Log.warn("Last successful update:", payload.lastUpdateCheck);
            Log.warn("Number of attempts:", payload.attempts);
            if (this.config.debug) {
                this.updateDom(1000); // Update DOM to show debug info
            }
        } else if (notification === "ERROR") {
            Log.error(this.name + ": Received error notification", payload);
            if (this.config.debug) {
                this.updateDom(1000); // Update DOM to show error info
            }
        } else if (notification === "CACHE_CLEARED") {
            Log.info(this.name + ": Cache cleared successfully");
            this.updateHoroscopes(); // Fetch new data after cache clear
        } else {
            Log.warn(this.name + ": Received unknown socket notification: " + notification);
        }
    },

    notificationReceived: function(notification, payload, sender) {
        if (notification === "SIMULATE_DATE") {
            if (payload && payload.date) {
                this.config.simulateDate = payload.date;
                this.sendSocketNotification("SET_SIMULATED_DATE", { date: payload.date });
                this.updateDom(1000);
            }
        } else if (notification === "CLEAR_SUNSIGNS_CACHE") {
            this.sendSocketNotification("CLEAR_CACHE");
            Log.info(this.name + ": Sent CLEAR_CACHE notification to node helper");
        }
    }
});

console.log("MMM-SunSigns module file has been fully loaded");
