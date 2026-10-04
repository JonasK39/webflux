/* ==========================================================================
   webflux – Kontaktseite (kontakt.html)
   1) Grund: Mit der Wahl klappen die Teile darunter auf. Bei „Auftrag“ kommt
      die Wahl der Accounts dazu, bei jedem Grund die Angaben. Der Grund ändert
      außerdem Button-Text, Platzhalter und ob die Nachricht Pflicht ist – das
      steht als data-button / data-message / data-placeholder an den Radios.
   2) Accounts: Solo oder Team; die weiße Pille im Schalter wird auf den aktiven
      Knopf gemessen (wie bei den Preisen). Beim Team setzt der Regler die Zahl
      der Accounts, die gestapelten Kreise zeigen sie (einer pro Account).
   3) Absenden: Felder prüfen, Fehler unter dem Feld zeigen, sonst Dankeseite.

   MIT NICHTS VERBUNDEN: send() verschickt nichts. Wenn die Anfrage später
   irgendwohin soll (Mail, Kalender, CRM), ist das der einzige Ort dafür – die
   Dankeseite erscheint erst, wenn das Versprechen von send() erfüllt ist.
   ========================================================================== */

(function () {
  'use strict';

  var form = document.getElementById('kontakt-form');
  if (!form) return;

  var card       = form.parentNode;
  var done       = card.querySelector('.kdone');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function all(sel, root) { return Array.prototype.slice.call((root || form).querySelectorAll(sel)); }
  function fold(name) { return form.querySelector('[data-fold="' + name + '"]'); }
  function open(el, on) { if (el) el.classList.toggle('is-open', !!on); }

  // Buchstaben in den Kreisen – reine Deko wie bei den Preisen
  var INITIALS = ['M', 'L', 'T', 'A', 'J', 'S', 'F', 'N', 'P', 'C',
                  'R', 'E', 'V', 'G', 'H', 'I', 'O', 'D', 'Y', 'U'];
  var LETTER_MIN = 15;   // ab diesem Abstand ist vom Buchstaben genug zu sehen

  var LABELS = {
    erstgespraech: 'Erstgespräch',
    auftrag: 'Auftrag',
    frage: 'Frage',
    support: 'Support'
  };

  /* ---------------------------------------------------------------------
     Zustand lesen
     --------------------------------------------------------------------- */
  var reasons   = all('input[name="grund"]');
  var planRadios = all('input[name="plan"]');
  var submitBtn = form.querySelector('[data-submit]');
  var message   = form.elements.nachricht;
  var messageOpt = form.querySelector('[data-message-opt]');

  function checked(radios) {
    for (var i = 0; i < radios.length; i++) if (radios[i].checked) return radios[i];
    return null;
  }

  function reasonInput() { return checked(reasons); }
  function plan() { var r = checked(planRadios); return r ? r.value : 'solo'; }
  function messageRequired() {
    var r = reasonInput();
    return !!r && r.getAttribute('data-message') === 'required';
  }

  /* ---------------------------------------------------------------------
     2) Accounts: Schalter, Regler, Kreise
     --------------------------------------------------------------------- */
  var pswitch = form.querySelector('.pswitch');
  var glider  = form.querySelector('.pswitch__glider');
  var pitems  = all('.pswitch__item');

  function moveGlider() {
    if (!pswitch || !glider) return;
    var active = pswitch.querySelector('.pswitch__item.is-active');
    if (!active || !active.offsetWidth) return;
    glider.style.width = active.offsetWidth + 'px';
    glider.style.height = active.offsetHeight + 'px';
    glider.style.transform = 'translate(' + active.offsetLeft + 'px, ' + active.offsetTop + 'px)';
    glider.style.opacity = '1';
    pswitch.classList.add('is-ready');
  }

  var range  = form.querySelector('[data-range]');
  var stack  = form.querySelector('[data-stack]');
  var outCount = form.querySelector('[data-count]');
  var MIN = range ? (parseFloat(range.min) || 1) : 1;
  var MAX = range ? (parseFloat(range.max) || 1) : 1;
  var DEFAULT_COUNT = range ? range.defaultValue : '4';

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

  // Abstand der Kreise: so viel, dass sie sich überlappen – aber nie mehr, als in
  // den Kasten passt. Ist er zu klein, bleiben die Kreise leer (.is-plain).
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

  function count() {
    if (!range) return 1;
    var v = Math.round(parseFloat(range.value));
    return Math.min(MAX, Math.max(MIN, isFinite(v) ? v : MIN));
  }

  function renderTeam() {
    if (!range) return;
    var n = count();

    if (stack && dots.length) {
      stack.style.width = ((n - 1) * layoutStack() + dots[0].offsetWidth) + 'px';
      dots.forEach(function (dot, k) {
        dot.classList.toggle('is-on', k < n);
        dot.classList.toggle('is-last', k === n - 1);
      });
    }

    // Füllstand der Schiene; der Griff sitzt an den Enden nicht ganz außen
    var f = MAX > MIN ? (n - MIN) / (MAX - MIN) : 1;
    range.style.setProperty('--fill', 'calc(' + (f * 100).toFixed(2) + '% + ' + ((0.5 - f) * 20).toFixed(2) + 'px)');

    if (outCount) outCount.textContent = String(n);
    // Singular, solange nur einer gewählt ist
    var head = outCount && outCount.parentNode;
    if (head) head.lastChild.nodeValue = n === 1 ? ' Account' : ' Accounts';
  }

  function renderPlan() {
    var on = plan();
    pitems.forEach(function (item) {
      var input = item.querySelector('input');
      item.classList.toggle('is-active', !!input && input.checked);
    });
    open(fold('team'), on === 'team');
    moveGlider();
    renderTeam();
  }

  planRadios.forEach(function (r) { r.addEventListener('change', renderPlan); });
  if (range) {
    range.addEventListener('input', renderTeam);
    range.addEventListener('change', renderTeam);
  }

  function measure() { moveGlider(); renderTeam(); }
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

  /* ---------------------------------------------------------------------
     1) Grund
     --------------------------------------------------------------------- */
  function renderReason() {
    var r = reasonInput();
    open(fold('details'), !!r);
    open(fold('accounts'), !!r && r.value === 'auftrag');
    if (!r) return;

    if (submitBtn) submitBtn.textContent = r.getAttribute('data-button') || 'Absenden';
    if (message) message.placeholder = r.getAttribute('data-placeholder') || '';
    if (messageOpt) messageOpt.hidden = messageRequired();

    // Eine Nachricht, die jetzt keine Pflicht mehr ist, braucht den Fehler nicht mehr
    if (message && !messageRequired()) setError(message, '');
    measure();
  }

  reasons.forEach(function (r) { r.addEventListener('change', renderReason); });

  /* ---------------------------------------------------------------------
     3) Felder prüfen
     --------------------------------------------------------------------- */
  var RULES = {
    name: function (v) {
      return v.trim() ? '' : 'Wie dürfen wir dich nennen?';
    },
    email: function (v) {
      v = v.trim();
      if (!v) return 'Bitte gib deine E-Mail-Adresse an.';
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Das sieht noch nicht nach einer E-Mail-Adresse aus.';
    },
    nachricht: function (v) {
      return !messageRequired() || v.trim() ? '' : 'Schreib uns kurz, worum es geht.';
    }
  };

  function setError(input, text) {
    var wrap = input.closest('.kfield');
    var out  = wrap && wrap.querySelector('.kfield__err');
    if (!wrap || !out) return;
    out.textContent = text;
    wrap.classList.toggle('is-invalid', !!text);
    if (text) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function check(input) {
    var rule = RULES[input.name];
    var text = rule ? rule(input.value) : '';
    setError(input, text);
    return !text;
  }

  // Felder, die schon einen Fehler zeigen, prüfen sich beim Tippen neu – so
  // verschwindet die Meldung, sobald es stimmt, und taucht nicht beim ersten Buchstaben auf.
  Object.keys(RULES).forEach(function (name) {
    var input = form.elements[name];
    if (!input) return;
    input.addEventListener('input', function () {
      if (input.closest('.kfield').classList.contains('is-invalid')) check(input);
    });
    input.addEventListener('blur', function () {
      if (input.value.trim()) check(input);
    });
  });

  function validate() {
    var first = null;
    Object.keys(RULES).forEach(function (name) {
      var input = form.elements[name];
      if (input && !check(input) && !first) first = input;
    });
    if (first) first.focus();
    return !first;
  }

  /* ---------------------------------------------------------------------
     Absenden
     --------------------------------------------------------------------- */
  function collect() {
    var r = reasonInput();
    var data = {
      grund: r.value,
      name: form.elements.name.value.trim(),
      email: form.elements.email.value.trim(),
      telefon: form.elements.telefon.value.trim(),
      buero: form.elements.buero.value.trim(),
      nachricht: form.elements.nachricht.value.trim()
    };
    if (r.value === 'auftrag') {
      data.plan = plan();
      data.accounts = data.plan === 'solo' ? 1 : count();
    }
    return data;
  }

  // HIER später senden. Bekommt die Anfrage als Objekt (grund, name, email, telefon,
  // buero, nachricht und bei „Auftrag“ plan + accounts) und gibt ein Versprechen
  // zurück: erfüllt = angekommen, abgelehnt = Fehler. Bis dahin passiert nichts.
  function send(data) {
    return Promise.resolve(data);
  }

  function recap(data) {
    var parts = [LABELS[data.grund] || data.grund];
    if (data.plan === 'solo') parts.push('Solo');
    if (data.plan === 'team') parts.push('Team mit ' + data.accounts + (data.accounts === 1 ? ' Account' : ' Accounts'));
    parts.push('Antwort an ' + data.email);
    return parts.join(' · ');
  }

  function showDone(data) {
    var first = data.name.split(/\s+/)[0];
    done.querySelector('[data-done-title]').textContent = first ? 'Danke, ' + first + '.' : 'Danke.';
    done.querySelector('[data-done-recap]').textContent = recap(data);
    form.hidden = true;
    done.hidden = false;
    // Das Formular war lang, die Dankeseite ist kurz: zurück an den Kartenanfang
    var top = card.getBoundingClientRect().top + window.scrollY - 120;
    window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' });
    done.querySelector('[data-done-title]').focus({ preventScroll: true });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!reasonInput()) return;
    if (!validate()) return;
    var data = collect();
    send(data).then(function () { showDone(data); });
  });

  /* Noch eine Nachricht: alles zurück auf Anfang */
  var again = done.querySelector('[data-again]');
  if (again) {
    again.addEventListener('click', function () {
      form.reset();
      all('.kfield').forEach(function (f) {
        var out   = f.querySelector('.kfield__err');   // Telefon und Büro haben keine
        var input = f.querySelector('input, textarea');
        f.classList.remove('is-invalid');
        if (out) out.textContent = '';
        if (input) input.removeAttribute('aria-invalid');
      });
      if (range) range.value = DEFAULT_COUNT;
      if (submitBtn) submitBtn.textContent = 'Absenden';
      renderReason();
      renderPlan();
      done.hidden = true;
      form.hidden = false;
      measure();
      var top = card.getBoundingClientRect().top + window.scrollY - 120;
      window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }

  /* Startzustand aus dem HTML (auch nach Neuladen: der Browser merkt sich oft die Wahl) */
  renderPlan();
  renderReason();
})();
