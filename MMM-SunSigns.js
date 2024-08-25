Module.register("MMM-SunSigns", {
    defaults: {
        zodiacSign: ["taurus"],
        period: "daily",
        updateInterval: 60 * 60 * 1000,
        retryDelay: 300000,
        maxRetries: 5,
        width: "400px",
        fontSize: "1em",
        imageWidth: "100px",
        maxTextHeight: "200px",
        scrollSpeed: 6,
        pauseDuration: 2000,
        requestTimeout: 30000,
        signWaitTime: 60000,
    },

    start: function() {
        Log.info("Starting module: " + this.name);
        this.horoscopes = {};
        this.currentSignIndex = 0;
        this.loaded = false;
        this.scheduleUpdate(1000);
        if (this.config.zodiacSign.length > 1) {
            this.scheduleSignRotation();
        }
    },

    getStyles: function() {
        return ["MMM-SunSigns.css"];
    },

    getDom: function() {
        var wrapper = document.createElement("div");
        wrapper.className = "MMM-SunSigns";
        wrapper.style.width = this.config.width;
        wrapper.style.fontSize = this.config.fontSize;

        if (!this.loaded) {
            wrapper.innerHTML = "Loading horoscope...";
            return wrapper;
        }

        if (this.config.zodiacSign.length === 1) {
            // Single sign configuration
            wrapper.appendChild(this.createSignElement(this.config.zodiacSign[0], "single"));
        } else {
            // Multiple signs configuration
            var slideContainer = document.createElement("div");
            slideContainer.className = "sunsigns-slide-container";

            var currentSign = this.config.zodiacSign[this.currentSignIndex];
            var nextSignIndex = (this.currentSignIndex + 1) % this.config.zodiacSign.length;
            var nextSign = this.config.zodiacSign[nextSignIndex];

            slideContainer.appendChild(this.createSignElement(currentSign, "current"));
            slideContainer.appendChild(this.createSignElement(nextSign, "next"));

            wrapper.appendChild(slideContainer);
        }

        return wrapper;
    },

    createSignElement: function(sign, className) {
        var slideWrapper = document.createElement("div");
        slideWrapper.className = "sunsigns-slide-wrapper " + className;

        var contentWrapper = document.createElement("div");
        contentWrapper.className = "sunsigns-content-wrapper";

        var textContent = document.createElement("div");
        textContent.className = "sunsigns-text-content";

        var periodText = document.createElement("div");
        periodText.className = "sunsigns-period";
        periodText.innerHTML = this.config.period.charAt(0).toUpperCase() + this.config.period.slice(1) + " Horoscope for " + sign.charAt(0).toUpperCase() + sign.slice(1);
        textContent.appendChild(periodText);

        var horoscopeWrapper = document.createElement("div");
        horoscopeWrapper.className = "sunsigns-text-wrapper";
        horoscopeWrapper.style.maxHeight = this.config.maxTextHeight;

        var horoscopeTextElement = document.createElement("div");
        horoscopeTextElement.className = "sunsigns-text";
        horoscopeTextElement.innerHTML = this.horoscopes[sign] || "Loading horoscope for " + sign + "...";
        horoscopeWrapper.appendChild(horoscopeTextElement);

        textContent.appendChild(horoscopeWrapper);
        contentWrapper.appendChild(textContent);

        var imageWrapper = document.createElement("div");
        imageWrapper.className = "sunsigns-image-wrapper";
        var image = document.createElement("img");
        image.src = `https://www.sunsigns.com/wp-content/themes/sunsigns/assets/images/_sun-signs/${sign}/wrappable.png`;
        image.alt = sign + " zodiac sign";
        image.style.width = this.config.imageWidth;
        imageWrapper.appendChild(image);

        contentWrapper.appendChild(imageWrapper);
        slideWrapper.appendChild(contentWrapper);

        return slideWrapper;
    },

    scheduleUpdate: function(delay) {
        var self = this;
        var nextLoad = this.config.updateInterval;
        if (typeof delay !== "undefined" && delay >= 0) {
            nextLoad = delay;
        }

        clearTimeout(this.updateTimer);
        this.updateTimer = setTimeout(function() {
            self.updateHoroscopes();
        }, nextLoad);
    },

    updateHoroscopes: function() {
        this.config.zodiacSign.forEach(sign => {
            this.getHoroscope(sign);
        });
        this.scheduleUpdate(this.config.updateInterval);
    },

    getHoroscope: function(sign) {
        Log.info(this.name + ": Requesting horoscope update for " + sign);
        this.sendSocketNotification("GET_HOROSCOPE", {
            sign: sign,
            period: this.config.period,
            timeout: this.config.requestTimeout,
            retryDelay: this.config.retryDelay,
            maxRetries: this.config.maxRetries
        });
    },

    scheduleSignRotation: function() {
        var self = this;
        setInterval(function() {
            self.slideToNextSign();
        }, this.config.signWaitTime);
    },

    slideToNextSign: function() {
        if (this.config.zodiacSign.length <= 1) return; // Don't slide if there's only one sign

        var container = document.querySelector(".MMM-SunSigns .sunsigns-slide-container");
        if (container) {
            container.style.transition = "transform 1s ease-in-out";
            container.style.transform = "translateX(-50%)";
            
            setTimeout(() => {
                this.currentSignIndex = (this.currentSignIndex + 1) % this.config.zodiacSign.length;
                container.style.transition = "none";
                container.style.transform = "translateX(0)";
                this.updateDom(0); // Force immediate update
                this.startScrolling();
            }, 1000); // Wait for slide animation to complete
        }
    },

    socketNotificationReceived: function(notification, payload) {
        console.log(this.name + ": Received socket notification:", notification, payload);
        if (notification === "HOROSCOPE_RESULT") {
            if (payload.success) {
                Log.info(this.name + ": Horoscope fetched successfully for " + payload.sign);
                this.horoscopes[payload.sign] = payload.data;
                this.loaded = true;
                if (payload.sign === this.config.zodiacSign[this.currentSignIndex]) {
                    this.updateDom();
                    this.startScrolling();
                }
            } else {
                Log.error(this.name + ": " + payload.message);
                this.horoscopes[payload.sign] = "Unable to fetch horoscope for " + payload.sign + ". Error: " + (payload.error || "Unknown error");
                this.updateDom();
            }
        } else if (notification === "UNHANDLED_ERROR") {
            Log.error(this.name + ": Unhandled error in node helper: " + payload.message + ". Error: " + payload.error);
            this.horoscopes[this.config.zodiacSign[this.currentSignIndex]] = "An unexpected error occurred while fetching the horoscope. Please check the logs.";
            this.updateDom();
        }
    },

    startScrolling: function() {
        var self = this;
        clearTimeout(this.scrollTimer);

        this.scrollTimer = setTimeout(function() {
            var textWrapper = document.querySelector(".MMM-SunSigns .sunsigns-text-wrapper");
            var textContent = document.querySelector(".MMM-SunSigns .sunsigns-text");
            
            if (textWrapper && textContent) {
                var wrapperHeight = textWrapper.offsetHeight;
                var contentHeight = textContent.offsetHeight;
                
                if (contentHeight > wrapperHeight) {
                    var scrollDistance = contentHeight - wrapperHeight;
                    var verticalDuration = (scrollDistance / self.config.scrollSpeed) * 1000;

                    // Wait for pauseDuration before starting to scroll
                    setTimeout(() => {
                        textContent.style.transition = `transform ${verticalDuration}ms linear`;
                        textContent.style.transform = `translateY(-${scrollDistance}px)`;

                        // Wait for scrolling to complete and pauseDuration before fading out
                        setTimeout(() => {
                            // Fade out
                            textContent.style.transition = `opacity 0.5s ease-out`;
                            textContent.style.opacity = 0;

                            // After fading out, reset position and fade in
                            setTimeout(() => {
                                textContent.style.transition = 'none';
                                textContent.style.transform = 'translateY(0)';
                                
                                // Trigger reflow
                                void textContent.offsetWidth;

                                // Fade in
                                textContent.style.transition = `opacity 0.5s ease-in`;
                                textContent.style.opacity = 1;

                                // Restart the scrolling process after fading in
                                setTimeout(() => {
                                    self.startScrolling();
                                }, 500); // Wait for fade-in to complete
                            }, 500); // Wait for fade-out to complete
                        }, verticalDuration + self.config.pauseDuration);
                    }, self.config.pauseDuration);
                }
            }
        }, 1000);
    }
});
