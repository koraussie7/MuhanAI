/**
 * js/search-typeahead-boot.js
 * Boots the typeahead from a script src= (vite can resolve relative paths
 * for src attributes, but not for inline ES module imports in HTML).
 */
import { initSearchTypeahead } from "./search-typeahead.js";

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSearchTypeahead);
} else {
  initSearchTypeahead();
}
