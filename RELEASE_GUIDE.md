# Release Guide

This guide explains how to create and publish releases of the Minecraft Bot Controller.

## Automated Releases

The project uses GitHub Actions to automatically build and release executables when you push a version tag.

## How to Create a Release

### 1. Update the Version

Choose the type of version bump:

```bash
# Patch release (1.0.0 -> 1.0.1)
bun run release:patch

# Minor release (1.0.1 -> 1.1.0)
bun run release:minor

# Major release (1.1.0 -> 2.0.0)
bun run release:major
```

These commands will:
1. Update the version in `package.json`
2. Create a git commit
3. Create a git tag (e.g., `v1.0.1`)
4. Push the commit and tag to GitHub

### 2. GitHub Actions Takes Over

Once you push a tag starting with `v`, GitHub Actions will:

1. **Build executables** for all platforms:
   - Linux x64 (modern and baseline)
   - Windows x64 (modern and baseline)
   - macOS ARM64 (Apple Silicon)
   - macOS x64 (Intel)

2. **Test each executable** to ensure it works

3. **Create compressed archives** with checksums

4. **Create a GitHub Release** with:
   - All platform executables
   - SHA256 checksums
   - Auto-generated release notes
   - Changelog from commits

### 3. Monitor the Release

1. Go to your repository on GitHub
2. Click on the "Actions" tab
3. Watch the "Release" workflow progress
4. Once complete, check the "Releases" section

## Manual Release Process

If you need to create a release manually:

### 1. Build Executables Locally

```bash
# Build for all platforms
bun run build:linux
bun run build:windows
bun run build:mac

# Or build for specific platform
bun build --compile --minify --sourcemap \
  --target=bun-linux-x64 \
  ./src/mineflayer.js \
  --outfile mineflayer-linux-x64
```

### 2. Create Archives

```bash
# Linux/macOS
tar czf mineflayer-linux-x64.tar.gz mineflayer-linux-x64
sha256sum mineflayer-linux-x64.tar.gz > mineflayer-linux-x64.tar.gz.sha256

# Windows (PowerShell)
Compress-Archive -Path mineflayer-windows-x64.exe -DestinationPath mineflayer-windows-x64.zip
Get-FileHash -Algorithm SHA256 mineflayer-windows-x64.zip
```

### 3. Create GitHub Release

1. Go to your repository's Releases page
2. Click "Draft a new release"
3. Create a new tag (e.g., `v1.0.0`)
4. Upload all archives and checksums
5. Add release notes
6. Publish

## Version Tag Format

- **Regular releases**: `v1.0.0`, `v2.1.3`
- **Pre-releases**: 
  - Alpha: `v1.0.0-alpha.1`
  - Beta: `v1.0.0-beta.1`
  - Release Candidate: `v1.0.0-rc.1`

Pre-release tags are automatically marked as pre-releases on GitHub.

## Platform Support

### Linux
- **Modern (x64)**: For CPUs from 2013+ with AVX2 support
- **Baseline (x64-baseline)**: For older CPUs without AVX2

### Windows
- **Modern (x64)**: For CPUs from 2013+ with AVX2 support
- **Baseline (x64-baseline)**: For older CPUs without AVX2

### macOS
- **ARM64**: For Apple Silicon Macs (M1, M2, M3)
- **x64**: For Intel-based Macs

## Troubleshooting

### Build Fails

If the GitHub Actions build fails:
1. Check the Actions tab for error logs
2. Ensure all dependencies are properly specified
3. Test the build locally first

### Wrong Architecture

If users report "Illegal instruction" errors:
- They need the baseline version for their platform
- Modern builds require CPUs from 2013 or later

### Release Not Created

If the release isn't created after pushing a tag:
1. Ensure the tag starts with `v`
2. Check GitHub Actions permissions
3. Verify the workflow file exists in `.github/workflows/release.yml`

## Testing Releases

Before creating a release:

1. **Test the build locally**:
   ```bash
   bun run build
   ./mineflayer --version
   ./mineflayer server start --daemon
   ./mineflayer server status
   ./mineflayer server stop
   ```

2. **Run the test workflow**:
   - Push to a branch to trigger the test workflow
   - Ensure all tests pass

3. **Test on different platforms** if possible

## Release Checklist

Before releasing, ensure:

- [ ] All features are tested
- [ ] Documentation is updated
- [ ] README.md reflects new features
- [ ] CHANGELOG.md is updated (optional)
- [ ] Version number makes sense
- [ ] No sensitive data in code
- [ ] Dependencies are up to date

## GitHub Actions Workflows

### release.yml

Triggers on version tags and:
- Builds executables for all platforms
- Creates compressed archives
- Generates checksums
- Creates GitHub Release

### test.yml

Triggers on pushes and PRs to:
- Test the build process
- Verify executable works
- Check file size limits

## Download URLs

After release, executables will be available at:
```
https://github.com/[your-username]/[your-repo]/releases/download/v1.0.0/mineflayer-linux-x64.tar.gz
```

## Release Notes Template

```markdown
# Minecraft Bot Controller v1.0.0

## What's New
- Feature 1
- Feature 2

## Improvements
- Enhancement 1
- Enhancement 2

## Bug Fixes
- Fix 1
- Fix 2

## Breaking Changes
- None

## Download
See assets below for platform-specific executables.
```

## Semantic Versioning

This project follows semantic versioning:

- **MAJOR** (x.0.0): Incompatible API changes
- **MINOR** (0.x.0): New functionality, backwards compatible
- **PATCH** (0.0.x): Bug fixes, backwards compatible

## License

Ensure your LICENSE file is included if you're distributing the software.