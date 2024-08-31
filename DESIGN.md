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

The caching system, implemented in `node_helper.js`, has been updated to include:

- `checkForUpdates()`: Initiates the update process for all configured zodiac signs and periods.
- `checkAndUpdateHoroscope()`: Checks if a specific horoscope needs updating and fetches new data if necessary.
- `updateCache()`: Updates the cache with new horoscope data when changes are detected.
- `updateLastCheckTime()`: Updates the last check time for a horoscope when no changes are detected.
- `saveCacheToFile()`: Persists the cache to disk as a JSON file.
- `loadCacheFromFile()`: Loads the cache from disk on startup, creating a new one if it doesn't exist.

The cache structure stores horoscopes and image paths for all zodiac signs and periods, including:
- Content of the horoscope
- Timestamp of when the horoscope was last updated
- Last check time, even if the content hasn't changed

### 3. Data Fetching

The `checkAndUpdateHoroscope()` function in `node_helper.js` is responsible for retrieving horoscope data. It:
- Sends a GET request to the horoscope website
- Compares the fetched content with the cached content
- Updates the cache only if the content has changed
- Implements error handling and logging

### 4. Display Management

In `MMM-SunSigns.js`:
- `getDom()`: Builds the module's DOM structure based on the current configuration and cached data.
- `createSignElement()`: Creates individual horoscope display elements, including text and images.
- `slideToNext()`: Manages the transition between different horoscopes and zodiac signs.
- `startScrolling()`: Handles vertical scrolling for long horoscope texts, implementing smooth scroll and pause functionality.

### 5. Update Scheduling

- `scheduleUpdate()`: Sets up periodic checks for updates every 45 minutes.
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
6. Every 45 minutes, the module triggers a check for updates.
7. The `checkForUpdates()` function iterates through all configured signs and periods.
8. For each horoscope, `checkAndUpdateHoroscope()` fetches new data and compares it with the cached version.
9. If changes are detected, the cache is updated, and the display is refreshed.

## Error Handling and Resilience

- Network errors during fetching are logged, and the module falls back to cached data.
- If cached data is unavailable or expired, the module displays a "Updating horoscope..." message.
- The module continues to function with partial data if some horoscopes or images fail to load.

## Performance Considerations

- Regular checks every 45 minutes balance freshness of data with efficiency.
- The caching mechanism reduces unnecessary network requests by only updating when content has changed.
- Content comparison before updating prevents unnecessary DOM updates and improves performance.
- Image caching reduces bandwidth usage and improves load times for returning users.
- Scrolling and animations are optimized for smooth performance, with configurable speeds and pauses.

## Debugging

The debugging capabilities provide insights into the module's behavior, aiding in troubleshooting and development.  The module includes comprehensive debugging capabilities:

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

