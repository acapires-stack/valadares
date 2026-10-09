/* Pequeno funil de jogo. Nenhum identificador de conta, texto livre ou dado de chat sai daqui. */
(function () {
  'use strict';
  var allowed = {
    sign_up: true, login: true, first_combat: true,
    first_quest_complete: true, first_reward_equipped: true
  };
  var knownSources = {
    google: true, tiktok: true, instagram: true, facebook: true,
    youtube: true, bing: true, discord: true, direct: true
  };
  var key = 'valadares_analytics_';
  var memory = Object.create(null);

  function localOrAdmin() {
    if (!location.hostname || /^(localhost|127\.0\.0\.1|\[::1\]|.+\.local)$/i.test(location.hostname)) return true;
    if (/\/(?:admin|admin\.html)(?:\/|$)/i.test(location.pathname)) return true;
    if (/(?:^|[?&])test=1(?:&|$)/i.test(location.search || '')) return true;
    try { if (typeof player !== 'undefined' && player && player.isAdmin) return true; } catch (e) {}
    return false;
  }
  function permitted() {
    if (localOrAdmin() || window.__valadaresConsent === 'denied') return false;
    try { return localStorage.getItem('valadares_consent') === 'granted' && typeof window.gtag === 'function'; }
    catch (e) { return false; }
  }
  function source() {
    var candidate = '';
    try {
      candidate = new URLSearchParams(location.search).get('utm_source') || '';
      if (!candidate && document.referrer) {
        var host = new URL(document.referrer).hostname.toLowerCase();
        if (host.indexOf('google.') >= 0) candidate = 'google';
        else if (host.indexOf('tiktok.') >= 0) candidate = 'tiktok';
        else if (host.indexOf('instagram.') >= 0) candidate = 'instagram';
        else if (host.indexOf('facebook.') >= 0) candidate = 'facebook';
        else if (host.indexOf('youtube.') >= 0) candidate = 'youtube';
        else if (host.indexOf('bing.') >= 0) candidate = 'bing';
        else if (host.indexOf('discord.') >= 0) candidate = 'discord';
      }
    } catch (e) {}
    candidate = candidate.toLowerCase();
    var normalized = knownSources[candidate] ? candidate : candidate ? 'other' : '';
    try {
      if (normalized) sessionStorage.setItem(key + 'source', normalized);
      else normalized = sessionStorage.getItem(key + 'source') || '';
    } catch (e) {}
    return normalized || 'direct';
  }
  function dimensions() {
    var lang = (document.documentElement.lang || 'pt').toLowerCase().indexOf('en') === 0 ? 'en' : 'pt';
    var platform = window.matchMedia && window.matchMedia('(max-width: 850px)').matches ? 'mobile' : 'desktop';
    return { acquisition_source: source(), platform: platform, language: lang };
  }
  function seen(event) {
    if (memory[event]) return true;
    try { return sessionStorage.getItem(key + event) === '1'; } catch (e) { return false; }
  }
  function mark(event) {
    memory[event] = true;
    try { sessionStorage.setItem(key + event, '1'); } catch (e) {}
  }
  function send(event, extra) {
    if (!permitted() || seen(event)) return;
    try {
      window.gtag('event', event, Object.assign(dimensions(), extra || {}));
      mark(event);
    } catch (e) { /* analytics nunca impede cadastro ou jogo */ }
  }
  window.addEventListener('valadares:milestone', function (message) {
    var detail = message && message.detail;
    if (!detail || detail.isTest === true || detail.isAdmin === true || !allowed[detail.event]) return;
    send(detail.event);
  });
  document.addEventListener('click', function (event) {
    var link = event.target && event.target.closest && event.target.closest('[data-analytics-cta]');
    if (!link || !permitted()) return;
    var position = link.getAttribute('data-analytics-cta');
    if (!/^(nav|mobile|hero|feature|closing)$/.test(position)) return;
    send('play_click_' + position, { cta_location: position });
  });
})();
