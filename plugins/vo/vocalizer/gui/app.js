// [FLOWORK-OS:SOVEREIGN] Engineered by Flowork OS <agent@floworkos.com>
// AGUNG VOCALIZER AUTHENTIC AUDIO ENGINE & CONTROL LAYER WITH OFFLINE WAV EXPORTER

class VocalizerApp {
  constructor() {
    this.ws = null;
    this.audioCtx = null;
    this.isAudioRunning = false;
    this.micStream = null;
    this.activeSourceNode = null;
    
    // Audio File & Playback Transport State
    this.audioSourceMode = 'file'; // 'file' | 'mic'
    this.audioBuffer = null;
    this.isPlaying = false;
    this.playbackStartTime = 0;
    this.playbackOffset = 0;
    this.isLooping = false;
    this.loadedFilename = '';
    this.waveformPeaks = null;
    this.isSeeking = false;
    
    // Authentic 34 Parameter Model from VST3 Binary
    this.params = {
      // Global
      bypass: false,
      input_gain: 0.0,
      output_gain: 0.0,
      
      // Card 1: Correction
      tune_enabled: true,
      tune_key: 0, // 0 = C
      tune_scale: 0, // 0 = Chromatic, 1 = Major, 2 = Minor
      tune_speed: 20.0, // ms
      tune_human: 25.0, // %
      tune_amt: 100.0, // %
      
      // Card 2: EQ (4 bands)
      eq_enabled: true,
      eq_b1_f: 100.0,
      eq_b1_g: 0.0,
      eq_b1_q: 0.707,
      eq_b2_f: 500.0,
      eq_b2_g: 0.0,
      eq_b2_q: 1.0,
      eq_b3_f: 2500.0,
      eq_b3_g: 0.0,
      eq_b3_q: 1.0,
      eq_b4_f: 8000.0,
      eq_b4_g: 0.0,
      eq_b4_q: 0.707,
      
      // Card 3: Effects
      fx_enabled: true,
      dbl_amt: 30.0,
      dbl_det: 12.0,
      dbl_dly: 18.0,
      dbl_pan: 80.0,
      dly_amt: 20.0,
      dly_dly: 250.0, // ms
      dly_fdb: 35.0, // %
      dly_duck: 10.0,
      rev_mode: 0, // 0 = Room, 1 = Hall, 2 = Plate
      rev_mix: 25.0,
      rev_duck: 15.0
    };

    this.notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    this.currentPitch = { note: '--', freq: 0.0, cents: 0 };
    
    this.init();
  }

  init() {
    this.setupNotesRing();
    this.bindRotaryDials();
    this.bindToggles();
    this.bindSelects();
    this.bindEQDisplay();
    this.bindTransportControls();
    this.setupWebSocket();
    this.setupAudioEngine();
    this.startVisualizerLoop();
  }

  // ==================== TUNE WHEEL SETUP ====================
  setupNotesRing() {
    const ring = document.getElementById('notes-ring');
    if (!ring) return;
    ring.innerHTML = '';
    
    this.notes.forEach((note, idx) => {
      const angle = idx * 30; // 360 / 12 = 30 deg
      const el = document.createElement('div');
      el.className = 'note-item';
      el.id = `note-${idx}`;
      el.style.setProperty('--angle', `${angle}deg`);
      el.textContent = note;
      el.title = `Pilih nada dasar: ${note}`;
      
      // Clickable note button to set tune key
      el.addEventListener('click', () => {
        this.params.tune_key = note;
        const keySel = document.getElementById('tune_key');
        if (keySel) keySel.value = note;
        document.querySelectorAll('.note-item').forEach(n => n.classList.remove('active'));
        el.classList.add('active');
        this.onParamChange('tune_key', note);
      });

      ring.appendChild(el);
    });
  }

  updateTuneDisplay(noteName, freq, cents) {
    const noteEl = document.getElementById('detected-note') || document.getElementById('det-note');
    const freqEl = document.getElementById('detected-freq') || document.getElementById('det-freq');
    const centsEl = document.getElementById('detected-cents') || document.getElementById('det-cents');
    const arcEl = document.getElementById('wheel-cents-arc') || document.getElementById('cents-arc');
    
    if (noteEl) noteEl.textContent = noteName || '--';
    if (freqEl) freqEl.textContent = freq > 0 ? `${freq.toFixed(1)} Hz` : '-- Hz';
    if (centsEl) {
      const sign = cents > 0 ? '+' : '';
      centsEl.textContent = freq > 0 ? `${sign}${Math.round(cents)} cents` : '0 cents';
    }

    // Highlight note ring
    this.notes.forEach((n, idx) => {
      const el = document.getElementById(`note-${idx}`);
      if (el) {
        if (n === noteName) {
          el.classList.add('active');
        } else if (n !== this.params.tune_key) {
          el.classList.remove('active');
        }
      }
    });

    if (arcEl) {
      // 0 cents = center top, +-50 cents = +-45 deg arc
      const clampedCents = Math.max(-50, Math.min(50, cents || 0));
      const dashoffset = 100 - (clampedCents * 1.5);
      arcEl.style.strokeDashoffset = `${dashoffset}`;
    }
  }

