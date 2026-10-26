// 배포 경로 (28단계). 로컬(vite dev)은 '/', GitHub Pages 는 '/3js/' 처럼 하위 경로에 올라가므로
// public/ 안의 파일을 가리킬 땐 절대 경로 대신 이 함수를 쓴다. Vite 가 vite.config.js 의 base 를 import.meta.env.BASE_URL 로 넣어 준다.
export const BASE_URL = import.meta.env.BASE_URL;
export const asset = (path) => BASE_URL + path.replace(/^\//, '');
