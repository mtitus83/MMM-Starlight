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
        Log.info("Starting module: " + this.name);
        this.horoscopes = {};
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
            Log.error(this.name + ": No valid zodiac signs configured. Using default: taurus");
            this.config.zodiacSign = ["taurus"];
        }
        if (this.config.period.length === 0) {
            Log.error(this.name + ": No valid periods configured. Using default: daily");
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
            self.updateHoroscopes();
            self.scheduleMidnightUpdate();
        }, msTillMidnight);
    },

    updateHoroscopes: function() {
        this.lastUpdateAttempt = new Date().toLocaleString();
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

        setTimeout(() => {
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
                Log.error(this.name + ": Failed to fetch horoscope", payload);
                this.updateFailures++;
                this.loadingState = "failed";
                setTimeout(() => {
                    this.updateHoroscopes();
                }, 60 * 60 * 1000);
            }
            this.updateDom();
        } else if (notification === "HOROSCOPES_UPDATED") {
            Log.info(this.name + ": Horoscopes updated");
            this.updateDom(1000);
        } else if (notification === "UPDATE_WINDOW_EXPIRED") {
            Log.warn(this.name + ": Update window expired without finding new content");
            this.loadingState = "expired";
            if (this.config.debug) {
                this.updateDom(1000);
            }
        } else if (notification === "ERROR") {
            Log.error(this.name + ": Received error notification", payload);
            this.loadingState = "error";
            if (this.config.debug) {
                this.updateDom(1000);
            }
        } else if (notification === "CACHE_CLEARED") {
            Log.info(this.name + ": Cache cleared successfully");
            this.updateHoroscopes();
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
        }
    }
});
