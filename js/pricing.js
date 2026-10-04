/* ==========================================================================
   webflux – Sektion „Preise“
   1) Umschalten zwischen den Plänen: Der Knopf im Schalter (data-plan) zeigt die
      Karte mit gleichem data-plan; die weiße Pille dahinter wird auf den aktiven
      Knopf gemessen (wie die Seitenwahl im Dashboard).
   2) Teamgröße beim Team-Plan: Der Regler setzt die Zahl der Nutzer. Daraus
      werden die gestapelten Kreise geschaltet (einer pro Nutzer) und der Preis
      gerechnet:
        pro Monat = Grundpreis + Nutzer × Preis pro Nutzer
        einmalig  = fester Betrag
      Die drei Beträge stehen als data-base / data-seat / data-once an der
      Sektion in index.html – hier steht keine Zahl, eine Preisänderung ist also
      reines HTML.
   3) Ein Klick auf einen Plan holt die Karte ins Bild (weiches Rollen).
   4) Die Sektion blendet erst ein, wenn der Strich in der Sektion darüber
      angekommen ist – sie wartet auf .is-linked an .sys.

   Was wohin geschrieben wird (alles über data-Attribute gesucht):
     [data-price-month]  die große Zahl pro Monat
     [data-price-seat]   der Preis je Nutzer über dem Regler
     [data-price-once]   der einmalige Betrag
     [data-price-count]  die Zahl der Nutzer neben „Teamgröße“
     [data-price-stack]  der Kasten, in den die Kreise gebaut werden
     [data-price-range]  der Regler; sein max bestimmt, wie viele Kreise es gibt
   ========================================================================== */