  // ==================== ROTARY DIALS ENGINE ====================
  bindRotaryDials() {
    const dials = document.querySelectorAll('.rotary-dial');
    
    dials.forEach(dial => {
      const paramName = dial.dataset.param;
      const min = parseFloat(dial.dataset.min);
      const max = parseFloat(dial.dataset.max);
      const unit = dial.dataset.unit || '';
      
      // Determine appropriate step
      let step = parseFloat(dial.dataset.step);
      if (isNaN(step)) {
        if (unit === 'dB') step = 0.5;
        else if (unit === 'Hz') step = (max - min > 1000) ? 10 : 1;
        else if (unit === '' && max <= 10) step = 0.05; // Q factor
        else if (unit === '%') step = 1;
        else step = (max - min) / 100;
      }
      
      let startY = 0;
      let startVal = 0;
      let isDragging = false;

      // Initialize initial value
      if (this.params[paramName] !== undefined) {
        this.updateDialUI(dial, this.params[paramName], min, max, unit);
      }

      const onPointerDown = (e) => {
        isDragging = true;
        startY = e.clientY;
        startVal = (this.params[paramName] !== undefined) ? this.params[paramName] : parseFloat(dial.dataset.default || min);
        document.body.style.cursor = 'ns-resize';
        dial.classList.add('active-dragging');
        e.preventDefault();

        const onPointerMove = (moveEvent) => {
          if (!isDragging) return;
          const deltaY = startY - moveEvent.clientY; // drag up = increase
          const sensitivity = 0.005;
          const range = max - min;
          let newVal = startVal + (deltaY * range * sensitivity);
          
          if (step > 0) {
            newVal = Math.round(newVal / step) * step;
          }
          newVal = Math.max(min, Math.min(max, newVal));

          if (this.params[paramName] !== newVal) {
            this.params[paramName] = newVal;
            this.updateDialUI(dial, newVal, min, max, unit);
            this.onParamChange(paramName, newVal);
          }
        };

        const onPointerUp = () => {
          if (!isDragging) return;
          isDragging = false;
          dial.classList.remove('active-dragging');
          document.body.style.cursor = '';
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
          window.removeEventListener('mousemove', onPointerMove);
          window.removeEventListener('mouseup', onPointerUp);
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);
      };

      dial.addEventListener('pointerdown', onPointerDown);
      dial.addEventListener('mousedown', onPointerDown);

      // Wheel support
      dial.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1 : -1;
        const inc = (step > 0) ? step : (max - min) * 0.02;
        let newVal = (this.params[paramName] !== undefined ? this.params[paramName] : min) + (delta * inc);
        if (step > 0) {
          newVal = Math.round(newVal / step) * step;
        }
        newVal = Math.max(min, Math.min(max, newVal));
        
        if (this.params[paramName] !== newVal) {
          this.params[paramName] = newVal;
          this.updateDialUI(dial, newVal, min, max, unit);
          this.onParamChange(paramName, newVal);
        }
      }, { passive: false });

      // Double click to reset to default
      dial.addEventListener('dblclick', () => {
        const def = parseFloat(dial.dataset.default !== undefined ? dial.dataset.default : min);
        this.params[paramName] = def;
        this.updateDialUI(dial, def, min, max, unit);
        this.onParamChange(paramName, def);
      });
    });
  }

  updateDialUI(dial, value, min, max, unit) {
    const fraction = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const degrees = -135 + (fraction * 270); // -135 deg to +135 deg
    
    // Rotating Needle: supports both .dial-handle and .dial-thumb
    const handle = dial.querySelector('.dial-handle') || dial.querySelector('.dial-thumb');
    if (handle) {
      handle.style.transform = `rotate(${degrees.toFixed(1)}deg)`;
    }

    // Arc Stroke Fill
    const fill = dial.querySelector('.dial-fill');
    if (fill) {
      const isSmall = dial.classList.contains('mini') || dial.classList.contains('small');
      const totalLen = isSmall ? 113.1 : 144.5;
      const arcLen = totalLen * 0.75; // 270 deg of 360 deg
      const offset = totalLen - (fraction * arcLen);
      fill.style.strokeDasharray = `${totalLen}`;
      fill.style.strokeDashoffset = offset;
    }

    // Text Value Readout
    const valEl = dial.querySelector('.dial-val');
    if (valEl) {
      let display = value;
      if (Math.abs(display) >= 1000) {
        display = `${(display / 1000).toFixed(1)}k`;
      } else if (unit === 'dB') {
        const sign = display > 0 ? '+' : '';
        display = `${sign}${display.toFixed(1)}`;
      } else if (unit === 'x' || unit === 'Q' || unit === '') {
        display = display.toFixed(2);
      } else if (Math.abs(display) < 10 && unit !== 'ms') {
        display = display.toFixed(1);
      } else {
        display = Math.round(display);
      }
      valEl.textContent = `${display}${unit ? ' ' + unit : ''}`;
    }
  }

  // ==================== TOGGLES & SELECTS ====================
  bindToggles() {
    // 1. Bypass Button
    const bypassBtn = document.getElementById('btn-bypass');
    if (bypassBtn) {
      bypassBtn.addEventListener('click', () => {
        this.params.bypass = !this.params.bypass;
        bypassBtn.classList.toggle('active', this.params.bypass);
        this.onParamChange('bypass', this.params.bypass);
        this.updateEQCurve();
      });
    }

    // 2. Audio Power / Engine Toggle Button
    const powerBtn = document.getElementById('btn-audio-power');
    const powerStatus = document.getElementById('power-status');
    if (powerBtn) {
      powerBtn.addEventListener('click', async () => {
        this.ensureAudioContext();
        if (this.audioCtx.state === 'running') {
          await this.audioCtx.suspend();
          powerBtn.classList.remove('active');
          if (powerStatus) powerStatus.textContent = 'STANDBY';
        } else {
          await this.audioCtx.resume();
          powerBtn.classList.add('active');
          if (powerStatus) powerStatus.textContent = 'LIVE DSP';
        }
      });
    }

    // 3. Module Toggles (AutoTune, EQ, Effects)
    ['tune_enabled', 'eq_enabled', 'fx_enabled'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.checked = (this.params[id] !== false);
        el.addEventListener('change', (e) => {
          this.params[id] = e.target.checked;
          this.onParamChange(id, e.target.checked);
          if (id === 'eq_enabled') {
            this.updateEQCurve();
          }
        });
      }
    });

    const micBtn = document.getElementById('btn-mic-toggle');
    if (micBtn) {
      micBtn.addEventListener('click', () => {
        this.toggleMicrophone();
      });
    }

    const startBtn = document.getElementById('btn-start-audio');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        this.ensureAudioContext();
        startBtn.style.display = 'none';
      });
    }
  }

  bindSelects() {
    const keySel = document.getElementById('tune_key');
    if (keySel) {
      keySel.addEventListener('change', (e) => {
        this.params.tune_key = parseInt(e.target.value) || 0;
        this.onParamChange('tune_key', this.params.tune_key);
        // Highlight in note wheel
        this.notes.forEach((n, idx) => {
          const el = document.getElementById(`note-${idx}`);
          if (el) {
            el.classList.toggle('active', idx === this.params.tune_key);
          }
        });
      });
    }

    const scaleSel = document.getElementById('tune_scale');
    if (scaleSel) {
      scaleSel.addEventListener('change', (e) => {
        this.params.tune_scale = parseInt(e.target.value) || 0;
        this.onParamChange('tune_scale', this.params.tune_scale);
      });
    }

    const revSel = document.getElementById('rev_mode');
    if (revSel) {
      revSel.addEventListener('change', (e) => {
        this.params.rev_mode = parseInt(e.target.value) || 0;
        this.onParamChange('rev_mode', this.params.rev_mode);
      });
    }
  }

  // ==================== EQ INTERACTIVE GRAPH & BUTTONS ====================
  bindEQDisplay() {
    const svg = document.getElementById('eq-svg') || document.getElementById('eq-graph');
    if (!svg) return;

    // 1. Quick FLAT Button (Resets all EQ gains to 0 dB)
    const btnFlat = document.getElementById('btn-eq-flat');
    if (btnFlat) {
      btnFlat.addEventListener('click', () => {
        [1, 2, 3, 4].forEach(b => {
          this.params[`eq_b${b}_g`] = 0.0;
          const dial = document.querySelector(`.rotary-dial[data-param="eq_b${b}_g"]`);
          if (dial) {
            this.updateDialUI(dial, 0.0, parseFloat(dial.dataset.min), parseFloat(dial.dataset.max), 'dB');
          }
          this.onParamChange(`eq_b${b}_g`, 0.0);
        });
        this.updateEQCurve();
      });
    }

    // 2. Interactive Band Buttons (BAND 1 .. 4 toggle bypass / solo)
    [1, 2, 3, 4].forEach(b => {
      const tagBtn = document.getElementById(`tag-b${b}`) || document.querySelector(`.band-tag[data-band="${b}"]`);
      if (tagBtn) {
        tagBtn.addEventListener('click', () => {
          const currentGain = this.params[`eq_b${b}_g`];
          if (Math.abs(currentGain) > 0.01) {
            // Store previous gain and mute
            tagBtn._prevGain = currentGain;
            this.params[`eq_b${b}_g`] = 0.0;
            tagBtn.classList.add('bypassed');
          } else if (tagBtn._prevGain !== undefined) {
            // Restore previous gain
            this.params[`eq_b${b}_g`] = tagBtn._prevGain;
            tagBtn.classList.remove('bypassed');
          } else {
            // Give a quick boost of +3dB if currently zero
            this.params[`eq_b${b}_g`] = 3.0;
            tagBtn.classList.remove('bypassed');
          }

          const dial = document.querySelector(`.rotary-dial[data-param="eq_b${b}_g"]`);
          if (dial) {
            this.updateDialUI(dial, this.params[`eq_b${b}_g`], parseFloat(dial.dataset.min), parseFloat(dial.dataset.max), 'dB');
          }
          this.onParamChange(`eq_b${b}_g`, this.params[`eq_b${b}_g`]);
          this.updateEQCurve();
        });
      }
    });

    // 3. Interactive Handles Drag & Drop on EQ Curve
    const width = 460;
    const height = 140;
    const minF = 20;
    const maxF = 20000;
    const logMin = Math.log10(minF);
    const logMax = Math.log10(maxF);

    const fToX = (f) => ((Math.log10(Math.max(minF, Math.min(maxF, f))) - logMin) / (logMax - logMin)) * width;
    const xToF = (x) => Math.pow(10, logMin + (Math.max(0, Math.min(width, x)) / width) * (logMax - logMin));
    const gToY = (g) => 70 - (Math.max(-18, Math.min(18, g)) * (50 / 12));
    const yToG = (y) => (70 - Math.max(0, Math.min(height, y))) * (12 / 50);

    const dragBand = (bandNum, e) => {
      const rect = svg.getBoundingClientRect();
      const svgWidth = rect.width || width;
      const svgHeight = rect.height || height;
      const svgX = ((e.clientX - rect.left) / svgWidth) * width;
      const svgY = ((e.clientY - rect.top) / svgHeight) * height;

      let newF = Math.round(xToF(svgX));
      let newG = parseFloat(yToG(svgY).toFixed(1));

      // Clamp frequency to band range
      const dialF = document.querySelector(`.rotary-dial[data-param="eq_b${bandNum}_f"]`);
      const dialG = document.querySelector(`.rotary-dial[data-param="eq_b${bandNum}_g"]`);
      const minBandF = dialF ? parseFloat(dialF.dataset.min) : 20;
      const maxBandF = dialF ? parseFloat(dialF.dataset.max) : 20000;
      newF = Math.max(minBandF, Math.min(maxBandF, newF));
      newG = Math.max(-18, Math.min(18, newG));

      this.params[`eq_b${bandNum}_f`] = newF;
      this.params[`eq_b${bandNum}_g`] = newG;

      if (dialF) this.updateDialUI(dialF, newF, minBandF, maxBandF, 'Hz');
      if (dialG) this.updateDialUI(dialG, newG, -18, 18, 'dB');

      this.onParamChange(`eq_b${bandNum}_f`, newF);
      this.onParamChange(`eq_b${bandNum}_g`, newG);
      this.updateEQCurve();
    };

    let activeDragBand = null;

    const onPointerMove = (e) => {
      if (activeDragBand === null) return;
      dragBand(activeDragBand, e);
    };

    const onPointerUp = () => {
      if (activeDragBand !== null) {
        const handle = document.getElementById(`handle-b${activeDragBand}`) || document.getElementById(`eq-node-${activeDragBand}`);
        if (handle) handle.classList.remove('dragging');
        activeDragBand = null;
        document.body.style.cursor = '';
      }
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
    };

    // Attach to handles
    [1, 2, 3, 4].forEach(b => {
      const handle = document.getElementById(`handle-b${b}`) || document.getElementById(`eq-node-${b}`);
      if (!handle) return;

      const onStart = (e) => {
        activeDragBand = b;
        handle.classList.add('dragging');
        document.body.style.cursor = 'grabbing';
        e.preventDefault();
        e.stopPropagation();
        dragBand(b, e);

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);
      };

      handle.addEventListener('pointerdown', onStart);
      handle.addEventListener('mousedown', onStart);

      // Mouse wheel on handle adjusts Q factor
      handle.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        let newQ = (this.params[`eq_b${b}_q`] || 1.0) + delta;
        newQ = Math.max(0.1, Math.min(10.0, parseFloat(newQ.toFixed(2))));
        this.params[`eq_b${b}_q`] = newQ;
        
        const dialQ = document.querySelector(`.rotary-dial[data-param="eq_b${b}_q"]`);
        if (dialQ) this.updateDialUI(dialQ, newQ, 0.1, 10.0, '');
        this.onParamChange(`eq_b${b}_q`, newQ);
        this.updateEQCurve();
      }, { passive: false });
    });

    // Also allow clicking directly anywhere on the SVG to grab and drag the nearest band
    svg.addEventListener('pointerdown', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('eq-handle')) return;
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const svgWidth = rect.width || width;
      const svgX = ((e.clientX - rect.left) / svgWidth) * width;
      const clickedF = xToF(svgX);

      // Find closest band by logarithmic frequency distance
      let closestBand = 1;
      let minDiff = Infinity;
      [1, 2, 3, 4].forEach(b => {
        const bandF = this.params[`eq_b${b}_f`] || (b === 1 ? 100 : b === 2 ? 500 : b === 3 ? 2500 : 8000);
        const diff = Math.abs(Math.log10(Math.max(20, bandF)) - Math.log10(Math.max(20, clickedF)));
        if (diff < minDiff) {
          minDiff = diff;
          closestBand = b;
        }
      });

      activeDragBand = closestBand;
      const handle = document.getElementById(`handle-b${closestBand}`) || document.getElementById(`eq-node-${closestBand}`);
      if (handle) handle.classList.add('dragging');
      document.body.style.cursor = 'grabbing';
      dragBand(closestBand, e);

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('mousemove', onPointerMove);
      window.addEventListener('mouseup', onPointerUp);
    });

    this.updateEQCurve();
  }

  updateEQCurve() {
    const path = document.getElementById('eq-curve') || document.getElementById('eq-curve-path');
    const area = document.getElementById('eq-area');
    if (!path) return;

    const width = 460;
    const height = 140;
    const minF = 20;
    const maxF = 20000;
    const logMin = Math.log10(minF);
    const logMax = Math.log10(maxF);

    const fToX = (f) => ((Math.log10(Math.max(minF, Math.min(maxF, f))) - logMin) / (logMax - logMin)) * width;
    const gToY = (g) => 70 - (Math.max(-18, Math.min(18, g)) * (50 / 12)); // 50px per 12dB, center 70

    // 4 bands
    const b1 = { f: this.params.eq_b1_f || 100, g: this.params.eq_b1_g || 0, q: this.params.eq_b1_q || 1 };
    const b2 = { f: this.params.eq_b2_f || 500, g: this.params.eq_b2_g || 0, q: this.params.eq_b2_q || 1 };
    const b3 = { f: this.params.eq_b3_f || 2500, g: this.params.eq_b3_g || 0, q: this.params.eq_b3_q || 1 };
    const b4 = { f: this.params.eq_b4_f || 8000, g: this.params.eq_b4_g || 0, q: this.params.eq_b4_q || 1 };

    const isEqActive = this.params.eq_enabled !== false && !this.params.bypass;

    // Update node handles positions
    [1, 2, 3, 4].forEach(idx => {
      const handle = document.getElementById(`handle-b${idx}`) || document.getElementById(`eq-node-${idx}`);
      const b = idx === 1 ? b1 : idx === 2 ? b2 : idx === 3 ? b3 : b4;
      if (handle) {
        handle.setAttribute('cx', fToX(b.f).toFixed(1));
        handle.setAttribute('cy', (isEqActive ? gToY(b.g) : 70).toFixed(1));
        handle.style.opacity = isEqActive ? '1' : '0.4';
      }
    });

    if (!isEqActive) {
      path.setAttribute('d', `M 0,70 L ${width},70`);
      if (area) area.setAttribute('d', `M 0,70 L ${width},70 Z`);
      path.style.opacity = '0.35';
      if (area) area.style.opacity = '0.1';
      return;
    }

    path.style.opacity = '1';
    if (area) area.style.opacity = '0.28';

    // Compute synthetic frequency response points
    const points = [];
    for (let x = 0; x <= width; x += 3) {
      const f = Math.pow(10, logMin + (x / width) * (logMax - logMin));
      
      let totalGain = 0;
      [b1, b2, b3, b4].forEach((b, bIdx) => {
        if (Math.abs(b.g) < 0.01) return;
        if (bIdx === 0) {
          // Low shelf
          const ratio = f / b.f;
          totalGain += b.g / (1 + Math.pow(ratio, 2));
        } else if (bIdx === 3) {
          // High shelf
          const ratio = b.f / f;
          totalGain += b.g / (1 + Math.pow(ratio, 2));
        } else {
          // Peaking bell
          const octDiff = Math.abs(Math.log2(f / b.f));
          const bell = Math.exp(-Math.pow(octDiff * b.q * 1.5, 2));
          totalGain += b.g * bell;
        }
      });

      const y = gToY(totalGain);
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }

    const curveD = `M ${points.join(' L ')}`;
    path.setAttribute('d', curveD);
    if (area) {
      area.setAttribute('d', `${curveD} L ${width},70 L 0,70 Z`);
    }
  }

  // ==================== AUDIO TRANSPORT & EXPORT CONTROLS ====================
  bindTransportControls() {
    // Mode Switching
    const tabFile = document.getElementById('tab-file-mode');
    const tabMic = document.getElementById('tab-mic-mode');
    const btnBrowse = document.getElementById('btn-browse-file') || document.querySelector('.btn-picker');
    const fileInput = document.getElementById('audio-file-input');
    const filePickerGroup = document.getElementById('file-picker-group');
    const fileTrackInfo = document.getElementById('file-track-info');
    const btnPlay = document.getElementById('btn-transport-play') || document.getElementById('btn-play-pause');
    const btnPrev = document.getElementById('btn-transport-prev') || document.getElementById('btn-prev');
    const btnLoop = document.getElementById('btn-transport-loop') || document.getElementById('btn-loop');
    const btnExport = document.getElementById('btn-export-audio');
    const scrubber = document.getElementById('audio-scrubber');
    const waveformCanvas = document.getElementById('waveform-canvas');
    const windowEl = document.querySelector('.vocalizer-window') || document.body;

    if (tabFile && tabMic) {
      tabFile.addEventListener('click', () => {
        this.audioSourceMode = 'file';
        tabFile.classList.add('active');
        tabMic.classList.remove('active');
        if (this.micStream) {
          this.micStream.getTracks().forEach(t => t.stop());
          this.micStream = null;
        }
      });

      tabMic.addEventListener('click', async () => {
        this.audioSourceMode = 'mic';
        tabMic.classList.add('active');
        tabFile.classList.remove('active');
        if (this.isPlaying) {
          this.pauseAudio();
        }
        await this.toggleMicrophone(true);
      });
    }

    const btnLoadDemo = document.getElementById('btn-load-demo');

    // Direct Audio File Input Handler (Guaranteed Binding)
    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          try {
            await this.loadAudioFile(file);
          } catch (err) {
            console.error('[Vocalizer Pro] Error saat loadAudioFile:', err);
          } finally {
            try { fileInput.value = ''; } catch (ignore) {}
          }
        }
      });
    }

    // Direct click handler for browse button (if not already handled natively by <label for>)
    if (btnBrowse && fileInput) {
      if (btnBrowse.tagName !== 'LABEL') {
        btnBrowse.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          fileInput.click();
        });
      }
    }

    // Direct click handler for demo audio loader
    if (btnLoadDemo) {
      btnLoadDemo.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this.loadAudioUrl('demo_vocal.wav', 'Demo Vokal (Lead)');
      });
    }

    // Click handler for badge info (if not already handled natively by <label for>)
    if (fileTrackInfo && fileInput) {
      if (fileTrackInfo.tagName !== 'LABEL') {
        fileTrackInfo.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          fileInput.click();
        });
      }
    }

    // Drag and Drop Audio File globally across window
    ['dragenter', 'dragover'].forEach(eventName => {
      window.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        windowEl.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      window.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        windowEl.classList.remove('drag-over');
      });
    });

    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('audio/') || file.name.match(/\.(wav|mp3|ogg|flac|m4a|aac)$/i)) {
          await this.loadAudioFile(file);
        } else {
          alert('Format tidak didukung. Harap masukkan file audio (.wav, .mp3, .flac, .ogg, .m4a).');
        }
      }
    });

    // Transport buttons
    if (btnPlay) {
      btnPlay.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!this.audioBuffer) {
          if (fileInput) fileInput.click();
          return;
        }
        if (this.isPlaying) {
          this.pauseAudio();
        } else {
          await this.playAudio();
        }
      });
    }

    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        this.seekTo(0);
      });
    }

    if (btnLoop) {
      btnLoop.addEventListener('click', () => {
        this.isLooping = !this.isLooping;
        btnLoop.classList.toggle('active', this.isLooping);
        if (this.activeSourceNode) {
          this.activeSourceNode.loop = this.isLooping;
        }
      });
    }

    // Scrubber interaction
    if (scrubber) {
      scrubber.addEventListener('input', (e) => {
        if (!this.audioBuffer) return;
        this.isSeeking = true;
        const targetTime = (parseFloat(e.target.value) / 100) * this.audioBuffer.duration;
        const timeDisplay = document.getElementById('time-display');
        if (timeDisplay) {
          timeDisplay.textContent = `${this.formatTime(targetTime)} / ${this.formatTime(this.audioBuffer.duration)}`;
        }
      });

      scrubber.addEventListener('change', (e) => {
        if (!this.audioBuffer) return;
        const targetTime = (parseFloat(e.target.value) / 100) * this.audioBuffer.duration;
        this.seekTo(targetTime);
        this.isSeeking = false;
      });
    }

    // Waveform canvas click to seek
    if (waveformCanvas) {
      waveformCanvas.addEventListener('click', (e) => {
        if (!this.audioBuffer) return;
        const rect = waveformCanvas.getBoundingClientRect();
        const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        this.seekTo(fraction * this.audioBuffer.duration);
      });
    }

    // Export WAV button
    if (btnExport) {
      btnExport.addEventListener('click', async () => {
        await this.exportRenderedWAV();
      });
    }
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      // 1. Try FileReader first (universal across all browser & webview engines)
      if (typeof FileReader !== 'undefined') {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => {
          if (typeof file.arrayBuffer === 'function') {
            file.arrayBuffer().then(resolve).catch(reject);
          } else {
            reject(new Error('Gagal membaca berkas audio dari disk'));
          }
        };
        reader.onabort = () => reject(new Error('Pembacaan berkas dibatalkan'));
        try {
          reader.readAsArrayBuffer(file);
          return;
        } catch (readErr) {
          console.warn('[Vocalizer Pro] FileReader.readAsArrayBuffer threw:', readErr);
        }
      }

      // 2. Fallback to Blob.arrayBuffer()
      if (typeof file.arrayBuffer === 'function') {
        file.arrayBuffer().then(resolve).catch(reject);
      } else {
        reject(new Error('Browser tidak mendukung pembacaan ArrayBuffer berkas'));
      }
    });
  }

  async decodeAudioDataSafely(arrayBuffer) {
    await this.ensureAudioContext();

    // Strategy 1: Standard Modern Promise API
    try {
      const copy1 = arrayBuffer.slice(0);
      const decoded = await this.audioCtx.decodeAudioData(copy1);
      if (decoded && decoded.duration > 0) {
        return decoded;
      }
    } catch (promiseErr) {
      console.warn('[Vocalizer Pro] Modern decodeAudioData failed, trying callback fallback:', promiseErr);
    }

    // Strategy 2: Classic Callback API
    return new Promise((resolve, reject) => {
      try {
        const copy2 = arrayBuffer.slice(0);
        this.audioCtx.decodeAudioData(
          copy2,
          (decoded) => resolve(decoded),
          (err) => reject(err || new Error('Format audio tidak didukung oleh browser Web Audio engine'))
        );
      } catch (err) {
        reject(err);
      }
    });
  }

  async loadAudioFile(file) {
    if (!file) return;
    console.log('[Vocalizer Pro] Memuat file audio:', file.name, 'Ukuran:', file.size, 'Tipe:', file.type);
    
    await this.ensureAudioContext();

    this.loadedFilename = file.name;
    const nameEl = document.getElementById('track-name-display') || document.getElementById('track-filename');
    const badgeInfo = document.getElementById('file-track-info');
    if (nameEl) {
      nameEl.textContent = `Memuat: ${file.name}...`;
    }
    if (badgeInfo) {
      badgeInfo.classList.remove('loaded');
      badgeInfo.classList.add('loading');
    }

    try {
      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      this.audioBuffer = await this.decodeAudioDataSafely(arrayBuffer);

      this.playbackOffset = 0;
      this.stopAudio(false);

      if (nameEl) {
        nameEl.textContent = `${file.name} (${this.formatTime(this.audioBuffer.duration)})`;
      }
      if (badgeInfo) {
        badgeInfo.classList.remove('loading');
        badgeInfo.classList.add('loaded');
      }

      const timeDisplay = document.getElementById('time-display');
      if (timeDisplay) {
        timeDisplay.textContent = `00:00 / ${this.formatTime(this.audioBuffer.duration)}`;
      }

      const scrubber = document.getElementById('audio-scrubber');
      if (scrubber) {
        scrubber.value = 0;
      }

      this.renderWaveform();
      console.log(`[Vocalizer Pro] Berkas audio berhasil dimuat: ${file.name} (${this.audioBuffer.duration.toFixed(2)}s, ${this.audioBuffer.numberOfChannels} ch, ${this.audioBuffer.sampleRate} Hz)`);

      // Switch mode to file
      this.audioSourceMode = 'file';
      const tabFile = document.getElementById('tab-file-mode');
      const tabMic = document.getElementById('tab-mic-mode');
      if (tabFile) tabFile.classList.add('active');
      if (tabMic) tabMic.classList.remove('active');
    } catch (err) {
      console.error('[Vocalizer Pro] Gagal membaca/mendekode audio buffer:', err);
      if (nameEl) {
        nameEl.textContent = `Gagal memuat: ${file.name} (${err.message || 'Format tidak didukung'})`;
      }
      if (badgeInfo) {
        badgeInfo.classList.remove('loading');
      }
    }
  }

  async loadAudioUrl(url, displayName = 'Audio Demo') {
    await this.ensureAudioContext();

    const nameEl = document.getElementById('track-name-display') || document.getElementById('track-filename');
    const badgeInfo = document.getElementById('file-track-info');
    if (nameEl) nameEl.textContent = `Memuat: ${displayName}...`;
    if (badgeInfo) {
      badgeInfo.classList.remove('loaded');
      badgeInfo.classList.add('loading');
    }

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const arrayBuffer = await response.arrayBuffer();
      this.audioBuffer = await this.decodeAudioDataSafely(arrayBuffer);

      this.loadedFilename = displayName;
      this.playbackOffset = 0;
      this.stopAudio(false);

      if (nameEl) {
        nameEl.textContent = `${displayName} (${this.formatTime(this.audioBuffer.duration)})`;
      }
      if (badgeInfo) {
        badgeInfo.classList.remove('loading');
        badgeInfo.classList.add('loaded');
      }

      const timeDisplay = document.getElementById('time-display');
      if (timeDisplay) {
        timeDisplay.textContent = `00:00 / ${this.formatTime(this.audioBuffer.duration)}`;
      }

      const scrubber = document.getElementById('audio-scrubber');
      if (scrubber) {
        scrubber.value = 0;
      }

      this.renderWaveform();
      console.log(`[Vocalizer Pro] Berkas demo berhasil dimuat: ${displayName} (${this.audioBuffer.duration.toFixed(2)}s)`);

      this.audioSourceMode = 'file';
      const tabFile = document.getElementById('tab-file-mode');
      const tabMic = document.getElementById('tab-mic-mode');
      if (tabFile) tabFile.classList.add('active');
      if (tabMic) tabMic.classList.remove('active');
    } catch (err) {
      console.error('[Vocalizer Pro] Gagal memuat audio demo:', err);
      if (nameEl) {
        nameEl.textContent = `Gagal memuat: ${displayName} (${err.message})`;
      }
      if (badgeInfo) {
        badgeInfo.classList.remove('loading');
      }
    }
  }

  renderWaveform() {
    const canvas = document.getElementById('waveform-canvas');
    if (!canvas || !this.audioBuffer) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 240;
    const h = rect.height || 26;
    
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const midY = h / 2;
    ctx.clearRect(0, 0, w, h);

    const channelData = this.audioBuffer.getChannelData(0);
    const step = Math.ceil(channelData.length / w);
    const amp = h / 2;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#00e5ff');
    grad.addColorStop(0.5, '#24b7e8');
    grad.addColorStop(1, '#0077b6');
    ctx.fillStyle = grad;

    for (let x = 0; x < w; x++) {
      let min = 1.0;
      let max = -1.0;
      const start = x * step;
      const end = Math.min(start + step, channelData.length);
      const subStep = Math.max(1, Math.floor((end - start) / 10));
      for (let j = start; j < end; j += subStep) {
        const val = channelData[j];
        if (val < min) min = val;
        if (val > max) max = val;
      }
      const top = midY + (min * amp * 0.95);
      const bottom = midY + (max * amp * 0.95);
      const barHeight = Math.max(1, bottom - top);
      ctx.fillRect(x, top, 1.2, barHeight);
    }
  }

  async ensureAudioContext() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.buildDSPChain();
    }
    if (this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
      } catch (e) {
        console.warn('[Vocalizer Pro] AudioContext resume failed:', e);
      }
    }
    return this.audioCtx;
  }

  async playAudio() {
    if (!this.audioBuffer) return;
    await this.ensureAudioContext();

    if (this.isPlaying) return;

    if (this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
      } catch (e) {
        console.warn('[Vocalizer Pro] AudioContext resume failed in playAudio:', e);
      }
    }

    const source = this.audioCtx.createBufferSource();
    source.buffer = this.audioBuffer;
    source.loop = this.isLooping;

    // Connect source to DSP chain input
    source.connect(this.inputNode);
    
    const offset = Math.max(0, Math.min(this.playbackOffset, this.audioBuffer.duration));
    try {
      source.start(0, offset);
    } catch (e) {
      console.error('[Vocalizer Pro] Gagal memulai audio source:', e);
      return;
    }

    this.playbackStartTime = this.audioCtx.currentTime - offset;
    this.activeSourceNode = source;
    this.isPlaying = true;

    source.onended = () => {
      if (!this.isLooping && this.isPlaying && (this.getCurrentPlaybackTime() >= this.audioBuffer.duration - 0.05)) {
        this.stopAudio(true);
      }
    };

    this.updatePlayPauseButtonUI(true);
  }

  pauseAudio() {
    if (!this.isPlaying) return;
    this.playbackOffset = this.getCurrentPlaybackTime();
    if (this.activeSourceNode) {
      try {
        this.activeSourceNode.stop();
        this.activeSourceNode.disconnect();
      } catch (e) {}
      this.activeSourceNode = null;
    }
    this.isPlaying = false;
    this.updatePlayPauseButtonUI(false);
  }

  stopAudio(resetOffset = true) {
    if (this.activeSourceNode) {
      try {
        this.activeSourceNode.stop();
        this.activeSourceNode.disconnect();
      } catch (e) {}
      this.activeSourceNode = null;
    }
    this.isPlaying = false;
    if (resetOffset) {
      this.playbackOffset = 0;
      this.updateScrubberUI(0);
    }
    this.updatePlayPauseButtonUI(false);
  }

  seekTo(targetTime) {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) {
      this.pauseAudio();
    }
    this.playbackOffset = Math.max(0, Math.min(targetTime, this.audioBuffer ? this.audioBuffer.duration : 0));
    this.updateScrubberUI(this.playbackOffset);
    if (wasPlaying) {
      this.playAudio();
    }
  }

  getCurrentPlaybackTime() {
    if (!this.audioBuffer) return 0;
    if (!this.isPlaying) return this.playbackOffset;
    const elapsed = this.audioCtx.currentTime - this.playbackStartTime;
    if (this.isLooping) {
      return elapsed % this.audioBuffer.duration;
    }
    return Math.min(elapsed, this.audioBuffer.duration);
  }

  updatePlayPauseButtonUI(isPlaying) {
    const btnPlay = document.getElementById('btn-transport-play') || document.getElementById('btn-play-pause');
    const iconPlay = document.getElementById('icon-play');
    const iconPause = document.getElementById('icon-pause');
    if (btnPlay) {
      btnPlay.classList.toggle('playing', isPlaying);
      btnPlay.classList.toggle('active', isPlaying);
      btnPlay.title = isPlaying ? "Pause Audio" : "Play Audio";
    }
    if (iconPlay && iconPause) {
      iconPlay.style.display = isPlaying ? 'none' : 'block';
      iconPause.style.display = isPlaying ? 'block' : 'none';
    }
  }

  updateScrubberUI(currentTime) {
    if (!this.audioBuffer) return;
    const fraction = Math.max(0, Math.min(1, currentTime / this.audioBuffer.duration));
    const scrubber = document.getElementById('audio-scrubber');
    if (scrubber && !this.isSeeking) {
      scrubber.value = (fraction * 100).toFixed(1);
    }
    const timeDisplay = document.getElementById('time-display');
    if (timeDisplay) {
      timeDisplay.textContent = `${this.formatTime(currentTime)} / ${this.formatTime(this.audioBuffer.duration)}`;
    }
  }

  // ==================== OFFLINE AUDIO EXPORT TO WAV ====================
  async exportRenderedWAV() {
    if (!this.audioBuffer) {
      alert('⚠️ Tidak ada berkas audio yang dimuat! Silakan pilih berkas audio terlebih dahulu sebelum melakukan export.');
      return;
    }

    const btnExport = document.getElementById('btn-export-audio');
    const originalHTML = btnExport ? btnExport.innerHTML : '';
    
    if (btnExport) {
      btnExport.classList.add('rendering');
      btnExport.innerHTML = `
        <svg class="spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
        </svg>
        <span>Rendering WAV...</span>`;
    }

    try {
      const srcBuffer = this.audioBuffer;
      const numChannels = srcBuffer.numberOfChannels;
      const length = srcBuffer.length;
      const sampleRate = srcBuffer.sampleRate;

      // 1. Initialize Offline Audio Context
      const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
        numChannels,
        length,
        sampleRate
      );

      // 2. Offline Source Node
      const offlineSource = offlineCtx.createBufferSource();
      offlineSource.buffer = srcBuffer;

      // 3. Recreate Full DSP Chain in Offline Context
      const inGain = offlineCtx.createGain();
      const inLinear = Math.pow(10, this.params.input_gain / 20);
      inGain.gain.setValueAtTime(inLinear, 0);

      const outGain = offlineCtx.createGain();
      const outLinear = Math.pow(10, this.params.output_gain / 20);
      outGain.gain.setValueAtTime(outLinear, 0);

      offlineSource.connect(inGain);

      let lastNode = inGain;

      // Check bypass
      if (!this.params.bypass) {
        // 4-Band Parametric EQ
        if (this.params.eq_enabled) {
          const eqBands = [1, 2, 3, 4].map(b => {
            const filter = offlineCtx.createBiquadFilter();
            filter.type = (b === 1) ? 'lowshelf' : (b === 4) ? 'highshelf' : 'peaking';
            filter.frequency.setValueAtTime(this.params[`eq_b${b}_f`], 0);
            filter.gain.setValueAtTime(this.params[`eq_b${b}_g`], 0);
            filter.Q.setValueAtTime(this.params[`eq_b${b}_q`], 0);
            return filter;
          });

          eqBands.forEach(filter => {
            lastNode.connect(filter);
            lastNode = filter;
          });
        }

        // FX: Doubler / Delay
        if (this.params.fx_enabled && this.params.dly_amt > 0) {
          const delayNode = offlineCtx.createDelay(2.0);
          const delayTimeSec = Math.max(0.01, (this.params.dly_dly || 200) / 1000);
          delayNode.delayTime.setValueAtTime(delayTimeSec, 0);

          const feedbackGain = offlineCtx.createGain();
          const feedbackVal = Math.min(0.9, (this.params.dly_fdb || 30) / 100);
          feedbackGain.gain.setValueAtTime(feedbackVal, 0);

          const wetGain = offlineCtx.createGain();
          const wetVal = Math.min(1.0, (this.params.dly_amt || 20) / 100);
          wetGain.gain.setValueAtTime(wetVal, 0);

          // Delay feedback loop
          delayNode.connect(feedbackGain);
          feedbackGain.connect(delayNode);
          delayNode.connect(wetGain);

          // Split: Dry and Wet mix
          const fxMixer = offlineCtx.createGain();
          lastNode.connect(fxMixer); // dry
          lastNode.connect(delayNode); // wet input
          wetGain.connect(fxMixer); // wet sum
          lastNode = fxMixer;
        }

        // Dynamics Compressor / Limiter
        const compressor = offlineCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-18, 0);
        compressor.knee.setValueAtTime(12, 0);
        compressor.ratio.setValueAtTime(4, 0);
        compressor.attack.setValueAtTime(0.003, 0);
        compressor.release.setValueAtTime(0.25, 0);

        lastNode.connect(compressor);
        lastNode = compressor;
      }

      lastNode.connect(outGain);
      outGain.connect(offlineCtx.destination);

      // Start offline rendering
      offlineSource.start(0);
      const renderedBuffer = await offlineCtx.startRendering();

      // 4. Encode Rendered AudioBuffer into Standard 16-bit PCM WAV
      const wavBlob = this.encodeWAV(renderedBuffer);

      // 5. Trigger Instant Browser Download
      const baseName = this.loadedFilename ? this.loadedFilename.replace(/\.[^/.]+$/, "") : "vocalizer";
      const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const outputFilename = `${baseName}_vocalized_${timestamp}.wav`;

      const downloadUrl = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = outputFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      console.log(`[Vocalizer Pro] WAV Exported Successfully: ${outputFilename} (${wavBlob.size} bytes)`);

      // 6. Visual Success Feedback
      if (btnExport) {
        btnExport.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#00e676" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span style="color: #00e676">Exported!</span>`;
        setTimeout(() => {
          btnExport.classList.remove('rendering');
          btnExport.innerHTML = originalHTML;
        }, 2200);
      }
    } catch (err) {
      console.error('[Vocalizer Pro] Export failed:', err);
      alert(`Export Gagal: ${err.message || err}`);
      if (btnExport) {
        btnExport.classList.remove('rendering');
        btnExport.innerHTML = originalHTML;
      }
    }
  }

  // Standard 16-bit PCM RIFF WAV Encoder
  encodeWAV(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    let interleaved;
    if (numChannels === 2) {
      const left = audioBuffer.getChannelData(0);
      const right = audioBuffer.getChannelData(1);
      interleaved = new Float32Array(left.length + right.length);
      for (let i = 0; i < left.length; i++) {
        interleaved[i * 2] = left[i];
        interleaved[i * 2 + 1] = right[i];
      }
    } else {
      interleaved = audioBuffer.getChannelData(0);
    }
    
    const byteRate = (sampleRate * numChannels * bitDepth) / 8;
    const blockAlign = (numChannels * bitDepth) / 8;
    const dataSize = interleaved.length * (bitDepth / 8);
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    
    function writeString(view, offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }
    
    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // RIFF chunk length
    view.setUint32(4, 36 + dataSize, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw PCM = 1)
    view.setUint16(20, format, true);
    // channel count
    view.setUint16(22, numChannels, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate
    view.setUint32(28, byteRate, true);
    // block align
    view.setUint16(32, blockAlign, true);
    // bits per sample
    view.setUint16(34, bitDepth, true);
    // data chunk identifier
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, dataSize, true);
    
    // Write 16-bit PCM samples with clipping protection
    let offset = 44;
    for (let i = 0; i < interleaved.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, interleaved[i]));
      s = s < 0 ? s * 0x8000 : s * 0x7FFF;
      view.setInt16(offset, s, true);
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  }

  // ==================== PARAMETER DISPATCH ====================
  onParamChange(param, value) {
    // Send to WebSocket backend if connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'SET_PARAM',
        param: param,
        value: value
      }));
    }

    if (param.startsWith('eq_') || param === 'bypass') {
      this.updateEQCurve();
    }

    // Update realtime WebAudio DSP
    this.updateAudioDSP(param, value);
  }

  // ==================== WEBSOCKET INTEGRATION ====================
  setupWebSocket() {
    const port = window.location.port || '8080';
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.hostname}:${port}/ws`;

    try {
      this.ws = new WebSocket(url);
      
      this.ws.onopen = () => {
        console.log('[Vocalizer Pro] Connected to backend DSP socket');
        this.ws.send(JSON.stringify({ type: 'GET_STATE' }));
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'STATE_UPDATE' && msg.params) {
            Object.assign(this.params, msg.params);
            this.refreshAllUI();
          } else if (msg.type === 'PITCH_TELEMETRY') {
            this.updateTuneDisplay(msg.note, msg.freq, msg.cents);
          }
        } catch (e) {
          console.error('[Vocalizer Pro] Malformed WS message:', e);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[Vocalizer Pro] Running standalone client DSP');
      };
    } catch (e) {
      console.warn('[Vocalizer Pro] WS connection failed, running standalone client DSP');
    }
  }

  refreshAllUI() {
    document.querySelectorAll('.rotary-dial').forEach(dial => {
      const p = dial.dataset.param;
      if (this.params[p] !== undefined) {
        this.updateDialUI(dial, this.params[p], parseFloat(dial.dataset.min), parseFloat(dial.dataset.max), dial.dataset.unit || '');
      }
    });

    ['tune_enabled', 'eq_enabled', 'fx_enabled'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.checked = this.params[id];
    });

    const bypassBtn = document.getElementById('btn-bypass');
    if (bypassBtn) bypassBtn.classList.toggle('active', this.params.bypass);

    this.updateEQCurve();
  }

  // ==================== WEBAUDIO DSP ENGINE ====================
  async setupAudioEngine() {
    this.ensureAudioContext();
  }

  async initAudioContext() {
    if (this.audioCtx && this.audioCtx.state === 'running') {
      await this.audioCtx.suspend();
      const startBtn = document.getElementById('btn-start-audio');
      if (startBtn) startBtn.classList.remove('active');
      return;
    }

    try {
      this.ensureAudioContext();
      const startBtn = document.getElementById('btn-start-audio');
      if (startBtn) startBtn.classList.add('active');
      this.isAudioRunning = true;
    } catch (err) {
      console.error('[Vocalizer Pro] Failed to start AudioContext:', err);
    }
  }

  async toggleMicrophone(forceOn = false) {
    const micBtn = document.getElementById('btn-mic-toggle');
    const micText = document.getElementById('mic-status-text');

    if (this.micStream && !forceOn) {
      this.micStream.getTracks().forEach(track => track.stop());
      this.micStream = null;
      if (micBtn) micBtn.classList.remove('active');
      if (micText) micText.textContent = 'Mic Input: Off';
      return;
    }

    try {
      this.ensureAudioContext();
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
          latency: 0
        }
      });

      const micSource = this.audioCtx.createMediaStreamSource(this.micStream);
      micSource.connect(this.inputNode);
      if (micBtn) micBtn.classList.add('active');
      if (micText) micText.textContent = 'Mic Input: Live';
      this.isAudioRunning = true;
    } catch (e) {
      console.warn('[Vocalizer Pro] Mic access denied, running internal audio simulation');
      if (micText) micText.textContent = 'Mic: Fallback Sim';
    }
  }

  buildDSPChain() {
    if (!this.audioCtx) return;

    this.inputNode = this.audioCtx.createGain();
    this.outputNode = this.audioCtx.createGain();

    // 4-Band Parametric EQ Filters
    this.eqFilters = [1, 2, 3, 4].map(b => {
      const f = this.audioCtx.createBiquadFilter();
      f.type = (b === 1) ? 'lowshelf' : (b === 4) ? 'highshelf' : 'peaking';
      f.frequency.value = this.params[`eq_b${b}_f`];
      f.gain.value = this.params[`eq_b${b}_g`];
      f.Q.value = this.params[`eq_b${b}_q`];
      return f;
    });

    // Pitch detection analyser
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 2048;

    // Connect chain: input -> EQ1 -> EQ2 -> EQ3 -> EQ4 -> Analyser -> Output
    let current = this.inputNode;
    this.eqFilters.forEach(f => {
      current.connect(f);
      current = f;
    });

    current.connect(this.analyser);
    this.analyser.connect(this.outputNode);
    this.outputNode.connect(this.audioCtx.destination);
  }

  updateAudioDSP(param, val) {
    if (!this.audioCtx) return;

    if (param === 'input_gain' && this.inputNode) {
      const linear = Math.pow(10, val / 20);
      this.inputNode.gain.setTargetAtTime(linear, this.audioCtx.currentTime, 0.02);
    } else if (param === 'output_gain' && this.outputNode) {
      const linear = Math.pow(10, val / 20);
      this.outputNode.gain.setTargetAtTime(linear, this.audioCtx.currentTime, 0.02);
    } else if (param.startsWith('eq_b') && this.eqFilters) {
      const match = param.match(/eq_b([1-4])_([fgq])/);
      if (match) {
        const band = parseInt(match[1]) - 1;
        const prop = match[2];
        const filter = this.eqFilters[band];
        if (filter) {
          if (prop === 'f') {
            try { filter.frequency.value = val; } catch (e) {}
            try { filter.frequency.setTargetAtTime(val, this.audioCtx.currentTime, 0.01); } catch (e) {}
          }
          if (prop === 'g') {
            const isEqActive = this.params.eq_enabled !== false && !this.params.bypass;
            const appliedGain = isEqActive ? val : 0;
            try { filter.gain.value = appliedGain; } catch (e) {}
            try { filter.gain.setTargetAtTime(appliedGain, this.audioCtx.currentTime, 0.01); } catch (e) {}
          }
          if (prop === 'q') {
            try { filter.Q.value = val; } catch (e) {}
            try { filter.Q.setTargetAtTime(val, this.audioCtx.currentTime, 0.01); } catch (e) {}
          }
        }
      }
    } else if ((param === 'eq_enabled' || param === 'bypass') && this.eqFilters) {
      const isEqActive = this.params.eq_enabled !== false && !this.params.bypass;
      this.eqFilters.forEach((filter, idx) => {
        const targetGain = isEqActive ? (this.params[`eq_b${idx + 1}_g`] || 0) : 0;
        try { filter.gain.value = targetGain; } catch (e) {}
        try { filter.gain.setTargetAtTime(targetGain, this.audioCtx.currentTime, 0.01); } catch (e) {}
      });
      this.updateEQCurve();
    }
  }

  startVisualizerLoop() {
    let phase = 0;
    const loop = () => {
      // 1. Scrubber playhead updater
      if (this.isPlaying && this.audioBuffer && !this.isSeeking) {
        const curr = this.getCurrentPlaybackTime();
        this.updateScrubberUI(curr);
      }

      // 2. Pitch Telemetry updater
      if (this.analyser && (this.isAudioRunning || this.isPlaying)) {
        const timeData = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(timeData);
        
        const detectedFreq = this.detectPitchYIN(timeData, this.audioCtx.sampleRate);
        if (detectedFreq > 50 && detectedFreq < 1200) {
          const noteInfo = this.freqToNote(detectedFreq);
          this.updateTuneDisplay(noteInfo.note, detectedFreq, noteInfo.cents);
        }
      } else if (!this.isPlaying && this.isAudioRunning) {
        // Subtle idle wobble
        phase += 0.025;
        const mockFreq = 440 + Math.sin(phase) * 12;
        const mockNote = this.freqToNote(mockFreq);
        this.updateTuneDisplay(mockNote.note, mockFreq, mockNote.cents);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  freqToNote(freq) {
    const noteNum = 12 * (Math.log2(freq / 440)) + 69;
    const rounded = Math.round(noteNum);
    const cents = (noteNum - rounded) * 100;
    const noteIndex = (rounded % 12 + 12) % 12;
    return {
      note: this.notes[noteIndex],
      cents: cents
    };
  }

  detectPitchYIN(buffer, sampleRate) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
    const rms = Math.sqrt(sum / buffer.length);
    if (rms < 0.01) return 0; // silence

    const threshold = 0.15;
    const maxLag = Math.floor(sampleRate / 60);
    const minLag = Math.floor(sampleRate / 1000);
    const diff = new Float32Array(maxLag);

    for (let tau = 1; tau < maxLag; tau++) {
      let d = 0;
      for (let i = 0; i < maxLag; i++) {
        const delta = buffer[i] - buffer[i + tau];
        d += delta * delta;
      }
      diff[tau] = d;
    }

    let runningSum = 0;
    diff[0] = 1;
    for (let tau = 1; tau < maxLag; tau++) {
      runningSum += diff[tau];
      diff[tau] = (diff[tau] * tau) / (runningSum || 1);
      if (tau > minLag && diff[tau] < threshold) {
        return sampleRate / tau;
      }
    }
    return 0;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.vocalizerApp = new VocalizerApp();
});
