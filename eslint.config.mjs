import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Aviso y no error: las dieciséis llamadas que marca son, casi todas,
      // lecturas de localStorage al montar (el servidor no tiene window y no
      // se pueden leer en el render). Se revisan una a una aparte; mientras,
      // el despliegue se frena solo con errores de verdad, como un hook
      // condicional.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
