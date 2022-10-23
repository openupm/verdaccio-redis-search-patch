import _ from 'lodash';

export function isObject(obj: any): boolean {
  return _.isObject(obj) && _.isNull(obj) === false && _.isArray(obj) === false;
}
