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
        stopPosition: 0.75, // Percentage of the visible height to stop
        isInitialized: false,
        signWaitTime: 60000  // Total time to display each sign/period combination
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
    this.scrollManager = new ScrollManager(this);

    this.sendSocketNotification("INIT", { config: this.config });
    this.loadAllHoroscopes();  // Add this line to fetch all horoscopes
},

  setupDebugCounters: function() {
    const debugContainer = document.createElement("div");
    debugContainer.id = "debugContainer";
    debugContainer.style.position = "absolute";
    debugContainer.style.bottom = "10px";
    debugContainer.style.left = "10px";
    debugContainer.style.zIndex = "1000";
    debugContainer.style.color = "white";

    const signWaitTimeCounter = document.createElement("div");
    signWaitTimeCounter.id = "signWaitTimeCounter";
    debugContainer.appendChild(signWaitTimeCounter);

    const pauseDurationCounter = document.createElement("div");
    pauseDurationCounter.id = "pauseDurationCounter";
    debugContainer.appendChild(pauseDurationCounter);

    document.body.appendChild(debugContainer);
  },

  startScrollingOrTransition: function() {
    const horoscopeContainer = document.querySelector(".horoscope-container");
    const horoscopeText = document.querySelector(".horoscope-text");

    const visibleHeight = horoscopeContainer.clientHeight;
    const textHeight = horoscopeText.scrollHeight;

    if (this.config.debugMode) {
      this.setupDebugCounters(); // Setup debug counters if in debug mode
    }

    if (textHeight <= visibleHeight) {
      // Non-scrolling text: Handle the transition based on signWaitTime
      let elapsed = 0;
      const timerInterval = setInterval(() => {
        if (this.config.debugMode) {
          this.updateSignWaitTimeCounter(elapsed); // Update signWaitTime counter
        }
        elapsed += 1000; // Increment elapsed time by 1 second
      }, 1000);

      // Trigger slideToNext after signWaitTime
      setTimeout(() => {
        clearInterval(timerInterval); // Stop the timer
        this.slideToNext(); // Slide for non-scrolling text
      }, this.config.signWaitTime);

    } else {
      // Scrolling text: Trigger the scrolling logic for long text
      this.startScrolling();
    }
  },

  updateSignWaitTimeCounter: function(elapsed) {
    if (this.config.debugMode) {
      const remainingTime = Math.max(this.config.signWaitTime - elapsed, 0);
      document.getElementById("signWaitTimeCounter").innerHTML = `Sign Wait Time: ${remainingTime / 1000}s remaining`;
    }
  },

  updatePauseDurationCounter: function(elapsed) {
    if (this.config.debugMode) {
      const remainingPause = Math.max(this.config.pauseDuration - elapsed, 0);
      document.getElementById("pauseDurationCounter").innerHTML = `Pause Duration: ${remainingPause / 1000}s remaining`;
    }
  },

