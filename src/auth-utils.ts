import { RemoteUser } from '@verdaccio/types';
import { ROLES } from './constants';

export function createAnonymousRemoteUser(): RemoteUser {
  return {
    name: undefined,
    // groups without '$' are going to be deprecated eventually
    groups: [ROLES.$ALL, ROLES.$ANONYMOUS, ROLES.DEPRECATED_ALL, ROLES.DEPRECATED_ANONYMOUS],
    real_groups: [],
  };
}