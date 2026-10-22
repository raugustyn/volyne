const PRAGUE = [50.0755, 14.4378];
const INITIAL_ZOOM = 10;

const DISTRICT_COLORS = {
    DUBNO: '#c989ec',
    LUCK: '#b9f042',
    ROVNO: '#cbad75',
    'SENKĚVIČOVKA': '#eb6a6c',
    'ŠEPETOVKA': '#44b7ec',
    VERBA: '#dd2da5',
    'ZDOLBUNÓV': '#7ddab9',
    'ŽITOMÍR': '#4e50e1',
};
const DEFAULT_DISTRICT_COLOR = '#35c833';

const REGION_STYLE = {
    color: '#232323',
    weight: 1,
    fillColor: '#0000ff',
    fillOpacity: 0.12,
};

const DISTRICT_STYLE = {
    color: '#4b5563',
    weight: 1,
    fillColor: '#e8dd88',
    fillOpacity: 0.18,
};

const CHEB = [50.07936, 12.37035];
const FLIGHT_COLOR = '#1c4e89';
const PEOPLE_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2.2 13.2c.5-2.3 2.1-3.5 3.8-3.5s3.3 1.2 3.8 3.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="11.1" cy="5.7" r="1.45" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10.3 9.9c1-.2 2.1.3 2.7 1.2.4.6.7 1.3.8 2.1" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';
const FLIGHT_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.6 9.1V8.1L9.2 5.4V2.6a1.2 1.2 0 0 0-2.4 0v2.8L2.4 8.1v1l4.4-1.4v2.6l-1.2.9v1.1l2.4-.7 2.4.7V11.2l-1.2-.9V7.7l4.4 1.4Z" fill="currentColor"/></svg>';
const BOUNDARY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.8 11.8 5.2 4.2 12.2 3.2 13.4 8.6 8.2 13.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
const SIZE_SKIP = new Set(['id', 'osm_id', 'keyval', 'gps']);
const COLOR_SKIP = new Set([
    ...SIZE_SKIP,
    'admin_centre_node_id',
    'admin_centre_node_lat',
    'admin_centre_node_lng',
    'label_node_id',
    'label_node_lat',
    'label_node_lng',
]);
const CATEGORY_PALETTE = [
    '#c989ec', '#b9f042', '#cbad75', '#eb6a6c', '#44b7ec', '#dd2da5', '#7ddab9', '#4e50e1',
    '#35c833', '#ff9e17', '#5b8def', '#e85d4c', '#2a9d8f', '#9b5de5', '#f15bb5', '#00bbf9',
    '#f4a261', '#577590', '#90be6d', '#f94144',
];
const ATTRIBUTE_LABELS = { district: 'okres' };
const layerItems = [];
let colorLegendBox;
let urlReady = false;
const urlState = readUrlState();

const map = L.map('map').setView(
    urlState.view ? [urlState.view.y, urlState.view.x] : PRAGUE,
    urlState.view ? urlState.view.z : INITIAL_ZOOM,
);
map.on('moveend', writeUrl);

map.createPane('boundaries');
map.getPane('boundaries').style.zIndex = 350;

map.createPane('flows');
map.getPane('flows').style.zIndex = 500;

map.createPane('points');
const pointsPane = map.getPane('points');
pointsPane.style.zIndex = 450;
pointsPane.style.pointerEvents = 'none';

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const oblasti = L.geoJSON(null, {
    pane: 'boundaries',
    filter: (feature) => Number(feature.properties?.admin_level) === 4,
    style: (feature) => areaStyle(layerById('oblasti'), feature),
    onEachFeature: bindBoundaryPopup,
});

const raiony = L.geoJSON(null, {
    pane: 'boundaries',
    filter: (feature) => Number(feature.properties?.admin_level) === 6,
    style: (feature) => areaStyle(layerById('raiony'), feature),
    onEachFeature: bindBoundaryPopup,
});

const czechia = L.geoJSON(null, {
    pane: 'boundaries',
    style: (feature) => areaStyle(layerById('czechia'), feature),
    onEachFeature: bindBoundaryPopup,
});

const source = L.geoJSON(null, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
        pane: 'points',
        ...sourceStyle(feature),
    }),
    onEachFeature: bindSourcePopup,
});

const target = L.geoJSON(null, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
        pane: 'points',
        ...targetStyle(feature),
    }),
    onEachFeature: bindTargetPopup,
});

const flight = L.layerGroup();
let flightArc = [];
let flightPlane = null;
let flightFrame = 0;

oblasti.addTo(map);
czechia.addTo(map);
source.addTo(map);
target.addTo(map);
flight.addTo(map);
flight.on('add', startFlight);
flight.on('remove', stopFlight);

