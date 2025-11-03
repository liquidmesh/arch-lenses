# GitHub Setup & Deployment Guide

This guide will help you set up GitHub source control and deploy to GitHub Pages.

## Step 1: Initialize Git Repository

```bash
cd "/Users/neb/arch lenses/arch-lenses"
git init
git add .
git commit -m "Initial commit"
```

## Step 2: Create GitHub Repository

1. Go to [GitHub.com](https://github.com) and sign in
2. Click the **"+"** icon → **"New repository"**
3. Repository name: `arch-lenses` (or your preferred name)
4. Choose **Public** or **Private**
5. **DO NOT** initialize with README, .gitignore, or license (we already have these)
6. Click **"Create repository"**

## Step 3: Connect and Push to GitHub

GitHub will show you commands. Run these in your terminal:

```bash
# Add your repository (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/arch-lenses.git

# Or if using SSH:
# git remote add origin git@github.com:YOUR_USERNAME/arch-lenses.git

# Push to GitHub
git branch -M main
git push -u origin main
```

## Step 4: Update Repository Name in Config (if needed)

If your GitHub repository name is **NOT** `arch-lenses`, update `vite.config.ts`:

```typescript
// Change this line:
const repoName = process.env.REPO_NAME || 'arch-lenses'
// To your repo name:
const repoName = process.env.REPO_NAME || 'your-repo-name'
```

Or set the environment variable when building:
```bash
REPO_NAME=your-repo-name npm run build:gh-pages
```

## Step 5: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** → **Pages** (in the left sidebar)
3. Under **"Source"**, select:
   - **Source**: `GitHub Actions`
4. Click **Save**

## Step 6: Deploy

### Automatic Deployment (Recommended)

The GitHub Actions workflow will automatically deploy when you push to `main`:

```bash
# Make changes, then:
git add .
git commit -m "Your commit message"
git push origin main
```

The workflow will:
1. Build your app
2. Deploy to GitHub Pages
3. Your site will be live at: `https://YOUR_USERNAME.github.io/arch-lenses/`

### Manual Deployment

If you prefer to deploy manually:

```bash
npm run deploy
```

This will:
1. Build with GitHub Pages base path
2. Push the `dist` folder to the `gh-pages` branch
3. GitHub Pages will serve from that branch

**Note:** For manual deployment, you still need to enable GitHub Pages in Settings → Pages, but set the source to the `gh-pages` branch instead of `GitHub Actions`.

## Viewing Your Site

Once deployed, your app will be available at:
- `https://YOUR_USERNAME.github.io/arch-lenses/`

The first deployment may take a few minutes. You can check the progress:
- Go to **Actions** tab in your GitHub repository
- Click on the latest workflow run to see build progress

## Updating Your Site

### Using Automatic Deployment (GitHub Actions)

1. Make your changes
2. Commit and push:
   ```bash
   git add .
   git commit -m "Update description"
   git push origin main
   ```
3. GitHub Actions will automatically rebuild and redeploy

### Using Manual Deployment

```bash
npm run deploy
```

## Troubleshooting

### Site shows 404

1. Check that GitHub Pages is enabled in Settings → Pages
2. Ensure the repository name in `vite.config.ts` matches your GitHub repo name
3. Check the Actions tab for any build errors

### Assets not loading

- Verify the `base` path in `vite.config.ts` matches your repository name
- Clear browser cache (hard refresh: Ctrl+Shift+R or Cmd+Shift+R)

### Build fails

- Check the Actions tab for error messages
- Ensure all dependencies are listed in `package.json`
- Try building locally: `npm run build:gh-pages`

### Repository name mismatch

If you renamed your repository, update `vite.config.ts`:
```typescript
const repoName = process.env.REPO_NAME || 'your-new-repo-name'
```

Or build with the environment variable:
```bash
REPO_NAME=your-new-repo-name npm run build:gh-pages
```

## File Structure

Your repository should look like:
```
arch-lenses/
├── .github/
│   └── workflows/
│       └── deploy.yml       # Auto-deployment workflow
├── src/                      # Source code
├── public/                   # Static assets
├── dist/                     # Built files (ignored by git)
├── .gitignore               # Git ignore rules
├── package.json             # Dependencies & scripts
├── vite.config.ts           # Vite config with base path
└── README.md                # Project documentation
```

## Important Notes

- **Data Storage**: All data is stored locally in each user's browser (IndexedDB). No backend required!
- **HTTPS**: GitHub Pages automatically provides HTTPS
- **Custom Domain**: You can add a custom domain in Settings → Pages
- **PWA**: The app works as a Progressive Web App and can be installed on devices

## Next Steps

1. ✅ Push your code to GitHub
2. ✅ Enable GitHub Pages
3. ✅ Wait for first deployment
4. ✅ Share your live URL!

---

**Need help?** Check GitHub Actions logs in the **Actions** tab of your repository.

