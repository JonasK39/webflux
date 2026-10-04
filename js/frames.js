/* ==========================================================================
   webflux – Bildabspieler für den Hero-Clip (WebCodecs)

   Warum nicht einfach <video>.currentTime? Jeder Sprung im <video> kostet beim 4K-Clip
   30 bis über 200 ms (der Browser leert jedes Mal seine Decoder-Pipeline). Beim Scrubben
   per Scroll ruckelt das Bild deshalb. Der Clip ist All-Intra kodiert, jedes Bild also
   für sich decodierbar. Dieser Abspieler nutzt das aus:

   - Er liest die Bildtabelle des MP4 selbst (ftyp/moov am Dateianfang) und holt die
     Bilddaten per HTTP-Range-Abruf, in 2-MB-Stücken, die Umgebung des aktuellen Bildes
     zuerst; danach lädt er den Rest im Hintergrund nach.
   - Ein einziger, dauerhaft offener VideoDecoder (Hardware) decodiert die Bilder, die
     gerade gebraucht werden, plus ein paar in Scrollrichtung voraus (~8 ms pro 4K-Bild).
   - Fertige Bilder liegen als ImageBitmap in Anzeigegröße (object-fit: cover schon
     eingerechnet) im Zwischenspeicher und werden 1:1 auf ein <canvas> gezeichnet.
     Für die langsame Eigenbewegung blendet er zwei Nachbarbilder per Alpha ineinander.

   Alles, was nicht klappt (alter Browser, Codec nicht unterstützt, MP4 nicht
   "faststart"/All-Intra, Decoder-Fehler), meldet sich als Fehler; js/main.js fällt dann
   auf den klassischen <video>-Weg zurück.

   Schnittstelle (window.WebfluxFrames):
     supported                 true, wenn der Browser WebCodecs & Co. kann
     create(canvas)            neuer Abspieler für dieses <canvas>
   Abspieler:
     open(url, { prefer })     Promise; prefer = -1/1: in welche Richtung der Clip meist
                               durchlaufen wird (nur für die Reihenfolge des Nachladens)
     show(x, blend)            Bildposition x (Kommazahl, 0 = erstes Bild) anzeigen;
                               blend = zwischen zwei Bildern überblenden
     close()                   alles freigeben
     frameCount, width, height Clipdaten (nach open)
     onError                   Rückruf, falls der Decoder ausfällt
   ========================================================================== */