addLayersPanel([
    {
        title: 'Lidé',
        icon: PEOPLE_ICON,
        layers: [
            {
                id: 'source',
                name: 'source (Volyň)',
                layer: source,
                swatch: 'point',
                color: DEFAULT_DISTRICT_COLOR,
                labelField: 'name',
                sizeAttribute: 'osob',
                sizeChoices: [{ value: 'osob', label: 'osob' }],
                markerSize: 4,
                colorAttribute: 'district',
                colorChoices: [{ value: 'district', label: 'okres' }],
                labelColor: '#232323',
                labelSize: 0,
            },
            {
                id: 'target',
                name: 'target (ČSR)',
                layer: target,
                swatch: 'point',
                color: '#ff9e17',
                labelField: 'location',
                sizeAttribute: '',
                markerSize: 5,
                colorAttribute: '',
                labelColor: '#232323',
                labelSize: 0,
            },
        ],
    },
    {
        title: 'Přesuny',
        icon: FLIGHT_ICON,
        layers: [
            {
                id: 'flight',
                name: 'Lvov → Cheb',
                layer: flight,
                swatch: 'flow',
                color: FLIGHT_COLOR,
            },
        ],
    },
    {
        title: 'Hranice',
        icon: BOUNDARY_ICON,
        layers: [
            {
                id: 'oblasti',
                name: 'oblasti UA',
                layer: oblasti,
                swatch: 'area',
                color: REGION_STYLE.fillColor,
                labelField: 'name',
                colorAttribute: '',
                labelColor: '#232323',
                labelSize: 0,
            },
            {
                id: 'raiony',
                name: 'raiony',
                layer: raiony,
                swatch: 'area',
                color: DISTRICT_STYLE.fillColor,
                labelField: 'name',
                colorAttribute: '',
                labelColor: '#232323',
                labelSize: 0,
            },
            {
                id: 'czechia',
                name: 'hranice ČR',
                layer: czechia,
                swatch: 'area',
                color: REGION_STYLE.fillColor,
                labelField: 'name',
                colorAttribute: '',
                labelColor: '#232323',
                labelSize: 0,
            },
        ],
    },
]);

addColorLegend();

Promise.all([
    loadLayer('data/ukr_volyn.geojson', [oblasti, raiony]),
    loadLayer('data/czechia_boundaries.geojson', czechia),
    loadLayer('data/volyn_source.geojson', source),
    loadLayer('data/volyn_target.geojson', target),
]).then(() => {
    buildExampleFlight();
    layerItems.forEach((item) => {
        fillSizeSelect(item);
        fillColorSelect(item);
        applyLayerStyle(item);
        applyLabels(item);
    });
    if (!urlState.view) {
        fitToLayers();
    }
    urlReady = true;
    writeUrl();
}).catch((error) => {
    console.error('GeoJSON se nepodařilo načíst', error);
});

