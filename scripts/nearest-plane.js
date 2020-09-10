window.addEventListener('load', () => {
    $('launch').addEventListener('click', submit);
});

function $(id) {
    return document.getElementById(id);
}

function submit() {
    const lin = $('coords').value
        .split(/,|\s+|,\s+/)        // Split value on spaces, commas, or both
        .filter(s => s);            // Remove empty strings

    if (lin.length < 2) {
        $('coords').value = '';
        return;
    }

    let loc;
    try {
        loc = getWGALatLong(...lin);
    } catch (err) {
        alert('Do not mix directional and nondirectional coordinates');
        $('coords').value = '';
        return;
    }

    nearestPlane(...loc);
}

/**
 * @async
 * @param {number} lat the latitude of a location
 * @param {number} long the longitude of a location
 */
async function nearestPlane(lat, long) {
    // TODO: Add an actual loading symbol to the page
    console.log('Fetching data...')

    // Get JSON response from api, repeat with larger bounding box if no aircraft found or if response is invalid
    let range = 0.5;
    let res;
    do {
        range *= 2;
        try {
            const response = await getData('https://opensky-network.org/api/states/all', qBoundingBox(lat, long, range));
            if (!response) continue;

            res = await response.json();
            if (!res.states) continue;
            if (res.states.length < 1) continue;

            break;
        } catch (err) {
            console.error(err);
            return;
        }
    } while (true);

    // Finding closest plane to location using geodesicDist
    let min = Number.MAX_SAFE_INTEGER;
    let curr;
    let nearest;
    for (const s of res.states) {
        checkSquawk(s);
        if (s[6] === null || s[5] === null) continue;
        curr = geodesicDist(lat, long, s[6], s[5]);
        if (curr < min) {
            min = curr;
            nearest = s;
        }
    }

    const directLatLong = getDirectionalLatLong(lat, long);
    const gcDist = min.toFixed(2);
    const airline = getAirline(nearest[1]);
    const flnumber = nearest[1].slice(3).trim();

    // ========================= vvv THIS NEEDS TO CHANGE vvv ==============================

    const uid = createOutputBox();

    $(`output-head-${uid}`).textContent = `The nearest plane to (${directLatLong[0]}, ${directLatLong[1]}) is `;
    if (airline === "private aircraft") {
        $(`output-head-${uid}`).textContent += `a private aircraft from ${nearest[2]}`;
    } else if (/[A-Za-z]+/.test(flnumber)) {
        $(`output-head-${uid}`).textContent += `a ${airline} flight from ${nearest[2]}`;
    } else {
        $(`output-head-${uid}`).textContent += `${airline} flight ${flnumber} from ${nearest[2]}`;
    }

    addOutputDetail(
        `output-details-${uid}`,
        'Distance:',
        `${gcDist} mi`,
        'How far away the aircraft is from the provided location; calculated using the geodesic distance formula (distance between 2 points on a sphere)'
    );
    displayAircraftInfo(`output-details-${uid}`, nearest);

    // ========================= ^^^ THIS NEEDS TO CHANGE ^^^ ==============================
}

/**
 * Creates and sends a GET request to the designated endpoint
 * 
 * @async
 * @param {string} endpoint the URL of the resource/API being accessed
 * @param {string} [query] any additional request parameters
 * @return {Promise<Response>|null} the response, or null if the response was bad or missing
 * @see qBoundingBox
 */
async function getData(endpoint, query = '') {
    const url = `${endpoint}${query}`;
    const response = await fetch(url);
    if (!response) return null;
    if (!response.ok) {
        console.error(`HTTP error: ${response.status} ${response.statusText}`);
        return null;
    }
    return response;
}

/**
 * Constructs a query string with lat/long min/max parameters
 * 
 * @param {number} lat the latitude of a point on earth
 * @param {number} long the longitude of a point on earth
 * @param {number} scl the "radius" of the bounding box; equal to the distance in each direction that the boundary
 * will be placed from the given point. The bounding box will have a side length of scl &times; 2
 * @return {string} a query string containing min/max values for latitude and longitude
 */
function qBoundingBox(lat, long, scl) {
    let lamin = lat - scl;
    let lamax = lat + scl;
    let lomin = long - scl;
    let lomax = long + scl;

    // Checking for bounds overflow/underflow
    // Latitude should be in the range [-90 <= lat <= 90]
    if (lamin < -90) {
        lamin = -90;
    }
    if (lamax > 90) {
        lamax = 90;
    }
    // Longitude should be in the range [-180 <= long <= 180]
    if (lomin < -180) {
        lomin = -180;
    }
    if (lomax > 180) {
        lomax = 180;
    }

    return `?lamin=${lamin.toFixed(8)}&lomin=${lomin.toFixed(8)}&lamax=${lamax.toFixed(8)}&loMax=${lomax.toFixed(8)}`;
}

function checkSquawk(state) {
    const code = state[14];
    if (!code) return false;
    
    const codes = {
        "7500": "aircraft hijacking",
        "7600": "loss of radio contact",
        "7700": "declared emergency"
    }

    if (!(code in codes)) return;

    const nid = createOutputBox();
    
    $(`output-head-${nid}`).textContent = `ALERT: A nearby aircraft is broadcasting emergency transponder code ${code}: ${codes[code]}`;
    displayAircraftInfo(`output-details-${nid}`, state);
}

/**
 * @param {number} [requestedId] the (potential) id of the new output box, if it is available
 * @return {number} the unique number at the end of the new box's id (same as requestedId, if available)
 * 
 * Ex: h2 id="extra-head-1" / ul id="extra-details-1" => 1 would be returned
 */
function createOutputBox(requestedId = 0) {
    // Hide current ouput boxes
    for (const ob of document.getElementsByClassName('output__box')) {
        ob.classList.add('content--hidden');
    }

    // Create new output box
    const box = document.createElement('div');
    box.classList.add('output__box', 'content--blurred');

    const head = document.createElement('h2');
    head.classList.add('output__heading', 'content--line-left', 'content--font-small');

    // Find an unused id for new output head
    let i = requestedId ? requestedId : 1;
    while ($(`output-head-${i}`)) {
        i++;
    }

    // Assign unique id to new heads
    head.id = `output-head-${i}`;

    const list = document.createElement('ul');
    list.classList.add('output__details', 'content--line-left');
    
    // Assign unique id to new details list
    list.id = `output-details-${i}`;

    box.append(head);
    box.append(list);
    
    // TODO: use insertBefore to add this before output__bottom
    // $('out').append(box);
    $('out').insertBefore(box, document.getElementsByClassName('output__bottom')[0]);

    return i;
}

/**
 * @param {string} toListId 
 * @param {*[]} state 
 */
function displayAircraftInfo(toListId, state) {
    const desc = {
        "callsign": `The callsign of the plane, used for radio communication with ground personnel and other aircraft. Each airline has its own unique "telephony designator"
                     (the word/s at the beginning of the callsign that identify which airline the plane belongs to)`,
        "speed": `How fast the aircraft is moving horizontal to the ground; the aircraft's "ground speed"`,
        "direction": `The "true track" of the aircraft. This is the direction that the aircraft is moving towards (i.e., the direction the aircraft's velocity vector
                      is pointing towards). However, true track is not always the same as the aircraft's "heading", which is where the aircraft is pointing. For example,
                      windy conditions could mean that an aircraft might be facing North (a heading of 0°), while it is actually travelling Northeast (a true track of 30°)
                      because of drift caused by wind`,
        "altitude": `The geometric altitude of the aircraft, or how high above Earth's surface the plane is flying. This is the same number that you would get if you
                     stuck a giant ruler between the bottom of the aircraft and the ground`,
        "vertRate": `The aircraft's vertical rate represents how fast its altitude is changing. A positive value (+) means that the aircraft is climbing,
                     while a negative value (-) means that it is descending. The larger the number, the faster the aircraft is moving up or down. An aircraft
                     with a vertical rate of 0 is cruising at a constant altitude, neither climbing nor descending`
    };

    // Callsign
    if (state[1]) {
        const td = getTelephony(getAirline(state[1]));
        let callsign;
        if (!/\S+/.test(state[1])) {
            callsign = "n/a";
        } else if (!td) {
            callsign = state[1];
        } else {
            callsign = `${td} ${state[1].slice(3).trim()}`;
        }
        addOutputDetail(toListId, 'Callsign:', callsign, desc.callsign);
    } else {
        addOutputDetail(toListId, 'Callsign:', 'n/a', desc.callsign);
    }

    // Speed
    if (state[9] !== null) {
        // Convert from m/s to mi/hr
        const mph = state[9] * 2.237;
        addOutputDetail(toListId, 'Speed:', `${mph.toFixed(2)} mi/hr`, desc.speed);
    } else {
        addOutputDetail(toListId, 'Speed:', 'n/a', desc.speed);
    }

    // Direction (true track)
    if (state[10] !== null) {
        const tt = getHeading(state[10]);
        addOutputDetail(toListId, 'Direction:', `${state[10].toFixed(2)}° (${tt})`, desc.direction);
    } else {
        addOutputDetail(toListId, 'Direction:', 'n/a', desc.direction);
    }

    // Geographic altitude
    if (state[13] !== null) {
        // Convert from m to ft
        const alt = state[13] * 3.28084;
        addOutputDetail(toListId, 'Altitude:', `${alt.toFixed(2)} ft`, desc.altitude);
    } else {
        addOutputDetail(toListId, 'Altitude:', 'n/a', desc.altitude);
    }

    // Vertical rate
    if (state[11] !== null) {
        // Convert from m/s to ft/s
        const vrate = state[11] * 3.28084;
        addOutputDetail(toListId, 'Vertical rate:', `${vrate > 0 ? '+' : ''}${vrate.toFixed(2)} ft/sec`, desc.vertRate);
    } else {
        addOutputDetail(toListId, 'Vertical rate:', 'n/a', desc.vertRate);
    }
}

/**
 * @param {string} toListId
 * @param {string} property 
 * @param {string} [value] 
 * @param {string} [title]
 */
function addOutputDetail(toListId, property, value = 'n/a', description = '') {
    const telem = document.createElement('li');
    telem.classList.add('output__telemetry', 'content--font-small');

    const prop = document.createElement('span');
    prop.textContent = property;
    prop.classList.add('output__property');
    if (description) {
        prop.setAttribute('data-title', description);
    }

    const val = document.createElement('span');
    val.textContent = value;
    val.classList.add('output__value');

    telem.append(prop);
    telem.append(val);

    $(toListId).append(telem);
}

/**
 * @param {number|string} lat 
 * @param {number|string} long 
 * @return {string[]}
 */
function getDirectionalLatLong(lat, long) {
    let laDir = 'N', loDir = 'E';

    if (typeof lat === 'string') {
        lat = Number.parseFloat(lat);
    }
    if (typeof long === 'string') {
        long = Number.parseFloat(long);
    }

    if (lat < 0) {
        laDir = 'S'
    }
    if (long < 0) {
        loDir = 'W';
    }

    const r = [lat, long].map(v => v + '');
    for (let i = 0; i < r.length; i++) {
        r[i] = r[i].replace(/\-/, '');
    }

    return [`${r[0]}°${laDir}`, `${r[1]}°${loDir}`];
}

/**
 * 
 * @param {string} lat 
 * @param {string} long 
 * @return {number[]}
 */
function getWGALatLong(lat, long) {
    // Remove degree symbols, if any
    lat = lat.replace(/°/g, '');
    long = long.replace(/°/g, '');

    // Check if lat/long is already in WGA-84 format
    const pattern = /[NESW]/i;
    if (!pattern.test(lat) && !pattern.test(long)) {
        // If so, return lat/long as numbers
        return [lat, long].map(Number.parseFloat);
    }

    // If lat/long has a negative (-) symbol, remove it and switch direction
    if (/\-/.test(lat)) {
        lat = lat.replace(/\-/, '');
        if (lat.search(/N/i) !== -1) {
            lat = lat.replace(/N/i, 'S');
        } else {
            lat = lat.replace(/S/i, 'N');
        }
    }
    if (/\-/.test(long)) {
        long = long.replace(/\-/, '');
        if (long.search(/E/i) !== -1) {
            long = long.replace(/E/i, 'W');
        } else {
            long = long.replace(/W/i, 'E');
        }
    }

    // Get direction of lat/long
    const laDir = lat.match(pattern)[0];
    const loDir = long.match(pattern)[0];

    // Remove direction from lat/long
    lat = lat.replace(pattern, '');
    long = long.replace(pattern, '');

    // Make lat/long negative, if necessary
    if (laDir.toUpperCase() === 'S') {
        lat = `-${lat}`;
    }
    if (loDir.toUpperCase() === 'W') {
        long = `-${long}`;
    }

    return [lat, long].map(Number.parseFloat);
}

// Gets the telephony designator (widely know as callsign) of the given airline
function getTelephony(airline) {
    const rl = readAirlineTldCallsign();

    let lineNum = 1;
    for (const line of rl) {
        if (lineNum < 4) {
            lineNum++;
            continue;
        }
        const s = line.split('|').map(str => str.trim());
        if (airline === s[0]) {
            return s[2];
        }
    }

    return '';
}

// Gets the name of the airline associated with the tld (three letter designator) in the provided callsign
function getAirline(callsign) {
    const tld = callsign.slice(0, 3).toUpperCase();

    const rl = readAirlineTldCallsign();

    let lineNum = 1;
    for (const line of rl) {
        if (lineNum < 4) {
            lineNum++;
            continue;
        }
        const s = line.split('|').map(str => str.trim());
        if (tld === s[1]) {
            return s[0];
        }
    }

    return 'private aircraft';
}

function getHeading(deg) {
    const compass = {
        0: "North",
        45: "Northeast",
        90: "East",
        135: "Southeast",
        180: "South",
        225: "Southwest",
        270: "West",
        315: "Northwest",
        360: "North"
    }

    for (let a = 0; a <= 360; a += 45) {
        if (Math.abs(deg - a) <= 22.5) {
            return compass[a];
        }
    }
    return "n/a";
}

/**
 * Converts unix time (in milliseconds) to a timestamp with the format [HH:MM:SS]
 * 
 * @param {number} [ms] the time to convert, in milliseconds (will use the current time if not provided)
 * @return {string} the timestamp [HH:MM:SS]
 */
function getTimestamp(ms = Date.now()) {
    const time = new Date(ms);
    const h = '0' + time.getHours();
    const m = '0' + time.getMinutes();
    const s = '0' + time.getSeconds();
    return `[${h.slice(-2)}:${m.slice(-2)}:${s.slice(-2)}]`;
}

/**
 * Calculates the distance between two points on Earth
 * 
 * @param {number} lat1 the latitude of point 1
 * @param {number} long1 the longitude of point 1
 * @param {number} lat2 the latitude of point 2
 * @param {number} long2 the longitude of point 2
 * @return {number} the distance, in miles, between the two points
 */
function geodesicDist(lat1, long1, lat2, long2) {
    const phi1 = toRadians(lat1);
    const phi2 = toRadians(lat2);
    const lam1 = toRadians(long1);
    const lam2 = toRadians(long2);

    // Implementation of the haversine formula
    // h is equal to hav(Θ), where Θ is the central angle between the two points
    const h = hav(phi2 - phi1) + (Math.cos(phi1) * Math.cos(phi2) * hav(lam2 - lam1));

    // Radius of the Earth in miles
    const r = 3958.8;
    // Solving for ground distance in miles
    const d = 2 * r * Math.asin(Math.sqrt(h));
    return d;
}

/**
 * Sin-based implementation of the haversine function (h(Θ) = sin^2(Θ/2))
 * 
 * @param {number} theta an angle in radians
 * @return {number} the haversine of the angle
 */
function hav(theta) {
    const r = Math.sin(theta / 2);
    return r * r;
}

/**
 * Converts from degrees to radians
 * 
 * @param {number} deg an angle in degrees
 * @return {number} the angle in radians
 */
function toRadians(deg) {
    return deg / 180 * Math.PI;
}

function readAirlineTldCallsign() {
    const file =
    `
    Airline                                                                          | ICAO tld | Callsign                       | Comments
    ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
    RAF Elementary Flying Training School                                            | WYT      | WYTON                          | Royal Air Force
    223rd Flight Unit                                                                | CHD      | CHKALOVSK-AVIA                 | State Airline
    135 Airways                                                                      | GNL      | GENERAL                        | 
    213th Flight Unit                                                                | TFU      | THJY                           | State Airline
    224th Flight Unit                                                                | TTF      | CARGO UNIT                     | State Airline
    3D Aviation                                                                      | SEC      | SECUREX                        | 
    40-Mile Air                                                                      | MLA      | MILE-AIR                       | 
    247 Jet                                                                          | TWF      | CLOUD RUNNER                   | 
    Ryan Air Services                                                                | RYA      | RYAN AIR                       | 
    43 Air School                                                                    | PIU      | PRIMA                          | 
    Advanced Air                                                                     | WSN      | WINGSPAN                       | 2015
    Pascan Aviation                                                                  | PSC      | PASCAN                         | 1999
    Interjet                                                                         | AIJ      | ABC AEROLINEAS                 | 
    A-Jet Aviation Aircraft Management                                               | GBT      | GLOBETROTTER                   | 
    A-Safar Air Services                                                             | SFM      | AIR SAFAR                      | 
    Air Costa                                                                        | LEP      | LECOSTA                        | 2014, commenced operations Feb. 2017
    A2 Jet Leasing                                                                   | AJJ      | ATLANTIC JET                   | 
    Abakan Air                                                                       | NKP      | ABAKAN AIR                     | 2014
    Aero Owen                                                                        | OWN      | AERO OWEN                      | 2014
    Aero Sotravia                                                                    | ASR      | SOTRAVIA                       | 2014
    Aerohelicopteros                                                                 | ARH      | AEROHELCA                      | 2014
    Aeroventas de Mexico                                                             | VMX      | VENTA                          | 2014
    Air Antwerp                                                                      | ATW      | DEVIL                          | 
    Algonquin Airlink                                                                | FSY      | FROSTY                         | 2014
    A-Jet Aviation                                                                   | AJR      | JET MONGOLIA                   | 
    Alpha Jet                                                                        | ALN      | TOLEMAC                        | 2014
    Alliance Air Charters                                                            | TTX      | TWISTER                        | 
    Atlas Ukraine Airlines                                                           | UJX      | ATLAS UKRAINE                  | 2014
    Air Charity Network                                                              | NGF      | ANGEL FLIGHT                   | Re-allocated in 2014 was used by Angel Flight America
    Avior Regional                                                                   | RGR      | AVIOR REGIONAL                 | 2014
    Aircharters Worldwide                                                            | WFT      | WORLD FLIGHT                   | Allocated 2014
    Apollo Air Service                                                               | EDY      | STOBART                        | Was VLL Limited
    Attawasol Airlines                                                               | ATT      | ATTAWASOL AIR                  | 
    InterCaribbean Airways                                                           | IWY      | ISLANDWAYS                     | Name changed from Interisland Airways Limited and Air Turks & Caicos
    Air Kyrgyzstan                                                                   | LYN      | ALTYN AVIA                     | Name changed from Kyrgyzstan
    Air Serbia                                                                       | ASL      | AIR SERBIA                     | Name changed from Aeroput to JAT Yugoslav Airlines to Jat Airways to Air Serbia. Formerly used JAT as ICAO code.
    Air Corsica                                                                      | CCM      | CORSICA                        | 
    AHS Air International                                                            | AHS      | HIGH SKY                       | 
    2Excel Aviation                                                                  | BRO      | BROADSWORD                     | 
    Aeronautical Charters                                                            | SUP      | SUN SPEED                      | 
    Aer Lingus                                                                       | EIN      | SHAMROCK                       | 
    AirSprint US                                                                     | FCJ      | FRACJET                        | Previously used code "HAB"
    Air Volta                                                                        | VLB      | VOLTA                          | 
    Airteam Charter                                                                  | TEW      | TEAMWORK                       | 
    Aero Roa                                                                         | ROO      | AERO ROA                       | 
    Arrow Aviation                                                                   | HEZ      | ARROW                          | 
    Adro Servicios Aereos                                                            | DRO      | ADRO SERVICIOS                 | 
    Aero Jet International                                                           | RVQ      | REVA AIR                       | 
    Alpha Star Charter                                                               | STT      | STAR CHARTER                   | 
    Aero4m                                                                           | AEH      | AEROCUTTER                     | 
    Aerosky                                                                          | ASK      | MULTISKY                       | 
    Aerolink Uganda                                                                  | XAU      | PEARL                          | 
    AG Air                                                                           | AGA      | GEOLINE                        | 
    Aeromonkey                                                                       | NKY      | AEROMON                        | 
    Aeroecom                                                                         | ERO      | AEROECOM                       | 
    Air Côte d'Ivoire                                                                | VRE      | COTE DIVORIE                   | 
    ART Aviation                                                                     | OES      | ART AUSTRIA                    | 
    Austrian Air Force                                                               | ASF      | AUSTRIAN AIRFORCE              | 
    Aerotaxis Pegaso                                                                 | PSO      | AEROPEGASO                     | 
    Aviation Legacy                                                                  | AVG      | AVILEF                         | 
    Aztec Worldwide Airlines                                                         | AZY      | AZTEC WORLD                    | 
    Abelag Aviation                                                                  | AAB      | ABG                            | 
    Air X Charter                                                                    | AXY      | LEGEND                         | 
    Aero Biniza                                                                      | BZS      | BINIZA                         | 
    Aero Albatros                                                                    | ABM      | ALBATROS ESPANA                | 
    Aigle Azur                                                                       | AAF      | AIGLE AZUR                     | Former name: Lucas Aigle Azur; former IATA code: LK
    Air China Inner Mongolia                                                         | CNM      | MENGYUAN                       | 
    Atlantis Airlines                                                                | AAO      | ATLANTIS AIR                   | 
    Australia Asia Airlines                                                          | AAU      | AUSTASIA                       | Subsidiary merged into Qantas; former IATA code: IM
    Air Canada Rouge                                                                 | ROU      | ROUGE                          | 
    Air Ambulance Services                                                           | ABZ      | ISLAND LIFEFLIGHT              | 
    Air Brasd'or                                                                     | BRL      | BRASD'OR                       | 
    Askari Aviation                                                                  | AAS      | AL-ASS                         | 
    Atlantic Flight Training                                                         | AAG      | ATLANTIC                       | Changed from Air Atlantique in 2014
    Air Atlantique                                                                   | AAG      | ATLANTIC                       | Former name: Atlantic Air Transport; former IATA codes: 7M, DG, transferred to Atlantic Flight Training in 2014.
    Air Hungaria                                                                     | AHN      | AIR HUNGARIA                   | 
    Air Viggi San Raffaele                                                           | AHS      | AIRSAR                         | 
    Air Hong Kong                                                                    | AHK      | AIR HONG KONG                  | 
    Air Express                                                                      | AEQ      | LUNA                           | 
    Air Aurora                                                                       | AAI      | BOREALIS                       | Former IATA code: AX
    Asiana Airlines                                                                  | AAR      | ASIANA                         | 
    Air Cargo Transportation System                                                  | ACU      | AFRISPIRIT                     | 
    Air Italy                                                                        | AEY      | AIR ITALY                      | merged into Meridiana
    Air Europa                                                                       | AEA      | EUROPA                         | 
    Aero Servicios Ejecutivos Internacionales                                        | SII      | ASEISA                         | 
    Air Special                                                                      | ASX      | AIRSPEC                        | 
    Air Macau                                                                        | AMU      | AIR MACAO                      | 
    Air France                                                                       | AFR      | AIRFRANS                       | 
    Air Seychelles                                                                   | SEY      | SEYCHELLES                     | 
    Air Caledonie International                                                      | ACI      | AIRCALIN                       | 
    Air Partner                                                                      | ACG      | AIR PARTNER                    | 
    AirClass Airways                                                                 | VSG      | VISIG                          | formerly Visig Operaciones Aéreas
    Air Nippon Network                                                               | AKX      | ALFA WING                      | merged into ANA Wings
    Air Bravo                                                                        | BRF      | AIR BRAVO                      | 
    Astro Air International                                                          | AAV      | ASTRO-PHIL                     | 
    Air Lincoln                                                                      | ALN      | CHICAGO LINCOLN                | 
    Air Guam                                                                         | AGM      | AIR GUAM                       | 
    Air Wisconsin                                                                    | AWI      | WISCONSIN                      | 
    Air Luxor STP                                                                    | ALU      | LUXORJET                       | 
    Air Afrique Vacancies                                                            | AFV      | AFRIQUE VACANCE                | 
    Air Sunshine                                                                     | RSI      | AIR SUNSHINE                   | 
    Air Japan                                                                        | AJX      | AIR JAPAN                      | 
    Air North (Canada Charter)                                                       | ANT      | AIR NORTH                      | 
    Air Nevada                                                                       | ANV      | AIR NEVADA                     | 
    Air Malawi                                                                       | AML      | MALAWI                         | 
    Air New Zealand                                                                  | ANZ      | NEW ZEALAND                    | "NZ" used by New Zealand National Airways Corporation until its merger with Air New Zealand in 1978"TE" used by TEAL from 1940-1965, then Air New Zealand from 1965-1990
    Air Caledonia                                                                    | ACM      | WEST CAL                       | 
    Air Valencia                                                                     | AVZ      | AIR VALENCIA                   | 
    Air Montreal                                                                     | AMO      | AIR MONTREAL                   | 
    Afriqiyah Airways                                                                | AAW      | AFRIQIYAH                      | 
    Air Specialties Corporation                                                      | AMR      | AIR AM                         | Air American, Total Air
    Air Muskoka                                                                      | AMS      | AIR MUSKOKA                    | 
    Avcon Jet                                                                        | AOJ      | ASTERIX                        | 
    Air BC                                                                           | ABL      | AIRCOACH                       | Merged into Air Canada Jazz
    Air Cargo America                                                                | MVM      | PEGASUS                        | 
    Air Glaciers                                                                     | AGV      | AIR GLACIERS                   | 
    Air Ambar                                                                        | AMY      | AIR AMBAR                      | 
    Air Tractor                                                                      | AOU      | AIR TRACTOR                    | 
    Air Montenegro                                                                   | AMN      | MONTENEGRO                     | 
    Air Park Aviation                                                                | APA      | CAN-AM                         | 
    All Nippon Airways                                                               | ANA      | ALL NIPPON                     | 
    ANTC                                                                             | ANB      | AIR NAV                        | Former ICAO code:  AAT
    Air People International                                                         | APG      | AIR PEOPLE                     | 
    Air Jetsul                                                                       | AJU      | AIRJETSUL                      | 
    Air Cargo Carriers                                                               | SNC      | NIGHT CARGO                    | 
    Air-Angol                                                                        | NGO      | AIR ANGOL                      | 
    air-taxi Europe                                                                  | TWG      | TWINGOOSE                      | 
    Air Sandy                                                                        | SNY      | AIR SANDY                      | 
    Air Baffin                                                                       | BFF      | AIR BAFFIN                     | renamed to Air Nunavut
    Air Bandama                                                                      | BDM      | BANDAMA                        | 
    Air Plan International                                                           | APV      | AIR PLAN                       | 
    Air Xpress                                                                       | ARX      | AIREX                          | 
    Air Tchad                                                                        | HTT      | HOTEL TANGO                    | 
    Air-Spray                                                                        | ASB      | AIR SPRAY                      | 
    Air Resorts                                                                      | ARZ      | AIR RESORTS                    | 
    Air Armenia                                                                      | ARR      | AIR ARMENIA                    | 
    Air Sinai                                                                        | ASD      | AIR SINAI                      | 
    ASL Airlines Ireland                                                             | ABR      | CONTRACT                       | Former IATA Code: AG; former names: Hunting Air Cargo Airlines, Air Contractors
    Air Star Corporation                                                             | ASC      | AIR STAR                       | 
    Air India                                                                        | AIC      | AIRINDIA                       | 
    Air Traffic GmbH                                                                 | ATJ      | SNOOPY                         | 
    Air Saint Pierre                                                                 | SPM      | SAINT-PIERRE                   | 
    Air Transport International                                                      | ATN      | AIR TRANSPORT                  | 
    Air Transport Schiphol                                                           | ATQ      | MULTI                          | 
    Air Falcon                                                                       | AVG      | DJIBOUTI FALCON                | 
    Air Vanuatu                                                                      | AVN      | AIR VAN                        | 
    Air Atlanta Icelandic                                                            | ABD      | ATLANTA                        | 
    Air Inuit                                                                        | AIE      | AIR INUIT                      | 
    Air Sureste                                                                      | AIS      | SURESTE                        | 
    Air Samarkand                                                                    | SND      | ARSAM                          | 
    Air Namibia                                                                      | NMB      | NAMIBIA                        | 
    Air Integra                                                                      | AII      | INTEGRA                        | 
    Air Saigon                                                                       | SGA      | AIR SAIGON                     | 
    Air Tahiti Nui                                                                   | THT      | TAHITI AIRLINES                | 
    Air Intersalonika                                                                | NSK      | INTERSALONIKA                  | 
    Africa World Airlines                                                            | AFW      | BLACKSTAR                      | 
    Air Caraïbes                                                                     | FWI      | FRENCH WEST                    | 
    Air India Express                                                                | AXB      | EXPRESS INDIA                  | 
    Air Express                                                                      | AXD      | AIR SUDEX                      | 
    Air Wings                                                                        | BSB      | ARBAS                          | 
    Air Baltic                                                                       | BTI      | AIRBALTIC                      | 
    Air Nostrum                                                                      | ANE      | AIR NOSTRUM                    | 
    Air Atlantic                                                                     | ANI      | NIGALANTIC                     | 
    Air Niugini                                                                      | ANG      | NIUGINI                        | 
    Air Arabia                                                                       | ABY      | ARABIA                         | 
    Air Canada                                                                       | ACA      | AIR CANADA                     | 
    AlbaStar                                                                         | LAV      | ALBASTAR                       | 
    Air Memphis                                                                      | MHS      | AIR MEMPHIS                    | 
    Air Zermatt AG                                                                   | AZF      | AIR ZERMATT                    | 
    Air Zimbabwe                                                                     | AZW      | AIR ZIMBABWE                   | 
    Air Marrakech Service                                                            | MKH      | AIR MARRAKECH                  | 
    Air Memphis                                                                      | MHU      | MEPHIS UGANDA                  | 
    Air Tanzania                                                                     | ATC      | TANZANIA                       | 
    Air Sahara                                                                       | RSH      | SAHARA                         | renamed to Jetlite
    Air Travel Corp.                                                                 | ATH      | AIR TRAVEL                     | 
    Air Burkina                                                                      | VBW      | BURKINA                        | 
    Air Malta                                                                        | AMC      | AIR MALTA                      | 
    Air Class                                                                        | ASS      | AIR CLASS                      | 
    Air Somalia                                                                      | RSM      | AIR SOMALIA                    | 
    Air Taxi & Cargo                                                                 | WAM      | TAXI CARGO                     | 
    Allegiant Air                                                                    | AAY      | ALLEGIANT                      | 
    Aban Air                                                                         | ABE      | ABAN                           | Former IATA code: K5
    Air West                                                                         | AWT      | AIR WEST                       | 
    Aerial Oy                                                                        | ABF      | SKYWINGS                       | 
    African B&T                                                                      | ABB      | AFRICAN BUSINESS               | 
    Air Niamey                                                                       | AWN      | AIR NIAMEY                     | 
    APSA Colombia                                                                    | ABO      | AEROEXPRESO                    | aka Aeroexpreso Bogota
    Aerocenter PTS                                                                   | ACR      | AEROCENTER                     | PTS stands for Pilot Training School
    Antrak Air                                                                       | ABV      | ANTRAK                         | 
    Airborne Express                                                                 | ABX      | ABEX                           | August 14, 2003 merged into DHL
    ABX Air                                                                          | ABX      | ABEX                           | August 15, 2003 Air operations of former Airborne Express
    Astral Aviation                                                                  | ACP      | ASTRAL CARGO                   | 
    Academy Airlines                                                                 | ACD      | ACADEMY                        | 
    Atlas Cargo Airlines                                                             | ACY      | ATLAS CARGOLINES               | 
    Antonov Airlines                                                                 | ADB      | ANTONOV BUREAU                 | Antonov Design Bureau
    Airservices Australia                                                            | ADA      | AUSCAL                         | Flight Inspection Unit
    Aerea Flying Training Organization                                               | ADG      | AEREA TRAINING                 | 
    Aero Dynamics                                                                    | ADL      | COTSWOLD                       | 
    Audeli Air                                                                       | ADI      | AUDELI                         | 
    Aero-Dienst                                                                      | ADN      | AERODIENST                     | 
    Aerodyne                                                                         | ADY      | AERODYNE                       | 
    Aerodiplomatic                                                                   | ADP      | AERODIPLOMATIC                 | 
    Avion Taxi                                                                       | ADQ      | AIR DATA                       | 2695731 Canada Inc.
    Airdeal Oy                                                                       | ADU      | AIRDEAL                        | 
    Aviones de Sonora                                                                | ADS      | SONORAV                        | 
    Anderson Aviation                                                                | ADX      | ANDAX                          | 
    Aegean Airlines                                                                  | AEE      | AEGEAN                         | 
    Aerogal                                                                          | GLG      | AEROGAL                        | Aerolíneas Galápagos SA
    Aerocon                                                                          | AEK      | AEROCON                        | 
    Air Express                                                                      | AEJ      | KHAKI EXPRESS                  | 
    Aero Madrid                                                                      | AEM      | AEROMADRID                     | 
    ABSA Cargo                                                                       | TUS      | TURISMO                        | 
    Abakan-Avia                                                                      | ABG      | ABAKAN-AVIA                    | 
    Aerotec Escuela de Pilotos                                                       | AEP      | AEROTEC                        | 
    Western Aeroservices                                                             | AEO      | AERO OCCIDENTE                 | 
    Alaska Central Express                                                           | AER      | ACE AIR                        | 
    American Airlines                                                                | AAL      | AMERICAN                       | 
    Aloha Air Cargo                                                                  | AAH      | ALOHA                          | 
    Army Air Corps                                                                   | AAC      | ARMYAIR                        | 
    Alaska Island Air                                                                | AAK      | ALASKA ISLAND                  | 
    Aeroventas                                                                       | AEV      | AEROVENTAS                     | 
    Alliance Airlines                                                                | UTY      | UNITY                          | 
    Auvia Air                                                                        | UVT      | AUVIA                          | 
    African West Air                                                                 | AFC      | AFRICAN WEST                   | 
    Airfast Indonesia                                                                | AFE      | AIRFAST                        | 
    Ariana Afghan Airlines                                                           | AFG      | ARIANA                         | 
    Africa Air Links                                                                 | AFK      | AFRICA LINKS                   | 
    Africaone                                                                        | AFI      | AFRICAWORLD                    | 
    Aeroflot Russian Airlines                                                        | AFL      | AEROFLOT                       | 
    Aero Empresa Mexicana                                                            | AFO      | AERO EMPRESA                   | 
    Alba Servizi Aerotrasporti                                                       | AFQ      | ALBA                           | 
    Africa Chartered Services                                                        | AFY      | AFRICA CHARTERED               | 
    Africa Freight Services                                                          | AFZ      | AFREIGHT                       | 
    Arab Agricultural Aviation                                                       | AGC      | AGRICO                         | 
    Altagna                                                                          | AGH      | ALTAGNA                        | 
    Aeroméxico Connect                                                               | SLI      | COSTERA                        | 
    Angola Air Charter                                                               | AGO      | ANGOLA CHARTER                 | 
    Amadeus IT Group                                                                 | AGT      | AMADEUS                        | 
    Angara Airlines                                                                  | AGU      | SARMA                          | 
    AERFI Group                                                                      | AGP      | AIR TARA                       | 
    Aero Flight Service                                                              | AGY      | FLIGHT GROUP                   | 
    Aero Banobras                                                                    | BNB      | AEROBANOBRAS                   | 
    Azal Avia Cargo                                                                  | AHC      | AZALAVIACARGO                  | Cargo Airline of the State Concern Azerbaijan Hava
    Alfa Air                                                                         | AFA      | BLUE ALFA                      | 
    Air Alpha Greenland                                                              | AHA      | AIR ALPHA                      | sold to Air Greenland
    Aero Barloz                                                                      | BLZ      | AEROLOZ                        | 
    Aerial Transit                                                                   | AEZ      | AERIAL TRANZ                   | 
    Airplanes Holdings                                                               | AHH      | AIRHOLD                        | 
    Aeroservices Corporate                                                           | CJE      | BIRD JET                       | 
    Airport Helicopter Basel                                                         | AHE      | AIRPORT HELICOPTER             | 
    Aspen Helicopters                                                                | AHF      | ASPEN                          | 
    Azerbaijan Airlines                                                              | AHY      | AZAL                           | 
    Agrolet-Mci                                                                      | AGZ      | AGROLET                        | 
    Aerochiapas                                                                      | AHP      | AEROCHIAPAS                    | 
    Air Incheon                                                                      | AIH      | AIR INCHEON                    | 
    ABC Aerolíneas                                                                   | AIJ      | ABC AEROLINEAS                 | 
    Avies                                                                            | AIA      | AVIES                          | 
    ABC Air Hungary                                                                  | AHU      | ABC HUNGARY                    | 
    Airbus Industrie                                                                 | AIB      | AIRBUS INDUSTRIE               | 
    ABS Jets                                                                         | ABP      | BAIR                           | Named changed from Aba Air
    Air Seoul                                                                        | ASV      | AIR SEOUL                      | 
    Alpine Air Express                                                               | AIP      | ALPINE AIR                     | 
    African Airlines International                                                   | AIK      | AFRICAN AIRLINES               | 
    African International Airways                                                    | AIN      | FLY CARGO                      | 
    Airvias S/A Linhas Aéreas                                                        | AIV      | AIRVIAS                        | 
    Atlantic Island Airways                                                          | AIW      | TARTAN                         | 
    Alicante Internacional Airlines                                                  | AIU      | ALIA                           | 
    Airblue                                                                          | ABQ      | PAKBLUE                        | 
    Airmark Aviation                                                                 | THM      | THAI AIRMARK                   | 
    Aero Services Executive                                                          | BES      | BIRD EXPRESS                   | 
    Arkia Israel Airlines                                                            | AIZ      | ARKIA                          | 
    Aircrew Check and Training Australia                                             | AIY      | AIRCREW                        | 
    Avia Consult Flugbetriebs                                                        | AJF      | AVIACONSULT                    | 
    Afghan Jet International Airlines                                                | AJA      | AFGHAN JET                     | 
    Aeroejecutivos Colombia                                                          | AJS      | AEROEJECUTIVOS                 | Aeroejecutivos Aeroservicios Ejecutivos
    Ameristar Jet Charter                                                            | AJI      | AMERISTAR                      | 
    Aircruising Australia                                                            | AIX      | CRUISER                        | 
    ANA & JP Express                                                                 | AJV      | AYJAY CARGO                    | merged into Air Japan
    Allied Air                                                                       | AJK      | BAMBI                          | 
    Alpha Jet International                                                          | AJW      | ALPHAJET                       | 
    Arca Aerovías Colombianas                                                        | AKC      | ARCA                           | 
    Aero Jets Corporativos                                                           | AJP      | AEROJETS                       | 
    Aero JBR                                                                         | AJB      | AERO JBR                       | 
    Aeromilenio                                                                      | MNI      | AEROMIL                        | 
    Akhal                                                                            | AKH      | AKHAL                          | 
    Anikay Air                                                                       | AKF      | ANIKAY                         | 
    Alkan Air                                                                        | AKN      | ALKAN AIR                      | 
    Aklak Air                                                                        | AKK      | AKLAK                          | 
    Aero Albatros                                                                    | ALB      | ALBATROS                       | 
    American Flyers                                                                  | FYS      | AMERICAN FLYERS                | 
    Aero Coach Aviation                                                              | DFA      | AERO COACH                     | 
    Amerijet International                                                           | AJT      | AMERIJET                       | 
    Aerotaxis Albatros                                                               | BTS      | AEROLINEAS ALBATROS            | 
    Atlantic Southeast Airlines                                                      | ASQ      | ACEY                           | Merged into ExpressJet Airlines
    Allied Command Europe                                                            | ALF      | ACEFORCE                       | 
    Albion Aviation                                                                  | ALD      | ALBION                         | 
    Air Logistics                                                                    | ALG      | AIRLOG                         | 
    America West Airlines                                                            | AWE      | CACTUS                         | Merged with US Airways
    Aerovallarta                                                                     | ALL      | VALLARTA                       | 
    Aktjubavia                                                                       | AKB      | KARAB                          | 
    Allegheny Commuter Airlines                                                      | ALO      | ALLEGHENY                      | US Airways Express
    Aero Taxis Cessna                                                                | TND      | TAXIS CESSNA                   | 
    Alpliner AG                                                                      | ALP      | ALPINER                        | Code now allocated to another user
    ACM Air Charter                                                                  | BVR      | BAVARIAN                       | 
    Aerotransporte de Carga Union                                                    | TNO      | AEROUNION                      | 
    Arizona Express Airlines                                                         | TMP      | TEMPE                          | 
    Allpoints Jet                                                                    | ALP      | ALLPOINTS                      | 
    Altair Aviation                                                                  | ALQ      | ALTAIR                         | 
    Aeropostal Alas de Venezuela                                                     | ALV      | AEROPOSTAL                     | 
    ATMA                                                                             | AMA      | ADIK                           | 
    Alyeska Air Service                                                              | ALY      | ALYESKA                        | 
    Aviation Amos                                                                    | AMJ      | AVIATION AMOS                  | 
    Alas Nacionales                                                                  | ALW      | ALNACIONAL                     | 
    Amerer Air                                                                       | AMK      | AMER AIR                       | 
    Aero Transporte                                                                  | AMP      | ATSA                           | 
    Aeroméxico                                                                       | AMX      | AEROMEXICO                     | 
    Aircraft Management and Consulting                                               | AMQ      | AMEX                           | 
    Ameriflight                                                                      | AMF      | AMFLIGHT                       | 
    Aeroputul International Marculesti                                               | AMM      | AEROM                          | 
    Aerotransportacion de Norteamerica                                               | ANM      | NORAM                          | 
    Antares Airtransport                                                             | ANM      | ANTARES                        | ICAO Code now allocated to another user
    Airnorth                                                                         | ANO      | TOPEND                         | 
    Aerolínea de Antioquia                                                           | ANQ      | ANTIOQUIA                      | 
    Andes Líneas Aéreas                                                              | ANS      | AEROANDES                      | 
    Alajnihah for Air Transport                                                      | ANH      | ALAJNIHAH                      | 
    Alcon Air Services                                                               | AOA      | ALCON                          | 
    Avia Jaynar                                                                      | SAP      | TOBOL                          | 
    Amiya Airline                                                                    | AMZ      | AMIYA AIR                      | 
    AVCOM                                                                            | AOC      | AERO AVCOM                     | 
    Aerolínea Muri                                                                   | MUR      | MURI                           | 
    AeroBratsk                                                                       | BRP      | AEROBRA                        | 
    Aeronord-Grup                                                                    | NRP      | AERONORD                       | 
    Aero Vodochody                                                                   | AOD      | AERO CZECH                     | 
    Aero Entreprise                                                                  | AON      | AERO ENTERPRISE                | 
    As, Opened Joint Stock                                                           | AOO      | COMPANY AS                     | 
    Aeroenlaces Nacionales                                                           | VIV      | AEROENLACES                    | Former ICAO code: AEN
    Aeromundo Ejecutivo                                                              | MUN      | AEROMUNDO                      | 
    Atair Pty                                                                        | AOF      | ATAIR                          | 
    Almaver                                                                          | VER      | ALMAVER                        | 
    Aerovis Airlines                                                                 | VIZ      | AEROVIZ                        | 
    Aeropiloto                                                                       | AOP      | AEROPILOTO                     | 
    Alitalia Express                                                                 | SMX      | ALIEXPRESS                     | 
    Asia Overnight Express                                                           | AOT      | ASIA OVERNIGHT                 | 
    Aerovista Gulf Express                                                           | VGF      | VISTA GULF                     | 
    Aerotaxi Del Valle                                                               | AOX      | AEROVALLE                      | 
    Aero Vision                                                                      | AOV      | AEROVISION                     | 
    Afro International                                                               | AOR      | INTER-AFRO                     | 
    Airpac Airlines                                                                  | APC      | AIRPAC                         | 
    ASA Pesada                                                                       | API      | ASA PESADA                     | 
    Amapola Flyg AB                                                                  | APF      | AMAPOLA                        | 
    Aero Servicios Empresariales                                                     | EMS      | SERVIEMPRESARIAL               | 
    Aeroservicios Monterrey                                                          | SVM      | SERVIMONTE                     | 
    Peach Aviation                                                                   | APJ      | AIR PEACH                      | 
    Alpha Aviation                                                                   | APH      | AIRFLIGHT                      | 
    ACM Aviation                                                                     | BJT      | BAY JET                        | 
    Aerolíneas Pacífico Atlántico                                                    | APP      | AEROPERLAS                     | 
    Aerotransporte Petrolero                                                         | PET      | AEROPETRO                      | 
    Airpac                                                                           | APM      | ALASKA PACIFIC                 | 
    Aspen Aviation                                                                   | APQ      | ASPEN BASE                     | 
    APA Internacional                                                                | APY      | APA INTERNACIONAL              | 
    Apex Air Cargo                                                                   | APX      | PARCEL EXPRESS                 | 
    Aeropuma                                                                         | APU      | AEROPUMA                       | 
    Appalachian Flying Service                                                       | APL      | APPALACHIAN                    | 
    Aluminum Of America                                                              | AQO      | ALCOA SHUTTLE                  | Alcoa Aircraft Operations
    Aviones de Renta de Quintana Roo                                                 | AQT      | AVIOQUINTANA                   | 
    Aquila Air                                                                       | AQL      | AQUILA                         | 
    Air Barcol                                                                       | BKL      | BARCOL                         | 
    Arik Air                                                                         | ARA      | ARIK AIR                       | 
    Aires, Aerovías de Integración Regional                                          | ARE      | AIRES                          | renamed to LAN Colombia
    Aeroatlas                                                                        | AQA      | ATCO                           | 
    Aerolíneas Argentinas                                                            | ARG      | ARGENTINA                      | 
    Aerodyne Charter                                                                 | AQZ      | QUANZA                         | 
    Avia Air N.V.                                                                    | ARB      | AVIAIR                         | 
    Albawings                                                                        | AWT      | ALBAWINGS                      | 
    Arrowhead Airways                                                                | ARH      | ARROWHEAD                      | 
    Airlec - Air Aquitaine Transport                                                 | ARL      | AIRLEC                         | 
    Aeroservicios De San Luis                                                        | SUO      | SERVICIO SANLUIS               | 
    Air Klaipėda                                                                     | KLD      | AIR KLAIPEDA                   | 
    Aero Vics                                                                        | ARI      | AEROVICS                       | 
    Aerotal Aerolíneas Territoriales de Colombia                                     | ART      | AEROTAL                        | 
    Armstrong Air                                                                    | ARQ      | ARMSTRONG                      | 
    Aeromet Servicios                                                                | ARS      | METSERVICE                     | 
    Aero Link Air Services                                                           | ARK      | LINK SERVICE                   | 
    Aerolíneas de Techuacán                                                          | HUC      | LINEAS TEHUACAN                | 
    Aerosuper                                                                        | SUP      | AEROSUPER                      | 
    Aria                                                                             | ARW      | ARIABIRD                       | 
    Airline Alania                                                                   | OST      | ALANIA                         | 
    Argosy Airways                                                                   | ARY      | GOSEY                          | 
    Aerotransportes Huitzilin                                                        | HUT      | AEROHUITZILIN                  | 
    Aravco                                                                           | ARV      | ARAVCO                         | 
    Alaska Airlines                                                                  | ASA      | ALASKA                         | 
    Air Schefferville                                                                | ASF      | SCHEFF                         | 
    African Star Airways                                                             | ASG      | AFRICAN STAR                   | 
    Aero Slovakia                                                                    | ASO      | AERO NITRA                     | 
    Aero Transportes Del Humaya                                                      | HUY      | AERO HUMAYA                    | 
    Aerolíneas Del Oeste                                                             | AST      | AEROESTE                       | 
    Airsprint                                                                        | ASP      | AIRSPRINT                      | 
    All Star Airlines                                                                | ASR      | ALL STAR                       | 
    Aviones Are                                                                      | NRE      | AVIONES ARE                    | 
    Arrow Panama                                                                     | WAP      | ARROW PANAMA                   | 
    Awesome Flight Services                                                          | ASM      | AWESOME                        | 
    Atlantair                                                                        | ATB      | STARLITE                       | 
    Aerotours Dominicana                                                             | ATD      | AEROTOURS                      | 
    Aerotranscargo                                                                   | ATG      | MOLDCARGO                      | 
    Atlantis Transportation Services                                                 | ATE      | ATLANTIS CANADA                | 
    Air Corporate                                                                    | CPV      | AIRCORPORATE                   | 
    Aerosun International                                                            | ASI      | AEROSUN                        | 
    ASTRAL Colombia - Aerotransportes Especiales                                     | ATP      | ASTRAL                         | 
    Airlines of Tasmania                                                             | ATM      | AIRTAS                         | 
    Astravia-Bissau Air Transports                                                   | ASV      | ASTRAVIA                       | 
    Aero Taxis Y Servicios Alfe                                                      | FES      | AERO ALFE                      | 
    Avialesookhrana                                                                  | FFA      | AVIALESOOKHRANA                | 
    Atlas Airlines                                                                   | ATR      | ATLAS-AIR                      | 
    Aeroferinco                                                                      | FEO      | FERINCO                        | 
    Africair Service                                                                 | FFB      | FOXTROT FOXTROT                | 
    AirBridge Cargo                                                                  | ABW      | AIRBRIDGE CARGO                | Former IATA: BO
    Avanti Air                                                                       | ATV      | AVANTI AIR                     | 
    ATESA Aerotaxis Ecuatorianos                                                     | TXU      | ATESA                          | 
    Atlant Aerobatics                                                                | ATU      | ATLANT HUNGARY                 | 
    Augusta Air Luftfahrtunternehmen                                                 | AUF      | AUGUSTA                        | 
    Abu Dhabi Amiri Flight                                                           | AUH      | SULTAN                         | Presidential flight
    Audi Air                                                                         | AUD      | AUDI AIR                       | 
    Austrian Airlines                                                                | AUA      | AUSTRIAN                       | 
    Aero Servicios Expecializados                                                    | SVE      | AEROESPECIAL                   | 
    Aurigny Air Services                                                             | AUR      | AYLINE                         | 
    Austral Líneas Aéreas                                                            | AUT      | AUSTRAL                        | 
    Australian Airlines                                                              | AUZ      | AUSTRALIAN                     | Subsidiary merged with Qantas
    Aviones Unidos                                                                   | AUN      | AVIONES UNIDOS                 | 
    Aerolíneas Uruguayas                                                             | AUY      | AUSA                           | 
    Avianca Argentina                                                                | MCJ      | JETMAC                         | Owned by Synergy Group
    Avianca Brazil                                                                   | ONE      | OCEAN AIR                      | Owned by Synergy Group
    Aviastar-Tu                                                                      | TUP      | TUPOLEVAIR                     | 
    Aviation Beauport                                                                | AVB      | BEAUPAIR                       | 
    Avianca                                                                          | AVA      | AVIANCA                        | 
    Aviair Aviation                                                                  | AVF      | CARIBOO                        | 
    Aviación Ejecutiva Mexicana                                                      | AVM      | AVEMEX                         | 
    AV8 Helicopters                                                                  | AVK      | AVIATE-COPTER                  | 
    AV8 Helicopters                                                                  | AVH      | KENT HELI                      | 
    Aviacion Corporativa de Peubla                                                   | AVP      | AVIA PUEBLA                    | 
    Air Atlantic Uruguay                                                             | AUM      | ATLAMUR                        | 
    Avia Traffic                                                                     | AVJ      | ATOMIC                         | 
    Aviation at Work                                                                 | AVO      | AVIATION WORK                  | 
    Atlantic Airfreight Aviation                                                     | LFR      | LANFREIGHT                     | 
    Avia Sud Aérotaxi                                                                | AVU      | AVIASUD                        | 
    Alfa Aerospace                                                                   | LFP      | ALFA-SPACE                     | 
    Avialsa T-35                                                                     | AVS      | AVIALSA                        | 
    Aviation Services                                                                | AVQ      | AQUILINE                       | 
    Aviator Airways                                                                  | AVW      | AVIATOR                        | 
    Airvantage                                                                       | AVV      | AIRVANTAGE                     | 
    Airbus Transport International                                                   | BGA      | BELUGA                         | 
    Active Aero Charter                                                              | AVR      | ACTIVE AERO                    | 
    Aero BG                                                                          | BGG      | AERO BG                        | 
    Aerotaxis De La Bahia                                                            | BHC      | BAHIA                          | 
    Aviaservice                                                                      | BIV      | AVIASERVICE                    | 
    Aviodetachment-28                                                                | BGF      | BULGARIAN                      | 
    Aerovaradero                                                                     | AVY      | AEROVARADERO                   | 
    Airwork                                                                          | AWK      | AIRWORK                        | 
    Arctic Wings And Rotors                                                          | AWR      | ARCTIC WINGS                   | 
    Australian Wetleasing                                                            | AWL      | AUSSIEWORLD                    | 
    Arab Wings                                                                       | AWS      | ARAB WINGS                     | 
    Airwave Transport                                                                | AWV      | AIRWAVE                        | 
    Asian Express Airlines                                                           | AXF      | FREIGHTEXPRESS                 | 
    Aeromexhaga                                                                      | AXH      | AEROMEXHAGA                    | 
    Airways International                                                            | AWB      | AIRNAT                         | 
    African Express Airways                                                          | AXK      | EXPRESS JET                    | Former IATA code: QA; former ICAO code: AEK; former callsign: AFRICAN EXPRESS
    Aeron International Airlines                                                     | AXI      | AIR FREIGHTER                  | 
    Auo Airclub AIST-M                                                               | ISM      | STORK                          | 
    AirAsia India                                                                    | IAD      | ARIYA                          | Founded 28. Mar 2013
    AirAsia Japan                                                                    | WAJ      | WING ASIA                      | 
    Aeromax                                                                          | AXP      | AEROMAX SPAIN                  | 
    Awood Air                                                                        | AWO      | AWOOD AIR                      | 
    Aerolíneas Bonanza                                                               | BNZ      | AERO BONANZA                   | 
    Aerobona                                                                         | BOC      | AEROBONA                       | 
    Alberni Airways                                                                  | BNI      | ALBERNI                        | 
    Aboitiz Air                                                                      | BOI      | ABAIR                          | renamed to 2GO
    Aeroway                                                                          | AWY      | AEROWEE                        | 
    Altus Airlines                                                                   | AXS      | ALTUS                          | 
    Action Airlines                                                                  | AXQ      | ACTION AIR                     | 
    AirAsia X                                                                        | XAX      | XANADU                         | 
    Atlantic Airlines                                                                | NPT      | NEPTUNE                        | 
    Atlantic Airlines                                                                | GBN      | ATLANTIC GABON                 | 
    Airman                                                                           | AYM      | AIRMAN                         | 
    Atlantic Airlines                                                                | BJK      | BLACKJACK                      | 
    Axel Rent                                                                        | AXR      | RENTAXEL                       | 
    Atlantic Airlines                                                                | AYN      | ATLANTIC NICARAGUA             | 
    Aviaxess                                                                         | AXV      | AXAVIA                         | 
    Arcus-Air Logistic                                                               | AZE      | ARCUS AIR                      | 
    Astra Airlines                                                                   | AZI      | ASTRA                          | 
    Ayeet Aviation & Tourism                                                         | AYT      | AYEET                          | 
    Azalhelikopter                                                                   | AZK      | AZALHELICOPTER                 | 
    Aerocozumel                                                                      | AZM      | AEROCOZUMEL                    | 
    Alitalia                                                                         | AZA      | ALITALIA                       | 
    Azimut                                                                           | AZT      | AZIMUT                         | 
    Arizona Pacific Airways                                                          | AZP      | ARIZONA PACIFIC                | 
    Aviacon Zitotrans Air                                                            | AZS      | ZITOTRANS                      | 
    Arizona Airways                                                                  | AZY      | ARIZAIR                        | 
    Aero Jomacha                                                                     | MHC      | AERO JOMACHA                   | 
    Air Continental Inc                                                              | NAR      | NIGHT AIR                      | 
    Aerobanana                                                                       | OBA      | AEROBANANA                     | 
    Antanik-Air                                                                      | NAU      | ANTANIK                        | 
    Air Newark                                                                       | NER      | NEWAIR                         | 
    Angel Flight America                                                             | NGF      | ANGEL FLIGHT                   | Renamed Air Charity Network in 2014
    Azza Transport                                                                   | AZZ      | AZZA TRANSPORT                 | 
    Aserca Airlines                                                                  | OCA      | AROSCA                         | 
    Aero Nova                                                                        | OVA      | AERONOVA                       | 
    Amako Airlines                                                                   | OBK      | AMAKO AIR                      | 
    Amira Air                                                                        | XPE      | EXPERT                         | 
    Angoservice                                                                      | NGC      | ANGOSERVICE                    | 
    Aero Servicios                                                                   | RVI      | AERO SERVICIOS                 | 
    Aero Express Intercontinental                                                    | XSS      | INTER EXPRESS                  | 
    Aerovías Ejecutivas                                                              | OVI      | VIAS EJECUTIVAS                | 
    Aero Servicio Pity                                                               | PTD      | PITY                           | 
    Air Libya Tibesti                                                                | TLR      | AIR LIBYA                      | 
    Air Pal                                                                          | PLL      | AIRPAL                         | Escuela De Pilots
    Air Pullmantur                                                                   | PLM      | PULLMANTUR                     | 
    Aero Copter                                                                      | PTE      | AERO-COP                       | 
    Airvallee                                                                        | RVL      | AIR VALLEE                     | 
    Airventure                                                                       | RVE      | AIRVENTURE                     | 
    Aviones Para Servirle                                                            | PSG      | SERVIAVIONES                   | 
    Air Scorpio                                                                      | SCU      | SCORPIO UNIVERS                | 
    Aviateca                                                                         | GUG      | AVIATECA                       | 
    Aeromover                                                                        | OVE      | AEROMOVER                      | 
    Avio Sluzba                                                                      | SLU      | AVIO SLUZBA                    | 
    Aroostook Aviation                                                               | PXX      | PINE STATE                     | 
    Air Spirit                                                                       | SIP      | AIR SPIRIT                     | 
    Aero Services                                                                    | BAS      | AEROSERV                       | 
    Ababeel Aviation                                                                 | BBE      | BABEL AIR                      | 
    Aeropuelche                                                                      | PUE      | PUELCHE                        | 
    Alatau Airlines                                                                  | BMV      | OLIGA                          | 
    Aero Costa Taxi Aéreo                                                            | XCT      | AEROCOSTAXI                    | 
    African Transport Trading and Investment                                         | ETC      | TRANATTICO                     | 
    Aerovitro                                                                        | VRO      | AEROVITRO                      | 
    Aerotaxi Villa Rica                                                              | VRI      | VILLARICA                      | 
    AD Aviation                                                                      | VUE      | FLIGHTVUE                      | 
    Aerolíneas Villaverde                                                            | VLR      | VILLAVERDE                     | 
    Ambulance Air Africa                                                             | MCY      | MERCY                          | 
    Aeropycsa                                                                        | PYC      | AEROPYCSA                      | 
    Aero Industries Inc                                                              | WAB      | WABASH                         | 
    Aero Ejecutivos                                                                  | VEJ      | VENEJECUTIV                    | 
    Aerovilla                                                                        | VVG      | AEROVILLA                      | 
    Aero Air                                                                         | WIL      | WILLIAMETTE                    | 
    Aero Servicios Vanguardia                                                        | VNG      | VANGUARDIA                     | 
    Aero Taxi Los Valles                                                             | VAD      | VALLES                         | 
    Aerovega                                                                         | VEG      | AEROVEGA                       | 
    Air Excel                                                                        | XLL      | TINGA-TINGA                    | 
    Aerovuelox                                                                       | VUO      | AEROVUELOX                     | 
    Aero Virel                                                                       | VLS      | VIREL                          | 
    Air Evans                                                                        | VAE      | AIR-EVANS                      | Ecuela de Pilotos Privados
    Air Botswana                                                                     | BOT      | BOTSWANA                       | 
    Air Sorel                                                                        | WHY      | AIR SOREL                      | 
    Aeronaves TSM                                                                    | VTM      | AERONAVES TSM                  | 
    Air Net Private Charter                                                          | WDR      | WIND RIDER                     | 
    Air VIA                                                                          | VIM      | CRYSTAL                        | 
    Air Tahiti                                                                       | VTA      | AIR TAHITI                     | 
    Air Walser                                                                       | WLR      | AIRWALSER                      | 
    Air Urga                                                                         | URG      | URGA                           | 
    Airways Corporation of New Zealand                                               | XFX      | AIRCORP                        | 
    Airwaves Airlink                                                                 | WLA      | AIRLIMITED                     | 
    Airwings oy                                                                      | WGS      | AIRWINGS                       | 
    Air Rosavia                                                                      | URA      | ROSAVIA                        | 
    Air Midwest                                                                      | VTY      | VICTORY                        | 
    Airways                                                                          | WAY      | GARONNE                        | 
    Austro Aéreo                                                                     | UST      | AUSTRO AEREO                   | 
    Auckland Regional Rescue Helicopter Trust                                        | WPR      | WESTPAC RESCUE                 | 
    Airkenya                                                                         | XAK      | SUNEXPRESS                     | 
    Aviación Comercial de América                                                    | VME      | AVIAMERICA                     | 
    Avialift Vladivostok                                                             | VLV      | VLADLIFT                       | 
    ARP 410 Airlines                                                                 | URP      | AIR-ARP                        | 
    Air-Lift Associates                                                              | WPK      | WOLFPACK                       | 
    Aviation Partners                                                                | WLT      | WINGLET                        | 
    Aviation North                                                                   | WLV      | WOLVERINE                      | 
    Africa West                                                                      | WTA      | WEST TOGO                      | 
    Aviaexpress Air                                                                  | VXX      | EXPRESSAVIA                    | 
    Airlines 400                                                                     | VAZ      | REMONT AIR                     | 
    Aviazur                                                                          | VZR      | IAZUR                          | 
    Avient Air Zambia                                                                | VNT      | AVIENT                         | 
    Ameravia                                                                         | VAM      | AMERAVIA                       | 
    AVB-2004                                                                         | VBC      | AIR VICTOR                     | 
    Angkor Air                                                                       | KHV      | AIR ANGKOR                     | 
    Avirex                                                                           | VXG      | AVIREX-GABON                   | 
    AMR Services Corporation                                                         | XAM      | ALLIANCE                       | 
    ATRAN Cargo Airlines                                                             | VAS      | ATRAN                          | 
    Avalair                                                                          | VAI      | AIR AVALAIR                    | 
    Aviaprom Enterprises                                                             | XAV      | AVIAPROM                       | 
    Aviação Transportes Aéreos e Cargas                                              | VTG      | ATACARGO                       | 
    Australian air Express                                                           | XME      | AUS-CARGO                      | 
    Avstar Aviation                                                                  | VSA      | STARBIRD                       | 
    Air China Cargo                                                                  | CAO      | AIRCHINA FREIGHT               | 
    Aerovías Caribe                                                                  | CBE      | AEROCARIBE                     | 
    Air Caraibes Atlantique                                                          | CAJ      | CAR LINE                       | 
    Averitt Air Charter                                                              | VRT      | AVERITT                        | 
    Avia Trans Air Transport                                                         | VTT      | VIATRANSPORT                   | 
    Aerotaxi del Cabo                                                                | CBO      | TAXI CABO                      | 
    Air Columbus                                                                     | CBS      | AIR COLUMBUS                   | 
    Aereo Cabo                                                                       | CBV      | CABOAEREO                      | 
    Aviostart AS                                                                     | VSR      | AVIOSTART                      | 
    Air China                                                                        | CCA      | AIR CHINA                      | 
    Aero Condor Peru                                                                 | CDP      | CONDOR-PERU                    | 
    Aerocardal                                                                       | CDA      | CARDAL                         | 
    Airline Skol                                                                     | CDV      | SKOL                           | 
    Air Cargo Belize                                                                 | CGB      | CARGO BELIZE                   | 
    Aerofan                                                                          | CFF      | AEROFAN                        | 
    Aero Calafia                                                                     | CFV      | CALAFIA                        | 
    Air Charter Services                                                             | CHR      | ZAIRE CHARTER                  | 
    Arctic Circle Air Service                                                        | CIR      | AIR ARCTIC                     | 
    Aviation Charter Services                                                        | CKL      | CIRCLE CITY                    | 
    Aerovías Castillo                                                                | CLL      | AEROCASTILLO                   | 
    Air Chaika                                                                       | CHJ      | AIR CHAIKA                     | 
    Air Charter Professionals                                                        | CHV      | CHARTAIR                       | 
    Aero Club De Portugal                                                            | CLP      | CLUB PORTUGAL                  | 
    Air Care Alliance                                                                | CMF      | COMPASSION                     | 
    Air Toronto                                                                      | CNE      | CONNECTOR                      | 
    Air Consul                                                                       | CNU      | AIR CONSUL                     | 
    Air Creebec                                                                      | CRQ      | CREE                           | 
    Air Cruzal                                                                       | CRJ      | AIR CRUZAL                     | 
    Aquila Air                                                                       | CNH      | CHENANGO                       | 
    Aerolíneas Centauro                                                              | CTR      | CENTAURO                       | 
    Aero Clube Do Algarve                                                            | CGV      | CLUBE ALGARVE                  | 
    Aero Charter and Transport                                                       | CTA      | CHAR-TRAN                      | 
    Aerocuahonte                                                                     | CUO      | CUAHONTE                       | 
    Air Marshall Islands                                                             | CWM      | AIR MARSHALLS                  | 
    Air Chathams                                                                     | CVA      | CHATHAM                        | 
    Aerotransportes Corporativos                                                     | CRP      | AEROTRANSCORP                  | 
    Air Tenglong                                                                     | CTE      | TENGLONG                       | 
    Aerocheyenne                                                                     | CYE      | AEROCHEYENNE                   | 
    Aerovías DAP                                                                     | DAP      | DAP                            | 
    Australian Customs Service                                                       | CWP      | COASTWATCH                     | 
    Air One Cityliner                                                                | CYL      | CITYLINER                      | 
    Air Niagara Express                                                              | DBD      | AIR NIAGARA                    | 
    Air Alpha                                                                        | DBA      | DOUBLE-A                       | 
    Aerodin                                                                          | DIN      | AERODIN                        | 
    Aviation Defense Service                                                         | DEF      | TIRPA                          | 
    Air Algérie                                                                      | DAH      | AIR ALGERIE                    | 
    Air Dolomiti                                                                     | DLA      | DOLOMITI                       | 
    Air Transport                                                                    | CYO      | COYOTE                         | 
    Aeroservicios Dinamicos                                                          | DMI      | AERODINAMICO                   | 
    Aerodynamics Málaga                                                              | DNC      | FLYINGOLIVE                    | 
    Aerodynamics                                                                     | DNJ      | DYNAJET                        | 
    Aerodinamica de Monterrey                                                        | DMC      | DINAMICAMONT                   | 
    Aero Modelo                                                                      | DLS      | AEROMODELO                     | 
    Airways Flight Training                                                          | DRM      | DARTMOOR                       | 
    Aex Air                                                                          | DST      | DESERT                         | 
    Aeronaves Del Noreste                                                            | DRO      | AERONORESTE                    | 
    Addis Air Cargo Services                                                         | DSC      | ADDIS CARGO                    | 
    Aeromedica                                                                       | DIC      | AEROMEDICA                     | 
    Aerodespachos de El Salvador                                                     | DNA      | AERODESPACHOS                  | 
    Air Transport                                                                    | EAT      | TRANS EUROPE                   | 
    Aero-Pyrenees                                                                    | EAP      | AERO-PYRENEES                  | 
    Air City                                                                         | ECE      | AIRCITY                        | 
    Aero Davinci International                                                       | DVI      | AERO DAVINCI                   | 
    Aeronáutica Castellana                                                           | ECL      | AERO CASTELLANA                | 
    Aero Ejecutivo De Baja California                                                | EBC      | CALIXJET                       | 
    Aerolíneas Comerciales                                                           | ECM      | AERO COMERCIALES               | 
    Aero Dynamics                                                                    | DYN      | AERO DYNAMIC                   | 
    Aero Ejecutivos RCG                                                              | ECG      | EJECTUIVOS RCG                 | 
    Air Este                                                                         | EET      | AESTE                          | 
    Arrendadora y Transportadora Aérea                                               | END      | ARRENDADORA                    | 
    Aeroservicios Ecuatorianos                                                       | EAE      | AECA                           | 
    Air Mana                                                                         | EFC      | FLIGHT TAXI                    | 
    Aeronaves Del Noroeste                                                           | ENW      | AERONOR                        | 
    Aero Ermes                                                                       | EOM      | AERO ERMES                     | 
    Aero Servicios Regiomontanos                                                     | ERI      | ASERGIO                        | 
    Aero Transportes Empresariales                                                   | EPL      | EMPRESARIALES                  | 
    Aeroservicios Ejecutivos Corporativos                                            | EJP      | EJECCORPORATIVOS               | 
    Aeromaan                                                                         | ERM      | EOMAAN                         | 
    Aereosaba                                                                        | ESB      | AEREOSABA                      | 
    Aerolíneas Ejecutivas Del Sureste                                                | ESU      | ALESUR                         | 
    Aero Empresarial                                                                 | EPE      | AEROEMPRESARIAL                | 
    Aeronáutica La Esperanza                                                         | ESZ      | ESPERANZA                      | 
    Airailes                                                                         | EOL      | EOLE                           | 
    Air Evex                                                                         | EVE      | SUNBEAM                        | 
    Aerosec                                                                          | ERK      | AEROSEC                        | 
    Aeronautical Academy of Europe                                                   | EVR      | DIANA                          | 
    Atlantic Helicopters                                                             | FAC      | FAROECOPTER                    | 
    Argentine Air Force                                                              | FAG      | FUAER                          | 
    Air Exchange                                                                     | EXG      | EXCHANGE                       | 
    Air Carriers                                                                     | FCI      | FAST CHECK                     | 
    Aero Siete                                                                       | ETE      | AEROSIETE                      | 
    African Medical and Research Foundation                                          | FDS      | FLYDOC                         | 
    AF-Air International                                                             | FAN      | FANBIRD                        | 
    African Airlines                                                                 | FDA      | AIR SANKORE                    | 
    Aerosafin                                                                        | FIC      | AEROSAFIN                      | 
    Airfix Aviation                                                                  | FIX      | AIRFIX                         | 
    Air Finland                                                                      | FIF      | AIR FINLAND                    | 
    Aero Leasing                                                                     | FLZ      | AIR FLORIDA                    | dba Air Florida
    Fiji Airways                                                                     | FJI      | PACIFIC                        | 
    Aero Freight                                                                     | FGT      | FREIAERO                       | 
    Atlantic Airways                                                                 | FLI      | FAROELINE                      | 
    Afrika Aviation Handlers                                                         | FRK      | AFRIFAST                       | 
    Aerofrisco                                                                       | FCO      | AEROFRISCO                     | 
    African Airlines                                                                 | FPY      | AFRICOMPANY                    | 
    Aeroflota Del Noroeste                                                           | FNO      | RIAZOR                         | 
    Afrique Chart'air                                                                | FRQ      | CHARTER AFRIQUE                | 
    Air Affaires Tchad                                                               | FTC      | AFFAIRES TCHAD                 | 
    Afrijet Airlines                                                                 | FRJ      | AFRIJET                        | 
    Air Iceland                                                                      | FXI      | FAXI                           | 
    Aeronor                                                                          | GCF      | AEROCARTO                      | 
    Aerovías del Golfo                                                               | GFO      | AEROVIAS GOLFO                 | 
    Aero Business Charter                                                            | GBJ      | GLOBAL JET                     | 
    Aeronáutica                                                                      | GGL      | GIRA GLOBO                     | 
    Aviance                                                                          | GHL      | HANDLING                       | Gatwick Handling
    ABC Bedarfsflug                                                                  | FTY      | FLY TYROL                      | 
    Air Philippines                                                                  | GAP      | ORIENT PACIFIC                 | 
    African International Transport                                                  | GIL      | AFRICAN TRANSPORT              | 
    Africa Airlines                                                                  | GIZ      | AFRILENS                       | 
    Air Gemini                                                                       | GLL      | TWINS                          | 
    Air Georgian                                                                     | GGN      | GEORGIAN                       | 
    Air Guinee Express                                                               | GIP      | FUTURE EXPRESS                 | 
    Aerogaucho                                                                       | GAU      | AEROGAUCHO                     | 
    Aero Charter                                                                     | GLT      | GASLIGHT                       | 
    Air Ghana                                                                        | GHN      | AIR GHANA                      | 
    Aeroservicios Gama                                                               | GMS      | SERVICIOS GAMA                 | 
    Alberta Government                                                               | GOA      | ALBERTA                        | 
    Air Scotland                                                                     | GRE      | GREECE AIRWAYS                 | 
    Aerotaxis Guamuchil                                                              | GMM      | AEROGUAMUCHIL                  | 
    Agroar - Trabalhos Aéreos                                                        | GRR      | AGROAR                         | 
    Aguilas Mayas Internacional                                                      | GME      | MAYAN EAGLES                   | 
    Air Georgia                                                                      | GRG      | AIR GEORGIA                    | 
    Air Grodno                                                                       | GRX      | GRODNO                         | 
    Amber Air                                                                        | GNT      | GINTA                          | 
    AirSwift                                                                         | ITI      | AIRSWIFT                       | 
    Airlift Alaska                                                                   | GSP      | GREEN SPEED                    | 
    Air Greenland                                                                    | GRL      | GREENLAND                      | 
    Atlas Air                                                                        | GTI      | GIANT                          | 
    Agrocentr-Avia                                                                   | GSV      | AGRAV                          | 
    Altin Havayolu Tasimaciligi Turizm Ve Ticaret                                    | GTC      | GOLDEN WINGS                   | 
    Aerotaxi Grupo Tampico                                                           | GTP      | GRUPOTAMPICO                   | 
    Air d'Ayiti                                                                      | HAD      | HAITI AVIA                     | 
    Air Guyane                                                                       | GUY      | GREEN BIRD                     | 
    Air Taxi                                                                         | HAT      | TAXI BIRD                      | 
    Aerohein                                                                         | HEI      | AEROHEIN                       | 
    Aviación Ejecutiva De Hildago                                                    | HID      | EJECUTIVA HIDALGO              | 
    Air Victoria Georgia                                                             | GVI      | IRINA                          | 
    Aerotaxis de Aguascalientes                                                      | GUA      | AGUASCALIENTES                 | 
    Air Haiti                                                                        | HJA      | AIRHAITI                       | 
    Al Rais Cargo                                                                    | HJT      | AL-RAIS CARGO                  | 
    Air-Invest                                                                       | HKH      | HAWKHUNGARY                    | 
    Airlink Airways                                                                  | HYR      | HIGHFLYER                      | 
    Atlantic Air Lift                                                                | HGH      | HIGHER                         | 
    Air Comores International                                                        | HAH      | AIR COMORES                    | 
    Air Lift                                                                         | IFI      | HELLAS LIFT                    | 
    Aero Survey                                                                      | IKM      | EASY SHUTTLE                   | Callsign changed from GHANA SURVEY
    Aero Airline                                                                     | ILK      | ILEK                           | 
    Aero Homex                                                                       | HOM      | AERO HOMEX                     | 
    Air Inter Cameroun                                                               | ICM      | INTER-CAMEROUN                 | 
    Air Horizon                                                                      | HZT      | HORIZON TOGO                   | 
    Almiron Aviation                                                                 | HPO      | ALMIRON                        | 
    Airpull Aviation                                                                 | IPL      | IPULL                          | 
    Aeroservicios Intergrados de Norte                                               | INO      | INTENOR                        | 
    Aerotaxis Cimarron                                                               | IMN      | TAXI CIMARRON                  | 
    Arvand Airlines                                                                  | IRD      | ARVAND                         | 
    Aram Airline                                                                     | IRW      | ARAM                           | 
    Avita-Servicos Aéreos                                                            | ITF      | AIR AVITA                      | 
    Atlas Aviation Group                                                             | IRH      | ATLAS AVIA                     | 
    Aero Citro                                                                       | ITO      | AERO CITRO                     | 
    Aria Tour                                                                        | IRX      | ARIA                           | 
    Aero Internacional                                                               | INA      | AERO-NACIONAL                  | 
    Air Executive                                                                    | IVE      | COMPANY EXEC                   | 
    Aerotaxi S.R.O.                                                                  | ITE      | AEROTAXI                       | 
    Aerojal                                                                          | JAD      | AEROJAL                        | 
    Ambjek Air Services                                                              | JEE      | AMBJEK AIR                     | 
    Airlink                                                                          | JAR      | AIRLINK                        | 
    Air Jamaica Express                                                              | JMX      | JAMAICA EXPRESS                | 
    Air Bagan                                                                        | JAB      | AIR BAGAN                      | 
    Aerojobeni                                                                       | JOB      | JOBENI                         | 
    Atyrau Air Ways                                                                  | JOL      | EDIL                           | 
    Arrendamiento de Aviones Jets                                                    | JTS      | AVIONESJETS                    | 
    Aero Juarez                                                                      | JUA      | JUAREZ                         | 
    Alexandair                                                                       | JMR      | ALEXANDAIR                     | 
    Air Kufra                                                                        | KAV      | AIRKUFRA                       | 
    Aero Charter Krifka                                                              | KFK      | KRIFKA AIR                     | 
    Air Canada Jazz                                                                  | JZA      | JAZZ                           | 
    Air Mach                                                                         | KAM      | ICO-AIR                        | 
    Air Kraft Mir                                                                    | KFT      | AIR KRAFT MIR                  | 
    Afit                                                                             | KIE      | TWEETY                         | 
    Air Concorde                                                                     | KGD      | CONCORDE AIR                   | 
    Air Kirovograd                                                                   | KAD      | AIR KIROVOGRAD                 | 
    Air South                                                                        | KKB      | KHAKI BLUE                     | 
    Air Mali International                                                           | KLB      | TRANS MALI                     | 
    Atlasjet                                                                         | KKK      | ATLASJET                       | 
    Air Koryo                                                                        | KOR      | AIR KORYO                      | 
    Aerokaluz                                                                        | KLZ      | AEROKALUZ                      | 
    Aeronavigaciya                                                                   | KTN      | AERONAVIGACIYA                 | 
    Air Kissari                                                                      | KSI      | KISSARI                        | 
    Araiavia                                                                         | KOY      | ALEKS                          | 
    AeroSucre                                                                        | KRE      | AEROSUCRE                      | 
    Air Astana                                                                       | KZR      | ASTANALINE                     | 
    Av Atlantic                                                                      | KYC      | DOLPHIN                        | 
    Aviation Legacy                                                                  | LAG      | AVILEG                         | 
    Albanian Airlines                                                                | LBC      | ALBANIAN                       | 
    Aerolíneas Aéreas Ejecutivas De Durango                                          | LDG      | DURANGO                        | 
    Aerologic                                                                        | BOX      | GERMAN CARGO                   | 
    Alliance Avia                                                                    | KVR      | KAVAIR                         | 
    Albatros Airways                                                                 | LBW      | ALBANWAYS                      | 
    Aerolíneas Ejecutivas                                                            | LET      | MEXEJECUTIV                    | 
    Aero Lider                                                                       | LDR      | AEROLIDER                      | 
    Alidaunia                                                                        | LID      | ALIDA                          | 
    Aerolaguna                                                                       | LGN      | AEROLAGUNA                     | 
    Albisa                                                                           | LBI      | ALBISA                         | 
    Al Ahram Aviation                                                                | LHR      | AL AHRAM                       | 
    Al-Donas Airlines                                                                | LDN      | ALDONAS AIR                    | 
    Aerolima                                                                         | LMA      | AEROLIMA                       | 
    Air India Regional                                                               | LLR      | ALLIED                         | 
    Al-Dawood Air                                                                    | LIE      | AL-DAWOOD AIR                  | 
    Aerolíneas Mexicanas J S                                                         | LMX      | LINEAS MEXICANAS               | 
    Air Plus Argentina                                                               | LMP      | AIR FLIGHT                     | 
    Air Almaty                                                                       | LMY      | AGLEB                          | 
    Aerolane                                                                         | LNE      | AEROLANE                       | Líneas Aéreas Nacionales Del Ecuador
    Air Solutions                                                                    | LKY      | LUCKY                          | 
    Aerolíneas Internacionales                                                       | LNT      | LINEAINT                       | 
    Alok Air                                                                         | LOK      | ALOK AIR                       | 
    Air Saint Louis                                                                  | LOU      | AIR SAINTLOUIS                 | 
    Almaty Aviation                                                                  | LMT      | ALMATY                         | 
    Airlink                                                                          | LNK      | LINK                           | 
    Air Leap                                                                         | LPA      | LEAP                           | 
    Alrosa-Avia                                                                      | LRO      | ALROSA                         | 
    Air Almaty ZK                                                                    | LMZ      | ALUNK                          | 
    Airlink Solutions                                                                | LKS      | AIRLIN                         | 
    Alpine Aviation                                                                  | LPC      | NETSTAR                        | 
    Aurela                                                                           | LSK      | AURELA                         | 
    Al Rida Airways                                                                  | LRW      | AL RIDA                        | 
    Albinati Aeronautics                                                             | LUC      | ALBINATI                       | 
    Air Alps Aviation                                                                | LPV      | ALPAV                          | 
    Aviavilsa                                                                        | LVR      | AVIAVILSA                      | 
    Alsair                                                                           | LSR      | ALSAIR                         | 
    Apatas Air                                                                       | LYT      | APATAS                         | 
    Air Lazur                                                                        | LZR      | LAZUR BEE-GEE                  | 
    Aeródromo De La Mancha                                                           | MAM      | AEROMAN                        | 
    Air Mauritius                                                                    | MAU      | AIRMAURITIUS                   | 
    Air Luxor GB                                                                     | LXG      | LUXOR GOLF                     | 
    Air Ban                                                                          | LZP      | DOC AIR                        | 
    Avag Air                                                                         | MBA      | AVAG AIR                       | 
    Air Manas                                                                        | MBB      | AIR MANAS                      | 
    Air Medical                                                                      | MCD      | AIR MED                        | 
    Aerolíneas Marcos                                                                | MCO      | MARCOS                         | 
    Atlantic Aero and Mid-Atlantic Freight                                           | MDC      | NIGHT SHIP                     | 
    Airjet Exploracao Aerea de Carga                                                 | MBC      | MABECO                         | 
    Aliven                                                                           | LVN      | ALIVEN                         | 
    Air Mercia                                                                       | MCB      | WESTMID                        | 
    Aero McFly                                                                       | MFL      | MCFLY                          | 
    Asia Pacific Airlines                                                            | MGE      | MAGELLAN                       | 
    Aerosud Charter                                                                  | MDX      | MEDAIR                         | 
    Air Meridan                                                                      | MEF      | EMPENNAGE                      | 
    Aeromagar                                                                        | MGS      | AEROMAGAR                      | 
    Aerotaxis Latinoamericanos                                                       | LTI      | LATINO                         | 
    Air Madagascar                                                                   | MDG      | AIR MADAGASCAR                 | 
    Air Moldova                                                                      | MLD      | AIR MOLDOVA                    | 
    Aero Premier De Mexico                                                           | MIE      | AEROPREMIER                    | 
    Air Alsie                                                                        | MMD      | MERMAID                        | 
    AMP                                                                              | MMP      | AMP-INC                        | 
    Amal Airlines                                                                    | MLF      | AMAL                           | 
    Airmax                                                                           | MMX      | PERUMAX                        | 
    Aerolíneas Amanecer                                                              | MNE      | AEROAMANECER                   | 
    Aviation Meridian                                                                | MMM      | AVIAMERIDIAN                   | 
    Aermarche                                                                        | MMC      | AERMARCHE                      | 
    Aerolíneas De Morelia                                                            | MOR      | AEROMORELIA                    | 
    Air Monarch Cargo                                                                | MOC      | MONARCH CARGO                  | 
    Aero Mongolia                                                                    | MNG      | AERO MONGOLIA                  | 
    Air Plus Comet                                                                   | MPD      | RED COMET                      | 
    Air Madeleine                                                                    | MLN      | AIR MADELEINE                  | 
    Aeropublicitaria De Angola                                                       | MOP      | PUBLICITARIA                   | 
    Aeromexpress                                                                     | MPX      | AEROMEXPRESS                   | 
    Aeromorelos                                                                      | MRL      | AEROMORELOS                    | 
    Air ITM                                                                          | MQT      | MUSKETEER                      | 
    Aerocharter                                                                      | MRM      | MARITIME                       | 
    Aerolíneas Mesoamericanas                                                        | MSO      | MESO AMERICANAS                | 
    Air Mauritanie                                                                   | MRT      | MIKE ROMEO                     | 
    Aeromas                                                                          | MSM      | AEROMAS EXPRESS                | 
    Air Sport                                                                        | MSK      | AIR SPORT                      | 
    Abas                                                                             | MRP      | ABAS                           | 
    Aero-Kamov                                                                       | MSV      | AERAFKAM                       | 
    Aerotaxis Metropolitanos                                                         | MTB      | AEROMETROPOLIS                 | 
    Aerovías Montes Azules                                                           | MZL      | MONTES AZULES                  | 
    Albarka Air                                                                      | NBK      | AL-AIR                         | 
    Air Metack                                                                       | MTK      | AIRMETACK                      | 
    Aero Yaqui Mayo                                                                  | MYS      | AERO YAQUI                     | 
    Aerotaxi Mexicano                                                                | MXO      | MAXAERO                        | 
    Aero Servicios de Nuevo Laredo                                                   | NEL      | AEROLAREDO                     | 
    Angoavia                                                                         | NGV      | ANGOAVIA                       | 
    ACA-Ancargo Air Sociedade de Transporte de Carga Lda                             | NCL      | ANCARGO AIR                    | 
    Atlantic Richfield                                                               | NRS      | NORTH SLOPE                    | 
    Aerolíneas Sosa                                                                  | NSO      | SOSA                           | 
    Aero Contractors                                                                 | NIG      | AEROLINE                       | 
    Aerokuzbass                                                                      | NKZ      | NOVOKUZNETSK                   | 
    Air Inter Ivoire                                                                 | NTV      | INTER-IVOIRE                   | 
    Airwing                                                                          | NWG      | NORWING                        | 
    Air Next                                                                         | NXA      | BLUE-DOLPHIN                   | 
    Avial NV Aviation                                                                | NVI      | NEW AVIAL                      | 
    Aeroservicios De Nuevo Leon                                                      | NUL      | SERVICIOS NUEVOLEON            | 
    Aerolíneas Olve                                                                  | OLV      | OLVE                           | 
    Aerogisa                                                                         | OGI      | AEROGISA                       | 
    Air Ontario                                                                      | ONT      | ONTARIO                        | 
    Aeromega                                                                         | OMG      | OMEGA                          | 
    Aerocorp                                                                         | ORP      | CORPSA                         | IATA changed to RCP; callsign changed to AEROCORPSA
    Aliparma                                                                         | PAJ      | ALIPARMA                       | 
    Aerosan                                                                          | OSN      | AEROSAN                        | 
    Aeroni                                                                           | NID      | AERONI                         | 
    Aeroejecutiva Nieto                                                              | NIE      | AERONIETO                      | 
    Air Burundi                                                                      | PBU      | AIR-BURUNDI                    | 
    Aeropostal Cargo de Mexico                                                       | PCG      | POSTAL CARGO                   | 
    Arkhangelsk 2 Aviation Division                                                  | OAO      | DVINA                          | 
    Air Palace                                                                       | PCS      | AIR PALACE                     | 
    Aerolíneas Chihuahua                                                             | PFI      | PACIFICO CHIHUAHUA             | 
    Air Cargo Express International                                                  | PFT      | PROFREIGHT                     | 
    Aeropelican Air Services                                                         | PEL      | PELICAN                        | 
    Peoples Vienna Line                                                              | PEV      | PEOPLES                        | 
    Aeroservicios California Pacifico                                                | PIF      | AEROCALPA                      | 
    Air Parabet                                                                      | PBT      | PARABET                        | 
    Air Pack Express                                                                 | PCK      | AIRPACK EXPRESS                | 
    Air South West                                                                   | PIE      | PIRATE                         | 
    Al Farana Airline                                                                | PHR      | PHARAOH                        | 
    AST Pakistan Airways                                                             | PKA      | PAKISTAN AIRWAY                | 
    Apoyo Aéreo                                                                      | POY      | APOYO AEREO                    | 
    Aero Personal                                                                    | PNL      | AEROPERSONAL                   | 
    Aeroservicio Sipse                                                               | PSE      | SIPSE                          | 
    Aéreo Taxi Paraza                                                                | PZA      | AEREO PARAZA                   | 
    Air Class Líneas Aéreas                                                          | QCL      | ACLA                           | 
    Aero Taxi Aviation                                                               | QKC      | QUAKER CITY                    | 
    Aviation Quebec Labrador                                                         | QLA      | QUEBEC LABRADOR                | 
    Aeroservicios Corporativos De San Luis                                           | PSL      | CORSAN                         | 
    Atlantic Coast Jet                                                               | PRT      | PATRIOT                        | 
    African Safari Airways                                                           | QSC      | ZEBRA                          | 
    Alada                                                                            | RAD      | AIR ALADA                      | 
    Air Center Helicopters                                                           | RAP      | RAPTOR                         | 
    Aerotransportes Privados                                                         | PVA      | TRANSPRIVADO                   | 
    Aeroserivios Del Bajio                                                           | RBJ      | AEROBAJIO                      | 
    Aur Rum Benin                                                                    | RBE      | RUM BENIN                      | 
    Aero Quimmco                                                                     | QUI      | QUIMMCO                        | 
    Airbus France                                                                    | RBU      | AIRBUS FRANCE                  | 
    Aerocer                                                                          | RCE      | AEROCER                        | 
    Aruba Airlines                                                                   | ARU      | ARUBA                          | 
    Air Mobility Command                                                             | RCH      | REACH                          | United States Air Force
    Aerotur Air                                                                      | RAI      | DIASA                          | 
    Aero Servicios Platinum                                                          | PNU      | AERO PLATINUM                  | 
    Air Cassai                                                                       | RCI      | AIR CASSAI                     | 
    Aerolíneas Regionales                                                            | RCQ      | REGIONAL CARGO                 | 
    Atlantic                                                                         | RCU      | AIR COURIER                    | 
    Aerocorp                                                                         | RCP      | AEROCORPSA                     | 
    Air Roberval                                                                     | RBV      | AIR ROBERVAL                   | 
    Aeroflot-Cargo                                                                   | RCF      | AEROFLOT-CARGO                 | 
    Aero Renta De Coahuila                                                           | RCO      | AEROCOAHUILA                   | 
    Air Service Center                                                               | RCX      | SERVICE CENTER                 | 
    Air Austral                                                                      | REU      | REUNION                        | 
    Australian Maritime Safety Authority                                             | RES      | RESCUE                         | 
    Aero Africa                                                                      | RFC      | AERO AFRICA                    | 
    Aer Arann                                                                        | REA      | AER ARANN                      | 
    Air Ada                                                                          | RDM      | AIR ADA                        | 
    Aerotransportes Rafilher                                                         | RFD      | RAFHILER                       | 
    Aero-Rey                                                                         | REY      | AEROREY                        | 
    Air Archipels                                                                    | RHL      | ARCHIPELS                      | 
    Argo                                                                             | RGO      | ARGOS                          | 
    Aeris Gestión                                                                    | RIS      | AERIS                          | 
    Aviation Ministry of the Interior of the Russian Federation                      | RIF      | INTERMIN AVIA                  | 
    Air Afrique                                                                      | RKA      | AIRAFRIC                       | 
    Airlinair                                                                        | RLA      | AIRLINAIR                      | 
    Air Leone                                                                        | RLL      | AEROLEONE                      | 
    Aeroservicios Jet                                                                | RJS      | ASERJET                        | 
    Asian Spirit                                                                     | RIT      | ASIAN SPIRIT                   | 
    Air Alize                                                                        | RLZ      | ALIZE                          | 
    Air Mediterranean                                                                | RML      | HELLASMED                      | 
    Arm-Aero                                                                         | RMO      | ARM-AERO                       | 
    Aero Lanka                                                                       | RLN      | AERO LANKA                     | 
    Air Max                                                                          | RMX      | AEROMAX                        | 
    Aeronem Air Cargo                                                                | RNM      | AEROMNEM                       | 
    Air Cargo Masters                                                                | RNR      | RUNNER                         | 
    Aeroeste                                                                         | ROE      | ESTE-BOLIVIA                   | 
    Air Amder                                                                        | RMD      | AIR AMDER                      | 
    Avior Airlines                                                                   | ROI      | AVIOR                          | 
    Aerodan                                                                          | ROD      | AERODAN                        | 
    Air Salone                                                                       | RNE      | AIR SALONE                     | 
    Aerolíneas Del Pacífico                                                          | RPC      | AEROPACSA                      | 
    AeroRepública                                                                    | RPB      | AEROREPUBLICA                  | 
    Amaszonas Paraguay                                                               | AZP      | GUARANI                        | 
    Aerolíneas Ejecutivas Tarascas                                                   | RSC      | TARASCAS                       | 
    Aero-Service                                                                     | RSR      | CONGOSERV                      | 
    Aero Gen                                                                         | ROH      | AEROGEN                        | 
    Artis                                                                            | RTH      | ARTHELICO                      | 
    Aero-Rent                                                                        | REN      | AERORENT                       | 
    AeroSur                                                                          | RSU      | AEROSUR                        | 
    Aerotucan                                                                        | RTU      | AEROTUCAN                      | 
    Air Anastasia                                                                    | RUD      | ANASTASIA                      | 
    Air Rum                                                                          | RUM      | AIR RUM                        | 
    Aerotransportes Internacionales De Torreon                                       | RRE      | AERO TORREON                   | 
    Air VIP                                                                          | RVP      | AEROVIP                        | 
    Aero Roca                                                                        | RRC      | AEROROCA                       | 
    Arrow Ecuador Arrowec                                                            | RWC      | ARROWEC                        | 
    Aeroxtra                                                                         | RXT      | AERO-EXTRA                     | 
    Air Veteran                                                                      | RVT      | AIR-VET                        | 
    Air Turquoise                                                                    | RTQ      | TURQUOISE                      | 
    ACT Havayollari                                                                  | RUN      | CARGO TURK                     | 
    Anoka Air Charter                                                                | RZZ      | RED ZONE                       | 
    Associated Aviation                                                              | SCD      | ASSOCIATED                     | 
    Aero Zano                                                                        | RZN      | ZANO                           | 
    Air Santo Domingo                                                                | SDO      | AERO DOMINGO                   | 
    Aero Sudpacifico                                                                 | SDP      | SUDPACIFICO                    | 
    Aero Servicios Ejecutivas Del Pacifico                                           | SEF      | SERVIPACIFICO                  | 
    Aero California                                                                  | SER      | AEROCALIFORNIA                 | 
    Aerosegovia                                                                      | SGV      | SEGOVIA                        | 
    Aerosaab                                                                         | SBH      | AEROSAAB                       | 
    American Jet International                                                       | SCM      | SCREAMER                       | 
    Air San Juan                                                                     | SJN      | SAN JUAN                       | 
    Aerosiyusa                                                                       | SIY      | SIYUSA                         | 
    Aero Silza                                                                       | SIZ      | AEROSILZA                      | 
    Aerolíneas Sol                                                                   | SOD      | ALSOL                          | 
    Arhabaev Tourism Airlines                                                        | RTO      | ARTOAIR                        | 
    Aero Zambia                                                                      | RZL      | AERO ZAMBIA                    | 
    Avient Aviation                                                                  | SMJ      | AVAVIA                         | 
    Air Service                                                                      | SPJ      | AIR SKOPJE                     | 
    Airworld                                                                         | SPZ      | SPEED SERVICE                  | 
    Aeroservicios Ejecutivos Del Pacifico                                            | SPO      | EJECTUIV PACIFICO              | 
    Air Safaris and Services                                                         | SRI      | AIRSAFARI                      | 
    Aero Sami                                                                        | SMI      | SAMI                           | 
    Aeropac                                                                          | STK      | SAT PAK                        | 
    Air St. Thomas                                                                   | STT      | PARADISE                       | 
    Aerolíneas Del Sureste                                                           | SUE      | AEROSURESTE                    | 
    Air Soleil                                                                       | SOE      | AIR SOLEIL                     | 
    Air Sultan                                                                       | SSL      | SIERRA SULTAN                  | 
    Aero Servicio Corporativo                                                        | SRV      | SERVICORP                      | 
    Air Yakutia                                                                      | SYL      | AIR YAKUTIA                    | 
    Aerial Surveys                                                                   | SUY      | SURVEY                         | 
    Aerosud Aviation                                                                 | SYT      | SKYTRACK                       | 
    Air Senegal                                                                      | SZN      | AIR SENEGAL                    | 
    Adler Aviation                                                                   | SWH      | SHOCKWAVE                      | 
    Aero Taxi de Los Cabos                                                           | TBO      | AERO CABOS                     | 
    Aerotrebol                                                                       | TBL      | AEROTREBOL                     | 
    Aerotranscolombina de Carga                                                      | TCO      | TRANSCOLOMBIA                  | 
    Atlas Helicopters                                                                | TDT      | TRIDENT                        | 
    Aeromar                                                                          | TAO      | TRANS-AEROMAR                  | 
    Aero Servicios Azteca                                                            | TED      | AEROAZTECA                     | 
    Antair                                                                           | TIR      | ANTAIR                         | 
    Air Today                                                                        | TDY      | AIR TODAY                      | 
    Aereo Taxi Autlan                                                                | TLD      | AEREO AUTLAN                   | 
    Atlantique Air Assistance                                                        | TLB      | TRIPLE-A                       | 
    Aero Util                                                                        | TLE      | AEROUTIL                       | 
    Air Cargo Express                                                                | TDG      | TURBO DOG                      | 
    Aero Taxi del Centro de Mexico                                                   | TME      | TAXICENTRO                     | 
    Asian Aerospace Service                                                          | SPY      | THAI SPACE                     | 
    Aeroservicios de La Costa                                                        | TAA      | AERO COSTA                     | 
    Aerotropical                                                                     | TOC      | TROPICMEX                      | 
    Aero Tonala                                                                      | TON      | AEROTONALA                     | 
    Air Tomisko                                                                      | TOH      | TOMISKO CARGO                  | 
    Airlines PNG                                                                     | TOK      | BALUS                          | 
    Air Calédonie                                                                    | TPC      | AIRCAL                         | 
    Aeroturquesa                                                                     | TQS      | AEROTURQUESA                   | 
    Aero Tropical                                                                    | TPB      | AERO TROPICAL                  | 
    Aero Taxi del Potosi                                                             | TPO      | TAXI-POTOSI                    | 
    Air Horizon                                                                      | TPK      | TCHAD-HORIZON                  | 
    Aerolíneas Turísticas del Caribe                                                 | TTB      | AERO TURISTICAS                | 
    airtransse                                                                       | TSQ      | AIRTRA                         | 
    Air Transat                                                                      | TSC      | AIR TRANSAT                    | 
    Avcenter                                                                         | TTE      | TETON                          | 
    Aerotaxis del Noroeste                                                           | TXD      | TAXI OESTE                     | 
    Avialeasing Aviation                                                             | TWN      | TWINARROW                      | 
    Aerotaxis Alfe                                                                   | TXF      | ALFE                           | 
    Airmark Aviation                                                                 | TRH      | TRANSTAR                       | 
    Aero Tomza                                                                       | TZA      | AERO TOMZA                     | 
    Aerostar Airlines                                                                | UAR      | AEROSTAR                       | 
    Afra Airlines                                                                    | UAG      | AFRALINE                       | 
    Aero Toluca Internactional                                                       | TLU      | AEROTOLUCA                     | 
    Air Zambezi                                                                      | TZT      | ZAMBEZI                        | 
    Aereotaxis                                                                       | TXI      | AEREOTAXIS                     | 
    Aero-Charter Ukraine                                                             | UCR      | CHARTER UKRAINE                | 
    Air LA                                                                           | UED      | AIR L-A                        | 
    Air Division of the Eastern Kazakhstan Region                                    | UCK      | GALETA                         | 
    AirNet Express                                                                   | USC      | STAR CHECK                     | Renamed from US Check Airlines
    Alrosa Air                                                                       | DRU      | MIRNY                          | 
    Azul Linhas Aéreas Brasileiras                                                   | AZU      | AZUL                           | 
    Aviacsa                                                                          | CHP      | AVIACSA                        | 
    Avia Express                                                                     | SKX      | SKY EXPRESS                    | Former names: AMA-Flyg I Goteborg; Salair; former ICAO code: AAX
    Antigua and Barbuda Airways                                                      | ABI      | ANAIR                          | 
    Air Uganda                                                                       | UGA      | UGANDA                         | 
    African Cargo Services                                                           | ACB      | AFRICARGO                      | 
    Avicon                                                                           | ACJ      | AVICHARTER                     | 
    Alfa Airlines                                                                    | AAJ      | ALFA SUDAN                     | 
    Air Cargo Plus                                                                   | ACH      | AIR PLUS                       | 
    Air Ukraine                                                                      | UKR      | AIR UKRAINE                    | 
    Atuneros Unidos de California                                                    | UND      | ATUNEROS UNIDOS                | 
    Air Busan                                                                        | ABL      | AIR BUSAN                      | 
    Arabasco Air Services                                                            | AAP      | ARABASCO                       | 
    Ade, Aviación Deportiva                                                          | ADF      | ADE AVIACION                   | 
    Aircraft Sales and Services                                                      | ACS      | AIRCRAFT SALES                 | 
    Arrendaminetos y Transportes Turisticos                                          | ADT      | ARRENDA-TRANS                  | 
    Air Umbria                                                                       | UMB      | AIR UMBRIA                     | 
    Air Florida                                                                      | FLA      | PALM                           | relaunching
    Air Arabia Maroc                                                                 | MAC      | ARABIA MAROC                   | This ICAO designator was previously used by Malta Air Charter
    Air Do                                                                           | ADO      | AIR DO                         | 
    Air Marine                                                                       | MRY      | AIR MARINE                     | 
    Air Pink                                                                         | PNK      | AIRPINK                        | 
    African International Airlines                                                   | AFN      | SIMBA                          | 
    Aberdair Aviation                                                                | BDV      | ABERDAV                        | 
    Aerosur Paraguay                                                                 | AES      | AEROPARAGUAY                   | 
    Africa Airways                                                                   | AFF      | AFRIWAYS                       | 
    Absolute Flight Services                                                         | TTN      | TITANIUM                       | 
    Ace Air                                                                          | ATZ      | ACE TAXI                       | 
    Acropolis Aviation                                                               | CRV      | ACROPOLIS                      | 
    Addis Airlines                                                                   | DDS      | ADDIS LINE                     | 
    ADI Shuttle Group                                                                | TEC      | TECHJET                        | 
    Air Italy Polska                                                                 | AEI      | POLISH BIRD                    | 
    Ambeo                                                                            | ABT      | AMBITION                       | 
    AD Astra Executive Charter                                                       | ADC      | AD ASTRA                       | 
    Advance Air Luftfahrtgesellschaft                                                | AXX      | SKY SHUTTLE                    | 
    Aeralp                                                                           | ALS      | AERALP                         | 
    Advance Aviation                                                                 | AAX      | ADVANCE AVIATION               | 
    Advanced Flight Training                                                         | ADV      | ADVANCED                       | 
    Aereo Transportes Los Angeles de America                                         | AGI      | ANGELES AMERICA                | 
    Acero Taxi                                                                       | ARO      | ACERO                          | 
    Aereo Dorado                                                                     | DRD      | AEREO DORADO                   | 
    Aereo Ruta Maya                                                                  | MMG      | RUTA MAYA                      | 
    Aero Clinker                                                                     | AKR      | AERO CLINKER                   | 
    Aereo Futuro                                                                     | FUT      | AEREO FUTURO                   | 
    Aereo WWG                                                                        | WWG      | AERO-W                         | 
    Aeroaljarafe                                                                     | AJH      | ALJARAFE                       | 
    Aero Elite Acapulco                                                              | EPU      | ELITACAPULCO                   | 
    Aero Corporate                                                                   | ARP      | IVORYCORP                      | 
    Aero Servicio Guerrero                                                           | GUE      | AERO GUERRERO                  | 
    Aerocorporativos                                                                 | CTD      | AEROCORPORATIVOS               | 
    Aerocaribe Coro                                                                  | AOB      | CARIBE CORO                    | 
    Aero-Beta                                                                        | ABA      | AEROBETA                       | 
    Aerolínea Principal Chile                                                        | PCP      | PRINCIPAL                      | 
    Aero Services Mali                                                               | GLM      | GLOBAL MALI                    | 
    Aerolíneas Centrales                                                             | ALT      | AERLINEAS CENTRALES            | 
    Aeroflot-Plus                                                                    | PLS      | AEROPLUS                       | 
    Aerolíneas Primordiales                                                          | APR      | AEROPERLAS                     | 
    AIRDO                                                                            | ADO      | AIR DO                         | 
    Aerolíneas Damojh                                                                | DMJ      | DAMOJH                         | 
    Aviation West Charters                                                           | AGM      | ANGEL MED                      | 2015
    Aerolimousine                                                                    | LIN      | AEROLIMOUSINE                  | 
    Aerolíneas Hidalgo                                                               | AHL      | HIDALGO                        | 
    Al Masria Universal Airlines                                                     | LMU      | ALMASRIA                       | 
    Álamo Aviación                                                                   | AVD      | ALAMO                          | 
    Avion Express                                                                    | NVD      | NORDVIND                       | Name changed from Nordic Solutions Air
    The Amiri Flight                                                                 | BAH      | BAHRAIN                        | 
    B-Air Charter                                                                    | BBF      | SPEEDCHARTER                   | 2014
    Beijing Capital Airlines                                                         | CBJ      | CAPITAL JET                    | 
    Business Aviators                                                                | OTA      | OUTLAW                         | 2014
    BB Airways                                                                       | BBW      | BEEBEE AIRWAYS                 | 
    Bluewest Helicopters-Greenland                                                   | BWD      | BLUEWEST                       | 
    AIS Airlines                                                                     | PNX      | SPINNER                        | 
    Bell Aliant Regional Communications                                              | TBL      | TELCO                          | 
    Air Albania                                                                      | ABN      | AIR ALBANIA                    | 
    Aeroclub de Mallorca                                                             | MLL      | MALLORCA                       | 
    Beijing Vistajet Aviation                                                        | BJV      | BEIJING VISTA                  | 
    Bygone Aviation                                                                  | BYG      | BYGONE                         | 
    Backbone                                                                         | BOB      | BACKBONE                       | 
    Brixtel Group                                                                    | BXJ      | BRIXTEL JET                    | 
    Batik Air                                                                        | BTK      | BATIK                          | 
    Air Hamburg                                                                      | AHO      | AIR HAMBURG                    | 
    Bearing Supplies                                                                 | PVO      | PROVOST                        | 
    Balkan Agro Aviation                                                             | BAA      | BALKAN AGRO                    | 
    Blu Halkin                                                                       | BHK      | BLUEHAKIN                      | 
    Bahrain Air BSC                                                                  | BAB      | AWAL                           | 
    Blue Jet Charters                                                                | BCJ      | BLUE BOY                       | 
    BAE Systems                                                                      | BAE      | FELIX                          | Corporate Air Travel
    Belgian Air Force                                                                | BAF      | BELGIAN AIRFORCE               | 
    Blackhawk Airways                                                                | BAK      | BLACKHAWK                      | 
    Belle Air Europe                                                                 | BAL      | BELLEAIR EUROPE                | Previously Britannia Airways
    Beijing City International Jet                                                   | CWR      | CITY WORLD                     | 
    Business Air Services                                                            | BAM      | BUSINESS AIR                   | 
    Bissau Airlines                                                                  | BAU      | AIR BISSAU                     | 
    British Antarctic Survey                                                         | BAN      | PENGUIN                        | 
    Baker Aviation                                                                   | BAJ      | RODEO                          | 
    Bradly Air  Services                                                             | BAR      | BRADLEY                        | 
    Blue Air Lines                                                                   | BBJ      | BLUE KOREA                     | 
    Biman Bangladesh Airlines                                                        | BBC      | BANGLADESH                     | 
    Beibars CJSC                                                                     | BBS      | BEIBARS                        | 
    Bay Aviation                                                                     | BAV      | BAY AIR                        | 
    Bannert Air                                                                      | BBA      | BANAIR                         | 
    Bluebird Aviation                                                                | BBZ      | COBRA                          | 
    BACH Flugbetriebsges                                                             | BCF      | BACH                           | 
    Bun Air Corporation                                                              | BNA      | BUN AIR                        | 
    Bluebird Nordic                                                                  | BBD      | BLUE CARGO                     | 
    British Airways                                                                  | BAW      | SPEEDBIRD                      | 
    BCT Aviation                                                                     | BCT      | BOBCAT                         | 
    Business Aviation Center                                                         | BCV      | BUSINESS AVIATION              | 
    Blue Islands                                                                     | BCI      | BLUE ISLAND                    | 
    Bravo Airlines                                                                   | BBV      | BRAVO EUROPE                   | 
    CityJet                                                                          | BCY      | CITY JET                       | 
    British Charter                                                                  | BCR      | BACKER                         | 
    Badr Airlines                                                                    | BDR      | BADR AIR                       | 
    Belgian Army                                                                     | AYB      | BELGIAN ARMY                   | 
    Best Aviation                                                                    | BEA      | BEST AIR                       | 
    Bar Harbor Airlines                                                              | AJC      | BAR HARBOR                     | 
    Balear Express                                                                   | BEF      | BALEAR EXPRESS                 | 
    Bel Air Helicopters                                                              | BEH      | BLUECOPTER                     | 
    Berkut Air                                                                       | BEK      | BERKUT                         | 
    BETA - Brazilian Express Transportes Aéreos                                      | BET      | BETA CARGO                     | 
    Belgorod Aviation Enterprise                                                     | BED      | BELOGORYE                      | 
    Blue Dart Aviation                                                               | BDA      | BLUE DART                      | 
    B&H Airlines                                                                     | BON      | AIR BOSNA                      | 
    Basler Flight Service                                                            | BFC      | BASLER                         | 
    Buffalo Airways                                                                  | BFL      | BUFFALO                        | 
    Burkina Airlines                                                                 | BFR      | BURKLINES                      | 
    Bissau Discovery Flying Club                                                     | BDF      | BISSAU DISCOVERY               | 
    Bombardier                                                                       | BFO      | BOMBARDIER                     | 
    BH Air                                                                           | BGH      | BALKAN HOLIDAYS                | 
    British Gulf International-Fez                                                   | BGK      | GULF INTER                     | 
    Business Flight Sweden                                                           | BFS      | BUSINESS FLIGHT                | 
    Benin Golf Air                                                                   | BGL      | BENIN GOLF                     | 
    Bahrain Defence Force                                                            | BFW      | SUMMAN                         | 
    Budget Air Bangladesh                                                            | BGR      | BUDGET AIR                     | 
    Buddha Air                                                                       | BHA      | BUDDHA AIR                     | 
    British Gulf International                                                       | BGI      | BRITISH GULF                   | 
    Balkh Airlines                                                                   | BHI      | SHARIF                         | 
    Bugulma Air Enterprise                                                           | BGM      | BUGAVIA                        | 
    Bhoja Airlines                                                                   | BHO      | BHOJA                          | 
    Bristow Helicopters                                                              | BHL      | BRISTOW                        | 
    Belair Airlines                                                                  | BHP      | BELAIR                         | 
    Bergen Air Transport                                                             | BGT      | BERGEN AIR                     | 
    Bear Flight                                                                      | BFG      | BEARFLIGHT                     | 
    Bristow Helicopters Nigeria                                                      | BHN      | BRISTOW HELICOPTERS            | 
    Bahamasair                                                                       | BHS      | BAHAMAS                        | 
    Bighorn Airways                                                                  | BHR      | BIGHORN AIR                    | 
    Bosphorus European Airways                                                       | BHY      | BOSPHORUS                      | 
    Big Island Air                                                                   | BIG      | BIG ISLE                       | 
    Binair                                                                           | BID      | BINAIR                         | 
    Bioflight                                                                        | BIO      | BIOFLIGHT                      | 
    Boise Interagency Fire Center                                                    | BIN      | BISON-AIR                      | 
    British International Helicopters                                                | BIH      | BRINTEL                        | 
    Baja Air                                                                         | BJA      | BAJA AIR                       | 
    Business Jet Solutions                                                           | BJS      | SOLUTION                       | 
    Billund Air Center                                                               | BIL      | BILAIR                         | 
    Bizjet                                                                           | BIZ      | BIZZ                           | 
    Bankair                                                                          | BKA      | BANKAIR                        | 
    Blink                                                                            | BKK      | BLINKAIR                       | 
    Barken International                                                             | BKJ      | BARKEN JET                     | 
    Bangkok Airways                                                                  | BKP      | BANGKOK AIR                    | 
    Baltic Jet Air                                                                   | BJC      | BALTIC JET                     | 
    Blue Bird Aviation                                                               | BLB      | BLUEBIRD SUDAN                 | 
    Bird Leasing                                                                     | BIR      | BIRD AIR                       | 
    Bellesavia                                                                       | BLC      | BELLESAVIA                     | 
    Blue Line                                                                        | BLE      | BLUE BERRY                     | 
    Bukovyna                                                                         | BKV      | BUKOVYNA                       | 
    Blue Horizon Travel Club                                                         | BLH      | BLUE HORIZON                   | 
    BF-Lento OY                                                                      | BKF      | BAKERFLIGHT                    | 
    Baltic Airlines                                                                  | BLL      | BALTIC AIRLINES                | 
    Bali International Air Service                                                   | BLN      | BIAR                           | 
    Bearskin Lake Air Service                                                        | BLS      | BEARSKIN                       | 
    Baltic Aviation                                                                  | BLT      | BALTAIR                        | 
    BMI Regional                                                                     | BMR      | MIDLAND                        | 
    Blue1                                                                            | BLF      | BLUEFIN                        | 
    Blue Jet                                                                         | BLJ      | BLUEWAY                        | 
    Bristow Masayu Helicopters                                                       | BMH      | MASAYU                         | 
    Bemidji Airlines                                                                 | BMJ      | BEMIDJI                        | 
    Bismillah Airlines                                                               | BML      | BISMILLAH                      | IATA code in use by another company
    Bellview Airlines                                                                | BLV      | BELLVIEW AIRLINES              | 
    Bowman Aviation                                                                  | BMN      | BOWMAN                         | 
    Belgavia                                                                         | BLG      | BELGAVIA                       | 
    BMW                                                                              | BMW      | BMW-FLIGHT                     | 
    British Medical Charter                                                          | BMD      | BRITISH MEDICAL                | 
    Briggs Marine Environmental Services                                             | BME      | BRIGGS                         | 
    Air Service Liège                                                                | BNJ      | JET BELGIUM                    | 
    Bond Offshore Helicopters                                                        | BND      | BOND                           | 
    Benina Air                                                                       | BNE      | BENINA AIR                     | 
    Banco de Mexico                                                                  | BMX      | BANXICO                        | 
    Bentiu Air Transport                                                             | BNT      | BENTIU AIR                     | 
    Blue Nile Ethiopia Trading                                                       | BNL      | NILE TRADING                   | 
    BN Group                                                                         | BNG      | VECTIS                         | 
    Bancstar - Valley National Corporation                                           | BNS      | BANCSTAR                       | 
    British North West Airlines                                                      | BNW      | BRITISH NORTH                  | 
    Bonair Aviation                                                                  | BNR      | BONAIR                         | 
    Bordaire                                                                         | BOF      | BORDAIR                        | 
    Boniair                                                                          | BOA      | KUMANOVO                       | 
    Boeing                                                                           | BOE      | BOEING                         | 
    Bouraq Indonesia Airlines                                                        | BOU      | BOURAQ                         | 
    Blue Panorama Airlines                                                           | BPA      | BLUE PANOROMA                  | 
    Bond Air Services                                                                | BOD      | UGABOND                        | 
    Bundespolizei-Fliegertruppe                                                      | BPO      | PIROL                          | 
    Benane Aviation Corporation                                                      | BNV      | BENANE                         | 
    BRA-Transportes Aéreos                                                           | BRB      | BRA-TRANSPAEREOS               | 
    Bonus Aviation                                                                   | BPT      | BONUS                          | 
    Bookajet                                                                         | BOO      | BOOKAJET                       | 
    Brock Air Services                                                               | BRD      | BROCK AIR                      | 
    Bering Air                                                                       | BRG      | BERING AIR                     | 
    Breeze                                                                           | BRE      | AVIABREEZE                     | 
    Brazilian Air Force                                                              | BRS      | BRAZILIAN AIR FORCE            | 
    British Regional Airlines                                                        | BRT      | BRITISH                        | 
    Branson Airlines                                                                 | BRN      | BRANSON                        | 
    Bright Aviation Services                                                         | BRW      | BRIGHT SERVICES                | 
    Belavia Belarusian Airlines                                                      | BRU      | BELARUS AVIA                   | 
    Buffalo Express Airlines                                                         | BRX      | BUFF EXPRESS                   | 
    Burundayavia                                                                     | BRY      | BURAIR                         | 
    Bistair - Fez                                                                    | BSC      | BIG SHOT                       | 
    Brasair Transportes Aéreos                                                       | BSI      | BRASAIR                        | 
    Blue Star Airlines                                                               | BSD      | AIRLINES STAR                  | 
    Briansk State Air Enterprise                                                     | BRK      | BRIANSK-AVIA                   | 
    Bissau Aero Transporte                                                           | BSS      | BISSAU AIRSYSTEM               | 
    Big Sky Airlines                                                                 | BSY      | BIG SKY                        | 
    Best Air                                                                         | BST      | TUNCA                          | 
    Baltijas Helicopters                                                             | BTH      | BALTIJAS HELICOPTERS           | 
    Budapest Aircraft Services/Manx2                                                 | BPS      | BASE                           | 
    Berkhut ZK                                                                       | BPK      | VENERA                         | 
    Baltia Air Lines                                                                 | BTL      | BALTIA                         | Callsign changed from "BALTIA FLIGHT" in 2015
    Baltyka                                                                          | BTK      | BALTYKA                        | 
    Botir-Avia                                                                       | BTR      | BOTIR-AVIA                     | 
    Batavia Air                                                                      | BTV      | BATAVIA                        | As of June 1, 2010, IATA code changed to Y6.
    Business Express                                                                 | GAA      | BIZEX                          | 
    BT-Slavuta                                                                       | BTT      | BEETEE-SLAVUTA                 | 
    Bulgarian Air Charter                                                            | BUC      | BULGARIAN CHARTER              | 
    Buryat Airlines Air                                                              | BUN      | BURAL                          | 
    Bristow U.S. LLC                                                                 | BTZ      | BRISTOW                        | 
    Buzz Stansted                                                                    | BUZ      | BUZZ                           | 
    Bulgarian Aeronautical Centre                                                    | BVC      | BULGARIAN WINGS                | 
    Blue Airlines                                                                    | BUL      | BLUE AIRLINES                  | 
    Berjaya Air                                                                      | BVT      | BERJAYA                        | 
    Buffalo Airways                                                                  | BVA      | BUFFALO AIR                    | 
    British World Airlines                                                           | BWL      | BRITWORLD                      | 
    Bahrain Executive Air Services                                                   | BXA      | BEXAIR                         | 
    BAL Bashkirian Airlines                                                          | BTC      | BASHKIRIAN                     | 
    Bar XH Air                                                                       | BXH      | PALLISER                       | 
    Berry Aviation                                                                   | BYA      | BERRY                          | 
    Cambodia Bayon Airlines                                                          | BYC      | BAYON AIR                      | 
    San Carlos Flight Center                                                         | BYF      | BAY FLIGHT                     | 
    Brussels International Airlines                                                  | BXI      | XENIA                          | 
    Bayu Indonesia Air                                                               | BYE      | BAYU                           | 
    Blue Wing Airlines                                                               | BWI      | BLUE TAIL                      | 
    Brit Air                                                                         | BZH      | BRITAIR                        | 
    Butane Buzzard Aviation Corporation                                              | BZZ      | BUZZARD                        | 
    Blue Sky Airways                                                                 | BSW      | SKY BLUE                       | 
    Baron Aviation Services                                                          | BVN      | SHOW-ME                        | 
    Bylina Joint-Stock                                                               | BYL      | BYLINA                         | 
    Business Flight Salzburg                                                         | AUJ      | AUSTROJET                      | 
    Bristol Flying Centre                                                            | CLF      | CLIFTON                        | 
    Boston-Maine Airways                                                             | CXS      | CLIPPER CONNECTION             | Pan Am Clipper Connection Pan Am III
    Barnes Olsen Aeroleasing                                                         | CLN      | SEELINE                        | 
    Brussels Airlines                                                                | BEL      | BEE-LINE                       | 
    Baltimore Airways                                                                | EAH      | EASTERN                        | 
    Bond Aviation                                                                    | EBA      | BOND AVIATION                  | 
    Business Express Delivery                                                        | EXP      | EXPRESS AIR                    | 
    Bizair Fluggesellschaft                                                          | BZA      | BERLIN BEAR                    | 
    Bangkok Aviation Center                                                          | HAW      | THAI HAWK                      | 
    Benair                                                                           | HAX      | SCOOP                          | 
    Brazilian Army Aviation                                                          | EXB      | BRAZILIAN ARMY                 | 
    Baltimore Air Transport                                                          | CPJ      | CORPJET                        | 
    Bonyad Airlines                                                                  | IRJ      | BONYAD AIR                     | 
    BKS Air                                                                          | CKM      | COSMOS                         | 
    Burundaiavia                                                                     | IVR      | RERUN                          | 
    Blue Air                                                                         | BLA      | BLUE AIR                       | 
    Binter Canarias                                                                  | IBB      | BINTER                         | 
    Belle Air                                                                        | LBY      | ALBAN-BELLE                    | 
    Benin Littoral Airways                                                           | LTL      | LITTORAL                       | 
    British Mediterranean Airways                                                    | LAJ      | BEE MED                        | 
    Barents AirLink                                                                  | NKF      | NORDFLIGHT                     | previously Nordkalottflyg
    Blom Geomatics                                                                   | LED      | SWEEPER                        | 
    Bakoji Airlines Services                                                         | OGJ      | BAKO AIR                       | 
    Benders Air                                                                      | PEB      | PALEMA                         | 
    Brazilian Navy Aviation                                                          | MBR      | BRAZILIAN NAVY                 | 
    Bombardier Business Jet Solutions                                                | LXJ      | FLEXJET                        | 
    Balmoral Central Contracts                                                       | PNT      | PORTNET                        | 
    Butte Aviation                                                                   | PPS      | PIPESTONE                      | 
    BGB Air                                                                          | POI      | BOJBAN                         | 
    Bond Air Services                                                                | RHD      | RED HEAD                       | 
    Bulgaria Air                                                                     | LZB      | FLYING BULGARIA                | 
    BAC Express Airlines                                                             | RPX      | RAPEX                          | 
    British Airways Shuttle                                                          | SHT      | SHUTTLE                        | BA domestic services
    Boscombe Down DERA                                                               | RRS      | BLACKBOX                       | 
    Business Jet Sweden                                                              | SCJ      | SCANJET                        | 
    Bell Helicopter Textron                                                          | TXB      | TEXTRON                        | 
    Biz Jet Charter                                                                  | VLX      | AVOLAR                         | 
    British Sky Broadcasting                                                         | SKH      | SKYNEWS                        | 
    Woodford Flight Test                                                             | WFD      | AVRO                           | Woodford Flight Test
    Buzzaway                                                                         | UKA      | UKAY                           | 
    Warton Military Flight Ops                                                       | WTN      | TARNISH                        | Warton Military Flight Ops
    British Airways Santa                                                            | XMS      | SANTA                          | Christmas charter flights
    Blue Sky Airlines                                                                | BLM      | BLUE ARMENIA                   | 
    Businesswings                                                                    | JMP      | JUMP RUN                       | 
    BA CityFlyer                                                                     | CFE      | FLYER                          | 
    Belgian Navy                                                                     | NYB      | BELGIAN NAVY                   | 
    Boliviana de Aviación                                                            | BOV      | BOLIVIANA                      | 
    Business Airfreight                                                              | RLR      | RATTLER                        | 
    Conquest Air                                                                     | QAI      | CHICKPEA                       | 2014
    Croix Rouge Francais                                                             | CRF      | CROIX ROUGE                    | 2014
    Corporate Eagle Management Services                                              | CBH      | CLUB HOUSE                     | Allocated in 2014
    Blue Chip Jet                                                                    | VOL      | BLUE SPEED                     | 
    Connect Air                                                                      | CCT      | CONNECT                        | Allocated in 2014
    Caribbean Airlines                                                               | BWA      | CARIBBEAN AIRLINES             | 
    Commerce Bank                                                                    | CME      | COMMERCE BANK                  | 
    Civil Air Patrol South Carolina Wing                                             | BKR      | BOX KAR                        | 
    Civil Aviation Authority Directorate of Airspace Policy                          | AWX      | ALLWEATHER                     | 
    Borajet                                                                          | BRJ      | BORA JET                       | 
    CHC Helicopters Nigeria                                                          | ATQ      | COLIBRI                        | 
    Chief of Staff, United States Air Force                                          | AIO      | AIR CHIEF                      | 
    Civil Aviation Authority of the Czech Republic                                   | CAA      | INSPECTOR                      | 
    Boskovic Air Charters                                                            | ZBA      | BOSKY                          | 
    Carpatair Flight Service                                                         | SMW      | SMART WINGS                    | Was Carpatair Flight Training
    Civil Aviation Authority Airworthiness Division                                  | BBN      | BRABAZON                       | 
    Christian Konig - Century Airbirds                                               | AID      | CENTURY AIRBIRD                | 
    Corporativo Aereo Principal                                                      | APL      | AEREO PRINCIPAL                | 
    Pawa Dominicana                                                                  | PWD      | PAWA DOMINICANA                | 
    Chongqing Forebase General Aviation                                              | CFB      | FOREBASE                       | 
    Cambodia Airways                                                                 | KME      | GIANT IBIS                     | 
    CHC Global Operations International                                              | GCY      | HELIBIRD                       | 
    Caricom Airways                                                                  | CCB      | DOLPHIN                        | 
    China Southern Airlines Henan                                                    | CYH      | YUHAO                          | 
    Colt Transportes Aereos                                                          | XCA      | COLT                           | 
    Cambodia Airlines                                                                | CCL      | ANGKOR WAT                     | 
    C Air Jet Airlines                                                               | SRJ      | SYRJET                         | 
    C and M Aviation                                                                 | TIP      | TRANSPAC                       | 
    C.S.P., Societe                                                                  | RMU      | AIR-MAUR                       | 
    C N Air                                                                          | ORO      | CAPRI                          | 
    Cabi                                                                             | CBI      | CABI                           | 
    C&M Airways                                                                      | RWG      | RED WING                       | 
    Cameroon Airlines Corporation                                                    | CRC      | CAMAIRCO                       | 
    Caliber Jet                                                                      | CJZ      | CALIBER JET                    | 
    CATA Línea Aérea                                                                 | CTZ      | CATA                           | 
    CCF Manager Airline                                                              | CCF      | TOMCAT                         | 
    CEDTA                                                                            | CED      | CEDTA                          | 
    CHC Denmark                                                                      | HBI      | HELIBIRD                       | 
    CHC Helicopter                                                                   | HEM      | HEMS                           | 
    CHC Helikopter Service                                                           | HKS      | HELIBUS                        | 
    Compagnia Aeronautica Italiana                                                   | CPI      | AIRCAI                         | 
    CM Stair                                                                         | CMZ      | CEE-EM STAIRS                  | 
    Centre national d'études des télécommunications - C.N.E.T.                       | CNT      | KNET                           | 
    Common Sky                                                                       | AUN      | COMMON SKY                     | 
    CAL Cargo Air Lines                                                              | ICL      | CAL                            | 
    CRI Helicopters Mexico                                                           | CRH      | HELI-MEX                       | 
    COAPA AIR                                                                        | OAP      | COAPA                          | 
    CAM Air Management                                                               | CMR      | CAMEO                          | 
    CI-Tours                                                                         | VCI      | CI-TOURS                       | 
    COMAV                                                                            | PDR      | SPEEDSTER                      | 
    CTK Network Aviation                                                             | CTQ      | CITYLINK                       | 
    Caernarfon Airworld                                                              | CWD      | AMBASSADOR                     | 
    Cabo Verde Express                                                               | CVE      | KABEX                          | 
    Caicos Express Airways                                                           | CXE      | CAICOS                         | 
    Cal-West Aviation                                                                | REZ      | CAL AIR                        | 
    California Air Shuttle                                                           | CSL      | CALIFORNIA SHUTTLE             | 
    Calima Aviación                                                                  | CMV      | CALIMA                         | 
    Calm Air                                                                         | CAV      | CALM AIR                       | 
    Camai Air                                                                        | CAM      | AIR CAMAI                      | Village Aviation
    Cal Gulf Aviation                                                                | CGC      | CAL-GULF                       | 
    Cabair College of Air Training                                                   | CBR      | CABAIR                         | 
    Campania Helicopteros De Transporte                                              | HSO      | HELIASTURIAS                   | 
    Cambodia Angkor Air                                                              | KHV      | ANGKOR AIR                     | 
    CanJet                                                                           | CJA      | CANJET                         | 
    Canada Jet Charters                                                              | PIL      | PINNACLE                       | 
    Canadian Eagle Aviation                                                          | HIA      | HAIDA                          | 
    Canadian Forces                                                                  | CFC      | CANFORCE                       | 
    Canadian North                                                                   | MPE      | EMPRESS                        | Air Norterra
    Canadian Warplane Heritage Museum                                                | CWH      | WARPLANE HERITAGE              | 
    CSE Aviation                                                                     | CSE      | OXFORD                         | 
    CSA Air                                                                          | IRO      | IRON AIR                       | 
    Canadian Western Airlines                                                        | CWA      | CANADIAN WESTERN               | 
    Cancun Air                                                                       | CUI      | CAN-AIR                        | 
    Cape Air                                                                         | KAP      | CAIR                           | 
    Canadian Coast Guard                                                             | CTG      | CANADIAN COAST GUARD           | 
    Cape Smythe Air                                                                  | CMY      | CAPE SMYTHE AIR                | 
    Cape Central Airways                                                             | SEM      | SEMO                           | 
    Capital Airlines                                                                 | CPD      | CAPITAL DELTA                  | 
    Canadian Helicopters                                                             | CDN      | CANADIAN                       | 
    Canair                                                                           | CWW      | CANAIR                         | 
    Capitol Air Express                                                              | CEX      | CAPITOL EXPRESS                | 
    Capitol Wings Airline                                                            | CWZ      | CAPWINGS                       | 
    Capital Airlines                                                                 | NCP      | CAPITAL SHUTTLE                | 
    Capital Air Service                                                              | CPX      | CAPAIR                         | 
    Cardiff Wales Flying Club                                                        | CWN      | CAMBRIAN                       | 
    Caravan Air                                                                      | VAN      | CAMEL                          | 
    Cards Air Services                                                               | CDI      | CARDS                          | 
    Cardinal/Air Virginia                                                            | FVA      | AIR VIRGINIA                   | 
    Carga Aérea Dominicana                                                           | CDM      | CARGA AEREA                    | 
    Carga Express Internacional                                                      | EST      | CARGAINTER                     | 
    Cargo 360                                                                        | GGC      | LONG-HAUL                      | 
    Cargo Express                                                                    | MCX      | MAURICARGO                     | 
    Cargo Ivoire                                                                     | CRV      | CARGOIV                        | 
    Cardolaar                                                                        | GOL      | CARGOLAAR                      | 
    Capital Trading Aviation                                                         | EGL      | PRESTIGE                       | 
    Cargo Logic Air                                                                  | CLA      | FIREBIRD                       | 
    CareFlight                                                                       | CFH      | CARE FLIGHT                    | 
    Cargojet Airways                                                                 | CJT      | CARGOJET                       | 
    Cargoitalia                                                                      | CRG      | WHITE PELICAN                  | 
    Cargo Link                                                                       | CLM      | CARGO LINK                     | 
    Capital City Air Carriers                                                        | CCQ      | CAP CITY                       | 
    Cargoman                                                                         | CGM      | HOTEL CHARLIE                  | 
    Carib Aviation                                                                   | DEL      | RED TAIL                       | 
    CARIBAIR                                                                         | PWD      | CARIBAIR                       | 
    Cargolux                                                                         | CLX      | CARGOLUX                       | 
    Cargo Three                                                                      | CTW      | THIRD CARGO                    | 
    Cargolux Italia                                                                  | ICV      | CARGO MED                      | 
    Caribbean Airways                                                                | IQQ      | CARIBJET                       | 
    Caribbean Express                                                                | TLC      | CARIB-X                        | 
    Choice Airways                                                                   | CSX      | CHOICE AIR                     | 
    Caribbean Air Cargo                                                              | DCC      | CARICARGO                      | 
    Carib Express                                                                    | BCB      | WAVEBIRD                       | 
    Caribbean Star Airlines                                                          | GFI      | CARIB STAR                     | 
    Caribbean Airlines                                                               | BWA      | CARIBBEAN                      | 
    Caribintair                                                                      | CRT      | CARIBINTAIR                    | 
    Casement Aviation                                                                | CMT      | CASEMENT                       | 
    Casino Airline                                                                   | CSO      | CASAIR                         | 
    Caricom Airways                                                                  | CRB      | CARIBBEAN COMMUTER             | 
    Casper Air Service                                                               | CSP      | CASPER AIR                     | 
    Carill Aviation                                                                  | CVG      | CARILL                         | 
    Cat Aviation                                                                     | CAZ      | EUROCAT                        | 
    Caspian Airlines                                                                 | CPN      | CASPIAN                        | 
    Catalina Flying Boats                                                            | CBT      | CATALINA AIR                   | 
    Cathay Dragon                                                                    | HDA      | DRAGON                         | 
    Castle Aviation                                                                  | CSJ      | CASTLE                         | 
    Carpatair                                                                        | KRP      | CARPATAIR                      | 
    Cathay Pacific                                                                   | CPA      | CATHAY                         | 
    Cayman Airways                                                                   | CAY      | CAYMAN                         | 
    Caverton Helicopters                                                             | CJR      | CAVERTON AIR                   | 
    Cebu Pacific                                                                     | CEB      | CEBU                           | 
    Catex                                                                            | TEX      | CATEX                          | 
    Celtic Airways                                                                   | CEC      | CELTAIR                        | 
    Celtic West                                                                      | CWE      | CELTIC                         | 
    Cega Aviation                                                                    | CEG      | CEGA                           | 
    Carroll Air Service                                                              | ULS      | ULSTER                         | 
    Cecil Aviation                                                                   | CIL      | CECIL                          | 
    Centennial Airlines                                                              | CNL      | WYO-AIR                        | 
    Centrafrican Airlines                                                            | CET      | CENTRAFRICAIN                  | 
    Center Vol                                                                       | CVO      | CENTERVOL                      | 
    Cobalt Air LLC                                                                   | CNS      | CHRONOS                        | 
    Central Airlines                                                                 | CTL      | CENTRAL COMMUTER               | 
    Center-South                                                                     | CTS      | CENTER-SOUTH                   | 
    Central Air Express                                                              | CAX      | CENTRAL EXPRESS                | 
    Central American Airlines                                                        | ACN      | AEROCENTRO                     | 
    Central Aviation                                                                 | YOG      | YOGAN AIR                      | 
    Central European Airlines                                                        | CMA      | EUROCENTRAL                    | 
    Central Flying Service                                                           | CHA      | CHARTER CENTRAL                | 
    Central Airways                                                                  | CNY      | CENTRAL LEONE                  | 
    Centre d'Essais en Vol                                                           | CEV      | CENTEV                         | 
    Central Mongolia Airways                                                         | CEM      | CENTRAL MONGOLIA               | 
    Centre Airlines                                                                  | DTV      | DUTCH VALLEY                   | 
    Centre of Applied Geodynamica                                                    | CGS      | GEO CENTRE                     | 
    Central Skyport                                                                  | CSI      | SKYPORT                        | 
    Central Mountain Air                                                             | GLR      | GLACIER                        | 
    Centro de Formación Aeronáutica de Canarias                                      | ACF      | FORCAN                         | 
    Centralwings                                                                     | CLW      | CENTRALWINGS                   | 
    Central De Discos De Reynosa                                                     | DRN      | DISCOS REYNOSA                 | 
    Cetraca Aviation Service                                                         | CER      | CETRACA                        | 
    Century Aviation                                                                 | URY      | CENTURY AVIA                   | 
    Chabahar Airlines                                                                | IRU      | CHABAHAR                       | 
    Chalk's International Airlines                                                   | CHK      | CHALKS                         | 
    Centre-Avia                                                                      | CVC      | AVIACENTRE                     | 
    Challenge Air Transport                                                          | CLS      | AIRISTO                        | 
    Chalair Aviation                                                                 | CLG      | CHALLAIR                       | 
    Centro De Helicopteros Corporativos                                              | CCV      | HELICORPORATIVO                | 
    Centurion Air Cargo                                                              | CWC      | CHALLENGE CARGO                | 
    Champion Air                                                                     | CCP      | CHAMPION AIR                   | 
    Chanchangi Airlines                                                              | NCH      | CHANCHANGI                     | 
    Challenge Aero                                                                   | CHG      | SKY CHALLENGER                 | 
    Champagne Airlines                                                               | CPH      | CHAMPAGNE                      | 
    Chang An Airlines                                                                | CGN      | CHANGAN                        | 
    Challenge Aviation                                                               | CHS      | CHALLENGE AVIATION             | 
    Chantilly Air                                                                    | WML      | MARLIN                         | 
    Charlie Hammonds Flying Service                                                  | HMD      | HAMMOND                        | 
    Challenge International Airlines                                                 | OFF      | CHALLENGE AIR                  | 
    Charter Air                                                                      | CHW      | CHARTER WIEN                   | 
    Chautauqua Airlines                                                              | CHQ      | CHAUTAUQUA                     | Was US*
    Chartright Air                                                                   | HRT      | CHARTRIGHT                     | 
    Chaparral Airlines                                                               | CPL      | CHAPARRAL                      | 
    Cheboksary Airenterprise JSC                                                     | CBB      | CHEBAIR                        | 
    Channel Island Aviation                                                          | CHN      | CHANNEL                        | 
    Cherline                                                                         | CHZ      | CHERL                          | 
    Chernomor-Avia                                                                   | CMK      | CHERAVIA                       | 
    Chesapeake Air Service                                                           | CAB      | CHESAPEAKE AIR                 | 
    Chari Aviation Services                                                          | CSU      | CHARI SERVICE                  | 
    Cheyenne Airways                                                                 | CYA      | CHEYENNE AIR                   | 
    Chicago Jet Group                                                                | WDY      | WINDY CITY                     | 
    Chevron U.S.A                                                                    | CVR      | CHEVRON                        | 
    Chilchota Taxi Aéreo                                                             | CCH      | CHILCHOTA                      | 
    Chief Rat Flight Services                                                        | RAT      | RIVERRAT                       | 
    Chicago Air                                                                      | CGO      | WILD ONION                     | 
    Chilliwack Aviation                                                              | CAD      | CHILLIWACKAIR                  | 
    China Airlines                                                                   | CAL      | DYNASTY                        | 
    Chim-Nir Aviation                                                                | ETN      | CHIMNIR                        | 
    Chilcotin Caribou Aviation                                                       | DES      | CHILCOTIN                      | 
    China Express Airlines                                                           | HXA      | CHINA EXPRESS                  | 
    China Eastern Airlines                                                           | CES      | CHINA EASTERN                  | 
    Cherokee Express                                                                 | CBM      | BLUE MAX                       | 
    China Flying Dragon Aviation                                                     | CFA      | FEILONG                        | 
    Cherry Air                                                                       | CCY      | CHERRY                         | 
    China Ocean Helicopter Corporation                                               | CHC      | CHINA HELICOPTER               | 
    China National Aviation Corporation                                              | CAG      | CHINA NATIONAL                 | 
    China Postal Airlines                                                            | CYZ      | CHINA POST                     | 
    China Southern Airlines                                                          | CSN      | CHINA SOUTHERN                 | 
    China Xinhua Airlines                                                            | CXH      | XINHUA                         | 
    Chinguetti Airlines                                                              | CGU      | CHINGUETTI                     | 
    China General Aviation Corporation                                               | CTH      | TONGHANG                       | 
    China Cargo Airlines                                                             | CKK      | CARGO KING                     | 
    Chongqing Airlines                                                               | CQN      | CHONG QING                     | 
    China United Airlines                                                            | CUA      | LIANHANG                       | 
    Chitaavia                                                                        | CHF      | CHITA                          | 
    Chippewa Air Commuter                                                            | CPW      | CHIPPEWA-AIR                   | 
    Chipola Aviation                                                                 | CEP      | CHIPOLA                        | 
    Chrome Air Services                                                              | CHO      | CHROME AIR                     | 
    Cielos Airlines                                                                  | CIU      | CIELOS                         | 
    Christophorus Flugrettungsverein                                                 | OEC      | CHRISTOPHORUS                  | 
    Cinnamon Air                                                                     | CIN      | CINNAMON                       | 
    CitationAir                                                                      | FIV      | FIVE STAR                      | 
    Christman Air System                                                             | CAS      | CHRISTMAN                      | 
    Church Aircraft                                                                  | CHU      | CHURCHAIR                      | 
    City Airline                                                                     | SDR      | SWEDESTAR                      | 
    Citic General Aviation                                                           | HZX      | ZHONGXIN                       | 
    Cirrus Air                                                                       | NTS      | NITE STAR                      | 
    Cityline Hungary                                                                 | CNB      | CITYHUN                        | 
    CityJet                                                                          | BCY      | CITY-IRELAND                   | 
    Cityair                                                                          | CAQ      | AIR CHESTER                    | 
    Citylink Airlines                                                                | HSR      | HOOSIER                        | 
    Civil Air Patrol                                                                 | CAP      | CAP                            | 
    Cimber Sterling                                                                  | CIM      | CIMBER                         | 
    Civil Aviation Authority of New Zealand                                          | CIV      | CIVAIR                         | 
    Civair Airways                                                                   | CIW      | CIVFLIGHT                      | 
    Civil Aviation Authority                                                         | CIA      | CALIMERA                       | 
    Cityfly                                                                          | CII      | CITYFLY                        | 
    Clark Aviation                                                                   | CLK      | CLARKAIR                       | 
    Clasair                                                                          | CSF      | CALEDONIAN                     | 
    Civil Aviation Inspectorate of the Czech Republic                                | CBA      | CALIBRA                        | 
    Claessens International                                                          | FMC      | CLAESSENS                      | 
    Cloud 9 Air Charters                                                             | CLZ      | CLOUDLINE                      | 
    Clowes Estates                                                                   | CLD      | CLOWES                         | 
    Club Air                                                                         | ISG      | CLUBAIR                        | 
    Coastal Air Transport                                                            | TCL      | TRANS COASTAL                  | Escape Aviation
    Coastal Airways                                                                  | CNG      | SID-AIR                        | 
    Coastal Travels                                                                  | CSV      | COASTAL TRAVEL                 | 
    Cohlmia Aviation                                                                 | CHL      | COHLMIA                        | 
    Colaéreos                                                                        | OLR      | COLAEREOS                      | 
    Colemill Enterprises                                                             | CLE      | COLEMILL                       | 
    Colgan Air                                                                       | CJC      | COLGAN                         | 
    Click Airways                                                                    | CGK      | CLICK AIR                      | 
    Columbia Helicopters                                                             | WCO      | COLUMBIA HELI                  | 
    Columbus Air Transport                                                           | KLR      | KAY-LER                        | 
    Colvin Aviation                                                                  | GHP      | GRASSHOPPER EX                 | 
    Comair                                                                           | COM      | COMAIR                         | 
    Comair                                                                           | CAW      | COMMERCIAL                     | 
    Colibri Aviation                                                                 | CAE      | HUMMINGBIRD                    | 
    Comair Flight Services                                                           | GCM      | GLOBECOM                       | 
    Comeravia                                                                        | CVV      | COMERAVIA                      | 
    Comercial Aérea                                                                  | CRS      | COMERCIAL AEREA                | 
    Comet Airlines                                                                   | CMG      | SUNSPY                         | 
    Comed Group                                                                      | CDE      | COMEX                          | 
    Comfort Air                                                                      | FYN      | FLYNN                          | 
    Comfort Jet Services                                                             | CMJ      | COMFORT JET                    | 
    Coast Air                                                                        | CST      | COAST CENTER                   | 
    Commair Aviation                                                                 | CMH      | COMMODORE                      | 
    Commandement Du Transport Aerien Militaire Francais                              | CTM      | COTAM                          | 
    Commander Mexicana                                                               | CRM      | COMMANDERMEX                   | 
    Commercial Aviation                                                              | CMS      | ACCESS                         | 
    Commonwealth Jet Service                                                         | CJS      | COMMONWEALTH                   | 
    Commander Air Charter                                                            | CML      | COMMANDAIR                     | 
    Comores Airlines                                                                 | CWK      | CONTICOM                       | 
    Clay Lacy Aviation                                                               | CLY      | CLAY-LACY                      | 
    Club 328                                                                         | SDJ      | SPACEJET                       | 
    Compagnie Aérienne du Mali                                                       | CMM      | CAMALI                         | 
    Compañía Aerotécnicas Fotográficas                                               | ATF      | AEROTECNICAS                   | 
    Compagnia Generale Ripreseaeree                                                  | CGR      | COMPRIP                        | 
    Compañía De Actividades Y Servicios De Aviación                                  | LCT      | STELLAIR                       | 
    CommutAir                                                                        | UCA      | COMMUTAIR                      | 
    Comlux Aviation                                                                  | CLA      | COMLUX                         | 
    Compania Mexicargo                                                               | MXC      | MEXICARGO                      | 
    Compañía Transportes Aéreos Del Sur                                              | HSS      | TAS HELICOPTEROS               | 
    Compañía de Servicios Aéreos Tavisa                                              | TAV      | TAVISA                         | 
        Flight                                                                          | CYF      | COMPANY FLIGHT                 | 
    Compania Mexicana De Aeroplanos                                                  | MDR      | AEROPLANOS                     | 
    Compass Airlines                                                                 | CPZ      | COMPASS ROSE                   | 
    Compagnie de Bauxites de Guinee                                                  | GIC      | CEBEGE                         | 
    Conair Aviation                                                                  | CRC      | CONAIR-CANADA                  | 
    Compass International Airways                                                    | CPS      | COMPASS                        | 
    Concordavia                                                                      | COD      | CONCORDAVIA                    | 
    Condor                                                                           | CIB      | CONDOR BERLIN                  | 
    Condor Flugdienst                                                                | CFG      | CONDOR                         | 
    Congressional Air                                                                | CGA      | CONGRESSIONAL                  | 
    Connectair Charters                                                              | BSN      | BASTION                        | 
    Compania Ejecutiva                                                               | EJV      | EJECUTIVA                      | 
    Conroe Aviation Services                                                         | CXO      | CONROE AIR                     | 
    Condor Aero Services                                                             | CNR      | CONAERO                        | 
    Consorcio Helitec                                                                | VCH      | CONSORCIO HELITEC              | 
    Conquest Airlines                                                                | CAC      | CONQUEST AIR                   | 
    Constanta Airline                                                                | UZA      | CONSTANTA                      | 
    Confort Air                                                                      | COF      | CONFORT                        | 
    Compania Helicopteros Del Sureste                                                | HSE      | HELISURESTE                    | 
    Contactair                                                                       | KIS      | CONTACTAIR                     | 
    Conviasa                                                                         | VCV      | CONVIASA                       | 
    Cooper Aerial Surveys                                                            | SVY      | SURVEYOR                       | 
    Continental Oil                                                                  | CON      | CONOCO                         | 
    Copa Airlines                                                                    | CMP      | COPA                           | 
    Copterline                                                                       | AAQ      | COPTERLINE                     | Former name: Copter Action; former callsign: COPTER ACTION
    Corendon Airlines                                                                | CAI      | CORENDON                       | Turistik Hava Tasimacilik
    Coronado Aerolíneas                                                              | CRA      | CORAL                          | 
    Central Charter                                                                  | CCW      | CENTRAL CHARTER                | 
    Corendon Dutch Airlines                                                          | CND      | DUTCH CORENDON                 | 
    Corporación Aéreo Cencor                                                         | CNC      | CENCOR                         | 
    Cook Inlet Aviation                                                              | CKA      | COOK-AIR                       | 
    Copper State Air Service                                                         | COP      | COPPER STATE                   | 
    Corpac Canada                                                                    | CPB      | PENTA                          | 
    Continental Micronesia                                                           | CMI      | AIR MIKE                       | 
    Copenhagen Air Taxi                                                              | CAT      | AIRCAT                         | 
    Corporate Air                                                                    | CPR      | CORPAIR                        | 
    Corporate Air                                                                    | CPT      | AIR SPUR                       | 
    Corporacion Aeroangeles                                                          | CPG      | CORPORANG                      | 
    Corporate Aviation Services                                                      | CKE      | CHECKMATE                      | 
    Air Corsica                                                                      | CCM      | CORSICA                        | Name changed to Air Corsica
    Contour Airlines                                                                 | VTE      | VOLUNTEER                      | 
    Corsairfly                                                                       | CRL      | CORSAIR                        | 
    Corporate Flight International                                                   | VHT      | VEGAS HEAT                     | 
    Corporate Jets                                                                   | CJI      | SEA JET                        | 
    Courier Services                                                                 | CSD      | DELIVERY                       | 
    Cougar Helicopters                                                               | CHI      | COUGAR                         | 
    Court Helicopters                                                                | CUT      | COURT AIR                      | 
    Cosmic Air                                                                       | COZ      | COSMIC AIR                     | 
    Coval Air                                                                        | CVL      | COVAL                          | 
    COWI                                                                             | COW      | COWI                           | 
    Cree Airways                                                                     | CRE      | CREE AIR                       | 
    Coulson Flying Service                                                           | MGB      | MOCKINGBIRD                    | 
    Crelam                                                                           | ELM      | CRELAM                         | 
    Corporate Aircraft                                                               | CPO      | MOKAN                          | 
    Corporate Airlink                                                                | COO      | CORPORATE                      | 
    Crimea Universal Avia                                                            | KRM      | TRANS UNIVERSAL                | 
    Cranfield University                                                             | CFD      | AERONAUT                       | 
    Crest Aviation                                                                   | CAN      | CREST                          | 
    Crossair Europe                                                                  | ECC      | CIGOGNE                        | 
    Crown Air Systems                                                                | CKR      | CROWN AIR                      | 
    Crow Executive Air                                                               | CWX      | CROW EXPRESS                   | 
    Cross Aviation                                                                   | CRX      | CROSSAIR                       | 
    Coyne Aviation                                                                   | COY      | COYNE AIR                      | 
    Croatia Airlines                                                                 | CTN      | CROATIA                        | 
    Cruiser Linhas Aéreas                                                            | VCR      | VOE CRUISER                    | 
    Cryderman Air Service                                                            | CTY      | CENTURY                        | 
    Crystal Shamrock Airlines                                                        | CYT      | CRYSTAL-AIR                    | 
    Croatian Air Force                                                               | HRZ      | CROATIAN AIRFORCE              | 
    Cubana de Aviación                                                               | CUB      | CUBANA                         | 
    Cutter Aviation                                                                  | CTF      | CUTTER FLIGHT                  | 
    CSA Air                                                                          | IRO      | IRON AIR                       | 
    Cumberland Airways                                                               | CBL      | CUMBERLAND                     | 
    Cypress Airlines                                                                 | CYS      | SKYBIRD                        | 
    Crown Airways                                                                    | CRO      | CROWN AIRWAYS                  | 
    Cygnus Air                                                                       | RGN      | CYGNUS AIR                     | 
    Custom Air Transport                                                             | CTT      | CATT                           | 
    Cyprair Tours                                                                    | CYC      | CYPRAIR                        | 
    Crownair                                                                         | CRW      | REGAL                          | 
    Czech Air Handling                                                               | AHD      | AIRHANDLING                    | 
    Cyprus Airways                                                                   | CYP      | CYPRUS                         | 
    Czech Government Flying Service                                                  | CIE      | CZECH REPUBLIC                 | 
    CemAir                                                                           | KEM      | CEMAIR                         | 
    Centro de Servicio Aeronautico                                                   | JLH      | CESA                           | 
    Cobalt                                                                           | FCB      | NEW AGE                        | 
    CDI Cargo Airlines                                                               | CDC      | HUALONG                        | 
    Czech Airlines                                                                   | CSA      | CSA                            | 
    Clickair                                                                         | CLI      | CLICKJET                       | Merge into Vueling
    Delta Private Jets                                                               | DPJ      | JET CARD                       | Changed from ELJ/ELITE JET in 2014
    Czech Air Force                                                                  | CEF      | CZECH AIR FORCE                | 
    Dreamjet                                                                         | DJT      | DREAMJET                       | 2014
    West Air                                                                         | CHB      | WEST CHINA                     | 
    CAVOK Airlines                                                                   | CVK      | CARGO LINE                     | 
    Dehong South Asian General Aviation                                              | DLC      | SOARCOPTER                     | Was Ruili Jingcheng Helicopters
    Aero-Beta                                                                        | ABA      | AEROBETA                       | 
    Desert Jet                                                                       | DJR      | DESERT FLIGHT                  | 
    D & D Aviation                                                                   | DDA      | DUSTY                          | 
    CHC Helicopters Netherlands                                                      | HNL      | MAPLELEAF                      | 
    DanubeWings                                                                      | VPA      | VIP TAXI                       | Former names VIP Air and VIP Wings
    DMCFLY                                                                           | DMF      | DEMLY                          | 
    D&K Aviation                                                                     | DNK      | DIRECT JET                     | 
    DAS Air Cargo                                                                    | DSR      | DAIRAIR                        | 
    DAP Helicopteros                                                                 | DHE      | HELIDAP                        | 
    Danaus Lineas Aereas                                                             | NAU      | DANAUS                         | 
    Air Dolomiti                                                                     | DLA      | DOLOMITI                       | 
    DFS UK                                                                           | VLF      | VOLANTE                        | 
    DERA Boscombe Down                                                               | BDN      | GAUNTLET                       | 
    DHL Aero Expreso                                                                 | DAE      | YELLOW                         | 
    DHL Air                                                                          | DHK      | WORLD EXPRESS                  | DHL Air UK
    DESNA                                                                            | DSN      | DESNA                          | 
    DHL Aviation                                                                     | DHV      | WORLDSTAR                      | 
    DETA Air                                                                         | DET      | SAMAL                          | 
    DGO Jet                                                                          | DGO      | DGO JET                        | 
    DAT Danish Air Transport                                                         | DTR      | DANISH                         | 
    DSWA                                                                             | RSK      | REDSKIN                        | 
    DAS Airlines                                                                     | RKC      | DAS CONGO                      | 
    DHL International                                                                | DHX      | DILMUN                         | 
    Daallo Airlines                                                                  | DAO      | DALO AIRLINES                  | 
    DC Aviation                                                                      | DCS      | TWIN STAR                      | 
    Dala Air Services                                                                | DLR      | DALA AIR                       | 
    Daimler-Chrysler                                                                 | DCX      | DAIMLER                        | 
    Dagestan Airlines                                                                | DAG      | DAGAL                          | 
    Dalavia                                                                          | KHB      | DALAVIA                        | 
    Damascene Airways                                                                | DAS      | AIRDAM                         | 
    Danish Navy                                                                      | DNY      | DANISH NAVY                    | 
    Danbury Airways                                                                  | DSA      | DANBURY AIRWAYS                | 
    Danish Air Force                                                                 | DAF      | DANISH AIRFORCE                | 
    Danish Army                                                                      | DAR      | DANISH ARMY                    | 
    Darwin Airline                                                                   | DWT      | DARWIN                         | 
    Dallas Express Airlines                                                          | DXP      | DALLAS EXPRESS                 | 
    Danu Oro Transportas                                                             | DNU      | DANU                           | 
    Dash Aviation                                                                    | GOB      | PILGRIM                        | 
    Dasnair                                                                          | DGX      | DASNA                          | 
    Darta                                                                            | DRT      | DARTA                          | 
    Dancopter                                                                        | DOP      | DANCOPTER                      | 
    Dasab Airlines                                                                   | DSQ      | DASAB AIR                      | 
    Dawn Air                                                                         | DWN      | DAWN AIR                       | 
    Dauair                                                                           | DAU      | DAUAIR                         | 
    Dash Air Charter                                                                 | DSH      | DASH CHARTER                   | 
    Dassault Falcon Jet Corporation                                                  | CVF      | CLOVERLEAF                     | 
    Data International                                                               | DTN      | DATA AIR                       | 
    Daya Aviation                                                                    | DAY      | DAYA                           | 
    Decatur Aviation                                                                 | DAA      | DECUR                          | 
    Dassault Falcon Service                                                          | DSO      | DASSAULT                       | 
    Deadalos Flugtbetriebs                                                           | IAY      | IASON                          | 
    Deere and                                                                        | JDC      | JOHN DEERE                     | 
    Delta Air Charter                                                                | SNO      | SNOWBALL                       | 
    Delta Aerotaxi                                                                   | DEA      | JET SERVICE                    | 
    Delta Private Jets                                                               | DPJ      | JET CARD                       | Changed to DPJ/JET CARD in 2014
    Delaware Skyways                                                                 | DWR      | DELAWARE                       | 
    De Havilland                                                                     | DHC      | DEHAVILLAND                    | 
    Delta Express International                                                      | DLI      | DELTA EXPRESS                  | 
    Delta State University                                                           | DSU      | DELTA STATE                    | 
    Delta Air Lines                                                                  | DAL      | DELTA                          | 
    Delta Engineering Aviation                                                       | KMB      | KEMBLEJET                      | 
    Denver Express                                                                   | FEC      | FALCON EXPRESS                 | 
    DayJet                                                                           | DJS      | DAYJET                         | 
    Deccan Charters                                                                  | DKN      | DECCAN                         | 
    Destiny Air Services                                                             | DTY      | DESTINY                        | 
    Deutsche Rettungsflugwacht                                                       | AMB      | CIVIL AIR AMBULANCE            | 
    Denver Jet                                                                       | DJT      | DENVER JET                     | 
    Di Air                                                                           | DIS      | DI AIR                         | 
    Departament d'Agricultura de la Generalitat de Catalunya                         | FGC      | FORESTALS                      | 
    Deutsches Zentrum fur Luft-und Raumfahrt EV                                      | LFO      | LUFO                           | 
    Deraya Air Taxi                                                                  | DRY      | DERAYA                         | 
    Diplomatic Freight Services                                                      | DIP      | DIPFREIGHT                     | 
    Direct Air                                                                       | DIA      | BLUE SKY                       | 
    Dirección General de Aviación Civil y Telecomunicasciones                        | ENA      | ENA                            | 
    Direct Air trading as Midway Connection                                          | XAP      | MID-TOWN                       | 
    Diamond Aviation                                                                 | SPK      | SPARKLE                        | 
    Desarrollo Milaz                                                                 | MIZ      | MILAZ                          | 
    Dirgantara Air Service                                                           | DIR      | DIRGANTARA                     | 
    Dixie Airways                                                                    | DEE      | TACAIR                         | 
    Discover Air                                                                     | DCV      | DISCOVER                       | 
    Didier Rousset Buy                                                               | DRB      | DIDIER                         | 
    Dolphin Air                                                                      | FDN      | FLYING DOLPHIN                 | 
    Discovery Airways                                                                | DVA      | DISCOVERY AIRWAYS              | 
    Dniproavia                                                                       | UDN      | DNIEPRO                        | 
    Dolphin Express Airlines                                                         | IXX      | ISLAND EXPRESS                 | 
    Digital Equipment Corporation                                                    | DGT      | DIGITAL                        | 
    Dix Aviation                                                                     | DIX      | DIX FLIGHT                     | 
    Donavia                                                                          | DNV      | DONAVIA                        | formerly Aeroflot-Don
    Dominguez Toledo                                                                 | MYO      | MAYORAL                        | 
    Don Avia                                                                         | DVB      | DONSEBAI                       | 
    Donair Flying Club                                                               | DON      | DONAIR                         | 
    Dorado Air                                                                       | DAD      | DORADO AIR                     | 
    DonbassAero                                                                      | UDC      | DONBASS AERO                   | 
    Dornier                                                                          | DOR      | DORNIER                        | 
    Dornier Aviation Nigeria                                                         | DAV      | DANA AIR                       | 
    Dome Petroleum                                                                   | DPL      | DOME                           | 
    Druk Air                                                                         | DRK      | ROYAL BHUTAN                   | 
    Drummond Island Air                                                              | DRE      | MICHIGAN                       | 
    Dubrovnik Air                                                                    | DBK      | SEAGULL                        | 
    Dreamcatcher Airways                                                             | DCA      | DREAM CATCHER                  | 
    Dos Mundos                                                                       | DOM      | DOS MUNDOS                     | 
    Duncan Aviation                                                                  | PHD      | PANHANDLE                      | 
    Dubai Airwing                                                                    | DUB      | DUBAI                          | 
    Ducair                                                                           | DUK      | LION KING                      | 
    Dun'Air                                                                          | DUN      | DUNAIR                         | 
    UK Royal/HRH Duke of York                                                        | LPD      | LEOPARD                        | 
    Duchess of Britany                                                               | DBJ      | DUCHESS                        | 
    Durango Jet                                                                      | DJE      | DURANGO JET                    | 
    Dutch Caribbean Express                                                          | DCE      | DUTCH CARIBBEAN                | 
    Dwyer Aircraft Services                                                          | DFS      | DWYAIR                         | 
    Envoy Air                                                                        | ENY      | ENVOY                          | 2014
    Dutch Antilles Express                                                           | DNL      | DUTCH ANTILLES                 | 
    Air Berlin                                                                       | BAG      | SPEEDWAY                       | Merged into Air Berlin
    Dynamair Aviation                                                                | DNR      | DYNAMAIR                       | 
    Executive Airlink                                                                | ENK      | SUNBIRD                        | Allocated in 2014
    Dynamic Airways                                                                  | DYA      | DYNAMIC AIR                    | 
    Everett Aviation                                                                 | EVK      | EVERETT                        | 
    Ellinair                                                                         | ELB      | ELLINAIR HELLAS                | 
    Eleron Aviation                                                                  | ELN      | ELERON                         | 
    Eclair Aviation                                                                  | ECC      | ECLAIR                         | 
    Egyptian Leisure Airlines                                                        | ELU      | EGYPTIAN LEISURE               | 
    Executive Express Aviation/JA Air Charter                                        | LTD      | LIGHT SPEED                    | 
    Duo Airways                                                                      | DUO      | FLY DUO                        | 
    Endeavor Air                                                                     | EDV      | ENDEAVOR                       | 
    Express Airways                                                                  | EPR      | EMPEROR                        | 
    Excel-Aire Service                                                               | XSL      | EXCELAIRE                      | 
    Dunyaya Bakis Hava Tasimaciligi                                                  | VVF      | WORLDFOCUS                     | 
    Executive Flight Services                                                        | XSR      | AIRSHARE                       | 
    Elite Airways                                                                    | MNU      | MAINER                         | 
    E H Darby Aviation                                                               | EHD      | PLATINUM AIR                   | 
    Executive Airlines Services                                                      | EXW      | ECHOLINE                       | 
    Ezjet GT                                                                         | EZJ      | GUYANA JET                     | 
    Eagle Express Air Charter                                                        | EZX      | EAGLEXPRESS                    | 
    EFS-Flugservice                                                                  | FSD      | FLUGSERVICE                    | 
    EFAOS- Agencia De Viagens e Turismo                                              | EFS      | EFAOS                          | 
    Eisele Flugdienst                                                                | EFD      | EVER FLIGHT                    | 
    ESI Eliservizi Italiani                                                          | ESI      | ELISERVIZI                     | 
    EVA Air                                                                          | EVA      | EVA                            | 
    EU Airways                                                                       | EUY      | EUROAIRWAYS                    | 
    Eagle Air                                                                        | EGR      | EAGLE SIERRA                   | 
    EIS Aircraft                                                                     | EIS      | COOL                           | 
    Eagle Aero                                                                       | ICR      | ICARUS FLIGHTS                 | 
    EPAG                                                                             | IAG      | EPAG                           | 
    Eagle Air                                                                        | FEI      | ARCTIC EAGLE                   | 
    Eagle Aviation France                                                            | EGN      | FRENCH EAGLE                   | 
    Eagle Airways                                                                    | EAG      | EAGLE                          | 
    Eagle Air                                                                        | EGU      | AFRICAN EAGLE                  | 
    Eagle Aviation                                                                   | GYP      | GYPSY                          | 
    Eagle International                                                              | SEG      | SEN-EAGLE                      | 
    Eagle Air                                                                        | EGX      | THAI EAGLE                     | 
    Eagle Jet Charter                                                                | EGJ      | EAGLE JET                      | 
    Earth Airlines Services                                                          | ERX      | EARTH AIR                      | 
    East African Safari Air Express                                                  | EXZ      | TWIGA                          | 
    UTair-Ukraine                                                                    | UTN      | UT UKRAINE                     | 
    East Coast Jets                                                                  | ECJ      | EASTCOAST JET                  | 
    East Hampton Aire                                                                | EHA      | AIRE HAMPTON                   | 
    East Kansas City Aviation                                                        | EKC      | BLUE GOOSE                     | 
    East Midlands Helicopters                                                        | CTK      | COSTOCK                        | 
    East African Safari Air                                                          | HSA      | DUMA                           | 
    East Star Airlines                                                               | DXH      | EAST STAR                      | 
    Eastern Air Executive                                                            | EAX      | EASTEX                         | 
    East Coast Airways                                                               | ECT      | EASTWAY                        | 
    Eastern Air Lines                                                                | EAL      | EASTERN                        | 2015
    Eastern Australia Airlines                                                       | EAQ      | EASTERN                        | IATA dupe with parent QANTAS. Also uses 2 letter ICAO EA.
    Eaglemed                                                                         | EMD      | EAGLEMED                       | 
    Eastern Air                                                                      | EAZ      | EASAIR                         | 
    Eastern Express                                                                  | LIS      | LARISA                         | 
    Eastar Jet                                                                       | ESR      | EASTAR                         | 
    Eastern Pacific Aviation                                                         | EPB      | EAST PAC                       | 
    Eastern Airways                                                                  | EZE      | EASTFLIGHT                     | 
    Eastern Executive Air Charter                                                    | GNS      | GENESIS                        | 
    Eastern SkyJets                                                                  | ESJ      | EASTERN SKYJETS                | 
    Eastern Metro Express                                                            | EME      | EMAIR                          | 
    Easy Link Aviation Services                                                      | FYE      | FLYME                          | 
    Eclipse Aviation                                                                 | EJT      | ECLIPSE JET                    | 
    Eckles Aircraft                                                                  | CMN      | CIMMARON AIRE                  | 
    Eco Air                                                                          | ECQ      | SKYBRIDGE                      | 
    Ecuatoguineana De Aviación                                                       | ECV      | EQUATOGUINEA                   | 
    Ecomex Air Cargo                                                                 | ECX      | AIR ECOMEX                     | 
    Ecotour                                                                          | ECD      | ECOTOUR                        | 
    Ecuavia                                                                          | ECU      | ECUAVIA                        | 
    Air Charter Scotland                                                             | EDC      | SALTIRE                        | Previously: Edinburgh Air Charter
    Eastern Carolina Aviation                                                        | ECI      | EASTERN CAROLINA               | 
    Ecoturistica de Xcalak                                                           | XCC      | XCALAK                         | 
    Edwards Jet Center of Montana                                                    | EDJ      | EDWARDS                        | 
    Edgartown Air                                                                    | SLO      | SLOW                           | 
    Edelweiss Air                                                                    | EDW      | EDELWEISS                      | 
    Ecuatorial Cargo                                                                 | EQC      | ECUA-CARGO                     | 
    Efata Papua Airlines                                                             | EIJ      | EFATA                          | 
    EFS European Flight Service                                                      | EUW      | EUROWEST                       | 
    Egyptair Cargo                                                                   | MSX      | EGYPTAIR CARGO                 | 
    Ei Air Exports                                                                   | EIX      | AIR EXPORTS                    | 
    El Caminante Taxi Aéreo                                                          | CMX      | EL CAMINANTE                   | 
    Eirjet                                                                           | EIR      | EIRJET                         | 
    El Sol De América                                                                | ESC      | SOLAMERICA                     | 
    El-Buraq Air Transport                                                           | BRQ      | BURAQAIR                       | 
    Egyptair                                                                         | MSR      | EGYPTAIR                       | 
    El Al Israel Airlines                                                            | ELY      | ELAL                           | 
    El Quilada International Aviation                                                | GLQ      | QUILADA                        | 
    Elbe Air Transport                                                               | LBR      | MOTION                         | 
    Elan Express                                                                     | ELX      | ELAN                           | 
    El Sal Air                                                                       | ELS      | EL SAL                         | 
    Elicar                                                                           | PDV      | ELICAR                         | 
    Eldinder Aviation                                                                | DND      | DINDER                         | 
    Elbrus-Avia Air Enterprise                                                       | NLK      | ELAVIA                         | 
    Elidolomiti                                                                      | EDO      | ELIDOLOMITI                    | 
    Elilombarda                                                                      | EOA      | LOMBARDA                       | 
    Elilario Italia                                                                  | ELH      | LARIO                          | 
    Elios                                                                            | VUL      | ELIOS                          | 
    Elipiu'                                                                          | IEP      | ELIPIU                         | 
    Elisra Airlines                                                                  | RSA      | ESRA                           | 
    Elimediterranea                                                                  | MEE      | ELIMEDITERRANEA                | 
    Elifriulia                                                                       | EFG      | ELIFRIULIA                     | 
    Elitellina                                                                       | FGS      | ELITELLINA                     | 
    Elliott Aviation                                                                 | ELT      | ELLIOT                         | 
    Elite Jets                                                                       | EJD      | ELITE DUBAI                    | 
    Embassy Airlines                                                                 | EAM      | EMBASSY AIR                    | 
    Embry-Riddle Aeronautical University Sesatlab                                    | XSL      | SATSLAB                        | Sesatlab Proof-of-Concept Flight
    Elmagal Aviation Services                                                        | MGG      | ELMAGAL                        | 
    Empresa Brasileira De Aeronáutica                                                | EMB      | EMBRAER                        | 
    Emirates Airlines                                                                | UAE      | EMIRATES                       | 
    Emerald Airways                                                                  | JEM      | GEMSTONE                       | 
    Mount Air                                                                        | SBC      | SABIAN AIR                     | Mount Air
    Empire Airlines                                                                  | CFS      | EMPIRE AIR                     | 
    Emery Worldwide Airlines                                                         | EWW      | EMERY                          | 
    Elite Air                                                                        | EAI      | ELAIR                          | 
    Emetebe                                                                          | EMT      | EMETEBE                        | 
    Embassy Freight                                                                  | EFT      | EMBASSY FREIGHT                | 
    Empresa Aviación Interamericana                                                  | VNA      | EBBA                           | 
    Empire Test Pilots' School                                                       | ETP      | TESTER                         | 
    Empresa Ecuatoriana De Aviación                                                  | EEA      | ECUATORIANA                    | 
    Empire Air Service                                                               | EMP      | EMPIRE                         | 
    Empresa Nacional De Servicios Aéreos                                             | CNI      | SERAER                         | 
    Empresa Aero-Servicios Parrague                                                  | PRG      | ASPAR                          | 
    Empresa de Aviación Aerogaviota                                                  | GTV      | GAVIOTA                        | 
    Empresa                                                                          | AUO      | UNIFORM OSCAR                  | 
    Empresa Aerocaribbean                                                            | CRN      | AEROCARIBBEAN                  | 
    Empresa Venezolana                                                               | VNE      | VENEZOLANA                     | 
    Endecots                                                                         | ENC      | ENDECOTS                       | 
    Empressa Brasileira de Infra-Estrutura Aeroportuaria-Infraero                    | XLT      | INFRAERO                       | 
    Enrique Gleisner Vivanco                                                         | EGV      | GLEISNER                       | 
    Enkor JSC                                                                        | ENK      | ENKOR                          | 
    Ensenada Vuelos Especiales                                                       | ESE      | ENSENADA ESPECIAL              | 
    Entergy Services                                                                 | ENS      | ENTERGY SHUTTLE                | 
    Enterprise World Airways                                                         | EWS      | WORLD ENTERPRISE               | 
    Enter Air                                                                        | ENT      | ENTER                          | 
    Enimex                                                                           | ENI      | ENIMEX                         | 
    Eram Air                                                                         | IRY      | ERAM AIR                       | 
    Equatair Air Services                                                            | EQZ      | ZAMBIA CARGO                   | 
    Era Helicopters                                                                  | ERH      | ERAH                           | 
    Erie Airways                                                                     | ERE      | AIR ERIE                       | 
    Escola De Aviacao Aerocondor                                                     | EAD      | AERO-ESCOLA                    | 
    Eos Airlines                                                                     | ESS      | NEW DAWN                       | 
    Eritrean Airlines                                                                | ERT      | ERITREAN                       | 
    Escuela De Pilotos Are Aviación                                                  | CTV      | ARE AVIACION                   | 
    Erfoto                                                                           | ERF      | ERFOTO                         | 
    Equaflight Service                                                               | EKA      | EQUAFLIGHT                     | 
    Estonian Air Force                                                               | EEF      | ESTONIAN AIR FORCE             | 
    Espace Aviation Services                                                         | EPC      | ESPACE                         | 
    Esso Resources Canada                                                            | ERC      | ESSO                           | 
    Estrellas Del Aire                                                               | ETA      | ESTRELLAS                      | 
    Ethiopian Airlines                                                               | ETH      | ETHIOPIAN                      | 
    Etihad Airways                                                                   | ETD      | ETIHAD                         | 
    Etram Air Wing                                                                   | ETM      | ETRAM                          | 
    Euro Continental AIE                                                             | ECN      | EURO CONTINENTAL               | 
    Euro Sun                                                                         | ESN      | EURO SUN                       | 
    Euro-Asia Air International                                                      | KZE      | KAZEUR                         | 
    Euraviation                                                                      | EVN      | EURAVIATION                    | 
    Euro-Asia Air                                                                    | EAK      | EAKAZ                          | 
    EuroJet Aviation                                                                 | GOJ      | GOJET                          | 
    Estonian Air                                                                     | ELL      | ESTONIAN                       | 
    Euroamerican Air                                                                 | EUU      | EUROAMERICAN                   | 
    Eti 2000                                                                         | MJM      | ELCO ETI                       | 
    Eurocypria Airlines                                                              | ECA      | EUROCYPRIA                     | 
    Pan Europeenne Air Service                                                       | EUP      | SAVOY                          | 
    Eurofly                                                                          | EEZ      | E-FLY                          | 
    Euroguineana de Aviación                                                         | EUG      | EUROGUINEA                     | 
    Euroceltic Airways                                                               | ECY      | ECHELON                        | 
    Eurojet Italia                                                                   | ERJ      | JET ITALIA                     | 
    Eurofly Service                                                                  | EEU      | EUROFLY                        | 
    Eurojet Romania                                                                  | RDP      | JET-ARROW                      | 
    EuroAtlantic Airways                                                             | MMZ      | EUROATLANTIC                   | 
    Eurocopter                                                                       | ECF      | EUROCOPTER                     | 
    Eurojet Servis                                                                   | EJS      | EEJAY SERVICE                  | 
    Euromanx Airways                                                                 | EMX      | EUROMANX                       | 
    Europe Air Lines                                                                 | GED      | LANGUEDOC                      | 
    Europe Airpost                                                                   | FPO      | FRENCH POST                    | 
    European Air Express                                                             | EAL      | STAR WING                      | 
    Eurolot                                                                          | ELO      | EUROLOT                        | 
    European 2000 Airlines                                                           | EUT      | FIESTA                         | 
    European Air Transport                                                           | BCS      | EUROTRANS                      | 
    European Executive                                                               | ETV      | EURO EXEC                      | 
    European Executive Express                                                       | EXC      | ECHO EXPRESS                   | 
    European Aviation Air Charter                                                    | EAF      | EUROCHARTER                    | 
    Eurowings                                                                        | EWG      | EUROWINGS                      | 
    European Coastal Airlines                                                        | ECB      | COASTAL CLIPPER                | 
    Euroskylink                                                                      | ESX      | CATFISH                        | 
    Evelop Airlines                                                                  | EVE      | EVELOP                         | 
    Evergreen International Airlines                                                 | EIA      | EVERGREEN                      | 
    Everts Air Alaska/Everts Air Cargo                                               | VTS      | EVERTS                         | 
    Ewa Air                                                                          | EWR      | MAYOTTE AIR                    | 
    Examiner Training Agency                                                         | EMN      | AGENCY                         | 
    Excel Airways                                                                    | XLA      | EXPO                           | 
    Excellent Air                                                                    | GZA      | EXCELLENT AIR                  | 
    Excel Charter                                                                    | XEL      | HELI EXCEL                     | 
    Execair Aviation                                                                 | EXA      | CANADIAN EXECAIRE              | 
    Eurojet                                                                          | JLN      | JET LINE                       | 
    Execujet Charter                                                                 | VCN      | AVCON                          | 
    Execujet Scandinavia                                                             | VMP      | VAMPIRE                        | 
    Eurosense                                                                        | EBG      | EUROSENSE                      | 
    Executive Air Charter                                                            | EAC      | EXECAIR                        | 
    American Eagle                                                                   | EXK      | EXECUTIVE EAGLE                | American Eagle
    Eurowings Europe                                                                 | EWE      | EUROWINGS                      | 
    Executive Air                                                                    | LFL      | LIFE FLIGHT                    | 
    Execujet Middle East                                                             | EJO      | MIDJET                         | 
    Executive Flight                                                                 | EXE      | EXEC                           | 
    Executive Flight Operations Ontario Government                                   | TRI      | TRILLIUM                       | 
    Executive Jet Management                                                         | EJM      | JET SPEED                      | 
    Eximflight                                                                       | EXF      | EXIMFLIGHT                     | 
    Executive Aircraft Charter                                                       | ECS      | ECHO                           | 
    Expertos En Carga                                                                | EXR      | EXPERTOS ENCARGA               | 
    Executive Airlines                                                               | EXU      | SACAIR                         | 
    Executive Turbine Aviation                                                       | TEA      | TRAVELMAX                      | 
    Express International Cargo                                                      | EIC      | EXCARGO                        | 
    Exin                                                                             | EXN      | EXIN                           | 
    Express Air                                                                      | FXA      | EFFEX                          | 
    Executive Aviation Services                                                      | JTR      | JESTER                         | 
    Express Tours                                                                    | XTO      | EXPRESS TOURS                  | 
    Express Line Air                                                                 | XPL      | EXPRESSLINE                    | 
    ExpressJet                                                                       | ASQ      | ACEY                           | 
    ExxAero                                                                          | XRO      | CRAMER                         | 
    easyJet Switzerland                                                              | EZS      | TOPSWISS                       | 
    easyJet UK                                                                       | EZY      | EASY                           | 
    Exxavia                                                                          | JTM      | SKYMAN                         | 
    Evolem Aviation                                                                  | EVL      | EVOLEM                         | 
    Florida Aerocharter                                                              | KWX      | KAY DUB                        | Allocated in 2014
    Fly Advance                                                                      | VNX      | VANCE                          | Allocated in 2014
    Eagle Airlines                                                                   | EAV      | MAYFLOWER                      | 
    Florida Air Cargo                                                                | FAS      | FLORIDA CARGO                  | Allocated in 2014
    FMI Air                                                                          | FMI      | FIRST MYANMAR                  | 
    easyJet Europe                                                                   | EJU      | ALPINE                         | 
    Fast Air                                                                         | PBR      | POLAR BEAR                     | 
    Fort Aero                                                                        | FRX      | FORT AERO                      | 
    Fuxion Line Mexico                                                               | FUM      | FUNLINE                        | 
    F Air                                                                            | FAP      | FAIR SCHOOL                    | 
    F.S. Air Service                                                                 | EYE      | SOCKEYE                        | 
    Fly Rak                                                                          | FRB      | RAKWAY                         | 
    Express Net Airlines                                                             | XNA      | EXPRESSNET                     | 
    ForeFlight                                                                       | FFL      | FOREFLIGHT                     | 
    Fastjet                                                                          | FTZ      | GREY BIRD                      | 
    FLTPLAN                                                                          | DCM      | DOT COM                        | 
    FAI Air Service                                                                  | IFA      | RED ANGEL                      | 
    FLM Aviation Mohrdieck                                                           | FKI      | KIEL AIR                       | 
    FINFO Flight Inspection Aircraft                                                 | FLC      | FLIGHT CHECK                   | 
    Fly Jetstream Aviation                                                           | SRE      | STREAMJET                      | 
    FSH Luftfahrtunternehmen                                                         | LEJ      | LEIPZIG FAIR                   | 
    Fab Air                                                                          | FBA      | FAB AIR                        | 
    FR Aviation                                                                      | FRA      | RUSHTON                        | 
    FLowair Aviation                                                                 | FLW      | QUICKFLOW                      | 
    FMG Verkehrsfliegerschule Flughafen Paderborn-Lippstadt                          | FMG      | HUSKY                          | 
    FSB Flugservice & Development                                                    | FSB      | SEABIRD                        | 
    Fair Wind Air Charter                                                            | FWD      | FAIR WIND                      | 
    Falcon Air                                                                       | FAR      | FALCAIR                        | 
    Fairoaks Flight Centre                                                           | FFC      | FAIROAKS                       | 
    Falcon Airline                                                                   | FAU      | FALCON AIRLINE                 | 
    Falcon Air Express                                                               | FAO      | PANTHER                        | 
    Falcon Jet Centre                                                                | FJC      | FALCONJET                      | 
    Falcon Aviation Services                                                         | FVS      | FALCON AVIATION                | 
    Falcon Air                                                                       | FCN      | FALCON                         | 
    Fairways Corporation                                                             | FWY      | FAIRWAYS                       | 
    Falwell Aviation                                                                 | FAW      | FALWELL                        | 
    Fair Aviation                                                                    | FAV      | FAIRAVIA                       | 
    Farnair Hungary                                                                  | FAH      | BLUE STRIP                     | 
    ASL Airlines Switzerland                                                         | FAT      | FARNER                         | Previously: Farnair Switzerland
    Faroecopter                                                                      | HBL      | HELIBLUE                       | 
    Far Eastern Air Transport                                                        | FEA      | FAR EASTERN                    | 
    Farnas Aviation Services                                                         | RAF      | FARNAS                         | 
    Fast Helicopters                                                                 | FHL      | FINDON                         | 
    Farwest Airlines                                                                 | FRW      | FARWEST                        | 
    Faso Airways                                                                     | FSW      | FASO                           | 
    Fayetteville Flying Service and Scheduled Skyways System                         | SKM      | SKYTEM                         | 
    Federal Air                                                                      | FDR      | FEDAIR                         | 
    Facts Air                                                                        | FCS      | MEXFACTS                       | 
    Fayban Air Services                                                              | FAY      | FAYBAN AIR                     | 
    Federal Armed Forces                                                             | DCN      | DIPLOMATIC CLEARANCE           | 
    Federal Armored Service                                                          | FRM      | FEDARM                         | 
    Farmingdale State University                                                     | FDL      | FARMINGDALE STATE              | 
    Federal Airlines                                                                 | FLL      | FEDERAL AIRLINES               | 
    FedEx Express                                                                    | FDX      | FEDEX                          | 
    Feria Aviación                                                                   | FER      | FERIA                          | 
    FaroeJet                                                                         | RCK      | ROCKROSE                       | 
    Finalair Congo                                                                   | FNC      | FINALAIR CONGO                 | 
    Financial Airxpress                                                              | FAK      | FACTS                          | 
    Fika Salaama Airlines                                                            | HGK      | SALAAMA                        | 
    Finist'air                                                                       | FTR      | FINISTAIR                      | 
    Fine Airlines                                                                    | FBF      | FINE AIR                       | 
    Finnish Air Force                                                                | FNF      | FINNFORCE                      | 
    Federal Aviation Administration                                                  | NHK      | NIGHTHAWK                      | 
    Finncomm Airlines                                                                | WBA      | WESTBIRD                       | 
    Firefly                                                                          | FFM      | FIREFLY                        | 
    Feniks Airline                                                                   | FNK      | AURIKA                         | 
    Finnair                                                                          | FIN      | FINNAIR                        | 
    First Choice Airways                                                             | FCA      | JETSET                         | 
    First Cambodia Airlines                                                          | FCC      | FIRST CAMBODIA                 | 
    First City Air                                                                   | MBL      | FIRST CITY                     | 
    First Air                                                                        | FAB      | FIRST AIR                      | 
    FinnHEMS                                                                         | FIH      | FINNHEMS                       | 
    First Flying Squadron                                                            | GGA      | JAWJA                          | 
    Fischer Air Polska                                                               | FFP      | FLYING FISH                    | 
    Fischer Air                                                                      | FFR      | FISCHER                        | 
    First Sabre                                                                      | FTS      | FIRST SABRE                    | 
    Flamenco Airways                                                                 | WAF      | FLAMENCO                       | 
    FitsAir                                                                          | EXV      | EXPOAVIA                       | 
    Flair Airlines                                                                   | FLE      | FLAIR                          | 
    Flamingo Air                                                                     | FMR      | FLAMINGO AIR                   | 
    First Line Air                                                                   | FIR      | FIRSTLINE AIR                  | 
    Flagship Express Services                                                        | FSX      | FLAG                           | 
    Flamingo Air-Line                                                                | FLN      | ILIAS                          | 
    Flight Alaska                                                                    | TUD      | TUNDRA                         | 
    FCS Flight Calibration Services                                                  | FCK      | NAV CHECKER                    | 
    Nelson Aviation College                                                          | FCP      | FLIGHTCORP                     | Nelson Aviation College 
    Flight Centre Victoria                                                           | FCV      | NAVAIR                         | 
    Flight Calibration Services                                                      | VOR      | FLIGHT CAL                     | 
    China FICGACA                                                                    | CFI      | CHINA JET                      | 
    Flash Airlines                                                                   | FSH      | FLASH                          | 
    Flight International                                                             | IVJ      | INVADER JACK                   | 
    Flight Line                                                                      | MIT      | MATCO                          | 
    Flight Inspections and Systems                                                   | LTS      | SPECAIR                        | 
    Flight Express                                                                   | FLX      | FLIGHT EXPRESS                 | 
    Flight Training Europe                                                           | AYR      | CYGNET                         | 
    Flight Safety                                                                    | FSL      | FLIGHTSAFETY                   | 
    Flight Trac                                                                      | CCK      | CABLE CHECK                    | 
    Flight Options                                                                   | OPT      | OPTIONS                        | 
    Flight West Airlines                                                             | FWQ      | UNITY                          | 
    Flightcraft                                                                      | CSK      | CASCADE                        | 
    Flight Precision                                                                 | CLB      | CALIBRATOR                     | 
    Fleetair                                                                         | FLR      | FLEETAIR                       | 
    Fleet Requirements Air Direction Unit                                            | BWY      | BROADWAY                       | 
    Flightstar Corporation                                                           | FSR      | FLIGHTSTAR                     | 
    Flightworks                                                                      | KDZ      | KUDZU                          | Avior Technologies Operations
    Flightexec                                                                       | FEX      | FLIGHTEXEC                     | 
    Florida Air                                                                      | OJY      | OHJAY                          | 
    Flightline                                                                       | FTL      | FLIGHT-AVIA                    | 
    Florida Department of Agriculture                                                | FFS      | FORESTRY                       | 
    Florida Jet Service                                                              | FJS      | FLORIDAJET                     | 
    Flightpass                                                                       | FPS      | FLIGHTPASS                     | 
    Florida Coastal Airlines                                                         | FCL      | FLORIDA COASTAL                | 
    Flint Aviation Services                                                          | FAZ      | FLINT AIR                      | 
    Flight-Ops International                                                         | KLO      | KLONDIKE                       | 
    Florida West International Airways                                               | FWL      | FLO WEST                       | 
    Flugschule Basel                                                                 | FLU      | YELLOW FLYER                   | 
    Fly All Ways                                                                     | EDR      | BIRDVIEW                       | 
    Flugdienst Fehlhaber                                                             | FFG      | WITCHCRAFT                     | 
    Fly Air                                                                          | FLM      | FLY WORLD                      | 
    Flugschule Eichenberger                                                          | EZB      | EICHENBURGER                   | 
    Fly CI                                                                           | FCT      | DEALER                         | 
    Fly Line                                                                         | FIL      | FLYLINE                        | 
    Fly Me Sweden                                                                    | FLY      | FLYBIRD                        | 
    Fly Wex                                                                          | IAD      | FLYWEX                         | 
    FlyAsianXpress                                                                   | XFA      | FAX AIR                        | 
    Flybondi                                                                         | FBZ      | BONDI                          | 
    Flybaboo                                                                         | BBO      | BABOO                          | 
    Flybe                                                                            | BEE      | JERSEY                         | 
    Flycolumbia                                                                      | FCE      | FLYCOLUMBIA                    | 
    Flycom                                                                           | FLO      | FLYCOM                         | 
    Flygaktiebolaget Gota Vingar                                                     | GVG      | BLUECRAFT                      | 
    Flygtransporter I Nykoping                                                       | ETS      | EXTRANS                        | 
    Flyguppdraget Backamo                                                            | INU      | INSTRUCTOR                     | 
    Fly Europa                                                                       | FEE      | FLY EURO                       | 
    Fly Excellent                                                                    | FXL      | FLY EXCELLENT                  | 
    Flying Service                                                                   | FYG      | FLYING GROUP                   | 
    Flying-Research Aerogeophysical Center                                           | FGP      | FLYING CENTER                  | 
    Flylink Express                                                                  | FLK      | FLYLINK                        | 
    Pelican AIrlines                                                                 | FRE      | PELICAN                        | Pelican Airlines Pty Ltd since 1 June 2015
    Flyteam Aviation                                                                 | FTM      | FLYTEAM                        | 
    Flyhy Cargo Airlines                                                             | FYH      | FLY HIGH                       | 
    Focus Air                                                                        | FKS      | FOCUS                          | Omega Air Holdings
    Ford Motor                                                                       | FOB      | FORDAIR                        | 
    Fonnafly                                                                         | NOF      | FONNA                          | 
    Formula One Management                                                           | FOR      | FORMULA                        | 
    Fly International Airways                                                        | NVJ      | NOUVINTER                      | 
    Fly Jamaica Airways                                                              | FJM      | GREENHEART                     | 
    Forth and Clyde Helicopter Services                                              | FHS      | HELISCOT                       | 
    Flying Carpet                                                                    | FCR      | FLYING CARPET                  | 
    Foster Yeoman                                                                    | JFY      | YEOMAN                         | 
    Fortunair Canada                                                                 | FXC      | AIR FUTURE                     | 
    Fly One                                                                          | FIA      | FLY ONE                        | Allocated in 2016
    Four Winds Aviation                                                              | WDS      | WINDS                          | 
    Four Star Aviation                                                               | FSC      | FOUR STAR                      | Virgin Islands
    Fotografia F3                                                                    | FTE      | FOTOGRAFIA                     | 
    Freedom Air                                                                      | FOM      | FREE AIR                       | Operated from 1995 to 30 March 2008
    Foxair                                                                           | FXR      | WILDFOX                        | 
    Freedom Air                                                                      | FRE      | FREEDOM                        | Aviation Services
    Freebird Airlines                                                                | FHY      | FREEBIRD AIR                   | 
    Foster Aviation                                                                  | FSA      | FOSTER-AIR                     | 
    French Army Light Aviation                                                       | FMY      | FRENCH ARMY                    | 
    Force Aerienne Francaise                                                         | FAF      | FRENCH AIR FORCE               | 
    France Douanes                                                                   | FDO      | FRENCH CUSTOM                  | 
    Freedom Airways                                                                  | FAS      | FREEDOM AIRWAYS                | 
    Fresh Air Aviation                                                               | BZY      | BREEZY                         | 2015
    Fresh Air                                                                        | FRR      | FRESH AIR                      | 
    Freedom Air Services                                                             | FFF      | INTER FREEDOM                  | 
    Freshaer                                                                         | FAE      | WILDGOOSE                      | 
    France Marine Nationale                                                          | FNY      | FRENCH NAVY                    | 
    Frontier Airlines                                                                | FFT      | FRONTIER FLIGHT                | 
    Frontier Commuter                                                                | ITR      | OUT BACK                       | 
    Frontier Flying Service                                                          | FTA      | FRONTIER-AIR                   | 
    Fujairah Aviation Centre                                                         | FUJ      | FUJAIRAH                       | 
    Freight Runners Express                                                          | FRG      | FREIGHT RUNNERS                | 
    Fujian Airlines                                                                  | CFJ      | FUJIAN                         | 
    Fumigación Aérea Andaluza                                                        | FAM      | FAASA                          | 
    Frontier Guard                                                                   | FNG      | FINNGUARD                      | 
    FundaciÃ³ Rego                                                                   | ROG      | REGO                           | 
    Friendship Air Alaska                                                            | FAL      | FRIENDSHIP                     | 
    Full Express                                                                     | GAX      | GRAND AIRE                     | 
    Friendship Airlines                                                              | FLF      | FRIEND AIR                     | 
    Fly Georgia                                                                      | FGE      | GEORGIA WING                   | 
    Fly Pro                                                                          | PVV      | SUNDAY                         | Started in November 2016
    Funtshi Aviation Service                                                         | FUN      | FUNTSHI                        | 
    FlyViking                                                                        | FVK      | BALDER                         | Established in 2016
    Fun Flying Thai Air Service                                                      | FFY      | FUN FLYING                     | 
    FlyEgypt                                                                         | FEG      | SKY EGYPT                      | Established in 2014
    Air Greenland                                                                    | GRL      | GREENLAND                      | 
    Gemini Air Group                                                                 | DBC      | DIAMOND BACK                   | Allocated in 2014
    Fleet Air International                                                          | FRF      | FAIRFLEET                      | 
    Flight Line                                                                      | ACT      | AMERICAN CHECK                 | 
    Intel GMJ Air Shuttle                                                            | HGT      | HIGHTECH                       | Private air shuttle for Intel Corporation Employees
    Gama Aviation Switzerland                                                        | GCH      | GAMA SWISS                     | 
    GB Helicopters                                                                   | KNM      | KINGDOM                        | 
    Flydubai                                                                         | FDB      | SKYDUBAI                       | 
    Guangxi Beibu Gulf Airlines                                                      | GBC      | SPRAY                          | 
    Germania Express                                                                 | GMQ      | CORGI                          | 
    Gospa Air                                                                        | GOP      | GOSPA AIR                      | 
    G & L Aviation                                                                   | GML      | GEEANDEL                       | 
    Golden Myanmar Airlines                                                          | GMR      | GOLDEN MYANMAR                 | 
    Global Air Crew                                                                  | GCW      | GLOBALCREW                     | 
    GCS Air Service                                                                  | GCS      | GALION                         | 
    GB Airways                                                                       | GBL      | GEEBEE AIRWAYS                 | 
    GEC Marconi Avionics                                                             | FFU      | FERRANTI                       | 
    GATSA                                                                            | GGS      | GATSA                          | 
    Get High                                                                         | GET      | AIR FLOW                       | 
    GENSA                                                                            | GEN      | GENSA-BRASIL                   | 
    G5 Executive                                                                     | EXH      | BATMAN                         | 
    Trans Island Airways                                                             | GGT      | THUNDERBALL                    | 
    GMG Airlines                                                                     | GMG      | GMG                            | 
    GR-Avia                                                                          | GIB      | GRAVIA                         | 
    GB Airlink                                                                       | GBX      | ISLAND TIGER                   | 
    GAK/Mitchell Aero                                                                | MTA      | GAK AVIATION                   | 
    GECAS                                                                            | GCC      | GECAS                          | 
    GST Aero Air                                                                     | BMK      | MURAT                          | 
    Gabon Express                                                                    | GBE      | GABEX                          | 
    GP Express Airlines                                                              | GPE      | REGIONAL EXPRESS               | 
    Gail Force Express                                                               | GFC      | GAIL FORCE                     | 
    GPM Aeroservicio                                                                 | GPR      | GPM AEROSERVICIO               | 
    Gacela Air Cargo                                                                 | GIG      | GACELA AIR                     | 
    Gain Jet Aviation                                                                | GNJ      | HERCULES JET                   | 
    Galair International                                                             | SWF      | GALAIR                         | 
    Galaxy Air                                                                       | GAL      | GALAXY                         | 
    Galaircervis                                                                     | GLS      | GALS                           | 
    Ga-Ma Helicoptere                                                                | GAH      | GAMHELICO                      | 
    GTA Air                                                                          | GTX      | BIG-DEE                        | 
    Galaxy Airlines                                                                  | GXY      | GALAX                          | 
    Gamisa Aviación                                                                  | GMJ      | GAMISA                         | 
    Gambia New Millennium Air                                                        | NML      | NEWMILL                        | 
    Gambia International Airlines                                                    | GNR      | GAMBIA INTERNATIONAL           | 
    Gama Aviation                                                                    | GMA      | GAMA                           | 
    Galena Air Service                                                               | GAS      | GALENA AIR SERVICE             | 
    Gandalf Airlines                                                                 | GNF      | GANDALF                        | 
    Gander Aviation                                                                  | GAN      | GANAIR                         | 
    Gavina                                                                           | GVN      | GAVINA                         | 
    Gauteng Air Cargo                                                                | EGO      | GAUTENG                        | 
    Garuda Indonesia                                                                 | GIA      | INDONESIA                      | 
    Gatari Hutama Air Services                                                       | GHS      | GATARI                         | 
    Geesair                                                                          | GEE      | GEESAIR                        | 
    Gazpromavia                                                                      | GZP      | GAZPROMAVIA                    | 
    Gendall Air                                                                      | GAB      | GENDALL                        | 
    Gemini Air Cargo                                                                 | GCO      | GEMINI                         | 
    Gendarmerie Belge                                                                | GDB      | BELGIAN GENERMERIE             | 
    Garrison Aviation                                                                | AHM      | AIR HURON                      | 
    General Airways                                                                  | GWS      | GENAIR                         | 
    General Aviation                                                                 | GNZ      | GONZO                          | 
    General Aviation Flying Services                                                 | GTH      | GOTHAM                         | 
    Garden State Airlines                                                            | GSA      | GARDEN STATE                   | 
    Georgian Airways                                                                 | TGZ      | TAMAZI                         | 
    National Gendarmerie                                                             | FGN      | FRANCE GENDARME                | 
    Geographic Air Surveys                                                           | GSL      | SURVEY-CANADA                  | 
    Georgian Cargo Airlines Africa                                                   | GGF      | GEORGIAN AFRICA                | 
    Georgian Aviation Federation                                                     | FGA      | GEORGIA FED                    | 
    German Air Force                                                                 | GAF      | GERMAN AIR FORCE               | 
    Georgian National Airlines                                                       | GFG      | NATIONAL                       | 
    German Airways                                                                   | LGW      | WALTER                         | Former name: Luftfahrtgesellschaft Walter
    German Army                                                                      | GAM      | GERMAN ARMY                    | 
    German Navy                                                                      | GNY      | GERMAN NAVY                    | 
    General Aerospace                                                                | SWK      | SKYWALKER                      | 
    German Sky Airlines                                                              | GHY      | GERMAN SKY                     | 
    Germanwings                                                                      | GWI      | GERMAN WINGS                   | 
    Gesellschaft Fur Flugzieldarstellung                                             | GFD      | KITE                           | 
    Gestair                                                                          | GES      | GESTAIR                        | 
    Gestión Aérea Ejecutiva                                                          | GJT      | BANJET                         | 
    APG Airlines                                                                     | RIV      | RIVERA                         | 
    Germania                                                                         | GMI      | GERMANIA                       | 
    Gestar                                                                           | GTR      | STAR GESTAR                    | 
    General Motors                                                                   | GMC      | GENERAL MOTORS                 | 
    Globus Airlines                                                                  | GLP      | GLOBUS                         | 
    Gibson Aviation                                                                  | NTC      | NIGHT CHASE                    | 
    Global Airways                                                                   | GLB      | GLO-AIR                        | Air Castle Corporation
    Ghana International Airlines                                                     | GHB      | GHANA AIRLINES                 | 
    Global Aviation Operations                                                       | GBB      | GLOBE                          | 
    Global Air Charter                                                               | RPS      | RESPONSE                       | 
    Global Aviation and Services Group                                               | GAK      | AVIAGROUP                      | 
    Greybird Pilot Academy                                                           | GAG      | GEEBIRD                        | 
    Global Jet Luxembourg                                                            | SVW      | SILVER ARROWS                  | 
    Global Jet Austria                                                               | GLJ      | GLOBAL AUSTRIA                 | 
    Global Georgian Airways                                                          | GGZ      | GLOBAL GEORGIAN                | 
    Global Sky Aircharter                                                            | GSK      | GLOBAL SKY                     | 
    Global Air Services Nigeria                                                      | GBS      | GLOBAL SERVE                   | 
    Global Jet Corporation                                                           | NSM      | THUNDERCLOUD                   | 
    GoAir                                                                            | GOW      | GOAIR                          | 
    Gof-Air                                                                          | GOF      | GOF-AIR                        | 
    Gol Transportes Aéreos                                                           | GLO      | GOL TRANSPORTE                 | Brazilian low-cost airline.
    Global Supply Systems                                                            | GSS      | JET LIFT                       | 
    GoldAir                                                                          | GDA      | AIR PARTNER                    | 
    Golden Airlines                                                                  | GDD      | GOLDEN AIRLINES                | 
    Golden Pacific Airlines                                                          | GPA      | GOLDEN PAC                     | 
    Golden Rule Airlines                                                             | GRS      | GOLDEN RULE                    | 
    Gofir                                                                            | GOI      | SWISS HAWK                     | 
    GoJet Airlines                                                                   | GJS      | LINDBERGH                      | 
    Golfe Air Quebec                                                                 | GAQ      | GOLFAIR                        | 
    Golden Air                                                                       | GAO      | GOLDEN                         | 
    Gomel Airlines                                                                   | GOM      | GOMEL                          | 
    Gorlitsa Airlines                                                                | GOR      | GORLITSA                       | 
    Golden Star Air Cargo                                                            | GLD      | GOLDEN STAR                    | 
    Goliaf Air                                                                       | GLE      | GOLIAF AIR                     | 
    Goodridge                                                                        | RDR      | RED STAR                       | 
    Government of Zambia Communications Flight                                       | GRZ      | COM FLIGHT                     | 
    Goldeck-Flug                                                                     | GDK      | GOLDECK FLUG                   | 
    Granada Aviación                                                                 | GAV      | GRANAVI                        | 
    Grant Aviation                                                                   | GUN      | HOOT                           | 
    Grand Aire Express                                                               | GAE      | GRAND EXPRESS                  | 
    Guardian Air                                                                     | GRA      | FLEX                           | issued in 2017
    Grantex Aviation                                                                 | LMK      | LANDMARK                       | 
    Great Lakes Airlines                                                             | GLA      | LAKES AIR                      | 
    Great Lakes Airways                                                              | GLU      | LAKES CARGO                    | 
    Great Plains Airlines                                                            | GRP      | GREAT PLAINS                   | 
    Great Wall Airlines                                                              | GWL      | GREAT WALL                     | 
    Great Western Air                                                                | GWA      | G-W AIR                        | 
    Hellenic Air Force                                                               | HAF      | HELLENIC AIR FORCE             | 
    Greek Navy                                                                       | HNA      | HELLENIC NAVY                  | 
    Griffin Aviation                                                                 | GFF      | GRIFFIN AIR                    | 
    Grixona                                                                          | GXA      | GRIXONA                        | 
    Grizodubova Air                                                                  | GZD      | GRIZODUBOVA AIR                | 
    Grossmann Air Service                                                            | HTG      | GROSSMANN                      | 
    Grand Airways                                                                    | GND      | GRAND VEGAS                    | 
    Grampian Flight Centre                                                           | HLD      | GRANITE                        | 
    Grupo TACA                                                                       | TAT      | TACA-COSTARICA                 | 
    Grossmann Jet Service                                                            | GSJ      | GROSSJET                       | 
    Grand Canyon Airlines                                                            | CVU      | CANYON VIEW                    | 
    Grupo De Aviación Ejecutiva                                                      | EJC      | GRUPOEJECUTIVA                 | 
    Grup Air-Med                                                                     | GPM      | GRUPOMED                       | 
    Grupo Aéreo Monterrey                                                            | GMT      | GRUPOMONTERREY                 | 
    Government Flying Service                                                        | HKG      | HONGKONG GOVERNMENT            | 
    Grupo Vuelos Mediterraneo                                                        | VMM      | VUELOS MED                     | 
    Guine Bissaur Airlines                                                           | BSR      | BISSAU AIRLINES                | 
    Guard Systems                                                                    | GSY      | GUARD AIR                      | 
    Guinea Cargo                                                                     | GNC      | GUINEA CARGO                   | 
    Guinea Airways                                                                   | GIJ      | GUINEA AIRWAYS                 | 
    Ground Handling Service de Mexico                                                | GHV      | GROUND HANDLING                | 
    Guinea Ecuatorial Airlines                                                       | GEA      | GEASA                          | 
    Gujarat Airways                                                                  | GUJ      | GUJARATAIR                     | 
    Guinee Paramount Airlines                                                        | GIQ      | GUIPAR                         | 
    Guizhou Airlines                                                                 | CGH      | GUIZHOU                        | 
    Guja                                                                             | GUS      | GUJA                           | 
    Gulf Air                                                                         | GFA      | GULF AIR                       | 
    Gulf Flite Center                                                                | SFY      | SKY FLITE                      | 
    Gulf Central Airlines                                                            | GCN      | GULF CENTRAL                   | 
    Gulf Air Inc                                                                     | GAT      | GULF TRANS                     | 
    Gulf Pearl Air Lines                                                             | GPC      | AIR GULFPEARL                  | 
    Gulfstream Aerospace                                                             | GLF      | GULFSTREAM TEST                | 
    Gulfstream International Airlines                                                | GFT      | GULF FLIGHT                    | 
    Gulfstream Airlines                                                              | GFS      | GULFSTAR                       | 
    Gull Air                                                                         | GUL      | GULL-AIR                       | 
    Gum Air                                                                          | GUM      | GUM AIR                        | 
    Guneydogu Havacilik Isletmesi                                                    | GDH      | RISING SUN                     | 
    Heli-Charter                                                                     | HCK      | HELI-CHARTER                   | 
    Gwyn Aviation                                                                    | GWN      | GWYN                           | 
    Helix-Craft Aviation                                                             | HTB      | HELIX-CRAFT                    | 2014
    Hunnu Air                                                                        | MML      | TRANS MONGOLIA                 | 
    Hamburg Airways                                                                  | HAY      | HAMBURG AIRWAYS                | 
    Gulf & Caribbean Cargo / Contract Air Cargo                                      | TSU      | TRANSAUTO                      | 
    Gulf African Airlines                                                            | GUF      | GULF AFRICAN                   | 
    Hyperion Aviation                                                                | HYP      | HYPERION                       | 
    H.S. Aviation                                                                    | HSN      | HS AVIATION                    | 
    GlobeAir                                                                         | GAC      | DREAM TEAM                     | 
    HPM Investments                                                                  | HWD      | FLITEWISE                      | 
    Hop!                                                                             | HOP      | AIR HOP                        | 
    HT Helikoptertransport                                                           | KTR      | COPTER TRANS                   | 
    Hadison Aviation                                                                 | FMS      | HADI                           | 
    HTA Helicopteros                                                                 | AHT      | HELIAPRA                       | 
    Air Guyane Express                                                               | GUY      | GREEN BIRD                     | 
    Heron Luftfahrt                                                                  | HRN      | HERONAIR                       | 
    Hagondale                                                                        | POW      | AIRNET                         | 
    Hahn Air                                                                         | HHN      | ROOSTER                        | 
    Hainan Airlines                                                                  | CHH      | HAINAN                         | 
    HC Airlines                                                                      | HLA      | HEAVYLIFT                      | 
    Haiti International Air                                                          | HTI      | HAITI INTERNATIONAL            | 
    Haiti Trans Air                                                                  | HTC      | HAITI TRANSAIR                 | 
    Hajvairy Airlines                                                                | HAJ      | HAJVAIRY                       | 
    Haitian Aviation Line                                                            | HBC      | HALISA                         | 
    Hak Air                                                                          | HKL      | HAK AIRLINE                    | 
    Hala Air                                                                         | HLH      | HALA AIR                       | 
    Hamburg International                                                            | HHI      | HAMBURG JET                    | 
    Halcyonair                                                                       | HCV      | CREOLE                         | 
    Hamlin Jet                                                                       | HJL      | BIZJET                         | 
    Haiti International Airline                                                      | HRB      | HAITI AIRLINE                  | 
    Hamra Air                                                                        | HMM      | HAMRA                          | 
    Hangar 8                                                                         | HGR      | HANG                           | 
    Hand D Aviation                                                                  | WVA      | WABASH VALLEY                  | 
    Hansung Airlines                                                                 | HAN      | HANSUNG AIR                    | 
    Hapag-Lloyd Express                                                              | HLX      | YELLOW CAB                     | 
    Harbor Airlines                                                                  | HAR      | HARBOR                         | 
    Hapagfly                                                                         | HLF      | HAPAG LLOYD                    | TUIfly
    Hangard Aviation                                                                 | HGD      | HANGARD                        | 
    Haughey Air                                                                      | NBR      | NORBROOK                       | 
    Haverfordwest Air Charter Services                                               | PYN      | POYSTON                        | 
    Haiti National Airlines                                                          | HNR      | HANAIR                         | 
    Hageland Aviation Services                                                       | HAG      | HAGELAND                       | 
    Havilah Air Services                                                             | HAV      | HAVILAH                        | 
    Hawk Air                                                                         | HKR      | AIR HAW                        | 
    Hawk De Mexico                                                                   | HMX      | HAWK MEXICO                    | 
    Hawaiian Airlines                                                                | HAL      | HAWAIIAN                       | 
    Heavylift International                                                          | HVL      | HEAVYLIFT INTERNATIONAL        | 
    Hawkaire                                                                         | HKI      | HAWKEYE                        | 
    Helcopteros De Cataluna                                                          | HDC      | HELICATALUNA                   | 
    Harmony Airways                                                                  | HMY      | HARMONY                        | 
    Heavylift Cargo Airlines                                                         | HVY      | HEAVY CARGO                    | 
    Heli Air Services                                                                | HLR      | HELI BULGARIA                  | 
    Helenair                                                                         | HCB      | HELEN                          | 
    Helenair Corporation                                                             | HCL      | HELENCORP                      | 
    Helenia Helicopter Service                                                       | HHP      | HELENIA                        | 
    Heli Hungary                                                                     | HYH      | HELIHUNGARY                    | 
    Heli France                                                                      | HFR      | HELIFRANCE                     | 
    Heli Securite                                                                    | HLI      | HELI SAINT-TROPEZ              | 
    Heli Trip                                                                        | HTP      | HELI TRIP                      | 
    Heli Union Heli Prestations                                                      | HLU      | HELI UNION                     | 
    Heli Bernina                                                                     | HEB      | HELIBERNINA                    | 
    Heli-Holland                                                                     | HHE      | HELI HOLLAND                   | 
    Heli Medwest De Mexico                                                           | HLM      | HELIMIDWEST                    | 
    Heli-Iberica Fotogrametria                                                       | HIF      | HIFSA                          | 
    Heli-Air-Monaco                                                                  | MCM      | HELI AIR                       | 
    Heli-Link                                                                        | HLK      | HELI-LINK                      | 
    Heliamerica De Mexico                                                            | HMC      | HELIAMERICA                    | 
    Heli-Iberica                                                                     | HRA      | ERICA                          | 
    Hi Fly Malta                                                                     | HFM      | MOONRAKER                      | 
    Heli Ambulance Team                                                              | ALJ      | ALPIN HELI                     | 
    Helicap                                                                          | HLC      | HELICAP                        | 
    Helicentre Coventry                                                              | COV      | HELICENTRE                     | 
    Heliaviation                                                                     | CDY      | CADDY                          | 
    Helicol                                                                          | HEL      | HELICOL                        | 
    Heli-Inter Guyane                                                                | HIG      | INTER GUYANNE                  | 
    Helibravo Aviacao                                                                | HIB      | HELIBRAVO                      | 
    Heliavia-Transporte Aéreo                                                        | HEA      | HELIAVIA                       | 
    Helicopter Training & Hire                                                       | MVK      | MAVRIK                         | 
    Helicópteros Y Vehículos Nacionales Aéreos                                       | HEN      | HELINAC                        | 
    Helicsa                                                                          | HHH      | HELICSA                        | 
    Helicopteros Internacionales                                                     | HNT      | HELICOP INTER                  | 
    Helijet                                                                          | JBA      | HELIJET                        | 
    Helikopterdrift                                                                  | HDR      | HELIDRIFT                      | 
    Helicopteros Aero Personal                                                       | HAP      | HELIPERSONAL                   | 
    Helikopterservice Euro Air                                                       | SCO      | SWEDCOPTER                     | 
    Helios Airways                                                                   | HCY      | HELIOS                         | 
    Helipistas                                                                       | HLP      | HELIPISTAS                     | 
    Heliocean                                                                        | OCE      | HELIOCEAN                      | 
    Helicopter & Aviation Services                                                   | JKY      | JOCKEY                         | 
    Heliportugal                                                                     | HPL      | HELIPORTUGAL                   | 
    Helicopteros Agroforestal                                                        | HAA      | AGROFORESTAL                   | 
    Helicopter                                                                       | HCP      | HELI CZECH                     | 
    Helisul                                                                          | HSU      | HELIS                          | 
    Heliswiss                                                                        | HSI      | HELISWISS                      | 
    Helitaxi Ofavi                                                                   | OFA      | OFAVI                          | 
    Helitrans                                                                        | HTA      | SCANBIRD                       | 
    Helitours                                                                        | HLT      | HELITOURS                      | 
    Helitafe                                                                         | HLT      | HELITAFE                       | 
    Heliworks                                                                        | HLW      | HELIWORKS                      | 
    Helitrans Air Service                                                            | HTS      | HELITRANS                      | 
    Helitalia                                                                        | HIT      | HELITALIA                      | 
    Heliservicio Campeche                                                            | HEC      | HELICAMPECHE                   | 
    Heritage Flight                                                                  | SSH      | SNOWSHOE                       | 
    Hello                                                                            | FHE      | FLYHELLO                       | 
    Helog                                                                            | HLG      | HELOG                          | 
    Heritage Aviation Developments                                                   | HED      | FLAPJACK                       | 
    Herman's Markair Express                                                         | MRX      | SPEEDMARK                      | 
    Helvetic Airways                                                                 | OAW      | HELVETIC                       | 
    Hemus Air                                                                        | HMS      | HEMUS AIR                      | 
    Highland Airways                                                                 | HWY      | HIWAY                          | 
    Hi-Jet Helicopter Services                                                       | HHS      | HIJET                          | 
    Hi Fly                                                                           | HFY      | SKY FLYER                      | 
    Hispánica de Aviación                                                            | HSH      | HASA                           | 
    Hispaniola Airways                                                               | HIS      | HISPANIOLA                     | 
    Himalaya Airlines                                                                | HIM      | HIMALAYA                       | 
    Hewa Bora Airways                                                                | ALX      | ALLCONGO                       | 
    Hogan Air                                                                        | HGA      | HOGAN AIR                      | 
    High-Line Airways                                                                | HLB      | HIGH-LINE                      | 
    Hokkaido Air System                                                              | NTH      | NORTH AIR                      | 
    Holiday Airlines                                                                 | HOL      | HOLIDAY                        | 
    Holding International Group                                                      | HIN      | HOLDING GROUP                  | 
    Homac Aviation                                                                   | HMV      | HOMAC                          | 
    Holstenair Lubeck                                                                | HTR      | HOLSTEN                        | 
    Honduras Airlines                                                                | HAS      | HONDURAS AIR                   | 
    Holidays Czech Airlines                                                          | HCC      | CZECH HOLIDAYS                 | 
    Hong Kong Express Airways                                                        | HKE      | HONGKONG SHUTTLE               | 
    Hola Airlines                                                                    | HOA      | HOLA                           | 
    Hex'Air                                                                          | HER      | HEX AIRLINE                    | 
    Honiara Cargo Express                                                            | HEX      | HONIARA CARGO                  | 
    Hop-A-Jet                                                                        | HPJ      | HOPA-JET                       | 
    Horizon Air Service                                                              | KOK      | KOKO                           | 
    Hong Kong Airlines                                                               | CRK      | BAUHINIA                       | 
    Horizon Air                                                                      | QXE      | HORIZON AIR                    | 
    Hong Kong Air Cargo                                                              | HKC      | MASCOT                         | 
    Horizons Un                                                                      | HUD      | HUD                            | 
    Horizon Air-Taxi                                                                 | HOR      | HORIZON                        | 
    Horizontes Aéreos                                                                | HOZ      | HORIZONTES AEREOS              | 
    Hoteles Dinamicos                                                                | HDI      | DINAMICOS                      | 
    Hongtu Airlines                                                                  | HTU      | HONGLAND                       | 
    Horizon Plus                                                                     | HPS      | HORIZON PLUS                   | 
    Hub Airlines                                                                     | HUB      | HUB                            | 
    Hozu-Avia                                                                        | OZU      | HOZAVIA                        | 
    Huessler Air Service                                                             | HUS      | HUESSLER                       | 
    Horizon Air for Transport and Training                                           | HSM      | ALOFUKAIR                      | 
    Houston Helicopters                                                              | HHO      | HOUSTON HELI                   | 
    Hunair Hungarian Airlines                                                        | HUV      | SILVER EAGLE                   | 
    Hyack Air                                                                        | HYA      | HYACK                          | 
    Hughes Aircraft                                                                  | GMH      | HUGHES EXPRESS                 | 
    Hydro-Québec                                                                     | HYD      | HYDRO                          | 
    Hawker Beechcraft                                                                | HKB      | CLASSIC                        | 
    Hungarian Air Force                                                              | HUF      | HUNGARIAN AIRFORCE             | 
    Interjet                                                                         | IJW      | JET WEST                       | 2015
    Hummingbird Helicopter Service                                                   | WHR      | WHIRLEYBIRD                    | 
    Island Air Express                                                               | EXP      | ISLAND EXPRESS                 | 2014
    Houston Jet Services                                                             | GGV      | GREGG AIR                      | 
    Hydro Air Flight Operations                                                      | HYC      | HYDRO CARGO                    | 
    H-Bird Aviation Services AB                                                      | ETI      | JETHAWK                        | 
    Ifly                                                                             | IFM      | ICOPTER                        | 
    Interaviation Charter                                                            | IAC      | INTERCHARTER                   | 
    IBC Airways                                                                      | CSQ      | CHASQUI                        | 
    Independent Carrier                                                              | IPR      | ICAR                           | 
    IBM Euroflight Operations                                                        | BBL      | BLUE                           | 
    IBL Aviation                                                                     | IBL      | CATOVAIR                       | 
    IFL Group                                                                        | IFL      | EIFEL                          | 
    ICC Canada                                                                       | CIC      | AIR TRADER                     | 
    II Lione Alato Arl                                                               | RDE      | FLIGHT RED                     | 
    IKI International Airlines                                                       | IKK      | IKIAIR                         | 
    IDG Technology Air                                                               | IDG      | INDIGO                         | 
    IKON FTO                                                                         | IKN      | IKON                           | 
    IPEC Aviation                                                                    | IPA      | IPEC                           | 
    IPM Europe                                                                       | IPM      | SHIPEX                         | 
    IJM International Jet                                                            | IJM      | JET MANAGEMENT                 | 
    ISD Avia                                                                         | ISD      | ISDAVIA                        | 
    IMP Aviation Services                                                            | BLU      | BLUENOSE                       | 
    Iberia Express                                                                   | IBS      | IBEREXPRESS                    | Charter service, low cost carrier for EU flights of Iberia operating only A320s
    Ibertour Servicios Aéreos                                                        | IBR      | IBERTOUR                       | 
    Ibertrans Aérea                                                                  | IBT      | IBERTRANS                      | 
    Ibex Airlines                                                                    | IBX      | IBEX                           | 
    Iberworld                                                                        | IWD      | IBERWORLD                      | 
    Ibicenca Air                                                                     | IBC      | IBICENCA                       | 
    Ikar                                                                             | KAR      | IKAR                           | 
    Norwegian Air International                                                      | IBK      | NORTRANS                       | 
    IRS Airlines                                                                     | LVB      | SILVERBIRD                     | 
    Icar Air                                                                         | RAC      | TUZLA AIR                      | 
    Icarus                                                                           | IUS      | ICARUS                         | 
    Ikaros DK                                                                        | IKR      | IKAROS                         | 
    Icejet                                                                           | ICJ      | ICEJET                         | 
    Icelandic Coast Guard                                                            | ICG      | ICELAND COAST                  | 
    Icaro                                                                            | ICA      | ICARFLY                        | 
    Icelandair                                                                       | ICE      | ICEAIR                         | 
    Ildefonso Redriguez                                                              | IDL      | ILDEFONSO                      | 
    Iliamna Air Taxi                                                                 | IAR      | ILIAMNA AIR                    | 
    Il-Avia                                                                          | ILV      | ILAVIA                         | 
    Ilyich-Avia                                                                      | ILL      | ILYICHAVIA                     | 
    Imair Airlines                                                                   | ITX      | IMPROTEX                       | 
    Independent Air Freighters                                                       | IDP      | INDEPENDENT                    | 
    IndiGo Airlines                                                                  | IGO      | IFLY                           | Interglobe Aviation
    Iberia Airlines                                                                  | IBE      | IBERIA                         | 
    Il Ciocco International Travel Service                                           | CIO      | CIOCCO                         | 
    Imtrec Aviation                                                                  | IMT      | IMTREC                         | 
    Icare Franche Compte                                                             | FRC      | FRANCHE COMPTE                 | 
    Indian Air Force                                                                 | IFC      | INDIAN AIRFORCE                | 
    Indicator                                                                        | IDR      | INDICATOR                      | 
    India International Airways                                                      | IIL      | INDIA INTER                    | 
    Indonesia AirAsia                                                                | AWQ      | WAGON AIR                      | 
    Indonesia Air Transport                                                          | IDA      | INTRA                          | 
    Indonesian Airlines                                                              | IAA      | INDO LINES                     | 
    Industri Pesawat Terbang Nusantara                                               | IPN      | NUSANTARA                      | 
    Innotech Aviation                                                                | IVA      | INNOTECH                       | 
    Indigo Airlines                                                                  | IBU      | INDIGO BLUE                    | 
    Zimex Aviation                                                                   | IMX      | ZIMEX                          | 
    Industrias Titan                                                                 | ITN      | TITANLUX                       | 
    Infinit Air                                                                      | FFI      | INFINIT                        | 
    Institut Cartogràfic de Catalunya                                                | ICC      | CARTO                          | 
    Insel Air International                                                          | INC      | INSELAIR                       | 
    Intensive Air                                                                    | XRA      | INTENSIVE                      | 
    Indian Airlines                                                                  | IAC      | INDAIR                         | 
    Intal Avia                                                                       | INL      | INTAL AVIA                     | 
    Intair                                                                           | INT      | INTAIRCO                       | 
    Inter Express                                                                    | INX      | INTER-EURO                     | 
    Inter RCA                                                                        | CAR      | QUEBEC ROMEO                   | 
    Inter-Air                                                                        | ITA      | CAFEX                          | 
    Imaer                                                                            | IMR      | IMAER                          | 
    Inter-Island Air                                                                 | UGL      | UGLY VAN                       | 
    Inter Air                                                                        | ITW      | INTER WINGS                    | 
    Inter Tropic Airlines                                                            | NTT      | INTER-TROPIC                   | 
    Inter-Mountain Airways                                                           | IMA      | INTER-MOUNTAIN                 | 
    Inter-Canadian                                                                   | ICN      | INTER-CANADIAN                 | 
    Inter-State Aviation                                                             | ITS      | INTER-STATE                    | 
    Intercontinental de Aviación                                                     | ICT      | CONTAVIA                       | 
    Intercopters                                                                     | ICP      | CHOPER                         | 
    Interair South Africa                                                            | ILN      | INLINE                         | 
    Interaviatrans                                                                   | IVT      | INTERAVIA                      | 
    Interflight                                                                      | IFT      | INTERFLIGHT                    | 
    Interfreight Forwarding                                                          | IFF      | INTERFREIGHT                   | 
    Interaire                                                                        | NTE      | INTERMEX                       | 
    Interisland Airways                                                              | IWY      | ISLANDWAYS                     | Name changed to Air Turks and Caicos
    Interavia Airlines                                                               | SUW      | ASTAIR                         | 
    Interjet                                                                         | AIJ      | ABC AEROLINEAS                 | 
    Interjet Helicopters                                                             | IHE      | INTERCOPTER                    | 
    Interisland Airlines                                                             | ISN      | TRI-BIRD                       | 
    Interguide Air                                                                   | IGN      | DIVINE AIR                     | 
    International Air Corporation                                                    | EXX      | EXPRESS INTERNATIONAL          | 
    International Air Cargo Corporation                                              | IAK      | AIR CARGO EGYPT                | 
    International Business Air                                                       | IBZ      | INTERBIZ                       | was U5
    International Air Service                                                        | IAS      | STARFLEET                      | 
    International Air Services                                                       | IAX      | INTERAIR SERVICES              | 
    Interlink Airlines                                                               | ITK      | INTERLINK                      | 
    International Business Aircraft                                                  | IBY      | CENTRAL STAGE                  | 
    Interfly                                                                         | RFL      | INFLY                          | 
    International Jet Aviation Services                                              | IJA      | I-JET                          | 
    International for Transport, Trade and Public Works                              | IIG      | ALDAWLYH AIR                   | 
    Flying Hospital                                                                  | HSP      | HOSPITAL                       | The Flying Hospital
    International Security Assistance Force                                          | THN      | ATHENA                         | 
    International Flight Training Academy                                            | IFX      | IFTA                           | 
    International SOS WIndhoek                                                       | RSQ      | SKYMEDIC                       | 
    Intersky Bulgary                                                                 | IKY      | GENERAL SKY                    | 
    International Trans-Air                                                          | ITH      | INTRANS NIGERIA                | 
    Intervuelos                                                                      | ITU      | INTERLOS                       | 
    International Red Cross Committee                                                | RED      | RED CROSS                      | 
    International Charter Services                                                   | ICS      | INTERSERVI                     | 
    Iona National Airways                                                            | IND      | IONA                           | 
    Iran Air                                                                         | IRA      | IRANAIR                        | Was B9
    Iran Aseman Airlines                                                             | IRC      | ASEMAN                         | 
    Iowa Airways                                                                     | IOA      | IOWA AIR                       | 
    Iranian Naft Airlines                                                            | IRG      | NAFT                           | 
    Iraqi Airways                                                                    | IAW      | IRAQI                          | 
    Irbis Air                                                                        | BIS      | IRBIS                          | 
    Irish Air Corps                                                                  | IRL      | IRISH                          | 
    Irish Air Transport                                                              | RDK      | IRISH TRANS                    | 
    Irtysh Air                                                                       | MZA      | IRTYSH AIRLINES                | Old IATA code: IT; old ICAO code: IRT
    Intersky                                                                         | ISK      | INTERSKY                       | 
    Irving Oil                                                                       | KCE      | KACEY                          | 
    Island Air Charters                                                              | ILF      | ISLAND FLIGHT                  | 
    Island Air                                                                       | ISI      | ISLANDMEX                      | 
    Island Aviation                                                                  | SOY      | SORIANO                        | 
    Irish Aviation Authority                                                         | XMR      | AUTHORITY                      | 
    Island Air Express                                                               | XYZ      | RAINBIRD                       | 
    Island Aviation and Travel                                                       | IOM      | ISLE AVIA                      | 
    Island Helicopters                                                               | MTP      | METROCOPTER                    | 
    Inversija                                                                        | INV      | INVER                          | 
    Icebird Airline                                                                  | ICB      | ICEBIRD                        | 
    Interport Corporation                                                            | IPT      | INTERPORT                      | 
    Isle Grande Flying School                                                        | IGS      | ISLA GRANDE                    | 
    Isles of Scilly Skybus                                                           | IOS      | SCILLONIA                      | 
    Israel Aircraft Industries                                                       | IAI      | ISRAEL AIRCRAFT                | 
    Israir                                                                           | ISR      | ISRAIR                         | 
    Islas Airways                                                                    | ISW      | PINTADERA                      | 
    Itali Airlines                                                                   | ACL      | SPADA                          | Former name: Transporti Aerei Italiani; former IATA Code: 9X*; former ICAO code: ACO
    Istanbul Airlines                                                                | IST      | ISTANBUL                       | 
    Itek Air                                                                         | IKA      | ITEK-AIR                       | ?ICAO confirmed; IATA not
    Italy First                                                                      | IFS      | RIVIERA                        | 
    Ivoire Airways                                                                   | IVW      | IVOIRAIRWAYS                   | 
    Ivoire Jet Express                                                               | IJE      | IVOIRE JET                     | 
    Izair                                                                            | IZM      | IZMIR                          | 
    Izhavia                                                                          | IZA      | IZHAVIA                        | 
    Ixair                                                                            | IXR      | X-BIRD                         | 
    Jet Story                                                                        | JDI      | JEDI                           | former Blue Jet
    Ivoire Aero Services                                                             | IVS      | IVOIRE AERO                    | 
    Imperial Cargo Airlines                                                          | IMG      | IMPERIAL AIRLINES              | 
    Jet Time                                                                         | JTF      | JETFIN                         | 2014
    Islandair Jersey                                                                 | IAJ      | JARLAND                        | 
    Jinggong Jet                                                                     | JGJ      | GLOBAL JINGGONG                | 2014
    Justice Air Charter                                                              | JKR      | JOKER                          | Trading name for Reliant Aviation, allocated in 2014
    Jet Test International                                                           | JTN      | JET TEST                       | 
    Journey Aviation                                                                 | JNY      | UNIJET-ROCKBAND                | 2014
    JP Hunt Air Carriers                                                             | RFX      | REFLEX                         | J P Hunt Air Carriers
    JAL Express                                                                      | JEX      | JANEX                          | 
    JALways                                                                          | JAZ      | JALWAYS                        | 
    Jet-stream                                                                       | JSH      | STREAM AIR                     | 
    JDP Lux                                                                          | JDP      | RED PELICAN                    | 
    JM Family Aviation                                                               | TQM      | TACOMA                         | 
    JC Bamford                                                                       | JCB      | JAYSEEBEE                      | 
    JDAviation                                                                       | JDA      | JAY DEE                        | 
    JS Aviation                                                                      | JES      | JAY-ESS AVIATION               | 
    Jackson Air Services                                                             | JCK      | JACKSON                        | 
    Jade Cargo International                                                         | JAE      | JADE CARGO                     | 
    JS Air                                                                           | JSJ      | JS CHARTER                     | 
    Jambo Africa Airlines                                                            | JMB      | JAMBOAFRICA                    | 
    Janet                                                                            | WWW      | JANET                          | de facto name
    Jana-Arka                                                                        | JAK      | YANZAR                         | 
    JMC Airlines                                                                     | JMC      | JAYEMMSEE                      | 
    Japan Airlines                                                                   | JAL      | JAPANAIR                       | Japan Airlines International
    Janair                                                                           | JAX      | JANAIR                         | 
    Japan Air Commuter                                                               | JAC      | COMMUTER                       | 
    JetSMART                                                                         | JAT      | ROCKSMART                      | 
    Jatayu Airlines                                                                  | JTY      | JATAYU                         | 
    Jazeera Airways                                                                  | JZR      | JAZEERA                        | 
    Jeju Air                                                                         | JJA      | JEJU AIR                       | 
    Jenney Beechcraft                                                                | JNY      | JENAIR                         | 
    Jet Air Group                                                                    | JSI      | SISTEMA                        | JSC
    Jamahiriya Airways                                                               | JAW      | JAW                            | 
    Japan Transocean Air                                                             | JTA      | JAI OCEAN                      | 
    Jet Airways                                                                      | JAI      | JET AIRWAYS                    | 
    Jeppesen UK                                                                      | JPN      | JETPLAN                        | 
    Island Express                                                                   | SDY      | SANDY ISLE                     | 
    Jet Aviation                                                                     | PJS      | JETAVIATION                    | 
    Jet Aspen Air Lines                                                              | JTX      | JET ASPEN                      | 
    Jet Aviation Flight Services                                                     | JAS      | JET SETTER                     | 
    Jet Center Flight Training                                                       | JCF      | JET CENTER                     | 
    Jet Courier Service                                                              | DWW      | DON JUAN                       | 
    Jet Fighter Flights                                                              | RZA      | RAZOR                          | 
    Jet Freighters                                                                   | CFT      | CASPER FREIGHT                 | 
    Jet East International                                                           | JED      | JET EAST                       | 
    Jet Executive International Charter                                              | JEI      | JET EXECUTIVE                  | 
    Jet Charter                                                                      | JCT      | JET CHARTER                    | 
    Jet Aviation Business Jets                                                       | BZF      | BIZFLEET                       | 
    Jet Link                                                                         | JEK      | JET OPS                        | 
    Jet Line International                                                           | MJL      | MOLDJET                        | 
    Jet Linx Aviation                                                                | JTL      | JET LINX                       | 
    Jet Norte                                                                        | JNR      | JET NORTE                      | 
    Jet Rent                                                                         | JRN      | JET RENT                       | 
    Jetstar Asia Airways                                                             | JSA      | JETSTAR ASIA                   | 
    Jet Linx Aviation                                                                | HTL      | HEARTLAND                      | 
    Jet Stream                                                                       | JSM      | JET STREAM                     | 
    Jet-2000                                                                         | JTT      | MOSCOW JET                     | 
    Jet G&D Aviation                                                                 | JGD      | JET GEE-AND-DEE                | 
    Jet Trans Aviation                                                               | JTC      | JETRANS                        | 
    Jet-Ops                                                                          | OPS      | OPS-JET                        | 
    Jet4You                                                                          | JFU      | ARGAN                          | 
    Jet2                                                                             | EXS      | CHANNEX                        | 
    JetBlue Airways                                                                  | JBU      | JETBLUE                        | 
    JetAfrica Swaziland                                                              | OSW      | BEVO                           | 
    Jet Asia Airways                                                                 | JAA      | JET ASIA                       | 
    Jetairfly                                                                        | JAF      | BEAUTY                         | 
    Jetalliance                                                                      | JAG      | JETALLIANCE                    | 
    Jetall Holdings                                                                  | JTL      | FIREFLY                        | 
    Jetclub                                                                          | JCS      | JETCLUB                        | 
    Jetconnect                                                                       | QNZ      | QANTAS JETCONNECT              | 
    Jetcorp                                                                          | UEJ      | JETCORP                        | 
    Jetfly Aviation                                                                  | JFA      | MOSQUITO                       | 
    Jetgo International                                                              | JIC      | JIC-JET                        | 
    Jetlink Express                                                                  | JLX      | KEN JET                        | 
    Jetnova de Aviación Ejecutiva                                                    | JNV      | JETNOVA                        | 
    Jetcraft Aviation                                                                | JCC      | JETCRAFT                       | 
    Jetran Air                                                                       | MDJ      | JETRAN AIR                     | 
    JetNetherlands                                                                   | JNL      | JETNETHERLANDS                 | 
    Jetpro                                                                           | JPO      | JETPRO                         | 
    Jets Ejecutivos                                                                  | JEJ      | MEXJETS                        | 
    Jets Personales                                                                  | JEP      | JET PERSONALES                 | 
    Jets Y Servicios Ejecutivos                                                      | JSE      | SERVIJETS                      | 
    Jetstar Japan                                                                    | JJP      | ORANGE LINER                   | 
    Jetstar Airways                                                                  | JST      | JETSTAR                        | 
    Jetstar Hong Kong Airways                                                        | JKT      | KAITAK                         | 
    Jetstream Executive Travel                                                       | JXT      | VANNIN                         | 
    Jetfly Airlines                                                                  | JFL      | LINEFLYER                      | 
    Jetflite                                                                         | JEF      | JETFLITE                       | 
    JetSuite                                                                         | RSP      | REDSTRIPE                      | 
    Jett Paqueteria                                                                  | JPQ      | JETT PAQUETERIA                | 
    Jettime                                                                          | JTG      | JETTIME                        | 
    Jettrain Corporation                                                             | JTN      | JETTRAIN                       | 
    Jigsaw Project                                                                   | JSW      | JIGSAW                         | Bristow Helicopters
    Jetways of Iowa                                                                  | JWY      | JETWAYS                        | 
    Jett8 Airlines Cargo                                                             | JEC      | TAIPAN                         | 
    Jim Hankins Air Service                                                          | HKN      | HANKINS                        | 
    Jim Ratliff Air Service                                                          | RAS      | SHANHIL                        | 
    Joanas Avialinijos                                                               | JDG      | LADYBLUE                       | 
    Job Air                                                                          | JBR      | JOBAIR                         | 
    Jibair                                                                           | JIB      | JIBAIRLINE                     | 
    JetX Airlines                                                                    | JXX      | JETBIRD                        | 
    Johnson Air                                                                      | JHN      | AIR JOHNSON                    | 
    Johnsons Air                                                                     | JON      | JOHNSONSAIR                    | 
    Johnston Airways                                                                 | JMJ      | JOHNSTON                       | 
    Joint Military Commission                                                        | JMM      | JOICOMAR                       | 
    Jorvik                                                                           | JVK      | ISLANDIC                       | 
    Jetrider International                                                           | JRI      | JETRIDER                       | 
    Jordan Aviation                                                                  | JAV      | JORDAN AVIATION                | 
    Ju-Air                                                                           | JUR      | JUNKERS                        | 
    Jomartaxi Aereo                                                                  | JMT      | JOMARTAXI                      | 
    Journey Jet                                                                      | JNJ      | JOURNEY JET                    | 
    Jubba Airways                                                                    | JUB      | JUBBA                          | 
    Jubilee Airways                                                                  | DKE      | DUKE                           | 
    Juanda Flying School                                                             | JFS      | JAEMCO                         | 
    Justair Scandinavia                                                              | MEY      | MELODY                         | 
    Juneyao Airlines                                                                 | DKH      | JUNEYAO AIRLINES               | 
    Justice Prisoner and Alien Transportation System                                 | DOJ      | JUSTICE                        | 
    KC International Airlines                                                        | KCH      | CAM AIR                        | 
    Jonsson, H Air Taxi                                                              | ODI      | ODINN                          | 
    Jota Aviation                                                                    | ENZ      | ENZO                           | 
    K D Air Corporation                                                              | KDC      | KAY DEE                        | 
    Kyrgyz Airlines                                                                  | KGZ      | BERMET                         | 
    K-Mile Air                                                                       | KMI      | KAY-MILE AIR                   | 
    Kolob Canyons Air Services                                                       | KCR      | KOLOB                          | 
    KD Avia                                                                          | KNI      | KALININGRAD AIR                | 
    K S Avia                                                                         | KSA      | SKY CAMEL                      | 
    KLM Cityhopper                                                                   | KLC      | CITY                           | 
    KLM                                                                              | KLM      | KLM                            | 
    Kabo Air                                                                         | QNK      | KABO                           | 
    Juba Cargo Services & Aviation                                                   | JUC      | JUBA CARGO                     | 
    Kharkiv Airlines                                                                 | KHK      | SUNRAY                         | 
    Kaiser Air                                                                       | KAI      | KAISER                         | 
    Kalitta Air                                                                      | CKS      | CONNIE                         | Operates 747-200s & -400s
    Kalitta Charters                                                                 | KFS      | KALITTA                        | Operates Lear 20s & 30s, Falcon 20s, & King Airs
    Kalstar Aviation                                                                 | KLS      | KALSTAR                        | 
    Kalitta Charters II                                                              | KII      | DRAGSTER                       | Operates B727-200s & DC9s
    Kam Air                                                                          | KMF      | KAMGAR                         | 
    Kampuchea Airlines                                                               | KMP      | KAMPUCHEA                      | IATA was KT
    Kallat El Saker Air                                                              | KES      | KALLAT EL SKER                 | 
    Kansas State University                                                          | KSU      | K-STATE                        | 
    Kanfey Ha'emek Aviation                                                          | KHE      | KANFEY HAEMEK                  | 
    Kahama Mining Corporation                                                        | KMC      | KAHAMA                         | 
    Kartika Airlines                                                                 | KAE      | KARTIKA                        | 
    Karat                                                                            | AKT      | AVIAKARAT                      | 
    Karibu Airways                                                                   | KRB      | KARIBU AIR                     | 
    Kata Transportation                                                              | KTV      | KATAVIA                        | 
    Kavminvodyavia                                                                   | MVD      | AIR MINVODY                    | 
    Kaz Agros Avia                                                                   | KRN      | ANTOL                          | 
    Kato Airline                                                                     | KAT      | KATO-AIR                       | 
    Karthago Airlines                                                                | KAJ      | KARTHAGO                       | 
    Kazavia                                                                          | KKA      | KAKAIR                         | 
    Kaz Air West                                                                     | KAW      | KAZWEST                        | 
    Air Astana                                                                       | KZR      | SPAKAZ                         | 
    Kazaviaspas                                                                      | KZS      | ASTANALINE                     | 
    Keenair Charter -                                                                | JFK      | KEENAIR                        | 
    Kelix Air                                                                        | KLX      | KELIX                          | 
    Kazan Aviation Production Association                                            | KAO      | KAZAVAIA                       | 
    Kelner Airways                                                                   | FKL      | KELNER                         | 
    Kelowna Flightcraft Air Charter                                                  | KFA      | FLIGHTCRAFT                    | 
    Kenmore Air                                                                      | KEN      | KENMORE                        | 
    Kent Aviation                                                                    | KAH      | DEKAIR                         | 
    Kenya Airways                                                                    | KQA      | KENYA                          | 
    Kevis                                                                            | KVS      | KEVIS                          | 
    Key Airlines                                                                     | KEY      | KEY AIR                        | 
    Kenn Borek Air                                                                   | KBA      | BOREK AIR                      | 
    Key Lime Air                                                                     | LYM      | KEY LIME                       | 
    Keystone Aerial Surveys                                                          | FTP      | FOOTPRINT                      | 
    Khalifa Airways                                                                  | KZW      | KHALIFA AIR                    | 
    Katekavia                                                                        | KTK      | KATEKAVIA                      | 
    Kharkov Aircraft Manufacturing                                                   | WKH      | WEST-KHARKOV                   | 
    Keystone Air Service                                                             | KEE      | KEYSTONE                       | 
    Khazar                                                                           | KHR      | KHAZAR                         | 
    Khoriv-Avia                                                                      | KRV      | KHORIV-AVIA                    | 
    KLM Helicopter                                                                   | KLH      | KLM HELI                       | 
    Kazan Helicopters                                                                | KPH      | KAMA                           | 
    King Aviation                                                                    | KNG      | KING                           | 
    Kiev Aviation Plant                                                              | UAK      | AVIATION PLANT                 | 
    Khors Air                                                                        | KHO      | AIRCOMPANY KHORS               | 
    Khyber Afghan Airlines                                                           | KHY      | KHYBER                         | 
    Kinshasa Airways                                                                 | KNS      | KINSHASA AIRWAYS               | 
    Kingfisher Air Services                                                          | BEZ      | SEA BREEZE                     | 
    Knighthawk Air Express                                                           | KNX      | KNIGHT FLIGHT                  | 
    Kinnarps                                                                         | KIP      | KINNARPS                       | 
    Kirov Air Enterprise                                                             | KTA      | VYATKA-AVIA                    | 
    Kish Air                                                                         | IRK      | KISHAIR                        | 
    Kiwi Regional Airlines                                                           | KRA      | REGIONAL                       | 
    Kiwi International Air Lines                                                     | KIA      | KIWI AIR                       | 
    Khoezestan Photros Air Lines                                                     | KHP      | PHOTROS AIR                    | 
    Knights Airlines                                                                 | KGT      | KNIGHT-LINER                   | 
    Knighthawk Express                                                               | KHX      | RIZZ                           | 
    Knight Air                                                                       | KNA      | KNIGHTAIR                      | 
    Kogalymavia Air                                                                  | KGL      | KOGALYM                        | 
    Kom Activity                                                                     | KOM      | COMJET                         | 
    Koanda Avacion                                                                   | KOA      | KOANDA                         | 
    Komiinteravia                                                                    | KMV      | KOMIINTER                      | 
    Koda International                                                               | OYE      | KODA AIR                       | 
    Koob-Corp - 96 KFT                                                               | KOB      | AUTOFLEX                       | 
    Komiaviatrans State Air Enterprise                                               | KMA      | KOMI AVIA                      | 
    Kosmas Air                                                                       | KMG      | KOSMAS CARGO                   | 
    Kosmos                                                                           | KSM      | KOSMOS                         | 
    Korean Air                                                                       | KAL      | KOREANAIR                      | 
    Komsomolsk-on-Amur Air Enterprise                                                | KNM      | KNAAPO                         | 
    Kosova Airlines                                                                  | KOS      | KOSOVA                         | 
    Krimaviamontag                                                                   | KRG      | AVIAMONTAG                     | 
    Kovar Air                                                                        | WOK      | WOKAIR                         | 
    Krym                                                                             | KYM      | CRIMEA AIR                     | 
    Kingfisher Airlines                                                              | KFR      | KINGFISHER                     | 
    Kingston Air Services                                                            | KAS      | KINGSTON AIR                   | 
    Kuban Airlines                                                                   | KIL      | AIR KUBAN                      | 
    Krylo Airlines                                                                   | KRI      | KRYLO                          | 
    Kroonk Air Agency                                                                | KRO      | KROONK                         | 
    Krystel Air Charter                                                              | OPC      | OPTIC                          | 
    Kunpeng Airlines                                                                 | KPA      | KUNPENG                        | 
    Kremenchuk Flight College                                                        | KFC      | KREMENCHUK                     | 
    Kuzu Airlines Cargo                                                              | KZU      | KUZU CARGO                     | 
    Air Kyrgyzstan                                                                   | LYN      | ALTYN AVIA                     | Name changed to Air Kyrgyzstan
    Kvadro Aero                                                                      | QVR      | PEGASO                         | 
    Kwena Air                                                                        | KWN      | KWENA                          | 
    Kyrgyz Trans Avia                                                                | KTC      | DINARA                         | 
    Kyrgyzstan Department of Aviation                                                | DAM      | FLIGHT RESCUE                  | under the Ministry of Emergency Situation
    Kustbevakningen                                                                  | KBV      | SWECOAST                       | 
    Kyrgyzstan Airlines                                                              | KGA      | KYRGYZ                         | 
    Kuwait Airways                                                                   | KAC      | KUWAITI                        | 
    Kyrgyz Airlines                                                                  | KGZ      | BERMET                         | 
    Kyrgz General Aviation                                                           | KGB      | KEMIN                          | 
    Keewatin Air                                                                     | KEW      | BLIZZARD                       | 
    Lease Fly                                                                        | LZF      | SKYLEASE                       | 
    Logistic Air                                                                     | LGA      | LOGAIR                         | 
    Liebherr Geschaeftreiseflugzeug                                                  | LHB      | FAMILY                         | 
    LeTourneau University                                                            | JKA      | JACKET                         | 
    Legacy Air                                                                       | LGC      | LEGACY AIR                     | 
    Livingstone Executive                                                            | AOE      | LIVINGSTONE AIR                | 
    Libyan Wings                                                                     | LWA      | LIBYAN WINGS                   | 
    Lowlevel                                                                         | LWL      | CUB DRIVER                     | 
    TAR Aerolineas                                                                   | LCT      | TAR                            | 
    L A Helicopter                                                                   | LAH      | STAR SHIP                      | 
    L J Aviation                                                                     | LJY      | ELJAY                          | 
    Liberty Air                                                                      | LTY      | SKYDECK                        | 
    L&L Flygbildteknik                                                               | PHO      | PHOTOFLIGHT                    | 
    L'Express Airlines                                                               | LEX      | LEX                            | 
    LADE - Líneas Aéreas Del Estado                                                  | LDE      | LADE                           | 
    Lynden Air Cargo                                                                 | LYB      | HIGHLANDS                      | 
    L R Airlines                                                                     | LRB      | LADY RACINE                    | 
    LAI - Línea Aérea IAACA                                                          | BNX      | AIR BARINAS                    | 
    L-3 Communications Flight International Aviation                                 | FNT      | FLIGHT INTERNATIONAL           | 
    L.A.B. Flying Service                                                            | LAB      | LAB                            | 
    LACSA                                                                            | LRC      | LACSA                          | 
    LATAM Chile                                                                      | LAN      | LAN CHILE                      | 
    LATAM Argentina                                                                  | DSM      | LAN AR                         | 
    LATAM Colombia                                                                   | ARE      | LAN COLOMBIA                   | 
    LATAM Express                                                                    | LXP      | LANEX                          | 
    LATAM Paraguay                                                                   | LAP      | PARAGUAYA                      | 
    LAP Colombia - Líneas Aéreas Petroleras                                          | APT      | LAP                            | 
    LATAM Cargo Chile                                                                | LCO      | LAN CARGO                      | 
    LAN Dominicana                                                                   | LNC      | LANCANA                        | 
    LC Busre                                                                         | LCB      | BUSRE                          | 
    LANSA                                                                            | LSA      | INTERNACIONAL                  | 
    LOT Polish Airlines                                                              | LOT      | POLLOT                         | 
    LeTourneau University                                                            | JKA      | JACKET                         | 
    LTU Austria                                                                      | LTO      | BILLA TRANSPORT                | 
    LTE International Airways                                                        | LTE      | FUN JET                        | 
    LUKoil-Avia                                                                      | LUK      | LUKOIL                         | 
    La Ronge Aviation Services                                                       | ASK      | AIR SASK                       | 
    La Valenciana Taxi Aéreo                                                         | LVT      | TAXIVALENCIANA                 | 
    Labrador Airways                                                                 | LAL      | LAB AIR                        | 
    LTU International                                                                | LTU      | LTU                            | 
    Labcorp                                                                          | SKQ      | SKYLAB                         | 
    Lake Havasu Air Service                                                          | HCA      | HAVASU                         | 
    Laker Airways                                                                    | LKR      | LAKER                          | 
    Laker Airways                                                                    | LBH      | LAKER BAHAMAS                  | 
    Lakeland Aviation                                                                | LKL      | LAKELAND                       | 
    Lanaes Aereas Trans Costa Rica                                                   | TCR      | TICOS                          | 
    LTV Jet Fleet Corporation                                                        | JFC      | JET-FLEET                      | 
    Landsflug                                                                        | ISL      | ISLANDIA                       | 
    Lankair                                                                          | LKN      | LANKAIR                        | 
    Lankan Cargo                                                                     | RLN      | AERO LANKA                     | 
    LATAM Peru                                                                       | LPE      | LANPERU                        | 
    Lanza Air                                                                        | LZA      | AEROLANZA                      | 
    Langtry Flying Group                                                             | PAP      | PROFLIGHT                      | 
    Lamra                                                                            | LMR      | LAMAIR                         | 
    Lao Capricorn Air                                                                | LKA      | NAKLAO                         | 
    LASTP                                                                            | OTN      | LASTP                          | 
    Lanzarote Aerocargo                                                              | LZT      | BARAKA                         | 
    Lao Airlines                                                                     | LAO      | LAO                            | 
    Laoag International Airlines                                                     | LPN      | LAOAG AIR                      | 
    Lauda Air                                                                        | LDA      | LAUDA AIR                      | 
    Laredo Air                                                                       | LRD      | LAREDO AIR                     | 
    Laughlin Express                                                                 | LEP      | LAUGHLIN EXPRESS               | 
    LaudaMotion                                                                      | LDM      | LAUDA MOTION                   | 
    Laus                                                                             | LSU      | LAUS AIR                       | 
    Lauda Air Italy                                                                  | LDI      | LAUDA ITALY                    | 
    Layang-Layang Aerospace                                                          | LAY      | LAYANG                         | 
    Lease-a-Plane International                                                      | LPL      | LEASE-A-PLANE                  | 
    Lawrence Aviation                                                                | LAR      | LAWRENCE                       | 
    Lebanon Airport Development Corporation                                          | LAD      | LADCO-AIR                      | 
    Lebanese Air Transport                                                           | LAQ      | LAT                            | 
    Leconte Airlines                                                                 | LCA      | LECONTE                        | 
    Lebanese Air Transport                                                           | LAT      | LEBANESE AIR                   | 
    Lebap                                                                            | LEB      | LEBAP                          | 
    Leeward Islands Air Transport                                                    | LIA      | LIAT                           | 
    Lao Skyway                                                                       | LLL      | LAVIE                          | 
    Level                                                                            | LVL      | LEVEL                          | 
    Latvian Air Force                                                                | LAF      | LATVIAN AIRFORCE               | 
    Leonsa De Aviación                                                               | LEL      | LEONAVIA                       | 
    Legend Airlines                                                                  | LGD      | LEGENDARY                      | 
    Leo-Air                                                                          | LOR      | LEO CHARTER                    | 
    Libyan Arab Air Cargo                                                            | LCR      | LIBAC                          | 
    Libyan Airlines                                                                  | LYW      | LIBYAN AIRWAYS                 | 
    Lentini Aviation                                                                 | LEN      | LENTINI                        | 
    Libyan Arab Airlines                                                             | LAA      | LIBAIR                         | 
    Lignes Aeriennes Du Tchad                                                        | LKD      | LATCHAD                        | 
    Lindsay Aviation                                                                 | LSY      | LINDSAY AIR                    | 
    Lignes Nationales Aeriennes - Linacongo                                          | GCB      | LINACONGO                      | 
    Línea Aérea Costa Norte                                                          | NOT      | COSTA NORTE                    | 
    Lignes Mauritaniennes Air Express                                                | LME      | LIMAIR EXPRESS                 | 
    Línea Aérea SAPSA                                                                | LNP      | SAPSA                          | 
    Línea Aérea Mexicana de Carga                                                    | LMC      | LINEAS DECARGA                 | 
    Línea Aérea de Fumig Aguas Negras                                                | NEG      | AGUAS NEGRAS                   | 
    Línea Aérea de Servicio Ejecutivo Regional                                       | LER      | LASER                          | 
    Línea Turística Aereotuy                                                         | TUY      | AEREOTUY                       | 
    Líneas Aéreas Alaire                                                             | ALR      | AEROLAIRE                      | 
    Líneas Aéreas Comerciales                                                        | LCM      | LINEAS COMERCIALES             | 
    Líneas Aéreas Canedo LAC                                                         | LCN      | CANEDO                         | 
    Leisure Air                                                                      | LWD      | LEISURE WORLD                  | 
    Líneas Aéreas Ejectuivas De Durango                                              | EDD      | LINEAS DURANGO                 | 
    Líneas Aéreas Eldorado                                                           | EDR      | ELDORADRO                      | 
    Líneas Aéreas Monarca                                                            | LMN      | LINEAS MONARCA                 | 
    LIFT Academy                                                                     | LTA      | LIFT                           | 
    Líneas Aéreas Federales                                                          | FED      | FEDERALES                      | 
    Líneas Aéreas San Jose                                                           | LIJ      | LINEAS JOSE                    | 
    Líneas Aéreas del Humaya                                                         | UMA      | HUMAYA                         | 
    Volkswagen AirService GmbH                                                       | WGT      | WORLDGATE                      | 
    Linhas Aéreas Santomenses                                                        | SMS      | SANTOMENSES                    | 
    Lions-Air                                                                        | LEU      | LIONSAIR                       | 
    Linhas Aéreas de Moçambique                                                      | LAM      | MOZAMBIQUE                     | 
    Lithuanian Air Force                                                             | LYF      | LITHUANIAN AIRFORCE            | safety department
    Lloyd Aéreo Boliviano                                                            | LLB      | LLOYDAEREO                     | 
    Lnair Air Services                                                               | LNA      | ELNAIR                         | 
    Little Red Air Service                                                           | LRA      | LITTLE RED                     | 
    Lockeed Aircraft Corporation                                                     | LAC      | LOCKHEED                       | 
    Lion Air                                                                         | LNI      | LION INTER                     | 
    Loganair                                                                         | LOG      | LOGAN                          | Gained the code LM after beginning independent operations 
    Lockheed Martin Aeronautics                                                      | LNG      | LIGHTNING                      | 
    Lom Praha Flying School                                                          | CLV      | AEROTRAINING                   | 
    Lomas Helicopters                                                                | LMS      | LOMAS                          | 
    London City Airport Jet Centre                                                   | LCY      | LONDON CITY                    | 
    London Executive Aviation                                                        | LNX      | LONEX                          | 
    London Flight Centre                                                             | LOV      | LOVEAIR                        | 
    London Helicopter Centres                                                        | LHC      | MUSTANG                        | 
    Lone Star Airlines                                                               | LSS      | LONE STAR                      | 
    Long Island Airlines                                                             | ORA      | LONG ISLAND                    | 
    Longtail Aviation                                                                | LGT      | LONGTAIL                       | 
    Los Cedros Aviación                                                              | LSC      | CEDROS                         | 
    Lorraine Aviation                                                                | LRR      | LORRAINE                       | 
    Lotus Air                                                                        | TAS      | LOTUS FLOWER                   | 
    Lucky Air                                                                        | LKE      | LUCKY AIR                      | 
    Luchtvaartmaatschappij Twente                                                    | LTW      | TWENTAIR                       | 
    Luftfahrt-Vermietungs-Dienst                                                     | LVD      | AIR SANTE                      | 
    Lufthansa                                                                        | DLH      | LUFTHANSA                      | 
    Luft Carago                                                                      | LUT      | LUGO                           | 
    Lufthansa Cargo                                                                  | GEC      | LUFTHANSA CARGO                | 
    Linex                                                                            | LEC      | LECA                           | 
    Lufthansa CityLine                                                               | CLH      | HANSALINE                      | 
    Lockheed Martin Aeronautics                                                      | CBD      | CATBIRD                        | 
    Lignes Aeriennes Congolaises                                                     | LCG      | CONGOLAISE                     | 
    Lufttransport                                                                    | LTR      | LUFT TRANSPORT                 | 
    Luxair                                                                           | LGL      | LUXAIR                         | 
    Luxaviation                                                                      | LXA      | RED LION                       | 
    Lund University School of Aviation                                               | UNY      | UNIVERSITY                     | 
    Luhansk                                                                          | LHS      | ENTERPRISE LUHANSK             | 
    Luxembourg Air Rescue                                                            | LUV      | LUX RESCUE                     | 
    Lufthansa Technik                                                                | LHT      | LUFTHANSA TECHNIK              | 
    Lufttaxi Fluggesellschaft                                                        | LTF      | GARFIELD                       | 
    Luzair                                                                           | LUZ      | LISBON JET                     | 
    Lynden Air Cargo                                                                 | LYC      | LYNDEN                         | 
    Lydd Air                                                                         | LYD      | LYDDAIR                        | 
    Lynx Air International                                                           | LXF      | LYNX FLIGHT                    | 
    Lynx Aviation                                                                    | SSX      | SHASTA                         | Part of Frontier Airlines
    Líneas Aéreas Suramericanas                                                      | LAU      | SURAMERICANO                   | 
    LongJiang Airlines                                                               | SNG      | SNOW EAGLE                     | 
    Lynch Flying Service                                                             | LCH      | LYNCH AIR                      | 
    Jin Air                                                                          | JNA      | JIN AIR                        | 
    McMahon Helicopter                                                               | MMH      | NIGHT RIDER                    | 2015
    Maldivian                                                                        | DQA      | ISLAND AVIATION                | 
    Mahogany Air Charters                                                            | HOG      | HOGAN AIR                      | 2014
    Millon Express                                                                   | MXS      | MILLON EXPRESS                 | Trading name for Sunrise Airlines allocated in 2014
    Maritime Helicopters                                                             | MHF      | AIR MARITIME                   | Allocated 2014
    Modern Transporte Aereo De Carga                                                 | MWM      | MODERNAIR                      | 
    Minsheng International Jet                                                       | MSF      | MEINSHENG                      | 2014
    Luxflight Executive                                                              | LFE      | LUX EXPRESS                    | 
    Lviv Airlines                                                                    | UKW      | UKRAINE WEST                   | 
    Malawian Airlines 2014                                                           | MWI      | MALAWIAN                       | 
    Memorial Hermann Hospital System                                                 | RDK      | RED DUKE                       | Houston, Texas
    Multiservicios Aereos Del Valle                                                  | MLV      | MULTI VALLE                    | 
    Macau Jet International                                                          | MMJ      | MACAUJET                       | 
    Maximum Flight Advantages                                                        | MXF      | MAXFLIGHT                      | 
    Malindo Airways                                                                  | MXD      | MALINDO EXPRESS                | 
    MBK-S                                                                            | PLG      | PILGRIM                        | 
    Lynx Aviation                                                                    | LYX      | LYNX AIR                       | 
    Midwest Aviation                                                                 | DZR      | DOZER                          | 
    My Fair Jet                                                                      | HTL      | HOTLINE                        | 
    Mountain Flyers 80                                                               | MFB      | MOUNTAINHELI                   | 
    Mann Yadanarpon Airlines                                                         | MYP      | MANN ROYAL                     | 
    Mandarin Air                                                                     | MJC      | AIR MANDA                      | 
    Magnum Air                                                                       | MSJ      | MAGNUM AIR                     | 
    MANAG'AIR                                                                        | MRG      | MANAG'AIR                      | 
    M & N Aviation                                                                   | JNH      | JONAH                          | 
    MasAir                                                                           | MAA      | MAS CARGA                      | 
    MASwings                                                                         | MWG      | MASWINGS                       | 
    MG Aviación                                                                      | MGA      | MAG AVACION                    | 
    MCC Aviation                                                                     | MCC      | DISCOVERY                      | 
    MAT Macedonian Airlines                                                          | MAK      | MAKAVIO                        | 
    MIA Airlines                                                                     | JLA      | SALLINE                        | 
    MIAT Mongolian Airlines                                                          | MGL      | MONGOL AIR                     | 
    MK Airline                                                                       | MKA      | KRUGER-AIR                     | 
    MAC Fotografica                                                                  | MCF      | MAC FOTO                       | 
    MIT Airlines                                                                     | MNC      | MUNCIE                         | 
    MTC Aviación                                                                     | MCV      | MTC AVIACION                   | 
    MNG Airlines                                                                     | MNB      | BLACK SEA                      | 
    Mac Dan Aviation Corporation                                                     | MCN      | MAC DAN                        | 
    MAS Airways                                                                      | TFG      | TRAFALGAR                      | 
    Madina Air                                                                       | MDH      | MADINA AIR                     | 
    MAP-Management and Planung                                                       | MPJ      | MAPJET                         | 
    Mac Aviation                                                                     | MAQ      | MAC AVIATION                   | 
    Magic Blue Airlines                                                              | MJB      | MAGIC BLUE                     | 
    Mahalo Air                                                                       | MLH      | MAHALO                         | 
    Mahan Air                                                                        | IRM      | MAHAN AIR                      | 
    Maine Aviation                                                                   | MAT      | MAINE-AV                       | 
    Majestic Airlines                                                                | MAJ      | MAGIC AIR                      | 
    Mak Air                                                                          | AKM      | MAKAIR                         | 
    Mahfooz Aviation                                                                 | MZS      | MAHFOOZ                        | 
    Malawi Express                                                                   | MLX      | MALAWI EXPRESS                 | 
    Malaya Aviatsia Dona                                                             | MKK      | AEROKEY                        | 
    Magna Air                                                                        | MGR      | MAGNA AIR                      | 
    Macedonian Airlines                                                              | MCS      | MACAIR                         | 
    Malaysia Airlines                                                                | MAS      | MALAYSIAN                      | 
    Mali Air                                                                         | MAE      | MALI AIREXPRESS                | 
    MSR Flug-Charter                                                                 | EBF      | SKYRUNNER                      | 
    Mali Air Express                                                                 | VXP      | AVION EXPRESS                  | 
    Malmö Aviation                                                                   | SCW      | SCANWING                       | 
    Malmoe Air Taxi                                                                  | LOD      | LOGIC                          | 
    Malila Airlift                                                                   | MLC      | MALILA                         | 
    Manaf International Airways                                                      | MLB      | MANAF                          | 
    Mali Airways                                                                     | MTZ      | MALI AIRWAYS                   | 
    Mandala Airlines                                                                 | MDL      | MANDALA                        | 
    Mango                                                                            | MNO      | TULCA                          | 
    Malta Wings                                                                      | MWS      | MALTA WINGS                    | 
    Mandarin Airlines                                                                | MDA      | MANDARIN                       | 
    Mannion Air Charter                                                              | MAN      | MANNION                        | 
    Mann Air                                                                         | MNR      | TEEMOL                         | 
    Mall Airways                                                                     | MLS      | MALL-AIRWAYS                   | 
    Manhattan Air                                                                    | MHN      | MANHATTAN                      | 
    Maple Air Services                                                               | MAD      | MAPLE AIR                      | 
    Mantrust Asahi Airways                                                           | MTS      | MANTRUST                       | 
    March Helicopters                                                                | MAR      | MARCH                          | 
    Marghi Air                                                                       | MGI      | MARGHI                         | 
    Markoss Aviation                                                                 | MKO      | GOSHAWK                        | 
    Manx Airlines                                                                    | MNX      | MANX                           | 
    Marcopolo Airways                                                                | MCP      | MARCOPOLO                      | 
    Markair                                                                          | MRK      | MARKAIR                        | 
    Marshall Aerospace                                                               | MCE      | MARSHALL                       | 
    Manitoulin Air Services                                                          | MTO      | MANITOULIN                     | 
    Martinaire                                                                       | MRA      | MARTEX                         | 
    Marsland Aviation                                                                | MSL      | MARSLANDAIR                    | 
    Mars RK                                                                          | MRW      | AVIAMARS                       | 
    Maryland State Police                                                            | TRP      | TROOPER                        | 
    Martyn Fiddler Associates                                                        | MFA      | SEAHORSE                       | 
    Marvin                                                                           | MVN      | MARVIN                         | 
    Martinair                                                                        | MPH      | MARTINAIR                      | 
    Massachusetts Institute of Technology                                            | MTH      | RESEARCH                       | 
    Martin-Baker                                                                     | MBE      | MARTIN                         | 
    Masterjet                                                                        | LMJ      | MASTERJET                      | 
    Mauritanienne Aerienne Et Navale                                                 | MNV      | NAVALE                         | 
    Mauritanienne Air Fret                                                           | MRF      | MAUR-FRET                      | 
    Mauria                                                                           | MIA      | MAURIA                         | 
    Mauritanienne Airways                                                            | MWY      | MAURITANIENNE                  | 
    Maverick Airways                                                                 | MVR      | MAV-AIR                        | 
    Massey University School of Aviation                                             | MSY      | MASSEY                         | 
    Mauritanienne De Transport Aerien                                                | MDE      | MAURI-TRANS                    | 
    Max Avia                                                                         | MAI      | MAX AVIA                       | 
    Maxair                                                                           | MXL      | MAXAIR                         | 
    Max-Aviation                                                                     | MAX      | MAX AVIATION                   | 
    Max Sea Food                                                                     | MSF      | MAXESA                         | 
    Maximus Air Cargo                                                                | MXU      | CARGO MAX                      | 
    May Air Xpress                                                                   | MXP      | BEECHNUT                       | 
    Mbachi Air                                                                       | MBS      | MBACHI AIR                     | Ground Services
    Maxsus-Avia                                                                      | MXS      | MAXSUS-AVIA                    | 
    Maya Island Air                                                                  | MYD      | MYLAND                         | 
    Mayair                                                                           | MYI      | MAYAIR                         | 
    McCall Aviation                                                                  | MKL      | MCCALL                         | 
    McDonnell Douglas                                                                | DAC      | DACO                           | 
    McAlpine Helicopters                                                             | MCH      | MACLINE                        | 
    Master Airways                                                                   | MSW      | MASTER AIRWAYS                 | 
    Mavial Magadan Airlines                                                          | MVL      | MAVIAL                         | 
    Med-Trans of Florida                                                             | MEK      | MED-TRANS                      | 
    Medical Air Rescue Services                                                      | MRZ      | MARS                           | 
    Medical Aviation Services                                                        | MCL      | MEDIC                          | 
    Mediterranean Air Freight                                                        | MDF      | MED-FREIGHT                    | 
    Mega Linhas Aéreas                                                               | MEL      | MEGA AIR                       | 
    McNeely Charter Services                                                         | MDS      | MID-SOUTH                      | 
    Medjet International                                                             | MEJ      | MEDJET                         | 
    Menajet                                                                          | MNJ      | MENAJET                        | 
    Merchant Express Aviation                                                        | MXX      | MERCHANT                       | 
    Mercury Aircourier Service                                                       | MEC      | MERCAIR                        | 
    Meridian                                                                         | POV      | AIR POLTAVA                    | 
    Meridian Air Cargo                                                               | MRD      | MERIDIAN                       | 
    Meridian Airlines                                                                | MHL      | HASSIMAIR                      | 
    Meridiana                                                                        | ISS      | MERIDIANA                      | Callsign was MERAIR
    Meridian Aviation                                                                | DSL      | DIESEL                         | 
    Meridian                                                                         | MEM      | MERIDIAN CHERRY                | 
    Medavia                                                                          | MDM      | MEDAVIA                        | 
    Merlin Airways                                                                   | MEI      | AVALON                         | 
    Meta Linhas Aéreas                                                               | MSQ      | META                           | 
    Mega                                                                             | MGK      | MEGLA                          | 
    Mesa Airlines                                                                    | ASH      | AIR SHUTTLE                    | 
    Metroflight                                                                      | MTR      | METRO                          | 
    Metro Express                                                                    | MEX      | EAGLE EXPRESS                  | 
    Metrojet                                                                         | MTJ      | METROJET                       | 
    Metropix UK                                                                      | PIX      | METROPIX                       | 
    Metropolis                                                                       | MPS      | METRO REGIONAL                 | Metropolis Noord 1
    Merpati Nusantara Airlines                                                       | MNA      | MERPATI                        | 
    Mesaba Airlines                                                                  | MES      | MESABA                         | 
    Mexicana de Aviación                                                             | MXA      | MEXICANA                       | 
    México Transportes Aéreos                                                        | MXT      | TRANSMEX                       | 
    Miami Air Charter                                                                | HUR      | HURRICANE CHARTER              | 
    Miami Air International                                                          | BSK      | BISCAYNE                       | Previous IATA Code "GL"
    Miami Valley Aviation                                                            | OWL      | NIGHT OWL                      | 
    Miapet-Avia                                                                      | MPT      | MIAPET                         | 
    Micromatter Technology Solutions                                                 | WIZ      | WIZARD                         | 
    Mid Airlines                                                                     | NYL      | NILE                           | 
    Mex Blue                                                                         | MXB      | MEX BLUE                       | 
    Meteorological Research Flight                                                   | MET      | METMAN                         | 
    Midamerica Jet                                                                   | MJR      | MAJOR                          | 
    Middle East Airlines                                                             | MEA      | CEDAR JET                      | 
    Mid-Pacific Airlines                                                             | MPA      | MID PAC                        | 
    Midstate Airlines                                                                | MIS      | MIDSTATE                       | 
    Midwest Air Freighters                                                           | FAX      | FAIRFAX                        | 
    Midwest Airlines                                                                 | MEP      | MIDEX                          | 
    Midline Air Freight                                                              | MFR      | MIDLINE FREIGHT                | 
    Mex-Jet                                                                          | MJT      | MEJETS                         | 
    Methow Aviation                                                                  | MER      | METHOW                         | 
    Midway Express                                                                   | FLA      | PALM                           | 
    Mihin Lanka                                                                      | MLR      | MIHIN LANKA                    | 
    Midwest Helicopters De Mexico                                                    | HTE      | HELICOPTERSMEXICO              | 
    Millen Corporation                                                               | RJM      | MILLEN                         | 
    Millennium Air                                                                   | MLK      | NIGERJET                       | 
    Millardair                                                                       | MAB      | MILLARDAIR                     | 
    Million Air                                                                      | OXO      | MILL AIR                       | 
    Millennium Airlines                                                              | DLK      | DEKKANLANKA                    | 
    Miller Flying Services                                                           | MFS      | MILLER TIME                    | 
    Mimino                                                                           | MIM      | MIMINO                         | 
    Minair                                                                           | OMR      | ORMINE                         | 
    Minebea Technologies                                                             | EBE      | MINEBEA                        | 
    Mines Air Services Zambia                                                        | MAZ      | MINES                          | 
    Ministic Air                                                                     | MNS      | MINISTIC                       | 
    Midwest Aviation                                                                 | NIT      | NIGHTTRAIN                     | 
    Midwest Aviation Division                                                        | MWT      | MIDWEST                        | 
    Mint Airways                                                                     | MIC      | MINT AIRWAYS                   | 
    Minsk Aircraft Overhaul Plant                                                    | LIR      | LISLINE                        | 
    Miniliner                                                                        | MNL      | MINILINER                      | 
    Ministry of Agriculture, Fisheries and Food                                      | WDG      | WATCHDOG                       | 
    Miramichi Air Service                                                            | MIR      | MIRAMICHI                      | 
    Mission Aviation Fellowship                                                      | MAF      | MISSI                          | 
    Miras                                                                            | MIF      | MIRAS                          | 
    Missionair                                                                       | MSN      | MISIONAIR                      | 
    Mistral Air Cargo                                                                | MSA      | AIRMERCI                       | renamed Poste Air Cargo
    Missions Gouvernemtales Francaises                                               | MRN      | MARIANNE                       | 
    Mississippi State University                                                     | BDG      | BULLDOG                        | 
    Mokulele Airlines                                                                | MUL      | MUKULELE                       | Callsign and code changed from BUG/SPEEDBUGGY in 2013
    Mobil Oil                                                                        | MBO      | MOBIL                          | 
    Moldaeroservice                                                                  | MLE      | MOLDAERO                       | 
    Mohawk Airlines                                                                  | MOW      | MOHAWK AIR                     | 
    Mofaz Air                                                                        | MFZ      | MOFAZ AIR                      | 
    Mocambique Expresso                                                              | MXE      | MOZAMBIQUE EXPRESS             | 
    Moldavian Airlines                                                               | MDV      | MOLDAVIAN                      | 
    Monarch Airlines                                                                 | MNH      | MONARCH AIR                    | 
    Mississippi Valley Airways                                                       | MVA      | VALAIR                         | 
    Moldova                                                                          | MVG      | MOLDOVA-STATE                  | 
    Mombasa Air Safari                                                               | RRV      | SKYROVER                       | 
    Monerrey Air Taxi                                                                | MTI      | MONTERREY AIR                  | 
    Montenegro Airlines                                                              | MGX      | MONTENEGRO                     | former callsign was "MONTAIR"
    Mooney Aircraft Corporation                                                      | MNY      | MOONEY FLIGHT                  | 
    Monky Aerotaxis                                                                  | MKY      | MONKY                          | 
    Morris Air Service                                                               | MSS      | WASATCH                        | 
    Morrison Flying Service                                                          | MRO      | MORRISON                       | 
    Moskovia Airlines                                                                | GAI      | GROMOV AIRLINE                 | JSC
    Monde Air Charters                                                               | MDB      | MONDEAIR CARGO                 | 
    Morningstar Air Express                                                          | MAL      | MORNINGSTAR                    | 
    Montserrat Airways                                                               | MNT      | MONTSERRAT                     | 
    Mount Cook Airline                                                               | NZM      | MOUNTCOOK                      | 
    Mosphil Aero                                                                     | MPI      | MOSPHIL                        | 
    Moncton Flying Club                                                              | MFC      | EAST WIND                      | 
    Mountain Air Express                                                             | PKP      | PIKES PEAK                     | 
    Mountain Air Cargo                                                               | MTN      | MOUNTAIN                       | 
    Motor Sich                                                                       | MSI      | MOTOR SICH                     | 
    Mountain Air                                                                     | MTC      | MOUNTAIN LEONE                 | 
    Mountain Air Service                                                             | BRR      | MOUNTAIN AIR                   | 
    Mountain High Aviation                                                           | MHA      | MOUNTAIN HIGH                  | 
    Mountain Valley Air Service                                                      | MTV      | MOUNTAIN VALLEY                | 
    Mountain Pacific Air                                                             | MPC      | MOUNTAIN PACIFIC               | 
    Mudanjiang General Aviation                                                      | CMJ      | MUDANJIANG                     | 
    Multiflight                                                                      | MFT      | YORKAIR                        | 
    Multi-Aero                                                                       | WBR      | WEBER                          | 
    Murmansk Air                                                                     | MNZ      | MURMAN AIR                     | 
    Murray Air                                                                       | MUA      | MURRAY AIR                     | 
    Mustique Airways                                                                 | MAW      | MUSTIQUE                       | 
    MyWay Airlines                                                                   | MYW      | MYSKY                          | 
    Musrata Air Transport                                                            | MMR      | MUSRATA AIR                    | 
    Minoan Air                                                                       | MAV      | MINOAN                         | 
    Multi Taxi                                                                       | MTX      | MULTITAXI                      | 
    Myflug                                                                           | MYA      | MYFLUG                         | 
    Mountain Bird                                                                    | MBI      | MOUNTAIN BIRD                  | 
    Mann Air                                                                         | AAD      | AMBASSADOR                     | t/a Ambassador
    National School of Civil Aviation                                                | NAK      | ENAC SCHOOL                    | Formerly SFA prior to SEFA ATO being absorbed by the École Nationale de l'Aviation Civile.
    Nine Star Airways                                                                | NSR      | AIR STAR                       | 2014
    Myanma Airways                                                                   | UBA      | UNIONAIR                       | 
    Myanmar Airways International                                                    | MMA      | MYANMAR                        | 
    Northeastern Aviation                                                            | NEW      | MEADOW FLIGHT                  | 2014
    MHS Aviation GmbH                                                                | MHV      | SNOWCAP                        | 
    Netjets Business Aviation                                                        | NEJ      | NET BUSINESS                   | 
    Namdeb Diamond Corporation                                                       | DMD      | DIAMONDJET                     | 
    Fly Easy                                                                         | FEY      | FLYEASY                        | 
    Niger Airlines                                                                   | NIN      | NIGER AIRLINES                 | 
    Nomad Aviation                                                                   | NUB      | VALLETTA                       | 
    Nor Aviation                                                                     | ROW      | ROTORWING                      | 
    New Japan Aviation                                                               | NJA      | SHIN NIHON                     | 
    NHT Linhas Aéreas                                                                | NHG      | HELGA                          | 
    NEL Cargo                                                                        | NLG      | NELCARGO                       | 
    NZ Warbirds Association                                                          | WAR      | WARBIRDS                       | 
    Nahanni Air Services                                                             | NAH      | NAHANNI                        | 
    National Center for Atmospheric Research                                         | SIQ      | SCIENCE QUEST                  | 
    Nada Air Service                                                                 | NHZ      | NADA AIR                       | 
    Nacoia Lda                                                                       | ANL      | AIR NACOIA                     | 
    Northern Helicopter                                                              | NHC      | NORTHERN                       | 
    Nantucket Airlines                                                               | ACK      | ACK AIR                        | WAS 9k
    Nakheel Aviation                                                                 | NKL      | NAKHEEL                        | 
    Nanyah Aviation                                                                  | NYA      | NANYAH                         | 
    Nashville Jet Charters                                                           | NJC      | NASHVILLE JET                  | 
    Nanjing Airlines                                                                 | CNJ      | NINGHANG                       | 
    Napier Air Service Inc                                                           | NAP      | NAPIER                         | 
    Nas Air                                                                          | NCM      | AIR BANE                       | 
    Nasair                                                                           | NAS      | NASAIRWAYS                     | 
    Natalco Air Lines                                                                | NCO      | NATALCO                        | 
    National Air Cargo dba National Airlines                                         | NCR      | NATIONAL CARGO                 | 
    Namibia Commercial Aviation                                                      | MRE      | MED RESCUE                     | 
    NAM Air                                                                          | NIH      | NAM                            | 
    National Air Traffic Controllers Association                                     | NTK      | NATCA                          | 
    Namibian Defence Force                                                           | NDF      | NAMIBIAN AIR FORCE             | 
    National Airlines                                                                | KUS      | KUSWAG                         | 
    National Express                                                                 | NXT      | NATIONAL FREIGHT               | Texas Air Charters
    National Air Charter                                                             | NSR      | NASAIR                         | 
    National Aviation Consultants                                                    | TNC      | NATCOM                         | 
    National Jet Express                                                             | JTE      | JETEX                          | 
    National Air Traffic Services                                                    | RFI      | SHERLOCK                       | 
    National Airways Corporation                                                     | LFI      | AEROMED                        | 
    National Grid plc                                                                | GRD      | GRID                           | 
    National Jet Service                                                             | AND      | AIR INDIANA                    | 
    National Jet Systems                                                             | NJS      | NATIONAL JET                   | 
    Nations Air Express Inc                                                          | NAE      | NATIONS EXPRESS                | 
    Nationwide Airlines                                                              | NTW      | NATIONWIDE                     | 
    Nationwide Airlines                                                              | NWZ      | ZAMNAT                         | 
    Nationale Luchtvaartschool                                                       | NLS      | PANDER                         | 
    National Overseas Airlines                                                       | NOL      | NAT AIRLINE                    | 
    Natural Environment Research Council                                             | EVM      | SCIENCE                        | 
    Navegación Servicios Aéreos Canarios                                             | NAY      | NAYSA                          | 
    Naturelink Charter                                                               | NRK      | NATURELINK                     | 
    Nav Canada                                                                       | NVC      | NAV CAN                        | 
    Natureair                                                                        | NRR      | NATUREAIR                      | 
    Navid                                                                            | IRI      | NAVID                          | 
    Nav Flight Planning                                                              | NAV      | NAV DISPATCH                   | 
    Navigator Airlines                                                               | NVL      | NAVLINES                       | 
    Nederlandse Kustwacht                                                            | NCG      | NETHERLANDS COASTGUARD         | 
    State of Nebraska                                                                | NEB      | NEBRASKA                       | 
    Neiltown Air                                                                     | NLA      | NEILTOWN AIR                   | 
    Nefteyugansk Aviation Division                                                   | NFT      | NEFTEAVIA                      | 
    Nepal Airlines                                                                   | RNA      | ROYAL NEPAL                    | was Royal Nepal Airlines
    Nelair Charters                                                                  | NLC      | NELAIR                         | 
    Nelson Aviation College                                                          | CGE      | COLLEGE                        | 
    Neos                                                                             | NOS      | MOONFLOWER                     | 
    Neosiam Airways                                                                  | TOX      | SKY KINGDOM                    | 
    Neric                                                                            | NSL      | NERICAIR                       | 
    Network Aviation Services                                                        | NET      | NETWORK                        | 
    NetJets                                                                          | EJA      | EXECJET                        | 
    New England Airlines                                                             | NEA      | NEW ENGLAND                    | 
    New England Air Express                                                          | NEZ      | ENGAIR                         | 
    New Heights 291                                                                  | NHT      | NEWHEIGHTS                     | 
    New World Jet Corporation                                                        | NWD      | NEW WORLD                      | 
    Naviera Mexicana                                                                 | NVM      | NAVIERA                        | 
    New York State Police                                                            | GRY      | GRAY RIDER                     | 
    Royal New Zealand Air Force                                                      | KRC      | KIWI RESCUE                    | 
    Necon Air                                                                        | NEC      | NECON AIR                      | 
    Nextflight Aviation                                                              | NXF      | NEXTFLIGHT                     | 
    New York Helicopter                                                              | NYH      | NEW YORK                       | 
    Nicaragüense de Aviación                                                         | NIS      | NICA                           | 
    NextJet                                                                          | NTJ      | NEXTJET                        | 
    Nigeria Airways                                                                  | NGA      | NIGERIA                        | 
    Nigerian Air Force                                                               | NGR      | NIGERIAN AIRFORCE              | 
    Nigerian Global                                                                  | NGX      | AIR GLOBAL                     | 
    Night Express                                                                    | EXT      | EXECUTIVE                      | 
    Nikolaev-Air                                                                     | NKV      | AIR NIKOLAEV                   | Airline of Special Purpose
    Nexus Aviation                                                                   | NXS      | NEXUS AVIATION                 | 
    Nile Safaris Aviation                                                            | NSA      | NILE SAFARIS                   | 
    Nimbus Aviation                                                                  | NBS      | NIMBUS                         | 
    Niki                                                                             | NLY      | FLYNIKI                        | 
    Nile Wings Aviation Services                                                     | NLW      | NILE WINGS                     | 
    Newair                                                                           | HVA      | HAVEN-AIR                      | 
    Newfoundland Labrador Air Transport                                              | NLT      | NALAIR                         | 
    No. 84 Squadron RAF                                                              | AKG      | GRIFTER                        | 
    Nippon Cargo Airlines                                                            | NCA      | NIPPON CARGO                   | 
    No. 32  Squadron                                                                 | NOH      | NORTHOLT                       | 
    Nok Air                                                                          | NOK      | NOK AIR                        | 
    Nobil Air                                                                        | NBL      | NOBIL AIR                      | 
    NokScoot                                                                         | NCT      | BIG BIRD                       | 
    Nizhnevartovskavia                                                               | NVK      | VARTOSKAVIA                    | 
    Nord-Flyg                                                                        | NEF      | NORDEX                         | 
    Nolinor Aviation                                                                 | NRL      | NOLINOR                        | 
    Nordavia                                                                         | AUL      | ARCHANGELSK AIR                | 
    Nordeste Linhas Aéreas Regionais                                                 | NES      | NORDESTE                       | 
    Nomad Aviation                                                                   | NMD      | NOMAD AIR                      | 
    Norcopter                                                                        | NOC      | NORCOPTER                      | 
    NordStar                                                                         | TYA      | TAIMYR                         | 
    Nordwind Airlines                                                                | NWS      | NORDLAND                       | 
    Nordic Regional                                                                  | NRD      | NORTH RIDER                    | 
    Norestair                                                                        | NRT      | NORESTAIR                      | 
    Norfolk County Flight College                                                    | NCF      | COUNTY                         | 
    Norlandair                                                                       | FNA      | NORLAND                        | 
    Norse Air Charter                                                                | NRX      | NORSE AIR                      | 
    Norrlandsflyg                                                                    | HMF      | LIFEGUARD SWEDEN               | 
    Norontair                                                                        | NOA      | NORONTAIR                      | 
    Norsk Luftambulanse                                                              | DOC      | HELIDOC                        | 
    Norsk Flytjeneste                                                                | NIR      | NORSEMAN                       | 
    Nortavia                                                                         | RTV      | TIC-TAC                        | 
    North American Airlines                                                          | NAO      | NORTH AMERICAN                 | 
    North Atlantic Air Inc                                                           | NAT      | MASS AIR                       | 
    North American Jet Charter Group                                                 | NAJ      | JET GROUP                      | 
    North Adria Aviation                                                             | NAI      | NORTH-ADRIA                    | 
    North Atlantic Cargo                                                             | NFC      | NORTH ATLANTIC                 | 
    Norsk Helikopter                                                                 | NOR      | NORSKE                         | 
    North American Charters                                                          | HMR      | HAMMER                         | 
    North Flying                                                                     | NFA      | NORTH FLYING                   | 
    North Caribou Flying Service                                                     | NCB      | NORTH CARIBOU                  | 
    North Sea Airways                                                                | NRC      | NORTH SEA                      | 
    North Star Air Cargo                                                             | SBX      | SKY BOX                        | 
    North British Airlines                                                           | NBN      | TEESAIR                        | 
    North Coast Air Services                                                         | NCC      | NORTH COAST                    | 
    North Vancouver Airlines                                                         | NRV      | NORVAN                         | 
    North West Geomatics                                                             | PTO      | PHOTO                          | 
    North-West Air Transport - Vyborg                                                | VBG      | VYBORG AIR                     | 
    Northaire Freight Lines                                                          | NFL      | GREAT LAKES                    | 
    Northamptonshire School of Flying                                                | NSF      | NORTON                         | 
    Northcoast Executive Airlines                                                    | NCE      | TOP HAT                        | 
    North West Airlines                                                              | NWW      | HALANT                         | 
    North-East Airlines                                                              | NEN      | NORTHEAST SWAN                 | 
    Northeast Airlines                                                               | NEE      | NORTHEAST                      | 
    Northern Airlines Sanya                                                          | BYC      | BEIYA                          | 
    Northafrican Air Transport                                                       | NLL      | NORTHAFRICAN AIR               | 
    North-Wright Airways                                                             | NWL      | NORTHWRIGHT                    | 
    Northern Aviation Service                                                        | CMU      | LANNA AIR                      | 
    Northern Illinois Commuter                                                       | NIC      | ILLINOIS COMMUTER              | 
    Northern Jet Management                                                          | NTX      | NORTAX                         | 
    Northern Thunderbird Air                                                         | NTA      | THUNDERBIRD                    | 
    Northern Airways                                                                 | NDA      | NORTHERN DAKOTA                | 
    Northland Aviation                                                               | KOE      | KOKEE                          | 
    Northern Air Cargo                                                               | NAC      | YUKON                          | 
    Northern Executive Aviation                                                      | NEX      | NEATAX                         | 
    Northway Aviation                                                                | NAL      | NORTHWAY                       | 
    Northwestern Air                                                                 | PLR      | POLARIS                        | 
    Northumbria Helicopters                                                          | NHL      | NORTHUMBRIA                    | 
    Northwest Territorial Airways                                                    | NWT      | TERRITORIAL                    | 
    Norwegian Air Shuttle                                                            | NAX      | NOR SHUTTLE                    | 
    Norwegian Air UK                                                                 | NRS      | REDNOSE                        | subsidiary of Norwegian Air Shuttle
    Northwinds Northern                                                              | NWN      | NORTHWINDS                     | 
    Norwegian Air Argentina                                                          | NAA      | NORUEGA                        | subsidiary of Norwegian Air Shuttle
    Norwegian Air Norway                                                             | NAN      | NORSHIP                        | subsidiary of Norwegian Air Shuttle
    Norwegian Air International                                                      | IBK      | NORTRANS                       | subsidiary of Norwegian Air Shuttle
    Norwegian Air Sweden                                                             | NSW      | NORDIC                         | subsidiary of Norwegian Air Shuttle
    Nortland Air Manitoba                                                            | NAM      | MANITOBA                       | 
    Norwegian Long Haul                                                              | NLH      | NORSTAR                        | subsidiary of Norwegian Air Shuttle
    Norwegian Aviation College                                                       | TFN      | SPIRIT                         | 
    Nouvel Air Tunisie                                                               | LBT      | NOUVELAIR                      | 
    Novair                                                                           | NVR      | NAVIGATOR                      | 
    Nova Airline                                                                     | NOV      | NOVANILE                       | 
    Northeast Aviation                                                               | NPX      | NORTHEAST EXPRESS              | 
    Nova Scotia Department of Lands and Forests                                      | PTR      | PATROL                         | 
    Novosibirsk Aviaenterprise                                                       | NBE      | NAKAIR                         | 
    Northstar Aviation                                                               | NSS      | NORTHSTAR                      | 
    Novosibirsk Aircraft Repairing Plant                                             | NSP      | NARPAIR                        | 
    Novo Air                                                                         | NVQ      | NOVO AIR                       | 
    Noy Aviation                                                                     | NOY      | NOY AVIATION                   | 
    Nurman Avia Indopura                                                             | NIN      | NURVINDO                       | 
    Nuevo Horizonte Internacional                                                    | NHR      | NUEVO HORIZONTE                | 
    NetJets Europe                                                                   | NJE      | FRACTION                       | 
    Nyasa Express                                                                    | NYS      | NYASA                          | 
    Orange Air                                                                       | ORN      | ORANGE JET                     | Allocated in 2014
    Spirit Airlines                                                                  | NKS      | SPIRIT WINGS                   | 
    Nunasi-Central Airlines                                                          | NUN      | NUNASI                         | 
    Old Dominion Freight Lines                                                       | FET      | FREIGHT LINE                   | 
    Omni Air Transport                                                               | DRL      | DRILLER                        | 
    One Airlines                                                                     | ONS      | AIR DREAMS                     | 
    OSACOM                                                                           | JPA      | J-PAT                          | United States Army
    O Air                                                                            | OCN      | O-BIRD                         | 
    Ocean Air                                                                        | BCN      | BLUE OCEAN                     | 
    Owenair                                                                          | OWE      | OWENAIR                        | 
    Ocean Wings                                                                      | TUK      | TUCKERNUCK                     | New Island Connections
    Ocean Airlines                                                                   | VCX      | OCEANCARGO                     | 
    Avianca Brazil                                                                   | ONE      | OCEANAIR                       | formerly Oceanair
    Ocean Sky                                                                        | OCS      | OCEANSKY                       | 
    Odessa Airlines                                                                  | ODS      | ODESSA AIR                     | 
    Office Federal De'Aviation Civile                                                | FOC      | FOCA                           | 
    Okada Airlines                                                                   | OKJ      | OKADA AIR                      | 
    Oklahoma DPS                                                                     | OKL      | OKLAHOMA                       | Troop O
    Okapi Airways                                                                    | OKP      | OKAPI                          | 
    Okay Airways                                                                     | OKA      | OKAYJET                        | 
    Novogorod Air Enterprise                                                         | NVG      | SADKO AVIA                     | 
    Novosibirsk Aviation Production Association                                      | NPO      | NOVSIB                         | 
    Olympic Aviation                                                                 | OLY      | OLAVIA                         | 
    SalamAir                                                                         | OMS      | MAZOON                         | Oman’s first Low Cost Carrier
    Olimex Aerotaxi                                                                  | OLX      | OLIMEX                         | 
    Olympic Air                                                                      | OAL      | OLYMPIC                        | 
    Olimp Air                                                                        | KVK      | PONTA                          | 
    Laudamotion                                                                      | LDM      | LAUDA MOTION                   | 
    Oman Air                                                                         | OMA      | OMAN AIR                       | 
    Oman Royal Flight                                                                | ORF      | OMAN                           | 
    Omni Air International                                                           | OAE      | OMNI-EXPRESS                   | 
    Omni - Aviacao e Tecnologia                                                      | OAV      | OMNI                           | 
    One Two Go Airlines                                                              | OTG      | THAI EXPRESS                   | 
    Onetime Airlines Zambia                                                          | OTM      | ZEDTIME                        | 
    Onur Air                                                                         | OHY      | ONUR AIR                       | 
    On Air                                                                           | ORL      | ON AIR                         | 
    Operadora de Transportes Aéreos                                                  | OTP      | OPERADORA AEREO                | 
    Operadora Turistica Aurora                                                       | ORR      | TURISTICA AURORA               | 
    OpenSkies                                                                        | BOS      | MISTRAL                        | 
    Ontario Ministry of Health                                                       | MED      | MEDICAL                        | 
    Omniflys                                                                         | OMF      | OMNIFLYS                       | 
    Operation Enduring Freedom                                                       | LLO      | APOLLO                         | 
    Orange Air Services                                                              | ORD      | ORANGE SERVICES                | 
    Operadora de Lineas Ejecutivas                                                   | OLE      | OPERADORA                      | 
    Operadora de Veulos Ejectutivos                                                  | OPV      | OPERADORA DE VUELOS            | 
    Orange Air Sierra Leone                                                          | ORJ      | ORANGE SIERRA                  | 
    Orel State Air Enterprise                                                        | ORM      | ORPRISE                        | 
    Orenburg Airlines                                                                | ORB      | ORENBURG                       | 
    Organizacion De Transportes Aéreos                                               | OTA      | ORGANIZACION                   | 
    Orca Air                                                                         | ORK      | ORCA TAXI                      | 
    Orange Aviation                                                                  | ORE      | ORANGE AVIATION                | 
    Organizacoes Mambra                                                              | OML      | MAMBRA                         | 
    Orbit Express Airlines                                                           | ORX      | OREX                           | 
    Orebro Aviation                                                                  | BUE      | BLUELIGHT                      | 
    Orient Air                                                                       | OVV      | ORIENTSYR                      | 
    Oriental Airlines                                                                | OAC      | ORIENTAL AIR                   | 
    Orient Airlines                                                                  | OTR      | ORIENTROC                      | 
    Orient Airways                                                                   | ORN      | ORIENT LINER                   | 
    Orion Air Charter                                                                | OED      | ORION CHARTER                  | 
    Orion-x                                                                          | OIX      | ORIONIX                        | 
    Orient Thai Airlines                                                             | OEA      | ORIENT THAI                    | 
    Origin Pacific Airways                                                           | OGN      | ORIGIN                         | 
    Orange Aircraft Leasing                                                          | RNG      | ORANGE                         | 
    Orlan-2000                                                                       | KOV      | ORLAN                          | 
    OLT Express Germany                                                              | OLT      | OLTRA                          | 
    Ostend Air College                                                               | OCO      | AIR COLLEGE                    | 
    Osh Avia                                                                         | OSH      | OSH AVIA                       | 
    Our Airline                                                                      | RON      | OUR AIRLINE                    | formerly Air Nauru
    Oriental Air Bridge                                                              | NGK      | ORIENTAL BRIDGE                | 
    Odyssey International                                                            | ODY      | ODYSSEY                        | 
    Oulun Tilauslento                                                                | FNL      | FINN FLIGHT                    | 
    Oxaero                                                                           | OXE      | OXOE                           | 
    Overland Airways                                                                 | OLA      | OVERLAND                       | 
    Orscom Tourist Installations                                                     | OAD      | ORSCOM                         | 
    Ozjet Airlines                                                                   | OZJ      | AUSJET                         | 
    Ohio State University                                                            | OSU      | SCARLET                        | 
    ONE AIR                                                                          | OAR      | BOSS AIR                       | 
    Pursuit Aviation                                                                 | HRS      | HORSEMAN                       | 2016
    Oxford Air Services                                                              | WDK      | WOODSTOCK                      | 
    Palau National Airlines                                                          | PNA      | SEBUS                          | 2014
    Panama Aircraft Rental and Sales                                                 | RSL      | PANAMA RENTAL                  | 2014
    Pete Air                                                                         | NCT      | PETE AIR                       | 2014
    Pacific Coast Jet                                                                | PXT      | PACK COAST                     | Allocated in 2014
    Out Of The Blue Air Safaris                                                      | OOT      | OOTBAS                         | 
    Pilot Flight Academy                                                             | PIP      | PILOT                          | 
    Prime Service Italia                                                             | PRT      | PRIME ITALIA                   | 2014
    Pixair Survey                                                                    | PXR      | PIXAIR                         | 
    Phoenix Helicopter Academy                                                       | BPH      | BLACK PHOENIX                  | 
    Czech Airlines                                                                   | CSA      | CSA-LINES                      | 
    PAC Air                                                                          | PCR      | PACAIR                         | Pearson Aviation Corporation
    PB Air                                                                           | PBA      | PEEBEE AIR                     | 
    PAN Air                                                                          | PNR      | SKYJET                         | 
    PDQ Air Charter                                                                  | PDQ      | DISPATCH                       | 
    Prince Aviation                                                                  | PNC      | PRINCE                         | 
    Pel-Air Aviation                                                                 | PFY      | PELFLIGHT                      | 
    PLM Dollar Group                                                                 | PDG      | OSPREY                         | 
    PMTair                                                                           | PMT      | MULTITRADE                     | Progress Multitrade
    PSA Airlines                                                                     | JIA      | BLUE STREAK                    | part of American Airlines Group
    PLUNA                                                                            | PUA      | PLUNA                          | 
    P & P Floss Pick Manufacturers                                                   | KTL      | KNOTTSBERRY                    | 
    Pace Airlines                                                                    | PCE      | PACE                           | 
    Pacific Air Boats                                                                | PAB      | AIR BOATS                      | 
    Pacific Air Charter                                                              | PRC      | PACIFIC CHARTER                | 
    Pacific Air Express                                                              | PAQ      | SOLPAC                         | Registered Solomon Islands, main base in Brisbane, Australia
    PRT Aviation                                                                     | PRP      | PRONTO                         | 
    Pacific Alaska Airlines                                                          | PAK      | PACIFIC ALASKA                 | 
    Pacific Airlines                                                                 | PIC      | PACIFIC AIRLINES               | 
    Pacific Air Transport                                                            | PXP      | PAK EXPRESS                    | 
    Primero Transportes Aereos                                                       | PMI      | AEROEPRIM                      | 
    Pacific Blue                                                                     | PBN      | BLUEBIRD                       | Controlled Dupe IATA with Virgin Australia
    Pacific Coast Airlines                                                           | PQA      | SAGE BRUSH                     | 
    Pacific Aviation                                                                 | PCV      | PACAV                          | 
    PTL Luftfahrtunternehmen                                                         | KST      | KING STAR                      | 
    European Flight Academy / Lufthansa Aviation Training                            | PTO      | ROOKIE                         | 
    Paccair                                                                          | WIS      | WISCAIR                        | 
    Pacific Coastal Airlines                                                         | PCO      | PASCO                          | 
    Pacific Jet                                                                      | PCJ      | PACIFIC JET                    | 
    Pacific Flight Services                                                          | PFA      | PACIFIC SING                   | 
    Pacific East Asia Cargo Airlines                                                 | PEC      | PAC-EAST CARGO                 | 
    Pacific Wings                                                                    | NMI      | TSUNAMI                        | 
    Pacificair Airlines                                                              | PFR      | PACIFIC WEST                   | 
    Package Express                                                                  | RCY      | RACE CITY                      | 
    Paisajes Españoles                                                               | PAE      | PAISAJES                       | 
    Pak West Airlines                                                                | PKW      | PLATINUM WEST                  | 
    Pacific Island Aviation                                                          | PSA      | PACIFIC ISLE                   | 
    Pakistan International Airlines                                                  | PIA      | PAKISTAN                       | 
    Pal Aerolíneas                                                                   | LPA      | LINEASPAL                      | 
    Palau Asia Pacific Airlines                                                      | PPC      | PALAU ASIAPAC                  | 
    Pacific Rim Airways                                                              | PAR      | PACRIM                         | 
    Pakker Avio                                                                      | PKR      | PAKKER AVIO                    | 
    Pacific International Airlines                                                   | PIN      | ROAD RUNNERS                   | 
    Pacific Pearl Airways                                                            | PPM      | PACIFIC PEARL                  | 
    Pamir Airways                                                                    | PIR      | PAMIR                          | 
    Pan American World Airways                                                       | PAA      | CLIPPER                        | 
    Palmer Aviation                                                                  | JSP      | PALMER                         | 
    Palestinian Airlines                                                             | PNW      | PALESTINIAN                    | 
    Pan Air                                                                          | PAX      | PANNEX                         | 
    Pan Malaysian Air Transport                                                      | PMA      | PAN MALAYSIA                   | 
    Pan African Air Services                                                         | PFN      | PANAFRICAN                     | 
    Pan-Air                                                                          | PNC      | PANAIRSA                       | 
    Palau Trans Pacific Airlines                                                     | PTP      | TRANS PACIFIC                  | 
    Pannon Air Service                                                               | PHU      | PANNON                         | 
    Pan Havacilik Ve Ticaret                                                         | PHT      | PANANK                         | 
    Panamedia                                                                        | PEI      | PANAMEDIA                      | 
    Panorama                                                                         | PNM      | PANORAMA                       | 
    Pantanal Linhas Aéreas                                                           | PTN      | PANTANAL                       | 
    Panh                                                                             | PNH      | KUBAN LIK                      | 
    Panorama Flight Service                                                          | AFD      | AIRFED                         | 
    Paragon Air Express                                                              | PGX      | PARAGON EXPRESS                | 
    Panorama Air Tour                                                                | PAH      | LANI                           | 
    Paradise Island Airways                                                          | PDI      | PARADISE ISLAND                | 
    Paradise Airways                                                                 | PAI      | SEA RAY                        | 
    Parcel Express                                                                   | APE      | AIR PARCEL                     | 
    Papair Terminal                                                                  | HMP      | PAPAIR TERMINAL                | 
    Panagra Airways                                                                  | PGI      | PANAGRA                        | 
    Paramount Airways                                                                | PMW      | PARAWAY                        | 
    Pascan Aviation                                                                  | PSC      | PASCAN                         | 
    Parsa                                                                            | PST      | TURISMO REGIONAL               | 
    Patria Cargas Aéreas                                                             | PTC      | PATRIA                         | 
    Patriot Aviation                                                                 | BYT      | BYTE                           | 
    Passaredo Transportes Aéreos                                                     | PTB      | PASSAREDO                      | 
    Pariz Air                                                                        | IRE      | PARIZAIR                       | 
    Payam Air                                                                        | IRP      | PAYAMAIR                       | Air Center Service
    Paramount Airlines                                                               | PRR      | PARAMOUNT                      | 
    Pars Aviation Service                                                            | PRA      | PARSAVIA                       | 
    Pearl Air                                                                        | PRL      | PEARL LINE                     | 
    Patterson Aviation                                                               | ETL      | ENTEL                          | 
    Peau Vavaʻu                                                                      | PVU      | PEAU                           | 
    Pegasus Airlines                                                                 | PGT      | SUNTURK                        | WAS 1I, H9
    Pearl Air Services                                                               | PBY      | PEARL SERVICES                 | 
    People's Aviation                                                                | PEV      | PEOPLES                        | Previously used by Pegaviation
    Pelican Air Services                                                             | PDF      | PELICAN AIRWAYS                | 
    Pelita Air Service                                                               | PAS      | PELITA                         | 
    Pelican Express                                                                  | PEX      | PELICAN EXPRESS                | 
    Peach Air                                                                        | KGC      | GOLDCREST                      | 
    Pecotox Air                                                                      | PXA      | PECOTOX                        | 
    Peninter Aérea                                                                   | PNE      | PENINTER                       | 
    Pawan Hans                                                                       | PHE      | PAWAN HANS                     | 
    Pegasus Helicopters                                                              | HAK      | HELIFALCON                     | 
    Penya De L'Aire                                                                  | PCA      | PENA DEL AIRE                  | 
    Peninsula Airways                                                                | PEN      | PENINSULA                      | 
    Pem-Air                                                                          | PEM      | PEM-AIR                        | 
    Peran                                                                            | CVT      | CVETA                          | 
    Pen-Avia                                                                         | PDY      | PENDLEY                        | 
    Personas Y Pasquetes Por Air                                                     | PPQ      | PERSONSPAQ                     | 
    Perm Airlines                                                                    | PGP      | PERM AIR                       | 
    Perimeter Aviation                                                               | PAG      | PERIMETER                      | 
    Perforadora Central                                                              | PCC      | PERFORADORA CENTRAL            | 
    Petropavlovsk-Kamchatsk Air Enterprise                                           | PTK      | PETROKAM                       | 
    Petroleum Helicopters                                                            | PHM      | PETROLEUM                      | 
    Petroleos Mexicanos                                                              | PMX      | PEMEX                          | 
    Petty Transport                                                                  | PTY      | PETTY                          | 
    Phetchabun Airline                                                               | PMY      | PHETCHABUN AIR                 | 
    Phenix Aviation                                                                  | PHV      | NEW BIRD                       | 
    Petro Air                                                                        | PEO      | PETRO AIR                      | 
    Petroleum Helicopters de Colombia                                                | PHC      | HELICOPTERS                    | 
    Philippine Airlines                                                              | PAL      | PHILIPPINE                     | 
    Philippines AirAsia                                                              | EZD      | REDHOT                         | 
    Phillips Air                                                                     | BCH      | BEACHBALL                      | 
    Phoebus Apollo Aviation                                                          | PHB      | PHOEBUS                        | 
    Phoebus Apolloa Zambia                                                           | KZM      | CARZAM                         | 
    Phoenix Air Lines                                                                | PHN      | PHOENIX BRASIL                 | 
    Phillips Michigan City Flying Service                                            | PHL      | PHILLIPS                       | 
    Phillips Alaska                                                                  | PDD      | PADA                           | 
    Phoenix Air                                                                      | PAM      | PHOENIX                        | 
    Phoenix Avia                                                                     | PHY      | PHOENIX ARMENIA                | 
    Phoenix Air Transport                                                            | PPG      | PAPAGO                         | 
    Piedmont Airlines                                                                | PDT      | PIEDMONT                       | part of American Airlines Group
    Phoenix Air Group                                                                | PHA      | GRAY BIRD                      | 
    Phoenix Airline Services                                                         | WDY      | WINDYCITY                      | 
    Phuket Air                                                                       | VAP      | PHUKET AIR                     | 
    Pilatus Flugzeugwerke                                                            | PCH      | PILATUS WINGS                  | 
    Phoenix Aviation                                                                 | PHG      | PHOENIX GROUP                  | 
    Pilatus PC-12 Center De Mexico                                                   | PLU      | PILATUS MEXICO                 | 
    Pineapple Air                                                                    | PNP      | PINEAPPLE AIR                  | 
    Pinframat                                                                        | PIM      | PINFRAMAT                      | 
    Pimichikamac Air                                                                 | MKS      | MIKISEW                        | 
    Pioneer Airlines                                                                 | PIO      | PIONEER                        | 
    Pirinair Express                                                                 | PRN      | PRINAIR EXPRESS                | 
    Planemaster Services                                                             | PMS      | PLANEMASTER                    | 
    Planar                                                                           | PLN      | PLANAR                         | 
    Planet Airways                                                                   | PLZ      | PLANET                         | 
    Players Air                                                                      | PYZ      | PLAYERS AIR                    | 
    Pinnacle Air Group                                                               | PCL      | PINNACLE GROUP                 | 
    Pinnacle Airlines                                                                | FLG      | FLAGSHIP                       | 
    Pocono Air Lines                                                                 | POC      | POCONO                         | 
    Podilia-Avia                                                                     | PDA      | PODILIA                        | 
    Point Airlines                                                                   | RMI      | POINT AIRLINE                  | 
    Point Afrique Niger                                                              | PAZ      | POINTAIR NIGER                 | 
    Pointair Burkina                                                                 | PAW      | POINTAIR BURKINA               | 
    Points of Call Airlines                                                          | PTS      | POINTSCALL                     | 
    Polar Air Cargo                                                                  | PAC      | POLAR                          | 
    Polar Airlines de Mexico                                                         | PMO      | POLAR MEXICO                   | 
    Plymouth School of Flying                                                        | PSF      | LIZARD                         | 
    Police Aux Frontières                                                            | POF      | AIRPOL                         | 
    Polet Airlines                                                                   | POT      | POLET                          | 
    PHSQ Hamburg                                                                     | LIB      | LIBELLE                        | 
    Police Aviation Services                                                         | PLC      | SPECIAL                        | 
    Polish Navy                                                                      | PNY      | POLISH NAVY                    | 
    Polestar Aviation                                                                | PSR      | POLESTAR                       | 
    Polizeifliegerstaffel Nordrhein-Westfalen                                        | NRW      | HUMMEL                         | 
    Polish Air Force                                                                 | PLF      | POLISH AIRFORCE                | 
    PHSQ Baden-Württemberg                                                           | PBW      | BUSSARD                        | 
    PHSQ Sachsen-Anhalt                                                              | PIK      | POLICE IKARUS                  | 
    PHSQ Niedersachsen                                                               | PPH      | POLICE PHOENIX                 | 
    Polizeihubschauberstaffel Rheinland-Pfalz                                        | SRP      | SPERBER                        | 
    PHSQ Bayern                                                                      | EDL      | POLICE EDELWEISS               | 
    PHSQ Thüringen                                                                   | HBT      | HABICHT                        | 
    PHSQ Brandenburg                                                                 | PBB      | ADEBAR                         | 
    PHSQ Sachsen                                                                     | PHS      | PASSAT                         | 
    Polynesian Blue                                                                  | PLB      | POLYBLUE                       | Controlled Dupe IATA, Code reserved but not in use, PBN  used.
    PHSQ Mecklenburg-Vorpommern                                                      | PMV      | POLICE MERLIN                  | 
    Polynesian Airlines                                                              | PAO      | POLYNESIAN                     | 
    Polo Aviation                                                                    | CUK      | CHUKKA                         | 
    Polynesian Air-Ways                                                              | PLA      | POLYAIR                        | 
    Pond Air Express                                                                 | PND      | POND AIR                       | 
    Pool Aviation                                                                    | PLX      | POOLEX                         | 
    Port Townsend Airways                                                            | PTQ      | TOWNSEND                       | 
    Porter Airlines                                                                  | POE      | PORTER                         | 
    PHSQ Hessen                                                                      | PHH      | IBIS                           | 
    Porteadora De Cosola                                                             | POR      | PORTEADORA                     | 
    Portuguese Air Force                                                             | AFP      | PORTUGUESE AIR FORCE           | 
    Portuguese Navy                                                                  | PON      | PORTUGUESE NAVY                | 
    Poste Air Cargo                                                                  | MSA      | AIRMERCI                       | 
    Portugalia                                                                       | PGA      | PORTUGALIA                     | 
    Potosina Del Aire                                                                | PSN      | POTOSINA                       | 
    Powell Air                                                                       | PWL      | POWELL AIR                     | 
    Prairie Flying Service                                                           | PFS      | PRAIRIE                        | 
    Pratt and Whitney Canada                                                         | PWC      | PRATT                          | 
    Potomac Air                                                                      | PDC      | DISTRICT                       | 
    Precision Airlines                                                               | PRE      | PRECISION                      | 
    Premiair                                                                         | BAT      | BALLISTIC                      | 
    Premiair Aviation Services                                                       | PGL      | PREMIERE                       | 
    Portuguese Army                                                                  | POA      | PORTUGUESE ARMY                | 
    Premiair Fliyng Club                                                             | PME      | ADUR                           | 
    Premium Aviation                                                                 | PMU      | PREMIUM                        | 
    Presidential Aviation                                                            | PRD      | PRESIDENTIAL                   | 
    Priester Aviation                                                                | PWA      | PRIESTER                       | 
    Precision Air                                                                    | PRF      | PRECISION AIR                  | 
    Premium Air Shuttle                                                              | EMI      | BLUE SHUTTLE                   | 
    Primas Courier                                                                   | PMC      | PRIMAC                         | 
    Prime Aviation                                                                   | PKZ      | PRAVI                          | 
    Primaris Airlines                                                                | WCP      | WHITECAP                       | 
    Paradigm Air Operators                                                           | PMM      | PARADIGM                       | 
    Prince Edward Air                                                                | CME      | COMET                          | 
    Primavia                                                                         | CRY      | CARRIERS                       | 
    Priority Air Transport                                                           | PAT      | PAT                            | Department of the Army
    Prime Airlines                                                                   | PRM      | PRIME AIR                      | 
    Privatair                                                                        | PTI      | PRIVATAIR                      | 
    Priority Aviation                                                                | BCK      | BANKCHECK                      | 
    Private Jet Expeditions                                                          | PJE      | PEE JAY                        | 
    Private Wings Flugcharter                                                        | PWF      | PRIVATE WINGS                  | 
    Privilege Style Líneas Aéreas                                                    | PVG      | PRIVILEGE                      | 
    Private Jet Management                                                           | PJA      | PRIVATE FLIGHT                 | 
    Priority Air Charter                                                             | PRY      | PRIORITY AIR                   | 
    Pro Air                                                                          | PRH      | PROHAWK                        | 
    Pro Air Service                                                                  | PSZ      | POP-AIR                        | 
    Probiz Guinee                                                                    | GIY      | PROBIZ                         | 
    Professional Express Courier Service                                             | PAD      | AIR PROFESSIONAL               | 
    Professione VOlare                                                               | PVL      | VOLARE                         | 
    Proflight Zambia                                                                 | PFZ      | PROFLIGHT-ZAMBIA               | 
    Promotora Industria Totolapa                                                     | PTT      | TOTOLAPA                       | 
    Propair                                                                          | PRO      | PROPAIR                        | 
    Proteus Helicopteres                                                             | PTH      | PROTEUS                        | 
    Princely Jets                                                                    | PJP      | PRINCELY JETS                  | 
    Princeton Aviation Corporation                                                   | PCN      | PRINCETON                      | 
    Provincial Airlines                                                              | SPR      | SPEEDAIR                       | 
    Propheter Aviation                                                               | PPA      | AIR PROP                       | 
    Publiservicios Aéreos                                                            | PSP      | PUBLISERVICIOS                 | 
    Provincial Express                                                               | PRV      | PROVINCIAL                     | 
    Ptarmigan Airways                                                                | PTA      | PTARMIGAN                      | 
    Publivoo                                                                         | PUV      | PUBLIVOO                       | Publicidade e Imagens Aéreas
    Puerto Vallarta Taxi Aéreo                                                       | TXV      | TAXIVALLARTA                   | 
    Puma Linhas Aéreas                                                               | PLY      | PUMA BRASIL                    | 
    Punto Fa                                                                         | MGO      | MANGO                          | 
    Pskovavia                                                                        | PSW      | PSKOVAVIA                      | 
    Pyramid Air Lines                                                                | PYR      | PYAIR                          | 
    Primera Air Nordic                                                               | PRW      | JETBIRD                        | -
    Puntavia Air Services                                                            | PTV      | PUNTAVIA                       | 
    Qanot Sharq                                                                      | QNT      | QANAT SHARQ                    | 
    Quikjet Cargo Airlines                                                           | FQA      | QUIK LIFT                      | 2014
    QantasLink                                                                       | QLK      | QLINK                          | Turbo-Props
    QantasLink                                                                       | QJE      | QJET                           | Qantaslink Jet Operations
    Primera Air Scandinavia                                                          | PRI      | PRIMERA                        | 
    Qatar Amiri Flight                                                               | QAF      | AMIRI                          | 
    Psudiklat Perhubungan Udara/PLP                                                  | UDA      | UDARA                          | 
    Providence Airline                                                               | PTL      | PLANTATION                     | 
    Quantex Environmental                                                            | QTX      | AIR QUANTEX                    | 
    Qantas                                                                           | QFA      | QANTAS                         | 
    Quebec Government Air Service                                                    | QUE      | QUEBEC                         | 
    Queen Air                                                                        | QNA      | QUEEN AIR                      | 
    Qeshm Air                                                                        | QSM      | QESHM AIR                      | 
    Qatar Airways                                                                    | QTR      | QATARI                         | 
    Quick Air Jet Charter                                                            | QAJ      | DAGOBERT                       | 
    Qatar Air Cargo                                                                  | QAC      | QATAR CARGO                    | 
    Qwest Commuter Corporation                                                       | QCC      | QWEST AIR                      | 
    Quest Diagnostics                                                                | LBQ      | LABQUEST                       | 
    Ravn Alaska                                                                      | RVF      | RAVEN FLIGHT                   | 2014
    Quick Airways Holland                                                            | QAH      | QUICK                          | 
    Qurinea Air Service                                                              | QAQ      | QURINEA AIR                    | 
    Quisqueya Airlines                                                               | QAS      | QUISQUEYA                      | 
    Qwila Air                                                                        | QWL      | Q-CHARTER                      | 
    Rectrix Aviation                                                                 | RIX      | RECTRIX                        | 
    Ruili Airlines                                                                   | RLH      | SENDI                          | 
    Rectimo Air Transports                                                           | RTO      | RACCOON                        | 
    Virgin America                                                                   | VRD      | REDWOOD                        | 
    Regent Airways                                                                   | RGE      | REGENT                         | 
    RAF Church Fenton                                                                | CFN      | CHURCH FENTON                  | Church Fenton Flying Training Unit
    Rainbow International Airlines                                                   | WES      | WEST INDIAN                    | 
    RAF Coltishall                                                                   | COH      | COLT                           | Coltishall Flying Training Unit
    RAF Coningsby                                                                    | CBY      | TYPHOON                        | Coningsby Flying Training Unit
    Reut Airways                                                                     | RUT      | YADID                          | 
    RAF Kinloss                                                                      | KIN      | KINLOSS                        | Royal Air Force 
    RAF Cranwell                                                                     | CWL      | CRANWELL                       | Royal Air Force 
    RAF Leuchars                                                                     | LCS      | LEUCHARS                       | Royal Air Force
    RAF Linton-on-Ouse                                                               | LOP      | LINTON ON OUSE                 | Royal Air Force 
    RA Jet Aeroservicios                                                             | RJT      | RA JET                         | 
    RAF Leeming                                                                      | LEE      | JAVELIN                        | Royal Air Force 
    RAF Scampton                                                                     | SMZ      | SCAMPTON                       | Royal Air Force
    RAF Lossiemouth                                                                  | LOS      | LOSSIE                         | Royal Air Force 
    RAF Marham                                                                       | MRH      | MARHAM                         | Royal Air Force 
    Royal Air Force                                                                  | RRR      | ASCOT                          | 
    RAF St Athan                                                                     | STN      | SAINT ATHAN                    | Royal Air Force
    RAF Wittering                                                                    | WIT      | STRIKER                        | Royal Air Force 
    RAF Waddington                                                                   | WAD      | VULCAN                         | Royal Air Force 
    RAF-Avia                                                                         | MTL      | MITAVIA                        | 
    RAF Topcliffe Flying Training Unit                                               | TOF      | TOPCLIFFE                      | Royal Air Force
    RAF Valley Flying Training Unit                                                  | VYT      | ANGLESEY                       | Royal Air Force
    Raji Airlines                                                                    | RAJ      | RAJI                           | 
    RWL Luftfahrtgesellschaft                                                        | RWL      | RHEINTRAINER                   | 
    RAK Airways                                                                      | RKM      | RAKAIR                         | 
    Rader Aviation                                                                   | GBR      | GREENBRIER AIR                 | 
    Raleigh Flying Service                                                           | RFA      | RALEIGH SERVICE                | 
    Ram Aircraft Corporation                                                         | RMT      | RAM FLIGHT                     | 
    Ram Air Freight                                                                  | REX      | RAM EXPRESS                    | 
    Rangemile                                                                        | RGM      | RANGEMILE                      | 
    Rabbit-Air                                                                       | RBB      | RABBIT                         | 
    Ramp 66                                                                          | PPK      | PELICAN                        | 
    Raslan Air Service                                                               | MWR      | RASLAN                         | 
    Ratkhan Air                                                                      | CSM      | LORRY                          | 
    Raven Air                                                                        | RVN      | RAVEN U-S                      | Qualiflight Training
    Rath Aviation                                                                    | RAQ      | RATH AVIATION                  | 
    Raytheon Aircraft                                                                | RTN      | RAYTHEON                       | 
    Ray Aviation                                                                     | REI      | RAY AVIATION                   | 
    Raven Air                                                                        | RVR      | RAVEN                          | 
    Raytheon Travel Air                                                              | KSS      | KANSAS                         | 
    Real Aeroclub De Ternerife                                                       | RCD      | AEROCLUB                       | 
    Real Aviation                                                                    | RLV      | REAL                           | 
    Raytheon Corporate Jets                                                          | RCJ      | NEWPIN                         | 
    Real Aero Club De Baleares                                                       | RCB      | BALEARES                       | 
    Real Aero Club de Reus-Costa Dorado                                              | CDT      | AEROREUS                       | 
    Rebus                                                                            | REB      | REBUS                          | 
    Red Aviation                                                                     | PSH      | PASSION                        | 
    Red Baron Aviation                                                               | RBN      | RED BARON                      | 
    Red Sea Aviation                                                                 | RDV      | RED AVIATION                   | 
    Reed Aviation                                                                    | RAV      | REED AVIATION                  | 
    Reef Air                                                                         | REF      | REEF AIR                       | 
    Red Sky Ventures                                                                 | RSV      | RED SKY                        | 
    Redhill Aviation                                                                 | RHC      | REDAIR                         | 
    Red Devils Parachute Display Team                                                | DEV      | RED DEVILS                     | 
    Regal Bahamas International Airways                                              | RBH      | CALYPSO                        | 
    Regent Air                                                                       | RAH      | REGENT                         | 
    Regio Air                                                                        | RAG      | GERMAN LINK                    | 
    Reem Air                                                                         | REK      | REEM AIR                       | 
    Regional 1                                                                       | TSH      | TRANSCANADA                    | 
    Regional Air Services                                                            | REG      | REGIONAL SERVICES              | 
    Regional Air Express                                                             | REW      | REGIONAL WINGS                 | 
    Region Air                                                                       | RGR      | REGIONAIR                      | 
    RegionsAir                                                                       | CEA      | CORP-X                         | formerly Corporate Airlines
    Red Star                                                                         | STR      | STARLINE                       | 
    Regency Airlines                                                                 | RGY      | REGENCY                        | 
    Reliant Airlines                                                                 | RLT      | RELIANT                        | 
    Regional Air Lines                                                               | RGL      | MAROC REGIONAL                 | 
    Reliance Aviation                                                                | REL      | RELIANCE AIR                   | 
    Renan                                                                            | RAN      | RENAN                          | 
    Regional Geodata Air                                                             | JJM      | GEODATA                        | 
    Renown Aviation                                                                  | RGS      | RENOWN                         | 
    Relief Transport Services                                                        | RTS      | RELIEF                         | 
    Republic Airlines                                                                | RPA      | BRICKYARD                      | 
    Republic Express Airlines                                                        | RPH      | PUBLIC EXPRESS                 | 
    Resort Air                                                                       | RST      | RESORT AIR                     | 
    Rhoades Aviation                                                                 | RDS      | RHOADES EXPRESS                | 
    Riau Airlines                                                                    | RIU      | RIAU AIR                       | 
    Republicair                                                                      | RBC      | REPUBLICAIR                    | 
    Rich International Airways                                                       | RIA      | RICHAIR                        | 
    Richards Aviation                                                                | RVC      | RIVER CITY                     | 
    Ridder Avia                                                                      | RID      | AKRID                          | 
    Rico Linhas Aéreas                                                               | RLE      | RICO                           | 
    Richland Aviation                                                                | RCA      | RICHLAND                       | 
    Regional Express                                                                 | RXA      | REX                            | 
    Richardson's Airway                                                              | RIC      | RICHARDSON                     | 
    Rimrock Airlines                                                                 | RIM      | RIMROCK                        | 
    Rijnmond Air Services                                                            | RAZ      | RIJNMOND                       | 
    Rio Linhas Aéreas                                                                | RIO      | RIO                            | 
    Rio Air Express                                                                  | SKA      | RIO EXPRESS                    | 
    Rio Airways                                                                      | REO      | RIO                            | 
    Rick Lucas Helicopters                                                           | HPR      | HELIPRO                        | 
    Riga Airclub                                                                     | RAK      | SPORT CLUB                     | 
    Rivne Universal Avia                                                             | UNR      | RIVNE UNIVERSAL                | 
    Vision Airlines                                                                  | RBY      | RUBY                           | Charter Airline and Las Vegas Tours
    Roadair Lines                                                                    | RDL      | ROADAIR                        | 
    Roblex Aviation                                                                  | ROX      | ROBLEX                         | 
    Robinton Aero                                                                    | RBT      | ROBIN                          | 
    Rockwell Collins Avionics                                                        | RKW      | ROCKWELL                       | 
    Rocky Mountain Airways                                                           | RMA      | ROCKY MOUNTAIN                 | 
    Rog-Air                                                                          | FAD      | AIR FRONTIER                   | 
    Rodze Air                                                                        | RDZ      | RODZE AIR                      | 
    Rolls-Royce Military Aviation                                                    | RRL      | MERLIN                         | Military Aviation
    Rolls-Royce                                                                      | BTU      | ROLLS                          | Rolls Royce Bristol Engine Division
    Rocky Mountain Holdings                                                          | LIF      | LIFECARE                       | 
    Romanian Air Force                                                               | ROF      | ROMAF                          | 
    Rollright Aviation                                                               | RRZ      | ROLLRIGHT                      | 
    Romavia                                                                          | RMV      | AEROMAVIA                      | 
    Roraima Airways                                                                  | ROR      | RORAIMA                        | 
    River Ministries Air Charter                                                     | RVM      | RIVER                          | 
    Rossair Europe                                                                   | ROS      | CATCHER                        | 
    Rosneft-Baltika                                                                  | RNB      | ROSBALT                        | 
    Rossiya                                                                          | SDM      | RUSSIA                         | Airline merged with Pulkovo Aviation Enterprise and renamed to Rossiya
    River State Government of Nigeria                                                | RGP      | GARDEN CITY                    | 
    Ronso                                                                            | RNS      | RONSO                          | 
    Ross Aviation                                                                    | NRG      | ENERGY                         | 
    Air Rarotonga                                                                    | RAR      | AIR RAROTONGA                  | 
    Rossair                                                                          | RSS      | ROSS CHARTER                   | 
    Rotterdam Jet Center                                                             | JCR      | ROTTERDAM JETCENTER            | 
    Rotormotion                                                                      | RKT      | ROCKET                         | 
    Rovos Air                                                                        | VOS      | ROVOS                          | 
    Rotatur                                                                          | RTR      | ROTATUR                        | 
    Roswell Airlines                                                                 | RAL      | ROSWELL                        | 
    RAF Air Cadet School                                                             | ACW      | AIR CADET                      | Air Cadet Schools
    Royal Air Force of Oman                                                          | MJN      | MAJAN                          | 
    RAF                                                                              | RRR      | ASCOT                          | RAF HQSTC 
    RAF Support Helicopter Force                                                     | SHF      | VORTEX                         | Support Helicopter Force
    RAF                                                                              | RRF      | KITTY                          | RAF positioning flights
    Royal Air Cargo                                                                  | RCG      | ROYAL CARGO                    | 
    Rover Airways International                                                      | ROV      | ROVERAIR                       | 
    RAF                                                                              | RFR      | RAFAIR                         | 
    Royal Aruban Airlines                                                            | RYL      | ROYAL ARUBAN                   | 
    Royal Australian Air Force                                                       | ASY      | AUSSIE                         | Used by RAAF units internationally
    Royal American Airways                                                           | RLM      | ROYAL AMERICAN                 | 
    Royal Air Freight                                                                | RAX      | AIR ROYAL                      | 
    Royal Airlines                                                                   | RPK      | ROYAL PAKISTAN                 | 
    Royal Aviation Express                                                           | RXP      | ROY EXPRESS                    | 
    Royal Daisy Airlines                                                             | KDR      | DARLINES                       | 
    Royal Brunei Airlines                                                            | RBA      | BRUNEI                         | 
    Royal Ghanaian Airlines                                                          | RGA      | ROYAL GHANA                    | 
    Royal Bahrain Airlines                                                           | RYB      | ROYAL BAHRAIN                  | 
    Royal Air Maroc                                                                  | RAM      | ROYALAIR MAROC                 | 
    Skyview Airways                                                                  | RCT      | GREENSKY                       | 2014
    Royal Jet                                                                        | ROJ      | ROYALJET                       | 
    Royal Navy                                                                       | NVY      | NAVY                           | 
    Royal Netherland Navy                                                            | NRN      | NETHERLANDS NAVY               | Koninklijke Marine
    Royal Jordanian                                                                  | RJA      | JORDANIAN                      | 
    Royal Jordanian Air Force                                                        | RJZ      | JORDAN AIR FORCE               | 
    Royal Netherlands Air Force                                                      | NAF      | NETHERLANDS AIR FORCE          | 
    Royal Phnom Penh Airways                                                         | PPW      | PHNOM-PENH AIR                 | 
    Royal Rwanda Airlines                                                            | RRA      | ROYAL RWANDA                   | 
    Royal Malaysian Air Force                                                        | RMF      | ANGKASA                        | 
    Royal New Zealand Air Force                                                      | KIW      | KIWI                           | 
    Royal Norwegian Air Force                                                        | NOW      | NORWEGIAN                      | 
    Royal Khmer Airlines                                                             | RKH      | KHMER AIR                      | 
    Royal Swazi National Airways                                                     | RSN      | SWAZI NATIONAL                 | 
    Royal West Airlines                                                              | RWE      | ROYAL WEST                     | 
    Royal Tongan Airlines                                                            | HRH      | TONGA ROYAL                    | 
    Rusair JSAC                                                                      | CGI      | CGI-RUSAIR                     | 
    Buzz                                                                             | RYS      | MAGIC SUN                      | 
    Rusline                                                                          | RLU      | RUSLINE AIR                    | 
    Royal Saudi Air Force                                                            | RSF      | ARSAF                          | 
    Rumugu Air & Space Nigeria                                                       | RMG      | RUMUGU AIR                     | 
    Rubystar                                                                         | RSB      | RUBYSTAR                       | 
    Russian Sky Airlines                                                             | ESL      | RADUGA                         | 
    Rutas Aéreas                                                                     | RUC      | RUTACA                         | 
    Rutland Aviation                                                                 | RND      | RUTLAND                        | 
    Rwandair Express                                                                 | RWD      | RWANDAIR                       | 
    Russian Aircraft Corporation-MiG                                                 | MIG      | MIG AVIA                       | 
    Ryan International Airlines                                                      | RYN      | RYAN INTERNATIONAL             | 
    Russian Federation Air Force                                                     | RFF      | RUSSIAN AIRFORCE               | 
    Ryanair                                                                          | RYR      | RYANAIR                        | 
    Rusuertol                                                                        | RUZ      | ROSTUERTOL                     | 
    Régional Compagnie Aérienne Européenne                                           | RAE      | REGIONAL EUROPE                | 
    Ryazan State Air Enterprise                                                      | RYZ      | RYAZAN AIR                     | 
    Servicios Aereos Ominia                                                          | OMN      | SERVIOMNIA                     | 2014
    Ryan Air Services                                                                | RCT      | ARCTIC TRANSPORT               | 
    Servicios de Aviacion Sierra                                                     | SEN      | SERVISIERRA                    | 2014
    Ryan Air Services                                                                | RYA      | RYAN AIR                       | 
    SGC Aviation                                                                     | SGC      | SAINT GEORGE                   | 2014
    Sixt Car Rental                                                                  | SIX      | DRIVE ORANGE                   | 2014
    Siamjet Aviation                                                                 | SCJ      | SIAMJET                        | 2014
    SR Jet                                                                           | QSR      | SPARKLE ROLL                   | 2014
    Southern Illinois University                                                     | CBN      | CARBONDALE                     | Allocated in 2014
    Corsairfly                                                                       | CRL      | CORSAIR                        | 
    Spiracha Aviation                                                                | KBN      | KABIN                          | 2014
    Springfield Air                                                                  | IBG      | ICE BRIDGE                     | Allocated 2014
    Sino Jet Management                                                              | SJM      | SINO SKY                       | 
    Seneca College                                                                   | BZQ      | STING                          | Allocated 2014
    Sparc Avia                                                                       | BVV      | SPARC                          | 
    Scoot                                                                            | TGW      | SCOOTER                        | Former IATA: TZ Former ICAO: SCO; Adopted Tigerair codes after their merger 
    Servicios de Taxi Aereos                                                         | SXT      | SERTAXI                        | 
    Rynes Aviation                                                                   | RAA      | RYNES AVIATION                 | 
    RVL Group                                                                        | REV      | ENDURANCE                      | 
    SIBIA Air                                                                        | SBD      | SIBIA                          | 
    Smartlynx Airlines Estonia                                                       | MYX      | TALLINN CAT                    | 
    Spring Airlines Japan                                                            | SJO      | JEY SPRING                     | 
    Smartwings                                                                       | TVS      | SKYTRAVEL                      | 
    Smartlynx Airlines                                                               | ART      | SMART LYNX                     | 
    San Carlos Flight Center                                                         | BYF      | BAY FLIGHT                     | 
    Seychelles Airlines                                                              | SCH      | OCEAN BIRD                     | 
    Sabaidee Airways                                                                 | VGO      | VIRGO                          | 
    Servicios Aereos Fun Fly                                                         | FUF      | SERVIFUN                       | 
    Servicios Aereos Especializados Destina                                          | DES      | DESTINA                        | 
    Skargardshavets Helikoptertjanst                                                 | MHQ      | HELICARE                       | 
    Siam Airnet                                                                      | RBR      | SIAM AIRNET                    | 
    Sky Lease Cargo                                                                  | KYE      | SKY CUBE                       | https://en.wikipedia.org/wiki/Sky_Lease_Cargo
    Skybus Jet                                                                       | BSJ      | SKYBUS JET                     | 
    Sky Prim Air                                                                     | KPM      | SKY PRIMAIR                    | 
    Sharp Airlines                                                                   | SHA      | SHARP                          | Uses unregistered ICAO & IATA.
    Sanborn Map                                                                      | SMU      | SPRINGER                       | 
    Special Aviation Works                                                           | USW      | AKSAR                          | 
    Siavia                                                                           | SVB      | SIAVIA                         | 
    Shree Airlines                                                                   | SHA      | SHREEAIR                       | 
    Sylt Air GmbH                                                                    | AWU      | SYLT-AIR                       | 
    Samoa Air                                                                        | SZB      | SAMOA                          | 
    Sky Messaging                                                                    | KYD      | SKYAD                          | 
    SATA International                                                               | RZO      | AIR AZORES                     | 
    Sky Way Air                                                                      | SAB      | SKY WORKER                     | 
    South African Airways                                                            | SAA      | SPRINGBOK                      | 
    South Asian Airlines                                                             | BDS      | SOUTH ASIAN                    | 
    Sayakhat Airlines                                                                | SAH      | SAYAKHAT                       | 
    SAM Colombia                                                                     | SAM      | SAM                            | Sociedad Aeronáutica De Medellín
    Shaheen Air                                                                      | SAI      | SHAHEEN AIR                    | 
    Sahel Aviation Service                                                           | SAO      | SAVSER                         | 
    Secretaria de Marina                                                             | ANX      | SECRETARIA DEMARINA            | 
    SASCO Airlines                                                                   | SAC      | SASCO                          | 
    Springbank Aviation                                                              | SAQ      | SPRINGBANK                     | 
    Sham Wing Airlines                                                               | SAW      | SHAMWING                       | 
    Scandinavian Airlines                                                            | SAS      | SCANDINAVIAN                   | 
    Sky Regional Airlines                                                            | SKV      | MAPLE                          | 
    SOS Flygambulans                                                                 | SAG      | MEDICAL AIR                    | 
    SOL Linhas Aéreas                                                                | SBA      | SOL                            | 
    ScotAirways                                                                      | SAY      | SUCKLING                       | 
    Sky Bishek                                                                       | BIS      | JUMA AIR                       | 
    Sol del Paraguay                                                                 | SGU      | SOLPARAGUAYO                   | 
    Sabah Air                                                                        | SAX      | SABAH AIR                      | 
    Seven Bar Flying Service                                                         | SBF      | SEVENAIR                       | 
    SevenAir                                                                         | SEN      | S-BAR                          | 
    Sobel Airlines of Ghana                                                          | SBL      | SOBGHANA                       | 
    Swiss Air-Ambulance                                                              | SAZ      | SWISS AMBULANCE                | 
    SmithKline Beecham Clinical Labs                                                 | SBQ      | SKIBBLE                        | 
    Steinman Aviation                                                                | SBB      | SABER EXPRESS                  | 
    Saber Aviation                                                                   | SBR      | FREIGHTER                      | 
    Seaborne Airlines                                                                | SBS      | SEABORNE                       | 
    Star Air                                                                         | URJ      | STARAV                         | 
    Stabo Air                                                                        | SBO      | STABAIR                        | 
    St Barth Commuter                                                                | SBU      | BLACK FIN                      | 
    Spanish Air Force                                                                | AME      | AIRMIL                         | 
    Starlux Airlines                                                                 | SJX      | STARWALKER                     | 
    South Central Air                                                                | SCA      | SOUTH CENTRAL                  | 
    SeaPort Airlines                                                                 | SQH      | SASQUATCH                      | Former airline: Wings of Alaska now part of SeaPort Airlines. Alternative callsign: WINGS . Former ICAO code: WAK.
    S7 Airlines                                                                      | SBI      | SIBERIAN AIRLINES              | 
    Scenic Airlines                                                                  | SCE      | SCENIC                         | 
    Servicios Aéreos San Cristóbal                                                   | SCI      | SAN CRISTOBAL                  | 
    SkyBahamas                                                                       | SBM      | SKY BAHAMAS                    | 
    Scibe Airlift                                                                    | SBZ      | SCIBE AIRLIFT                  | 
    Socofer                                                                          | SCF      | SOCOFER                        | 
    Switfair Cargo                                                                   | SCL      | SWIFTAIR                       | 
    Sky Cam                                                                          | SCK      | SKYCAM                         | 
    Servicios Aéreos de Chihuahua Aerochisa                                          | AHI      | AEROCHISA                      | 
    SriLankan Airlines                                                               | ALK      | SRILANKAN                      | 
    Servicios Aéreos de los Andes                                                    | AND      | SERVI ANDES                    | 2014
    Scorpio Aviation                                                                 | SCP      | SCORPIO                        | 
    South American Airlines                                                          | SCN      | SOUTH AMERICAN                 | 
    SFS Aviation                                                                     | SIC      | SICHART                        | 
    Silver Cloud Air                                                                 | SCR      | SILVER CLOUD                   | 
    South African Non Scheduled Airways                                              | SCS      | SOUTHERN CHARTERS              | 
    Sunbird Airlines                                                                 | CDL      | CAROLINA                       | 
    Servicios Aéreos Del Centro                                                      | SCV      | SACSA                          | 
    SAAB-Aircraft                                                                    | SCT      | SAAB-CRAFT                     | 
    Saigon Capital Aircraft Management                                               | SCB      | SAIGON                         | 
    OSM Aviation Academy                                                             | SCQ      | SCAVAC                         | 
    Sunrise Airlines                                                                 | SDC      | SUNDANCE                       | 
    Sun Country Airlines                                                             | SCX      | SUN COUNTRY                    | 
    Skymaster Air Taxi                                                               | SDD      | SKY DANCE                      | 
    St. Andrews Airways                                                              | SDA      | SAINT ANDREWS                  | 
    Air Partners Corp.                                                               | SDE      | STAMPEDE                       | 
    SADELCA - Sociedad Aérea Del Caquetá                                             | SDK      | SADELCA                        | 
    Skydrift                                                                         | SDL      | SKYDRIFT                       | 
    Spirit of Africa Airlines                                                        | SDN      | BLUE NILE                      | 
    Servicio De Helicopteros                                                         | SDH      | ARCOS                          | 
    Servicios Aéreos Del Vaupes                                                      | SDV      | SELVA                          | 
    Sud Airlines                                                                     | SDU      | SUD LINES                      | 
    Sundorph Aeronautical Corporation                                                | SDF      | SUNDORPH                       | 
    Sukhoi Design Bureau                                                             | SDB      | SU-CRAFT                       | 
    Servicios Aéreos Luce                                                            | SEB      | SERVILUCE                      | 
    Seacoast Airlines                                                                | SCC      | SEA-COASTER                    | 
    Sudan Pezetel for Aviation                                                       | SDZ      | SUDANA                         | 
    Southeast Air                                                                    | SEA      | SOUTHEAST AIR                  | 
    Sky Express                                                                      | SEH      | AIR CRETE                      | 
    Skyjet                                                                           | SEK      | SKALA                          | 
    Servicio Tecnico Aero De Mexico                                                  | SDX      | SERVICIO TECNICO               | 
    Sedona Air Center                                                                | SED      | SEDONA AIR                     | 
    Sentel Corporation                                                               | SEL      | SENTEL                         | 
    Shaheen Air Cargo                                                                | SEE      | SHAHEEN CARGO                  | 
    Servicio Aéreo Saltillo                                                          | SES      | SERVISAL                       | 
    Serair Transworld Press                                                          | SEV      | CARGOPRESS                     | 
    Shuswap Flight Centre                                                            | SFC      | SHUSWAP                        | 
    Wilderness Air                                                                   | SFE      | SEFOFANE                       | Rebranded "Wilderness Air"
    Safewings Aviation                                                               | SFF      | SWIFTWING                      | 
    SAETA                                                                            | SET      | SAETA                          | 
    Spicejet                                                                         | SEJ      | SPICEJET                       | 
    Sun Freight Logistics                                                            | SFG      | AERO GULF                      | 
    Selcon Airlines                                                                  | SEO      | SELCON AIR                     | 
    Southflight Aviation                                                             | SFL      | SOUTHFLIGHT                    | 
    Safe Air                                                                         | SFP      | SAFE AIR                       | 
    Sky Eyes                                                                         | SEQ      | SKY EYES                       | 
    Southern Frontier Air Transport                                                  | SFS      | SOUTHERN FRONTIER              | 
    Safair                                                                           | SFR      | CARGO                          | 
    Skyfreight                                                                       | SFT      | SKYFREIGHT                     | 
    Star Flyer                                                                       | SFJ      | STARFLYER                      | 
    Sky King                                                                         | SGB      | SONGBIRD                       | 
    Solent Flight                                                                    | SFU      | SAINTS                         | 
    S.K. Logistics                                                                   | SFX      | SWAMP FOX                      | 
    Southern Right Air Charter                                                       | SGC      | SOUTHERNRIGHT                  | 
    Servicios Aéreos Agrícolas                                                       | SGI      | SERAGRI                        | 
    STAC Swiss Government Flights                                                    | SGF      | STAC                           | 
    Sky Aircraft Service                                                             | SGM      | SIGMA                          | 
    Servisair                                                                        | SGH      | SERVISAIR                      | 
    Safiran Airlines                                                                 | SFN      | SAFIRAN                        | 
    Siam GA                                                                          | SGN      | SIAM                           | 
    Sagolair Transportes Ejecutivos                                                  | SGP      | SAGOLAIR                       | 
    Skygate                                                                          | SGT      | SKYGATE                        | 
    Skyward Aviation                                                                 | SGK      | SKYWARD                        | 
    Samgau                                                                           | SGU      | RAUSHAN                        | 
    Skagway Air Service                                                              | SGY      | SKAGWAY AIR                    | 
    Sky Harbor Air Service                                                           | SHC      | SKY HARBOR CHEYENNE            | 
    Shabair                                                                          | SHB      | SHABAIR                        | 
    Sharjah Ruler's Flight                                                           | SHJ      | SHARJAH                        | 
    Shell Aircraft                                                                   | SHE      | SHELL                          | 
    Shoprite Group                                                                   | SHG      | SHOP AIR                       | 
    Samson Aviation                                                                  | SHL      | SAMSON                         | 
    Service Aerien Francais                                                          | SHP      | SAF                            | 
    Shanghai Airlines Cargo                                                          | SHQ      | SHANGHAI CARGO                 | 
    Saskatchewan Government Executive Air Service                                    | SGS      | SASKATCHEWAN                   | 
    Shura Air Transport Services                                                     | SHS      | SHURA AIR                      | 
    Sakhalinskie Aviatrassy                                                          | SHU      | SATAIR                         | 
    SATA Air Acores                                                                  | SAT      | SATA                           | 
    Shawnee Airline                                                                  | SHW      | SHAWNEE                        | Air South
    Shaheen Airport Services                                                         | SHN      | SUGAR ALFA                     | 
    Slim Aviation Services                                                           | SHX      | SLIM AIR                       | 
    Sky Airlines                                                                     | SHY      | ANTALYA BIRD                   | 
    Sheltam Aviation                                                                 | SHM      | SHELTAM                        | 
    Sky Gate International Aviation                                                  | SGD      | AIR BISHKEK                    | 
    Shavano Air                                                                      | SHV      | SHAVANO                        | 
    Singapore Airlines                                                               | SIA      | SINGAPORE                      | 
    Shooter Air Courier                                                              | SHR      | SHOOTER                        | 
    Servicios Aeronáuticos Integrales                                                | SIL      | SERVICIOS INTEGRALES           | 
    Salair                                                                           | SIR      | SALAIR                         | 
    Skynet Airlines                                                                  | SIH      | BLUEJET                        | 
    Sierra Express                                                                   | SIE      | SEREX                          | 
    Servicios Aéreos Especiales De Jalisco                                           | SJA      | SERVICIOJAL                    | 
    Servicios Ejecutivos Continental                                                 | SJC      | SERVIEJECUTIVO                 | 
    Slovenian Armed Forces                                                           | SIV      | SLOVENIAN                      | 
    Sirio Executive                                                                  | SIW      | SIRIO EXECUTIVE                | 
    Sunair                                                                           | SJE      | SUNBIZ                         | 
    Servicios Especiales Del Pacifico Jalisco                                        | SJL      | SERVICIOS JALISCO              | 
    Spirit Aviation                                                                  | SJJ      | SPIRIT JET                     | 
    Swiss Jet                                                                        | SJT      | SWISS JET                      | 
    Sirio                                                                            | SIO      | SIRIO                          | 
    Sibaviatrans                                                                     | SIB      | SIBAVIA                        | 
    Southern Jersey Airways                                                          | ALC      | ACOM                           | 
    Sama Airlines                                                                    | SMY      | NAJIM                          | 
    Servicios Privados De Aviación                                                   | SPV      | SERVICIOS PRIVADOS             | 
    Sriwijaya Air                                                                    | SJY      | SRIWIJAYA                      | 
    SPASA                                                                            | SPS      | SALDUERO                       | 
    Southeast Airmotive                                                              | SPU      | SPUTTER                        | 
    Speedwings                                                                       | SPW      | SPEEDWING                      | 
    Singapore Airlines Cargo                                                         | SQC      | SINGCARGO                      | 
    Slovak Air Force                                                                 | SQF      | SLOVAK AIRFORCE                | 
    Servicos De Alquiler                                                             | SQL      | ALQUILER                       | 
    Speed Aviation                                                                   | SPT      | SPEED AVIATION                 | 
    Slovak National Aeroclub                                                         | SQA      | SLOVAK AEROCLUB                | 
    Sair Aviation                                                                    | SRA      | SAIR                           | 
    Servicios Aeronáuticos Aero Personal                                             | SRL      | SERVICIOS PERSONAL             | 
    Searca                                                                           | SRC      | SEARCA                         | 
    Servicios Aéreos Ejecutivos Saereo                                               | SRO      | SAEREO                         | 
    Iiger Airways                                                                    | SRQ      | SEAIR                          | Rebranded to Tiger Airways Philippines
    Sirair                                                                           | SRN      | SIRAIR                         | 
    Sky Work Airlines                                                                | SRK      | SKYFOX                         | 
    Selkirk Remote Sensing                                                           | SRS      | PHOTO CHARLIE                  | 
    Siem Reap Airways                                                                | SRH      | SIEMREAP AIR                   | 
    Star Air                                                                         | SRR      | WHITESTAR                      | 
    Sasair                                                                           | SSB      | SASIR                          | 
    Sarit Airlines                                                                   | SRW      | SARIA                          | 
    Sierra Expressway Airlines                                                       | SRX      | SIERRA EX                      | 
    Servicios Aéreos Sunset                                                          | SSE      | SUNSET                         | 
    Star Up                                                                          | SRU      | STAR-UP                        | 
    Strato Air Services                                                              | SRZ      | STRATO                         | 
    Severstal Air                                                                    | SSF      | SEVERSTAL                      | 
    Skystar International                                                            | SSK      | SKYSTAR                        | 
    SwedJet Airways                                                                  | BBB      | BLACKBIRD                      | 
    Special Scope                                                                    | SSO      | DOPE                           | 
    Slovak Government Flying Service                                                 | SSG      | SLOVAK GOVERNMENT              | 
    Sunstate Airlines                                                                | SSQ      | SUNSTATE                       | Uses IATA of parent QANTAS.
    Starspeed                                                                        | SSP      | STARSPEED                      | 
    Southern Seaplane                                                                | SSC      | SOUTHERN SKIES                 | 
    SASCA                                                                            | SSU      | SASCA                          | 
    Sunwest Airlines                                                                 | SST      | SUNFLIGHT                      | 
    Star Service International                                                       | SSD      | STAR SERVICE                   | 
    Sky Aviation                                                                     | SSY      | SIERRA SKY                     | 
    Streamline Aviation                                                              | SSW      | STREAMLINE                     | 
    SAESA                                                                            | SSS      | SAESA                          | 
    Specsavers Aviation                                                              | SSZ      | SPECSAVERS                     | 
    Status-Alpha Airline                                                             | STB      | STATUS-ALPHA                   | 
    Servicios De Aerotransportacion De Aguascalientes                                | STD      | AERO AGUASCALINETES            | 
    Semitool Europe                                                                  | STE      | SEMITRANS                      | 
    Sedalia, Marshall, Boonville Stage Line                                          | STG      | STAGE                          | 
    Sontair                                                                          | STI      | SONTAIR                        | 
    Sella Aviation                                                                   | STJ      | STELLAVIA                      | 
    Streamline Ops                                                                   | STO      | SLOPS                          | 
    Stobart Air                                                                      | STK      | STOBART                        | 
    Star Aviation                                                                    | STA      | STAR                           | 
    Stadium City                                                                     | STC      | STADIUM                        | 
    Stapleford Flight Centre                                                         | STL      | STAPLEFORD                     | 
    Star African Air                                                                 | STU      | STARSOM                        | 
    Stars Away Aviation                                                              | STX      | STARSAWAY                      | 
    Saturn Aviation                                                                  | STV      | SATURN                         | 
    Star West Aviation                                                               | SUU      | SUNSTAR                        | 
    Silesia Air                                                                      | SUA      | AIR SILESIA                    | 
    Suburban Air Freight                                                             | SUB      | SUB AIR                        | 
    Styrian Airways                                                                  | STY      | STYRIAN                        | 
    South West Air Corporation                                                       | STW      | SIERRA WHISKEY                 | 
    Sudan Airways                                                                    | SUD      | SUDANAIR                       | 
    Sunu Air                                                                         | SUG      | SUNU AIR                       | 
    Swiss Air Force                                                                  | SUI      | SWISS AIR FORCE                | 
    Sun Air International                                                            | FDY      | FRIENDLY                       | 
    Star Air                                                                         | STQ      | STERA                          | 
    Superior Aviation Services                                                       | SUK      | SKYCARGO                       | 
    State Unitary Air Enterprise                                                     | SUM      | SUMES                          | 
    Surf Air                                                                         | URF      | SURF AIR                       | 
    Sun Air                                                                          | SUF      | SUNFLOWER                      | 
    Sun Air of Scandinavia                                                           | SUS      | SUNSCAN                        | 
    St. Vincent Grenadines Air                                                       | SVD      | GRENADINES                     | 
    Sun Light                                                                        | SUH      | LIGHT AIR                      | 
    Sistemas Aeronauuticos                                                           | SUT      | SISTEMAS AERONAUTICOS          | 
    Saudia                                                                           | SVA      | SAUDIA                         | 
    Servicios De Transporte Aéreo                                                    | SVI      | SETRA                          | 
    Sahel Airlines                                                                   | AWJ      | SAHEL AIRLINES                 | 
    Savanair                                                                         | SVN      | SAVANAIR                       | 
    Servicios Aeronáuticos De Oriente                                                | SVO      | SERVIORIENTE                   | 
    Sterling Helicopters                                                             | SVH      | SILVER                         | 
    Servicios Aéreos Saar                                                            | SVS      | AEREOS SAAR                    | 
    Swedish Armed Forces                                                             | SVF      | SWEDEFORCE                     | 
    Seven Four Eight Air Services                                                    | SVT      | SIERRA SERVICES                | 
    Southwest Airlines                                                               | SWA      | SOUTHWEST                      | 
    Swissboogie Parapro                                                              | SWB      | SWISSBOOGIE                    | 
    South West Air                                                                   | SWC      | SAINT CLAIR                    | 
    Sundance Air                                                                     | SUV      | DANCEAIR                       | 
    Sevastopol-Avia                                                                  | SVL      | SEVAVIA                        | 
    Security Aviation                                                                | SVX      | SECURITY AIR                   | 
    Sunwing Airlines                                                                 | SWG      | SUNWING                        | 
    Swedeways                                                                        | SWE      | SWEDELINE                      | 
    Southern Winds Airlines                                                          | SWD      | SOUTHERN WINDS                 | 
    StatesWest Airlines                                                              | SWJ      | STATES                         | 
    Star Work Sky                                                                    | SWP      | STAR WORK                      | 
    Sundair                                                                          | SDR      | SUNDAIR                        | 
    Sunwest Aviation                                                                 | SWS      | SUNNY WEST                     | 
    Swiss International Air Lines                                                    | SWR      | SWISS                          | 
    Swiss Global Air Lines                                                           | SWU      | EUROSWISS                      | 
    Swe Fly                                                                          | SWV      | FLYING SWEDE                   | 
    Sunworld Airlines                                                                | SWI      | SUNWORLD                       | 
    Swazi Express Airways                                                            | SWX      | SWAZI EXPRESS                  | 
    Shovkoviy Shlyah                                                                 | SWW      | WAY AERO                       | 
    Swift Air                                                                        | SWQ      | SWIFTFLIGHT                    | 
    Sky Jet                                                                          | SWY      | SWISSLINK                      | 
    Southeast Express Airlines                                                       | SXE      | DOGWOOD EXPRESS                | 
    Skywise Airline                                                                  | SWZ      | SKYWISE                        | 
    Servicios Aéreos Especializados Mexicanos                                        | SXM      | SERVIMEX                       | 
    Southern Cross Aviation                                                          | SXA      | FERRY                          | 
    Servicios De Taxi Aéreo                                                          | SXT      | SERTA                          | 
    Sky Exec Aviation Services                                                       | SXC      | SKY EXEC                       | 
    Satellite Aero                                                                   | SXX      | SATELLITE EXPRESS              | 
    Skyways                                                                          | SYA      | LINEAS CARDINAL                | 
    Sky One Express Airlines                                                         | SYF      | SKY FIRST                      | 
    SunExpress                                                                       | SXS      | SUNEXPRESS                     | 
    Safari Express Cargo                                                             | SXY      | SAFARI EXPRESS                 | 
    Systec 2000                                                                      | SYC      | SYSTEC                         | 
    Synergy Aviation                                                                 | SYG      | SYNERGY                        | 
    Swoop                                                                            | WSW      | SWOOP                          | 
    Swiftair                                                                         | SWT      | SWIFT                          | 
    Syrian Arab Airlines                                                             | SYR      | SYRIANAIR                      | 
    Satsair                                                                          | SYK      | AEROCAB                        | 
    Syncrude Canada                                                                  | SYN      | SYNCRUDE                       | 
    Shawbury Flying Training Unit                                                    | SYS      | SHAWBURY                       | 
    Silk Way Airlines                                                                | AZQ      | SILK LINE                      | 
    Servicios Aeronáuticos Z                                                         | SZT      | AERO ZEE                       | 
    Special Aviation Systems                                                         | SYV      | SPECIAL SYSTEM                 | 
    Specavia Air                                                                     | BHV      | AVIASPEC                       | 
    Sundance Air                                                                     | BNC      | BARNACLE AIR                   | 
    Skywalk Airlines                                                                 | SYX      | SKYWAY-EX                      | 
    Starair                                                                          | BLY      | BLARNEY                        | 
    Spectrem Air                                                                     | CDS      | SPECDAS                        | 
    Swedish Civil Aviation Administration                                            | CBN      | CALIBRATION                    | 
    Servicios Aéreos Centrales                                                       | CEE      | CENTRA AEREOS                  | 
    Swedish Airlines                                                                 | CFL      | SWEDISH                        | 
    Air Arabia Egypt                                                                 | RBG      | ARABIA EGYPT                   | 
    Shandong Airlines                                                                | CDG      | SHANDONG                       | 
    South African Historic Flight                                                    | SYY      | SKY COACH                      | 
    Sirius-Aero                                                                      | CIG      | SIRIUS AERO                    | 
    Seagle Air                                                                       | CGL      | SEAGLE                         | 
    SAS Braathens                                                                    | CNO      | SCANOR                         | 
    Shanghai Airlines                                                                | CSH      | SHANGHAI AIR                   | Part of China Eastern Airlines
    Sichuan Airlines                                                                 | CSC      | SI CHUAN                       | 
    Sunwest Home Aviation                                                            | CNK      | CHINOOK                        | 
    Shuangyang General Aviation                                                      | CSY      | SHUANGYANG                     | 
    Silk Way West Airlines                                                           | AZG      | SILK WEST                      | 
    Shenzhen Airlines                                                                | CSZ      | SHENZHEN AIR                   | 
    Servicios Aéreos Elite                                                           | DKY      | DAKOY                          | 
    Spring Airlines                                                                  | CQH      | AIR SPRING                     | 
    Servicios Aéreos Denim                                                           | DNI      | AERO DENIM                     | 
    Skypower Express Airways                                                         | EAN      | NIGERIA EXPRESS                | Express Airways Nigeria
    Swiss Eagle                                                                      | EAB      | SWISS EAGLE                    | 
    Sun D'Or                                                                         | ERO      | ECHO ROMEO                     | 
    Sioux Falls Aviation                                                             | DKT      | DAKOTA                         | 
    Stuttgarter Flugdienst                                                           | FFD      | FIRST FLIGHT                   | 
    South African Express                                                            | EXY      | EXPRESSWAYS                    | 
    Shanxi Airlines                                                                  | CXI      | SHANXI                         | 
    Servicios Aéreos Gadel                                                           | GDE      | GADEL                          | 
    Sky Bus                                                                          | FLH      | MILE HIGH                      | 
    Silverjet                                                                        | FJE      | ENVOY                          | 
    Servicios Aéreos Gana                                                            | GNA      | SERVIGANA                      | 
    S.P. Aviation                                                                    | GDG      | GOLDEN GATE                    | 
    South Coast Aviation                                                             | GAD      | SOUTHCOAST                     | 
    Seba Airlines                                                                    | GIK      | SEBA                           | 
    Star XL German Airlines                                                          | GXL      | STARDUST                       | 
    Shalom Air Services                                                              | FFH      | PEACE AIR                      | 
    Skyhaul                                                                          | HAU      | SKYHAUL                        | 
    Servicios Ejecutivos Gosa                                                        | HJE      | GOSA                           | 
    Starship                                                                         | HIP      | STARSA                         | 
    Skyraidybos Mokymo Centras                                                       | HRI      | HELIRIM                        | 
    Sky Europe Airlines                                                              | HSK      | MATRA                          | 
    Superior Aviation                                                                | HKA      | SPEND AIR                      | 
    Samaritan Air Service                                                            | HLO      | HALO                           | 
    Servicios Aéreos Ilsa                                                            | ILS      | SERVICIOS ILSA                 | 
    Safat Airlines                                                                   | IRV      | SAFAT AIR                      | 
    Saha Airlines Services                                                           | IRZ      | SAHA                           | 
    Skytaxi                                                                          | IGA      | IGUANA                         | 
    Sincom-Avia                                                                      | INK      | SINCOM AVIA                    | 
    Sky Helicopteros                                                                 | HSY      | HELISKY                        | 
    Svenska Direktflyg                                                               | HSV      | HIGHSWEDE                      | 
    Servicios Aéreos Copters                                                         | KOP      | COPTERS                        | 
    Secure Air Charter                                                               | JCM      | SECUREAIR                      | 
    Sunline Express                                                                  | JAM      | SUNTRACK                       | 
    Servicios Aéreos Expecializados En Transportes Petroleros                        | KSP      | SAEP                           | 
    Salem                                                                            | KKS      | KOKSHE                         | 
    Servicios Aéreos Ejecutivos De La Laguna                                         | LGU      | LAGUNA                         | 
    Servico Leo Lopex                                                                | LLA      | LEO LOPOZ                      | 
    Servicios Aéreos Estrella                                                        | LLS      | SERVIESTRELLA                  | 
    Privaira                                                                         | LMO      | SKY HOLDINGS                   | Callsign and company name changed from Sky Limo Corporation "SKY LIMO" in 2015.
    Sark International Airways                                                       | JIM      | SARK                           | 
    SOS Helikoptern Gotland                                                          | MCG      | MEDICOPTER                     | 
    Servicios Aéreos Milenio                                                         | MLO      | MILENIO                        | 
    Spectrum Aviation                                                                | LSP      | AIR TONY                       | 
    Servicios Aéreos Moritani                                                        | MRI      | MORITANI                       | 
    South African Air Force                                                          | LMG      | SOUTH AFRICAN                  | 
    Servico Aéreo Regional                                                           | MSG      | SAR-REGIONAL                   | 
    Sundt Air                                                                        | MDT      | MIDNIGHT                       | 
    Sky Aeronautical Services                                                        | KYR      | SKY AERONAUTICAL               | 
    Servicios Aéreos del Nazas                                                       | NAZ      | NAZAS                          | 
    Servicio De Vigilancia Aérea Del Ministerio De Seguridad Pública                 | MSP      | SEGURIDAD                      | 
    SAAD                                                                             | MMS      | MUSAAD AIR                     | 
    Snowbird Airlines                                                                | SBW      | SNOWMAN                        | 
    Servicios Aéreos Latinoamericanos                                                | NON      | SERVICIOS LATINO               | 
    Seulawah Nad Air                                                                 | NAD      | SEULAWAH                       | 
    Servicios Aéreos Monarrez                                                        | NRZ      | MONARREZ                       | 
    Spirit Airlines                                                                  | NKS      | SPIRIT WINGS                   | 
    Servicios Aéreos Del Norte                                                       | NTB      | SERVINORTE                     | 
    Servicios Integrales De Aviación                                                 | NTG      | INTEGRALES                     | 
    SATENA                                                                           | NSE      | SATENA                         | 
    San Juan Airlines                                                                | MRR      | MARINER                        | 
    Slok Air Gambia                                                                  | OKS      | SLOK GAMBIA                    | 
    Societe De Transport Aerien De Mauritanie                                        | NSC      | TRANS-SOCIETE                  | 
    Soko Aviation                                                                    | OKT      | SOKO AIR                       | 
    Sonnig SA                                                                        | ONG      | SONNIG                         | 
    Servicios Aéreos Noticiosos                                                      | OSS      | NOTICIOSOS                     | 
    Soloflight                                                                       | OLO      | SOLO                           | 
    South Airlines                                                                   | OTL      | SOUTHLINE                      | 
    Sokol                                                                            | PIV      | AEROSOKOL                      | 
    Servicios Aéreos Premier                                                         | PMR      | SERVICIOS PREMIER              | 
    Simpson Air                                                                      | NCS      | COMMUTER-CANADA                | 
    Virgin Australia Regional Airlines                                               | OZW      | VELOCITY                       | 
    Servicios Aéreos Poblanos                                                        | POB      | POBLANOS                       | 
    Sosoliso Airlines                                                                | OSL      | SOSOLISO                       | 
    Servicios Aéreos Profesionales                                                   | PSV      | PROSERVICIOS                   | 
    Solar Cargo                                                                      | OLC      | SOLARCARGO                     | 
    Sky Trek International Airlines                                                  | PZR      | PHAZER                         | 
    Spurwing Airlines                                                                | PUR      | SPURWING                       | 
    South Carolina Aeronautics Commission                                            | PLT      | PALMETTO                       | 
    Southeastern Airways                                                             | PTM      | POSTMAN                        | 
    Shandong Airlines Rainbow Jet                                                    | RBW      | CAI HONG                       | 
    Servicio Aéreo Regional Regair                                                   | RER      | REGAIR                         | 
    Survey Udara                                                                     | PNS      | PENAS                          | 
    Servicios Aéreos Regiomontanos                                                   | RGC      | REGIOMONTANO                   | 
    Scoala Superioara De Aviatie Civila                                              | RFT      | ROMANIAN ACADEMY               | 
    Servicios De Rampa Y Mostrador                                                   | RMP      | SERAMSA                        | 
    S-Air                                                                            | RLS      | S-AIRLINES                     | 
    SNAS Aviation                                                                    | RSE      | RED SEA                        | 
    SA Airlink Regional                                                              | REJ      | REGIONAL LINK                  | 
    Sky Tours                                                                        | SKE      | SKYISLE                        | 
    SkyKing Turks and Caicos Airways                                                 | SKI      | SKYKING                        | IATA was QW
    Skycraft                                                                         | SKF      | SKYCRAFT                       | 
    Skymaster Airlines                                                               | SKC      | SKYMASTER AIR                  | 
    Skycharter                                                                       | SKL      | SKYCHARTER                     | 
    Skylink Aviation                                                                 | SKK      | SKYLINK                        | 
    Skyline Aviation Services                                                        | SKN      | SKYLINER                       | 
    Sky Service                                                                      | SKS      | SKY SERVICE                    | Callsign re-allocated
    Sky Harbor Air Service                                                           | SKD      | SKY DAWG                       | 
    Santa Barbara Airlines                                                           | BBR      | SANTA BARBARA                  | 
    Skycraft Air Transport                                                           | SKG      | SKYCRAFT-CANADA                | 
    SkyStar Airways                                                                  | SKT      | SKY YOU                        | 
    Sky Airline                                                                      | SKU      | AEROSKY                        | 
    Scottish Airways Flyers                                                          | SKO      | SKYWORK                        | 
    SkyWest Airlines                                                                 | SKW      | SKYWEST                        | 
    Skymark Airlines                                                                 | SKY      | SKYMARK                        | 
    Sierra National Airlines                                                         | SLA      | SELAIR                         | 
    Slok Air                                                                         | SLB      | SLOK AIR                       | 
    Skyway Enterprises                                                               | SKZ      | SKYWAY-INC                     | 
    Saskatchewan Gov. Air Ambulance                                                  | SLG      | LIFEGUARD                      | Air Ambulance Service
    Silver Air                                                                       | SLD      | SILVERLINE                     | 
    Servicios Aéreos de Los Ángeles                                                  | AGE      | AEROANGEL                      | 
    Silverhawk Aviation                                                              | SLH      | SILVERHAWK                     | 
    Streamline                                                                       | SLE      | SLIPSTREAM                     | 
    Slovak Airlines                                                                  | SLL      | SLOV LINE                      | 
    Starfly                                                                          | SLF      | ELISTARFLY                     | 
    Skyscapes Air Charters                                                           | SKR      | SKYSCAPES                      | 
    Sloane Aviation                                                                  | SLN      | SLOANE                         | 
    Servicios Aéreos Slainte                                                         | SLS      | SERVICIOS SLAINTE              | 
    Surinam Airways                                                                  | SLM      | SURINAM                        | 
    Salpa Aviation                                                                   | SLP      | SALPA                          | 
    Sete Linhas Aéreas                                                               | SLX      | SETE                           | 
    SMA Airlines                                                                     | SMA      | SESAME                         | 
    Salama Airlines Nigeria                                                          | SLW      | SALMA AIR                      | 
    Sabang Merauke Raya Air Charter                                                  | SMC      | SAMER                          | 
    SilkAir                                                                          | SLK      | SILKAIR                        | 
    Servicios Aéreos La Marquesa                                                     | SMD      | SERVICIOS MARQUESA             | 
    Semos                                                                            | SME      | SEMICH                         | 
    Super Luza                                                                       | SLZ      | LUZA                           | 
    Stella Aviation                                                                  | SLV      | AVISTELLA                      | 
    Smith Air                                                                        | SML      | SMITH AIR                      | 
    Smalandsflyg                                                                     | SMF      | GORDON                         | 
    Smithair                                                                         | SMH      | SMITHAIR                       | 
    Summit Airlines                                                                  | SMM      | SUMMIT-AIR                     | 
    Somon Air                                                                        | SMR      | SOMON AIR                      | 
    Servicios Aéreos Del Sol                                                         | AOS      | AEROSOL                        | 
    Senator Aviation Charter                                                         | SNA      | SENATOR                        | 
    Servicios Aéreos De Nicaragua                                                    | SNE      | SANSA                          | 
    Skyline                                                                          | SMT      | SKYLIMIT                       | 
    Sterling Airlines                                                                | SNB      | STERLING                       | 
    Samar Air                                                                        | SMQ      | SAMAR AIR                      | 
    Savanah Airlines                                                                 | SNI      | SAVANAHLINE                    | 
    Semeyavia                                                                        | SMK      | ERTIS                          | 
    Sky Line for Air Services                                                        | SLY      | SKYCO                          | 
    Soonair Lines                                                                    | SNL      | SOONAIR                        | 
    Shans Air                                                                        | SNF      | SHANS AIR                      | 
    Senair Services                                                                  | SNH      | SENSERVICE                     | 
    Sun Quest Executive Air Charter                                                  | SNQ      | EXECU-QUEST                    | 
    Southeast Airlines                                                               | SNK      | SUN KING                       | 
    Servizi Aerei                                                                    | SNM      | SERVIZI AEREI                  | 
    Sun Air Aviation Services                                                        | SNX      | SUNEX                          | 
    Sun Pacific International                                                        | SNP      | SUN PACIFIC                    | 
    Skynet Asia Airways                                                              | SNJ      | NEWSKY                         | 
    Stabo Freight                                                                    | SOB      | STABO                          | 
    Sudanese States Aviation                                                         | SNV      | SUDANESE                       | 
    Sun West Airlines                                                                | SNW      | SUN WEST                       | 
    Suncoast Aviation                                                                | SNT      | SUNCOAST                       | 
    Southern Ohio Aviation Sales                                                     | SOH      | SOUTHERN OHIO                  | 
    Southern Aviation                                                                | SOI      | SOAVAIR                        | 
    Sunshine Air Tours                                                               | SON      | SUNSHINE TOURS                 | 
    Sonair Servico Aéreo                                                             | SOR      | SONAIR                         | 
    Southern Air                                                                     | SOO      | SOUTHERN AIR                   | 
    Southeast Correct Craft                                                          | SOT      | SOUTH COURIER                  | 
    Somali Airlines                                                                  | SOM      | SOMALAIR                       | 
    Southern Airways                                                                 | SOU      | SOUTHERN EXPRESS               | 
    Sowind Air                                                                       | SOW      | SOWIND                         | 
    Solomon Airlines                                                                 | SOL      | SOLOMON                        | 
    Solinair                                                                         | SOP      | SOLINAIR                       | 
    Saratov Airlines Joint Stock                                                     | SOV      | SARATOV AIR                    | 
    Sat Airlines                                                                     | SOZ      | SATCO                          | 
    Springbok Classic Air                                                            | SPB      | SPRING CLASSIC                 | 
    Skyworld Airlines                                                                | SPC      | PORT                           | 
    Solid Air                                                                        | SOX      | SOLIDAIR                       | 
    Sierra Pacific Airlines                                                          | SPA      | SIERRA PACIFIC                 | 
    Space World Airline                                                              | SPF      | SPACE WORLD                    | 
    Sprague Electric                                                                 | SPE      | SPRAGUE                        | 
    Servicios Corporativos Aéreos De La Laguna                                       | SPL      | CORPORATIVOS LAGUNA            | 
    Springdale Air Service                                                           | SPG      | SPRING AIR                     | 
    Servicios Aéreos Palenque                                                        | SPQ      | SERVICOS PALENQUE              | 
    Sapphire Aviation                                                                | SPP      | SAPPHIRE                       | 
    South Pacific Island Airways                                                     | SPI      | SOUTH PACIFIC                  | 
    Salt Aviation                                                                    | SVV      | SALT                           | http://salt.aero/
    Shuttle America                                                                  | TCF      | MERCURY                        | 
    Servicios Aéreos Tribasa                                                         | TBS      | TRIBASA                        | 
    Skorpion Air                                                                     | SPN      | AIR SKORPIO                    | 
    SC Ion Tiriac                                                                    | TIH      | TIRIAC AIR                     | 
    Spark Air                                                                        | THB      | THAI SABAI                     | 
    Servicios Aéreos Corporativos                                                    | TRN      | AEROTRON                       | 
    Servicios Aéreos Tamazula                                                        | TZU      | TAMAZULA                       | 
    Societe Tout Transport Mauritanien                                               | TTM      | TOUT-AIR                       | 
    Starlite Aviation                                                                | TRL      | STARSTREAM                     | 
    Servicios Aéreos Universitarios                                                  | UNT      | UNIVERSITARIO                  | 
    Sapphire Executive Air                                                           | SPH      | SAPPHIRE-CHARTER               | 
    Shar Ink                                                                         | UGP      | SHARINK                        | 
    Smarkand Aero Servise                                                            | USN      | SAMAS                          | 
    Samarkand Airways                                                                | UZS      | SOGDIANA                       | 
    Servicios Aéreos Avandaro                                                        | VDO      | AVANDARO                       | 
    Stichting Vliegschool 16Hoven                                                    | VGS      | SMART                          | 
    Second Sverdlovsk Air Enterprise                                                 | UKU      | PYSHMA                         | 
    Sirvair                                                                          | VRS      | VAIRSA                         | 
    Skif-Air                                                                         | USK      | SKIF-AIR                       | 
    Sunset Aviation                                                                  | TWY      | TWILIGHT                       | dba Solairus Aviation
    SAAB Nyge Aero                                                                   | TGT      | TARGET                         | 
    Sport Air Travel                                                                 | WCC      | WEST COAST                     | 
    Sunset Aviation                                                                  | VXN      | VIXEN                          | 
    Silverback Cargo Freighters                                                      | VRB      | SILVERBACK                     | 
    Scat Air                                                                         | VSV      | VLASTA                         | 
    Servicios Aéreos Textra                                                          | XTA      | TEXTRA                         | 
    Swift Copters                                                                    | WFC      | SWIFTCOPTERS                   | 
    Safarilink Aviation                                                              | XLK      | SAFARILINK                     | 
    Flyant                                                                           | FYA      | FLYANT                         | 
    SENEAM                                                                           | XMX      | SENEAM                         | 
    State Flight Academy of Ukraine                                                  | UFA      | FLIGHT ACADEMY                 | 
    Starlink Aviation                                                                | TLK      | STARLINK                       | 
    Sector Airlines                                                                  | XTR      | EXTER                          | 
    SF Airlines                                                                      | CSS      | SHUN FENG                      | 
    Stewart Aviation Services                                                        | YBE      | YELLOW BIRD                    | 
    Skyrover CC                                                                      | WLK      | SKYWATCH                       | 
    Singapore Air Force                                                              | SAF      | SINGA                          | 
    SaxonAir                                                                         | SXN      | SAXONAIR                       | 
    Small Planet Airlines                                                            | LLX      | GERMANJET                      | 
    SkyFirst                                                                         | KFE      | SKYFIRST                       | 2012
    Jet2                                                                             | EXS      | CHANNEX                        | Started in 1983
    Taxair Mexiqienses                                                               | TQE      | TAXAIR                         | Callsign changed from TAXA QUENSE in 2014
    Thai Smile Airways                                                               | THD      | THAI SMILE                     | 2014
    Sunexpress Deutschland                                                           | SXD      | SUNRISE                        | 
    Thai Vietjet Air                                                                 | TVJ      | THAIVIET JET                   | 2014
    Thai AirAsia X                                                                   | TAX      | EXPRESS WING                   | 
    SkyUp                                                                            | SQP      | SKYUP                          | 
    Transporte Aereo De Colombia                                                     | TCB      | AERO COLOMBIA                  | 
    Thai Lion Mentari                                                                | TLM      | MENTARI                        | 
    Tarkim Aviation                                                                  | TKJ      | TARKIM AVIATION                | 
    Turkish Aerospace Industries                                                     | THS      | TUSAS                          | 
    Transmandu                                                                       | TMD      | TRANSMANDU                     | 
    Turkish Airlines  General Aviation                                               | TRK      | TURKISH REPUBLIC               | 
    Transafricaine Air Cargo                                                         | TCG      | AFRICARGO                      | 
    Trifly                                                                           | SWD      | SAWBLADE                       | 
    Transporte Aéreo Dominicano                                                      | TAD      | TRANS DOMINICAN                | 
    TAME                                                                             | TAE      | TAME                           | Transporte Aéreos Militares Ecuatorianos
    Turbot Air Cargo                                                                 | TAC      | TURBOT                         | 
    Trans Jet Airways                                                                | SWL      | TRANSJET                       | 
    TAG Aviation USA                                                                 | TAG      | TAG U-S                        | 
    Talair                                                                           | TAL      | TALAIR                         | 
    Trans International Express Aviation                                             | BAP      | BIG APPLE                      | 
    Trend Aviation                                                                   | TDA      | TREND AIR                      | 
    Transportes Aéreos Tauro                                                         | TAU      | TRANSTAURO                     | 
    Travel Air                                                                       | TAX      | TRAVELAIR                      | 
    LATAM Brasil                                                                     | TAM      | TAM                            | 
    Travel Management                                                                | TMC      | TRAIL BLAZER                   | 
    TAP Portugal                                                                     | TAP      | AIR PORTUGAL                   | 
    Tunisair                                                                         | TAR      | TUNAIR                         | 
    Thunderbird Tours                                                                | TBD      | ORCA                           | 
    TNT Airways                                                                      | TAY      | QUALITY                        | 
    TAB Express International                                                        | TBI      | TAB INTERNATIONAL              | 
    Teebah Airlines                                                                  | TBN      | TEEBAH                         | 
    Tubelair                                                                         | TBR      | TUBELAIR                       | 
    Tobago Express                                                                   | TBX      | TABEX                          | 
    Taban Air Lines                                                                  | TBM      | TABAN AIR                      | 
    Transporte del Caribe                                                            | TCB      | TRANSCARIBE                    | 
    Trans Continental Airlines                                                       | TCC      | TRANSCAL                       | 
    Tchad Airlines                                                                   | TCD      | TCHADLINES                     | 
    Thai Air Cargo                                                                   | TCG      | THAI CARGO                     | 
    Teledyne Continental Motors                                                      | TCM      | TELEDYNE                       | 
    Trans-Colorado Airlines                                                          | TCE      | TRANS-COLORADO                 | 
    Trans Continental Airlines                                                       | TCN      | TRANSCON                       | 
    Tropican Air Services                                                            | TCA      | TROPICANA                      | 
    Thomas Cook Airlines                                                             | TCX      | THOMAS COOK                    | Formerly "KESTREL”
    Twin Cities Air Service                                                          | TCY      | TWIN CITY                      | 
    Transcontinental Sur                                                             | TCT      | TRANS-CONT                     | 
    Transportes Aéreos de Ixtlán                                                     | TDI      | TRANSIXTLAN                    | 
    Transglobal Airways Corporation                                                  | TCU      | TRANSGLOBAL                    | 
    TRADO                                                                            | TDO      | TRADO                          | Transporte Aéreo Dominicano
    Tandem Aero                                                                      | TDM      | TANDEM                         | 
    Tellavia                                                                         | TDE      | TELLURIDE                      | 
    Tradewinds Airlines                                                              | TDX      | TRADEWINDS EXPRESS             | Wrangler Aviation
    Transcorp Airways                                                                | TCP      | TRANSCORP                      | 
    Taxi Aero Nacional Del Evora                                                     | TDV      | TAXI EVORA                     | 
    Tecnicas Fotograficas                                                            | TEF      | TECFOTO                        | 
    Tenir Airlines                                                                   | TEB      | TENIR AIR                      | 
    Transcontinental Air                                                             | TCH      | TRANS GULF                     | 
    Tempelhof Airways                                                                | TEH      | TEMPELHOF                      | 
    Telford Aviation                                                                 | TEL      | TELFORD                        | 
    Tech-Mont Helicopter                                                             | TEM      | TECHMONT                       | 
    Territorial Airlines                                                             | TER      | TERRI-AIRE                     | 
    Taespejo Portugal LDA                                                            | TES      | TESABAN                        | 
    Tennessee Airways                                                                | TEN      | TENNESSEE                      | 
    Tepavia-Trans Airlines                                                           | TET      | TEPAVIA                        | 
    Trans-Florida Airlines                                                           | TFA      | TRANS FLORIDA                  | 
    Transeuropean Airlines                                                           | TEP      | TRANSEURLINE                   | 
    Trabajos Aéreos Murcianos                                                        | AIM      | PIJO                           | 
    Talon Air                                                                        | TFF      | TALON FLIGHT                   | 
    Transportes Aéreos del Pacífico                                                  | TFO      | TRANSPORTES PACIFICO           | 
    Thai Flying Helicopter Service                                                   | TFH      | THAI HELICOPTER                | 
    Transportes Aéreos San Rafael                                                    | SRF      | SAN RAFEAL                     | 
    Tair Airways                                                                     | TFB      | ROYAL TEE-AIR                  | 
    Thai Flying Service                                                              | TFT      | THAI FLYING                    | 
    Trabajos Aéreos                                                                  | TGE      | TASA                           | 
    TG Aviation                                                                      | TGC      | THANET                         | 
    Transportes Aéreos Regionales                                                    | TGI      | TRANSPORTE REGIONAL            | 
    TAG Aviation Espana                                                              | TGM      | TAG ESPANA                     | 
    Trade Air                                                                        | TDR      | TRADEAIR                       | 
    Teamline Air                                                                     | TLW      | TEAMLINE                       | 
    Tigerair Australia                                                               | TGG      | TIGGOZ                         | Previously TGW, callsign GO CAT
    Tayside Aviation                                                                 | TFY      | TAYSIDE                        | 
    Tigerair Singapore                                                               | TGW      | GO CAT                         | Merged with Scoot
    Cebgo                                                                            | SRQ      | BLUE JAY                       | Formerly SEAir, South East Asian Airlines and Tigerair Philippines
    Titan Airways                                                                    | AWC      | ZAP                            | 
    Tigerair Taiwan                                                                  | TTW      | SMART CAT                      | 
    Trans Guyana Airways                                                             | TGY      | TRANS GUYANA                   | 
    Trigana Air Service                                                              | TGN      | TRIGANA                        | 
    Transair Gabon                                                                   | TGX      | TRANSGABON                     | 
    Transport Canada                                                                 | TGO      | TRANSPORT                      | 
    Thai Airways International                                                       | THA      | THAI                           | 
    Tar Heel Aviation                                                                | THC      | TARHEEL                        | 
    Touraine Helicoptere                                                             | THF      | TOURAINE HELICO                | 
    Thai Global Airline                                                              | THG      | THAI GLOBAL                    | 
    Thai Jet Intergroup                                                              | THJ      | THAI JET                       | 
    Toumai Air Tchad                                                                 | THE      | TOUMAI AIR                     | 
    Turk Hava Kurumu Hava Taksi Isletmesi                                            | THK      | HUR KUS                        | 
    Thunder Airlines                                                                 | THU      | AIR THUNDER                    | 
    TACA De Honduras                                                                 | THO      | LEMPIRA                        | 
    Thai AirAsia                                                                     | AIQ      | THAI ASIA                      | 
    Tehran Airline                                                                   | THR      | TEHRAN AIR                     | 
    Trans Helicoptere Service                                                        | THZ      | LYON HELIJET                   | 
    TEAM Linhas Aéreas                                                               | TIM      | TEAM BRASIL                    | 
    Taino Tours                                                                      | TIN      | TAINO                          | 
    Tic Air                                                                          | TIK      | TICAIR                         | 
    Time Air                                                                         | TIE      | TIME AIR                       | 
    Turkish Airlines                                                                 | THY      | TURKISH                        | 
    Travel International Air Charters                                                | TIC      | TRAVEL INTERNATIONAL           | 
    Transcarga Intl Airways                                                          | TIW      | TIACA                          | 
    Tien-Shan                                                                        | TJN      | NERON                          | 
    Trans International Airlines                                                     | TIA      | TRANS INTERNATIONAL            | 
    Tesis                                                                            | TIS      | TESIS                          | 
    Tyrolean Jet Services                                                            | TJS      | TYROLJET                       | 
    Tikal Jets Airlines                                                              | TKC      | TIKAL                          | 
    Thai Sky Airlines                                                                | LLR      | THAI SKY AIR                   | 
    Take Air Line                                                                    | TKE      | ISLAND BIRD                    | 
    Tajikair                                                                         | TJK      | TAJIKAIR                       | 
    Trans Atlantic Airlines                                                          | TLL      | ATLANTIC LEONE                 | 
    Transport Africa                                                                 | TLF      | TRANS-LEONE                    | 
    Twin Jet                                                                         | TJT      | TWINJET                        | 
    Tropical International Airways                                                   | TKX      | TROPEXPRESS                    | 
    Tunisavia                                                                        | TAJ      | TUNISAVIA                      | 
    Tulip Air                                                                        | TLP      | TULIPAIR                       | 
    Eagle Canyon Airlines                                                            | TLO      | TALON AIR                      | 
    Translift Airways                                                                | TLA      | TRANSLIFT                      | 
    Turtle Airways                                                                   | TLT      | TURTLE                         | 
    Telesis Transair                                                                 | TLX      | TELESIS                        | 
    Trans Mediterranean Airlines                                                     | TMA      | TANGO LIMA                     | 
    Top Fly                                                                          | TLY      | TOPFLY                         | 
    Tamir Airways                                                                    | TMI      | TAMIRWAYS                      | 
    Taxis Turisticos Marakame                                                        | TMH      | TAXIMARAKAME                   | 
    Transports et Travaux Aériens de Madagascar                                      | TML      | TAM AIRLINE                    | 
    TMC Airlines                                                                     | TMM      | WILLOW RUN                     | 
    TRAM                                                                             | TMQ      | TRAM AIR                       | 
    Tri-MG Intra Asia Airlines                                                       | TMG      | TRILINES                       | 
    Timberline Air                                                                   | TMR      | TIMBER                         | 
    Trans Midwest Airlines                                                           | TMT      | TRANS MIDWEST                  | 
    Tomahawk Airways                                                                 | TMK      | TOMAHAWK                       | 
    Temsco Helicopters                                                               | TMS      | TEMSCO                         | 
    Transportes Aéreos del Mundo Maya                                                | TMY      | MUNDO MAYA                     | 
    Tramon Air                                                                       | TMX      | TRAMON                         | 
    Taxis Aéreos del Noroeste                                                        | TNE      | TAXINOROESTE                   | 
    TLC Air                                                                          | TLS      | TEALSY                         | 
    Transair International Linhas Aéreas                                             | TNI      | TRANSINTER                     | 
    Tengeriyn Ulaach Shine                                                           | TNL      | SKY HORSE                      | 
    Transafricaine                                                                   | TNF      | TRANSFAS                       | 
    Travelair                                                                        | TLV      | PAJAROS                        | 
    Tiara Air                                                                        | TNM      | TIARA                          | 
    Tanana Air Services                                                              | TNR      | TAN AIR                        | 
    Trans North Turbo Air                                                            | TNT      | TRANS NORTH                    | 
    Transped Aviation                                                                | TNP      | TRANSPED                       | 
    Trans Nation Airways                                                             | TNW      | TRANS-NATION                   | 
    Trener                                                                           | TNX      | TRAINER                        | 
    Trans Air-Benin                                                                  | TNB      | TRANS-BENIN                    | 
    Tobruk Air                                                                       | TOB      | TOBRUK AIR                     | 
    Transporte Amazonair                                                             | TMZ      | TRANS AMAZON                   | 
    Thomson Airways                                                                  | TOM      | TUI AIR                        | Formerly "TOMSON"
    Twin Town Leasing                                                                | TNY      | TWINCAL                        | 
    Toronto Airways                                                                  | TOR      | TORONTAIR                      | 
    AirTanker Services                                                               | TOW      | TOWLINE                        | 
    Tropic Air                                                                       | TOS      | TROPISER                       | 
    Toyota Canada                                                                    | TOY      | TOYOTA                         | 
    Top Air                                                                          | TOP      | AIR TOP                        | 
    Taxis Aéreos del Pacífico                                                        | TPF      | TAXIPACIFICO                   | 
    Tol-Air Services                                                                 | TOL      | TOL AIR                        | 
    TOJ Airlines                                                                     | TOJ      | TOJ AIRLINE                    | 
    Transportes Aéreos Pegaso                                                        | TPG      | TRANSPEGASO                    | 
    Transpaís Aéreo                                                                  | TPM      | TRANSPAIS                      | 
    Top Speed                                                                        | TPD      | TOP SPEED                      | 
    Transportación Aérea del Norte                                                   | TPN      | AEREA DELNORTE                 | 
    Transnorthern                                                                    | TNV      | TRANSNORTHERN                  | 
    Taxis Aéreos De Parral                                                           | TPR      | TAXIS PARRAL                   | 
    TAMPA                                                                            | TPA      | TAMPA                          | 
    TAPSA Transportes Aéreos Petroleros                                              | TPS      | TAPSA                          | 
    TAR Interpilot                                                                   | TPL      | INTERPILOT                     | 
    Transportes Aéreo del Sureste                                                    | TPT      | TASSA                          | 
    Transportes Aéreos De Xalapa                                                     | TPX      | TRANSXALAPA                    | 
    Trans-Provincial Airlines                                                        | TPY      | TRANS PROVINCIAL               | 
    Trans American Airlines                                                          | TPU      | TRANS PERU                     | 
    Transportación Aérea De Querétaro                                                | TQR      | TRANSQUERETARO                 | 
    Transportes La Paz                                                               | TPZ      | TRANSPAZ                       | 
    Transavia France                                                                 | TVF      | FRANCE SOLEIL                  | 
    Trans Air Charter                                                                | TRC      | TRACKER                        | 
    TACV                                                                             | TCV      | CABOVERDE                      | 
    Trans Island Air                                                                 | TRD      | TRANS ISLAND                   | 
    Transavia Holland                                                                | TRA      | TRANSAVIA                      | 
    Thai Pacific Airlines Business                                                   | TPV      | THAI PACIFIC                   | 
    Taxi Air Fret                                                                    | TRF      | TAXI JET                       | 
    Transport Aerien de Mauritanie                                                   | TRM      | SOTRANS                        | 
    Taquan Air Services                                                              | TQN      | TAQUAN                         | 
    Transpac Express                                                                 | TPP      | TRANS EXPRESS                  | 
    Tramson                                                                          | TRR      | TRAMSON                        | 
    Tropic Airlines-Air Molokai                                                      | TRO      | MOLOKAI                        | 
    Triangle Airline                                                                 | TRU      | TRI AIR                        | 
    Transwestern Airlines of Utah                                                    | TRW      | TRANS-WEST                     | 
    TAF-Linhas Aéreas                                                                | TSD      | TAFI                           | 
    Transmile Air Services                                                           | TSE      | TRANSMILE                      | 
    Trans Arabian Air Transport                                                      | TRT      | TRANS ARABIAN                  | 
    Trans Euro Air                                                                   | TRJ      | HIGH TIDE                      | 
    Transport'air                                                                    | TSI      | TRANSPORTAIR                   | 
    Tristar Airlines                                                                 | TRY      | TRISTAR AIR                    | 
    Trans-Air-Congo                                                                  | TSG      | TRANS-CONGO                    | 
    Transair France                                                                  | TSA      | AIRTRAF                        | 
    Transwest Air                                                                    | ABS      | ATHABASKA                      | 
    Taftan Airlines                                                                  | SBT      | TAFTAN                         | 
    Trast Aero                                                                       | TSK      | TOMSK-AVIA                     | 
    Transportes Aéreos Inter                                                         | TSP      | TRANSPO-INTER                  | 
    Thai Aviation Services                                                           | TSL      | THAI AVIATION                  | 
    Transaero Airlines                                                               | TSO      | TRANSOVIET                     | 
    Tri-State Aero                                                                   | TSS      | TRI-STATE                      | 
    TRAST                                                                            | TST      | TRAST                          | 
    TJS San Marino S.R.L.                                                            | TSR      | SAN MARINO                     | 
    Transwings                                                                       | TSW      | SWISSTRANS                     | 
    Tropair Airservices                                                              | TSV      | TROPIC                         | 
    Thai Star Airlines                                                               | TSX      | THAI STAR                      | 
    TTA - Sociedade de Transporte e Trabalho Aéreo                                   | TTA      | KANIMANBO                      | 
    Tristar Air                                                                      | TSY      | TRIPLE STAR                    | 
    Total Linhas Aéreas                                                              | TTL      | TOTAL                          | 
    Triple O Aviation                                                                | TTP      | MIGHTY WING                    | 
    Transportaciones Y Servicios Aéreos                                              | TTR      | TRANSPORTACIONES               | 
    Transporte Aéreo Técnico Ejecutivo                                               | TTS      | TECNICO                        | 
    Turismo Aéreo de Chile                                                           | TUC      | TURICHILE                      | 
    Transteco                                                                        | TTC      | TRANSTECO                      | 
    Tulpar Air                                                                       | TUL      | URSAL                          | 
    Taxi Aéreo Turístico                                                             | TUO      | TURISTICO                      | 
    Turkmenhovayollary                                                               | TUA      | TURKMENISTAN                   | 
    Tuna Aero                                                                        | TUZ      | TUNA                           | 
    Tulpar Air Service                                                               | TUX      | TULPA                          | 
    Trabajos Aéreos Vascongados                                                      | TVH      | TRAVASA                        | 
    Trans-Air Services                                                               | TSN      | AIR TRANS                      | 
    Tiramavia                                                                        | TVI      | TIRAMAVIA                      | 
    Transavio                                                                        | TVO      | TRANS-BALLERIO                 | 
    Tavrey Airlines                                                                  | TVR      | TAVREY                         | 
    Tyumenspecavia                                                                   | TUM      | TUMTEL                         | 
    Trast Aero                                                                       | TSJ      | TRAST AERO                     | 
    Travel Service                                                                   | TVL      | TRAVEL SERVICE                 | 
    Trans America Airlines                                                           | TVA      | TRANS-AMERICA                  | 
    Trans Air Welwitchia                                                             | TWW      | WELWITCHIA                     | 
    Transwede Airways                                                                | TWE      | TRANSWEDE                      | 
    Texair Charter                                                                   | TXA      | OKAY AIR                       | 
    TransAVIAexport Airlines                                                         | TXC      | TRANSEXPORT                    | 
    Taxi Aéreo de México                                                             | TXM      | TAXIMEX                        | 
    Taxi Aéreo Cozatl                                                                | TXL      | TAXI COZATL                    | 
    Transilvania Express                                                             | TXE      | TRANSAIR EXPRESS               | 
    Taxis Aéreos de Sinaloa                                                          | TXO      | TAXIS SINALOA                  | 
    Texas National Airlines                                                          | TXN      | TEXAS NATIONAL                 | 
    Tradewinds Aviation                                                              | TWL      | TRADEWINDS CANADA              | 
    Twente Airlines                                                                  | TWO      | COLIBRI                        | 
    Texas Air Charters                                                               | TXT      | TEXAS CHARTER                  | Group One
    Texas Airlines                                                                   | TXS      | TEXAIR                         | 
    Tex Star Air Freight                                                             | TXZ      | TEX STAR                       | 
    Taxirey                                                                          | TXR      | TAXIREY                        | 
    Transporte Aéreo Ernesto Saenz                                                   | TZE      | TRANSPORTE SAENZ               | 
    TJS Malta                                                                        | TYJ      | TYROLMALTA                     | 
    T'way Air                                                                        | TWB      | TWAYAIR                        | 
    Tayflite                                                                         | TYF      | TAYFLITE                       | 
    Transportes Aéreos Bolivianos                                                    | BOL      | BOL                            | 
    Trygg-Flyg                                                                       | TYG      | TRYGG                          | 
    Tyrol Air Ambulance                                                              | TYW      | TYROL AMBULANCE                | 
    Top Flight Air Service                                                           | CHE      | CHECK AIR                      | 
    TUIfly Nordic                                                                    | BLX      | BLUESCAN                       | 
    Tashkent Aircraft Production Corporation                                         | CTP      | CORTAS                         | 
    Transportes Aéreos Don Carlos                                                    | DCL      | DON CARLOS                     | 
    Trans America                                                                    | CLR      | CLINTON AIRWAYS                | 
    Triple Alpha                                                                     | CLU      | CAROLUS                        | 
    TAAG Angola Airlines                                                             | DTA      | DTA                            | 
    Tajikistan International Airlines                                                | TZK      | TAJIKSTAN                      | 
    Telnic                                                                           | DOT      | DOT TEL                        | 
    Transporte Ejecutivo Aéreo                                                       | EAR      | EJECUTIVO-AEREO                | 
    Texas Airways                                                                    | CWT      | TEXAS AIRWAYS                  | 
    Transportes Aéreos Nacionales De Selva Tans                                      | ELV      | AEREOS SELVA                   | 
    Triton Airlines                                                                  | DRC      | TRITON AIR                     | 
    Transaviaservice                                                                 | FNV      | TRANSAVIASERVICE               | 
    TAG Aviation                                                                     | FPG      | TAG AVIATION                   | 
    The 955 Preservation Group                                                       | GFN      | GRIFFON                        | 
    Thyssen Krupp AG                                                                 | BLI      | BLUELINE                       | 
    Tassili Airlines                                                                 | DTH      | TASSILI AIR                    | 
    Trail Lake Flying Service                                                        | HBA      | HARBOR AIR                     | 
    Tradewind Aviation                                                               | GPD      | GOODSPEED                      | 
    Tango Bravo                                                                      | HTO      | HELI TANGO                     | 
    TAF Helicopters                                                                  | HET      | HELITAF                        | 
    Tibet Airlines                                                                   | TBA      | TIBET                          | 
    Turkish Air Force                                                                | HVK      | TURKISH AIRFORCE               | 
    TA-Air Airline                                                                   | IRF      | TA-AIR                         | 
    Trans-Kiev                                                                       | KCA      | TRANS-KIEV                     | 
    Tara Air Line                                                                    | IRR      | TARAIR                         | 
    Transcontinental Airlines                                                        | KRA      | REGATA                         | 
    Trading Air Cargo                                                                | JCH      | TRADING CARGO                  | 
    Tal Air Charters                                                                 | JEL      | JETEL                          | 
    Transair-Gyraintiee                                                              | KTS      | KOTAIR                         | 
    TAM Mercosur                                                                     | LAP      | PARAGUAYA                      | 
    Trans-Air-Link                                                                   | GJB      | SKY TRUCK                      | 
    The Lancair                                                                      | LCC      | LANCAIR                        | 
    Transaviabaltika                                                                 | KTB      | TRANSBALTIKA                   | 
    Transportación Aérea Del Mar De Cortés                                           | MCT      | TRANS CORTES                   | 
    The Army Aviation Heritage Foundation                                            | LEG      | LEGACY                         | 
    Transportes Aéreos Amparo                                                        | MPO      | AMPARO                         | 
    Top Sky International                                                            | LKW      | TOPINTER                       | 
    Trans Air                                                                        | MUI      | MAUI                           | 
    Transportes Aéreos Mexiquenses                                                   | MXQ      | MEXIQUENSES                    | 
    TNT International Aviation                                                       | NTR      | NITRO                          | 
    Trans States Airlines                                                            | LOF      | WATERSKI                       | 
    Open Skies Consultative Commission                                               | OSY      | OPEN SKIES                     | 
    Tigerfly                                                                         | MOH      | MOTH                           | 
    Transporte Aero MGM                                                              | MGM      | AERO EMM-GEE-EMM               | 
    Trans Atlantis                                                                   | LTA      | LANTRA                         | 
    Trans World Express                                                              | RBD      | RED BIRD                       | 
    TSSKB-Progress                                                                   | PSS      | PROGRESS                       | 
    Tarom                                                                            | ROT      | TAROM                          | 
    Transportes Aéreos I. R. Crusoe                                                  | ROU      | ROBINSON CRUSOE                | 
    Transportes Aéreos Sierra                                                        | RRT      | SIERRA ALTA                    | 
    Tas Aviation                                                                     | RMS      | TASS AIR                       | 
    Trans Am Compania                                                                | RTM      | AERO TRANSAM                   | 
    Transportes Aéreos Sierra Madre                                                  | SEI      | TRANSPORTE SIERRA              | 
    Tbilisi Aviation University                                                      | RRY      | AIRFERRY                       | 
    Trans Sahara Air                                                                 | SBJ      | TRANS SAHARA                   | 
    TRIP Linhas Aéreas                                                               | TIB      | TRIP                           | IATA code 8R changed to T4 
    Turan Air                                                                        | URN      | TURAN                          | 
    Trans-Pacific Orient Airways                                                     | PCW      | PACIFIC ORIENT                 | 
    Trans Reco                                                                       | REC      | TRANS-RECO                     | 
    Tusheti                                                                          | USB      | TUSHETI                        | 
    Tag Aviation UK                                                                  | VIP      | SOVEREIGN                      | 
    Tbilaviamsheni                                                                   | VNZ      | TBILAVIA                       | 
    Transarabian Transportation Services                                             | UTT      | ARABIAN TRANSPORT              | 
    XpressAir                                                                        | XAR      | XPRESS                         | Renamed from Travel Express Aviation Services in 2012
    Taxi Aero Del Norte                                                              | XNR      | TAXI NORTE                     | 
    Tyrolean Airways                                                                 | TYR      | TYROLEAN                       | Renamed from Austrian Arrows
    TAPC Aviatrans Air                                                               | UTM      | AVIATAPS                       | 
    TUI Airlines Netherlands                                                         | TFL      | ORANGE                         | 
    Taxi de Veracruz                                                                 | VRC      | VERACRUZ                       | 
    UTAir                                                                            | TUM      | UTAIR-CARGO                    | 2014
    Transaven                                                                        | VEN      | TRANSAVEN AIRLINE              | 
    United European Airlines                                                         | UEU      | UNITED EUROPEAN                | 2014
    Trans Asian Airlines                                                             | SRT      | TRASER                         | 
    Urumqi Airlines                                                                  | CUH      | LOULAN                         | 2014
    U.S. Department of the Interior                                                  | DOI      | INTERIOR                       | Office of Aircraft Services
    U.S. Navy Reserve Logistic Air Forces                                            | CNV      | CONVOY                         | U.S. Navy Reserve Logistic Air Forces, New Orleans, LA, USA
    Uniworld Air Cargo                                                               | UCG      | UNIWORLD                       | 2014
    UK Civil Aviation Authority                                                      | EXM      | EXAM                           | CAA Flight Examiners
    US Army Parachute Team                                                           | GKA      | GOLDEN KNIGHTS                 | 
    UNI Air                                                                          | UIA      | GLORY                          | 
    United Arabian Airlines                                                          | UAB      | UNITED ARABIAN                 | 
    Air Tanzania                                                                     | ATC      | TANZANIA                       | 
    Tianjin Airlines                                                                 | GCR      | BO HAI                         | 
    United Airways                                                                   | UBD      | UNITED BANGLADESH              | 
    United Airlines                                                                  | UAL      | UNITED                         | 
    USA3000 Airlines                                                                 | GWY      | GETAWAY                        | 
    United Feeder Service                                                            | UFS      | FEEDER EXPRESS                 | formerly part of United Express
    UK Civil Aviation Authority                                                      | CFU      | MINAIR                         | Civil Aviation Authority Flying Unit
    United Eagle Airlines                                                            | UEA      | UNITED EAGLE                   | 
    UK Royal VIP Flights                                                             | KRF      | KITTYHAWK                      | In Military Aircraft
    United Air Charters                                                              | UAC      | UNITAIR                        | 
    UK Royal VIP Flight                                                              | KRH      | SPARROWHAWK                    | In Civil Chartered Aircraft
    UK Royal VIP Flights                                                             | TQF      | RAINBOW                        | Helicopter Flights
    United States Coast Guard Auxiliary                                              | CGX      | COASTGUARD AUXAIR              | 
    UK Civil Aviation Authority                                                      | SDS      | STANDARDS                      | Training Standards
    United States Department Of Agriculture                                          | AGR      | AGRICULTURE                    | 
    UK HEMS                                                                          | HLE      | HELIMED                        | 
    US Marshals Service                                                              | MSH      | MARSHALAIR                     | US Department of Justice
    Universal Avia                                                                   | HBU      | KHARKIV UNIVERSAL              | 
    USA Jet Airlines                                                                 | JUS      | JET USA                        | 
    Unijet                                                                           | LEA      | LEADAIR                        | 
    Union des Transports Africains de Guinee                                         | GIH      | TRANSPORT AFRICAIN             | 
    Universal Airlines                                                               | PNA      | PACIFIC NORTHERN               | 
    Uganda Royal Airways                                                             | RAU      | UGANDA ROYAL                   | 
    University of North Dakota                                                       | NDU      | SIOUX                          | 
    United Carriers Systems                                                          | UCS      | UNITED CARRIERS                | 
    United Aviation Services                                                         | SAU      | UNISERVE                       | 
    US Airports Air Charter                                                          | UCH      | US CHARTER                     | 
    Uganda Air Cargo                                                                 | UCC      | UGANDA CARGO                   | 
    Union Africaine des Transports                                                   | UAI      | UNAIR                          | 
    Ural Airlines                                                                    | SVR      | SVERDLOVSK AIR                 | 
    Uganda Airlines                                                                  | UGD      | CRESTED                        | Started operations in 2019
    United Arab Emirates Air Force                                                   | UAF      | UNIFORCE                       | 
    Ukraine Transavia                                                                | TRB      | KIROVTRANS                     | 
    Ulyanovsk Higher Civil Aviation School                                           | UHS      | PILOT AIR                      | 
    Ues-Avia Air                                                                     | UES      | AVIASYSTEM                     | 
    Journey Aviation                                                                 | UJT      | UNI-JET                        | Cancelled 2014 - Renamed Journey Aviation with code JNY
    Ucoaviacion                                                                      | UCO      | UCOAVIACION                    | 
    Journey Aviation                                                                 | JNY      | UNI-JET                        | 
    UK International Airlines                                                        | UKI      | KHALIQ                         | 
    Urgemer Canarias                                                                 | UGC      | URGEMER                        | 
    UM Airlines                                                                      | UKM      | UKRAINE MEDITERRANEE           | Ukraine Mediterranean Airlines
    Ukraine Air Enterprise                                                           | UKN      | ENTERPRISE UKRAINE             | 
    Ukraine Air Alliance                                                             | UKL      | UKRAINE ALLIANCE               | 
    National Police Air Service                                                      | UKP      | POLICE                         | 
    Ultimate HELI                                                                    | ULH      | ULTIMATEHELI                   | Ultimate HELI Ltd
    Ukrainian Cargo Airways                                                          | UKS      | CARGOTRANS                     | 
    Ultimate Air                                                                     | ULR      | VIPER                          | Ultimate Airways Ltd
    Ukrainian Helicopters                                                            | UHL      | UKRAINE COPTERS                | 
    Universal Jet Rental de Mexico                                                   | UJR      | UNIVERSAL JET                  | 
    Universal Jet                                                                    | UNJ      | PROJET                         | 
    Uni-Fly                                                                          | UNC      | UNICOPTER                      | 
    Ultrair                                                                          | ULT      | ULTRAIR                        | 
    Ukrainian Pilot School                                                           | UPL      | PILOT SCHOOL                   | 
    Union Flights                                                                    | UNF      | UNION FLIGHTS                  | 
    Unifly Servizi Aerei                                                             | UNU      | UNIEURO                        | 
    US-Bangla Airlines                                                               | UBG      | BANGLA STAR                    | 
    Unsped Paket Servisi                                                             | UNS      | UNSPED                         | 
    US Airways                                                                       | AWE      | CACTUS                         | 
    US Helicopter                                                                    | USH      | US-HELI                        | 
    US Express                                                                       | USX      | AIR EXPRESS                    | 
    Uraiavia                                                                         | URV      | URAI                           | 
    UTair Aviation                                                                   | UTA      | UTAIR                          | WAS P2 till 2006
    United Parcel Service                                                            | UPS      | UPS                            | 
    USAfrica Airways                                                                 | USF      | AFRICA EXPRESS                 | 
    Utair South Africa                                                               | UTR      | AIRUT                          | 
    Ukrainian State Air Traffic Service Enterprise                                   | UTS      | AIRRUH                         | 
    UTAGE                                                                            | UTG      | UTAGE                          | 
    USAF Chief of Staff                                                              | AIO      | AIR CHIEF                      | Chief of Staff
    United Aviation                                                                  | UVN      | UNITED AVIATION                | 
    US Jet                                                                           | USJ      | USJET                          | 
    Uvavemex                                                                         | UVM      | UVAVEMEX                       | 
    Universal Airlines                                                               | UVG      | GUYANA JET                     | 
    Universal Airways                                                                | UVA      | UNIVERSAL                      | 
    Uzbekistan Airways                                                               | UZB      | UZBEK                          | 
    USAF 100th Air Refueling Wing                                                    | QID      | QUID                           | 
    Vanilla Air                                                                      | VNL      | VANILLA                        | 
    University of Tromsø School of Aviation                                          | UIT      | ARCTIC                         | 
    United Nations                                                                   | UNO      | UNITED NATIONS                 | UNOxxx followed by P
    Veca Airlines                                                                    | VAR      | VECA                           | 
    Valair Aviação Lda                                                               | VVV      | VALAIRJET                      | 
    Universal Airlines                                                               | WEC      | AIRGO                          | 
    Ukraine International Airlines                                                   | AUI      | UKRAINE INTERNATIONAL          | 
    Volare 22 X                                                                      | VLR      | VOLAX                          | 
    Virgin Australia                                                                 | VOZ      | VELOCITY                       | Previously Used: KANGA, AURORA, VEE-OZ
    Voldirect                                                                        | VDR      | VOLDIR                         | 
    V I Airlink                                                                      | VIL      | TURTLE DOVE                    | 
    VIVA Aerobus                                                                     | VIV      | AEROENLACES                    | 
    V-Berd-Avia                                                                      | VBD      | VEEBIRD-AVIA                   | 
    Vacationair                                                                      | VAC      | VACATIONAIR                    | 
    Valan                                                                            | VLN      | VALAN                          | 
    Valfell-Verkflug                                                                 | EHR      | ROTOR                          | 
    Valuair                                                                          | VLU      | VALUAIR                        | Merged with Jetstar Asia
    AirTran Airways                                                                  | VJA      | CRITTER                        | Now operating as AirTran Airways. J7 Reassigned.
    Valan International Cargo Charter                                                | VLA      | NALAU                          | 
    Vanguardia en Aviación en Colima                                                 | VGC      | VANGUARDIA COLIMA              | 
    Vanguard Airlines                                                                | VGD      | VANGUARD AIR                   | 
    Valair AG                                                                        | RDW      | ROADWATCH                      | 
    Van Air Europe                                                                   | VAA      | EUROVAN                        | 
    V Bird Airlines Netherlands                                                      | VBA      | VEEBEE                         | 
    V-avia Airline                                                                   | WIW      | VEE-AVIA                       | 
    Vega                                                                             | VAG      | SEGA                           | 
    Vietnam Air Services                                                             | VFC      | VASCO AIR                      | 
    Vega Air                                                                         | WGA      | WEGA FRANKO                    | 
    Vernicos Aviation                                                                | GRV      | NIGHT RIDER                    | 
    Verataxis                                                                        | VTX      | VERATAXIS                      | 
    Veles, Ukrainian Aviation                                                        | WEL      | VELES                          | 
    Vozdushnaya Academy                                                              | KWA      | VOZAIR                         | 
    Veritair                                                                         | BTP      | NET RAIL                       | 
    Victoria Aviation                                                                | ENV      | ENDEAVOUR                      | 
    Vision Airlines                                                                  | SSI      | SUPER JET                      | 
    VIP Air Charter                                                                  | FXF      | FOX FLIGHT                     | 
    Vietnam Airlines                                                                 | HVN      | VIET NAM AIRLINES              | 
    VIM Airlines                                                                     | MOV      | MOV AIR                        | 
    Voyageur Airways                                                                 | VAL      | VOYAGEUR                       | 
    VICA - Viacao Charter Aéreos                                                     | VCA      | VICA                           | 
    Volare Air Charter                                                               | VCM      | CARMEN                         | 
    Volaris                                                                          | VOI      | VOLARIS                        | 
    VIP Avia                                                                         | PAV      | NICOL                          | 
    Visionair                                                                        | VAT      | VISIONAIR                      | 
    VIP Avia                                                                         | PRX      | PAREX                          | 
    Volga-Dnepr Airlines                                                             | VDA      | VOLGA                          | 
    Vega Airlines                                                                    | VEA      | VEGA AIRLINES                  | 
    Virgin America                                                                   | VRD      | REDWOOD                        | 
    Vietjet Air                                                                      | VJC      | VIETJET                        | 
    Victor Echo                                                                      | VEE      | VICTOR ECHO                    | 
    Vieques Air Link                                                                 | VES      | VIEQUES                        | 
    VZ Flights                                                                       | VFT      | ZETA FLIGHTS                   | 
    Venescar Internacional                                                           | VEC      | VECAR                          | 
    Viscount Air Service                                                             | VCT      | VISCOUNT AIR                   | 
    Vologda State Air Enterprise                                                     | VGV      | VOLOGDA AIR                    | 
    VHM Schul-und-Charterflug                                                        | VHM      | EARLY BIRD                     | 
    Vibroair Flugservice                                                             | VIB      | VITUS                          | 
    VIP Servicios Aéreos Ejecutivos                                                  | VIC      | VIP-EJECUTIVO                  | 
    Virgin Express                                                                   | VEX      | VIRGIN EXPRESS                 | 
    Virgin Nigeria Airways                                                           | VGN      | VIRGIN NIGERIA                 | 
    VIF Luftahrt                                                                     | VIF      | VIENNA FLIGHT                  | 
    VH-Air Industrie                                                                 | VHA      | AIR V-H                        | 
    Vichi                                                                            | VIH      | VICHI                          | 
    Vinair Aeroserviços                                                              | VIN      | VINAIR                         | 
    VIP Empresarial                                                                  | VIE      | VIP EMPRESARIAL                | 
    Vega Aviation                                                                    | VIG      | VEGA AVIATION                  | 
    Vistajet                                                                         | VJT      | VISTA MALTA                    | 2014
    Vistajet                                                                         | VJT      | VISTA                          | 
    Virgin Express Ireland                                                           | VEI      | GREEN ISLE                     | 
    Viking Airlines                                                                  | VIK      | SWEDJET                        | 
    Viajes Ejecutivos Mexicanos                                                      | VJM      | VIAJES MEXICANOS               | 
    Vladivostok Air                                                                  | VLK      | VLADAIR                        | 
    Varig Logística                                                                  | VLO      | VELOG                          | 
    Vertical-T Air                                                                   | VLT      | VERTICAL                       | 
    Vero Monmouth Airlines                                                           | VMA      | VERO MONMOUTH                  | 
    Viaggio Air                                                                      | VOA      | VIAGGIO                        | 
    C.A.I. Second                                                                    | VLE      | VOLA                           | 
    Virgin Atlantic                                                                  | VIR      | VIRGIN                         | 
    Vueling Airlines                                                                 | VLG      | VUELING                        | 
    Volare Airlines                                                                  | VRE      | UKRAINE VOLARE                 | 
    Voyager Airlines                                                                 | VOG      | VOYAGER AIR                    | 
    VIP-Avia                                                                         | VPV      | VIP AVIA                       | 
    VRG Linhas Aéreas                                                                | VRN      | VARIG                          | 
    Viva Air Colombia                                                                | VVC      | VIVA AIR COLOMBIA              | Commenced operations on May 25, 2012
    Veteran Air                                                                      | VPB      | VETERAN                        | 
    Voar Lda                                                                         | VRL      | VOAR LINHAS                    | 
    Vision Airways Corporation                                                       | VSN      | VISION                         | 
    Virign Islands Seaplane Shuttle                                                  | VSS      | WATERBIRD                      | 
    Viva Macau                                                                       | VVM      | JACKPOT                        | 
    Vuelos Especializados Tollocan                                                   | VTC      | VUELOS TOLLOCAN                | 
    Vostok Airlines                                                                  | VTK      | VOSTOK                         | 
    Volotea                                                                          | VOE      | VOLOTEA                        | 
    Vickers                                                                          | VSB      | VICKERS                        | 
    Victor Tagle Larrain                                                             | VTL      | VITALA                         | 
    Vuelos Corporativos de Tehuacan                                                  | VTH      | VUELOS TEHUACAN                | 
    Vointeh                                                                          | VTV      | VOINTEH                        | 
    Voronezh Aircraft Manufacturing Society                                          | VSO      | VASO                           | 
    Vuelos Internos Privados VIP                                                     | VUR      | VIPEC                          | 
    Vuela Bus                                                                        | VUS      | VUELA BUS                      | 
    Air Volga                                                                        | WLG      | GOUMRAK                        | 
    Viking Express                                                                   | WCY      | TITAN AIR                      | 
    Vistara                                                                          | VTI      | VISTARA                        | Commenced operations 9 January 2015
    Vertair                                                                          | VRA      | VERITAIR                       | 
    Victoria International Airways                                                   | WEV      | VICTORIA UGANDA                | 
    Vzlyet                                                                           | VZL      | VZLYET                         | 
    Walmart Aviation                                                                 | CGG      | CHARGE                         | 
    Wapiti Aviation                                                                  | WPT      | WAPITI                         | 
    VLM Airlines                                                                     | VLM      | RUBENS                         | 
    Warbelow's Air Ventures                                                          | WAV      | WARBELOW                       | 
    WaltAir                                                                          | GOT      | GOTHIC                         | 
    WRA Inc                                                                          | WRR      | WRAP AIR                       | 
    WebJet Linhas Aéreas                                                             | WEB      | WEB-BRASIL                     | 
    Weasua Air Transport                                                             | WTC      | WATCO                          | 
    Warwickshire Aerocentre                                                          | ATX      | AIRTAX                         | 
    WDL Aviation                                                                     | WDL      | WDL                            | 
    Welch Aviation                                                                   | TDB      | THUNDER BAY                    | 
    Wermlandsflyg AB                                                                 | BLW      | BLUESTAR                       | 
    Welcome Air                                                                      | WLC      | WELCOMEAIR                     | 
    West Air Luxembourg                                                              | WLX      | WEST LUX                       | 
    West African Cargo Airlines                                                      | WAC      | WESTAF CARGO                   | 
    West Africa Airlines                                                             | WCB      | KILO YANKEE                    | 
    West Air Sweden                                                                  | SWN      | AIR SWEDEN                     | 
    West Coast Air                                                                   | YWZ      | COAST AIR                      | 
    West Caribbean Airways                                                           | WCW      | WEST                           | 
    West African Air Transport                                                       | WTF      | WESTAF AIRTRANS                | 
    West Coast Airlines                                                              | WCG      | WHISKY INDIA                   | 
    West Coast Charters                                                              | WCC      | WEST COAST                     | 
    West Caribbean Costa Rica                                                        | WCR      | WEST CARIBBEAN                 | 
    WestJet                                                                          | WJA      | WESTJET                        | 
    West Freugh DTEO                                                                 | TEE      | TEEBIRD                        | 
    Westair Aviation                                                                 | WAA      | WESTAIR WINGS                  | 
    Westair Cargo Airlines                                                           | WSC      | WESTCAR                        | 
    Westair Industries                                                               | PCM      | PAC VALLEY                     | 
    Westcoast Energy                                                                 | BLK      | BLUE FLAME                     | 
    Wasaya Airways                                                                   | WSG      | WASAYA                         | 
    West Wind Aviation                                                               | WEW      | WESTWIND                       | 
    Walsten Air Services                                                             | WAS      | WALSTEN                        | 
    Western Aircraft                                                                 | STT      | SAWTOOTH                       | 
    Western Arctic Air                                                               | WAL      | WESTERN ARCTIC                 | 
    West Coast Airways                                                               | WCA      | WEST-LEONE                     | 
    Western Air                                                                      | WST      | WESTERN BAHAMAS                | 
    Western Air Express                                                              | WAE      | WESTERN EXPRESS                | 
    Western Global Airlines                                                          | WGN      | WESTERN GLOBAL                 | Allocated in 2014
    Western Pacific Airlines                                                         | KMR      | KOMSTAR                        | 
    Western Air Couriers                                                             | NPC      | NORPAC                         | 
    KLM Cityhopper                                                                   | KLC      | CITY                           | 
    Western Express Air Lines                                                        | WES      | WEST EX                        | 
    Westflight Aviation                                                              | WSL      | WEST LINE                      | 
    Westland Helicopters                                                             | WHE      | WESTLAND                       | 
    Western Aviators                                                                 | WTV      | WESTAVIA                       | 
    Westgates Airlines                                                               | WSA      | WESTATES                       | 
    Western Pacific Airservice                                                       | WPA      | WESTPAC                        | 
    Widerøe                                                                          | WIF      | WIDEROE                        | 
    White                                                                            | WHT      | WHITEJET                       | 
    Wiggins Airways                                                                  | WIG      | WIGGINS AIRWAYS                | 
    White Eagle Aviation                                                             | WEA      | WHITE EAGLE                    | 
    Westward Airways                                                                 | WWD      | WESTWARD                       | 
    Air Wales Virtual                                                                | WLS      | WALES                          | 
    Wimbi Dira Airways                                                               | WDA      | WIMBI DIRA                     | 
    Wilbur's Flight Operations                                                       | WFO      | WILBURS                        | 
    Wiking Helikopter Service                                                        | WHS      | WEEKING                        | 
    Westpoint Air                                                                    | WTP      | WESTPOINT                      | 
    Wind Jet                                                                         | JET      | GHIBLI                         | 
    Winair                                                                           | WNA      | WINAIR                         | 
    Wings Air                                                                        | WON      | WINGS ABADI                    | Subsidiary of Lion Air
    Wind Spirit Air                                                                  | WSI      | WIND SPIRIT                    | 
    Williams Grand Prix Engineering                                                  | WGP      | GRAND PRIX                     | 
    Wings Aviation                                                                   | WOL      | WINGJET                        | 
    Windward Islands Airways International                                           | WIA      | WINDWARD                       | 
    Windrose Air                                                                     | QGA      | QUADRIGA                       | 
    Wings of Lebanon Aviation                                                        | WLB      | WING LEBANON                   | 
    Wings Airways                                                                    | WAW      | WING SHUTTLE                   | 
    Wings Express                                                                    | WEX      | WINGS EXPRESS                  | 
    Wizz Air UK                                                                      | WUK      | WIZZ GO                        | 
    Wondair on Demand Aviation                                                       | WNR      | WONDAIR                        | 
    Woodgate Aviation                                                                | CWY      | CAUSEWAY                       | 
    World Airways                                                                    | WOA      | WORLD                          | 
    Winlink                                                                          | WIN      | WINLINK                        | 
    World Wing Aviation                                                              | WWM      | MANAS WING                     | 
    SW Italia                                                                        | CSW      | SILKITALIA                     | 
    WOW air                                                                          | WOW      | WOW AIR                        | 
    Worldwide Jet Charter                                                            | WWI      | WORLDWIDE                      | 
    Wizz Air                                                                         | WZZ      | WIZZAIR                        | 
    Wuhan Airlines                                                                   | CWU      | WUHAN AIR                      | 
    Wisman Aviation                                                                  | WSM      | WISMAN                         | 
    Wright Air Service                                                               | WRF      | WRIGHT FLYER                   | 
    WestJet Encore                                                                   | WEN      | ENCORE                         | 
    Wataniya Airways                                                                 | WAN      | WATANIYA                       | 
    XJC                                                                              | XJC      | EXCLUSIVE JET                  | 
    Xair                                                                             | XAE      | AURA                           | 
    Wizz Air Bulgaria                                                                | WVL      | WIZZBUL                        | 
    Xabre Aerolineas                                                                 | XAB      | AERO XABRE                     | 
    Xerox Corporation                                                                | XER      | XEROX                          | 
    Express Air Cargo                                                                | XRC      | TUNISIA CARGO                  | 
    Xinjiang Airlines                                                                | CXJ      | XINJIANG                       | 
    XL Airways France                                                                | SEU      | STARWAY                        | 
    XL Airways Germany                                                               | GXL      | STARDUST                       | 
    Xjet                                                                             | XJT      | XRAY                           | 
    Wyoming Airlines                                                                 | WYG      | WYOMING                        | 
    Xiamen Airlines                                                                  | CXA      | XIAMEN AIR                     | 
    XOJet                                                                            | XOJ      | EXOJET                         | 
    Xtra Airways                                                                     | CXP      | CASINO EXPRESS                 | 
    XP International                                                                 | XPS      | XP PARCEL                      | 
    Yak Air                                                                          | YRG      | YAKAIR GEORGIA                 | 
    Yak-Service                                                                      | AKY      | YAK-SERVICE                    | 
    Yakolev                                                                          | YAK      | YAK AVIA                       | Yak Design Bureau
    Wycombe Air Centre                                                               | WYC      | WYCOMBE                        | 
    Xstrata Nickel                                                                   | RAG      | RAGLAN                         | 
    Yakolev                                                                          | YAK      | YAK AVIA                       | Yak Design Bureau
    Yellow River Delta General Aviation                                              | DGA      | YELLOW RIVER                   | 
    Yamal Airlines                                                                   | LLM      | YAMAL                          | 
    Yangtze River Express                                                            | YZR      | YANGTZE RIVER                  | 
    Yangon Airways                                                                   | AYG      | AIR YANGON                     | 
    Yakutia Airlines                                                                 | SYL      | AIR YAKUTIA                    | 
    Yankee Lima Helicopteres                                                         | LYH      | HELIGUYANE                     | 
    Yeti Airlines                                                                    | NYT      | YETI AIRLINES                  | Domestic
    Yerevan-Avia                                                                     | ERV      | YEREVAN-AVIA                   | 
    Young Flying Service                                                             | YFS      | YOUNG AIR                      | 
    Yunnan Yingan Airlines                                                           | AYE      | AIR YING AN                    | 
    Yuzhnaya Air                                                                     | UGN      | PLUTON                         | 
    Yuzhmashavia                                                                     | UMK      | YUZMASH                        | 
    Zenith Aviation                                                                  | BZE      | ZENSTAR                        | 2014
    Yemenia                                                                          | IYE      | YEMENI                         | 
    Yas Air Kish                                                                     | MHD      | YAS AIR                        | 
    Yellow Wings Air Services                                                        | ELW      | YELLOW WINGS                   | 
    Zaab Air                                                                         | AZB      | ZAAB AIR                       | 
    Yana Airlines                                                                    | CYG      | VICAIR                         | 
    Zenmour Airlines                                                                 | EMR      | ZENMOUR                        | 
    Zanesville Aviation                                                              | CIT      | ZANE                           | 
    Zenith Air                                                                       | AZR      | ZENAIR                         | 
    Zimex Aviation                                                                   | IMX      | ZIMEX                          | 
    Zest Airways                                                                     | EZD      | ZEST AIRWAYS                   | 
    Zagros Air                                                                       | GZQ      | ZAGROS                         | 
    Zhejiang Loong Airlines                                                          | CDC      | HUALONG                        | 
    Zhetysu                                                                          | JTU      | ZHETYSU                        | 
    Zephyr Express                                                                   | RZR      | RECOVERY                       | 
    Zagros Airlines                                                                  | IZG      | ZAGROS                         | 
    Zhersu Avia                                                                      | RZU      | ZHERSU AVIA                    | 
    Zephyr Aviation                                                                  | MBG      | CHALGROVE                      | 
    Zorex                                                                            | ORZ      | ZOREX                          | 
    Zanair                                                                           | TAN      | ZANAIR                         | 
    Zil Air                                                                          | SYZ      | ZIL AIR                        | 
    Zairean Airlines                                                                 | ZAR      | ZAIREAN                        | 
    Zetavia                                                                          | ZAV      | ZETAVIA                        | 
    Zoom Airways                                                                     | ZAW      | ZED AIR                        | 
    Zambezi Airlines                                                                 | ZMA      | ZAMBEZI WINGS                  | 
    Zaire Aero Service                                                               | ZAI      | ZASAIR                         | 
    ZIPAIR Tokyo                                                                     | TZT      | ZIPPY                          | Subsidiary of Japan Airlines
    Zracno Pristaniste Mali Losinj                                                   | MLU      | MALI LOSINJ                    | 
    Zapolyarye Airline                                                               | PZY      | ZAPOLYARYE                     | 
    Zambian Airways                                                                  | MBN      | ZAMBIANA                       | 
    Zambia Skyways                                                                   | ZAK      | ZAMBIA SKIES                   | 
    Zorex                                                                            | ORZ      | ZOREX                          | 
    Zhongfei General Aviation                                                        | CFZ      | ZHONGFEI                       | 
    `;

    const lines = file.split(/\r?\n|\r/g);
    return lines;
}