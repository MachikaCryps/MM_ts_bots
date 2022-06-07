import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "rollup-plugin-typescript2";
import json from "@rollup/plugin-json";
import builtins from "builtin-modules";

export default {
  input: "src/index.ts",
  inlineDynamicImports: true,
  output: {
    file: "dist/index.js",
    format: "cjs",
  },
  plugins: [
    resolve({ preferBuiltins: true }),
    commonjs(),
    json({ compact: true }),
    typescript({
      include: ["**/*.ts", "../../botfunctions/**/*.ts"],
    }),
  ],
  external: [
    ...builtins,
    "ethers",
    "web3",
    "axios",
    /^defender-relay-client(\/.*)?$/,
  ],
};