function buildExampleFlight() {
    const lviv = layerCenter(oblasti, 'Львівська область');
    if (!lviv) {
        return;
    }
    flightArc = curvedRoute(lviv, CHEB);
    const popup = '<strong>Ukázka přesunu</strong><div>Lvovská oblast → okres Cheb</div>';
    const halo = L.polyline(flightArc, {
        pane: 'flows',
        color: '#ffffff',
        weight: 7,
        opacity: 0.9,
        interactive: false,
    });
    const line = L.polyline(flightArc, {
        pane: 'flows',
        className: 'flight-arc',
        color: FLIGHT_COLOR,
        weight: 2.5,
        opacity: 1,
    });
    line.bindPopup(popup);
    const ends = [CHEB, lviv].map((latlng) => L.circleMarker(latlng, {
        pane: 'flows',
        radius: 5,
        color: '#ffffff',
        weight: 2,
        fillColor: FLIGHT_COLOR,
        fillOpacity: 1,
    }).bindPopup(popup));
    flightPlane = L.marker(lviv, {
        pane: 'flows',
        interactive: false,
        icon: L.divIcon({
            className: 'flight-plane',
            html: `<span class="flight-plane-rot">${FLIGHT_ICON}</span>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
        }),
    });
    const crest = flightArc.reduce((highest, point) => (point[0] > highest[0] ? point : highest), flightArc[0]);
    const label = L.marker(crest, {
        pane: 'flows',
        interactive: false,
        icon: L.divIcon({ className: 'flight-anchor', iconSize: [0, 0] }),
    });
    label.bindTooltip('Lvov → Cheb', {
        permanent: true,
        direction: 'top',
        offset: [0, -4],
        className: 'flight-label',
        opacity: 1,
        interactive: false,
    });
    flight.addLayer(halo);
    flight.addLayer(line);
    ends.forEach((end) => flight.addLayer(end));
    flight.addLayer(label);
    flight.addLayer(flightPlane);
    if (map.hasLayer(flight)) {
        startFlight();
    }
}

function layerCenter(layer, name) {
    let center = null;
    layer.eachLayer((path) => {
        if (path.feature?.properties?.name === name && typeof path.getBounds === 'function') {
            const point = path.getBounds().getCenter();
            center = [point.lat, point.lng];
        }
    });
    return center;
}

function curvedRoute(from, to) {
    const dLat = to[0] - from[0];
    const dLng = to[1] - from[1];
    const length = Math.hypot(dLat, dLng) || 1;
    let offLat = -dLng / length;
    let offLng = dLat / length;
    if (offLat < 0) {
        offLat *= -1;
        offLng *= -1;
    }
    const bend = length * 0.22;
    const control = [
        (from[0] + to[0]) / 2 + offLat * bend,
        (from[1] + to[1]) / 2 + offLng * bend,
    ];
    const steps = 72;
    const points = [];
    for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const u = 1 - t;
        points.push([
            u * u * from[0] + 2 * u * t * control[0] + t * t * to[0],
            u * u * from[1] + 2 * u * t * control[1] + t * t * to[1],
        ]);
    }
    return points;
}

function startFlight() {
    if (flightFrame || !flightPlane || flightArc.length < 2 || !map.hasLayer(flight)) {
        return;
    }
    const started = performance.now();
    const duration = 7000;
    const pause = 900;
    flightFrame = setInterval(() => {
        if (!map.hasLayer(flight) || !flightPlane) {
            stopFlight();
            return;
        }
        const elapsed = (performance.now() - started) % (duration + pause);
        const t = elapsed >= duration ? 1 : elapsed / duration;
        const along = t * (flightArc.length - 1);
        const index = Math.min(flightArc.length - 2, Math.floor(along));
        const local = along - index;
        const from = flightArc[index];
        const to = flightArc[index + 1];
        flightPlane.setLatLng([
            from[0] + (to[0] - from[0]) * local,
            from[1] + (to[1] - from[1]) * local,
        ]);
        const rot = flightPlane.getElement()?.querySelector('.flight-plane-rot');
        if (rot) {
            rot.style.transform = `rotate(${screenBearing(from, to) + 90}deg)`;
        }
    }, 40);
}

function stopFlight() {
    clearInterval(flightFrame);
    flightFrame = 0;
}

function screenBearing(from, to) {
    const start = map.latLngToLayerPoint(from);
    const end = map.latLngToLayerPoint(to);
    return Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
}

async function loadLayer(url, layers) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${url}: ${response.status}`);
    }
    const data = await response.json();
    (Array.isArray(layers) ? layers : [layers]).forEach((layer) => layer.addData(data));
}

function areaStyle(item, feature) {
    const base = item?.id === 'raiony' ? DISTRICT_STYLE : REGION_STYLE;
    const country = item?.id === 'czechia' && Number(feature?.properties?.admin_level) === 2;
    return {
        color: base.color,
        weight: base.weight,
        fillColor: fillColorFor(item, feature),
        fillOpacity: country ? 0 : base.fillOpacity,
    };
}

function sourceStyle(feature) {
    const item = layerById('source');
    return {
        radius: pointRadius(item, feature),
        color: '#232323',
        weight: 1,
        fillColor: fillColorFor(item, feature),
        fillOpacity: 0.9,
    };
}

function targetStyle(feature) {
    const item = layerById('target');
    return {
        radius: pointRadius(item, feature),
        color: '#232323',
        weight: 1,
        fillColor: fillColorFor(item, feature),
        fillOpacity: 0.9,
    };
}

function countPeople(keyval) {
    const ages = keyval && keyval['Podle pohlaví a věku'];
    if (!ages || typeof ages !== 'object') {
        return 0;
    }
    let total = 0;
    ['muži', 'ženy'].forEach((sex) => {
        const groups = ages[sex] || {};
        ['0-14 let', '14-55', '56 a starší'].forEach((group) => {
            total += Number.parseInt(groups[group], 10) || 0;
        });
    });
    return total;
}

function markerRadius(people) {
    if (!people) {
        return 4;
    }
    return Math.max(4, Math.min(18, 3 + Math.sqrt(people)));
}

function bindBoundaryPopup(feature, layer) {
    const props = feature.properties || {};
    const title = props.name || props.name_en || 'hranice';
    layer.bindPopup(
        `<strong>${escapeHtml(title)}</strong>`
        + (props.name_en ? `<div>${escapeHtml(props.name_en)}</div>` : '')
        + `<div>admin_level ${escapeHtml(props.admin_level)}</div>`,
    );
}

function bindSourcePopup(feature, layer) {
    const props = feature.properties || {};
    const people = countPeople(props.keyval);
    const rows = [
        ['název', props.name],
        ['okres', props.district],
        ['obec / celek', props.municipality],
        ['polsky', props.name_pl],
        ['ukrajinsky', props.name_ukr],
        ['poznámka', props.name_note],
        ['osob', people || null],
        ['GPS', props.gps],
    ];
    layer.bindPopup(popupTable(rows));
}

function bindTargetPopup(feature, layer) {
    const props = feature.properties || {};
    const rows = [
        ['lokalita', props.location],
        ['okres', props.district],
        ['kraj', props.province],
        ['původní okres', props.original_district],
        ['přesídlených', props.num_moved],
        ['nepřesídlených', props.num_unmoved],
        ['GPS', props.gps],
    ];
    layer.bindPopup(popupTable(rows));
}

function popupTable(rows) {
    const body = rows
        .filter(([, value]) => value !== null && value !== undefined && value !== '')
        .map(([key, value]) => (
            `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(formatValue(value))}</td></tr>`
        ))
        .join('');
    return `<table class="feature-popup">${body}</table>`;
}

function fitToLayers() {
    const bounds = L.latLngBounds([]);

    [source, target].forEach((layer) => {
        layer.eachLayer((marker) => {
            if (typeof marker.getLatLng !== 'function') {
                return;
            }
            const { lat, lng } = marker.getLatLng();
            if (lat === 0 && lng === 0) {
                return;
            }
            bounds.extend([lat, lng]);
        });
    });

    if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [28, 28] });
    }
}

