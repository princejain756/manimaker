# VPS Deployment Update Guide

## Issue Fixed
The "fetch failed" error was caused by the `create-vps-sandbox` route trying to make a self-referencing HTTP request to itself. This has been fixed by eliminating the fetch call and directly executing the sandbox creation logic.

## Files Updated
1. `app/api/create-vps-sandbox/route.ts` - Removed self-referencing fetch, added direct function calls
2. `.env.production` - Added production environment variables

## Deployment Steps

### 1. Update your VPS with the new code
```bash
# On your VPS, pull the latest changes
cd /var/www/manimaker
git pull origin master

# Copy environment variables
cp .env.production .env.local

# Install dependencies and rebuild
npm install
npm run build

# Restart the application
pm2 restart all
# OR if using systemctl
sudo systemctl restart manimaker
```

### 2. Verify the fix
- Test creating a new sandbox from your frontend
- Check the server logs for any errors:
  ```bash
  pm2 logs
  # OR
  journalctl -u manimaker -f
  ```

## What was changed
- **Before**: `create-vps-sandbox` → fetch → `vps-sandbox/manage` → execute commands
- **After**: `create-vps-sandbox` → directly execute commands (no fetch)

This eliminates the network call that was failing and makes the code more efficient.

## Environment Variables Required
Make sure these are set in your VPS `.env.local`:
```
NEXT_PUBLIC_APP_URL=https://ai.maninfini.com
E2B_API_KEY=your_e2b_key
FIRECRAWL_API_KEY=your_firecrawl_key
GEMINI_API_KEY=your_gemini_key
```

## Testing
After deployment, test by:
1. Creating a new sandbox from the frontend
2. Verify the subdomain is accessible (e.g., https://user42.maninfini.com)
3. Check that code generation and file editing still works
