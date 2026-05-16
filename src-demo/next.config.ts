import type { NextConfig } from "next";

const config: NextConfig = {
  // Native modules can't be webpack-bundled — keep them external in server code.
  serverExternalPackages: ["better-sqlite3", "sqlite-vec"],
};

export default config;
