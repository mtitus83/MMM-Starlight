# MMM-SunSigns

A MagicMirror² module that displays daily, weekly, monthly, or yearly horoscopes for multiple zodiac signs with a scrolling effect.

## Disclaimer

This module was developed with the assistance of artificial intelligence. While efforts have been made to ensure its functionality, users should be aware that some aspects of the code or documentation may reflect AI-generated content.

## Support Notice

Please note that this module is not officially supported by the developer. While issues and pull requests are welcome, responses and updates may be limited or delayed.

## Features

- Fetches horoscopes for multiple zodiac signs
- Supports daily, weekly, monthly, and yearly horoscopes
- Vertical scrolling with pause at the bottom
- Optional horizontal scrolling off the screen
- Configurable scrolling speeds and durations
- Automatic rotation between different zodiac signs
- Displays zodiac sign images

## Installation

1. Navigate to your MagicMirror's `modules` directory:
   ```
   cd ~/MagicMirror/modules/
   ```

2. Clone this repository:
   ```
   git clone https://github.com/mtitus83/MMM-SunSigns.git
   ```

3. Navigate to the module's directory:
   ```
   cd MMM-SunSigns
   ```

4. Install the dependencies:
   ```
   npm install
   ```

5. Add the module to your `config/config.js` file in your MagicMirror directory.

## Configuration

Add the following to your `config/config.js` file:

```javascript
{
    module: "MMM-SunSigns",
    position: "top_right",
    config: {
        zodiacSign: ["taurus", "virgo"],
        period: "daily",
        updateInterval: 24 * 60 * 60 * 1000,
        width: "400px",
        fontSize: "1em",
        imageWidth: "100px",
        maxTextHeight: "200px",
        scrollSpeed: 6,
        pauseDuration: 5000,
        enableHorizontalScroll: false,
        horizontalScrollSpeed: 50,
        horizontalScrollDirection: "left",
        requestTimeout: 30000,
        signWaitTime: 60000,
        retryDelay: 300000,
        maxRetries: 5
    }
}
```

### Configuration Options

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `zodiacSign` | Array of zodiac signs to display | Yes | `["taurus"]` |
| `period` | Period of horoscope. Can be `"daily"`, `"weekly"`, `"monthly"`, or `"yearly"` | Yes | `"daily"` |
| `updateInterval` | How often to fetch new horoscopes in milliseconds | No | `60 * 60 * 1000` (1 hour) |
| `width` | Width of the module | No | `"400px"` |
| `fontSize` | Font size for the horoscope text | No | `"1em"` |
| `imageWidth` | Width of the zodiac sign image | No | `"100px"` |
| `maxTextHeight` | Maximum height of the text area before scrolling | No | `"200px"` |
| `scrollSpeed` | Vertical scrolling speed in pixels per second | No | `6` |
| `pauseDuration` | Duration to pause at the bottom in milliseconds | No | `5000` |
| `enableHorizontalScroll` | Whether to enable horizontal scrolling | No | `false` |
| `horizontalScrollSpeed` | Horizontal scrolling speed in pixels per second | No | `50` |
| `horizontalScrollDirection` | Direction of horizontal scroll. Can be `"left"` or `"right"` | No | `"left"` |
| `requestTimeout` | Timeout for the horoscope request in milliseconds | No | `30000` |
| `signWaitTime` | Time to wait before switching to the next sign in milliseconds | No | `60000` |
| `retryDelay` | Delay between retry attempts in milliseconds | No | `300000` (5 minutes) |
| `maxRetries` | Maximum number of retry attempts | No | `5` |

## Customization

You can customize the appearance of the module by modifying the `MMM-SunSigns.css` file in the module directory.

## Troubleshooting

If you encounter any issues:

1. Check the MagicMirror logs for any error messages.
2. Ensure that your `config.js` file is correctly formatted and the module configuration is correct.
3. Verify that you have an active internet connection, as the module needs to fetch horoscope data online.
4. If the scrolling doesn't work, make sure the horoscope text is longer than the `maxTextHeight` value.

## Contributing

Feel free to submit pull requests or open issues to improve this module. However, please understand that as this is not officially supported, responses may be limited.

## License

This project is licensed under the MIT License.
