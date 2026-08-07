import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://ai-blog.ixo8.com',
  trailingSlash: 'always',
  output: 'static',
  devToolbar: {
    enabled: false
  },
  markdown: {
    shikiConfig: {
      theme: 'github-dark-default'
    }
  }
});
