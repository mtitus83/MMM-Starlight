# MMM-SunSigns

A MagicMirror² module that displays horoscopes for specified zodiac signs for various time periods.

## Disclaimer

**IMPORTANT**: This MagicMirror² module was created by an AI assistant and is not officially supported or maintained by a human developer. Use at your own risk. While efforts have been made to ensure its functionality, there may be unforeseen issues or limitations. If you encounter any problems, feel free to contribute to its improvement, but please note that there is no official support channel for this module.

## Installation

1. Navigate to your MagicMirror's `modules` folder:
```
cd ~/MagicMirror/modules
```
2. Clone this repository:
```
git clone https://github.com/mtitus83/MMM-SunSigns.git
```
3. Install the dependencies:
```
cd MMM-SunSigns
npm install
```

## Configuration

Add the following configuration block to the modules array in the `config/config.js` file:

```javascript
modules: [
    {
        module: "MMM-SunSigns",
        position: "top_right",
        config: {
            // See below for configurable options
        }
    }
]
```

### Options

| Option           | Description                                                                                     |
|------------------|-------------------------------------------------------------------------------------------------|
| `zodiacSign`     | An array of zodiac signs to display. (default: `["taurus"]`)                                    |
| `period`         | An array of periods for the horoscope. Can include "daily", "weekly", "monthly", and "yearly". (default: `["daily"]`) |
| `width`          | Width of the module. (default: `"400px"`)                                                       |
| `fontSize`       | Font size of the horoscope text. (default: `"1em"`)                                             |
| `showImage`      | Whether to display the zodiac sign image. (default: `true`)                                     |
| `imageWidth`     | Width of the zodiac sign image. (default: `"100px"`)                                            |
| `maxTextHeight`  | Maximum height of the text area before scrolling. (default: `"400px"`)                          |
| `scrollSpeed`    | Speed of the vertical scrolling in pixels per second. (default: `7`)                            |
| `pauseDuration`  | Duration to pause before starting to scroll and after scrolling completes, in milliseconds. (default: `10000` // 10 seconds) |
| `signWaitTime`   | Time to display each sign before rotating to the next, in milliseconds. (default: `50000` // 50 seconds) |
| `startOfWeek`    | Start of the week. Can be one of "Sunday", or "Monday". (default: `"Sunday"`)                   |

### Example configuration

```javascript
{
    module: "MMM-SunSigns",
    position: "top_right",
    config: {
        zodiacSign: ["aries", "taurus", "gemini"],
        period: ["daily", "weekly", "monthly"],
        width: "500px",
        maxTextHeight: "300px",
        scrollSpeed: 8,
        pauseDuration: 5000, // 5 seconds pause before and after scrolling
        signWaitTime: 60000, // 1 minute
        debug: true,
        simulateDate: "05152024 10:30:00" // Simulate May 15, 2024 at 10:30 AM
    }
}
```

## Caching Mechanism

This module implements a caching mechanism that stores horoscopes locally. This helps reduce the number of requests and improves the module's performance. The module handles horoscope updates when necessary.

## Debugging

The module includes debugging options to help troubleshoot issues or verify the module's behavior.

| Option    | Description                                                            | Default |
|-----------|------------------------------------------------------------------------|---------|
| `debug`   | Enable debug logging and display additional information on the screen. | `false` |

When `debug` is set to `true`, the module will display additional information on the screen, including:

- Last update attempt
- Number of update failures
- Current state of the module
- The simulated date (if set)

## Date Simulation

The module supports date simulation for testing purposes. This feature is particularly useful for testing the module's behavior on specific dates or times without having to wait for those dates to occur naturally.

| Option         | Description                                                     | Default |
|----------------|-----------------------------------------------------------------|---------|
| `simulateDate` | Simulate a specific date for testing. Format: "MMDDYYYY HH:MM:SS" | `null`  |

You can set a simulated date in two ways:

1. In the module configuration using the `simulateDate` option.
2. By sending a notification to the module during runtime.

To change the simulated date during runtime, you can use the following notification:

```javascript
this.sendNotification("SIMULATE_DATE", { date: "05152024 10:30:00" });
```

## Updating

To update the module to the latest version, navigate to your MMM-SunSigns folder and pull the latest changes:

```
cd ~/MagicMirror/modules/MMM-SunSigns
git pull
npm install
```

## Contributing

If you find any issues or have suggestions for improvements, please open an issue or submit a pull request on the GitHub repository.
