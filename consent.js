/* Valadares — consentimento de cookies (LGPD, opt-in).
   Os trackers (GA4 + Microsoft Clarity) só carregam APÓS o aceite.
   Escolha guardada em localStorage 'valadares_consent' = granted | denied. */
(function () {
  'use strict';
  var KEY = 'valadares_consent';
  var GA_ID = 'G-D6FVKT85YG';
  var CLARITY_ID = 'xbcvdqlr9c';

  function getLang() {
    try {
      var l = localStorage.getItem('valadares_lang');
      if (l === 'pt' || l === 'en') return l;
    } catch (e) {}
    return (navigator.language || 'pt').toLowerCase().indexOf('en') === 0 ? 'en' : 'pt';
  }

  var T = {
    pt: {
      msg: 'Usamos cookies de análise (Google Analytics e Microsoft Clarity) para entender como o jogo é usado e melhorá-lo. Você escolhe.',
      accept: 'Aceitar', reject: 'Recusar', more: 'Saiba mais'
    },
    en: {
      msg: 'We use analytics cookies (Google Analytics and Microsoft Clarity) to understand how the game is used and improve it. Your choice.',
      accept: 'Accept', reject: 'Decline', more: 'Learn more'
    }
  };

  var loaded = false;
  function loadTrackers() {
    if (loaded) return;
    loaded = true;
    /* GA4 */
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID);
    /* Microsoft Clarity */
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', CLARITY_ID);
  }

  function removeBanner() {
    var b = document.getElementById('vd-consent');
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  function decide(value) {
    try { localStorage.setItem(KEY, value); } catch (e) {}
    removeBanner();
    if (value === 'granted') loadTrackers();
  }

  function showBanner() {
    if (document.getElementById('vd-consent')) return;
    var t = T[getLang()];
    var bar = document.createElement('div');
    bar.id = 'vd-consent';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Cookies');
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;' +
      'background:#1a1410;border-top:1px solid #3a2d20;color:#e0d8c8;' +
      "font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;" +
      'padding:14px 18px;box-shadow:0 -4px 20px rgba(0,0,0,.45)';
    bar.innerHTML =
      '<div style="max-width:980px;margin:0 auto;display:flex;flex-wrap:wrap;' +
      'align-items:center;gap:12px;justify-content:space-between">' +
      '<p style="margin:0;font-size:14px;line-height:1.5;flex:1 1 300px">' + t.msg +
      ' <a href="/privacy" style="color:#d4a847;text-decoration:underline">' + t.more + '</a></p>' +
      '<div style="display:flex;gap:8px;flex:0 0 auto">' +
      '<button id="vd-reject" type="button" style="background:#241b14;color:#8a7e6a;' +
      'border:1px solid #3a2d20;border-radius:6px;padding:10px 18px;font:600 13px/1 inherit;cursor:pointer">' + t.reject + '</button>' +
      '<button id="vd-accept" type="button" style="background:#d4a847;color:#0a0805;' +
      'border:1px solid #d4a847;border-radius:6px;padding:10px 18px;font:600 13px/1 inherit;cursor:pointer">' + t.accept + '</button>' +
      '</div></div>';
    document.body.appendChild(bar);
    document.getElementById('vd-accept').addEventListener('click', function () { decide('granted'); });
    document.getElementById('vd-reject').addEventListener('click', function () { decide('denied'); });
  }

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved === 'granted') {
    loadTrackers();
  } else if (saved === 'denied') {
    /* respeita a recusa: nada carrega */
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showBanner);
  } else {
    showBanner();
  }

  /* permite reabrir o banner via link: <a href="#" onclick="vdCookies()"> */
  window.vdCookies = function () { try { localStorage.removeItem(KEY); } catch (e) {} showBanner(); };
})();
