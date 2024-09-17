#!/usr/bin/env zx
import { $ } from 'zx';
import { rm } from 'node:fs/promises';

const localStoragePathPrefix = './storage/versions';

/**
 * Get latest 5 published versions.
 * We run this script once or max a few times a day, so we load multiple versions to republish each even
 * when multiple versions were published between runs.
 * @type {string[]}
 */
const latestVersionsFromCdn = await $`curl -sf https://cdn.sheetjs.com/xlsx.lst | tail -5`.lines();

/**
 * Get the latest published version from NPM.
 * Currently we get the latest version and try to publish all higher versions from the CDN. This may be problematic
 * if packages are not published in sequence as a non-latest package may "steal" the latest tag. If we run into this
 * we can use `npm view <package> versions --json` to get all versions and set the latest tag only for the highest version.
 * @type {string}
 */
const latestNpmVersion = (await $`npm view xlsx-republish@latest version`.text()).trim();

/**
 * List of versions to publish to NPM from SheetJS CDN.
 * @type {string[]}
 */
const versionsToPublish = await $`npx semver --range ">${latestNpmVersion}" ${latestVersionsFromCdn}`.lines();

console.log(`Found ${versionsToPublish.length} versions to publish: ${versionsToPublish.join(', ')}`);
console.log({ latestNpmVersion, latestVersionsFromCdn, versionsToPublish });

if (versionsToPublish.length == 0) {
  console.log(`::notice title=No action required::There is no new package to publish.`);
}

for (const version of versionsToPublish) {
  console.log(`[${version}] Installing from CDN into local folder...`);
  await $`npm install --prefix ${localStoragePathPrefix}/${version} https://cdn.sheetjs.com/xlsx-${version}/xlsx-${version}.tgz`;

  console.log(`[${version}] Updating package.json...`);
  within(async () => {
    $.cwd = `${localStoragePathPrefix}/${version}/node_modules/xlsx`;

    await $`npm pkg set name=xlsx-republish`;
    await $`npm pkg set repository.url=https://github.com/NoNameProvided/xlsx-republish.git`;
  });

  console.log(`[${version}] Creating tarball...`);
  await $`npm pack ${localStoragePathPrefix}/${version}/node_modules/xlsx --pack-destination ${localStoragePathPrefix}/${version}`;

  console.log(`[${version}] Publish tarball to registry...`);
  await $`npm publish ${localStoragePathPrefix}/${version}/xlsx-republish-${version}.tgz`;
}

console.log(`Cleaning up local install folder...`);
await rm(localStoragePathPrefix, { recursive: true, force: true });
