// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// Birth-location search for the Add and Edit chart forms. Typing in "Birth location"
// lists matching places from places.js (GeoNames: ~70,000 places of 5,000+ people,
// loaded the first time the field is used); choosing one fills in the location text,
// latitude, longitude and time zone. Everything stays editable by hand, and places not
// in the list can still be typed in with their own coordinates.
//
// Matching ignores case and accents, and also checks each place's English and local
// names (Cologne finds Köln). Anything after a comma narrows by state/province or
// country: "springfield, illinois", "paris, us", "london, canada".

const PLACE_RESULT_LIMIT = 8;
let placeIndex = null;          // parsed PLACES_DATA, built once
let placesRequested = false;
const placeWaiting = new Set(); // inputs to refresh once the data arrives

// Case, accents and full stops ignored; common abbreviations equal their full words
// (St/Saint, Ste/Sainte, Ft/Fort, Mt/Mount), both in names and in what's typed.
const PLACE_ABBREVIATIONS = { saint: "st", sainte: "ste", fort: "ft", mount: "mt" };
function placeFold(text) {
  return searchFold(text).replace(/\./g, " ")
    .replace(/\b(saint|sainte|fort|mount)\b/g, (word) => PLACE_ABBREVIATIONS[word]).replace(/\s+/g, " ").trim();
}
function loadPlaces() {
  if (placesRequested) return;
  placesRequested = true;
  const script = document.createElement("script");
  script.src = "places.js";
  script.onerror = () => { placesRequested = false; };
  document.head.appendChild(script);
}
// Called by places.js once it has run.
function placesLoaded() {
  const { zones, regions, countries, rows } = PLACES_DATA;
  const foldedRegions = regions.map(placeFold);
  const foldedCountries = Object.fromEntries(Object.entries(countries).map(([code, name]) => [code, placeFold(name)]));
  placeIndex = rows.split("\n").map((row) => {
    const [name, aliases, country, region, lat, lon, zone] = row.split("|");
    const names = [name, ...(aliases ? aliases.split(";") : [])];
    return {
      name, country, region: regions[Number(region)], zone: zones[Number(zone)], lat, lon,
      folded: names.map(placeFold),
      qualifiers: [foldedRegions[Number(region)], foldedCountries[country] || "", country.toLowerCase()],
    };
  });
  placeWaiting.forEach((input) => input.dispatchEvent(new Event("input")));
  window.dispatchEvent(new Event("orbital-places-loaded"));
  placeWaiting.clear();
}

