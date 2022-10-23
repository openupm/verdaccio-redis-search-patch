import _ from 'lodash';
import semver from 'semver';
import { PassThrough, Readable, Transform, pipeline as streamPipeline } from 'stream';

import * as searchUtils from './search-utils';
import { IBasicAuth, Logger, IStorageManager, Manifest } from '@verdaccio/types';
import { RedisSearchPatchConfig } from '../types';
import { ProxySearchParams } from './proxy';
import { TransFormResults } from './TransFormResults';
import { getBadData, getBadRequest, getCode, getConflict, getForbidden, getInternalError, getNotFound, getServiceUnavailable, getUnauthorized, HTTP_STATUS } from '@verdaccio/commons-api';
import { DIST_TAGS, STORAGE } from './constants';
import { isObject } from './utils';
import { sortVersionsAndFilterInvalid } from './versions-utils';

/**
 * Handle search on packages and proxies.
 * Iterate all proxies configured and search in all endpoints in v2 and pipe all responses
 * to a stream, once the proxies request has finished search in local storage for all packages
 * (privated and cached).
 */
export async function search(storage: IStorageManager<RedisSearchPatchConfig>, logger: Logger, options: ProxySearchParams): Promise<searchUtils.SearchPackageItem[]> {
  const transformResults = new TransFormResults({ objectMode: true });
  const streamPassThrough = new PassThrough({ objectMode: true });
  // const upLinkList = this.getProxyList();

  // const searchUplinksStreams = upLinkList.map((uplinkId: string) => {
  //   const uplink = this.uplinks[uplinkId];
  //   if (!uplink) {
  //     // this should never tecnically happens
  //     logger.error({ uplinkId }, 'uplink @upLinkId not found');
  //   }
  //   return this.consumeSearchStream(uplinkId, uplink, options, streamPassThrough);
  // });

  // try {
  //   logger.debug('search uplinks');
  //   // we only process those streams end successfully, if all fails
  //   // we just include local storage
  //   await Promise.allSettled([...searchUplinksStreams]);
  //   logger.debug('search uplinks done');
  // } catch (err: any) {
  //   logger.error({ err: err?.message }, ' error on uplinks search @{err}');
  //   streamPassThrough.emit('error', err);
  // }
  logger.debug('search local');
  try {
    await searchCachedPackages(storage, logger, streamPassThrough, options.query as searchUtils.SearchQuery);
  } catch (err: any) {
    logger.error({ err: err?.message }, ' error on local search @{err}');
    streamPassThrough.emit('error', err);
  }
  const data: searchUtils.SearchPackageItem[] = [];
  const outPutStream = new PassThrough({ objectMode: true });
  streamPipeline(streamPassThrough, transformResults, outPutStream, (err: any) => {
    if (err) {
      logger.error({ err: err?.message }, ' error on search @{err}');
      throw getInternalError(err ? err.message : 'unknown search error');
    } else {
      logger.debug('pipeline succeeded');
    }
  });

  outPutStream.on('data', (chunk) => {
    data.push(chunk);
  });

  return new Promise((resolve) => {
    outPutStream.on('finish', async () => {
      const searchFinalResults: searchUtils.SearchPackageItem[] = searchUtils.removeDuplicates(data);
      logger.debug({ len: searchFinalResults.length }, 'search stream total results: @{len}');
      return resolve(searchFinalResults);
    });
    logger.debug('search done');
  });
}

