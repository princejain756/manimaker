# VPS Deployment Guide - Subdomain Based Sandboxes

This guide will help you deploy the VPS-based sandbox system that creates unique subdomains for each user.

## Overview

Instead of using e2b cloud, each user will get their own subdomain like:
- `prince32.maninfini.com` 
- `john45.maninfini.com`
- `sarah78.maninfini.com`

The number is auto-generated to handle users with the same name.

## 1. Server Setup

### Install Dependencies
```bash
# SSH into your VPS
ssh your-username@your-server

# Navigate to your directory
cd /var/www/manimaker

# Install Node.js 18+ (if not already installed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Create sandbox directories
sudo mkdir -p /var/www/manimaker/sandboxes
sudo chown -R www-data:www-data /var/www/manimaker/sandboxes
sudo chmod -R 755 /var/www/manimaker/sandboxes
```

## 2. SSL Certificate Setup (Wildcard Certificate)

You need a wildcard SSL certificate to handle all subdomains:

### Option 1: Let's Encrypt (Free)
```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get wildcard certificate for *.maninfini.com
sudo certbot certonly --manual --preferred-challenges=dns --email your-email@example.com --server https://acme-v02.api.letsencrypt.org/directory --agree-tos -d *.maninfini.com -d maninfini.com

# Follow the instructions to add DNS TXT records
```

### Option 2: Use existing certificate
If you have a wildcard certificate, place it in:
- `/etc/ssl/certs/maninfini.com.crt`
- `/etc/ssl/private/maninfini.com.key`

## 3. Nginx Configuration

Create the main nginx config:

```bash
sudo nano /etc/nginx/sites-available/maninfini
```

Add this configuration:

```nginx
# Wildcard server block for all subdomains
server {
    listen 80;
    listen [::]:80;
    server_name *.maninfini.com maninfini.com;
    return 301 https://$server_name$request_uri;
}

# Main domain (ai.maninfini.com) - your Next.js app
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ai.maninfini.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/maninfini.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/maninfini.com/privkey.pem;
    
    # SSL Security
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'; connect-src 'self' ws: wss:;" always;

    # Main application
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Template for user subdomains (the VPS sandbox will create these automatically)
# Example: prince32.maninfini.com, john45.maninfini.com, etc.
# These will be created dynamically by the sandbox management system
```

Enable the configuration:
```bash
sudo ln -sf /etc/nginx/sites-available/maninfini /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 4. Deploy Your Code

### Local Machine
```bash
# Push your updated code
git add .
git commit -m "Add VPS subdomain sandbox support"
git push
```

### On Your VPS
```bash
cd /var/www/manimaker

# Pull the latest code
git pull

# Install dependencies
npm install

# Build the application
npm run build

# Restart your application
pm2 restart all
# OR if you're not using PM2:
# sudo systemctl restart your-app-service
```

## 5. Environment Variables

Make sure your `.env.local` (or production env) has:

```bash
# Your existing variables...
NEXT_PUBLIC_APP_URL=https://ai.maninfini.com

# If you have any E2B variables, you can remove them:
# E2B_API_KEY=... (no longer needed)
```

## 6. Test the System

1. **Visit your app**: Go to `https://ai.maninfini.com`
2. **Login**: Use the phone authentication
3. **Create sandbox**: Click "Create Sandbox" - it should create a subdomain like `prince32.maninfini.com`
4. **Check subdomain**: The sandbox should open in a new subdomain specific to your user

## 7. DNS Configuration

Make sure your DNS has these records:

```
Type    Name              Value
A       ai.maninfini.com  YOUR_SERVER_IP
A       *.maninfini.com   YOUR_SERVER_IP  # Wildcard for all subdomains
A       maninfini.com     YOUR_SERVER_IP  # Root domain
```

## How It Works

1. **User Authentication**: User logs in with phone number and name
2. **Unique Subdomain**: System creates `{username}{randomnumber}.maninfini.com`
3. **Sandbox Creation**: Creates a directory `/var/www/manimaker/sandboxes/{username}{number}/`
4. **Nginx Config**: Automatically creates nginx server block for the subdomain
5. **React App**: Sets up a complete Vite+React+Tailwind app in the sandbox
6. **Live Preview**: User can access their sandbox at their unique subdomain

## Benefits

- ✅ **No E2B costs** - Everything runs on your VPS
- ✅ **Unique URLs** - Each user gets their own subdomain
- ✅ **Persistent** - Sandboxes survive server restarts
- ✅ **Scalable** - Can handle multiple users simultaneously
- ✅ **Professional** - Clean subdomain structure

## Cleanup

To clean up unused sandboxes:

```bash
# Remove old sandbox directories (older than 24 hours)
find /var/www/manimaker/sandboxes -type d -mtime +1 -exec rm -rf {} +

# Remove unused nginx configs
sudo find /etc/nginx/sites-enabled -name "*.conf" -mtime +1 -delete
```

You can also create a cron job to automate cleanup:

```bash
# Add to crontab
sudo crontab -e

# Add this line to clean up daily at 2 AM
0 2 * * * find /var/www/manimaker/sandboxes -type d -mtime +1 -exec rm -rf {} +
```

## Troubleshooting

### Subdomain not working
- Check DNS propagation: `dig username.maninfini.com`
- Verify nginx config: `sudo nginx -t`
- Check nginx logs: `sudo tail -f /var/log/nginx/error.log`

### SSL issues
- Verify certificate: `sudo certbot certificates`
- Renew if needed: `sudo certbot renew`

### Sandbox creation fails
- Check permissions: `ls -la /var/www/manimaker/sandboxes/`
- Check logs: `pm2 logs` or check your app logs

That's it! Your VPS will now create unique subdomains for each user instead of using e2b cloud.
