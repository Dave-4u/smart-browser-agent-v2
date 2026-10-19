# smart-browser-agent-v2

Chrome extension for Toloka-style “which image is better” tasks.

**v3.0.0** uses an in-page floating button (no side panel).

```
extension/
  manifest.json
  content.js      # floating UI + extract
  background.js   # Gemini API
  README.md
```

Load the `extension` folder as an unpacked extension in Chrome.
