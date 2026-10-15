const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const UA = 'NichoFinder/1.0 (https://github.com/SEU-USUARIO/nicho-finder)';
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

// Nicho (em português) -> filtros de tags do OpenStreetMap
const NICHES = [
  [['barbearia', 'barbeiro', 'barber'], ['nwr["shop"="hairdresser"]["male"="yes"]', 'nwr["shop"="barber"]', 'nwr["shop"="hairdresser"]["name"~"barb",i]']],
  [['salao', 'cabeleireiro', 'cabeleireira', 'salao de beleza'], ['nwr["shop"="hairdresser"]', 'nwr["shop"="beauty"]']],
  [['manicure', 'esmalteria', 'estetica', 'clinica de estetica'], ['nwr["shop"="beauty"]']],
  [['mercado', 'supermercado', 'mercadinho'], ['nwr["shop"="supermarket"]', 'nwr["shop"="convenience"]']],
  [['padaria', 'panificadora'], ['nwr["shop"="bakery"]']],
  [['acougue', 'carnes'], ['nwr["shop"="butcher"]']],
  [['farmacia', 'drogaria'], ['nwr["amenity"="pharmacy"]']],
  [['restaurante'], ['nwr["amenity"="restaurant"]']],
  [['lanchonete', 'hamburgueria', 'fast food'], ['nwr["amenity"="fast_food"]']],
  [['cafe', 'cafeteria'], ['nwr["amenity"="cafe"]']],
  [['bar', 'boteco', 'pub'], ['nwr["amenity"="bar"]', 'nwr["amenity"="pub"]']],
  [['academia', 'crossfit', 'musculacao'], ['nwr["leisure"="fitness_centre"]']],
  [['pet shop', 'petshop', 'pet'], ['nwr["shop"="pet"]']],
  [['veterinario', 'veterinaria', 'clinica veterinaria'], ['nwr["amenity"="veterinary"]']],
  [['oficina', 'mecanica', 'auto center'], ['nwr["shop"="car_repair"]']],
  [['auto pecas', 'pecas'], ['nwr["shop"="car_parts"]']],
  [['loja de roupas', 'roupas', 'moda', 'boutique'], ['nwr["shop"="clothes"]']],
  [['calcados', 'sapataria'], ['nwr["shop"="shoes"]']],
  [['dentista', 'odontologia', 'clinica odontologica'], ['nwr["amenity"="dentist"]']],
  [['clinica', 'medico', 'consultorio'], ['nwr["amenity"="clinic"]', 'nwr["amenity"="doctors"]']],
  [['optica', 'oculos'], ['nwr["shop"="optician"]']],
  [['floricultura', 'flores'], ['nwr["shop"="florist"]']],
  [['papelaria'], ['nwr["shop"="stationery"]']],
  [['livraria'], ['nwr["shop"="books"]']],
  [['material de construcao', 'construcao', 'ferragens'], ['nwr["shop"="hardware"]', 'nwr["shop"="doityourself"]']],
  [['eletronicos', 'informatica', 'celular', 'assistencia tecnica'], ['nwr["shop"="electronics"]', 'nwr["shop"="mobile_phone"]', 'nwr["shop"="computer"]']],
  [['lavanderia'], ['nwr["shop"="laundry"]']],
  [['hotel', 'pousada'], ['nwr["tourism"="hotel"]', 'nwr["tourism"="guest_house"]']],
  [['escola', 'curso'], ['nwr["amenity"="school"]', 'nwr["amenity"="language_school"]']],
  [['posto', 'posto de gasolina'], ['nwr["amenity"="fuel"]']],
  [['tatuagem', 'tatuador', 'estudio de tatuagem'], ['nwr["shop"="tattoo"]']],
  [['advogado', 'advocacia', 'escritorio'], ['nwr["office"="lawyer"]']],
  [['contabilidade', 'contador'], ['nwr["office"="accountant"]']],
  [['imobiliaria'], ['nwr["office"="estate_agent"]']]
];

