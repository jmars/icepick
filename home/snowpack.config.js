// Snowpack Configuration File
// See all supported options: https://www.snowpack.dev/reference/configuration

/** @type {import("snowpack").SnowpackUserConfig } */
module.exports = {
  mount: {
    './src': {
      static: false,
      url: '/',
      resolve: true
    }
  },
  plugins: [],
  packageOptions: {},
  devOptions: {},
  buildOptions: {
    metaUrlPath: 'external'
  }
};
