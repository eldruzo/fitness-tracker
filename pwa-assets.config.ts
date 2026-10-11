import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0.2, resizeOptions: { background: '#B23E0B' } },
    apple: { ...minimal2023Preset.apple, padding: 0.2, resizeOptions: { background: '#B23E0B' } },
  },
  images: ['public/icon.svg'],
});
