/**
 * hijri.js — Gregorian to Hijri Calendar Conversion
 *
 * This module implements the Tabular Islamic Calendar (arithmetic).
 * It provides a fallback for displaying Hijri dates when API connectivity
 * is unavailable.
 *
 * Algorithm:
 * Based on the Kuwaiti algorithm / Tabular method.
 * Note: This is an approximation (+/- 1 day) compared to visual moon sighting.
 */
(function (global) {
  'use strict';

  /* --------------------------------------------------------------------------
     CONSTANTS & LOCALIZATION
     -------------------------------------------------------------------------- */

  var MONTHS_AR = [
    'محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني',
    'جمادى الأولى', 'جمادى الثانية', 'رجب', 'شعبان',
    'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'
  ];

  var MONTHS_EN = [
    'Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani',
    'Jumada al-Ula', 'Jumada al-Akhirah', 'Rajab', "Sha'ban",
    'Ramadan', 'Shawwal', "Dhu al-Qi'dah", 'Dhu al-Hijjah'
  ];

  // Julian Day of the Islamic Epoch (July 16, 622 CE)
  var HIJRI_EPOCH_JD = 1948438.5;

  /* --------------------------------------------------------------------------
     CALCULATION FUNCTIONS
     -------------------------------------------------------------------------- */

  /**
   * Converts a Gregorian date to a Julian Day number.
   * @param {number} year  - Gregorian Year
   * @param {number} month - Gregorian Month (1-12)
   * @param {number} day   - Gregorian Day
   * @returns {number} Julian Day
   */
  function gregorianToJulianDay(year, month, day) {
    return (367 * year)
      - Math.floor(7 * (year + Math.floor((month + 9) / 12)) / 4)
      + Math.floor(275 * month / 9)
      + day + 1721013.5;
  }

  /**
   * Calculates the Julian Day for a given Hijri date.
   * Used internally to determine month/year boundaries.
   *
   * @param {number} year  - Hijri Year
   * @param {number} month - Hijri Month (1-12)
   * @param {number} day   - Hijri Day
   * @returns {number} Julian Day
   */
  function hijriToJulianDay(year, month, day) {
    return day
      + Math.ceil(29.5 * (month - 1))
      + (year - 1) * 354
      + Math.floor((3 + 11 * year) / 30)
      + HIJRI_EPOCH_JD - 1;
  }

  /**
   * Converts a Julian Day number to a Hijri date object.
   * @param {number} jd - Julian Day
   * @returns {object} { year, month, day }
   */
  function julianDayToHijri(jd) {
    jd = Math.floor(jd) + 0.5;

    // Calculate year
    var year = Math.floor((30 * (jd - HIJRI_EPOCH_JD) + 10646) / 10631);

    // Calculate month
    var jdYearStart = hijriToJulianDay(year, 1, 1);
    var month = Math.min(12, Math.ceil((jd - (29 + jdYearStart)) / 29.5) + 1);

    // Calculate day
    var jdMonthStart = hijriToJulianDay(year, month, 1);
    var day = Math.floor(jd - jdMonthStart + 1) - 1;

    // Safety clamp
    if (day < 1) day = 1;

    return { year: year, month: month, day: day };
  }

  /* --------------------------------------------------------------------------
     PUBLIC API
     -------------------------------------------------------------------------- */

  /**
   * Formats a Gregorian Date object into a Hijri string.
   * @param {Date} gDate - The Gregorian Date object
   * @returns {object} Formatted Hijri data
   */
  function format(gDate) {
    var jd = gregorianToJulianDay(
      gDate.getFullYear(),
      gDate.getMonth() + 1,
      gDate.getDate()
    );

    var h = julianDayToHijri(jd);

    var mAr = MONTHS_AR[h.month - 1] || '';
    var mEn = MONTHS_EN[h.month - 1] || '';

    return {
      year: h.year, month: h.month, day: h.day,
      monthAr: mAr, monthEn: mEn,
      formatted: h.day + ' ' + mAr + ' ' + h.year + ' هـ',
      formattedEn: h.day + ' ' + mEn + ' ' + h.year + ' AH'
    };
  }

  // Export to global scope
  global.HijriCalendar = {
    format: format,
    monthsAr: MONTHS_AR,
    monthsEn: MONTHS_EN
  };

}(window));
