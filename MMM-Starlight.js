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
        showButton: false,
	isInitialized: false
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

    this.sendSocketNotification("INIT", { config: this.config });
},

    log: function(message) {
        console.log(`[${this.name}] ${new Date().toISOString()} - ${message}`);
    },

    getStyles: function() {
        return [this.file("MMM-Starlight.css")];
    },

    logSlideDuration: function(zodiacSign, period, elapsedTime, signWaitTime, scrollSpeed) {
        console.log(`${zodiacSign} ${period} remained on screen for ${elapsedTime} out of ${signWaitTime} at speed of ${scrollSpeed}`);
    },

    startRealTimeTimer: function(signWaitTime, pauseDuration) {
        pauseDuration = pauseDuration || 5000;
        let counter = 0;

        const pauseInterval = setInterval(() => {
            if (counter >= pauseDuration / 1000) {
                clearInterval(pauseInterval);
                this.startScrollTimer(signWaitTime);
            } else {
                if (this.loaded) {
                    const timerDisplay = document.getElementById("scroll-timer");
                    if (!timerDisplay) {
                        let timerElement = document.createElement("div");
                        timerElement.id = "scroll-timer";
                        timerElement.style.textAlign = "center";
                        timerElement.style.margin = "10px 0";
                        const wrapper = document.querySelector(".MMM-Starlight .starlight-text-wrapper");
                        if (wrapper) {
                            wrapper.before(timerElement);
                        }
                    } else {
                        const totalPauseTime = pauseDuration / 1000 || 5;
                        timerDisplay.innerHTML = `Pause Timer: ${counter}s / ${totalPauseTime}s`;
                    }
                }
                counter++;
            }
        }, 1000);
    },

    startScrollTimer: function(signWaitTime) {
        let counter = 0;

        const scrollInterval = setInterval(() => {
            if (counter >= signWaitTime / 1000) {
                clearInterval(scrollInterval);
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
        if (!this.isInitialized) {
            this.log("Initializing module and sending config to node helper");
            this.sendSocketNotification("INIT", { config: this.config });
            this.isInitialized = true;
        } else {
            this.log("Module already initialized, skipping initialization");
        }
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
        Log.info(`${this.name} received notification: ${notification}`);
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
        case "MODULE_INITIALIZED":
            Log.info(`${this.name} module initialized`);
            this.isPreloading = false;
            this.loaded = true;
            this.updateDom();
            break;
        case "ERROR":
            Log.error(`${this.name} encountered an error:`, payload.error);
            this.isPreloading = false;
            this.loaded = false;
            this.updateDom();
            break;
        }
    },

    startTimerWhenReady: function() {
        if (this.loaded) {
            const signWaitTime = this.config.signWaitTime;
            const pauseDuration = this.config.pauseDuration || 5000;
            this.startRealTimeTimer(signWaitTime, pauseDuration);
        } else {
            setTimeout(() => this.startTimerWhenReady(), 1000);
        }
    },

    createDebugInfo: function(sign, period) {
        if (!this.horoscopes[sign]) {
            console.error(`Horoscope data for ${sign} is undefined.`);
            return document.createElement("div");
        }
        var debugInfoElement = document.createElement("div");
        debugInfoElement.className = "starlight-debug-info";
        var horoscopeData = this.horoscopes[sign][period];
        if (horoscopeData && horoscopeData.lastUpdate) {
            debugInfoElement.innerHTML += `Last update: ${new Date(horoscopeData.lastUpdate).toLocaleString()}<br>`;
        }
        if (horoscopeData && horoscopeData.nextUpdate) {
            debugInfoElement.innerHTML += `Next update: ${new Date(horoscopeData.nextUpdate).toLocaleString()}`;
        }
        return debugInfoElement;
    },

    handleCacheInitialized: function() {
        this.isPreloading = false;
        this.loaded = true;
        this.updateDom();
        this.startTimerWhenReady();
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

    createHoroscopeContent: function() {
        var currentSign = this.config.zodiacSign[this.currentSignIndex];
        var currentPeriod = this.config.period[this.currentPeriodIndex];

        var content = document.createElement("div");

        if (this.config.debug && typeof this.createDebugInfo === 'function') {
            content.appendChild(this.createDebugInfo(currentSign, currentPeriod));
        }

        content.appendChild(this.createTitleElement(currentSign, currentPeriod));

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
        
        image.src = this.file(`assets/${sign.toLowerCase()}.png`);
        
        image.alt = sign + " zodiac sign";
        image.className = "starlight-zodiac-icon";
        image.style.width = this.config.imageWidth;
        image.onerror = function() {
            console.error("Failed to load image for", sign);
            this.src = this.file("assets/error.png");
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

    getHoroscope: function(sign, period) {
        this.log(`Requesting horoscope for ${sign}, period: ${period}`);
        this.sendSocketNotification("GET_HOROSCOPE", {
            sign: sign,
            period: period
        });
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

    startScrolling: function() {
        var self = this;
        clearTimeout(this.scrollTimer);
        clearTimeout(this.slideTimer);

        var textWrapper = document.querySelector(".MMM-Starlight .starlight-text-wrapper");
        var textContent = document.querySelector(".MMM-Starlight .starlight-text");

        function updateTimerDisplay(phase, duration, start) {
            if (self.config.debug) {
                let timerElement = document.getElementById("scroll-timer");
                if (!timerElement) {
                    timerElement = document.createElement("div");
                    timerElement.id = "scroll-timer";
                    timerElement.style.textAlign = "center";
                    timerElement.style.margin = "10px 0";
                    document.querySelector(".MMM-Starlight .starlight-text-wrapper").before(timerElement);
                }
                
                function updateTimer() {
                    let elapsed = Math.floor((Date.now() - start) / 1000);
                    timerElement.innerHTML = `${phase} Timer: ${elapsed}s / ${Math.floor(duration / 1000)}s`;
                    requestAnimationFrame(updateTimer);
                }
                updateTimer();
            }
        }

        if (textWrapper && textContent) {
            var wrapperHeight = textWrapper.offsetHeight;
            var contentHeight = textContent.scrollHeight;
            var startTime = Date.now();

            updateTimerDisplay("Pause", this.config.pauseDuration, startTime);

            setTimeout(() => {
                if (contentHeight > wrapperHeight) {
                    self.isScrolling = true;

                    var scrollDistance = contentHeight - (wrapperHeight * 0.75); 
                    var verticalDuration = (scrollDistance / self.config.scrollSpeed) * 1000;

                    updateTimerDisplay("Scroll", verticalDuration, Date.now());

                    textContent.style.transition = `transform ${verticalDuration}ms linear`;
                    textContent.style.transform = `translateY(-${scrollDistance}px)`;

                    self.scrollTimer = setTimeout(() => {
                        var elapsedTime = Date.now() - startTime;
                        var remainingTime = Math.max(0, self.config.signWaitTime - elapsedTime);

                        updateTimerDisplay("Pause", this.config.pauseDuration, Date.now());

                        self.slideTimer = setTimeout(() => {
                            self.isScrolling = false;
                            self.slideToNext();
                        }, remainingTime + self.config.pauseDuration);
                    }, verticalDuration);
                } else {
                    updateTimerDisplay("Wait", self.config.signWaitTime, Date.now());

                    self.slideTimer = setTimeout(() => {
                        self.isScrolling = false;
                        self.slideToNext();
                    }, self.config.signWaitTime);
                }
            }, this.config.pauseDuration);
        } else {
            updateTimerDisplay("Pause", this.config.pauseDuration, Date.now());
            self.slideTimer = setTimeout(() => {
                self.slideToNext();
            }, this.config.pauseDuration);
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

            const elapsedTime = Date.now() - this.slideStartTime;
            this.logSlideDuration(currentSign, currentPeriod, elapsedTime / 1000, this.config.signWaitTime / 1000, this.config.scrollSpeed);
     
            if (this.config.debug) {
                let timerElement = document.getElementById("scroll-timer");
                
                if (!timerElement) {
                    timerElement = document.createElement("div");
                    timerElement.id = "scroll-timer";
                    timerElement.style.textAlign = "center";
                    timerElement.style.margin = "10px 0";
                    document.querySelector(".MMM-Starlight .starlight-text-wrapper").before(timerElement);
                }
                
                let counter = 0;
                const signWaitTime = this.config.signWaitTime / 1000;

                const timerInterval = setInterval(() => {
                    if (counter >= signWaitTime) {
                        clearInterval(timerInterval);
                    } else {
                        timerElement.innerHTML = `Scroll Timer: ${counter}s / ${signWaitTime}s`;
                        counter++;
                    }
                }, 1000);

                setTimeout(() => {
                    clearInterval(timerInterval);
                    timerElement.innerHTML = '';
                }, 1000 + signWaitTime * 1000);
            }

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

                this.slideStartTime = Date.now();
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
    },

    handleMidnightUpdateCompleted: function(payload) {
        if (payload.updatedCache) {
            this.horoscopes = payload.updatedCache;
        }
    },

    handleSixAMUpdateCompleted: function(payload) {
        if (payload.updatedCache) {
            this.horoscopes = payload.updatedCache;
        }
    },

    handleCacheResetComplete: function(payload) {
        console.log(`[${this.name}] Cache reset complete:`, payload);
        if (payload.success) {
            this.updateDom(0);
            this.loadAllHoroscopes();
        } else {
            console.error(`[${this.name}] Cache reset failed:`, payload.error);
        }
    },

    loadAllHoroscopes: function() {
        this.log("Loading all horoscopes after reset");
        this.config.zodiacSign.forEach(sign => {
            this.config.period.forEach(period => {
                this.log(`Requesting horoscope for ${sign}, period: ${period}`);
                this.getHoroscope(sign, period);
            });
        });
    }
});
