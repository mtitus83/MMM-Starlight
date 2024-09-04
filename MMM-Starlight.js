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
	showButton: false
    },

    updateInterval: 60 * 60 * 1000, // 1 hour
    isPreloading: true,
    loadedHoroscopes: {},

    start: function() {
        Log.info("Starting module: " + this.name);
        this.horoscopes = {};
        this.loadedHoroscopes = {};
        this.cachedImages = {};
        this.currentSignIndex = 0;
        this.currentPeriodIndex = 0;
        this.loaded = false;
        this.isPreloading = true;
        this.isScrolling = false;
        this.debugClickCount = 0;
        this.initializeModule();
    },

    initializeModule: function() {
        this.sendSocketNotification("INIT", { 
            config: {
                zodiacSign: this.config.zodiacSign,
                period: this.config.period
            }
        });
        // Request all horoscopes and images
        this.config.zodiacSign.forEach(sign => {
            this.config.period.forEach(period => {
                this.getHoroscope(sign, period);
            });
            this.getImage(sign);
        });
    },

    getStyles: function() {
        return ["MMM-Starlight.css"];
    },

    getDom: function() {
        var wrapper = document.createElement("div");
        wrapper.className = "MMM-Starlight";
        wrapper.style.width = this.config.width;
        wrapper.style.fontSize = this.config.fontSize;

        if (this.isPreloading) {
            wrapper.innerHTML = "Loading horoscopes from cache...";
            return wrapper;
        }

        if (!this.loaded) {
            wrapper.innerHTML = "Error loading horoscopes. Please check your configuration and logs.";
            return wrapper;
        }

        var currentSign = this.config.zodiacSign[this.currentSignIndex];
        var currentPeriod = this.config.period[this.currentPeriodIndex];
        var nextPeriodIndex = (this.currentPeriodIndex + 1) % this.config.period.length;
        var nextSignIndex = nextPeriodIndex === 0 ? (this.currentSignIndex + 1) % this.config.zodiacSign.length : this.currentSignIndex;
        var nextSign = this.config.zodiacSign[nextSignIndex];
        var nextPeriod = this.config.period[nextPeriodIndex];

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
            imageSlideContainer.appendChild(this.createImageElement(nextSign, "next"));
            wrapper.appendChild(imageSlideContainer);
        }

        // Text content
        var textSlideContainer = document.createElement("div");
        textSlideContainer.className = "starlight-text-slide-container";
        textSlideContainer.appendChild(this.createTextElement(currentSign, "current", currentPeriod));
        textSlideContainer.appendChild(this.createTextElement(nextSign, "next", nextPeriod));
        wrapper.appendChild(textSlideContainer);

        if (this.config.debug && this.config.showButton) {
            Log.info(`${this.name}: Creating debug button`);
            var triggerButton = document.createElement("button");
            triggerButton.id = "starlight-debug-button";
            triggerButton.innerHTML = "Simulate Midnight Update";
            triggerButton.style.padding = "10px";
            triggerButton.style.margin = "10px";
            triggerButton.style.fontSize = "16px";
            triggerButton.addEventListener("click", () => {
                Log.info(`${this.name}: Debug button clicked`);
                this.debugClickCount++;
                triggerButton.innerHTML = `Clicked ${this.debugClickCount} times`;
                this.simulateMidnightUpdate();
            });
            wrapper.appendChild(triggerButton);
        }

        return wrapper;
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

    createTextElement: function(sign, className, period) {
        var textContent = document.createElement("div");
        textContent.className = "starlight-text-content " + className;

        var horoscopeWrapper = document.createElement("div");
        horoscopeWrapper.className = "starlight-text-wrapper";
        horoscopeWrapper.style.maxHeight = this.config.maxTextHeight;

        var horoscopeTextElement = document.createElement("div");
        horoscopeTextElement.className = "starlight-text";
        
        if (this.horoscopes[sign] && this.horoscopes[sign][period]) {
            var horoscopeData = this.horoscopes[sign][period];
            horoscopeTextElement.innerHTML = horoscopeData.horoscope_data || "Horoscope data not available.";
            
            if (period === "monthly" && horoscopeData.challenging_days && horoscopeData.standout_days) {
                horoscopeTextElement.innerHTML += `<br><br>Challenging days: ${horoscopeData.challenging_days}`;
                horoscopeTextElement.innerHTML += `<br>Standout days: ${horoscopeData.standout_days}`;
            }
        } else {
            horoscopeTextElement.innerHTML = "Loading " + period + " horoscope for " + sign + " from cache...";
            this.getHoroscope(sign, period);
        }
        
        horoscopeWrapper.appendChild(horoscopeTextElement);
        textContent.appendChild(horoscopeWrapper);

        return textContent;
    },

    updateHoroscopesFromCache: function() {
        Log.info(`${this.name}: Updating horoscopes from cache`);
        this.config.zodiacSign.forEach(sign => {
            this.config.period.forEach(period => {
                this.getHoroscope(sign, period);
            });
        });
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
            this.updateHoroscopesFromCache();

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

    formatPeriodText: function(period) {
        if (period === "tomorrow") {
            return "Tomorrow's";
        }
        return period.charAt(0).toUpperCase() + period.slice(1);
    },

    getHoroscope: function(sign, period) {
        Log.info(`${this.name}: Requesting horoscope update for ${sign}, period: ${period}`);
        this.sendSocketNotification("GET_HOROSCOPE", {
            sign: sign,
            period: period
        });
    },

    getImage: function(sign) {
        this.sendSocketNotification("GET_IMAGE", { sign: sign });
    },

    scheduleUpdate: function(delay) {
        var nextLoad = this.updateInterval;
        if (typeof delay !== "undefined" && delay >= 0) {
            nextLoad = delay;
        }
    
        var self = this;
        clearTimeout(this.updateTimer);
        this.updateTimer = setTimeout(function() {
            self.isPreloading = true;
            self.initializeModule();
        }, nextLoad);
    },

    notificationReceived: function(notification, payload, sender) {
        if (notification === "DOM_OBJECTS_CREATED") {
            Log.info(`${this.name}: DOM objects created, module is ready`);
        }
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "HOROSCOPE_RESULT") {
            if (payload.success) {
                Log.info(`${this.name}: Horoscope fetched successfully for ${payload.sign}, period: ${payload.period}`);
                if (!this.horoscopes[payload.sign]) {
                    this.horoscopes[payload.sign] = {};
                }
                this.horoscopes[payload.sign][payload.period] = payload.data;
                Log.info(`${this.name}: Updated horoscope for ${payload.sign}, ${payload.period}: ${JSON.stringify(payload.data)}`);
                
                if (!this.loadedHoroscopes[payload.sign]) {
                    this.loadedHoroscopes[payload.sign] = {};
                }
                this.loadedHoroscopes[payload.sign][payload.period] = true;
                
                if (this.areAllHoroscopesLoaded()) {
                    Log.info(`${this.name}: All horoscopes loaded`);
                    this.isPreloading = false;
                    this.loaded = true;
                    this.updateDom(0);
                    if (!this.rotationTimer) {
                        Log.info(`${this.name}: Scheduling initial rotation`);
                        this.scheduleRotation();
                    }
                }
            } else {
            Log.error(this.name + ": " + payload.message);
            if (!this.horoscopes[payload.sign]) {
                this.horoscopes[payload.sign] = {};
            }
            this.horoscopes[payload.sign][payload.period] = {
                horoscope_data: "Unable to fetch " + payload.period + " horoscope for " + payload.sign + ". Error: " + (payload.error || "Unknown error")
            };
            
            if (!this.loadedHoroscopes[payload.sign]) {
                this.loadedHoroscopes[payload.sign] = {};
            }
            this.loadedHoroscopes[payload.sign][payload.period] = true;
        }
        this.updateDom();
    } else if (notification === "IMAGE_RESULT") {
        if (payload.success) {
            Log.info(this.name + ": Image fetched successfully for " + payload.sign);
            this.cachedImages[payload.sign] = payload.imagePath;
            this.updateDom();
        } else {
            Log.error(this.name + ": " + payload.message);
            this.cachedImages[payload.sign] = "modules/MMM-Starlight/error.png"; // Use an error image
        }
    } else if (notification === "CACHE_INITIALIZED") {
        Log.info(this.name + ": Cache initialized");
        this.isPreloading = false;
        this.loaded = true;
        this.updateDom();
        this.scheduleRotation();
    } else if (notification === "DAILY_HOROSCOPES_UPDATED") {
        Log.info(this.name + ": Daily horoscopes updated");
        this.updateHoroscopesFromCache();
    } else if (notification === "MIDNIGHT_UPDATE_SIMULATED") {
        Log.info(`${this.name}: Midnight update simulation completed`);
        this.updateHoroscopesFromCache();
        this.updateDom(0);
        this.scheduleRotation();
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
    }

});
