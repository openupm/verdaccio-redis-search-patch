import { AbortController } from 'node-abort-controller';
import { SearchQuery } from './search-utils';

export type ProxySearchParams = {
  headers?: any;
  url: string;
  query?: SearchQuery;
  abort: AbortController;
};