loadAllHoroscopes: function() {
    this.config.zodiacSign.forEach(sign => {
        this.config.period.forEach(period => {
            this.getHoroscope(sign, period);
        });
    });
},

    getStyles: function() {
        return [this.file("MMM-Starlight.css")];
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

    createHoroscopeContent: function() {
        var currentSign = this.config.zodiacSign[this.currentSignIndex];
        var currentPeriod = this.config.period[this.currentPeriodIndex];

        var content = document.createElement("div");

        if (this.config.debug) {
            content.appendChild(this.createDebugInfo(currentSign, currentPeriod));
        }

        content.appendChild(this.createTitleElement(currentSign, currentPeriod));

        var apiCallCountElement = document.createElement("div");
        apiCallCountElement.className = "starlight-api-call-count";
        apiCallCountElement.innerHTML = `API calls: ${this.apiCallCount}`;
        content.appendChild(apiCallCountElement);

        if (this.config.showImage) {
            content.appendChild(this.createImageElement(currentSign, "current"));
        }

        content.appendChild(this.createTextSlideContainer(currentSign, currentPeriod));

        return content;
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
            var horoscopeTextElement = document.createElement("div");
            horoscopeTextElement.className = "starlight-text";
            horoscopeTextElement.innerHTML = horoscopeData.horoscope_data || "Horoscope data not available.";
            
            if (period === "monthly" && horoscopeData.challenging_days && horoscopeData.standout_days) {
                horoscopeTextElement.innerHTML += `<br><br>Challenging days: ${horoscopeData.challenging_days}`;
                horoscopeTextElement.innerHTML += `<br>Standout days: ${horoscopeData.standout_days}`;
            }
            horoscopeWrapper.appendChild(horoscopeTextElement);
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

    getHoroscope: function(sign, period) {
        this.sendSocketNotification("GET_HOROSCOPE", {
            sign: sign,
            period: period
        });
    },

    scheduleRotation: function() {
        if (this.config.zodiacSign.length === 1 && this.config.period.length === 1) {
            return;
        } 

        clearTimeout(this.rotationTimer);
        var self = this;
        this.rotationTimer = setTimeout(function() {
            self.scrollManager.startScrolling();
        }, this.config.pauseDuration);
    },

  slideToNext: function() {
    const oldHoroscope = document.querySelector(".current-horoscope");
    const newHoroscope = document.querySelector(".next-horoscope");

    // Slide out the current horoscope and slide in the new one
    oldHoroscope.classList.add("slide-out");
    newHoroscope.classList.add("slide-in");

    setTimeout(() => {
      oldHoroscope.classList.remove("current-horoscope");
      newHoroscope.classList.add("current-horoscope");
    }, 1000); // Transition duration matches CSS
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

    socketNotificationReceived: function(notification, payload) {
        Log.info(`${this.name} received notification: ${notification}`);
        
        switch(notification) {
            case "HOROSCOPE_RESULT":
                this.handleHoroscopeResult(payload);
                break;
            case "CACHE_INITIALIZED":
                this.handleCacheInitialized();
                break;
            case "CACHE_RESET_COMPLETE":
                this.handleCacheResetComplete(payload);
                break;
            case "CACHE_UPDATED":
                this.handleCacheUpdated(payload);
                break;
            case "MIDNIGHT_UPDATE_COMPLETED":
                this.handleMidnightUpdateCompleted(payload);
                break;
            case "SIX_AM_UPDATE_COMPLETED":
                this.handleSixAMUpdateCompleted(payload);
                break;
            case "API_CALL_COUNT_UPDATED":
                this.apiCallCount = payload.count;
                break;
            case "MODULE_INITIALIZED":
                this.isPreloading = false;
                this.loaded = true;
                break;
            case "ERROR":
                Log.error(`${this.name} encountered an error:`, payload.error);
                this.isPreloading = false;
                this.loaded = false;
                break;
        }
        this.updateDom();
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
        Log.error(`Error in horoscope result:`, payload.message);
        if (!this.horoscopes[payload.sign]) {
            this.horoscopes[payload.sign] = {};
        }
        this.horoscopes[payload.sign][payload.period] = {
            horoscope_data: `Unable to fetch ${payload.period} horoscope for ${payload.sign}. Error: ${payload.error || "Unknown error"}`
        };
    }
    this.updateDom();  // Add this line to update the display after each result
},

    areAllHoroscopesLoaded: function() {
        return this.config.zodiacSign.every(sign => 
            this.config.period.every(period => 
                this.loadedHoroscopes[sign] && this.loadedHoroscopes[sign][period]
            )
        );
    },

    handleCacheInitialized: function() {
        this.isPreloading = false;
        this.loaded = true;
        this.scheduleRotation();
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
        if (payload.success) {
            this.updateDom(0);
            this.loadAllHoroscopes();
        } else {
            Log.error(`[${this.name}] Cache reset failed:`, payload.error);
        }
    },

    loadAllHoroscopes: function() {
        this.config.zodiacSign.forEach(sign => {
            this.config.period.forEach(period => {
                this.getHoroscope(sign, period);
            });
        });
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
            this.simulateMidnight
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
    }
});

class ScrollManager {
    constructor(module) {
        this.module = module;
        this.isScrolling = false;
        this.scrollTimer = null;
        this.slideTimer = null;
        this.fadeTimer = null;
    }

