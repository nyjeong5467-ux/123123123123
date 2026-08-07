// ESLint 9+ 플랫 설정. TS/TSX 타입검사는 tsc/vite(esbuild)가 담당.
// 현 단계는 eslint 비활성(후속에서 typescript-eslint + react-hooks 규칙 도입 예정).
export default [
  { ignores: ['**/*'] },
]
