import _ from 'lodash';
import semver, { SemVer } from 'semver';

/**
 * Function filters out bad semver versions and sorts the array.
 * @return {Array} sorted Array
 */
 export function sortVersionsAndFilterInvalid(listVersions: string[] /* logger */): string[] {
  return (
    listVersions
      .filter(function (version): boolean {
        if (!semver.parse(version, true)) {
          return false;
        }
        return true;
      })
      // FIXME: it seems the @types/semver do not handle a legitimate method named 'compareLoose'
      // @ts-ignore
      .sort(semver.compareLoose)
      .map(String)
  );
 }
