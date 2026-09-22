function normalizePositionModel() {
  state.charts.forEach(chart => {
    // Also repairs a stale/hand-typed value Intl no longer accepts (from
    // before the timezone field was a validated dropdown) — not just missing.
    if (!chart.timezone || !isValidTimeZone(chart.timezone)) chart.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    chart.noteText = chart.noteText || '';
    chart.positions = chart.positions || makePositions(chart);
    // Backfill for charts saved before Earth/South Node were part of makePositions() —
    // reuses the exact same derivation as makePositions so there's one formula, not two.
    const northNode = chart.positions.find(position => position.name === 'North Node');
    if (northNode && !chart.positions.some(position => position.name === 'South Node')) {
      chart.positions.push(oppositePosition(northNode, 'South Node', '☋'));
    }
    const sun = chart.positions.find(position => position.name === 'Sun');
    if (sun && !chart.positions.some(position => position.name === 'Earth')) {
      chart.positions.push(oppositePosition(sun, 'Earth', '⊕'));
    }
    // Backfill for charts saved before makePositions() stamped birthMoment onto
    // each position (see ephemeris.js) — without it, positionAngleAtTime can
    // never find a real-ephemeris anchor and silently falls back to the
    // synthetic engine for every persisted chart, even with EPHEMERIS_ENGINE
    // set to 'astronomy-engine'. Same derivation makePositions uses.
    const birthMoment = chartBirthMomentUTC(chart).toISOString();
    // Same idea for latitude/longitude, needed by the real Ascendant/Midheaven
    // computation (realAscendantMidheaven in ephemeris.js) — without these,
    // it can't run and Ascendant/Midheaven silently stay on the synthetic path.
    chart.positions.forEach(position => {
      position.birthMoment = position.birthMoment || birthMoment;
      if (position.latitude == null) position.latitude = chart.latitude;
      if (position.longitude == null) position.longitude = chart.longitude;
    });
    // designTimeFor's iterative solve only needs to run once, at chart
    // creation — it's stored from then on and never recomputed just because
    // the app reloaded (only saveEditedChart regenerates it, and only when
    // birth data that actually changes the answer was edited). `||` backfills
    // it for genuinely old charts with no designTime at all; it does NOT
    // upgrade a chart that already has one, even the rough placeholder
    // designTimeFor's own guard can produce if this ever runs before
    // positionAngleAtTime exists (app.js's own synchronous bootstrap, for the
    // very first sample charts a brand-new install generates) — that's an
    // accepted trade-off for "compute once," not a bug to work around here.
    chart.designTime = chart.designTime || designTimeFor(chart);
  });
}

