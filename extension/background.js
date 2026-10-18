// Background service worker — Smart Labeling Assistant v2
// Uses Gemini vision with the full updated decision rules (23.06.2026 style + beauty section)

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ASK_GEMINI") {
    askGemini(message.prompt, message.images, message.responseUrls, message.feedback)
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === "SAVE_CORRECTION") {
    saveCorrection(message.feedback, message.prompt)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === "SAVE_API_KEY") {
    chrome.storage.local.set({ geminiApiKey: message.key }).then(() => sendResponse({ success: true }));
    return true;
  }
});

async function saveCorrection(feedback, prompt) {
  const { corrections = [] } = await chrome.storage.local.get("corrections");
  corrections.push({
    feedback,
    promptSnippet: (prompt || "").slice(0, 160),
    timestamp: Date.now()
  });
  await chrome.storage.local.set({ corrections: corrections.slice(-40) });
}

async function getPastLessons() {
  const { corrections = [] } = await chrome.storage.local.get("corrections");
  if (!corrections.length) return "";
  return corrections
    .slice(-10)
    .map((c, i) => `${i + 1}. ${c.feedback}`)
    .join("\n");
}

async function urlToBase64(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        resolve(dataUrl ? dataUrl.split(",")[1] : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ========== FULL UPDATED CRITERIA (from user instruction) ==========
const LABELING_CRITERIA = `
You are an expert image preference labeler for generated-image comparison tasks.
Your job: look at two images (Image 1 = Generated image 1, Image 2 = Generated image 2) and decide which is better in overall visual quality AND adherence to the prompt.

Work through the decision flow strictly. Spend careful attention on small details.

=== DECISION FLOW ===

STEP 1 — Choose the better image in terms of QUALITY, ignoring the prompt
Focus on the most noticeable defect in each image.
It could be: visual artifact (poor quality, oversaturation), anatomical issue (weird proportions, inconsistent fingers), readability problem (broken text/icons), or general lack of appeal (stock-like, unnatural emotions).

- If one image has a clearly more disturbing main defect → the other image is better.
- If main defects are equally strong → compare secondary issues.
- Ask: "Which image is less disturbing?"

STEP 2 — Evaluate PROMPT ADHERENCE
The prompt is a set of specific user requests, grouped by object. Each object is a block with properties underneath (texture, color, material, lighting, mood, etc.).

Go through each line of the prompt and assess how well it is realized in Image 1 vs Image 2.
Compare both images on one attribute at a time.

Weigh mismatches by how noticeable they are:
- Slightly lighter boots than "light blue" → minor.
- Hat that should be blue but is green → major.
The more noticeable mismatch takes priority.

Added elements the user did not ask for are OK as long as they do not look broken and do not clash with the style.

STEP 3 — Final choice
You now have two judgments: quality and prompt adherence.
- Quality is a tie → prompt adherence decides.
- Prompt adherence is a tie → quality decides.
- Neither is a tie → weigh the size of the quality defect against the size of the prompt miss and pick the less disturbing problem for a potential user of the image.

=== 2. DEFECTS (unless dictated by the prompt or artistic style) ===

Visual Artifacts:
- Poor-quality camera look
- Oversaturation
- Blur / incorrect focus (see Beauty section for when blur is good)
- Compression artifacts
- Watermarks
- Frames around the image
- Looks upscaled / lack of sharpness
- AI artifacts / stock-like feel
- Checkerboard background

Anatomy (people and objects):
Looks unusual or weird:
- proportions, scales, poses, shapes, placement, structural features
Inconsistent:
- number of parts (extra/missing fingers)
- functionality (hands holding objects incorrectly)
- styles (parts of one object or image)

=== 3. BEAUTY (NEW — effects that can look like defects but are appealing when motivated) ===

3.1 Less texture detail
An image looks cleaner when textures are not overly detailed. Extra fine detail pulls attention from the main subjects.
If BOTH images have realistic textures, prefer the one with less fine detail.
BUT: if the less-detailed texture looks artificial/unrealistic, that image cannot win on this criterion.

3.2 Effects (blur, soft focus, color overlay, grain, smoother contrast, etc.)
We prefer images that feel artistic and convey a feeling rather than pure documentation.
These effects only work when it is clear what mood/atmosphere they reinforce and they feel motivated by the content:
- Magical / mysterious / ethereal / tender → soft focus or blur can strengthen the image
- Cute / toy-like / soft → same
- Dramatic → can work
- Sun-drenched / hazy → can work
Color overlay / lighting that tells a story (time of day, warmth, atmosphere) is good.

BUT when the effect does NOT serve a clear idea it is a DEFECT:
- Blur/soft focus rarely helps straightforward studio photos, everyday photographs, drawings, or UI/logo designs where text must stay readable.
- A color overlay only makes sense when the color itself is part of the concept.

=== 4. EDGE CASES ===

4.1 UI screens
Prioritize:
- Text readability and quality (broken letters, bleeding, flattened/compressed text, bold font that looks pasted)
- Icons and elements that are broken / incorrectly rendered
- Background/layout brightness and contrast (dull washed-out is bad, but pale layout with correct readable text beats high-contrast layout with broken text)

General UI flow:
1. Is there a clearly noticeable difference in only one aspect? Prefer the less distracting one.
2. Pale layout vs broken/inaccurate text → text accuracy wins.
3. When many small differences: focus on the most prominent / central / largest screens or blocks and choose the image where more of those look better overall.

4.2 Strong pattern vs artificial defects
A strong pattern across the whole image (banding, striping, noise grid) is a CRITICAL defect.
Even if the other image has more local defects (e.g. facial distortions), the image covered by a strong global pattern is almost always worse.

4.3 Clean linework vs messy drawing
Ask: "What is this image made for?"
If it is meant to be artwork/drawing, messy lines, visible brushstrokes, watercolor textures are preferred over overly clean/flat rendering — they feel more interesting and creative, provided there are no major defects that hinder perception.

4.4 Noise vs more distracting defects
In general a noisy image is worse than a clean one — unless the noise reads as intentional film grain in a cinematic shot.
However, if the other image has more disturbing issues (plastic skin, harsh glares, unnatural color halos, broken edges), the slightly noisy image may still be better.

=== OUTPUT RULES ===
- ALWAYS start your answer with exactly one of: "Image 1" or "Image 2" (or "Both" only if they are truly equal after careful inspection).
- Then briefly explain the decisive factors following the decision flow (quality defect → prompt items → beauty if relevant).
- Mention the most noticeable defect(s) and the most important prompt mismatches.
- Do not refuse. Do not tell the user to submit. You only recommend.
- Be concise but specific. Prefer concrete observations over generic praise.
`;

async function askGemini(prompt, imageDescriptions, responseUrls = [], feedback = "") {
  const { geminiApiKey } = await chrome.storage.local.get("geminiApiKey");
  if (!geminiApiKey) {
    throw new Error("No Gemini API key saved. Paste it in the side panel first (get a free key at aistudio.google.com).");
  }

  const pastLessons = await getPastLessons();

  const imageParts = [];
  for (const url of responseUrls) {
    const b64 = await urlToBase64(url);
    if (b64) {
      imageParts.push({
        inline_data: {
          mime_type: "image/jpeg",
          data: b64
        }
      });
    }
  }

  if (imageParts.length < 2) {
    throw new Error(
      `Could not load both response images (got ${imageParts.length}). Check that the page shows Generated image 1 and Generated image 2.`
    );
  }

  let system = LABELING_CRITERIA;
  if (pastLessons) {
    system += `\n\nPAST CORRECTIONS FROM THE USER (apply these lessons strictly):\n${pastLessons}`;
  }

  let userText = `PROMPT (structured user request):\n${prompt}\n\n${imageDescriptions || ""}\n\nThe two Response images are attached in order:\n- First attached image = Image 1 (Generated image 1)\n- Second attached image = Image 2 (Generated image 2)\n\nFollow the Decision Flow exactly: quality first (most noticeable defect), then prompt adherence (weigh noticeable mismatches), then final trade-off. Apply the Beauty and Edge Cases rules when relevant. Which image is better and why?`;

  if (feedback) {
    userText = `IMPORTANT CORRECTION FROM THE USER:\n${feedback}\n\nRe-examine both Response images carefully with this correction and the full labeling criteria. Prefer the image that matches the correction.\n\nPROMPT:\n${prompt}\n\n${imageDescriptions || ""}`;
  }

  const parts = [{ text: userText }, ...imageParts];

  const body = {
    contents: [
      {
        role: "user",
        parts
      }
    ],
    systemInstruction: {
      parts: [{ text: system }]
    },
    generationConfig: {
      temperature: 0.2
    }
  };

  // Gemini vision model (updated 2026)
  const model = "gemini-3.8-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return text || "No response from Gemini.";
}
