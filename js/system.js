/* ==========================================================================
   webflux – Sektion „Ein System. Zwei Seiten.“
   Die Sektion ist doppelt so hoch wie der Bildschirm und klebt mit ihrer oberen
   Hälfte fest (css/style.css, .sys__sticky). Erst wenn sie mittig im Bild steht
   und festhängt, wird der Strich zwischen „Website“ und „Dashboard“ gezogen –
   rückwärts genauso, beim Hochscrollen zieht er sich wieder zusammen.

   Gerechnet wird hier nur der Fortschritt, gezeichnet wird alles im CSS:
     t = 0..1  Weg innerhalb der Klebestrecke (0 = gerade festgehakt)
     p = 0..1  davon der Teil, in dem der Strich wächst; davor (HOLD_IN) und
               danach (HOLD_OUT) hängt man kurz mit leerem bzw. fertigem Strich
     q = 0..1  derselbe Weg, zum Ende hin weich abgebremst: damit fliegen die
               beiden Wörter von links und rechts herein und stehen genau dann,
               wenn der Strich durch ist
   Beide Werte stehen als --p und --q an der Sektion, damit Strich und Wörter
   sie lesen können.

   Klassen:
     .sys__connect.is-drawing   Strich unterwegs -> Lichtpunkt an der Spitze
     .sys.is-linked             angekommen -> Enden und Wörter leuchten
     .sys.is-in                 Sektion war im Bild -> Überschrift und Wörter
                                blenden ein (bleibt danach)

   Schmal (bis 720 px) stehen die Wörter untereinander; derselbe Wert läuft dann
   von oben nach unten, das steckt komplett in css/style.css.
   ========================================================================== */

(function () {
  'use strict';

  var section = document.querySelector('.sys');
  if (!section) return;

  var connect = section.querySelector('.sys__connect');
  if (!connect) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var HOLD_IN  = 0.15;   // erst kurz nur stehen bleiben ...
  var HOLD_OUT = 0.75;   // ... und am Ende den fertigen Strich kurz stehen lassen

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* ---------------------------------------------------------------------
     Fortschritt rechnen und setzen
     --------------------------------------------------------------------- */
  var ticking = false;

  function update() {
    ticking = false;

    var p = 1;
    if (!reduceMotion) {
      var vh    = window.innerHeight || document.documentElement.clientHeight;
      var range = Math.max(1, section.offsetHeight - vh);        // Strecke, in der die Sektion klebt
      var t     = clamp(-section.getBoundingClientRect().top / range, 0, 1);
      p = clamp((t - HOLD_IN) / (HOLD_OUT - HOLD_IN), 0, 1);
    }

    var q = 1 - (1 - p) * (1 - p);   // gleiches Ziel, nur zum Schluss langsamer

    section.style.setProperty('--p', p.toFixed(4));
    section.style.setProperty('--q', q.toFixed(4));
    connect.classList.toggle('is-drawing', p > 0.002 && p < 0.995);
    section.classList.toggle('is-linked', p > 0.985);
  }

  // Nächster Animationsframe; im versteckten Tab (dort feuern keine Frames)
  // ein kurzer Timer – wie in js/main.js
  function nextFrame(cb) {
    return document.hidden ? window.setTimeout(cb, 16) : window.requestAnimationFrame(cb);
  }

  function request() {
    if (ticking) return;
    ticking = true;
    nextFrame(update);
  }

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
  update();

  /* ---------------------------------------------------------------------
     Einblenden beim Reinscrollen (gleiche Handschrift wie .more und .dash)
     --------------------------------------------------------------------- */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        section.classList.add('is-in');
        io.disconnect();
      });
    }, { rootMargin: '0px 0px -25% 0px' });
    io.observe(section);
  } else {
    section.classList.add('is-in');
  }
})();
