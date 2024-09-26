// MMM-Starlight.js

Module.register("MMM-Starlight", {
    defaults: {
        zodiacSign: ["taurus"],
        period: ["daily", "tomorrow", "weekly", "monthly"],
        showImage: true,
        imageWidth: "50px",
        pauseDuration: 10000,
        scrollSpeed: 7,
	signWaitTime: 20000,
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
        this.currentSign = this.config.zodiacSign[0];  // Initialize currentSign
        this.currentPeriod = this.config.period[0];    // Initialize currentPeriod
        this.loaded = false;
        this.isPreloading = true;
        this.debugClickCount = 0;
        this.apiCallCount = 0;
        this.timerDisplay = null;

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

startRealTimeTimer: function(signWaitTime) {
    if (this.config.debug) {
        let timerElement = document.getElementById("timer-display");
        
        if (!timerElement) {
            timerElement = document.createElement("div");
            timerElement.id = "timer-display";
            timerElement.style.textAlign = "center";
            timerElement.style.margin = "10px 0";
            document.querySelector(".MMM-Starlight .starlight-text-wrapper").before(timerElement);
        }
        
        const startTime = Date.now();
        const updateTimerDisplay = () => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const remaining = Math.max(0, Math.floor(signWaitTime / 1000) - elapsed);
            timerElement.innerHTML = `Wait Timer: ${elapsed}s / ${signWaitTime / 1000}s`;
            
            if (remaining > 0) {
                requestAnimationFrame(updateTimerDisplay);
            }
        };
        updateTimerDisplay();
    }
},

createTimerElement: function() {
    const timerElement = document.createElement("div");
    timerElement.id = "timer-display";
    timerElement.style.textAlign = "center";
    timerElement.style.margin = "10px 0";
    const wrapper = document.querySelector(".MMM-Starlight .starlight-text-wrapper");
    if (wrapper) {
        wrapper.parentNode.insertBefore(timerElement, wrapper);
    }
    return timerElement;
},

startDisplayTimer: function(signWaitTime) {
    clearTimeout(this.pauseTimer);
    clearTimeout(this.waitTimer);

    const startPauseTime = Date.now();
    this.updateTimerDisplay("Pause", this.config.pauseDuration, startPauseTime);

    this.pauseTimer = setTimeout(() => {
        const startWaitTime = Date.now();
        this.updateTimerDisplay("Wait", signWaitTime, startWaitTime);

        this.waitTimer = setTimeout(() => {
            this.slideToNext();
        }, signWaitTime);
    }, this.config.pauseDuration);
},

getHoroscope: function(sign, period) {
    if (this.getHoroscopeTimer) {
        clearTimeout(this.getHoroscopeTimer);
    }
    this.getHoroscopeTimer = setTimeout(() => {
        this.sendSocketNotification("GET_HOROSCOPE", {
            sign: sign,
            period: period
        });
    }, 500);  // 500ms debounce
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

        if (this.config.debug) {
            this.timerDisplay = document.createElement("div");
            this.timerDisplay.id = "scroll-timer";
            this.timerDisplay.style.display = "flex";
            this.timerDisplay.style.justifyContent = "space-between";
            this.timerDisplay.style.alignItems = "center";
            this.timerDisplay.style.width = "100%";
            this.timerDisplay.style.margin = "10px 0";
            
            var timerTextElement = document.createElement("span");
            timerTextElement.className = "timer-text";
            this.timerDisplay.appendChild(timerTextElement);
            
            var apiCallCountElement = document.createElement("span");
            apiCallCountElement.className = "api-call-count";
            apiCallCountElement.textContent = `API Calls: ${this.apiCallCount}`;
            this.timerDisplay.appendChild(apiCallCountElement);
            
            wrapper.appendChild(this.timerDisplay);
        }

    if (this.isPreloading) {
        var loadingElem = document.createElement("div");
        loadingElem.innerHTML = "Loading horoscopes...";
        wrapper.appendChild(loadingElem);
        return wrapper;
    }

    if (!this.loaded) {
        var errorElem = document.createElement("div");
        errorElem.innerHTML = "Error loading horoscopes. Please check your configuration and logs.";
        wrapper.appendChild(errorElem);
        return wrapper;
    }

    var content = this.createHoroscopeContent();
    wrapper.appendChild(content);

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
        case "MODULE_DOM_CREATED":
            this.log("Module DOM created, initializing timer");
            const signWaitTime = this.config.signWaitTime || 20000; // Provide a default value
            const pauseDuration = this.config.pauseDuration || 5000;
            this.startRealTimeTimer(signWaitTime, pauseDuration);
            break;

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

    if (this.config.showImage) {
        content.appendChild(this.createImageSlideContainer(currentSign));
    }

    content.appendChild(this.createTextSlideContainer(currentSign, currentPeriod));

    return content;
},

createDebugInfo: function(sign, period) {
    if (!this.horoscopes[sign]) {
        console.error(`Horoscope data for ${sign} is undefined.`);
        return document.createElement("div");  // Return an empty div to avoid errors
    }
    var debugInfoElement = document.createElement("div");
    debugInfoElement.className = "starlight-debug-info";
    var horoscopeData = this.horoscopes[sign][period];
    if (horoscopeData.lastUpdate) {
        debugInfoElement.innerHTML += `Last update: ${new Date(horoscopeData.lastUpdate).toLocaleString()}<br>`;
    }
    if (horoscopeData.nextUpdate) {
        debugInfoElement.innerHTML += `Next update: ${new Date(horoscopeData.nextUpdate).toLocaleString()}`;
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

    createImageSlideContainer: function(currentSign) {
        var imageSlideContainer = document.createElement("div");
        imageSlideContainer.className = "starlight-image-slide-container";
        imageSlideContainer.appendChild(this.createImageElement(currentSign, "current"));
        imageSlideContainer.appendChild(this.createImageElement(this.getNextSign(), "next"));
        return imageSlideContainer;
    },

createImageElement: function(sign, className) {
    var imageWrapper = document.createElement("div");
    imageWrapper.className = "starlight-image-wrapper " + className;
    var image = document.createElement("img");
    
    // Use PNG files from the assets directory
    image.src = this.file(`assets/${sign.toLowerCase()}.png`);
    
    image.alt = sign + " zodiac sign";
    image.className = "starlight-zodiac-icon";
    image.style.width = this.config.imageWidth;
    image.onerror = function() {
        console.error("Failed to load image for", sign);
        this.src = this.file("assets/error.png");  // Update this line
    };
    imageWrapper.appendChild(image);
    return imageWrapper;
},

    createTextSlideContainer: function(currentSign, currentPeriod) {
        var textSlideContainer = document.createElement("div");
        textSlideContainer.className = "starlight-text-slide-container";
        textSlideContainer.appendChild(this.createTextElement(currentSign, "current", currentPeriod));
        textSlideContainer.appendChild(this.createTextElement(this.getNextSign(), "next", this.getNextPeriod()));
        return textSlideContainer;
    },

createTextElement: function(sign, className, period) {
    var textContent = document.createElement("div");
    textContent.className = "starlight-text-content " + className;

    var horoscopeWrapper = document.createElement("div");
    horoscopeWrapper.className = "starlight-text-wrapper";
    horoscopeWrapper.style.maxHeight = this.config.maxTextHeight;

    if (this.horoscopes[sign] && this.horoscopes[sign][period]) {
        var horoscopeData = this.horoscopes[sign][period];
        
        if (period === "tomorrow" && 
            this.horoscopes[sign]["daily"] && 
            horoscopeData.horoscope_data === this.horoscopes[sign]["daily"].horoscope_data) {
            
            horoscopeWrapper.className += " starlight-centered-content";

            var imageElement = document.createElement("img");
            imageElement.src = this.file("assets/starlight-icon-transparent.png");
            imageElement.alt = "Reading the Stars";
            imageElement.className = "starlight-image spinning-image";
            
            imageElement.onerror = function() {
                console.error("Failed to load image: " + this.src);
                this.style.display = 'none';
            };
            
            horoscopeWrapper.appendChild(imageElement);

            var readingStarsText = document.createElement("div");
            readingStarsText.className = "starlight-reading-text";
            readingStarsText.innerHTML = 'Reading the stars<span class="animated-dots"></span>';
            horoscopeWrapper.appendChild(readingStarsText);
        } else {
            var horoscopeTextElement = document.createElement("div");
            horoscopeTextElement.className = "starlight-text";
            horoscopeTextElement.innerHTML = horoscopeData.horoscope_data || "Horoscope data not available.";
            
            if (period === "monthly" && horoscopeData.challenging_days && horoscopeData.standout_days) {
                horoscopeTextElement.innerHTML += `<br><br>Challenging days: ${horoscopeData.challenging_days}`;
                horoscopeTextElement.innerHTML += `<br>Standout days: ${horoscopeData.standout_days}`;
            }
            horoscopeWrapper.appendChild(horoscopeTextElement);
        }
    } else if (this.isPreloading) {
        var loadingElement = document.createElement("div");
        loadingElement.className = "starlight-text";
        loadingElement.innerHTML = "Loading " + period + " horoscope for " + sign + "...";
        horoscopeWrapper.appendChild(loadingElement);
    } else {
        var errorElement = document.createElement("div");
        errorElement.className = "starlight-text";
        errorElement.innerHTML = "Horoscope data not available. Please try resetting the cache.";
        horoscopeWrapper.appendChild(errorElement);
        this.getHoroscope(sign, period);
    }
    
    textContent.appendChild(horoscopeWrapper);
    return textContent;
},

    getNextSign: function() {
        const nextSignIndex = (this.currentSignIndex + (this.currentPeriodIndex === this.config.period.length - 1 ? 1 : 0)) % this.config.zodiacSign.length;
        return this.config.zodiacSign[nextSignIndex];
    },

    getNextPeriod: function() {
        const nextPeriodIndex = (this.currentPeriodIndex + 1) % this.config.period.length;
        return this.config.period[nextPeriodIndex];
    },

    formatPeriodText: function(period) {
        if (period === "tomorrow") {
            return "Tomorrow's";
        }
        return period.charAt(0).toUpperCase() + period.slice(1);
    },

    getHoroscope: function(sign, period) {
        this.log(`Requesting horoscope for ${sign}, period: ${period}`);
        this.apiCallCount++;  // Increment the API call counter
        this.updateApiCallDisplay();  // Update the display
        this.sendSocketNotification("GET_HOROSCOPE", {
            sign: sign,
            period: period
        });
    },

    updateApiCallDisplay: function() {
        if (this.config.debug) {
            var apiCountElement = document.querySelector('.MMM-Starlight .api-call-count');
            if (apiCountElement) {
                apiCountElement.textContent = `API Calls: ${this.apiCallCount}`;
            }
        }
    },

    getImage: function(sign) {
        this.sendSocketNotification("GET_IMAGE", { sign: sign });
    },

socketNotificationReceived: function(notification, payload) {
    this.log(`Received socket notification: ${notification}`);
    
    switch(notification) {
        case "HOROSCOPE_RESULT":
            this.log(`Received horoscope result for ${payload.sign}, period: ${payload.period}`);
            this.handleHoroscopeResult(payload);  // Update horoscope results
            break;
        
        case "CACHE_INITIALIZED":
            this.log("Cache initialized notification received");
            this.handleCacheInitialized();  // Handle cache initialization
            break;
        
        case "CACHE_RESET_COMPLETE":
            this.log("Cache reset complete notification received");
            this.handleCacheResetComplete(payload);  // Handle cache reset
            break;
        
        case "MIDNIGHT_UPDATE_SIMULATED":
            this.log("Midnight update simulation completed");
            this.handleMidnightUpdateSimulated(payload);  // Simulate midnight update
            break;
        
        case "CACHE_UPDATED":
            this.log("Cache updated, reloading data...");
            this.handleCacheUpdated(payload);  // Add logic for loading data from memory
            this.updateDom();  // Refresh UI after cache update
            break;
        
        case "MIDNIGHT_UPDATE_COMPLETED":
            this.log(`Midnight update completed at ${payload.timestamp}`);
            this.handleMidnightUpdateCompleted(payload);  // Handle midnight update completion
            break;
        
        case "SIX_AM_UPDATE_COMPLETED":
            this.log("6 AM update completed");
            this.handleSixAMUpdateCompleted();  // Handle 6 AM update completion
            break;
        
        case "PERFORM_MIDNIGHT_UPDATE":
            this.log("Received confirmation of midnight update performance");
            this.updateDom();  // Refresh the UI after midnight update
            break;
    }
},

    handleHourlyCheckCompleted: function() {
        console.log(`[${this.name}] Hourly check completed`);
        this.updateDom(0);
    },

    handleCacheInitialized: function() {
        this.isPreloading = false;
        this.loaded = true;

        // Track how many horoscopes we need to load
        const totalHoroscopes = this.config.zodiacSign.length * this.config.period.length;
        this.loadedHoroscopesCount = 0;  // Reset the counter

        this.config.zodiacSign.forEach(sign => {
            this.config.period.forEach(period => {
                if (period !== 'daily' || this.isInitialCacheBuild()) {
                    this.getHoroscope(sign, period);
                }
            });
        });
    },

    isInitialCacheBuild: function() {
        return !this.horoscopes || Object.keys(this.horoscopes).length === 0;
    },


    handleHoroscopeResult: function(payload) {
        this.log(`Handling horoscope result:`, payload);
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
                if (!this.rotationTimer) {
                    this.scheduleRotation();
                }
            }
        } else {
            this.log(`Error in horoscope result:`, payload.message);
            if (!this.horoscopes[payload.sign]) {
                this.horoscopes[payload.sign] = {};
            }
            this.horoscopes[payload.sign][payload.period] = {
                horoscope_data: `Unable to fetch ${payload.period} horoscope for ${payload.sign}. Error: ${payload.error || "Unknown error"}`
            };
        }
        this.updateDom();
    },

handleCacheInitialized: function() {
    this.isPreloading = false;
    this.loaded = true;

    // Track how many horoscopes we need to load
    const totalHoroscopes = this.config.zodiacSign.length * this.config.period.length;
    let loadedHoroscopes = 0;

    this.config.zodiacSign.forEach(sign => {
        this.config.period.forEach(period => {
            this.getHoroscope(sign, period, () => {
                loadedHoroscopes++;
                if (loadedHoroscopes === totalHoroscopes) {
                    // Only update DOM when all horoscopes have been fetched
                    console.log("All horoscope data loaded, updating DOM...");
                    this.updateDom();
                }
            });
        });
    });
},

    handleImageResult: function(payload) {
        if (payload.success) {
            this.cachedImages[payload.sign] = payload.imagePath;
        } else {
            console.error(`Error fetching image for ${payload.sign}: ${payload.message}`);
        }
        this.updateDom();
    },

    handleCacheResetComplete: function(payload) {
        console.log(`[${this.name}] Cache reset complete:`, payload);
        if (payload.success) {
            this.updateDom(0); // Force an immediate update of the display
            // Optionally, you can trigger a refresh of all horoscopes here
            this.loadAllHoroscopes();
        } else {
            console.error(`[${this.name}] Cache reset failed:`, payload.error);
        }
    },

    loadAllHoroscopes: function() {
        this.log("Loading all horoscopes after midnight update");
        this.config.zodiacSign.forEach(sign => {
            this.config.period.forEach(period => {
                this.log(`Requesting horoscope for ${sign}, period: ${period}`);
                this.getHoroscope(sign, period);
            });
        });
    },

handleMidnightUpdateCompleted: function(payload) {
    // Update the horoscopes with the new data if provided
    if (payload.updatedCache) {
        this.horoscopes = payload.updatedCache;
    }
},

handleSixAMUpdateCompleted: function(payload) {
    // Update the horoscopes with the new data if provided
    if (payload.updatedCache) {
        this.horoscopes = payload.updatedCache;
    }
},

    handleMidnightUpdateSimulated: function(payload) {
        console.log(`[${this.name}] Midnight update simulation completed`, payload);
        this.updateDom(0); // Force an immediate update of the display
        
        // Refresh horoscopes for all signs
        this.config.zodiacSign.forEach(sign => {
            this.getHoroscope(sign, "daily");
            this.getHoroscope(sign, "tomorrow");
            
            if (payload.updatedWeekly) {
                this.getHoroscope(sign, "weekly");
            }
            
            if (payload.updatedMonthly) {
                this.getHoroscope(sign, "monthly");
            }
        });
    },

    areAllHoroscopesLoaded: function() {
        return this.config.zodiacSign.every(sign => 
            this.config.period.every(period => 
                this.loadedHoroscopes[sign] && this.loadedHoroscopes[sign][period]
            )
        );
    },

scheduleRotation: function() {
    if (this.config.zodiacSign.length === 1 && this.config.period.length === 1) {
        return;
    } 

    clearTimeout(this.rotationTimer);
    var self = this;
    this.rotationTimer = setTimeout(function() {
        self.startScrolling();
    }, this.config.pauseDuration);
},

checkAndRotate: function() {
    if (this.config.zodiacSign.length === 1 && this.config.period.length === 1) {
        return;
    }

    if (!this.isScrolling) {
        this.startScrolling();
    } else {
        setTimeout(() => this.checkAndRotate(), 1000);
    }
},


slideToNext: function() {
    clearTimeout(this.scrollTimer);
    clearTimeout(this.slideTimer);

    const signWaitTime = this.config.signWaitTime;
    this.startRealTimeTimer(signWaitTime);

    const imageSlideContainer = document.querySelector(".MMM-Starlight .starlight-image-slide-container");
    const textSlideContainer = document.querySelector(".MMM-Starlight .starlight-text-slide-container");
    const titleElement = document.querySelector(".MMM-Starlight .starlight-title");

    if (imageSlideContainer && textSlideContainer && titleElement) {
        const { currentSign, currentPeriod, nextSign, nextPeriod } = this.getNextPeriodAndSign();

        // Log the time spent on the current slide
        const elapsedTime = Date.now() - this.slideStartTime;
        this.logSlideDuration(currentSign, currentPeriod, elapsedTime / 1000, this.config.signWaitTime / 1000, this.config.scrollSpeed);

        // Prepare next content
        const nextText = textSlideContainer.querySelector(".starlight-text-content:last-child");
        nextText.innerHTML = this.createTextElement(nextSign, "next", nextPeriod).innerHTML;

        const isNewSign = currentSign !== nextSign;

        // Only update and slide the image if it's a new sign
        if (isNewSign) {
            const nextImage = imageSlideContainer.querySelector(".starlight-image-wrapper:last-child");
            nextImage.innerHTML = this.createImageElement(nextSign, "next").innerHTML;
            imageSlideContainer.style.transform = 'translateX(calc(-50% - 38px))';
        }

        // Always slide the text
        textSlideContainer.style.transform = 'translateX(calc(-50% - 38px))';

        // Update title with a quick fade
        titleElement.style.opacity = '0';
        setTimeout(() => {
            titleElement.innerHTML = this.formatPeriodText(nextPeriod) + " Horoscope for " + nextSign.charAt(0).toUpperCase() + nextSign.slice(1);
            titleElement.style.opacity = '1';
        }, 500);

        setTimeout(() => {
            // Reset positions
            textSlideContainer.style.transition = 'none';
            textSlideContainer.style.transform = 'translateX(0)';

            if (isNewSign) {
                imageSlideContainer.style.transition = 'none';
                imageSlideContainer.style.transform = 'translateX(0)';
                imageSlideContainer.insertBefore(imageSlideContainer.lastElementChild, imageSlideContainer.firstElementChild);
            }

            // Move the last child to the first position for text
            textSlideContainer.insertBefore(textSlideContainer.lastElementChild, textSlideContainer.firstElementChild);

            // Force reflow
            void textSlideContainer.offsetWidth;
            void imageSlideContainer.offsetWidth;

            // Restore transition
            textSlideContainer.style.transition = '';
            imageSlideContainer.style.transition = '';

            this.startScrolling();

            // Reset the timer for the next slide
            this.slideStartTime = Date.now();
        }, 1000); // This should match the transition duration in CSS
    }
},

    getNextPeriodAndSign: function() {
        let currentSign = this.currentSign;
        let currentPeriod = this.currentPeriod;
        
        // Move to the next period
        this.currentPeriodIndex = (this.currentPeriodIndex + 1) % this.config.period.length;
        
        // If we've cycled through all periods, move to the next sign
        if (this.currentPeriodIndex === 0) {
            this.currentSignIndex = (this.currentSignIndex + 1) % this.config.zodiacSign.length;
        }
        
        this.currentSign = this.config.zodiacSign[this.currentSignIndex];
        this.currentPeriod = this.config.period[this.currentPeriodIndex];
        
        return {
            currentSign: currentSign,
            currentPeriod: currentPeriod,
            nextSign: this.currentSign,
            nextPeriod: this.currentPeriod
        };
    },


    startScrolling: function() {
        var self = this;
        clearTimeout(this.scrollTimer);
        clearTimeout(this.slideTimer);

        var textWrapper = document.querySelector(".MMM-Starlight .starlight-text-wrapper");
        var textContent = document.querySelector(".MMM-Starlight .starlight-text");

        if (textWrapper && textContent) {
            var wrapperHeight = textWrapper.offsetHeight;
            var contentHeight = textContent.scrollHeight;
            var scrollDistance = contentHeight - wrapperHeight * 0.75; // Scroll to show 3/4 of the content
            var startTime = Date.now();

            // Initial pause
            this.updateTimerDisplay("Initial Pause", this.config.pauseDuration, startTime);

            setTimeout(() => {
                if (contentHeight > wrapperHeight) {
                    self.isScrolling = true;
                    var scrollDuration = (scrollDistance / self.config.scrollSpeed) * 1000;

                    // Start scrolling
                    this.updateTimerDisplay("Scrolling", scrollDuration, Date.now());
                    textContent.style.transition = `transform ${scrollDuration}ms linear`;
                    textContent.style.transform = `translateY(-${scrollDistance}px)`;

                    self.scrollTimer = setTimeout(() => {
                        // Pause at the bottom
                        this.updateTimerDisplay("Bottom Pause", this.config.pauseDuration, Date.now());
                        
                        setTimeout(() => {
                            if (Date.now() - startTime < self.config.signWaitTime) {
                                // If signWaitTime hasn't elapsed, loop the scrolling
                                self.loopScrolling(textContent, scrollDistance, startTime);
                            } else {
                                // Move to the next slide
                                self.slideToNext();
                            }
                        }, this.config.pauseDuration);
                    }, scrollDuration);
                } else {
                    // For non-scrolling content, wait for signWaitTime
                    this.updateTimerDisplay("Wait", self.config.signWaitTime, Date.now());
                    self.slideTimer = setTimeout(() => {
                        self.slideToNext();
                    }, self.config.signWaitTime);
                }
            }, this.config.pauseDuration);
        } else {
            this.updateTimerDisplay("Error", 0, Date.now());
            self.slideTimer = setTimeout(() => {
                self.slideToNext();
            }, this.config.pauseDuration);
        }
    },

    loopScrolling: function(textContent, scrollDistance, startTime) {
        var self = this;
        
        // Fade out
        textContent.style.transition = 'opacity 0.5s ease-out';
        textContent.style.opacity = '0';
        
        setTimeout(() => {
            // Reset position
            textContent.style.transition = 'none';
            textContent.style.transform = 'translateY(0)';
            
            // Force a reflow to ensure the transform is applied instantly
            textContent.offsetHeight;
            
            // Fade in
            setTimeout(() => {
                textContent.style.transition = 'opacity 0.5s ease-in';
                textContent.style.opacity = '1';
                
                // Additional pause after fading in
                this.updateTimerDisplay("Top Pause", this.config.pauseDuration, Date.now());
                setTimeout(() => {
                    var scrollDuration = (scrollDistance / self.config.scrollSpeed) * 1000;
                    this.updateTimerDisplay("Scrolling", scrollDuration, Date.now());
                    textContent.style.transition = `transform ${scrollDuration}ms linear`;
                    textContent.style.transform = `translateY(-${scrollDistance}px)`;
                    
                    self.scrollTimer = setTimeout(() => {
                        // Pause at the bottom
                        this.updateTimerDisplay("Bottom Pause", this.config.pauseDuration, Date.now());
                        
                        setTimeout(() => {
                            if (Date.now() - startTime < self.config.signWaitTime) {
                                // If signWaitTime hasn't elapsed, loop again
                                self.loopScrolling(textContent, scrollDistance, startTime);
                            } else {
                                // Move to the next slide
                                self.slideToNext();
                            }
                        }, this.config.pauseDuration);
                    }, scrollDuration);
                }, this.config.pauseDuration); // Additional pause before starting to scroll
            }, 50); // Small delay to ensure the transform is applied before fading in
        }, 500); // Wait for fade-out
    },

    updateTimerDisplay: function(phase, duration, start) {
        if (this.config.debug && this.timerDisplay) {
            const timerTextElement = this.timerDisplay.querySelector('.timer-text');
            const apiCallCountElement = this.timerDisplay.querySelector('.api-call-count');
            
            const updateTimer = () => {
                let elapsed = Math.floor((Date.now() - start) / 1000);
                let remaining = Math.max(0, Math.floor(duration / 1000) - elapsed);
                let timerText = `${phase}: ${remaining}s remaining`;
                
                if (timerTextElement) {
                    timerTextElement.textContent = timerText;
                }
                
                if (apiCallCountElement) {
                    apiCallCountElement.textContent = `API Calls: ${this.apiCallCount}`;
                }
                
                if (remaining > 0) {
                    requestAnimationFrame(updateTimer);
                }
            };
            updateTimer();
        }
    },

simulateMidnightUpdate: function() {
        Log.info(`${this.name}: Simulating midnight update`);
        const simulationDate = moment().add(1, 'day').startOf('day');
        this.sendSocketNotification("SIMULATE_MIDNIGHT_UPDATE", { date: simulationDate.format('YYYY-MM-DD') });
    },

    resetCache: function() {
        Log.info(`${this.name}: Resetting cache`);
        this.sendSocketNotification("RESET_CACHE");
    },

fileExists: function(url) {
    var http = new XMLHttpRequest();
    http.open('HEAD', url, false);
    http.send();
    return http.status != 404;
},

    notificationReceived: function(notification, payload, sender) {
        if (notification === "DOM_OBJECTS_CREATED") {
            // You might want to trigger an initial update here
            this.updateDom();
        }
        if (notification === "ALL_MODULES_STARTED") {
            // Another potential place to trigger an initial update
            this.updateDom();
        }
    }
});
