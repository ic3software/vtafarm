/* ============================================================
   Cipher app · shared interaction layer
   Static hi-fi screens: nav switches "views", plus theme + UI bits.
   ============================================================ */
(function () {
  // ---- Theme ----
  const THEME_KEY = "cipher-theme";
  function applyTheme(t) {
    document.documentElement.classList.toggle("dark", t === "dark");
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  }
  function initTheme() {
    let t = "light";
    try { t = localStorage.getItem(THEME_KEY) || "light"; } catch (e) {}
    applyTheme(t);
  }
  initTheme();

  window.toggleTheme = function () {
    const isDark = document.documentElement.classList.contains("dark");
    applyTheme(isDark ? "light" : "dark");
  };

  // ---- View switching (static screens) ----
  // Each screen is <section class="view" data-view="name">. Nav items carry data-nav="name".
  const VIEW_KEY = "cipher-view";
  window.showView = function (name, opts) {
    opts = opts || {};
    const views = document.querySelectorAll(".view");
    views.forEach((v) => v.classList.toggle("hidden", v.getAttribute("data-view") !== name));
    document.querySelectorAll("[data-nav]").forEach((n) => {
      n.setAttribute("data-active", n.getAttribute("data-nav") === name ? "true" : "false");
    });
    if (!opts.silent) {
      try { localStorage.setItem(VIEW_KEY, name); } catch (e) {}
    }
    // update breadcrumb(s) — topbar (desktop) + in-page (mobile)
    const target = document.querySelector('.view[data-view="' + name + '"]');
    if (target && target.getAttribute("data-title")) {
      document.querySelectorAll("[data-crumb-current]").forEach((c) => {
        c.textContent = target.getAttribute("data-title");
      });
    }
    window.scrollTo({ top: 0 });
    if (typeof window.onViewChange === "function") window.onViewChange(name);
    closeDrawer();
  };

  // ---- Mobile drawer ----
  window.toggleDrawer = function () {
    const app = document.querySelector(".app");
    if (!app) return;
    app.setAttribute("data-drawer", app.getAttribute("data-drawer") === "open" ? "closed" : "open");
  };
  window.closeDrawer = function () {
    const app = document.querySelector(".app");
    if (app) app.setAttribute("data-drawer", "closed");
  };

  // ---- User popover menu ----
  window.toggleUserMenu = function (e) {
    if (e) e.stopPropagation();
    const pop = document.getElementById("userPop");
    if (!pop) return;
    pop.setAttribute("data-open", pop.getAttribute("data-open") === "true" ? "false" : "true");
  };
  window.closeUserMenu = function () {
    const pop = document.getElementById("userPop");
    if (pop) pop.setAttribute("data-open", "false");
  };
  document.addEventListener("click", function (e) {
    const pop = document.getElementById("userPop");
    if (pop && pop.getAttribute("data-open") === "true" && !pop.contains(e.target)) {
      pop.setAttribute("data-open", "false");
    }
  });

  function initView() {
    let v = null;
    try { v = localStorage.getItem(VIEW_KEY); } catch (e) {}
    const exists = v && document.querySelector('.view[data-view="' + v + '"]');
    const first = document.querySelector(".view");
    const start = exists ? v : (first ? first.getAttribute("data-view") : null);
    if (start) window.showView(start, { silent: !exists });
  }

  // ---- Collapsible ----
  window.toggleCollapsible = function (el) {
    const c = el.closest(".collapsible");
    if (c) c.setAttribute("data-open", c.getAttribute("data-open") === "true" ? "false" : "true");
  };

  // ---- Dialog ----
  window.openDialog = function (id) {
    const d = document.getElementById(id);
    if (d) d.classList.remove("hidden");
  };
  window.closeDialog = function (id) {
    const d = document.getElementById(id);
    if (d) d.classList.add("hidden");
  };

  // ---- Tabs ----
  window.selectTab = function (groupEl, value) {
    groupEl.querySelectorAll(".tab").forEach((t) => {
      t.setAttribute("data-active", t.getAttribute("data-tab") === value ? "true" : "false");
    });
    const scope = groupEl.closest("[data-tabs-scope]") || document;
    scope.querySelectorAll("[data-tabpanel]").forEach((p) => {
      p.classList.toggle("hidden", p.getAttribute("data-tabpanel") !== value);
    });
  };

  // ---- Switch / checkbox visual toggle ----
  window.toggleCheckbox = function (el) {
    el.classList.toggle("checked");
  };

  // ---- Password visibility ----
  window.togglePassword = function (btn) {
    const wrap = btn.closest(".input-group");
    const inp = wrap ? wrap.querySelector("input") : null;
    if (inp) inp.type = inp.type === "password" ? "text" : "password";
  };

  // ---- Copy to clipboard (mock-friendly) ----
  window.copyText = function (btn, text) {
    try { navigator.clipboard && navigator.clipboard.writeText(text); } catch (e) {}
    const old = btn.getAttribute("data-label") || btn.textContent;
    btn.setAttribute("data-label", old);
    btn.textContent = "Copied";
    setTimeout(() => { btn.textContent = old; }, 1200);
  };

  document.addEventListener("DOMContentLoaded", initView);
  if (document.readyState !== "loading") initView();
})();