// ── Timezone field format ─────────────────────────────────────────────────
// chart.timezone expects an IANA Time Zone Database identifier (the
// "Continent/City" names below), NOT a raw UTC offset like "+01:00" or an
// abbreviation like "CET" — those are ambiguous (multiple zones share an
// offset, and abbreviations collide across regions) and don't account for
// daylight saving transitions the way a named zone does.
// "UTC" itself is also always accepted, even though it isn't in this list.
//
// NOTE: this field is currently informational only. Every date computation
// in this app (positionAngleAtTime, designTimeFor, exactChartTime, etc.)
// builds a Date from chart.birthDate + chart.birthTime with no offset
// applied, so it's interpreted in whichever timezone the browser itself is
// running in — chart.timezone is stored but not yet read back anywhere.
//
// The full canonical list (what Intl.supportedValuesOf('timeZone') returns
// in a modern browser/Node — the same source the placeholder "Europe/Lisbon"
// was drawn from), so you don't have to go look it up:
// Africa/Abidjan, Africa/Accra, Africa/Addis_Ababa, Africa/Algiers,
// Africa/Asmera, Africa/Bamako, Africa/Bangui, Africa/Banjul,
// Africa/Bissau, Africa/Blantyre, Africa/Brazzaville, Africa/Bujumbura,
// Africa/Cairo, Africa/Casablanca, Africa/Ceuta, Africa/Conakry,
// Africa/Dakar, Africa/Dar_es_Salaam, Africa/Djibouti, Africa/Douala,
// Africa/El_Aaiun, Africa/Freetown, Africa/Gaborone, Africa/Harare,
// Africa/Johannesburg, Africa/Juba, Africa/Kampala, Africa/Khartoum,
// Africa/Kigali, Africa/Kinshasa, Africa/Lagos, Africa/Libreville,
// Africa/Lome, Africa/Luanda, Africa/Lubumbashi, Africa/Lusaka,
// Africa/Malabo, Africa/Maputo, Africa/Maseru, Africa/Mbabane,
// Africa/Mogadishu, Africa/Monrovia, Africa/Nairobi, Africa/Ndjamena,
// Africa/Niamey, Africa/Nouakchott, Africa/Ouagadougou, Africa/Porto-Novo,
// Africa/Sao_Tome, Africa/Tripoli, Africa/Tunis, Africa/Windhoek,
// America/Adak, America/Anchorage, America/Anguilla, America/Antigua,
// America/Araguaina, America/Argentina/La_Rioja, America/Argentina/Rio_Gallegos, America/Argentina/Salta,
// America/Argentina/San_Juan, America/Argentina/San_Luis, America/Argentina/Tucuman, America/Argentina/Ushuaia,
// America/Aruba, America/Asuncion, America/Bahia, America/Bahia_Banderas,
// America/Barbados, America/Belem, America/Belize, America/Blanc-Sablon,
// America/Boa_Vista, America/Bogota, America/Boise, America/Buenos_Aires,
// America/Cambridge_Bay, America/Campo_Grande, America/Cancun, America/Caracas,
// America/Catamarca, America/Cayenne, America/Cayman, America/Chicago,
// America/Chihuahua, America/Ciudad_Juarez, America/Coral_Harbour, America/Cordoba,
// America/Costa_Rica, America/Coyhaique, America/Creston, America/Cuiaba,
// America/Curacao, America/Danmarkshavn, America/Dawson, America/Dawson_Creek,
// America/Denver, America/Detroit, America/Dominica, America/Edmonton,
// America/Eirunepe, America/El_Salvador, America/Fort_Nelson, America/Fortaleza,
// America/Glace_Bay, America/Godthab, America/Goose_Bay, America/Grand_Turk,
// America/Grenada, America/Guadeloupe, America/Guatemala, America/Guayaquil,
// America/Guyana, America/Halifax, America/Havana, America/Hermosillo,
// America/Indiana/Knox, America/Indiana/Marengo, America/Indiana/Petersburg, America/Indiana/Tell_City,
// America/Indiana/Vevay, America/Indiana/Vincennes, America/Indiana/Winamac, America/Indianapolis,
// America/Inuvik, America/Iqaluit, America/Jamaica, America/Jujuy,
// America/Juneau, America/Kentucky/Monticello, America/Kralendijk, America/La_Paz,
// America/Lima, America/Los_Angeles, America/Louisville, America/Lower_Princes,
// America/Maceio, America/Managua, America/Manaus, America/Marigot,
// America/Martinique, America/Matamoros, America/Mazatlan, America/Mendoza,
// America/Menominee, America/Merida, America/Metlakatla, America/Mexico_City,
// America/Miquelon, America/Moncton, America/Monterrey, America/Montevideo,
// America/Montserrat, America/Nassau, America/New_York, America/Nome,
// America/Noronha, America/North_Dakota/Beulah, America/North_Dakota/Center, America/North_Dakota/New_Salem,
// America/Ojinaga, America/Panama, America/Paramaribo, America/Phoenix,
// America/Port-au-Prince, America/Port_of_Spain, America/Porto_Velho, America/Puerto_Rico,
// America/Punta_Arenas, America/Rankin_Inlet, America/Recife, America/Regina,
// America/Resolute, America/Rio_Branco, America/Santarem, America/Santiago,
// America/Santo_Domingo, America/Sao_Paulo, America/Scoresbysund, America/Sitka,
// America/St_Barthelemy, America/St_Johns, America/St_Kitts, America/St_Lucia,
// America/St_Thomas, America/St_Vincent, America/Swift_Current, America/Tegucigalpa,
// America/Thule, America/Tijuana, America/Toronto, America/Tortola,
// America/Vancouver, America/Whitehorse, America/Winnipeg, America/Yakutat,
// Antarctica/Casey, Antarctica/Davis, Antarctica/DumontDUrville, Antarctica/Macquarie,
// Antarctica/Mawson, Antarctica/McMurdo, Antarctica/Palmer, Antarctica/Rothera,
// Antarctica/Syowa, Antarctica/Troll, Antarctica/Vostok, Arctic/Longyearbyen,
// Asia/Aden, Asia/Almaty, Asia/Amman, Asia/Anadyr,
// Asia/Aqtau, Asia/Aqtobe, Asia/Ashgabat, Asia/Atyrau,
// Asia/Baghdad, Asia/Bahrain, Asia/Baku, Asia/Bangkok,
// Asia/Barnaul, Asia/Beirut, Asia/Bishkek, Asia/Brunei,
// Asia/Calcutta, Asia/Chita, Asia/Colombo, Asia/Damascus,
// Asia/Dhaka, Asia/Dili, Asia/Dubai, Asia/Dushanbe,
// Asia/Famagusta, Asia/Gaza, Asia/Hebron, Asia/Hong_Kong,
// Asia/Hovd, Asia/Irkutsk, Asia/Jakarta, Asia/Jayapura,
// Asia/Jerusalem, Asia/Kabul, Asia/Kamchatka, Asia/Karachi,
// Asia/Katmandu, Asia/Khandyga, Asia/Krasnoyarsk, Asia/Kuala_Lumpur,
// Asia/Kuching, Asia/Kuwait, Asia/Macau, Asia/Magadan,
// Asia/Makassar, Asia/Manila, Asia/Muscat, Asia/Nicosia,
// Asia/Novokuznetsk, Asia/Novosibirsk, Asia/Omsk, Asia/Oral,
// Asia/Phnom_Penh, Asia/Pontianak, Asia/Pyongyang, Asia/Qatar,
// Asia/Qostanay, Asia/Qyzylorda, Asia/Rangoon, Asia/Riyadh,
// Asia/Saigon, Asia/Sakhalin, Asia/Samarkand, Asia/Seoul,
// Asia/Shanghai, Asia/Singapore, Asia/Srednekolymsk, Asia/Taipei,
// Asia/Tashkent, Asia/Tbilisi, Asia/Tehran, Asia/Thimphu,
// Asia/Tokyo, Asia/Tomsk, Asia/Ulaanbaatar, Asia/Urumqi,
// Asia/Ust-Nera, Asia/Vientiane, Asia/Vladivostok, Asia/Yakutsk,
// Asia/Yekaterinburg, Asia/Yerevan, Atlantic/Azores, Atlantic/Bermuda,
// Atlantic/Canary, Atlantic/Cape_Verde, Atlantic/Faeroe, Atlantic/Madeira,
// Atlantic/Reykjavik, Atlantic/South_Georgia, Atlantic/St_Helena, Atlantic/Stanley,
// Australia/Adelaide, Australia/Brisbane, Australia/Broken_Hill, Australia/Darwin,
// Australia/Eucla, Australia/Hobart, Australia/Lindeman, Australia/Lord_Howe,
// Australia/Melbourne, Australia/Perth, Australia/Sydney, Europe/Amsterdam,
// Europe/Andorra, Europe/Astrakhan, Europe/Athens, Europe/Belgrade,
// Europe/Berlin, Europe/Bratislava, Europe/Brussels, Europe/Bucharest,
// Europe/Budapest, Europe/Busingen, Europe/Chisinau, Europe/Copenhagen,
// Europe/Dublin, Europe/Gibraltar, Europe/Guernsey, Europe/Helsinki,
// Europe/Isle_of_Man, Europe/Istanbul, Europe/Jersey, Europe/Kaliningrad,
// Europe/Kiev, Europe/Kirov, Europe/Lisbon, Europe/Ljubljana,
// Europe/London, Europe/Luxembourg, Europe/Madrid, Europe/Malta,
// Europe/Mariehamn, Europe/Minsk, Europe/Monaco, Europe/Moscow,
// Europe/Oslo, Europe/Paris, Europe/Podgorica, Europe/Prague,
// Europe/Riga, Europe/Rome, Europe/Samara, Europe/San_Marino,
// Europe/Sarajevo, Europe/Saratov, Europe/Simferopol, Europe/Skopje,
// Europe/Sofia, Europe/Stockholm, Europe/Tallinn, Europe/Tirane,
// Europe/Ulyanovsk, Europe/Vaduz, Europe/Vatican, Europe/Vienna,
// Europe/Vilnius, Europe/Volgograd, Europe/Warsaw, Europe/Zagreb,
// Europe/Zurich, Indian/Antananarivo, Indian/Chagos, Indian/Christmas,
// Indian/Cocos, Indian/Comoro, Indian/Kerguelen, Indian/Mahe,
// Indian/Maldives, Indian/Mauritius, Indian/Mayotte, Indian/Reunion,
// Pacific/Apia, Pacific/Auckland, Pacific/Bougainville, Pacific/Chatham,
// Pacific/Easter, Pacific/Efate, Pacific/Enderbury, Pacific/Fakaofo,
// Pacific/Fiji, Pacific/Funafuti, Pacific/Galapagos, Pacific/Gambier,
// Pacific/Guadalcanal, Pacific/Guam, Pacific/Honolulu, Pacific/Kiritimati,
// Pacific/Kosrae, Pacific/Kwajalein, Pacific/Majuro, Pacific/Marquesas,
// Pacific/Midway, Pacific/Nauru, Pacific/Niue, Pacific/Norfolk,
// Pacific/Noumea, Pacific/Pago_Pago, Pacific/Palau, Pacific/Pitcairn,
// Pacific/Ponape, Pacific/Port_Moresby, Pacific/Rarotonga, Pacific/Saipan,
// Pacific/Tahiti, Pacific/Tarawa, Pacific/Tongatapu, Pacific/Truk,
// Pacific/Wake, Pacific/Wallis
function ensureEditDialog() {
  if (document.getElementById('editDialog')) return document.getElementById('editDialog');
  const dialog = document.createElement('dialog');
  dialog.id = 'editDialog';
  dialog.innerHTML = `<form method="dialog" id="editForm"><div class="dialog-head"><div><p class="eyebrow accent-label">CHART RECORD</p><h2>Edit individual chart</h2></div><button class="close-button" value="cancel" aria-label="Close">×</button></div><p class="dialog-copy">Update the record without changing its chart identity or workspace membership.</p><div class="form-grid"><label>Chart name<input name="name" required></label><label>Birth location<input name="location" required></label><label>Birth date<input name="date" required type="date"></label><label>Birth time<input name="time" type="time"></label><label>Timezone<select name="timezone" required></select></label><label>Time uncertainty (minutes)<input name="uncertainty" type="number" min="0"></label><label>Latitude<input name="latitude" required type="number" step="0.0001"></label><label>Longitude<input name="longitude" required type="number" step="0.0001"></label><label class="wide-field">Tags<input name="tags" placeholder="personal, study"></label><label class="wide-field">Notes<textarea name="noteText" rows="4"></textarea></label></div><div class="dialog-actions"><button class="secondary-button" value="cancel">Cancel</button><button class="primary-button" value="default">Save changes <span>→</span></button></div></form>`;
  document.body.appendChild(dialog);
  dialog.querySelector('form').addEventListener('submit', saveEditedChart);
  return dialog;
}

