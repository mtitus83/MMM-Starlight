# MMM-Starlight Design Document

## 1. Introduction

MMM-Starlight is a MagicMirror² module designed to display horoscopes for specified zodiac signs across various time periods. This document outlines the module's architecture, features, and internal workings.

## 2. Module Overview

The MMM-Starlight module fetches horoscope data from a structured API and displays it on the MagicMirror interface. It supports multiple zodiac signs and time periods, with a rotating display that cycles through the configured options.

## 3. Architecture

The module consists of two main components:

1. **Front-end (MMM-Starlight.js)**: Handles the display logic and user interface.
2. **Back-end (node_helper.js)**: Manages data fetching and processing.

These components communicate using the MagicMirror² module system's built-in socket notifications.

## 4. Features

### 4.1 Multiple Zodiac Signs and Time Periods

- Supports all zodiac signs
- Time periods include daily, tomorrow, weekly, and monthly horoscopes
- Configurable through the `zodiacSign` and `period` options

### 4.2 Rotating Display

- Cycles through configured zodiac signs and time periods
- Customizable display duration for each horoscope (`signWaitTime`)
- Implements a sliding animation for transitioning between horoscopes

### 4.3 Responsive Design

- Adjustable width and font size
- Scrolling text for longer horoscopes
- Configurable maximum text height before scrolling

### 4.4 Visual Elements

- Optional zodiac sign images
- Adjustable image width

### 4.5 Automatic Updates

- Periodically fetches new horoscope data
- Update interval handled internally for consistency

### 4.6 Error Handling

- Implements retry logic for failed requests
- Displays error messages when unable to fetch horoscopes
- Retry parameters (delay, max retries, timeout) handled internally

### 4.7 Debug Mode

- Configurable debug mode for testing and development
- Simulated rollover functionality for different time periods
- Cache reset capability for refreshing all horoscope data
- Display of last update and next scheduled update times
- Repositioned debug elements for improved visibility and usability

### 4.8 Caching System

- Implements a file-based caching mechanism
- Provides offline functionality and reduces API calls
- Automatic cache updates and validity checks
- Manual cache reset capability in debug mode

## 5. Detailed Functionality

### 5.1 Initialization

1. The module registers itself with MagicMirror²
2. Default configuration is set
3. Initial variables are initialized
4. Update and rotation schedules are set

### 5.2 Data Fetching (node_helper.js)

1. Receives a request to fetch a horoscope
2. Constructs the appropriate URL based on the zodiac sign and time period
3. Sends an HTTP GET request to the horoscope API
4. Processes the JSON response
5. Returns the result to the front-end component

### 5.3 Display Logic (MMM-Starlight.js)

1. Creates a DOM structure for displaying horoscopes
2. Manages the rotation of zodiac signs and time periods
3. Implements scrolling for long horoscope texts
4. Updates the display when new data is received
5. Implements a sliding animation for transitioning between horoscopes
6. In debug mode:
   - Displays debug buttons at the top of the module
   - Shows last update and next scheduled update times between debug buttons and horoscope title
   - Removes duplicate update information from between image and horoscope text

### 5.4 Update Cycle

1. The module schedules regular updates based on an internally managed interval
2. At each update, it requests new horoscope data for all configured signs and periods
3. The display is updated with new data as it's received

### 5.5 Error Handling

1. If a request fails, the module attempts to retry the request
2. Retries are managed with an internally set delay between attempts and a maximum number of retries
3. If all retries fail, an error message is displayed in place of the horoscope

### 5.6 Debug Functionality

1. When debug mode is enabled, additional elements are displayed on the module interface:
   - Debug buttons are positioned at the top of the module
   - Last update and next scheduled update times are displayed between the debug buttons and the horoscope title
2. Debug buttons trigger the following actions:
   - Simulate Midnight Update: Replaces the current day's horoscope with tomorrow's, and fetches a new "tomorrow" horoscope
   - Reset Cache: Clears all stored horoscope data and initiates a fresh fetch for all configured signs and periods
3. The last update time shows when the horoscope data was last fetched from the API
4. The next scheduled update time indicates when the module will attempt to fetch new data for the current horoscope
5. These debug elements aid in development and testing by providing visibility into the module's data fetching and update processes

### 5.7 Rollover Simulation

1. When a rollover is simulated, the module updates the appropriate horoscope in the cache
2. For "tomorrow" rollover, it also fetches a new "tomorrow" horoscope to replace the one that became "today"
3. The display is immediately updated to reflect the simulated changes
4. This process allows for testing of the module's behavior during different time transitions without waiting for actual time to pass

### 5.8 Caching Mechanism

1. **Cache Structure**
   - Implemented as a nested JavaScript object
   - Stored in a JSON file: `modules/MMM-Starlight/cache/horoscope_cache.json`
   - Structure:
     ```javascript
     {
       [zodiacSign]: {
         [period]: {
           horoscope_data: string,
           timestamp: ISO8601 string,
           challenging_days?: string, // for monthly horoscopes
           standout_days?: string,    // for monthly horoscopes
         }
       }
     }
     ```

