Module.register("MMM-Starlight", {
    defaults: {
        zodiacSign: ["taurus"],
        period: ["daily", "tomorrow", "monthly", "yearly"],
        signWaitTime: 120000,
        showImage: true,
        imageWidth: "50px",
        pauseDuration: 10000,
        scrollSpeed: 7,
        maxTextHeight: "400px",
        width: "400px",
        fontSize: "1em",
    },

    updateInterval: 60 * 60 * 1000, // 1 hour
    requestTimeout: 30000, // 30 seconds
    retryDelay: 300000, // 5 minutes
    maxRetries: 5,
    isPreloading: true,
    loadedHoroscopes: {},

    start: function() {
        Log.info("Starting module: " + this.name);
        this.horoscopes = {};
        this.loadedHoroscopes = {};
        this.currentSignIndex = 0;
        this.currentPeriodIndex = 0;
        this.loaded = false;
        this.isPreloading = true;
        this.isScrolling = false;
        this.preloadHoroscopes();
    },

    preloadHoroscopes: function() {
        console.log("Preloading horoscopes for signs:", this.config.zodiacSign);
        console.log("Preloading horoscopes for periods:", this.config.period);
        this.config.zodiacSign.forEach(sign => {
            this.loadedHoroscopes[sign] = {};
            this.config.period.forEach(period => {
                console.log(`Requesting horoscope for ${sign}, period: ${period}`);
                this.getHoroscope(sign, period);
            });
        });
    },

    getStyles: function() {
        return ["MMM-Starlight.css"];
    },

    scheduleUpdate: function(delay) {
        var self = this;
        var nextLoad = this.updateInterval;
        if (typeof delay !== "undefined" && delay >= 0) {
            nextLoad = delay;
        }
    
        clearTimeout(this.updateTimer);
        this.updateTimer = setTimeout(function() {
            self.isPreloading = true;
            self.preloadHoroscopes();
        }, nextLoad);
    },

    areAllHoroscopesLoaded: function() {
        return this.config.zodiacSign.every(sign => 
            this.config.period.every(period => 
                this.loadedHoroscopes[sign] && this.loadedHoroscopes[sign][period]
            )
        );
    },

    getDom: function() {
        var wrapper = document.createElement("div");
        wrapper.className = "MMM-Starlight";
        wrapper.style.width = this.config.width;
        wrapper.style.fontSize = this.config.fontSize;

        if (this.isPreloading) {
            wrapper.innerHTML = "Loading horoscopes...";
            return wrapper;
        }

        if (!this.loaded) {
            wrapper.innerHTML = "Error loading horoscopes. Please check your configuration and logs.";
            return wrapper;
        }

        console.log("Current indices:", this.currentSignIndex, this.currentPeriodIndex);
        console.log("Config:", this.config.zodiacSign, this.config.period);

        var currentSign = this.config.zodiacSign[this.currentSignIndex];
        var currentPeriod = this.config.period[this.currentPeriodIndex];
        var nextPeriodIndex = (this.currentPeriodIndex + 1) % this.config.period.length;
        var nextSignIndex = nextPeriodIndex === 0 ? (this.currentSignIndex + 1) % this.config.zodiacSign.length : this.currentSignIndex;
        var nextSign = this.config.zodiacSign[nextSignIndex];
        var nextPeriod = this.config.period[nextPeriodIndex];

        console.log(`Preparing DOM: Current ${currentSign} ${currentPeriod}, Next ${nextSign} ${nextPeriod}`);

        // Title (always visible)
        var titleElement = document.createElement("div");
        titleElement.className = "starlight-title";
        titleElement.innerHTML = this.formatPeriodText(currentPeriod) + 
                                 " Horoscope for " + currentSign.charAt(0).toUpperCase() + currentSign.slice(1);
        wrapper.appendChild(titleElement);

        // Sliding container for image
        var imageSlideContainer = document.createElement("div");
        imageSlideContainer.className = "starlight-image-slide-container";

        // Current image
        imageSlideContainer.appendChild(this.createImageElement(currentSign, "current"));

        // Next image
        imageSlideContainer.appendChild(this.createImageElement(nextSign, "next"));

        wrapper.appendChild(imageSlideContainer);

        // Sliding container for text content
        var textSlideContainer = document.createElement("div");
        textSlideContainer.className = "starlight-text-slide-container";

        // Current content
        textSlideContainer.appendChild(this.createTextElement(currentSign, "current", currentPeriod));

        // Next content
        textSlideContainer.appendChild(this.createTextElement(nextSign, "next", nextPeriod));

        wrapper.appendChild(textSlideContainer);
        return wrapper;
    },

    createImageElement: function(sign, className) {
        var imageWrapper = document.createElement("div");
        imageWrapper.className = "starlight-image-wrapper " + className;
        var image = document.createElement("img");
        var capitalizedSign = sign.charAt(0).toUpperCase() + sign.slice(1);
        
        if (capitalizedSign === "Capricorn") capitalizedSign = "Capricornus";
        if (capitalizedSign === "Scorpio") capitalizedSign = "Scorpius";
        
        var svgFileName = `${capitalizedSign}_symbol_(outline).svg`;
        var encodedFileName = encodeURIComponent(svgFileName);
        var pngUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodedFileName}?width=240`;
        
        image.src = pngUrl;
        image.alt = sign + " zodiac sign";
        image.style.width = this.config.imageWidth;
        image.onerror = function() {
            console.error("Failed to load image:", pngUrl);
            this.style.display = 'none';
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
        horoscopeTextElement.innerHTML = this.horoscopes[sign][period];
    } else {
        horoscopeTextElement.innerHTML = "Loading " + period + " horoscope for " + sign + "...";
        // Attempt to fetch the horoscope if it's not available
        this.getHoroscope(sign, period);
    }
    
    horoscopeWrapper.appendChild(horoscopeTextElement);
    textContent.appendChild(horoscopeWrapper);

    return textContent;
},

    formatPeriodText: function(period) {
        if (period === "tomorrow") {
            return "Tomorrow's";
        }
        return period.charAt(0).toUpperCase() + period.slice(1);
    },

    updateHoroscopes: function() {
        this.config.zodiacSign.forEach(sign => {
            this.config.period.forEach(period => {
                this.getHoroscope(sign, period);
            });
        });
        this.scheduleUpdate(this.updateInterval);
    },

    getHoroscope: function(sign, period) {
        Log.info(this.name + ": Requesting horoscope update for " + sign + ", period: " + period);
        this.sendSocketNotification("GET_HOROSCOPE", {
            sign: sign,
            period: period,
            timeout: this.requestTimeout,
            retryDelay: this.retryDelay,
            maxRetries: this.maxRetries
        });
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

    scheduleRotation: function() {
        if (this.config.zodiacSign.length === 1 && this.config.period.length === 1) {
            // Don't schedule rotation for single sign and period
            return;
        }

        var self = this;
        this.rotationTimer = setTimeout(function() {
            self.checkAndRotate();
        }, this.config.signWaitTime);
    },

    checkAndRotate: function() {
        if (this.config.zodiacSign.length === 1 && this.config.period.length === 1) {
            // Don't rotate for single sign and period
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
        // Get the next period and sign before starting the transition
        const { currentSign, currentPeriod, nextSign, nextPeriod } = this.getNextPeriodAndSign();

        console.log(`Preparing next slide: Current ${currentSign} ${currentPeriod}, Next ${nextSign} ${nextPeriod}`);

        // Prepare both current and next content before the transition
        const currentText = textSlideContainer.querySelector(".starlight-text-content.current");
        const nextText = textSlideContainer.querySelector(".starlight-text-content.next");
        const currentImage = imageSlideContainer.querySelector(".starlight-image-wrapper.current");
        const nextImage = imageSlideContainer.querySelector(".starlight-image-wrapper.next");

        // Update the next content with the current period's horoscope
        nextText.innerHTML = this.createTextElement(currentSign, "next", currentPeriod).innerHTML;
        
        // Determine if we need to change the zodiac sign image
        const isSignChange = currentPeriod === this.config.period[0];
        
        if (isSignChange) {
            // Prepare the next image only if we're changing signs
            nextImage.innerHTML = this.createImageElement(currentSign, "next").innerHTML;
        }

        // Start the transition for text
        textSlideContainer.style.transition = "transform 1s ease-in-out";
        textSlideContainer.style.transform = "translateX(calc(-50% - 40px))";

        // Start the transition for image only if we're changing signs
        if (isSignChange) {
            imageSlideContainer.style.transition = "transform 1s ease-in-out";
            imageSlideContainer.style.transform = "translateX(calc(-50% - 40px))";
        }

        // Add the fading class to the current title
        titleElement.classList.add('fading');

        setTimeout(() => {
            titleElement.classList.remove('fading');

            // Update the title text after the transition
            titleElement.innerHTML = this.formatPeriodText(currentPeriod) + " Horoscope for " + currentSign.charAt(0).toUpperCase() + currentSign.slice(1);

            // Reset positions without transition
            textSlideContainer.style.transition = "none";
            textSlideContainer.style.transform = "translateX(0)";

            // Update the current text content with the now-visible next content
            currentText.innerHTML = nextText.innerHTML;

            if (isSignChange) {
                imageSlideContainer.style.transition = "none";
                imageSlideContainer.style.transform = "translateX(0)";
                currentImage.innerHTML = nextImage.innerHTML;
            }

            // Prepare the next slide's content for the next rotation
            nextText.innerHTML = this.createTextElement(nextSign, "next", nextPeriod).innerHTML;
            
            if (isSignChange) {
                nextImage.innerHTML = this.createImageElement(nextSign, "next").innerHTML;
            }

            // Add initial pause before starting to scroll
            setTimeout(() => {
                this.startScrolling();
            }, this.config.pauseDuration);

            this.scheduleRotation();
        }, 1000); // Match the transition duration
    }
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
                        // Don't reset the scroll position to maintain last cycle visibility
                    }, verticalDuration + self.config.pauseDuration);
                } else {
                    self.isScrolling = false;
                }
            }
        }, 100);
    },

socketNotificationReceived: function(notification, payload) {
        console.log(this.name + ": Received socket notification:", notification, payload);
        if (notification === "HOROSCOPE_RESULT") {
            if (payload.success) {
                Log.info(this.name + ": Horoscope fetched successfully for " + payload.sign + ", period: " + payload.period);
                if (!this.horoscopes[payload.sign]) {
                    this.horoscopes[payload.sign] = {};
                }
                this.horoscopes[payload.sign][payload.period] = payload.data;
                
                // Update loaded status
                if (!this.loadedHoroscopes[payload.sign]) {
                    this.loadedHoroscopes[payload.sign] = {};
                }
                this.loadedHoroscopes[payload.sign][payload.period] = true;
                
                // Check if all horoscopes are loaded
                if (this.areAllHoroscopesLoaded()) {
                    this.isPreloading = false;
                    this.loaded = true;
                    this.updateDom();
                    if (!this.rotationTimer) {
                        this.scheduleRotation();
                    }
                    this.startScrolling();
                }
            } else {
                Log.error(this.name + ": " + payload.message);
                if (!this.horoscopes[payload.sign]) {
                    this.horoscopes[payload.sign] = {};
                }

                this.horoscopes[payload.sign][payload.period] = "Unable to fetch " + payload.period + " horoscope for " + payload.sign + ". Error: " + (payload.error || "Unknown error");
                
                // Mark this horoscope as loaded even if it failed
                if (!this.loadedHoroscopes[payload.sign]) {
                    this.loadedHoroscopes[payload.sign] = {};
                }
                this.loadedHoroscopes[payload.sign][payload.period] = true;
                
                // Check if all horoscopes are loaded, including failed ones
                if (this.areAllHoroscopesLoaded()) {
                    this.isPreloading = false;
                    this.loaded = true;
                    this.updateDom();
                    if (!this.rotationTimer) {
                        this.scheduleRotation();
                    }
                }
            }
        } else if (notification === "UNHANDLED_ERROR") {
            Log.error(this.name + ": Unhandled error in node helper: " + payload.message + ". Error: " + payload.error);
            this.horoscopes[this.config.zodiacSign[this.currentSignIndex]][this.config.period[this.currentPeriodIndex]] = "An unexpected error occurred while fetching the horoscope. Please check the logs.";
            this.isPreloading = false;
            this.loaded = false;
            this.updateDom();
        }
    }

});
