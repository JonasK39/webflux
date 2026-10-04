/* ==========================================================================
   webflux – Sektion „Kontakt“
   Die letzte Sektion hat nur eine Aufgabe: einmal einblenden, wenn man sie
   erreicht. Danach passiert nichts mehr – kein Scroll-Listener, kein Zustand.

   Klassen:
     .contact.is-in   Sektion war im Bild -> Überschrift, Zeile und Button
                      fahren nacheinander ein (Reihenfolge und Zeiten stehen
                      in css/style.css)
   ========================================================================== */

(function () {
  'use strict';

  var section = document.querySelector('.contact');
  if (!section) return;

  /* Einblenden beim Reinscrollen (gleiche Handschrift wie .more, .dash und .sys) */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        section.classList.add('is-in');
        io.disconnect();
      });
    }, { rootMargin: '0px 0px -20% 0px' });
    io.observe(section);
  } else {
    section.classList.add('is-in');
  }
})();
