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
        this.sendSocketNotification("GET_HOROSCOPE", {
            sign: sign,
            period: period
        });
    },

    getImage: function(sign) {
        this.sendSocketNotification("GET_IMAGE", { sign: sign });
    },

    socketNotificationReceived: function(notification, payload) {
        this.log(`Received socket notification: ${notification}`);
        switch(notification) {
            case "HOROSCOPE_RESULT":
                this.log(`Received horoscope result for ${payload.sign}, period: ${payload.period}`);
                this.handleHoroscopeResult(payload);
                break;
            case "CACHE_INITIALIZED":
                this.log("Cache initialized notification received");
                this.handleCacheInitialized();
                break;
            case "CACHE_RESET_COMPLETE":
                this.log("Cache reset complete notification received");
                this.handleCacheResetComplete(payload);
                break;
            case "MIDNIGHT_UPDATE_SIMULATED":
                this.log("Midnight update simulation completed");
                this.handleMidnightUpdateSimulated(payload);
                break;
            case "CACHE_UPDATED":
                this.log(`Cache updated for ${payload.sign}, period: ${payload.period}`);
                this.handleCacheUpdated(payload);
                break;
            case "MIDNIGHT_UPDATE_COMPLETED":
                this.log(`Midnight update completed at ${payload.timestamp}`);
                this.handleMidnightUpdateCompleted();
                break;
            case "SIX_AM_UPDATE_COMPLETED":
                this.log("6 AM update completed");
                this.handleSixAMUpdateCompleted();
                break;
        }
    },

    handleHourlyCheckCompleted: function() {
        console.log(`[${this.name}] Hourly check completed`);
        this.updateDom(0);
    },

    handleCacheUpdated: function(payload) {
        console.log(`[${this.name}] Received cache update for ${payload.sign}, period: ${payload.period}`);
        this.getHoroscope(payload.sign, payload.period);
    },

    handleHoroscopeResult: function(payload) {
        console.log(`[${this.name}] Handling horoscope result:`, payload);
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
            console.error(`[${this.name}] Error in horoscope result:`, payload.message);
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
        this.config.zodiacSign.forEach(sign => {
            this.config.period.forEach(period => {
                this.getHoroscope(sign, period);
            });
        });
        this.updateDom();
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

    handleMidnightUpdateCompleted: function() {
        this.log("Loading all horoscopes after update");
        this.loadAllHoroscopes();
        this.updateDom(0);
    },

    handleSixAMUpdateCompleted: function() {
        console.log(`[${this.name}] 6 AM update completed`);
        this.updateDom(0);
        this.loadAllHoroscopes();
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
        self.checkAndRotate(); // Make sure this triggers the proper DOM update and scrolling
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
