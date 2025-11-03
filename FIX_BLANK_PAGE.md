# Fix: Blank Page on GitHub Pages

## The Problem

The site shows a blank page with errors like:
```
Failed to load resource: the server responded with a status of 404 () 
https://liquidmesh.github.io/src/main.tsx
```

This happens because the base path wasn't correctly configured for GitHub Pages.

## The Fix

I've updated:
1. ✅ `vite.config.ts` - Fixed base path and PWA manifest `start_url`
2. ✅ `.github/workflows/deploy.yml` - Ensured environment variables are passed correctly

## What You Need to Do

### 1. Commit and Push the Fixes

```bash
cd "/Users/neb/arch lenses/arch-lenses"
git add vite.config.ts .github/workflows/deploy.yml
git commit -m "Fix: Correct base path for GitHub Pages deployment"
git push origin main
```

### 2. Wait for Workflow to Rebuild

1. Go to **Actions** tab in your repository
2. Wait for "Deploy to GitHub Pages" workflow to complete (2-5 minutes)
3. The site should now work correctly!

### 3. Verify the Fix

After deployment completes:
- Visit: `https://liquidmesh.github.io/arch-lenses/`
- The app should load correctly with all assets
- Check browser console - no more 404 errors

## What Was Fixed

**Before:** 
- Base path wasn't consistently applied
- PWA manifest `start_url` was `/` instead of `/arch-lenses/`

**After:**
- Base path is `/arch-lenses/` when `GITHUB_PAGES=true`
- All asset paths include the base path
- PWA manifest uses correct start URL

## Expected Behavior

After the rebuild, your `index.html` will have paths like:
- ✅ `/arch-lenses/assets/index-xxx.js` (correct)
- ❌ NOT `/assets/index-xxx.js` (incorrect)
- ❌ NOT `/src/main.tsx` (source file, shouldn't be in production)

## If It Still Doesn't Work

1. **Clear browser cache** (Ctrl+Shift+R or Cmd+Shift+R)
2. **Check the Actions log** to ensure build succeeded
3. **Verify the built files** - check if `dist/index.html` has `/arch-lenses/` paths
4. **Hard refresh** the GitHub Pages URL

---

**Next Step:** Push the fixes and let the workflow rebuild!

