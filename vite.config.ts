import { defineConfig } from 'vite'
import type { BuildOptions } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

type OnWarn = NonNullable<
  NonNullable<BuildOptions['rolldownOptions']>['onwarn']
>

// Dependencies ship RSC "use client" markers; without an RSC layer they are no-ops.
const onwarn: OnWarn = (warning, defaultHandler) => {
  const directiveFromDependency =
    warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
    /node_modules/.test(warning.id ?? warning.loc?.file ?? '')
  if (!directiveFromDependency) defaultHandler(warning)
}

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    // Nitro builds its environment with its own bundler config, so the handler is passed here too.
    nitro({
      rollupConfig: { external: [/^@sentry\//] },
      rolldownConfig: { onwarn },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  build: { rolldownOptions: { onwarn } },
})

export default config
