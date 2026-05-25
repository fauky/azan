/**
 * config.js — Azan Dashboard Configuration
 *
 * This file contains the global configuration for the application.
 * Adjust these settings to customize location, prayer calculation methods,
 * audio behavior, and weather integration.
 *
 * Note: Restart the azan-kiosk.service after making changes
 */
window.AZAN_CONFIG = {

  /* ==========================================================================
     GEOGRAPHIC LOCATION
     ========================================================================== */

  /**
   * Coordinates used for prayer time calculation and weather data.
   * Latitude/Longitude: Decimal degrees.
   * Elevation: Height above sea level in meters (optional).
   */
  latitude: 36.9981184,
  longitude: -87.1440034,
  elevation: 6.46,

  /* ==========================================================================
     PRAYER TIME CALCULATION
     ========================================================================== */

  /**
   * Calculation Method.
   * Determines the angles used for Fajr and Isha.
   * Options:
   *   'NorthAmerica' (ISNA), 'MuslimWorldLeague', 'Egyptian', 'UmmAlQura',
   *   'Kuwait', 'Qatar', 'Singapore', 'Turkey', 'Tehran'
   */
  calculationMethod: 'NorthAmerica',

  /**
   * Juristic Method for Asr.
   * Options:
   *   'Shafi'  - Standard (Shadow = Object Length)
   *   'Hanafi' - Hanafi (Shadow = 2x Object Length)
   */
  madhab: 'Shafi',

  /**
   * Manual Time Offsets (in minutes).
   * Use these to fine-tune calculated times to match local mosque schedules.
   * Positive values add minutes; negative values subtract.
   */
  offsets: {
    fajr: 0,
    sunrise: 0,
    dhuhr: 0,
    asr: 0,
    maghrib: 0,
    isha: 0,
  },


  /* ==========================================================================
     DISPLAY & INTERFACE
     ========================================================================== */

  /**
   * Time Display Format.
   * Options: '12h' or '24h'
   */
  timeFormat: '12h',

  /**
   * Page Cycle Duration.
   * Time in seconds to display each page (Prayers ↔ Weather) before rotating.
   */
  cyclePageSecs: 30,

  /**
   * Visual Alert Settings.
   * alertMinutesPrior: Minutes before prayer to start the "heartbeat" glow.
   * alertMinutesAfter: Minutes after prayer to keep the row highlighted.
   */
  alertMinutesPrior: 10,
  alertMinutesAfter: 10,


  /* ==========================================================================
     AUDIO NOTIFICATIONS
     ========================================================================== */

  audio: {
    /**
     * Audio File Paths.
     * - Directory (ends with '/'): Plays a random file from the directory.
     * - File path: Plays the specific file.
     */
    fajr: 'audio/fajr/',
    others: 'audio/others/',

    /**
     * Playback Control.
     * Enable or disable audio for specific prayer times.
     */
    enabled: {
      fajr: true,
      dhuhr: true,
      asr: true,
      maghrib: true,
      isha: true,
    },
  },


  /* ==========================================================================
     WEATHER SERVICES
     ========================================================================== */

  /**
   * OpenWeatherMap Configuration.
   * Requires a valid API key. Set to empty string '' to disable.
   */
  weatherApiKey: 'your_openweathermap_api_key_here',
  weatherRefreshMinutes: 15,

  /**
   * Weather Alerts (NWS).
   * Fetches active alerts from weather.gov (US locations only).
   */
  weatherAlerts: {
    enabled: true,
    refreshMinutes: 15,
  },

};
