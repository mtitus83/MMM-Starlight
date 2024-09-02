Module.register("MMM-Starlight", {
    defaults: {
        zodiacSign: ["taurus"],
        period: ["daily", "tomorrow"],
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

    start: function() {
        Log.info("Starting module: " + this.name);
        this.horoscopes = {};
        this.currentSignIndex = 0;
        this.currentPeriodIndex = 0;
        this.loaded = false;
        this.isScrolling = false;
        this.scheduleUpdate(1000);
        this.scheduleRotation();
    },

    getStyles: function() {
        return ["MMM-Starlight.css"];
    },

    getDom: function() {
        var wrapper = document.createElement("div");
        wrapper.className = "MMM-Starlight";
        wrapper.style.width = this.config.width;
        wrapper.style.fontSize = this.config.fontSize;

        if (!this.loaded) {
            wrapper.innerHTML = "Loading horoscope...";
            return wrapper;
        }

        var currentSign = this.config.zodiacSign[this.currentSignIndex];
        var currentPeriod = this.config.period[this.currentPeriodIndex];
        var nextSignIndex = (this.currentSignIndex + 1) % this.config.zodiacSign.length;
        var nextPeriodIndex = (this.currentPeriodIndex + 1) % this.config.period.length;
        var nextSign = this.config.zodiacSign[nextSignIndex];
        var nextPeriod = this.config.period[nextPeriodIndex];

        // Title (always visible)
        var titleElement = document.createElement("div");
        titleElement.className = "starlight-title";
        titleElement.innerHTML = this.formatPeriodText(currentPeriod) + 
                                 " Horoscope for " + currentSign.charAt(0).toUpperCase() + currentSign.slice(1);
        wrapper.appendChild(titleElement);

        // Sliding container for both image and text
        var slideContainer = document.createElement("div");
        slideContainer.className = "starlight-slide-container";

        // Current content
        slideContainer.appendChild(this.createContentElement(currentSign, "current", currentPeriod));

        // Next content
        slideContainer.appendChild(this.createContentElement(
            nextPeriodIndex === 0 ? nextSign : currentSign,
            "next",
            nextPeriodIndex === 0 ? this.config.period[0] : nextPeriod
        ));

        wrapper.appendChild(slideContainer);

        // Create text container
        var textContainer = document.createElement("div");
        textContainer.className = "starlight-text-container";

        var slideContainer = document.createElement("div");
        slideContainer.className = "starlight-slide-container";

        slideContainer.appendChild(this.createTextElement(currentSign, "current", currentPeriod));
        slideContainer.appendChild(this.createTextElement(currentSign, "next", nextPeriod));

        textContainer.appendChild(slideContainer);
        wrapper.appendChild(textContainer);

        return wrapper;
    },

    updateStaticContent: function() {
        var currentSign = this.config.zodiacSign[this.currentSignIndex];
        var titleElement = document.querySelector(".MMM-Starlight .starlight-title");
        if (titleElement) {
            titleElement.innerHTML = "Horoscope for " + currentSign.charAt(0).toUpperCase() + currentSign.slice(1);
        }

        var imageContainer = document.querySelector(".MMM-Starlight .starlight-image-wrapper");
        if (imageContainer) {
            imageContainer.innerHTML = '';
            imageContainer.appendChild(this.createImageElement(currentSign));
        }
    },

    createSignElement: function(sign, className, period) {
        var slideWrapper = document.createElement("div");
        slideWrapper.className = "starlight-slide-wrapper " + className;
    
        var contentWrapper = document.createElement("div");
        contentWrapper.className = "starlight-content-wrapper";
    
        // Add image here, outside of the text content
        if (this.config.showImage) {
            contentWrapper.appendChild(this.createImageElement(sign));
        }
    
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
        horoscopeTextElement.innerHTML = this.horoscopes[sign] && this.horoscopes[sign][period] 
            ? this.horoscopes[sign][period] 
            : "Loading " + period + " horoscope for " + sign + "...";
        horoscopeWrapper.appendChild(horoscopeTextElement);
    
        textContent.appendChild(horoscopeWrapper);
        contentWrapper.appendChild(textContent);
    
        slideWrapper.appendChild(contentWrapper);
    
        return slideWrapper;
    },

    formatPeriodText: function(period) {
        if (period === "tomorrow") {
            return "Tomorrow's";
        }
        return period.charAt(0).toUpperCase() + period.slice(1);
    },

    scheduleUpdate: function(delay) {
        var self = this;
        var nextLoad = this.updateInterval;
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
        var slideContainer = document.querySelector(".MMM-Starlight .starlight-slide-container");
        
        if (slideContainer) {
            slideContainer.style.transition = "transform 1s ease-in-out";
            slideContainer.style.transform = "translateX(-50%)";

            setTimeout(() => {
                this.currentPeriodIndex = (this.currentPeriodIndex + 1) % this.config.period.length;
                if (this.currentPeriodIndex === 0) {
                    this.currentSignIndex = (this.currentSignIndex + 1) % this.config.zodiacSign.length;
                }
                
                slideContainer.style.transition = "none";
                slideContainer.style.transform = "translateX(0)";
                
                this.updateDom(0);
                this.startScrolling();
                this.scheduleRotation();
            }, 1000);
        }
    },


    createContentElement: function(sign, className, period) {
        var contentWrapper = document.createElement("div");
        contentWrapper.className = "starlight-content-wrapper " + className;

        // Image
        if (this.config.showImage) {
            contentWrapper.appendChild(this.createImageElement(sign));
        }

        // Text content
        var textContent = document.createElement("div");
        textContent.className = "starlight-text-content";

        var horoscopeWrapper = document.createElement("div");
        horoscopeWrapper.className = "starlight-text-wrapper";
        horoscopeWrapper.style.maxHeight = this.config.maxTextHeight;

        var horoscopeTextElement = document.createElement("div");
        horoscopeTextElement.className = "starlight-text";
        horoscopeTextElement.innerHTML = this.horoscopes[sign] && this.horoscopes[sign][period] 
            ? this.horoscopes[sign][period] 
            : "Loading " + period + " horoscope for " + sign + "...";
        horoscopeWrapper.appendChild(horoscopeTextElement);

        textContent.appendChild(horoscopeWrapper);
        contentWrapper.appendChild(textContent);

        return contentWrapper;
    },

    createSlideElement: function(sign, className, period) {
        var slideWrapper = document.createElement("div");
        slideWrapper.className = "starlight-slide-wrapper " + className;

        var contentWrapper = document.createElement("div");
        contentWrapper.className = "starlight-content-wrapper";

        // Horoscope text
        var horoscopeWrapper = document.createElement("div");
        horoscopeWrapper.className = "starlight-text-wrapper";
        horoscopeWrapper.style.maxHeight = this.config.maxTextHeight;

        var horoscopeTextElement = document.createElement("div");
        horoscopeTextElement.className = "starlight-text";
        horoscopeTextElement.innerHTML = this.horoscopes[sign] && this.horoscopes[sign][period] 
            ? this.horoscopes[sign][period] 
            : "Loading " + period + " horoscope for " + sign + "...";
        horoscopeWrapper.appendChild(horoscopeTextElement);

        contentWrapper.appendChild(horoscopeWrapper);
        slideWrapper.appendChild(contentWrapper);

        return slideWrapper;
    },

    createTextElement: function(sign, className, period) {
        var slideWrapper = document.createElement("div");
        slideWrapper.className = "starlight-slide-wrapper " + className;

        var contentWrapper = document.createElement("div");
        contentWrapper.className = "starlight-content-wrapper";

        // Period text
        var periodText = document.createElement("div");
        periodText.className = "starlight-period";
        periodText.innerHTML = this.formatPeriodText(period);
        contentWrapper.appendChild(periodText);

        // Horoscope text
        var horoscopeWrapper = document.createElement("div");
        horoscopeWrapper.className = "starlight-text-wrapper";
        horoscopeWrapper.style.maxHeight = this.config.maxTextHeight;

        var horoscopeTextElement = document.createElement("div");
        horoscopeTextElement.className = "starlight-text";
        horoscopeTextElement.innerHTML = this.horoscopes[sign] && this.horoscopes[sign][period] 
            ? this.horoscopes[sign][period] 
            : "Loading " + period + " horoscope for " + sign + "...";
        horoscopeWrapper.appendChild(horoscopeTextElement);

        contentWrapper.appendChild(horoscopeWrapper);
        slideWrapper.appendChild(contentWrapper);

        return slideWrapper;
    },

    createImageElement: function(sign) {
        var imageWrapper = document.createElement("div");
        imageWrapper.className = "starlight-image-wrapper";
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

    socketNotificationReceived: function(notification, payload) {
        console.log(this.name + ": Received socket notification:", notification, payload);
        if (notification === "HOROSCOPE_RESULT") {
            if (payload.success) {
                Log.info(this.name + ": Horoscope fetched successfully for " + payload.sign + ", period: " + payload.period);
                if (!this.horoscopes[payload.sign]) {
                    this.horoscopes[payload.sign] = {};
                }
                this.horoscopes[payload.sign][payload.period] = payload.data;
                this.loaded = true;
                if (payload.sign === this.config.zodiacSign[this.currentSignIndex] &&
                    payload.period === this.config.period[this.currentPeriodIndex]) {
                    this.updateDom();
                    this.startScrolling();
                }
            } else {
                Log.error(this.name + ": " + payload.message);
                if (!this.horoscopes[payload.sign]) {
                    this.horoscopes[payload.sign] = {};
                }
                this.horoscopes[payload.sign][payload.period] = "Unable to fetch " + payload.period + " horoscope for " + payload.sign + ". Error: " + (payload.error || "Unknown error");
                this.updateDom();
            }
        } else if (notification === "UNHANDLED_ERROR") {
            Log.error(this.name + ": Unhandled error in node helper: " + payload.message + ". Error: " + payload.error);
            this.horoscopes[this.config.zodiacSign[this.currentSignIndex]][this.config.period[this.currentPeriodIndex]] = "An unexpected error occurred while fetching the horoscope. Please check the logs.";
            this.updateDom();
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

        // Calculate the scroll distance to leave 1/4 at the bottom
        var scrollDistance = contentHeight - (wrapperHeight * 0.75);

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
}

});
