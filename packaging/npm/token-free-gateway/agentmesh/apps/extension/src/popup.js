import { STORAGE_KEYS, DEFAULT_API_BASE } from "./shared/config.js";

const input = document.getElementById("api");
const status = document.getElementById("status");

chrome.storage.sync.get(STORAGE_KEYS.muhanApiBase).then((data) => {
  input.value = data[STORAGE_KEYS.muhanApiBase] || DEFAULT_API_BASE;
});

document.getElementById("save").addEventListener("click", async () => {
  const value = (input.value || DEFAULT_API_BASE).trim().replace(/\/$/, "");
  await chrome.storage.sync.set({ [STORAGE_KEYS.muhanApiBase]: value });
  status.hidden = false;
  setTimeout(() => {
    status.hidden = true;
  }, 1200);
});
