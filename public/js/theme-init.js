(function () {
  var stored = null;
  try {
    stored = localStorage.getItem('sgt:theme:v1');
  } catch (e) {
    stored = null;
  }
  var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', dark);
})();
