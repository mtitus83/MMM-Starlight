// MMM-Starlight.js

Module.register("MMM-Starlight", {
    defaults: {
        zodiacSign: ["taurus"],
        period: ["daily", "tomorrow", "weekly", "monthly"],
        showImage: true,
        imageWidth: "50px",
        pauseDuration: 10000,
        scrollSpeed: 7,
        maxTextHeight: "400px",
        width: "400px",
        fontSize: "1em",
        debug: false,
        showButton: false
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
    // Display the first slide and start the timer
    const signWaitTime = this.config.signWaitTime;
    const pauseDuration = this.config.pauseDuration || 5000;  // Ensure pauseDuration has a value
    this.startRealTimeTimer(signWaitTime, pauseDuration);  // Start the timer for the first slide


        this.initializeModule();
    },

    log: function(message) {
        console.log(`[${this.name}] ${new Date().toISOString()} - ${message}`);
    },

getStyles: function() {
    var cssPath = this.file("MMM-Starlight.css");
    if (this.fileExists(cssPath)) {
        return [cssPath];
    } else {
        console.error("CSS file not found: " + cssPath);
        return [];
    }
},

logSlideDuration: function(zodiacSign, period, elapsedTime, signWaitTime, scrollSpeed) {
    console.log(`${zodiacSign} ${period} remained on screen for ${elapsedTime} out of ${signWaitTime} at speed of ${scrollSpeed}`);
},

startRealTimeTimer: function(signWaitTime, pauseDuration) {
    // Ensure pauseDuration is a valid number
    pauseDuration = pauseDuration || 5000;  // Default to 5 seconds if undefined
    let counter = 0;

    // First, handle the pause before scrolling
    const pauseInterval = setInterval(() => {
        if (counter >= pauseDuration / 1000) {
            clearInterval(pauseInterval); // Stop the pause timer once it's over

            // Start the scroll timer after the pause
            this.startScrollTimer(signWaitTime);
        } else {
            const timerDisplay = document.getElementById("scroll-timer");
            if (!timerDisplay) {
                let timerElement = document.createElement("div");
                timerElement.id = "scroll-timer";
                timerElement.style.textAlign = "center";
                timerElement.style.margin = "10px 0";
                document.querySelector(".MMM-Starlight .starlight-text-wrapper").before(timerElement);
            } else {
                // Ensure pauseDuration is a valid number to avoid NaN
                const totalPauseTime = pauseDuration / 1000 || 5;  // Default to 5 seconds
                timerDisplay.innerHTML = `Pause Timer: ${counter}s / ${totalPauseTime}s`;
            }
            counter++;
        }
    }, 1000);
},
startScrollTimer: function(signWaitTime) {
    let counter = 0;

    // Scroll timer starts after the pause is completed
    const scrollInterval = setInterval(() => {
        if (counter >= signWaitTime / 1000) {
            clearInterval(scrollInterval); // Stop timer after the slide duration completes
        } else {
            const timerDisplay = document.getElementById("scroll-timer");
            if (timerDisplay) {
                timerDisplay.innerHTML = `Scroll Timer: ${counter}s / ${signWaitTime / 1000}s`;
            }
            counter++;
        }
    }, 1000);
},
    initializeModule: function() {
        this.log("Initializing module and sending config to node helper");
        this.sendSocketNotification("INIT", { config: this.config });
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
            wrapper.innerHTML += "Loading horoscopes...";
            return wrapper;
        }

        if (!this.loaded) {
            wrapper.innerHTML += "Error loading horoscopes. Please check your configuration and logs.";
            return wrapper;
        }

        wrapper.appendChild(this.createHoroscopeContent());
        return wrapper;
    },

notificationReceived: function(notification, payload, sender) {
    if (notification === "CLOCK_MINUTE") {
        const now = moment();
        if (now.hour() === 0 && now.minute() === 0) {
            this.log("Triggering midnight update");
            this.sendSocketNotification("PERFORM_MIDNIGHT_UPDATE", {});
        }
    }
},

socketNotificationReceived: function(notification, payload) {
    this.log(`Received socket notification: ${notification}`);
    
    switch(notification) {
        case "HOROSCOPE_RESULT":
            this.log(`Received horoscope result for ${payload.sign}, period: ${payload.period}`);
            this.handleHoroscopeResult(payload);
            this.updateDom();
            break;
        
        case "CACHE_INITIALIZED":
            this.log("Cache initialized notification received");
            this.handleCacheInitialized();
            this.updateDom();
            break;
        
        case "CACHE_RESET_COMPLETE":
            this.log("Cache reset complete notification received");
            this.handleCacheResetComplete(payload);
            this.updateDom();
            break;
        
        case "CACHE_UPDATED":
            this.log("Cache updated, reloading data...");
            this.handleCacheUpdated(payload);
            this.updateDom();
            break;
        
        case "MIDNIGHT_UPDATE_COMPLETED":
            this.log(`Midnight update completed at ${payload.timestamp}`);
            this.handleMidnightUpdateCompleted(payload);
            this.updateDom();
            break;
        
        case "SIX_AM_UPDATE_COMPLETED":
            this.log("6 AM update completed");
            this.handleSixAMUpdateCompleted(payload);
            this.updateDom();
            break;
        case "API_CALL_COUNT_UPDATED":
            this.log(`API call count updated: ${payload.count}`);
            this.apiCallCount = payload.count;
            this.updateDom();
            break;
    }
},


handleCacheUpdated: function(payload) {
    if (payload.sign && payload.period) {
        // Single horoscope update
        if (!this.horoscopes[payload.sign]) {
            this.horoscopes[payload.sign] = {};
        }
        this.horoscopes[payload.sign][payload.period] = payload.data;
    } else {
        // Full cache update
        this.horoscopes = payload;
    }
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

    createHoroscopeContent: function() {
        var currentSign = this.config.zodiacSign[this.currentSignIndex];
        var currentPeriod = this.config.period[this.currentPeriodIndex];

        var content = document.createElement("div");

        if (this.config.debug) {
            content.appendChild(this.createDebugInfo(currentSign, currentPeriod));
        }

        content.appendChild(this.createTitleElement(currentSign, currentPeriod));

        // Add API call count display
        var apiCallCountElement = document.createElement("div");
        apiCallCountElement.className = "starlight-api-call-count";
        apiCallCountElement.innerHTML = `API calls: ${this.apiCallCount}`;
        content.appendChild(apiCallCountElement);

        if (this.config.showImage) {
            content.appendChild(this.createImageSlideContainer(currentSign));
        }

        content.appendChild(this.createTextSlideContainer(currentSign, currentPeriod));

        return content;
    },

