const analyzeBtn = document.getElementById("analyze");
const correctBtn = document.getElementById("correct");
const feedbackBox = document.getElementById("feedback");
const extractedDiv = document.getElementById("extracted");
const resultDiv = document.getElementById("result");
const statusDiv = document.getElementById("status");
const apiKeyInput = document.getElementById("apiKey");
const saveKeyBtn = document.getElementById("saveKey");
const keyStatus = document.getElementById("keyStatus");

let lastPageData = null;

chrome.storage.local.get("geminiApiKey").then(({ geminiApiKey }) => {
  if (geminiApiKey) {
    apiKeyInput.value = geminiApiKey;
    keyStatus.textContent = "Key loaded.";
  }
});

saveKeyBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    keyStatus.textContent = "Paste a key first.";
    return;
  }
  await chrome.runtime.sendMessage({ type: "SAVE_API_KEY", key });
  keyStatus.textContent = "Key saved.";
});

async function runAnalysis(feedback = "") {
  analyzeBtn.disabled = true;
  correctBtn.disabled = true;
  resultDiv.textContent = feedback ? "Re-evaluating with your feedback…" : "Asking Gemini (vision)…";
  statusDiv.textContent = "";

  try {
    const response = await chrome.runtime.sendMessage({
      type: "ASK_GEMINI",
      prompt: lastPageData.prompt,
      images: lastPageData.imageDescriptions,
      responseUrls: lastPageData.responseUrls || [],
      feedback
    });

    if (!response || !response.success) {
      throw new Error((response && response.error) || "Model failed");
    }

    resultDiv.textContent = response.result;
    statusDiv.textContent = "Review the recommendation. You decide whether to select and submit.";
  } catch (err) {
    resultDiv.textContent = "Error: " + err.message;
    statusDiv.innerHTML = '<span class="warning">Check API key, image load, and network.</span>';
  } finally {
    analyzeBtn.disabled = false;
    correctBtn.disabled = false;
  }
}

/**
 * Run extraction directly in the page via scripting API.
 * Does NOT rely on a pre-injected content script listener.
 */
async function extractFromTab(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      let prompt = "";

      const objectBlocks = document.querySelectorAll(
        '[class*="prompt"], [class*="object-block"], [class*="attribute"], .prompt-text, .prompt-container'
      );
      if (objectBlocks.length) {
        const texts = [];
        objectBlocks.forEach((el) => {
          const t = (el.innerText || "").trim();
          if (t.length > 8 && t.length < 2000) texts.push(t);
        });
        if (texts.length) prompt = [...new Set(texts)].join("\n\n");
      }

      if (!prompt || prompt.length < 20) {
        const bodyText = document.body.innerText || "";
        const match = bodyText.match(
          /(?:PROMPT|Look at the images[\s\S]{0,80}?)\s*([\s\S]{30,2500}?)(?=Generated image|Submit|Optional Comment|$)/i
        );
        if (match) {
          prompt = match[1].trim();
        } else {
          const main = document.querySelector("main") || document.body;
          prompt = (main.innerText || "").slice(0, 1800).trim() || "(prompt not found)";
        }
      }

      prompt = prompt
        .replace(/You have completed[\s\S]*?task expires[\s\S]*?\./gi, "")
        .replace(/Look at the images and quality first[\s\S]*?How to evaluate[\s\S]*?/gi, "")
        .replace(/Image Wiki|Instructions|FAQ/gi, "")
        .trim();

      let img1 =
        document.querySelector('img[alt="Generated image 1"]') ||
        document.querySelector('img[alt="image_1"]') ||
        document.querySelector('img[alt*="Generated image 1" i]');
      let img2 =
        document.querySelector('img[alt="Generated image 2"]') ||
        document.querySelector('img[alt="image_2"]') ||
        document.querySelector('img[alt*="Generated image 2" i]');

      if (!img1 || !img2) {
        const wrappers = document.querySelectorAll(
          ".image-wrapper, [class*='image-card'], [class*='response']"
        );
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

      if (!img1 || !img2) {
        const large = Array.from(document.querySelectorAll("img")).filter(
          (img) =>
            img.naturalWidth > 200 &&
            !(img.alt || "").toLowerCase().includes("full-size")
        );
        if (large.length >= 2) {
          img1 = img1 || large[0];
          img2 = img2 || large[1];
        }
      }

      const responseImgs = [img1, img2].filter(Boolean);
      // Convert images to data URLs in the page (avoids CORS/proxy issues in background)
      const responseUrls = [];
      for (const img of responseImgs) {
        let dataUrl = null;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        } catch (e) {
          // tainted canvas — fall back to src
          dataUrl = img.src;
        }
        if (dataUrl) responseUrls.push(dataUrl);
      }

      const sourceImgs = Array.from(
        document.querySelectorAll(
          'img[alt^="source_image"], img[alt="Request Image"], img[alt*="source" i]'
        )
      ).filter((img) => img.naturalWidth > 50);

      let imageDescriptions = "";
      if (sourceImgs.length) {
        imageDescriptions += "SOURCE / REQUEST IMAGES (context only):\n";
        imageDescriptions += sourceImgs
          .map(
            (img, i) =>
              "Source " + (i + 1) + ': alt="' + (img.alt || "") + '" size=' + img.naturalWidth + "x" + img.naturalHeight
          )
          .join("\n");
        imageDescriptions += "\n\n";
      }

      imageDescriptions += "RESPONSE IMAGES (choose the better one):\n";
      imageDescriptions += responseImgs
        .map(
          (img, i) =>
            "Image " + (i + 1) + ' ("Generated image ' + (i + 1) + '"): alt="' + (img.alt || "") + '" size=' + img.naturalWidth + "x" + img.naturalHeight
        )
        .join("\n");

      return {
        prompt: prompt,
        imageDescriptions: imageDescriptions,
        responseUrls: responseUrls,
        note: "You MUST choose Image 1 or Image 2. Source images are context only."
      };
    }
  });

  if (!results || !results[0] || results[0].result == null) {
    throw new Error("Could not extract data from the page.");
  }
  return results[0].result;
}