function addLayersPanel(groups) {
    const panel = document.getElementById('layers');
    panel.innerHTML = '<h1 class="layers-title">Vrstvy</h1>';

    groups.forEach((group) => {
        const section = document.createElement('section');
        section.className = 'layer-group';

        const head = document.createElement('div');
        head.className = 'layer-group-head';

        const twist = document.createElement('button');
        twist.type = 'button';
        twist.className = 'layer-twist';
        twist.setAttribute('aria-expanded', 'true');
        twist.setAttribute('aria-label', `Sbalit ${group.title}`);
        twist.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.2 8 10.2 12 6.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

        const groupCheck = document.createElement('input');
        groupCheck.type = 'checkbox';
        groupCheck.className = 'layer-check';
        groupCheck.setAttribute('aria-label', group.title);

        const icon = document.createElement('span');
        icon.className = 'layer-icon';
        icon.innerHTML = group.icon;

        const title = document.createElement('span');
        title.className = 'layer-label';
        title.textContent = group.title;

        const list = document.createElement('ul');
        list.className = 'layer-items';
        const itemChecks = [];

        group.layers.forEach((item) => {
            applySavedLayer(item);
            layerItems.push(item);
            const li = document.createElement('li');
            li.className = 'layer-entry is-collapsed';

            const row = document.createElement('div');
            row.className = 'layer-row';

            const twist = document.createElement(item.swatch === 'flow' ? 'span' : 'button');
            twist.className = 'layer-twist';
            if (item.swatch !== 'flow') {
                twist.type = 'button';
                twist.setAttribute('aria-expanded', 'false');
                twist.setAttribute('aria-label', `Rozbalit ${item.name}`);
                twist.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.2 8 10.2 12 6.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                twist.addEventListener('click', () => {
                    const open = twist.getAttribute('aria-expanded') === 'true';
                    twist.setAttribute('aria-expanded', open ? 'false' : 'true');
                    twist.setAttribute('aria-label', `${open ? 'Rozbalit' : 'Sbalit'} ${item.name}`);
                    li.classList.toggle('is-collapsed', open);
                });
            } else {
                twist.setAttribute('aria-hidden', 'true');
            }

            const label = document.createElement('label');
            label.className = 'layer-name';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'layer-check';
            input.checked = map.hasLayer(item.layer);
            input.addEventListener('change', () => {
                setLayerVisible(item.layer, input.checked);
                syncGroupCheck(groupCheck, itemChecks);
            });

            const swatch = document.createElement('span');
            swatch.className = `layer-swatch layer-swatch-${item.swatch}`;
            item.swatchEl = swatch;
            paintSwatch(item);

            const name = document.createElement('span');
            name.className = 'layer-label';
            name.textContent = item.name;

            label.append(input, swatch, name);
            row.append(twist, label);
            li.append(row);

            if (item.swatch !== 'flow') {
                const form = document.createElement('div');
                form.className = 'layer-symbology';
                if (item.swatch === 'point') {
                    form.append(markerSizeField(item));
                }
                form.append(fillColorField(item));
                form.append(labelField(item));
                li.append(form);
            }

            list.append(li);
            itemChecks.push(input);
        });

        groupCheck.addEventListener('change', () => {
            const visible = groupCheck.checked;
            group.layers.forEach((item, index) => {
                itemChecks[index].checked = visible;
                setLayerVisible(item.layer, visible);
            });
            syncGroupCheck(groupCheck, itemChecks);
        });

        twist.addEventListener('click', () => {
            const open = twist.getAttribute('aria-expanded') === 'true';
            twist.setAttribute('aria-expanded', open ? 'false' : 'true');
            twist.setAttribute('aria-label', `${open ? 'Rozbalit' : 'Sbalit'} ${group.title}`);
            section.classList.toggle('is-collapsed', open);
        });

        head.append(twist, groupCheck, icon, title);
        section.append(head, list);
        panel.append(section);
        syncGroupCheck(groupCheck, itemChecks);
    });

    layerItems.forEach((item) => {
        if (item.sizeSelect) {
            fillSizeSelect(item);
            item.sizeSelect.dataset.ready = '1';
        }
        if (item.colorSelect) {
            fillColorSelect(item);
            item.colorSelect.dataset.ready = '1';
        }
    });
    updateColorLegend();
}

