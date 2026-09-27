#!/usr/bin/env python3
# Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
"""Builds tz-history.js, the pre-1970 time-zone corrections used by chartBirthMomentUTC.

    python3 tools/build-tz-history.py [work-dir]

Browsers convert birth times with their built-in copy of the IANA time zone database
(tzdb), which is exact from 1970 on. Before 1970 it isn't, for two reasons:

  1. tzdb merges zones that have agreed since 1970 — Europe/Oslo uses Europe/Berlin's
     history, Europe/Amsterdam Europe/Brussels', and so on. The real, separate
     histories are kept in tzdb's "backzone" file, which browsers leave out.
  2. Before a place adopted standard time it kept local mean time (LMT), which depends
     on the exact longitude. tzdb only has the LMT of each zone's main city.

This script downloads the latest tzdb (data.iana.org, public domain), compiles it twice
with its own Makefile — as browsers ship it, and with backzone — and writes:
  - `zones`: for every zone whose pre-1970 history differs, the backzone history as
    [until (Unix seconds, UTC), UTC offset (seconds)] periods, ending at 1970;
    offset null marks local mean time.
  - `lmtUntil`: for every zone, when local mean time ended there (Unix seconds, UTC).
Needs make, a C compiler and tar that reads .lz (macOS bsdtar does).
"""
import glob, json, os, struct, subprocess, sys, urllib.request

work = sys.argv[1] if len(sys.argv) > 1 else "/tmp/orbital-study-tz"
os.makedirs(work, exist_ok=True)
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EPOCH_1970 = 0

archive = os.path.join(work, "tzdb-latest.tar.lz")
if not os.path.exists(archive):
    urllib.request.urlretrieve("https://data.iana.org/time-zones/tzdb-latest.tar.lz", archive)
subprocess.run(["tar", "-xf", archive, "-C", work], check=True)
source = sorted(glob.glob(os.path.join(work, "tzdb-*/")))[-1]
version = open(os.path.join(source, "version")).read().strip()
for name, extra in (("main", []), ("back", ["PACKRATDATA=backzone", "PACKRATLIST=zone.tab"])):
    subprocess.run(["make", "-s", "clean"], cwd=source, check=True, stdout=subprocess.DEVNULL)
    subprocess.run(["make", "-s", f"TOPDIR={os.path.join(work, name)}", "ZFLAGS=-b fat", *extra, "install"],
                   cwd=source, check=True, stdout=subprocess.DEVNULL)

def read_tzif(path):
    """[(transition Unix seconds or None for 'since forever', utc offset, abbreviation)]."""
    data = open(path, "rb").read()
    if data[:4] != b"TZif":
        return None
    def header(at):
        return struct.unpack(">6l", data[at + 20:at + 44])
    isutc, isstd, leap, timecnt, typecnt, charcnt = header(0)
    skip = 44 + timecnt * 5 + typecnt * 6 + charcnt + leap * 8 + isstd + isutc
    if data[4] >= ord("2"):  # use the 64-bit block
        isutc, isstd, leap, timecnt, typecnt, charcnt = header(skip)
        at, size, fmt = skip + 44, 8, ">%dq"
    else:
        at, size, fmt = 44, 4, ">%dl"
    times = struct.unpack(fmt % timecnt, data[at:at + timecnt * size]); at += timecnt * size
    indices = data[at:at + timecnt]; at += timecnt
    types = [struct.unpack(">lBB", data[at + i * 6:at + i * 6 + 6]) for i in range(typecnt)]; at += typecnt * 6
    chars = data[at:at + charcnt]
    abbr = lambda i: chars[i:chars.index(b"\0", i)].decode()
    # The type in force before the first transition: the first non-DST type (RFC 8536).
    first = next((t for t in types if not t[1]), types[0])
    periods = [(None, first[0], abbr(first[2]))]
    for time, index in zip(times, indices):
        offset, _, a = types[index]
        periods.append((time, offset, abbr(a)))
    return periods

def before_1970(periods):
    """[[until, offset or None for LMT], ...] up to 1970-01-01 UTC, merged."""
    out = []
    for i, (start, offset, abbr) in enumerate(periods):
        if start is not None and start >= EPOCH_1970:
            break
        until = periods[i + 1][0] if i + 1 < len(periods) else None
        value = None if abbr == "LMT" else offset
        until = EPOCH_1970 if until is None or until >= EPOCH_1970 else until
        if out and out[-1][1] == value:
            out[-1][0] = until
        else:
            out.append([until, value])
    return out

def lmt_end(periods):
    return next((periods[i + 1][0] for i, (_, _, a) in enumerate(periods[:-1]) if a == "LMT" and periods[i + 1][2] != "LMT"), None)

base = lambda name: os.path.join(work, name, "usr", "share", "zoneinfo")
# Every zone and alias name (so older names a browser may report, like Asia/Calcutta, work too).
wanted = {os.path.relpath(os.path.join(d, f), base("back")) for d, _, files in os.walk(base("back")) for f in files}
wanted = {z for z in wanted if "/" in z or z == "UTC"} - {z for z in wanted if z.startswith(("posix", "right"))}
zones, lmt_until, changed_after_1970 = {}, {}, []
for zone in sorted(wanted):
    main_path, back_path = os.path.join(base("main"), zone), os.path.join(base("back"), zone)
    if not (os.path.isfile(main_path) and os.path.isfile(back_path)):
        continue
    main, back = read_tzif(main_path), read_tzif(back_path)
    if not main or not back:
        continue
    end = lmt_end(back)
    if end is not None:
        lmt_until[zone] = end
    if before_1970(main) != before_1970(back):
        zones[zone] = before_1970(back)
    if [p for p in main if p[0] is not None and p[0] >= EPOCH_1970] != [p for p in back if p[0] is not None and p[0] >= EPOCH_1970]:
        changed_after_1970.append(zone)

header = f"""// Orbital Study's pre-1970 time-zone corrections — generated by tools/build-tz-history.py
// from IANA tzdb {version} (public domain, iana.org/time-zones); don't hand-edit.
// zones: the separate pre-1970 histories browsers leave out (tzdb's backzone), as
//   [until (Unix seconds, UTC), UTC offset in seconds (null = local mean time)] periods.
// lmtUntil: when local mean time ended in each zone (Unix seconds, UTC).
// Used by chartBirthMomentUTC (app.js).
"""
with open(os.path.join(root, "tz-history.js"), "w") as f:
    f.write(header + "const TZ_HISTORY = " + json.dumps({"version": version, "zones": zones, "lmtUntil": lmt_until}, separators=(",", ":")) + ";\n")
print(f"tz-history.js {os.path.getsize(os.path.join(root, 'tz-history.js'))} bytes; tzdb {version}; {len(zones)} zones corrected, "
      f"{len(lmt_until)} with LMT; differing after 1970 (ignored): {changed_after_1970}")
