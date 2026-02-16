# MapleStory M API Test Web

Node.js + Express starter for MapleStory M Open API.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser.

## Project Structure

```text
server.js
src/
  app.js
  config/
    env.js
    mongo.js
  controllers/
  models/
  routes/
  services/
public/
  index.html
  css/
  js/
  assets/
```

- Add new API endpoint in this order:
1. `src/routes/*.routes.js`
2. `src/controllers/*.controller.js`
3. `src/services/*.service.js`
4. Optional Mongo schema in `src/models`
- Add page styles in `public/css`
- Add page behavior in `public/js`
- Add images/graphics in `public/assets`

## Environment Variables

Example `.env`:

```env
PORT=3000
NEXON_OPEN_API_KEY=your_nexon_open_api_key
NEXON_API_BASE_URL=https://open.api.nexon.com
MONGODB_URI=mongodb://127.0.0.1:27017/maplem
```

## API Routes

- Health: `GET /api/health`
- Character OCID: `GET /api/maplestorym/id?character_name=Dena&world_name=Union`
- Character Basic: `GET /api/maplestorym/character/basic?ocid=...`
- Character Stat: `GET /api/maplestorym/character/stat?ocid=...`
- Character Hyper Stat: `GET /api/maplestorym/character/hyper-stat?ocid=...`
- Character Guild: `GET /api/maplestorym/character/guild?ocid=...`
- Character Item Equipment: `GET /api/maplestorym/character/item-equipment?ocid=...`
- Character Cash Item Equipment: `GET /api/maplestorym/character/cashitem-equipment?ocid=...`

If MongoDB is connected, request logs are stored.