2. **Cache Initialization**
   - On module start, `loadCache()` is called in the `start()` method of `node_helper.js`
   - File read operation:
     ```javascript
     const data = await fs.readFile(this.cacheFile, 'utf8');
     this.cache = JSON.parse(data);
     ```
   - Error handling for file not found:
     ```javascript
     if (error.code === 'ENOENT') {
       console.log('Cache file does not exist, creating a new one.');
       this.cache = {};
       await this.saveCache(this.cache);
     }
     ```

3. **Cache Validity Check**
   - Implemented in `isCacheValid(cachedData, period)` method
   - Uses JavaScript's `Date` object for time comparisons
   - Validity logic:
     ```javascript
     switch(period) {
       case "daily":
         return now.toDateString() === cacheTime.toDateString();
       case "tomorrow":
         const yesterday = new Date(now);
         yesterday.setDate(yesterday.getDate() - 1);
         return cacheTime.toDateString() === now.toDateString() || 
                cacheTime.toDateString() === yesterday.toDateString();
       case "weekly":
         const weekDiff = (now - cacheTime) / (1000 * 60 * 60 * 24 * 7);
         return weekDiff < 1;
       case "monthly":
         return now.getMonth() === cacheTime.getMonth() && 
                now.getFullYear() === cacheTime.getFullYear();
     }
     ```

4. **Cache Update Process**
   - `getCachedHoroscope(config)` method orchestrates the caching process
   - If cache is invalid or missing:
     ```javascript
     const data = await this.getHoroscope(config);
     cache[config.sign][config.period] = {
       ...data,
       timestamp: new Date().toISOString()
     };
     await this.saveCache(cache);
     ```

5. **Midnight Update Simulation**
   - Implemented in `simulateMidnightUpdate()` method
   - Process:
     1. Move tomorrow's data to today
     2. Delete old tomorrow data
     3. Fetch new tomorrow data
     4. Update cache file

6. **Cache Reset**
   - Implemented in `resetCache()` method
   - Process:
     1. Delete cache file: `await fs.unlink(this.cacheFile);`
     2. Reinitialize empty cache: `this.cache = {};`
     3. Trigger full cache refresh: `await this.initializeCache(this.config);`

7. **Concurrency and Race Condition Handling**
   - File write operations are asynchronous and use `await` to prevent race conditions
   - Example from `saveCache()` method:
     ```javascript
     await fs.writeFile(this.cacheFile, JSON.stringify(cache, null, 2));
     ```

8. **Image Caching**
   - Separate caching mechanism for zodiac sign images
   - Images stored in `modules/MMM-Starlight/cache/images/`
   - `getCachedImage(sign)` method:
     1. Checks for existing image file
     2. If not found, downloads and saves the image
     3. Returns the file path for use in the frontend

### 5.9 Update Scheduling and API Request Optimization

1. **Local Time-Based Updates**
   - Updates are now scheduled based on the user's local time.
   - The module starts checking for updates at 6 AM local time each day.

2. **Hourly Check Window**
   - After 6 AM, the module checks for updates once per hour.
   - A random minute within each hour is selected for the check to distribute API requests.

3. **Update Status Tracking**
   - The module tracks the update status for daily, weekly, and monthly horoscopes separately.
   - Once an update is successful for a particular period, no further checks are made for that period until the next day.

4. **Efficient API Usage**
   - API requests are only made when necessary, based on the last update time and the current period.
   - This significantly reduces the number of API calls while ensuring data freshness.

5. **Implementation Details**
   - The `scheduleUpdates()` function in node_helper.js manages the update schedule.
   - The `performUpdates()` function handles the actual update process, respecting the update status for each period.

```javascript
scheduleUpdates() {
    const scheduleNextCheck = () => {
        const now = moment();
        const nextHour = moment(now).add(1, 'hour').startOf('hour');
        const randomMinute = Math.floor(Math.random() * 60);
        const nextCheck = moment(nextHour).add(randomMinute, 'minutes');
        
        const msUntilNextCheck = nextCheck.diff(now);
        
        setTimeout(() => {
            this.performUpdates();
            scheduleNextCheck(); // Schedule next check
        }, msUntilNextCheck);
    };

    // Initial schedule
    const now = moment();
    const today6AM = moment(now).startOf('day').add(6, 'hours');
    if (now.isBefore(today6AM)) {
        const msUntil6AM = today6AM.diff(now);
        setTimeout(() => {
            this.performUpdates();
            scheduleNextCheck();
        }, msUntil6AM);
    } else {
        scheduleNextCheck();
    }
}

async performUpdates() {
    const now = moment();
    const signs = ['taurus', 'virgo', 'libra'];

    if (now.hour() >= 6) { // Only perform updates after 6 AM local time
        for (const type of this.updateTypes) {
            if (!this.updateStatus[type] && this.shouldCheckUpdate(type)) {
                for (const sign of signs) {
                    if (await this.checkAndUpdateHoroscope(sign, type)) {
                        if (type === 'daily') {
                            this.updateStatus.daily = true;
                        } else {
                            this.updateStatus[type] = true;
                            break; // Exit the sign loop for weekly/monthly as they're the same for all signs
                        }
                    }
                }
            }
        }
    }
}
```

