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
            return wrapper;
        }

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

        if (this.config.debug) {
            var debugInfo = document.createElement("div");
            debugInfo.className = "small dimmed";
            debugInfo.innerHTML = `Last Update: ${this.lastUpdateAttempt}<br>
                                   Update Failures: ${this.updateFailures}<br>
                                   Current State: ${this.transitionState}`;
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
        horoscopeTextElement.innerHTML = this.horoscopes[sign] && this.horoscopes[sign][period] 
            ? this.horoscopes[sign][period] 
            : "Loading " + period + " horoscope for " + sign + "...";
        horoscopeWrapper.appendChild(horoscopeTextElement);

        textContent.appendChild(horoscopeWrapper);
        contentWrapper.appendChild(textContent);

        if (this.config.showImage) {
            var imageWrapper = document.createElement("div");
            imageWrapper.className = "sunsigns-image-wrapper";
            var image = document.createElement("img");
            image.src = `https://www.sunsigns.com/wp-content/themes/sunsigns/assets/images/_sun-signs/${sign}/wrappable.png`;
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
