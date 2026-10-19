// Background — Gemini + correction memory

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ANALYZE") {
    analyze(message.prompt, message.urls, message.feedback || "")
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === "SAVE_CORRECTION") {
    saveCorrection(message.feedback, message.prompt, message.previousAnswer)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === "SAVE_API_KEY") {
    chrome.storage.local.set({ geminiApiKey: message.key }).then(() => sendResponse({ success: true }));
    return true;
  }
});

async function saveCorrection(feedback, prompt, previousAnswer) {
  const { corrections = [] } = await chrome.storage.local.get("corrections");
  corrections.push({
    feedback: feedback || "",
    promptSnippet: (prompt || "").slice(0, 180),
    previousAnswer: (previousAnswer || "").slice(0, 120),
    timestamp: Date.now()
  });
  await chrome.storage.local.set({ corrections: corrections.slice(-40) });
}

async function getPastLessons() {
  const { corrections = [] } = await chrome.storage.local.get("corrections");
  if (!corrections.length) return "";
  return corrections
    .slice(-12)
    .map((c, i) => (i + 1) + ". " + c.feedback)
    .join("\n");
}

async function urlToBase64(url) {
  try {
    if (url && url.startsWith("data:")) {
      return url.split(",")[1] || null;
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const d = reader.result;
        resolve(d ? String(d).split(",")[1] : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const SYSTEM = `You are an expert image preference labeler.
Compare Image 1 and Image 2 (attached in that order).

DECISION FLOW:
1) QUALITY first — most noticeable defect (artifacts, anatomy, broken text, stock-like). Which is less disturbing?
2) PROMPT ADHERENCE — go line by line through the prompt; weigh noticeable mismatches more.
3) FINAL — if quality ties, prompt decides; if prompt ties, quality decides; if both differ, pick the less disturbing problem for a user of the image.

DEFECTS: oversaturation, blur (unless artistic), compression, watermarks, frames, upscaled look, AI artifacts, wrong anatomy (fingers, proportions), broken text.

BEAUTY: less fine texture detail can win if both textures look realistic. Blur/soft focus/color overlay only if motivated by mood (magical, tender, hazy, dramatic). Otherwise those are defects.

EDGE: strong global banding/noise grid is critical. For UI, readable text beats contrast. For drawings, expressive linework can beat flat clean fills.

OUTPUT:
- Start with exactly "Image 1" or "Image 2" (or "Both" only if truly equal).
- Brief concrete reasons (defects + key prompt items).
- Do not tell the user to submit.`;

async function analyze(prompt, urls, feedback) {
  const { geminiApiKey } = await chrome.storage.local.get("geminiApiKey");
  if (!geminiApiKey) {
    throw new Error("Save a Gemini API key first (panel). Free key: aistudio.google.com");
  }

  const imageParts = [];
  for (const url of urls || []) {
    const b64 = await urlToBase64(url);
    if (b64) {
      imageParts.push({ inline_data: { mime_type: "image/jpeg", data: b64 } });
    }
  }
  if (imageParts.length < 2) {
    throw new Error(
      "Could not load both images (" + imageParts.length + "/2). Wait for images to finish loading."
    );
  }

  const pastLessons = await getPastLessons();
  let system = SYSTEM;
  if (pastLessons) {
    system +=
      "\n\nPAST CORRECTIONS FROM THE USER (apply these lessons strictly on similar cases):\n" +
      pastLessons;
  }

  let userText =
    "PROMPT:\n" +
    (prompt || "(none)") +
    "\n\nImage 1 = first attachment, Image 2 = second attachment.\nWhich is better and why?";

  if (feedback) {
    userText =
      "IMPORTANT CORRECTION FROM THE USER:\n" +
      feedback +
      "\n\nRe-examine both images with this correction and the labeling rules. Prefer the image that matches the correction.\n\n" +
      userText;
  }

  const body = {
    contents: [{ role: "user", parts: [{ text: userText }, ...imageParts] }],
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: { temperature: 0.2 }
  };

  const models = [
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.8-flash",
    "gemini-2.5-flash"
  ];

  let lastError = null;
  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/" +
            model +
            ":generateContent?key=" +
            geminiApiKey,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          }
        );

        if (res.status === 503 || res.status === 429) {
          lastError = model + " busy (" + res.status + ")";
          await new Promise((r) => setTimeout(r, 700 * attempt));
          continue;
        }
        if (res.status === 404) {
          lastError = model + " not found";
          break;
        }
        if (!res.ok) {
          lastError = "Gemini " + res.status + ": " + (await res.text());
          break;
        }
        const data = await res.json();
        const text =
          data.candidates &&
          data.candidates[0] &&
          data.candidates[0].content &&
          data.candidates[0].content.parts &&
          data.candidates[0].content.parts[0] &&
          data.candidates[0].content.parts[0].text;
        if (text) return text;
        lastError = "Empty response from " + model;
      } catch (e) {
        lastError = e.message || String(e);
        await new Promise((r) => setTimeout(r, 700 * attempt));
      }
    }
  }
  throw new Error((lastError || "All models failed") + " — try again in 30s.");
}
