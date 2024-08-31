# MMM-SunSigns Module Design Document

## Overview

This design document provides a comprehensive overview of the MMM-SunSigns module's structure, functionality, and design considerations. It serves as a guide for understanding the module's operation and can be used as a reference for future development, troubleshooting, or module customization.

MMM-SunSigns is a MagicMirror² module designed to display horoscopes for various zodiac signs and time periods. It features a robust caching mechanism, periodic updates, and a user-friendly display with rotating horoscopes and images. The module aims to provide a seamless and efficient way to view daily, weekly, monthly, and yearly horoscopes for multiple zodiac signs.

## Module Structure

The module consists of two main files:
1. `MMM-SunSigns.js`: The main module file that handles the display and user interface.
2. `node_helper.js`: A Node.js helper that manages data fetching, caching, and updates.

## Key Components

### 1. Configuration

The module accepts various configuration options, including:
- `zodiacSign`: An array of zodiac signs to display (e.g., ["aries", "taurus"])
- `period`: An array of horoscope periods (e.g., ["daily", "tomorrow", "weekly", "monthly", "yearly"])
- Display settings:
  - `width`: Width of the module
  - `fontSize`: Font size for the horoscope text
  - `showImage`: Boolean to toggle zodiac sign image display
  - `imageWidth`: Width of the zodiac sign image
- `maxTextHeight`: Maximum height of the text area before scrolling
- `scrollSpeed`: Speed of vertical scrolling in pixels per second
- `pauseDuration`: Duration to pause before and after scrolling
- `signWaitTime`: Time to display each sign before rotating to the next
- `debug`: Boolean to enable detailed logging for debugging
- `test`: Option to simulate date changes for testing cache updates
- `startOfWeek`: Define the start of the week for weekly horoscope updates

### 2. Caching Mechanism

The caching system, implemented in `node_helper.js`, includes:

- `buildCache()`: Initializes the cache with horoscopes for all signs and periods. It fetches data in parallel for improved performance.
- `updateCache()`: Periodically updates the cache based on time changes. It handles daily, weekly, monthly, and yearly updates.
- `saveCacheToFile()`: Persists the cache to disk as a JSON file.
- `loadCacheFromFile()`: Loads the cache from disk on startup, creating a new one if it doesn't exist.
- `getCacheValidityPeriod()`: Determines how long cached data remains valid for each period type.

The cache structure is designed to store horoscopes and image paths for all zodiac signs and periods, even those not currently configured for display. This allows for quick configuration changes without requiring immediate data fetching.

### 3. Data Fetching

The `fetchHoroscope()` function in `node_helper.js` is responsible for retrieving horoscope data. It:
- Handles network requests to the horoscope data source
- Parses the HTML response to extract the horoscope text
- Implements error handling and logging
- Updates the cache with new data

### 4. Display Management

In `MMM-SunSigns.js`:
- `getDom()`: Builds the module's DOM structure based on the current configuration and cached data.
- `createSignElement()`: Creates individual horoscope display elements, including text and images.
- `slideToNext()`: Manages the transition between different horoscopes and zodiac signs.
- `startScrolling()`: Handles vertical scrolling for long horoscope texts, implementing smooth scroll and pause functionality.

### 5. Update Scheduling

- `scheduleUpdate()`: Sets up periodic cache updates to ensure fresh data.
- `scheduleRotation()`: Manages the rotation between different zodiac signs and periods for display.

### 6. Debug and Test Functionality

- `log()`: Conditional logging based on debug mode for easier troubleshooting.
- `simulateDateChange()`: Allows for testing of date-based cache updates without waiting for actual time to pass.

## Data Flow

1. On startup:
   - `node_helper.js` checks for an existing cache file.
   - If found, it loads the cache; if not, it builds a new cache.
2. `MMM-SunSigns.js` initializes and sends an "INIT_MODULE" notification to the helper.
3. The helper responds with cached data or newly fetched data if the cache was just built.
4. `MMM-SunSigns.js` receives the data and updates its internal state.
5. The module displays the data, managing rotations and scrolling as configured.
6. Periodic updates are triggered to refresh the cache and display.

## Error Handling and Resilience

- Network errors during fetching are logged, and the module falls back to cached data.
- If cached data is unavailable or expired, the module displays a "Updating horoscope..." message.
- The module continues to function with partial data if some horoscopes or images fail to load.

## Performance Considerations

- Parallel fetching during cache building improves initial load time.
- The caching mechanism significantly reduces network requests after initial setup.
- Image caching reduces bandwidth usage and improves load times for returning users.
- Scrolling and animations are optimized for smooth performance, with configurable speeds and pauses.


## Debugging

The MMM-SunSigns module includes comprehensive debugging capabilities to assist with troubleshooting and development. These features are designed to provide detailed insights into the module's operations without affecting normal functionality when not in use.

### Implementation

1. Debug Mode Toggle:
   - Controlled by the `debug` option in the module configuration.
   - When enabled, it activates verbose logging throughout the module.

2. Logging Mechanism:
   - Utilizes the `log()` function in both `MMM-SunSigns.js` and `node_helper.js`.
   - Logs are output to the MagicMirror console and can be viewed in terminal mode or PM2 logs.

3. Conditional Logging:
   - Debug messages are only output when `debug: true` is set in the configuration.
   - This ensures no performance impact during normal operation.

4. Test Mode:
   - Activated by setting the `test` option in the configuration.
   - Allows simulation of date changes for testing cache update behaviors.

### Logged Information

When debug mode is enabled, the following information is logged:

1. Module Initialization:
   - Configuration loading
   - Cache initialization or loading

2. Data Fetching:
   - URL construction for each horoscope request
   - Success or failure of each fetch attempt
   - Parsed horoscope content (truncated for brevity)

3. Caching Operations:
   - Cache build process
   - Cache update triggers and results
   - Cache read/write operations

4. Display Updates:
   - Horoscope rotation events
   - DOM updates for new horoscope content

5. Error Information:
   - Detailed error messages for failed operations
   - Stack traces for unexpected exceptions

6. Performance Metrics:
   - Time taken for cache building and updates
   - Network request durations

### Usage for Troubleshooting

1. Enable debug mode by setting `debug: true` in the module configuration.
2. Use the logs to trace the flow of operations and identify where issues occur.
3. For update-related issues, use the `test` option to simulate different time periods.
4. Check for any error messages or unexpected behavior in the logs.

### Usage for Development

1. Use debug logs to verify the correctness of new features or modifications.
2. Monitor performance metrics to ensure optimizations are effective.
3. Utilize the test mode to quickly verify time-based functionality without waiting for actual time to pass.

The debugging capabilities of MMM-SunSigns provide a powerful tool for both users and developers to understand the module's behavior, identify issues, and verify improvements. By offering detailed insights into the module's operations, these features contribute to the overall reliability and maintainability of the module.
