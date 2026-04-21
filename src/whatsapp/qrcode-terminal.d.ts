declare module 'qrcode-terminal' {
  interface GenerateOptions { small?: boolean }
  function generate(input: string, options?: GenerateOptions, cb?: (ascii: string) => void): void;
  function generate(input: string, cb?: (ascii: string) => void): void;
  const _default: { generate: typeof generate };
  export default _default;
  export { generate };
}
