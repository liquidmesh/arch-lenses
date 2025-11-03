# Deployment Guide for Arch Lenses

This guide covers multiple ways to publish your Arch Lenses application so it can run outside your computer.

## Prerequisites

First, build the production version:

```bash
npm run build
```

This creates an optimized build in the `dist/` folder that you can deploy.

---

## Option 1: Static Hosting Services (Recommended - Free & Easy)

### Netlify

1. **Sign up** at [netlify.com](https://netlify.com)

2. **Deploy:**
   - Drag and drop the `dist/` folder onto Netlify's dashboard, OR
   - Connect your Git repository and set:
     - Build command: `npm run build`
     - Publish directory: `dist`

3. **Your app will be live** at a URL like `your-app-name.netlify.app`

**Note:** Data is stored locally in each user's browser (IndexedDB), so no backend is needed!

### Vercel

1. **Sign up** at [vercel.com](https://vercel.com)

2. **Deploy:**
   - Install Vercel CLI: `npm i -g vercel`
   - Run `vercel` in the project root
   - Follow the prompts

3. **Or use the web interface:**
   - Import your Git repository
   - Set build command: `npm run build`
   - Set output directory: `dist`

### GitHub Pages

1. **Create a repository** on GitHub and push your code

2. **Update `vite.config.ts`** to add:
   ```typescript
   export default defineConfig({
     base: '/your-repo-name/', // Replace with your repo name
     // ... rest of config
   })
   ```

3. **Install gh-pages:**
   ```bash
   npm install --save-dev gh-pages
   ```

4. **Add to `package.json` scripts:**
   ```json
   "scripts": {
     "predeploy": "npm run build",
     "deploy": "gh-pages -d dist"
   }
   ```

5. **Deploy:**
   ```bash
   npm run deploy
   ```

6. **Enable GitHub Pages** in repository settings (Settings → Pages)

---

## Option 2: Traditional Web Hosting

### Upload to Any Web Server

1. **Build the app:**
   ```bash
   npm run build
   ```

2. **Upload contents of `dist/` folder** to your web server via:
   - FTP/SFTP (FileZilla, Cyberduck, etc.)
   - cPanel File Manager
   - SSH/SCP

3. **Ensure your server serves `index.html`** for all routes (SPA routing)
   - Apache: Add `.htaccess` with rewrite rules
   - Nginx: Configure try_files directive

**Example `.htaccess` for Apache:**
```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

**Example Nginx config:**
```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

---

## Option 3: Self-Hosted with Docker

Create a `Dockerfile`:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Create `nginx.conf`:
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Build and run:
```bash
docker build -t arch-lenses .
docker run -p 8080:80 arch-lenses
```

---

## Option 4: Share Locally Built Files

If you just want to share with specific people:

1. **Build:**
   ```bash
   npm run build
   ```

2. **Share the `dist/` folder** via:
   - USB drive
   - Cloud storage (Google Drive, Dropbox, etc.)
   - Email (if small enough)

3. **Recipients** can:
   - Open `dist/index.html` in a browser (some features may not work due to CORS)
   - Or host it locally with: `python -m http.server 8000` (in the `dist/` folder)
   - Then open `http://localhost:8000`

---

## Important Notes

### PWA Icons
The app references PWA icons that need to exist. If missing, create placeholder icons in `public/`:
- `pwa-192x192.png`
- `pwa-512x512.png`
- `pwa-512x512-maskable.png`

### Data Storage
- Data is stored **locally in each user's browser** (IndexedDB)
- Each user has their own separate data
- Data is **not shared** between users
- Users can export/import their data via the Export/Import buttons

### HTTPS Requirement
- PWAs work best over HTTPS
- Local development (`localhost`) works without HTTPS
- Most hosting services provide HTTPS automatically

---

## Quick Start (Netlify - Easiest)

1. Build: `npm run build`
2. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
3. Drag the `dist` folder
4. Your app is live! 🎉

---

## Troubleshooting

**Routes not working?**
- Ensure your server redirects all routes to `index.html` (SPA requirement)

**Service worker not updating?**
- Clear browser cache and service worker registrations
- Or unregister in DevTools → Application → Service Workers

**Icons not showing?**
- Check that icon files exist in `dist/`
- Verify paths in `vite.config.ts` match actual file locations