function layerById(id) {
    return layerItems.find((item) => item.id === id);
}

function fillColorField(item) {
    const field = document.createElement('label');
    field.className = 'sym-field';
    const caption = document.createElement('span');
    caption.className = 'sym-caption';
    caption.textContent = 'Barva výplně';
    const select = document.createElement('select');
    select.addEventListener('change', () => {
        if (select.dataset.ready !== '1') {
            return;
        }
        item.colorAttribute = select.value;
        applyLayerStyle(item);
    });
    item.colorSelect = select;
    fillColorSelect(item);
    field.append(caption, select);
    return field;
}

function markerSizeField(item) {
    const field = document.createElement('div');
    field.className = 'sym-field';
    const caption = document.createElement('span');
    caption.className = 'sym-caption';
    caption.textContent = 'Velikost značky';

    const row = document.createElement('div');
    row.className = 'sym-row';

    const select = document.createElement('select');
    select.setAttribute('aria-label', `Atribut velikosti ${item.name}`);
    select.addEventListener('change', () => {
        if (select.dataset.ready !== '1') {
            return;
        }
        item.sizeAttribute = select.value;
        applyLayerStyle(item);
    });
    item.sizeSelect = select;
    fillSizeSelect(item);

    const size = document.createElement('input');
    size.type = 'number';
    size.min = '1';
    size.max = '40';
    size.step = '1';
    size.value = String(item.markerSize);
    size.setAttribute('aria-label', `Velikost značky ${item.name}`);
    size.addEventListener('input', () => {
        item.markerSize = markerSizeValue(size.value, item.markerSize);
        applyLayerStyle(item);
    });
    size.addEventListener('change', () => {
        item.markerSize = markerSizeValue(size.value, item.markerSize);
        size.value = String(item.markerSize);
        applyLayerStyle(item);
    });

    const unit = document.createElement('span');
    unit.className = 'sym-unit';
    unit.textContent = 'px';

    row.append(select, size, unit);
    field.append(caption, row);
    return field;
}

function markerSizeValue(raw, fallback) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        return fallback;
    }
    return Math.max(1, Math.min(40, value));
}

function labelField(item) {
    const field = document.createElement('div');
    field.className = 'sym-field';
    const caption = document.createElement('span');
    caption.className = 'sym-caption';
    caption.textContent = 'Popis';

    const row = document.createElement('div');
    row.className = 'sym-row';

    const color = document.createElement('input');
    color.type = 'color';
    color.value = item.labelColor;
    color.setAttribute('aria-label', `Barva popisu ${item.name}`);
    color.addEventListener('input', () => {
        item.labelColor = color.value;
        applyLabels(item);
    });

    const size = document.createElement('input');
    size.type = 'number';
    size.min = '0';
    size.max = '32';
    size.step = '1';
    size.placeholder = '0';
    size.value = item.labelSize ? String(item.labelSize) : '';
    size.setAttribute('aria-label', `Velikost popisu ${item.name}`);
    size.addEventListener('input', () => {
        item.labelSize = Number(size.value) || 0;
        applyLabels(item);
    });

    const unit = document.createElement('span');
    unit.className = 'sym-unit';
    unit.textContent = 'px';

    row.append(color, size, unit);
    field.append(caption, row);
    return field;
}

