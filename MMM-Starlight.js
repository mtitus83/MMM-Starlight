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
        
        // Update this part to use PNG files from the assets directory
        // and make the filename case-insensitive
        image.src = this.file(`assets/${sign.toLowerCase()}.png`);
        
        image.alt = sign + " zodiac sign";
        image.style.width = this.config.imageWidth;
        image.onerror = function() {
            console.error("Failed to load image for", sign);
            this.src = "modules/MMM-Starlight/assets/error.png";
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
        
        // Check if it's tomorrow's horoscope and if it's the same as today's
    if (period === "tomorrow" && 
        this.horoscopes[sign]["daily"] && 
        horoscopeData.horoscope_data === this.horoscopes[sign]["daily"].horoscope_data) {
        
        horoscopeWrapper.className += " starlight-centered-content";  // Add this line
        
        // Create an image element with the correct path
        var imageElement = document.createElement("img");
        imageElement.src = this.file("assets/starlight-icon-transparent.png");
        imageElement.alt = "Reading the Stars";
        imageElement.className = "starlight-image";
            
            // Create an image element with the correct path
            var imageElement = document.createElement("img");
            imageElement.src = this.file("assets/starlight-icon-transparent.png");
            imageElement.alt = "Reading the Stars";
            imageElement.className = "starlight-image";
            
            // Add error handling for image loading
            imageElement.onerror = function() {
                console.error("Failed to load image: " + this.src);
                this.style.display = 'none'; // Hide the image if it fails to load
            };
            
            horoscopeWrapper.appendChild(imageElement);
            
            // Add text as fallback
            var fallbackText = document.createElement("div");
            fallbackText.textContent = "Reading the Stars";
            fallbackText.className = "starlight-fallback-text";
            horoscopeWrapper.appendChild(fallbackText);
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
        this.sendSocketNotification("GET_HOROSCOPE", {
            sign: sign,
            period: period
        });
    },

    getImage: function(sign) {
        this.sendSocketNotification("GET_IMAGE", { sign: sign });
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "HOROSCOPE_RESULT") {
            this.handleHoroscopeResult(payload);
        } else if (notification === "CACHE_INITIALIZED") {
            this.handleCacheInitialized();
        } else if (notification === "IMAGE_RESULT") {
            this.handleImageResult(payload);
        } else if (notification === "CACHE_RESET_COMPLETE") {
            this.handleCacheResetComplete(payload);
        } else if (notification === "MIDNIGHT_UPDATE_SIMULATED") {
            this.handleMidnightUpdateSimulated();
        }
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
                if (!this.rotationTimer) {
                    this.scheduleRotation();
                }
            }
        } else {
            console.error(payload.message);
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
        Log.info(`Cache reset complete: ${payload.success ? "Success" : "Failed"}`);
        if (payload.success) {
            this.isPreloading = false;
            this.loaded = true;
            this.config.zodiacSign.forEach(sign => {
                this.config.period.forEach(period => {
                    this.getHoroscope(sign, period);
                });
            });
        } else {
            Log.error(`Cache reset failed: ${payload.message}`);
        }
        this.updateDom();
    },

    handleMidnightUpdateSimulated: function() {
        console.log("Midnight update simulation completed");
        this.updateDom(0); // Force an immediate update of the display
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
        this.sendSocketNotification("SIMULATE_MIDNIGHT_UPDATE", {});
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
