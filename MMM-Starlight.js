Module.register("MMM-Starlight", {
    defaults: {
        zodiacSign: ["taurus"],
        period: ["daily", "tomorrow", "weekly", "monthly"],
        showImage: true,
        imageWidth: "50px",
        maxTextHeight: "400px",
        width: "400px",
        fontSize: "1em",
        debug: false,
        showButton: false,
        signWaitTime: 60000,
        scrollSpeed: 50,  // pixels per second
        scrollPauseDuration: 2000  // pause at start and end of scroll
    },

    start: function() {
        Log.info("Starting module: " + this.name);
        this.horoscopes = {};
        this.loadedHoroscopes = {};
        this.cachedImages = {};
        this.currentSignIndex = 0;
        this.currentPeriodIndex = 0;
        this.loaded = false;
        this.isPreloading = true;
        this.debugClickCount = 0;
        this.apiCallCount = 0;
        this.isScrolling = false;
        this.lastUpdate = null;
        this.nextUpdate = null;

        this.sendSocketNotification("INIT", { config: this.config });
        this.loadAllHoroscopes();
    },

    loadAllHoroscopes: function() {
        this.config.zodiacSign.forEach(sign => {
            this.config.period.forEach(period => {
                this.getHoroscope(sign, period);
            });
        });
    },

    getStyles: function() {
        return [this.file("MMM-Starlight.css")];
    },

    getDom: function() {
        var wrapper = document.createElement("div");
        wrapper.className = "MMM-Starlight";
        wrapper.style.width = this.config.width;
        wrapper.style.fontSize = this.config.fontSize;

        if (this.config.debug && this.config.showButton) {
            wrapper.appendChild(this.createDebugButtons());
        }

        if (this.isPreloading) {
            wrapper.appendChild(this.createLoadingElement());
            return wrapper;
        }

        if (!this.loaded) {
            wrapper.classList.add("starlight-error");
            wrapper.innerHTML = "Error loading horoscopes. Please check your configuration and logs.";
            return wrapper;
        }

        wrapper.appendChild(this.createHoroscopeContent());
        return wrapper;
    },

    createLoadingElement: function() {
        var loadingElement = document.createElement("div");
        loadingElement.className = "starlight-loading";
        loadingElement.innerHTML = "Reading your stars<span class='animated-dots'></span>";
        return loadingElement;
    },

createHoroscopeContent: function() {
    var currentSign = this.config.zodiacSign[this.currentSignIndex];
    var currentPeriod = this.config.period[this.currentPeriodIndex];

    var content = document.createElement("div");
    content.className = "starlight-centered-content";

    if (this.config.debug) {
        content.appendChild(this.createDebugInfo(currentSign, currentPeriod));
    }

    content.appendChild(this.createTitleElement(currentSign, currentPeriod));

    var slideContainer = document.createElement("div");
    slideContainer.className = "starlight-slide-container";

    var currentSlide = document.createElement("div");
    currentSlide.className = "starlight-slide current-slide";

    var nextSlide = document.createElement("div");
    nextSlide.className = "starlight-slide next-slide";

    if (this.config.showImage) {
        currentSlide.appendChild(this.createImageElement(currentSign, currentPeriod));
    }
    currentSlide.appendChild(this.createTextElement(currentSign, currentPeriod));

    slideContainer.appendChild(currentSlide);
    slideContainer.appendChild(nextSlide);

    content.appendChild(slideContainer);

    if (this.config.debug) {
        var apiCallCountElement = document.createElement("div");
        apiCallCountElement.className = "starlight-api-call-count";
        apiCallCountElement.innerHTML = `API calls: ${this.apiCallCount}`;
        content.appendChild(apiCallCountElement);
    }

    return content;
},

    createDebugInfo: function(sign, period) {
        var debugInfoElement = document.createElement("div");
        debugInfoElement.className = "starlight-debug-info";
        if (this.lastUpdate) {
            debugInfoElement.innerHTML += `Last update: ${this.lastUpdate.toLocaleString()}<br>`;
        }
        if (this.nextUpdate) {
            debugInfoElement.innerHTML += `Next update: ${this.nextUpdate.toLocaleString()}`;
        }
        return debugInfoElement;
    },

    createTitleElement: function(sign, period) {
        var titleElement = document.createElement("div");
        titleElement.className = "starlight-title";
        titleElement.innerHTML = this.formatPeriodText(period) + 
                                 " Horoscope for " + sign.charAt(0).toUpperCase() + sign.slice(1);
        return titleElement;
    },

    formatPeriodText: function(period) {
        if (period === "tomorrow") {
            return "Tomorrow's";
        }
        return period.charAt(0).toUpperCase() + period.slice(1);
    },

    createImageElement: function(sign, period) {
        var imageWrapper = document.createElement("div");
        imageWrapper.className = "starlight-image-wrapper";
        var image = document.createElement("img");
        
        if (period === "tomorrow") {
            image.src = this.file("assets/crystal_ball.png");
            image.alt = "Crystal ball for tomorrow's horoscope";
        } else {
            image.src = this.file(`assets/${sign.toLowerCase()}.png`);
            image.alt = sign + " zodiac sign";
        }
        
        image.className = "starlight-zodiac-icon";
        image.style.width = this.config.imageWidth;
        if (this.config.debug) {
            image.classList.add("spinning-image");
        }
        image.onerror = function() {
            console.error("Failed to load image for", sign);
            this.src = this.file("assets/error.png");
        };
        imageWrapper.appendChild(image);
        return imageWrapper;
    },

    createTextElement: function(sign, period) {
        var textContent = document.createElement("div");
        textContent.className = "starlight-text-content";

        var horoscopeWrapper = document.createElement("div");
        horoscopeWrapper.className = "starlight-text-wrapper";
        horoscopeWrapper.style.maxHeight = this.config.maxTextHeight;

        if (this.horoscopes[sign] && this.horoscopes[sign][period]) {
            var horoscopeData = this.horoscopes[sign][period];
            var horoscopeTextElement = document.createElement("div");
            horoscopeTextElement.className = "starlight-text";
            horoscopeTextElement.innerHTML = horoscopeData.horoscope_data || "Horoscope data not available.";
            
            if (period === "monthly" && horoscopeData.challenging_days && horoscopeData.standout_days) {
                horoscopeTextElement.innerHTML += `<br><br>Challenging days: ${horoscopeData.challenging_days}`;
                horoscopeTextElement.innerHTML += `<br>Standout days: ${horoscopeData.standout_days}`;
            }
            horoscopeWrapper.appendChild(horoscopeTextElement);
        } else {
            var loadingElement = document.createElement("div");
            loadingElement.className = "starlight-text starlight-fallback-text";
            loadingElement.innerHTML = "Loading " + period + " horoscope for " + sign + "...";
            horoscopeWrapper.appendChild(loadingElement);
        }
        
        textContent.appendChild(horoscopeWrapper);
        return textContent;
    },

    startScrolling: function(wrapper, textElement) {
        if (this.isScrolling) return;
        this.isScrolling = true;

        const scrollHeight = textElement.scrollHeight;
        const clientHeight = wrapper.clientHeight;
        const scrollDistance = scrollHeight - clientHeight;
        const scrollDuration = (scrollDistance / this.config.scrollSpeed) * 1000;

        let start = null;
        const step = (timestamp) => {
            if (!start) start = timestamp;
            const progress = timestamp - start;
            const percentage = Math.min(progress / scrollDuration, 1);
            
            wrapper.scrollTop = scrollDistance * percentage;
            
            if (percentage < 1) {
                window.requestAnimationFrame(step);
            } else {
                setTimeout(() => {
                    wrapper.scrollTop = 0;
                    this.isScrolling = false;
                    setTimeout(() => this.startScrolling(wrapper, textElement), this.config.scrollPauseDuration);
                }, this.config.scrollPauseDuration);
            }
        };

        setTimeout(() => window.requestAnimationFrame(step), this.config.scrollPauseDuration);
    },

    getHoroscope: function(sign, period) {
        this.sendSocketNotification("GET_HOROSCOPE", {
            sign: sign,
            period: period
        });
    },

    socketNotificationReceived: function(notification, payload) {
        switch(notification) {
            case "HOROSCOPE_RESULT":
                this.handleHoroscopeResult(payload);
                break;
            case "CACHE_INITIALIZED":
                this.handleCacheInitialized();
                break;
            case "CACHE_UPDATED":
                this.handleCacheUpdated(payload);
                break;
            case "MIDNIGHT_UPDATE_COMPLETED":
                this.handleMidnightUpdateCompleted(payload);
                break;
            case "SIX_AM_UPDATE_COMPLETED":
                this.handleSixAMUpdateCompleted(payload);
                break;
            case "API_CALL_COUNT_UPDATED":
                this.apiCallCount = payload.count;
                break;
            case "MODULE_INITIALIZED":
                this.isPreloading = false;
                this.loaded = true;
                break;
            case "ERROR":
                Log.error(`${this.name} encountered an error:`, payload.error);
                this.isPreloading = false;
                this.loaded = false;
                break;
        }
        this.updateDom();
    },

    handleHoroscopeResult: function(payload) {
        if (payload.success) {
            if (!this.horoscopes[payload.sign]) {
                this.horoscopes[payload.sign] = {};
            }
            this.horoscopes[payload.sign][payload.period] = payload.data;
            
            if (!this.loadedHoroscopes[payload.sign]) {
                this.loadedHoroscopes[payload.sign] = {};
            }
            this.loadedHoroscopes[payload.sign][payload.period] = true;
            
            if (this.areAllHoroscopesLoaded()) {
                this.isPreloading = false;
                this.loaded = true;
                this.scheduleRotation();
            }
        } else {
            Log.error(`Error in horoscope result:`, payload.message);
            if (!this.horoscopes[payload.sign]) {
                this.horoscopes[payload.sign] = {};
            }
            this.horoscopes[payload.sign][payload.period] = {
                horoscope_data: `Unable to fetch ${payload.period} horoscope for ${payload.sign}. Error: ${payload.error || "Unknown error"}`
            };
        }
        this.updateDom();
    },

    areAllHoroscopesLoaded: function() {
        return this.config.zodiacSign.every(sign => 
            this.config.period.every(period => 
                this.loadedHoroscopes[sign] && this.loadedHoroscopes[sign][period]
            )
        );
    },

    handleCacheInitialized: function() {
        this.isPreloading = false;
        this.loaded = true;
        this.scheduleRotation();
    },

    handleCacheUpdated: function(payload) {
        if (payload.sign && payload.period) {
            if (!this.horoscopes[payload.sign]) {
                this.horoscopes[payload.sign] = {};
            }
            this.horoscopes[payload.sign][payload.period] = payload.data;
        } else {
            this.horoscopes = payload;
        }
        this.updateDom();
    },

    handleMidnightUpdateCompleted: function(payload) {
        if (payload.updatedCache) {
            this.horoscopes = payload.updatedCache;
        }
        this.lastUpdate = new Date();
        this.nextUpdate = new Date(this.lastUpdate.getTime() + 24 * 60 * 60 * 1000); // Next day
        this.updateDom();
    },

    handleSixAMUpdateCompleted: function(payload) {
        if (payload.updatedCache) {
            this.horoscopes = payload.updatedCache;
        }
        this.lastUpdate = new Date();
        this.nextUpdate = new Date(this.lastUpdate.getTime() + 24 * 60 * 60 * 1000); // Next day
        this.updateDom();
    },

    scheduleRotation: function() {
        setInterval(() => {
            this.rotateHoroscope();
        }, this.config.signWaitTime);
    },

rotateHoroscope: function() {
    this.currentPeriodIndex = (this.currentPeriodIndex + 1) % this.config.period.length;
    if (this.currentPeriodIndex === 0) {
        this.currentSignIndex = (this.currentSignIndex + 1) % this.config.zodiacSign.length;
    }

    var currentSign = this.config.zodiacSign[this.currentSignIndex];
    var currentPeriod = this.config.period[this.currentPeriodIndex];

    var slideContainer = document.querySelector(".starlight-slide-container");
    var currentSlide = slideContainer.querySelector(".current-slide");
    var nextSlide = slideContainer.querySelector(".next-slide");

    // Prepare next slide content
    nextSlide.innerHTML = "";
    if (this.config.showImage) {
        nextSlide.appendChild(this.createImageElement(currentSign, currentPeriod));
    }
    nextSlide.appendChild(this.createTextElement(currentSign, currentPeriod));

    // Trigger slide animation
    currentSlide.classList.add("slide-out");
    nextSlide.classList.add("slide-in");

    // After animation, reset classes and update content
    setTimeout(() => {
        currentSlide.classList.remove("slide-out");
        nextSlide.classList.remove("slide-in");
        currentSlide.innerHTML = nextSlide.innerHTML;
        nextSlide.innerHTML = "";
        this.updateDom();
    }, 1000); // Match this with your CSS transition duration
},

    createDebugButtons: function() {
        var buttonContainer = document.createElement("div");
        buttonContainer.className = "starlight-debug-buttons";

        var triggerButton = document.createElement("button");
        triggerButton.id = "starlight-debug-button";
        triggerButton.innerHTML = "Simulate Midnight Update";
        triggerButton.addEventListener("click", () => {
            this.debugClickCount++;
            triggerButton.innerHTML = `Midnight Update (${this.debugClickCount})`;
            this.simulateMidnightUpdate();
        });
        buttonContainer.appendChild(triggerButton);

        var resetButton = document.createElement("button");
        resetButton.id = "starlight-reset-button";
        resetButton.innerHTML = "Reset Cache";
        resetButton.addEventListener("click", () => {
            this.resetCache();
        });
        buttonContainer.appendChild(resetButton);

        return buttonContainer;
    },

    simulateMidnightUpdate: function() {
        Log.info(`${this.name}: Simulating midnight update`);
        const simulationDate = moment().add(1, 'day').startOf('day');
        this.sendSocketNotification("SIMULATE_MIDNIGHT_UPDATE", { date: simulationDate.format('YYYY-MM-DD') });
    },

    resetCache: function() {
        Log.info(`${this.name}: Resetting cache`);
        this.sendSocketNotification("RESET_CACHE");
        this.apiCallCount = 0;
        this.updateDom();
    }
});
