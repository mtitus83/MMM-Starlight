// MMM-Starlight.js

const LogLevels = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    VERBOSE: 4
};

const Logger = {
    level: LogLevels.INFO,  // Default log level
    moduleName: "MMM-Starlight",

    setLevel: function(level) {
        if (typeof level === 'string') {
            level = LogLevels[level.toUpperCase()] || LogLevels.INFO;
        }
        this.level = level;
    },

    error: function(...args) {
        if (this.level >= LogLevels.ERROR) console.error(`[${this.moduleName}] ERROR:`, ...args);
    },

    warn: function(...args) {
        if (this.level >= LogLevels.WARN) console.warn(`[${this.moduleName}] WARN:`, ...args);
    },

    info: function(...args) {
        if (this.level >= LogLevels.INFO) console.log(`[${this.moduleName}] INFO:`, ...args);
    },

    debug: function(...args) {
        if (this.level >= LogLevels.DEBUG) console.log(`[${this.moduleName}] DEBUG:`, ...args);
    },

    verbose: function(...args) {
        if (this.level >= LogLevels.VERBOSE) console.log(`[${this.moduleName}] VERBOSE:`, ...args);
    }
};

Module.register("MMM-Starlight", {
    defaults: {
        zodiacSign: ["taurus"],
        period: ["daily", "tomorrow", "weekly", "monthly"],
        signWaitTime: 120000,
        showImage: true,
        imageWidth: "50px",
        pauseDuration: 10000,
        scrollSpeed: 7,
        maxTextHeight: "400px",
        width: "400px",
        fontSize: "1em",
        debug: false,
        showButton: false,
        logLevel: LogLevels.INFO
    },

    start: function() {
        Logger.setLevel(this.config.logLevel);
        Logger.info("Starting module");
        console.log("[MMM-Starlight] Starting module");
        this.horoscopes = {};
        this.loadedHoroscopes = {};
        this.cachedImages = {};
        this.currentSignIndex = 0;
        this.currentPeriodIndex = 0;
        this.loaded = false;
        this.isPreloading = true;
        this.isScrolling = false;
        this.debugClickCount = 0;
        this.imageRequestQueue = new Set();
        this.lastImageRequestTime = {};
        console.log(`[MMM-Starlight] Configuration:`, JSON.stringify(this.config));
        this.initializeModule();
    },

    initializeModule: function() {
        console.log("[MMM-Starlight] Initializing module");
        this.sendSocketNotification("INIT", { 
            config: {
                zodiacSign: this.config.zodiacSign,
                period: this.config.period,
                debug: this.config.debug
            }
        });
        console.log("[MMM-Starlight] INIT notification sent");
    },

    getStyles: function() {
        return ["MMM-Starlight.css"];
    },

getDom: function() {
    console.log(`[MMM-Starlight] getDom called. isPreloading: ${this.isPreloading}, loaded: ${this.loaded}`);
    var wrapper = document.createElement("div");
    wrapper.className = "MMM-Starlight";
    wrapper.style.width = this.config.width;
    wrapper.style.fontSize = this.config.fontSize;

    if (this.config.debug && this.config.showButton) {
        var buttonContainer = document.createElement("div");
        buttonContainer.className = "starlight-debug-buttons";

        var triggerButton = document.createElement("button");
        triggerButton.id = "starlight-debug-button";
        triggerButton.innerHTML = "Simulate Midnight Update";
        triggerButton.style.padding = "5px";
        triggerButton.style.margin = "5px";
        triggerButton.style.fontSize = "12px";
        triggerButton.addEventListener("click", () => {
            console.log(`[MMM-Starlight] Midnight Update button clicked`);
            this.debugClickCount++;
            triggerButton.innerHTML = `Midnight Update (${this.debugClickCount})`;
            this.simulateMidnightUpdate();
        });
        buttonContainer.appendChild(triggerButton);

        var resetButton = document.createElement("button");
        resetButton.id = "starlight-reset-button";
        resetButton.innerHTML = "Reset Cache";
        resetButton.style.padding = "5px";
        resetButton.style.margin = "5px";
        resetButton.style.fontSize = "12px";
        resetButton.addEventListener("click", () => {
            console.log(`[MMM-Starlight] Reset Cache button clicked`);
            this.resetCache();
        });
        buttonContainer.appendChild(resetButton);

        wrapper.appendChild(buttonContainer);
    }

    if (this.isPreloading) {
        wrapper.innerHTML += "Loading horoscopes...";
        return wrapper;
    }

    if (!this.loaded) {
        wrapper.innerHTML += "Error loading horoscopes. Please check your configuration and logs.";
        return wrapper;
    }

    var currentSign = this.config.zodiacSign[this.currentSignIndex];
    var currentPeriod = this.config.period[this.currentPeriodIndex];

    if (!this.horoscopes[currentSign] || !this.horoscopes[currentSign][currentPeriod]) {
        wrapper.innerHTML += `Loading ${currentPeriod} horoscope for ${currentSign}...`;
        this.getHoroscope(currentSign, currentPeriod);
        return wrapper;
    }

    // Debug information
    if (this.config.debug) {
        var debugInfoElement = document.createElement("div");
        debugInfoElement.className = "starlight-debug-info";
        var horoscopeData = this.horoscopes[currentSign][currentPeriod];
        if (horoscopeData.lastUpdate) {
            debugInfoElement.innerHTML += `Last update: ${new Date(horoscopeData.lastUpdate).toLocaleString()}<br>`;
        }
        if (horoscopeData.nextUpdate) {
            debugInfoElement.innerHTML += `Next update: ${new Date(horoscopeData.nextUpdate).toLocaleString()}`;
        }
        wrapper.appendChild(debugInfoElement);
    }

    // Title
    var titleElement = document.createElement("div");
    titleElement.className = "starlight-title";
    titleElement.innerHTML = this.formatPeriodText(currentPeriod) + 
                             " Horoscope for " + currentSign.charAt(0).toUpperCase() + currentSign.slice(1);
    wrapper.appendChild(titleElement);

    // Image
    if (this.config.showImage) {
        var imageSlideContainer = document.createElement("div");
        imageSlideContainer.className = "starlight-image-slide-container";
        imageSlideContainer.appendChild(this.createImageElement(currentSign, "current"));
        imageSlideContainer.appendChild(this.createImageElement(this.getNextSign(), "next"));
        wrapper.appendChild(imageSlideContainer);
    }

    // Text content
    var textSlideContainer = document.createElement("div");
    textSlideContainer.className = "starlight-text-slide-container";
    textSlideContainer.appendChild(this.createTextElement(currentSign, "current", currentPeriod));
    textSlideContainer.appendChild(this.createTextElement(this.getNextSign(), "next", this.getNextPeriod()));
    wrapper.appendChild(textSlideContainer);

    return wrapper;
},

getNextSign: function() {
    const nextSignIndex = (this.currentSignIndex + (this.currentPeriodIndex === this.config.period.length - 1 ? 1 : 0)) % this.config.zodiacSign.length;
    return this.config.zodiacSign[nextSignIndex];
},


getNextPeriod: function() {
    const nextPeriodIndex = (this.currentPeriodIndex + 1) % this.config.period.length;
    return this.config.period[nextPeriodIndex];
},

createTextElement: function(sign, className, period) {
    var textContent = document.createElement("div");
    textContent.className = "starlight-text-content " + className;

    var horoscopeWrapper = document.createElement("div");
    horoscopeWrapper.className = "starlight-text-wrapper";
    horoscopeWrapper.style.maxHeight = this.config.maxTextHeight;

    var horoscopeTextElement = document.createElement("div");
    horoscopeTextElement.className = "starlight-text";
    
    Logger.debug(`Creating text element for ${sign}, ${period}`);
    Logger.debug(`Current horoscopes data: ${JSON.stringify(this.horoscopes)}`);
    
    if (this.horoscopes[sign] && this.horoscopes[sign][period]) {
        var horoscopeData = this.horoscopes[sign][period];
        horoscopeTextElement.innerHTML = horoscopeData.horoscope_data || "Horoscope data not available.";
        
        if (period === "monthly" && horoscopeData.challenging_days && horoscopeData.standout_days) {
            horoscopeTextElement.innerHTML += `<br><br>Challenging days: ${horoscopeData.challenging_days}`;
            horoscopeTextElement.innerHTML += `<br>Standout days: ${horoscopeData.standout_days}`;
        }
    } else if (this.isPreloading) {
        horoscopeTextElement.innerHTML = "Loading " + period + " horoscope for " + sign + "...";
    } else {
        horoscopeTextElement.innerHTML = "Horoscope data not available. Please try resetting the cache.";
        this.getHoroscope(sign, period);
    }
    
    horoscopeWrapper.appendChild(horoscopeTextElement);
    textContent.appendChild(horoscopeWrapper);

    return textContent;
},

    createImageElement: function(sign, className) {
        var imageWrapper = document.createElement("div");
        imageWrapper.className = "starlight-image-wrapper " + className;
        var image = document.createElement("img");
        
        if (this.cachedImages[sign]) {
            image.src = this.cachedImages[sign];
        } else {
            this.getImage(sign);
            image.src = "modules/MMM-Starlight/loading.gif"; // Use a loading gif
        }
        
        image.alt = sign + " zodiac sign";
        image.style.width = this.config.imageWidth;
        image.onerror = function() {
            console.error("Failed to load image for", sign);
            this.src = "modules/MMM-Starlight/error.png"; // Use an error image
        };
        imageWrapper.appendChild(image);
        return imageWrapper;
    },

resetCache: function() {
    Log.info(`${this.name}: Resetting cache`);
    this.sendSocketNotification("RESET_CACHE");
    this.horoscopes = {};
    this.loadedHoroscopes = {};
    this.isPreloading = true;
    this.loaded = false;
    this.updateDom();
},

    formatPeriodText: function(period) {
        if (period === "tomorrow") {
            return "Tomorrow's";
        }
        return period.charAt(0).toUpperCase() + period.slice(1);
    },

getHoroscope: function(sign, period) {
    console.log(`[MMM-Starlight] Requesting horoscope for ${sign}, period: ${period}`);
    this.sendSocketNotification("GET_HOROSCOPE", {
        sign: sign,
        period: period
    });
},

    getImage: function(sign) {
        const now = Date.now();
        const lastRequest = this.lastImageRequestTime[sign] || 0;
        if (now - lastRequest < 60000) {  // Debounce for 1 minute
            Logger.debug(`Skipping image request for ${sign}, too soon`);
            return;
        }
        
        if (!this.imageRequestQueue.has(sign)) {
            this.imageRequestQueue.add(sign);
            this.lastImageRequestTime[sign] = now;
            this.sendSocketNotification("GET_IMAGE", { sign: sign });
        } else {
            Logger.debug(`Image request for ${sign} already queued`);
        }
    },

socketNotificationReceived: function(notification, payload) {
    Logger.debug(`Socket notification received: ${notification}`);
    console.log(`[MMM-Starlight] Socket notification received: ${notification}`);
    if (notification === "HOROSCOPE_RESULT") {
        if (payload.success) {
            console.log(`[MMM-Starlight] Horoscope fetched successfully for ${payload.sign}, period: ${payload.period}`);
            if (!this.horoscopes[payload.sign]) {
                this.horoscopes[payload.sign] = {};
            }
            this.horoscopes[payload.sign][payload.period] = payload.data;
            
            if (!this.loadedHoroscopes[payload.sign]) {
                this.loadedHoroscopes[payload.sign] = {};
            }
            this.loadedHoroscopes[payload.sign][payload.period] = true;
            
            if (this.areAllHoroscopesLoaded()) {
                console.log(`[MMM-Starlight] All horoscopes loaded`);
                this.isPreloading = false;
                this.loaded = true;
                if (!this.rotationTimer) {
                    console.log(`[MMM-Starlight] Scheduling initial rotation`);
                    this.scheduleRotation();
                }
            }
        } else {
            console.error(`[MMM-Starlight] ${payload.message}`);
            if (!this.horoscopes[payload.sign]) {
                this.horoscopes[payload.sign] = {};
            }
            this.horoscopes[payload.sign][payload.period] = {
                horoscope_data: `Unable to fetch ${payload.period} horoscope for ${payload.sign}. Error: ${payload.error || "Unknown error"}`
            };
        }
        this.updateDom();
    } else if (notification === "CACHE_INITIALIZED") {
        console.log("[MMM-Starlight] Cache initialized");
        this.isPreloading = false;
        this.loaded = true;
        // Request initial horoscopes
        this.config.zodiacSign.forEach(sign => {
            this.config.period.forEach(period => {
                this.getHoroscope(sign, period);
            });
        });
        this.updateDom();
    } else if (notification === "IMAGE_RESULT") {
        this.imageRequestQueue.delete(payload.sign);
        console.log(`[MMM-Starlight] Image result received for ${payload.sign}`);
        if (payload.success) {
            this.cachedImages[payload.sign] = payload.imagePath;
        } else {
            console.error(`[MMM-Starlight] Error fetching image for ${payload.sign}: ${payload.message}`);
        }
        this.updateDom();
    } else if (notification === "CACHE_RESET_COMPLETE") {
        Log.info(`Cache reset complete: ${payload.success ? "Success" : "Failed"}`);
        if (payload.success) {
            this.isPreloading = false;
            this.loaded = true;
            // Request fresh data for all signs and periods
            this.config.zodiacSign.forEach(sign => {
                this.config.period.forEach(period => {
                    this.getHoroscope(sign, period);
                });
            });
        } else {
            Log.error(`Cache reset failed: ${payload.message}`);
        }
        this.updateDom();
    }
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

        clearTimeout(this.rotationTimer);  // Clear any existing timer
        var self = this;
        this.rotationTimer = setTimeout(function() {
            self.checkAndRotate();
        }, this.config.signWaitTime);
    },

    checkAndRotate: function() {
        if (this.config.zodiacSign.length === 1 && this.config.period.length === 1) {
            return;
        }

        if (!this.isScrolling) {
            this.slideToNext();
        } else {
            setTimeout(() => this.checkAndRotate(), 1000);
        }
    },

    slideToNext: function() {
        const imageSlideContainer = document.querySelector(".MMM-Starlight .starlight-image-slide-container");
        const textSlideContainer = document.querySelector(".MMM-Starlight .starlight-text-slide-container");
        const titleElement = document.querySelector(".MMM-Starlight .starlight-title");

        if (imageSlideContainer && textSlideContainer && titleElement) {
            const { currentSign, currentPeriod, nextSign, nextPeriod } = this.getNextPeriodAndSign();

            console.log(`Preparing next slide: Current ${currentSign} ${currentPeriod}, Next ${nextSign} ${nextPeriod}`);

            const currentText = textSlideContainer.querySelector(".starlight-text-content.current");
            const nextText = textSlideContainer.querySelector(".starlight-text-content.next");
            const currentImage = imageSlideContainer.querySelector(".starlight-image-wrapper.current");
            const nextImage = imageSlideContainer.querySelector(".starlight-image-wrapper.next");

            nextText.innerHTML = this.createTextElement(currentSign, "next", currentPeriod).innerHTML;
            
            const isSignChange = currentPeriod === this.config.period[0];
            
            if (isSignChange) {
                nextImage.innerHTML = this.createImageElement(currentSign, "next").innerHTML;
            }

            textSlideContainer.style.transition = "transform 1s ease-in-out";
            textSlideContainer.style.transform = "translateX(calc(-50% - 40px))";

            if (isSignChange) {
                imageSlideContainer.style.transition = "transform 1s ease-in-out";
                imageSlideContainer.style.transform = "translateX(calc(-50% - 40px))";
            }

            titleElement.classList.add('fading');

            setTimeout(() => {
                titleElement.classList.remove('fading');

                titleElement.innerHTML = this.formatPeriodText(currentPeriod) + " Horoscope for " + currentSign.charAt(0).toUpperCase() + currentSign.slice(1);

                textSlideContainer.style.transition = "none";
                textSlideContainer.style.transform = "translateX(0)";

                currentText.innerHTML = nextText.innerHTML;

                if (isSignChange) {
                    imageSlideContainer.style.transition = "none";
                    imageSlideContainer.style.transform = "translateX(0)";
                    currentImage.innerHTML = nextImage.innerHTML;
                }

                nextText.innerHTML = this.createTextElement(nextSign, "next", nextPeriod).innerHTML;
                
                if (isSignChange) {
                    nextImage.innerHTML = this.createImageElement(nextSign, "next").innerHTML;
                }

                this.startScrolling();
            }, 1000);
        }
    },

    getNextPeriodAndSign: function() {
        this.currentPeriodIndex = (this.currentPeriodIndex + 1) % this.config.period.length;
        if (this.currentPeriodIndex === 0) {
            this.currentSignIndex = (this.currentSignIndex + 1) % this.config.zodiacSign.length;
        }
        return {
            currentSign: this.config.zodiacSign[this.currentSignIndex],
            currentPeriod: this.config.period[this.currentPeriodIndex],
            nextSign: this.config.zodiacSign[(this.currentSignIndex + (this.currentPeriodIndex === this.config.period.length - 1 ? 1 : 0)) % this.config.zodiacSign.length],
            nextPeriod: this.config.period[(this.currentPeriodIndex + 1) % this.config.period.length]
        };
    },

    startScrolling: function() {
        var self = this;
        clearTimeout(this.scrollTimer);

        this.scrollTimer = setTimeout(function() {
            var textWrapper = document.querySelector(".MMM-Starlight .starlight-text-wrapper");
            var textContent = document.querySelector(".MMM-Starlight .starlight-text");

            if (textWrapper && textContent) {
                var wrapperHeight = textWrapper.offsetHeight
var wrapperHeight = textWrapper.offsetHeight;
                var contentHeight = textContent.scrollHeight;

                if (contentHeight > wrapperHeight) {
                    self.isScrolling = true;

                    var scrollDistance = contentHeight - (wrapperHeight * 0.75);
                    var verticalDuration = (scrollDistance / self.config.scrollSpeed) * 1000;

                    textContent.style.transition = `transform ${verticalDuration}ms linear`;
                    textContent.style.transform = `translateY(-${scrollDistance}px)`;

                    setTimeout(() => {
                        self.isScrolling = false;
                        // Reset scroll position
                        textContent.style.transition = "none";
                        textContent.style.transform = "translateY(0)";
                        // Schedule next rotation
                        self.scheduleRotation();
                    }, verticalDuration + self.config.pauseDuration);
                } else {
                    self.isScrolling = false;
                    // If no scrolling needed, schedule next rotation immediately
                    self.scheduleRotation();
                }
            }
        }, self.config.pauseDuration);
    },

    simulateMidnightUpdate: function() {
        Log.info(`${this.name}: Simulating midnight update`);
        
        if (this.config.debug) {
            // Simulate updating daily horoscopes with tomorrow's data
            this.config.zodiacSign.forEach(sign => {
                if (this.horoscopes[sign] && this.horoscopes[sign].tomorrow) {
                    Log.info(`${this.name}: Updating daily horoscope for ${sign} with tomorrow's data`);
                    this.horoscopes[sign].daily = this.horoscopes[sign].tomorrow;
                    delete this.horoscopes[sign].tomorrow;
                    Log.info(`${this.name}: New daily horoscope for ${sign}: ${JSON.stringify(this.horoscopes[sign].daily)}`);
                } else {
                    Log.warn(`${this.name}: No tomorrow's data available for ${sign}`);
                }
            });

            // Trigger an update to fetch new 'tomorrow' data
            Log.info(`${this.name}: Triggering update to fetch new 'tomorrow' data`);
            this.config.zodiacSign.forEach(sign => {
                this.getHoroscope(sign, 'tomorrow');
            });

            // Force an immediate DOM update
            Log.info(`${this.name}: Forcing immediate DOM update`);
            this.updateDom(0);

            // Reset the rotation to start from the beginning
            Log.info(`${this.name}: Resetting rotation`);
            clearTimeout(this.rotationTimer);
            this.currentSignIndex = 0;
            this.currentPeriodIndex = 0;
            this.scheduleRotation();

            // Send a notification to the node_helper
            this.sendSocketNotification("SIMULATE_MIDNIGHT_UPDATE", {});
        } else {
            Log.warn(`${this.name}: Debug mode is not enabled. Cannot simulate midnight update.`);
        }
    },

    notificationReceived: function(notification, payload, sender) {
        console.log(`[MMM-Starlight] Notification received: ${notification}`);
        if (notification === "DOM_OBJECTS_CREATED") {
            console.log("[MMM-Starlight] DOM objects created, module is ready");
            // You might want to trigger an initial update here
            this.updateDom();
        }
        if (notification === "ALL_MODULES_STARTED") {
            console.log("[MMM-Starlight] All modules started");
            // Another potential place to trigger an initial update
            this.updateDom();
        }
    }
});
