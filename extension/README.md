# Smart Labeling Assistant v2

Chrome extension that helps you choose the better of two generated images on preference-labeling sites (Toloka / Mindrift style).

It extracts the structured prompt + the two response images, sends them to **Gemini vision**, and returns a recommendation following the full decision rules:

1. **Quality first** (most noticeable defect)
2. **Prompt adherence** (weigh noticeable mismatches)
3. **Beauty / effects** (when blur, soft focus, less texture detail, color overlay are intentional and motivated)
4. **Edge cases** (UI screens, strong global patterns, clean vs expressive drawing, noise)

**It never clicks Submit or selects a radio for you.** You stay in control.

## Setup

1. Get a free Gemini API key: https://aistudio.google.com/apikey  
2. Open `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this `extension` folder.  
3. Open the labeling page (already logged in).  
4. Click the extension icon → side panel opens.  
5. Paste your API key → **Save**.  
6. Click **Analyze this page**.

## What changed in v2

- Full updated instruction set (quality → prompt → beauty section + UI / pattern / drawing edge cases).
- Selectors tuned for the Azure labeling tool (`Generated image 1` / `Generated image 2`, structured object blocks).
- Still uses Gemini vision (same family as v1); images are fetched and sent as inline data.
- Correction memory (last ~10 lessons applied to future calls).
- Clearer side-panel UX and error messages when images cannot be loaded.

## Model

Uses `gemini-2.0-flash` (vision). You can change the model string in `background.js` if needed.

## Safety

- No automatic submission.
- API key stored only in `chrome.storage.local`.
- Works only on the active tab you choose to analyze.
