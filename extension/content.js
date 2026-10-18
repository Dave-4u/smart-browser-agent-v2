// Content script — extracts structured prompt + Generated image 1 / 2 URLs
// Tuned for the Azure labeling tool (label-exhed...azurewebsites.net) and similar pages

async function extractLabelingData() {
  // ---------- Prompt ----------
  let prompt = "";

  // Prefer structured object blocks if present
  const objectBlocks = document.querySelectorAll(
    '[class*="prompt"], [class*="object-block"], [class*="attribute"], .prompt-text, .prompt-container'
  );
  if (objectBlocks.length) {
    // Collect visible text that looks like the attribute list
    const texts = [];
    objectBlocks.forEach((el) => {
      const t = (el.innerText || "").trim();
      if (t.length > 8 && t.length < 2000) texts.push(t);
    });
    if (texts.length) {
      // Deduplicate and join
      prompt = [...new Set(texts)].join("\n\n");
    }
  }

  // Fallback: look for "PROMPT" heading or the main instruction area
  if (!prompt || prompt.length < 20) {
    const bodyText = document.body.innerText || "";
    const match = bodyText.match(
      /(?:PROMPT|Look at the images[\s\S]{0,80}?)\s*([\s\S]{30,2500}?)(?=Generated image|Submit|Optional Comment|$)/i
    );
    if (match) {
      prompt = match[1].trim();
    } else {
      // Last resort: grab text near the top content area
      const main = document.querySelector("main") || document.body;
      prompt = (main.innerText || "").slice(0, 1800).trim() || "(prompt not found)";
    }
  }

  // Clean common chrome
  prompt = prompt
    .replace(/You have completed[\s\S]*?task expires[\s\S]*?\./gi, "")
    .replace(/Look at the images and quality first[\s\S]*?How to evaluate[\s\S]*?/gi, "")
    .replace(/Image Wiki|Instructions|FAQ/gi, "")
    .trim();

  // ---------- Response images (the two we choose between) ----------
  let img1 =
    document.querySelector('img[alt="Generated image 1"]') ||
    document.querySelector('img[alt="image_1"]') ||
    document.querySelector('img[alt*="Generated image 1" i]');
  let img2 =
    document.querySelector('img[alt="Generated image 2"]') ||
    document.querySelector('img[alt="image_2"]') ||
    document.querySelector('img[alt*="Generated image 2" i]');

  // Fallback by radio labels / nearby structure
  if (!img1 || !img2) {
    const wrappers = document.querySelectorAll(".image-wrapper, [class*='image-card'], [class*='response']");
    const candidates = [];
    wrappers.forEach((w) => {
      const img = w.querySelector("img");
      if (img && img.naturalWidth > 80) candidates.push(img);
    });
    if (candidates.length >= 2) {
      img1 = img1 || candidates[0];
      img2 = img2 || candidates[1];
    }
  }

  // Final fallback: any large images that are not icons
  if (!img1 || !img2) {
    const large = Array.from(document.querySelectorAll("img")).filter(
      (img) => img.naturalWidth > 200 && !img.alt?.toLowerCase().includes("full-size")
    );
    if (large.length >= 2) {
      img1 = img1 || large[0];
      img2 = img2 || large[1];
    }
  }

  const responseImgs = [img1, img2].filter(Boolean);
  const responseUrls = responseImgs.map((img) => img.src).filter(Boolean);

  // ---------- Optional source / request images (context only) ----------
  const sourceImgs = Array.from(
    document.querySelectorAll(
      'img[alt^="source_image"], img[alt="Request Image"], img[alt*="source" i]'
    )
  ).filter((img) => img.naturalWidth > 50);

  let imageDescriptions = "";
  if (sourceImgs.length) {
    imageDescriptions += "SOURCE / REQUEST IMAGES (context only — do not choose these):\n";
    imageDescriptions += sourceImgs
      .map(
        (img, i) =>
          `Source ${i + 1}: alt="${img.alt || ""}" size=${img.naturalWidth}x${img.naturalHeight}`
      )
      .join("\n");
    imageDescriptions += "\n\n";
  }

  imageDescriptions += "RESPONSE IMAGES (choose the better one):\n";
  imageDescriptions += responseImgs
    .map(
      (img, i) =>
        `Image ${i + 1} (\"Generated image ${i + 1}\"): alt="${img.alt || ""}" size=${img.naturalWidth}x${img.naturalHeight}`
    )
    .join("\n");

  // Radio buttons for reference
  const radios = Array.from(document.querySelectorAll('input[type="radio"][name="selected_image"]')).map(
    (r) => ({ value: r.value, checked: r.checked })
  );

  return {
    prompt,
    imageDescriptions,
    responseUrls,
    radios,
    note: "You MUST choose Image 1 or Image 2 (Generated image 1 / Generated image 2). Source images are context only."
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === "EXTRACT_PAGE") {
    extractLabelingData()
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});
