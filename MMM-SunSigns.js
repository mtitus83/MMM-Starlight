const LOG_PREFIX = "MMM-SunSigns:";

function log(message, isError = false, isDebug = false) {
    const logFunc = isError ? console.error : console.log;
    if (!isDebug || (isDebug && this.config.debug)) {
        logFunc(`${LOG_PREFIX} ${message}`);
    }
}

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
        log("Starting module: " + this.name, false, true);
        this.horoscopes = {};
        this.initialize();
        this.currentSignIndex = 0;
        this.currentPeriodIndex = 0;
        this.loaded = false;
        this.isScrolling = false;
        this.lastUpdateAttempt = null;
        this.updateFailures = 0;
        this.transitionState = "idle";
        this.loadingState = "initializing";

        this.validateConfig();
        this.sendSocketNotification("UPDATE_HOROSCOPES", {
            zodiacSigns: this.config.zodiacSign,
            periods: this.config.period,
        });

        this.scheduleMidnightUpdate();

        if (this.config.simulateDate) {
            this.sendSocketNotification("SET_SIMULATED_DATE", { date: this.config.simulateDate });
        }

        if (this.config.clearCacheOnStart) {
            this.sendSocketNotification("CLEAR_CACHE");
        }
    },

    initialize: function() {
        this.validateConfig();
        this.shownPeriods = {};
        for (let sign of this.config.zodiacSign) {
            this.shownPeriods[sign] = new Set();
        }

        this.sendSocketNotification("UPDATE_HOROSCOPES", {
            zodiacSigns: this.config.zodiacSign,
            periods: this.config.period,
        });

        this.scheduleMidnightUpdate();
    },

    getStyles: function() {
        return ["MMM-SunSigns.css"];
    },

validateConfig: function() {
        const validZodiacSigns = [
            "aries", "taurus", "gemini", "cancer", "leo", "virgo",
            "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"
        ];
        const validPeriods = ["daily", "tomorrow", "weekly", "monthly", "yearly"];

        this.config.zodiacSign = Array.isArray(this.config.zodiacSign) ? this.config.zodiacSign : [this.config.zodiacSign];
        this.config.period = Array.isArray(this.config.period) ? this.config.period : [this.config.period];

        this.config.zodiacSign = this.config.zodiacSign.filter(sign => validZodiacSigns.includes(sign.toLowerCase()));
        this.config.period = this.config.period.filter(period => validPeriods.includes(period.toLowerCase()));

        if (this.config.zodiacSign.length === 0) {
            log(this.name + ": No valid zodiac signs configured. Using default: taurus", true, true);
            this.config.zodiacSign = ["taurus"];
        }
        if (this.config.period.length === 0) {
            log(this.name + ": No valid periods configured. Using default: daily", true, true);
            this.config.period = ["daily"];
        }
    },

    scheduleMidnightUpdate: function() {
        var self = this;
        var now = new Date();
        var night = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + 1,
            0, 0, 0
        );
        var msTillMidnight = night.getTime() - now.getTime();

        setTimeout(function() {
            log(self.name + ": Midnight update triggered.", false, true);

            // Replace 'daily' with 'tomorrow' in the cache
            for (let sign of self.config.zodiacSign) {
                if (self.horoscopes[sign] && self.horoscopes[sign]['tomorrow']) {
                    self.horoscopes[sign]['daily'] = self.horoscopes[sign]['tomorrow'];
                    delete self.horoscopes[sign]['tomorrow'];
                    log(self.name + `: Updated cache for ${sign}: 'tomorrow' has replaced 'daily'`, false, true);
                }
            }

            let periodsToUpdate = ['tomorrow'];

            // Check if it's the first day of the week, month, or year
            const today = self.getCurrentDate();
            const isFirstDayOfWeek = today.getDay() === (self.config.startOfWeek === "Monday" ? 1 : 0);
            const isFirstDayOfMonth = today.getDate() === 1;
            const isFirstDayOfYear = today.getMonth() === 0 && today.getDate() === 1;

            // Only update weekly if it's the first day of the week and we don't have cached data
            if (isFirstDayOfWeek && !self.hasCachedDataForPeriod('weekly')) {
                periodsToUpdate.push('weekly');
                log(self.name + ": First day of the week. Updating weekly horoscope.", false, true);
            }

            // Only update monthly if it's the first day of the month and we don't have cached data
            if (isFirstDayOfMonth && !self.hasCachedDataForPeriod('monthly')) {
                periodsToUpdate.push('monthly');
                log(self.name + ": First day of the month. Updating monthly horoscope.", false, true);
            }

            // Only update yearly if it's the first day of the year and we don't have cached data
            if (isFirstDayOfYear && !self.hasCachedDataForPeriod('yearly')) {
                periodsToUpdate.push('yearly');
                log(self.name + ": First day of the year. Updating yearly horoscope.", false, true);
            }

            self.updateHoroscopes(periodsToUpdate);

            // Reschedule for next midnight
            self.scheduleMidnightUpdate();
        }, msTillMidnight);
    },

