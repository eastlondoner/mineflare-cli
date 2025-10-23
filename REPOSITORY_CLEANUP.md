# Repository Cleanup Guide

## 🚨 Important Files That Should NOT Be in Git

Based on the current repository scan, here are items that need attention:

### ❌ Files/Directories to Remove from Git

1. **Build Artifacts** (Currently present):
   - `/mineflayer` - The compiled executable (326MB!)
   - Any `mineflayer-*` executables
   - `*.tar.gz`, `*.zip` archives

2. **Minecraft Server Runtime Files**:
   - `minecraft-server/world/` - World data
   - `minecraft-server/world_nether/` - Nether world
   - `minecraft-server/world_the_end/` - End world
   - `minecraft-server/*.json` - Server configs (except documentation)
   - `minecraft-server/*.yml` - Bukkit/Spigot configs
   - `minecraft-server/logs/` - Server logs
   - `minecraft-server/cache/` - Downloaded files
   - `minecraft-server/libraries/` - Downloaded libraries
   - `minecraft-server/versions/` - Version data

3. **Temporary Files**:
   - `attached_assets/` - Documentation attachments

### ✅ Files That SHOULD Be in Git

- Source code (`src/`)
- Examples (`examples/`)
- Documentation (`*.md` files)
- Configuration templates (`.env.example`)
- Package files (`package.json`, `bun.lock`)
- GitHub workflows (`.github/`)
- The Minecraft server JAR and start script

## 🧹 Cleanup Commands

Run these commands to clean up your repository:

```bash
# Remove build artifacts
rm -f mineflayer mineflayer-* *.exe *.tar.gz *.zip *.sha256

# Clean Minecraft server directory (keep only essentials)
cd minecraft-server
rm -rf world* logs cache libraries versions plugins
rm -f *.json *.yml *.properties
# Keep only the JAR and start script
cd ..

# Remove temporary files
rm -rf attached_assets

# Check what would be ignored
git status --ignored

# If files are already committed, remove them from git
git rm -r --cached minecraft-server/world* 2>/dev/null || true
git rm -r --cached minecraft-server/logs 2>/dev/null || true
git rm -r --cached minecraft-server/cache 2>/dev/null || true
git rm -r --cached minecraft-server/libraries 2>/dev/null || true
git rm -r --cached minecraft-server/versions 2>/dev/null || true
git rm -r --cached minecraft-server/*.json 2>/dev/null || true
git rm -r --cached minecraft-server/*.yml 2>/dev/null || true
git rm -r --cached minecraft-server/*.properties 2>/dev/null || true
git rm --cached mineflayer 2>/dev/null || true
git rm -r --cached attached_assets 2>/dev/null || true

# Add the updated .gitignore
git add .gitignore

# Commit the cleanup
git commit -m "chore: Clean up repository and update .gitignore

- Remove build artifacts from tracking
- Remove Minecraft server runtime files
- Update .gitignore to be more comprehensive
- Keep only essential files in version control"
```

## 📋 Pre-Push Checklist

Before pushing to GitHub, ensure:

- [ ] No `.env` files (except `.env.example`)
- [ ] No compiled executables
- [ ] No Minecraft world data
- [ ] No server logs
- [ ] No temporary files
- [ ] No API keys or secrets
- [ ] `.gitignore` is comprehensive
- [ ] Repository size is reasonable (< 50MB)

## 🔍 Verification

After cleanup, verify with:

```bash
# Check repository size
du -sh .

# List large files
find . -type f -size +1M -exec ls -lh {} \; | grep -v node_modules

# Check git status
git status

# See what's ignored
git status --ignored
```

## 💡 Best Practices

1. **Never commit**:
   - Compiled binaries
   - Generated files
   - Runtime data
   - Logs
   - Credentials

2. **Always commit**:
   - Source code
   - Documentation
   - Configuration templates
   - Essential scripts

3. **Use CI/CD**:
   - Let GitHub Actions build releases
   - Don't store build artifacts in the repo

4. **Keep it small**:
   - Repository should be < 100MB
   - Use releases for binaries
   - Use Git LFS for large essential files