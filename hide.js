// dmee-rules-version: 1
// Injected into instagram.com. Hides every way into the Feed, Reels tab and Explore.
// Instagram's class names change often, so we target link destinations instead.
(function () {
  if (window.__dmeeInstalled) return;
  window.__dmeeInstalled = true;

  var STYLE =
    'a[href="/"], a[href="/explore/"], a[href^="/explore/"], a[href="/reels/"] {' +
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
      if (onInbox) {
        btn.style.setProperty('visibility', 'hidden', 'important');
        btn.setAttribute('data-dmee-back', '1');
      } else if (btn.hasAttribute('data-dmee-back')) {
        btn.style.removeProperty('visibility');
        btn.removeAttribute('data-dmee-back');
      }
    }
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

  function removeSuggestedReels() {
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
    var onInbox = /^\/direct\/inbox\/?$/.test(location.pathname);
    var blocked = !onInbox || reelViewerOpen() || inHorizontalScroller(e.target);
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

  function run() {
    addStyle();
    hideInstagramNavBar();
    hideInboxBackArrow();
    removeSuggestedReels();
    fillReelWidth();
  }

  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      run();
    });
  }

  // At document start the page may not exist yet; start watching as soon as it does.
  function startObserving() {
    if (!document.documentElement) { setTimeout(startObserving, 10); return; }
    run();
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  }
  startObserving();
  document.addEventListener('DOMContentLoaded', run);
  // Suggested reels can load without a big DOM change, so also check regularly.
  setInterval(function () { removeSuggestedReels(); fillReelWidth(); }, 500);
})();
