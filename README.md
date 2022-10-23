# verdaccio-redis-search-patch

The middleware overrides v1/search endpoint with a redis search based backend for verdaccio@5 and verdaccio-redis-storage.

The package will be migrated to verdaccio-redis-storage after verdaccio@6 release.

Notice issue: auth check is disable for the search end point.

---

## development

See the [verdaccio contributing guide](https://github.com/verdaccio/verdaccio/blob/master/CONTRIBUTING.md) for instructions setting up your development environment.
Once you have completed that, use the following npm tasks.

  - `npm run build`

    Build a distributable archive

  - `npm run test`

    Run unit test

For more information about any of these commands run `npm run ${task} -- --help`.
