/* ==========================================================================
   webflux – Hero-Logik
   1) Wortroller in der Headline (Dauerschleife, unabhängig vom Scrollen)
   2) Scroll-gesteuerte Phasen wie bei Superwhisper:
      Intro ausblenden -> Demo einblenden -> Ränder abschneiden & Frame einrahmen -> Nav einblenden
      Die seitlichen schwarzen Balken waren früher im Video eingebacken; jetzt schneidet
      die Seite sie selbst per clip-path ab (gestochen scharf, unabhängig von der Videodatei).
      Der Fortschritt folgt der Scrollposition mit weichem Nachlauf, damit die
      groben Rasterstufen eines Mausrads nicht als Stocken durchschlagen.
   3) Video ist an die Scrollposition gekoppelt: runter = vorwärts, hoch = rückwärts,
      genau ein Durchlauf über die gesamte Hero-Strecke, keine Wiederholung.
      Mit dem Attribut data-reverse am <video> ist es umgekehrt (runter = rückwärts, z. B. "nyc").
      Zusätzlich treibt das Bild ohne Scrollen langsam vor und zurück (Eigenbewegung),
      damit der Hintergrund nie stillsteht; zwei Video-Ebenen blenden dabei weich
      zwischen den Einzelbildern über, damit die Zeitlupe flüssig wirkt.
   ========================================================================== */

