// dmee-rules-version: 30
// Injected into instagram.com. Hides every way into the Feed, Reels tab and Explore.
// Instagram's class names change often, so we target link destinations instead.
(function () {
  if (window.__dmeeInstalled) return;
  window.__dmeeInstalled = true;

  // Reels in higher quality: Instagram's player picks the video quality from the connection it
  // thinks you have; the in-app browser often reports a slow one. Report a fast connection.
  try {
    var fastNet = { effectiveType: '4g', downlink: 10, rtt: 50, saveData: false, type: 'wifi',
      addEventListener: function () {}, removeEventListener: function () {}, onchange: null };
    Object.defineProperty(navigator, 'connection', { get: function () { return fastNet; }, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { get: function () { return 8; }, configurable: true });
  } catch (err) {}

  var STYLE =
    'a[href="/"], a[href="/explore/"], a[href^="/explore/"], a[href="/reels/"], ' +
    'a[href*="threads.net"], a[href*="threads.com"] {' +
    '  display: none !important;' +
    '}';

  function addStyle() {
    if (document.getElementById('dmee-style')) return;
    var parent = document.head || document.documentElement;
    if (!parent) return;
    var s = document.createElement('style');
    s.id = 'dmee-style';
    s.textContent = STYLE;
    parent.appendChild(s);
  }

  // Instagram's own bottom navigation is a fixed bar that contains the Explore / Reels links.
  // Walk up from those links and hide the fixed container (Dmee has its own native tab bar).
  function hideInstagramNavBar() {
    var links = document.querySelectorAll('a[href="/explore/"], a[href="/reels/"]');
    for (var i = 0; i < links.length; i++) {
      var el = links[i].parentElement;
      for (var depth = 0; el && el !== document.body && depth < 10; depth++) {
        var pos = window.getComputedStyle(el).position;
        if (pos === 'fixed' || pos === 'sticky') {
          if (!el.hasAttribute('data-dmee-hidden')) {
            el.style.setProperty('display', 'none', 'important');
            el.setAttribute('data-dmee-hidden', '1');
          }
          break;
        }
        el = el.parentElement;
      }
    }
  }

  // On the inbox, the top-left back arrow only leads to the Feed, so hide it there.
  // Inside a chat it stays (it goes back to the inbox).
  function hideInboxBackArrow() {
    var onInbox = /^\/direct\/inbox\/?$/.test(location.pathname);
    var arrows = document.querySelectorAll('svg[aria-label="Back"]');
    for (var i = 0; i < arrows.length; i++) {
      var btn = arrows[i].closest('a, button, [role="button"]') || arrows[i];
      if (onInbox && !isSearchBack(btn)) {
        btn.style.setProperty('visibility', 'hidden', 'important');
        btn.setAttribute('data-dmee-back', '1');
      } else if (btn.hasAttribute('data-dmee-back')) {
        btn.style.removeProperty('visibility');
        btn.removeAttribute('data-dmee-back');
      }
    }
  }

  // Phone back button while searching the inbox: close the search (returns true if it did).
  window.__dmeeCloseSearch = function () {
    if (!/^\/direct\/inbox\/?$/.test(location.pathname)) return false;
    var arrows = document.querySelectorAll('svg[aria-label="Back"], svg[aria-label="Nazaj"]');
    for (var i = 0; i < arrows.length; i++) {
      var btn = arrows[i].closest('a, button, [role="button"]') || arrows[i];
      if (isSearchBack(btn) && isVisible(btn)) {
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return true;
      }
    }
    return false;
  };

  // The arrow next to the search field (shown while searching) closes the search: keep it.
  function isSearchBack(btn) {
    for (var el = btn.parentElement, d = 0; el && el !== document.body && d < 4; el = el.parentElement, d++) {
      if (el.getBoundingClientRect().height > 90) break; // left the row
      if (el.querySelector('input')) return true;
    }
    return false;
  }

  function isVisible(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  }

  // ---- Friend's reels: show only the reel that was sent, never "Suggested" ----
  // Opening a reel from a chat shows a full-screen list with vertical scroll-snap. The friend's
  // reel is the first item; Instagram loads "Suggested" reels right underneath it (the address
  // doesn't change). We remove those Suggested items, so there is nothing to swipe to.
  var SUGGESTED_RE = /^(Suggested|Suggested for you|Predlagano|Predlagano za vas)$/;

  function snapContainersWithVideo() {
    var found = [];
    var vids = document.querySelectorAll('video:not(.dmee-vid)');
    for (var i = 0; i < vids.length; i++) {
      for (var el = vids[i].parentElement; el && el !== document.body; el = el.parentElement) {
        var snap = window.getComputedStyle(el).scrollSnapType || '';
        if (snap.indexOf('y') !== -1) {
          if (found.indexOf(el) === -1) found.push(el);
          break;
        }
      }
    }
    return found;
  }

  function suggestedLabels(root) {
    var out = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (SUGGESTED_RE.test(node.nodeValue.trim()) && node.parentElement) out.push(node.parentElement);
    }
    return out;
  }

  function onStories() { return /^\/stories\//.test(location.pathname); }

  function removeSuggestedReels() {
    if (onStories()) return;
    var containers = snapContainersWithVideo();
    for (var c = 0; c < containers.length; c++) {
      var box = containers[c];
      // The friend's reel = the first video in the list (remembered, so it never changes).
      if (!box.__dmeeKept || !box.contains(box.__dmeeKept)) {
        var firstVideo = box.querySelector('video');
        var labels = suggestedLabels(box);
        // Only remember it if that first video is not itself inside a Suggested item.
        var clean = true;
        for (var l = 0; l < labels.length; l++) {
          if (firstVideo && labels[l].getBoundingClientRect().top <= firstVideo.getBoundingClientRect().top) clean = false;
        }
        if (firstVideo && clean) box.__dmeeKept = firstVideo;
      }
      var kept = box.__dmeeKept;
      if (!kept) continue;

      var labelEls = suggestedLabels(box);
      for (var i = 0; i < labelEls.length; i++) {
        // Climb to the biggest block that holds this label but not the friend's reel.
        var item = labelEls[i];
        while (item.parentElement && item.parentElement !== box && !item.parentElement.contains(kept)) {
          item = item.parentElement;
        }
        if (!item.hasAttribute('data-dmee-sugg')) {
          item.style.setProperty('display', 'none', 'important');
          item.setAttribute('data-dmee-sugg', '1');
        }
      }
      // Keep the list on the friend's reel.
      if (box.scrollTop !== 0) box.scrollTop = 0;
      box.style.setProperty('overflow-y', 'hidden', 'important');
    }
  }

  // Instagram sizes the reel box from the screen height (9:16). With Dmee's tab bar the height is
  // smaller, so the box ends up narrower than the screen and leaves a black strip on the right
  // (cutting off Like/Comment/Share). Stretch those boxes to the full width.
  function fillReelWidth() {
    if (onStories()) return;
    var vids = document.querySelectorAll('video:not(.dmee-vid)');
    for (var i = 0; i < vids.length; i++) {
      var v = vids[i];
      if (!isVisible(v) || v.getBoundingClientRect().height < window.innerHeight * 0.5) continue;
      for (var el = v.parentElement; el && el.parentElement && el !== document.body; el = el.parentElement) {
        var snap = window.getComputedStyle(el).scrollSnapType || '';
        if (snap.indexOf('y') !== -1) break; // stop at the reel list
        var w = el.getBoundingClientRect().width;
        var pw = el.parentElement.getBoundingClientRect().width;
        if (pw > 0 && w > pw * 0.75 && w < pw - 2) {
          el.style.setProperty('width', '100%', 'important');
          el.style.setProperty('max-width', '100%', 'important');
          el.style.setProperty('flex', '1 1 auto', 'important');
          el.setAttribute('data-dmee-wide', '1');
        }
      }
    }
  }

  // Extra safety: no vertical swipes inside a full-screen reel viewer.
  function reelViewerOpen() {
    if (onStories()) return false; // stories keep Instagram's own taps and swipes
    var vids = document.querySelectorAll('video:not(.dmee-vid)');
    for (var i = 0; i < vids.length; i++) {
      var r = vids[i].getBoundingClientRect();
      if (isVisible(vids[i]) && r.height > window.innerHeight * 0.5 && r.width > window.innerWidth * 0.6) {
        return true;
      }
    }
    return false;
  }

  var touchStartX = 0, touchStartY = 0;
  document.addEventListener('touchstart', function (e) {
    if (e.touches.length) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }, { capture: true, passive: true });

  // Comments (and other panels on top of a reel) must still scroll and swipe down to close.
  function insidePanel(el) {
    if (!el || !el.closest) return false;
    if (el.closest('[role="dialog"]')) return true;
    var sc = scrollerOf(el);
    return !!sc && (window.getComputedStyle(sc).scrollSnapType || '').indexOf('y') === -1;
  }

  document.addEventListener('touchmove', function (e) {
    if (!e.touches.length || !reelViewerOpen()) return;
    if (insidePanel(e.target)) return;
    var dx = e.touches[0].clientX - touchStartX;
    var dy = e.touches[0].clientY - touchStartY;
    if (Math.abs(dy) > Math.abs(dx)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, { capture: true, passive: false });

  // ---- Swiping between Dmee tabs ----
  // The app moves the tabs with your finger. On every touch we tell it whether this touch may do
  // that: only on the inbox, not inside a chat (Instagram uses sideways swipes there for "reply"),
  // not in an open reel, and not on things that scroll sideways (the notes row).
  document.addEventListener('touchstart', function (e) {
    if (!window.DmeeAndroid || e.touches.length !== 1) return;
    var onTabRoot = /^\/direct\/inbox\/?$/.test(location.pathname) || PROFILE_ROOT.test(location.pathname) ||
      location.pathname === '/' || /^\/notifications\/?$/.test(location.pathname);
    var blocked = !onTabRoot || reelViewerOpen() || inHorizontalScroller(e.target) ||
      !!(e.target.closest && e.target.closest('.dmee-media'));
    try { window.DmeeAndroid.touchStart(blocked); } catch (err) {}
  }, { capture: true, passive: true });

  // ---- Pull down to refresh (Chats) ----
  // The inbox list scrolls inside its own box, so the app can't see whether it's at the top.
  // Tell it whenever that changes: pull-to-refresh only starts when the list is at the very top.
  function scrollerOf(el) {
    for (; el && el.nodeType === 1 && el !== document.body; el = el.parentElement) {
      var oy = window.getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 2) return el;
    }
    return null;
  }
  var lastAtTop = null;
  function reportAtTop(el) {
    if (!window.DmeeAndroid || !window.DmeeAndroid.setAtTop) return;
    var sc = scrollerOf(el);
    var atTop = (window.scrollY || 0) <= 0 && (!sc || sc.scrollTop <= 0);
    if (atTop === lastAtTop) return;
    lastAtTop = atTop;
    try { window.DmeeAndroid.setAtTop(atTop); } catch (err) {}
  }
  document.addEventListener('touchstart', function (e) { lastAtTop = null; reportAtTop(e.target); },
    { capture: true, passive: true });
  document.addEventListener('scroll', function (e) {
    reportAtTop(e.target === document ? document.body : e.target);
  }, { capture: true, passive: true });

  function inHorizontalScroller(el) {
    for (; el && el.nodeType === 1 && el !== document.body; el = el.parentElement) {
      var ox = window.getComputedStyle(el).overflowX;
      if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 2) return true;
    }
    return false;
  }

  // True only if the element is on screen and not covered by something else.
  function isOnTop(el) {
    if (!isVisible(el)) return false;
    var r = el.getBoundingClientRect();
    var x = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
    var y = Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1);
    var top = document.elementFromPoint(x, y);
    return !!top && (top === el || el.contains(top) || top.contains(el));
  }

  // Press the reel viewer's own back/close button (same as tapping the arrow).
  function closeReelViewer(root) {
    var SEL = 'svg[aria-label="Back"], svg[aria-label="Close"], svg[aria-label="Nazaj"], svg[aria-label="Zapri"]';
    // Prefer the button that belongs to the reel viewer itself (it may already be slid off-screen).
    if (root) {
      var own = root.querySelector(SEL);
      if (own) {
        (own.closest('a, button, [role="button"]') || own)
          .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return;
      }
    }
    var icons = document.querySelectorAll(
      'svg[aria-label="Back"], svg[aria-label="Close"], svg[aria-label="Nazaj"], svg[aria-label="Zapri"]');
    for (var i = 0; i < icons.length; i++) {
      var btn = icons[i].closest('a, button, [role="button"]') || icons[i];
      if (isOnTop(btn)) {
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return;
      }
    }
    history.back();
  }

  // ---- Reel: drag it to the left to close (it follows your finger, the chat shows underneath) ----
  function reelViewerRoot() {
    var vids = document.querySelectorAll('video:not(.dmee-vid)');
    for (var i = 0; i < vids.length; i++) {
      var r = vids[i].getBoundingClientRect();
      if (!isVisible(vids[i]) || r.height < window.innerHeight * 0.5) continue;
      for (var el = vids[i].parentElement; el && el !== document.body; el = el.parentElement) {
        if (window.getComputedStyle(el).position === 'fixed') return el;
      }
    }
    return null;
  }

  var drag = null;

  document.addEventListener('touchstart', function (e) {
    drag = null;
    if (e.touches.length !== 1 || !reelViewerOpen()) return;
    var root = reelViewerRoot();
    if (!root) return;
    drag = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), el: root, active: false, dx: 0 };
  }, { capture: true, passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!drag || !e.touches.length) return;
    var dx = e.touches[0].clientX - drag.x;
    var dy = e.touches[0].clientY - drag.y;
    if (!drag.active) {
      if (dx < -10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        drag.active = true;
        drag.el.style.setProperty('transition', 'none', 'important');
        drag.el.style.setProperty('will-change', 'transform');
      } else {
        return;
      }
    }
    drag.dx = Math.min(0, dx);
    drag.el.style.setProperty('transform', 'translateX(' + drag.dx + 'px)', 'important');
    e.preventDefault();
    e.stopPropagation();
  }, { capture: true, passive: false });

  document.addEventListener('touchend', function () {
    if (!drag || !drag.active) { drag = null; return; }
    var d = drag;
    drag = null;
    var speed = Math.abs(d.dx) / Math.max(1, Date.now() - d.t); // px per ms
    var el = d.el;
    if (d.dx < -window.innerWidth * 0.3 || (speed > 0.5 && d.dx < -40)) {
      // Glide off to the left, then close the viewer.
      el.style.setProperty('transition', 'transform 180ms ease-out', 'important');
      el.style.setProperty('transform', 'translateX(-100%)', 'important');
      setTimeout(function () {
        closeReelViewer(el);
        setTimeout(function () { resetDrag(el); }, 400);
      }, 180);
    } else {
      // Not far enough: spring back.
      el.style.setProperty('transition', 'transform 180ms ease-out', 'important');
      el.style.setProperty('transform', 'translateX(0px)', 'important');
      setTimeout(function () { resetDrag(el); }, 200);
    }
  }, { capture: true, passive: true });

  function resetDrag(el) {
    el.style.removeProperty('transform');
    el.style.removeProperty('transition');
    el.style.removeProperty('will-change');
  }

  // ---- Your own profile (Profile tab) ----
  // Profile root pages: /username/, /username/reels/, /username/tagged/, /username/saved/
  var PROFILE_ROOT = /^\/(?!(direct|p|reel|reels|stories|explore|accounts)\/)[a-z0-9._]{1,30}\/((reels|tagged|saved)\/)?$/i;
  var NAV_SKIP = /^(direct|explore|reels|accounts|p|reel|stories)$/;
  var reportedUser = null;

  function sendUsername(name) {
    if (!name || name === reportedUser || !window.DmeeAndroid || !window.DmeeAndroid.setUsername) return;
    reportedUser = name;
    try { window.DmeeAndroid.setUsername(name); } catch (err) {}
  }

  // The logged-in account: 1) the profile link in Instagram's own (hidden) bottom bar,
  // 2) the username shown at the top of the DM inbox, 3) asking Instagram directly.
  function reportUsername() {
    if (reportedUser) return;
    var links = document.querySelectorAll('[data-dmee-hidden] a[href]');
    for (var i = 0; i < links.length; i++) {
      var m = /^\/([a-z0-9._]{1,30})\/?$/i.exec(links[i].getAttribute('href') || '');
      if (m && !NAV_SKIP.test(m[1])) { sendUsername(m[1].toLowerCase()); return; }
    }
    var fromHeader = inboxHeaderUsername();
    if (fromHeader) sendUsername(fromHeader);
  }

  function inboxHeaderUsername() {
    if (!/^\/direct\/inbox\/?$/.test(location.pathname) || !document.body) return null;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var t = node.nodeValue.trim();
      if (!/^[a-z0-9._]{2,30}$/.test(t) || !node.parentElement) continue;
      var r = node.parentElement.getBoundingClientRect();
      if (r.height > 0 && r.top >= 0 && r.top < 110) return t;
    }
    return null;
  }

  function askInstagramForUsername() {
    if (reportedUser || !/(^|\.)instagram\.com$/.test(location.hostname)) return;
    var id = (/(?:^|;\s*)ds_user_id=(\d+)/.exec(document.cookie) || [])[1];
    if (!id) return; // not logged in
    var h = { credentials: 'include', headers: { 'X-IG-App-ID': '936619743392459' } };
    function pick(j) { return j && j.user && j.user.username ? String(j.user.username).toLowerCase() : null; }
    fetch('/api/v1/accounts/current_user/?edit=true', h)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var u = pick(j);
        if (u) { sendUsername(u); return; }
        return fetch('/api/v1/users/' + id + '/info/', h)
          .then(function (r) { return r.json(); })
          .then(function (j2) { sendUsername(pick(j2)); });
      })
      .catch(function () {});
  }

  // Dmee calls this when you open the Profile tab and it doesn't know your username yet.
  window.__dmeeFindUsername = function () {
    reportedUser = null;
    reportUsername();
    if (!reportedUser) askInstagramForUsername();
  };

  var usernameTries = 0;
  var usernameTimer = setInterval(function () {
    if (reportedUser || ++usernameTries > 10) { clearInterval(usernameTimer); return; }
    reportUsername();
    if (usernameTries >= 2) askInstagramForUsername();
  }, 2500);

  // On your profile: hide Instagram's own top buttons (Dmee's settings button sits there)
  // and the "Discover people" suggestions.
  var DISCOVER_RE = /^(Discover people|Suggested for you|Odkrijte ljudi|Predlagano za vas)$/;

  function hideProfileExtras() {
    if (!PROFILE_ROOT.test(location.pathname)) return;
    var pageUser = location.pathname.split('/')[1].toLowerCase();
    var ownProfile = !!reportedUser && pageUser === reportedUser;

    // Threads button (top right) on every profile.
    var threads = document.querySelectorAll('svg[aria-label="Threads"]');
    for (var t = 0; t < threads.length; t++) {
      (threads[t].closest('a, button, [role="button"]') || threads[t]).style.setProperty('display', 'none', 'important');
    }

    // Other people's Reels tab: hidden (their posts and stories stay).
    var tabs = document.querySelectorAll('a[href]');
    for (var k = 0; k < tabs.length; k++) {
      var m = /^\/([a-z0-9._]{1,30})\/reels\/?$/i.exec(tabs[k].getAttribute('href') || '');
      if (!m) continue;
      if (m[1].toLowerCase() !== reportedUser) tabs[k].style.setProperty('display', 'none', 'important');
      else tabs[k].style.removeProperty('display'); // your own Reels tab stays
    }

    if (!ownProfile) { hideDiscover(); return; } // keep "..." (block / report) on other profiles
    var icons = document.querySelectorAll(
      'svg[aria-label="Options"], svg[aria-label="Settings"], svg[aria-label="Discover people"], ' +
      'svg[aria-label="Možnosti"], svg[aria-label="Nastavitve"], svg[aria-label="Odkrijte ljudi"]');
    for (var i = 0; i < icons.length; i++) {
      var btn = icons[i].closest('a, button, [role="button"]') || icons[i];
      if (btn.getBoundingClientRect().top < 120) btn.style.setProperty('visibility', 'hidden', 'important');
    }
    hideDiscover();
  }

  function hideDiscoverOnActivity() {
    if (/^\/notifications\/?$/.test(location.pathname)) hideDiscover();
  }

  function hideDiscover() {
    if (!/Discover people|Suggested for you|Odkrijte ljudi|Predlagano za vas/.test(document.body ? document.body.textContent : '')) return;
    var walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (!DISCOVER_RE.test(node.nodeValue.trim())) continue;
      if (!node.parentElement || node.parentElement.closest('[data-dmee-discover]')) continue; // already hidden
      if (!isVisible(node.parentElement)) continue; // hidden copies (e.g. inside the profile header)
      // Hide the smallest block that holds this title and its sideways-scrolling list of people.
      for (var el = node.parentElement, d = 0; el && el !== document.body && d < 10; el = el.parentElement, d++) {
        if (hasHorizontalScroller(el)) {
          if (safeToHide(el)) {
            el.style.setProperty('display', 'none', 'important');
            el.setAttribute('data-dmee-discover', '1');
          }
          break;
        }
      }
    }
  }

  // Never hide the profile itself (photo, stats, bio, buttons) or a big part of the page.
  function safeToHide(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (el.querySelector('header, main, a[href$="/followers/"], a[href$="/following/"], img[alt*="profile picture"]')) return false;
    if (el.closest('header')) return false;
    var r = el.getBoundingClientRect();
    return r.height < window.innerHeight * 0.45;
  }

  function hasHorizontalScroller(root) {
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length && i < 400; i++) {
      var ox = window.getComputedStyle(all[i]).overflowX;
      if ((ox === 'auto' || ox === 'scroll') && all[i].scrollWidth > all[i].clientWidth + 2) return true;
    }
    return false;
  }

  // ---- "Use the app" banner and "Share your first photo" (both only push the Instagram app) ----
  var APP_PROMO_RE = /^(Use the app|Open app|Open Instagram|Get the app|Share your first photo|Uporabi aplikacijo|Odpri aplikacijo|Delite svojo prvo fotografijo)$/;
  var promoHint = /Use the app|Open app|Open Instagram|Get the app|Share your first photo|aplikacijo|prvo fotografijo/;

  function hideAppPromos() {
    var body = document.body;
    if (!body || !promoHint.test(body.textContent || '')) return; // cheap check first
    var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    var node, found = [];
    while ((node = walker.nextNode())) {
      if (APP_PROMO_RE.test(node.nodeValue.trim()) && node.parentElement &&
          !node.parentElement.closest('[data-dmee-promo]')) found.push(node.parentElement);
    }
    for (var i = 0; i < found.length; i++) {
      var el = found[i];
      var link = el.closest('a, button, [role="button"]');
      var target = null;
      // The banner = the row that also holds its close (X) button, or a fixed/sticky bar.
      for (var up = (link || el).parentElement, d = 0; up && up !== body && d < 5; up = up.parentElement, d++) {
        var pos = window.getComputedStyle(up).position;
        if (up.querySelector('svg[aria-label="Close"], svg[aria-label="Zapri"]') || pos === 'fixed' || pos === 'sticky') {
          target = up;
          break;
        }
      }
      if (target && !safeToHide(target)) target = link; // too big: only hide the link itself
      target = target || link; // plain text (e.g. a message saying "use the app") is never hidden
      if (!target || !safeToHide(target)) continue;
      target.style.setProperty('display', 'none', 'important');
      target.setAttribute('data-dmee-promo', '1');
    }
  }

  // Video stories: while the video loads, Instagram shows a huge blurry play button.
  // Hide it so you just see the story's own background with the small loading spinner.
  function hideStoryPlaceholder() {
    if (!onStories()) return;
    var icons = document.querySelectorAll('svg[aria-label="Play"], svg[aria-label="Predvajaj"]');
    for (var i = 0; i < icons.length; i++) {
      if (icons[i].getBoundingClientRect().width > window.innerWidth * 0.3) {
        icons[i].style.setProperty('visibility', 'hidden', 'important');
      }
    }
  }

  // ---- Stories tab: Instagram's home page with ONLY the stories row ----
  // Everything around the stories row (feed posts, suggestions, Instagram's top bar) is hidden.
  // Leaving the home page (e.g. opening a story) shows everything again.
  var STORY_LABEL_RE = /^(Your story|Tvoja zgodba|Deine Story|Tu historia|Votre story|La tua storia|Tvoja priča|Twoja relacja)$/;

  function findStoryTray() {
    var main = document.querySelector('main') || document.body;
    if (!main) return null;
    var walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (!STORY_LABEL_RE.test(node.nodeValue.trim()) || !node.parentElement) continue;
      for (var el = node.parentElement, d = 0; el && el !== main && d < 12; el = el.parentElement, d++) {
        var ox = window.getComputedStyle(el).overflowX;
        if ((ox === 'auto' || ox === 'scroll') || el.getAttribute('role') === 'menu' || el.tagName === 'UL') return el;
      }
    }
    // Backup: the first sideways-scrolling row near the top.
    var all = main.querySelectorAll('div, ul');
    for (var i = 0; i < all.length && i < 1500; i++) {
      var ox2 = window.getComputedStyle(all[i]).overflowX;
      if ((ox2 === 'auto' || ox2 === 'scroll') && all[i].scrollWidth > all[i].clientWidth + 2 &&
          all[i].getBoundingClientRect().top < 400 && all[i].querySelector('img, canvas')) return all[i];
    }
    return null;
  }

  // Feed posts are <article>s: hide them instantly with CSS (no flash while a story opens/closes).
  var STORIES_CSS =
    'html[data-dmee-home] main article, html[data-dmee-stories] [data-dmee-iso] { display: none !important; }';
  function addStoriesStyle() {
    if (document.getElementById('dmee-stories-css')) return;
    var parent = document.head || document.documentElement;
    if (!parent) return;
    var st = document.createElement('style');
    st.id = 'dmee-stories-css';
    st.textContent = STORIES_CSS;
    parent.appendChild(st);
  }

  function isolateStories() {
    addStoriesStyle();
    // Home page = the Stories tab: feed posts never show (only stories). Story viewer pages are untouched.
    if (location.pathname === '/') document.documentElement.setAttribute('data-dmee-home', '1');
    else document.documentElement.removeAttribute('data-dmee-home');
    // Opening a story (and coming back) keeps the feed hidden: no posts flash underneath.
    if (onStories() && document.documentElement.hasAttribute('data-dmee-stories')) return;
    var hidden = document.querySelectorAll('[data-dmee-iso]');
    if (location.pathname !== '/') {
      for (var i = 0; i < hidden.length; i++) {
        hidden[i].style.removeProperty('display');
        hidden[i].removeAttribute('data-dmee-iso');
      }
      document.documentElement.removeAttribute('data-dmee-stories');
      return;
    }
    var tray = findStoryTray();
    if (!tray) return; // still loading (or not logged in): show the page as it is
    document.documentElement.setAttribute('data-dmee-stories', '1');
    // Hide every sibling of the tray, and of each of its parents, up to <body>.
    for (var el = tray; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      var parent = el.parentElement;
      if (!parent) break;
      for (var c = parent.firstElementChild; c; c = c.nextElementSibling) {
        if (c === el || c.hasAttribute('data-dmee-iso') || (c.id && c.id.indexOf('dmee-') === 0)) continue;
        // Already hidden by another Dmee rule (e.g. Instagram's bottom bar): leave it hidden for good.
        if (c.hasAttribute('data-dmee-hidden') || c.hasAttribute('data-dmee-discover') ||
            c.hasAttribute('data-dmee-promo') || c.hasAttribute('data-dmee-sugg')) continue;
        if (c.tagName === 'SCRIPT' || c.tagName === 'STYLE' || c.tagName === 'LINK') continue;
        c.style.setProperty('display', 'none', 'important');
        c.setAttribute('data-dmee-iso', '1');
      }
    }
    tray.style.setProperty('padding-top', '6px', 'important');
    tray.style.setProperty('padding-bottom', '2px', 'important');
  }

  // Instagram's blue "unread" dots (inbox rows, notifications) become Dmee red.
  // Only small, round, blue things are touched, so buttons and links keep their colour.
  var DMEE_RED = '#FF1F2D';
  function isBlue(c) {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || '');
    if (!m) return false;
    var r = +m[1], g = +m[2], b = +m[3];
    return b > 200 && r < 130 && b - r > 90 && b - g > 40;
  }
  function redDots() {
    if (!/^\/(direct\/inbox|notifications|accounts\/activity)/.test(location.pathname)) return;
    var els = document.querySelectorAll('div, span, svg circle');
    for (var j = 0; j < els.length; j++) {
      var el = els[j];
      if (el.tagName.toLowerCase() === 'circle') {
        var f = getComputedStyle(el).fill;
        if (isBlue(f)) el.style.setProperty('fill', DMEE_RED, 'important');
        continue;
      }
      var w = el.offsetWidth, h = el.offsetHeight;
      if (!w || w > 18 || Math.abs(w - h) > 2) continue;
      var cs = getComputedStyle(el);
      if (isBlue(cs.backgroundColor)) el.style.setProperty('background-color', DMEE_RED, 'important');
      if (isBlue(cs.borderTopColor) && parseFloat(cs.borderTopWidth) >= 3)
        el.style.setProperty('border-color', DMEE_RED, 'important');
    }
  }

  // Dmee's tab bar floats over the page (Android): leave room under the last item.
  // Not inside a chat: there the app moves the page above the bar (message box stays visible).
  var TAB_BAR_SPACE = '84px';
  var paddedEl = null, paddedPath = '', lastPadScan = 0;
  function bigScroller() {
    var vh = window.innerHeight, best = null, bestH = 0;
    var divs = document.querySelectorAll('div, main, section');
    for (var i = 0; i < divs.length; i++) {
      var d = divs[i], h = d.clientHeight;
      if (h < vh * 0.5 || h <= bestH || d.scrollHeight <= h + 2) continue;
      var oy = getComputedStyle(d).overflowY;
      if (oy === 'auto' || oy === 'scroll') { best = d; bestH = h; }
    }
    return best;
  }
  function padForTabBar() {
    if (!window.DmeeAndroid) return;
    var inThread = /^\/direct\/t\//.test(location.pathname);
    var style = document.getElementById('dmee-pad');
    if (!style) {
      var parent = document.head || document.documentElement;
      if (!parent) return;
      style = document.createElement('style');
      style.id = 'dmee-pad';
      style.textContent = 'body { padding-bottom: ' + TAB_BAR_SPACE + ' !important; }';
      parent.appendChild(style);
    }
    if (inThread) {
      style.disabled = true;
      if (paddedEl) { paddedEl.style.removeProperty('padding-bottom'); paddedEl = null; paddedPath = ''; }
      return;
    }
    if (paddedEl && paddedPath === location.pathname && document.contains(paddedEl)) return;
    // Nothing found yet on this page: look again at most once a second (the search isn't free).
    if (!paddedEl && paddedPath === location.pathname && Date.now() - lastPadScan < 1000) return;
    lastPadScan = Date.now();
    if (paddedEl) paddedEl.style.removeProperty('padding-bottom');
    paddedEl = bigScroller();
    paddedPath = location.pathname;
    if (paddedEl) {
      paddedEl.style.setProperty('padding-bottom', TAB_BAR_SPACE, 'important');
      style.disabled = true;  // the list scrolls in its own box: pad that, not the page
    } else {
      style.disabled = false; // the whole page scrolls: pad the page
    }
  }

  // ===== Reels: sound on, double-tap to like, hold for 2x speed =====
  var LIKE_LABELS = ['Like', 'Všeč mi je', 'Všečkaj', 'Gefällt mir', 'Mi piace', 'Me gusta', "J'aime", 'Sviđa mi se', 'Lubię to!'];
  var MUTED_RE = /audio is muted|audio is off|zvok je (izklopljen|utišan)|ton ist aus|audio disattivato|el audio está desactivado/i;

  function mainReelVideo() {
    var vids = document.querySelectorAll('video:not(.dmee-vid)');
    for (var i = 0; i < vids.length; i++) {
      var r = vids[i].getBoundingClientRect();
      if (isVisible(vids[i]) && r.height > window.innerHeight * 0.5 && r.width > window.innerWidth * 0.6 &&
          r.top < window.innerHeight / 2 && r.bottom > window.innerHeight / 2) return vids[i];
    }
    return null;
  }

  // Sound on by default (once per reel, so muting it again still works).
  function unmuteReel() {
    if (window.__dmeeHidden || !reelViewerOpen()) return;
    var v = mainReelVideo();
    if (!v || v.__dmeeUnmuted) return;
    v.__dmeeUnmuted = true;
    if (!v.muted) return;
    var icons = document.querySelectorAll('svg[aria-label]');
    for (var i = 0; i < icons.length; i++) {
      if (MUTED_RE.test(icons[i].getAttribute('aria-label')) && isOnTop(icons[i])) {
        (icons[i].closest('button, [role="button"]') || icons[i])
          .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        setTimeout(function () { if (v.muted) v.muted = false; }, 300);
        return;
      }
    }
    v.muted = false;
  }

  var UNLIKE_LABELS = ['Unlike', 'Ni mi več všeč', 'Odstrani všečkanje', 'Gefällt mir nicht mehr', 'Non mi piace più', 'Ya no me gusta', "Je n'aime plus", 'Ne sviđa mi se'];
  function findLikeButton(orUnlike) {
    var labels = orUnlike ? LIKE_LABELS.concat(UNLIKE_LABELS) : LIKE_LABELS;
    var sel = labels.map(function (l) { return 'svg[aria-label="' + l + '"]'; }).join(', ');
    var icons = document.querySelectorAll(sel);
    for (var i = 0; i < icons.length; i++) {
      var r = icons[i].getBoundingClientRect();
      // the reel's own heart sits on the right side, not a comment's small heart
      if (r.width >= 20 && r.left > window.innerWidth * 0.6 && isOnTop(icons[i])) {
        return icons[i].closest('button, [role="button"]') || icons[i];
      }
    }
    return null;
  }

  function showHeart(x, y) {
    var h = document.createElement('div');
    h.textContent = '❤';
    h.style.cssText = 'position:fixed;left:' + (x - 50) + 'px;top:' + (y - 50) + 'px;width:100px;height:100px;' +
      'font-size:90px;line-height:100px;text-align:center;color:#FF1F2D;z-index:2147483647;pointer-events:none;' +
      'transform:scale(0.3);opacity:0;transition:transform 220ms cubic-bezier(.2,1.6,.4,1),opacity 220ms;' +
      'text-shadow:0 4px 18px rgba(0,0,0,.35)';
    document.body.appendChild(h);
    requestAnimationFrame(function () { h.style.transform = 'scale(1)'; h.style.opacity = '1'; });
    setTimeout(function () { h.style.transition = 'transform 260ms ease-in,opacity 260ms'; h.style.transform = 'scale(1.3) translateY(-30px)'; h.style.opacity = '0'; }, 520);
    setTimeout(function () { h.remove(); }, 900);
  }

  function onControl(el) {
    if (!el || !el.closest) return false;
    if (el.closest('[role="dialog"], input, textarea, #dmee-2x')) return true;
    var c = el.closest('a, button, [role="button"]');
    if (!c) return false;
    var r = c.getBoundingClientRect();
    // the whole reel is one big clickable box: that's the video, not a button
    return r.width * r.height < window.innerWidth * window.innerHeight * 0.25;
  }

  var tap = null, lastTap = null, hold = null, swallowClickUntil = 0;
  document.addEventListener('touchstart', function (e) {
    tap = null;
    if (e.touches.length !== 1 || !reelViewerOpen() || onControl(e.target)) return;
    var t = e.touches[0];
    tap = { x: t.clientX, y: t.clientY, t: Date.now(), moved: false };
    var v = mainReelVideo();
    if (!v) return;
    hold = { v: v, on: false, timer: setTimeout(function () {
      if (!tap || tap.moved) return;
      hold.on = true;
      hold.prev = v.playbackRate;
      v.playbackRate = 2;
      if (v.paused) v.play().catch(function () {});
      showSpeedPill(true);
      // Instagram may pause on a long press: keep it playing fast while the finger stays down
      hold.keep = setInterval(function () {
        if (v.playbackRate !== 2) v.playbackRate = 2;
        if (v.paused) v.play().catch(function () {});
      }, 100);
    }, 350) };
  }, { capture: true, passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!tap || !e.touches.length) return;
    var t = e.touches[0];
    if (Math.abs(t.clientX - tap.x) > 10 || Math.abs(t.clientY - tap.y) > 10) tap.moved = true;
  }, { capture: true, passive: true });

  function endHold() {
    if (!hold) return false;
    clearTimeout(hold.timer);
    clearInterval(hold.keep);
    var was = hold.on;
    if (was) { hold.v.playbackRate = hold.prev || 1; showSpeedPill(false); update2xButton(); }
    hold = null;
    return was;
  }

  // Like the Instagram app: a single tap only pauses after a short wait, so a double tap never
  // pauses the reel. Instagram's own click is held back and replayed only for a real single tap.
  var pendingClick = null, pendingTimer = null;
  document.addEventListener('touchend', function (e) {
    var wasHold = endHold();
    if (wasHold) { swallowClickUntil = Date.now() + 500; e.preventDefault(); e.stopPropagation(); tap = null; return; }
    if (!tap || tap.moved || Date.now() - tap.t > 250) { tap = null; return; }
    var now = Date.now();
    if (lastTap && now - lastTap.t < 320 && Math.abs(tap.x - lastTap.x) < 40 && Math.abs(tap.y - lastTap.y) < 40) {
      var x = tap.x, y = tap.y;
      lastTap = null;
      clearTimeout(pendingTimer); pendingClick = null; // no pause
      swallowClickUntil = Date.now() + 400; // the second tap's click must not pause either
      showHeart(x, y);
      setTimeout(function () {
        var b = findLikeButton();
        if (!b) return;
        var lc = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        lc.__dmeeReplay = true; // our own click: never swallowed
        b.dispatchEvent(lc);
      }, 60);
    } else {
      lastTap = { x: tap.x, y: tap.y, t: now };
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(function () {
        var c = pendingClick; pendingClick = null;
        if (!c) return;
        var ev = new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: c.x, clientY: c.y });
        ev.__dmeeReplay = true;
        c.el.dispatchEvent(ev);
      }, 300);
    }
    tap = null;
  }, { capture: true, passive: false });
  // Hold back Instagram's click on the reel itself (not on its buttons) until we know it's a single tap.
  document.addEventListener('click', function (e) {
    if (e.__dmeeReplay || !lastTap || Date.now() - lastTap.t > 300) return;
    if (!reelViewerOpen() || onControl(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    pendingClick = { el: e.target, x: e.clientX, y: e.clientY };
  }, true);
  document.addEventListener('touchcancel', function () { endHold(); tap = null; }, { capture: true, passive: true });

  ['click', 'pointerup', 'mouseup'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      if (!e.__dmeeReplay && Date.now() < swallowClickUntil) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  });
  document.addEventListener('contextmenu', function (e) { if (reelViewerOpen()) e.preventDefault(); }, true);

  function showSpeedPill(on) {
    var p = document.getElementById('dmee-speed');
    if (!p) {
      p = document.createElement('div');
      p.id = 'dmee-speed';
      p.textContent = '2×  ▶▶';
      p.style.cssText = 'position:fixed;left:50%;top:70px;transform:translateX(-50%) scale(.9);padding:6px 14px;' +
        'border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font:600 14px -apple-system,Roboto,sans-serif;' +
        'z-index:2147483647;pointer-events:none;opacity:0;transition:opacity 150ms,transform 150ms';
      document.body.appendChild(p);
    }
    p.style.opacity = on ? '1' : '0';
    p.style.transform = 'translateX(-50%) scale(' + (on ? 1 : 0.9) + ')';
  }

  // ===== 2x button, just above the reel's like button =====
  function update2xButton() {
    var b = document.getElementById('dmee-2x');
    var v = (!window.__dmeeHidden && reelViewerOpen()) ? mainReelVideo() : null;
    var like = v ? findLikeButton(true) : null;
    if (!v || !like) { if (b) b.style.display = 'none'; return; }
    if (!b) {
      b = document.createElement('div');
      b.id = 'dmee-2x';
      b.setAttribute('role', 'button');
      b.style.cssText = 'position:fixed;width:44px;height:44px;border-radius:22px;display:flex;align-items:center;' +
        'justify-content:center;font:700 15px -apple-system,Roboto,sans-serif;z-index:2147483646;' +
        'transition:background 150ms,color 150ms,transform 120ms;-webkit-tap-highlight-color:transparent';
      b.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var cur = mainReelVideo();
        if (!cur) return;
        cur.playbackRate = cur.playbackRate > 1 ? 1 : 2;
        if (cur.paused) cur.play().catch(function () {});
        paint2x(b, cur);
      }, true);
      ['touchstart', 'touchend', 'pointerdown', 'pointerup'].forEach(function (t) {
        b.addEventListener(t, function (e) { e.stopPropagation(); }, true);
      });
      document.body.appendChild(b);
    }
    var r = like.getBoundingClientRect();
    b.style.left = Math.round(r.left + r.width / 2 - 22) + 'px';
    b.style.top = Math.round(r.top - 58) + 'px';
    b.style.display = 'flex';
    paint2x(b, v);
  }
  function paint2x(b, v) {
    var on = v.playbackRate > 1;
    b.textContent = on ? '2\u00d7' : '1\u00d7';
    b.style.background = on ? '#FF1F2D' : 'rgba(0,0,0,.35)';
    b.style.color = '#fff';
    b.style.border = on ? 'none' : '1.5px solid rgba(255,255,255,.85)';
  }

  // ===== Reel open: tell the app (it hides the menu) =====
  var lastReel = null;
  // While a reel is open, no text can be selected (a long press is "hold for 2x", not "copy text").
  var NOSELECT_CSS =
    'html[data-dmee-reel], html[data-dmee-reel] * { -webkit-user-select: none !important; user-select: none !important;' +
    ' -webkit-touch-callout: none !important; }' +
    'html[data-dmee-reel] input, html[data-dmee-reel] textarea, html[data-dmee-reel] [contenteditable="true"] {' +
    ' -webkit-user-select: text !important; user-select: text !important; }';
  function setNoSelect(on) {
    var root = document.documentElement;
    if (!root) return;
    if (!document.getElementById('dmee-noselect')) {
      var parent = document.head || root;
      var st = document.createElement('style');
      st.id = 'dmee-noselect';
      st.textContent = NOSELECT_CSS;
      parent.appendChild(st);
    }
    if (on) {
      if (!root.hasAttribute('data-dmee-reel')) root.setAttribute('data-dmee-reel', '1');
    } else if (root.hasAttribute('data-dmee-reel')) {
      root.removeAttribute('data-dmee-reel');
    }
  }

  function reportReel() {
    var reelOpen = reelViewerOpen();
    setNoSelect(reelOpen);
    if (reelOpen && window.getSelection) { var sel = window.getSelection(); if (sel && sel.type === 'Range') sel.removeAllRanges(); }
    if (!window.DmeeAndroid || !window.DmeeAndroid.setReelOpen) return;
    var open = !window.__dmeeHidden && reelOpen;
    if (open === lastReel) return;
    lastReel = open;
    try { window.DmeeAndroid.setReelOpen(open); } catch (err) {}
  }

  // ===== Reel author name squeezed into one letter per line (long "AI-generated" labels) =====
  function fixSqueezedNames() {
    if (!reelViewerOpen()) return;
    var links = document.querySelectorAll('a[href^="/"]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.__dmeeFixed || !(a.textContent || '').trim()) continue;
      var r = a.getBoundingClientRect();
      if (r.width > 0 && r.width < 40 && r.height > 70) {
        a.__dmeeFixed = true;
        var els = [a].concat(Array.prototype.slice.call(a.querySelectorAll('*')));
        for (var j = 0; j < els.length; j++) {
          els[j].style.setProperty('white-space', 'nowrap', 'important');
          els[j].style.setProperty('word-break', 'normal', 'important');
          els[j].style.setProperty('overflow-wrap', 'normal', 'important');
        }
        // keep the name, shorten the label next to it instead
        for (var el = a; el && el !== document.body && el.getBoundingClientRect().width < 60; el = el.parentElement) {
          el.style.setProperty('flex-shrink', '0', 'important');
          el.style.setProperty('min-width', 'auto', 'important');
        }
      }
    }
  }

  // ===== Chats search open: tell the app (it hides the lock button) =====
  var lastSearching = null;
  function reportSearching() {
    if (!window.DmeeAndroid || !window.DmeeAndroid.setSearching) return;
    var onInbox = /^\/direct\/inbox\/?$/.test(location.pathname);
    var searching = false;
    if (onInbox) {
      var a = document.activeElement;
      if (a && a.tagName === 'INPUT') searching = true;
      var ins = document.querySelectorAll('input');
      for (var i = 0; i < ins.length && !searching; i++) {
        if (ins[i].value && isVisible(ins[i])) searching = true;
      }
    }
    if (searching === lastSearching) return;
    lastSearching = searching;
    try { window.DmeeAndroid.setSearching(searching); } catch (err) {}
  }
  ['focusin', 'focusout', 'input'].forEach(function (t) {
    document.addEventListener(t, function () { setTimeout(reportSearching, 0); }, true);
  });

  // ===== Tab hidden: stop every video / sound on this page =====
  window.__dmeeSetHidden = function (hidden) {
    window.__dmeeHidden = !!hidden;
    if (hidden) pauseAllMedia(); else setTimeout(run, 0);
  };
  function pauseAllMedia() {
    var m = document.querySelectorAll('video, audio');
    for (var i = 0; i < m.length; i++) { try { if (!m[i].paused) m[i].pause(); } catch (err) {} }
  }

  // ===== Instant tap feedback on Instagram's buttons (feels native) =====
  // Only the small button under the finger dims (CSS :active also dimmed whole button columns).
  var FEEDBACK_CSS =
    'button, [role="button"], a { -webkit-tap-highlight-color: transparent; }' +
    '.dmee-pressed { opacity: .55 !important; transition: opacity 80ms ease !important; }' +
    '.dmee-released { transition: opacity 160ms ease !important; }' +
    '@keyframes dmeePop { 0% { transform: scale(.82); } 55% { transform: scale(1.18); } 100% { transform: scale(1); } }' +
    '.dmee-pop { animation: dmeePop 280ms cubic-bezier(.2,.9,.3,1.3) !important; transform-origin: center !important; }';
  function addFeedbackStyle() {
    if (document.getElementById('dmee-feedback')) return;
    var parent = document.head || document.documentElement;
    if (!parent) return;
    var s = document.createElement('style');
    s.id = 'dmee-feedback';
    s.textContent = FEEDBACK_CSS;
    parent.appendChild(s);
  }
  var pressedEl = null;
  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1 || !e.target.closest) return;
    var c = e.target.closest('button, [role="button"]');
    if (!c || c.id === 'dmee-2x') return;
    var r = c.getBoundingClientRect();
    if (r.width > 120 || r.height > 120) return; // rows and big areas: no dimming
    pressedEl = c;
    c.classList.remove('dmee-released');
    c.classList.add('dmee-pressed');
  }, { capture: true, passive: true });
  function releasePress(e) {
    if (!pressedEl) return;
    var c = pressedEl; pressedEl = null;
    // a quick "pop" on the icon: the tap registered, even if Instagram takes a moment to answer
    if (e && e.type === 'touchend') {
      var icon = c.querySelector('svg') || c;
      icon.classList.remove('dmee-pop');
      void icon.getBoundingClientRect();
      icon.classList.add('dmee-pop');
      setTimeout(function () { icon.classList.remove('dmee-pop'); }, 320);
    }
    c.classList.remove('dmee-pressed');
    c.classList.add('dmee-released');
    setTimeout(function () { c.classList.remove('dmee-released'); }, 200);
  }
  document.addEventListener('touchend', releasePress, { capture: true, passive: true });
  document.addEventListener('touchcancel', releasePress, { capture: true, passive: true });
  document.addEventListener('touchmove', function (e) {
    if (pressedEl && tap && tap.moved) releasePress();
  }, { capture: true, passive: true });

  // ===== Back button while a reel is open: close the reel (stay in the chat) =====
  // Press the reel's own top-left arrow (the same one that already works when tapped).
  function topLeftBackButton() {
    var cands = document.querySelectorAll('a, button, [role="button"]');
    var best = null, bestScore = 1e9;
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (!c.querySelector('svg')) continue;
      var r = c.getBoundingClientRect();
      if (!r.width || r.top > 140 || r.left > window.innerWidth * 0.25 || r.width > 80) continue;
      if (!isOnTop(c)) continue;
      var score = r.top + r.left;
      if (score < bestScore) { best = c; bestScore = score; }
    }
    return best;
  }
  window.__dmeeCloseReel = function () {
    if (!reelViewerOpen()) return false;
    var btn = topLeftBackButton();
    if (btn) {
      var ev = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      ev.__dmeeReplay = true;
      btn.dispatchEvent(ev);
      return true;
    }
    closeReelViewer(reelViewerRoot());
    return true;
  };

  // ===== Instagram notices with an X hiding under Dmee's round buttons (Profile) =====
  // A full-width bar near the top that holds a close (X) button: hide the bar.
  function hideTopNotices() {
    var path = location.pathname;
    if (/^\/(direct|stories)\//.test(path) || reelViewerOpen()) return;
    var xs = document.querySelectorAll('svg[aria-label="Close"], svg[aria-label="Zapri"], svg[aria-label="Dismiss"], svg[aria-label="Opusti"]');
    for (var i = 0; i < xs.length; i++) {
      var x = xs[i];
      if (x.closest('[role="dialog"], [data-dmee-notice]')) continue;
      var r = x.getBoundingClientRect();
      if (!r.width || r.top > 160 || r.top < -10) continue;
      for (var el = x.parentElement, d = 0; el && el !== document.body && d < 8; el = el.parentElement, d++) {
        var b = el.getBoundingClientRect();
        if (b.width >= window.innerWidth * 0.85 && b.height > 30 && b.height < 200 && b.top < 160) {
          if (!safeToHide(el)) break;
          el.style.setProperty('display', 'none', 'important');
          el.setAttribute('data-dmee-notice', '1');
          break;
        }
      }
    }
  }

  // ===== Chat: press and hold a message for react / reply / copy / unsend =====
  // Instagram's website shows those buttons on mouse hover; on a phone a long press now reveals them.
  var THREAD_CSS =
    'html[data-dmee-thread], html[data-dmee-thread] * { -webkit-user-select: none !important;' +
    ' user-select: none !important; -webkit-touch-callout: none !important; }' +
    'html[data-dmee-thread] input, html[data-dmee-thread] textarea, html[data-dmee-thread] [contenteditable="true"],' +
    ' html[data-dmee-thread] [contenteditable="true"] *, html[data-dmee-thread] [role="textbox"] {' +
    ' -webkit-user-select: text !important; user-select: text !important; }';
  var MORE_RE = /^(more|more options|see more options|options|več|več možnosti|možnosti|mehr|altro|más|plus)$/i;
  // The hover buttons sit next to the message: react, reply, "..." — the "..." is the one farthest out.
  function moreButtonNear(x, y) {
    var cands = document.querySelectorAll('button, [role="button"]');
    var best = null, bestDist = -1;
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (!c.querySelector('svg') || c.closest('header, form, [role="dialog"]')) continue;
      var r = c.getBoundingClientRect();
      if (!r.width || r.width > 56 || r.height > 56) continue;
      if (Math.abs((r.top + r.bottom) / 2 - y) > 45) continue;
      var dist = Math.abs((r.left + r.right) / 2 - x);
      if (dist > bestDist) { best = c; bestDist = dist; }
    }
    return best;
  }

  function findMoreButton(start) {
    for (var el = start, d = 0; el && el !== document.body && d < 12; el = el.parentElement, d++) {
      var r = el.getBoundingClientRect();
      if (r.height > window.innerHeight * 0.6) break; // gone past the message
      var svgs = el.querySelectorAll('svg[aria-label]');
      for (var i = 0; i < svgs.length; i++) {
        if (MORE_RE.test((svgs[i].getAttribute('aria-label') || '').trim())) {
          return svgs[i].closest('button, [role="button"], a') || svgs[i];
        }
      }
    }
    return null;
  }
  function onThread() { return /^\/direct\/t\//.test(location.pathname); }
  function updateThreadMode() {
    var root = document.documentElement;
    if (!root) return;
    if (!document.getElementById('dmee-thread-css')) {
      var parent = document.head || root;
      var st = document.createElement('style');
      st.id = 'dmee-thread-css';
      st.textContent = THREAD_CSS;
      parent.appendChild(st);
    }
    if (onThread()) { if (!root.hasAttribute('data-dmee-thread')) root.setAttribute('data-dmee-thread', '1'); }
    else if (root.hasAttribute('data-dmee-thread')) root.removeAttribute('data-dmee-thread');
  }
  function hoverChain(el) {
    var opts = { bubbles: true, cancelable: true, view: window };
    for (var up = el, d = 0; up && up !== document.body && d < 10; up = up.parentElement, d++) {
      ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'mousemove'].forEach(function (t) {
        try {
          up.dispatchEvent(t.indexOf('pointer') === 0 ? new PointerEvent(t, opts) : new MouseEvent(t, opts));
        } catch (err) {}
      });
      if (up.getBoundingClientRect().height > window.innerHeight * 0.6) break;
    }
  }
  var msgPress = null;
  document.addEventListener('touchstart', function (e) {
    msgPress = null;
    if (!onThread() || e.touches.length !== 1 || reelViewerOpen()) return;
    var t = e.target;
    if (!t.closest || t.closest('input, textarea, [contenteditable="true"], [role="textbox"]')) return;
    if (t.closest('header, a[href*="/direct/inbox"]')) return;
    var p = e.touches[0];
    msgPress = { x: p.clientX, y: p.clientY, el: t, timer: setTimeout(function () {
      if (!msgPress) return;
      var target = msgPress.el;
      hoverChain(target);
      msgPress.fired = true;
      // Instagram's "..." appears on hover: open it right away (react, reply, copy, unsend...).
      try { var sel0 = window.getSelection(); if (sel0) sel0.removeAllRanges(); } catch (err) {}
      var touchX = msgPress.x, touchY = msgPress.y;
      setTimeout(function () {
        var more = findMoreButton(target) || moreButtonNear(touchX, touchY);
        if (!more) return;
        try { navigator.vibrate && navigator.vibrate(12); } catch (err) {}
        var ev = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        ev.__dmeeReplay = true;
        more.dispatchEvent(ev);
      }, 90);
    }, 420) };
  }, { capture: true, passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!msgPress || !e.touches.length) return;
    var p = e.touches[0];
    if (Math.abs(p.clientX - msgPress.x) > 10 || Math.abs(p.clientY - msgPress.y) > 10) {
      clearTimeout(msgPress.timer); msgPress = null;
    }
  }, { capture: true, passive: true });
  document.addEventListener('touchend', function (e) {
    if (!msgPress) return;
    clearTimeout(msgPress.timer);
    if (msgPress.fired) { e.preventDefault(); swallowClickUntil = Date.now() + 400; }
    msgPress = null;
  }, { capture: true, passive: false });
  document.addEventListener('contextmenu', function (e) { if (onThread()) e.preventDefault(); }, true);
  document.addEventListener('selectionchange', function () {
    if (!onThread()) return;
    var sel = window.getSelection();
    if (!sel || sel.type !== 'Range' || !sel.anchorNode) return;
    var n = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    if (n && n.closest && n.closest('input, textarea, [contenteditable="true"], [role="textbox"]')) return;
    sel.removeAllRanges();
  });

  // ===== Page is drawn: tell Dmee to remove its loading skeleton =====
  // Instagram first shows its logo splash screen while its code starts; Dmee covers that with a
  // shimmer skeleton and removes it as soon as real content (or the login form) is on screen.
  var readySent = false, readyStart = Date.now();
  function splashVisible() {
    var s = document.getElementById('splash-screen');
    if (s) { var r = s.getBoundingClientRect(); if (r.width && r.height && getComputedStyle(s).display !== 'none') return true; }
    // Generic: a lone logo in the middle of an otherwise empty page.
    var b = document.body;
    return !b || (b.innerText || '').trim().length < 3;
  }
  function reportReady() {
    if (readySent) return;
    var content = document.querySelector('main, [role="main"], nav, input[name="username"], input[name="email"], form input[type="password"]');
    var text = document.body ? (document.body.innerText || '').trim().length : 0;
    if ((!content && text < 40) || splashVisible()) {
      if (Date.now() - readyStart < 15000) setTimeout(reportReady, 120);
      return;
    }
    readySent = true;
    // One more frame so the first paint is done before the skeleton fades.
    requestAnimationFrame(function () {
      try { if (window.DmeeAndroid && window.DmeeAndroid.pageReady) window.DmeeAndroid.pageReady(); } catch (err) {}
    });
  }
  setTimeout(reportReady, 50);

  // ===== An Instagram close (X) under Dmee's round corner buttons (e.g. "daily limit" screen) =====
  var CLOSE_RE = /^(close|dismiss|zapri|opusti|schließen|schliessen|cerrar|fermer|chiudi|zatvori|zamknij)$/i;
  var lastCorner = '';
  function reportCornerClose() {
    if (!window.DmeeAndroid || !window.DmeeAndroid.setCornerBusy) return;
    var left = false, right = false, w = window.innerWidth;
    if (!/^\/(direct|stories)\//.test(location.pathname)) {
      var xs = document.querySelectorAll('svg[aria-label], [role="button"][aria-label], button[aria-label]');
      for (var i = 0; i < xs.length; i++) {
        if (!CLOSE_RE.test((xs[i].getAttribute('aria-label') || '').trim())) continue;
        var r = xs[i].getBoundingClientRect();
        if (!r.width || r.top > 100 || r.bottom < 0) continue;
        var cx = r.left + r.width / 2;
        if (cx > w - 80) right = true;
        if (cx < 80) left = true;
      }
    }
    var key = left + ',' + right;
    if (key === lastCorner) return;
    lastCorner = key;
    try { window.DmeeAndroid.setCornerBusy(left, right); } catch (err) {}
  }

  // ===== Chat: camera button next to the message box (like the Instagram app) =====
  var CAM_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff" fill-rule="evenodd"><path d="M9.2 4.5a1.6 1.6 0 0 0-1.4.8L7 6.6H5' +
    'A2.5 2.5 0 0 0 2.5 9.1v8.4A2.5 2.5 0 0 0 5 20h14a2.5 2.5 0 0 0 2.5-2.5V9.1A2.5 2.5 0 0 0 19 6.6h-2l-.8-1.3a1.6 1.6 0 0 0-1.4-.8z' +
    'M12 9.3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>';
  var PHOTO_RE = /(photo|video|image|fotograf|slik|foto|immagin|imagen|bild|zdj)/i;
  function composerParts() {
    var box = document.querySelector('div[role="textbox"][contenteditable="true"], textarea');
    if (!box) return null;
    var br = box.getBoundingClientRect();
    if (!br.width) return null;
    // The rounded composer row around the text box.
    var row = box.parentElement;
    for (var d = 0; row && row !== document.body && d < 8; row = row.parentElement, d++) {
      var rr = row.getBoundingClientRect();
      if (rr.width > window.innerWidth * 0.7 && rr.height < 200) break;
    }
    if (!row || row === document.body) return null;
    // Instagram's emoji button sits left of the text: our camera button takes its place.
    var emoji = null, photo = null;
    var btns = row.querySelectorAll('[role="button"], button');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i], r = b.getBoundingClientRect();
      if (!r.width || r.width > 60) continue;
      if (r.right <= br.left + 4 && !emoji) emoji = b;
      var label = '';
      var sv = b.querySelector('svg[aria-label]');
      if (sv) label = sv.getAttribute('aria-label') || '';
      if (PHOTO_RE.test(label)) photo = b;
    }
    // The whole bar: the outermost box around the text that still looks like a bar (wide, not tall).
    var pill = row;
    for (var el = row.parentElement, k = 0; el && el !== document.body && k < 6; el = el.parentElement, k++) {
      var er = el.getBoundingClientRect();
      if (er.height > 160 || er.width > window.innerWidth + 1) break;
      if (er.width >= window.innerWidth * 0.8 && er.width <= window.innerWidth - 8) pill = el;
    }
    return { row: row, emoji: emoji, photo: photo, pill: pill };
  }
  // The chat partner's username (from the chat header), so Dmee can open this chat in Instagram.
  function chatUsername() {
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var m = /^\/([A-Za-z0-9._]{1,30})\/?$/.exec(links[i].getAttribute('href') || '');
      if (!m || /^(direct|explore|reels|accounts|stories)$/.test(m[1])) continue;
      var r = links[i].getBoundingClientRect();
      if (r.width && r.top < 140) return m[1];
    }
    return '';
  }
  function openCamera(e) {
    e.preventDefault(); e.stopPropagation();
    // Dmee 1.1.3+: straight to Instagram's camera in this chat (view-once photos).
    if (window.DmeeAndroid && window.DmeeAndroid.openChatCamera) {
      try { window.DmeeAndroid.openChatCamera(chatUsername()); } catch (err) {}
      return;
    }
    try { if (window.DmeeAndroid && window.DmeeAndroid.setChatUser) window.DmeeAndroid.setChatUser(chatUsername()); } catch (err) {}
    try { if (window.DmeeAndroid && window.DmeeAndroid.cameraNext) window.DmeeAndroid.cameraNext(); } catch (err) {}
    var parts = composerParts();
    var input = (parts && parts.row.querySelector('input[type="file"]')) ||
      document.querySelector('input[type="file"][accept*="image"]') || document.querySelector('input[type="file"]');
    if (input) input.click();
    else if (parts && parts.photo) parts.photo.click();
  }
  function updateCameraButton() {
    var cam = document.getElementById('dmee-cam');
    var parts = (onThread() && !window.__dmeeHidden && !reelViewerOpen() && !onStories() &&
      !document.querySelector('[role="dialog"]')) ? composerParts() : null;
    if (!parts) { if (cam) cam.style.display = 'none'; return; }
    // The message bar like the Instagram app: a filled pill, no outline, camera inside on the left.
    // Instagram's emoji button (left of the text) makes way for the camera; the keyboard has emojis.
    if (parts.emoji && !parts.emoji.hasAttribute('data-dmee-noemoji')) parts.emoji.setAttribute('data-dmee-noemoji', '1');
    if (!parts.row.hasAttribute('data-dmee-campad')) parts.row.setAttribute('data-dmee-campad', '1');
    if (!parts.pill.hasAttribute('data-dmee-composer')) parts.pill.setAttribute('data-dmee-composer', '1');
    {
      // Remove Instagram's own outlines and fills inside the bar (they drew a second pill).
      var inner = parts.pill.querySelectorAll('div, span, form');
      for (var q = 0; q < inner.length; q++) {
        var c = inner[q];
        if (c.hasAttribute('data-dmee-clear') || c.closest('[role="textbox"], button, [role="button"]')) continue;
        var cs = getComputedStyle(c);
        if (parseFloat(cs.borderTopWidth) > 0 || cs.boxShadow !== 'none' ||
            (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent')) c.setAttribute('data-dmee-clear', '1');
      }
    }
    if (!document.getElementById('dmee-cam-style')) {
      var st = document.createElement('style');
      st.id = 'dmee-cam-style';
      st.textContent =
        // Same look as Dmee's floating menu: dark glass, thin light outline, round.
        // Like the Instagram app: a filled dark-grey pill, no outline, a little gap from the edges.
        '[data-dmee-composer]{background:#262626 !important;border:none !important;border-radius:28px !important;' +
        'box-sizing:border-box !important;padding:2px 6px 2px 4px !important;min-height:0 !important;' +
        'margin:0 10px 8px 10px !important;max-width:calc(100% - 20px) !important;}' +
        '[data-dmee-clear]{border-color:transparent !important;box-shadow:none !important;background:transparent !important;outline:none !important;}' +
        '[data-dmee-noemoji]{display:none !important;}' +
        '[data-dmee-campad]{padding-left:40px !important;box-sizing:border-box !important;}';
      (document.head || document.documentElement).appendChild(st);
    }
    if (!cam) {
      cam = document.createElement('div');
      cam.id = 'dmee-cam';
      cam.setAttribute('role', 'button');
      cam.setAttribute('aria-label', 'Camera');
      cam.innerHTML = CAM_SVG;
      cam.style.cssText = 'position:fixed;z-index:2147483000;width:38px;height:38px;border-radius:50%;' +
        'background:#FF1F2D;display:flex;align-items:center;justify-content:center;' +
        '-webkit-tap-highlight-color:transparent;touch-action:manipulation;';
      cam.addEventListener('click', openCamera, true);
      (document.body || document.documentElement).appendChild(cam);
    }
    // Right at the left end of the bar, like the Instagram app.
    var pr = parts.pill.getBoundingClientRect();
    var r = parts.row.getBoundingClientRect();
    cam.style.left = Math.round(pr.left + 7) + 'px';
    // A tall bar (photo preview, several lines): stay next to the last line.
    if (r.height > 64) r = { top: r.bottom - 52, height: 52 };
    cam.style.top = Math.round(r.top + r.height / 2 - 19) + 'px';
    // Needs Dmee's Instagram lock: dimmed while it's off (a tap explains why).
    var on = true;
    try { if (window.DmeeAndroid && window.DmeeAndroid.isLockOn) on = window.DmeeAndroid.isLockOn(); } catch (err) {}
    cam.style.opacity = on ? '1' : '0.4';
    cam.style.display = 'flex';
  }
  window.addEventListener('resize', function () { setTimeout(updateCameraButton, 50); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', function () { setTimeout(updateCameraButton, 50); });


  // ===== Home tab: posts only from the accounts YOU added (no algorithm, no endless feed) =====
  // Accounts are added with the "+ Add to feed" button on their profile. Dmee keeps the list;
  // the posts are loaded from Instagram's own website data, newest first, last 3 weeks only.
  var FEED_APP_ID = '936619743392459';
  var feedState = { loading: false, key: '', items: null };
  function feedText(k, fallback) {
    try {
      if (!window.__dmeeFeedStrings && window.DmeeAndroid && window.DmeeAndroid.feedStrings)
        window.__dmeeFeedStrings = JSON.parse(window.DmeeAndroid.feedStrings());
    } catch (err) {}
    return (window.__dmeeFeedStrings && window.__dmeeFeedStrings[k]) || fallback;
  }
  function feedAccounts() {
    try { return JSON.parse(window.DmeeAndroid.getFeedAccounts()) || []; } catch (err) { return null; }
  }
  function escapeHtml(t) {
    return String(t || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function timeAgo(sec) {
    var d = Math.max(0, Date.now() / 1000 - sec);
    if (d < 3600) return Math.max(1, Math.round(d / 60)) + 'm';
    if (d < 86400) return Math.round(d / 3600) + 'h';
    return Math.round(d / 86400) + 'd';
  }
  function dmeeLog(msg) {
    try { if (window.DmeeAndroid && window.DmeeAndroid.log) window.DmeeAndroid.log(String(msg)); } catch (err) {}
  }
  function igHeaders() {
    var m = /(?:^|;\s*)csrftoken=([^;]+)/.exec(document.cookie || '');
    return { 'X-IG-App-ID': FEED_APP_ID, 'X-Requested-With': 'XMLHttpRequest', 'X-ASBD-ID': '129477',
      'X-CSRFToken': m ? m[1] : '', 'Accept': 'application/json' };
  }
  function igGet(url) {
    return fetch(url, { credentials: 'include', headers: igHeaders() }).then(function (r) {
      dmeeLog('feed ' + r.status + ' ' + url.split('?')[0]);
      if (r.status === 429 || r.status === 401) {
        // Instagram says "slow down": no feed requests for 15 minutes.
        try { localStorage.setItem('dmee-feed-pause', String(Date.now() + 10 * 60 * 1000)); } catch (err) {}
      }
      var ct = r.headers.get('content-type') || '';
      return (r.ok && ct.indexOf('json') >= 0) ? r.json() : null;
    }).catch(function (e) { dmeeLog('feed error ' + e); return null; });
  }
  function postFromItem(it, user) {
    var media = (it.carousel_media && it.carousel_media[0]) || it;
    var cands = (media.image_versions2 && media.image_versions2.candidates) || [];
    var best = cands[0] || {};
    return {
      user: user.username, pic: user.profile_pic_url, code: it.code, img: best.url,
      w: best.width || it.original_width || 1, h: best.height || it.original_height || 1,
      t: it.taken_at, video: it.media_type === 2, many: it.media_type === 8,
      caption: (it.caption && it.caption.text) || ''
    };
  }
  function loadAccount(user) {
    var cacheKey = 'dmee-feed2-' + user;
    try {
      var c = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (c && Date.now() - c.t < 2 * 60 * 60 * 1000) return Promise.resolve(c.posts); // 2 h: gentle on Instagram
      if (Date.now() < +(localStorage.getItem('dmee-feed-pause') || 0)) {
        dmeeLog('feed paused ' + Math.round((+localStorage.getItem('dmee-feed-pause') - Date.now()) / 60000) + ' more min ' + user);
        feedState.paused = true;
        return Promise.resolve(c ? c.posts : []);
      }
    } catch (err) {}
    var since = Date.now() / 1000 - 21 * 86400;
    return Promise.resolve().then(function () {
      if (Date.now() < +(localStorage.getItem('dmee-feed-pause') || 0)) return null;
      return igGet('/api/v1/users/web_profile_info/?username=' + encodeURIComponent(user)).then(function (j) {
      var u = j && j.data && j.data.user;
      if (!u) return null;
      var edges = (u.edge_owner_to_timeline_media && u.edge_owner_to_timeline_media.edges) || [];
      var posts = [];
      for (var i = 0; i < edges.length && posts.length < 6; i++) {
        var n = edges[i].node || {};
        if (!n.shortcode || (n.taken_at_timestamp || 0) < since) continue;
        var cap = n.edge_media_to_caption && n.edge_media_to_caption.edges && n.edge_media_to_caption.edges[0];
        posts.push({
          user: u.username, pic: u.profile_pic_url, code: n.shortcode, img: n.display_url || n.thumbnail_src,
          w: (n.dimensions && n.dimensions.width) || 1, h: (n.dimensions && n.dimensions.height) || 1,
          t: n.taken_at_timestamp, video: !!n.is_video, many: n.__typename === 'GraphSidecar',
          caption: cap ? cap.node.text : ''
        });
      }
      if (edges.length || !u.id) return posts;
      // Newer Instagram: the posts aren't in the profile data any more; ask for the account's posts.
      return igGet('/api/v1/feed/user/' + u.id + '/?count=12').then(function (f) {
        var items = (f && f.items) || [];
        var out = [];
        for (var k = 0; k < items.length && out.length < 6; k++) {
          if ((items[k].taken_at || 0) < since || !items[k].code) continue;
          out.push(postFromItem(items[k], { username: u.username, profile_pic_url: u.profile_pic_url }));
        }
        return out;
      });
      });
    }).then(function (posts) {
      if (!posts) { dmeeLog('feed ' + user + ': not loaded'); return []; } // not cached: try again later
      dmeeLog('feed ' + user + ': ' + posts.length + ' posts');
      try { localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), posts: posts })); } catch (err) {}
      return posts;
    }).catch(function (e) { dmeeLog('feed error ' + user + ' ' + e); return []; });
  }
  function feedBox() {
    var box = document.getElementById('dmee-feed');
    if (!box) {
      box = document.createElement('div');
      box.id = 'dmee-feed';
      // Above everything of Instagram's page (taps must never reach the stories under it).
      box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147480000;overflow-y:auto;' +
        '-webkit-overflow-scrolling:touch;background:#000;padding:4px 0 120px;box-sizing:border-box;' +
        'font-family:-apple-system,system-ui,Roboto,sans-serif;color:#fff;';
      box.addEventListener('scroll', function () { reportAtTop(box); playFeedVideos(); }, { passive: true });
      (document.body || document.documentElement).appendChild(box);
    }
    return box;
  }
  // ---- One post, drawn like Instagram: header, swipeable photos, actions, likes, caption, comments ----
  var ICON = {
    heart: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" stroke-width="1.9" stroke-linejoin="round"><path d="M12 20.6C11.6 20.6 3 15.2 3 9.2 3 6.3 5.2 4 8 4c1.7 0 3.2.9 4 2.3C12.8 4.9 14.3 4 16 4c2.8 0 5 2.3 5 5.2 0 6-8.6 11.4-9 11.4z"/></svg>',
    heartOn: '<svg viewBox="0 0 24 24" width="26" height="26" fill="#FF3040" stroke="#FF3040" stroke-width="1.9" stroke-linejoin="round"><path d="M12 20.6C11.6 20.6 3 15.2 3 9.2 3 6.3 5.2 4 8 4c1.7 0 3.2.9 4 2.3C12.8 4.9 14.3 4 16 4c2.8 0 5 2.3 5 5.2 0 6-8.6 11.4-9 11.4z"/></svg>',
    comment: '<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="#fff" stroke-width="1.9" stroke-linejoin="round"><path d="M20.7 16.7A9 9 0 1 0 17 20.4L21.5 21.5z"/></svg>',
    share: '<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="#fff" stroke-width="1.9" stroke-linejoin="round"><path d="M22 3 9.2 10.1M22 3l-7 19-4.4-9.4L2 9z"/></svg>',
    save: '<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="#fff" stroke-width="1.9" stroke-linejoin="round"><path d="M19 21l-7-6-7 6V3h14z"/></svg>',
    saveOn: '<svg viewBox="0 0 24 24" width="25" height="25" fill="#fff" stroke="#fff" stroke-width="1.9" stroke-linejoin="round"><path d="M19 21l-7-6-7 6V3h14z"/></svg>',
    muted: '<svg viewBox="0 0 24 24" width="14" height="14" fill="#fff"><path d="M3 9v6h4l5 4V5L7 9zm13.6 3 2.7-2.7-1.2-1.2-2.7 2.7-2.7-2.7-1.2 1.2 2.7 2.7-2.7 2.7 1.2 1.2 2.7-2.7 2.7 2.7 1.2-1.2z"/></svg>',
    sound: '<svg viewBox="0 0 24 24" width="14" height="14" fill="#fff"><path d="M3 9v6h4l5 4V5L7 9zm11.5 3A4.5 4.5 0 0 0 12 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>'
  };
  var feedMuted = true;
  function fmtCount(n) {
    n = +n || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (n >= 1e4) return Math.round(n / 1e3) + 'K';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }
  function postCard(p) {
    var ratio = Math.min(1.25, Math.max(0.8, p.h / p.w));
    var slides = (p.slides && p.slides.length) ? p.slides : [{ u: p.img, v: p.video }];
    var media = '';
    for (var s = 0; s < slides.length; s++) {
      var vs = slides[s].m || '';
      media += '<div style="flex:0 0 100%;position:relative;scroll-snap-align:start;background:#111">' +
        (vs ? '<video class="dmee-vid" src="' + escapeHtml(vs) + '" poster="' + escapeHtml(slides[s].u) + '" muted playsinline loop ' +
          'preload="none" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>' +
          '<div class="dmee-mute" style="position:absolute;right:10px;bottom:10px;width:26px;height:26px;border-radius:50%;' +
          'background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;pointer-events:none">' +
          (feedMuted ? ICON.muted : ICON.sound) + '</div>' :
        '<img src="' + escapeHtml(slides[s].u) + '" loading="lazy" referrerpolicy="no-referrer" draggable="false" ' +
        'style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">' +
        (slides[s].v ? '<div style="position:absolute;top:12px;right:12px;font-size:16px;opacity:.9">&#9654;</div>' : '')) + '</div>';
    }
    var dots = '';
    if (slides.length > 1) {
      for (var d = 0; d < slides.length; d++)
        dots += '<span style="width:' + (slides.length > 6 ? 5 : 6) + 'px;height:' + (slides.length > 6 ? 5 : 6) +
          'px;border-radius:50%;background:' + (d ? '#555' : '#0095f6') + '"></span>';
      dots = '<div class="dmee-dots" style="display:flex;gap:4px;justify-content:center;position:absolute;left:0;right:0;top:12px">' + dots + '</div>';
    }
    var counter = slides.length > 1 ? '<div class="dmee-count" style="position:absolute;top:12px;right:12px;background:rgba(0,0,0,.6);' +
      'border-radius:12px;padding:3px 9px;font-size:12px;font-weight:600">1/' + slides.length + '</div>' : '';
    var cap = p.caption ? '<div class="dmee-cap" data-act="more" style="padding:6px 14px 0;font-size:14px;line-height:1.4;color:#f5f5f5;' +
      'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line"><b>' +
      escapeHtml(p.user) + '</b> ' + escapeHtml(p.caption) + '</div>' : '';
    return '<div class="dmee-post" data-code="' + escapeHtml(p.code) + '" data-id="' + escapeHtml(p.id || '') +
      '" data-liked="' + (p.liked ? 1 : 0) + '" data-saved="' + (p.saved ? 1 : 0) + '" data-likes="' + (+p.likes || 0) + '" style="margin-bottom:26px">' +
      // header
      '<div style="display:flex;align-items:center;gap:10px;padding:8px 14px">' +
      '<a href="/' + escapeHtml(p.user) + '/" style="display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none">' +
      '<img src="' + escapeHtml(p.pic) + '" referrerpolicy="no-referrer" style="width:32px;height:32px;border-radius:50%;object-fit:cover;background:#222">' +
      '<span style="font-weight:600;font-size:14px">' + escapeHtml(p.user) + '</span></a>' +
      '<span style="color:#8e8e93;font-size:14px">&middot; ' + timeAgo(p.t) + '</span></div>' +
      // photos
      '<div style="position:relative;width:100%;padding-top:' + (ratio * 100).toFixed(2) + '%">' +
      '<div class="dmee-media" style="position:absolute;inset:0;display:flex;overflow-x:auto;scroll-snap-type:x mandatory;' +
      '-webkit-overflow-scrolling:touch;scrollbar-width:none">' + media + '</div>' + counter +
      '<div class="dmee-bigheart" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(0);opacity:0;' +
      'transition:transform .25s cubic-bezier(.2,1.6,.4,1),opacity .25s;pointer-events:none">' +
      ICON.heartOn.replace('width="26" height="26"', 'width="96" height="96"') + '</div></div>' +
      (dots ? '<div style="position:relative;height:14px;pointer-events:none">' + dots.replace('top:12px', 'top:8px') + '</div>' : '') +
      // actions: like / comment / share ... save
      '<div style="display:flex;align-items:center;padding:' + (dots ? '0' : '8px') + ' 12px 0;gap:16px">' +
      '<div data-act="like" style="display:flex;align-items:center;gap:6px"><span class="dmee-heart" style="display:flex">' + (p.liked ? ICON.heartOn : ICON.heart) +
      '</span><span class="dmee-likes" style="font-weight:600;font-size:14px">' + fmtCount(p.likes) + '</span></div>' +
      '<div data-act="comment" style="display:flex;align-items:center;gap:6px">' + ICON.comment +
      '<span style="font-weight:600;font-size:14px">' + fmtCount(p.comments) + '</span></div>' +
      '<div data-act="share">' + ICON.share + '</div>' +
      '<div data-act="save" class="dmee-save" style="margin-left:auto">' + (p.saved ? ICON.saveOn : ICON.save) + '</div></div>' +
      cap +
      (p.comments ? '<div data-act="comment" style="padding:6px 14px 0;font-size:14px;color:#8e8e93">' +
        escapeHtml(feedText('view_comments', 'View all %d comments').replace('%d', fmtCount(p.comments))) + '</div>' : '') +
      '</div>';
  }
  function setLikeUi(post, liked) {
    var n = Math.max(0, (+post.getAttribute('data-likes') || 0) + (liked ? 1 : -1));
    post.setAttribute('data-liked', liked ? 1 : 0);
    post.setAttribute('data-likes', n);
    var h = post.querySelector('.dmee-heart'); if (h) h.innerHTML = liked ? ICON.heartOn : ICON.heart;
    var c = post.querySelector('.dmee-likes'); if (c) c.textContent = fmtCount(n);
  }
  function toggleLike(post, forceLike) {
    var liked = post.getAttribute('data-liked') === '1';
    if (forceLike && liked) return;
    var want = forceLike ? true : !liked;
    var id = post.getAttribute('data-id'), code = post.getAttribute('data-code');
    setLikeUi(post, want);
    // Instagram's website has no "like" request any more: Dmee presses the real like button on
    // the post's page (invisible) and tells us whether it worked.
    try { window.DmeeAndroid.likePost(code, want); } catch (err) { setLikeUi(post, !want); }
  }
  window.__dmeeLikeResult = function (code, ok, liked) {
    var post = document.querySelector('#dmee-feed .dmee-post[data-code="' + code + '"]');
    if (!post) return;
    if ((post.getAttribute('data-liked') === '1') !== liked) setLikeUi(post, liked);
    dmeeLog('like ' + code + ' ok=' + ok + ' liked=' + liked);
  };
  // Save: like the heart, Dmee presses Instagram's own Save button on the (invisible) post page.
  function setSaveUi(post, saved) {
    post.setAttribute('data-saved', saved ? 1 : 0);
    var b = post.querySelector('.dmee-save'); if (b) b.innerHTML = saved ? ICON.saveOn : ICON.save;
  }
  function toggleSave(post) {
    var want = post.getAttribute('data-saved') !== '1';
    setSaveUi(post, want);
    try { window.DmeeAndroid.savePost(post.getAttribute('data-code'), want); } catch (err) { setSaveUi(post, !want); }
  }
  window.__dmeeSaveResult = function (code, ok, saved) {
    var post = document.querySelector('#dmee-feed .dmee-post[data-code="' + code + '"]');
    if (post && (post.getAttribute('data-saved') === '1') !== saved) setSaveUi(post, saved);
    dmeeLog('save ' + code + ' ok=' + ok + ' saved=' + saved);
  };
  // Videos: the one you're looking at plays (muted, like Instagram); tap it for sound.
  function playFeedVideos() {
    var box = document.getElementById('dmee-feed');
    var vids = box ? box.querySelectorAll('video.dmee-vid') : [];
    if (!vids.length) return;
    var on = box.style.display !== 'none' && !window.__dmeeHidden, best = null, bestArea = 0;
    var vh = window.innerHeight, vw = window.innerWidth;
    for (var i = 0; i < vids.length; i++) {
      var r = vids[i].getBoundingClientRect();
      var w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
      var h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      var a = (w * h) / Math.max(1, r.width * r.height);
      if (on && a > 0.6 && a > bestArea) { best = vids[i]; bestArea = a; }
    }
    for (var k = 0; k < vids.length; k++) {
      var v = vids[k];
      if (v === best) {
        v.muted = feedMuted;
        if (v.paused) { if (v.preload !== 'auto') v.preload = 'auto'; var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
      } else if (!v.paused) v.pause();
    }
  }
  function toggleFeedSound() {
    feedMuted = !feedMuted;
    var vids = document.querySelectorAll('#dmee-feed video.dmee-vid');
    for (var i = 0; i < vids.length; i++) vids[i].muted = feedMuted;
    var m = document.querySelectorAll('#dmee-feed .dmee-mute');
    for (var j = 0; j < m.length; j++) m[j].innerHTML = feedMuted ? ICON.muted : ICON.sound;
  }
  function bigHeart(post) {
    var h = post.querySelector('.dmee-bigheart'); if (!h) return;
    h.style.opacity = '1'; h.style.transform = 'translate(-50%,-50%) scale(1)';
    setTimeout(function () { h.style.opacity = '0'; h.style.transform = 'translate(-50%,-50%) scale(0)'; }, 700);
  }
  var lastMediaTap = 0;
  document.addEventListener('click', function (e) {
    var post = e.target.closest && e.target.closest('#dmee-feed .dmee-post');
    if (!post) return;
    if (e.target.closest('a')) return; // profile link: normal navigation
    e.preventDefault();
    var act = e.target.closest('[data-act]');
    var a = act ? act.getAttribute('data-act') : (e.target.closest('.dmee-media') ? 'media' : '');
    if (a === 'like') toggleLike(post, false);
    else if (a === 'comment' || a === 'share') {
      try { window.DmeeAndroid.openPostSheet(post.getAttribute('data-code'), a); }
      catch (err) { location.href = '/p/' + post.getAttribute('data-code') + '/'; }
    }
    else if (a === 'save') toggleSave(post);
    else if (a === 'more') { act.style.webkitLineClamp = 'unset'; act.style.display = 'block'; }
    else if (a === 'media') {
      // Double-tap the photo to like (single tap does nothing, like Instagram).
      var now = Date.now();
      clearTimeout(window.__dmeeTapT);
      if (now - lastMediaTap < 320) { bigHeart(post); toggleLike(post, true); lastMediaTap = 0; }
      else {
        lastMediaTap = now;
        // Single tap on a video: sound on/off (after waiting to see it's not a double tap).
        var slide = e.target.closest('.dmee-media > div');
        if (slide && slide.querySelector('video.dmee-vid')) window.__dmeeTapT = setTimeout(toggleFeedSound, 330);
      }
    }
  }, true);
  // Swiping photos: dots + "2/5" follow along.
  document.addEventListener('scroll', function (e) {
    var m = e.target;
    if (!m || !m.classList || !m.classList.contains('dmee-media')) return;
    var post = m.closest('.dmee-post'); if (!post) return;
    var idx = Math.round(m.scrollLeft / Math.max(1, m.clientWidth));
    var dots = post.querySelectorAll('.dmee-dots span');
    for (var k = 0; k < dots.length; k++) dots[k].style.background = k === idx ? '#0095f6' : '#555';
    var c = post.querySelector('.dmee-count'); if (c) c.textContent = (idx + 1) + '/' + dots.length;
    playFeedVideos();
  }, true);

  function renderFeed(box, accounts) {
    var items = feedState.items || [];
    var html = '';
    if (!accounts.length) {
      html = '<div style="padding:40px 28px;text-align:center;color:#a8a8ad;font-size:15px;line-height:1.45">' +
        '<div style="font-size:19px;font-weight:700;color:#fff;margin-bottom:8px">' +
        escapeHtml(feedText('empty_title', 'Your feed is empty')) + '</div>' +
        escapeHtml(feedText('empty_text', "Open someone's profile and tap + Add to feed. Only their posts show up here, nothing else.")) +
        '</div>';
    } else if (feedState.loading && !items.length) {
      for (var s = 0; s < 2; s++) {
        html += '<div style="padding:10px 14px"><div class="dmee-sk" style="height:12px;width:40%;border-radius:6px"></div></div>' +
          '<div class="dmee-sk" style="width:100%;aspect-ratio:1/1"></div>';
      }
    } else {
      for (var i = 0; i < items.length; i++) html += postCard(items[i]);
      html += '<div style="padding:28px 20px;text-align:center;color:#8e8e93;font-size:14px">' +
        (items.length ? '&#10003; ' + escapeHtml(feedText('caught_up', "You're all caught up")) :
          feedState.paused ? escapeHtml(feedText('paused', 'Instagram needs a short break. Posts load again in a few minutes.')) :
          escapeHtml(feedText('no_posts', 'No new posts in the last 3 weeks'))) + '</div>';
    }
    box.innerHTML = html;
    setTimeout(playFeedVideos, 50);
  }
  // Dmee loads the posts itself (invisible profile pages, gentle on Instagram) and hands them over.
  function readFeed() {
    var items = [], loading = false;
    try { items = JSON.parse(window.DmeeAndroid.getFeedPosts()) || []; } catch (err) {}
    try { loading = !!window.DmeeAndroid.feedLoading(); } catch (err) {}
    feedState.items = items;
    feedState.loading = loading;
    feedState.paused = false;
    var box = document.getElementById('dmee-feed');
    var accounts = feedAccounts();
    if (box && accounts) renderFeed(box, accounts);
  }
  function loadFeed(accounts, force) {
    feedState.key = accounts.join(',');
    try { window.DmeeAndroid.refreshFeed(!!force); } catch (err) {}
    readFeed();
  }
  window.__dmeeFeedRefresh = function () { readFeed(); };
  var lastFeedWhy = '';
  function updateFeed(force) {
    var box = document.getElementById('dmee-feed');
    var accounts = (location.pathname === '/' && !window.__dmeeHidden) ? feedAccounts() : null;
    if (location.pathname === '/') {
      var why = 'hidden=' + !!window.__dmeeHidden + ' accounts=' + (accounts ? accounts.length : 'none') +
        ' stories=' + document.documentElement.hasAttribute('data-dmee-stories');
      if (why !== lastFeedWhy) { lastFeedWhy = why; dmeeLog('feed state ' + why); }
    }
    if (!accounts || !document.documentElement.hasAttribute('data-dmee-stories')) {
      if (box) box.style.display = 'none';
      document.documentElement.removeAttribute('data-dmee-feedon');
      return;
    }
    var tray = findStoryTray();
    var top = tray ? Math.max(0, tray.getBoundingClientRect().bottom + 6) : 140;
    box = feedBox();
    // The page behind the feed must not scroll (it made the stories row jump).
    if (!document.documentElement.hasAttribute('data-dmee-feedon')) {
      document.documentElement.setAttribute('data-dmee-feedon', '1');
      window.scrollTo(0, 0);
    }
    if (!box.__dmeeTop || Math.abs(box.__dmeeTop - top) > 4) { box.__dmeeTop = top; box.style.top = Math.round(top) + 'px'; }
    box.style.display = 'block';
    if (!document.getElementById('dmee-feed-style')) {
      var st = document.createElement('style');
      st.id = 'dmee-feed-style';
      st.textContent = '@keyframes dmeeShim{0%{background-position:-200px 0}100%{background-position:400px 0}}' +
        '.dmee-sk{background:#1a1a1c linear-gradient(90deg,#1a1a1c 0,#2e2e32 60px,#1a1a1c 120px) no-repeat;' +
        'background-size:200px 100%;animation:dmeeShim 1.3s linear infinite}' +
        'html[data-dmee-feedon],html[data-dmee-feedon] body{overflow:hidden !important;overscroll-behavior:none !important}' +
        '#dmee-feed::-webkit-scrollbar,.dmee-media::-webkit-scrollbar{display:none}' +
        // Instagram's own icon styles must not change our icons (they cut / mirrored the hearts).
        '#dmee-feed svg{display:block;flex:none;overflow:visible;transform:none;max-width:none;max-height:none;position:static}' +
        '#dmee-feed svg path{transform:none;fill-rule:nonzero}' +
        '#dmee-feed .dmee-bigheart svg{width:96px;height:96px}';
      (document.head || document.documentElement).appendChild(st);
    }
    if (force || feedState.key !== accounts.join(',')) { loadFeed(accounts, !!force); renderFeed(box, accounts); }
    else if (!box.firstChild) renderFeed(box, accounts);
  }

  // ===== "+ Add to feed" on someone's profile =====
  var PROFILE_SKIP = /^(direct|accounts|explore|reels|reel|p|tv|stories|notifications|challenge|legal|about|web|api)$/;
  function profileUser() {
    var m = /^\/([A-Za-z0-9._]{1,30})\/?$/.exec(location.pathname);
    if (!m || PROFILE_SKIP.test(m[1])) return null;
    if (reportedUser && m[1].toLowerCase() === String(reportedUser).toLowerCase()) return null;
    return m[1];
  }
  function updateAddButton() {
    var b = document.getElementById('dmee-addfeed');
    var user = (!window.__dmeeHidden && !reelViewerOpen()) ? profileUser() : null;
    var list = user ? feedAccounts() : null;
    if (!user || !list) { if (b) b.style.display = 'none'; return; }
    if (!b) {
      b = document.createElement('div');
      b.id = 'dmee-addfeed';
      b.setAttribute('role', 'button');
      b.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:104px;z-index:2147483000;' +
        'padding:11px 20px;border-radius:999px;font:600 15px -apple-system,system-ui,Roboto,sans-serif;' +
        'box-shadow:0 6px 20px rgba(0,0,0,.45);-webkit-tap-highlight-color:transparent;white-space:nowrap;';
      b.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var u = b.getAttribute('data-user');
        try { window.DmeeAndroid.toggleFeedAccount(u); } catch (err) {}
        b.removeAttribute('data-state');
        updateAddButton();
      }, true);
      (document.body || document.documentElement).appendChild(b);
    }
    var inFeed = list.map(function (x) { return x.toLowerCase(); }).indexOf(user.toLowerCase()) >= 0;
    var state = user + ':' + inFeed;
    if (b.getAttribute('data-state') !== state) {
      b.setAttribute('data-state', state);
      b.setAttribute('data-user', user);
      b.textContent = inFeed ? '✓ ' + feedText('added', 'In your feed') : '+ ' + feedText('add', 'Add to feed');
      b.style.background = inFeed ? 'rgba(28,28,31,0.95)' : '#FF1F2D';
      b.style.color = '#fff';
      b.style.border = inFeed ? '1px solid rgba(255,255,255,0.18)' : '1px solid transparent';
    }
    b.style.display = 'block';
  }

  // ===== Reel: shimmer skeleton until the video really plays =====
  function updateReelSkeleton() {
    var sk = document.getElementById('dmee-reel-sk');
    var v = (!window.__dmeeHidden && reelViewerOpen()) ? mainReelVideo() : null;
    var waiting = v && !(v.readyState >= 3 && v.currentTime > 0.05);
    if (v && !v.__dmeeSkWatch) {
      v.__dmeeSkWatch = true;
      v.__dmeeSkSince = Date.now();
      v.addEventListener('playing', function () { setTimeout(updateReelSkeleton, 30); });
      v.addEventListener('timeupdate', function () { if (document.getElementById('dmee-reel-sk')) updateReelSkeleton(); });
    }
    if (waiting && Date.now() - (v.__dmeeSkSince || 0) > 8000) waiting = false; // never forever
    if (!waiting) { if (sk) sk.style.display = 'none'; return; }
    if (!sk) {
      sk = document.createElement('div');
      sk.id = 'dmee-reel-sk';
      sk.style.cssText = 'position:fixed;inset:0;z-index:2147482000;pointer-events:none;background:#000;';
      sk.innerHTML =
        '<div class="dmee-sk" style="position:absolute;left:0;right:0;top:12%;bottom:22%;border-radius:0"></div>' +
        '<div class="dmee-sk" style="position:absolute;left:16px;bottom:15%;width:36px;height:36px;border-radius:50%"></div>' +
        '<div class="dmee-sk" style="position:absolute;left:62px;bottom:calc(15% + 12px);width:40%;height:12px;border-radius:6px"></div>' +
        '<div class="dmee-sk" style="position:absolute;left:16px;bottom:11%;width:70%;height:11px;border-radius:6px"></div>' +
        '<div class="dmee-sk" style="position:absolute;right:16px;bottom:30%;width:30px;height:30px;border-radius:50%"></div>' +
        '<div class="dmee-sk" style="position:absolute;right:16px;bottom:calc(30% + 56px);width:30px;height:30px;border-radius:50%"></div>';
      (document.body || document.documentElement).appendChild(sk);
    }
    if (!document.getElementById('dmee-sk-style')) {
      var st = document.createElement('style');
      st.id = 'dmee-sk-style';
      st.textContent = '@keyframes dmeeShim{0%{background-position:-200px 0}100%{background-position:400px 0}}' +
        '.dmee-sk{background:#1a1a1c linear-gradient(90deg,#1a1a1c 0,#2e2e32 60px,#1a1a1c 120px) no-repeat;' +
        'background-size:200px 100%;animation:dmeeShim 1.3s linear infinite}';
      (document.head || document.documentElement).appendChild(st);
    }
    sk.style.display = 'block';
  }

  // ===== Vanish mode messages: instagram.com can't show them -> offer to open the chat in Instagram =====
  var VANISH_RE = /(vanish mode|disappearing messages|can.t be shown here|isn.t supported|izginjajo|nicht unterst|modo temporal|mode éphémère|modalità effimera|nestajuć|znikając)/i;
  function updateVanishBanner() {
    var b = document.getElementById('dmee-vanish');
    var show = false;
    if (onThread() && !window.__dmeeHidden && window.DmeeAndroid && window.DmeeAndroid.openChatInApp) {
      var main = document.querySelector('main, [role="main"]') || document.body;
      show = VANISH_RE.test((main && main.innerText || '').slice(-4000));
    }
    if (!show) { if (b) b.style.display = 'none'; return; }
    if (!b) {
      b = document.createElement('div');
      b.id = 'dmee-vanish';
      b.setAttribute('role', 'button');
      b.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:78px;z-index:2147483000;' +
        'padding:9px 16px;border-radius:999px;background:rgba(28,28,31,0.95);border:1px solid rgba(255,255,255,0.18);' +
        'color:#fff;font:600 13px -apple-system,system-ui,Roboto,sans-serif;white-space:nowrap;' +
        'box-shadow:0 6px 20px rgba(0,0,0,.45);-webkit-tap-highlight-color:transparent;';
      b.textContent = feedText('vanish', 'Vanish mode messages only show in Instagram') + '  ›';
      b.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        try { window.DmeeAndroid.openChatInApp(chatUsername()); } catch (err) {}
      }, true);
      (document.body || document.documentElement).appendChild(b);
    }
    b.style.display = 'block';
  }

  // A tab in the background: keep hiding the feed etc., skip everything that only matters on screen.
  var lastHiddenRun = 0;
  function runHidden() {
    if (Date.now() - lastHiddenRun < 1000) return;
    lastHiddenRun = Date.now();
    hideInstagramNavBar();
    removeSuggestedReels();
    reportUsername();
    hideProfileExtras();
    hideAppPromos();
    hideStoryPlaceholder();
    isolateStories();
    hideDiscoverOnActivity();
    padForTabBar();
    pauseAllMedia();
  }

  function run() {
    addStyle();
    // Tabs in the background only do the minimum (keeps older phones fast).
    if (window.__dmeeHidden) { runHidden(); return; }
    hideInstagramNavBar();
    hideInboxBackArrow();
    removeSuggestedReels();
    fillReelWidth();
    reportUsername();
    hideProfileExtras();
    hideAppPromos();
    hideStoryPlaceholder();
    isolateStories();
    hideDiscoverOnActivity();
    redDots();
    padForTabBar();
    addFeedbackStyle();
    unmuteReel();
    update2xButton();
    reportSearching();
    reportReel();
    fixSqueezedNames();
    hideTopNotices();
    reportCornerClose();
    updateCameraButton();
    updateFeed();
    playFeedVideos();
    updateAddButton();
    updateReelSkeleton();
    updateVanishBanner();
  }

  // Instagram changes the page constantly (videos, lazy images). Running on every change made
  // scrolling stutter, so run at most every 150 ms (and never during a fast scroll frame).
  var scheduled = false, lastRun = 0;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    var wait = Math.max(0, 150 - (Date.now() - lastRun));
    setTimeout(function () {
      requestAnimationFrame(function () {
        scheduled = false;
        lastRun = Date.now();
        run();
      });
    }, wait);
  }

  // At document start the page may not exist yet; start watching as soon as it does.
  function startObserving() {
    if (!document.documentElement) { setTimeout(startObserving, 10); return; }
    run();
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  }
  startObserving();
  // Instagram changes pages without reloading: re-check right away on every page change.
  ['pushState', 'replaceState'].forEach(function (fn) {
    var orig = history[fn];
    history[fn] = function () {
      var r = orig.apply(this, arguments);
      // Feed hiding switches at the same moment as the page (no flash of posts).
      if (location.pathname === '/') document.documentElement.setAttribute('data-dmee-home', '1');
      else document.documentElement.removeAttribute('data-dmee-home');
      setTimeout(run, 0);
      return r;
    };
  });
  window.addEventListener('popstate', function () { setTimeout(run, 0); });
  document.addEventListener('DOMContentLoaded', run);
  // Suggested reels can load without a big DOM change, so also check regularly.
  setInterval(function () {
    if (window.__dmeeHidden) { pauseAllMedia(); return; }
    reportCornerClose();
    updateCameraButton();
    updateFeed();
    playFeedVideos();
    updateAddButton();
    updateReelSkeleton();
    updateVanishBanner();
    unmuteReel();
    update2xButton();
    reportReel();
    fixSqueezedNames();
    hideStoryPlaceholder();
    if (!document.querySelector('video:not(.dmee-vid)')) return;
    removeSuggestedReels();
    fillReelWidth();
  }, 500);
})();
