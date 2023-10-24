import _ from 'lodash';

import * as searchUtils from './search-utils';
import { IBasicAuth, Logger, IStorageManager, Manifest } from '@verdaccio/types';
import { RedisSearchPatchConfig } from '../types';
import { AbortController } from 'node-abort-controller';
import { search } from './search';
import { createAnonymousRemoteUser } from './auth-utils';

const HTTP_STATUS = {
  OK: 200,
}

/**
 * Endpoint for npm search v1
 * Empty value
 *  - {"objects":[],"total":0,"time":"Sun Jul 25 2021 14:09:11 GMT+0000 (Coordinated Universal Time)"}
 * req: 'GET /-/v1/search?text=react&size=20&frpom=0&quality=0.65&popularity=0.98&maintenance=0.5'
 */
export default function (route, auth: IBasicAuth<RedisSearchPatchConfig>, storage: IStorageManager<RedisSearchPatchConfig>, logger: Logger): void {

  function checkAccess(pkg: any, auth: any, remoteUser): Promise<Manifest | null> {
    return new Promise((resolve, reject) => {
      auth.allow_access({ packageName: pkg?.package?.name }, remoteUser, function (err, allowed) {
        if (err) {
          if (err.status && String(err.status).match(/^4\d\d$/)) {
            // auth plugin returns 4xx user error,
            // that's equivalent of !allowed basically
            allowed = false;
            return resolve(null);
          } else {
            reject(err);
          }
        } else {
          return resolve(allowed ? pkg : null);
        }
      });
    });
  }

  route.get('/-/v1/search', async (req, res, next) => {
    const { query, url } = req;
    let [size, from] = ['size', 'from'].map((k) => query[k]);
    let data;
    const abort = new AbortController();

    req.socket.on('close', function () {
      logger.debug('search web aborted');
      abort.abort();
    });

    size = parseInt(size, 10) || 250;
    from = parseInt(from, 10) || 0;

    try {
      data = await search(storage, logger, {
        query,
        url,
        abort,
      });
      logger.debug('stream finish');
      // if (req.remote_user === undefined)
      //   req.remote_user = createAnonymousRemoteUser();
      // const checkAccessPromises: searchUtils.SearchItemPkg[] = await Promise.all(
      //   data.map((pkgItem) => {
      //     logger.debug({ pkgItem }, 'pkgItem: @{pkgItem}');
      //     logger.debug({ auth }, 'auth: @{auth}');
      //     logger.debug({ remote_user: req.remote_user }, 'req.remote_user: @{req.remote_user}');

      //     return checkAccess(pkgItem, auth, req.remote_user);
      //   })
      // );
      const checkAccessPromises: searchUtils.SearchItemPkg[] = data;

      const final: searchUtils.SearchItemPkg[] = checkAccessPromises
        .filter((i) => !_.isNull(i))
        .slice(from, size);
      logger.debug(`search results ${final?.length}`);

      const response: searchUtils.SearchResults = {
        objects: final,
        total: final.length,
        time: new Date().toUTCString(),
      };

      res.status(HTTP_STATUS.OK).json(response);
    } catch (error) {
      logger.error({ error }, 'search endpoint has failed @{error.message}');
      next(next);
      return;
    }
  });
}
