import { defineConfig } from 'vite';

// base: GitHub Pages 는 https://<계정>.github.io/<저장소>/ 에 올라가므로 빌드할 때만 '/3js/' 를 붙인다 (28단계).
// 로컬 개발(vite)은 '/' 그대로, vite preview 는 빌드본이라 '/3js/'. 저장소 이름을 바꾸면 여기도 바꿀 것.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/3js/' : '/', // preview 도 빌드 결과를 보여 주므로 같은 base
  server: { port: 5173, open: true },
  build: { target: 'esnext' },
}));
