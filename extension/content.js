// Smart Labeling Assistant v3.3 — separate Save vs Re-analyze + stronger lessons

(function () {
  if (window.__smartLabelV33) return;
  window.__smartLabelV33 = true;

  function extract() {
    let prompt = "";
    const promptSide = document.querySelector(".prompt-side, .prompt-hints-wrapper");
    if (promptSide) prompt = (promptSide.innerText || "").trim();

    if (!prompt || prompt.length < 10) {
      const anchors = Array.from(document.querySelectorAll(".prompt-anchor, [class*='prompt']"));
      const texts = anchors.map((el) => (el.innerText || "").trim()).filter((t) => t.length > 5 && t.length < 800);
      if (texts.length) prompt = [...new Set(texts)].join("\n");
    }

    if (!prompt || prompt.length < 10) {
      const bodyText = document.body.innerText || "";
      const m = bodyText.match(/Look at the images[\s\S]{0,120}?([\s\S]{15,2500}?)(?=Generated image\s*1|Submit|Optional Comment)/i);
      if (m) prompt = m[1].trim();
    }
    if (!prompt || prompt.length < 10) prompt = (document.body.innerText || "").slice(0, 1200);

    prompt = prompt
      .replace(/You have completed[\s\S]*?expires[\s\S]*?\./gi, "")
      .replace(/Image Wiki|Instructions|FAQ|How to evaluate/gi, "")
      .replace(/Training stage[\s\S]*?task \d+ of \d+\.?/gi, "")
      .trim();

    let img1 = document.querySelector('img[alt="Generated image 1"]') || document.querySelector('img[alt="image_1"]');
    let img2 = document.querySelector('img[alt="Generated image 2"]') || document.querySelector('img[alt="image_2"]');

    if (!img1 || !img2) {
      Array.from(document.querySelectorAll(".image-wrapper, [class*='image-card']")).forEach((w) => {
        const label = (w.innerText || "").slice(0, 80);
        const img = w.querySelector("img");
        if (!img || img.naturalWidth < 80) return;
        if (/Generated image 1|image\s*1/i.test(label) && !img1) img1 = img;
        if (/Generated image 2|image\s*2/i.test(label) && !img2) img2 = img;
      });
    }

    const responseUrls = [img1, img2].filter(Boolean).map((i) => i.src).filter(Boolean);
    const refUrls = Array.from(
      document.querySelectorAll('img[alt="Contextual hint reference image"], img[alt*="reference" i], img[alt*="source" i]')
    )
      .filter((i) => i.naturalWidth > 40 && i.src)
      .slice(0, 4)
      .map((i) => i.src);

    return { prompt, urls: responseUrls, count: responseUrls.length, refUrls, refCount: refUrls.length };
  }

  function buildNote(chosenPick, feedbackTa) {
    let note = (feedbackTa.value || "").trim();
    if (chosenPick) {
      note =
        "The correct choice is " +
        chosenPick +
        ". Previous model answer was wrong." +
        (note ? " Reason: " + note : "");
    }
    return note;
  }

  async function saveLesson(note, lastData, lastResult) {
    const store = await chrome.storage.local.get("corrections");
    const list = Array.isArray(store.corrections) ? store.corrections.slice() : [];
    list.push({
      feedback: note,
      promptSnippet: ((lastData && lastData.prompt) || "").slice(0, 180),
      previousAnswer: (lastResult || "").slice(0, 120),
      timestamp: Date.now()
    });
    const trimmed = list.slice(-40);
    await chrome.storage.local.set({ corrections: trimmed });
    try {
      await chrome.runtime.sendMessage({
        type: "SAVE_CORRECTION",
        feedback: note,
        prompt: (lastData && lastData.prompt) || "",
        previousAnswer: lastResult || ""
      });
    } catch (e) {}
    const verify = await chrome.storage.local.get("corrections");
    return (verify.corrections || []).length;
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
          position: fixed; bottom: 80px; right: 24px; width: 380px; max-height: 75vh;
          z-index: 2147483646; background: #111827; color: #e5e7eb;
          border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,.45);
          display: none; flex-direction: column; overflow: hidden;
        }
        #sla-panel.open { display: flex; }
        #sla-panel header {
          padding: 12px 14px; background: #1f2937; font-weight: 600; font-size: 13px;
          display: flex; justify-content: space-between; align-items: center;
        }
        #sla-panel header button { background: transparent; border: none; color: #9ca3af; cursor: pointer; font-size: 18px; }
        #sla-body { padding: 12px 14px; overflow-y: auto; font-size: 13px; line-height: 1.45; }
        #sla-key {
          width: 100%; box-sizing: border-box; background: #0f172a; color: #e5e7eb;
          border: 1px solid #334155; border-radius: 8px; padding: 8px; margin: 8px 0;
        }
        #sla-result {
          white-space: pre-wrap; background: #0f172a; border-radius: 8px;
          padding: 10px; margin-top: 10px; border-left: 3px solid #3b82f6; min-height: 40px;
        }
        #sla-status { color: #94a3b8; font-size: 12px; margin-top: 8px; }
        #sla-save { background: #374151; color: #fff; border: none; border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 12px; }
        #sla-feedback-box { display: none; margin-top: 12px; padding-top: 10px; border-top: 1px solid #334155; }
        #sla-feedback-box.show { display: block; }
        #sla-feedback {
          width: 100%; box-sizing: border-box; min-height: 56px;
          background: #0f172a; color: #e5e7eb; border: 1px solid #334155;
          border-radius: 8px; padding: 8px; font-size: 12px; margin: 6px 0;
        }
        .sla-choice {
          display: inline-block; margin: 4px 6px 4px 0; padding: 6px 12px;
          background: #1e3a5f; color: #93c5fd; border: 1px solid #3b82f6;
          border-radius: 6px; cursor: pointer; font-size: 12px;
        }
        .sla-choice:hover, .sla-choice.active { background: #2563eb; color: #fff; }
        .sla-row { display: flex; gap: 8px; margin-top: 8px; }
        #sla-save-only {
          flex: 1; background: #b45309; color: #fff; border: none; border-radius: 6px;
          padding: 8px 10px; cursor: pointer; font-size: 12px; font-weight: 600;
        }
        #sla-reanalyze {
          flex: 1; background: #2563eb; color: #fff; border: none; border-radius: 6px;
          padding: 8px 10px; cursor: pointer; font-size: 12px; font-weight: 600;
        }
        #sla-save-only:hover { background: #c2410c; }
        #sla-reanalyze:hover { background: #1d4ed8; }
      </style>
      <button id="sla-btn" type="button">Analyze A/B</button>
      <div id="sla-panel">
        <header>
          <span>Smart Labeling v3.3</span>
          <button id="sla-close" type="button">×</button>
        </header>
        <div id="sla-body">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">Gemini API key</div>
          <input id="sla-key" type="password" placeholder="Paste key from aistudio.google.com" />
          <button id="sla-save" type="button">Save key</button>
          <div id="sla-result">Open a task with Generated image 1 & 2, then click Analyze A/B.</div>
          <div id="sla-status"></div>
          <div id="sla-feedback-box">
            <div style="font-size:11px;color:#fbbf24;margin-bottom:4px;">Wrong? Teach it</div>
            <span class="sla-choice" data-pick="Image 1">Correct is Image 1</span>
            <span class="sla-choice" data-pick="Image 2">Correct is Image 2</span>
            <textarea id="sla-feedback" placeholder="Optional: why was it wrong?"></textarea>
            <div class="sla-row">
              <button id="sla-save-only" type="button">Save correction only</button>
              <button id="sla-reanalyze" type="button">Re-analyze now</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.documentElement.appendChild(root);

    const btn = document.getElementById("sla-btn");
    const panel = document.getElementById("sla-panel");
    const keyInput = document.getElementById("sla-key");
    const saveBtn = document.getElementById("sla-save");
    const result = document.getElementById("sla-result");
    const status = document.getElementById("sla-status");
    const feedbackBox = document.getElementById("sla-feedback-box");
    const feedbackTa = document.getElementById("sla-feedback");
    const saveOnlyBtn = document.getElementById("sla-save-only");
    const reanalyzeBtn = document.getElementById("sla-reanalyze");

    let lastData = null;
    let lastResult = "";
    let chosenPick = null;

    chrome.storage.local.get(["geminiApiKey", "corrections"]).then((data) => {
      if (data.geminiApiKey) keyInput.value = data.geminiApiKey;
      const n = (data.corrections || []).length;
      if (n) status.textContent = n + " correction(s) stored.";
    });

    saveBtn.onclick = () => {
      const key = keyInput.value.trim();
      if (!key) { status.textContent = "Paste a key first."; return; }
      chrome.storage.local.set({ geminiApiKey: key });
      status.textContent = "Key saved.";
    };

    document.getElementById("sla-close").onclick = () => panel.classList.remove("open");

    document.querySelectorAll(".sla-choice").forEach((el) => {
      el.onclick = () => {
        document.querySelectorAll(".sla-choice").forEach((c) => c.classList.remove("active"));
        el.classList.add("active");
        chosenPick = el.getAttribute("data-pick");
      };
    });

    async function runAnalyze(feedbackText) {
      btn.disabled = true;
      btn.textContent = "Working…";
      result.textContent = feedbackText ? "Re-analyzing with correction…" : "Extracting…";
      status.textContent = "";

      try {
        const data = extract();
        lastData = data;

        if (data.count < 2) {
          result.textContent = "Found " + data.count + " response image(s). Wait until both Generated image 1 and 2 are visible.";
          status.textContent = "Need both generated images.";
          feedbackBox.classList.remove("show");
          return;
        }

        if (!feedbackText) {
          const store = await chrome.storage.local.get("corrections");
          const n = (store.corrections || []).length;
          result.textContent =
            "Response images: " + data.count +
            "\nReference images: " + data.refCount +
            "\nStored lessons: " + n +
            "\nPrompt:\n" + (data.prompt || "").slice(0, 350) +
            "\n\nAsking Gemini…";
        }

        const response = await chrome.runtime.sendMessage({
          type: "ANALYZE",
          prompt: data.prompt,
          urls: data.urls,
          refUrls: data.refUrls || [],
          feedback: feedbackText || ""
        });

        if (!response || !response.success) {
          throw new Error((response && response.error) || "No response from background");
        }

        lastResult = response.result;
        result.textContent = response.result;
        status.textContent = "You pick the radio. Save a correction if this was wrong.";
        feedbackBox.classList.add("show");
        chosenPick = null;
        document.querySelectorAll(".sla-choice").forEach((c) => c.classList.remove("active"));
        feedbackTa.value = "";
      } catch (err) {
        result.textContent = "Error: " + err.message;
        status.textContent = "Check API key and image load.";
        feedbackBox.classList.remove("show");
      } finally {
        btn.disabled = false;
        btn.textContent = "Analyze A/B";
      }
    }

    btn.onclick = async () => {
      panel.classList.add("open");
      await runAnalyze("");
    };

    saveOnlyBtn.onclick = async () => {
      if (!chosenPick && !feedbackTa.value.trim()) {
        status.textContent = "Select Image 1 or 2, or write why it was wrong.";
        return;
      }
      if (!lastData) {
        status.textContent = "Run Analyze first.";
        return;
      }
      const note = buildNote(chosenPick, feedbackTa);
      const n = await saveLesson(note, lastData, lastResult);
      status.textContent = "Correction saved (" + n + " total). Next Analyze will use it.";
    };

    reanalyzeBtn.onclick = async () => {
      if (!chosenPick && !feedbackTa.value.trim()) {
        status.textContent = "Select Image 1 or 2, or write why it was wrong.";
        return;
      }
      if (!lastData) {
        status.textContent = "Run Analyze first.";
        return;
      }
      const note = buildNote(chosenPick, feedbackTa);
      const n = await saveLesson(note, lastData, lastResult);
      status.textContent = "Saved (" + n + "). Re-analyzing…";
      await runAnalyze(note);
      status.textContent = "Re-analyzed with correction (" + n + " lessons stored).";
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