(function () {
  'use strict';

  var CHUNK           = 2 * 1024 * 1024;   // Bytes pro Range-Abruf
  var WARM_PARALLEL   = 2;                 // gleichzeitige Hintergrund-Abrufe
  var DECODE_PARALLEL = 3;                 // Bilder gleichzeitig im Decoder
  var CACHE_BYTES     = 220 * 1024 * 1024; // Obergrenze für fertige Bitmaps (liegen im GPU-Speicher: nicht zu groß)
  var AHEAD           = 6;                 // Bilder voraus decodieren (in Scrollrichtung)
  var BEHIND          = 2;                 // und ein paar zurück

  var ZOOM = 1.01;   // leicht hineinzoomen (verdeckt die 2px dunkle Spalte am rechten Clip-Rand); früher per CSS-Transform, jetzt im Ausschnitt: spart der GPU das Neuskalieren der ganzen Ebene

  var supported = !!(window.VideoDecoder && window.EncodedVideoChunk &&
                     window.createImageBitmap && window.fetch && window.Promise &&
                     window.Uint8Array && window.Map);

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* ---------------------------------------------------------------------
     MP4-Bildtabelle lesen: Codec-Beschreibung (avcC), Größe sowie Offset und
     Länge jedes Bildes. Erwartet: H.264, jedes Bild ein Keyframe, moov im
     ersten Datenstück (also "faststart"). Alles andere wirft einen Fehler.
     --------------------------------------------------------------------- */
  function parseMp4(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    function fourcc(o) { return String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]); }

    function boxes(start, end) {
      var list = [], o = start;
      while (o + 8 <= end) {
        var size = dv.getUint32(o), hdr = 8;
        if (size === 1) { size = Number(dv.getBigUint64(o + 8)); hdr = 16; }
        else if (size === 0) size = end - o;
        if (size < hdr) break;
        list.push({ t: fourcc(o + 4), s: o + hdr, e: o + size });
        o += size;
      }
      return list;
    }
    function find(list, t) {
      for (var i = 0; i < list.length; i++) if (list[i].t === t) return list[i];
      return null;
    }
    function need(box, what) { if (!box) throw new Error('MP4: ' + what + ' fehlt'); return box; }

    var top  = boxes(0, u8.length);
    var moov = need(find(top, 'moov'), 'moov');
    if (moov.e > u8.length) throw new Error('MP4: moov liegt nicht am Dateianfang');

    var trak = need(find(boxes(moov.s, moov.e), 'trak'), 'trak');
    var mdia = need(find(boxes(trak.s, trak.e), 'mdia'), 'mdia');
    var minf = need(find(boxes(mdia.s, mdia.e), 'minf'), 'minf');
    var stbl = need(find(boxes(minf.s, minf.e), 'stbl'), 'stbl');
    var sb   = boxes(stbl.s, stbl.e);

    var stsd  = need(find(sb, 'stsd'), 'stsd');
    var entry = boxes(stsd.s + 8, stsd.e)[0];
    if (!entry || (entry.t !== 'avc1' && entry.t !== 'avc3')) throw new Error('MP4: kein H.264');
    var avcC = need(find(boxes(entry.s + 78, entry.e), 'avcC'), 'avcC');
    var description = u8.slice(avcC.s, avcC.e);
    var width  = dv.getUint16(entry.s + 24);
    var height = dv.getUint16(entry.s + 26);
    function hex(b) { return (b < 16 ? '0' : '') + b.toString(16); }
    var codec = 'avc1.' + hex(description[1]) + hex(description[2]) + hex(description[3]);

    if (find(sb, 'stss')) throw new Error('MP4: nicht jedes Bild ein Keyframe');

    var stsz  = need(find(sb, 'stsz'), 'stsz');
    var fixed = dv.getUint32(stsz.s + 4);
    var count = dv.getUint32(stsz.s + 8);
    var sizes = new Uint32Array(count);
    for (var i = 0; i < count; i++) sizes[i] = fixed || dv.getUint32(stsz.s + 12 + i * 4);

    var stsc = need(find(sb, 'stsc'), 'stsc');
    var nsc  = dv.getUint32(stsc.s + 4), runs = [];
    for (i = 0; i < nsc; i++) runs.push({ first: dv.getUint32(stsc.s + 8 + i * 12), per: dv.getUint32(stsc.s + 12 + i * 12) });

    var co = find(sb, 'stco'), wide = false;
    if (!co) { co = need(find(sb, 'co64'), 'stco'); wide = true; }
    var nco = dv.getUint32(co.s + 4);

    var offsets = new Float64Array(count), si = 0, end = 0;
    for (var c = 0; c < nco && si < count; c++) {
      var per = 0;
      for (var r = 0; r < runs.length; r++) if (runs[r].first <= c + 1) per = runs[r].per;
      var off = wide ? Number(dv.getBigUint64(co.s + 8 + c * 8)) : dv.getUint32(co.s + 8 + c * 4);
      for (var k = 0; k < per && si < count; k++) { offsets[si] = off; off += sizes[si]; si++; }
      end = off;
    }
    if (si !== count || !count) throw new Error('MP4: Bildtabelle unvollständig');

    return { codec: codec, description: description, width: width, height: height,
             count: count, offsets: offsets, sizes: sizes, end: end };
  }

  /* ---------------------------------------------------------------------
     Datei in 2-MB-Stücken per Range-Abruf holen (fällt auf Gesamtabruf zurück,
     wenn der Server Range ignoriert)
     --------------------------------------------------------------------- */
  function ByteSource(url) {
    this.url     = url;
    this.chunks  = [];
    this.pending = {};
    this.size    = 0;
    this.whole   = null;
  }

  ByteSource.prototype.chunk = function (i) {
    var self = this;
    if (this.chunks[i]) return Promise.resolve(this.chunks[i]);
    if (this.whole) {
      this.chunks[i] = this.whole.subarray(i * CHUNK, (i + 1) * CHUNK);
      return Promise.resolve(this.chunks[i]);
    }
    if (this.pending[i]) return this.pending[i];

    var from = i * CHUNK;
    var p = fetch(this.url, { headers: { Range: 'bytes=' + from + '-' + (from + CHUNK - 1) } })
      .then(function (res) {
        if (res.status === 206) {
          var m = /\/(\d+)\s*$/.exec(res.headers.get('Content-Range') || '');
          if (m) self.size = +m[1];
          return res.arrayBuffer().then(function (b) { return new Uint8Array(b); });
        }
        if (res.status === 200) {   // Server kennt kein Range: ganze Datei, die Stücke sind Ausschnitte davon
          return res.arrayBuffer().then(function (b) {
            self.whole = new Uint8Array(b);
            self.size  = self.whole.length;
            return self.whole.subarray(from, from + CHUNK);
          });
        }
        throw new Error('HTTP ' + res.status);
      })
      .then(function (u8) {
        self.chunks[i] = u8;
        delete self.pending[i];
        return u8;
      }, function (e) {
        delete self.pending[i];
        throw e;
      });
    this.pending[i] = p;
    return p;
  };

  // Bytes [off, off + len) als ein zusammenhängendes Stück
  ByteSource.prototype.bytes = function (off, len) {
    var first = Math.floor(off / CHUNK), last = Math.floor((off + len - 1) / CHUNK), jobs = [];
    for (var i = first; i <= last; i++) jobs.push(this.chunk(i));
    return Promise.all(jobs).then(function (parts) {
      if (parts.length === 1) {
        var s = off - first * CHUNK;
        return parts[0].subarray(s, s + len);
      }
      var out = new Uint8Array(len);
      for (var k = 0; k < parts.length; k++) {
        var base = (first + k) * CHUNK;
        var a = Math.max(off, base), b = Math.min(off + len, base + parts[k].length);
        if (b > a) out.set(parts[k].subarray(a - base, b - base), a - off);
      }
      return out;
    });
  };

  /* ---------------------------------------------------------------------
     Abspieler
     --------------------------------------------------------------------- */
  function Player(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);   // altes Bild eines früheren Clips weg: dann scheint das Poster durch

    this.src = null;
    this.info = null;
    this.decoder = null;
    this.closed = false;

    this.frameCount = 0;
    this.width = 0;
    this.height = 0;

    this.cache = new Map();   // Bildnummer -> ImageBitmap (Anzeigegröße)
    this.fetching = {};       // Bildnummer -> true: Bytes sind unterwegs
    this.ready = {};          // Bildnummer -> Bytes, noch nicht beim Decoder
    this.submitted = {};      // Bildnummer -> true: liegt beim Decoder
    this.inflight = 0;
    this.targets = [];
    this.gen = 0;             // zählt bei jeder Größenänderung hoch; Bitmaps alter Größe werden verworfen

    this.x = 0;
    this.blend = false;
    this.dir = 0;
    this.prefer = 1;
    this.warmed = false;
    this.started = false;     // show() wurde schon aufgerufen: erst ab da kennt der Abspieler die Startposition
    this.lastKey = '';

    this.cw = 0; this.ch = 0; this.crop = null; this.maxFrames = 12;
    this.watchTimer = null;
    this.resizeTimer = null;
    this.onError = null;

    var self = this;
    this._onResize = function () {
      window.clearTimeout(self.resizeTimer);
      self.resizeTimer = window.setTimeout(function () { self._resize(); }, 120);
    };
    window.addEventListener('resize', this._onResize);
  }

  Player.prototype.open = function (url, opts) {
    var self = this;
    this.prefer = (opts && opts.prefer) || 1;
    this.src = new ByteSource(url);
    return this.src.chunk(0).then(function (head) {
      var info = parseMp4(head);
      var cfg = { codec: info.codec, codedWidth: info.width, codedHeight: info.height,
                  description: info.description, optimizeForLatency: true };
      return VideoDecoder.isConfigSupported(cfg).then(function (res) {
        if (!res || !res.supported) throw new Error('Codec nicht unterstützt');
        if (self.closed) return;
        self.info = info;
        self.frameCount = info.count;
        self.width = info.width;
        self.height = info.height;
        self.decoder = new VideoDecoder({
          output: function (frame) { self._output(frame); },
          error:  function (e) { self._fail(e); }
        });
        self.decoder.configure(cfg);
        self._resize();
      });
    });
  };

  // Canvas auf Anzeigegröße (in Gerätepixeln, höchstens Clipgröße) bringen und den
  // object-fit-cover-Ausschnitt des Clips ausrechnen
  Player.prototype._resize = function () {
    if (this.closed || !this.info) return;
    var dpr = window.devicePixelRatio || 1;
    var W = this.width, H = this.height;
    var cw = Math.max(2, Math.round(this.canvas.clientWidth * dpr));
    var ch = Math.max(2, Math.round(this.canvas.clientHeight * dpr));
    var s  = Math.max(cw / W, ch / H);
    if (s > 1) { cw = Math.round(cw / s); ch = Math.round(ch / s); s = Math.max(cw / W, ch / H); }   // nie über Clipgröße hinaus
    if (cw === this.cw && ch === this.ch) return;

    var sw = Math.min(W, Math.round(cw / s / ZOOM)), sh = Math.min(H, Math.round(ch / s / ZOOM));
    this.crop = { sx: Math.round((W - sw) / 2), sy: Math.round((H - sh) / 2), sw: sw, sh: sh };
    this.cw = cw; this.ch = ch;
    this.canvas.width = cw; this.canvas.height = ch;
    this.maxFrames = Math.max(12, Math.floor(CACHE_BYTES / (cw * ch * 4)));
    this.gen++;
    this._dropBitmaps();
    this.lastKey = '';
    if (this.started) this._plan();
  };

  Player.prototype._dropBitmaps = function () {
    this.cache.forEach(function (bmp) { bmp.close(); });
    this.cache.clear();
  };

  /* ---- Planung: welche Bilder werden gebraucht? ---- */
  Player.prototype._plan = function () {
    var last = this.frameCount - 1;
    var x = clamp(this.x, 0, last);
    var n0 = Math.round(x), lo = Math.floor(x);
    var list = [n0];
    if (this.blend) { list.push(lo, lo + 1); }
    var d = this.dir || this.prefer;
    for (var k = 1; k <= AHEAD; k++) list.push(n0 + d * k);
    for (k = 1; k <= BEHIND; k++) list.push(n0 - d * k);
    var seen = {}, out = [];
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      if (n < 0 || n > last || seen[n]) continue;
      seen[n] = true;
      out.push(n);
    }
    this.targets = out;
    this._pump();
  };

  Player.prototype._pump = function () {
    if (this.closed || !this.decoder) return;
    for (var i = 0; i < this.targets.length; i++) {
      var n = this.targets[i];
      if (this.cache.has(n) || this.submitted[n]) continue;
      var data = this.ready[n];
      if (data) {
        if (this.inflight >= DECODE_PARALLEL) break;
        delete this.ready[n];
        this.submitted[n] = true;
        this.inflight++;
        try {
          this.decoder.decode(new EncodedVideoChunk({ type: 'key', timestamp: n * 1000, data: data }));
        } catch (e) { this._fail(e); return; }
        this._watch();
      } else if (!this.fetching[n]) {
        this._fetch(n);
      }
    }
  };

  Player.prototype._fetch = function (n) {
    var self = this, info = this.info;
    this.fetching[n] = true;
    this.src.bytes(info.offsets[n], info.sizes[n]).then(function (data) {
      delete self.fetching[n];
      if (self.closed) return;
      self.ready[n] = data;
      self._pump();
    }, function () {
      delete self.fetching[n];
      window.setTimeout(function () { self._pump(); }, 1500);   // Netzfehler: später noch mal
    });
    if (!this.warmed) this._warm();
  };

  // Rest der Datei im Hintergrund nachladen, nah am aktuellen Bild zuerst, bevorzugt in Laufrichtung
  Player.prototype._warm = function () {
    var self = this, src = this.src, info = this.info;
    var total = Math.ceil((src.size || info.end) / CHUNK);
    if (!total) return;
    this.warmed = true;
    var center = Math.floor(info.offsets[clamp(Math.round(this.x), 0, this.frameCount - 1)] / CHUNK);
    var pref = this.prefer, order = [];
    for (var i = 0; i < total; i++) order.push(i);
    function rank(i) { var d = i - center; return Math.abs(d) - ((d > 0 ? 1 : -1) === pref ? 0.5 : 0); }
    order.sort(function (a, b) { return rank(a) - rank(b); });

    var idx = 0, active = 0;
    function next() {
      while (active < WARM_PARALLEL && idx < order.length && !self.closed) {
        var c = order[idx++];
        if (src.chunks[c] || src.pending[c]) continue;
        active++;
        src.chunk(c).then(done, done);
      }
    }
    function done() { active--; next(); }
    next();
  };

  // Falls der Decoder Bilder zurückhält (kommt bei Keyframe-only-Material nicht vor): nach kurzer Zeit herausspülen
  Player.prototype._watch = function () {
    var self = this;
    window.clearTimeout(this.watchTimer);
    this.watchTimer = window.setTimeout(function () {
      if (self.closed || !self.inflight) return;
      try { self.decoder.flush().catch(function () {}); } catch (e) {}
    }, 350);
  };

  /* ---- Decoder-Ausgabe -> Bitmap in Anzeigegröße ---- */
  Player.prototype._output = function (frame) {
    var self = this, n = Math.round(frame.timestamp / 1000);
    this.inflight = Math.max(0, this.inflight - 1);
    delete this.submitted[n];
    if (this.closed || !this.crop) { frame.close(); return; }

    var gen = this.gen, c = this.crop;
    createImageBitmap(frame, c.sx, c.sy, c.sw, c.sh,
                      { resizeWidth: this.cw, resizeHeight: this.ch, resizeQuality: 'high' })
      .then(function (bmp) {
        frame.close();
        if (self.closed || gen !== self.gen) { bmp.close(); return; }
        self._store(n, bmp);
        self.draw();
      }, function () { frame.close(); });
    this._pump();
  };

  Player.prototype._store = function (n, bmp) {
    var old = this.cache.get(n);
    if (old) old.close();
    this.cache.set(n, bmp);
    // Platz schaffen: zuerst das Bild, das am weitesten von der aktuellen Position entfernt ist
    while (this.cache.size > this.maxFrames) {
      var far = -1, dist = -1, x = this.x;
      this.cache.forEach(function (_, k) { var d = Math.abs(k - x); if (d > dist) { dist = d; far = k; } });
      this.cache.get(far).close();
      this.cache.delete(far);
    }
  };

  Player.prototype._fail = function (e) {
    if (this.closed) return;
    if (window.console && console.warn) console.warn('Hero-Abspieler:', e);
    var cb = this.onError;
    if (cb) cb(e);
  };

  /* ---- Anzeige ---- */

  // Nächstliegendes Bild, das schon fertig ist (oder -1)
  Player.prototype._nearest = function (x) {
    var n0 = clamp(Math.round(x), 0, this.frameCount - 1);
    if (this.cache.has(n0)) return n0;
    for (var d = 1; d <= this.frameCount; d++) {
      if (n0 - d >= 0 && this.cache.has(n0 - d)) return n0 - d;
      if (n0 + d < this.frameCount && this.cache.has(n0 + d)) return n0 + d;
    }
    return -1;
  };

  Player.prototype.draw = function () {
    if (this.closed || !this.crop) return;
    var last = this.frameCount - 1;
    var x = clamp(this.x, 0, last), lo = Math.floor(x), frac = x - lo, hi = Math.min(last, lo + 1);
    var a, b = -1;
    if (this.blend && hi > lo && frac > 0.002 && this.cache.has(lo) && this.cache.has(hi)) { a = lo; b = hi; }
    else a = this._nearest(x);
    if (a < 0) return;

    var key = a + ':' + b + ':' + (b >= 0 ? frac.toFixed(3) : '');
    if (key === this.lastKey) return;
    this.lastKey = key;

    var ctx = this.ctx;
    ctx.globalAlpha = 1;
    ctx.drawImage(this.cache.get(a), 0, 0);
    if (b >= 0) {
      ctx.globalAlpha = frac;
      ctx.drawImage(this.cache.get(b), 0, 0);
      ctx.globalAlpha = 1;
    }
  };

  Player.prototype.show = function (x, blend) {
    if (this.closed || !this.info) return;
    this.started = true;
    var dx = x - this.x;
    if (Math.abs(dx) > 0.02) this.dir = dx > 0 ? 1 : -1;
    this.x = x;
    this.blend = !!blend;
    this._plan();
    this.draw();
  };

  Player.prototype.close = function () {
    if (this.closed) return;
    this.closed = true;
    window.removeEventListener('resize', this._onResize);
    window.clearTimeout(this.watchTimer);
    window.clearTimeout(this.resizeTimer);
    this._dropBitmaps();
    this.ready = {}; this.fetching = {}; this.submitted = {};
    try { if (this.decoder && this.decoder.state !== 'closed') this.decoder.close(); } catch (e) {}
    this.decoder = null;
    this.src = null;
  };

  window.WebfluxFrames = {
    supported: supported,
    create: function (canvas) { return new Player(canvas); }
  };
})();