function fillSizeSelect(item) {
    if (!item.sizeSelect) {
        return;
    }
    const labels = new Map((item.sizeChoices || []).map((choice) => [choice.value, choice.label]));
    item.layer.eachLayer((layer) => {
        Object.entries(layer.feature?.properties || {}).forEach(([key, value]) => {
            if (SIZE_SKIP.has(key) || labels.has(key)) {
                return;
            }
            if (numericValue(value) !== null) {
                labels.set(key, key);
            }
        });
    });
    const current = item.sizeAttribute || '';
    const loaded = item.layer.getLayers().length > 0;
    if (current && !labels.has(current) && !loaded) {
        labels.set(current, current);
    }
    const chosen = current === '' || labels.has(current) ? current : '';
    item.sizeSelect.dataset.filling = '1';
    item.sizeSelect.replaceChildren();
    const fixed = document.createElement('option');
    fixed.value = '';
    fixed.textContent = 'stejná';
    fixed.selected = chosen === '';
    item.sizeSelect.append(fixed);
    labels.forEach((label, value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        option.selected = value === chosen;
        item.sizeSelect.append(option);
    });
    item.sizeSelect.value = chosen;
    item.sizeAttribute = chosen;
    delete item.sizeSelect.dataset.filling;
}

function fillColorSelect(item) {
    if (!item.colorSelect) {
        return;
    }
    const labels = new Map((item.colorChoices || []).map((choice) => [choice.value, choice.label]));
    item.layer.eachLayer((layer) => {
        Object.entries(layer.feature?.properties || {}).forEach(([key, value]) => {
            if (COLOR_SKIP.has(key) || labels.has(key) || value === null || typeof value === 'object') {
                return;
            }
            labels.set(key, ATTRIBUTE_LABELS[key] || key);
        });
    });
    const current = item.colorAttribute || '';
    const loaded = item.layer.getLayers().length > 0;
    if (current && !labels.has(current) && !loaded) {
        labels.set(current, ATTRIBUTE_LABELS[current] || current);
    }
    const chosen = current === '' || labels.has(current) ? current : '';
    item.colorSelect.dataset.filling = '1';
    item.colorSelect.replaceChildren();
    const fixed = document.createElement('option');
    fixed.value = '';
    fixed.textContent = 'jedna barva';
    fixed.selected = chosen === '';
    item.colorSelect.append(fixed);
    labels.forEach((label, value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        option.selected = value === chosen;
        item.colorSelect.append(option);
    });
    item.colorSelect.value = chosen;
    item.colorAttribute = chosen;
    delete item.colorSelect.dataset.filling;
}

function applyLayerStyle(item) {
    if (item.swatch === 'flow') {
        paintSwatch(item);
        writeUrl();
        return;
    }
    updateSizeStats(item);
    updateColorCategories(item);
    item.layer.eachLayer((layer) => {
        layer.setStyle(featureStyle(item, layer.feature));
    });
    paintSwatch(item);
    updateColorLegend();
    writeUrl();
}

function featureStyle(item, feature) {
    if (item.id === 'source') {
        return sourceStyle(feature);
    }
    if (item.id === 'target') {
        return targetStyle(feature);
    }
    return areaStyle(item, feature);
}

function updateColorCategories(item) {
    if (!item.colorAttribute) {
        item.colorCategories = [];
        return;
    }
    const values = new Set();
    item.layer.eachLayer((layer) => {
        values.add(categoryKey(layer.feature, item.colorAttribute));
    });
    const sorted = [...values].sort((a, b) => a.localeCompare(b, 'cs'));
    if (item.colorAttribute === 'district') {
        const known = Object.keys(DISTRICT_COLORS).filter((key) => values.has(key));
        const rest = sorted.filter((key) => !DISTRICT_COLORS[key]);
        item.colorCategories = [...known, ...rest];
        return;
    }
    item.colorCategories = sorted;
}

function categoryKey(feature, attribute) {
    const raw = feature?.properties?.[attribute];
    if (raw === null || raw === undefined || raw === '') {
        return '';
    }
    return String(raw);
}

function categoryColor(item, key) {
    if (item.colorAttribute === 'district' && DISTRICT_COLORS[key]) {
        return DISTRICT_COLORS[key];
    }
    const index = (item.colorCategories || []).indexOf(key);
    if (index < 0) {
        return key ? DEFAULT_DISTRICT_COLOR : item.color;
    }
    return CATEGORY_PALETTE[index % CATEGORY_PALETTE.length];
}