### 5.10 Enhanced Logging

1. **Structured Logging**
   - Implemented a more structured logging system using a custom Logger class.
   - Log levels include ERROR, WARN, INFO, DEBUG, and VERBOSE.

2. **Configurable Log Level**
   - The log level can be set in the module configuration, allowing for fine-tuned control over log output.

3. **Contextual Logging**
   - Logs now include more context, such as the specific function or process that generated the log.

4. **Performance Impact Considerations**
   - Lower log levels (e.g., INFO) are used for production to minimize performance impact.
   - Higher log levels (e.g., DEBUG, VERBOSE) are available for troubleshooting.

5. **Implementation Details**
   - The Logger class is defined at the beginning of both MMM-Starlight.js and node_helper.js.
   - Logger methods are used throughout the code instead of console.log for consistent logging.

```javascript
const Logger = {
    level: LogLevels.INFO,  // Default log level
    moduleName: "MMM-Starlight",

    setLevel: function(level) {
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
```

## 6. API Integration

The module uses a structured API for fetching horoscope data:

- Base URL: `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/`
- Endpoints:
  - Daily: `/daily?sign=<zodiacSign>&day=today`
  - Tomorrow: `/daily?sign=<zodiacSign>&day=tomorrow`
  - Weekly: `/weekly?sign=<zodiacSign>`
  - Monthly: `/monthly?sign=<zodiacSign>`

The API returns JSON data, which is processed and displayed by the module.

## 7. Configuration Options

The module provides several configuration options to customize its behavior:

- `zodiacSign`: Array of zodiac signs to display
- `period`: Array of time periods for horoscopes
- `width`: Width of the module
- `fontSize`: Font size for the horoscope text
- `showImage`: Toggle for displaying zodiac sign images
- `imageWidth`: Width of the zodiac sign images
- `maxTextHeight`: Maximum height of the text area before scrolling
- `scrollSpeed`: Speed of vertical scrolling
- `pauseDuration`: Pause duration before and after scrolling
- `signWaitTime`: Display duration for each horoscope before rotating
- `debug`: Enable debug mode for additional functionality
- `showButton`: Show debug buttons when in debug mode
- `logLevel`: Sets the logging level for the module. Options are "ERROR", "WARN", "INFO", "DEBUG", "VERBOSE". (default: "INFO")

Note: `updateInterval`, `retryDelay`, `maxRetries`, and `requestTimeout` are now handled internally.

## 8. Performance Considerations

### 8.1 API Request Optimization

- Reduced number of API calls due to intelligent update scheduling.
- Lower server load and bandwidth usage.
- Improved module responsiveness due to fewer network requests.

### 8.2 Caching Efficiency

- Enhanced caching mechanism reduces the need for frequent API calls.
- Improved offline functionality and faster data retrieval.

### 8.3 Memory Usage

- The cache is kept in memory for quick access
- Large configurations (many signs/periods) may increase memory usage
- The cache file size should be monitored in long-running installations

### 8.4 DOM Updates

- The module uses efficient DOM manipulation techniques
- Updates are batched where possible to reduce layout thrashing

## 11. Conclusion

The MMM-Starlight module provides a flexible and robust solution for displaying horoscopes on a MagicMirror² setup. Its modular design, configurable options, and advanced features like caching and debug mode offer an engaging and reliable user experience. The transition to a structured API for data fetching, combined with the local caching system, has significantly improved the module's performance and reliability.

Recent optimizations in update scheduling and API request management have further enhanced the module's efficiency. By aligning updates with local time and implementing intelligent check windows, the module now operates more efficiently while ensuring data freshness. The enhanced logging system provides better visibility into the module's operations, aiding in both development and troubleshooting.

These improvements not only reduce unnecessary API calls but also enhance the module's responsiveness and reliability. The new update mechanism, combined with the existing caching system, strikes a balance between providing up-to-date information and minimizing resource usage.

As the module evolves, focus should be placed on maintaining its efficiency, expanding its feature set, and ensuring its adaptability to various user needs and network conditions. Regular reviews of the caching mechanism, error handling strategies, and overall performance will be crucial in keeping the module up-to-date and user-friendly.

Future development efforts should prioritize the enhancements outlined in this document, with particular emphasis on further optimizing performance, expanding features, and improving user experience. Continuous refinement of the update scheduling, caching mechanisms, and logging systems will be key to keeping MMM-Starlight efficient, reliable, and user-friendly.
