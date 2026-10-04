/* ==========================================================================
   webflux – Sektion „Mehr als nur eine Website“
   1) Umschalten zwischen Design / Code / Dashboard: Der Punkt im Glas-Schalter
      (data-tab) schaltet Zeile, Video und Text mit gleichem data-panel um.
   2) Ein- und Ausfahren des Schalters. Der Schalter klebt unten am Bildschirm
      (position: sticky in css/style.css) und rückt erst an seinen Platz unter dem
      Video, wenn man dorthin scrollt.
      Vorwärts, sobald die Sektion ins Bild kommt:
        is-seed (unsichtbar) -> is-grow (ein Punkt wächst) -> is-open (wird nach
        links und rechts breit, Punkte erscheinen gestaffelt) -> is-ready (frei).
      Rückwärts, sobald die Sektion beim Hochscrollen wieder verschwindet:
        is-closing + is-grow (Punkte weg, Pille schrumpft zum Punkt) -> is-seed.
      Die Zielbreite rechnet css/style.css aus der Punktzahl (--count) aus; nach
      dem Einfahren bekommt der Schalter wieder width: auto, damit die Punkte beim
      Hover breiter werden können. Die Breite jedes Punkts mit sichtbarem Namen
      (--w) wird hier gemessen.
   3) Videos und automatischer Durchlauf.
      Videos (.more__video) laufen stumm, ohne Bedienelemente und ohne Schleife; der
      Nutzer kann sie nicht anhalten (pointer-events: none). Sie starten erst, wenn der
      Nutzer sie wirklich sieht („watching“): Sektion eingefahren, Bühne eingeblendet,
      mindestens 55 % der Bühne im Bild, Tab sichtbar. Verlässt die Bühne das Bild,
      pausiert das Video (und damit der Durchlauf) und läuft beim Zurückkommen weiter.
      Ein neues Panel (oder die Sektion beim erneuten Hereinscrollen) beginnt vorn.
      Weiterschalten zum nächsten Punkt (nach dem letzten wieder zum ersten):
        - Panel mit Video: sobald das Video zu Ende ist (Ereignis „ended“),
        - Panel ohne Video (Platzhalter): nach SLIDE_MS, pausiert, solange die Maus auf
          der Leiste liegt oder ein Punkt Tastaturfokus hat.
      Ein Video, das nicht laden oder starten kann (Fehler, Autoplay gesperrt), wird wie
      ein Panel ohne Video behandelt, damit der Durchlauf nie hängen bleibt.
      Die Füllung der aktiven Pille ist der Fortschritt (--progress am Schalter, 0 bis 1):
      Abspielposition des Videos bzw. verstrichene Zeit. Bei prefers-reduced-motion gibt
      es weder Füllung noch automatisches Weiterschalten; das Video spielt einmal.
   ========================================================================== */

