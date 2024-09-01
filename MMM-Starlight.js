Module.register("MMM-Starlight", {
    defaults: {
        zodiacSign: ["taurus"],
        period: ["daily", "tomorrow", "weekly", "monthly"],
        showImage: true,
        imageWidth: "100px",
        pauseDuration: 10000,
        scrollSpeed: 7,
        maxTextHeight: "400px",
        width: "400px",
        fontSize: "1em",
        signWaitTime: 120000,
        updateInterval: 60 * 60 * 1000, // 1 hour
        debug: false,
        test: null
    },

    getStyles: function() {
        return ["MMM-Starlight.css"];
    },

    start: function() {
        Log.info("Starting module: " + this.name);
        this.horoscopes = {};
        this.images = {};
        this.currentSignIndex = 0;
        this.currentPeriodIndex = 0;
        this.loaded = false;
        this.isScrolling = false;
    
        if (this.config.debug && this.config.test) {
            Log.info(`${this.name}: Debug mode active. Test mode set to '${this.config.test}'`);
        }
    
        this.sendSocketNotification("INIT_MODULE", this.config);
        this.scheduleUpdate();
    },

    getDom: function() {
        this.log('debug', "Building DOM");
        var wrapper = document.createElement("div");
        wrapper.className = "MMM-Starlight";
        wrapper.style.width = this.config.width;
        wrapper.style.fontSize = this.config.fontSize;

        if (!this.loaded) {
            this.log('debug', "Module not loaded yet, displaying loading message");
            wrapper.innerHTML = "Loading horoscopes...";
            return wrapper;
        }

        this.log('debug', `Current sign index: ${this.currentSignIndex}, period index: ${this.currentPeriodIndex}`);

        if (this.config.zodiacSign.length === 1 && this.config.period.length === 1) {
            wrapper.classList.add("single-sign");
            wrapper.appendChild(this.createSignElement(this.config.zodiacSign[0], "single", this.config.period[0]));
        } else {
            wrapper.classList.add("multiple-signs");
            var slideContainer = document.createElement("div");
            slideContainer.className = "starlight-slide-container";

            var currentSign = this.config.zodiacSign[this.currentSignIndex];
            var currentPeriod = this.config.period[this.currentPeriodIndex];
            var nextSignIndex = (this.currentSignIndex + 1) % this.config.zodiacSign.length;
            var nextPeriodIndex = (this.currentPeriodIndex + 1) % this.config.period.length;
            var nextSign = nextPeriodIndex === 0 ? this.config.zodiacSign[nextSignIndex] : currentSign;
            var nextPeriod = this.config.period[nextPeriodIndex];

            slideContainer.appendChild(this.createSignElement(currentSign, "current", currentPeriod));
            slideContainer.appendChild(this.createSignElement(nextSign, "next", nextPeriod));

            wrapper.appendChild(slideContainer);
        }

        this.log('debug', "DOM built successfully");
        return wrapper;
    },

    createSignElement: function(sign, className, period) {
        this.log('debug', `Creating sign element for ${sign}, ${period}`);
        var slideWrapper = document.createElement("div");
        slideWrapper.className = "starlight-slide-wrapper " + className;
    
        var contentWrapper = document.createElement("div");
        contentWrapper.className = "starlight-content-wrapper";
    
        var textContent = document.createElement("div");
        textContent.className = "starlight-text-content";
    
        var periodText = document.createElement("div");
        periodText.className = "starlight-period";
        periodText.innerHTML = this.formatPeriodText(period) + " Horoscope for " + sign.charAt(0).toUpperCase() + sign.slice(1);
        textContent.appendChild(periodText);
    
        var horoscopeWrapper = document.createElement("div");
        horoscopeWrapper.className = "starlight-text-wrapper";
        horoscopeWrapper.style.maxHeight = this.config.maxTextHeight;
    
        var horoscopeTextElement = document.createElement("div");
        horoscopeTextElement.className = "starlight-text";
        if (this.horoscopes[sign] && this.horoscopes[sign][period]) {
            horoscopeTextElement.innerHTML = this.horoscopes[sign][period].content;
            this.log('debug', `Horoscope content found for ${sign}, ${period}`);
        } else {
            horoscopeTextElement.innerHTML = "Loading " + period + " horoscope for " + sign + "...";
            this.log('debug', `No horoscope content found for ${sign}, ${period}`);
        }
        horoscopeWrapper.appendChild(horoscopeTextElement);
    
        textContent.appendChild(horoscopeWrapper);
        contentWrapper.appendChild(textContent);
    
        if (this.config.showImage) {
            var imageWrapper = document.createElement("div");
            imageWrapper.className = "starlight-image-wrapper";
            var image = document.createElement("img");
            
            let imageSrc = this.images[sign];
            this.log('debug', `Image source for ${sign} from this.images: ${imageSrc}`);
            
            if (!imageSrc) {
                this.log('debug', `No cached image found for ${sign}, requesting from node helper`);
                this.sendSocketNotification("GET_IMAGE", { sign: sign });
                imageSrc = "modules/MMM-Starlight/loading.gif"; // Use a placeholder image
            } else if (imageSrc.startsWith('/')) {
                // If it's a local path, we need to get the image data
                this.log('debug', `Local image path detected for ${sign}: ${imageSrc}`);
                this.sendSocketNotification("GET_IMAGE_DATA", { sign: sign, path: imageSrc });
                // Don't set imageSrc to loading.gif here, keep the local path
            }
            
            this.log('debug', `Setting image source for ${sign}: ${imageSrc}`);
            
            image.src = imageSrc;
            image.alt = sign + " zodiac sign";
            image.style.width = this.config.imageWidth;
            
            image.onerror = (e) => {
                this.log('error', `Failed to load image for ${sign}. Error: ${e.type}`);
                this.log('error', `Image src: ${imageSrc}`);
                image.style.display = 'none';
                let altText = document.createElement('span');
                altText.textContent = image.alt;
                imageWrapper.appendChild(altText);
            };
            
            image.onload = () => {
                this.log('debug', `Image for ${sign} loaded successfully`);
            };
            
            imageWrapper.appendChild(image);
            contentWrapper.appendChild(imageWrapper);
        }
        slideWrapper.appendChild(contentWrapper);
        return slideWrapper;
    },

    formatPeriodText: function(period) {
        if (period === "tomorrow") {
            return "Tomorrow's";
        }
        return period.charAt(0).toUpperCase() + period.slice(1);
    },

    scheduleUpdate: function() {
        this.log('debug', `Executing initial update check at ${new Date().toISOString()}`);
        this.sendSocketNotification("CHECK_FOR_UPDATES");
    
        setInterval(() => {
            this.log('debug', `Executing 45-minute update check at ${new Date().toISOString()}`);
            this.sendSocketNotification("CHECK_FOR_UPDATES");
        }, 45 * 60 * 1000);
    },

    scheduleRotation: function() {
        if (this.config.zodiacSign.length === 1 && this.config.period.length === 1) {
            return;
        }

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
        var container = document.querySelector(".MMM-Starlight .starlight-slide-container");
        if (container) {
            container.style.transition = "transform 1s ease-in-out";
            container.style.transform = "translateX(-50%)";

            setTimeout(() => {
                this.currentPeriodIndex = (this.currentPeriodIndex + 1) % this.config.period.length;
                if (this.currentPeriodIndex === 0) {
                    this.currentSignIndex = (this.currentSignIndex + 1) % this.config.zodiacSign.length;
                }
                container.style.transition = "none";
                container.style.transform = "translateX(0)";
                this.updateDom(0);
                this.startScrolling();
                this.scheduleRotation();
            }, 1000);
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
                var contentHeight = textContent.offsetHeight;

                if (contentHeight > wrapperHeight) {
                    self.isScrolling = true;
                    var scrollDistance = contentHeight - wrapperHeight;
                    var verticalDuration = (scrollDistance / self.config.scrollSpeed) * 1000;

                    setTimeout(() => {
                        textContent.style.transition = `transform ${verticalDuration}ms linear`;
                        textContent.style.transform = `translateY(-${scrollDistance}px)`;

                        setTimeout(() => {
                            textContent.style.transition = `opacity 0.5s ease-out`;
                            textContent.style.opacity = 0;

                            setTimeout(() => {
                                textContent.style.transition = 'none';
                                textContent.style.transform = 'translateY(0)';

                                void textContent.offsetWidth;

                                textContent.style.transition = `opacity 0.5s ease-in`;
                                textContent.style.opacity = 1;

                                self.isScrolling = false;

                                setTimeout(() => {
                                    self.startScrolling();
                                }, 500);
                            }, 500);
                        }, verticalDuration + self.config.pauseDuration);
                    }, self.config.pauseDuration);
                } else {
                    self.isScrolling = false;
                }
            }
        }, 1000);
    },

    socketNotificationReceived: function(notification, payload) {
        this.log('debug', `Received socket notification: ${notification}`);
        if (notification === "HOROSCOPE_RESULT") {
            this.log('debug', `Received horoscope for ${payload.sign}, ${payload.period}`);
            if (!this.horoscopes[payload.sign]) {
                this.horoscopes[payload.sign] = {};
            }
            this.horoscopes[payload.sign][payload.period] = payload.data;
            this.updateDom();
        } else if (notification === "IMAGE_RESULT") {
            this.log('debug', `Received image path for ${payload.sign}: ${payload.path}`);
            this.images[payload.sign] = payload.path;
            this.updateDom();
        } else if (notification === "IMAGE_DATA_RESULT") {
            this.log('debug', `Received image data for ${payload.sign}`);
            this.images[payload.sign] = payload.dataUrl;
            this.updateDom();
        } else if (notification === "CACHE_BUILT") {
            this.log('debug', "Cache built notification received");
            this.loaded = true;
            this.updateDom();
            this.scheduleUpdate();
            this.scheduleRotation();
        }
    },

    log: function(level, message) {
        if (level === 'info' || (level === 'debug' && this.config.debug)) {
            const timestamp = new Date().toISOString();
            Log.log(`[${timestamp}] ${this.name} [${level.toUpperCase()}]: ${message}`);
        }
    }
});