function fillColorFor(item, feature) {
    if (!item) {
        return '#0000ff';
    }
    if (!item.colorAttribute) {
        return item.color;
    }
    return categoryColor(item, categoryKey(feature, item.colorAttribute));
}

function paintSwatch(item) {
    if (!item.swatchEl) {
        return;
    }
    if (item.swatch === 'flow') {
        item.swatchEl.style.background = item.color;
        return;
    }
    const mix = item.swatch === 'area' ? 65 : 100;
    if (!item.colorAttribute) {
        item.swatchEl.style.background = `color-mix(in srgb, ${item.color} ${mix}%, white)`;
        return;
    }
    const colors = (item.colorCategories?.length
        ? item.colorCategories
        : Object.keys(item.colorAttribute === 'district' ? DISTRICT_COLORS : {}))
        .slice(0, 8)
        .map((key) => categoryColor(item, key));
    item.swatchEl.style.background = colors.length > 1
        ? `linear-gradient(90deg, ${colors.join(', ')})`
        : `color-mix(in srgb, ${colors[0] || item.color} ${mix}%, white)`;
}

function updateSizeStats(item) {
    if (!item.sizeAttribute || item.sizeAttribute === 'osob') {
        item.sizeStats = null;
        return;
    }
    let min = Infinity;
    let max = -Infinity;
    item.layer.eachLayer((layer) => {
        const value = numericValue(layer.feature?.properties?.[item.sizeAttribute]);
        if (value === null) {
            return;
        }
        min = Math.min(min, value);
        max = Math.max(max, value);
    });
    item.sizeStats = min === Infinity ? null : { min, max };
}

function pointRadius(item, feature) {
    const size = markerSizeValue(item?.markerSize, 5);
    if (!item?.sizeAttribute) {
        return size;
    }
    if (item.sizeAttribute === 'osob') {
        return size * (markerRadius(countPeople(feature.properties?.keyval)) / 4);
    }
    const value = numericValue(feature.properties?.[item.sizeAttribute]);
    const stats = item.sizeStats;
    if (value === null || !stats || stats.max <= stats.min) {
        return size;
    }
    const share = (value - stats.min) / (stats.max - stats.min);
    return size * (1 + share * 3);
}

function numericValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const number = Number(value.trim().replace(',', '.'));
        if (Number.isFinite(number)) {
            return number;
        }
    }
    return null;
}

function labelText(item, feature) {
    const raw = feature?.properties?.[item.labelField];
    if (raw === null || raw === undefined || raw === '') {
        return '';
    }
    const text = String(raw);
    if (item.id === 'raiony') {
        return text.replace(/\s+район\s*$/iu, '').trim();
    }
    if (item.id === 'oblasti') {
        return text.replace(/\s+область\s*$/iu, '').trim();
    }
    if (item.id === 'czechia') {
        return text.replace(/^\s*kraj\s+/iu, '').replace(/\s+kraj\s*$/iu, '').trim();
    }
    return text;
}

function applyLabels(item) {
    if (item.swatch === 'flow') {
        return;
    }
    const size = Math.max(0, Math.min(32, Number(item.labelSize) || 0));
    const color = /^#[0-9a-fA-F]{6}$/.test(item.labelColor) ? item.labelColor : '#232323';
    let style = document.getElementById(`label-style-${item.id}`);
    if (!style) {
        style = document.createElement('style');
        style.id = `label-style-${item.id}`;
        document.head.append(style);
    }
    style.textContent = `.map-label-${item.id}{color:${color};font-size:${size}px;}`;
    item.layer.eachLayer((layer) => {
        if (layer.getTooltip()) {
            layer.unbindTooltip();
        }
        if (!size) {
            return;
        }
        const text = labelText(item, layer.feature);
        if (!text) {
            return;
        }
        layer.bindTooltip(escapeHtml(text), {
            permanent: true,
            direction: item.swatch === 'point' ? 'right' : 'center',
            offset: item.swatch === 'point' ? [8, 0] : [0, 0],
            className: `map-label map-label-${item.id}`,
            opacity: 1,
            interactive: false,
        });
    });
    writeUrl();
}

function setLayerVisible(layer, visible) {
    if (visible) {
        if (!map.hasLayer(layer)) {
            layer.addTo(map);
        }
    } else if (map.hasLayer(layer)) {
        map.removeLayer(layer);
    }
    writeUrl();
}

