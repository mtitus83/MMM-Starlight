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
| `period`         | An array of periods for the horoscope. Can include "daily", "tomorrow", "weekly", "monthly", and "yearly". (default: `["daily", "tomorrow"]`) |
| `width`          | Width of the module. (default: `"400px"`)                                                       |
| `fontSize`       | Font size of the horoscope text. (default: `"1em"`)                                             |
| `showImage`      | Whether to display the zodiac sign image. (default: `true`)                                     |
| `imageWidth`     | Width of the zodiac sign image. (default: `"100px"`)                                            |
| `maxTextHeight`  | Maximum height of the text area before scrolling. (default: `"400px"`)                          |
| `scrollSpeed`    | Speed of the vertical scrolling in pixels per second. (default: `7`)                            |
| `pauseDuration`  | Duration to pause before starting to scroll and after scrolling completes, in milliseconds. (default: `10000` // 10 seconds) |
| `signWaitTime`   | Time to display each sign before rotating to the next, in milliseconds. (default: `120000` // 2 minutes) |

**Note**: The following options have been deprecated and are no longer configurable to provide a more consistent user experience: `updateInterval`, `retryDelay`, `maxRetries`, and `requestTimeout`.

This version of MMM-SunSigns includes enhanced debug logging capabilities and a new caching mechanism to improve performance and reduce network usage. Use the `debug` option to enable detailed logging, and refer to the module's documentation for more information on the caching system.

### Ordering of Horoscopes

The order in which horoscopes are displayed is determined by the order of the `zodiacSign` and `period` arrays in your configuration. The module will cycle through all periods for each sign before moving to the next sign. 

For example, if your configuration is:

```javascript
{
    zodiacSign: ["aries", "taurus"],
    period: ["daily", "tomorrow", "weekly"]
}
```

The horoscopes will be displayed in this order:

1. Aries daily
2. Aries tomorrow
3. Aries weekly
4. Taurus daily
5. Taurus tomorrow
6. Taurus weekly

Then it will cycle back to Aries daily and repeat the sequence.

### Example configuration

```javascript
{
    module: "MMM-SunSigns",
    position: "top_right",
    config: {
        zodiacSign: ["aries", "taurus", "gemini"],
        period: ["daily", "tomorrow", "weekly", "monthly"],
        width: "500px",
        maxTextHeight: "300px",
        scrollSpeed: 8,
        pauseDuration: 5000, // 5 seconds pause before and after scrolling
        signWaitTime: 180000 // 3 minutes
    }
}
```

## Updating

To update the module to the latest version, navigate to your MMM-SunSigns folder and pull the latest changes:

```
cd ~/MagicMirror/modules/MMM-SunSigns
git pull
npm install
```

## Contributing

If you find any issues or have suggestions for improvements, please open an issue or submit a pull request on the GitHub repository. See DESIGN.md for more information about the modules design.


