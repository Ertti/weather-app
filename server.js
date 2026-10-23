require('dotenv').config();

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

async function relay(url, res) {
    try {
        const response = await fetch(url);
        const data = await response.json();

        if (response.ok) {
            res.json(data);
        } else {
            res.status(response.status).json({ error: data.message });
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}

const TILE_LAYERS = new Set([
    'clouds_new', 'precipitation_new', 'pressure_new', 'wind_new', 'temp_new'
]);

app.get('/api/tiles/:layer/:z/:x/:y.png', async (req, res) => {
    const { layer, z, x, y } = req.params;
    const apiKey = process.env.API_KEY;

    if (!apiKey) return res.status(500).end();
    if (!TILE_LAYERS.has(layer) || ![z, x, y].every(v => /^\d+$/.test(v))) {
        return res.status(400).end();
    }

    try {
        const response = await fetch(
            `https://tile.openweathermap.org/map/${layer}/${z}/${x}/${y}.png?appid=${apiKey}`
        );
        if (!response.ok) return res.status(response.status).end();

        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=600');
        res.send(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
        console.error('Error fetching tile:', error);
        res.status(500).end();
    }
});

app.get('/api/weather', (req, res) => {
    const { city, lat, lon } = req.query;
    const apiKey = process.env.API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Server is missing API_KEY.' });
    }

    const params = new URLSearchParams({ appid: apiKey, units: 'metric', lang: 'la' });

    if (city) {
        params.set('q', city);
    } else if (lat && lon) {
        params.set('lat', lat);
        params.set('lon', lon);
    } else {
        return res.status(400).json({ error: 'Please provide a city name or coordinates.' });
    }

    relay(`https://api.openweathermap.org/data/2.5/weather?${params}`, res);
});

app.get('/api/forecast', (req, res) => {
    const { lat, lon } = req.query;
    const apiKey = process.env.API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Server is missing API_KEY.' });
    }
    if (!lat || !lon) {
        return res.status(400).json({ error: 'Please provide coordinates.' });
    }

    const params = new URLSearchParams({ appid: apiKey, units: 'metric', lat, lon });
    relay(`https://api.openweathermap.org/data/2.5/forecast?${params}`, res);
});

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});