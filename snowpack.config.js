// Snowpack Configuration File
// See all supported options: https://www.snowpack.dev/reference/configuration

/** @type {import("snowpack").SnowpackUserConfig } */
module.exports = {
  mount: {
    './static': {
      static: true,
      url: '/',
      resolve: false
    },
    './src': {
      static: false,
      url: '/',
      resolve: true
    }
  },
  plugins: [],
  packageOptions: {
    external: [],
  },
  devOptions: {
    open: "none"
  },
  buildOptions: {},
};
