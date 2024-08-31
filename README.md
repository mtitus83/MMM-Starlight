# MMM-SunSigns Module Design Document

## Overview

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
- Handles network requests to the horoscope data source with an increased timeout of 30 seconds for improved reliability.
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
- The module implements a 30-second timeout for network requests to handle slow connections or server response times.
- If cached data is unavailable or expired, the module displays a "Updating horoscope..." message.
- The module continues to function with partial data if some horoscopes or images fail to load.

## Performance Considerations

- Parallel fetching during cache building improves initial load time.
- The caching mechanism significantly reduces network requests after initial setup.
- Image caching reduces bandwidth usage and improves load times for returning users.
- Scrolling and animations are optimized for smooth performance, with configurable speeds and pauses.


This design document provides a comprehensive overview of the MMM-SunSigns module's structure, functionality, and design considerations. It serves as a guide for understanding the module's operation and can be used as a reference for future development, troubleshooting, or module customization.