updateHoroscopes: function(periods = null) {
        this.lastUpdateAttempt = new Date().toLocaleString();
        log(this.name + ": Sending UPDATE_HOROSCOPES notification", false, true);
        log(this.name + ": Zodiac signs: " + JSON.stringify(this.config.zodiacSign), false, true);
        log(this.name + ": Periods: " + JSON.stringify(periods || this.config.period), false, true);

        this.sendSocketNotification("UPDATE_HOROSCOPES", {
            zodiacSigns: this.config.zodiacSign,
            periods: periods || this.config.period,
        });
    },

    hasCachedDataForPeriod: function(period) {
        for (let sign of this.config.zodiacSign) {
            if (!this.horoscopes[sign] || !this.horoscopes[sign][period]) {
                return false;
            }
        }
        return true;
    },

    getDom: function() {
        var wrapper = document.createElement("div");
        wrapper.className = "MMM-SunSigns";
        wrapper.style.width = this.config.width;
        wrapper.style.fontSize = this.config.fontSize;

        if (!this.loaded) {
            wrapper.innerHTML = `Loading horoscope... (${this.loadingState})`;
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

        log(`Current: Sign ${this.currentSignIndex} (${this.config.zodiacSign[this.currentSignIndex]}), Period ${this.currentPeriodIndex} (${this.config.period[this.currentPeriodIndex]})`, false, true);
        log(`Next: Sign ${nextSignIndex} (${this.config.zodiacSign[nextSignIndex]}), Period ${nextPeriodIndex} (${this.config.period[nextPeriodIndex]})`, false, true);

        return { signIndex: nextSignIndex, periodIndex: nextPeriodIndex };
    },

    scheduleNextTransition: function() {
        if (this.config.zodiacSign.length === 1 && this.config.period.length === 1) {
            return;
        }

        this.transitionState = "waiting";
        setTimeout(() => {
            this.transitionState = "sliding";
            this.updateDom(0);
            this.startSlideTransition();
        }, this.config.signWaitTime);
    },

    startSlideTransition: function() {
        var slideContainer = document.querySelector(".MMM-SunSigns .sunsigns-slide-container");
        if (slideContainer) {
            slideContainer.style.transition = `transform 1000ms ease-in-out`;
            slideContainer.style.transform = "translateX(-50%)";

            setTimeout(() => {
                this.finishTransition();
            }, 1000);
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

        log(`Transition finished. Now showing: Sign ${this.currentSignIndex} (${this.config.zodiacSign[this.currentSignIndex]}), Period ${this.currentPeriodIndex} (${this.config.period[this.currentPeriodIndex]})`, false, true);

        // Clear any existing timeouts
        if (this.transitionTimeout) {
            clearTimeout(this.transitionTimeout);
        }

        this.transitionTimeout = setTimeout(() => {
            this.transitionState = "scrolling";
            this.startScrolling();
        }, this.config.pauseDuration);
    },

    startScrolling: function() {
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

                // Clear any existing timeouts
                if (this.scrollTimeout) {
                    clearTimeout(this.scrollTimeout);
                }

                this.scrollTimeout = setTimeout(() => {
                    this.isScrolling = false;
                    this.transitionState = "idle";
                    this.scheduleNextTransition();
                }, scrollDuration + this.config.pauseDuration);
            } else {
                this.transitionState = "idle";
                this.scheduleNextTransition();
            }
        }

        log(`Scrolling started/finished for: Sign ${this.currentSignIndex} (${this.config.zodiacSign[this.currentSignIndex]}), Period ${this.currentPeriodIndex} (${this.config.period[this.currentPeriodIndex]})`, false, true);
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "HOROSCOPE_RESULT") {
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
                this.loadingState = "complete";
                this.updateFailures = 0;

                if (payload.cached) {
                    this.updateDom(0);
                } else {
                    this.updateDom(1000);
                }

                if (this.transitionState === "idle") {
                    this.scheduleNextTransition();
                }
            } else {
                log(this.name + ": Failed to fetch horoscope", payload, true, true);
                this.updateFailures++;
                this.loadingState = "failed";
                setTimeout(() => {
                    this.updateHoroscopes();
                }, 60 * 60 * 1000);
            }
            this.updateDom();
        } else if (notification === "HOROSCOPES_UPDATED") {
            log(this.name + ": Horoscopes updated", false, true);
            this.updateDom(1000);
        } else if (notification === "UPDATE_WINDOW_EXPIRED") {
            log(this.name + ": Update window expired without finding new content", false, true);
            this.loadingState = "expired";
            if (this.config.debug) {
                this.updateDom(1000);
            }
        } else if (notification === "ERROR") {
            log(this.name + ": Received error notification", payload, true, true);
            this.loadingState = "error";
            if (this.config.debug) {
                this.updateDom(1000);
            }
        } else if (notification === "CACHE_CLEARED") {
            log(this.name + ": Cache cleared successfully", false, true);
            this.updateHoroscopes();
        }
    },

    getCurrentDate: function() {
        return this.config.simulateDate ? new Date(this.config.simulateDate) : new Date();
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
        }
    }
});
