/* ==========================================================================
   webflux – Sektion „Unser Dashboard“
   Das Widget ist ein Nachbau des Kunden-Dashboards mit Beispieldaten und hat
   acht Seiten:

   1) Seitenwahl: jeder Knopf mit data-dash-page zeigt die Seite mit gleichem
      data-page – unten die Leiste, in der Seitenleiste dieselben acht Punkte.
      Die weiße Pille hinter dem aktiven Knopf wird gemessen und verschoben.
      Seiten, die beim Aufschlagen etwas nachladen, tragen sich in pageHooks ein.
   2) Immobilien: die Filter oben blenden die Karten nach data-typ/data-status
      ein und aus. Die Karten selbst stehen als HTML in index.html.
   3) Kalender: Monatsraster und Tagesliste werden hier gebaut. „Neuer Termin“
      hängt einen weiteren Termin an den gewählten Tag.
   4) Finanzen: Säulendiagramm der letzten sechs Monate. Ein Klick auf einen
      Monat setzt Kennzahlen und Buchungsliste darunter.
   5) Routenplaner: „Route planen“ sortiert die Vor-Ort-Termine des Tages –
      entweder nach Uhrzeit oder zur kürzesten Strecke (nächster Nachbar).
      Fahrzeit und Kilometer werden aus den Kartenpunkten gerechnet, deshalb
      passen Zahlen und gezeichnete Linie immer zusammen.
   6) Übersicht: große Kennzahl mit vier Reitern, Jahresverlauf, Tagesüberblick
      und die neuesten Anfragen (ein Klick darauf springt zur Seite „Anfragen“).
   7) Anfragen: Eingänge des Kontaktformulars, Öffnen markiert sie als gelesen.
   8) Kunden: Suchprofil und die dazu passenden Objekte; Aufgaben: Liste mit
      Haken und Checkliste.

   Ein Tag hängt im ganzen Widget zusammen: eventsOfDay() liefert für heute die
   Termine aus ROUTE_STOPS, deshalb zeigen Übersicht, Kalender und Routenplaner
   denselben Tag. Texte und Zahlen stehen gesammelt im Abschnitt DATEN.
   ========================================================================== */

