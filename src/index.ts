import { Logger, IPluginMiddleware, IBasicAuth, IStorageManager, PluginOptions } from '@verdaccio/types';
import { Router, Request, Response, NextFunction, Application } from 'express';

import { RedisSearchPatchConfig } from '../types/index';
import v1Search from './v1-search';

export default class VerdaccioMiddlewarePlugin implements IPluginMiddleware<RedisSearchPatchConfig> {
  public logger: Logger;
  public constructor(config: RedisSearchPatchConfig, options: PluginOptions<RedisSearchPatchConfig>) {
    this.logger = options.logger;
  }

  public register_middlewares(
    app: Application,
    auth: IBasicAuth<RedisSearchPatchConfig>,
    /* eslint @typescript-eslint/no-unused-vars: off */
    storage: IStorageManager<RedisSearchPatchConfig>,
  ): void {
    // The router defined here gets a higher priority, due to middleware is registered before api endpoints in verdaccio@5.
    v1Search(app, auth, storage, this.logger);
  }
}