(function () {
  'use strict';

  var SLIDE_MS   = 13000;  // Zeit pro Punkt beim automatischen Durchlauf, wenn das Panel kein Video hat
  var SEEN_SHARE = 0.55;   // so viel von der Bühne (der Höhe, höchstens des Bildschirms) muss im Bild sein
  var FADE_MS    = 800;    // so lange blendet die Bühne beim ersten Mal ein (css: .more__media)

  var sections = Array.prototype.slice.call(document.querySelectorAll('.more'));
  if (!sections.length) return;
  sections.forEach(initMore);

  function initMore(section) {
    var sw     = section.querySelector('.glass-switch');
    var wrap   = sw ? sw.parentNode : null;
    var items  = Array.prototype.slice.call(section.querySelectorAll('.glass-switch__item'));
    var panels = Array.prototype.slice.call(section.querySelectorAll('[data-panel]'));
    var videos = Array.prototype.slice.call(section.querySelectorAll('.more__video'));
    var stage  = section.querySelector('.more__stage');
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------------------------------------------------------------------
       1) Umschalten
       --------------------------------------------------------------------- */
    function activeIndex() {
      return items.findIndex(function (item) { return item.classList.contains('is-active'); });
    }

    function select(name, focus) {
      var changed = items.some(function (item) {
        return item.classList.contains('is-active') && item.getAttribute('data-tab') !== name;
      });
      items.forEach(function (item) {
        var on = item.getAttribute('data-tab') === name;
        item.classList.toggle('is-active', on);
        item.setAttribute('aria-selected', on ? 'true' : 'false');
        item.tabIndex = on ? 0 : -1;
        if (on && focus) item.focus();
      });
      panels.forEach(function (panel) {
        var on = panel.getAttribute('data-panel') === name;
        panel.classList.toggle('is-active', on);
        panel.setAttribute('aria-hidden', on ? 'false' : 'true');
      });
      syncMedia(changed);   // neues Panel: Video von vorn, Fortschritt auf null
    }

    function next() {
      select(items[(activeIndex() + 1) % items.length].getAttribute('data-tab'), false);
    }

    items.forEach(function (item, n) {
      // Staffelung beim Ein- und Ausfahren: 0 = mittlerer Punkt, 1 = äußere Punkte
      item.style.setProperty('--n', Math.abs(n - (items.length - 1) / 2));
      item.addEventListener('click', function () {
        select(item.getAttribute('data-tab'), false);
      });
    });

    // Pfeiltasten wie bei nativen Tabs
    if (sw) {
      sw.addEventListener('keydown', function (e) {
        var dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        var target = items[(activeIndex() + dir + items.length) % items.length];
        select(target.getAttribute('data-tab'), true);
      });
    }

    if (!sw) return;

    /* ---------------------------------------------------------------------
       2) Ein- und Ausfahren
       --------------------------------------------------------------------- */
    var shown   = false;   // Sektion ist im Bild (Schalter eingefahren oder dabei)
    var settled = false;   // Bühne ist eingeblendet
    var timers  = [];

    function clearTimers() {
      timers.forEach(window.clearTimeout);
      timers = [];
    }

    function later(fn, ms) {
      timers.push(window.setTimeout(fn, ms));
    }

    // Genau die übergebenen Zustandsklassen setzen, alle anderen entfernen
    function setState() {
      sw.classList.remove('is-seed', 'is-grow', 'is-open', 'is-ready', 'is-closing');
      for (var i = 0; i < arguments.length; i++) sw.classList.add(arguments[i]);
    }

    // Breite jedes Punkts mit sichtbarem Namen (für den Hover)
    function measureLabels() {
      items.forEach(function (item) {
        var label = item.querySelector('.glass-switch__label');
        if (label) item.style.setProperty('--w', label.offsetWidth + 'px');
      });
    }

    function prepare() {
      sw.style.setProperty('--count', items.length);   // Zielbreite rechnet das CSS daraus
      measureLabels();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureLabels);
      setState('is-seed');
    }

    // Vorwärts: Punkt wachsen -> breit werden -> frei
    function show() {
      if (shown) return;
      shown = true;
      clearTimers();
      var first = !section.classList.contains('is-in');
      section.classList.add('is-in');   // Text, Video und Beschreibung einblenden (bleibt danach)
      syncMedia(true);                  // Video des aktiven Panels beginnt vorn (gespielt wird erst, wenn man es sieht)

      // Das Video darf erst starten, wenn die Bühne eingeblendet ist – beim ersten Mal also nach der Überblendung
      if (first && !reduceMotion) {
        later(function () { settled = true; updateWatching(); }, FADE_MS);
      } else {
        settled = true;
        updateWatching();
      }

      if (reduceMotion) {
        setState('is-ready');
        wrap.classList.add('is-on');
        ready = true;
        return;
      }

      later(function () {
        setState('is-grow');
        wrap.classList.add('is-on');    // Leuchten dahinter an
      }, 250);
      later(function () { setState('is-open'); }, 250 + 480);
      later(function () {
        setState('is-ready');
        ready = true;                   // ab jetzt zählt die Zeit bei Panels ohne Video
      }, 250 + 480 + 750);
    }

    // Rückwärts: Punkte weg, Pille schrumpft zum Punkt, Punkt verschwindet
    function hide() {
      if (!shown) return;
      shown = false;
      settled = false;
      clearTimers();
      ready = false;
      updateWatching();                 // Video und Durchlauf anhalten
      wrap.classList.remove('is-on');

      if (reduceMotion) {
        setState('is-seed');
        return;
      }

      setState('is-open', 'is-closing');   // Breite wieder fest (= aktuelle Breite), damit sie animierbar ist
      void sw.offsetWidth;                 // Reflow erzwingen, sonst würde der nächste Schritt springen
      setState('is-grow', 'is-closing');
      later(function () { setState('is-seed'); }, 850);
    }

    /* ---------------------------------------------------------------------
       3) Videos und automatischer Durchlauf
       --------------------------------------------------------------------- */
    var ready    = false;   // Schalter fertig eingefahren
    var seen     = false;   // genug von der Bühne ist im Bild
    var watching = false;   // der Nutzer sieht das Video wirklich
    var hovering = false;   // Maus liegt auf der Leiste
    var focused  = false;   // ein Punkt hat sichtbaren Tastaturfokus
    var elapsed  = 0;       // verstrichene Zeit des aktiven Panels ohne Video (ms)
    var lastTick = 0;
    var raf      = 0;

    if (reduceMotion) sw.classList.add('is-static');

    // Video des sichtbaren Panels; ein defektes Video zählt nicht (Panel läuft dann über die Zeit)
    function activeVideo() {
      var screen = section.querySelector('.more__screen.is-active');
      var video = screen && screen.querySelector('.more__video');
      return video && !video.hasAttribute('data-failed') ? video : null;
    }

    function setProgress(p) {
      sw.style.setProperty('--progress', Math.min(1, Math.max(0, p)).toFixed(4));
    }

    function rewind(video) {
      try { video.currentTime = 0; } catch (e) { /* noch nicht geladen: beginnt ohnehin vorn */ }
    }

    function fail(video) {
      video.setAttribute('data-failed', '');
      syncMedia(false);
    }

    // Spielt das Video des aktiven Panels, solange der Nutzer es sieht, und hält alle anderen an.
    // restart: Panel ist neu (oder die Sektion kam neu ins Bild) -> Video und Fortschritt beginnen vorn.
    function syncMedia(restart) {
      var active = activeVideo();
      if (restart) {
        elapsed = 0;
        setProgress(0);
        if (active) rewind(active);
      }
      videos.forEach(function (video) {
        if (video !== active || !watching || (video.ended && !restart)) {
          if (!video.paused) video.pause();
          return;
        }
        var started = video.play();
        if (started && started.catch) {
          started.catch(function (err) {
            // AbortError = durch pause() unterbrochen (normal); gesperrt oder nicht abspielbar -> Panel läuft über die Zeit
            if (err && (err.name === 'NotAllowedError' || err.name === 'NotSupportedError')) fail(video);
          });
        }
      });
      if (watching) startLoop(); else stopLoop();
    }

    // Fortschritt nachführen (und bei Panels ohne Video die Zeit zählen), solange der Nutzer zusieht
    function frame(now) {
      raf = 0;
      if (!watching) return;
      var video = activeVideo();
      if (video) {
        if (video.duration) setProgress(video.currentTime / video.duration);
      } else if (ready && !hovering && !focused) {
        elapsed += Math.min(now - lastTick, 100);   // nach einem Ruckler nicht springen
        setProgress(elapsed / SLIDE_MS);
        if (elapsed >= SLIDE_MS) next();
      }
      lastTick = now;
      if (!raf) raf = window.requestAnimationFrame(frame);   // next() oben kann den Loop über syncMedia schon neu gestartet haben
    }

    function startLoop() {
      if (reduceMotion || raf) return;   // ohne Autoplay gibt es keine Füllung nachzuführen
      lastTick = window.performance.now();
      raf = window.requestAnimationFrame(frame);
    }

    function stopLoop() {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    }

    function updateWatching() {
      var now = shown && settled && seen && !document.hidden;
      if (now === watching) return;
      watching = now;
      syncMedia(false);
    }

    videos.forEach(function (video) {
      video.addEventListener('ended', function () {
        if (video === activeVideo() && !reduceMotion) next();   // Video zu Ende -> nächster Punkt
      });
      video.addEventListener('error', function () { fail(video); });
    });

    sw.addEventListener('mouseenter', function () { hovering = true; });
    sw.addEventListener('mouseleave', function () { hovering = false; });
    sw.addEventListener('focusin', function (e) {
      // Nur echter Tastaturfokus pausiert; nach einem Mausklick bleibt der Fokus zwar auf dem Punkt,
      // soll den Durchlauf aber nicht anhalten
      focused = !!(e.target.matches && e.target.matches(':focus-visible'));
    });
    sw.addEventListener('focusout', function () { focused = false; });
    document.addEventListener('visibilitychange', updateWatching);

    prepare();

    if ('IntersectionObserver' in window) {
      // Sichtbar = die Sektion ragt mindestens 240px ins Bild (der Schalter klebt dann schon unten).
      // Verschwindet sie wieder (Hochscrollen), fährt der Schalter rückwärts ein.
      new IntersectionObserver(function (entries) {
        var en = entries[entries.length - 1];
        if (en.isIntersecting) show(); else hide();
      }, { rootMargin: '0px 0px -240px 0px' }).observe(section);

      // „Gesehen“ = ein großer Teil der Bühne ist im Bild. Als Teil des Bildschirms gerechnet, damit eine Bühne,
      // die höher ist als das Fenster (kleiner Bildschirm), überhaupt als gesehen gelten kann.
      if (stage) {
        var steps = [];
        for (var i = 0; i <= 20; i++) steps.push(i / 20);   // oft genug melden, um die Schwelle sicher zu treffen
        new IntersectionObserver(function (entries) {
          var en = entries[entries.length - 1];
          var viewH = en.rootBounds ? en.rootBounds.height : window.innerHeight;
          var need = Math.min(en.boundingClientRect.height, viewH) * SEEN_SHARE;
          seen = en.isIntersecting && en.intersectionRect.height >= need;
          updateWatching();
        }, { threshold: steps }).observe(stage);
      } else {
        seen = true;
      }
    } else {
      seen = true;
      show();
    }

  }
})();