(function () {
  'use strict';

  var section = document.querySelector('.dash');
  if (!section) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =========================================================================
     DATEN – hier anpassen
     ========================================================================= */

  var WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  // Kalender: Vorrat an Terminen. Aus ihm wird je Tag gezogen (immer gleich).
  var CAL_POOL = [
    { t: 'Besichtigung Penthouse',    s: 'Familie Brandt · Leopoldstraße 112',   k: 'Besichtigung' },
    { t: 'Notartermin Kaufvertrag',   s: 'Notariat Dr. Wenger · Prinzregenten.', k: 'Notartermin' },
    { t: 'Objektaufnahme Fotos',      s: 'Wörthstraße 8 · Fotograf Keller',      k: 'Fototermin' },
    { t: 'Beratung Finanzierung',     s: 'Herr Özdemir · Videocall',             k: 'Beratung' },
    { t: 'Schlüsselübergabe',         s: 'Bahnhofplatz 3, Starnberg',            k: 'Übergabe' },
    { t: 'Zweitbesichtigung Loft',    s: 'Frau Lindner · Werksviertel',          k: 'Besichtigung' },
    { t: 'Wertermittlung vor Ort',    s: 'Grünwald · Familie Sailer',            k: 'Termin' },
    { t: 'Rückruf Interessent',       s: 'Herr Bauer · Telefonat',               k: 'Telefonat' }
  ];

  // Termine, die der Knopf „Neuer Termin“ nacheinander anlegt
  var CAL_NEW = [
    { t: 'Besichtigung Altbau',       s: 'Gärtnerplatz · Herr Krüger',           k: 'Besichtigung' },
    { t: 'Exposé-Abstimmung',         s: 'Intern · 30 min',                      k: 'Termin' },
    { t: 'Übergabe Mietwohnung',      s: 'Sendling · Frau Vogt',                 k: 'Übergabe' }
  ];

  var CAL_TIMES = ['09:00', '10:30', '11:45', '14:00', '15:30', '16:45', '18:00'];

  // Finanzen: Einnahmen/Ausgaben der letzten sechs Monate (ältester zuerst)
  var FIN_VALUES = [
    { in: 42800, out: 18450 },
    { in: 61200, out: 21300 },
    { in: 38900, out: 19700 },
    { in: 74500, out: 24100 },
    { in: 52300, out: 20850 },
    { in: 68900, out: 23400 }
  ];

  // Finanzen: Vorrat an Buchungen (d = Tag im Monat, a = Betrag, art = in|out)
  var FIN_POOL = [
    { d: 4,  t: 'Provision Penthouse Schwabing', c: 'Provision',      a: 18400, art: 'in' },
    { d: 6,  t: 'Anzeigen Immobilienportale',    c: 'Marketing',      a: 1290,  art: 'out' },
    { d: 9,  t: 'Provision Loft Werksviertel',   c: 'Provision',      a: 7850,  art: 'in' },
    { d: 11, t: 'Miete Büro Maximilianstraße',   c: 'Miete/Pacht',    a: 3400,  art: 'out' },
    { d: 14, t: 'Home-Staging Grünwald',         c: 'Instandhaltung', a: 2150,  art: 'out' },
    { d: 17, t: 'Vermittlung Erstbezug Sendling',c: 'Provision',      a: 4980,  art: 'in' },
    { d: 21, t: 'Drohnenaufnahmen Stadthaus',    c: 'Marketing',      a: 890,   art: 'out' },
    { d: 23, t: 'Provision Altbau Gärtnerplatz', c: 'Provision',      a: 12600, art: 'in' },
    { d: 26, t: 'Steuervorauszahlung',           c: 'Steuern',        a: 6200,  art: 'out' },
    { d: 28, t: 'Bewertungsgutachten Starnberg', c: 'Sonstiges',      a: 1450,  art: 'in' }
  ];

  // Route: Büro (Start und Ziel) und die Termine des Tages.
  // nx/ny sind Punkte auf der schematischen Karte (0 = links/oben, 1 = rechts/unten).
  // Daraus werden Kilometer und Fahrzeit gerechnet – siehe legBetween().
  var ROUTE_OFFICE = { title: 'Büro', addr: 'Maximilianstraße 12, München', nx: 0.138, ny: 0.727 };

  // Diese fuenf Termine sind der heutige Tag im ganzen Widget: der Routenplaner
  // faehrt sie ab, der Kalender zeigt sie am heutigen Datum und die Uebersicht
  // listet sie im Tagesueberblick.
  var ROUTE_STOPS = [
    { time: '09:30', title: 'Besichtigung Penthouse',  addr: 'Leopoldstraße 112, München',      kind: 'Besichtigung', vorOrt: true,  nx: 0.288, ny: 0.258 },
    { time: '11:00', title: 'Schlüsselübergabe',       addr: 'Bahnhofplatz 3, Starnberg',       kind: 'Übergabe',     vorOrt: true,  nx: 0.819, ny: 0.788 },
    { time: '12:30', title: 'Rückfragen Finanzierung', addr: 'Videocall · Herr Özdemir',        kind: 'Beratung',     vorOrt: false },
    { time: '14:15', title: 'Objektaufnahme Fotos',    addr: 'Wörthstraße 8, München',          kind: 'Fototermin',   vorOrt: true,  nx: 0.525, ny: 0.470 },
    { time: '16:00', title: 'Notartermin Kaufvertrag', addr: 'Prinzregentenstraße 24, München', kind: 'Notartermin',  vorOrt: true,  nx: 0.650, ny: 0.197 }
  ];

  // Rechenraum der Karte: Kilometer = Abstand in diesen Einheiten × KM_PER_UNIT
  var MAP_W = 320, MAP_H = 132, KM_PER_UNIT = 0.09;

  // Übersicht: Beschriftung der vier Reiter. Umsatz und Reingewinn holt sich das
  // Skript aus FIN_VALUES (letzter Monat), damit Übersicht und Finanzen
  // dieselbe Zahl zeigen; „Termine“ zählt die Termine des laufenden Monats.
  var OVERVIEW_TABS = [
    { id: 'umsatz',  label: 'Umsatz (aktueller Monat)',     desc: 'Vor Steuer und Ausgaben' },
    { id: 'gewinn',  label: 'Reingewinn (aktueller Monat)', desc: 'Einnahmen minus Ausgaben' },
    { id: 'objekte', label: 'Objekte im Bestand',           desc: '4 aktiv · 1 Entwurf · 1 verkauft', value: '6' },
    { id: 'termine', label: 'Termine diesen Monat',         desc: 'Besichtigungen, Notartermine, Rückrufe' }
  ];

  // Übersicht: Umsatz der zwölf Monate davor in Euro. Die letzten sechs Werte
  // sind dieselben wie auf der Finanzen-Seite (siehe unten im Skript).
  var OVERVIEW_YEAR_START = [30500, 44200, 38800, 57600, 46900, 62400];

  // Anfragen: was über das Kontaktformular der Website hereinkommt
  var CONTACTS = [
    {
      name: 'Julia Brandt', subject: 'Besichtigung Penthouse Schwabing', time: 'vor 12 Min', read: false,
      mail: 'j.brandt@example.de', tel: '+49 151 2233445', objekt: 'Penthouse mit Dachterrasse',
      text: 'Guten Tag, wir interessieren uns sehr für das Penthouse in Schwabing. Wäre eine Besichtigung noch diese Woche möglich? Wir sind zeitlich flexibel, die Finanzierung ist mit unserer Hausbank bereits vorbesprochen. Viele Grüße, Julia Brandt'
    },
    {
      name: 'Markus Seidel', subject: 'Wie hoch ist das Hausgeld?', time: 'vor 2 Std', read: false,
      mail: 'm.seidel@example.de', tel: '+49 89 445566', objekt: 'Familienhaus mit Südgarten',
      text: 'Hallo, im Exposé finde ich keine Angabe zum Hausgeld und zur Grundsteuer. Können Sie mir die Zahlen zusenden? Außerdem würde mich interessieren, ob die Garage im Preis enthalten ist.'
    },
    {
      name: 'Familie Özdemir', subject: 'Finanzierung – Termin möglich?', time: 'Gestern, 16:40', read: false,
      mail: 'oezdemir@example.de', tel: '+49 176 9988776', objekt: 'Altbau-Wohnung am Gärtnerplatz',
      text: 'Guten Abend, wir haben die Altbauwohnung besichtigt und möchten gerne ein Angebot abgeben. Können wir vorher kurz über die Finanzierung sprechen? Ein Videocall diese Woche würde uns gut passen.'
    },
    {
      name: 'Anna Lindner', subject: 'Rückruf zur Mietwohnung Sendling', time: 'Di, 09:15', read: true,
      mail: 'a.lindner@example.de', tel: '+49 160 1122334', objekt: 'Neubau-Erstbezug mit Balkon',
      text: 'Hallo, ich habe zwei Fragen zur Wohnung in Sendling: Ist ein Tiefgaragenstellplatz verfügbar und ab wann kann übernommen werden? Am besten erreichen Sie mich nachmittags.'
    },
    {
      name: 'Thomas Kern', subject: 'Verkauf meiner Eigentumswohnung', time: 'Mo, 11:05', read: true,
      mail: 't.kern@example.de', tel: '+49 171 5544332', objekt: '–',
      text: 'Sehr geehrte Damen und Herren, ich möchte meine 3-Zimmer-Wohnung in Haidhausen verkaufen und hätte gerne eine Einschätzung zum Marktwert. Wann hätten Sie Zeit für einen Termin vor Ort?'
    }
  ];

  // Kunden: Suchprofil und die Objekte, die dazu passen
  var CUSTOMERS = [
    {
      name: 'Julia & Tim Brandt', since: 'seit 12.09.', art: 'Kauf',
      profil: [['Objektart', 'Wohnung / Penthouse'], ['Wunschort', 'München + 15 km'], ['Budget', 'bis 1,6 Mio €'], ['Größe', 'ab 4 Zimmer, 140 m²']],
      matches: [
        { t: 'Penthouse mit Dachterrasse', s: 'Schwabing · 1.450.000 €', p: 96 },
        { t: 'Stadthaus am Englischen Garten', s: 'Schwabing-Freimann · 2.340.000 €', p: 68 }
      ]
    },
    {
      name: 'Markus Seidel', since: 'seit 08.09.', art: 'Kauf',
      profil: [['Objektart', 'Haus'], ['Wunschort', 'Grünwald + 10 km'], ['Budget', 'bis 2,2 Mio €'], ['Größe', 'ab 5 Zimmer, 200 m²']],
      matches: [
        { t: 'Familienhaus mit Südgarten', s: 'Grünwald · 1.980.000 €', p: 92 }
      ]
    },
    {
      name: 'Familie Özdemir', since: 'seit 02.09.', art: 'Kauf',
      profil: [['Objektart', 'Wohnung'], ['Wunschort', 'München-Süd + 20 km'], ['Budget', 'bis 950.000 €'], ['Größe', 'ab 3 Zimmer, 90 m²']],
      matches: [
        { t: 'Altbau-Wohnung am Gärtnerplatz', s: 'Isarvorstadt · 895.000 €', p: 88 },
        { t: 'Neubau-Erstbezug mit Balkon', s: 'Sendling · 1.680 € / mtl.', p: 54 }
      ]
    },
    {
      name: 'Anna Lindner', since: 'seit 28.08.', art: 'Miete',
      profil: [['Objektart', 'Wohnung / Loft'], ['Wunschort', 'München + 8 km'], ['Budget', 'bis 2.400 € / mtl.'], ['Größe', 'ab 2 Zimmer, 70 m²']],
      matches: [
        { t: 'Loft im Werksviertel', s: 'Berg am Laim · 2.150 € / mtl.', p: 94 },
        { t: 'Neubau-Erstbezug mit Balkon', s: 'Sendling · 1.680 € / mtl.', p: 79 }
      ]
    },
    {
      name: 'Thomas Kern', since: 'seit 25.08.', art: 'Verkauf',
      profil: [['Anliegen', 'Bewertung & Verkauf'], ['Objekt', '3 Zimmer, 78 m²'], ['Lage', 'Haidhausen, München'], ['Zeitrahmen', 'in den nächsten 6 Monaten']],
      matches: []
    }
  ];

  // Aufgaben: Liste links, Checkliste im Detail rechts
  var TASKS = [
    {
      title: 'Exposé Penthouse Schwabing finalisieren', due: 'Heute', urgent: true, who: 'SM', done: false,
      text: 'Grundriss einpflegen, Energieausweis prüfen und die Beschreibung auf die neuen Bilder abstimmen.',
      steps: [{ t: 'Bilder sortieren', done: true }, { t: 'Grundriss einfügen', done: false }, { t: 'Text Korrektur lesen', done: false }]
    },
    {
      title: 'Rückruf Familie Özdemir', due: 'Heute, 16:00', urgent: true, who: 'SM', done: false,
      text: 'Angebot für die Altbauwohnung besprechen und einen Termin für das Finanzierungsgespräch festhalten.',
      steps: [{ t: 'Unterlagen bereitlegen', done: true }, { t: 'Anrufen', done: false }]
    },
    {
      title: 'Fotograf für Wörthstraße buchen', due: 'Morgen', urgent: false, who: 'LK', done: false,
      text: 'Termin mit Fotograf Keller abstimmen, Wohnung vorher lüften und Home-Staging prüfen.',
      steps: [{ t: 'Termin anfragen', done: false }, { t: 'Zugang klären', done: false }]
    },
    {
      title: 'Energieausweis Altbau anfordern', due: 'Freitag', urgent: false, who: 'SM', done: false,
      text: 'Beim Eigentümer den gültigen Energieausweis anfordern – ohne ihn darf das Objekt nicht inseriert bleiben.',
      steps: [{ t: 'Eigentümer anschreiben', done: false }]
    },
    {
      title: 'Notartermin Stadthaus vorbereiten', due: 'Erledigt', urgent: false, who: 'SM', done: true,
      text: 'Kaufvertragsentwurf geprüft, Unterlagen an beide Parteien versandt.',
      steps: [{ t: 'Entwurf prüfen', done: true }, { t: 'Unterlagen versenden', done: true }]
    },
    {
      title: 'Website-Texte Startseite prüfen', due: 'Erledigt', urgent: false, who: 'LK', done: true,
      text: 'Neue Startseiten-Texte gegengelesen und im Dashboard freigegeben.',
      steps: [{ t: 'Texte lesen', done: true }, { t: 'Freigeben', done: true }]
    }
  ];

  /* =========================================================================
     Kleine Helfer
     ========================================================================= */

  function qs(sel, root) { return (root || section).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || section).querySelectorAll(sel)); }

  function euro(n) {
    return Math.round(n).toLocaleString('de-DE') + ' €';
  }

  function km(n) {
    return n.toFixed(1).replace('.', ',') + ' km';
  }

  // Gleiches Datum -> gleiche Zahl. Damit sind die Beispieltermine beim
  // Blättern immer dieselben, ohne dass sie irgendwo gespeichert werden müssen.
  function hash(y, m, d) {
    var h = (y * 397 + m * 131 + d * 17) >>> 0;
    h ^= h >>> 13;
    h = (h * 1274126177) >>> 0;
    return h >>> 0;
  }

  function minutesToTime(mins) {
    mins = ((mins % 1440) + 1440) % 1440;
    var h = Math.floor(mins / 60), m = mins % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function timeToMinutes(str) {
    var p = str.split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  // Text, der über innerHTML eingesetzt wird, entschärfen
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
  var ICON_MAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3.6 8l8.4 5.4L20.4 8"/></svg>';
  var ICON_LIST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 7h10M10 12h10M10 17h7"/><path d="M3.8 6.6l1.4 1.4 2.3-2.5M3.8 11.6l1.4 1.4 2.3-2.5"/></svg>';

  // Wird von der Übersicht aufgerufen, wenn dort eine Anfrage angeklickt wird;
  // die Seite „Anfragen“ setzt die Funktion beim Start (siehe initContacts).
  var openContact = function () {};

  function isToday(date) {
    var now = new Date();
    return date.getDate() === now.getDate() &&
           date.getMonth() === now.getMonth() &&
           date.getFullYear() === now.getFullYear();
  }

  // Die Termine eines Tages. Heute sind es die fünf aus ROUTE_STOPS, damit
  // Übersicht, Kalender und Routenplaner denselben Tag zeigen; an allen anderen
  // Tagen erfundene, aber je Datum immer dieselben aus CAL_POOL.
  function eventsOfDay(date) {
    if (isToday(date)) {
      return ROUTE_STOPS.map(function (stop) {
        return { time: stop.time, t: stop.title, s: stop.addr, k: stop.kind };
      });
    }

    var wd = date.getDay();
    if (wd === 0) return [];                            // sonntags ist frei

    var h = hash(date.getFullYear(), date.getMonth(), date.getDate());
    var counts = wd === 6 ? [0, 1, 0, 1, 0] : [1, 2, 0, 3, 2, 1, 2, 0];
    var n = counts[h % counts.length];
    var start = h % Math.max(1, CAL_TIMES.length - Math.max(0, n * 2 - 1));
    var out = [];
    for (var i = 0; i < n; i++) {
      var item = CAL_POOL[(h + i * 7) % CAL_POOL.length];
      out.push({
        time: CAL_TIMES[Math.min(CAL_TIMES.length - 1, start + i * 2)],
        t: item.t, s: item.s, k: item.k
      });
    }
    return out;
  }

  // Eine Terminzeile, wie sie im Kalender und in der Übersicht steht
  function buildEventRow(ev, isNew) {
    var row = document.createElement('div');
    row.className = 'devent' + (isNew ? ' is-new' : '');
    row.innerHTML = '<span class="devent__time"></span>' +
                    '<span class="devent__body"><b></b><i></i></span>' +
                    '<span class="devent__tag"></span>';
    row.querySelector('.devent__time').textContent = ev.time;
    row.querySelector('.devent__body b').textContent = ev.t;
    row.querySelector('.devent__body i').textContent = ev.s;
    var tag = row.querySelector('.devent__tag');
    tag.textContent = ev.k;
    tag.setAttribute('data-kind', ev.k.toLowerCase());
    return row;
  }

  /* =========================================================================
     1) Seitenwahl (Leiste unten + Punkte in der Seitenleiste)
     ========================================================================= */

  var pages = qsa('.dash__page');
  var triggers = qsa('[data-dash-page]');
  var tabs = qsa('.dash-switch__item');
  var switchEl = qs('.dash-switch');
  var glider = qs('.dash-switch__glider');
  var current = '';

  // Seiten, die beim Aufschlagen etwas nachladen oder auffrischen, tragen sich
  // hier ein (Schlüssel = data-page).
  var pageHooks = {};

  // Die Seiten liegen übereinander; das hidden aus dem HTML ist nur die
  // Notlösung ohne JavaScript und kommt jetzt weg.
  pages.forEach(function (page) { page.hidden = false; });

  function showPage(name, focus) {
    if (name === current) return;
    current = name;

    pages.forEach(function (page) {
      var on = page.getAttribute('data-page') === name;
      page.classList.toggle('is-active', on);
      page.setAttribute('aria-hidden', on ? 'false' : 'true');
    });

    triggers.forEach(function (btn) {
      var on = btn.getAttribute('data-dash-page') === name;
      btn.classList.toggle('is-active', on);
      if (btn.getAttribute('role') === 'tab') {
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
        btn.tabIndex = on ? 0 : -1;
        if (on && focus) btn.focus();
      } else if (on) {
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('aria-current');
      }
    });

    moveGlider();
    if (pageHooks[name]) pageHooks[name]();
  }

  // Weiße Pille hinter dem aktiven Knopf: Position und Breite werden gemessen,
  // damit unterschiedlich lange Beschriftungen und ein Umbruch auf schmalen
  // Bildschirmen beide stimmen.
  function moveGlider() {
    if (!switchEl || !glider) return;
    var active = switchEl.querySelector('.dash-switch__item.is-active');
    if (!active) return;
    glider.style.width = active.offsetWidth + 'px';
    glider.style.height = active.offsetHeight + 'px';
    glider.style.transform = 'translate(' + active.offsetLeft + 'px, ' + active.offsetTop + 'px)';
    glider.style.opacity = '1';
    switchEl.classList.add('is-ready');
  }

  triggers.forEach(function (btn) {
    btn.addEventListener('click', function () {
      showPage(btn.getAttribute('data-dash-page'), false);
    });
  });

  // Pfeiltasten in der Leiste unten
  if (switchEl) {
    switchEl.addEventListener('keydown', function (ev) {
      var step = ev.key === 'ArrowRight' ? 1 : (ev.key === 'ArrowLeft' ? -1 : 0);
      if (!step) return;
      ev.preventDefault();
      var n = tabs.findIndex(function (t) { return t.classList.contains('is-active'); });
      var next = tabs[(n + step + tabs.length) % tabs.length];
      showPage(next.getAttribute('data-dash-page'), true);
    });
  }

  window.addEventListener('resize', moveGlider);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveGlider);
  showPage('uebersicht', false);

  /* =========================================================================
     2) Immobilien: Filter
     ========================================================================= */

  (function initProperties() {
    var page = qs('.dash__page[data-page="immobilien"]');
    if (!page) return;

    var buttons = qsa('[data-filter]', page);
    var cards = qsa('.dcard', page);
    var empty = qs('[data-empty]', page);

    function apply(filter) {
      var shown = 0;
      cards.forEach(function (card) {
        var match = filter === 'alle' ||
                    card.getAttribute('data-typ') === filter ||
                    card.getAttribute('data-status') === filter;
        card.hidden = !match;
        if (match) shown++;
      });
      if (empty) empty.hidden = shown > 0;
    }

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.classList.toggle('is-active', b === btn); });
        apply(btn.getAttribute('data-filter'));
      });
    });
  })();

  /* =========================================================================
     3) Kalender
     ========================================================================= */

  (function initCalendar() {
    var page = qs('.dash__page[data-page="kalender"]');
    if (!page) return;

    var grid = qs('[data-cal-grid]', page);
    var label = qs('[data-cal-label]', page);
    var dayLabel = qs('[data-cal-daylabel]', page);
    var list = qs('[data-cal-events]', page);
    var addBtn = qs('[data-cal-add]', page);

    var today = new Date();
    var view = { y: today.getFullYear(), m: today.getMonth() };
    var selected = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var extra = {};   // selbst angelegte Termine, Schlüssel: y-m-d
    var addCount = 0;

    function key(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }

    // Die Termine des Tages plus die hier selbst angelegten
    function eventsFor(date) {
      var out = eventsOfDay(date);
      var own = extra[key(date)];
      if (own) out = out.concat(own);
      out.sort(function (a, b) { return timeToMinutes(a.time) - timeToMinutes(b.time); });
      return out;
    }

    function renderMonth() {
      label.textContent = MONTHS[view.m] + ' ' + view.y;
      grid.innerHTML = '';

      var first = new Date(view.y, view.m, 1);
      var offset = (first.getDay() + 6) % 7;            // Woche beginnt montags
      var days = new Date(view.y, view.m + 1, 0).getDate();
      var cells = Math.ceil((offset + days) / 7) * 7;

      for (var i = 0; i < cells; i++) {
        var dayNum = i - offset + 1;
        var inMonth = dayNum >= 1 && dayNum <= days;
        var date = new Date(view.y, view.m, dayNum);

        var cell = document.createElement(inMonth ? 'button' : 'span');
        cell.className = 'dcal__day' + (inMonth ? '' : ' is-out');
        if (inMonth) cell.type = 'button';

        var num = document.createElement('b');
        num.textContent = inMonth ? dayNum : date.getDate();
        cell.appendChild(num);

        var dots = document.createElement('span');
        dots.className = 'dcal__dots';
        if (inMonth) {
          var n = Math.min(3, eventsFor(date).length);
          for (var k = 0; k < n; k++) dots.appendChild(document.createElement('i'));
        }
        cell.appendChild(dots);

        if (inMonth) {
          if (date.toDateString() === today.toDateString()) cell.classList.add('is-today');
          if (date.toDateString() === selected.toDateString()) cell.classList.add('is-selected');
          cell.setAttribute('aria-label', dayNum + '. ' + MONTHS[view.m] + ' ' + view.y);
          (function (d) {
            cell.addEventListener('click', function () {
              selected = d;
              renderMonth();
              renderDay();
            });
          })(date);
        }

        grid.appendChild(cell);
      }
    }

    function renderDay(newIndex) {
      dayLabel.textContent = WEEKDAYS[selected.getDay()].slice(0, 2) + ', ' +
                             selected.getDate() + '. ' + MONTHS[selected.getMonth()];
      var events = eventsFor(selected);
      list.innerHTML = '';

      if (!events.length) {
        var none = document.createElement('p');
        none.className = 'dash__empty';
        none.textContent = 'Keine Termine an diesem Tag.';
        list.appendChild(none);
      }

      events.forEach(function (ev, i) {
        list.appendChild(buildEventRow(ev, i === newIndex));
      });
    }

    qsa('[data-cal-step]', page).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var step = parseInt(btn.getAttribute('data-cal-step'), 10);
        var d = new Date(view.y, view.m + step, 1);
        view.y = d.getFullYear();
        view.m = d.getMonth();
        // Auswahl in den sichtbaren Monat mitnehmen, damit die Liste rechts passt
        var maxDay = new Date(view.y, view.m + 1, 0).getDate();
        selected = new Date(view.y, view.m, Math.min(selected.getDate(), maxDay));
        renderMonth();
        renderDay();
      });
    });

    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var k = key(selected);
        var existing = eventsFor(selected);
        var last = existing.length ? timeToMinutes(existing[existing.length - 1].time) : 8 * 60;
        var slot = minutesToTime(Math.min(19 * 60, last + 75));
        var src = CAL_NEW[addCount % CAL_NEW.length];
        addCount++;
        extra[k] = (extra[k] || []).concat([{ time: slot, t: src.t, s: src.s, k: src.k }]);

        var fresh = eventsFor(selected);
        var idx = fresh.findIndex(function (e) { return e.time === slot && e.t === src.t; });
        renderMonth();
        renderDay(idx);
      });
    }

    renderMonth();
    renderDay();
  })();

  /* =========================================================================
     4) Finanzen
     ========================================================================= */

  // Läuft einmal, sobald die Sektion ins Bild kommt (Diagramme zeichnen sich
  // erst dann, sonst liefe die Wachstums-Animation unsichtbar ab).
  var onReveal = [];

  (function initFinance() {
    var page = qs('.dash__page[data-page="finanzen"]');
    if (!page) return;

    var chart = qs('[data-fin-chart]', page);
    var table = qs('[data-fin-table]', page);
    var outIn = qs('[data-fin-in]', page);
    var outOut = qs('[data-fin-out]', page);
    var outSum = qs('[data-fin-sum]', page);
    var monthOut = qs('[data-fin-month]', page);

    // Beschriftung der letzten sechs Monate, endend mit dem laufenden Monat
    var now = new Date();
    var months = FIN_VALUES.map(function (v, i) {
      var d = new Date(now.getFullYear(), now.getMonth() - (FIN_VALUES.length - 1 - i), 1);
      return { d: d, short: MONTHS_SHORT[d.getMonth()], long: MONTHS[d.getMonth()] + ' ' + d.getFullYear(), in: v.in, out: v.out };
    });

    var selected = months.length - 1;
    var max = months.reduce(function (m, x) { return Math.max(m, x.in, x.out); }, 0);
    var bars = [];

    months.forEach(function (m, i) {
      var bar = document.createElement('button');
      bar.type = 'button';
      bar.className = 'dbar';
      bar.style.setProperty('--in', (m.in / max * 100).toFixed(1) + '%');
      bar.style.setProperty('--out', (m.out / max * 100).toFixed(1) + '%');
      bar.setAttribute('aria-label', m.long + ': Einnahmen ' + euro(m.in) + ', Ausgaben ' + euro(m.out));
      bar.innerHTML = '<span class="dbar__cols"><i class="dbar__in"></i><i class="dbar__out"></i></span>' +
                      '<span class="dbar__label"></span>';
      bar.querySelector('.dbar__label').textContent = m.short;
      bar.addEventListener('click', function () { select(i); });
      chart.appendChild(bar);
      bars.push(bar);
    });

    function rowsFor(i) {
      var month = months[i];
      var days = new Date(month.d.getFullYear(), month.d.getMonth() + 1, 0).getDate();
      var rows = [];
      for (var n = 0; n < 5; n++) {
        var src = FIN_POOL[(i * 3 + n) % FIN_POOL.length];
        rows.push({ day: Math.min(src.d, days), t: src.t, c: src.c, a: src.a, art: src.art });
      }
      rows.sort(function (a, b) { return b.day - a.day; });
      return rows;
    }

    function select(i) {
      selected = i;
      bars.forEach(function (b, n) { b.classList.toggle('is-active', n === i); });

      var m = months[i];
      var diff = m.in - m.out;
      outIn.textContent = euro(m.in);
      outOut.textContent = euro(m.out);
      outSum.textContent = (diff < 0 ? '− ' : '+ ') + euro(Math.abs(diff));
      outSum.style.color = diff < 0 ? '#ff9b9b' : '';
      monthOut.textContent = m.long;

      table.innerHTML = '<div class="dtable__row dtable__row--head"><span>Datum</span><span>Beschreibung</span><span>Kategorie</span><span style="text-align:right">Betrag</span></div>';
      rowsFor(i).forEach(function (r) {
        var row = document.createElement('div');
        row.className = 'dtable__row';
        row.innerHTML = '<span></span><span class="dtable__desc"></span><span class="dtag"></span><span class="dtable__amount"></span>';
        var dd = r.day < 10 ? '0' + r.day : r.day;
        var mm = m.d.getMonth() + 1;
        row.children[0].textContent = dd + '.' + (mm < 10 ? '0' + mm : mm) + '.';
        row.children[1].textContent = r.t;
        row.children[2].textContent = r.c;
        row.children[3].textContent = (r.art === 'in' ? '+ ' : '− ') + euro(r.a);
        if (r.art === 'out') row.children[3].classList.add('dtable__amount--out');
        table.appendChild(row);
      });
    }

    // Säulen wachsen erst, wenn die Sektion im Bild ist
    onReveal.push(function () { chart.classList.add('is-drawn'); });
    select(selected);
  })();

  /* =========================================================================
     5) Routenplaner
     ========================================================================= */

  (function initRoute() {
    var page = qs('.dash__page[data-page="route"]');
    if (!page) return;

    var dayList = qs('[data-route-day]', page);
    var countOut = qs('[data-route-count]', page);
    var emptyBox = qs('[data-route-empty]', page);
    var resultBox = qs('[data-route-result]', page);
    var mapBox = qs('[data-route-map]', page);
    var sumBox = qs('[data-route-summary]', page);
    var listBox = qs('[data-route-list]', page);
    var planBtn = qs('[data-route-plan]', page);

    var mode = 'zeit';
    var planned = false;
    var busy = false;

    /* ---- links: die Termine des Tages ---- */
    var onSite = ROUTE_STOPS.filter(function (s) { return s.vorOrt; });
    countOut.textContent = ROUTE_STOPS.length + ' Termine';

    ROUTE_STOPS.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'drstop';
      row.innerHTML = '<span class="drstop__time"></span>' +
                      '<span class="drstop__body"><b></b><i></i></span>' +
                      '<span class="dchip dchip--mini"></span>';
      row.querySelector('.drstop__time').textContent = s.time;
      row.querySelector('.drstop__body b').textContent = s.title;
      row.querySelector('.drstop__body i').textContent = s.addr;
      row.querySelector('.dchip').textContent = s.vorOrt ? 'Vor Ort' : 'Online';
      dayList.appendChild(row);
    });

    /* ---- Strecke zwischen zwei Punkten ---- */
    function legBetween(a, b) {
      var dx = (a.nx - b.nx) * MAP_W;
      var dy = (a.ny - b.ny) * MAP_H;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var distKm = dist * KM_PER_UNIT;
      return { km: distKm, min: Math.round(distKm * 1.9 + 4) };
    }

    // Reihenfolge: entweder wie im Kalender oder immer der nächstgelegene Stopp
    function orderStops() {
      if (mode === 'zeit') return onSite.slice();
      var rest = onSite.slice();
      var here = ROUTE_OFFICE;
      var out = [];
      while (rest.length) {
        var best = 0;
        for (var i = 1; i < rest.length; i++) {
          if (legBetween(here, rest[i]).km < legBetween(here, rest[best]).km) best = i;
        }
        here = rest[best];
        out.push(here);
        rest.splice(best, 1);
      }
      return out;
    }

    function buildRoute() {
      var stops = orderStops();
      var points = [ROUTE_OFFICE].concat(stops, [ROUTE_OFFICE]);
      var legs = [], totalKm = 0, totalMin = 0;
      for (var i = 0; i < points.length - 1; i++) {
        var leg = legBetween(points[i], points[i + 1]);
        legs.push(leg);
        totalKm += leg.km;
        totalMin += leg.min;
      }
      return { stops: stops, points: points, legs: legs, totalKm: totalKm, totalMin: totalMin };
    }

    /* ---- Karte ---- */
    function renderMap(route) {
      var d = route.points.map(function (p, i) {
        return (i ? 'L' : 'M') + (p.nx * MAP_W).toFixed(1) + ' ' + (p.ny * MAP_H).toFixed(1);
      }).join(' ');

      mapBox.innerHTML =
        '<svg viewBox="0 0 ' + MAP_W + ' ' + MAP_H + '" preserveAspectRatio="none" aria-hidden="true">' +
          '<path class="dmap__road" vector-effect="non-scaling-stroke" d="M-10 104 C 90 88, 180 120, 330 96"/>' +
          '<path class="dmap__road" vector-effect="non-scaling-stroke" d="M74 -10 C 96 40, 120 70, 112 142"/>' +
          '<path class="dmap__road" vector-effect="non-scaling-stroke" d="M-10 44 C 80 26, 150 66, 330 40"/>' +
          '<path class="dmap__grid" vector-effect="non-scaling-stroke" d="M0 26 H320 M0 66 H320 M0 106 H320 M40 0 V132 M120 0 V132 M200 0 V132 M280 0 V132"/>' +
          '<path class="dmap__line" vector-effect="non-scaling-stroke" d="' + d + '"/>' +
        '</svg>';

      var line = mapBox.querySelector('.dmap__line');
      if (line && line.getTotalLength) {
        // Großzügig gerechnet: die Linie wird in der Breite gezogen, die
        // gemessene Länge ist deshalb kleiner als die sichtbare.
        line.style.setProperty('--len', Math.ceil(line.getTotalLength() * 2.4));
      }

      route.points.slice(0, -1).forEach(function (p, i) {
        var pin = document.createElement('span');
        pin.className = 'dmap__pin' + (i === 0 ? ' dmap__pin--home' : '');
        pin.style.left = (p.nx * 100).toFixed(2) + '%';
        pin.style.top = (p.ny * 100).toFixed(2) + '%';
        pin.style.animationDelay = (reduceMotion ? 0 : 0.25 + i * 0.12).toFixed(2) + 's';
        pin.textContent = i === 0 ? '' : i;
        mapBox.appendChild(pin);
      });
    }

    /* ---- Kennzahlen und Liste ---- */
    function renderSummary(route) {
      var start = timeToMinutes(route.stops[0].time) - route.legs[0].min;
      var chips = [
        '<span class="dsum"><b>' + route.stops.length + '</b> Stopps</span>',
        '<span class="dsum"><b>' + route.totalMin + '</b> min Fahrt</span>',
        '<span class="dsum"><b>' + km(route.totalKm) + '</b></span>',
        '<span class="dsum">Abfahrt <b>' + minutesToTime(start) + '</b></span>'
      ];

      var online = ROUTE_STOPS.length - onSite.length;
      if (online > 0) chips.push('<span class="dsum">' + online + ' Online-Termin nicht in der Route</span>');

      // Kürzeste Strecke heißt: die Uhrzeiten stimmen nicht mehr unbedingt.
      if (mode === 'strecke') {
        var sameOrder = route.stops.every(function (s, i) { return s === onSite[i]; });
        if (!sameOrder) chips.push('<span class="dsum dsum--warn">Reihenfolge weicht von den Uhrzeiten ab</span>');
      }

      sumBox.innerHTML = chips.join('');
    }

    function renderList(route) {
      listBox.innerHTML = '';

      function addRow(num, title, sub, time, home) {
        var row = document.createElement('div');
        row.className = 'drow';
        row.innerHTML = '<span class="drow__num' + (home ? ' drow__num--home' : '') + '"></span>' +
                        '<span class="drow__body">' + (time ? '<span class="drow__time"></span>' : '') + '<b></b><i></i></span>';
        row.querySelector('.drow__num').textContent = home ? '' : num;
        row.querySelector('.drow__body b').textContent = title;
        row.querySelector('.drow__body i').textContent = sub;
        if (time) row.querySelector('.drow__time').textContent = time;
        listBox.appendChild(row);
      }

      function addLeg(leg) {
        var el = document.createElement('div');
        el.className = 'dleg';
        el.innerHTML = '<span class="dleg__line"></span><span class="dleg__text"></span>';
        el.querySelector('.dleg__text').textContent = leg.min + ' min · ' + km(leg.km);
        listBox.appendChild(el);
      }

      addRow(0, ROUTE_OFFICE.title, ROUTE_OFFICE.addr, '', true);
      route.stops.forEach(function (s, i) {
        addLeg(route.legs[i]);
        addRow(i + 1, s.title, s.addr, s.time, false);
      });
      addLeg(route.legs[route.legs.length - 1]);
      addRow(0, 'Zurück im Büro', ROUTE_OFFICE.addr, '', true);
    }

    function render() {
      var route = buildRoute();
      renderMap(route);
      renderSummary(route);
      renderList(route);
    }

    function plan() {
      if (busy) return;
      busy = true;
      planBtn.classList.add('is-busy');
      planBtn.textContent = 'Berechnet …';

      var wait = reduceMotion ? 0 : 620;
      window.setTimeout(function () {
        planned = true;
        emptyBox.hidden = true;
        resultBox.hidden = false;
        render();
        planBtn.classList.remove('is-busy');
        planBtn.textContent = 'Neu berechnen';
        busy = false;
      }, wait);
    }

    planBtn.addEventListener('click', plan);

    qsa('[data-route-mode]', page).forEach(function (btn) {
      btn.addEventListener('click', function () {
        qsa('[data-route-mode]', page).forEach(function (b) { b.classList.toggle('is-active', b === btn); });
        mode = btn.getAttribute('data-route-mode');
        if (planned) render();
      });
    });

    // Beim ersten Öffnen der Seite die Route von selbst rechnen – sonst stünde
    // der Bereich rechts nur leer da.
    pageHooks.route = function () {
      if (planned || busy) return;
      window.setTimeout(plan, reduceMotion ? 0 : 380);
    };
  })();

  /* =========================================================================
     5) Übersicht
     ========================================================================= */

  (function initOverview() {
    var page = qs('.dash__page[data-page="uebersicht"]');
    if (!page) return;

    var dateOut = qs('[data-ov-date]', page);
    var labelOut = qs('[data-ov-label]', page);
    var valueOut = qs('[data-ov-value]', page);
    var descOut = qs('[data-ov-desc]', page);
    var chartBox = qs('[data-ov-chart]', page);
    var todayBox = qs('[data-ov-today]', page);
    var todayCount = qs('[data-ov-count]', page);
    var inboxBox = qs('[data-ov-inbox]', page);
    var inboxCount = qs('[data-ov-inbox-count]', page);

    var now = new Date();
    var last = FIN_VALUES[FIN_VALUES.length - 1];

    dateOut.textContent = WEEKDAYS[now.getDay()] + ', ' + now.getDate() + '. ' + MONTHS[now.getMonth()];

    /* ---- Die große Kennzahl mit ihren vier Reitern ---- */

    // Termine des laufenden Monats zusammenzählen – dieselbe Quelle wie der Kalender
    var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var monthEvents = 0;
    for (var d = 1; d <= daysInMonth; d++) {
      monthEvents += eventsOfDay(new Date(now.getFullYear(), now.getMonth(), d)).length;
    }

    var computed = {
      umsatz: euro(last.in),
      gewinn: euro(last.in - last.out),
      termine: String(monthEvents)
    };

    var tabButtons = qsa('[data-ov-tab]', page);

    function selectTab(id) {
      var tab = null;
      OVERVIEW_TABS.forEach(function (t) { if (t.id === id) tab = t; });
      if (!tab) return;
      labelOut.textContent = tab.label;
      valueOut.textContent = tab.value || computed[tab.id] || '–';
      descOut.textContent = tab.desc;
      tabButtons.forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-ov-tab') === id); });
    }

    tabButtons.forEach(function (btn) {
      btn.addEventListener('click', function () { selectTab(btn.getAttribute('data-ov-tab')); });
    });
    selectTab('umsatz');

    /* ---- Jahresverlauf: Fläche und Linie ---- */
    var year = OVERVIEW_YEAR_START.concat(FIN_VALUES.map(function (v) { return v.in; }));
    var CW = 320, CH = 100;
    var top = Math.max.apply(null, year) * 1.15;
    var points = year.map(function (v, i) {
      return { x: i / (year.length - 1) * CW, y: CH - v / top * CH };
    });
    var line = points.map(function (p, i) {
      return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
    }).join(' ');

    var labels = '';
    for (var i = year.length - 1; i >= 0; i--) {
      var md = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels += '<span' + (i === 0 ? ' class="is-now"' : '') + '>' + MONTHS_SHORT[md.getMonth()] + '</span>';
    }

    chartBox.innerHTML =
      '<div class="dov__plot">' +
        '<svg viewBox="0 0 ' + CW + ' ' + CH + '" preserveAspectRatio="none" aria-hidden="true">' +
          '<path class="dov__grid" vector-effect="non-scaling-stroke" d="M0 25H320M0 50H320M0 75H320"/>' +
          '<path class="dov__area" d="' + line + ' L' + CW + ' ' + CH + ' L0 ' + CH + ' Z"/>' +
          '<path class="dov__line" vector-effect="non-scaling-stroke" d="' + line + '"/>' +
        '</svg>' +
        '<span class="dov__now" style="left: 100%; top: ' + points[points.length - 1].y.toFixed(1) + '%;"></span>' +
      '</div>' +
      '<div class="dov__labels">' + labels + '</div>';

    /* ---- Tagesüberblick und die neuesten Anfragen ---- */
    function renderToday() {
      var list = eventsOfDay(now);
      todayCount.textContent = list.length + ' Termine';
      todayBox.innerHTML = '';
      list.forEach(function (ev) { todayBox.appendChild(buildEventRow(ev)); });
    }

    function renderInbox() {
      var open = CONTACTS.filter(function (c) { return !c.read; }).length;
      inboxCount.textContent = open ? open + ' ungelesen' : 'alles gelesen';
      inboxBox.innerHTML = '';
      CONTACTS.slice(0, 3).forEach(function (c, n) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'dmail' + (c.read ? ' is-read' : '');
        row.innerHTML = '<span class="dmail__dot"></span>' +
                        '<span class="dmail__body"><b></b><span></span></span>' +
                        '<span class="dmail__time"></span>';
        row.querySelector('.dmail__body b').textContent = c.name;
        row.querySelector('.dmail__body span').textContent = c.subject;
        row.querySelector('.dmail__time').textContent = c.time;
        row.addEventListener('click', function () {
          showPage('anfragen', false);
          openContact(n);
        });
        inboxBox.appendChild(row);
      });
    }

    renderToday();
    renderInbox();

    // Beim Zurückkommen auf die Übersicht stimmen die gelesenen Anfragen wieder
    pageHooks.uebersicht = renderInbox;
  })();

  /* =========================================================================
     6) Anfragen (Kontaktformular der Website)
     ========================================================================= */

  (function initContacts() {
    var page = qs('.dash__page[data-page="anfragen"]');
    if (!page) return;

    var list = qs('[data-inbox-list]', page);
    var detail = qs('[data-inbox-detail]', page);
    var unreadChip = qs('[data-inbox-unread]', page);
    var countOut = qs('[data-inbox-count]', page);
    var readAllBtn = qs('[data-inbox-readall]', page);
    var navBadge = qs('[data-nav-inbox]');
    var selected = -1;

    function unreadCount() {
      return CONTACTS.filter(function (c) { return !c.read; }).length;
    }

    function renderCounters() {
      var n = unreadCount();
      unreadChip.textContent = n ? n + ' ungelesen' : 'Alles gelesen';
      countOut.textContent = CONTACTS.length + ' Einträge';
      if (navBadge) {
        navBadge.textContent = String(n);
        navBadge.hidden = n === 0;
      }
    }

    function renderList() {
      list.innerHTML = '';
      CONTACTS.forEach(function (c, i) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'dmail' + (c.read ? ' is-read' : '') + (i === selected ? ' is-active' : '');
        row.innerHTML = '<span class="dmail__dot"></span>' +
                        '<span class="dmail__body"><b></b><span></span></span>' +
                        '<span class="dmail__time"></span>';
        row.querySelector('.dmail__body b').textContent = c.name;
        row.querySelector('.dmail__body span').textContent = c.subject;
        row.querySelector('.dmail__time').textContent = c.time;
        row.addEventListener('click', function () { select(i); });
        list.appendChild(row);
      });
    }

    function renderDetail() {
      var c = CONTACTS[selected];
      if (!c) {
        detail.innerHTML = '<div class="ddetail--empty">' + ICON_MAIL +
          '<p>Links eine Anfrage auswählen – hier steht dann die ganze Nachricht.</p></div>';
        return;
      }
      detail.innerHTML =
        '<div class="ddetail">' +
          '<div class="ddetail__head">' +
            '<h4 class="ddetail__title"></h4>' +
            '<p class="ddetail__sub"></p>' +
          '</div>' +
          '<div class="ddetail__body">' +
            '<div class="dfields">' +
              '<div class="dfield"><b>E-Mail</b><span data-f="mail"></span></div>' +
              '<div class="dfield"><b>Telefon</b><span data-f="tel"></span></div>' +
              '<div class="dfield"><b>Objekt</b><span data-f="objekt"></span></div>' +
              '<div class="dfield"><b>Eingegangen</b><span data-f="time"></span></div>' +
            '</div>' +
            '<p class="dlabel">Nachricht</p>' +
            '<p class="dmessage"></p>' +
          '</div>' +
          '<div class="ddetail__foot">' +
            '<span class="dbtn dbtn--light">Antworten</span>' +
            '<span class="dbtn dbtn--ghost">Als Kunde speichern</span>' +
            '<span class="dbtn dbtn--ghost">Termin anlegen</span>' +
          '</div>' +
        '</div>';
      detail.querySelector('.ddetail__title').textContent = c.name;
      detail.querySelector('.ddetail__sub').textContent = c.subject;
      detail.querySelector('[data-f="mail"]').textContent = c.mail;
      detail.querySelector('[data-f="tel"]').textContent = c.tel;
      detail.querySelector('[data-f="objekt"]').textContent = c.objekt;
      detail.querySelector('[data-f="time"]').textContent = c.time;
      detail.querySelector('.dmessage').textContent = c.text;
    }

    function select(i) {
      selected = i;
      if (CONTACTS[i]) CONTACTS[i].read = true;   // Öffnen heißt gelesen, wie im Mailprogramm
      renderList();
      renderDetail();
      renderCounters();
    }

    readAllBtn.addEventListener('click', function () {
      CONTACTS.forEach(function (c) { c.read = true; });
      renderList();
      renderCounters();
    });

    openContact = select;

    renderList();
    renderDetail();
    renderCounters();

    // Beim ersten Aufschlagen die neueste Anfrage öffnen
    pageHooks.anfragen = function () {
      if (selected < 0) select(0);
    };
  })();

  /* =========================================================================
     7) Kunden (Suchprofil und passende Objekte)
     ========================================================================= */

  (function initCustomers() {
    var page = qs('.dash__page[data-page="kunden"]');
    if (!page) return;

    var list = qs('[data-cust-list]', page);
    var detail = qs('[data-cust-detail]', page);
    var countOut = qs('[data-cust-count]', page);
    var selected = 0;

    countOut.textContent = CUSTOMERS.length + ' Kunden';

    function renderList() {
      list.innerHTML = '';
      CUSTOMERS.forEach(function (c, i) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'dmail dmail--person' + (i === selected ? ' is-active' : '');
        row.innerHTML = '<span class="dmail__dot"></span>' +
                        '<span class="dmail__body"><b></b><span></span></span>' +
                        '<span class="dmail__time"></span>';
        row.querySelector('.dmail__body b').textContent = c.name;
        row.querySelector('.dmail__body span').textContent = c.art + ' · ' + c.profil[0][1];
        row.querySelector('.dmail__time').textContent = c.matches.length
          ? c.matches.length + ' Treffer'
          : c.since;
        row.addEventListener('click', function () { select(i); });
        list.appendChild(row);
      });
    }

    function renderDetail() {
      var c = CUSTOMERS[selected];
      if (!c) return;

      var fields = c.profil.map(function (f) {
        return '<div class="dfield"><b>' + esc(f[0]) + '</b><span>' + esc(f[1]) + '</span></div>';
      }).join('');

      var matches = c.matches.length
        ? c.matches.map(function (m) {
            return '<div class="dmatch">' +
                     '<span><b>' + esc(m.t) + '</b><span class="dmatch__sub">' + esc(m.s) + '</span></span>' +
                     '<span class="dmatch__score">' + m.p + ' %</span>' +
                     '<span class="dmatch__bar"><i style="width:' + m.p + '%"></i></span>' +
                   '</div>';
          }).join('')
        : '<p class="dmessage">Für dieses Profil gibt es im Bestand noch kein passendes Objekt.</p>';

      detail.innerHTML =
        '<div class="ddetail">' +
          '<div class="ddetail__head">' +
            '<h4 class="ddetail__title">' + esc(c.name) + '</h4>' +
            '<p class="ddetail__sub">' + esc(c.art) + ' · in der Datenbank ' + esc(c.since) + '</p>' +
          '</div>' +
          '<div class="ddetail__body">' +
            '<p class="dlabel">Suchprofil</p>' +
            '<div class="dfields" style="margin-top:-6px">' + fields + '</div>' +
            '<p class="dlabel">Passende Objekte im Bestand</p>' +
            '<div class="dchecks" style="margin-top:-6px">' + matches + '</div>' +
          '</div>' +
          '<div class="ddetail__foot">' +
            '<span class="dbtn dbtn--light">Objekte vorschlagen</span>' +
            '<span class="dbtn dbtn--ghost">Profil bearbeiten</span>' +
          '</div>' +
        '</div>';
    }

    function select(i) {
      selected = i;
      renderList();
      renderDetail();
    }

    select(0);
  })();

  /* =========================================================================
     8) Aufgaben
     ========================================================================= */

  (function initTasks() {
    var page = qs('.dash__page[data-page="aufgaben"]');
    if (!page) return;

    var list = qs('[data-task-list]', page);
    var detail = qs('[data-task-detail]', page);
    var countOut = qs('[data-task-count]', page);
    var filter = 'offen';
    var selected = -1;

    function visible() {
      return TASKS.filter(function (t) {
        return filter === 'alle' || (filter === 'offen' ? !t.done : t.done);
      });
    }

    function renderList() {
      var shown = visible();
      countOut.textContent = TASKS.filter(function (t) { return !t.done; }).length + ' offen';
      list.innerHTML = '';

      if (!shown.length) {
        var none = document.createElement('p');
        none.className = 'dash__empty';
        none.textContent = 'Keine Aufgaben in dieser Ansicht.';
        list.appendChild(none);
        return;
      }

      shown.forEach(function (t) {
        var i = TASKS.indexOf(t);
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'dtask' + (t.done ? ' is-done' : '') + (i === selected ? ' is-active' : '');
        row.innerHTML = '<span class="dbox">' + ICON_CHECK + '</span>' +
                        '<span><span class="dtask__title"></span><span class="dtask__meta"></span></span>' +
                        '<span class="dwho"></span>';
        row.querySelector('.dtask__title').textContent = t.title;
        row.querySelector('.dtask__meta').innerHTML = t.urgent && !t.done
          ? '<em>' + esc(t.due) + '</em>'
          : esc(t.due);
        row.querySelector('.dwho').textContent = t.who;

        // Klick auf das Kästchen hakt ab, Klick auf die Zeile öffnet sie rechts
        row.querySelector('.dbox').addEventListener('click', function (ev) {
          ev.stopPropagation();
          t.done = !t.done;
          if (t.done && t.due !== 'Erledigt') t.due = 'Erledigt';
          renderList();
          if (i === selected) renderDetail();
        });
        row.addEventListener('click', function () { select(i); });
        list.appendChild(row);
      });
    }

    function renderDetail() {
      var t = TASKS[selected];
      if (!t) {
        detail.innerHTML = '<div class="ddetail--empty">' + ICON_LIST +
          '<p>Links eine Aufgabe auswählen – hier stehen Beschreibung und Checkliste.</p></div>';
        return;
      }

      detail.innerHTML =
        '<div class="ddetail">' +
          '<div class="ddetail__head">' +
            '<h4 class="ddetail__title">' + esc(t.title) + '</h4>' +
            '<p class="ddetail__sub">' + esc(t.due) + ' · zugewiesen an ' + esc(t.who) + '</p>' +
          '</div>' +
          '<div class="ddetail__body">' +
            '<p class="dmessage" style="margin-top:0">' + esc(t.text) + '</p>' +
            '<p class="dlabel">Checkliste</p>' +
            '<div class="dchecks" style="margin-top:-6px" data-steps></div>' +
          '</div>' +
          '<div class="ddetail__foot">' +
            '<span class="dbtn dbtn--light">Erledigt melden</span>' +
            '<span class="dbtn dbtn--ghost">Weitergeben</span>' +
          '</div>' +
        '</div>';

      var steps = detail.querySelector('[data-steps]');
      t.steps.forEach(function (step) {
        var item = document.createElement('button');
        item.type = 'button';
        item.className = 'dcheck' + (step.done ? ' is-done' : '');
        item.innerHTML = '<span class="dbox">' + ICON_CHECK + '</span><span></span>';
        item.querySelector('span:last-child').textContent = step.t;
        item.addEventListener('click', function () {
          step.done = !step.done;
          renderDetail();
        });
        steps.appendChild(item);
      });
    }

    function select(i) {
      selected = i;
      renderList();
      renderDetail();
    }

    qsa('[data-task-filter]', page).forEach(function (btn) {
      btn.addEventListener('click', function () {
        qsa('[data-task-filter]', page).forEach(function (b) { b.classList.toggle('is-active', b === btn); });
        filter = btn.getAttribute('data-task-filter');
        renderList();
      });
    });

    renderList();
    renderDetail();

    // Beim ersten Aufschlagen die oberste offene Aufgabe zeigen
    pageHooks.aufgaben = function () {
      if (selected < 0) select(0);
    };
  })();

  /* =========================================================================
     9) Einblenden beim Reinscrollen
     ========================================================================= */

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        section.classList.add('is-in');
        onReveal.forEach(function (fn) { fn(); });
        moveGlider();
        io.disconnect();
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -10% 0px' });
    io.observe(section);
  } else {
    section.classList.add('is-in');
    onReveal.forEach(function (fn) { fn(); });
  }
})();
