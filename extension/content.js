// Smart Labeling Assistant v3 — runs ON the labeling page
// Floating button → extract → Gemini → show result in overlay

(function () {
  if (window.__smartLabelV3) return;
  window.__smartLabelV3 = true;

  function extract() {
    let prompt = "";
    const bodyText = document.body.innerText || "";

    const m = bodyText.match(
      /Look at the images[\s\S]{0,120}?([\s\S]{20,3000}?)(?=Generated image\s*1|Submit|Optional Comment)/i
    );
    if (m) prompt = m[1].trim();
    if (!prompt || prompt.length < 15) {
      const blocks = [];
      document.querySelectorAll("strong, b, h3, h4, [class*='title']").forEach((el) => {
        const t = (el.innerText || "").trim();
        if (t.length > 2 && t.length < 80 && t === t.toUpperCase()) {
          const parent = el.parentElement;
          if (parent) blocks.push(parent.innerText.trim().slice(0, 300));
        }
      });
      if (blocks.length) prompt = [...new Set(blocks)].join("\n");
    }
    if (!prompt || prompt.length < 15) {
      prompt = bodyText.slice(0, 1500);
    }
    prompt = prompt
      .replace(/You have completed[\s\S]*?expires[\s\S]*?\./gi, "")
      .replace(/Image Wiki|Instructions|FAQ|How to evaluate/gi, "")
      .trim();

    const img1 =
      document.querySelector('img[alt="Generated image 1"]') ||
      document.querySelector('img[alt="image_1"]');
    const img2 =
      document.querySelector('img[alt="Generated image 2"]') ||
      document.querySelector('img[alt="image_2"]');

    let imgs = [img1, img2].filter(Boolean);
    if (imgs.length < 2) {
      imgs = Array.from(document.querySelectorAll("img")).filter(
        (i) => i.naturalWidth > 200 && !(i.alt || "").toLowerCase().includes("full-size")
      ).slice(0, 2);
    }

    const urls = imgs.map((i) => i.src).filter(Boolean);
    return { prompt, urls, count: urls.length };
  }

  function ensureUI() {
    if (document.getElementById("sla-root")) return;

    const root = document.createElement("div");
    root.id = "sla-root";
    root.innerHTML = `
      <style>
        #sla-root { all: initial; font-family: system-ui, sans-serif; }
        #sla-btn {
          position: fixed; bottom: 24px; right: 24px; z-index: 2147483646;
          background: #2563eb; color: #fff; border: none; border-radius: 999px;
          padding: 14px 20px; font-size: 14px; font-weight: 600; cursor: pointer;
          box-shadow: 0 4px 20px rgba(0,0,0,.35);
        }
        #sla-btn:hover { background: #1d4ed8; }
        #sla-btn:disabled { background: #64748b; cursor: wait; }
        #sla-panel {
          position: fixed; bottom: 80px; right: 24px; width: 360px; max-height: 70vh;
          z-index: 2147483646; background: #111827; color: #e5e7eb;
          border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,.45);
          display: none; flex-direction: column; overflow: hidden;
        }
        #sla-panel.open { display: flex; }
        #sla-panel header {
          padding: 12px 14px; background: #1f2937; font-weight: 600; font-size: 13px;
          display: flex; justify-content: space-between; align-items: center;
        }
        #sla-panel header button {
          background: transparent; border: none; color: #9ca3af; cursor: pointer; font-size: 18px;
        }
        #sla-body { padding: 12px 14px; overflow-y: auto; font-size: 13px; line-height: 1.45; }
        #sla-key {
          width: 100%; box-sizing: border-box; background: #0f172a; color: #e5e7eb;
          border: 1px solid #334155; border-radius: 8px; padding: 8px; margin: 8px 0;
        }
        #sla-result {
          white-space: pre-wrap; background: #0f172a; border-radius: 8px;
          padding: 10px; margin-top: 10px; border-left: 3px solid #3b82f6;
          min-height: 40px;
        }
        #sla-status { color: #94a3b8; font-size: 12px; margin-top: 8px; }
        #sla-save {
          background: #374151; color: #fff; border: none; border-radius: 6px;
          padding: 6px 10px; cursor: pointer; font-size: 12px;
        }
      </style>
      <button id="sla-btn" type="button">Analyze A/B</button>
      <div id="sla-panel">
        <header>
          <span>Smart Labeling v3</span>
          <button id="sla-close" type="button" title="Close">×</button>
        </header>
        <div id="sla-body">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">Gemini API key</div>
          <input id="sla-key" type="password" placeholder="Paste key from aistudio.google.com" />
          <button id="sla-save" type="button">Save key</button>
          <div id="sla-result">Click Analyze A/B on a task that shows Generated image 1 and 2.</div>
          <div id="sla-status"></div>
        </div>
      </div>
    `;
    document.documentElement.appendChild(root);

    const btn = document.getElementById("sla-btn");
    const panel = document.getElementById("sla-panel");
    const close = document.getElementById("sla-close");
    const keyInput = document.getElementById("sla-key");
    const saveBtn = document.getElementById("sla-save");
    const result = document.getElementById("sla-result");
    const status = document.getElementById("sla-status");

    chrome.storage.local.get("geminiApiKey").then(({ geminiApiKey }) => {
      if (geminiApiKey) keyInput.value = geminiApiKey;
    });

    saveBtn.onclick = () => {
      const key = keyInput.value.trim();
      if (!key) {
        status.textContent = "Paste a key first.";
        return;
      }
      chrome.storage.local.set({ geminiApiKey: key });
      status.textContent = "Key saved.";
    };

    close.onclick = () => panel.classList.remove("open");

    btn.onclick = async () => {
      panel.classList.add("open");
      btn.disabled = true;
      btn.textContent = "Working…";
      result.textContent = "Extracting from this page…";
      status.textContent = "";

      try {
        const data = extract();
        if (data.count < 2) {
          result.textContent =
            "Found " + data.count + " image(s).\n\nOpen a real task where BOTH Generated image 1 and Generated image 2 are visible, then click again.";
          status.textContent = "No pair to compare yet.";
          return;
        }

        result.textContent =
          "Images: " + data.count + "\nPrompt preview:\n" + (data.prompt || "").slice(0, 400) + "\n\nAsking Gemini…";

        const response = await chrome.runtime.sendMessage({
          type: "ANALYZE",
          prompt: data.prompt,
          urls: data.urls
        });

        if (!response || !response.success) {
          throw new Error((response && response.error) || "No response from background");
        }
        result.textContent = response.result;
        status.textContent = "You decide which radio to select — extension never submits.";
      } catch (err) {
        result.textContent = "Error: " + err.message;
        status.textContent = "Check API key and that images are loaded.";
      } finally {
        btn.disabled = false;
        btn.textContent = "Analyze A/B";
      }
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureUI);
  } else {
    ensureUI();
  }

  const obs = new MutationObserver(() => {
    if (!document.getElementById("sla-btn")) ensureUI();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
