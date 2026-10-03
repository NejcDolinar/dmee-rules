// dmee-rules-version: 4
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

  document.addEventListener('touchmove', function (e) {
    if (!e.touches.length || !reelViewerOpen()) return;
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
    hideStoryPlaceholder();
    if (!document.querySelector('video')) return;
    removeSuggestedReels();
    fillReelWidth();
  }, 500);
})();