analyzeBtn.addEventListener("click", async () => {
  extractedDiv.textContent = "Extracting…";
  resultDiv.textContent = "";
  feedbackBox.value = "";
  statusDiv.textContent = "";
  analyzeBtn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error("No active tab found.");

    if (
      tab.url &&
      (tab.url.startsWith("chrome://") ||
        tab.url.startsWith("edge://") ||
        tab.url.startsWith("about:") ||
        tab.url.startsWith("chrome-extension://"))
    ) {
      throw new Error("Switch to the labeling website tab first, then click Analyze.");
    }

    const extractPromise = extractFromTab(tab.id);
    const timeoutPromise = new Promise(function (_, reject) {
      setTimeout(function () {
        reject(new Error("Extraction timed out after 8s. Hard-refresh the page and try again."));
      }, 8000);
    });

    lastPageData = await Promise.race([extractPromise, timeoutPromise]);

    if (lastPageData && lastPageData.error) throw new Error(lastPageData.error);

    const urlCount = (lastPageData.responseUrls && lastPageData.responseUrls.length) || 0;
    extractedDiv.textContent =
      "PROMPT:\n" + (lastPageData.prompt || "(none found)") + "\n\n" +
      (lastPageData.imageDescriptions || "(no image descriptions)") + "\n\n" +
      "Response image URLs found: " + urlCount + "\n" +
      (lastPageData.note || "");

    if (urlCount < 2) {
      statusDiv.innerHTML =
        '<span class="warning">Fewer than 2 response images found. Make sure Generated image 1 and 2 are visible.</span>';
      analyzeBtn.disabled = false;
      return;
    }

    await runAnalysis();
  } catch (err) {
    resultDiv.textContent = "Error: " + err.message;
    statusDiv.innerHTML =
      '<span class="warning">1) Click the labeling page tab so it is active  2) chrome://extensions → Reload this extension  3) Try Analyze again.</span>';
  } finally {
    analyzeBtn.disabled = false;
  }
});

correctBtn.addEventListener("click", async () => {
  const feedback = feedbackBox.value.trim();
  if (!feedback) {
    statusDiv.textContent = "Type some feedback first.";
    return;
  }
  if (!lastPageData) {
    statusDiv.textContent = "Analyze the page first.";
    return;
  }

  await chrome.runtime.sendMessage({
    type: "SAVE_CORRECTION",
    feedback: feedback,
    prompt: lastPageData.prompt
  });

  await runAnalysis(feedback);
  statusDiv.textContent = "Correction saved and applied.";
});
