// Set the saved theme before the first paint. This file replaces the inline
// script, so the app can use a strict `script-src 'self'` policy.
(function () {
  try {
    var stored = window.localStorage.getItem("keyrig.theme");
    document.documentElement.dataset.theme = stored === "light" ? "light" : "dark";
  } catch (error) {
    document.documentElement.dataset.theme = "dark";
  }
})();
