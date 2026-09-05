import { STORAGE_KEYS, DEFAULT_API_BASE } from "./shared/config.js";

const input = document.getElementById("api");
chrome.storage.sync.get(STORAGE_KEYS.muhanApiBase).then((data) => {
  input.value = data[STORAGE_KEYS.muhanApiBase] || DEFAULT_API_BASE;
});
document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    [STORAGE_KEYS.muhanApiBase]: (input.value || DEFAULT_API_BASE).trim().replace(/\/$/, ""),
  });
  alert("Saved");
});
