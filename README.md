# Smart Browser Agent v2 — Labeling Assistant

**Separate v2** of the Smart Labeling Assistant Chrome extension.

Helps with the task: *“Which image is better based on the prompt?”* using Gemini vision and the full updated labeling rules (quality defects, prompt adherence, beauty/effects, UI edge cases, strong patterns, etc.).

- **Never auto-submits** — only recommends.
- Designed for the Azure / Toloka-style annotation tool and similar pages.
- Free Gemini API key required.

## Quick start

```bash
# Clone
git clone https://github.com/Dave-4u/smart-browser-agent-v2.git
cd smart-browser-agent-v2

# Load the extension
# 1. chrome://extensions → Developer mode → Load unpacked
# 2. Select the "extension" folder
# 3. Open your labeling page, open the side panel, paste Gemini API key, Analyze
```

See `extension/README.md` for details.

## Repo layout

```
extension/
  manifest.json
  background.js    # Gemini call + full criteria
  content.js       # Prompt + image extraction
  sidepanel.html
  sidepanel.js
  README.md
```

## Relation to v1

This is a **new repository** (`smart-browser-agent-v2`). The original `smart-browser-agent` is left unchanged.