function editSelectedChart() {
  const chart = chartById(selectedChartId);
  if (!chart) return;
  const dialog = ensureEditDialog();
  const form = dialog.querySelector('form');
  // Populate the options (with the chart's current zone pre-selected) before
  // the generic value-binding loop below, since setting .value on a <select>
  // with no matching <option> yet is a silent no-op.
  form.elements.timezone.innerHTML = timezoneOptionsMarkup(chart.timezone);
  Object.entries({name: chart.name, location: chart.location, date: chart.birthDate, time: chart.birthTime, timezone: chart.timezone, uncertainty: chart.uncertainty || 0, latitude: chart.latitude, longitude: chart.longitude, tags: chart.tags.join(', '), noteText: chart.noteText}).forEach(([name, value]) => { form.elements[name].value = value ?? ''; });
  dialog.showModal();
}

function saveEditedChart(event) {
  event.preventDefault();
  const chart = chartById(selectedChartId);
  const form = new FormData(event.target);
  // timezone is part of this key too: changing it alone still changes the
  // real UTC birth moment (chartBirthMomentUTC), so positions/designTime
  // need to be regenerated just as if the date/time itself had moved.
  const previousKey = `${chart.birthDate}|${chart.birthTime}|${chart.timezone}|${chart.location}|${chart.latitude}|${chart.longitude}`;
  chart.name = form.get('name'); chart.location = form.get('location'); chart.birthDate = form.get('date'); chart.birthTime = form.get('time'); chart.timezone = form.get('timezone');
  chart.uncertainty = Number(form.get('uncertainty')) || 0; chart.latitude = form.get('latitude'); chart.longitude = form.get('longitude');
  chart.tags = String(form.get('tags') || '').split(',').map(tag => tag.trim()).filter(Boolean); chart.noteText = form.get('noteText') || ''; chart.notes = chart.noteText ? 1 : 0;
  const nextKey = `${chart.birthDate}|${chart.birthTime}|${chart.timezone}|${chart.location}|${chart.latitude}|${chart.longitude}`;
  if (previousKey !== nextKey) { chart.positions = makePositions(chart); chart.designTime = designTimeFor(chart); }
  normalizePositionModel(); saveState(); event.target.closest('dialog').close(); renderRows(); renderExplorer(); showToast(`${chart.name} updated`);
}

normalizePositionModel();
saveState();
document.getElementById('editChartButton').addEventListener('click', editSelectedChart);