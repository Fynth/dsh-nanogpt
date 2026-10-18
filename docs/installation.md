# Installation

## From this checkout

```bash
cd /path/to/dsh-nanogpt
npm install
npm run check
npm run pack:check
```

`npm run check` runs TypeScript type checking, produces `lib/`, and runs the
unit, contract, and integration suites. `npm run pack:check` validates the exact
release file list and refuses source, tests, credential material, or an
incomplete manifest.

Install the directory as a bundle with the DSH Plugin Manager
(**Settings → Plugins**). During development the verified operation was:

1. Build (`npm run build`).
2. Open the Plugin Manager in DSH.
3. Install a bundle from the absolute package directory
   `/path/to/dsh-nanogpt`.
4. Confirm the result reports `application: applied`.

Do not hand-edit the profile's `package.json` or `cordis.patch.yml`; the Plugin
Manager owns the profile dependency and patch layer. A plugin update loaded from
a changed JavaScript generation may require a DSH restart, depending on the
host's module HMR state.

## Verify the installation

- Loader row `llm-nanogpt` is enabled and active.
- **Settings → NanoGPT** is present in the settings navigation.
- **Settings → Models** shows a NanoGPT provider row with a quick-configuration
  card.
- The composer model selector lists `nanogpt` models after the first catalog
  refresh.
- `Settings → NanoGPT → Connection` reports the credential state and a
  connection-test result.

## First run without a key

Public model discovery works without authentication, so the catalog and model
picker can populate before a key is entered. Authenticated inference, balance,
usage, and subscription reads require a key and will return a classified
missing/invalid credential result until one is configured.

## Upgrade

Build the new package, install it through the Plugin Manager, and restart if the
host reports that a fresh module generation is required. The catalog cache and
the versioned preferences document live outside the package, so they survive an
upgrade:

- catalog cache: `$DSH_HOME/cache/dsh-nanogpt/catalog.json`
- preferences: `$DSH_HOME/storages/dsh-nanogpt/preferences.json`

## Uninstall

Remove the bundle through the Plugin Manager. This withdraws the Loader row,
adapter, model-discovery offer, refresh timer, and `/nanogpt` RPC channel. The
cache and preferences files are not deleted by the plugin manager; remove them
manually only if you want a clean reset. The managed credential reference
(`NANOGPT_API_KEY`) is independent of the plugin and can be removed from the
credential store if desired.

## Reproducible local artifact

```bash
npm run build
npm pack --dry-run --json
```

The package entry is `lib/index.js`, the browser entry is `client.js`, and the
bundle patch is `cordis.patch.yml`. No npm publication is required for a local
install.

## Multiple profiles

This release registers one `nanogpt` route per DSH installation. Two concurrent
rows would both ask to own that route and the second registration would fail
atomically. Separate NanoGPT accounts therefore need separate DSH profiles or a
future route-per-profile extension; the settings page does not silently merge
credentials or routing between them.
