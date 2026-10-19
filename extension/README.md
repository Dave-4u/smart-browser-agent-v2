# Smart Labeling Assistant v3 (simple)

Floating **Analyze A/B** button on the labeling page. No side panel. No tab hunting.

## Install

1. `chrome://extensions` → Developer mode → **Load unpacked**
2. Select this `extension` folder
3. Open a real task (both Generated image 1 and 2 visible)
4. Click the blue **Analyze A/B** button (bottom-right)
5. Paste Gemini API key once → Save key → click Analyze again if needed

## Get a free Gemini key

https://aistudio.google.com/apikey

## Flow

1. Content script extracts prompt + image URLs from the current page
2. Background fetches images and calls Gemini vision
3. Result shows in the floating panel — you still choose the radio yourself

## Version

3.0.0 — rewritten for speed and reliability
