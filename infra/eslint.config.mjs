import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['bin', 'node_modules']),
  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      // Must come last: turns off ESLint rules that conflict with Prettier so
      // formatting is owned by Prettier and the two don't fight.
      prettier,
    ],
    languageOptions: {
      // The Pulumi program runs under Node, not the browser.
      globals: globals.node,
    },
  },
])
