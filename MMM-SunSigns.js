Module.register("MMM-SunSigns", {
    defaults: {
        zodiacSign: ["taurus"],
        period: ["daily", "tomorrow", "weekly", "monthly", "yearly"],
        showImage: true,
        imageWidth: "100px",
        maxTextHeight: "400px",
        width: "400px",
        fontSize: "1em",
        debug: false,
        pauseDuration: 10000, // 10 seconds
        scrollSpeed: 7, // pixels per second
        signWaitTime: 50000, // 50 seconds
        endOfWeek: "Sunday"
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

        // Merge user-defined periods with defaults, maintaining order and removing duplicates
        if (this.config.period && Array.isArray(this.config.period)) {
            let mergedPeriods = [...new Set([...this.config.period, ...this.defaults.period])];
            this.config.period = mergedPeriods;
        }

        this.scheduleInitialUpdate();
        this.scheduleMidnightUpdate();
    },

    getStyles: function() {
        return ["MMM-SunSigns.css"];
    },

    scheduleInitialUpdate: function() {
        setTimeout(() => {
            this.updateHoroscopes();
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
        
        let periodsToUpdate = this.getPeriodsToUpdate();
        
        this.sendSocketNotification("UPDATE_HOROSCOPES", {
            zodiacSigns: this.config.zodiacSign,
            periods: periodsToUpdate,
        });
    },

    getPeriodsToUpdate: function() {
        let now = new Date();
        let periodsToUpdate = [];

        for (let period of this.config.period) {
            switch(period) {
                case "daily":
                case "tomorrow":
                    periodsToUpdate.push(period);
                    break;
                case "weekly":
                    if (this.isStartOfWeek(now) || !this.isInCache(period)) {
                        periodsToUpdate.push(period);
                    }
                    break;
                case "monthly":
                    if (now.getDate() === 1 || !this.isInCache(period)) {
                        periodsToUpdate.push(period);
                    }
                    break;
                case "yearly":
                    if ((now.getMonth() === 0 && now.getDate() === 1) || !this.isInCache(period)) {
                        periodsToUpdate.push(period);
                    }
                    break;
            }
        }

        return periodsToUpdate;
    },

    isInCache: function(period) {
        for (let sign of this.config.zodiacSign) {
            if (!this.horoscopes[sign] || !this.horoscopes[sign][period]) {
                return false;
            }
        }
        return true;
    },

    isStartOfWeek: function(date) {
        if (this.config.endOfWeek === "Sunday") {
            return date.getDay() === 1; // Monday
        } else {
            return date.getDay() === 0; // Sunday
        }
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
            ? this.horoscopes[sign][period].data 
            : "Loading " + period + " horoscope for " + sign + "...";
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
        } else {
            Log.warn(this.name + ": Received unknown socket notification: " + notification);
        }
    }
});
