# MMM-SunSigns

A MagicMirror² module that displays daily, weekly, monthly, or yearly horoscopes for specified zodiac signs.

## Installation

1. Navigate to your MagicMirror's `modules` folder:
```
cd ~/MagicMirror/modules
```
2. Clone this repository:
```
git clone https://github.com/yourusername/MMM-SunSigns.git
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
| `period`         | The period for the horoscope. Can be "daily", "weekly", "monthly", or "yearly". (default: "daily") |
| `updateInterval` | How often to fetch new horoscopes in milliseconds. (default: `60 * 60 * 1000` // 1 hour)        |
| `retryDelay`     | Delay before retrying a failed request in milliseconds. (default: `300000` // 5 minutes)        |
| `maxRetries`     | Maximum number of retries for a failed request. (default: `5`)                                  |
| `width`          | Width of the module. (default: `"400px"`)                                                       |
| `fontSize`       | Font size of the horoscope text. (default: `"1em"`)                                             |
| `imageWidth`     | Width of the zodiac sign image. (default: `"100px"`)                                            |
| `maxTextHeight`  | Maximum height of the text area before scrolling. (default: `"200px"`)                          |
| `scrollSpeed`    | Speed of the vertical scrolling in pixels per second. (default: `6`)                            |
| `pauseDuration`  | Duration to pause before starting to scroll and after scrolling completes, in milliseconds. (default: `2000` // 2 seconds) |
| `signWaitTime`   | Time to display each sign before rotating to the next, in milliseconds. (default: `60000` // 1 minute) |
| `requestTimeout` | Timeout for the HTTP request in milliseconds. (default: `30000` // 30 seconds)                  |

### Example configuration

```javascript
{
    module: "MMM-SunSigns",
    position: "top_right",
    config: {
        zodiacSign: ["aries", "taurus", "gemini"],
        period: "weekly",
        updateInterval: 6 * 60 * 60 * 1000, // 6 hours
        width: "500px",
        maxTextHeight: "300px",
        scrollSpeed: 8,
        pauseDuration: 3000, // 3 seconds pause before and after scrolling
        signWaitTime: 120000 // 2 minutes
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

If you find any issues or have suggestions for improvements, please open an issue or submit a pull request on the GitHub repository.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