const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function filtersFor(niche) {
  const n = norm(niche);
  for (const [keys, filters] of NICHES) {
    if (keys.some((k) => n === k || n === k + 's' || n.includes(k))) return filters;
  }
  // Fallback: procura pelo nome do estabelecimento
  const word = n.replace(/[^a-z0-9 ]/g, '').slice(0, 40);
  if (!word) return [];
  return ['shop', 'amenity', 'craft', 'office', 'leisure'].map((k) => `nwr["name"~"${word}",i]["${k}"]`);
}

const cache = new Map();
const TTL = 10 * 60 * 1000;
const getCache = (k) => { const v = cache.get(k); return v && Date.now() - v.t < TTL ? v.d : null; };
const setCache = (k, d) => { if (cache.size > 200) cache.clear(); cache.set(k, { t: Date.now(), d }); };

async function geocode(city) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&addressdetails=1&q=' + encodeURIComponent(city);
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR' } });
  if (!r.ok) throw new Error('geocode');
  const [hit] = await r.json();
  if (!hit) return null;
  const [s, n, w, e] = hit.boundingbox.map(Number);
  return { bbox: [s, w, n, e], label: hit.display_name };
}

async function overpass(query) {
  let lastErr;
  for (const ep of OVERPASS) {
    try {
      const r = await fetch(ep, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query)
      });
      if (r.ok) return await r.json();
      lastErr = new Error('overpass ' + r.status);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

const first = (v) => (v ? String(v).split(';')[0].trim() : '');

function toPlace(el) {
  const t = el.tags || {};
  if (!t.name) return null;
  const phone = first(t.phone || t['contact:phone'] || t['contact:mobile'] || t.mobile);
  const site = first(t.website || t['contact:website'] || t.url);
  let wa = first(t['contact:whatsapp'] || t.whatsapp).replace(/\D/g, '');
  if (!wa && phone) {
    let d = phone.replace(/\D/g, '').replace(/^55/, '');
    if (d.length === 11 && d[2] === '9') wa = '55' + d; // celular brasileiro
  }
  if (wa && wa.length <= 11) wa = '55' + wa;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  const parts = [
    [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', '),
    t['addr:suburb'] || t['addr:neighbourhood'],
    t['addr:city'],
    t['addr:postcode']
  ].filter(Boolean);
  return {
    id: el.type + el.id,
    name: t.name,
    address: parts.join(' - '),
    website: site ? (/^https?:\/\//i.test(site) ? site : 'https://' + site) : '',
    phone,
    whatsapp: wa || '',
    lat, lon
  };
}

app.get('/api/search', async (req, res) => {
  const city = String(req.query.city || '').trim().slice(0, 80);
  const niche = String(req.query.niche || '').trim().slice(0, 60);
  if (city.length < 2 || niche.length < 2) return res.status(400).json({ error: 'Informe a cidade e o nicho.' });

  const key = norm(city) + '|' + norm(niche);
  const hit = getCache(key);
  if (hit) return res.json(hit);

  try {
    const place = await geocode(city);
    if (!place) return res.status(404).json({ error: 'Cidade não encontrada no Brasil. Confira o nome.' });

    const filters = filtersFor(niche);
    if (!filters.length) return res.status(400).json({ error: 'Nicho inválido.' });

    const [s, w, n, e] = place.bbox;
    const q = `[out:json][timeout:25];(${filters.map((f) => `${f}(${s},${w},${n},${e});`).join('')});out center tags 300;`;
    const data = await overpass(q);

    const seen = new Set();
    const results = (data.elements || []).map(toPlace).filter((p) => {
      if (!p) return false;
      const k = norm(p.name) + '|' + p.address;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const payload = { city: place.label, total: results.length, results };
    setCache(key, payload);
    res.json(payload);
  } catch (err) {
    console.error(err.message);
    res.status(502).json({ error: 'O OpenStreetMap está lento agora. Tente de novo em instantes.' });
  }
});

app.get('/health', (_req, res) => res.send('ok'));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => console.log('Nicho Finder rodando na porta ' + PORT));