async function searchCachedPackages(
  storage: IStorageManager<RedisSearchPatchConfig>,
  logger: Logger,
  searchStream: PassThrough,
  query: searchUtils.SearchQuery
): Promise<void> {
  logger.debug('search on each package');
  logger.debug(
    { t: query.text, q: query.quality, p: query.popularity, m: query.maintenance, s: query.size },
    'search by text @{t}| maintenance @{m}| quality @{q}| popularity @{p}'
  );
  let storagePlugin = (storage as any).localStorage.storagePlugin;
  if (typeof storagePlugin.loadedBackends !== 'undefined') {
    storagePlugin = storagePlugin.loadedBackends['redis-storage'];
    logger.debug('VerdaccioStorageProxy found');
  }
  if (typeof storagePlugin.searchV1 === 'undefined') {
    logger.info('plugin search not implemented yet');
    searchStream.end();
  } else {
    logger.debug('search on each package by plugin');
    const items = await storagePlugin.searchV1(query);
    try {
      for (const searchItem of items) {
        const manifest = await getPackageLocalMetadata(storagePlugin, logger, searchItem.package.name);
        if (_.isEmpty(manifest?.versions) === false) {
          const searchPackage = searchUtils.mapManifestToSearchPackageBody(manifest, searchItem);
          const searchPackageItem: searchUtils.SearchPackageItem = {
            package: searchPackage,
            score: searchItem.score,
            verdaccioPkgCached: searchItem.verdaccioPkgCached,
            verdaccioPrivate: searchItem.verdaccioPrivate,
            flags: searchItem?.flags,
            // FUTURE: find a better way to calculate the score
            searchScore: 1,
          };
          searchStream.write(searchPackageItem);
        }
      }
      logger.debug('search local stream end');
      searchStream.end();
    } catch (err) {
      logger.error({ err, query }, 'error on search by plugin @{err.message}');
      searchStream.emit('error', err);
    }
  }
}

async function getPackageLocalMetadata(storagePlugin, logger, name: string): Promise<Manifest> {
  logger.debug('get package metadata for %o', name);
  if (typeof storagePlugin === 'undefined') {
    throw getServiceUnavailable('storage not initialized');
  }

  try {
    const result: Manifest = await storagePlugin.getPackageStorage(name).readPackageAsync(name);
    return normalizePackage(result);
  } catch (err: any) {
    if (err.code === STORAGE.NO_SUCH_FILE_ERROR || err.code === HTTP_STATUS.NOT_FOUND) {
      logger.debug('package %s not found', name);
      throw getNotFound();
    }
    logger.error(
      { err: err, file: STORAGE.PACKAGE_FILE_NAME },
      `error reading  @{file}: @{!err.message}`
    );

    throw getInternalError();
  }
}

function normalizePackage(pkg) {
  const pkgProperties = ['versions', 'dist-tags', '_distfiles', '_attachments', '_uplinks', 'time'];

  pkgProperties.forEach((key): void => {
    const pkgProp = pkg[key];

    if (_.isNil(pkgProp) || isObject(pkgProp) === false) {
      pkg[key] = {};
    }
  });

  if (_.isString(pkg._rev) === false) {
    pkg._rev = STORAGE.DEFAULT_REVISION;
  }

  if (_.isString(pkg._id) === false) {
    pkg._id = pkg.name;
  }

  // normalize dist-tags
  normalizeDistTags(pkg);

  return pkg;
}

function normalizeDistTags(manifest: Manifest): Manifest {
  let sorted;
  // handle missing latest dist-tag
  if (!manifest[DIST_TAGS].latest) {
    // if there is no latest tag, set the highest known version based on semver sort
    sorted = sortVersionsAndFilterInvalid(Object.keys(manifest.versions));
    if (sorted?.length) {
      // get the highest published version
      manifest[DIST_TAGS].latest = sorted.pop();
    }
  }

  for (const tag in manifest[DIST_TAGS]) {
    // deprecated (will be removed un future majors)
    // this should not happen, tags should be plain strings, legacy fallback
    if (_.isArray(manifest[DIST_TAGS][tag])) {
      if (manifest[DIST_TAGS][tag].length) {
        // sort array
        // FIXME: this is clearly wrong, we need to research why this is like this.
        // @ts-ignore
        sorted = sortVersionsAndFilterInvalid(manifest[DIST_TAGS][tag]);
        if (sorted.length) {
          // use highest version based on semver sort
          manifest[DIST_TAGS][tag] = sorted.pop();
        }
      } else {
        delete manifest[DIST_TAGS][tag];
      }
    } else if (_.isString(manifest[DIST_TAGS][tag])) {
      if (!semver.parse(manifest[DIST_TAGS][tag], true)) {
        // if the version is invalid, delete the dist-tag entry
        delete manifest[DIST_TAGS][tag];
      }
    }
  }

  return manifest;
}