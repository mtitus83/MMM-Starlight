# MMM-SunSigns Design Document

## 1. Introduction

MMM-SunSigns is a custom module for the Magic Mirror platform that displays horoscopes for various zodiac signs and time periods. It fetches data from an external source, caches it, and presents it in an interactive, scrolling display.

## 2. Key Components

### 2.1 Main Module (MMM-SunSigns.js)
- Handles the user interface and display logic
- Manages the rotation of horoscopes and time periods
- Coordinates with the Node Helper for data fetching and caching

### 2.2 Node Helper (node_helper.js)
- Performs the actual fetching of horoscope data from external sources
- Manages the caching system for horoscopes and images
- Handles periodic updates and cache management

### 2.3 Stylesheet (MMM-SunSigns.css)
- Defines the visual styling for the module

## 3. Key Functionality

### 3.1 Horoscope Display
- Shows horoscopes for configured zodiac signs and time periods
- Supports multiple zodiac signs and periods (daily, tomorrow, weekly, monthly, yearly)
- Implements a sliding transition between different horoscopes

### 3.2 Data Fetching and Caching
- Fetches horoscope data 
- Caches fetched data to reduce network requests
- Implements an intelligent update system based on time periods

### 3.3 Image Handling
- Displays zodiac sign images alongside horoscopes
- Caches images locally to improve performance

### 3.4 Configurable Options
- Allows customization of display parameters (font size, width, image size, etc.)
- Supports configuration of update intervals and transition timings

### 3.5 Debug Mode
- Provides additional information for troubleshooting when enabled

## 4. Data Flow

1. The main module initiates a request for horoscope data.
2. The node helper checks the cache for existing data.
3. If cached data is available and still valid, it's returned immediately.
4. If no valid cached data exists, the node helper fetches new data from the external source.
5. Fetched data is cached for future use.
6. The main module receives the data and updates the display.

## 5. Update Mechanism

- Daily horoscopes are updated at midnight.
- Weekly, monthly, and yearly horoscopes are updated on the first day of their respective periods.
- The module implements a retry mechanism for failed updates.

## 6. Configuration Options

- `zodiacSign`: Array of zodiac signs to display
- `period`: Array of time periods to show (daily, tomorrow, weekly, monthly, yearly)
- `showImage`: Boolean to toggle zodiac sign image display
- `imageWidth`: Width of the zodiac sign image
- `maxTextHeight`: Maximum height of the horoscope text area
- `width`: Overall width of the module
- `fontSize`: Font size for the horoscope text
- `pauseDuration`: Duration to pause between transitions
- `scrollSpeed`: Speed of text scrolling for long horoscopes
- `signWaitTime`: Time to wait before transitioning to the next sign/period
- `startOfWeek`: Defines the start day of the week for weekly updates
- `simulateDate`: Allows simulation of a specific date (for testing)
- `debug`: Enables additional debug information display
- `clearCacheOnStart`: Option to clear cache when the module starts
- `bypassCache`: Option to always fetch fresh data, bypassing the cache

## 7. Simulated Date Feature

- Allows testing of the module's behavior for different dates
- Useful for verifying period transitions and update mechanisms

## 8. Error Handling

- Implements error logging for failed data fetches
- Displays error messages to the user when in debug mode
- Automatically retries failed updates after a delay

## 9. Performance Considerations

- Uses caching to reduce network requests and improve load times
- Implements efficient DOM updates to minimize performance impact
- Lazy-loads images to improve initial load time

## 10. Future Enhancements

- Support for additional horoscope sources
- Integration with other Magic Mirror modules (e.g., calendar for more accurate period transitions)
- Customizable themes or color schemes
- Support for localization/multiple languages

This design document provides an overview of the MMM-SunSigns module's structure and functionality. It can be used as a reference for understanding the module's capabilities and for planning future enhancements or troubleshooting.