(function () {
  'use strict';

  var section = document.querySelector('.price');
  if (!section) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Beträge aus dem HTML; fehlt eines, bleibt es bei 0
  var BASE = num(section.getAttribute('data-base'));
  var SEAT = num(section.getAttribute('data-seat'));
  var ONCE = num(section.getAttribute('data-once'));

  // Buchstaben in den Kreisen – reine Deko, wiederholt sich bei größeren Teams.
  // Einer statt zwei: von jedem Kreis ist nur sein linker Rand zu sehen.
  var INITIALS = ['M', 'L', 'T', 'A', 'J', 'S', 'F', 'N', 'P', 'C',
                  'R', 'E', 'V', 'G', 'H', 'I', 'O', 'D', 'Y', 'U'];

  var LETTER_MIN = 15;   // ab diesem Abstand ist vom Buchstaben genug zu sehen

  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function euro(v) { return Math.round(v).toLocaleString('de-DE') + ' €'; }
  function all(sel) { return Array.prototype.slice.call(section.querySelectorAll(sel)); }

  // Text nur schreiben, wenn er sich ändert; bump = dabei kurz anstupsen
  function setText(el, text, bump) {
    if (!el || el.textContent === text) return;
    el.textContent = text;
    if (!bump || reduceMotion) return;
    el.classList.remove('is-bump');
    void el.offsetWidth;          // Animation neu starten
    el.classList.add('is-bump');
  }

  /* ---------------------------------------------------------------------
     1) Schalter zwischen den Plänen
     --------------------------------------------------------------------- */
  var switchEl = section.querySelector('.pswitch');
  var glider   = section.querySelector('.pswitch__glider');
  var stage    = section.querySelector('.price__stage');
  var items    = all('.pswitch__item');
  var cards    = all('.price__card');

  // Die Bühne so hoch machen wie die gewählte Karte. Erst dadurch liegen die
  // Karten frei übereinander (siehe .price__stage.is-measured in css/style.css).
  function fitStage() {
    if (!stage) return;
    var active = section.querySelector('.price__card.is-active');
    if (active) stage.style.height = active.offsetHeight + 'px';
  }

  function moveGlider() {
    if (!switchEl || !glider) return;
    var active = switchEl.querySelector('.pswitch__item.is-active');
    if (!active) return;
    glider.style.width = active.offsetWidth + 'px';
    glider.style.height = active.offsetHeight + 'px';
    glider.style.transform = 'translate(' + active.offsetLeft + 'px, ' + active.offsetTop + 'px)';
    glider.style.opacity = '1';
    switchEl.classList.add('is-ready');
  }

  // Nach dem Umschalten die Karte ins Bild holen: entweder mittig, oder – wenn
  // sie höher ist als das Fenster – mit ihrem oberen Rand knapp unter die Kante.
  function scrollToCard(card) {
    var gap = Math.max(26, (window.innerHeight - card.offsetHeight) / 2);
    var top = card.getBoundingClientRect().top + window.scrollY - gap;
    window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function select(plan, focus, scroll) {
    items.forEach(function (item) {
      var on = item.getAttribute('data-plan') === plan;
      item.classList.toggle('is-active', on);
      item.setAttribute('aria-selected', on ? 'true' : 'false');
      item.tabIndex = on ? 0 : -1;
      // preventScroll: sonst zieht der Fokus zum Schalter, waehrend die Seite
      // gerade zur Karte rollt
      if (on && focus) item.focus({ preventScroll: true });
    });
    var shown = null;
    cards.forEach(function (card) {
      var on = card.getAttribute('data-plan') === plan;
      card.classList.toggle('is-active', on);
      card.setAttribute('aria-hidden', on ? 'false' : 'true');
      if (on) shown = card;
    });
    moveGlider();
    fitStage();
    if (scroll && shown) scrollToCard(shown);
  }

  items.forEach(function (item) {
    item.addEventListener('click', function () {
      select(item.getAttribute('data-plan'), false, true);
    });
  });

  // Pfeiltasten wie bei nativen Tabs
  if (switchEl) {
    switchEl.addEventListener('keydown', function (e) {
      var dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      var at = items.findIndex(function (i) { return i.classList.contains('is-active'); });
      var next = items[(at + dir + items.length) % items.length];
      select(next.getAttribute('data-plan'), true, true);
    });
  }

  function measure() { moveGlider(); fitStage(); }

  // Karten frei stellen und sofort messen – beides im selben Durchlauf, damit
  // die Bühne nie kurz mit Höhe 0 zu sehen ist. Das weiche Wachsen kommt erst
  // einen Frame später dazu.
  if (stage) {
    stage.classList.add('is-measured');
    fitStage();
    window.requestAnimationFrame(function () { stage.classList.add('is-anim'); });
  }

  window.addEventListener('resize', measure);
  moveGlider();
  // Mit der fertigen Schrift sind Knöpfe und Karten anders hoch als jetzt – noch einmal messen
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  window.addEventListener('load', measure);

  /* ---------------------------------------------------------------------
     2) Solo: die festen Beträge aus den data-Attributen schreiben
     --------------------------------------------------------------------- */
  var solo = section.querySelector('.price__card[data-plan="solo"]');
  if (solo) {
    setText(solo.querySelector('[data-price-month]'), euro(BASE), false);
    setText(solo.querySelector('[data-price-once]'), euro(ONCE), false);
  }

  /* ---------------------------------------------------------------------
     3) Team: Regler, Kreise, Preis
     --------------------------------------------------------------------- */
  var team = section.querySelector('.price__card[data-plan="team"]');
  if (!team) return;

  var range = team.querySelector('[data-price-range]');
  if (!range) return;

  var stack = team.querySelector('[data-price-stack]');
  var MIN = num(range.min) || 1;
  var MAX = num(range.max) || 1;

  var outMonth = team.querySelector('[data-price-month]');
  var outSeat  = team.querySelector('[data-price-seat]');
  var outOnce  = team.querySelector('[data-price-once]');
  var outCount = team.querySelector('[data-price-count]');

  // Die Kreise einmal bauen – danach wird nur noch ein- und ausgeblendet
  var dots = [];
  if (stack) {
    for (var i = 0; i < MAX; i++) {
      var dot = document.createElement('span');
      dot.className = 'price__dot';
      dot.style.setProperty('--i', i);
      dot.textContent = INITIALS[i % INITIALS.length];
      stack.appendChild(dot);
      dots.push(dot);
    }
  }

  // Abstand der Kreise: so viel, dass sie sich schön überlappen – aber nie mehr,
  // als in die Spalte passt, sonst hinge der volle Stapel heraus. Die Größe der
  // Kreise steht im CSS und wird hier am ersten abgelesen.
  // Ist der Abstand zu klein, wäre vom Buchstaben nur ein Rest zu sehen: dann
  // bleiben die Kreise leer (.is-plain).
  function layoutStack() {
    if (!stack || !dots.length) return 0;
    var size  = dots[0].offsetWidth;
    var panel = stack.parentNode;
    var cs    = window.getComputedStyle(panel);
    var avail = panel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var fit   = MAX > 1 ? (avail - size) / (MAX - 1) : size;
    var step  = Math.max(8, Math.min(Math.round(size * 0.6), Math.floor(fit)));
    stack.style.setProperty('--step', step + 'px');
    stack.classList.toggle('is-plain', step < LETTER_MIN);
    return step;
  }

  // Breite des Stapels in Pixeln: (Kreise - 1) × Abstand + ein Kreis.
  // In Pixeln, weil Chrome eine Breite nicht weich wachsen lässt, solange sie
  // nur aus einer Variablen im calc() kommt.
  function stackWidth(n) {
    if (!dots.length) return 0;
    return (n - 1) * layoutStack() + dots[0].offsetWidth;
  }

  function render() {
    var n = Math.min(MAX, Math.max(MIN, Math.round(num(range.value))));

    // Kreise: sichtbar sind die ersten n, der letzte davon leuchtet
    if (stack) {
      stack.style.width = stackWidth(n) + 'px';
      dots.forEach(function (dot, k) {
        dot.classList.toggle('is-on', k < n);
        dot.classList.toggle('is-last', k === n - 1);
      });
    }

    // Füllstand der Schiene. Der Griff ist 20 px breit und sitzt an den Enden
    // nicht ganz außen – die Rechnung schiebt die Füllung um seine halbe Breite mit.
    var f = MAX > MIN ? (n - MIN) / (MAX - MIN) : 1;
    range.style.setProperty('--fill', 'calc(' + (f * 100).toFixed(2) + '% + ' + ((0.5 - f) * 20).toFixed(2) + 'px)');

    setText(outCount, String(n), false);
    setText(outMonth, euro(BASE + SEAT * n), true);
    setText(outSeat, euro(SEAT), false);
    setText(outOnce, euro(ONCE), false);

    fitStage();   // die neue Zeile kann anders umbrechen
  }

  range.addEventListener('input', render);
  range.addEventListener('change', render);
  // Beim Ändern der Fensterbreite werden Kreise und Abstand anders groß
  window.addEventListener('resize', render);
  render();

  /* ---------------------------------------------------------------------
     Einblenden beim Reinscrollen (gleiche Handschrift wie .more, .dash, .sys) –
     aber erst, wenn der Strich in der Sektion darueber angekommen ist. Das sagt
     die Klasse .is-linked an .sys (setzt js/system.js). So laufen nicht zwei
     Sachen gleichzeitig.

     Zwei Bedingungen: Sektion im Bild UND Strich fertig. Die zweite kann spaeter
     wahr werden als die erste, deshalb wird sie beim Scrollen nachgeprueft.
     --------------------------------------------------------------------- */
  var above  = document.querySelector('.sys');
  var inView = false;
  var io     = null;

  // Ist die Sektion darüber durch? Normalerweise sagt das ihre Klasse. Der
  // zweite Fall ist der Notnagel: Steht sie schon zur Hälfte über der
  // Bildschirmmitte, ist ihre Animation ohnehin vorbei – dann nicht weiter
  // warten, egal was die Klasse sagt.
  function aboveDone() {
    if (!above) return true;
    if (above.classList.contains('is-linked')) return true;
    return above.getBoundingClientRect().bottom <= window.innerHeight * 0.5;
  }

  // Dasselbe Fenster wie der Beobachter unten (rootMargin -25 %), nur zu Fuß –
  // damit das Einblenden auch dann kommt, wenn der Beobachter nicht meldet.
  function inViewNow() {
    var r = section.getBoundingClientRect();
    return r.top <= window.innerHeight * 0.75 && r.bottom >= 0;
  }

  function reveal() {
    if (section.classList.contains('is-in')) return;
    if (!inView && !inViewNow()) return;
    if (!aboveDone()) return;
    section.classList.add('is-in');
    measure();             // jetzt steht die Sektion still, jetzt stimmt die Messung
    window.removeEventListener('scroll', reveal);
    if (io) io.disconnect();
  }

  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        inView = true;
        reveal();
      });
    }, { rootMargin: '0px 0px -25% 0px' });
    io.observe(section);
    window.addEventListener('scroll', reveal, { passive: true });
  } else {
    section.classList.add('is-in');
  }
})();