// Common ways of writing a country that its GeoNames name doesn't cover.
const PLACE_COUNTRY_ALIASES = { usa: "us", "united states of america": "us", america: "us", uk: "gb", england: "gb", scotland: "gb", wales: "gb", "great britain": "gb", holland: "nl", "czech republic": "cz" };
// How well `names` match `term`: 0 exact, 1 starts with it, 2 a later word starts with
// it, 3 contains it (3+ letters only); Infinity when it doesn't match.
function placeNameRank(names, term, laterWord) {
  let best = Infinity;
  for (const name of names) {
    if (name === term) return 0;
    if (name.startsWith(term)) best = Math.min(best, 1);
    else if (best > 2 && laterWord.test(name)) best = 2;
    else if (best > 3 && term.length >= 3 && name.includes(term)) best = 3;
  }
  return best;
}
function searchPlaces(query) {
  if (!placeIndex) return [];
  const [placeTerm, ...rest] = query.split(",").map(placeFold);
  if (!placeTerm || placeTerm.length < 2) return [];
  const qualifiers = rest.filter(Boolean).map((term) => PLACE_COUNTRY_ALIASES[term] || term);
  const laterWord = new RegExp(`[\\s\\-'’(]${placeTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  const results = [];
  // Rows are most populous first, so within a rank the first found are the likeliest.
  for (const place of placeIndex) {
    const rank = placeNameRank(place.folded, placeTerm, laterWord);
    if (rank === Infinity) continue;
    if (!qualifiers.every((term) => place.qualifiers.some((value) => value === term || value.startsWith(term)))) continue;
    results.push({ place, rank });
    if (results.filter((result) => result.rank <= 1).length >= PLACE_RESULT_LIMIT) break;
  }
  return results.sort((a, b) => a.rank - b.rank).slice(0, PLACE_RESULT_LIMIT).map((result) => result.place);
}
function placeLabel(place) {
  const country = PLACES_DATA.countries[place.country] || place.country;
  return [place.name, place.region && place.region !== place.name ? place.region : "", country].filter(Boolean).join(", ");
}
function placeCoordinates(place) {
  const format = (value, positive, negative) => `${Math.abs(value).toFixed(2)}°${value >= 0 ? positive : negative}`;
  return `${format(Number(place.lat), "N", "S")} ${format(Number(place.lon), "E", "W")}`;
}

// ── The combobox ────────────────────────────────────────────────────────
// With `onChoose(place)`, choosing a place calls it and clears the field (the
// Astrocartography map search); without, it fills in the chart form around `input`.
let placeListCounter = 0;
function bindPlaceSearch(input, onChoose) {
  if (input.dataset.placeSearch) return;
  input.dataset.placeSearch = "true";
  const form = input.form;
  const list = document.createElement("div");
  list.className = "place-results";
  list.id = `placeResults${placeListCounter++}`;
  list.setAttribute("role", "listbox");
  list.hidden = true;
  input.insertAdjacentElement("afterend", list);
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", list.id);
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("autocomplete", "off");
  let results = [];
  let active = -1;

  const close = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  };
  const highlight = (index) => {
    active = index;
    list.querySelectorAll("[role=option]").forEach((option, i) => option.setAttribute("aria-selected", String(i === index)));
    if (index >= 0) {
      input.setAttribute("aria-activedescendant", `${list.id}-${index}`);
      list.children[index]?.scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  };
  const render = () => {
    const query = input.value;
    if (!placeIndex) {
      if (placeFold(query).length < 2) return close();
      loadPlaces();
      placeWaiting.add(input);
      list.innerHTML = `<div class="place-status">Loading places…</div>`;
    } else {
      results = searchPlaces(query);
      if (!results.length) {
        if (placeFold(query).length < 2) return close();
        list.innerHTML = `<div class="place-status">${onChoose ? "No match in the place list." : "No match in the place list — type the place and enter its coordinates and time zone below."}</div>`;
      } else {
        list.innerHTML = results.map((place, index) => `<div class="place-option" role="option" id="${list.id}-${index}" aria-selected="false" data-index="${index}"><b>${escapeHtml(placeLabel(place))}</b><small>${placeCoordinates(place)} · ${escapeHtml(place.zone)}</small></div>`).join("");
      }
    }
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    highlight(-1);
  };
  const choose = (place) => {
    if (onChoose) {
      input.value = "";
      close();
      onChoose(place);
      return;
    }
    input.value = placeLabel(place);
    form.elements.latitude.value = Number(place.lat).toFixed(4);
    form.elements.longitude.value = Number(place.lon).toFixed(4);
    const zones = form.elements.timezone;
    if (![...zones.options].some((option) => option.value === place.zone)) zones.add(new Option(place.zone, place.zone));
    zones.value = place.zone;
    [form.elements.latitude, form.elements.longitude, zones].forEach((field) => field.dispatchEvent(new Event("change", { bubbles: true })));
    close();
  };

  input.addEventListener("input", render);
  input.addEventListener("keydown", (event) => {
    if (list.hidden) {
      if (event.key === "ArrowDown" && input.value) { render(); event.preventDefault(); }
      return;
    }
    const count = list.querySelectorAll("[role=option]").length;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (count) highlight(event.key === "ArrowDown" ? (active + 1) % count : (active - 1 + count) % count);
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      choose(results[active]);
    } else if (event.key === "Escape") {
      // Closes the list only, not the whole dialog.
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });
  // mousedown (not click) so choosing happens before the input loses focus.
  list.addEventListener("mousedown", (event) => {
    const option = event.target.closest("[data-index]");
    event.preventDefault();
    if (option) choose(results[Number(option.dataset.index)]);
  });
  input.addEventListener("blur", close);
  form?.addEventListener("reset", close);
}
// The Edit dialog is built on first use, so bind whenever a location field gets focus.
document.addEventListener("focusin", (event) => {
  const input = event.target;
  if (input.matches?.('#chartForm input[name="location"], #editForm input[name="location"]')) {
    bindPlaceSearch(input);
    loadPlaces();
  }
});
