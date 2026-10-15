# Nicho Finder

Encontre comércios reais em qualquer cidade do Brasil. Digite a **cidade** e o **nicho** (barbearia, mercado, padaria...) e veja 10 estabelecimentos por vez, com nome, endereço, site, telefone e WhatsApp.

Os dados vêm do [OpenStreetMap](https://www.openstreetmap.org) (Nominatim + Overpass API). Não precisa de chave de API.

## Estrutura

```
├── index.html      # Front-end (HTML, CSS e JS)
├── server.js       # Servidor Express + busca no OpenStreetMap
├── package.json
└── README.md
```

## Rodar localmente

```bash
npm install
npm start
```

Abra http://localhost:3000 (precisa do Node 18 ou superior).

## Publicar no Render

1. Suba o projeto para um repositório no GitHub.
2. No [Render](https://render.com), clique em **New > Web Service** e conecte o repositório.
3. Configure: **Build Command** `npm install` e **Start Command** `npm start`.
4. Clique em **Deploy**.

> Antes de publicar, troque `SEU-USUARIO` e o contato no `User-Agent` do `server.js`. O OpenStreetMap exige um User-Agent identificável.

## Observações

- Os dados são colaborativos: nem todo comércio tem telefone, site ou WhatsApp cadastrado.
- O WhatsApp aparece quando está cadastrado ou quando o telefone é um celular brasileiro (DDD + 9 dígitos).
- Os resultados ficam em cache por 10 minutos para respeitar os limites das APIs públicas.
- Nichos conhecidos usam categorias do OpenStreetMap. Os demais são buscados pelo nome do estabelecimento.
