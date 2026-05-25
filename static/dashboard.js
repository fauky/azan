/**
 * dashboard.js — Azan Dashboard
 * 
 * Core logic for the Azan Dashboard application.
 * Handles prayer time calculations, weather updates, audio playback,
 * and UI state management.
 */
(function () {
  'use strict';

  // ===========================================================================
  // CONFIGURATION & CONSTANTS
  // ===========================================================================

  const Config = window.AZAN_CONFIG;

  const PRAYER_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  
  const GREG_MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const GREG_DAYS = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
  ];

  const WEATHER_ICONS = {
    2:   { char: '&#9928;',   cls: 'wi-thunder',   label: 'Thunderstorm' },
    3:   { char: '&#127782;', cls: 'wi-drizzle',   label: 'Drizzle'      },
    5:   { char: '&#127783;', cls: 'wi-rain',      label: 'Rain'         },
    6:   { char: '&#10052;',  cls: 'wi-snow',      label: 'Snow'         },
    7:   { char: '&#127787;', cls: 'wi-fog',       label: 'Fog'          },
    800: { char: '&#9728;',   cls: 'wi-clear',     label: 'Clear'        },
    801: { char: '&#9729;',   cls: 'wi-fewclouds', label: 'Few Clouds'   },
    802: { char: '&#9729;',   cls: 'wi-clouds',    label: 'Partly Cloudy'},
    803: { char: '&#9729;',   cls: 'wi-clouds',    label: 'Mostly Cloudy'},
    804: { char: '&#9729;',   cls: 'wi-overcast',  label: 'Overcast'     },
  };

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  const Utils = {
    pad(n) {
      return String(n).padStart(2, '0');
    },

    el(id) {
      return document.getElementById(id);
    },

    formatTime(date) {
      if (!date) return '--:--';
      let h = date.getHours();
      const m = date.getMinutes();
      if (Config.timeFormat === '12h') {
        h = h % 12 || 12;
        return String(h).padStart(2, ' ') + ':' + Utils.pad(m);
      }
      return Utils.pad(h) + ':' + Utils.pad(m);
    },

    formatDuration(ms) {
      if (ms < 0) ms = 0;
      const s = Math.floor(ms / 1000);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      
      if (h > 0) {
        return Utils.pad(h) + ':' + Utils.pad(m) + ':' + Utils.pad(sec);
      }
      return Utils.pad(m) + ':' + Utils.pad(sec);
    },

    /**
     * Generic XHR GET helper with JSON parsing and error handling.
     */
    xhrGet(url, onSuccess, headers = {}) {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = 8000;
      
      for (const [key, value] of Object.entries(headers)) {
        xhr.setRequestHeader(key, value);
      }

      xhr.onreadystatechange = function() {
        if (xhr.readyState !== 4) return;
        if (xhr.status === 200) {
          try {
            onSuccess(JSON.parse(xhr.responseText));
          } catch(e) {
            console.warn('[xhr] parse error', e);
          }
        } else {
          console.warn('[xhr] HTTP ' + xhr.status + ' for ' + url);
        }
      };
      xhr.ontimeout = function() { console.warn('[xhr] timeout', url); };
      xhr.onerror   = function() { console.warn('[xhr] error',   url); };
      xhr.send();
    }
  };

  // ===========================================================================
  // MODULE: PRAYER TIMES
  // ===========================================================================

  const PrayerManager = {
    currentTimes: null,
    tomorrowTimes: null,
    lastCalcDay: -1,
    showingTomorrow: false,
    rowCache: {}, // Cache DOM elements to avoid repeated lookups

    buildParams() {
      const methodMap = {
        'ISNA': 'NorthAmerica', 'NorthAmerica': 'NorthAmerica',
        'MWL': 'MuslimWorldLeague', 'MuslimWorldLeague': 'MuslimWorldLeague',
        'Egyptian': 'Egyptian', 'UmmAlQura': 'UmmAlQura',
        'Kuwait': 'Kuwait', 'Qatar': 'Qatar', 'Singapore': 'Singapore', 'Turkey': 'Turkey'
      };
      const mn = methodMap[Config.calculationMethod] || 'NorthAmerica';
      const params = adhan.CalculationMethod[mn]();
      
      if (Config.madhab === 'Hanafi' && adhan.Madhab) {
        params.madhab = adhan.Madhab.Hanafi;
      }
      if (Config.offsets) {
        params.adjustments = Config.offsets;
      }
      return params;
    },

    calcForDate(date) {
      const coords = new adhan.Coordinates(Config.latitude, Config.longitude);
      return new adhan.PrayerTimes(coords, date, this.buildParams());
    },

    calculate(date) {
      this.currentTimes = this.calcForDate(date);
      this.tomorrowTimes = null; // Reset tomorrow times so they are re-calculated if needed
      this.lastCalcDay = date.getDate();
    },

    ensureTomorrowTimes(now) {
      if (!this.tomorrowTimes) {
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        this.tomorrowTimes = this.calcForDate(tomorrow);
      }
    },

    displayTimes(times) {
      PRAYER_KEYS.forEach(key => {
        const elTime = Utils.el('time-' + key);
        if (elTime && times[key]) {
          elTime.textContent = Utils.formatTime(times[key]);
        }
      });

      // Update Dhuhr label: Show 'الجمعة' if the displayed times are for Friday, else 'الظهر'
      const dhuhrRow = Utils.el('prayer-dhuhr');
      if (dhuhrRow && times.date) {
        const label = dhuhrRow.querySelector('.prayer-name-ar');
        if (label) {
          label.textContent = (times.date.getDay() === 5) ? 'الجمعة' : 'الظهر';
        }
      }
    },

    /**
     * Determines the current state of prayers (active, next, past).
     * Returns a state object used for UI rendering and Audio triggers.
     */
    getState(now) {
      const nowMs = now.getTime();
      
      // Map today's prayers to timestamps
      const todayList = PRAYER_KEYS.map(key => ({
        key: key,
        ts: (this.currentTimes && this.currentTimes[key]) ? this.currentTimes[key].getTime() : null
      }));

      // Find the next prayer for today
      let nextToday = null;
      for (let i = 0; i < todayList.length; i++) {
        if (todayList[i].ts !== null && todayList[i].ts > nowMs) {
          nextToday = todayList[i];
          break;
        }
      }

      let next = nextToday;
      let isTomorrow = false;

      // If no more prayers today, look at tomorrow's Fajr
      if (!next) {
        this.ensureTomorrowTimes(now);
        if (this.tomorrowTimes && this.tomorrowTimes.fajr) {
          next = { key: 'fajr', ts: this.tomorrowTimes.fajr.getTime() };
          isTomorrow = true;
        }
      }

      // Calculate timings
      const msUntilNext = next ? (next.ts - nowMs) : Infinity;
      const alertPriorMs = Math.max((Config.alertMinutesPrior || 5), 1) * 60 * 1000;
      const nearingPrayer = (msUntilNext > 0 && msUntilNext <= alertPriorMs);

      // Determine if we are currently inside the "Active" window of a prayer that just passed
      const alertAfterMs = Math.max((Config.alertMinutesAfter || 5), 1) * 60 * 1000;
      let activePrayer = false;
      let prevPrayer = null;
      let activePrayerKey = null;

      if (nextToday) {
        const idx = todayList.indexOf(nextToday);
        if (idx > 0) prevPrayer = todayList[idx - 1];
      } else if (todayList.length > 0) {
        prevPrayer = todayList[todayList.length - 1];
      }

      if (prevPrayer && prevPrayer.ts !== null) {
        const diff = nowMs - prevPrayer.ts;
        if (diff >= 0 && diff <= alertAfterMs) {
          activePrayer = true;
          activePrayerKey = prevPrayer.key;
        }
      }

      return {
        next,
        msUntilNext,
        nearingPrayer,
        activePrayer,
        activePrayerKey,
        isTomorrow,
        prevPrayer,
        todayList
      };
    },

    /**
     * Updates the DOM rows based on the calculated state.
     */
    updateRows(state, nowMs) {
      state.todayList.forEach(t => {
        const row = this.rowCache[t.key] || (this.rowCache[t.key] = Utils.el('prayer-' + t.key));
        if (!row) return;

        let isActive = false;
        let isPast = false;
        let isTom = false;

        if (state.isTomorrow) {
          if (t.key === 'fajr') {
            if (state.activePrayer) {
              // If Isha just happened and is still active, tomorrow's Fajr isn't active yet
              isPast = true;
            } else {
              isActive = true;
              isTom = true;
            }
          } else {
            // For other prayers when targeting tomorrow
            if (state.activePrayer && state.prevPrayer && t.key === state.prevPrayer.key) {
              isActive = true;
            } else {
              isPast = true;
            }
          }
        } else {
          // Standard same-day logic
          if (state.next && t.key === state.next.key) {
            if (!state.activePrayer) isActive = true;
          } else if (t.ts !== null && t.ts <= nowMs) {
            // If this is the active prayer (just arrived), flash it
            if (state.activePrayer && state.prevPrayer && t.key === state.prevPrayer.key) {
              isActive = true;
            } else {
              isPast = true;
            }
          }
        }

        // Efficient DOM updates: only toggle if state is different
        if (row.classList.contains('active') !== isActive) row.classList.toggle('active', isActive);
        if (row.classList.contains('past') !== isPast) row.classList.toggle('past', isPast);
        if (row.classList.contains('tomorrow') !== isTom) row.classList.toggle('tomorrow', isTom);
      });
    }
  };

  // ===========================================================================
  // MODULE: AUDIO
  // ===========================================================================

  const AudioManager = {
    files: { fajr: [], others: [] },
    lastPlayedSrc: { fajr: null, others: null },
    lastPlayedKey: null,

    init() {
      if (!Config.audio || !Config.audio.enabled) return;
      this.fetchList('fajr');
      this.fetchList('others');
    },

    fetchList(type) {
      const path = Config.audio[type];
      if (!path) return;

      // If path ends with '/', treat it as a directory to list via server API
      if (path.slice(-1) === '/') {
        Utils.xhrGet('/list-files?dir=' + encodeURIComponent(path), (files) => {
          if (files && files.length > 0) {
            this.files[type] = files;
            console.log(`[audio] Loaded ${files.length} files for ${type}`);
          } else {
            console.warn(`[audio] No files found in directory: ${path}`);
          }
        });
      } else {
        // Single file mode
        this.files[type] = [path];
      }
    },

    play(key) {
      if (!Config.audio || key === 'sunrise') return;
      if (!Config.audio.enabled || !Config.audio.enabled[key]) return;

      const type = (key === 'fajr') ? 'fajr' : 'others';
      const player = (key === 'fajr') ? Utils.el('player-fajr') : Utils.el('player-others');
      const fileList = this.files[type];

      if (!player || !fileList || fileList.length === 0) return;

      // Pick a random file, trying to avoid immediate repeats
      let randomSrc;
      if (fileList.length === 1) {
        randomSrc = fileList[0];
      } else {
        do {
          randomSrc = fileList[Math.floor(Math.random() * fileList.length)];
        } while (randomSrc === this.lastPlayedSrc[type] && fileList.length > 1);
      }
      this.lastPlayedSrc[type] = randomSrc;

      player.src = randomSrc;
      player.currentTime = 0;
      player.dataset.currentKey = key;
      player.play().catch(e => console.warn('Audio play failed for ' + randomSrc, e));
    }
  };

  // ===========================================================================
  // MODULE: CLOCK & DATE
  // ===========================================================================

  const TimeManager = {
    hijriCachedDay: -1,

    updateClock(now) {
      let h = now.getHours();
      const m = now.getMinutes();
      const s = now.getSeconds();
      let ampm = '';
      
      if (Config.timeFormat === '12h') {
        ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
      }
      
      Utils.el('clock-time').textContent = Utils.pad(h) + ':' + Utils.pad(m) + ':' + Utils.pad(s);
      Utils.el('clock-ampm').textContent = ampm;

      const dateStr = GREG_DAYS[now.getDay()] + ', ' +
                      GREG_MONTHS[now.getMonth()] + ' ' +
                      now.getDate() + ', ' + now.getFullYear();
      
      const dateEl = Utils.el('gregorian-date');
      if (dateEl.textContent !== dateStr) dateEl.textContent = dateStr;
    },

    setHijriFromLocal(now) {
      const h = HijriCalendar.format(now);
      // \u200F = Right-to-Left Mark: anchors bidi so day stays first (rightmost)
      Utils.el('hijri-date').textContent = '\u200F' + h.formatted;
    },

    fetchHijriFromAPI(now) {
      const d = now.getDate();
      const m = now.getMonth() + 1;
      const y = now.getFullYear();
      const url = `https://api.aladhan.com/v1/gToH?date=${d}-${m}-${y}`;

      Utils.xhrGet(url, (data) => {
        try {
          const hijri = data.data.hijri;
          Utils.el('hijri-date').textContent =
            '\u200F' + hijri.day + ' ' + hijri.month.ar + ' ' + hijri.year + ' هـ';
          this.hijriCachedDay = now.getDate();
        } catch(e) {
          this.setHijriFromLocal(now);
        }
      });
    },

    updateHijri(now) {
      if (this.hijriCachedDay === now.getDate()) return;
      // Set local first as fallback/instant feedback
      this.setHijriFromLocal(now);
      // Try to fetch accurate date from API
      this.fetchHijriFromAPI(now);
      this.hijriCachedDay = now.getDate();
    }
  };

  // ===========================================================================
  // MODULE: WEATHER
  // ===========================================================================

  const WeatherManager = {
    lastFetch: 0,
    refreshMs: Math.max((Config.weatherRefreshMinutes || 15), 10) * 60 * 1000,
    isHidden: !Config.weatherApiKey,
    hourlyData: [],

    init() {
      if (this.isHidden) {
        const w = Utils.el('weather-icon-wrap');
        const t = Utils.el('weather-temp-wrap');
        if (w) w.style.display = 'none';
        if (t) t.style.display = 'none';
      }
    },

    getIcon(code) {
      if (WEATHER_ICONS[code]) return WEATHER_ICONS[code];
      const group = Math.floor(code / 100);
      return WEATHER_ICONS[group] || { char: '&#9728;', cls: 'wi-clear', label: '' };
    },

    fetchCurrent() {
      if (this.isHidden) return;
      const now = Date.now();
      if (now - this.lastFetch < this.refreshMs && this.lastFetch > 0) return;
      this.lastFetch = now;

      const base = 'https://api.openweathermap.org/data/2.5/';
      const qs = `?lat=${Config.latitude}&lon=${Config.longitude}&units=metric&appid=${Config.weatherApiKey}`;

      Utils.xhrGet(base + 'weather' + qs, (data) => {
        const code = data.weather[0].id;
        let descTxt = data.weather[0].description;
        descTxt = descTxt.charAt(0).toUpperCase() + descTxt.slice(1);
        
        const tempC = Math.round(data.main.temp);
        const feelsC = Math.round(data.main.feels_like);
        const humidity = Math.round(data.main.humidity);
        const icon = this.getIcon(code);

        const iconEl = Utils.el('weather-icon');
        const descEl = Utils.el('weather-desc');
        if (iconEl) { iconEl.innerHTML = icon.char; iconEl.className = 'weather-icon ' + icon.cls; }
        if (descEl) descEl.textContent = descTxt;

        const tempEl = Utils.el('weather-temp');
        const feelsEl = Utils.el('weather-feels');
        const humEl = Utils.el('weather-humidity');
        if (tempEl) tempEl.textContent = tempC + '°';
        if (feelsEl) feelsEl.textContent = 'Feels ' + feelsC + '°';
        if (humEl) humEl.textContent = humidity + '%';
      });

      this.fetchHourly(base + 'forecast' + qs);
    },

    fetchHourly(url) {
      Utils.xhrGet(url, (data) => {
        if (data && data.list) {
          // Keep the next 10 slots (3-hour intervals)
          this.hourlyData = data.list.slice(0, 10);
        }
        this.renderGrid();
      });
    },

    renderGrid() {
      const grid = Utils.el('forecast-grid');
      if (!grid || !this.hourlyData.length) return;
      grid.innerHTML = '';

      this.hourlyData.forEach(entry => {
        const dt = new Date(entry.dt * 1000);
        const h = dt.getHours();
        let hLabel, ampm;

        if (Config.timeFormat === '12h') {
          hLabel = String(h % 12 || 12);
          ampm = (h >= 12 ? '<span class="fc-ampm">PM</span>' : '<span class="fc-ampm">AM</span>');
        } else {
          hLabel = Utils.pad(h);
          ampm = '';
        }

        const icon = this.getIcon(entry.weather[0].id);
        let desc = entry.weather[0].description;
        desc = desc.charAt(0).toUpperCase() + desc.slice(1);
        const tempC = Math.round(entry.main.temp);
        const pop = entry.pop !== undefined ? Math.round(entry.pop * 100) : null;

        const card = document.createElement('div');
        card.className = 'forecast-card';
        card.innerHTML =
          `<div class="fc-time">${hLabel}${ampm}</div>` +
          `<div class="fc-temp">${tempC}°</div>` +
          `<div class="fc-icon ${icon.cls}">${icon.char}</div>` +
          `<div class="fc-desc">${desc}</div>` +
          (pop !== null ? `<div class="fc-pop">${pop > 0 ? '&#9748; ' + pop + '%' : ''}</div>` : '');
        grid.appendChild(card);
      });
    }
  };

  // ===========================================================================
  // MODULE: ALERTS (NWS)
  // ===========================================================================

  const AlertManager = {
    activeAlerts: [],
    lastFetch: 0,
    currentIndex: 0,
    refreshMs: Math.max((Config.weatherAlerts?.refreshMinutes || 15), 5) * 60 * 1000,

    fetch() {
      if (!Config.weatherAlerts || !Config.weatherAlerts.enabled) return;
      const now = Date.now();
      if (now - this.lastFetch < this.refreshMs && this.lastFetch > 0) return;
      this.lastFetch = now;

      const url = `https://api.weather.gov/alerts/active?point=${Config.latitude},${Config.longitude}`;
      const headers = { 'User-Agent': 'AzanDashboard/1.0 (github.com/azan-dashboard)' };

      Utils.xhrGet(url, (data) => {
        this.activeAlerts = (data.features || []).slice(0, 10);
        this.currentIndex = 0;
        this.render();
      }, headers);
    },

    render() {
      if (!this.activeAlerts.length) return;
      if (this.currentIndex >= this.activeAlerts.length) this.currentIndex = 0;

      const props = this.activeAlerts[this.currentIndex].properties;
      const elInstr = Utils.el('alert-instruction');
      const elTimes = Utils.el('alert-time-range');
      const elTitle = document.querySelector('#page-alerts .alert-title');

      if (elTitle) {
        const title = props.event || 'WEATHER ALERT';
        elTitle.textContent = this.activeAlerts.length > 1 
          ? `${title} (${this.currentIndex + 1}/${this.activeAlerts.length})`
          : title;
      }

      if (elTimes) {
        const fmt = (d) => {
          let h = d.getHours();
          const m = d.getMinutes();
          let ampm = '';
          if (Config.timeFormat === '12h') {
            ampm = h >= 12 ? ' PM' : ' AM';
            h = h % 12 || 12;
            return Utils.pad(h) + ':' + Utils.pad(m) + ampm;
          }
          return Utils.pad(h) + ':' + Utils.pad(m);
        };
        const getDay = (d) => GREG_DAYS[d.getDay()];

        const start = props.onset ? new Date(props.onset) : null;
        const end = props.ends ? new Date(props.ends) : (props.expires ? new Date(props.expires) : null);
        let txt = '';

        if (start && end) {
          const sameDay = (start.getDate() === end.getDate() && start.getMonth() === end.getMonth());
          if (sameDay) {
            txt = `${getDay(start)} ${fmt(start)} - ${fmt(end)}`;
          } else {
            txt = `${getDay(start)} ${fmt(start)} - ${getDay(end)} ${fmt(end)}`;
          }
        } else if (start) {
          txt = `${getDay(start)} ${fmt(start)}`;
        } else if (end) {
          txt = `${getDay(end)} ${fmt(end)}`;
        }
        elTimes.textContent = txt;
      }

      if (elInstr) {
        const formatText = (t) => {
          const cleaned = (t || '').split(/\n{2,}/).map(s => 
            s.replace(/\n/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          ).join('\n\n');
          return cleaned.replace(/(^|\s)(?:\*\s+)?([A-Z\s\/\-]+?)\.\.\./g, '$1<b>$2:</b> ');
        };
        
        const desc = formatText(props.description);
        const instr = formatText(props.instruction);

        // Reset animation
        elInstr.classList.remove('is-scrolling');
        elInstr.style.removeProperty('--scroll-amount');
        elInstr.style.removeProperty('--scroll-duration');
        elInstr.innerHTML = '';

        if (desc) {
          const d = document.createElement('div');
          d.innerHTML = desc;
          elInstr.appendChild(d);
        }
        if (desc && instr) {
          const hr = document.createElement('hr');
          hr.style.cssText = 'border:0; border-top:1px solid rgba(255,204,204,0.4); margin:10px 0;';
          elInstr.appendChild(hr);
        }
        if (instr) {
          const i = document.createElement('div');
          i.innerHTML = instr;
          elInstr.appendChild(i);
        }

        // Calculate scrolling
        requestAnimationFrame(() => {
          const scrollArea = Utils.el('alert-scroll-area');
          if (scrollArea && elInstr.scrollHeight > scrollArea.clientHeight) {
            const amount = elInstr.scrollHeight - scrollArea.clientHeight;
            const speed = 25; // pixels/sec
            let totalTime = (amount / speed) / 0.8; // buffer
            if (totalTime < 5) totalTime = 5;

            elInstr.style.setProperty('--scroll-amount', -amount + 'px');
            elInstr.style.setProperty('--scroll-duration', totalTime + 's');
            elInstr.classList.add('is-scrolling');
          }
        });
      }
    }
  };

  // ===========================================================================
  // MODULE: UI & PAGE CYCLE
  // ===========================================================================

  const UIManager = {
    cycleMs: Math.max((Config.cyclePageSecs || 60), 5) * 1000,
    cycleStart: Date.now(),
    currentPageId: 'page-prayers',

    updateNextBanner(state, now) {
      const cdEl = Utils.el('next-countdown');
      const banner = Utils.el('next-banner') || document.querySelector('.next-banner');
      if (!cdEl || !banner) return;

      // Handle Flashing (Active Prayer)
      if (state.activePrayer) {
        cdEl.textContent = (state.activePrayerKey === 'sunrise') ? 'وقت الشروق' : 'وقت ٱلصلَوٰة';
        cdEl.classList.add('flashing');
        cdEl.style.fontFamily = 'var(--font-arabic)';
      } else {
        cdEl.classList.remove('flashing');
        cdEl.style.fontFamily = 'var(--font-mono)';
      }

      // Handle Countdown Text
      if (!state.activePrayer) {
        if (state.next) {
          cdEl.textContent = Utils.formatDuration(state.next.ts - now.getTime());
        } else {
          cdEl.textContent = '--:--';
        }
      }
    },

    showPage(pageId) {
      ['page-prayers', 'page-weather', 'page-alerts'].forEach(id => {
        const e = Utils.el(id);
        if (e) {
          if (id === pageId) e.classList.remove('hidden');
          else e.classList.add('hidden');
        }
      });

      // Hide header on alerts page to maximize screen space
      const header = Utils.el('header');
      if (header) {
        header.style.display = (pageId === 'page-alerts') ? 'none' : '';
      }
      this.currentPageId = pageId;
    },

    updateCycle(state) {
      // Determine available pages
      const pages = ['page-prayers'];
      if (!WeatherManager.isHidden && WeatherManager.hourlyData.length > 0) {
        pages.push('page-weather');
      }
      if (AlertManager.activeAlerts.length > 0) {
        pages.push('page-alerts');
      }

      // Priority: Lock to prayers page if nearing or active
      if (state.nearingPrayer || state.activePrayer) {
        if (this.currentPageId !== 'page-prayers') {
          this.showPage('page-prayers');
          this.cycleStart = Date.now();
        }
        return;
      }

      const elapsed = Date.now() - this.cycleStart;
      if (elapsed >= this.cycleMs) {
        this.cycleStart = Date.now();

        // Inner cycle for multiple alerts
        if (this.currentPageId === 'page-alerts' && AlertManager.activeAlerts.length > 1) {
          AlertManager.currentIndex++;
          if (AlertManager.currentIndex < AlertManager.activeAlerts.length) {
            AlertManager.render();
            return; // Stay on alerts page
          }
          AlertManager.currentIndex = 0; // Reset for next time
        }

        // Switch to next page
        let currentIdx = pages.indexOf(this.currentPageId);
        let nextIdx = (currentIdx + 1) % pages.length;
        if (currentIdx === -1) nextIdx = 0;

        if (pages[nextIdx] === 'page-alerts') {
          AlertManager.currentIndex = 0;
          AlertManager.render();
        }

        this.showPage(pages[nextIdx]);
      }
    }
  };

  // ===========================================================================
  // MAIN LOOP
  // ===========================================================================

  function tick() {
    const now = new Date();

    // 1. Update Time & Date
    TimeManager.updateClock(now);
    TimeManager.updateHijri(now);

    // 2. Recalculate Prayers if day changed
    if (now.getDate() !== PrayerManager.lastCalcDay) {
      PrayerManager.calculate(now);
      PrayerManager.displayTimes(PrayerManager.currentTimes);
      PrayerManager.showingTomorrow = false;
    }

    // 3. Fetch Weather & Alerts (throttled internally)
    WeatherManager.fetchCurrent();
    AlertManager.fetch();

    // 4. Determine Prayer State
    const state = PrayerManager.getState(now);

    // 5. Update UI Rows
    PrayerManager.updateRows(state, now.getTime());

    // 6. Handle Audio Triggers
    if (state.activePrayerKey && state.activePrayerKey !== AudioManager.lastPlayedKey) {
      AudioManager.play(state.activePrayerKey);
      AudioManager.lastPlayedKey = state.activePrayerKey;
    } else if (!state.activePrayerKey) {
      AudioManager.lastPlayedKey = null;
    }

    // 7. Handle Tomorrow Switch
    // If targeting tomorrow's Fajr and the active window for Isha has passed,
    // switch the display to show tomorrow's prayer times.
    if (state.isTomorrow && !state.activePrayer && !PrayerManager.showingTomorrow && PrayerManager.tomorrowTimes) {
      PrayerManager.displayTimes(PrayerManager.tomorrowTimes);
      PrayerManager.showingTomorrow = true;
    }

    // 8. Update Banner & Page Cycle
    UIManager.updateNextBanner(state, now);
    UIManager.updateCycle(state);
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  function init() {
    AudioManager.init();
    WeatherManager.init();
    UIManager.showPage('page-prayers');
    
    const now = new Date();
    PrayerManager.calculate(now);
    PrayerManager.displayTimes(PrayerManager.currentTimes);
    TimeManager.updateHijri(now);

    // Debug: Click row to test audio
    PRAYER_KEYS.forEach(key => {
      const row = Utils.el('prayer-' + key);
      if (row) {
        row.addEventListener('click', () => {
          const player = (key === 'fajr') ? Utils.el('player-fajr') : Utils.el('player-others');
          if (player && !player.paused && player.dataset.currentKey === key) {
            console.log('[debug] Manual stop for ' + key);
            player.pause();
            player.currentTime = 0;
          } else {
            console.log('[debug] Manual play trigger for ' + key);
            AudioManager.play(key);
          }
        });
      }
    });

    tick();
    setInterval(tick, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
