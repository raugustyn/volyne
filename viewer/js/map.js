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

const map = L.map('map').setView(PRAGUE, INITIAL_ZOOM);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const oblasti = L.geoJSON(null, {
    filter: (feature) => Number(feature.properties?.admin_level) === 4,
    style: {
        color: '#232323',
        weight: 1,
        fillColor: '#0000ff',
        fillOpacity: 0.12,
    },
    onEachFeature: bindBoundaryPopup,
});

const raiony = L.geoJSON(null, {
    filter: (feature) => Number(feature.properties?.admin_level) === 6,
    style: {
        color: '#4b5563',
        weight: 1,
        fillColor: '#e8dd88',
        fillOpacity: 0.18,
    },
    onEachFeature: bindBoundaryPopup,
});

const source2 = L.geoJSON(null, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, source2Style(feature)),
    onEachFeature: bindSourcePopup,
});

const target = L.geoJSON(null, {
    pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
        radius: 5,
        color: '#232323',
        weight: 1,
        fillColor: '#ff9e17',
        fillOpacity: 0.9,
    }),
    onEachFeature: bindTargetPopup,
});

oblasti.addTo(map);
source2.addTo(map);
target.addTo(map);

L.control.layers(null, {
    'oblasti UA': oblasti,
    raiony,
    'source2 (Volyň)': source2,
    'target (ČSR)': target,
}, { collapsed: false }).addTo(map);

addDistrictLegend();

Promise.all([
    loadLayer('data/ukr_volyn.geojson', [oblasti, raiony]),
    loadLayer('data/volyn_source2.geojson', source2),
    loadLayer('data/volyn_target.geojson', target),
]).then(fitToLayers).catch((error) => {
    console.error('GeoJSON se nepodařilo načíst', error);
});

async function loadLayer(url, layers) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${url}: ${response.status}`);
    }
    const data = await response.json();
    (Array.isArray(layers) ? layers : [layers]).forEach((layer) => layer.addData(data));
}

function source2Style(feature) {
    const district = feature.properties?.district;
    const color = DISTRICT_COLORS[district] || DEFAULT_DISTRICT_COLOR;
    const people = countPeople(feature.properties?.keyval);
    return {
        radius: markerRadius(people),
        color: '#232323',
        weight: 1,
        fillColor: color,
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

    [source2, target].forEach((layer) => {
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

function addDistrictLegend() {
    const legend = L.control({ position: 'bottomleft' });
    legend.onAdd = () => {
        const box = L.DomUtil.create('div', 'map-legend');
        box.innerHTML = '<div class="map-legend-title">source2 podle okresu</div>'
            + Object.entries(DISTRICT_COLORS).map(([name, color]) => (
                `<div><span class="map-legend-swatch" style="background:${color}"></span>${escapeHtml(name)}</div>`
            )).join('');
        return box;
    };
    legend.addTo(map);
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
