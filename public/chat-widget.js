// TTD Darshan Autofill — site-wide support chat widget.
// Include on any page with: <script src="https://ttd-autofill-backend.vercel.app/chat-widget.js" defer></script>
(function () {
  const API_BASE = "https://ttd-autofill-backend.vercel.app";
  const POLL_MS = 5000;
  const STORAGE_KEY = "ttd_chat_thread";

  let threadId = null;
  let visitorName = "";
  let visitorEmail = "";
  let lastMessageAt = null;
  let pollTimer = null;
  let panelOpen = false;

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved) {
      threadId = saved.threadId || null;
      visitorName = saved.name || "";
      visitorEmail = saved.email || "";
    }
  } catch (e) { /* ignore corrupt storage */ }

  function saveThread() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ threadId, name: visitorName, email: visitorEmail }));
    } catch (e) { /* storage may be unavailable — chat still works, just won't persist */ }
  }

  const style = document.createElement("style");
  style.textContent = `
    #ttd-chat-bubble {
      position: fixed; bottom: 20px; right: 20px; z-index: 999998;
      width: 56px; height: 56px; border-radius: 50%; background: #d9631f; color: #fff;
      border: none; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.25);
      font-size: 24px; display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    }
    #ttd-chat-panel {
      position: fixed; bottom: 86px; right: 20px; z-index: 999999;
      width: 320px; max-width: calc(100vw - 32px); max-height: 440px;
      background: #fff; border-radius: 14px; box-shadow: 0 10px 40px rgba(0,0,0,0.25);
      display: none; flex-direction: column; overflow: hidden;
      font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 13.5px;
    }
    #ttd-chat-panel.open { display: flex; }
    #ttd-chat-header {
      background: #b5451b; color: #fff; padding: 12px 14px; font-weight: 600;
      display: flex; justify-content: space-between; align-items: center;
    }
    #ttd-chat-status { font-weight: 400; font-size: 11.5px; opacity: 0.9; }
    #ttd-chat-close { background: none; border: none; color: #fff; font-size: 18px; cursor: pointer; }
    #ttd-chat-body { flex: 1; overflow-y: auto; padding: 10px 12px; background: #faf7f4; }
    .ttd-chat-msg { margin: 6px 0; max-width: 85%; padding: 8px 10px; border-radius: 10px; line-height: 1.4; }
    .ttd-chat-msg.visitor { background: #d9631f; color: #fff; margin-left: auto; border-bottom-right-radius: 2px; }
    .ttd-chat-msg.admin { background: #eee; color: #222; margin-right: auto; border-bottom-left-radius: 2px; }
    #ttd-chat-form { border-top: 1px solid #eee; padding: 8px; display: flex; gap: 6px; }
    #ttd-chat-input {
      flex: 1; border: 1px solid #ddd; border-radius: 8px; padding: 8px 10px; font-size: 13px; resize: none;
    }
    #ttd-chat-send {
      background: #d9631f; color: #fff; border: none; border-radius: 8px; padding: 0 14px; cursor: pointer; font-weight: 600;
    }
    #ttd-chat-send:disabled { opacity: 0.6; cursor: default; }
    #ttd-chat-intro { padding: 14px; }
    #ttd-chat-intro input {
      width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #ddd; border-radius: 8px;
      margin-bottom: 8px; font-size: 13px;
    }
    #ttd-chat-intro button {
      width: 100%; background: #d9631f; color: #fff; border: none; padding: 10px; border-radius: 8px;
      font-weight: 600; cursor: pointer;
    }
    #ttd-chat-err { color: #b5451b; font-size: 12px; min-height: 14px; }
  `;
  document.head.appendChild(style);

  const bubble = document.createElement("button");
  bubble.id = "ttd-chat-bubble";
  bubble.setAttribute("aria-label", "Open support chat");
  bubble.textContent = "💬";

  const panel = document.createElement("div");
  panel.id = "ttd-chat-panel";
  panel.innerHTML = `
    <div id="ttd-chat-header">
      <span>TTD Darshan Autofill Support<div id="ttd-chat-status">Checking status…</div></span>
      <button id="ttd-chat-close" aria-label="Close chat">×</button>
    </div>
    <div id="ttd-chat-body"></div>
    <div id="ttd-chat-intro">
      <input id="ttd-chat-name" type="text" placeholder="Your name">
      <input id="ttd-chat-email" type="email" placeholder="Your email">
      <div id="ttd-chat-err"></div>
      <button id="ttd-chat-start">Start chat</button>
    </div>
    <form id="ttd-chat-form" style="display:none;">
      <textarea id="ttd-chat-input" rows="1" placeholder="Type a message…"></textarea>
      <button id="ttd-chat-send" type="submit">Send</button>
    </form>
  `;

  document.addEventListener("DOMContentLoaded", mount);
  if (document.readyState === "complete" || document.readyState === "interactive") mount();

  function mount() {
    if (document.getElementById("ttd-chat-bubble")) return;
    document.body.appendChild(bubble);
    document.body.appendChild(panel);

    bubble.addEventListener("click", togglePanel);
    document.getElementById("ttd-chat-close").addEventListener("click", togglePanel);
    document.getElementById("ttd-chat-start").addEventListener("click", startChat);
    document.getElementById("ttd-chat-form").addEventListener("submit", sendMessage);

    if (threadId && visitorEmail) showChatUI();
    loadStatus();
  }

  function togglePanel() {
    panelOpen = !panelOpen;
    panel.classList.toggle("open", panelOpen);
    if (panelOpen) {
      loadStatus();
      if (threadId) {
        loadHistory();
        startPolling();
      }
    } else {
      stopPolling();
    }
  }

  async function loadStatus() {
    try {
      const res = await fetch(`${API_BASE}/api/chat-status`);
      const data = await res.json();
      document.getElementById("ttd-chat-status").textContent = data.online
        ? "Usually replies within minutes"
        : "We're offline — leave a message and we'll email you back";
    } catch (e) {
      document.getElementById("ttd-chat-status").textContent = "";
    }
  }

  function showChatUI() {
    document.getElementById("ttd-chat-intro").style.display = "none";
    document.getElementById("ttd-chat-form").style.display = "flex";
  }

  function startChat() {
    const name = document.getElementById("ttd-chat-name").value.trim();
    const email = document.getElementById("ttd-chat-email").value.trim();
    const errEl = document.getElementById("ttd-chat-err");
    if (!email || !email.includes("@")) {
      errEl.textContent = "Please enter a valid email.";
      return;
    }
    visitorName = name;
    visitorEmail = email;
    errEl.textContent = "";
    showChatUI();
    document.getElementById("ttd-chat-input").focus();
  }

  async function sendMessage(e) {
    e.preventDefault();
    const input = document.getElementById("ttd-chat-input");
    const sendBtn = document.getElementById("ttd-chat-send");
    const text = input.value.trim();
    if (!text) return;
    if (!visitorEmail) { showChatUI(); return; }
    if (sendBtn.disabled) return;

    appendMessage("visitor", text);
    input.value = "";
    sendBtn.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/api/chat-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, name: visitorName, email: visitorEmail, message: text })
      });
      const data = await res.json();
      if (data.threadId) {
        threadId = data.threadId;
        saveThread();
        startPolling();
      }
    } catch (err) {
      appendMessage("admin", "Sorry, that message couldn't be sent. Please try again.");
    } finally {
      sendBtn.disabled = false;
    }
  }

  function appendMessage(sender, text) {
    const body = document.getElementById("ttd-chat-body");
    const el = document.createElement("div");
    el.className = `ttd-chat-msg ${sender}`;
    el.textContent = text;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
  }

  async function loadHistory() {
    if (!threadId) return;
    try {
      const res = await fetch(`${API_BASE}/api/chat-poll?threadId=${encodeURIComponent(threadId)}`);
      const data = await res.json();
      const body = document.getElementById("ttd-chat-body");
      body.innerHTML = "";
      (data.messages || []).forEach(m => {
        appendMessage(m.sender, m.message);
        lastMessageAt = m.created_at;
      });
    } catch (e) { /* silent — will retry on next poll */ }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      if (!panelOpen || !threadId) return;
      try {
        const url = `${API_BASE}/api/chat-poll?threadId=${encodeURIComponent(threadId)}` +
          (lastMessageAt ? `&after=${encodeURIComponent(lastMessageAt)}` : "");
        const res = await fetch(url);
        const data = await res.json();
        (data.messages || []).forEach(m => {
          appendMessage(m.sender, m.message);
          lastMessageAt = m.created_at;
        });
      } catch (e) { /* silent — will retry next tick */ }
    }, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }
})();
