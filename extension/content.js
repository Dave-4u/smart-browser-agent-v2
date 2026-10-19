// Smart Labeling Assistant v3.1 — in-page button + correction memory

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
      imgs = Array.from(document.querySelectorAll("img"))
        .filter(
          (i) =>
            i.naturalWidth > 200 &&
            !(i.alt || "").toLowerCase().includes("full-size")
        )
        .slice(0, 2);
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
        #sla-save, #sla-correct-btn {
          background: #374151; color: #fff; border: none; border-radius: 6px;
          padding: 6px 10px; cursor: pointer; font-size: 12px; margin-right: 6px;
        }
        #sla-correct-btn { background: #b45309; }
        #sla-feedback-box { display: none; margin-top: 12px; padding-top: 10px; border-top: 1px solid #334155; }
        #sla-feedback-box.show { display: block; }
        #sla-feedback {
          width: 100%; box-sizing: border-box; min-height: 60px;
          background: #0f172a; color: #e5e7eb; border: 1px solid #334155;
          border-radius: 8px; padding: 8px; font-size: 12px; margin: 6px 0;
        }
        .sla-choice {
          display: inline-block; margin: 4px 6px 4px 0; padding: 6px 12px;
          background: #1e3a5f; color: #93c5fd; border: 1px solid #3b82f6;
          border-radius: 6px; cursor: pointer; font-size: 12px;
        }
        .sla-choice:hover, .sla-choice.active { background: #2563eb; color: #fff; }
        #sla-reanalyze {
          background: #2563eb; color: #fff; border: none; border-radius: 6px;
          padding: 8px 12px; cursor: pointer; font-size: 12px; width: 100%; margin-top: 6px;
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
          <div id="sla-result">Click Analyze A/B on a task with both generated images.</div>
          <div id="sla-status"></div>
          <div id="sla-feedback-box">
            <div style="font-size:11px;color:#fbbf24;margin-bottom:4px;">Was this wrong? Teach it for next time</div>
            <span class="sla-choice" data-pick="Image 1">Correct is Image 1</span>
            <span class="sla-choice" data-pick="Image 2">Correct is Image 2</span>
            <textarea id="sla-feedback" placeholder="Optional: why? e.g. Image 1 has extra fingers; Image 2 matches gold earring better"></textarea>
            <button id="sla-reanalyze" type="button">Save correction &amp; re-analyze</button>
          </div>
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
    const feedbackBox = document.getElementById("sla-feedback-box");
    const feedbackTa = document.getElementById("sla-feedback");
    const reanalyzeBtn = document.getElementById("sla-reanalyze");

    let lastData = null;
    let lastResult = "";
    let chosenPick = null;

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
      result.textContent = feedbackText
        ? "Re-analyzing with your correction…"
        : "Extracting from this page…";
      status.textContent = "";

      try {
        const data = extract();
        lastData = data;

        if (data.count < 2) {
          result.textContent =
            "Found " +
            data.count +
            " image(s).\n\nOpen a task where BOTH Generated image 1 and 2 are visible.";
          status.textContent = "No pair to compare.";
          feedbackBox.classList.remove("show");
          return;
        }

        if (!feedbackText) {
          result.textContent =
            "Images: " +
            data.count +
            "\nPrompt preview:\n" +
            (data.prompt || "").slice(0, 350) +
            "\n\nAsking Gemini…";
        }

        const response = await chrome.runtime.sendMessage({
          type: "ANALYZE",
          prompt: data.prompt,
          urls: data.urls,
          feedback: feedbackText || ""
        });

        if (!response || !response.success) {
          throw new Error((response && response.error) || "No response from background");
        }

        lastResult = response.result;
        result.textContent = response.result;
        status.textContent = "You pick the radio. If this was wrong, use the correction box below.";
        feedbackBox.classList.add("show");
        chosenPick = null;
        document.querySelectorAll(".sla-choice").forEach((c) => c.classList.remove("active"));
        feedbackTa.value = "";
      } catch (err) {
        result.textContent = "Error: " + err.message;
        status.textContent = "Check API key and that images are loaded.";
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

    reanalyzeBtn.onclick = async () => {
      if (!chosenPick && !feedbackTa.value.trim()) {
        status.textContent = "Select Image 1 or 2, or write why it was wrong.";
        return;
      }
      if (!lastData) {
        status.textContent = "Run Analyze first.";
        return;
      }

      let note = feedbackTa.value.trim();
      if (chosenPick) {
        note =
          "The correct choice is " +
          chosenPick +
          ". Previous model answer was wrong." +
          (note ? " Reason: " + note : "");
      }

      await chrome.runtime.sendMessage({
        type: "SAVE_CORRECTION",
        feedback: note,
        prompt: lastData.prompt || "",
        previousAnswer: lastResult || ""
      });

      status.textContent = "Correction saved. Re-analyzing…";
      await runAnalyze(note);
      status.textContent = "Correction saved and applied. It will influence future tasks.";
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
