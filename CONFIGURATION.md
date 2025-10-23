# Configuration System Documentation

The mineflare bot now includes a comprehensive configuration management system that supports multiple profiles, environment variable overrides, and CLI-based management.

## Configuration Structure

The configuration is organized into sections:

### Server Configuration
- `server.port` - HTTP API server port (default: 3000)
- `server.timeout` - API request timeout in milliseconds (default: 30000)

### Minecraft Configuration
- `minecraft.host` - Minecraft server hostname (default: 'localhost')
- `minecraft.port` - Minecraft server port (default: 8099)
- `minecraft.username` - Bot username (default: 'AIBot')
- `minecraft.version` - Minecraft version (default: '1.21.8')
- `minecraft.auth` - Authentication type: 'offline', 'microsoft', or 'mojang' (default: 'offline')
- `minecraft.viewDistance` - View distance: 'tiny', 'short', 'normal', or 'far' (default: 'normal')

### Viewer Configuration
- `viewer.enabled` - Enable web-based viewer (default: true)
- `viewer.port` - Viewer port (default: 3007)
- `viewer.firstPerson` - First person view mode (default: false)

### API Configuration
- `api.baseUrl` - API base URL for CLI (default: 'http://localhost:3000')

### Logging Configuration
- `logging.level` - Logging level: 'debug', 'info', 'warn', or 'error' (default: 'info')
- `logging.file` - Enable file logging (default: false)
- `logging.filePath` - Log file path (default: './logs/bot.log')

### Performance Configuration
- `performance.maxEventsHistory` - Maximum events to keep in history (default: 10000)
- `performance.screenshotQuality` - Screenshot JPEG quality 1-100 (default: 85)

## Configuration Files

Configuration is stored in `.mineflare/config.json` in your project directory. This file contains all profiles and settings.

## Using the CLI

### View Configuration

```bash
# View current configuration
mineflare config get

# View specific value
mineflare config get minecraft.host

# View configuration as JSON
mineflare config get --json

# View specific profile
mineflare config get -p production
```

### Set Configuration Values

```bash
# Set a single value
mineflare config set minecraft.host "mc.example.com"

# Set port
mineflare config set server.port 8080

# Set boolean value
mineflare config set viewer.enabled false

# Set for specific profile
mineflare config set minecraft.username "ProductionBot" -p production
```

### Profile Management

```bash
# List all profiles
mineflare config profile list

# Switch active profile
mineflare config profile switch production

# Create new profile based on existing
mineflare config profile create staging -b development

# Delete profile
mineflare config profile delete old-profile
```

### Import/Export Configuration

```bash
# Export current configuration
mineflare config export my-config.json

# Export specific profile
mineflare config export production.json -p production

# Import configuration
mineflare config import my-config.json

# Import to specific profile
mineflare config import staging-config.json -p staging
```

### Reset Configuration

```bash
# Reset current profile to defaults
mineflare config reset

# Reset specific profile
mineflare config reset -p development
```

## Environment Variable Overrides

Environment variables still override configuration file settings. The following environment variables are supported:

- `MC_HOST` - Overrides minecraft.host
- `MC_PORT` - Overrides minecraft.port
- `MC_USERNAME` - Overrides minecraft.username
- `MC_VERSION` - Overrides minecraft.version
- `MC_AUTH` - Overrides minecraft.auth
- `SERVER_PORT` - Overrides server.port
- `API_BASE` - Overrides api.baseUrl
- `ENABLE_VIEWER` - Overrides viewer.enabled
- `VIEWER_PORT` - Overrides viewer.port
- `LOG_LEVEL` - Overrides logging.level

## Using Profiles

Profiles allow you to maintain different configurations for different environments:

### Start server with specific profile

```bash
# Start with production profile
mineflare server start --profile production

# Start with development profile
mineflare server start --profile development
```

### Default Profiles

The system creates three default profiles:

1. **default** - Base configuration with standard settings
2. **development** - Debug logging enabled for development
3. **production** - Warning-level logging with file output enabled

## Configuration Priority

Settings are applied in this order (highest priority first):

1. Environment variables
2. Configuration file (active profile)
3. Default values

## Example Workflows

### Setting up for a new Minecraft server

```bash
# Create a new profile for your server
mineflare config profile create myserver

# Configure the server details
mineflare config set minecraft.host "play.myserver.com" -p myserver
mineflare config set minecraft.port 25565 -p myserver
mineflare config set minecraft.username "MyBot" -p myserver

# Switch to the profile
mineflare config profile switch myserver

# Start the bot
mineflare server start
```

### Quick configuration for testing

```bash
# Set values for current session using environment variables
MC_HOST=testserver.local MC_PORT=25566 mineflare server start
```

### Backing up configuration

```bash
# Export all profiles
mineflare config export backup-config.json

# Later restore if needed
mineflare config import backup-config.json
```

## Validation

The configuration system validates values when they are set:

- Number fields check for min/max ranges
- String fields with enums only accept valid values
- Port numbers must be between 1 and 65535
- Boolean fields are converted appropriately

## Troubleshooting

### Configuration not loading

Check that the `.mineflare/config.json` file exists and is valid JSON:

```bash
cat .mineflare/config.json | python -m json.tool
```

### Environment variables not working

Ensure variables are exported before running the command:

```bash
export MC_HOST=myserver.com
mineflare server start
```

### Reset to defaults

If configuration is corrupted:

```bash
# Reset current profile
mineflare config reset

# Or delete config file and it will be recreated
rm -rf .mineflare/config.json
```