# MMM-SunSigns Module Design Document

## Overview

MMM-SunSigns is a MagicMirror² module designed to display horoscopes for various zodiac signs and time periods. It features a caching mechanism, periodic updates, and a user-friendly display with rotating horoscopes and images.

## Module Structure

The module consists of two main files:
1. `MMM-SunSigns.js`: The main module file that handles the display and user interface.
2. `node_helper.js`: A Node.js helper that manages data fetching, caching, and updates.

## Key Components

### 1. Configuration

The module accepts various configuration options, including:
- Zodiac signs to display
- Horoscope periods (daily, tomorrow, weekly, monthly, yearly)
- Display settings (width, font size, image display)
- Debug and test modes

### 2. Caching Mechanism

The caching system is implemented in `node_helper.js` and includes:
- `buildCache()`: Initializes the cache with horoscopes for all signs and periods.
- `updateCache()`: Periodically updates the cache based on time changes.
- `saveCacheToFile()`: Persists the cache to disk.
- `loadCacheFromFile()`: Loads the cache from disk on startup.

### 3. Data Fetching

The `fetchHoroscope()` function in `node_helper.js` is responsible for retrieving horoscope data. It handles network requests and parsing of the response.

### 4. Display Management

In `MMM-SunSigns.js`:
- `getDom()`: Builds the module's DOM structure.
- `createSignElement()`: Creates individual horoscope display elements.
- `slideToNext()`: Manages the transition between different horoscopes.
- `startScrolling()`: Handles vertical scrolling for long horoscope texts.

### 5. Update Scheduling

- `scheduleUpdate()`: Sets up periodic cache updates.
- `scheduleRotation()`: Manages the rotation between different zodiac signs and periods.

### 6. Debug and Test Functionality

- `log()`: Conditional logging based on debug mode.
- `simulateDateChange()`: Allows for testing of date-based cache updates.

## Key Functions

### In `node_helper.js`:

1. `buildCache()`
   - Purpose: Initializes the cache with all horoscope data.
   - Note: This function is crucial for the module's startup process.

2. `updateCache(testDate)`
   - Purpose: Updates the cache based on date changes.
   - Key feature: Handles the transition of "tomorrow" becoming "daily".

3. `fetchHoroscope(sign, period)`
   - Purpose: Retrieves horoscope data from the external source.
   - Note: Implements error handling and retries.

### In `MMM-SunSigns.js`:

1. `getDom()`
   - Purpose: Constructs the module's visual representation.
   - Key feature: Dynamically creates elements based on configuration.

2. `slideToNext()`
   - Purpose: Manages the transition between different horoscopes.
   - Note: Implements smooth animations for user experience.

3. `startScrolling()`
   - Purpose: Handles vertical scrolling for long horoscope texts.
   - Key feature: Implements pause and resume functionality.

## Data Flow

1. On startup, `node_helper.js` builds or loads the cache.
2. `MMM-SunSigns.js` requests data from the helper.
3. The helper provides cached data or fetches new data if necessary.
4. `MMM-SunSigns.js` displays the data and manages rotations/scrolling.
5. Periodic updates are triggered to refresh the cache and display.

## Error Handling

- Network errors are handled with retries in `fetchHoroscope()`.
- If data is unavailable, the module falls back to cached data or displays error messages.

## Performance Considerations

- The caching mechanism reduces network requests and improves load times.
- Image caching reduces bandwidth usage.
- Scrolling and animations are optimized for smooth performance.

This design document provides an overview of the MMM-SunSigns module's structure and key components. It serves as a guide for understanding the module's functionality and can be used as a reference for future development or troubleshooting.
