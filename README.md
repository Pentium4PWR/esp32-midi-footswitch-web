# ESP32 MIDI Footswitch Web Programmer

This folder contains a browser-based proof-of-concept UI for the ESP32 MIDI footswitch programmer.

## What it does

- Uses the Web Serial API to connect to a serial device.
- Sends JSON payloads to the device.
- Reads and logs device responses line by line.
- Supports sending a single `set` payload and requesting a `dump` payload.

## How to open

The Web Serial API requires a secure origin. You can test this locally with a simple web server.

### Option 1: Python

```powershell
cd web
python -m http.server 8000
```

Then open `http://localhost:8000` in a Chromium-based browser.

### Option 2: VS Code Live Server

Use the Live Server extension and open the `web/` folder.

## Browser support

The Web Serial API is supported in Chromium-based browsers such as Chrome, Edge, and Opera.

## Next steps

- Add a full action list builder to mirror the desktop UI.
- Add device config load and batch programming.
- Add response parsing and table-based feedback.
