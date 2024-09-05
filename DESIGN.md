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

### 5.9 Performance Optimizations

1. **Lazy Loading**
   - Horoscopes are fetched on-demand when invalid or missing
   - Prevents unnecessary API calls for unused configurations

2. **Batch Updates**
   - `updateCache()` method refreshes all configured horoscopes in one go
   - Reduces the number of write operations to the cache file

3. **Memory Management**
   - Cache object kept in memory for quick access
   - Periodically written to file to balance memory usage and persistence

### 5.10 Error Handling and Resilience

1. **API Failure Handling**
   - Implemented in `handleHoroscopeError()` method
   - Retry logic with exponential backoff:
     ```javascript
     if (this.retryCount[config.sign] <= this.maxRetries) {
       await new Promise(resolve => setTimeout(resolve, this.retryDelay));
       return await this.getHoroscope(config);
     }
```

2. **Cache Read/Write Error Handling**
   - File operation errors are caught and logged
   - Module falls back to in-memory cache on file errors
   - Ensures continued operation even if file system issues occur

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

Note: `updateInterval`, `retryDelay`, `maxRetries`, and `requestTimeout` are now handled internally.

## 8. Performance Considerations

### 8.1 Caching Impact

- Reduces network requests, minimizing API rate limit concerns
- Improves module responsiveness, especially on slower internet connections
- Provides seamless operation during temporary internet outages

### 8.2 Memory Usage

- The cache is kept in memory for quick access
- Large configurations (many signs/periods) may increase memory usage
- The cache file size should be monitored in long-running installations

### 8.3 DOM Updates

- The module uses efficient DOM manipulation techniques
- Updates are batched where possible to reduce layout thrashing

## 9. Future Enhancements

1. **Cache Compression**
   - Implement data compression for the cache file to reduce disk usage
   - Consider using a library like `zlib` for gzip compression

2. **Incremental Updates**
   - Implement a system to update only changed horoscopes instead of the entire cache

3. **Cache Versioning**
   - Add a version number to the cache structure
   - Implement migration logic for seamless updates

4. **Distributed Caching**
   - For multi-device setups, explore distributed caching solutions

5. **Cache Analytics**
   - Implement logging of cache hit/miss rates
   - Provide user-facing cache performance statistics

6. **Advanced Error Recovery**
   - Implement more sophisticated error recovery strategies
   - Consider adding a "degraded mode" for partial functionality during API outages

7. **Customizable Themes**
   - Allow users to customize the look and feel of the module
   - Implement theme switching capabilities

8. **Localization**
   - Add support for multiple languages
   - Allow customization of date formats based on locale

## 10. Testing Strategy

1. **Unit Tests**
   - Implement unit tests for core functions, especially caching and API integration
   - Use a testing framework like Jest or Mocha

2. **Integration Tests**
   - Test the interaction between the front-end and back-end components
   - Ensure proper communication via socket notifications

3. **End-to-End Tests**
   - Simulate real-world usage scenarios
   - Test the module's behavior over extended periods

4. **Performance Testing**
   - Monitor memory usage and response times under various configurations
   - Stress test with large amounts of data and frequent updates

## 11. Conclusion

The MMM-Starlight module provides a flexible and robust solution for displaying horoscopes on a MagicMirror² setup. Its modular design, configurable options, and advanced features like caching and debug mode offer an engaging and reliable user experience. The transition to a structured API for data fetching, combined with the local caching system, has significantly improved the module's performance and reliability.

As the module evolves, focus should be placed on maintaining its efficiency, expanding its feature set, and ensuring its adaptability to various user needs and network conditions. Regular reviews of the caching mechanism, error handling strategies, and overall performance will be crucial in keeping the module up-to-date and user-friendly.