  startScrolling: function() {
    const horoscopeContainer = document.querySelector(".horoscope-container");
    const horoscopeText = document.querySelector(".horoscope-text");

    const visibleHeight = horoscopeContainer.clientHeight;
    const textHeight = horoscopeText.scrollHeight;
    const scrollDuration = this.calculateScrollDuration(textHeight, visibleHeight);

    const signWaitTime = this.config.signWaitTime;
    const pauseDuration = this.config.pauseDuration;
    const stopPosition = this.config.stopPosition * visibleHeight;

    let totalElapsedTime = 0;

    if (this.config.debugMode) {
      this.setupDebugCounters(); // Initialize debug counters if debug mode is active
    }

    function completeScrollCycle() {
      const scrollStep = textHeight - stopPosition;
      const scrollSpeed = scrollStep / scrollDuration;
      let startTime = null;

      function scroll(timestamp) {
        if (!startTime) startTime = timestamp;
        const scrollElapsed = timestamp - startTime;
        const newScrollPos = Math.min(scrollElapsed * scrollSpeed, scrollStep);
        horoscopeText.style.transform = `translateY(-${newScrollPos}px)`;

        totalElapsedTime += scrollElapsed;

        if (this.config.debugMode) {
          this.updateSignWaitTimeCounter(totalElapsedTime); // Update signWaitTime counter in debug mode
        }

        if (scrollElapsed < scrollDuration) {
          requestAnimationFrame(scroll);
        } else {
          // Ensure full pause at the bottom
          setTimeout(() => {
            horoscopeText.style.opacity = 0;

            setTimeout(() => {
              horoscopeText.style.transform = "translateY(0)";
              horoscopeText.style.opacity = 1;

              setTimeout(() => {
                if (totalElapsedTime >= signWaitTime) {
                  this.slideToNext(); // Trigger the slide to next after the final pause
                } else {
                  completeScrollCycle(); // Loop again if time remains
                }
              }, pauseDuration); // Ensure full pause even if it exceeds signWaitTime

            }, 1000);
          }, pauseDuration);
        }
      }

      requestAnimationFrame(scroll);
    }

    completeScrollCycle();
  },

calculateScrollDuration: function(textHeight, visibleHeight) {
    const baseDuration = 5000; // Base scroll time in ms
    const ratio = textHeight / visibleHeight;
    return baseDuration * ratio; // Duration increases with longer text
  },

    scrollContent(textContent, wrapperHeight, contentHeight, startTime) {
        this.isScrolling = true;

        const scrollDistance = Math.min(contentHeight - wrapperHeight, wrapperHeight * 0.75);
        const scrollDuration = (scrollDistance / this.module.config.scrollSpeed) * 1000;

        this.updateTimerDisplay("Scroll", scrollDuration, Date.now());

        textContent.style.transition = `transform ${scrollDuration}ms linear`;
        textContent.style.transform = `translateY(-${scrollDistance}px)`;

        this.scrollTimer = setTimeout(() => {
            this.pauseAfterScroll(textContent, wrapperHeight, contentHeight, startTime, scrollDistance);
        }, scrollDuration);
    }

    pauseAfterScroll(textContent, wrapperHeight, contentHeight, startTime, scrollDistance) {
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, this.module.config.signWaitTime - elapsedTime);

        this.updateTimerDisplay("Final Pause", this.module.config.pauseDuration, Date.now());

        if (remainingTime > this.module.config.pauseDuration) {
            this.fadeTimer = setTimeout(() => {
                this.fadeOutIn(textContent, () => {
                    this.resetScroll(textContent);
                    this.scrollContent(textContent, wrapperHeight, contentHeight, startTime);
                });
            }, this.module.config.pauseDuration);
        } else {
            this.slideTimer = setTimeout(() => {
                this.isScrolling = false;
                this.module.slideToNext();
            }, this.module.config.pauseDuration);
        }
    }

    fadeOutIn(element, callback) {
        element.style.transition = 'opacity 0.5s ease-in-out';
        element.style.opacity = 0;

        setTimeout(() => {
            callback();
            element.style.opacity = 1;
        }, 500);
    }

    resetScroll(textContent) {
        textContent.style.transition = "none";
        textContent.style.transform = "translateY(0)";
        // Force a reflow
        textContent.offsetHeight;
    }

    waitAndSlide(startTime) {
        this.updateTimerDisplay("Wait", this.module.config.signWaitTime, startTime);

        this.slideTimer = setTimeout(() => {
            this.isScrolling = false;
            this.module.slideToNext();
        }, this.module.config.signWaitTime);
    }

    updateTimerDisplay(phase, duration, start) {
        if (this.module.config.debug) {
            let timerElement = document.getElementById("scroll-timer");
            if (!timerElement) {
                timerElement = document.createElement("div");
                timerElement.id = "scroll-timer";
                timerElement.style.textAlign = "center";
                timerElement.style.margin = "10px 0";
                document.querySelector(".MMM-Starlight .starlight-text-wrapper").before(timerElement);
            }
            
            const updateTimer = () => {
                let elapsed = Math.floor((Date.now() - start) / 1000);
                timerElement.innerHTML = `${phase} Timer: ${elapsed}s / ${Math.floor(duration / 1000)}s`;
                if (elapsed < Math.floor(duration / 1000)) {
                    requestAnimationFrame(updateTimer);
                }
            };
            updateTimer();
        }
    }

startRealTimeTimer(signWaitTime, pauseDuration) {
    pauseDuration = pauseDuration || 5000;
    let counter = 0;

    const pauseInterval = setInterval(() => {
        if (counter >= pauseDuration / 1000) {
            clearInterval(pauseInterval);
            this.startScrollTimer(signWaitTime);
        } else {
            if (this.module.loaded) {
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
}

startScrollTimer(signWaitTime) {
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
}
}
