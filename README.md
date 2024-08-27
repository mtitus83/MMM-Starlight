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
| `debug`          | Enable debug logging. (default: `false`)                                                        |

### Note on Removed Options

In this version, the following options have been removed or are no longer user-configurable due to new caching functionality:

The options listed below have been deprecated in this version as updates are now handled by the module in a more efficient manner. Please remove these variables from your configuration file:

- `updateInterval`
- `retryDelay`
- `maxRetries`
- `requestTimeout`

### Caching Mechanism

This version introduces a caching mechanism that stores horoscopes locally. This helps reduce the number of requests and improves the module's performance. The module handles horoscope updates when required.

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
        debug: true
    }
}
```

### Ordering of Horoscopes

The order in which horoscopes are displayed is determined by the order of the `zodiacSign` and `period` arrays in your configuration. The module will cycle through all periods for each sign before moving to the next sign. 

For example, if your configuration is:

```javascript
{
    zodiacSign: ["aries", "taurus"],
    period: ["daily", "weekly", "monthly"]
}
```

The horoscopes will be displayed in this order:

1. Aries daily
2. Aries weekly
3. Aries monthly
4. Taurus daily
5. Taurus weekly
6. Taurus monthly

Then it will cycle back to Aries daily and repeat the sequence.

## Updating

To update the module to the latest version, navigate to your MMM-SunSigns folder and pull the latest changes:

```
cd ~/MagicMirror/modules/MMM-SunSigns
git pull
npm install
```

## Contributing

If you find any issues or have suggestions for improvements, please open an issue or submit a pull request on the GitHub repository.
