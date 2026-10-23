const cityInput = document.getElementById('cityInput');
let map, marker;

cityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { 
        getWeatherByCity();
        cityInput.blur();
    }
});

cityInput.addEventListener('focus', () => cityInput.select());

async function getWeatherByCity() {
    const city = cityInput.value.trim();
    if (!city) {
        alert('Lūdzu ievadiet pilsētu.');
        return;
    }
    fetchWeather(`/api/weather?city=${encodeURIComponent(city)}`, true);
}

function getLocationWeather() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            fetchWeather(`/api/weather?lat=${lat}&lon=${lon}`);
        },
        () => {
            document.getElementById('loadingMessage').innerText = 'Piekļuve atrašanās vietai liegta. Lūdzu, ievadiet pilsētu.';
        }
    );
}

function updateBackgroundByID(weatherData) {
    const id = weatherData.weather[0].id;
    const body = document.body;
    body.className = '';

    if (id >= 200 && id <= 232) body.classList.add('bg-thunder');
    else if (id >= 300 && id <= 531) body.classList.add('bg-rain');
    else if (id >= 600 && id <= 622) body.classList.add('bg-snow');
    else if (id === 800) body.classList.add('bg-clear');
    else if (id === 801 || id === 802) body.classList.add('bg-partly');
    else if (id === 803 || id === 804) body.classList.add('bg-clouds');
    else body.classList.add('bg-default');
}

function shifted(unix, tz) {
    return new Date((unix + tz) * 1000);
}
function hhmm(unix, tz) {
    return shifted(unix, tz).toISOString().slice(11, 16);
}
function dayKey(unix, tz) {
    return shifted(unix, tz).toISOString().slice(0, 10);
}
function weekday(key) {
    return new Date(key + 'T12:00:00Z')
        .toLocaleDateString('lv-LV', { weekday: 'short', timeZone: 'UTC' });
}
function iconUrl(icon) {
    return `https://openweathermap.org/img/wn/${icon}@2x.png`;
}

async function loadForecast(coord, currentTemp) {
    const maxEl = document.getElementById('maxTemperature');
    const minEl = document.getElementById('minTemperature');
    const hourlyEl = document.getElementById('hourly');
    const dailyEl = document.getElementById('daily');

    try {
        const res = await fetch(`/api/forecast?lat=${coord.lat}&lon=${coord.lon}`);
        const forecast = await res.json();
        if (!res.ok) throw new Error(forecast.error);

        const tz = forecast.city.timezone;
        const list = forecast.list;

        const next24 = list.slice(0, 8);
        const temps24 = [currentTemp, ...next24.map(i => i.main.temp)];
        maxEl.textContent = Math.round(Math.max(...temps24));
        minEl.textContent = Math.round(Math.min(...temps24));

        hourlyEl.innerHTML = next24.map(i => `
            <div class="hour">
                <span>${hhmm(i.dt, tz)}</span>
                <img src="${iconUrl(i.weather[0].icon)}" alt="">
                <strong>${Math.round(i.main.temp)}°</strong>
                <small>💧${Math.round(i.pop * 100)}%</small>
            </div>`).join('');

        const days = new Map();
        for (const item of list) {
            const key = dayKey(item.dt, tz);
            if (!days.has(key)) days.set(key, []);
            days.get(key).push(item);
        }

        const todayKey = dayKey(Math.floor(Date.now() / 1000), tz);

        dailyEl.innerHTML = [...days.entries()].slice(0, 5).map(([key, items]) => {
            const t = items.map(i => i.main.temp);
            const rain = Math.max(...items.map(i => i.pop));

            const noon = items.reduce((best, i) => {
                const h = Math.abs(shifted(i.dt, tz).getUTCHours() - 12);
                const b = Math.abs(shifted(best.dt, tz).getUTCHours() - 12);
                return h < b ? i : best;
            });
            const icon = noon.weather[0].icon.replace('n', 'd');

            return `
                <div class="day">
                    <span class="dayName">${key === todayKey ? 'Šodien' : weekday(key)}</span>
                    <img src="${iconUrl(icon)}" alt="">
                    <small class="dayRain">💧${Math.round(rain * 100)}%</small>
                    <span class="dayTemps"><strong>${Math.round(Math.max(...t))}°</strong> / ${Math.round(Math.min(...t))}°</span>
                </div>`;
        }).join('');
    } catch (error) {
        console.error(error);
        maxEl.textContent = '--';
        minEl.textContent = '--';
        hourlyEl.innerHTML = '';
        dailyEl.innerHTML = '';
    }
}

function initMap(coord) {
    map = L.map('map').setView([coord.lat, coord.lon], 10);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const owm = (layer, cls, opacity = 1) => L.tileLayer(`/api/tiles/${layer}/{z}/{x}/{y}.png`, { opacity, className: cls });

    const overlays = {
        'Temperatūra': owm('temp_new', 'owm-soft', 1),
        'Nokrišņi': owm('precipitation_new', 'owm-strong', 1),
        'Mākoņi': owm('clouds_new', 'owm-medium', 0.725),
        'Vējš': owm('wind_new', 'owm-soft',   1),
        'Spiediens': owm('pressure_new', 'owm-soft',   0.7)
    };

    overlays['Nokrišņi'].addTo(map);
    L.control.layers(null, overlays).addTo(map);

    map.on('overlayadd', (e) => {
        Object.values(overlays).forEach(l => {
            if (l !== e.layer) map.removeLayer(l);
        });
    });

    marker = L.marker([coord.lat, coord.lon]).addTo(map);
}

function updateMap(coord) {
    if (!map) {
        initMap(coord);
    } else {
        map.invalidateSize();
        map.setView([coord.lat, coord.lon], 10);
        marker.setLatLng([coord.lat, coord.lon]);
    }
}

async function fetchWeather(url) {
    const loadingMsg = document.getElementById('loadingMessage');
    const weatherCard = document.getElementById('weatherCard');
    
    loadingMsg.innerText = 'Iegūst laikapstākļus...';
    weatherCard.style.display = 'none';

    try {
        const response = await fetch(url);
        const data = await response.json();

    if (response.ok) {
        cityInput.value = `${data.name}, ${data.sys.country}`;
        document.getElementById('tempValue').textContent = Math.round(data.main.temp);
        document.getElementById('weatherDescription').textContent = data.weather[0].description;
        document.getElementById('feelsLike').textContent = Math.round(data.main.feels_like);
        document.getElementById('humidity').textContent = data.main.humidity;
        document.getElementById('wind').textContent = data.wind.speed;
        document.getElementById('pressure').textContent = data.main.pressure;
        document.getElementById('visibility').textContent = (data.visibility / 1000).toFixed(1);
        document.getElementById('weatherIcon').src = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;

        updateBackgroundByID(data);
        loadForecast(data.coord, data.main.temp);

        loadingMsg.innerText = '';
        weatherCard.style.display = 'block';
        updateMap(data.coord);
    } else {
            loadingMsg.innerText = `Error: ${data.error}`;
        }
    } catch (error) {
        console.error(error);
        loadingMsg.innerText = 'Neizdevās iegūst laikapstākļu datus.';
    }
}

window.addEventListener('DOMContentLoaded', () => {
    getLocationWeather();
});