function readUrlState() {
    const params = new URLSearchParams(location.search);
    const z = readCoord(params, 'z');
    const x = readCoord(params, 'x');
    const y = readCoord(params, 'y');
    const view = z !== null && x !== null && y !== null
        && z >= 0 && z <= 19 && Math.abs(y) <= 90 && Math.abs(x) <= 180
        ? { z, x, y }
        : null;
    const layers = {};
    ['source', 'target', 'oblasti', 'raiony', 'czechia', 'flight'].forEach((id) => {
        const raw = params.get(id);
        if (raw === null) {
            return;
        }
        const [visible, sizeAttribute, markerSize, colorAttribute, labelColor, labelSize] = raw.split(',');
        layers[id] = {
            visible: visible === '1',
            sizeAttribute: sizeAttribute || '',
            markerSize: Number(markerSize),
            colorAttribute: colorAttribute || '',
            labelColor: /^[0-9a-fA-F]{6}$/.test(labelColor || '') ? `#${labelColor}` : '',
            labelSize: Number(labelSize),
        };
    });
    return { view, layers };
}

function readCoord(params, key) {
    const raw = params.get(key);
    if (raw === null || raw.trim() === '') {
        return null;
    }
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}

function applySavedLayer(item) {
    const saved = urlState.layers[item.id];
    if (!saved) {
        return;
    }
    setLayerVisible(item.layer, saved.visible);
    if (item.swatch === 'point') {
        item.sizeAttribute = saved.sizeAttribute;
        if (Number.isFinite(saved.markerSize) && saved.markerSize > 0) {
            item.markerSize = markerSizeValue(saved.markerSize, item.markerSize);
        }
    }
    item.colorAttribute = saved.colorAttribute;
    if (saved.labelColor) {
        item.labelColor = saved.labelColor;
    }
    if (Number.isFinite(saved.labelSize)) {
        item.labelSize = Math.max(0, Math.min(32, saved.labelSize));
    }
}

function writeUrl() {
    if (!urlReady) {
        return;
    }
    const params = new URLSearchParams(location.search);
    const center = map.getCenter();
    params.set('z', String(Math.round(map.getZoom() * 100) / 100));
    params.set('y', center.lat.toFixed(5));
    params.set('x', center.lng.toFixed(5));
    layerItems.forEach((item) => {
        const color = String(item.labelColor || '').replace('#', '');
        const visible = map.hasLayer(item.layer) ? '1' : '0';
        const parts = item.swatch === 'point'
            ? [visible, item.sizeAttribute || '', item.markerSize, item.colorAttribute || '', color, item.labelSize || 0]
            : [visible, '', '', item.colorAttribute || '', color, item.labelSize || 0];
        params.set(item.id, parts.join(','));
    });
    const query = params.toString();
    history.replaceState(null, '', `${location.pathname}?${query}${location.hash}`);
}

function syncGroupCheck(groupCheck, itemChecks) {
    const on = itemChecks.filter((input) => input.checked).length;
    groupCheck.checked = on === itemChecks.length;
    groupCheck.indeterminate = on > 0 && on < itemChecks.length;
}

function addColorLegend() {
    const legend = L.control({ position: 'bottomleft' });
    legend.onAdd = () => {
        colorLegendBox = L.DomUtil.create('div', 'map-legend');
        updateColorLegend();
        return colorLegendBox;
    };
    legend.addTo(map);
}

function updateColorLegend() {
    if (!colorLegendBox) {
        return;
    }
    const sections = layerItems.filter((item) => item.colorAttribute);
    if (!sections.length) {
        colorLegendBox.style.display = 'none';
        colorLegendBox.innerHTML = '';
        return;
    }
    colorLegendBox.style.display = '';
    colorLegendBox.innerHTML = sections.map((item) => {
        const rows = (item.colorCategories?.length
            ? item.colorCategories
            : (item.colorAttribute === 'district' ? Object.keys(DISTRICT_COLORS) : []))
            .map((key) => {
                const swatchClass = item.swatch === 'area' ? 'map-legend-swatch is-area' : 'map-legend-swatch';
                return `<div><span class="${swatchClass}" style="background:${categoryColor(item, key)}"></span>${escapeHtml(categoryLegendLabel(item, key))}</div>`;
            }).join('');
        const title = `${item.name} podle ${ATTRIBUTE_LABELS[item.colorAttribute] || item.colorAttribute}`;
        return `<div class="map-legend-block"><div class="map-legend-title">${escapeHtml(title)}</div>${rows}</div>`;
    }).join('');
}

function categoryLegendLabel(item, key) {
    if (key === '') {
        return 'prázdné';
    }
    if (item.colorAttribute === item.labelField) {
        return labelText(item, { properties: { [item.labelField]: key } }) || key;
    }
    return key;
}

function formatValue(value) {
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}