(function () {
  'use strict';

  var hero = document.querySelector('.hero');
  if (!hero) return;

  var frame   = hero.querySelector('.hero__frame');
  var content = hero.querySelector('.hero__content');
  var demo    = hero.querySelector('.hero__demo');
  var cue     = hero.querySelector('.hero__cue');
  var video   = hero.querySelector('.hero__video');
  var track   = hero.querySelector('.hero__roll-track');
  var nav     = document.querySelector('.floating-nav');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Rand-Beschnitt (entspricht dem Effekt aus dem früheren Clip):
  // Die Balken wachsen linear mit dem Scroll-Fortschritt bis SIDE_CUT der dargestellten Videobreite
  // pro Seite. Bezug ist die per object-fit: cover dargestellte Breite, damit es auf jedem
  // Seitenverhältnis so aussieht, als wären die Balken im Video selbst (im Hochformat, wo das Video
  // ohnehin seitlich beschnitten ist, bleiben sie deshalb unsichtbar – genau wie vorher).
  var SIDE_CUT   = 0.135;   // Anteil der Videobreite pro Seite am Ende (im alten Clip: 258 px von 1920)
  var videoRatio = 16 / 9;  // Seitenverhältnis des Clips; wird aus den Video-Metadaten aktualisiert

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  // weiche 0..1-Kurve zwischen a und b
  function smooth(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  // Nächster Animationsframe; im Hintergrund-Tab (dort feuern keine Frames) ein kurzer Timer
  function nextFrame(cb) {
    return document.hidden ? window.setTimeout(cb, 16) : window.requestAnimationFrame(cb);
  }

  /* ---------------------------------------------------------------------
     1) Wortroller
     --------------------------------------------------------------------- */
  // Zwei Arten des Wechsels (Klasse .hero__roll--fade auf .hero__roll):
  // - Blur:   Wörter liegen übereinander, das alte wird unscharf und verschwindet,
  //           das nächste erscheint unscharf und wird scharf (kein Rollen)
  // - Rollen: Wörter laufen von unten ein und kommen dabei unscharf herein
  if (track && track.children.length > 1) {
    var roll  = track.parentNode;
    var count = track.children.length;
    track.appendChild(track.children[0].cloneNode(true)); // Klon für nahtlose Schleife (nur Rollen)
    var words = track.children;
    var index = 0;
    var INTERVAL      = 2300; // ms pro Wort beim Rollen
    var FADE_INTERVAL = 4200; // ms pro Wort beim Blur-Wechsel (der Übergang selbst dauert ~2,2 s)
    var rollTimer = null;

    function isFade() { return roll.classList.contains('hero__roll--fade'); }

    function clearWordStates() {
      for (var k = 0; k < words.length; k++) {
        words[k].classList.remove('is-entering', 'is-leaving', 'is-current');
      }
    }

    // Wort-Zustände setzen; der Reflow dazwischen startet die Animationen bei jedem Durchlauf neu
    function setWordStates(leaving, entering) {
      clearWordStates();
      void track.offsetWidth;
      if (leaving) leaving.classList.add('is-leaving');
      entering.classList.add('is-current', 'is-entering');
    }

    function stepRoll() {
      if (index >= count) {
        // Wir stehen auf dem Klon (sieht aus wie Wort 1): ohne Animation zurückspringen
        track.style.transition = 'none';
        index = 0;
        track.style.setProperty('--i', index);
        void track.offsetHeight; // Reflow erzwingen, damit der Sprung nicht animiert wird
        track.style.transition = '';
      }
      index += 1;
      track.style.setProperty('--i', index);
      setWordStates(null, words[index]);
    }

    function stepFade() {
      var prev = index % count;
      index = (prev + 1) % count;
      setWordStates(words[prev], words[index]);
    }

    function startRoll() {
      if (rollTimer) clearInterval(rollTimer);
      rollTimer = setInterval(function () {
        if (isFade()) stepFade(); else stepRoll();
      }, isFade() ? FADE_INTERVAL : INTERVAL);
    }

    roll.classList.add('hero__roll--fade');     // Blur-Wechsel
    setWordStates(null, words[0]);              // auch das erste Wort kommt unscharf herein
    startRoll();
  }

  /* ---------------------------------------------------------------------
     2) Scroll-Phasen
     Der Fortschritt springt nicht hart auf die Scrollposition, sondern läuft
     ihr weich nach. Ein Mausrad scrollt in festen Stufen (rund 100 px pro
     Rasterung): ohne Nachlauf rückt der Effekt bei jeder Stufe ein Stück vor
     und steht sofort wieder still – genau das Stocken, das am Trackpad nicht
     auftritt. Mit Nachlauf werden die Stufen zu einer durchgehenden Bewegung,
     die nach der letzten Stufe sauber ausläuft und dann exakt anhält.
     --------------------------------------------------------------------- */
  var GLIDE_TIME   = 0.15;   // Sekunden: ungefähre Zeit, die der Nachlauf bis zur Scrollposition braucht
  var GLIDE_SETTLE = 0.5;    // Pixel Restabstand, ab dem der Nachlauf einrastet
  var GLIDE_STILL  = 12;     // Pixel pro Sekunde, ab denen die Restgeschwindigkeit als "steht" gilt

  var progress  = 0;      // dargestellter Fortschritt 0..1 (läuft targetP nach, treibt auch das Video)
  var targetP   = 0;      // Fortschritt laut aktueller Scrollposition 0..1
  var syncVideo = null;   // wird in Abschnitt 3 gesetzt
  var glideRaf  = null;   // angeforderter Frame des Nachlaufs; null = Schleife steht
  var glideTick = 0;      // Zeitstempel des letzten Schritts
  var glideVel  = 0;      // aktuelle Geschwindigkeit des Nachlaufs (Fortschritt pro Sekunde)
  var lastOut = -1;
  var lastFrameSide = -1; // zuletzt gemeldeter Endrand der Hero-Karte (px)
  var viewW = 0, viewH = 0, heroRange = 1;   // nur bei Größenänderung gemessen, nicht in jedem Frame

  function measure() {
    viewH     = window.innerHeight;
    viewW     = window.innerWidth;
    heroRange = Math.max(1, hero.offsetHeight - viewH);   // Strecke, in der der Hero klebt
  }

  function readTarget() {
    targetP = clamp(window.scrollY / heroRange, 0, 1);    // 0 = ganz oben, 1 = Hero fertig
  }

  // Alles zeichnen, was am Fortschritt p hängt
  function render(p) {
    var vh = viewH;
    var vw = viewW;

    if (syncVideo) syncVideo(p);

    // Phase A: Intro ausblenden
    var out = smooth(0.04, 0.24, p);
    if (out >= 1 && lastOut >= 1) { /* Intro schon weg: nichts neu schreiben */ }
    else {
    content.style.opacity = String(1 - out);
    // --hero-lift kommt aus css/style.css (Grundposition des Intro-Blocks)
    content.style.transform = reduceMotion
      ? 'translateY(var(--hero-lift))'
      : 'translateY(calc(var(--hero-lift) - ' + (out * 48).toFixed(1) + 'px)) scale(' + (1 - out * 0.05).toFixed(4) + ')';
    content.style.visibility = out >= 1 ? 'hidden' : 'visible';
    content.style.pointerEvents = out > 0.5 ? 'none' : 'auto';
    }
    lastOut = out;
    if (cue) cue.style.opacity = String(1 - smooth(0.0, 0.12, p));

    // Phase B: Demo-Block einblenden
    var inn = smooth(0.27, 0.42, p);
    demo.style.opacity = String(inn);
    demo.style.transform = reduceMotion
      ? 'translateY(-50%)'
      : 'translateY(calc(-50% + ' + ((1 - inn) * 36).toFixed(1) + 'px))';
    demo.style.pointerEvents = inn > 0.6 ? 'auto' : 'none';
    demo.setAttribute('aria-hidden', inn > 0.6 ? 'false' : 'true');

    // Phase C: Ränder abschneiden
    //   1) Seitliche Balken: linear über die ganze Hero-Strecke, wie im früheren Clip
    var coverW = Math.max(vw, vh * videoRatio);                  // dargestellte Videobreite (cover)
    var bar    = SIDE_CUT * coverW * p - (coverW - vw) / 2;      // davon im Viewport sichtbar (px je Seite)
    //   2) Zum Schluss (0.64 -> 1) zusätzlich zur abgerundeten Karte einrahmen
    var s      = smooth(0.64, 1, p);
    var card   = Math.max(16, (vw - 1240) / 2) * s;
    var side   = Math.max(0, bar, card);
    // Endrand der Karte (p = 1) als CSS-Variable veröffentlichen: Folgesektionen richten ihren
    // Seitenabstand daran aus und sind so nie breiter als das Bild am Ende des Heros
    var finalSide = Math.max(0, SIDE_CUT * coverW - (coverW - vw) / 2, Math.max(16, (vw - 1240) / 2));
    if (finalSide !== lastFrameSide) {
      lastFrameSide = finalSide;
      document.documentElement.style.setProperty('--frame-side', finalSide.toFixed(1) + 'px');
    }
    var top    = 16 * s;
    var bottom = 16 * s;
    var radius = 24 * s;
    if (side <= 0 && s <= 0) {
      frame.style.clipPath = 'none';
    } else {
      frame.style.clipPath = 'inset(' + top.toFixed(1) + 'px ' + side.toFixed(1) + 'px ' +
                             bottom.toFixed(1) + 'px ' + side.toFixed(1) + 'px' +
                             (radius > 0 ? ' round ' + radius.toFixed(1) + 'px' : '') + ')';
    }

    // Schwebende Navigation
    if (nav) nav.classList.toggle('is-visible', p > 0.72);
  }

  // Ein Schritt des Nachlaufs: eine kritisch gedämpfte Feder zieht den dargestellten
  // Fortschritt zur Scrollposition. Anders als ein einfaches "immer x Prozent des Rests"
  // hat sie ein Gedächtnis für die Geschwindigkeit: Eine neue Radstufe beschleunigt die
  // laufende Bewegung, statt sie neu anzustoßen, und weil sie kritisch gedämpft ist,
  // bremst sie am Ende weich auf null ab – ohne Überschwingen, ohne Ruck.
  // Alles zeitbasiert, also unabhängig von der Bildrate.
  function glide() {
    glideRaf = null;

    var now = performance.now();
    var dt  = clamp((now - glideTick) / 1000, 0, 0.1);   // nach Pausen (z. B. Tabwechsel) kein Sprung
    glideTick = now;

    readTarget();

    if (reduceMotion) {
      progress  = targetP;
      glideVel  = 0;
      glideTick = 0;
      render(progress);
      return;
    }

    // Federschritt (kritisch gedämpft); decay nähert e^-x an, damit kein Math.exp pro Frame nötig ist
    var omega = 2 / GLIDE_TIME;
    var x     = omega * dt;
    var decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    var diff  = progress - targetP;
    var move  = (glideVel + omega * diff) * dt;
    glideVel  = (glideVel - omega * move) * decay;
    progress  = clamp(targetP + (diff + move) * decay, 0, 1);

    // Ausgelaufen: Rest unter einem halben Pixel und praktisch keine Geschwindigkeit mehr.
    // Dann exakt auf die Scrollposition setzen und die Schleife anhalten, statt ewig
    // mit unsichtbaren Restbewegungen weiterzurechnen.
    if (Math.abs(targetP - progress) * heroRange <= GLIDE_SETTLE &&
        Math.abs(glideVel) * heroRange <= GLIDE_STILL) {
      progress  = targetP;
      glideVel  = 0;
      glideTick = 0;
      render(progress);
      return;
    }

    render(progress);
    startGlide();
  }

  function startGlide() {
    if (glideRaf) return;
    // Beim Start aus dem Stillstand einmal nachmessen (z. B. wenn die mobile Adressleiste
    // die Fensterhöhe geändert hat, ohne dass ein resize gefeuert hat), danach nicht mehr
    if (!glideTick) { glideTick = performance.now(); measure(); }
    glideRaf = nextFrame(glide);
  }

  // Ohne Nachlauf direkt auf die Scrollposition: beim Start und bei Größenänderungen
  function snapToScroll() {
    measure();
    readTarget();
    progress  = targetP;
    glideVel  = 0;
    glideTick = 0;
    render(progress);
  }

  window.addEventListener('scroll', startGlide, { passive: true });
  window.addEventListener('resize', snapToScroll);
  snapToScroll();

  /* ---------------------------------------------------------------------
     3) Videozeit = Grundposition laut Scroll + langsame Eigenbewegung
        - Scrollen bestimmt die Grundposition: runter = vorwärts, hoch = rückwärts,
          ein Durchlauf über die gesamte Hero-Strecke (abzüglich DRIFT_SPAN).
        - Ohne Scrollen treibt das Bild innerhalb eines kleinen Zeitfensters (DRIFT_SPAN)
          langsam vor und wieder zurück – sinusförmig, an den Wendepunkten also ohne Ruck –
          damit der Hintergrund nie stillsteht. Beides addiert sich, das Video wiederholt
          sich nie und läuft nie von selbst bis zum Ende.
        - Flüssig trotz Zeitlupe: Der Clip hat nur 25 Bilder pro Sekunde, bei langsamer
          Bewegung käme also nur alle paar hundert Millisekunden ein neues Bild. Deshalb
          liegen zwei identische Video-Ebenen übereinander: die untere zeigt Bild n, die
          obere Bild n+1 und wird mit dem Zwischenwert der Videozeit weich eingeblendet.
          Beim Scrubben (schnelle Bewegung) ist die obere Ebene aus, dann arbeitet nur die
          untere wie bisher.
        - Die Eigenbewegung läuft nur, solange der Hero im Bild und der Tab sichtbar ist;
          bei prefers-reduced-motion entfällt sie ganz.
        - Das Bild kommt bevorzugt aus js/frames.js (WebCodecs, Zeichnen auf ein <canvas>):
          kein <video>-Seek, daher auch in 4K flüssig; die Überblendung zweier Nachbarbilder
          macht dort der Abspieler selbst. Nur ohne WebCodecs oder bei einem Fehler greift der
          beschriebene Weg mit zwei <video>-Ebenen.
     --------------------------------------------------------------------- */
  if (video) {
    var FRAME        = 1 / 25;  // Bildabstand (der Clip hat 25 Bilder pro Sekunde); Seeks rasten darauf ein
    var EASE         = 0.22;    // 0..1: wie schnell das Bild der Scrollposition nachläuft
    var END_MARGIN   = 0.03;    // Sekunden vor dem Ende stoppen, damit der Browser nie "ended" meldet
    var DRIFT_SPAN   = 1.5;     // Sekunden Videozeit, die die Eigenbewegung maximal überstreicht
    var DRIFT_PERIOD = 24;      // Sekunden Echtzeit für einmal vor und wieder zurück

    var scrollTime = 0;     // Grundposition laut Scrollposition (Sekunden Videozeit)
    var driftClock = 0;     // Echtzeit, die die Eigenbewegung bisher gelaufen ist (Sekunden)
    var lastDraw   = 0;     // Zeitstempel des letzten Zeichnens der Eigenbewegung (für die Bildratenbremse)
    var DRIFT_FRAME_MS = 32; // Eigenbewegung höchstens ~30× pro Sekunde zeichnen: sie ist langsam, das halbiert die GPU-Last im Stand
    var lastTick   = 0;     // Zeitstempel des letzten Schritts; 0 = Schleife steht
    var shownTime  = 0;     // Videozeit, die gerade angezeigt wird (nähert sich dem Ziel)
    var loopRaf    = null;
    var ready      = false;
    var inView     = true;
    // Umgekehrte Wiedergabe: Der Clip liegt in Originalrichtung auf der Platte (All-Intra, jedes Bild
    // einzeln anspringbar, Richtung kostet also nichts); die Spiegelung passiert nur beim Bildabruf
    // in applyTime. Gilt für die Videozeit-Logik sonst unverändert (Scroll, Eigenbewegung, Überblendung).
    var reverse    = video.hasAttribute('data-reverse');

    // Zwei Wege, das Bild zu zeigen:
    //  - Abspieler (js/frames.js, WebCodecs): decodiert die Bilder selbst und zeichnet sie auf das <canvas>.
    //    Viel flüssiger als <video>, vor allem bei 4K, weil kein Seek-Umweg über den Videoplayer nötig ist.
    //  - Rückfall: die <video>-Elemente, die per currentTime angesprungen werden (alter Browser, Fehler).
    var canvas    = hero.querySelector('.hero__canvas');
    var Frames    = window.WebfluxFrames;
    var player    = null;       // aktiver Abspieler; null = Rückfall über <video>

    // Die Quellen stehen im Markup (<source media="...">); aus ihnen wählen beide Wege die Stufe
    var clip = {
      sources: [].map.call(video.querySelectorAll('source'), function (s) {
        return { src: s.getAttribute('src'), media: s.getAttribute('media') || '' };
      })
    };

    // Video-Ebenen: base zeigt das aktuelle Bild, top (falls vorhanden) das nächste zum Überblenden
    var blendVideo = hero.querySelector('.hero__video--blend');
    var layers = [video].concat(blendVideo ? [blendVideo] : []).map(function (el) {
      el.muted = true;
      el.removeAttribute('loop');
      el.removeAttribute('autoplay');
      el.pause();
      return { el: el, want: -1 };   // want = zuletzt angefordertes Bild (Index), -1 = unbekannt
    });
    var base = layers[0];
    var top  = layers[1] || null;
    base.el.style.zIndex = '0';
    if (top) { top.el.style.zIndex = '1'; top.el.style.opacity = '0'; }

    function videoLength() {
      if (player) return Math.max(0, player.frameCount * FRAME - END_MARGIN);
      return (isFinite(video.duration) && video.duration > 0) ? video.duration - END_MARGIN : 0;
    }

    // Zeitfenster der Eigenbewegung (nie mehr als die halbe Cliplänge)
    function driftSpan() {
      return reduceMotion ? 0 : Math.min(DRIFT_SPAN, videoLength() / 2);
    }

    // Aktueller Versatz der Eigenbewegung: 0 -> DRIFT_SPAN -> 0, weich (Sinus)
    function driftOffset() {
      var span = driftSpan();
      return span ? span * (1 - Math.cos(2 * Math.PI * driftClock / DRIFT_PERIOD)) / 2 : 0;
    }

    function targetTime() {
      return clamp(scrollTime + driftOffset(), 0, videoLength());
    }

    function driftActive() {
      return ready && inView && !document.hidden && driftSpan() > 0;
    }

    // Bild f auf einer Ebene anfordern (nur wenn es nicht schon angefordert ist)
    function seekLayer(layer, f) {
      if (layer.want === f || layer.el.readyState < 1) return;
      layer.want = f;
      layer.el.currentTime = f * FRAME;
    }

    // Zeigt die Ebene Bild f gerade wirklich an? (angefordert und Seek abgeschlossen)
    function showing(layer, f) {
      return layer.want === f && !layer.el.seeking;
    }

    function swapLayers() {
      var t = base; base = top; top = t;
      base.el.style.zIndex  = '0';
      base.el.style.opacity = '1';   // die neue Basis war eben noch die halbtransparente obere Ebene
      top.el.style.zIndex   = '1';
    }

    // Videozeit t darstellen. blend = weich zwischen zwei Bildern überblenden (Eigenbewegung),
    // sonst nur das nächstliegende Bild (Scrubben).
    function applyTime(t, blend) {
      var x = (reverse ? videoLength() - t : t) / FRAME;   // umgekehrt: Ende des Clips = Scroll-Anfang

      if (player) { player.show(x, blend); return; }

      var lo   = Math.floor(x);
      var last = Math.floor(videoLength() / FRAME);   // letztes anspringbares Bild

      if (!top || !blend || lo >= last) {
        seekLayer(base, Math.min(last, Math.round(x)));
        base.el.style.opacity = '1';
        if (top) top.el.style.opacity = '0';
        return;
      }

      // Wer Bild lo bereits hat, wird Basis; die andere Ebene holt lo+1
      if (base.want !== lo && (top.want === lo || base.want === lo + 1)) swapLayers();
      seekLayer(base, lo);
      seekLayer(top, lo + 1);
      // Erst überblenden, wenn beide Ebenen wirklich das richtige Bild zeigen (sonst kurz Geisterbild)
      top.el.style.opacity = (showing(base, lo) && showing(top, lo + 1)) ? (x - lo).toFixed(3) : '0';
    }

    function schedule() {
      if (!loopRaf) loopRaf = nextFrame(step);
    }

    function step() {
      loopRaf = null;

      var now = performance.now();
      var dt  = lastTick ? Math.min(0.1, (now - lastTick) / 1000) : 0;   // nach Pausen kein Sprung
      lastTick = now;

      var active = driftActive();
      if (active) driftClock += dt;

      var target  = targetTime();
      var diff    = target - shownTime;
      var settled = Math.abs(diff) <= FRAME / 2;   // nah am Ziel: exakt folgen und überblenden
      if (settled) {
        shownTime = target;
      } else {
        if (!player && base.el.seeking) { schedule(); return; }   // <video>: vorigen Seek erst fertig decodieren lassen
        shownTime += diff * (reduceMotion ? 1 : EASE);
      }
      if (!(settled && active && now - lastDraw < DRIFT_FRAME_MS)) {
        lastDraw = now;
        applyTime(shownTime, settled);
      }

      if (active || Math.abs(target - shownTime) > FRAME / 2) schedule();
      else lastTick = 0;                           // Schleife steht, Zeitrechnung beim nächsten Start neu
    }

    // Nach jedem fertigen Seek einmal nachziehen (Überblendung freigeben bzw. Ziel weiterverfolgen)
    layers.forEach(function (layer) {
      layer.el.addEventListener('seeked', schedule);
      layer.el.addEventListener('loadedmetadata', schedule);
    });

    function setTargetFromProgress(p) {
      if (!ready) return;
      scrollTime = clamp(p, 0, 1) * Math.max(0, videoLength() - driftSpan());
      schedule();
    }

    // Der Clip ist bereit (Metadaten da bzw. Abspieler offen): auf die passende Stelle springen
    function onReady(w, h) {
      ready = true;
      if (w && h) videoRatio = w / h;
      // Direkt auf die passende Stelle springen (z. B. nach Reload mitten auf der Seite)
      scrollTime = clamp(progress, 0, 1) * Math.max(0, videoLength() - driftSpan());
      shownTime  = targetTime();
      applyTime(shownTime, true);
      render(progress);   // Rand-Beschnitt mit dem echten Seitenverhältnis neu rechnen
      schedule();        // Eigenbewegung starten
    }

    function onMetadata() {
      onReady(video.videoWidth, video.videoHeight);
    }

    function waitForMetadata() {
      if (video.readyState >= 1) onMetadata();
      else video.addEventListener('loadedmetadata', onMetadata, { once: true });
    }

    // Manche mobile Browser laden Videodaten erst nach einem play(); stumm ist das erlaubt.
    // Direkt danach pausieren wir wieder und springen neu auf die aktuelle Position.
    function kickstart() {
      layers.forEach(function (layer) {
        var kick = layer.el.play();
        if (kick && typeof kick.then === 'function') {
          kick.then(function () {
            layer.el.pause();
            layer.want = -1;                       // play() hat die Zeit verschoben: neu anspringen
            schedule();
          }).catch(function () {});
        }
      });
    }

    // Wie bei <source media>: die erste Quelle, deren Bedingung zutrifft
    function chooseSource(list) {
      for (var i = 0; i < list.length; i++) {
        if (!list[i].media || window.matchMedia(list[i].media).matches) return list[i].src;
      }
      return list[list.length - 1].src;
    }

    // Rückfall: Die <video>-Elemente laden den Clip (Quellen neu gesetzt, Poster steht im Markup) und werden angesprungen
    function useVideoElements() {
      player = null;
      ready  = false;
      if (canvas) canvas.hidden = true;
      layers.forEach(function (layer, i) {
        var el = layer.el;
        el.pause();
        while (el.firstChild) el.removeChild(el.firstChild);
        clip.sources.forEach(function (s) {
          var tag = document.createElement('source');
          tag.src  = s.src;
          tag.type = 'video/mp4';
          if (s.media) tag.media = s.media;
          el.appendChild(tag);
        });
        layer.want = -1;
        el.style.opacity = i === 0 ? '1' : '0';
        el.preload = 'auto';
        el.load();
      });
      base = layers[0];
      top  = layers[1] || null;
      base.el.style.zIndex = '0';
      if (top) top.el.style.zIndex = '1';

      waitForMetadata();
      kickstart();
    }

    // Die <video>-Elemente dienen mit dem Abspieler nur als Poster-Halter: nichts laden
    function parkVideoElements() {
      layers.forEach(function (layer) {
        var el = layer.el;
        el.pause();
        while (el.firstChild) el.removeChild(el.firstChild);
        el.preload = 'none';
        el.load();
      });
    }

    // Clip laden: bevorzugt mit dem Abspieler, sonst über die <video>-Elemente
    function loadClip() {
      if (!canvas || !Frames || !Frames.supported) { useVideoElements(); return; }

      var p = Frames.create(canvas);
      p.onError = function () {                       // Decoder ausgefallen: Rückfall auf <video>
        if (player !== p) return;
        p.close();
        useVideoElements();
      };
      p.open(chooseSource(clip.sources), { prefer: reverse ? -1 : 1 }).then(function () {
        player = p;
        canvas.hidden = false;
        parkVideoElements();
        onReady(p.width, p.height);
      }, function () {                                // z. B. Codec nicht unterstützt, Datei nicht lesbar
        p.close();
        useVideoElements();
      });
    }

    // Eigenbewegung pausieren, solange der Tab oder der Hero nicht sichtbar ist
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) schedule();
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) schedule();
      }).observe(hero);
    }

    syncVideo = setTargetFromProgress;
    loadClip();
  }
})();
