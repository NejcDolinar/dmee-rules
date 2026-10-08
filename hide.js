// dmee-rules-version: 15
// Injected into instagram.com. Hides every way into the Feed, Reels tab and Explore.
// Instagram's class names change often, so we target link destinations instead.
(function () {
  if (window.__dmeeInstalled) return;
  window.__dmeeInstalled = true;

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
    var vids = document.querySelectorAll('video');
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
    var vids = document.querySelectorAll('video');
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
    var vids = document.querySelectorAll('video');
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
    var blocked = !onTabRoot || reelViewerOpen() || inHorizontalScroller(e.target);
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
    var vids = document.querySelectorAll('video');
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

  function isolateStories() {
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
        if (c === el || c.hasAttribute('data-dmee-iso')) continue;
        // Already hidden by another Dmee rule (e.g. Instagram's bottom bar): leave it hidden for good.
        if (c.hasAttribute('data-dmee-hidden') || c.hasAttribute('data-dmee-discover') ||
            c.hasAttribute('data-dmee-promo') || c.hasAttribute('data-dmee-sugg')) continue;
        if (c.tagName === 'SCRIPT' || c.tagName === 'STYLE' || c.tagName === 'LINK') continue;
        c.style.setProperty('display', 'none', 'important');
        c.setAttribute('data-dmee-iso', '1');
      }
    }
    tray.style.setProperty('padding-top', '12px', 'important');
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
    var vids = document.querySelectorAll('video');
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
    'html.dmee-reel, html.dmee-reel * { -webkit-user-select: none !important; user-select: none !important;' +
    ' -webkit-touch-callout: none !important; }' +
    'html.dmee-reel input, html.dmee-reel textarea, html.dmee-reel [contenteditable="true"] {' +
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
      root.classList.add('dmee-reel');
    } else if (root.classList.contains('dmee-reel')) {
      root.classList.remove('dmee-reel');
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
    if (hidden) pauseAllMedia();
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

  function run() {
    addStyle();
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
    if (window.__dmeeHidden) pauseAllMedia();
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
    history[fn] = function () { var r = orig.apply(this, arguments); setTimeout(run, 0); return r; };
  });
  window.addEventListener('popstate', function () { setTimeout(run, 0); });
  document.addEventListener('DOMContentLoaded', run);
  // Suggested reels can load without a big DOM change, so also check regularly.
  setInterval(function () {
    if (window.__dmeeHidden) pauseAllMedia();
    unmuteReel();
    update2xButton();
    reportReel();
    fixSqueezedNames();
    hideStoryPlaceholder();
    if (!document.querySelector('video')) return;
    removeSuggestedReels();
    fillReelWidth();
  }, 500);
})();
