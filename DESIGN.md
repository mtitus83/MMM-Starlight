# MMM-Starlight Design Document

## 1. Introduction

MMM-Starlight is a MagicMirror² module designed to display horoscopes for specified zodiac signs across various time periods. This document outlines the module's architecture, features, and internal workings.

## 2. Module Overview

The MMM-Starlight module fetches horoscope data and displays it on the MagicMirror interface. It supports multiple zodiac signs and time periods, with a rotating display that cycles through the configured options.

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
- Yearly horoscopes have been deprecated

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

## 5. Detailed Functionality

### 5.1 Initialization

1. The module registers itself with MagicMirror²
2. Default configuration is set
3. Initial variables are initialized
4. Update and rotation schedules are set

### 5.2 Data Fetching (node_helper.js)

1. Receives a request to fetch a horoscope
2. Constructs the appropriate URL based on the zodiac sign and time period
3. Sends an HTTP GET request to the horoscope source
4. Parses the HTML response to extract the horoscope text
5. Returns the result to the front-end component
6. Handles the deprecated yearly period by returning a specific message

### 5.3 Display Logic (MMM-Starlight.js)

1. Creates a DOM structure for displaying horoscopes
2. Manages the rotation of zodiac signs and time periods
3. Implements scrolling for long horoscope texts
4. Updates the display when new data is received
5. Implements a sliding animation for transitioning between horoscopes

### 5.4 Update Cycle

1. The module schedules regular updates based on an internally managed interval
2. At each update, it requests new horoscope data for all configured signs and periods
3. The display is updated with new data as it's received

### 5.5 Error Handling

1. If a request fails, the module attempts to retry the request
2. Retries are managed with an internally set delay between attempts and a maximum number of retries
3. If all retries fail, an error message is displayed in place of the horoscope

## 6. Configuration Options

The module provides several configuration options to customize its behavior:

- `zodiacSign`: Array of zodiac signs to display
- `period`: Array of time periods for horoscopes (excluding yearly)
- `width`: Width of the module
- `fontSize`: Font size for the horoscope text
- `showImage`: Toggle for displaying zodiac sign images
- `imageWidth`: Width of the zodiac sign images
- `maxTextHeight`: Maximum height of the text area before scrolling
- `scrollSpeed`: Speed of vertical scrolling
- `pauseDuration`: Pause duration before and after scrolling
- `signWaitTime`: Display duration for each horoscope before rotating

Note: `updateInterval`, `retryDelay`, `maxRetries`, and `requestTimeout` are now handled internally.

## 7. Deprecated Features

- Yearly horoscopes have been deprecated. If a user configures the module to display yearly horoscopes, a message will be shown instead of fetching data.

## 8. Conclusion

The MMM-Starlight module provides a flexible and robust solution for displaying horoscopes on a MagicMirror² setup. Its modular design, configurable options, and recent enhancements like the sliding animation offer an engaging user experience. The deprecation of yearly horoscopes and the internalization of certain configuration options demonstrate the module's evolution towards more consistent and maintainable functionality.
