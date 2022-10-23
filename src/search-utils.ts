import { orderBy } from 'lodash';

import { Manifest, Version } from '@verdaccio/types';
import { getLatest } from './pkg-utils';

export type SearchMetrics = {
    quality: number;
    popularity: number;
    maintenance: number;
};

export type UnStable = {
    flags?: {
        // if is false is not be included in search results (majority are stable)
        unstable?: boolean;
    };
};

export type SearchItemPkg = {
    name: string;
    scoped?: string;
    path?: string;
    time?: number | Date;
};

type PrivatePackage = {
    // note: prefixed to avoid external conflicts

    // the package is published as private
    verdaccioPrivate?: boolean;
    // if the package is not private but is cached
    verdaccioPkgCached?: boolean;
};

export interface SearchItem extends UnStable, PrivatePackage {
    package: SearchItemPkg;
    score: Score;
}

export type Score = {
    final: number;
    detail: SearchMetrics;
};

export type SearchResults = {
    objects: SearchItemPkg[];
    total: number;
    time: string;
};

// @deprecated use @verdaccio/types
type PublisherMaintainer = {
    username: string;
    email: string;
};

// @deprecated use @verdaccio/types
export type SearchPackageBody = {
    name: string;
    scope: string;
    description: string;
    author: string | PublisherMaintainer;
    version: string;
    keywords: string | string[] | undefined;
    date: string;
    links?: {
        npm: string; // only include placeholder for URL eg: {url}/{packageName}
        homepage?: string;
        repository?: string;
        bugs?: string;
    };
    publisher?: any;
    maintainers?: PublisherMaintainer[];
};

export interface SearchPackageItem extends UnStable, PrivatePackage {
    package: SearchPackageBody;
    score: Score;
    searchScore?: number;
}

export const UNSCOPED = 'unscoped';

export type SearchQuery = {
    text: string;
    size?: number;
    from?: number;
} & SearchMetrics;


export function removeDuplicates(results: SearchPackageItem[]) {
  const pkgNames: any[] = [];
  const orderByResults = orderBy(results, ['verdaccioPrivate', 'asc']);
  return orderByResults.filter((pkg) => {
    if (pkgNames.includes(pkg?.package?.name)) {
      return false;
    }
    pkgNames.push(pkg?.package?.name);
    return true;
  });
}

export function mapManifestToSearchPackageBody(
  pkg: Manifest,
  searchItem: SearchItem
): SearchPackageBody {
  const latest = getLatest(pkg);
  const version: Version = pkg.versions[latest];
  const result: SearchPackageBody = {
    name: version.name,
    scope: '',
    description: version.description,
    version: latest,
    keywords: version.keywords,
    date: (pkg as any).time[latest],
    // FIXME: type
    author: version.author as any,
    // FIXME: not possible fill this out from a private package
    publisher: {},
    // FIXME: type
    maintainers: version.maintainers as any,
    links: {
      npm: '',
      homepage: version.homepage,
      repository: version.repository,
      bugs: version.bugs,
    },
  };

  if (typeof searchItem.package.scoped === 'string') {
    result.scope = searchItem.package.scoped;
  }

  return result;
}
